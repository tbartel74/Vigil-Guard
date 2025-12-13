/**
 * Golden Dataset Validation Tests
 *
 * Validates semantic detection against 55 curated examples:
 * - 15 Polish attacks, 15 English attacks, 5 mixed
 * - 10 safe "tricky" inputs, 10 edge cases
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';

// Configuration
const CONFIG = {
    clickhouse: {
        host: process.env.CLICKHOUSE_HOST || 'localhost',
        port: parseInt(process.env.CLICKHOUSE_PORT || '8123', 10),
        database: 'n8n_logs',
        user: process.env.CLICKHOUSE_USER || 'admin',
        password: process.env.CLICKHOUSE_PASSWORD || ''
    },
    thresholds: {
        block: 0.70,    // HIGH threat - score >= 70
        sanitize: 0.40, // MEDIUM threat - score >= 40
        allow: 0.40     // LOW threat - score < 40
    },
    topK: 5
};

// Load golden dataset
const GOLDEN_DATASET_PATH = path.join(__dirname, 'golden_dataset.jsonl');

function loadGoldenDataset() {
    const content = fs.readFileSync(GOLDEN_DATASET_PATH, 'utf-8');
    return content.trim().split('\n').map(line => JSON.parse(line));
}

// ClickHouse query helper
async function queryClickHouse(sql) {
    return new Promise((resolve, reject) => {
        const url = new URL(`http://${CONFIG.clickhouse.host}:${CONFIG.clickhouse.port}`);
        url.searchParams.set('database', CONFIG.clickhouse.database);
        url.searchParams.set('user', CONFIG.clickhouse.user);
        if (CONFIG.clickhouse.password) {
            url.searchParams.set('password', CONFIG.clickhouse.password);
        }

        const options = {
            method: 'POST',
            hostname: CONFIG.clickhouse.host,
            port: CONFIG.clickhouse.port,
            path: url.search,
            headers: { 'Content-Type': 'text/plain' },
            timeout: 10000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`ClickHouse error: ${data}`));
                } else {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(data);
                    }
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(sql);
        req.end();
    });
}

// Generate embedding using E5 model (via semantic service or transformers.js)
async function generateQueryEmbedding(text) {
    // Import generator dynamically
    const generator = await import('../../src/embedding/generator.js');
    if (!generator.isReady()) {
        await generator.initialize();
    }
    return generator.generate(text);
}

// Search for similar patterns in V2 table
async function searchSimilarPatterns(embedding, topK = CONFIG.topK) {
    const embeddingStr = `[${embedding.join(',')}]`;

    const sql = `
        SELECT
            pattern_id,
            category,
            pattern_text,
            cosineDistance(embedding, ${embeddingStr}) as distance,
            1 - cosineDistance(embedding, ${embeddingStr}) as similarity
        FROM ${CONFIG.clickhouse.database}.pattern_embeddings_v2
        ORDER BY distance ASC
        LIMIT ${topK}
        FORMAT JSON
    `;

    const result = await queryClickHouse(sql);
    return result.data || [];
}

// Two-Phase Search via production queries.js
async function searchTwoPhase(embedding, topK = 5, deltaThreshold = 0.05) {
    // Dynamic import to handle CommonJS module
    const queries = await import('../../src/clickhouse/queries.js');
    return queries.searchTwoPhase(embedding, topK, { deltaThreshold });
}

// Classify text using Two-Phase Search (ATTACK vs SAFE comparison)
async function classifyText(text, useTwoPhase = true) {
    const startTime = Date.now();

    try {
        const embedding = await generateQueryEmbedding(text);

        if (useTwoPhase) {
            // Two-Phase Search: Compare to both ATTACK and SAFE patterns
            const twoPhaseResult = await searchTwoPhase(embedding, 5, 0.05);
            const timingMs = Date.now() - startTime;

            const { classification, attack_max_similarity, safe_max_similarity, delta, attack_matches, safe_matches } = twoPhaseResult;

            // Debug: Log Two-Phase results for analysis
            const safeSubcat = twoPhaseResult.safe_matches?.[0]?.subcategory || 'n/a';
            const adjDelta = twoPhaseResult.adjusted_delta?.toFixed(4) || delta.toFixed(4);
            console.log(`Two-Phase: attack=${attack_max_similarity.toFixed(4)}, safe=${safe_max_similarity.toFixed(4)}, delta=${delta.toFixed(4)}, adjDelta=${adjDelta}, safeType=${safeSubcat}, class=${classification}`);

            // If classified as SAFE by two-phase, return ALLOW
            if (classification === 'SAFE') {
                return {
                    category: 'SAFE',
                    action: 'ALLOW',
                    score: 0,
                    attack_similarity: attack_max_similarity,
                    safe_similarity: safe_max_similarity,
                    delta,
                    timing_ms: timingMs,
                    classification: 'TWO_PHASE_SAFE',
                    top_matches: attack_matches
                };
            }

            // Classified as ATTACK - use attack similarity for scoring
            const score = Math.round(attack_max_similarity * 100);
            let action;
            if (score >= CONFIG.thresholds.block * 100) {
                action = 'BLOCK';
            } else if (score >= CONFIG.thresholds.sanitize * 100) {
                action = 'SANITIZE';
            } else {
                action = 'ALLOW';
            }

            return {
                category: attack_matches[0]?.category || 'UNKNOWN',
                action,
                score,
                attack_similarity: attack_max_similarity,
                safe_similarity: safe_max_similarity,
                delta,
                timing_ms: timingMs,
                classification: 'TWO_PHASE_ATTACK',
                top_matches: attack_matches
            };
        }

        // Legacy: Single-table search (for comparison)
        const results = await searchSimilarPatterns(embedding);
        const timingMs = Date.now() - startTime;

        if (!results || results.length === 0) {
            return {
                category: 'UNKNOWN',
                action: 'ALLOW',
                score: 0,
                similarity: 0,
                timing_ms: timingMs,
                top_matches: []
            };
        }

        const topMatch = results[0];
        const similarity = parseFloat(topMatch.similarity);
        const score = Math.round(similarity * 100);

        // Determine action based on thresholds
        let action;
        if (score >= CONFIG.thresholds.block * 100) {
            action = 'BLOCK';
        } else if (score >= CONFIG.thresholds.sanitize * 100) {
            action = 'SANITIZE';
        } else {
            action = 'ALLOW';
        }

        return {
            category: topMatch.category,
            action,
            score,
            similarity,
            timing_ms: timingMs,
            top_matches: results.slice(0, 3).map(r => ({
                category: r.category,
                similarity: parseFloat(r.similarity).toFixed(4),
                pattern_id: r.pattern_id
            }))
        };
    } catch (error) {
        console.error('Classification error:', error.message);
        console.error('Stack:', error.stack);
        return {
            category: 'ERROR',
            action: 'ALLOW',
            score: 0,
            similarity: 0,
            timing_ms: Date.now() - startTime,
            error: error.message
        };
    }
}

// Test metrics tracking
const metrics = {
    total: 0,
    correct: 0,
    incorrect: 0,
    byLanguage: {
        pl: { total: 0, correct: 0 },
        en: { total: 0, correct: 0 },
        mixed: { total: 0, correct: 0 }
    },
    byDifficulty: {
        easy: { total: 0, correct: 0 },
        medium: { total: 0, correct: 0 },
        hard: { total: 0, correct: 0 },
        tricky: { total: 0, correct: 0 }
    },
    falsePositives: 0,
    falseNegatives: 0,
    timings: []
};

describe('Golden Dataset Validation', () => {
    let goldenDataset;
    let clickhouseAvailable = false;
    let modelAvailable = false;

    beforeAll(async () => {
        // Load dataset
        goldenDataset = loadGoldenDataset();
        console.log(`Loaded ${goldenDataset.length} golden examples`);

        // Check ClickHouse availability
        try {
            await queryClickHouse('SELECT 1 FORMAT JSON');
            clickhouseAvailable = true;
            console.log('ClickHouse connection: OK');
        } catch (e) {
            console.warn('ClickHouse not available:', e.message);
        }

        // Check model availability
        try {
            const generator = await import('../../src/embedding/generator.js');
            modelAvailable = true;
            console.log('Embedding model: Available');
        } catch (e) {
            console.warn('Embedding model not available:', e.message);
        }
    });

    describe('Dataset Structure', () => {
        it('should have at least 50 examples', () => {
            expect(goldenDataset.length).toBeGreaterThanOrEqual(50);
        });

        it('should have required fields in each example', () => {
            for (const example of goldenDataset) {
                expect(example).toHaveProperty('id');
                expect(example).toHaveProperty('text');
                expect(example).toHaveProperty('expected_category');
                expect(example).toHaveProperty('expected_action');
                expect(example).toHaveProperty('language');
            }
        });

        it('should have Polish attack examples', () => {
            const plExamples = goldenDataset.filter(e => e.language === 'pl' && e.expected_action === 'BLOCK');
            expect(plExamples.length).toBeGreaterThanOrEqual(10);
        });

        it('should have English attack examples', () => {
            const enExamples = goldenDataset.filter(e => e.language === 'en' && e.expected_action === 'BLOCK');
            expect(enExamples.length).toBeGreaterThanOrEqual(10);
        });

        it('should have safe/tricky examples', () => {
            const safeExamples = goldenDataset.filter(e => e.expected_action === 'ALLOW');
            expect(safeExamples.length).toBeGreaterThanOrEqual(5);
        });
    });

    describe('Category Coverage', () => {
        it('should cover INSTRUCTION_OVERRIDE', () => {
            const examples = goldenDataset.filter(e => e.expected_category === 'INSTRUCTION_OVERRIDE');
            expect(examples.length).toBeGreaterThan(0);
        });

        it('should cover JAILBREAK_ROLEPLAY', () => {
            const examples = goldenDataset.filter(e => e.expected_category === 'JAILBREAK_ROLEPLAY');
            expect(examples.length).toBeGreaterThan(0);
        });

        it('should cover PROMPT_LEAKING', () => {
            const examples = goldenDataset.filter(e => e.expected_category === 'PROMPT_LEAKING');
            expect(examples.length).toBeGreaterThan(0);
        });

        it('should cover CODE_INJECTION', () => {
            const examples = goldenDataset.filter(e => e.expected_category === 'CODE_INJECTION');
            expect(examples.length).toBeGreaterThan(0);
        });
    });

    // Skip semantic tests if dependencies not available
    describe.skipIf(!process.env.RUN_GOLDEN_TESTS)('Semantic Classification', () => {

        it.each(
            loadGoldenDataset().filter(e => e.expected_action === 'BLOCK')
        )('should correctly classify attack: $id', async (example) => {
            const result = await classifyText(example.text);

            // Track metrics
            metrics.total++;
            metrics.byLanguage[example.language] = metrics.byLanguage[example.language] || { total: 0, correct: 0 };
            metrics.byLanguage[example.language].total++;
            metrics.byDifficulty[example.difficulty] = metrics.byDifficulty[example.difficulty] || { total: 0, correct: 0 };
            metrics.byDifficulty[example.difficulty].total++;
            metrics.timings.push(result.timing_ms);

            // Track score for analysis
            if (!metrics.attackScores) metrics.attackScores = [];
            metrics.attackScores.push({ id: example.id, score: result.score, lang: example.language });

            // Check if action matches
            const actionCorrect = result.action === example.expected_action ||
                (result.action === 'SANITIZE' && example.expected_action === 'BLOCK');

            if (actionCorrect) {
                metrics.correct++;
                metrics.byLanguage[example.language].correct++;
                metrics.byDifficulty[example.difficulty].correct++;
            } else {
                metrics.incorrect++;
                if (example.expected_action === 'BLOCK') {
                    metrics.falseNegatives++;
                }
                console.log(`MISS: ${example.id} - Expected ${example.expected_action}, got ${result.action} (score: ${result.score}, category: ${result.category})`);
                console.log(`   Text: "${example.text.substring(0, 60)}..."`);
                console.log(`   Top match: ${result.top_matches?.[0]?.category} (sim: ${result.top_matches?.[0]?.similarity})`);
            }

            expect(actionCorrect).toBe(true);
        }, 30000);

        it.each(
            loadGoldenDataset().filter(e => e.expected_action === 'ALLOW')
        )('should not block safe input: $id', async (example) => {
            const result = await classifyText(example.text);

            metrics.total++;
            metrics.byLanguage[example.language] = metrics.byLanguage[example.language] || { total: 0, correct: 0 };
            metrics.byLanguage[example.language].total++;
            metrics.timings.push(result.timing_ms);

            // Track score for analysis
            if (!metrics.safeScores) metrics.safeScores = [];
            metrics.safeScores.push({ id: example.id, score: result.score, lang: example.language });

            const actionCorrect = result.action === 'ALLOW' || result.action === 'SANITIZE';

            if (actionCorrect) {
                metrics.correct++;
                metrics.byLanguage[example.language].correct++;
            } else {
                metrics.incorrect++;
                metrics.falsePositives++;
                console.log(`FP: ${example.id} - Expected ALLOW, got ${result.action} (score: ${result.score})`);
                console.log(`   Text: "${example.text.substring(0, 50)}..."`);
                console.log(`   Top match: ${result.top_matches?.[0]?.category} (sim: ${result.top_matches?.[0]?.similarity})`);
            }

            // Safe examples should NOT be blocked
            expect(result.action).not.toBe('BLOCK');
        }, 30000);
    });

    describe('Metrics Summary', () => {
        it('should output test metrics', () => {
            console.log('\n--- Golden Dataset Metrics ---');
            console.log(`Total: ${goldenDataset.length}, PL=${goldenDataset.filter(e => e.language === 'pl').length}, EN=${goldenDataset.filter(e => e.language === 'en').length}`);
            console.log(`BLOCK=${goldenDataset.filter(e => e.expected_action === 'BLOCK').length}, ALLOW=${goldenDataset.filter(e => e.expected_action === 'ALLOW').length}`);

            if (metrics.attackScores?.length > 0) {
                const sorted = metrics.attackScores.map(s => s.score).sort((a, b) => a - b);
                console.log(`\nAttack scores: min=${sorted[0]}, max=${sorted[sorted.length - 1]}, median=${sorted[Math.floor(sorted.length / 2)]}`);
            }

            if (metrics.safeScores?.length > 0) {
                const sorted = metrics.safeScores.map(s => s.score).sort((a, b) => a - b);
                console.log(`Safe scores: min=${sorted[0]}, max=${sorted[sorted.length - 1]}, median=${sorted[Math.floor(sorted.length / 2)]}`);
            }

            if (metrics.attackScores && metrics.safeScores) {
                console.log('\nThreshold analysis:');
                const allAttack = metrics.attackScores.map(s => s.score);
                const allSafe = metrics.safeScores.map(s => s.score);
                for (const t of [70, 80, 90]) {
                    const dr = (allAttack.filter(s => s >= t).length / allAttack.length * 100).toFixed(0);
                    const fp = (allSafe.filter(s => s >= t).length / allSafe.length * 100).toFixed(0);
                    console.log(`  ${t}: detect=${dr}%, fp=${fp}%`);
                }
            }
            expect(true).toBe(true);
        });
    });
});

// Export for external use
export { classifyText, loadGoldenDataset, metrics };
