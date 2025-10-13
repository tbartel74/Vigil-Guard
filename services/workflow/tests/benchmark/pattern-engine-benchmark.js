#!/usr/bin/env node

/**
 * Pattern_Matching_Engine Benchmark Suite
 *
 * Purpose: Measure latency of Pattern_Matching_Engine before/after optimization
 * Target: 20% latency reduction on P95
 *
 * Usage:
 *   node pattern-engine-benchmark.js [options]
 *
 * Options:
 *   --samples=N       Number of samples to test (default: 100)
 *   --webhook=URL     Webhook URL (default: http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1)
 *   --output=FILE     Output JSON file (default: benchmark-results.json)
 *   --warmup=N        Number of warmup requests (default: 10)
 *   --label=TEXT      Label for this benchmark run (default: timestamp)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value || true;
  return acc;
}, {});

const CONFIG = {
  samples: parseInt(args.samples || '100', 10),
  webhookUrl: args.webhook || 'http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1',
  outputFile: args.output || 'benchmark-results.json',
  warmupRequests: parseInt(args.warmup || '10', 10),
  label: args.label || new Date().toISOString(),
  fixturesPath: path.join(__dirname, '../fixtures/malicious-prompts.json')
};

console.log('🎯 Pattern_Matching_Engine Benchmark Suite\n');
console.log('Configuration:');
console.log(`  Samples: ${CONFIG.samples}`);
console.log(`  Warmup: ${CONFIG.warmupRequests}`);
console.log(`  Webhook: ${CONFIG.webhookUrl}`);
console.log(`  Output: ${CONFIG.outputFile}`);
console.log(`  Label: ${CONFIG.label}\n`);

// ============================================================================
// LOAD TEST DATA
// ============================================================================

let testPrompts = [];
try {
  const fixturesData = JSON.parse(fs.readFileSync(CONFIG.fixturesPath, 'utf8'));

  // Check if fixtures are in category structure (object with arrays)
  if (typeof fixturesData === 'object' && !Array.isArray(fixturesData)) {
    // Flatten all categories into single array
    for (const [category, prompts] of Object.entries(fixturesData)) {
      if (Array.isArray(prompts)) {
        testPrompts.push(...prompts);
      }
    }
  } else if (Array.isArray(fixturesData)) {
    // Already an array
    testPrompts = fixturesData;
  } else if (fixturesData.prompts) {
    // Has a 'prompts' field
    testPrompts = fixturesData.prompts;
  }

  console.log(`✅ Loaded ${testPrompts.length} test prompts from fixtures\n`);
} catch (error) {
  console.error(`❌ Failed to load fixtures from ${CONFIG.fixturesPath}:`, error.message);
  process.exit(1);
}

if (testPrompts.length === 0) {
  console.error('❌ No test prompts found in fixtures file');
  process.exit(1);
}

// ============================================================================
// BENCHMARK UTILITIES
// ============================================================================

/**
 * Send request to workflow webhook
 * @param {string} chatInput - Text to analyze
 * @returns {Promise<{latency: number, response: object}>}
 */
async function sendRequest(chatInput) {
  const startTime = Date.now();

  try {
    const response = await fetch(CONFIG.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatInput })
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { latency, response: data };
  } catch (error) {
    const latency = Date.now() - startTime;
    return { latency, error: error.message };
  }
}

/**
 * Calculate percentile
 * @param {number[]} values - Sorted array of values
 * @param {number} percentile - Percentile to calculate (0-100)
 * @returns {number}
 */
function calculatePercentile(values, percentile) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate statistics
 * @param {number[]} latencies - Array of latency values
 * @returns {object} Statistics object
 */
function calculateStats(latencies) {
  const sum = latencies.reduce((acc, val) => acc + val, 0);
  const mean = sum / latencies.length;

  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return {
    count: latencies.length,
    min,
    max,
    mean: Math.round(mean * 100) / 100,
    median: calculatePercentile(sorted, 50),
    p75: calculatePercentile(sorted, 75),
    p90: calculatePercentile(sorted, 90),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99)
  };
}

// ============================================================================
// MAIN BENCHMARK EXECUTION
// ============================================================================

async function runBenchmark() {
  console.log('🔥 Warming up (cache population)...');

  // Warmup phase
  for (let i = 0; i < CONFIG.warmupRequests; i++) {
    const prompt = testPrompts[i % testPrompts.length];
    const chatInput = typeof prompt === 'string' ? prompt : (prompt.text || prompt);
    await sendRequest(chatInput);
    process.stdout.write(`  Warmup ${i + 1}/${CONFIG.warmupRequests}\r`);
  }
  console.log(`  ✅ Warmup complete (${CONFIG.warmupRequests} requests)\n`);

  console.log('📊 Running benchmark...');

  const results = {
    label: CONFIG.label,
    timestamp: new Date().toISOString(),
    config: CONFIG,
    latencies: [],
    errors: 0,
    details: []
  };

  // Main benchmark phase
  for (let i = 0; i < CONFIG.samples; i++) {
    const prompt = testPrompts[i % testPrompts.length];
    const chatInput = typeof prompt === 'string' ? prompt : (prompt.text || prompt);
    const { latency, response, error } = await sendRequest(chatInput);

    if (error) {
      results.errors++;
      console.error(`  ❌ Sample ${i + 1}: Error - ${error}`);
    } else {
      results.latencies.push(latency);
      results.details.push({
        sample: i + 1,
        latency,
        score: response?.score,
        earlyExit: response?._performance?.earlyExitTriggered,
        categoriesProcessed: response?._performance?.categoriesProcessed,
        cacheHits: response?._performance?.cacheStats?.hits
      });

      // Progress indicator
      if ((i + 1) % 10 === 0 || i === CONFIG.samples - 1) {
        process.stdout.write(`  Progress: ${i + 1}/${CONFIG.samples} (${Math.round((i + 1) / CONFIG.samples * 100)}%)\r`);
      }
    }
  }

  console.log(`\n  ✅ Benchmark complete (${results.latencies.length} successful samples)\n`);

  // Calculate statistics
  if (results.latencies.length > 0) {
    results.stats = calculateStats(results.latencies);

    // Calculate cache effectiveness
    const detailsWithCache = results.details.filter(d => d.cacheHits !== undefined);
    if (detailsWithCache.length > 0) {
      const avgCacheHits = detailsWithCache.reduce((sum, d) => sum + (d.cacheHits || 0), 0) / detailsWithCache.length;
      results.cacheEffectiveness = {
        avgHitsPerRequest: Math.round(avgCacheHits * 100) / 100,
        samplesWithCache: detailsWithCache.length
      };
    }

    // Calculate early exit rate
    const earlyExitCount = results.details.filter(d => d.earlyExit === true).length;
    results.earlyExitRate = Math.round((earlyExitCount / results.details.length) * 100 * 100) / 100;

    // Print results
    console.log('📈 Results:');
    console.log(`  Successful samples: ${results.stats.count}`);
    console.log(`  Failed requests: ${results.errors}`);
    console.log(`  Early exit rate: ${results.earlyExitRate}%`);
    if (results.cacheEffectiveness) {
      console.log(`  Avg cache hits/request: ${results.cacheEffectiveness.avgHitsPerRequest}`);
    }
    console.log('\n  Latency statistics (ms):');
    console.log(`    Min:    ${results.stats.min}ms`);
    console.log(`    Mean:   ${results.stats.mean}ms`);
    console.log(`    Median: ${results.stats.median}ms`);
    console.log(`    P75:    ${results.stats.p75}ms`);
    console.log(`    P90:    ${results.stats.p90}ms`);
    console.log(`    P95:    ${results.stats.p95}ms`);
    console.log(`    P99:    ${results.stats.p99}ms`);
    console.log(`    Max:    ${results.stats.max}ms\n`);
  }

  // Save results
  const outputPath = path.resolve(CONFIG.outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`💾 Results saved to: ${outputPath}\n`);

  return results;
}

// ============================================================================
// COMPARISON UTILITY
// ============================================================================

/**
 * Compare two benchmark results
 * @param {string} beforeFile - Path to "before" benchmark results
 * @param {string} afterFile - Path to "after" benchmark results
 */
function compareBenchmarks(beforeFile, afterFile) {
  console.log('📊 Comparing benchmark results...\n');

  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));

  const metrics = ['mean', 'median', 'p75', 'p90', 'p95', 'p99'];

  console.log('Metric          Before      After       Change      Improvement');
  console.log('─'.repeat(70));

  for (const metric of metrics) {
    const beforeVal = before.stats[metric];
    const afterVal = after.stats[metric];
    const change = afterVal - beforeVal;
    const improvement = ((beforeVal - afterVal) / beforeVal) * 100;

    const changeStr = change > 0 ? `+${change}ms` : `${change}ms`;
    const improvementStr = improvement > 0 ? `${improvement.toFixed(2)}% faster` : `${Math.abs(improvement).toFixed(2)}% slower`;
    const emoji = improvement > 0 ? '✅' : '❌';

    console.log(
      `${metric.padEnd(15)} ${String(beforeVal).padEnd(11)} ${String(afterVal).padEnd(11)} ${changeStr.padEnd(11)} ${improvementStr} ${emoji}`
    );
  }

  console.log('\n🎯 Target: 20% improvement on P95');
  const p95Improvement = ((before.stats.p95 - after.stats.p95) / before.stats.p95) * 100;
  if (p95Improvement >= 20) {
    console.log(`✅ SUCCESS! P95 improved by ${p95Improvement.toFixed(2)}% (target: 20%)\n`);
  } else {
    console.log(`⚠️  P95 improved by ${p95Improvement.toFixed(2)}% (target: 20%, need ${(20 - p95Improvement).toFixed(2)}% more)\n`);
  }
}

// ============================================================================
// CLI EXECUTION
// ============================================================================

// ES modules check: if this is the main module being run
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check if comparing mode
  if (args.compare) {
    const [beforeFile, afterFile] = args.compare.split(',');
    if (!beforeFile || !afterFile) {
      console.error('❌ Usage: --compare=before.json,after.json');
      process.exit(1);
    }
    compareBenchmarks(beforeFile, afterFile);
  } else {
    // Run benchmark
    runBenchmark().catch(error => {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    });
  }
}

export { runBenchmark, compareBenchmarks };
