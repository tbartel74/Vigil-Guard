/**
 * Unit Tests - Entropy Detector (Language-Aware Bigram Detection + KL Divergence + Character Diversity)
 *
 * Tests for multi-language bigram anomaly detection (Polish + English).
 * Tests for KL divergence (relative entropy) calculations.
 * Tests for character class diversity analysis.
 * Validates false positive reduction for Polish text while maintaining
 * detection accuracy for obfuscated content.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { detectEntropy } from '../../src/detectors/entropy.js';
import { calculateRelativeEntropy, calculateCharClassDiversity } from '../../src/utils/unicode.js';

describe('Entropy Detector - Language-Aware Bigram Detection', () => {

  // Test Group 1: Polish Text with Polish Bigrams
  describe('Polish Text (lang=pl)', () => {

    it('should have low bigram anomaly for common Polish phrases', async () => {
      const polishText = "To jest dobry przykład polskiego tekstu.";
      const result = await detectEntropy(polishText, { lang: 'pl' });

      expect(result.bigram_anomaly_score).toBeLessThan(30); // <30% threshold
      expect(result.signals).not.toContain(expect.stringContaining('Unusual bigram patterns'));
    });

    it('should handle Polish text with diacritics correctly', async () => {
      const polishText = "System bezpieczeństwa działa prawidłowo i chroni użytkowników.";
      const result = await detectEntropy(polishText, { lang: 'pl' });

      expect(result.bigram_anomaly_score).toBeLessThan(25); // Very low anomaly
    });

    it('should handle Polish technical terms', async () => {
      const polishText = "Konfiguracja serwera wymaga uwierzytelnienia i szyfrowania danych.";
      const result = await detectEntropy(polishText, { lang: 'pl' });

      expect(result.bigram_anomaly_score).toBeLessThan(30);
    });

    it('should handle the user\'s original example (ale chyba zadziałało...)', async () => {
      const polishText = "ale chyba zadziałało i ciekawe jaka entropie ma ten tekst";
      const result = await detectEntropy(polishText, { lang: 'pl' });

      // Current bug: 86% with English bigrams
      // Expected: <20% with Polish bigrams
      expect(result.bigram_anomaly_score).toBeLessThan(20);
      expect(result.signals).not.toContain(expect.stringContaining('Unusual bigram patterns'));
    });

    it('should detect cross-language anomaly (Polish text forced to English bigrams)', async () => {
      const polishText = "To jest dobry system";
      const resultWithEnglish = await detectEntropy(polishText, { lang: 'en' });

      // Polish text analyzed with English bigrams may show moderate anomaly
      // Frequency-based approach focuses on common bigram occurrence, not language match
      // Polish and English have SOME overlap (e.g., "st", "to", "es")
      expect(resultWithEnglish.bigram_anomaly_score).toBeGreaterThan(0);
      expect(resultWithEnglish.bigram_anomaly_score).toBeLessThan(50);
    });
  });

  // Test Group 2: English Text with English Bigrams
  describe('English Text (lang=en)', () => {

    it('should have low bigram anomaly for common English phrases', async () => {
      const englishText = "This is a good example of English text.";
      const result = await detectEntropy(englishText, { lang: 'en' });

      expect(result.bigram_anomaly_score).toBeLessThan(30);
      expect(result.signals).not.toContain(expect.stringContaining('Unusual bigram patterns'));
    });

    it('should handle English technical terms', async () => {
      const englishText = "The security system requires authentication and encryption.";
      const result = await detectEntropy(englishText, { lang: 'en' });

      expect(result.bigram_anomaly_score).toBeLessThan(30);
    });

    it('should maintain existing English detection accuracy', async () => {
      const englishText = "Hello world this is a test of the system.";
      const result = await detectEntropy(englishText, { lang: 'en' });

      expect(result.bigram_anomaly_score).toBeLessThan(20);
    });
  });

  // Test Group 3: Obfuscated Text (True Positives)
  describe('Obfuscated Text (Both Languages)', () => {

    it('should detect random character strings (lang=pl)', async () => {
      const obfuscated = "x7f9k2p3q8z1m4n6b5c0v";
      const result = await detectEntropy(obfuscated, { lang: 'pl' });

      expect(result.bigram_anomaly_score).toBeGreaterThan(70);
      // Check for signal using .some() instead of .toContain(stringContaining())
      const hasSignal = result.signals.some(s => s.includes('Unusual bigram patterns'));
      expect(hasSignal).toBe(true);
    });

    it('should detect random character strings (lang=en)', async () => {
      const obfuscated = "x7f9k2p3q8z1m4n6b5c0v";
      const result = await detectEntropy(obfuscated, { lang: 'en' });

      expect(result.bigram_anomaly_score).toBeGreaterThan(70);
    });

    it('should detect base64-like encoded text (lang=pl)', async () => {
      const base64Like = "SGVsbG8gV29ybGQgdGhpcyBpcyBhIHRlc3Q=";
      const result = await detectEntropy(base64Like, { lang: 'pl' });

      expect(result.bigram_anomaly_score).toBeGreaterThan(60);
    });

    it('should detect leet speak obfuscation (lang=en)', async () => {
      const leetSpeak = "h3ll0 w0r1d th1s 1s 4 t3st";
      const result = await detectEntropy(leetSpeak, { lang: 'en' });

      // Leet speak still contains common English bigrams ('th', 'is', 'll', 'st')
      // Frequency-based approach gives moderate anomaly (30-40%)
      // Full detection relies on obfuscation detector + other entropy metrics
      expect(result.bigram_anomaly_score).toBeGreaterThan(20);
      expect(result.bigram_anomaly_score).toBeLessThan(50);
    });
  });

  // Test Group 4: Edge Cases & Fallback Behavior
  describe('Edge Cases & Fallback', () => {

    it('should fallback to English when lang parameter is null', async () => {
      const englishText = "Hello world";
      const result = await detectEntropy(englishText, { lang: null });

      expect(result.bigram_anomaly_score).toBeLessThan(30);
    });

    it('should fallback to English when lang parameter is missing', async () => {
      const englishText = "Hello world";
      const result = await detectEntropy(englishText);

      expect(result.bigram_anomaly_score).toBeLessThan(30);
    });

    it('should fallback to English for unknown language code', async () => {
      const text = "Bonjour monde";
      const result = await detectEntropy(text, { lang: 'fr' });

      // French text with English bigrams should work (fallback)
      expect(result.bigram_anomaly_score).toBeLessThan(50);
    });

    it('should handle very short text gracefully (skip bigram analysis)', async () => {
      const shortText = "Hi";
      const result = await detectEntropy(shortText, { lang: 'pl' });

      expect(result.bigram_anomaly_score).toBe(0); // Should return early
    });

    it('should support detected_language parameter (workflow compatibility)', async () => {
      const polishText = "System działa poprawnie.";
      const result = await detectEntropy(polishText, { detected_language: 'pl' });

      expect(result.bigram_anomaly_score).toBeLessThan(25);
    });
  });

  // Test Group 5: Performance & Scoring
  describe('Performance & Scoring Logic', () => {

    it('should complete bigram analysis in <5ms', async () => {
      const text = "This is a performance test for bigram analysis speed.";
      const startTime = Date.now();

      await detectEntropy(text, { lang: 'en' });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(5);
    });

    it('should return consistent scores for identical text', async () => {
      const text = "To jest test spójności wyników.";

      const result1 = await detectEntropy(text, { lang: 'pl' });
      const result2 = await detectEntropy(text, { lang: 'pl' });

      expect(result1.bigram_anomaly_score).toBe(result2.bigram_anomaly_score);
    });

    it('should combine entropy and bigram scores correctly', async () => {
      const normalText = "This is a completely normal sentence.";
      const result = await detectEntropy(normalText, { lang: 'en' });

      // Normal text should have low overall score
      expect(result.score).toBeLessThan(30);
      expect(result.entropy_raw).toBeLessThan(4.5); // Below high threshold
      expect(result.bigram_anomaly_score).toBeLessThan(30);
    });
  });

  // Test Group 6: KL Divergence (Relative Entropy) Tests
  describe('KL Divergence (Relative Entropy)', () => {

    it('should calculate low KL divergence for natural English text', () => {
      const englishText = "The quick brown fox jumps over the lazy dog.";
      const klDivergence = calculateRelativeEntropy(englishText, 'en');

      // Natural English should have KL < 0.4 (threshold)
      expect(klDivergence).toBeLessThan(0.4);
      expect(klDivergence).toBeGreaterThan(0); // Not exactly zero
    });

    it('should calculate low KL divergence for natural Polish text', () => {
      const polishText = "Szybki brązowy lis przeskakuje leniwego psa.";
      const klDivergence = calculateRelativeEntropy(polishText, 'pl');

      // Natural Polish should have KL < 0.4
      expect(klDivergence).toBeLessThan(0.4);
      expect(klDivergence).toBeGreaterThan(0);
    });

    it('should calculate high KL divergence for random text', () => {
      const randomText = "xj3k9m2p7q8z4n5b6c1v0w";
      const klDivergenceEn = calculateRelativeEntropy(randomText, 'en');
      const klDivergencePl = calculateRelativeEntropy(randomText, 'pl');

      // Random text deviates significantly from natural language
      expect(klDivergenceEn).toBeGreaterThan(0.5);
      expect(klDivergencePl).toBeGreaterThan(0.5);
    });

    it('should calculate high KL divergence for base64-encoded text', () => {
      const base64Text = "SGVsbG8gV29ybGQgdGhpcyBpcyBhIHRlc3Q=";
      const klDivergence = calculateRelativeEntropy(base64Text, 'en');

      // Base64 has non-natural character distribution
      expect(klDivergence).toBeGreaterThan(0.4);
    });

    it('should handle cross-language text (Polish with English reference)', () => {
      const polishText = "To jest dobry przykład tekstu.";
      const klDivergenceWithEnglish = calculateRelativeEntropy(polishText, 'en');

      // Polish text with English reference may show moderate divergence
      // (some overlap in character distribution)
      expect(klDivergenceWithEnglish).toBeGreaterThan(0.2);
      expect(klDivergenceWithEnglish).toBeLessThan(0.8);
    });

    it('should return zero divergence for empty text', () => {
      const emptyText = "";
      const klDivergence = calculateRelativeEntropy(emptyText, 'en');

      expect(klDivergence).toBe(0);
    });

    it('should integrate KL divergence into entropy detector results', async () => {
      const normalText = "This is a normal English sentence.";
      const result = await detectEntropy(normalText, { lang: 'en' });

      // Check that relative_entropy field is populated
      expect(result.relative_entropy).toBeDefined();
      expect(result.relative_entropy).toBeLessThan(40); // Normalized to 0-100 scale
    });

    it('should detect obfuscated text via high KL divergence', async () => {
      const obfuscatedText = "xK9pLm2Qz8Wv3Nc7Fb5Ty1";
      const result = await detectEntropy(obfuscatedText, { lang: 'en' });

      // High KL divergence should contribute to score (normalized to 0-100)
      // Actual KL may vary, but should be >40 for obfuscated text
      expect(result.relative_entropy).toBeGreaterThan(40);
      const hasKLSignal = result.signals.some(s => s.includes('deviates from natural'));
      expect(hasKLSignal).toBe(true);
    });
  });

  // Test Group 7: Character Class Diversity Tests
  describe('Character Class Diversity', () => {

    it('should calculate low diversity for simple text', () => {
      const simpleText = "hello world";
      const diversity = calculateCharClassDiversity(simpleText);

      // Only lowercase + whitespace = 2 classes
      expect(diversity.count).toBe(2);
      expect(diversity.classes).toContain('lowercase');
      expect(diversity.classes).toContain('whitespace');
      expect(diversity.score).toBe(0); // 2 classes = score 0
    });

    it('should calculate moderate diversity for mixed-case text', () => {
      const mixedText = "Hello World 123";
      const diversity = calculateCharClassDiversity(mixedText);

      // Uppercase + lowercase + digits + whitespace = 4 classes
      expect(diversity.count).toBe(4);
      expect(diversity.classes).toContain('uppercase');
      expect(diversity.classes).toContain('lowercase');
      expect(diversity.classes).toContain('digits');
      expect(diversity.classes).toContain('whitespace');
      expect(diversity.score).toBe(30); // 4 classes = score 30
    });

    it('should calculate high diversity for text with special characters', () => {
      const complexText = "Hello World! 123 @#$%";
      const diversity = calculateCharClassDiversity(complexText);

      // 5 classes: uppercase, lowercase, digits, whitespace, symbols
      expect(diversity.count).toBe(5);
      expect(diversity.classes).toContain('symbols');
      expect(diversity.score).toBe(60); // 5 classes = score 60
    });

    it('should detect unicode characters (emoji/special) as unicode class', () => {
      const emojiText = "Hello 😀 World";
      const diversity = calculateCharClassDiversity(emojiText);

      // Should include unicode class (emoji is non-ASCII)
      expect(diversity.classes).toContain('unicode');
      expect(diversity.count).toBeGreaterThanOrEqual(3);
    });

    it('should detect Unicode symbols as unicode class', () => {
      const symbolText = "Price: €100 ¥500 £200";
      const diversity = calculateCharClassDiversity(symbolText);

      // Should include unicode class (€, ¥, £ are non-ASCII)
      expect(diversity.classes).toContain('unicode');
      expect(diversity.count).toBeGreaterThanOrEqual(4);
    });

    it('should return zero diversity for empty text', () => {
      const emptyText = "";
      const diversity = calculateCharClassDiversity(emptyText);

      expect(diversity.count).toBe(0);
      expect(diversity.classes).toHaveLength(0);
      expect(diversity.score).toBe(0);
    });

    it('should integrate character diversity into entropy detector results', async () => {
      const mixedText = "Hello World! 123 @test";
      const result = await detectEntropy(mixedText, { lang: 'en' });

      // Check that char_class_diversity field is populated
      expect(result.char_class_diversity).toBeDefined();
      expect(result.char_class_diversity).toBeGreaterThan(0);
    });

    it('should detect high diversity as a signal in entropy results', async () => {
      const diverseText = "Abc123!@# €100 ¥500 😀";
      const result = await detectEntropy(diverseText, { lang: 'en' });

      // High diversity should trigger signal
      expect(result.char_class_diversity).toBeGreaterThan(60);
      const hasDiversitySignal = result.signals.some(s => s.includes('character class diversity'));
      expect(hasDiversitySignal).toBe(true);
    });

    it('should handle Polish diacritics (unicode detected)', () => {
      const polishText = "Zażółć gęślą jaźń";
      const diversity = calculateCharClassDiversity(polishText);

      // Polish diacritics include unicode characters (ą, ę, ł, ó, ś, ź, ć)
      // Expected: lowercase + uppercase (Ż) + whitespace + unicode = 4 classes
      expect(diversity.count).toBe(4);
      expect(diversity.classes).toContain('unicode');
      expect(diversity.score).toBe(30); // 4 classes = score 30
    });
  });

  // Test Group 8: New Scoring Algorithm Integration
  describe('New Scoring Algorithm (v2.1)', () => {

    it('should prioritize KL divergence in scoring (40% weight)', async () => {
      const textWithHighKL = "xyzabc123defghi789jklmno456";
      const result = await detectEntropy(textWithHighKL, { lang: 'en' });

      // KL divergence should contribute to final score
      // Actual values may vary based on character distribution
      expect(result.relative_entropy).toBeGreaterThan(20);
      expect(result.score).toBeGreaterThan(30); // Combined score from multiple metrics
    });

    it('should combine all three primary metrics (KL + bigram + diversity)', async () => {
      const complexText = "Abc123!@# xyzDefGhi789";
      const result = await detectEntropy(complexText, { lang: 'en' });

      // All three metrics should contribute
      expect(result.relative_entropy).toBeGreaterThan(0);
      expect(result.bigram_anomaly_score).toBeGreaterThan(0);
      expect(result.char_class_diversity).toBeGreaterThan(0);

      // Combined score should be meaningful
      expect(result.score).toBeGreaterThan(20);
    });

    it('should keep natural text below threshold with new algorithm', async () => {
      const naturalText = "The security system requires proper authentication and encryption mechanisms.";
      const result = await detectEntropy(naturalText, { lang: 'en' });

      // Natural text should pass all new metrics
      expect(result.relative_entropy).toBeLessThan(40);
      expect(result.bigram_anomaly_score).toBeLessThan(30);
      expect(result.char_class_diversity).toBeLessThan(60);
      expect(result.score).toBeLessThan(40); // Overall low score
    });

    it('should detect obfuscated text with new algorithm', async () => {
      const obfuscatedText = "xK9pLm2Qz8Wv3Nc7Fb5Ty1Rg4Jh6Ud0Sa";
      const result = await detectEntropy(obfuscatedText, { lang: 'en' });

      // Obfuscated text should fail bigram metric (most reliable)
      expect(result.bigram_anomaly_score).toBeGreaterThan(70);
      expect(result.score).toBeGreaterThan(40); // High overall score
    });

    it('should maintain backward compatibility with Shannon entropy', async () => {
      const text = "Hello world";
      const result = await detectEntropy(text, { lang: 'en' });

      // Shannon entropy should still be calculated
      expect(result.entropy_raw).toBeDefined();
      expect(result.entropy_normalized).toBeDefined();
      expect(result.entropy_raw).toBeGreaterThan(0);
    });
  });
});
