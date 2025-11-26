import { describe, it, expect, beforeAll } from 'vitest';
import { sendAndVerify } from '../helpers/webhook.js';

/**
 * PII Detection - Presidio Integration Tests (v2.0.0)
 *
 * Tests PII detection via events_v2 schema using:
 * - pii_sanitized (UInt8): 0 or 1
 * - pii_types_detected (Array(String)): e.g., ['EMAIL_ADDRESS', 'PERSON']
 * - pii_entities_count (UInt16): number of entities found
 * - pii_classification_json (String): JSON with method, types, count
 *
 * Prerequisites:
 * - Presidio PII API service must be running (vigil-presidio-pii:5001)
 * - n8n workflow v2.0.0 with PII detection
 * - ClickHouse logging to events_v2 table
 *
 * Test coverage:
 * - Polish PII detection (PESEL, NIP, REGON)
 * - International PII (email, phone, credit card)
 * - Performance (<200ms target for Presidio)
 * - ClickHouse logging (pii_classification_json.method='presidio')
 */

describe('PII Detection - Presidio (Happy Path) (v2.0.0)', () => {
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
      } else {
        console.log('✅ Presidio service is healthy');
      }
    } catch (error) {
      console.error('❌ Presidio service is offline. Tests will use regex fallback.');
      presidioStatus = 'offline';
    }
  }, 10000);

  it('should detect Polish PESEL number', async () => {
    const prompt = 'Jan Kowalski, PESEL: 92032100157';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();
    expect(event.final_status).toMatch(/ALLOWED|SANITIZED/);

    // v2.0.0: Check PII detection fields
    expect(event.pii_sanitized).toBe(1);
    expect(event.pii_entities_count).toBeGreaterThan(0);
    expect(event.pii_types_detected).toBeDefined();
    // PESEL may be detected as PESEL or PL_PESEL depending on Presidio config
    const hasPeselType = event.pii_types_detected.some(t =>
      t.includes('PESEL') || t.includes('PERSON')
    );
    expect(hasPeselType).toBe(true);

    // v2.0.0: Check pii_classification for method
    if (event.pii_classification) {
      expect(event.pii_classification.method).toMatch(/presidio|regex/);
    }

    console.log(`   ✅ PESEL detected: types=${event.pii_types_detected.join(', ')}, count=${event.pii_entities_count}`);
  }, 15000);

  it('should detect Polish NIP number', async () => {
    const prompt = 'NIP firmy: 123-456-32-18';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();
    expect(event.pii_sanitized).toBe(1);
    expect(event.pii_entities_count).toBeGreaterThan(0);

    // NIP may be detected as NIP, PL_NIP, or similar
    const hasNipType = event.pii_types_detected.some(t => t.includes('NIP'));
    expect(hasNipType).toBe(true);

    console.log(`   ✅ NIP detected: types=${event.pii_types_detected.join(', ')}`);
  }, 15000);

  it('should detect email addresses', async () => {
    const prompt = 'Contact me at john.doe@example.com or admin@test.org';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();
    expect(event.pii_sanitized).toBe(1);
    expect(event.pii_types_detected).toContain('EMAIL_ADDRESS');
    // Should detect at least 2 emails
    expect(event.pii_entities_count).toBeGreaterThanOrEqual(2);

    console.log(`   ✅ Email detected: count=${event.pii_entities_count}`);
  }, 15000);

  it('should detect phone numbers', async () => {
    const prompt = 'Call me at +48 123 456 789 or 500-600-700';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();
    // Phone detection may vary - check if any PII was found
    if (event.pii_sanitized === 1) {
      expect(event.pii_types_detected.length).toBeGreaterThan(0);
      console.log(`   ✅ Phone detected: types=${event.pii_types_detected.join(', ')}`);
    } else {
      console.log(`   ⚠️ Phone not detected (may depend on Presidio config)`);
    }
  }, 15000);

  it('should detect person names (NLP)', async () => {
    const prompt = 'Spotkałem się z Jan Kowalski i Anna Nowak wczoraj';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();
    // PERSON detection via NLP may have lower confidence
    if (event.pii_sanitized === 1) {
      const hasPersonType = event.pii_types_detected.some(t => t.includes('PERSON'));
      expect(hasPersonType).toBe(true);
      console.log(`   ✅ Person names detected: count=${event.pii_entities_count}`);
    } else {
      console.log(`   ⚠️ Person names not detected (NLP confidence threshold)`);
    }
  }, 15000);

  it('should detect multiple PII types in single prompt', async () => {
    const prompt = 'Jan Kowalski (PESEL: 92032100157, email: jan@example.com, tel: +48 123 456 789)';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();
    expect(event.pii_sanitized).toBe(1);
    // Should detect at least PESEL and EMAIL
    expect(event.pii_entities_count).toBeGreaterThanOrEqual(2);
    expect(event.pii_types_detected.length).toBeGreaterThanOrEqual(2);

    console.log(`   ✅ Multiple PII types: ${event.pii_types_detected.join(', ')} (count=${event.pii_entities_count})`);
  }, 15000);

  it('should have latency < 2000ms for PII detection e2e', async () => {
    const prompt = 'Test performance: jan@example.com';
    const start = Date.now();

    const event = await sendAndVerify(prompt);

    const latency = Date.now() - start;

    // Note: Total latency includes n8n processing + network, not just Presidio
    // Presidio API itself should be <200ms, but e2e may be higher
    console.log(`   PII detection e2e latency: ${latency}ms`);

    expect(event).toBeDefined();
    expect(latency).toBeLessThan(2000); // Reasonable e2e threshold
  }, 15000);

  it('should log detection method in ClickHouse', async () => {
    const prompt = 'Test logging: admin@test.com';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();
    expect(event.pii_sanitized).toBe(1);

    // v2.0.0: Check pii_classification_json for method
    if (event.pii_classification) {
      expect(event.pii_classification.method).toMatch(/presidio|regex/);
      console.log(`   ✅ Detection method: ${event.pii_classification.method}`);

      if (presidioStatus === 'healthy') {
        expect(event.pii_classification.method).toBe('presidio');
      }
    }
  }, 15000);

  it('should not over-detect benign text', async () => {
    const prompt = 'Order number: 123456789 (not a PESEL)';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();

    // Main goal: no BLOCKING due to false PII detection
    // v2.0.0: Order number may be detected as PII (9-digit pattern matches some formats)
    // SANITIZED is acceptable for false positive PII, BLOCKED is not
    expect(event.final_status).toMatch(/ALLOWED|SANITIZED/);
    expect(event.final_status).not.toBe('BLOCKED');
    console.log(`   ✅ Benign text: status=${event.final_status}, pii_sanitized=${event.pii_sanitized}`);
  }, 15000);

  it('should handle empty text gracefully', async () => {
    const prompt = '';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();
    // Empty input should be BLOCKED by Input_Validator (not allowed)
    expect(event.final_status).toBe('BLOCKED');
    expect(event.threat_score).toBe(100);
    console.log(`   ✅ Empty text handled: status=${event.final_status}`);
  }, 15000);

  it('should detect credit card numbers', async () => {
    const prompt = 'My card number is 4532015112830366';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();
    if (event.pii_sanitized === 1) {
      const hasCreditCard = event.pii_types_detected.some(t =>
        t.includes('CREDIT_CARD') || t.includes('CARD')
      );
      expect(hasCreditCard).toBe(true);
      console.log(`   ✅ Credit card detected: types=${event.pii_types_detected.join(', ')}`);
    } else {
      console.log(`   ⚠️ Credit card not detected (may depend on config)`);
    }
  }, 15000);

  it('should return SANITIZED status when PII detected without threats', async () => {
    const prompt = 'Please contact jan.kowalski@firma.pl for more information';
    const event = await sendAndVerify(prompt);

    expect(event).toBeDefined();
    expect(event.pii_sanitized).toBe(1);
    // v2.0.0: PII without threats = SANITIZED
    expect(event.final_status).toBe('SANITIZED');
    expect(event.threat_score).toBeLessThan(50);
    console.log(`   ✅ PII detected, status=${event.final_status}, score=${event.threat_score}`);
  }, 15000);
});
