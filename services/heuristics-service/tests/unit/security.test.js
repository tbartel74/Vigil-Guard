/**
 * Unit Tests - Security Detector
 *
 * Tests for SQL injection, XSS, command injection, and privilege escalation detection.
 * Validates pattern matching from security-keywords.json configuration.
 */

import { describe, it, expect } from 'vitest';
import { detectSecurityKeywords } from '../../src/detectors/security.js';

describe('Security Detector - SQL Injection', () => {

  it('should detect UNION SELECT injection (high confidence)', async () => {
    const sqlText = "admin' UNION SELECT * FROM users--";
    const result = await detectSecurityKeywords(sqlText);

    expect(result.sql_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
    const hasSqlSignal = result.signals.some(s => s.includes('SQL injection'));
    expect(hasSqlSignal).toBe(true);
  });

  it('should detect OR 1=1 boolean injection (high confidence)', async () => {
    const sqlText = "SELECT * FROM users WHERE id = 1 OR '1'='1'";
    const result = await detectSecurityKeywords(sqlText);

    expect(result.sql_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
  });

  it('should detect DROP TABLE attack (high confidence)', async () => {
    const sqlText = "admin'; DROP TABLE users; --";
    const result = await detectSecurityKeywords(sqlText);

    expect(result.sql_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(80);
  });

  it('should detect DELETE FROM injection (high confidence)', async () => {
    const sqlText = "1; DELETE FROM users WHERE 1=1";
    const result = await detectSecurityKeywords(sqlText);

    expect(result.sql_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
  });

  it('should detect hex-encoded SQL injection', async () => {
    const sqlText = "0x53454c454354202a2046524f4d2075736572SELECT";
    const result = await detectSecurityKeywords(sqlText);

    expect(result.sql_injection_count).toBeGreaterThan(0);
  });

  it('should detect SQL comment injection (-- or /**/)', async () => {
    const sqlText = "admin'--";
    const result = await detectSecurityKeywords(sqlText);

    expect(result.sql_injection_count).toBeGreaterThan(0);
  });

  it('should detect medium confidence SQL patterns (SELECT FROM)', async () => {
    const sqlText = "SELECT name, email FROM users";
    const result = await detectSecurityKeywords(sqlText);

    expect(result.sql_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(40);
    expect(result.score).toBeLessThan(80); // Medium confidence = lower score
  });

  it('should NOT detect benign text without SQL patterns', async () => {
    const benignText = "The weather is nice today. Please check your email.";
    const result = await detectSecurityKeywords(benignText);

    // No SQL patterns should be detected
    expect(result.sql_injection_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

describe('Security Detector - XSS (Cross-Site Scripting)', () => {

  it('should detect script tag injection (high confidence)', async () => {
    const xssText = "<script>alert('XSS')</script>";
    const result = await detectSecurityKeywords(xssText);

    expect(result.xss_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
    const hasXssSignal = result.signals.some(s => s.includes('XSS'));
    expect(hasXssSignal).toBe(true);
  });

  it('should detect event handler injection (onerror, onclick)', async () => {
    const xssText = "<img src=x onerror=alert('XSS')>";
    const result = await detectSecurityKeywords(xssText);

    expect(result.xss_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
  });

  it('should detect javascript: protocol injection', async () => {
    const xssText = "<a href='javascript:alert(1)'>Click</a>";
    const result = await detectSecurityKeywords(xssText);

    expect(result.xss_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
  });

  it('should detect iframe injection', async () => {
    const xssText = "<iframe src='http://evil.com'></iframe>";
    const result = await detectSecurityKeywords(xssText);

    expect(result.xss_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
  });

  it('should detect DOM manipulation (document.cookie, document.write)', async () => {
    const xssText = "document.cookie = 'stolen'";
    const result = await detectSecurityKeywords(xssText);

    expect(result.xss_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
  });

  it('should detect SVG XSS (svg with onload)', async () => {
    const xssText = "<svg onload=alert('XSS')>";
    const result = await detectSecurityKeywords(xssText);

    expect(result.xss_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
  });

  it('should NOT detect benign HTML tags', async () => {
    const benignText = "<div class='container'>Hello World</div>";
    const result = await detectSecurityKeywords(benignText);

    // Regular HTML without dangerous attributes should be safe
    expect(result.xss_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

describe('Security Detector - Command Injection', () => {

  it('should detect shell command chaining (; rm, ; cat)', async () => {
    const cmdText = "user input; rm -rf /";
    const result = await detectSecurityKeywords(cmdText);

    expect(result.command_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
    const hasCmdSignal = result.signals.some(s => s.includes('command injection'));
    expect(hasCmdSignal).toBe(true);
  });

  it('should detect pipe to command (| cat, | ls)', async () => {
    const cmdText = "input | cat /etc/passwd";
    const result = await detectSecurityKeywords(cmdText);

    expect(result.command_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
  });

  it('should detect command substitution $(command)', async () => {
    const cmdText = "user=$(whoami)";
    const result = await detectSecurityKeywords(cmdText);

    expect(result.command_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
  });

  it('should detect backtick command execution', async () => {
    const cmdText = "result=`ls -la`";
    const result = await detectSecurityKeywords(cmdText);

    expect(result.command_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
  });

  it('should detect command chaining with && (AND operator)', async () => {
    const cmdText = "ls && rm file.txt";
    const result = await detectSecurityKeywords(cmdText);

    expect(result.command_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
  });

  it('should NOT detect benign technical text', async () => {
    const benignText = "The system catalog contains metadata.";
    const result = await detectSecurityKeywords(benignText);

    // "cat" within "catalog" should not trigger
    expect(result.command_injection_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

describe('Security Detector - Privilege Escalation', () => {

  it('should detect sudo command (high confidence)', async () => {
    const privText = "sudo apt-get install package";
    const result = await detectSecurityKeywords(privText);

    expect(result.privilege_escalation_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
    const hasPrivSignal = result.signals.some(s => s.includes('privilege escalation'));
    expect(hasPrivSignal).toBe(true);
  });

  it('should detect su root command', async () => {
    const privText = "su root";
    const result = await detectSecurityKeywords(privText);

    expect(result.privilege_escalation_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
  });

  it('should detect chmod 777 (dangerous permissions)', async () => {
    const privText = "chmod 777 /etc/passwd";
    const result = await detectSecurityKeywords(privText);

    expect(result.privilege_escalation_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
  });

  it('should detect admin access requests', async () => {
    const privText = "Give me admin access to the portal";
    const result = await detectSecurityKeywords(privText);

    expect(result.privilege_escalation_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(50);
  });

  it('should detect /etc/passwd or /etc/shadow access', async () => {
    const privText = "cat /etc/shadow";
    const result = await detectSecurityKeywords(privText);

    expect(result.privilege_escalation_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(80);
  });

  it('should NOT detect benign mentions of admin', async () => {
    const benignText = "Please contact the administrator for help.";
    const result = await detectSecurityKeywords(benignText);

    // "administrator" alone without "access", "panel", "login" should be safe
    expect(result.privilege_escalation_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

describe('Security Detector - Multiple Attack Vectors', () => {

  it('should detect combined SQL + XSS attack', async () => {
    const multiText = "'; DROP TABLE users; -- <script>alert('XSS')</script>";
    const result = await detectSecurityKeywords(multiText);

    expect(result.sql_injection_count).toBeGreaterThan(0);
    expect(result.xss_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(80); // Multiple attacks = higher score
  });

  it('should detect combined Command Injection + Privilege Escalation', async () => {
    const multiText = "; rm -rf / && sudo chmod 777 /etc/passwd";
    const result = await detectSecurityKeywords(multiText);

    // This should match: "; rm" (command injection) and "sudo" + "chmod 777" + "/etc/passwd" (privilege escalation)
    expect(result.command_injection_count).toBeGreaterThan(0);
    expect(result.privilege_escalation_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(80);
  });

  it('should list detected patterns in results', async () => {
    const attackText = "admin'; DROP TABLE users; -- sudo rm -rf /";
    const result = await detectSecurityKeywords(attackText);

    expect(result.detected_patterns).toBeDefined();
    expect(result.detected_patterns.length).toBeGreaterThan(0);
    // Should have SQL patterns (DROP TABLE detected)
    const hasSqlPattern = result.detected_patterns.some(p => p.type === 'SQL_INJECTION');
    expect(hasSqlPattern).toBe(true);
  });

  it('should generate multiple signals for multiple attack types', async () => {
    const multiText = "'; DELETE FROM users; -- <script>alert(1)</script> && cat /etc/passwd";
    const result = await detectSecurityKeywords(multiText);

    expect(result.signals.length).toBeGreaterThanOrEqual(3); // SQL, XSS, Command
  });
});

describe('Security Detector - Edge Cases', () => {

  it('should return zero score for empty text', async () => {
    const emptyText = "";
    const result = await detectSecurityKeywords(emptyText);

    expect(result.sql_injection_count).toBe(0);
    expect(result.xss_count).toBe(0);
    expect(result.command_injection_count).toBe(0);
    expect(result.privilege_escalation_count).toBe(0);
    expect(result.score).toBe(0);
  });

  it('should return zero score for completely benign text', async () => {
    const benignText = "The weather is nice today.";
    const result = await detectSecurityKeywords(benignText);

    expect(result.score).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it('should handle case-insensitive patterns', async () => {
    const upperCaseText = "UNION SELECT * FROM USERS";
    const result = await detectSecurityKeywords(upperCaseText);

    // Patterns use \\b which is case-insensitive by default in RegExp
    expect(result.sql_injection_count).toBeGreaterThan(0);
  });

  it('should handle very long text efficiently', async () => {
    const longText = "normal text ".repeat(1000) + "'; DROP TABLE users; --";
    const startTime = Date.now();

    const result = await detectSecurityKeywords(longText);

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(100); // Should complete in <100ms
    expect(result.sql_injection_count).toBeGreaterThan(0);
  });

  it('should return consistent results for identical text', async () => {
    const text = "admin'; DROP TABLE users; --";

    const result1 = await detectSecurityKeywords(text);
    const result2 = await detectSecurityKeywords(text);

    expect(result1.score).toBe(result2.score);
    expect(result1.sql_injection_count).toBe(result2.sql_injection_count);
  });
});

describe('Security Detector - Scoring Logic', () => {

  it('should assign higher scores for high-confidence patterns', async () => {
    const highConfText = "'; DROP TABLE users; --";
    const mediumConfText = "SELECT * FROM users";

    const highResult = await detectSecurityKeywords(highConfText);
    const mediumResult = await detectSecurityKeywords(mediumConfText);

    expect(highResult.score).toBeGreaterThan(mediumResult.score);
  });

  it('should cap score at 100', async () => {
    const massiveAttackText = "'; DROP TABLE users; -- <script>alert(1)</script> && rm -rf / && sudo su root && cat /etc/passwd && chmod 777 /";
    const result = await detectSecurityKeywords(massiveAttackText);

    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should detect at least one pattern for threshold validation', async () => {
    const sqlText = "UNION SELECT password FROM users";
    const result = await detectSecurityKeywords(sqlText);

    // Threshold is 1 (sql_injection_threshold: 1)
    expect(result.sql_injection_count).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeGreaterThan(0);
  });

  it('should detect at least two patterns for privilege escalation threshold', async () => {
    const privText = "sudo chmod 777 /etc/passwd";
    const result = await detectSecurityKeywords(privText);

    // Threshold is 2 (privilege_escalation_threshold: 2)
    // This text has both sudo and chmod 777
    expect(result.privilege_escalation_count).toBeGreaterThanOrEqual(2);
  });
});
