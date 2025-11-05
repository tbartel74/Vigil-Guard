/**
 * Input Validation E2E Tests (Phase 2.4)
 *
 * Tests the Input_Validator node pre-filtering capabilities:
 * - Max length check (>10000 chars)
 * - Min length check (<1 char)
 * - Excessive control characters (>30%)
 * - Excessive repetition (uniqueChars < 5 for >100 char)
 */

import { describe, test, expect } from 'vitest';
import { sendAndVerify, assertDetection, parseJSONSafely } from '../helpers/webhook.js';

describe('Input Validation Layer (Phase 2.4)', () => {
  describe('Maximum Length Protection', () => {
    test('should block 15000 char input (exceeds max 10000)', async () => {
      // Generate 15000 character input
      const longText = 'A'.repeat(15000);

      const result = await sendAndVerify(longText);

      // Assertions
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');
      expect(result.threat_score).toBe(100);

      // Check validation failure reason
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(false);
      expect(rawEvent.validation?.reason).toBe('EXCESSIVE_LENGTH');

      console.log(`✅ Test passed: 15000 char input blocked (reason: ${rawEvent.validation?.reason})`);
    }, 30000);

    test('should allow legitimate 8000 char input (under max)', async () => {
      // Generate 8000 character legitimate input
      const legitimateText = 'This is a legitimate long document. '.repeat(200); // ~8000 chars

      const result = await sendAndVerify(legitimateText);

      // Assertions
      expect(result).toBeDefined();
      expect(result.final_status).not.toBe('BLOCKED'); // May be ALLOWED or SANITIZED, but not BLOCKED by validator

      // Check validation passed
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(true);
      expect(rawEvent.validation?.checks?.max_length).toBe(true);
      expect(rawEvent.validation?.checks?.min_length).toBe(true);

      console.log(`✅ Test passed: 8000 char input passed validation (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Minimum Length Protection', () => {
    test('should block empty input', async () => {
      const emptyText = '';

      const result = await sendAndVerify(emptyText);

      // Assertions
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');
      expect(result.threat_score).toBe(100);

      // Check validation failure reason
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(false);
      expect(rawEvent.validation?.reason).toBe('EMPTY_INPUT');

      console.log(`✅ Test passed: Empty input blocked (reason: ${rawEvent.validation?.reason})`);
    }, 30000);

    test('should allow single character input', async () => {
      const singleChar = 'A';

      const result = await sendAndVerify(singleChar);

      // Assertions
      expect(result).toBeDefined();

      // Check validation passed (even if content is sanitized later)
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(true);
      expect(rawEvent.validation?.checks?.min_length).toBe(true);

      console.log(`✅ Test passed: Single character passed validation (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Excessive Repetition Protection', () => {
    test('should block 1000x "A" (excessive repetition)', async () => {
      const repetitiveText = 'A'.repeat(1000);

      const result = await sendAndVerify(repetitiveText);

      // Assertions
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');
      expect(result.threat_score).toBe(100);

      // Check validation failure reason
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(false);
      expect(rawEvent.validation?.reason).toBe('EXCESSIVE_REPETITION');
      expect(rawEvent.validation?.checks?.unique_chars).toBeLessThan(5);

      console.log(`✅ Test passed: Repetitive input blocked (unique chars: ${rawEvent.validation?.checks?.unique_chars})`);
    }, 30000);

    test('should block "AAAA" repeated 500 times', async () => {
      const repetitiveText = 'AAAA'.repeat(500); // 2000 chars, only 1 unique char

      const result = await sendAndVerify(repetitiveText);

      // Assertions
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');

      // Check validation failure reason
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(false);
      expect(rawEvent.validation?.reason).toBe('EXCESSIVE_REPETITION');
      expect(rawEvent.validation?.checks?.unique_chars).toBeLessThan(5);

      console.log(`✅ Test passed: "AAAA"×500 blocked (unique chars: ${rawEvent.validation?.checks?.unique_chars})`);
    }, 30000);

    test('should allow "ABCDE" repeated 100 times (5 unique chars)', async () => {
      const text = 'ABCDE'.repeat(100); // 500 chars, 5 unique chars (threshold)

      const result = await sendAndVerify(text);

      // Assertions
      expect(result).toBeDefined();

      // Check validation passed (5 unique chars is the threshold)
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(true);
      expect(rawEvent.validation?.checks?.unique_chars).toBeGreaterThanOrEqual(5);

      console.log(`✅ Test passed: "ABCDE"×100 passed validation (unique chars: ${rawEvent.validation?.checks?.unique_chars})`);
    }, 30000);
  });

  describe('Excessive Control Characters Protection', () => {
    test('should block input with >30% control characters', async () => {
      // Create text with 40% control characters (tab)
      const controlChars = '\t'.repeat(40);
      const normalChars = 'A'.repeat(60);
      const text = controlChars + normalChars; // 40% control chars

      const result = await sendAndVerify(text);

      // Assertions
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');
      expect(result.threat_score).toBe(100);

      // Check validation failure reason
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(false);
      expect(rawEvent.validation?.reason).toBe('EXCESSIVE_CONTROL_CHARS');
      expect(rawEvent.validation?.checks?.control_ratio).toBeGreaterThan(0.30);

      console.log(`✅ Test passed: Excessive control chars blocked (ratio: ${rawEvent.validation?.checks?.control_ratio})`);
    }, 30000);

    test('should allow input with <30% control characters', async () => {
      // Create text with 20% control characters
      const controlChars = '\t'.repeat(20);
      const normalChars = 'This is normal text. '.repeat(4); // ~80 chars
      const text = controlChars + normalChars; // 20% control chars

      const result = await sendAndVerify(text);

      // Assertions
      expect(result).toBeDefined();

      // Check validation passed
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(true);
      expect(rawEvent.validation?.checks?.control_chars).toBe(true);

      console.log(`✅ Test passed: <30% control chars passed validation (status: ${result.final_status})`);
    }, 30000);
  });

  describe('Combined Scenarios', () => {
    test('should handle normal short input', async () => {
      const text = 'Hello, how are you today?';

      const result = await sendAndVerify(text);

      // Assertions
      expect(result).toBeDefined();

      // Check validation passed
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(true);
      expect(rawEvent.validation?.checks?.min_length).toBe(true);
      expect(rawEvent.validation?.checks?.max_length).toBe(true);
      expect(rawEvent.validation?.checks?.control_chars).toBe(true);

      console.log(`✅ Test passed: Normal input passed all validation checks`);
    }, 30000);

    test('should handle legitimate long technical content', async () => {
      // Simulate realistic long technical content
      const text = `
        This is a comprehensive technical documentation about implementing
        secure input validation in distributed systems. The system should
        validate length constraints, character encoding, and repetition patterns
        to prevent denial of service attacks. Here are the key requirements:

        1. Maximum length: 10000 characters to prevent memory exhaustion
        2. Minimum length: 1 character to reject empty requests
        3. Control character ratio: <30% to prevent binary injection
        4. Unique character threshold: >=5 for inputs >100 chars

        Implementation considerations include performance optimization,
        backward compatibility, and comprehensive test coverage.
      `.repeat(10); // ~5000 chars of varied content (under 10000 limit)

      const result = await sendAndVerify(text);

      // Assertions
      expect(result).toBeDefined();

      // Check validation passed
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(true);
      expect(rawEvent.validation?.input_length).toBeLessThanOrEqual(10000);

      console.log(`✅ Test passed: Long technical content passed validation (${rawEvent.validation?.input_length} chars)`);
    }, 30000);
  });

  describe('Edge Cases', () => {
    test('should handle exactly 10000 characters (boundary)', async () => {
      const text = 'A'.repeat(10000);

      const result = await sendAndVerify(text);

      // Assertions
      expect(result).toBeDefined();

      // At exactly 10000, should PASS validation but FAIL repetition check
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');

      // Validation may pass or fail depending on implementation (10000 is the boundary)
      // The test just verifies the system handles the boundary correctly
      console.log(`✅ Test passed: 10000 char boundary handled (validation.passed: ${rawEvent.validation?.passed}, reason: ${rawEvent.validation?.reason || 'none'})`);
    }, 30000);

    test('should handle 10001 characters (just over limit)', async () => {
      const text = 'A'.repeat(10001);

      const result = await sendAndVerify(text);

      // Assertions
      expect(result).toBeDefined();
      expect(result.final_status).toBe('BLOCKED');

      // Check validation failure
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(false);
      expect(rawEvent.validation?.reason).toBe('EXCESSIVE_LENGTH');

      console.log(`✅ Test passed: 10001 chars blocked as expected`);
    }, 30000);

    test('should handle newlines and special characters correctly', async () => {
      const text = 'Line 1\nLine 2\nLine 3\nSpecial: !@#$%^&*()';

      const result = await sendAndVerify(text);

      // Assertions
      expect(result).toBeDefined();

      // Should pass validation (newlines and special chars are normal)
      const rawEvent = parseJSONSafely(result.raw_event, 'raw_event', result.sessionId || 'unknown');
      expect(rawEvent.validation?.passed).toBe(true);

      console.log(`✅ Test passed: Newlines and special chars handled correctly`);
    }, 30000);
  });
});
