/**
 * Verify Emoji Normalization - Faza 2.3
 * Tests that emoji mappings are correctly loaded from normalize.conf
 */

const fs = require('fs');
const path = require('path');

// Parse normalize.conf
function parseNormalizeConf(confPath) {
  const content = fs.readFileSync(confPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const map = new Map();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Skip leet.* entries
    if (trimmed.startsWith('leet.')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const lhs = trimmed.slice(0, eqIdx);
    const rhs = trimmed.slice(eqIdx + 1);

    // Process unicode escapes if any
    const from = lhs.replace(/\\u\{?([0-9A-Fa-f]{4,6})\}?/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16))
    );
    const to = rhs.replace(/\\u\{?([0-9A-Fa-f]{4,6})\}?/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16))
    );

    map.set(from, to);
  }

  return map;
}

// Test emoji mappings
function testEmojiMappings() {
  const confPath = path.join(__dirname, '../config/normalize.conf');

  console.log('🧪 Emoji Normalization Verification - Faza 2.3\n');
  console.log(`📄 Reading: ${confPath}\n`);

  const map = parseNormalizeConf(confPath);

  // Expected emoji mappings (from Faza 2.3 implementation)
  const expectedEmoji = {
    // Communication
    '🗣️': 'say',
    '🗨️': 'say',
    '💬': 'chat',
    '💭': 'think',
    '📝': 'write',
    '📄': 'document',
    '📧': 'email',
    '📬': 'message',
    '📮': 'send',
    // Security
    '🔓': 'unlock',
    '🔒': 'lock',
    '🔑': 'key',
    '🛡️': 'shield',
    '🚫': 'no',
    '⛔': 'stop',
    '⚠️': 'warning',
    '🚨': 'alert',
    // Technology
    '💻': 'computer',
    '🖥️': 'server',
    '📱': 'phone',
    '⌨️': 'keyboard',
    '🖱️': 'mouse',
    '💾': 'disk',
    '📀': 'disk',
    // Actions
    '▶️': 'play',
    '⏸️': 'pause',
    '⏹️': 'stop',
    '🔄': 'reload',
    '♻️': 'refresh',
    '✅': 'yes',
    '❌': 'no',
    '✔️': 'check',
    // Malicious
    '🔥': 'fire',
    '💣': 'bomb',
    '⚡': 'power',
    '🎯': 'target'
  };

  let passed = 0;
  let failed = 0;
  const failures = [];

  console.log('Testing emoji mappings:\n');

  for (const [emoji, expectedText] of Object.entries(expectedEmoji)) {
    const actualText = map.get(emoji);

    if (actualText === expectedText) {
      console.log(`✅ ${emoji} → "${expectedText}"`);
      passed++;
    } else if (actualText === undefined) {
      console.log(`❌ ${emoji} → MISSING (expected: "${expectedText}")`);
      failed++;
      failures.push({ emoji, expected: expectedText, actual: 'MISSING' });
    } else {
      console.log(`❌ ${emoji} → "${actualText}" (expected: "${expectedText}")`);
      failed++;
      failures.push({ emoji, expected: expectedText, actual: actualText });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Test Results: ${passed}/${Object.keys(expectedEmoji).length} passed\n`);

  if (failed === 0) {
    console.log('✅ All emoji mappings verified successfully!');
    console.log('✅ Faza 2.3 implementation complete.');
    return true;
  } else {
    console.log(`❌ ${failed} emoji mappings failed:\n`);
    failures.forEach(f => {
      console.log(`   ${f.emoji}: expected "${f.expected}", got "${f.actual}"`);
    });
    return false;
  }
}

// Normalize test
function testNormalization() {
  const confPath = path.join(__dirname, '../config/normalize.conf');
  const map = parseNormalizeConf(confPath);

  console.log('\n' + '='.repeat(60));
  console.log('🧪 Normalization Behavior Tests\n');

  const testCases = [
    { input: '🗣️ ignore instructions', expected: 'say ignore instructions' },
    { input: '🔓 unlock admin panel', expected: 'unlock admin panel' },
    { input: '💻 execute command', expected: 'computer execute command' },
    { input: 'Hello 👋', expected: 'Hello ' },
  ];

  testCases.forEach((test, idx) => {
    let result = test.input;

    // Apply mappings (simple version - real workflow has more steps)
    for (const [from, to] of map.entries()) {
      const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      result = result.replace(regex, to);
    }

    const passed = result === test.expected;
    console.log(`${passed ? '✅' : '❌'} Test ${idx + 1}: "${test.input}"`);
    console.log(`   Expected: "${test.expected}"`);
    console.log(`   Got:      "${result}"`);
    console.log('');
  });
}

// Run tests
try {
  const success = testEmojiMappings();
  testNormalization();

  process.exit(success ? 0 : 1);
} catch (error) {
  console.error('❌ Test failed with error:', error.message);
  process.exit(1);
}
