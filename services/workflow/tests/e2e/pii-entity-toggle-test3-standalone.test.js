/**
 * Test Case 3: Regex Fallback Path (STANDALONE VERSION)
 *
 * This is a standalone version of Test 3 that can run independently
 * without relying on Test 1 or Test 2 setup.
 *
 * Tests that regex fallback ALSO respects GUI toggles when URL entity is disabled.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  sendAndVerify,
  setPiiConfig,
  getPiiConfig,
  loginToBackend,
  waitForPiiConfigSync
} from '../helpers/webhook.js';

describe('PII Entity Toggle - Test 3 Standalone (Regex Fallback)', () => {
  const sessionId = `test-${Date.now()}`;

  // Store original config for restoration (CRITICAL: prevents data loss!)
  let originalConfig = [];

  beforeAll(async () => {
    console.log('⏳ Setting up Test 3 standalone preconditions...');

    try {
      // CRITICAL: Capture original config BEFORE modifying
      const token = await loginToBackend();
      const { entities } = await getPiiConfig(token);
      originalConfig = [...entities]; // Deep copy
      console.log(`📸 Captured original config: ${originalConfig.length} entities`);

      // DETERMINISTIC SETUP: Set exact PII config (URL disabled)
      const testConfig = ['EMAIL_ADDRESS', 'PHONE_NUMBER', 'CREDIT_CARD']; // URL excluded
      await setPiiConfig(testConfig);
      console.log('✅ Test 3 setup: PII config set to:', testConfig.join(', '));

      // CRITICAL: Wait for config to sync across all services
      // Function throws on timeout/error, so no need to check return value
      await waitForPiiConfigSync(5000);
    } catch (error) {
      console.error(`❌ Failed to set test preconditions: ${error.message}`);
      throw new Error('Cannot set test preconditions - backend API unavailable');
    }
  }, 30000);

  afterAll(async () => {
    // Restore original config (not hardcoded defaults!)
    try {
      if (originalConfig.length > 0) {
        await setPiiConfig(originalConfig);
        await waitForPiiConfigSync(3000);
        console.log(`✅ Test cleanup: Restored original config (${originalConfig.length} entities)`);
      } else {
        console.warn('⚠️  Original config was empty - skipping restoration');
      }
    } catch (error) {
      console.error(`❌ Failed to restore PII config: ${error.message}`);
      console.error(`⚠️  IMPORTANT: User's original config was NOT restored!`);
      console.error(`   Original entities: ${originalConfig.join(', ')}`);
      console.error(
        `Manual fix: Restore entities via GUI or run: ` +
        `curl -X POST http://localhost:8787/api/pii-detection/save-config ` +
        `-H 'Authorization: Bearer TOKEN' ` +
        `-d '{"enabledEntities": ${JSON.stringify(originalConfig)}}'`
      );
    }
  }, 30000);

  /**
   * Test Case 3: Regex Fallback Path
   *
   * Current state: URL disabled in pii.conf.rules
   * We send a message with URL pattern that would be caught by regex fallback
   * Expected: URL should NOT be detected (entity disabled in GUI)
   */
  it('should respect GUI toggle in regex fallback path', async () => {
    // VERIFICATION: Ensure URL is actually disabled before running test
    console.log('⏳ Test 3: Verifying URL is disabled...');
    // Function throws on timeout/error, providing clear failure reason
    await waitForPiiConfigSync(5000);

    // Send message with URL pattern
    const testMessage = 'Check http://test-fallback.org website';
    const testSessionId = `${sessionId}-fallback`;

    const event = await sendAndVerify(testMessage, {
      sessionId: testSessionId,
      maxWaitMs: 10000
    });

    // DEBUG: Log what was detected
    console.log('DEBUG Test 3:');
    console.log('  pii_types_detected:', event.pii_types_detected);
    console.log('  after_pii_redaction:', event.after_pii_redaction);

    // Verify regex fallback did NOT detect URL (entity disabled)
    expect(event.pii_types_detected).not.toContain('URL');
    expect(event.after_pii_redaction).toContain('http://test-fallback.org');

    console.log(`✅ Regex fallback respects GUI toggle: ${event.after_pii_redaction}`);
  }, 30000);
});
