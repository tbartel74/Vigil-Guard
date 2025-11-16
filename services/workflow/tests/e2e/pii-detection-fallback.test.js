/**
 * Language Detection Fallback Tests (v1.8.1)
 *
 * Tests graceful degradation when language-detector service is unavailable.
 *
 * IMPORTANT: These tests verify REAL fallback behavior by:
 * 1. Stopping the language-detector service
 * 2. Verifying PII detection continues working
 * 3. Restarting the service after tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { testWebhook } from '../helpers/webhook.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Language Detection Fallback Behavior', () => {
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
    const prompt = 'My email is test@example.com';
    const result = await testWebhook(prompt);

    // PII detection should still work via fallback
    expect(result.pii).toBeDefined();
    expect(result.pii.has).toBe(true);

    // Language should be 'pl' (fallback default)
    expect(result.pii.language_stats.detected_language).toBe('pl');
    expect(result.pii.language_stats.detection_method).toBe('fallback_on_error');

    const entities = result.pii.entities || [];
    const hasEmail = entities.some(e => e.entity_type === 'EMAIL_ADDRESS' || e.entity_type === 'EMAIL');
    expect(hasEmail).toBe(true);

    console.log('✅ PII detected with language service DOWN:', entities.length, 'entities');
    console.log('   Fallback method:', result.pii.language_stats.detection_method);
  }, 15000); // Increased timeout for Docker operations

  test('Polish PII detected with language detector DOWN', async () => {
    // Polish entities should be detected even with language service down
    const prompt = 'PESEL 92032100157 and email test@example.com';
    const result = await testWebhook(prompt);

    expect(result.pii.has).toBe(true);

    const entities = result.pii.entities || [];
    const hasPESEL = entities.some(e => e.entity_type === 'PESEL' || e.entity_type === 'PL_PESEL');
    const hasEmail = entities.some(e => e.entity_type === 'EMAIL_ADDRESS' || e.entity_type === 'EMAIL');

    expect(hasPESEL).toBe(true);
    expect(hasEmail).toBe(true);

    console.log('✅ Polish PII with fallback:', entities.length, 'entities');
  }, 15000);

  test('Workflow sanitizes when PII found with fallback', async () => {
    const prompt = 'My email is user@example.com and phone is 555-1234';
    const result = await testWebhook(prompt);

    expect(result.pii.has).toBe(true);
    expect(['SANITIZE_LIGHT', 'SANITIZE_HEAVY', 'SANITIZED']).toContain(result.status);

    console.log('✅ Sanitization with fallback:', result.status);
  }, 15000);
});
