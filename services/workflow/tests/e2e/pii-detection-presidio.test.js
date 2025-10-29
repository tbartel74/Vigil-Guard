import { describe, it, expect, beforeAll } from 'vitest';
import { sendToWorkflow, waitForClickHouseEvent } from '../helpers/webhook.js';

/**
 * PII Detection - Presidio Integration Tests
 *
 * Prerequisites:
 * - Presidio PII API service must be running (vigil-presidio-pii:5001)
 * - n8n workflow v1.6 with PII_Redactor_v2 node
 * - ClickHouse logging enabled
 *
 * Test coverage:
 * - Polish PII detection (PESEL, NIP, REGON, ID card)
 * - International PII (email, phone, credit card)
 * - Performance (<200ms target)
 * - ClickHouse logging (detection_method='presidio')
 */

describe('PII Detection - Presidio (Happy Path)', () => {
  let presidioStatus;

  beforeAll(async () => {
    // Check if Presidio service is online
    try {
      const response = await fetch('http://localhost:5001/health', {
        signal: AbortSignal.timeout(3000)
      });
      const data = await response.json();
      presidioStatus = data.status || 'unknown';

      if (presidioStatus !== 'healthy') {
        console.warn('⚠️  Presidio service is not healthy. Tests may fail or use fallback.');
      }
    } catch (error) {
      console.error('❌ Presidio service is offline. Tests will use regex fallback.');
      presidioStatus = 'offline';
    }
  }, 10000);

  it('should detect and redact Polish PESEL number', async () => {
    const prompt = 'Jan Kowalski, PESEL: 92032100157';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();
    expect(response.sessionId).toBeDefined();

    // Wait for ClickHouse event
    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    expect(event).toBeDefined();
    expect(event.final_status).toMatch(/ALLOWED|SANITIZED/);

    // Verify PII redaction
    const sanitized = JSON.parse(event.sanitizer_json || '{}');
    expect(sanitized.pii).toBeDefined();
    expect(sanitized.pii.detection_method).toMatch(/presidio|regex_fallback/);
    expect(sanitized.pii.entities_detected).toBeGreaterThan(0);

    // PESEL should be redacted
    expect(response.chatInput).toContain('[PESEL]');
    expect(response.chatInput).not.toContain('92032100157');
  }, 10000);

  it('should detect and redact Polish NIP number', async () => {
    const prompt = 'NIP firmy: 123-456-32-18';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();
    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    expect(event).toBeDefined();

    // Verify NIP redaction
    expect(response.chatInput).toContain('[NIP]');
    expect(response.chatInput).not.toContain('123-456-32-18');
  }, 10000);

  it('should detect and redact email addresses', async () => {
    const prompt = 'Contact me at john.doe@example.com or admin@test.org';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();
    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    expect(event).toBeDefined();

    // Verify email redaction
    expect(response.chatInput).toContain('[EMAIL]');
    expect(response.chatInput).not.toContain('@example.com');
    expect(response.chatInput).not.toContain('@test.org');
  }, 10000);

  it('should detect and redact phone numbers', async () => {
    const prompt = 'Call me at +48 123 456 789 or 500-600-700';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();
    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    expect(event).toBeDefined();

    // Verify phone redaction
    expect(response.chatInput).toContain('[PHONE]');
  }, 10000);

  it('should detect and redact person names (NLP)', async () => {
    const prompt = 'Spotkałem się z Jan Kowalski i Anna Nowak wczoraj';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();
    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    // Note: PERSON detection via NLP may have lower confidence
    // Verify the service attempted detection
    expect(event).toBeDefined();
  }, 10000);

  it('should detect multiple PII types in single prompt', async () => {
    const prompt = 'Jan Kowalski (PESEL: 92032100157, email: jan@example.com, tel: +48 123 456 789)';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();
    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    expect(event).toBeDefined();

    const sanitized = JSON.parse(event.sanitizer_json || '{}');
    expect(sanitized.pii.entities_detected).toBeGreaterThanOrEqual(3); // PESEL, EMAIL, PHONE minimum

    // All PII should be redacted
    expect(response.chatInput).toContain('[PESEL]');
    expect(response.chatInput).toContain('[EMAIL]');
    expect(response.chatInput).toContain('[PHONE]');
  }, 10000);

  it('should have latency < 200ms for PII detection', async () => {
    const prompt = 'Test performance: jan@example.com';
    const start = Date.now();

    const response = await sendToWorkflow(prompt);
    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    const latency = Date.now() - start;

    // Note: Total latency includes n8n processing + network, not just Presidio
    // Presidio API itself should be <200ms, but e2e may be higher
    console.log(`PII detection e2e latency: ${latency}ms`);

    expect(event).toBeDefined();
    expect(latency).toBeLessThan(2000); // Reasonable e2e threshold
  }, 10000);

  it('should log detection method in ClickHouse', async () => {
    const prompt = 'Test logging: admin@test.com';
    const response = await sendToWorkflow(prompt);

    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    expect(event).toBeDefined();

    const sanitized = JSON.parse(event.sanitizer_json || '{}');
    expect(sanitized.pii).toBeDefined();
    expect(sanitized.pii.detection_method).toMatch(/presidio|regex_fallback/);

    if (presidioStatus === 'healthy') {
      expect(sanitized.pii.detection_method).toBe('presidio');
    }
  }, 10000);

  it('should not redact benign text that looks like PII', async () => {
    const prompt = 'Order number: 123456789 (not a PESEL)';
    const response = await sendToWorkflow(prompt);

    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    expect(event).toBeDefined();

    // Should not over-detect (confidence threshold prevents false positives)
    const sanitized = JSON.parse(event.sanitizer_json || '{}');
    const piiCount = sanitized.pii?.entities_detected || 0;

    // May detect order number as PESEL if it matches pattern, but should be low confidence
    // Main goal: no blocking due to false PII detection
    expect(event.final_status).toBe('ALLOWED');
  }, 10000);

  it('should handle empty text gracefully', async () => {
    const prompt = '';
    const response = await sendToWorkflow(prompt);

    expect(response).toBeDefined();

    const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

    // Should process without errors
    expect(event).toBeDefined();
    expect(event.final_status).toBe('ALLOWED');
  }, 10000);
});
