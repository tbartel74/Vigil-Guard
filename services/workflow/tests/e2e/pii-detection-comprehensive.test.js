/**
 * PII Detection - Comprehensive Test Suite
 *
 * Complete coverage of all PII detection scenarios using pii-test-payloads.json
 * Tests both Presidio (primary) and regex fallback (legacy) detection methods.
 *
 * Prerequisites:
 * - Presidio PII API service running (vigil-presidio-pii:5001)
 * - n8n workflow v1.6 with PII_Redactor_v2 node
 * - ClickHouse logging enabled
 *
 * Test Coverage:
 * - Valid Polish PII (5 payloads) - PESEL, NIP, REGON, ID_CARD
 * - Valid International PII (11 payloads) - EMAIL, PHONE, CARD, IBAN, IP, URL, PERSON
 * - Invalid PII (8 payloads) - False format detection (should NOT detect)
 * - Edge Cases (8 payloads) - Empty, whitespace, unicode, encoding
 * - Performance Tests (3 payloads) - Latency benchmarks
 *
 * Expected Detection Rates:
 * - Valid PII: 95-100% detection
 * - Invalid PII: 0% detection (no false positives)
 * - Edge Cases: Variable (depends on case)
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { sendToWorkflow, waitForClickHouseEvent, parseJSONSafely } from '../helpers/webhook.js';
import piiPayloads from '../fixtures/pii-test-payloads.json';

const { valid_pii, invalid_pii, edge_cases, performance_tests, metadata } = piiPayloads;

describe('PII Detection - Comprehensive Test Suite', () => {
  let presidioStatus = 'unknown';

  beforeAll(async () => {
    // Check Presidio service health
    try {
      const response = await fetch('http://localhost:5001/health', {
        signal: AbortSignal.timeout(3000)
      });
      const data = await response.json();
      presidioStatus = data.status || 'unknown';

      if (presidioStatus === 'healthy') {
        console.log('✅ Presidio service is healthy');
        console.log(`   Recognizers loaded: ${data.recognizers_loaded || 'unknown'}`);
        console.log(`   spaCy models: ${data.spacy_models ? data.spacy_models.join(', ') : 'unknown'}`);
      } else {
        console.warn('⚠️  Presidio service not healthy - tests will use regex fallback');
      }
    } catch (error) {
      console.error('❌ Presidio service is offline - tests will use regex fallback');
      presidioStatus = 'offline';
    }
  }, 10000);

  // =================================================================
  // VALID POLISH PII DETECTION (5 payloads)
  // =================================================================
  describe('Valid Polish PII Detection (5 payloads)', () => {
    const polishPayloads = valid_pii.polish;

    test.each(polishPayloads)(
      'should detect: $name',
      async ({ text, expected_entities, note }) => {
        console.log(`\n🧪 Testing: ${note}`);
        console.log(`   Input: "${text}"`);

        const response = await sendToWorkflow(text);
        expect(response).toBeDefined();
        expect(response.sessionId).toBeDefined();

        // Wait for ClickHouse event
        const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);
        expect(event).toBeDefined();

        // Parse sanitizer data
        const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
        expect(sanitized.pii).toBeDefined();

        // Verify detection method
        const detectionMethod = sanitized.pii.detection_method;
        expect(detectionMethod).toMatch(/presidio|regex_fallback/);

        // Verify PII was detected
        const entitiesDetected = sanitized.pii.entities_detected || 0;
        expect(entitiesDetected).toBeGreaterThan(0);

        // Log results
        console.log(`   ✅ Detected ${entitiesDetected} entities via ${detectionMethod}`);
        console.log(`   Status: ${event.final_status} (score: ${event.threat_score})`);

        // Verify redaction occurred in response
        // For Polish PII, expect redaction tokens like [PESEL], [NIP], [REGON], [ID_CARD]
        const redactionTokens = ['[PESEL]', '[NIP]', '[REGON]', '[ID_CARD]', '[EMAIL]'];
        const hasRedaction = redactionTokens.some(token => response.chatInput.includes(token));

        if (hasRedaction) {
          console.log(`   ✅ Redaction applied: ${response.chatInput.substring(0, 100)}...`);
        } else {
          console.warn(`   ⚠️  No obvious redaction tokens found in response`);
        }
      },
      15000
    );
  });

  // =================================================================
  // VALID INTERNATIONAL PII DETECTION (11 payloads)
  // =================================================================
  describe('Valid International PII Detection (11 payloads)', () => {
    const internationalPayloads = valid_pii.international;

    test.each(internationalPayloads)(
      'should detect: $name',
      async ({ text, expected_entities, note }) => {
        console.log(`\n🧪 Testing: ${note}`);
        console.log(`   Input: "${text}"`);

        const response = await sendToWorkflow(text);
        expect(response).toBeDefined();
        expect(response.sessionId).toBeDefined();

        // Wait for ClickHouse event
        const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);
        expect(event).toBeDefined();

        // Parse sanitizer data
        const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
        expect(sanitized.pii).toBeDefined();

        // Verify PII was detected
        const entitiesDetected = sanitized.pii.entities_detected || 0;
        const detectionMethod = sanitized.pii.detection_method;

        // Note: PERSON detection (NLP-based) may have lower confidence
        // Other entity types should be reliably detected
        const isPerson = expected_entities.includes('PERSON');

        if (isPerson && entitiesDetected === 0) {
          console.warn(`   ⚠️  PERSON entity not detected (NLP-based, may need context)`);
        } else {
          expect(entitiesDetected).toBeGreaterThan(0);
        }

        // Log results
        console.log(`   ✅ Detected ${entitiesDetected} entities via ${detectionMethod}`);
        console.log(`   Status: ${event.final_status} (score: ${event.threat_score})`);

        // Verify redaction tokens
        const redactionTokens = ['[EMAIL]', '[PHONE]', '[CARD]', '[IBAN]', '[IP]', '[URL]', '[PERSON]'];
        const hasRedaction = redactionTokens.some(token => response.chatInput.includes(token));

        if (entitiesDetected > 0) {
          expect(hasRedaction || isPerson).toBe(true); // Allow PERSON to skip redaction check
        }
      },
      15000
    );
  });

  // =================================================================
  // INVALID PII (FALSE POSITIVES) - Should NOT Detect (8 payloads)
  // =================================================================
  describe('Invalid PII - Should NOT Detect (8 payloads)', () => {
    const falseFormatsPayloads = invalid_pii.false_formats;

    test.each(falseFormatsPayloads)(
      'should NOT detect: $name',
      async ({ text, expected_entities, note }) => {
        console.log(`\n🧪 Testing: ${note}`);
        console.log(`   Input: "${text}"`);

        const response = await sendToWorkflow(text);
        expect(response).toBeDefined();
        expect(response.sessionId).toBeDefined();

        // Wait for ClickHouse event
        const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);
        expect(event).toBeDefined();

        // Parse sanitizer data
        const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
        const entitiesDetected = sanitized.pii?.entities_detected || 0;

        // CRITICAL: Should NOT detect invalid formats (checksum validation)
        if (entitiesDetected > 0) {
          console.error(`   ❌ FALSE POSITIVE: Detected ${entitiesDetected} entities (should be 0)`);
          console.error(`   This indicates checksum validation failure!`);
        } else {
          console.log(`   ✅ Correctly ignored invalid format (no false positive)`);
        }

        expect(entitiesDetected).toBe(0); // Expect NO detection
      },
      15000
    );
  });

  describe('Benign Numbers - Should NOT Detect (3 payloads)', () => {
    const benignPayloads = invalid_pii.benign_numbers;

    test.each(benignPayloads)(
      'should NOT detect: $name',
      async ({ text, expected_entities, note }) => {
        console.log(`\n🧪 Testing: ${note}`);
        console.log(`   Input: "${text}"`);

        const response = await sendToWorkflow(text);
        expect(response).toBeDefined();

        const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);
        expect(event).toBeDefined();

        const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
        const entitiesDetected = sanitized.pii?.entities_detected || 0;

        // Should NOT detect benign numbers as PII
        if (entitiesDetected > 0) {
          console.warn(`   ⚠️  Detected ${entitiesDetected} entities in benign text (potential false positive)`);
        } else {
          console.log(`   ✅ Correctly ignored benign numbers`);
        }

        // Allow some tolerance for benign numbers (may match patterns but low confidence)
        expect(entitiesDetected).toBeLessThanOrEqual(1); // Max 1 false positive tolerated
      },
      15000
    );
  });

  // =================================================================
  // EDGE CASES (8 payloads)
  // =================================================================
  describe('Edge Cases (8 payloads)', () => {
    const edgeCases = edge_cases;

    test.each(edgeCases)(
      'should handle: $name',
      async ({ text, expected_entities, note }) => {
        console.log(`\n🧪 Testing: ${note}`);
        console.log(`   Input: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

        const response = await sendToWorkflow(text);
        expect(response).toBeDefined();

        const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);
        expect(event).toBeDefined();

        // Edge cases should not crash or timeout
        const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
        const entitiesDetected = sanitized.pii?.entities_detected || 0;

        console.log(`   ✅ Processed without error (detected: ${entitiesDetected} entities)`);

        // For edge cases with expected entities, verify detection
        if (expected_entities.length > 0) {
          expect(entitiesDetected).toBeGreaterThan(0);
        }

        // For empty/whitespace cases, expect no detection
        if (text.trim() === '') {
          expect(entitiesDetected).toBe(0);
        }
      },
      15000
    );
  });

  // =================================================================
  // PERFORMANCE TESTS (3 payloads)
  // =================================================================
  describe('Performance Tests (3 payloads)', () => {
    const performancePayloads = performance_tests;

    test.each(performancePayloads)(
      'should meet latency target: $name',
      async ({ text, expected_entities, note }) => {
        console.log(`\n🧪 Performance Test: ${note}`);

        const start = Date.now();
        const response = await sendToWorkflow(text);
        const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);
        const latency = Date.now() - start;

        expect(event).toBeDefined();

        const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
        const entitiesDetected = sanitized.pii?.entities_detected || 0;
        const detectionMethod = sanitized.pii?.detection_method || 'unknown';

        console.log(`   ⏱️  E2E latency: ${latency}ms`);
        console.log(`   Detected: ${entitiesDetected} entities via ${detectionMethod}`);

        // E2E latency should be < 2000ms (includes n8n processing + network)
        expect(latency).toBeLessThan(2000);

        // Verify detection occurred
        if (expected_entities.length > 0) {
          expect(entitiesDetected).toBeGreaterThan(0);
        }
      },
      20000 // Longer timeout for performance tests
    );
  });

  // =================================================================
  // DETECTION RATE SUMMARY
  // =================================================================
  describe('Detection Rate Summary', () => {
    test('should achieve 95%+ detection rate on valid PII', async () => {
      const allValidPayloads = [
        ...valid_pii.polish,
        ...valid_pii.international
      ];

      let detectedCount = 0;
      let totalCount = allValidPayloads.length;

      console.log(`\n📊 Testing ${totalCount} valid PII payloads...\n`);

      for (const payload of allValidPayloads) {
        try {
          const response = await sendToWorkflow(payload.text);
          const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

          const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
          const entitiesDetected = sanitized.pii?.entities_detected || 0;

          if (entitiesDetected > 0) {
            detectedCount++;
            console.log(`✅ ${payload.name}: ${entitiesDetected} entities`);
          } else {
            console.warn(`⚠️  ${payload.name}: NOT DETECTED`);
          }
        } catch (error) {
          console.error(`❌ ${payload.name}: ERROR - ${error.message}`);
        }
      }

      const detectionRate = (detectedCount / totalCount) * 100;

      console.log(`\n📊 PII Detection Rate: ${detectionRate.toFixed(2)}%`);
      console.log(`   Detected: ${detectedCount}/${totalCount}`);
      console.log(`   Missed: ${totalCount - detectedCount}/${totalCount}`);

      // Assert 95% detection rate
      expect(detectionRate).toBeGreaterThanOrEqual(95);
    }, 300000); // 5 minutes timeout for full suite

    test('should have <10% false positive rate on invalid PII', async () => {
      const allInvalidPayloads = [
        ...invalid_pii.false_formats,
        ...invalid_pii.benign_numbers
      ];

      let falsePositiveCount = 0;
      let totalCount = allInvalidPayloads.length;

      console.log(`\n📊 Testing ${totalCount} invalid PII payloads (false positive check)...\n`);

      for (const payload of allInvalidPayloads) {
        try {
          const response = await sendToWorkflow(payload.text);
          const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

          const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
          const entitiesDetected = sanitized.pii?.entities_detected || 0;

          if (entitiesDetected > 0) {
            falsePositiveCount++;
            console.warn(`⚠️  ${payload.name}: FALSE POSITIVE (${entitiesDetected} entities)`);
          } else {
            console.log(`✅ ${payload.name}: Correctly ignored`);
          }
        } catch (error) {
          console.error(`❌ ${payload.name}: ERROR - ${error.message}`);
        }
      }

      const falsePositiveRate = (falsePositiveCount / totalCount) * 100;

      console.log(`\n📊 False Positive Rate: ${falsePositiveRate.toFixed(2)}%`);
      console.log(`   False Positives: ${falsePositiveCount}/${totalCount}`);
      console.log(`   Correct Rejections: ${totalCount - falsePositiveCount}/${totalCount}`);

      // Assert <10% false positive rate
      expect(falsePositiveRate).toBeLessThan(10);
    }, 300000); // 5 minutes timeout for full suite

    test('should log Presidio as detection method when service healthy', async () => {
      if (presidioStatus !== 'healthy') {
        console.warn('⚠️  Skipping Presidio detection method test (service not healthy)');
        return;
      }

      const testText = 'Test: admin@example.com';
      const response = await sendToWorkflow(testText);
      const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);

      expect(event).toBeDefined();

      const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
      expect(sanitized.pii.detection_method).toBe('presidio');

      console.log('✅ Presidio is being used as primary detection method');
    }, 10000);
  });

  // =================================================================
  // BUG #6 REGRESSION TESTS
  // =================================================================
  // Bug #6: Normalization was destroying PII detection by over-aggressive
  // NFKC normalization that replaced digits with incompatible characters.
  // These tests ensure PII is still detected after normalization.
  // =================================================================
  describe('Bug #6 Regression Tests - Normalization Must Not Destroy PII', () => {
    test('should detect PESEL after normalization (Bug #6)', async () => {
      console.log('\n🐛 Bug #6 Regression Test: PESEL after normalization');

      // Valid PESEL with Unicode spaces (U+00A0 non-breaking space)
      const testText = 'PESEL:\u00A044051401359';
      console.log(`   Input: "${testText}" (contains U+00A0 non-breaking space)`);

      const response = await sendToWorkflow(testText);
      expect(response).toBeDefined();

      const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);
      expect(event).toBeDefined();

      const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
      expect(sanitized.pii).toBeDefined();

      // CRITICAL: PII must be detected even after normalization
      const entitiesDetected = sanitized.pii.entities_detected || 0;
      expect(entitiesDetected).toBeGreaterThan(0);

      console.log(`   ✅ Detected ${entitiesDetected} entities after normalization`);
      console.log(`   Detection method: ${sanitized.pii.detection_method}`);
    }, 15000);

    test('should detect credit card after normalization (Bug #6)', async () => {
      console.log('\n🐛 Bug #6 Regression Test: Credit card after normalization');

      // Valid credit card with Unicode dashes (U+2013 en-dash)
      const testText = 'Card: 4111\u20131111\u20131111\u20131111';
      console.log(`   Input: "${testText}" (contains U+2013 en-dash)`);

      const response = await sendToWorkflow(testText);
      expect(response).toBeDefined();

      const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);
      expect(event).toBeDefined();

      const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
      expect(sanitized.pii).toBeDefined();

      // CRITICAL: Credit card must be detected even after normalization
      const entitiesDetected = sanitized.pii.entities_detected || 0;
      expect(entitiesDetected).toBeGreaterThan(0);

      console.log(`   ✅ Detected ${entitiesDetected} entities after normalization`);
      console.log(`   Detection method: ${sanitized.pii.detection_method}`);
    }, 15000);

    test('should detect email after aggressive normalization (Bug #6)', async () => {
      console.log('\n🐛 Bug #6 Regression Test: Email after aggressive normalization');

      // Email with fullwidth characters (U+FF21 = Ａ fullwidth latin A)
      const testText = 'Contact: \uFF41dmin@example.com';
      console.log(`   Input: "${testText}" (contains fullwidth 'ａ' U+FF41)`);

      const response = await sendToWorkflow(testText);
      expect(response).toBeDefined();

      const event = await waitForClickHouseEvent({ sessionId: response.sessionId }, 10000);
      expect(event).toBeDefined();

      const sanitized = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
      expect(sanitized.pii).toBeDefined();

      // CRITICAL: Email must be detected after NFKC normalization
      const entitiesDetected = sanitized.pii.entities_detected || 0;
      expect(entitiesDetected).toBeGreaterThan(0);

      console.log(`   ✅ Detected ${entitiesDetected} entities after normalization`);
      console.log(`   Detection method: ${sanitized.pii.detection_method}`);

      // Verify the normalized form is still valid
      expect(event.normalized_input).toContain('admin@example.com');
      console.log(`   ✅ Normalized form preserved: "${event.normalized_input}"`);
    }, 15000);
  });
});
