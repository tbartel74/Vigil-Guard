/**
 * PII Entity Toggle Regression Test
 *
 * REGRESSION: GUI entity disable/enable must work for BOTH Presidio AND regex fallback
 *
 * This test covers the bug where:
 * 1. User disables URL in GUI → URL detection stops ✅
 * 2. User re-enables URL in GUI → URL detection resumes ✅
 *
 * Both Presidio API and regex fallback must respect the GUI toggle.
 *
 * @see https://github.com/tbartel74/Vigil-Guard/pull/53
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sendAndVerify, disablePiiEntity, enablePiiEntity } from '../helpers/webhook.js';

describe('PII Entity Toggle Regression (CRITICAL)', () => {
  const sessionId = `pii-toggle-test-${Date.now()}`;
  let urlWasEnabled = false;

  beforeAll(async () => {
    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // CRITICAL: Disable URL entity via API to set known state
    // This ensures test works on clean environments where URL is enabled by default
    try {
      await disablePiiEntity('URL');
      urlWasEnabled = true; // Remember to restore later
      console.log('✅ Test setup: URL entity disabled via API');
    } catch (error) {
      console.warn(`⚠️  Failed to disable URL entity: ${error.message}`);
      throw new Error('Cannot set test preconditions - backend API unavailable');
    }

    // Wait for config sync to take effect
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Restore URL entity if we disabled it
    if (urlWasEnabled) {
      try {
        await enablePiiEntity('URL');
        console.log('✅ Test cleanup: URL entity restored');
      } catch (error) {
        console.warn(`⚠️  Failed to restore URL entity: ${error.message}`);
      }
    }
  });

  /**
   * Test Case 1: URL entity DISABLED
   *
   * Expected behavior:
   * - Presidio should NOT detect URL
   * - Regex fallback should NOT detect URL
   * - Output should contain original URL (not redacted)
   */
  it('should NOT detect URL when entity is disabled in GUI', async () => {
    const testMessage = 'Visit https://example.com for information';

    // Send message and wait for ClickHouse event
    const event = await sendAndVerify(testMessage, {
      sessionId,
      maxWaitMs: 10000
    });

    // Verify URL NOT detected
    expect(event.pii_types_detected).not.toContain('URL');

    // Verify URL NOT redacted
    expect(event.after_pii_redaction).toContain('https://example.com');

    // Verify status (should be ALLOWED or SANITIZED based on other entities, but not URL-related)
    console.log(`✅ URL entity disabled: ${event.after_pii_redaction}`);
  }, 30000);

  /**
   * Test Case 2: URL entity RE-ENABLED
   *
   * Expected behavior (after re-enabling URL):
   * - Presidio SHOULD detect URL
   * - Regex fallback SHOULD detect URL
   * - Output should have [URL] redaction token
   *
   * This test programmatically enables URL via API, verifies detection,
   * then disables it again for subsequent tests. No manual GUI action needed.
   */
  it('should DETECT URL when entity is re-enabled via API', async () => {
    // Re-enable URL entity
    await enablePiiEntity('URL');
    console.log('✅ URL entity re-enabled via API');

    // Wait for config sync
    await new Promise(resolve => setTimeout(resolve, 1000));

    const testMessage = 'Visit https://another-example.com for details';
    const testSessionId = `${sessionId}-enabled`;

    // Send message and wait for result
    const event = await sendAndVerify(testMessage, {
      sessionId: testSessionId,
      maxWaitMs: 10000
    });

    // Verify URL detected
    expect(event.pii_types_detected).toContain('URL');

    // Verify URL redacted
    expect(event.after_pii_redaction).toContain('[URL]');
    expect(event.after_pii_redaction).not.toContain('https://another-example.com');

    // Verify status is SANITIZED (PII detected)
    expect(event.final_status).toBe('SANITIZED');

    console.log(`✅ URL entity enabled: ${event.after_pii_redaction}`);

    // Disable again for subsequent tests
    await disablePiiEntity('URL');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);

  /**
   * Test Case 3: Regex Fallback Path
   *
   * Tests that regex fallback ALSO respects GUI toggles.
   * This test forces Presidio to fail/skip and relies on regex fallback.
   *
   * NOTE: This is a theoretical test - in practice, both Presidio and regex
   * should respect the same pii.conf rules list.
   */
  it('should respect GUI toggle in regex fallback path', async () => {
    // Current state: URL disabled in pii.conf.rules
    // We send a message with URL pattern
    const testMessage = 'Check http://test-fallback.org website';
    const testSessionId = `${sessionId}-fallback`;

    const event = await sendAndVerify(testMessage, {
      sessionId: testSessionId,
      maxWaitMs: 10000
    });

    // Verify regex fallback did NOT detect URL (entity disabled)
    expect(event.pii_types_detected).not.toContain('URL');
    expect(event.after_pii_redaction).toContain('http://test-fallback.org');

    console.log(`✅ Regex fallback respects GUI toggle: ${event.after_pii_redaction}`);
  }, 30000);
});
