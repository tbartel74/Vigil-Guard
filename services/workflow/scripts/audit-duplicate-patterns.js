#!/usr/bin/env node
/**
 * Audit Script: Find Duplicate Patterns in rules.config.json
 *
 * This script analyzes rules.config.json to identify duplicate patterns
 * that appear in multiple categories. Duplicate patterns can:
 * - Inflate scores unnecessarily
 * - Make maintenance harder
 * - Cause confusion about which category owns a pattern
 *
 * Usage:
 *   node scripts/audit-duplicate-patterns.js
 *
 * Output:
 *   - Console report of all duplicates
 *   - File: duplicate-patterns-report.txt (if duplicates found)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG_PATH = path.join(__dirname, '../config/rules.config.json');
const REPORT_PATH = path.join(__dirname, '../duplicate-patterns-report.txt');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function loadConfig() {
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    log(`❌ Error loading config: ${error.message}`, 'red');
    process.exit(1);
  }
}

function findDuplicates(config) {
  const patternIndex = new Map(); // pattern -> [{category, weight, multiplier}]
  const categories = config.categories;

  // Build pattern index
  for (const [categoryName, categoryData] of Object.entries(categories)) {
    const patterns = categoryData.patterns || [];
    const baseWeight = categoryData.base_weight;
    const multiplier = categoryData.multiplier;

    patterns.forEach(pattern => {
      if (!patternIndex.has(pattern)) {
        patternIndex.set(pattern, []);
      }
      patternIndex.get(pattern).push({
        category: categoryName,
        baseWeight,
        multiplier,
        effectiveWeight: baseWeight * multiplier
      });
    });
  }

  // Find duplicates (patterns appearing in 2+ categories)
  const duplicates = [];
  for (const [pattern, locations] of patternIndex.entries()) {
    if (locations.length > 1) {
      duplicates.push({ pattern, locations });
    }
  }

  return duplicates;
}

function generateReport(duplicates) {
  if (duplicates.length === 0) {
    log('\n✅ No duplicate patterns found!', 'green');
    log('All patterns are unique across categories.', 'green');
    return null;
  }

  log(`\n⚠️  Found ${duplicates.length} duplicate pattern(s)`, 'yellow');
  log('=' .repeat(80), 'cyan');

  let report = `DUPLICATE PATTERNS AUDIT REPORT
Generated: ${new Date().toISOString()}
Total Duplicates: ${duplicates.length}

${'='.repeat(80)}

`;

  duplicates.forEach((dup, index) => {
    const { pattern, locations } = dup;

    // Console output
    log(`\n${index + 1}. Pattern: ${pattern}`, 'bold');
    log(`   Found in ${locations.length} categories:`, 'cyan');

    locations.forEach(loc => {
      const score = `${loc.baseWeight} × ${loc.multiplier} = ${loc.effectiveWeight}`;
      log(`   - ${loc.category} (weight: ${score})`, 'yellow');
    });

    // File report
    report += `\n${index + 1}. DUPLICATE PATTERN\n`;
    report += `   Pattern: ${pattern}\n`;
    report += `   Appears in ${locations.length} categories:\n\n`;

    locations.forEach(loc => {
      report += `   ├─ Category: ${loc.category}\n`;
      report += `   │  Base Weight: ${loc.baseWeight}\n`;
      report += `   │  Multiplier: ${loc.multiplier}\n`;
      report += `   │  Effective Weight: ${loc.effectiveWeight}\n`;
      report += `   │\n`;
    });

    report += `   Recommendation: Keep in category with highest priority/weight,\n`;
    report += `                   remove from others to avoid double-counting.\n`;
    report += `\n${'-'.repeat(80)}\n`;
  });

  log('\n' + '='.repeat(80), 'cyan');
  log(`Report saved to: ${REPORT_PATH}`, 'blue');

  return report;
}

function main() {
  log('🔍 Auditing rules.config.json for duplicate patterns...', 'bold');
  log(`Config path: ${CONFIG_PATH}`, 'cyan');

  const config = loadConfig();
  const categoryCount = Object.keys(config.categories).length;
  log(`Loaded ${categoryCount} categories\n`, 'green');

  const duplicates = findDuplicates(config);
  const report = generateReport(duplicates);

  if (report) {
    fs.writeFileSync(REPORT_PATH, report, 'utf8');
    log('\n⚠️  Action required: Review and consolidate duplicate patterns', 'yellow');
    process.exit(1); // Exit with error code if duplicates found
  } else {
    log('\n✨ Configuration is clean!', 'green');
    process.exit(0);
  }
}

// Run the audit
main();
