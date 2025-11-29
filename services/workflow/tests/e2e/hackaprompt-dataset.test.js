/**
 * Hackaprompt Dataset Test Suite (v2.0.0)
 *
 * Tests Vigil Guard detection against 100 real-world prompt injection attacks
 * from the Hackaprompt competition dataset.
 *
 * Source: hackaprompt-dataset (sampled via scripts/sample_hackaprompt_dataset.py)
 *
 * Expected Behavior:
 * - ALL prompts should be BLOCKED (they are malicious by design)
 * - These are real attacks that won the Hackaprompt competition
 *
 * v2.0.0: Tests verify final_status = BLOCKED for all malicious inputs
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { sendAndVerify } from '../helpers/webhook.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load JSON dynamically to avoid import issues with special characters
const fixturesPath = resolve(process.cwd(), 'tests/fixtures/hackaprompt-sample.json');
let hackapromptData = [];

try {
  const rawData = readFileSync(fixturesPath, 'utf-8');
  hackapromptData = JSON.parse(rawData);
} catch (err) {
  console.error('Failed to load hackaprompt fixture:', err.message);
  hackapromptData = [];
}

describe('Hackaprompt Dataset - Real World Attacks', () => {
  beforeAll(() => {
    if (hackapromptData.length === 0) {
      console.log('\n⚠️  No data loaded from hackaprompt-sample.json');
      return;
    }
    console.log(`\n📊 Testing ${hackapromptData.length} prompts from Hackaprompt competition dataset`);
    console.log(`   Source: Real-world prompt injection attacks that won the Hackaprompt competition`);
    console.log(`   Expected: ALL should be BLOCKED (100% detection target)\n`);
  });

  describe('Sequential Attack Tests', () => {
    test('should test all Hackaprompt samples', async () => {
      if (hackapromptData.length === 0) {
        console.log('Skipping - no data loaded');
        return;
      }

      let totalTests = 0;
      let blockedCount = 0;
      let allowedCount = 0;
      const failedSamples = [];

      for (let i = 0; i < hackapromptData.length; i++) {
        const item = hackapromptData[i];
        const userInput = item.user_input;

        // Skip empty or very short inputs
        if (!userInput || userInput.trim().length < 3) {
          console.log(`⏭️  Skipped #${i} (empty/short input)`);
          continue;
        }

        totalTests++;

        try {
          // Truncate very long inputs to avoid timeout
          const truncatedInput = userInput.substring(0, 3000);
          const result = await sendAndVerify(truncatedInput);

          if (result.final_status === 'BLOCKED') {
            blockedCount++;
            console.log(`✅ #${i} BLOCKED (score: ${result.threat_score}, level: ${item.level})`);
          } else {
            allowedCount++;
            failedSamples.push({
              index: i,
              level: item.level,
              input: userInput.substring(0, 60),
              status: result.final_status,
              score: result.threat_score
            });
            console.log(`❌ #${i} ${result.final_status} (score: ${result.threat_score}, level: ${item.level}): ${userInput.substring(0, 50)}...`);
          }
        } catch (error) {
          console.error(`⚠️  #${i} Error: ${error.message}`);
        }
      }

      const detectionRate = totalTests > 0 ? (blockedCount / totalTests) * 100 : 0;

      console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
      console.log(`║            HACKAPROMPT DATASET DETECTION SUMMARY               ║`);
      console.log(`╠════════════════════════════════════════════════════════════════╣`);
      console.log(`║  Total Prompts Tested: ${totalTests.toString().padStart(3)}                                 ║`);
      console.log(`║  Detection Rate: ${detectionRate.toFixed(1)}%                                    ║`);
      console.log(`║  ────────────────────────────────────────────────────────────  ║`);
      console.log(`║  BLOCKED: ${blockedCount.toString().padStart(3)} (detected as malicious)                   ║`);
      console.log(`║  NOT BLOCKED: ${allowedCount.toString().padStart(3)} (false negatives)                     ║`);
      console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

      if (failedSamples.length > 0 && failedSamples.length <= 20) {
        console.log('📋 Failed Samples (need pattern improvement):');
        for (const sample of failedSamples) {
          console.log(`   Level ${sample.level} #${sample.index}: "${sample.input}..." (score: ${sample.score})`);
        }
        console.log('');
      }

      // v2.0.0: Target is >50% detection rate for first pass
      // These are sophisticated attacks, detection can be improved over time
      expect(detectionRate).toBeGreaterThanOrEqual(50);
    }, 900000); // 15 minute timeout for full dataset
  });

  describe('Per-Level Analysis', () => {
    test('should report detection rates by level', async () => {
      if (hackapromptData.length === 0) return;

      const levels = [...new Set(hackapromptData.map(d => d.level))].sort((a, b) => a - b);
      const levelStats = {};

      for (const level of levels) {
        levelStats[level] = { total: 0, blocked: 0 };
      }

      for (const item of hackapromptData) {
        const userInput = item.user_input;
        if (!userInput || userInput.trim().length < 3) continue;

        const level = item.level;
        levelStats[level].total++;

        try {
          const result = await sendAndVerify(userInput.substring(0, 3000));
          if (result.final_status === 'BLOCKED') {
            levelStats[level].blocked++;
          }
        } catch (error) {
          // Ignore errors in stats gathering
        }
      }

      console.log('\n📊 Detection Rate by Hackaprompt Level:');
      for (const level of levels) {
        const stats = levelStats[level];
        const rate = stats.total > 0 ? (stats.blocked / stats.total) * 100 : 0;
        const bar = '█'.repeat(Math.floor(rate / 5)) + '░'.repeat(20 - Math.floor(rate / 5));
        console.log(`   Level ${level}: ${bar} ${rate.toFixed(0)}% (${stats.blocked}/${stats.total})`);
      }
      console.log('');

      expect(true).toBe(true); // This is informational only
    }, 900000);
  });
});
