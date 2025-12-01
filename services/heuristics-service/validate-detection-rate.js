#!/usr/bin/env node
/**
 * Validation script for heuristic service detection rate
 * Runs all prompts from heuristic-test-prompts.json and calculates detection rate
 *
 * Target: >70% detection rate (baseline was 33.6%)
 */

import fs from 'fs';
import path from 'path';

const HEURISTICS_URL = process.env.HEURISTICS_URL || 'http://localhost:5005';
const TEST_FILE = '/Users/tomaszbartel/Development/Vigil-Guard/Roadmap/semantic-similarity/heuristic-test-prompts.json';
const DETECTION_THRESHOLD = 30; // Score >= 30 = MEDIUM or higher threat

async function analyze(text, requestId = null) {
  const id = requestId || `validate-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const response = await fetch(`${HEURISTICS_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, request_id: id, lang: 'en' })
  });
  return await response.json();
}

async function main() {
  console.log('🔍 Heuristics Service Detection Rate Validation\n');
  console.log(`📁 Test file: ${TEST_FILE}`);
  console.log(`🎯 Detection threshold: score >= ${DETECTION_THRESHOLD}\n`);

  // Load test prompts
  const testData = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'));

  let totalPrompts = 0;
  let detectedPrompts = 0;
  const results = {};

  // Extract all prompts from categories
  for (const [category, data] of Object.entries(testData)) {
    if (category === 'metadata') continue;

    const prompts = data.prompts || [];
    results[category] = {
      total: prompts.length,
      detected: 0,
      prompts: []
    };

    console.log(`\n📂 Testing category: ${category} (${prompts.length} prompts)`);

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      totalPrompts++;

      try {
        const result = await analyze(prompt);
        const isDetected = result.score >= DETECTION_THRESHOLD;

        if (isDetected) {
          detectedPrompts++;
          results[category].detected++;
        }

        results[category].prompts.push({
          prompt: prompt.substring(0, 60) + (prompt.length > 60 ? '...' : ''),
          score: result.score,
          threat_level: result.threat_level,
          detected: isDetected
        });

        // Progress indicator
        process.stdout.write(`  [${i + 1}/${prompts.length}] ${isDetected ? '✅' : '❌'} Score: ${result.score}\r`);

      } catch (error) {
        console.error(`\n  ❌ Error analyzing prompt: ${error.message}`);
        results[category].prompts.push({
          prompt: prompt.substring(0, 60),
          error: error.message
        });
      }

      // Rate limit: 100ms delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const categoryRate = (results[category].detected / results[category].total * 100).toFixed(1);
    console.log(`\n  ✅ Detected: ${results[category].detected}/${results[category].total} (${categoryRate}%)`);
  }

  // Final statistics
  console.log('\n\n═════════════════════════════════════════════════════════════');
  console.log('📊 FINAL DETECTION RATE\n');

  const detectionRate = (detectedPrompts / totalPrompts * 100).toFixed(1);
  const baselineRate = 33.6;
  const improvement = (parseFloat(detectionRate) - baselineRate).toFixed(1);

  console.log(`Total prompts:     ${totalPrompts}`);
  console.log(`Detected:          ${detectedPrompts}`);
  console.log(`Detection rate:    ${detectionRate}%`);
  console.log(`Baseline (old):    ${baselineRate}%`);
  console.log(`Improvement:       +${improvement}% ${parseFloat(improvement) > 0 ? '📈' : '📉'}`);
  console.log(`Target:            70.0%`);

  if (parseFloat(detectionRate) >= 70.0) {
    console.log(`\n✅ TARGET ACHIEVED! Detection rate >= 70%`);
  } else {
    const gap = (70.0 - parseFloat(detectionRate)).toFixed(1);
    console.log(`\n⚠️  Target not reached. Need +${gap}% more.`);
  }

  console.log('═════════════════════════════════════════════════════════════\n');

  // Category breakdown
  console.log('📋 Detection Rate by Category:\n');
  for (const [category, data] of Object.entries(results)) {
    const rate = (data.detected / data.total * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(parseFloat(rate) / 5));
    console.log(`  ${category.padEnd(25)} ${data.detected.toString().padStart(2)}/${data.total.toString().padStart(2)} (${rate.padStart(5)}%) ${bar}`);
  }

  console.log('\n');
}

main().catch(console.error);
