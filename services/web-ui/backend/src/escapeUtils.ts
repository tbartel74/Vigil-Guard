/**
 * String Escaping Utilities
 * Security-critical functions for safe string embedding in various contexts
 */

/**
 * Escape string for safe embedding in HTML context
 * Prevents XSS attacks by escaping HTML special characters
 *
 * @param str - Input string to escape
 * @returns Escaped string safe for HTML context
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape string for safe embedding in JavaScript string literal
 * Prevents injection attacks in template strings
 *
 * Escapes:
 * - Backslash (\ → \\) - must be first to avoid double-escaping
 * - Single quote (' → \')
 * - Double quote (" → \")
 * - Backtick (` → \`)
 * - Newline (\n → \\n)
 * - Carriage return (\r → \\r)
 * - Tab (\t → \\t)
 * - Line separator (U+2028)
 * - Paragraph separator (U+2029)
 *
 * @param str - Input string to escape
 * @returns Escaped string safe for JavaScript context
 */
export function escapeJavaScriptString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')   // Backslash -> \\
    .replace(/'/g, "\\'")     // Single quote -> \'
    .replace(/"/g, '\\"')     // Double quote -> \"
    .replace(/`/g, '\\`')     // Backtick -> \`
    .replace(/\n/g, '\\n')    // Newline -> \n
    .replace(/\r/g, '\\r')    // Carriage return -> \r
    .replace(/\t/g, '\\t')    // Tab -> \t
    .replace(/\u2028/g, '\\u2028')  // Line separator
    .replace(/\u2029/g, '\\u2029'); // Paragraph separator
}
