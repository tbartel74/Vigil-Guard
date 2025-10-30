import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sendToWorkflow, waitForClickHouseEvent, parseJSONSafely } from '../helpers/webhook.js';

/**
 * PII Detection - Fallback to Regex Rules
 *
 * Prerequisites:
 * - Presidio PII API service stopped or unreachable
 * - fallback_to_regex=true in unified_config.json
 * - Legacy regex rules available (13 patterns)
 *
 * Test coverage:
 * - Automatic fallback when Presidio offline
 * - Regex pattern detection (PESEL, NIP, EMAIL, PHONE, etc.)
 * - ClickHouse logging (detection_method='regex_fallback')
 *
 * IMPORTANT: These tests assume Presidio is offline or unavailable.
 * If Presidio is healthy, tests will skip or verify graceful degradation.
 */

describe('PII Detection - Fallback to Regex Rules', () => {
  let presidioOnline = false;

  beforeAll(async () => {
    // Check if Presidio is offline (expected for fallback tests)
    try {
      const response = await fetch('http://localhost:5001/health', {
        signal: AbortSignal.timeout(2000)
      });

      if (response.ok) {
        const data = await response.json();
        presidioOnline = (data.status === 'healthy');

        if (presidioOnline) {
          console.warn('⚠️  Presidio service is ONLINE. Fallback tests may not trigger.');
          console.warn('⚠️  To test fallback, stop Presidio: docker stop vigil-presidio-pii');
        }
      }
    } catch (error) {
      console.log('✓ Presidio service is offline (expected for fallback tests)');
      presidioOnline = false;
    }
  }, 10000);

  it('should use regex fallback when Presidio offline', async () => {
    const prompt = 'Contact: admin@example.com, PESEL: 92032100157';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    expect(event).toBeDefined();

    const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
    expect(sanitized.pii).toBeDefined();

    if (!presidioOnline) {
      // Fallback mode should be active
      expect(sanitized.pii.detection_method).toBe('regex_fallback');
    }

    // PII should still be redacted (via regex rules)
    expect(response.chatInput).toContain('[EMAIL]');
    expect(response.chatInput).toContain('[PESEL]');
  }, 10000);

  it('should detect PESEL via regex pattern', async () => {
    const prompt = 'PESEL: 92032100157';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    // Regex should detect PESEL format (11 digits)
    expect(response.chatInput).toContain('[PESEL]');
    expect(response.chatInput).not.toContain('92032100157');
  }, 10000);

  it('should detect NIP via regex pattern', async () => {
    const prompt = 'NIP: 123-456-32-18';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    // Regex should detect NIP format (XXX-XXX-XX-XX)
    expect(response.chatInput).toContain('[NIP]');
    expect(response.chatInput).not.toContain('123-456-32-18');
  }, 10000);

  it('should detect email via regex pattern', async () => {
    const prompt = 'Email: user@domain.com';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    // Regex should detect email format
    expect(response.chatInput).toContain('[EMAIL]');
    expect(response.chatInput).not.toContain('@domain.com');
  }, 10000);

  it('should detect phone via regex pattern', async () => {
    const prompt = 'Phone: +48 123 456 789';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    // Regex should detect international phone format
    expect(response.chatInput).toContain('[PHONE]');
  }, 10000);

  it('should detect credit card via regex pattern', async () => {
    const prompt = 'Card: 4532-1234-5678-9010';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    // Regex should detect card format (XXXX-XXXX-XXXX-XXXX)
    expect(response.chatInput).toContain('[CARD]');
    expect(response.chatInput).not.toContain('4532-1234-5678-9010');
  }, 10000);

  it('should detect REGON via regex pattern', async () => {
    const prompt = 'REGON: 123-456-789';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    // Regex should detect REGON format (XXX-XXX-XXX)
    expect(response.chatInput).toContain('[REGON]');
  }, 10000);

  it('should handle multiple PII types with regex fallback', async () => {
    const prompt = 'User data: PESEL 92032100157, NIP 123-456-32-18, email user@test.com';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    expect(event).toBeDefined();

    const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);

    if (!presidioOnline) {
      expect(sanitized.pii.detection_method).toBe('regex_fallback');
      expect(sanitized.pii.entities_detected).toBeGreaterThanOrEqual(3);
    }

    // All PII should be redacted
    expect(response.chatInput).toContain('[PESEL]');
    expect(response.chatInput).toContain('[NIP]');
    expect(response.chatInput).toContain('[EMAIL]');
  }, 10000);

  it('should log fallback method in ClickHouse', async () => {
    const prompt = 'Test fallback logging: admin@test.com';
    const response = await sendToWorkflow(prompt);

    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    expect(event).toBeDefined();

    const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
    expect(sanitized.pii).toBeDefined();

    if (!presidioOnline) {
      expect(sanitized.pii.detection_method).toBe('regex_fallback');
      expect(sanitized.pii.fallback_reason).toBeDefined();
    }
  }, 10000);

  it('should have acceptable performance with regex fallback', async () => {
    const prompt = 'Performance test: user@example.com, +48 123 456 789';
    const start = Date.now();

    const response = await sendToWorkflow(prompt);
    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    const latency = Date.now() - start;

    // Regex should be fast (<50ms typically)
    console.log(`Regex fallback e2e latency: ${latency}ms`);

    expect(event).toBeDefined();
    expect(latency).toBeLessThan(2000); // Reasonable e2e threshold
  }, 10000);

  it('should NOT detect person names with regex fallback', async () => {
    const prompt = 'Spotkanie z Jan Kowalski i Anna Nowak';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);

    // Regex fallback does NOT have NLP-based PERSON detection
    // This is expected limitation of regex mode
    expect(response.chatInput).not.toContain('[PERSON]');
    expect(response.chatInput).toContain('Jan Kowalski');
  }, 10000);

  it('should switch back to Presidio when service recovers', async () => {
    // This test verifies graceful recovery (manual test)
    // If Presidio comes back online, next request should use it

    const prompt = 'Recovery test: admin@test.com';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);

    if (presidioOnline) {
      // If Presidio is back online, should use it
      expect(sanitized.pii.detection_method).toBe('presidio');
    } else {
      // Still in fallback
      expect(sanitized.pii.detection_method).toBe('regex_fallback');
    }
  }, 10000);
});
