/**
 * Vigil Detection Test Suite v3.0
 *
 * Unified test for all malicious and benign prompts with OWASP LLM Top 10 categorization.
 *
 * Features:
 * - Single progress bar (no screen changes)
 * - Results in ASCII table format
 * - Real prompts only (no synthetic tests)
 * - OWASP LLM Top 10 (2025) aligned categories
 *
 * Categories:
 * - LLM01_DIRECT: Direct Prompt Injection
 * - LLM01_JAILBREAK: Jailbreaking/Roleplay (DAN, Developer Mode)
 * - LLM01_EXTRACTION: System Prompt Extraction
 * - LLM01_CONTEXT: Context Confusion / Delimiter injection
 * - LLM01_ENCODING: Encoding/Obfuscation (Base64, Unicode, leet)
 * - LLM01_INDIRECT: Indirect Injection (tool calls, emails)
 * - LLM10_CBRNE: CBRNE/Harmful Content
 * - BENIGN_FP: False Positive testing
 *
 * Sources:
 * - https://genai.owasp.org/llmrisk/llm01-prompt-injection/
 * - https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
 */

import { describe, test, beforeAll, afterAll, expect } from 'vitest';
import { ProgressReporter } from '../helpers/reporter.js';
import { loadAllFixtures, sortPromptsByCategory } from '../helpers/fixtures-loader.js';
import { sendAndVerify } from '../helpers/webhook.js';

const reporter = new ProgressReporter();

describe('Vigil Detection Suite v3.0 (OWASP LLM Top 10)', () => {
  let fixtures;
  let allPrompts = [];

  beforeAll(async () => {
    fixtures = await loadAllFixtures();

    // Combine all prompts with category markers
    const combined = [
      ...fixtures.malicious,
      ...fixtures.benign
    ];

    // Sort by category for organized output
    allPrompts = sortPromptsByCategory(combined);

    // Get unique categories (preserving sort order)
    const seen = new Set();
    const categories = [];
    allPrompts.forEach(p => {
      if (!seen.has(p.category)) {
        seen.add(p.category);
        categories.push(p.category);
      }
    });

    reporter.init({
      total: allPrompts.length,
      categories
    });
  });

  afterAll(() => {
    reporter.printFinalTable();
  });

  test('should test all prompts with OWASP categorization', async () => {
    let currentCategory = '';

    for (let i = 0; i < allPrompts.length; i++) {
      const item = allPrompts[i];

      // Update category header when changed
      if (item.category !== currentCategory) {
        // Find range for this category
        let endIndex = allPrompts.length;
        for (let j = i + 1; j < allPrompts.length; j++) {
          if (allPrompts[j].category !== item.category) {
            endIndex = j;
            break;
          }
        }

        reporter.setCategory(item.category, `${i + 1}-${endIndex}`);
        currentCategory = item.category;
      }

      try {
        // Truncate very long inputs (prevent timeout)
        const prompt = (item.prompt || '').substring(0, 3000);

        if (!prompt || prompt.trim().length < 3) {
          reporter.update(i, 'SKIPPED', 0, '[empty prompt]');
          continue;
        }

        const result = await sendAndVerify(prompt);

        reporter.update(i, result.final_status, result.threat_score, item.prompt);

        // Soft assertion for benign prompts (FP check)
        // We don't fail the test, just track results
        if (item.expected === 'ALLOWED' && result.final_status !== 'ALLOWED') {
          // This is a false positive - logged but test continues
          console.warn(`\n⚠️  FP #${i}: "${prompt.substring(0, 40)}..." → ${result.final_status}`);
        }

      } catch (error) {
        console.error(`\n⚠️  Error #${i}: ${error.message}`);
        reporter.update(i, 'ERROR', 0, item.prompt || '[error]');
      }
    }

    // Final assertion: overall detection rate > 50%
    // This is a baseline requirement for the detection system
    const stats = reporter.printFinalTable();
    expect(stats.detectionRate).toBeGreaterThanOrEqual(50);

  }, 1800000); // 30 minute timeout for full suite
});
