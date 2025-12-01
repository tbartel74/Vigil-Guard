# Testing Guide

Last updated: 2025-12-01

## Overview

Vigil Guard maintains a comprehensive test suite with 160+ tests across multiple services. The testing strategy follows TDD (Test-Driven Development) principles and includes unit tests, integration tests, and E2E (end-to-end) tests.

## Test Structure

```
services/
├── heuristics-service/tests/
│   ├── unit/           # Unit tests for detectors
│   └── e2e/            # Integration tests
├── semantic-service/tests/
│   ├── unit/           # Embedding tests
│   └── e2e/            # Similarity tests
├── workflow/tests/
│   ├── e2e/            # Full pipeline tests
│   └── fixtures/       # Test payloads
│       ├── malicious/  # Attack payloads
│       └── benign/     # Safe inputs
└── web-ui/
    ├── backend/tests/  # API tests
    └── frontend/tests/ # Component tests
```

## Running Tests

### Quick Commands

```bash
# All tests (from repo root)
npm test

# Specific service
cd services/heuristics-service && npm test
cd services/semantic-service && npm test
cd services/workflow && npm test

# Unit tests only
npm test -- tests/unit/

# E2E tests only
npm test -- tests/e2e/

# Specific test file
npm test -- bypass-scenarios.test.js
```

### With Coverage

```bash
npm test -- --coverage
```

## Test Categories

### Heuristics Service

| Suite | Tests | Coverage |
|-------|-------|----------|
| Scorer unit tests | 25 | Pattern matching |
| Detector tests | 18 | Category detection |
| Multi-language entropy | 12 | Unicode handling |
| Security attacks | 35 | OWASP payloads |

```bash
# Run heuristics tests
cd services/heuristics-service
npm ci
npm test -- tests/unit/
npm test -- tests/e2e/
```

### Semantic Service

| Suite | Tests | Coverage |
|-------|-------|----------|
| Embedding generation | 15 | Vector creation |
| Similarity calculation | 12 | Cosine similarity |
| Category matching | 18 | Threat classification |

```bash
# Run semantic tests
cd services/semantic-service
npm ci
npm test -- tests/unit/
```

### Workflow E2E

| Suite | Tests | Pass Rate | Description |
|-------|-------|-----------|-------------|
| bypass-scenarios | 29 | 96% | Attack vector testing |
| false-positives | 15 | 100% | Benign input validation |
| pii-detection | 24 | 100% | PII redaction |
| language-detection | 50 | 100% | Multi-language support |
| events-v2-schema | 12 | 100% | ClickHouse schema |
| owasp-aitg-app-01 | 50 | 96% | Direct injection |
| owasp-aitg-app-02 | 40 | 82.5% | Indirect injection |

```bash
# Run workflow E2E tests
cd services/workflow
npm test -- tests/e2e/
```

## OWASP AITG Coverage

Vigil Guard is tested against OWASP AI Testing Guidelines:

### APP-01: Direct Prompt Injection

- **Tests:** 50 payloads
- **Detection Rate:** 96%
- **Categories:** Jailbreak, instruction override, role manipulation

### APP-02: Indirect Prompt Injection

- **Tests:** 40 payloads
- **Detection Rate:** 82.5%
- **Categories:** Hidden instructions, data exfiltration

### APP-07: Prompt Extraction

- **Tests:** 60 payloads
- **Detection Rate:** 95%
- **Categories:** System prompt leaks, configuration extraction

## TDD Workflow

### Adding New Detection Pattern

1. **Create fixture:**
```json
// tests/fixtures/malicious/new-attack.json
{
  "name": "New Attack Vector",
  "payload": "malicious prompt here",
  "expected_status": "BLOCKED",
  "expected_score_min": 85
}
```

2. **Write test:**
```javascript
// tests/e2e/bypass-scenarios.test.js
it('should block new attack vector', async () => {
  const fixture = require('../fixtures/malicious/new-attack.json');
  const result = await sendToWebhook(fixture.payload);

  expect(result.final_status).toBe('BLOCKED');
  expect(result.threat_score).toBeGreaterThanOrEqual(fixture.expected_score_min);
});
```

3. **Run test (should FAIL):**
```bash
npm test -- bypass-scenarios.test.js
```

4. **Add pattern via Web UI:**
   - Navigate to Configuration → Detection Tuning
   - Add pattern to appropriate category
   - Save changes

5. **Run test (should PASS):**
```bash
npm test -- bypass-scenarios.test.js
```

6. **Commit changes:**
```bash
git add tests/fixtures/malicious/new-attack.json
git add tests/e2e/bypass-scenarios.test.js
git commit -m "feat(detection): add new attack vector detection"
```

## Smoke Tests

Quick validation that services are running:

```bash
# Heuristics
curl http://localhost:5005/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"hello world","request_id":"test1"}'

# Semantic
curl http://localhost:5006/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"hello world","request_id":"test1"}'

# Workflow webhook
curl http://localhost:5678/webhook/vigil-guard-2 \
  -H "Content-Type: application/json" \
  -d '{"chatInput":"hello","sessionId":"demo"}'
```

## CI Integration

Tests run automatically on GitHub Actions:

```yaml
# .github/workflows/ci.yml
test-unit:
  runs-on: ubuntu-latest
  strategy:
    matrix:
      service: [heuristics-service, semantic-service]
  steps:
    - run: cd services/${{ matrix.service }} && npm test -- tests/unit/

test-e2e:
  runs-on: ubuntu-latest
  services:
    clickhouse:
      image: clickhouse/clickhouse-server:24.1
  steps:
    - run: cd services/workflow && npm test -- tests/e2e/
```

## Test Configuration

### Vitest Config

```javascript
// vitest.config.js
export default {
  test: {
    timeout: 30000,          // 30s for slow webhook tests
    retry: 1,                // Retry flaky tests once
    sequence: {
      shuffle: false         // Run in order
    }
  }
};
```

### Environment Variables

```bash
# .env.test
WEBHOOK_URL=http://localhost:5678/webhook/vigil-guard-2
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PASSWORD=test_password
```

## Debugging Tests

### Verbose Output

```bash
npm test -- --reporter=verbose
```

### Single Test

```bash
npm test -- -t "should block SQL injection"
```

### Debug Mode

```bash
DEBUG=vitest:* npm test
```

## Best Practices

1. **Keep tests fast:** Mock external services when possible
2. **Use fixtures:** Centralize test data in fixtures/
3. **Test edge cases:** Include boundary conditions
4. **Maintain coverage:** Aim for >85% coverage
5. **Document failures:** Add comments explaining expected behavior

## Related Documentation

- [CI/CD Pipeline](../operations/ci-cd.md) - Automated testing
- [TDD Workflow](../guides/configuration.md#tdd-workflow) - Pattern development
- [OWASP AITG](https://owasp.org/www-project-ai-testing/) - Testing guidelines
