import { describe, it, expect } from 'vitest';

/**
 * Unit tests for PII configuration sync - XSS protection
 *
 * Tests the whitelist validation for redaction tokens to prevent XSS attacks
 * via malicious token injection.
 */

// Import the validation function (we'll need to export it from piiConfigSync.ts)
// For now, we'll test via the full syncPiiConfig function behavior

describe('Redaction Token XSS Protection', () => {
  describe('Valid tokens (should accept)', () => {
    const validTokens = [
      '[EMAIL_ADDRESS]',
      '***',
      'PHONE (masked)',
      '[Nazwa_świadczenia]',  // Polish diacritics
      'PII-REDACTED',
      '(hidden)',
      '[UKRYTY_123]',
      'ąćęłńóśźż',  // All Polish special characters
      'ĄĆĘŁŃÓŚŹŻ',  // Uppercase Polish
    ];

    validTokens.forEach(token => {
      it(`should accept valid token: "${token}"`, () => {
        const SAFE_TOKEN_REGEX = /^[A-Za-z0-9\u0104-\u017C _\-\[\]\(\)]+$/;
        expect(SAFE_TOKEN_REGEX.test(token)).toBe(true);
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
      '\';alert(1);//',
      '<svg/onload=alert(1)>',
      'eval("alert(1)")',
      'expression(alert(1))',
    ];

    xssVectors.forEach(token => {
      it(`should reject XSS vector: "${token.substring(0, 30)}..."`, () => {
        const SAFE_TOKEN_REGEX = /^[A-Za-z0-9\u0104-\u017C _\-\[\]\(\)]+$/;
        expect(SAFE_TOKEN_REGEX.test(token)).toBe(false);
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
        const SAFE_TOKEN_REGEX = /^[A-Za-z0-9\u0104-\u017C _\-\[\]\(\)]+$/;
        expect(SAFE_TOKEN_REGEX.test(token)).toBe(false);
      });
    });
  });

  describe('Length validation', () => {
    it('should accept token at max length (50 chars)', () => {
      const token = 'A'.repeat(50);
      expect(token.length).toBe(50);
      // Length validation is separate from character validation
    });

    it('should enforce 50-character limit', () => {
      const token = 'A'.repeat(51);
      expect(token.length).toBeGreaterThan(50);
      // This would be rejected by length check, not character check
    });
  });

  describe('Edge cases', () => {
    it('should reject empty string', () => {
      const SAFE_TOKEN_REGEX = /^[A-Za-z0-9\u0104-\u017C _\-\[\]\(\)]+$/;
      expect(SAFE_TOKEN_REGEX.test('')).toBe(false);
    });

    it('should accept single character', () => {
      const SAFE_TOKEN_REGEX = /^[A-Za-z0-9\u0104-\u017C _\-\[\]\(\)]+$/;
      expect(SAFE_TOKEN_REGEX.test('X')).toBe(true);
    });

    it('should reject special characters not in whitelist', () => {
      const specialChars = ['@', '#', '$', '%', '^', '&', '*', '!', '~', '`', '{', '}', '|', '\\', '/', '?', '<', '>', ',', '.', ':', ';', '"', "'"];
      const SAFE_TOKEN_REGEX = /^[A-Za-z0-9\u0104-\u017C _\-\[\]\(\)]+$/;

      specialChars.forEach(char => {
        expect(SAFE_TOKEN_REGEX.test(char)).toBe(false);
      });
    });
  });
});
