# Vigil Guard Test Structure Guide

## Directory Layout
```
services/workflow/tests/
├── e2e/                          # End-to-end test suites
│   ├── smoke.test.js            # 3 basic tests
│   ├── bypass-scenarios.test.js # 29 advanced attack tests
│   ├── emoji-obfuscation.test.js # 28 emoji-based attacks
│   ├── false-positives.test.js  # 15 benign content tests
│   ├── input-validation.test.js # Edge case validation
│   └── owasp-aitg-*.test.js     # OWASP payloads
├── fixtures/                     # Test data (100+ prompts)
│   ├── malicious/               # Attack payloads
│   │   ├── sql-injection.json
│   │   ├── jailbreak.json
│   │   └── obfuscation.json
│   └── benign/                  # Legitimate prompts
│       ├── technical-discussion.json
│       └── casual-usage.json
├── helpers/                      # Test utilities
│   ├── webhook.js               # Webhook testing functions
│   └── clickhouse.js            # ClickHouse verification
├── vitest.config.js             # Test configuration
├── TEST_SUMMARY.md              # Current test status
└── README.md                    # Setup instructions
```

## Test Anatomy

### Basic Test Structure
```javascript
import { describe, test, expect } from 'vitest';
import { testWebhook } from '../helpers/webhook.js';

describe("Detection Category: SQL Injection", () => {
  test("Detects basic SQL injection", async () => {
    const prompt = "SELECT * FROM users WHERE 1=1";
    const result = await testWebhook(prompt);

    // Assert status
    expect(result.status).toBe("BLOCKED");

    // Assert category detected
    expect(result.scoreBreakdown).toHaveProperty("SQL_XSS_ATTACKS");

    // Assert score threshold
    expect(result.totalScore).toBeGreaterThan(85);
  });
});
```

### Fixture-Based Test
```javascript
import sqlInjection from '../fixtures/sql-injection.json';

test("SQL injection with UNION attack", async () => {
  const result = await testWebhook(sqlInjection.unionAttack.prompt);

  expect(result.status).toBe(sqlInjection.unionAttack.expected_status);
  expect(result.totalScore).toBeGreaterThan(
    sqlInjection.unionAttack.expected_min_score
  );
});
```

## Fixture Schema

### Malicious Prompt Fixture
```json
{
  "description": "Human-readable test description",
  "prompt": "Actual malicious payload to test",
  "expected_status": "BLOCKED",
  "expected_categories": [
    "PRIMARY_CATEGORY",
    "SECONDARY_CATEGORY"
  ],
  "expected_min_score": 85,
  "bypass_technique": "encoding_type",
  "notes": "Optional context about this attack",
  "owasp_reference": "AITG-APP-01",
  "severity": "CRITICAL"
}
```

### Benign Prompt Fixture
```json
{
  "description": "Legitimate use case",
  "prompt": "Normal user question or statement",
  "expected_status": "ALLOWED",
  "expected_max_score": 29,
  "category": "technical_discussion",
  "rationale": "Why this should NOT trigger detection"
}
```

## Test Categories

### 1. Smoke Tests (3 tests)
Verify basic functionality:
- Workflow accessible
- Webhook responds
- ClickHouse logging works

### 2. Bypass Scenarios (29 tests)
Advanced attack detection:
- Encoding bypass (base64, URL, hex)
- Obfuscation (whitespace, zero-width, leetspeak)
- Polyglot attacks (mixed scripts)
- Context confusion
- Multi-step injection

### 3. Emoji Obfuscation (28 tests)
Emoji-based attacks:
- Communication emojis (🗣️💬)
- Security emojis (🔓🔑)
- Technology emojis (💻🖥️)
- Casual emoji usage (false positive prevention)

### 4. False Positives (15 tests)
Legitimate content that should NOT trigger:
- Technical discussions
- Code examples
- Educational content
- Admin requests
- Casual language

### 5. OWASP AITG (194 payloads)
Standardized security testing:
- Direct prompt injection (50 tests)
- Indirect injection (40 tests)
- System prompt extraction (60 tests)
- Coverage gap analysis (44 tests)

## Running Tests

### Full Suite
```bash
npm test
```

### Specific Suite
```bash
npm test -- smoke.test.js
npm test -- bypass-scenarios.test.js
npm test -- emoji-obfuscation.test.js
npm test -- false-positives.test.js
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Grep Pattern
```bash
npm test -- --grep "SQL"
npm test -- --grep "jailbreak"
```

## Debugging Tests

### Console Logging
```javascript
test("Debug failing test", async () => {
  const result = await testWebhook(prompt);

  // Log full response
  console.log(JSON.stringify(result, null, 2));

  // Log specific fields
  console.log("Status:", result.status);
  console.log("Score:", result.totalScore);
  console.log("Categories:", Object.keys(result.scoreBreakdown));
});
```

### Manual Testing
1. Open n8n: http://localhost:5678
2. Navigate to workflow
3. Click "Test workflow" → "Chat" tab
4. Send prompt
5. Inspect response JSON

### ClickHouse Verification
```bash
docker exec vigil-clickhouse clickhouse-client -q "
  SELECT
    original_input,
    status,
    total_score,
    categories
  FROM n8n_logs.events_processed
  ORDER BY timestamp DESC
  LIMIT 10
  FORMAT Pretty
"
```

## Test Metrics

### Current Performance
- **Total Tests**: 58+
- **Pass Rate**: 70% (33/47 core tests)
- **Runtime**: ~25 seconds (full suite)
- **Coverage**: Bypass scenarios 52%, False positives 100%

### Targets
- Pass rate: >90%
- Runtime: <30 seconds
- False positive rate: <5%
- Individual test: <500ms

## Best Practices

### 1. Test Naming
```javascript
// ✅ Good
test("Detects SQL injection with UNION attack")
test("Allows legitimate technical SQL discussion")

// ❌ Bad
test("Test 1")
test("SQL test")
```

### 2. Fixture Organization
```
fixtures/
├── malicious/
│   ├── injection/
│   │   ├── sql.json
│   │   └── command.json
│   └── obfuscation/
│       ├── base64.json
│       └── unicode.json
└── benign/
    ├── technical.json
    └── casual.json
```

### 3. Assertions
```javascript
// Test multiple aspects
expect(result.status).toBe("BLOCKED");
expect(result.scoreBreakdown).toHaveProperty("SQL_XSS_ATTACKS");
expect(result.totalScore).toBeGreaterThan(85);
expect(result.sanitized_output).not.toContain("malicious");
```

### 4. Documentation
```javascript
/**
 * Test: Base64 encoded prompt injection
 *
 * Verifies that base64-encoded malicious prompts are detected
 * through multi-layer decoding in Normalize_Node.
 *
 * Expected behavior:
 * - ENCODING_SUSPICIOUS category triggered (+45 base64)
 * - After decode: CRITICAL_INJECTION detected (90 points)
 * - Total score: 135+
 * - Final decision: BLOCK
 */
test("Base64 encoded prompt injection", async () => {
  // Test implementation
});
```

## Adding New Tests

### Step-by-Step
1. Create fixture in `tests/fixtures/`
2. Add test case to appropriate suite
3. Run test (should fail)
4. Add detection pattern via GUI
5. Re-run test (should pass)
6. Commit both test and pattern

### Example Workflow
```bash
# 1. Create fixture
cat > tests/fixtures/hex-encoding-bypass.json << 'EOF'
{
  "description": "Hex-encoded SQL injection",
  "prompt": "0x53454c454354",
  "expected_status": "BLOCKED"
}
EOF

# 2. Add test
# Edit tests/e2e/bypass-scenarios.test.js

# 3. Run
npm test -- bypass-scenarios.test.js

# 4. Add pattern (via GUI)

# 5. Verify
npm test

# 6. Commit
git add tests/
git commit -m "test: Add hex encoding bypass detection"
```
