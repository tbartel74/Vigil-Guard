/**
 * SmartPersonRecognizer Allow-List Integration Tests (v1.8.1)
 *
 * Tests DEFAULT_ALLOW_LIST protection against AI model false positives
 * even when user doesn't provide custom allow_list.
 *
 * CRITICAL: These tests verify that ChatGPT, Claude, Gemini, etc.
 * are ALWAYS filtered, regardless of API call parameters.
 */

import { describe, test, expect } from 'vitest';
import { testWebhook } from '../helpers/webhook.js';

describe('SmartPersonRecognizer - DEFAULT_ALLOW_LIST Protection', () => {
  test('API without custom allow_list still blocks ChatGPT', async () => {
    /**
     * CRITICAL TEST: User doesn't provide allow_list parameter
     * → DEFAULT_ALLOW_LIST should still protect against "ChatGPT" FP
     *
     * This test verifies Fix #1 (combined_allow_list merge)
     */
    const prompt = 'ChatGPT is an AI model. John Smith works on it.';

    const result = await testWebhook(prompt);

    // Verify PII detection happened
    expect(result.pii).toBeDefined();
    expect(result.pii.has).toBe(true);

    // Extract detected entities
    const entities = result.pii.entities || [];
    const personEntities = entities.filter(e => e.entity_type === 'PERSON');
    const detectedTexts = personEntities.map(e => e.text);

    // CRITICAL: "ChatGPT" should NOT be detected (filtered by DEFAULT_ALLOW_LIST)
    expect(detectedTexts).not.toContain('ChatGPT');
    expect(detectedTexts).not.toContain('chatgpt');

    // "John Smith" should be detected (real name)
    expect(detectedTexts).toContain('John Smith');

    // Log for debugging
    console.log('📋 Detected PERSON entities:', detectedTexts);
  });

  test('DEFAULT_ALLOW_LIST blocks all major AI models', async () => {
    /**
     * Test comprehensive AI model coverage:
     * ChatGPT, Claude, Gemini, GPT-4, Bard, DALL-E
     */
    const prompt = 'ChatGPT, Claude, Gemini, GPT-4, Bard, and DALL-E are AI models. Jane Doe uses them.';

    const result = await testWebhook(prompt);

    const entities = result.pii?.entities || [];
    const personEntities = entities.filter(e => e.entity_type === 'PERSON');
    const detectedTexts = personEntities.map(e => e.text);

    // AI models should be filtered
    const aiModels = ['ChatGPT', 'Claude', 'Gemini', 'GPT-4', 'GPT', 'Bard', 'DALL-E'];
    for (const model of aiModels) {
      expect(detectedTexts).not.toContain(model);
    }

    // Real name should be detected
    expect(detectedTexts).toContain('Jane Doe');

    console.log('✅ AI models blocked:', aiModels.length);
    console.log('✅ Real names detected:', detectedTexts.filter(t => !aiModels.includes(t)));
  });

  test('Pronouns are blocked by Phase 2 filters', async () => {
    /**
     * Verify pronouns (he, she, they) are NOT detected as PERSON entities
     *
     * spaCy sometimes detects capitalized pronouns as PERSON.
     * SmartPersonRecognizer should reject them.
     */
    const prompt = 'He told her that they should contact John Smith.';

    const result = await testWebhook(prompt);

    const entities = result.pii?.entities || [];
    const personEntities = entities.filter(e => e.entity_type === 'PERSON');
    const detectedTexts = personEntities.map(e => e.text);

    // Pronouns should NOT be detected
    const pronouns = ['He', 'he', 'Her', 'her', 'They', 'they'];
    for (const pronoun of pronouns) {
      expect(detectedTexts).not.toContain(pronoun);
    }

    // Real name should be detected
    expect(detectedTexts).toContain('John Smith');
  });

  test('Single-word Polish names are detected (regression test)', async () => {
    /**
     * REGRESSION TEST for Fix #2 (soften Phase 2 filters)
     *
     * Before v1.8.1: "Jan", "Maria" were rejected (too aggressive)
     * After v1.8.1: Only reject short (≤2 chars) or known pronouns
     */
    const prompt = 'Jan Kowalski i Maria Nowak pracują razem.';

    const result = await testWebhook(prompt);

    const entities = result.pii?.entities || [];
    const personEntities = entities.filter(e => e.entity_type === 'PERSON');
    const detectedTexts = personEntities.map(e => e.text);

    // Single-word Polish names should be detected
    // (either as "Jan Kowalski" or separate "Jan" + "Kowalski")
    const hasJan = detectedTexts.some(t => t.includes('Jan'));
    const hasMaria = detectedTexts.some(t => t.includes('Maria'));

    expect(hasJan).toBe(true);
    expect(hasMaria).toBe(true);

    console.log('✅ Polish names detected:', detectedTexts);
  });

  test('ALL-CAPS multi-word names are detected', async () => {
    /**
     * REGRESSION TEST for Fix #2 (soften Phase 2 filters)
     *
     * Before v1.8.1: "JAN KOWALSKI" rejected (ALL-CAPS filter too broad)
     * After v1.8.1: Only reject single-word known acronyms (AI, LLM, API)
     */
    const prompt = 'UWAGA: JAN KOWALSKI i MARIA NOWAK potrzebują pomocy.';

    const result = await testWebhook(prompt);

    const entities = result.pii?.entities || [];
    const personEntities = entities.filter(e => e.entity_type === 'PERSON');
    const detectedTexts = personEntities.map(e => e.text);

    // ALL-CAPS multi-word names should be detected
    const hasJanKowalski = detectedTexts.some(t =>
      t.toUpperCase().includes('JAN') && t.toUpperCase().includes('KOWALSKI')
    );
    const hasMariaNowak = detectedTexts.some(t =>
      t.toUpperCase().includes('MARIA') && t.toUpperCase().includes('NOWAK')
    );

    expect(hasJanKowalski).toBe(true);
    expect(hasMariaNowak).toBe(true);

    console.log('✅ ALL-CAPS names detected:', detectedTexts);
  });

  test('Known acronyms are filtered (AI, LLM, API)', async () => {
    /**
     * Test that single-word known acronyms are NOT detected as PERSON
     *
     * "AI", "LLM", "API" should be filtered by Phase 2 (ALL-CAPS filter)
     */
    const prompt = 'The AI and LLM API were developed by John Smith.';

    const result = await testWebhook(prompt);

    const entities = result.pii?.entities || [];
    const personEntities = entities.filter(e => e.entity_type === 'PERSON');
    const detectedTexts = personEntities.map(e => e.text);

    // Known acronyms should NOT be detected
    expect(detectedTexts).not.toContain('AI');
    expect(detectedTexts).not.toContain('LLM');
    expect(detectedTexts).not.toContain('API');

    // Real name should be detected
    expect(detectedTexts).toContain('John Smith');
  });

  test('Case-insensitive allow-list matching', async () => {
    /**
     * Verify allow-list matching is case-insensitive
     *
     * "chatgpt", "CHATGPT", "ChatGPT" should all be blocked
     */
    const prompt = 'chatgpt, CHATGPT, and ChatGPT are all the same. John Smith confirmed.';

    const result = await testWebhook(prompt);

    const entities = result.pii?.entities || [];
    const personEntities = entities.filter(e => e.entity_type === 'PERSON');
    const detectedTexts = personEntities.map(e => e.text.toLowerCase());

    // All case variants of "chatgpt" should be filtered
    expect(detectedTexts).not.toContain('chatgpt');

    // Real name should be detected (case-insensitive check)
    const hasJohnSmith = detectedTexts.some(t => t.includes('john'));
    expect(hasJohnSmith).toBe(true);
  });

  test('E2E: Combined test with mix of entities', async () => {
    /**
     * Comprehensive E2E test combining all scenarios:
     * - AI models (blocked)
     * - Pronouns (blocked)
     * - Acronyms (blocked)
     * - Real names (detected)
     * - Polish names (detected)
     * - ALL-CAPS names (detected)
     */
    const prompt = `
      ChatGPT and Claude AI tools are discussed. He said that JAN KOWALSKI,
      Maria Nowak, and John Smith should test the LLM API. They agreed.
    `;

    const result = await testWebhook(prompt);

    const entities = result.pii?.entities || [];
    const personEntities = entities.filter(e => e.entity_type === 'PERSON');
    const detectedTexts = personEntities.map(e => e.text);

    // Count filtered entities (should be 0)
    const filteredCount =
      (detectedTexts.includes('ChatGPT') ? 1 : 0) +
      (detectedTexts.includes('Claude') ? 1 : 0) +
      (detectedTexts.includes('He') ? 1 : 0) +
      (detectedTexts.includes('They') ? 1 : 0) +
      (detectedTexts.includes('AI') ? 1 : 0) +
      (detectedTexts.includes('LLM') ? 1 : 0);

    expect(filteredCount).toBe(0);

    // Count detected real names (should be ≥3)
    const realNameCount = detectedTexts.filter(t =>
      t.includes('JAN') || t.includes('Maria') || t.includes('John')
    ).length;

    expect(realNameCount).toBeGreaterThanOrEqual(3);

    console.log('📊 E2E Test Summary:');
    console.log('   Filtered entities:', filteredCount);
    console.log('   Detected real names:', realNameCount);
    console.log('   Entity texts:', detectedTexts);
  });
});
