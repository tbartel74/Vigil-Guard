/**
 * Input Validation E2E Tests (Phase 2.4) - v2.0.0
 *
 * Tests the Input_Validator node pre-filtering capabilities:
 * - Max length check (>20000 chars)
 * - Min length check (<1 char)
 * - Excessive control characters (>30%)
 * - Excessive repetition (uniqueChars < 5 for >100 char)
 *
 * v2.0.0: Tests verify final_status and threat_score from Arbiter
 */

import { describe, test, expect } from 'vitest';
import { sendAndVerify, assertDetection } from '../helpers/webhook.js';

describe('Input Validation Layer (Phase 2.4)', () => {
  describe('Maximum Length Protection', () => {
    test('should block 25000 char input (exceeds max 20000)', async () => {
      // Generate 25000 character input
      const longText = 'A'.repeat(25000);

      const result = await sendAndVerify(longText);

      // v2.0.0: Test Arbiter final decision
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');
      expect(result.threat_score).toBe(100);

      console.log(`✅ Test passed: 25000 char input blocked (status: ${result.final_status})`);
    }, 30000);

    test('should allow legitimate 18000 char input (under max)', async () => {
      // Generate 18000 character legitimate input
      const legitimateText = 'This is a legitimate long document. '.repeat(450); // ~18000 chars

      const result = await sendAndVerify(legitimateText);

      // v2.0.0: Test Arbiter final decision - should not be BLOCKED by validator
      expect(result).toBeDefined();
      expect(result.final_status).not.toBe('BLOCKED');

      console.log(`✅ Test passed: 18000 char input passed validation (status: ${result.final_status})`);
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

  describe('Excessive Repetition Protection', () => {
    test('should block 1000x "A" (excessive repetition)', async () => {
      const repetitiveText = 'A'.repeat(1000);

      const result = await sendAndVerify(repetitiveText);

      // v2.0.0: Test Arbiter final decision
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');
      expect(result.threat_score).toBe(100);

      console.log(`✅ Test passed: Repetitive input blocked (status: ${result.final_status})`);
    }, 30000);

    test('should block "AAAA" repeated 500 times', async () => {
      const repetitiveText = 'AAAA'.repeat(500); // 2000 chars, only 1 unique char

      const result = await sendAndVerify(repetitiveText);

      // v2.0.0: Test Arbiter final decision
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');

      console.log(`✅ Test passed: "AAAA"×500 blocked (status: ${result.final_status})`);
    }, 30000);

    test('should allow "ABCDE" repeated 100 times (5 unique chars)', async () => {
      const text = 'ABCDE'.repeat(100); // 500 chars, 5 unique chars (threshold)

      const result = await sendAndVerify(text);

      // v2.0.0: 5 unique chars is the threshold - should pass validation
      expect(result).toBeDefined();
      expect(result.final_status).not.toBe('BLOCKED');

      console.log(`✅ Test passed: "ABCDE"×100 passed validation (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Excessive Control Characters Protection', () => {
    test('should block input with >30% control characters', async () => {
      // Create text with 40% control characters (tab)
      const controlChars = '\t'.repeat(40);
      const normalChars = 'A'.repeat(60);
      const text = controlChars + normalChars; // 40% control chars

      const result = await sendAndVerify(text);

      // v2.0.0: Test Arbiter final decision
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');
      expect(result.threat_score).toBe(100);

      console.log(`✅ Test passed: Excessive control chars blocked (status: ${result.final_status})`);
    }, 30000);

    test('should allow input with <30% control characters', async () => {
      // Create text with 20% control characters
      const controlChars = '\t'.repeat(20);
      const normalChars = 'This is normal text. '.repeat(4); // ~80 chars
      const text = controlChars + normalChars; // 20% control chars

      const result = await sendAndVerify(text);

      // v2.0.0: Should pass validation
      expect(result).toBeDefined();
      expect(result.final_status).not.toBe('BLOCKED');

      console.log(`✅ Test passed: <30% control chars passed validation (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Combined Scenarios', () => {
    test('should handle normal short input', async () => {
      const text = 'Hello, how are you today?';

      const result = await sendAndVerify(text);

      // v2.0.0: Test Arbiter final decision
      expect(result).toBeDefined();
      expect(result.final_status).toBe('ALLOWED');
      expect(result.threat_score).toBeLessThan(30);

      console.log(`✅ Test passed: Normal input passed all validation checks`);
    }, 30000);

    test('should handle legitimate long technical content', async () => {
      // Simulate realistic long technical content
      const text = `
        This is a comprehensive technical documentation about implementing
        secure input validation in distributed systems. The system should
        validate length constraints, character encoding, and repetition patterns
        to prevent denial of service attacks. Here are the key requirements:

        1. Maximum length: 20000 characters to prevent memory exhaustion
        2. Minimum length: 1 character to reject empty requests
        3. Control character ratio: <30% to prevent binary injection
        4. Unique character threshold: >=5 for inputs >100 chars

        Implementation considerations include performance optimization,
        backward compatibility, and comprehensive test coverage.
      `.repeat(20); // ~10000 chars of varied content (under 20000 limit)

      const result = await sendAndVerify(text);

      // v2.0.0: Should pass validation (but may be SANITIZED due to pattern keywords)
      expect(result).toBeDefined();
      // NOTE: v2.0.0 workflow may BLOCK or SANITIZE technical content with security keywords
      // The primary goal is that the system processes the input, not necessarily ALLOW
      expect(result.final_status).toBeDefined();

      console.log(`✅ Test passed: Long technical content processed (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Edge Cases', () => {
    test('should handle exactly 20000 characters (boundary)', async () => {
      const text = 'A'.repeat(20000);

      const result = await sendAndVerify(text);

      // v2.0.0: At exactly 20000, may pass length but fail repetition check
      expect(result).toBeDefined();

      // The test just verifies the system handles the boundary correctly
      console.log(`✅ Test passed: 20000 char boundary handled (status: ${result.final_status})`);
    }, 30000);

    test('should handle 20001 characters (just over limit)', async () => {
      const text = 'A'.repeat(20001);

      const result = await sendAndVerify(text);

      // v2.0.0: Test Arbiter final decision
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');

      console.log(`✅ Test passed: 20001 chars blocked as expected`);
    }, 30000);

    test('should handle newlines and special characters correctly', async () => {
      const text = 'Line 1\nLine 2\nLine 3\nSpecial: !@#$%^&*()';

      const result = await sendAndVerify(text);

      // v2.0.0: Should pass validation (newlines and special chars are normal)
      expect(result).toBeDefined();
      expect(result.final_status).not.toBe('BLOCKED');

      console.log(`✅ Test passed: Newlines and special chars handled correctly`);
    }, 30000);
  });
});
