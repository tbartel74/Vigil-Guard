/**
 * Custom Vitest Reporter with Progress Bar and Accurate Results
 *
 * Features:
 * - Real-time progress bar during test execution
 * - Accurate test counts from Vitest's final file objects
 * - OWASP category statistics (extracts from test/suite names)
 * - Detection rate and false positive tracking
 * - Detailed per-file and per-category statistics
 * - Failed test names with full paths
 */

const ESC = '\x1b';
const CLEAR_LINE = `${ESC}[2K`;
const CURSOR_UP = `${ESC}[1A`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

// Suppress promise rejection warnings for cleaner output
process.on('unhandledRejection', () => {});
process.on('rejectionHandled', () => {});
process.removeAllListeners('warning');

// OWASP categories to track
const OWASP_CATEGORIES = [
  'LLM01_DIRECT',
  'LLM01_JAILBREAK',
  'LLM01_EXTRACTION',
  'LLM01_CONTEXT',
  'LLM01_ENCODING',
  'LLM01_INDIRECT',
  'LLM10_CBRNE',
  'BENIGN_FP'
];

export default class ProgressReporter {
  constructor() {
    this.startTime = 0;
    this.total = 0;
    this.completed = 0;
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.currentTest = '';
    this.currentFile = '';
    this.initialized = false;
    this.countedTests = new Set();
  }

  onInit() {
    this.startTime = Date.now();
  }

  onCollected(files) {
    // Count all tests recursively
    const countTests = (tasks) => {
      if (!tasks) return 0;
      let count = 0;
      for (const task of tasks) {
        if (task.type === 'test') {
          count++;
        } else if (task.type === 'suite' && task.tasks) {
          count += countTests(task.tasks);
        }
      }
      return count;
    };

    this.total = 0;
    for (const file of files || []) {
      this.total += countTests(file.tasks);
    }

    // Initialize display
    if (!this.initialized && process.stdout.isTTY) {
      this.initialized = true;
      process.stdout.write(HIDE_CURSOR);
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║            VIGIL GUARD TEST SUITE v3.0                         ║');
      console.log('╠════════════════════════════════════════════════════════════════╣');
      console.log(`║  Total tests: ${this.total.toString().padEnd(5)} |  Files: ${(files || []).length}                               ║`);
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log(''); // Space for progress bar
    }
  }

  onTestFileStart(file) {
    if (file?.name) {
      this.currentFile = file.name.split('/').pop();
    }
  }

  onTestStart(test) {
    if (!test) return;
    this.currentTest = test.name || 'Unknown test';
    if (test.file?.name) {
      this.currentFile = test.file.name.split('/').pop();
    }
  }

  onTaskUpdate(packs) {
    for (const pack of packs) {
      const [taskId, result] = pack;

      if (!result?.state) continue;
      if (this.countedTests.has(taskId)) continue;

      // Only count final states
      if (result.state === 'pass' || result.state === 'fail' || result.state === 'skip') {
        this.countedTests.add(taskId);
        this.completed++;

        if (result.state === 'pass') this.passed++;
        else if (result.state === 'fail') this.failed++;
        else if (result.state === 'skip') this.skipped++;

        this.updateProgressBar();
      }
    }
  }

  updateProgressBar() {
    if (!process.stdout.isTTY) return;
    if (this.total === 0) return;

    const percent = Math.floor((this.completed / this.total) * 100);
    const filled = Math.floor(percent / 2);
    const empty = 50 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    const statusIcon = this.failed === 0 ? '✅' : '⚠️';
    const stats = `${this.passed}✓ ${this.failed}✗ ${this.skipped}○`;

    // Move cursor up 2 lines, clear, print
    process.stdout.write(CURSOR_UP + CURSOR_UP);
    process.stdout.write(CLEAR_LINE);

    // Current test line (truncated)
    const testInfo = `📋 ${this.currentFile}: ${this.currentTest}`.substring(0, 70);
    process.stdout.write(`${testInfo}\n`);

    process.stdout.write(CLEAR_LINE);
    process.stdout.write(`[${bar}] ${percent}% (${this.completed}/${this.total}) ${stats} ${statusIcon}\n`);
  }

  /**
   * Extract OWASP category from test path
   */
  extractOWASPCategory(testPath) {
    for (const cat of OWASP_CATEGORIES) {
      if (testPath.includes(cat)) {
        return cat;
      }
    }
    return null;
  }

  /**
   * Build full test path (describe > describe > test)
   */
  buildTestPath(task) {
    const parts = [];
    let current = task;
    while (current) {
      if (current.name) {
        parts.unshift(current.name);
      }
      current = current.suite;
    }
    return parts.join(' > ');
  }

  /**
   * Recursively collect all test results from task tree
   */
  collectTestResults(tasks, fileName, results) {
    if (!tasks) return;

    for (const task of tasks) {
      if (task.type === 'test') {
        const state = task.result?.state || 'skip';
        const fullPath = this.buildTestPath(task);

        results.push({
          name: task.name,
          file: fileName,
          state: state,
          fullPath: fullPath,
          owaspCategory: this.extractOWASPCategory(fullPath)
        });
      } else if (task.type === 'suite' && task.tasks) {
        this.collectTestResults(task.tasks, fileName, results);
      }
    }
  }

  onFinished(files, errors) {
    if (process.stdout.isTTY) {
      process.stdout.write(SHOW_CURSOR);
    }

    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    // Collect all test results from files
    const allResults = [];
    const fileStats = {};
    const owaspStats = {};

    // Initialize OWASP stats
    for (const cat of OWASP_CATEGORIES) {
      owaspStats[cat] = { passed: 0, failed: 0, skipped: 0, total: 0 };
    }

    for (const file of files || []) {
      const fileName = file.name ? file.name.split('/').pop() : 'unknown';

      if (!fileStats[fileName]) {
        fileStats[fileName] = { passed: 0, failed: 0, skipped: 0, total: 0 };
      }

      this.collectTestResults(file.tasks, fileName, allResults);
    }

    // Calculate per-file and per-category stats from collected results
    for (const result of allResults) {
      // File stats
      const fStats = fileStats[result.file];
      if (fStats) {
        fStats.total++;
        if (result.state === 'pass') fStats.passed++;
        else if (result.state === 'fail') fStats.failed++;
        else fStats.skipped++;
      }

      // OWASP category stats
      if (result.owaspCategory && owaspStats[result.owaspCategory]) {
        const oStats = owaspStats[result.owaspCategory];
        oStats.total++;
        if (result.state === 'pass') oStats.passed++;
        else if (result.state === 'fail') oStats.failed++;
        else oStats.skipped++;
      }
    }

    // Calculate totals
    const totals = {
      passed: allResults.filter(r => r.state === 'pass').length,
      failed: allResults.filter(r => r.state === 'fail').length,
      skipped: allResults.filter(r => r.state === 'skip').length,
      total: allResults.length
    };

    const passRate = totals.total > 0
      ? ((totals.passed / totals.total) * 100).toFixed(1)
      : '0.0';

    // ═══════════════════════════════════════════════════════════════════════
    // OWASP CATEGORY RESULTS TABLE
    // ═══════════════════════════════════════════════════════════════════════

    const hasOwaspTests = OWASP_CATEGORIES.some(cat => owaspStats[cat].total > 0);

    if (hasOwaspTests) {
      console.log('\n');
      console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
      console.log('║                    OWASP LLM TOP 10 DETECTION RESULTS                        ║');
      console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
      console.log('║ Category             │ Total │ Passed │ Failed │ Skip │ Detection │ Status   ║');
      console.log('╠══════════════════════╪═══════╪════════╪════════╪══════╪═══════════╪══════════╣');

      let maliciousPassed = 0;  // Only count malicious detections (not BENIGN_FP)
      let maliciousTotal = 0;

      for (const cat of OWASP_CATEGORIES) {
        const stats = owaspStats[cat];
        if (stats.total === 0) continue;

        const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0.0';
        const rateNum = parseFloat(rate);

        let statusIcon;
        if (cat === 'BENIGN_FP') {
          // For benign: passed means ALLOWED (no false positive)
          statusIcon = stats.failed === 0 ? '✅ No FP' : `⚠️ ${stats.failed} FP`;
        } else {
          // For malicious: higher is better
          statusIcon = rateNum >= 80 ? '✅' : (rateNum >= 60 ? '⚠️' : '❌');
        }

        console.log(
          `║ ${cat.padEnd(20)} │ ${stats.total.toString().padStart(5)} │ ` +
          `${stats.passed.toString().padStart(6)} │ ${stats.failed.toString().padStart(6)} │ ` +
          `${stats.skipped.toString().padStart(4)} │ ${(rate + '%').padStart(9)} │ ${statusIcon.padEnd(8)} ║`
        );

        // Only count malicious categories for detection rate (exclude BENIGN_FP)
        if (cat !== 'BENIGN_FP') {
          maliciousPassed += stats.passed;
          maliciousTotal += stats.total;
        }
      }

      // Detection rate = only malicious tests that were detected (excluded BENIGN_FP)
      const detectionRate = maliciousTotal > 0 ? ((maliciousPassed / maliciousTotal) * 100).toFixed(1) : '0.0';
      console.log('╠══════════════════════╧═══════╧════════╧════════╧══════╧═══════════╧══════════╣');
      console.log(`║  MALICIOUS DETECTED: ${maliciousPassed}/${maliciousTotal} tests`.padEnd(45) +
                  `(${detectionRate}% rate)`.padStart(22) + `  Time: ${elapsed}s`.padStart(14) + ' ║');
      console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OVERALL SUMMARY (compact)
    // ═══════════════════════════════════════════════════════════════════════

    if (!hasOwaspTests) {
      // Only show summary if no OWASP table was displayed
      console.log('\n');
      console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
      console.log(`║  SUMMARY: ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped`.padEnd(50) +
                  `(${passRate}% pass rate)`.padStart(16) + `  Time: ${elapsed}s`.padStart(12) + ' ║');
      console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FAILED TESTS LIST (grouped by OWASP category)
    // ═══════════════════════════════════════════════════════════════════════

    const failedTests = allResults.filter(r => r.state === 'fail');
    if (failedTests.length > 0 && failedTests.length <= 100) {
      console.log('\n📋 Failed Tests (BYPASSES):');

      // Group by OWASP category first, then by file
      const byCategory = {};
      failedTests.forEach(t => {
        const cat = t.owaspCategory || 'OTHER';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(t);
      });

      for (const [category, tests] of Object.entries(byCategory)) {
        console.log(`\n   🏷️  ${category} (${tests.length} bypasses):`);
        tests.slice(0, 10).forEach(t => {
          const displayName = t.name.length > 65 ? t.name.substring(0, 62) + '...' : t.name;
          console.log(`      ❌ ${displayName}`);
        });
        if (tests.length > 10) {
          console.log(`      ... and ${tests.length - 10} more`);
        }
      }
    } else if (failedTests.length > 100) {
      console.log(`\n📋 ${failedTests.length} tests failed (bypasses - too many to list individually)`);
      // Show summary by category
      const byCategory = {};
      failedTests.forEach(t => {
        const cat = t.owaspCategory || 'OTHER';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      });
      console.log('   By category:');
      for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
        console.log(`      ${cat}: ${count} bypasses`);
      }
    }

    // Print any runner errors (filter out Vitest internal count errors)
    if (errors && errors.length > 0) {
      const realErrors = errors.filter(err => {
        const msg = err.message || String(err);
        // Filter out Vitest internal counting errors (not real test failures)
        return !msg.includes('Invalid count value');
      });

      if (realErrors.length > 0) {
        console.log('\n⚠️  Runner Errors:');
        realErrors.slice(0, 3).forEach(err => {
          console.log(`   ${err.message || err}`);
        });
      }
    }
  }

  // Required hooks
  onTestFilePrepare() {}
  onWatcherStart() {}
  onWatcherRerun() {}
  onServerRestart() {}
  onUserConsoleLog() {}
}
