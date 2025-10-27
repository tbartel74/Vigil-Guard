/**
 * Test Template for Vigil Guard Detection Patterns
 *
 * Use this template when creating new test cases for detection patterns.
 * Follow TDD approach: Write test first, then add pattern.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { testWebhook } from '../helpers/webhook.js';
import testFixture from '../fixtures/your-fixture.json';

describe("Detection Category: YOUR_CATEGORY_NAME", () => {
  // Optional: Setup before tests
  beforeAll(() => {
    // Verify webhook is accessible
    // Verify ClickHouse is connected
  });

  /**
   * Basic detection test
   *
   * Tests that the pattern detects a straightforward attack
   */
  test("Detects basic [attack type]", async () => {
    const prompt = "malicious prompt here";
    const result = await testWebhook(prompt);

    // Assert final decision
    expect(result.status).toBe("BLOCKED");

    // Assert category detected
    expect(result.scoreBreakdown).toHaveProperty("YOUR_CATEGORY");

    // Assert score range
    expect(result.totalScore).toBeGreaterThan(85);
  });

  /**
   * Obfuscation bypass test
   *
   * Tests that pattern detects obfuscated variants
   */
  test("Detects [attack type] with obfuscation", async () => {
    const prompt = "0bfusc4t3d m4l1c10us pr0mpt";
    const result = await testWebhook(prompt);

    expect(result.status).toBe("BLOCKED");
    expect(result.scoreBreakdown).toHaveProperty("YOUR_CATEGORY");
  });

  /**
   * Encoding bypass test
   *
   * Tests detection through encoding layers
   */
  test("Detects base64-encoded [attack type]", async () => {
    const payload = Buffer.from("malicious prompt").toString("base64");
    const result = await testWebhook(payload);

    expect(result.status).toBe("BLOCKED");
    expect(result.scoreBreakdown).toHaveProperty("ENCODING_SUSPICIOUS");
    expect(result.scoreBreakdown).toHaveProperty("YOUR_CATEGORY");
  });

  /**
   * False positive prevention
   *
   * Tests that legitimate content is NOT blocked
   */
  test("Allows legitimate [content type]", async () => {
    const prompt = "legitimate question about [topic]";
    const result = await testWebhook(prompt);

    expect(result.status).toBe("ALLOWED");
    expect(result.totalScore).toBeLessThan(30);
  });

  /**
   * Fixture-based test
   *
   * Tests using structured fixture data
   */
  test("Detects attack from fixture", async () => {
    const result = await testWebhook(testFixture.prompt);

    expect(result.status).toBe(testFixture.expected_status);
    expect(result.totalScore).toBeGreaterThan(testFixture.expected_min_score);

    // Verify all expected categories detected
    testFixture.expected_categories.forEach(category => {
      expect(result.scoreBreakdown).toHaveProperty(category);
    });
  });

  /**
   * Sanitization test
   *
   * Tests that SANITIZE decisions properly clean content
   */
  test("Sanitizes [attack type] correctly", async () => {
    const prompt = "partially malicious content with attack pattern";
    const result = await testWebhook(prompt);

    expect(result.status).toMatch(/SANITIZE_(LIGHT|HEAVY)/);
    expect(result.sanitized_output).not.toContain("attack pattern");
    expect(result.totalScore).toBeGreaterThan(30);
    expect(result.totalScore).toBeLessThan(85);
  });
});

/**
 * Usage Instructions:
 *
 * 1. Copy this template to tests/e2e/your-category.test.js
 * 2. Replace YOUR_CATEGORY with actual category name
 * 3. Update test descriptions and prompts
 * 4. Create corresponding fixture in tests/fixtures/
 * 5. Run: npm test -- your-category.test.js
 * 6. Test should FAIL initially
 * 7. Add detection pattern via GUI
 * 8. Re-run test - should PASS
 * 9. Commit test and document pattern
 */
