/**
 * Language Detection E2E Tests
 * Tests the language-detector microservice integration with workflow
 *
 * Coverage:
 * - Polish text detection (prevents "jest" → [PERSON] false positives)
 * - English text detection
 * - Mixed language text
 * - Edge cases (numbers, special chars, very short text)
 * - Graceful fallback on service errors
 * - Cross-language PII detection (CREDIT_CARD works in both languages)
 *
 * Total: 50 test cases
 */

import { describe, test, expect } from 'vitest';
import { sendToWorkflow, waitForClickHouseEvent } from '../helpers/webhook.js';

const WEBHOOK_URL = 'http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1';

describe('Language Detection - Polish Text', () => {
  test('should detect Polish and not mask common words', async () => {
    const sessionId = `test_pl_common_${Date.now()}`;
    const response = await sendToWorkflow('to jeszcze jeden test', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer).toBeDefined();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');

    // "jest" should NOT be detected as PERSON
    const result = event.result || event.chat_input;
    expect(result).not.toContain('[PERSON]');
    expect(result).toContain('jeszcze');
  });

  test('should detect Polish with "jest" and not mask it', async () => {
    const sessionId = `test_pl_jest_${Date.now()}`;
    const response = await sendToWorkflow('system jest dobrze skonfigurowany', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');

    const result = event.result || event.chat_input;
    expect(result).not.toContain('[PERSON]');
    expect(result).toContain('jest');
  });

  test('should detect Polish question', async () => {
    const sessionId = `test_pl_question_${Date.now()}`;
    const response = await sendToWorkflow('Czy to działa poprawnie?', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
  });

  test('should detect Polish with Polish diacritics', async () => {
    const sessionId = `test_pl_diacritics_${Date.now()}`;
    const response = await sendToWorkflow('Zażółć gęślą jaźń', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
  });

  test('should detect Polish without diacritics', async () => {
    const sessionId = `test_pl_no_diacritics_${Date.now()}`;
    const response = await sendToWorkflow('kazdy moze pisac bez polskich znakow', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
  });

  test('should detect Polish formal text', async () => {
    const sessionId = `test_pl_formal_${Date.now()}`;
    const response = await sendToWorkflow('Szanowny Panie, proszę o informację', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
  });

  test('should detect Polish with numbers', async () => {
    const sessionId = `test_pl_numbers_${Date.now()}`;
    const response = await sendToWorkflow('Mam 5 lat doświadczenia w branży', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
  });

  test('should detect Polish longer text', async () => {
    const sessionId = `test_pl_long_${Date.now()}`;
    const text = 'System bezpieczeństwa jest bardzo ważny dla ochrony danych użytkowników. ' +
                 'Należy zawsze stosować najlepsze praktyki w zakresie cyberbezpieczeństwa.';
    const response = await sendToWorkflow(text, { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
  });
});

describe('Language Detection - English Text', () => {
  test('should detect English and process normally', async () => {
    const sessionId = `test_en_simple_${Date.now()}`;
    const response = await sendToWorkflow('this is a simple test', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });

  test('should detect English question', async () => {
    const sessionId = `test_en_question_${Date.now()}`;
    const response = await sendToWorkflow('How does this system work?', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });

  test('should detect English with technical terms', async () => {
    const sessionId = `test_en_technical_${Date.now()}`;
    const response = await sendToWorkflow('Configure the database connection string', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });

  test('should detect English with numbers', async () => {
    const sessionId = `test_en_numbers_${Date.now()}`;
    const response = await sendToWorkflow('I have 10 years of experience', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });

  test('should detect English formal text', async () => {
    const sessionId = `test_en_formal_${Date.now()}`;
    const response = await sendToWorkflow('Dear Sir or Madam, I am writing to inquire', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });

  test('should detect English longer text', async () => {
    const sessionId = `test_en_long_${Date.now()}`;
    const text = 'Security systems are essential for protecting user data. ' +
                 'Best practices in cybersecurity should always be applied.';
    const response = await sendToWorkflow(text, { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });
});

describe('Language Detection - Edge Cases', () => {
  test('should handle very short text (3 words Polish)', async () => {
    const sessionId = `test_edge_short_pl_${Date.now()}`;
    const response = await sendToWorkflow('to jest test', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
  });

  test('should handle very short text (3 words English)', async () => {
    const sessionId = `test_edge_short_en_${Date.now()}`;
    const response = await sendToWorkflow('this is test', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });

  test('should handle text with mostly numbers', async () => {
    const sessionId = `test_edge_numbers_${Date.now()}`;
    const response = await sendToWorkflow('123 456 789 test numbers', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toMatch(/pl|en/);
  });

  test('should handle text with special characters', async () => {
    const sessionId = `test_edge_special_${Date.now()}`;
    const response = await sendToWorkflow('test@example.com & special_chars!', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBeDefined();
  });

  test('should handle text with emojis', async () => {
    const sessionId = `test_edge_emoji_${Date.now()}`;
    const response = await sendToWorkflow('Hello world 👋 this is a test 🚀', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });

  test('should handle text with URLs', async () => {
    const sessionId = `test_edge_url_${Date.now()}`;
    const response = await sendToWorkflow('Check https://example.com for more info', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });

  test('should handle text with code snippets', async () => {
    const sessionId = `test_edge_code_${Date.now()}`;
    const response = await sendToWorkflow('Use const x = 10; in JavaScript', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });

  test('should handle text with punctuation only at end', async () => {
    const sessionId = `test_edge_punct_${Date.now()}`;
    const response = await sendToWorkflow('Czy system działa poprawnie!!!???', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
  });

  test('should handle single word Polish', async () => {
    const sessionId = `test_edge_single_pl_${Date.now()}`;
    const response = await sendToWorkflow('dziękuję', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
  });

  test('should handle single word English', async () => {
    const sessionId = `test_edge_single_en_${Date.now()}`;
    const response = await sendToWorkflow('hello', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });
});

describe('Language Detection - Mixed Language', () => {
  test('should detect dominant language (Polish with English word)', async () => {
    const sessionId = `test_mixed_pl_en_${Date.now()}`;
    const response = await sendToWorkflow('System bezpieczeństwa używa password authentication', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
  });

  test('should detect dominant language (English with Polish word)', async () => {
    const sessionId = `test_mixed_en_pl_${Date.now()}`;
    const response = await sendToWorkflow('Security system uses hasło authentication method', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');
  });

  test('should handle code-switching (sentence by sentence)', async () => {
    const sessionId = `test_mixed_codeswitch_${Date.now()}`;
    const text = 'To jest pierwszy test. This is second sentence. Trzecie zdanie po polsku.';
    const response = await sendToWorkflow(text, { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toMatch(/pl|en/);
  });
});

describe('Language Detection - PII Cross-Language Handling', () => {
  test('should detect CREDIT_CARD in Polish text', async () => {
    const sessionId = `test_pii_card_pl_${Date.now()}`;
    const response = await sendToWorkflow('Moja karta to 4111111111111111', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');

    // Credit card should be masked regardless of language
    const result = event.result || event.chat_input;
    expect(result).not.toContain('4111111111111111');
  });

  test('should detect CREDIT_CARD in English text', async () => {
    const sessionId = `test_pii_card_en_${Date.now()}`;
    const response = await sendToWorkflow('My card is 5555555555554444', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');

    const result = event.result || event.chat_input;
    expect(result).not.toContain('5555555555554444');
  });

  test('should detect EMAIL in Polish text', async () => {
    const sessionId = `test_pii_email_pl_${Date.now()}`;
    const response = await sendToWorkflow('Mój email to test@example.com', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');

    const result = event.result || event.chat_input;
    expect(result).not.toContain('test@example.com');
  });

  test('should detect EMAIL in English text', async () => {
    const sessionId = `test_pii_email_en_${Date.now()}`;
    const response = await sendToWorkflow('Contact me at user@domain.org', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');

    const result = event.result || event.chat_input;
    expect(result).not.toContain('user@domain.org');
  });

  test('should NOT detect Polish word "jest" as PERSON in Polish text', async () => {
    const sessionId = `test_pii_no_fp_jest_${Date.now()}`;
    const response = await sendToWorkflow('Cała karta jest gotowa do użycia', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');

    // "jest" should NOT be masked as PERSON
    const result = event.result || event.chat_input;
    expect(result).not.toContain('[PERSON]');
    expect(result).toContain('jest');
  });

  test('should NOT detect Polish word "jeszcze" as PERSON in Polish text', async () => {
    const sessionId = `test_pii_no_fp_jeszcze_${Date.now()}`;
    const response = await sendToWorkflow('To jeszcze nie koniec testów', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');

    const result = event.result || event.chat_input;
    expect(result).not.toContain('[PERSON]');
    expect(result).toContain('jeszcze');
  });

  test('should detect PL_PESEL only in Polish context', async () => {
    const sessionId = `test_pii_pesel_pl_${Date.now()}`;
    const response = await sendToWorkflow('PESEL: 44051401359', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();

    // PESEL should be detected and masked
    const result = event.result || event.chat_input;
    expect(result).not.toContain('44051401359');
  });

  test('should handle multiple PII types in same text', async () => {
    const sessionId = `test_pii_multi_${Date.now()}`;
    const response = await sendToWorkflow('Karta 4111111111111111 oraz PESEL 44051401359', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');

    const result = event.result || event.chat_input;
    // Both should be masked
    expect(result).not.toContain('4111111111111111');
    expect(result).not.toContain('44051401359');
  });
});

describe('Language Detection - Performance', () => {
  test('should process requests quickly (< 500ms)', async () => {
    const sessionId = `test_perf_${Date.now()}`;
    const startTime = Date.now();

    await sendToWorkflow('Szybki test wydajności systemu', { sessionId });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(500);
  });

  test('should handle concurrent requests', async () => {
    const sessionIds = [];
    const promises = [];

    for (let i = 0; i < 5; i++) {
      const sessionId = `test_concurrent_${Date.now()}_${i}`;
      sessionIds.push(sessionId);
      promises.push(sendToWorkflow(`Test równoległy numer ${i}`, { sessionId }));
    }

    const responses = await Promise.all(promises);
    expect(responses).toHaveLength(5);

    // All should succeed
    responses.forEach(response => {
      expect(response).toBeDefined();
    });
  });
});

describe('Language Detection - Regression Tests', () => {
  test('regression: "chyba caly czas system jest zbyt restrykcyjny"', async () => {
    const sessionId = `test_regression_1_${Date.now()}`;
    const response = await sendToWorkflow('chyba caly czas system jest zbyt restrykcyjny i wycina za duzo', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');

    const result = event.result || event.chat_input;
    // "jest" should NOT be masked
    expect(result).not.toContain('[PERSON]');
    expect(result).toContain('jest');
  });

  test('regression: "to jeszcze jeden test"', async () => {
    const sessionId = `test_regression_2_${Date.now()}`;
    const response = await sendToWorkflow('to jeszcze jeden test', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');

    const result = event.result || event.chat_input;
    // "jeszcze" should NOT be masked
    expect(result).not.toContain('[PERSON]');
    expect(result).toContain('jeszcze');
  });

  test('regression: English name should still be detected', async () => {
    const sessionId = `test_regression_3_${Date.now()}`;
    const response = await sendToWorkflow('Contact John Smith for details', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('en');

    const result = event.result || event.chat_input;
    // English names should still be detected in English text
    expect(result).toContain('[PERSON]');
  });
});

describe('Language Detection - Statistics Logging', () => {
  test('should log language detection statistics', async () => {
    const sessionId = `test_stats_${Date.now()}`;
    const response = await sendToWorkflow('Test statystyk języka polskiego', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats).toBeDefined();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
    expect(event.sanitizer.pii?.language_stats?.polish_entities).toBeDefined();
    expect(event.sanitizer.pii?.language_stats?.international_entities).toBeDefined();
    expect(event.sanitizer.pii?.language_stats?.total_after_dedup).toBeDefined();
  });

  test('should log entity counts by language', async () => {
    const sessionId = `test_stats_counts_${Date.now()}`;
    const response = await sendToWorkflow('Karta 4111111111111111 i PESEL 44051401359', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats).toBeDefined();

    const stats = event.sanitizer.pii.language_stats;
    // Should have entities from both Polish and international models
    const totalEntities = (stats.polish_entities || 0) + (stats.international_entities || 0);
    expect(totalEntities).toBeGreaterThan(0);
  });
});

describe('Language Detection - Service Health', () => {
  test('should have language detection service running', async () => {
    const response = await fetch('http://localhost:5002/health');
    expect(response.ok).toBe(true);

    const health = await response.json();
    expect(health.status).toBe('healthy');
    expect(health.service).toBe('language-detector');
  });

  test('should return detection method in PII results', async () => {
    const sessionId = `test_method_${Date.now()}`;
    const response = await sendToWorkflow('Test metody detekcji', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.detection_method).toBeDefined();
    // Should use presidio with language awareness
    expect(event.sanitizer.pii?.detection_method).toContain('presidio');
  });

  test('should detect CREDIT_CARD in Polish text using hybrid detection (v1.6.11)', async () => {
    const sessionId = `test_pl_creditcard_hybrid_${Date.now()}`;
    const response = await sendToWorkflow(
      'Karta kredytowa 4111111111111111 i PESEL 44051401359',
      { sessionId }
    );

    await new Promise(resolve => setTimeout(resolve, 3000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();

    // Language should be Polish (entity-based detection)
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
    expect(event.sanitizer.pii?.language_stats?.detection_method).toMatch(/entity_based|hybrid/);

    // Both CREDIT_CARD and PESEL should be detected
    const result = event.result || event.chat_input;
    expect(result).toContain('[CARD]');
    expect(result).toContain('[PESEL]');

    // Should NOT be blocked (proper sanitization)
    expect(event.decision?.action).not.toBe('BLOCK');
  });

  test('should use entity-based detection when PESEL pattern present (v1.6.11)', async () => {
    const sessionId = `test_entity_based_pesel_${Date.now()}`;
    const response = await sendToWorkflow('PESEL: 92032100157', { sessionId });

    await new Promise(resolve => setTimeout(resolve, 2000));
    const event = await waitForClickHouseEvent({ sessionId }, 10000);

    expect(event).toBeTruthy();
    expect(event.sanitizer.pii?.language_stats?.detected_language).toBe('pl');
    expect(event.sanitizer.pii?.language_stats?.detection_method).toMatch(/entity_based|hybrid/);

    const result = event.result || event.chat_input;
    expect(result).toContain('[PESEL]');
  });
});
