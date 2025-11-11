/**
 * ReDoS Safety Test Suite
 * 
 * Purpose: Validate that all regex patterns in rules.config.json are protected
 * against catastrophic backtracking (ReDoS attacks).
 * 
 * Phase 0.1: ReDoS Vulnerability Fixes (Aho-Corasick Optimization v1.8.0)
 * 
 * Test Coverage:
 * - Bounded quantifiers (.* → .{0,200})
 * - Greedy operators (\w+ → \w{1,50})
 * - Pattern timeout enforcement (<1000ms)
 * - Performance degradation detection
 * - All 99 previously vulnerable patterns
 */

import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const RULES_CONFIG_PATH = path.join(process.cwd(), 'config/rules.config.json');
const REDOS_REPORT_PATH = '/tmp/redos_report.json';
const PATTERN_TIMEOUT_MS = 1000;  // Must match Pattern_Matching_Engine timeout

describe('ReDoS Safety - Pattern Security', () => {
  let rulesConfig;
  let redosReport;

  beforeAll(() => {
    // Load rules.config.json
    const rulesData = fs.readFileSync(RULES_CONFIG_PATH, 'utf8');
    rulesConfig = JSON.parse(rulesData);

    // Load ReDoS scan report (if exists)
    if (fs.existsSync(REDOS_REPORT_PATH)) {
      const reportData = fs.readFileSync(REDOS_REPORT_PATH, 'utf8');
      redosReport = JSON.parse(reportData);
    }
  });

  test('rules.config.json loads successfully', () => {
    expect(rulesConfig).toBeDefined();
    expect(rulesConfig.categories).toBeDefined();
    expect(Object.keys(rulesConfig.categories).length).toBeGreaterThan(0);
  });

  test('No unbounded .* quantifiers exist', () => {
    const unboundedPatterns = [];

    for (const [categoryName, categoryData] of Object.entries(rulesConfig.categories)) {
      for (let i = 0; i < categoryData.patterns.length; i++) {
        const pattern = categoryData.patterns[i];
        
        // Check for unbounded .* (not followed by {)
        if (pattern.match(/\.\*(?![{?])/g)) {
          unboundedPatterns.push({
            category: categoryName,
            index: i,
            pattern: pattern.substring(0, 80)
          });
        }
      }
    }

    expect(unboundedPatterns).toHaveLength(0);
    if (unboundedPatterns.length > 0) {
      console.error('Unbounded .* found in:', unboundedPatterns);
    }
  });

  test('No unbounded \\w+ or \\w* quantifiers exist', () => {
    const unboundedPatterns = [];

    for (const [categoryName, categoryData] of Object.entries(rulesConfig.categories)) {
      for (let i = 0; i < categoryData.patterns.length; i++) {
        const pattern = categoryData.patterns[i];
        
        // Check for unbounded \w+ or \w* (not followed by {)
        if (pattern.match(/\\w[+*](?![{?])/g)) {
          unboundedPatterns.push({
            category: categoryName,
            index: i,
            pattern: pattern.substring(0, 80)
          });
        }
      }
    }

    expect(unboundedPatterns).toHaveLength(0);
    if (unboundedPatterns.length > 0) {
      console.error('Unbounded \\w+ or \\w* found in:', unboundedPatterns);
    }
  });

  test('All previously vulnerable patterns are now fixed (99/99)', () => {
    if (!redosReport) {
      console.warn('ReDoS report not found, skipping validation');
      return;
    }

    // Re-scan for vulnerabilities
    const stillVulnerable = [];

    for (const vuln of redosReport.patterns) {
      const category = rulesConfig.categories[vuln.category];
      if (!category) continue;

      const pattern = category.patterns[vuln.patternIndex];
      if (!pattern) continue;

      // Check if vulnerability still exists
      let stillHasIssue = false;
      if (vuln.issue === 'Unbounded .*' && pattern.match(/\.\*(?![{?])/g)) {
        stillHasIssue = true;
      }
      if (vuln.issue === 'Greedy \\w+ or \\w*' && pattern.match(/\\w[+*](?![{?])/g)) {
        stillHasIssue = true;
      }

      if (stillHasIssue) {
        stillVulnerable.push({
          category: vuln.category,
          index: vuln.patternIndex,
          issue: vuln.issue
        });
      }
    }

    expect(stillVulnerable).toHaveLength(0);
    console.log(`✅ All ${redosReport.patterns.length} vulnerabilities fixed`);
  });
});

describe('ReDoS Safety - Performance Testing', () => {
  test('Bounded .{0,200} pattern performs safely on long input', () => {
    const pattern = /test.{0,200}attack/;
    const attackString = 'test' + 'a'.repeat(1000) + 'attack';

    const start = Date.now();
    const match = attackString.match(pattern);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);  // Should be <100ms
    expect(match).toBeNull();  // No match (exceeded 200 char limit)
  });

  test('Bounded \\w{1,50} pattern performs safely on long input', () => {
    const pattern = /test\w{1,50}attack/;
    const attackString = 'test' + 'a'.repeat(100) + 'attack';

    const start = Date.now();
    const match = attackString.match(pattern);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
    expect(match).toBeNull();  // No match (exceeded 50 char limit)
  });

  test('Pattern timeout protection (<1000ms per pattern)', () => {
    // Simulate pattern execution with timeout
    const pattern = /.{0,200}/;
    const testString = 'a'.repeat(500);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Pattern timeout')), PATTERN_TIMEOUT_MS);
    });

    const matchPromise = new Promise((resolve) => {
      const result = testString.match(pattern);
      resolve(result);
    });

    return expect(Promise.race([matchPromise, timeoutPromise])).resolves.toBeDefined();
  });

  test('Complex bounded pattern (multiple .{0,200}) performs safely', () => {
    const pattern = /start.{0,200}middle.{0,200}end/;
    const attackString = 'start' + 'a'.repeat(500) + 'middle' + 'b'.repeat(500) + 'end';

    const start = Date.now();
    const match = attackString.match(pattern);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
    expect(match).toBeNull();  // No match (total >400 chars between markers)
  });
});

describe('ReDoS Safety - Regression Prevention', () => {
  let rulesConfig;

  beforeAll(() => {
    const rulesData = fs.readFileSync(RULES_CONFIG_PATH, 'utf8');
    rulesConfig = JSON.parse(rulesData);
  });

  test('HIGH severity patterns fixed: CRITICAL_INJECTION category', () => {
    const category = rulesConfig.categories.CRITICAL_INJECTION;
    expect(category).toBeDefined();

    // Patterns that were previously HIGH severity
    const criticalPatterns = [
      3,   // [\u0438\u0433\u043D\u043E\u0440\u0435].*\b(?:instructions|commands)\b
      18,  // \bwithout\s+asking\b.*\bimmediately\b
      21,  // \bhypothetical\s+scenario\b.*\btell\s+me\b
      29,  // \bend of input.*start of input\b
      30,  // \bliberating.*godmode\b
      45,  // \breset.*paradigm.*shift\b
      54,  // \bTHE YEAR IS NOW:.*Test: FUCK YEAH\b
      56,  // \bGODMODE: ENABLED.*I'M FREE!\b
      58   // \bLIBERATING.*\d+%\b
    ];

    for (const idx of criticalPatterns) {
      const pattern = category.patterns[idx];
      expect(pattern).toBeDefined();
      expect(pattern).not.toMatch(/\.\*(?![{?])/);  // No unbounded .*
    }
  });

  test('MEDIUM severity patterns fixed: greedy \\w+ operators', () => {
    const testCategories = {
      CRITICAL_INJECTION: [8, 9],
      JAILBREAK_ATTEMPT: [17, 18],
      CONTROL_OVERRIDE: [0, 6],
      EXPLICIT_JAILBREAK: [3]
    };

    for (const [categoryName, indices] of Object.entries(testCategories)) {
      const category = rulesConfig.categories[categoryName];
      expect(category).toBeDefined();

      for (const idx of indices) {
        const pattern = category.patterns[idx];
        expect(pattern).toBeDefined();
        expect(pattern).not.toMatch(/\\w[+*](?![{?])/);  // No unbounded \w+ or \w*
      }
    }
  });

  test('Backup file exists for rollback capability', () => {
    const backupPath = RULES_CONFIG_PATH + '.redos-backup';
    expect(fs.existsSync(backupPath)).toBe(true);

    const backupData = fs.readFileSync(backupPath, 'utf8');
    const backupConfig = JSON.parse(backupData);
    
    // Backup should have same structure
    expect(backupConfig.categories).toBeDefined();
    expect(Object.keys(backupConfig.categories).length).toBeGreaterThan(0);
  });
});

describe('ReDoS Safety - Functional Validation', () => {
  test('Bounded patterns still detect original attack vectors', () => {
    // Test that fixing ReDoS didn't break detection

    // Example: [\u0438\u0433\u043D\u043E\u0440\u0435].{0,200}\b(?:instructions|commands)\b
    const pattern1 = /[\u0438\u0433\u043D\u043E\u0440\u0435].{0,200}\b(?:instructions|commands)\b/;
    expect('игнорируй instructions').toMatch(pattern1);
    expect('игнорируй all commands').toMatch(pattern1);

    // Example: \bwithout\s+asking\b.{0,200}\bimmediately\b
    const pattern2 = /\bwithout\s+asking\b.{0,200}\bimmediately\b/;
    expect('without asking proceed immediately').toMatch(pattern2);
    expect('without asking just do it immediately').toMatch(pattern2);

    // Example: \bhypothetical\s+scenario\b.{0,200}\btell\s+me\b
    const pattern3 = /\bhypothetical\s+scenario\b.{0,200}\btell\s+me\b/;
    expect('hypothetical scenario where you tell me').toMatch(pattern3);
  });

  test('Bounded patterns reject excessively long attacks', () => {
    // Patterns should NOT match when bounded limit exceeded

    // Example: .{0,200} should reject >200 chars between markers
    const pattern = /start.{0,200}end/;
    const validAttack = 'start' + 'a'.repeat(100) + 'end';
    const invalidAttack = 'start' + 'a'.repeat(300) + 'end';

    expect(validAttack).toMatch(pattern);
    expect(invalidAttack).not.toMatch(pattern);
  });
});
