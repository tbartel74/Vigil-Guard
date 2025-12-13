#!/usr/bin/env node
/**
 * Scoring Threshold Calibration Script
 * Phase 4: Cutover + Scoring Calibration
 *
 * Analyzes cosine similarity distribution from production data
 * and recommends optimal thresholds for LOW/MEDIUM/HIGH classification.
 *
 * Requirements:
 * - ClickHouse with semantic_analysis_log table populated
 * - At least 100 samples from V2 model
 *
 * Usage:
 *   CLICKHOUSE_HOST=localhost CLICKHOUSE_PASSWORD='...' node scripts/calibrate-thresholds.js
 */

const clickhouseClient = require('../src/clickhouse/client');
const config = require('../src/config');

async function getSimilarityDistribution() {
    const query = `
        SELECT
            quantile(0.10)(attack_max_similarity) as p10,
            quantile(0.25)(attack_max_similarity) as p25,
            quantile(0.50)(attack_max_similarity) as p50,
            quantile(0.75)(attack_max_similarity) as p75,
            quantile(0.90)(attack_max_similarity) as p90,
            quantile(0.95)(attack_max_similarity) as p95,
            quantile(0.99)(attack_max_similarity) as p99,
            count() as total_samples
        FROM semantic_analysis_log
        WHERE classification_version = '2.0'
          AND timestamp > now() - INTERVAL 3 DAY
        FORMAT JSON
    `;

    try {
        const result = await clickhouseClient.query(query);
        return result?.data?.[0] || null;
    } catch (error) {
        // Table might not exist yet
        return null;
    }
}

async function getCategoryDistribution() {
    const query = `
        SELECT
            classification as threat_category,
            count() as samples,
            avg(attack_max_similarity) as avg_sim,
            quantile(0.50)(attack_max_similarity) as median_sim,
            quantile(0.90)(attack_max_similarity) as p90_sim,
            avg(delta) as avg_delta
        FROM semantic_analysis_log
        WHERE classification_version = '2.0'
          AND timestamp > now() - INTERVAL 3 DAY
        GROUP BY classification
        ORDER BY avg_sim DESC
        FORMAT JSON
    `;

    try {
        const result = await clickhouseClient.query(query);
        return result?.data || [];
    } catch (error) {
        return [];
    }
}

async function getDeltaDistribution() {
    const query = `
        SELECT
            classification,
            count() as samples,
            quantile(0.10)(delta) as delta_p10,
            quantile(0.25)(delta) as delta_p25,
            quantile(0.50)(delta) as delta_p50,
            quantile(0.75)(delta) as delta_p75,
            quantile(0.90)(delta) as delta_p90
        FROM semantic_analysis_log
        WHERE classification_version = '2.0'
          AND timestamp > now() - INTERVAL 3 DAY
        GROUP BY classification
        FORMAT JSON
    `;

    try {
        const result = await clickhouseClient.query(query);
        return result?.data || [];
    } catch (error) {
        return [];
    }
}

function recommendThresholds(distribution) {
    if (!distribution || distribution.total_samples < 100) {
        return {
            recommended: false,
            reason: 'Insufficient data (need at least 100 samples)',
            currentThresholds: {
                low: config.scoring.thresholds.low,
                medium: config.scoring.thresholds.medium
            }
        };
    }

    // Two-Phase Search uses delta (attack_sim - safe_sim) for classification
    // Score thresholds map to similarity ranges for reporting
    //
    // Current mapping (may need adjustment for E5):
    // - Score 0-39 (LOW): similarity < 0.80
    // - Score 40-69 (MEDIUM): similarity 0.80-0.85
    // - Score 70-100 (HIGH): similarity > 0.85

    const p50 = parseFloat(distribution.p50);
    const p75 = parseFloat(distribution.p75);
    const p90 = parseFloat(distribution.p90);

    // Recommendation logic:
    // - LOW threshold: around p50 (catch 50% of attacks)
    // - MEDIUM threshold: around p75-p90 (high-confidence attacks)

    const recommended = {
        low: Math.round(p50 * 100),
        medium: Math.round(p90 * 100)
    };

    return {
        recommended: true,
        distribution: {
            p10: distribution.p10,
            p25: distribution.p25,
            p50: distribution.p50,
            p75: distribution.p75,
            p90: distribution.p90,
            p95: distribution.p95,
            p99: distribution.p99,
            samples: distribution.total_samples
        },
        currentThresholds: {
            low: config.scoring.thresholds.low,
            medium: config.scoring.thresholds.medium
        },
        recommendedThresholds: recommended,
        notes: [
            'Two-Phase Search v2.0 uses delta-based classification',
            'Score thresholds are for reporting, not primary classification',
            `Based on ${distribution.total_samples} samples from last 3 days`,
            'Review category distribution before applying changes'
        ]
    };
}

async function runCalibration() {
    console.log('============================================================');
    console.log('SCORING THRESHOLD CALIBRATION');
    console.log('Phase 4 - Two-Phase Search v2.0');
    console.log('============================================================\n');

    console.log('Fetching similarity distribution...\n');
    const distribution = await getSimilarityDistribution();

    if (!distribution) {
        console.log('⚠️  No production data available yet.');
        console.log('   Run this script after deploying Two-Phase Search to production');
        console.log('   and collecting at least 100 samples.\n');

        console.log('Current configuration:');
        console.log(`  THRESHOLD_LOW: ${config.scoring.thresholds.low}`);
        console.log(`  THRESHOLD_MEDIUM: ${config.scoring.thresholds.medium}`);
        console.log('\nTwo-Phase Search v2.0 uses Multi-tier classification with delta:');
        console.log('  - Classification based on attack_sim, safe_sim, and delta');
        console.log('  - Score thresholds used for reporting severity');
        return;
    }

    console.log('SIMILARITY DISTRIBUTION:');
    console.log(`  Samples: ${distribution.total_samples}`);
    console.log(`  p10: ${parseFloat(distribution.p10).toFixed(3)}`);
    console.log(`  p25: ${parseFloat(distribution.p25).toFixed(3)}`);
    console.log(`  p50: ${parseFloat(distribution.p50).toFixed(3)} (median)`);
    console.log(`  p75: ${parseFloat(distribution.p75).toFixed(3)}`);
    console.log(`  p90: ${parseFloat(distribution.p90).toFixed(3)}`);
    console.log(`  p95: ${parseFloat(distribution.p95).toFixed(3)}`);
    console.log(`  p99: ${parseFloat(distribution.p99).toFixed(3)}`);

    console.log('\n------------------------------------------------------------');
    console.log('CATEGORY DISTRIBUTION:\n');

    const categories = await getCategoryDistribution();
    if (categories.length > 0) {
        console.log('Category          | Samples | Avg Sim | Median | p90  | Avg Delta');
        console.log('------------------|---------|---------|--------|------|----------');
        for (const cat of categories) {
            const name = (cat.threat_category || 'UNKNOWN').padEnd(17);
            const samples = String(cat.samples).padStart(7);
            const avg = parseFloat(cat.avg_sim).toFixed(3).padStart(7);
            const median = parseFloat(cat.median_sim).toFixed(3).padStart(6);
            const p90 = parseFloat(cat.p90_sim).toFixed(3).padStart(4);
            const delta = parseFloat(cat.avg_delta).toFixed(3).padStart(8);
            console.log(`${name} | ${samples} | ${avg} | ${median} | ${p90} | ${delta}`);
        }
    }

    console.log('\n------------------------------------------------------------');
    console.log('DELTA DISTRIBUTION (attack_sim - safe_sim):\n');

    const deltaStats = await getDeltaDistribution();
    if (deltaStats.length > 0) {
        console.log('Classification | Samples | p10   | p25   | p50   | p75   | p90');
        console.log('---------------|---------|-------|-------|-------|-------|-------');
        for (const stat of deltaStats) {
            const name = (stat.classification || 'UNKNOWN').padEnd(14);
            const samples = String(stat.samples).padStart(7);
            const p10 = parseFloat(stat.delta_p10).toFixed(3).padStart(5);
            const p25 = parseFloat(stat.delta_p25).toFixed(3).padStart(5);
            const p50 = parseFloat(stat.delta_p50).toFixed(3).padStart(5);
            const p75 = parseFloat(stat.delta_p75).toFixed(3).padStart(5);
            const p90 = parseFloat(stat.delta_p90).toFixed(3).padStart(5);
            console.log(`${name} | ${samples} | ${p10} | ${p25} | ${p50} | ${p75} | ${p90}`);
        }
    }

    console.log('\n------------------------------------------------------------');
    console.log('RECOMMENDATIONS:\n');

    const recommendations = recommendThresholds(distribution);
    console.log(`Current thresholds:`);
    console.log(`  THRESHOLD_LOW: ${recommendations.currentThresholds.low}`);
    console.log(`  THRESHOLD_MEDIUM: ${recommendations.currentThresholds.medium}`);

    if (recommendations.recommended) {
        console.log(`\nRecommended thresholds (based on ${distribution.total_samples} samples):`);
        console.log(`  THRESHOLD_LOW: ${recommendations.recommendedThresholds.low}`);
        console.log(`  THRESHOLD_MEDIUM: ${recommendations.recommendedThresholds.medium}`);

        console.log('\nNotes:');
        recommendations.notes.forEach(note => console.log(`  - ${note}`));

        console.log('\nTo apply recommended thresholds:');
        console.log(`  export THRESHOLD_LOW=${recommendations.recommendedThresholds.low}`);
        console.log(`  export THRESHOLD_MEDIUM=${recommendations.recommendedThresholds.medium}`);
        console.log('  docker-compose restart semantic-service');
    } else {
        console.log(`\n⚠️  ${recommendations.reason}`);
    }

    console.log('\n============================================================');
}

runCalibration()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Calibration failed:', err);
        process.exit(1);
    });
