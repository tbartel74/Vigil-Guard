/**
 * events_v2 Schema Validation Tests
 *
 * Verifies ClickHouse table structure matches workflow output.
 * Tests that all required v2.0.0 fields are populated correctly.
 *
 * Schema: n8n_logs.events_v2 (3-Branch Detection Architecture)
 */

import { describe, it, expect } from 'vitest';
import { sendAndVerify } from '../helpers/webhook.js';

describe('events_v2 Schema Validation', () => {

  describe('Identity Fields', () => {
    it('should have sessionId populated', async () => {
      const event = await sendAndVerify('Schema test for sessionId');

      expect(event.sessionId).toBeDefined();
      expect(typeof event.sessionId).toBe('string');
      expect(event.sessionId.length).toBeGreaterThan(0);
    });

    it('should have timestamp populated', async () => {
      const event = await sendAndVerify('Schema test for timestamp');

      expect(event.timestamp).toBeDefined();
    });

    it('should have action populated', async () => {
      const event = await sendAndVerify('Schema test for action');

      expect(event.action).toBeDefined();
      expect(event.action).toBe('sendMessage');
    });
  });

  describe('3-Branch Score Fields (v2.0.0)', () => {
    it('should have branch_a_score (heuristics)', async () => {
      const event = await sendAndVerify('Schema test for branch A');

      expect(typeof event.branch_a_score).toBe('number');
      expect(event.branch_a_score).toBeGreaterThanOrEqual(0);
      expect(event.branch_a_score).toBeLessThanOrEqual(100);
    });

    it('should have branch_b_score (semantic)', async () => {
      const event = await sendAndVerify('Schema test for branch B');

      expect(typeof event.branch_b_score).toBe('number');
      expect(event.branch_b_score).toBeGreaterThanOrEqual(0);
      expect(event.branch_b_score).toBeLessThanOrEqual(100);
    });

    it('should have branch_c_score (NLP analysis / llm_guard)', async () => {
      const event = await sendAndVerify('Schema test for branch C');

      expect(typeof event.branch_c_score).toBe('number');
      expect(event.branch_c_score).toBeGreaterThanOrEqual(0);
      expect(event.branch_c_score).toBeLessThanOrEqual(100);
    });

    it('should have threat_score (combined)', async () => {
      const event = await sendAndVerify('Schema test for threat score');

      expect(typeof event.threat_score).toBe('number');
      expect(event.threat_score).toBeGreaterThanOrEqual(0);
      expect(event.threat_score).toBeLessThanOrEqual(100);
    });

    it('should have confidence field', async () => {
      const event = await sendAndVerify('Schema test for confidence');

      expect(typeof event.confidence).toBe('number');
      expect(event.confidence).toBeGreaterThanOrEqual(0);
      expect(event.confidence).toBeLessThanOrEqual(1);
    });

    it('should have boosts_applied array', async () => {
      const event = await sendAndVerify('Schema test for boosts');

      expect(Array.isArray(event.boosts_applied)).toBe(true);
    });
  });

  describe('Final Decision Fields', () => {
    it('should have final_status with valid value', async () => {
      const event = await sendAndVerify('Schema test for final status');

      expect(event.final_status).toBeDefined();
      expect(['ALLOWED', 'SANITIZED', 'BLOCKED']).toContain(event.final_status);
    });

    it('should have final_decision with valid value', async () => {
      const event = await sendAndVerify('Schema test for final decision');

      expect(event.final_decision).toBeDefined();
      expect(['ALLOW', 'BLOCK']).toContain(event.final_decision);
    });

  });

  describe('PII Fields', () => {
    it('should have pii_sanitized field', async () => {
      const event = await sendAndVerify('Schema test for PII sanitized');

      expect(typeof event.pii_sanitized).toBe('number');
      expect([0, 1]).toContain(event.pii_sanitized);
    });

    it('should have pii_types_detected array', async () => {
      const event = await sendAndVerify('Schema test for PII types');

      expect(Array.isArray(event.pii_types_detected)).toBe(true);
    });

    it('should have pii_entities_count field', async () => {
      const event = await sendAndVerify('Schema test for PII count');

      expect(typeof event.pii_entities_count).toBe('number');
      expect(event.pii_entities_count).toBeGreaterThanOrEqual(0);
    });

    it('should populate PII fields correctly when PII detected', async () => {
      const event = await sendAndVerify('My email is test@example.com');

      expect(event.pii_sanitized).toBe(1);
      expect(event.pii_types_detected.length).toBeGreaterThan(0);
      expect(event.pii_entities_count).toBeGreaterThan(0);
    });
  });

  describe('Language Detection Field', () => {
    it('should have detected_language field', async () => {
      const event = await sendAndVerify('This is English text');

      expect(event.detected_language).toBeDefined();
      expect(['pl', 'en', 'unknown']).toContain(event.detected_language);
    });

    it('should detect Polish language', async () => {
      const event = await sendAndVerify('To jest polski tekst do testowania');

      expect(event.detected_language).toBe('pl');
    });

    it('should detect English language', async () => {
      const event = await sendAndVerify('This is a test message in English');

      expect(event.detected_language).toBe('en');
    });
  });

  describe('Input/Output Fields', () => {
    it('should have original_input field', async () => {
      const testInput = 'Test input for schema validation';
      const event = await sendAndVerify(testInput);

      expect(event.original_input).toBeDefined();
      expect(event.original_input).toContain('Test input');
    });

    it('should have chat_input field', async () => {
      const event = await sendAndVerify('Test chat input field');

      expect(event.chat_input).toBeDefined();
    });

    it('should have result field', async () => {
      const event = await sendAndVerify('Test result field');

      expect(event.result).toBeDefined();
    });
  });

  describe('Client Metadata Fields', () => {
    it('should have client_id field', async () => {
      const event = await sendAndVerify('Test client ID field');

      // client_id may be empty if not provided
      expect(event.client_id).toBeDefined();
    });

    it('should have browser_name field', async () => {
      const event = await sendAndVerify('Test browser name field');

      expect(event.browser_name).toBeDefined();
    });
  });

  describe('JSON Fields', () => {
    it('should parse arbiter_json correctly', async () => {
      const event = await sendAndVerify('Test arbiter JSON parsing');

      // arbiter is parsed from arbiter_json in webhook helper
      if (event.arbiter) {
        expect(typeof event.arbiter).toBe('object');
      }
    });

    it('should parse branch_results_json correctly', async () => {
      const event = await sendAndVerify('Test branch results JSON parsing');

      // branch_results is parsed from branch_results_json in webhook helper
      if (event.branch_results) {
        expect(typeof event.branch_results).toBe('object');
      }
    });

    it('should parse pii_classification_json correctly', async () => {
      const event = await sendAndVerify('My email is test@example.com');

      // pii_classification is parsed from pii_classification_json
      // v2.0.0: pii_classification is an object with method, types, count fields
      expect(event.pii_classification).toBeDefined();
      if (event.pii_classification && typeof event.pii_classification === 'object') {
        // Object format: { method, types, count }
        expect(typeof event.pii_classification).toBe('object');
      }
    });
  });

  describe('Convenience Accessors (webhook helper)', () => {
    it('should have branches accessor object', async () => {
      const event = await sendAndVerify('Test branches accessor');

      expect(event.branches).toBeDefined();
      expect(event.branches.A).toBeDefined();
      expect(event.branches.B).toBeDefined();
      expect(event.branches.C).toBeDefined();

      expect(event.branches.A.name).toBe('heuristics');
      expect(event.branches.B.name).toBe('semantic');
      expect(event.branches.C.name).toBe('llm_guard');

      expect(typeof event.branches.A.score).toBe('number');
      expect(typeof event.branches.B.score).toBe('number');
      expect(typeof event.branches.C.score).toBe('number');
    });
  });

  describe('Full Schema Test', () => {
    it('should have all required v2.0.0 fields populated', async () => {
      const event = await sendAndVerify('Full schema validation test');

      // Identity
      expect(event.sessionId).toBeDefined();
      expect(event.timestamp).toBeDefined();

      // Branch Scores
      expect(typeof event.branch_a_score).toBe('number');
      expect(typeof event.branch_b_score).toBe('number');
      expect(typeof event.branch_c_score).toBe('number');
      expect(typeof event.threat_score).toBe('number');
      expect(typeof event.confidence).toBe('number');

      // Decision
      expect(['ALLOWED', 'SANITIZED', 'BLOCKED']).toContain(event.final_status);
      expect(['ALLOW', 'BLOCK']).toContain(event.final_decision);

      // PII
      expect(typeof event.pii_sanitized).toBe('number');
      expect(Array.isArray(event.pii_types_detected)).toBe(true);

      // Arrays
      expect(Array.isArray(event.boosts_applied)).toBe(true);

      // Language
      expect(event.detected_language).toBeDefined();
    });
  });
});
