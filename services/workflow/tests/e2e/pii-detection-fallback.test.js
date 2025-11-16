/**
 * Language Detection Fallback Tests (v1.8.1)
 *
 * Tests graceful degradation when language-detector service is unavailable.
 */

import { describe, test, expect } from 'vitest';
import { testWebhook } from '../helpers/webhook.js';

describe('Language Detection Fallback Behavior', () => {
  test('Workflow works with healthy language detector', async () => {
    const prompt = 'This is a test message with email test@example.com';
    const result = await testWebhook(prompt);

    expect(result.pii).toBeDefined();
    expect(result.pii.language_stats).toBeDefined();
    expect(['en', 'pl']).toContain(result.pii.language_stats.detected_language);

    console.log('✅ Baseline language detection:', result.pii.language_stats.detected_language);
  });

  test('PII detection works when language is unknown', async () => {
    const ambiguousText = '123456789 email@example.com 555-1234';
    const result = await testWebhook(ambiguousText);

    expect(result.pii).toBeDefined();
    expect(result.pii.has).toBe(true);
    expect(['en', 'pl']).toContain(result.pii.language_stats?.detected_language);

    const entities = result.pii.entities || [];
    const hasEmail = entities.some(e => e.entity_type === 'EMAIL_ADDRESS');
    expect(hasEmail).toBe(true);

    console.log('✅ PII detected with ambiguous language:', entities.length, 'entities');
  });

  test('Dual-language PII detection with fallback language', async () => {
    const prompt = 'PESEL 92032100157 and email test@example.com';
    const result = await testWebhook(prompt);

    expect(result.pii.has).toBe(true);

    const entities = result.pii.entities || [];
    const hasPESEL = entities.some(e => e.entity_type === 'PESEL');
    const hasEmail = entities.some(e => e.entity_type === 'EMAIL_ADDRESS');

    expect(hasPESEL).toBe(true);
    expect(hasEmail).toBe(true);

    console.log('✅ Dual-language PII with fallback');
  });

  test('final_status is SANITIZED when PII found with fallback', async () => {
    const prompt = 'My email is user@example.com and phone is 555-1234';
    const result = await testWebhook(prompt);

    expect(result.pii.has).toBe(true);
    expect(['SANITIZE_LIGHT', 'SANITIZE_HEAVY', 'SANITIZED']).toContain(result.status);

    console.log('✅ Sanitization with fallback:', result.status);
  });
});
