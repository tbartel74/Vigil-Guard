/**
 * Progress Reporter for Vigil Guard Tests v3.0
 *
 * Features:
 * - Single-line progress bar (nie zmienia ekranów)
 * - Nazwa kategorii OWASP wyświetlana nad paskiem
 * - Wyniki w formie ASCII tabeli na końcu
 *
 * Taksonomia zgodna z OWASP LLM Top 10 (2025)
 * Źródło: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
 */

export class ProgressReporter {
  constructor() {
    this.total = 0;
    this.current = 0;
    this.passed = 0;
    this.failed = 0;
    this.currentCategory = '';
    this.results = [];
    this.categoryStats = {};
    this.startTime = 0;
  }

  /**
   * Inicjalizacja reportera
   */
  init({ total, categories }) {
    this.total = total;
    this.startTime = Date.now();
    categories.forEach(c => {
      this.categoryStats[c] = { passed: 0, failed: 0, total: 0 };
    });
    this.printHeader();
  }

  /**
   * Header tabeli
   */
  printHeader() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║            VIGIL GUARD DETECTION TEST SUITE v3.0               ║');
    console.log('║            OWASP LLM Top 10 Compliance Testing                 ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total tests: ${this.total.toString().padEnd(4)}  |  Categories: ${Object.keys(this.categoryStats).length} (OWASP aligned)          ║`);
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  }

  /**
   * Zmiana kategorii (jednoliniowa, nad progress barem)
   */
  setCategory(name, range) {
    this.currentCategory = name;
    // Wyświetl zmianę kategorii (jednoliniowo, bez nowego ekranu)
    process.stdout.write(`\r\x1b[K📁 ${name} [${range}]  `);
    console.log('');
  }

  /**
   * Update progress bar (jednoliniowy, carriage return)
   */
  update(index, status, score, payload) {
    this.current = index + 1;
    const category = this.currentCategory;

    // Sprawdź czy wykryto (BLOCKED lub SANITIZED dla malicious, lub score >= 30)
    const isBenign = category === 'BENIGN_FP';
    let detected;

    if (isBenign) {
      // Dla benign: ALLOWED = sukces (brak false positive)
      detected = status === 'ALLOWED';
    } else {
      // Dla malicious: BLOCKED/SANITIZED lub score >= 30 = sukces
      detected = status === 'BLOCKED' || status === 'SANITIZED' || score >= 30;
    }

    if (detected) {
      this.passed++;
      if (this.categoryStats[category]) {
        this.categoryStats[category].passed++;
      }
    } else {
      this.failed++;
      if (this.categoryStats[category]) {
        this.categoryStats[category].failed++;
      }
    }
    if (this.categoryStats[category]) {
      this.categoryStats[category].total++;
    }

    // Progress bar (50 znaków szerokości)
    const percent = Math.floor((this.current / this.total) * 100);
    const filled = Math.floor(percent / 2);
    const empty = 50 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    const statusIcon = detected ? '✅' : '❌';

    // Single line update (carriage return, nie nowy ekran)
    process.stdout.write(`\r[${bar}] ${percent}% (${this.current}/${this.total}) ${statusIcon}`);

    // Store result for final table
    this.results.push({
      index: this.current,
      category,
      status,
      score,
      detected,
      payload: (payload || '').substring(0, 50)
    });
  }

  /**
   * Finalna tabela wyników
   */
  printFinalTable() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    console.log('\n\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║              OWASP LLM TOP 10 DETECTION RESULTS                ║');
    console.log('╠══════════════════════╦═════════╦═════════╦═══════════╦════════╣');
    console.log('║ OWASP Category       ║ Passed  ║ Failed  ║ Detection ║ Status ║');
    console.log('╠══════════════════════╬═════════╬═════════╬═══════════╬════════╣');

    // Sort categories: LLM01_* first, then LLM10_*, then BENIGN_FP
    const sortedCategories = Object.entries(this.categoryStats)
      .filter(([, stats]) => stats.total > 0)
      .sort((a, b) => {
        if (a[0].startsWith('LLM01') && !b[0].startsWith('LLM01')) return -1;
        if (!a[0].startsWith('LLM01') && b[0].startsWith('LLM01')) return 1;
        if (a[0].startsWith('LLM10') && !b[0].startsWith('LLM10')) return -1;
        if (!a[0].startsWith('LLM10') && b[0].startsWith('LLM10')) return 1;
        return a[0].localeCompare(b[0]);
      });

    for (const [category, stats] of sortedCategories) {
      const rate = ((stats.passed / stats.total) * 100).toFixed(1) + '%';
      const statusIcon = parseFloat(rate) >= 70 ? '✅' : (parseFloat(rate) >= 50 ? '⚠️' : '❌');

      console.log(
        `║ ${category.substring(0, 20).padEnd(20)} ║ ${stats.passed.toString().padStart(7)} ║ ` +
        `${stats.failed.toString().padStart(7)} ║ ${rate.padStart(9)} ║ ${statusIcon.padStart(4)}   ║`
      );
    }

    const overallRate = ((this.passed / this.total) * 100).toFixed(1);
    console.log('╠══════════════════════╩═════════╩═════════╩═══════════╩════════╣');
    console.log(`║ TOTAL: ${this.passed}/${this.total} (${overallRate}%)`.padEnd(40) +
                `Time: ${elapsed}s`.padStart(24) + ' ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Print failed payloads grouped by category
    const failures = this.results.filter(r => !r.detected);
    if (failures.length > 0 && failures.length <= 30) {
      console.log('\n📋 Failed Detections by OWASP Category:');
      failures.forEach(f => {
        console.log(`   ${f.category} #${f.index}: (score: ${f.score}) "${f.payload}..."`);
      });
    } else if (failures.length > 30) {
      console.log(`\n📋 ${failures.length} failed detections (showing first 15):`);
      failures.slice(0, 15).forEach(f => {
        console.log(`   ${f.category} #${f.index}: (score: ${f.score}) "${f.payload}..."`);
      });
    }

    // Return stats for assertions
    return {
      total: this.total,
      passed: this.passed,
      failed: this.failed,
      detectionRate: parseFloat(overallRate),
      categoryStats: this.categoryStats
    };
  }
}
