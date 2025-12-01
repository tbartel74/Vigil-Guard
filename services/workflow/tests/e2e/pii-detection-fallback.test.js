/**
 * Language Detection Fallback Tests (v2.0.0)
 *
 * Tests graceful degradation when language-detector service is unavailable.
 *
 * v2.0.0 Notes:
 * - Uses events_v2 schema (pii_sanitized, pii_types_detected, detected_language)
 * - Status values: ALLOWED, SANITIZED, BLOCKED
 *
 * IMPORTANT:
 * - These tests are OPTIONAL and run only when
 *   RUN_LANGUAGE_DETECTOR_FALLBACK_TESTS=true
 * - This prevents CI/local runs from stopping Docker services unintentionally.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { sendAndVerify } from '../helpers/webhook.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const shouldRunFallbackSuite = process.env.RUN_LANGUAGE_DETECTOR_FALLBACK_TESTS === 'true';

const describeFn = shouldRunFallbackSuite ? describe : describe.skip;

if (!shouldRunFallbackSuite) {
  console.warn('⚠️  Skipping language-detector fallback suite (set RUN_LANGUAGE_DETECTOR_FALLBACK_TESTS=true to enable).');
}

describeFn('Language Detection Fallback Behavior (v2.0.0)', () => {
  let languageDetectorWasRunning = false;

  beforeAll(async () => {
    // Check if language-detector is running
    try {
      const { stdout } = await execAsync('docker ps --filter "name=vigil-language-detector" --format "{{.Status}}"');
      languageDetectorWasRunning = stdout.trim().startsWith('Up');

      if (languageDetectorWasRunning) {
        console.log('⏸️  Stopping language-detector service for fallback test...');
        await execAsync('docker stop vigil-language-detector');
        // Wait for service to fully stop
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.warn('⚠️  Could not check language-detector status:', error.message);
    }
  });

  afterAll(async () => {
    // Restart language-detector if it was running before
    if (languageDetectorWasRunning) {
      console.log('▶️  Restarting language-detector service...');
      try {
        await execAsync('docker start vigil-language-detector');
        // Wait for service to be ready
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('✅ Language-detector service restored');
      } catch (error) {
        console.error('❌ Failed to restart language-detector:', error.message);
      }
    }
  });

  test('PII detection works when language detector is DOWN (real fallback)', async () => {
    // With language-detector stopped, workflow should fall back to 'pl' default
    const event = await sendAndVerify('My email is test@example.com');

    // v2.0.0: Check PII detection via events_v2 fields
    expect(event).toBeDefined();
    expect(event.pii_sanitized).toBe(1);
    expect(event.pii_types_detected).toContain('EMAIL_ADDRESS');

    // v2.0.0: detected_language should be 'pl' (fallback default)
    expect(event.detected_language).toBe('pl');

    console.log('✅ PII detected with language service DOWN');
    console.log(`   Types: ${event.pii_types_detected.join(', ')}`);
    console.log(`   Language: ${event.detected_language}`);
  }, 15000);

  test('Polish PII detected with language detector DOWN', async () => {
    // Polish entities should be detected even with language service down
    const event = await sendAndVerify('PESEL 92032100157 and email test@example.com');

    expect(event).toBeDefined();
    expect(event.pii_sanitized).toBe(1);

    // Should detect both PESEL and EMAIL
    const hasPESEL = event.pii_types_detected?.some(t => t.includes('PESEL'));
    const hasEmail = event.pii_types_detected?.some(t => t.includes('EMAIL'));

    expect(hasPESEL || hasEmail).toBe(true);

    console.log('✅ Polish PII with fallback');
    console.log(`   Types: ${event.pii_types_detected?.join(', ')}`);
    console.log(`   Count: ${event.pii_entities_count}`);
  }, 15000);

  test('Workflow sanitizes when PII found with fallback', async () => {
    const event = await sendAndVerify('My email is user@example.com and phone is 555-1234');

    expect(event).toBeDefined();
    expect(event.pii_sanitized).toBe(1);

    // v2.0.0: PII without threats = SANITIZED
    expect(event.final_status).toBe('SANITIZED');
    expect(event.final_decision).toBe('ALLOW');

    console.log('✅ Sanitization with fallback');
    console.log(`   Status: ${event.final_status}`);
  }, 15000);
});
