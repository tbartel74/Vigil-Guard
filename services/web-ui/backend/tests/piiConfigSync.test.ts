import { describe, it, expect } from 'vitest';
import { isValidRedactionToken, validatePayload } from '../src/piiConfigSync.js';

/**
 * Unit tests for PII configuration validation
 *
 * Tests XSS protection, payload validation, and Polish diacritic support
 * Architecture: Pure function testing with no mocking (unit tests)
 */

describe('isValidRedactionToken - XSS Protection', () => {
  describe('Valid tokens (should accept)', () => {
    const validTokens = [
      '[EMAIL_ADDRESS]',
      '***',
      'PHONE (masked)',
      '[Nazwa_świadczenia]',  // Polish diacritics
      'PII-REDACTED',
      '(hidden)',
      '[UKRYTY_123]',
      'ąćęłńóśźż',  // All Polish special characters (lowercase)
      'ĄĆĘŁŃÓŚŹŻ',  // All Polish special characters (uppercase)
      'ó',          // Polish ó (U+00F3)
      'Ó',          // Polish Ó (U+00D3)
      'Imię',       // Mixed case Polish
      '...',        // Periods
      '*.*',        // Mixed asterisk and period
    ];

    validTokens.forEach(token => {
      it(`should accept valid token: "${token}"`, () => {
        expect(isValidRedactionToken(token)).toBe(true);
      });
    });
  });

  describe('Invalid tokens (should reject XSS)', () => {
    const xssVectors = [
      '<script>alert(1)</script>',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'onerror=alert(1)',
      '<img src=x onerror=alert(1)>',
      '"><script>alert(1)</script>',
      "\\';alert(1);//",
      '<svg/onload=alert(1)>',
      'eval("alert(1)")',
      // Note: XSS requires HTML/JS special chars: <>&"'=/:;
    ];

    xssVectors.forEach(token => {
      it(`should reject XSS vector: "${token.substring(0, 30)}..."`, () => {
        expect(isValidRedactionToken(token)).toBe(false);
      });
    });
  });

  describe('Unicode exploits (should reject)', () => {
    const unicodeExploits = [
      '\u202E[REVERSED]',  // Right-to-left override
      '\u200B[ZERO-WIDTH]',  // Zero-width space
      '\uFEFF[BOM]',  // Byte order mark
      'test\u0000null',  // Null byte injection
    ];

    unicodeExploits.forEach(token => {
      it(`should reject Unicode exploit: ${token.charCodeAt(0).toString(16)}`, () => {
        expect(isValidRedactionToken(token)).toBe(false);
      });
    });
  });

  describe('Edge cases', () => {
    it('should reject empty string', () => {
      expect(isValidRedactionToken('')).toBe(false);
    });

    it('should accept single character', () => {
      expect(isValidRedactionToken('X')).toBe(true);
    });

    it('should accept asterisk and period', () => {
      expect(isValidRedactionToken('***')).toBe(true);
      expect(isValidRedactionToken('...')).toBe(true);
      expect(isValidRedactionToken('*.*')).toBe(true);
    });

    it('should reject special characters not in whitelist', () => {
      const specialChars = ['@', '#', '$', '%', '^', '&', '!', '~', '`', '{', '}', '|', '\\', '/', '?', '<', '>', ',', ':', ';', '"', "'"];

      specialChars.forEach(char => {
        expect(isValidRedactionToken(char)).toBe(false);
      });
    });
  });
});

describe('validatePayload - PII Configuration Validation', () => {
  describe('enabledEntities validation', () => {
    it('should accept valid entity array', () => {
      const payload = {
        enabledEntities: ['EMAIL_ADDRESS', 'PHONE_NUMBER', 'PERSON']
      };
      expect(validatePayload(payload)).toEqual([]);
    });

    it('should reject non-array enabledEntities', () => {
      const payload = {
        enabledEntities: 'EMAIL_ADDRESS' as any
      };
      const errors = validatePayload(payload);
      expect(errors).toContain('enabledEntities must be an array');
    });

    it('should reject unknown entity types', () => {
      const payload = {
        enabledEntities: ['EMAIL_ADDRESS', 'UNKNOWN_ENTITY', 'FAKE_TYPE']
      };
      const errors = validatePayload(payload);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Unknown entity types');
      expect(errors[0]).toContain('UNKNOWN_ENTITY');
      expect(errors[0]).toContain('FAKE_TYPE');
    });

    it('should accept all known Polish entities', () => {
      const payload = {
        enabledEntities: ['PL_PESEL', 'PL_NIP', 'PL_REGON', 'PL_ID_CARD']
      };
      expect(validatePayload(payload)).toEqual([]);
    });
  });

  describe('confidenceThreshold validation', () => {
    it('should accept valid threshold (0-1)', () => {
      expect(validatePayload({ confidenceThreshold: 0.7 })).toEqual([]);
      expect(validatePayload({ confidenceThreshold: 0.0 })).toEqual([]);
      expect(validatePayload({ confidenceThreshold: 1.0 })).toEqual([]);
    });

    it('should reject threshold < 0', () => {
      const errors = validatePayload({ confidenceThreshold: -0.1 });
      expect(errors).toContain('confidenceThreshold must be between 0 and 1');
    });

    it('should reject threshold > 1', () => {
      const errors = validatePayload({ confidenceThreshold: 1.5 });
      expect(errors).toContain('confidenceThreshold must be between 0 and 1');
    });

    it('should reject non-number threshold', () => {
      const errors = validatePayload({ confidenceThreshold: '0.7' as any });
      expect(errors).toContain('confidenceThreshold must be between 0 and 1');
    });
  });

  describe('languages validation', () => {
    it('should accept valid languages array', () => {
      expect(validatePayload({ languages: ['pl', 'en'] })).toEqual([]);
      expect(validatePayload({ languages: ['en'] })).toEqual([]);
    });

    it('should reject non-array languages', () => {
      const errors = validatePayload({ languages: 'pl' as any });
      expect(errors).toContain('languages must be an array of strings');
    });

    it('should reject array with non-string elements', () => {
      const errors = validatePayload({ languages: ['pl', 123] as any });
      expect(errors).toContain('languages must be an array of strings');
    });
  });

  describe('redactionTokens validation', () => {
    it('should accept valid redaction tokens', () => {
      const payload = {
        redactionTokens: {
          'EMAIL_ADDRESS': '[EMAIL]',
          'PERSON': 'Imię',  // Polish
          'PHONE_NUMBER': '***'
        }
      };
      expect(validatePayload(payload)).toEqual([]);
    });

    it('should reject non-object redactionTokens', () => {
      const errors = validatePayload({ redactionTokens: 'token' as any });
      expect(errors).toContain('redactionTokens must be an object');
    });

    it('should reject non-string token values', () => {
      const payload = {
        redactionTokens: {
          'EMAIL_ADDRESS': 123 as any
        }
      };
      const errors = validatePayload(payload);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Redaction token for EMAIL_ADDRESS must be a string');
    });

    it('should reject tokens exceeding 50 characters', () => {
      const payload = {
        redactionTokens: {
          'EMAIL_ADDRESS': 'A'.repeat(51)
        }
      };
      const errors = validatePayload(payload);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('too long (max 50 characters)');
    });

    it('should accept token at max length (50 chars)', () => {
      const payload = {
        redactionTokens: {
          'EMAIL_ADDRESS': 'A'.repeat(50)
        }
      };
      expect(validatePayload(payload)).toEqual([]);
    });

    it('should reject XSS in redaction tokens', () => {
      const payload = {
        redactionTokens: {
          'EMAIL_ADDRESS': '<script>alert(1)</script>'
        }
      };
      const errors = validatePayload(payload);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('contains unsafe characters');
      expect(errors[0]).toContain('EMAIL_ADDRESS');
    });

    it('should accept Polish diacritics in tokens', () => {
      const payload = {
        redactionTokens: {
          'PERSON': 'Imię i nazwisko',
          'LOCATION': 'Łódź',
          'ORGANIZATION': 'Państwowa'
        }
      };
      expect(validatePayload(payload)).toEqual([]);
    });
  });

  describe('detectionMode validation', () => {
    it('should accept valid detection modes', () => {
      expect(validatePayload({ detectionMode: 'balanced' })).toEqual([]);
      expect(validatePayload({ detectionMode: 'high_security' })).toEqual([]);
      expect(validatePayload({ detectionMode: 'high_precision' })).toEqual([]);
    });

    it('should reject invalid detection mode', () => {
      const errors = validatePayload({ detectionMode: 'invalid_mode' as any });
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Invalid detection mode');
      expect(errors[0]).toContain('balanced, high_security, high_precision');
    });
  });

  describe('Multiple validation errors', () => {
    it('should return all validation errors', () => {
      const payload = {
        enabledEntities: 'not-array' as any,
        confidenceThreshold: 2.0,
        languages: 'not-array' as any,
        redactionTokens: 'not-object' as any,
        detectionMode: 'invalid' as any
      };
      const errors = validatePayload(payload);
      expect(errors.length).toBe(5);
    });

    it('should return empty array for valid payload', () => {
      const payload = {
        enabled: true,
        confidenceThreshold: 0.7,
        enabledEntities: ['EMAIL_ADDRESS', 'PERSON'],
        redactionMode: 'replace' as const,
        fallbackToRegex: true,
        languages: ['pl', 'en'],
        detectionMode: 'balanced' as const,
        contextEnhancement: true,
        redactionTokens: {
          'EMAIL_ADDRESS': '[EMAIL]',
          'PERSON': 'Imię'
        }
      };
      expect(validatePayload(payload)).toEqual([]);
    });
  });
});
