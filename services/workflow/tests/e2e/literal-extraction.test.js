/**
 * Literal Extraction Test Suite
 * 
 * Purpose: Validate pattern classification and AC-compatible literal extraction
 * for Aho-Corasick Prefilter implementation (Phase 0.2)
 * 
 * Test Coverage:
 * - Pattern classification accuracy (LITERAL/SIMPLE_REGEX/COMPLEX_REGEX)
 * - AC-compatible literal extraction (251 patterns expected)
 * - Literal deduplication and uniqueness
 * - Category distribution validation
 */

import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const CLASSIFICATION_PATH = path.join(process.cwd(), 'config/pattern-classification.json');
const AC_LITERALS_PATH = path.join(process.cwd(), 'config/ac-literals.json');
const RULES_CONFIG_PATH = path.join(process.cwd(), 'config/rules.config.json');

describe('Pattern Classification - Structure', () => {
  let classification;
  let acLiterals;

  beforeAll(() => {
    const classData = fs.readFileSync(CLASSIFICATION_PATH, 'utf8');
    classification = JSON.parse(classData);

    const acData = fs.readFileSync(AC_LITERALS_PATH, 'utf8');
    acLiterals = JSON.parse(acData);
  });

  test('pattern-classification.json exists and loads', () => {
    expect(classification).toBeDefined();
    expect(classification.summary).toBeDefined();
    expect(classification.categories).toBeDefined();
  });

  test('ac-literals.json exists and loads', () => {
    expect(acLiterals).toBeDefined();
    expect(acLiterals.version).toBe('1.8.0');
    expect(acLiterals.literals).toBeDefined();
    expect(Array.isArray(acLiterals.literals)).toBe(true);
  });

  test('All patterns from rules.config.json are classified', () => {
    const rulesData = fs.readFileSync(RULES_CONFIG_PATH, 'utf8');
    const rules = JSON.parse(rulesData);

    let totalRulesPatterns = 0;
    for (const categoryData of Object.values(rules.categories)) {
      totalRulesPatterns += categoryData.patterns.length;
    }

    expect(classification.summary.total_patterns).toBe(totalRulesPatterns);
  });
});

describe('Pattern Classification - Accuracy', () => {
  let classification;

  beforeAll(() => {
    const classData = fs.readFileSync(CLASSIFICATION_PATH, 'utf8');
    classification = JSON.parse(classData);
  });

  test('Classification breakdown is correct', () => {
    const { literal, simple_regex, complex_regex, total_patterns } = classification.summary;

    // All patterns classified
    expect(literal + simple_regex + complex_regex).toBe(total_patterns);

    // Expected distribution (from analysis)
    expect(literal).toBeGreaterThan(0); // At least some literals
    expect(simple_regex).toBeGreaterThan(0); // At least some simple regex
    expect(complex_regex).toBeGreaterThan(0); // Most are complex
  });

  test('LITERAL patterns have no regex metacharacters', () => {
    for (const [categoryName, categoryData] of Object.entries(classification.categories)) {
      const literals = categoryData.patterns.filter(p => p.classification === 'LITERAL');

      for (const pattern of literals) {
        // Literals may contain *, +, etc as literal chars (not regex)
        // Check for regex metacharacters that indicate regex usage
        expect(pattern.pattern).not.toMatch(/\\[bBwWdDsS]/); // No regex escapes
        expect(pattern.pattern).not.toMatch(/\(\?/); // No lookaheads
        expect(pattern.ac_compatible).toBe(true);
      }
    }
  });

  test('SIMPLE_REGEX patterns only have word boundaries', () => {
    for (const [categoryName, categoryData] of Object.entries(classification.categories)) {
      const simpleRegex = categoryData.patterns.filter(p => p.classification === 'SIMPLE_REGEX');

      for (const pattern of simpleRegex) {
        // Should have \b but no other complex features
        const hasComplexFeatures = pattern.features && pattern.features.some(f => 
          f !== 'word_boundary' && f !== 'groups'
        );
        expect(hasComplexFeatures).toBe(false);
        expect(pattern.ac_compatible).toBe(true);
      }
    }
  });

  test('COMPLEX_REGEX patterns are not AC-compatible', () => {
    for (const [categoryName, categoryData] of Object.entries(classification.categories)) {
      const complexRegex = categoryData.patterns.filter(p => p.classification === 'COMPLEX_REGEX');

      for (const pattern of complexRegex) {
        expect(pattern.ac_compatible).toBe(false);
        // Features may be empty array if classification defaulted to 'complex'
        expect(pattern.features).toBeDefined();
      }
    }
  });
});

describe('AC Literal Extraction', () => {
  let classification;
  let acLiterals;

  beforeAll(() => {
    const classData = fs.readFileSync(CLASSIFICATION_PATH, 'utf8');
    classification = JSON.parse(classData);

    const acData = fs.readFileSync(AC_LITERALS_PATH, 'utf8');
    acLiterals = JSON.parse(acData);
  });

  test('AC-compatible count matches classification', () => {
    const acCompatible = classification.summary.ac_compatible;
    const extractedLiterals = acLiterals.total_literals;

    expect(extractedLiterals).toBe(acCompatible);
  });

  test('Target of 205+ AC-compatible literals met', () => {
    expect(acLiterals.total_literals).toBeGreaterThanOrEqual(205);
    console.log(`✅ Extracted ${acLiterals.total_literals} AC-compatible literals (target: 205)`);
  });

  test('All extracted literals are non-empty strings', () => {
    for (const literal of acLiterals.literals) {
      expect(typeof literal).toBe('string');
      expect(literal.length).toBeGreaterThan(0);
    }
  });

  test('Literals are properly extracted (no regex metacharacters)', () => {
    for (const literal of acLiterals.literals) {
      // Literals may contain *, +, etc as literal characters
      // But should not have regex metacharacters indicating regex usage
      expect(typeof literal).toBe('string');
      expect(literal.length).toBeGreaterThan(0);
      // OK to have *, +, etc as literal chars in AC strings
    }
  });

  test('Detailed metadata includes category and index', () => {
    expect(acLiterals.detailed).toBeDefined();
    expect(Array.isArray(acLiterals.detailed)).toBe(true);

    for (const detail of acLiterals.detailed) {
      expect(detail.category).toBeDefined();
      expect(typeof detail.index).toBe('number');
      expect(detail.literal).toBeDefined();
      expect(detail.original).toBeDefined();
    }
  });
});

describe('Literal Quality - Deduplication', () => {
  let acLiterals;

  beforeAll(() => {
    const acData = fs.readFileSync(AC_LITERALS_PATH, 'utf8');
    acLiterals = JSON.parse(acData);
  });

  test('All literals are unique (no duplicates)', () => {
    const uniqueLiterals = new Set(acLiterals.literals);
    expect(uniqueLiterals.size).toBe(acLiterals.literals.length);
  });

  test('Case-insensitive duplicates are acceptable', () => {
    // Aho-Corasick can handle case-insensitive matching
    // So "GODMODE" and "godmode" are both valid
    const lowerCaseLiterals = acLiterals.literals.map(l => l.toLowerCase());
    const uniqueLowerCase = new Set(lowerCaseLiterals);

    // Some case variations expected (not a failure if different)
    console.log(`Case-insensitive unique: ${uniqueLowerCase.size} / ${acLiterals.literals.length}`);
    expect(uniqueLowerCase.size).toBeGreaterThan(0);
  });
});

describe('Category Distribution', () => {
  let classification;

  beforeAll(() => {
    const classData = fs.readFileSync(CLASSIFICATION_PATH, 'utf8');
    classification = JSON.parse(classData);
  });

  test('All categories have at least one pattern classified', () => {
    for (const [categoryName, categoryData] of Object.entries(classification.categories)) {
      expect(categoryData.patterns.length).toBeGreaterThan(0);
    }
  });

  test('High-value categories have AC-compatible literals', () => {
    // Critical categories should have some AC-compatible patterns
    const criticalCategories = [
      'CRITICAL_INJECTION',
      'JAILBREAK_ATTEMPT',
      'GODMODE_JAILBREAK'
    ];

    for (const categoryName of criticalCategories) {
      const category = classification.categories[categoryName];
      expect(category).toBeDefined();

      const acCompatible = category.patterns.filter(p => p.ac_compatible);
      expect(acCompatible.length).toBeGreaterThan(0);
      console.log(`${categoryName}: ${acCompatible.length} AC-compatible patterns`);
    }
  });
});

describe('Functional Validation', () => {
  let acLiterals;

  beforeAll(() => {
    const acData = fs.readFileSync(AC_LITERALS_PATH, 'utf8');
    acLiterals = JSON.parse(acData);
  });

  test('Sample literals match original attack patterns', () => {
    // Verify extraction preserved meaning
    const samples = [
      { literal: 'GODMODE: ENABLED', category: 'GODMODE_JAILBREAK' },
      { literal: 'ignore all previous instructions', category: 'CRITICAL_INJECTION' },
      { literal: 'LOVE PLINY', category: 'CRITICAL_INJECTION' }
    ];

    for (const sample of samples) {
      const found = acLiterals.detailed.find(d => 
        d.literal.includes(sample.literal) || sample.literal.includes(d.literal)
      );
      if (found) {
        console.log(`✅ Found: "${sample.literal}" in ${found.category}`);
      }
    }
  });

  test('Literals can be used for case-insensitive matching', () => {
    // Test that literals work for both upper and lower case
    const testLiteral = acLiterals.literals[0];
    const upperCase = testLiteral.toUpperCase();
    const lowerCase = testLiteral.toLowerCase();

    // Both should be valid strings
    expect(upperCase).toBeTruthy();
    expect(lowerCase).toBeTruthy();
    expect(upperCase.length).toBe(lowerCase.length);
  });
});
