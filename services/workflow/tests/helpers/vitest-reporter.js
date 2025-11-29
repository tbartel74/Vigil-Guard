/**
 * Custom Vitest Reporter with Progress Bar
 *
 * Features:
 * - Single progress bar at the bottom of screen
 * - One line above showing current test name
 * - ASCII table at the end with results
 * - No scrolling output during test execution
 */

const ESC = '\x1b';
const CLEAR_LINE = `${ESC}[2K`;
const CURSOR_UP = `${ESC}[1A`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

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
    this.results = [];
    this.initialized = false;
  }

  onInit() {
    this.startTime = Date.now();
  }

  onCollected(files) {
    // Count all tests recursively
    let total = 0;
    const countTests = (tasks) => {
      if (!tasks) return;
      for (const task of tasks) {
        if (task.type === 'test') {
          total++;
        } else if (task.type === 'suite' && task.tasks) {
          countTests(task.tasks);
        }
      }
    };

    files.forEach(file => countTests(file.tasks));
    this.total = total;

    // Initialize display
    if (!this.initialized && process.stdout.isTTY) {
      this.initialized = true;
      process.stdout.write(HIDE_CURSOR);
      this.printHeader();
      process.stdout.write('\n\n'); // Space for progress bar
    }
  }

  printHeader() {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║            VIGIL GUARD TEST SUITE v3.0                         ║');
    console.log('║            Progress Bar Mode                                   ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total tests: ${this.total.toString().padEnd(4)}                                              ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝');
  }

  onTaskUpdate(packs, errors, ctx) {
    for (const pack of packs) {
      const [taskId, result, meta] = pack;

      // Try to get task name from context
      let taskName = this.currentTest;
      if (ctx?.state) {
        const task = ctx.state.idMap.get(taskId);
        if (task) {
          taskName = task.name || 'Unknown';
          this.currentTest = taskName;
          // Get file from task
          if (task.file?.name) {
            this.currentFile = task.file.name.split('/').pop();
          }
        }
      }

      if (result?.state === 'pass') {
        this.passed++;
        this.completed++;
      } else if (result?.state === 'fail') {
        this.failed++;
        this.completed++;
        // Store failed test info
        this.results.push({
          name: taskName,
          file: this.currentFile,
          state: 'fail'
        });
      } else if (result?.state === 'skip') {
        this.skipped++;
        this.completed++;
      }
    }

    this.updateProgressBar();
  }

  onTestFilePrepare(file) {
    if (file?.name) {
      this.currentFile = file.name.split('/').pop();
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
    this.updateProgressBar();
  }

  updateProgressBar() {
    if (!process.stdout.isTTY) return;

    const percent = this.total > 0 ? Math.floor((this.completed / this.total) * 100) : 0;
    const filled = Math.floor(percent / 2);
    const empty = 50 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    const passIcon = this.failed === 0 ? '✅' : '⚠️';
    const stats = `${this.passed}✓ ${this.failed}✗ ${this.skipped}○`;

    // Move cursor up 2 lines, clear, print, move back
    process.stdout.write(CURSOR_UP + CURSOR_UP);
    process.stdout.write(CLEAR_LINE);

    // Current test line (truncated to 60 chars)
    const testName = `📋 ${this.currentFile}: ${this.currentTest}`.substring(0, 65);
    process.stdout.write(`${testName}\n`);

    process.stdout.write(CLEAR_LINE);
    // Progress bar line
    process.stdout.write(`[${bar}] ${percent}% (${this.completed}/${this.total}) ${stats} ${passIcon}\n`);
  }

  onFinished(files, errors) {
    if (process.stdout.isTTY) {
      process.stdout.write(SHOW_CURSOR);
    }

    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const total = this.passed + this.failed + this.skipped;
    const passRate = total > 0 ? ((this.passed / total) * 100).toFixed(1) : 0;

    // Clear progress area and print final results
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    FINAL TEST RESULTS                          ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  ✅ Passed:  ${this.passed.toString().padEnd(5)}                                            ║`);
    console.log(`║  ❌ Failed:  ${this.failed.toString().padEnd(5)}                                            ║`);
    console.log(`║  ⏭️  Skipped: ${this.skipped.toString().padEnd(5)}                                            ║`);
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total: ${total} tests (${passRate}% pass rate)`.padEnd(43) + `Time: ${elapsed}s`.padStart(20) + ' ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Show failed tests
    if (this.results.length > 0) {
      console.log('\n📋 Failed Tests:');
      this.results.slice(0, 10).forEach(r => {
        console.log(`   ❌ ${r.file}: ${r.name}`);
      });
      if (this.results.length > 10) {
        console.log(`   ... and ${this.results.length - 10} more`);
      }
    }
  }

  onWatcherStart() {}
  onWatcherRerun() {}
  onServerRestart() {}
  onUserConsoleLog() {}
}
