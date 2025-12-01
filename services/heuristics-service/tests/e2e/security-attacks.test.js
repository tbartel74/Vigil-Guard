/**
 * E2E Tests - Security Attacks Detection
 *
 * Tests the new security detector (v2.1) against real attack payloads
 */

import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.HEURISTICS_URL || 'http://localhost:5005';

const analyze = async (text, request_id = null, lang = 'en') => {
  const id = request_id || `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const response = await fetch(`${BASE_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      request_id: id,
      lang
    })
  });
  return await response.json();
};

describe('Security Detector - SQL Injection Detection', () => {

  it('should detect UNION SELECT attack', async () => {
    const payload = "admin' UNION SELECT * FROM users--";
    const result = await analyze(payload);

    expect(result.branch_id).toBe('A');
    expect(result.features.security.sql_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
    expect(result.threat_level).toMatch(/HIGH|MEDIUM/);
  });

  it('should detect DROP TABLE attack', async () => {
    const payload = "'; DROP TABLE users; --";
    const result = await analyze(payload);

    expect(result.features.security.sql_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
  });

  it('should detect boolean SQL injection (OR 1=1)', async () => {
    const payload = "SELECT * FROM users WHERE id = 1 OR '1'='1'";
    const result = await analyze(payload);

    expect(result.features.security.sql_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
  });
});

describe('Security Detector - XSS Detection', () => {

  it('should detect script tag injection', async () => {
    const payload = "<script>alert('XSS')</script>";
    const result = await analyze(payload);

    expect(result.features.security.xss_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
    expect(result.threat_level).toMatch(/HIGH|MEDIUM/);
  });

  it('should detect event handler injection (onerror)', async () => {
    const payload = "<img src=x onerror=alert('XSS')>";
    const result = await analyze(payload);

    expect(result.features.security.xss_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
  });

  it('should detect javascript: protocol', async () => {
    const payload = "<a href='javascript:alert(1)'>Click</a>";
    const result = await analyze(payload);

    expect(result.features.security.xss_count).toBeGreaterThan(0);
  });
});

describe('Security Detector - Command Injection Detection', () => {

  it('should detect shell command chaining', async () => {
    const payload = "user input; rm -rf /";
    const result = await analyze(payload);

    expect(result.features.security.command_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
  });

  it('should detect pipe to command', async () => {
    const payload = "input | cat /etc/passwd";
    const result = await analyze(payload);

    expect(result.features.security.command_injection_count).toBeGreaterThan(0);
  });

  it('should detect command substitution', async () => {
    const payload = "user=$(whoami)";
    const result = await analyze(payload);

    expect(result.features.security.command_injection_count).toBeGreaterThan(0);
  });
});

describe('Security Detector - Privilege Escalation Detection', () => {

  it('should detect sudo command', async () => {
    const payload = "sudo apt-get install package";
    const result = await analyze(payload);

    expect(result.features.security.privilege_escalation_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(50);
  });

  it('should detect chmod 777 (dangerous permissions)', async () => {
    const payload = "chmod 777 /etc/passwd";
    const result = await analyze(payload);

    expect(result.features.security.privilege_escalation_count).toBeGreaterThan(0);
  });

  it('should detect /etc/passwd access', async () => {
    const payload = "cat /etc/passwd";
    const result = await analyze(payload);

    expect(result.features.security.privilege_escalation_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
  });
});

describe('Security Detector - Combined Attacks', () => {

  it('should detect combined SQL + XSS attack', async () => {
    const payload = "'; DROP TABLE users; -- <script>alert('XSS')</script>";
    const result = await analyze(payload);

    expect(result.features.security.sql_injection_count).toBeGreaterThan(0);
    expect(result.features.security.xss_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(70);
    expect(result.threat_level).toBe('HIGH');
  });

  it('should detect combined Command Injection + Privilege Escalation', async () => {
    const payload = "; rm -rf / && sudo chmod 777 /etc/passwd";
    const result = await analyze(payload);

    expect(result.features.security.command_injection_count).toBeGreaterThan(0);
    expect(result.features.security.privilege_escalation_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(80);
  });
});

describe('Security Detector - Benign Text', () => {

  it('should NOT detect security patterns in normal conversation', async () => {
    const payload = "Hello, how are you today? The weather is nice.";
    const result = await analyze(payload);

    expect(result.features.security.sql_injection_count).toBe(0);
    expect(result.features.security.xss_count).toBe(0);
    expect(result.features.security.command_injection_count).toBe(0);
    expect(result.features.security.privilege_escalation_count).toBe(0);
    expect(result.score).toBeLessThan(30);
  });

  it('should NOT detect security patterns in technical discussion', async () => {
    const payload = "We need to configure the database properly and ensure authentication.";
    const result = await analyze(payload);

    // May have low security score from "database" but should be minimal
    expect(result.score).toBeLessThan(40);
    expect(result.threat_level).toMatch(/LOW|MEDIUM/);
  });
});

describe('Security Detector - Integration with Other Detectors', () => {

  it('should combine security detection with obfuscation detection', async () => {
    // Base64-encoded SQL injection attempt
    const payload = "U0VMRUNUICogRlJPTSB1c2VycyBXSEVSRSAxPTE= '; DROP TABLE users;";
    const result = await analyze(payload);

    // Should trigger both obfuscation (base64) and security (SQL)
    expect(result.features.obfuscation.base64_detected).toBe(true);
    expect(result.features.security.sql_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(60);
  });

  it('should combine security with entropy detection for random payloads', async () => {
    // Random string with embedded SQL
    const payload = "xK9pLm2Qz '; DROP TABLE users; -- 8Wv3Nc7Fb";
    const result = await analyze(payload);

    // Should trigger entropy (randomness) and security (SQL)
    expect(result.features.entropy.score).toBeGreaterThan(20);
    expect(result.features.security.sql_injection_count).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(50);
  });
});

describe('Security Detector - Performance', () => {

  it('should complete analysis in <100ms', async () => {
    const payload = "'; DROP TABLE users; -- <script>alert(1)</script>";
    const startTime = Date.now();

    const result = await analyze(payload);

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(100);
    expect(result.timing_ms).toBeLessThan(100);
  });

  it('should handle long payloads efficiently', async () => {
    const payload = "normal text ".repeat(100) + "'; DROP TABLE users; --";
    const result = await analyze(payload);

    expect(result.features.security.sql_injection_count).toBeGreaterThan(0);
    expect(result.timing_ms).toBeLessThan(100);
  });
});
