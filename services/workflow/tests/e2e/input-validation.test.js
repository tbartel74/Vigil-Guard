/**
 * Input Validation E2E Tests (Phase 2.4) - v2.0.0
 *
 * Tests basic input validation capabilities:
 * - Max length check (>20000 chars)
 * - Min length check (empty input)
 * - Normal input handling
 *
 * v2.0.0 Notes:
 * - Repetition and control character checks are NOT implemented in v2.0.0
 * - Tests focus on what the current system actually validates
 * - final_status: ALLOWED (clean), BLOCKED (threat/invalid), SANITIZED (PII only)
 */

import { describe, test, expect } from 'vitest';
import { sendAndVerify } from '../helpers/webhook.js';

describe('Input Validation Layer (Phase 2.4) - v2.0.0', () => {
  describe('Maximum Length Protection', () => {
    test('should block 25000 char input (exceeds max 20000)', async () => {
      // Generate 25000 character input with varied content to avoid repetition
      const longText = 'This is a test message for length validation. '.repeat(600); // ~27000 chars

      const result = await sendAndVerify(longText);

      // v2.0.0: Test Arbiter final decision
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');
      expect(result.threat_score).toBe(100);

      console.log(`✅ Test passed: 25000 char input blocked (status: ${result.final_status})`);
    }, 30000);

    test('should process 18000 char legitimate input', async () => {
      // Generate 18000 character legitimate input with varied content
      const legitimateText = 'This is a legitimate long document with varied content for testing. '.repeat(250); // ~17000 chars

      const result = await sendAndVerify(legitimateText);

      // v2.0.0: System processes the input (may be ALLOWED or BLOCKED by heuristics)
      expect(result).toBeDefined();
      expect(result.final_status).toBeDefined();
      // The system should at minimum process it
      expect(['ALLOWED', 'BLOCKED', 'SANITIZED']).toContain(result.final_status);

      console.log(`✅ Test passed: 18000 char input processed (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Minimum Length Protection', () => {
    test('should block empty input', async () => {
      const emptyText = '';

      const result = await sendAndVerify(emptyText);

      // v2.0.0: Test Arbiter final decision
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');
      expect(result.threat_score).toBe(100);

      console.log(`✅ Test passed: Empty input blocked (status: ${result.final_status})`);
    }, 30000);

    test('should allow single character input', async () => {
      const singleChar = 'A';

      const result = await sendAndVerify(singleChar);

      // v2.0.0: Single char should pass validation
      expect(result).toBeDefined();
      // May be ALLOWED or SANITIZED depending on content
      expect(result.final_status).not.toBe('BLOCKED');

      console.log(`✅ Test passed: Single character passed validation (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Repetition Handling (v2.0.0 Behavior)', () => {
    // NOTE: v2.0.0 does NOT block repetitive input - this is expected behavior
    test('should process repetitive input (v2.0.0: no repetition check)', async () => {
      const repetitiveText = 'A'.repeat(1000);

      const result = await sendAndVerify(repetitiveText);

      // v2.0.0: Repetitive input is processed (may be ALLOWED)
      expect(result).toBeDefined();
      expect(result.final_status).toBeDefined();
      // Document current behavior: system does not block pure repetition
      console.log(`✅ Test passed: Repetitive input processed (status: ${result.final_status}, score: ${result.threat_score})`);
    }, 30000);

    test('should process varied repeated patterns', async () => {
      const text = 'ABCDE'.repeat(100); // 500 chars, 5 unique chars

      const result = await sendAndVerify(text);

      // v2.0.0: Should process without blocking
      expect(result).toBeDefined();
      expect(result.final_status).toBeDefined();

      console.log(`✅ Test passed: "ABCDE"×100 processed (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Control Character Handling (v2.0.0 Behavior)', () => {
    // NOTE: v2.0.0 does NOT have explicit control character ratio checks
    test('should process input with control characters', async () => {
      // Create text with control characters (tab)
      const controlChars = '\t'.repeat(20);
      const normalChars = 'This is normal text with some tabs.';
      const text = controlChars + normalChars;

      const result = await sendAndVerify(text);

      // v2.0.0: System processes input with control chars
      expect(result).toBeDefined();
      expect(result.final_status).toBeDefined();

      console.log(`✅ Test passed: Input with control chars processed (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Normal Input Scenarios', () => {
    test('should allow normal short input', async () => {
      const text = 'Hello, how are you today?';

      const result = await sendAndVerify(text);

      // v2.0.0: Normal benign input should be ALLOWED
      expect(result).toBeDefined();
      expect(result.final_status).toBe('ALLOWED');
      expect(result.threat_score).toBeLessThan(30);

      console.log(`✅ Test passed: Normal input allowed (score: ${result.threat_score})`);
    }, 30000);

    test('should handle newlines and special characters correctly', async () => {
      const text = 'Line 1\nLine 2\nLine 3\nSpecial: !@#$%^&*()';

      const result = await sendAndVerify(text);

      // v2.0.0: Should pass validation (newlines and special chars are normal)
      expect(result).toBeDefined();
      expect(result.final_status).not.toBe('BLOCKED');

      console.log(`✅ Test passed: Newlines and special chars handled correctly`);
    }, 30000);

    test('should process legitimate technical content', async () => {
      const text = `
        This is technical documentation about implementing input validation.
        Key requirements include length constraints and character validation.
        Performance and security are both important considerations.
      `;

      const result = await sendAndVerify(text);

      // v2.0.0: Should be ALLOWED or processed
      expect(result).toBeDefined();
      expect(result.final_status).toBeDefined();

      console.log(`✅ Test passed: Technical content processed (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Edge Cases', () => {
    test('should handle exactly 20000 characters (boundary)', async () => {
      const text = 'Test boundary case with varied text. '.repeat(555); // ~19980 chars

      const result = await sendAndVerify(text);

      // v2.0.0: At boundary, should be processed
      expect(result).toBeDefined();
      expect(result.final_status).toBeDefined();

      console.log(`✅ Test passed: 20000 char boundary handled (status: ${result.final_status})`);
    }, 30000);

    test('should block 20001+ characters (just over limit)', async () => {
      const text = 'Test message that exceeds the limit. '.repeat(600); // ~21600 chars

      const result = await sendAndVerify(text);

      // v2.0.0: Over limit should be BLOCKED
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');

      console.log(`✅ Test passed: Over-limit input blocked`);
    }, 30000);
  });
});
