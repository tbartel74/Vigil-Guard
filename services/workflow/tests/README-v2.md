# Vigil Guard v2.0.0 Test Suite

Complete test suite for Vigil Guard 3-Branch Detection Architecture.

## Architecture Overview

```
Input → Language Detection → PII Detection → 3-Branch Pipeline → Arbiter → Final Decision
                                                    │
                                    ┌───────────────┼───────────────┐
                                    │               │               │
                               Branch A        Branch B        Branch C
                             (Heuristics)     (Semantic)   (LLM Safety Engine Analysis)
                                    │               │               │
                                    └───────────────┼───────────────┘
                                                    │
                                                Arbiter
                                                    │
                                             Final Decision
                                          (ALLOW/BLOCK + Status)
```

## Testing Philosophy

**Tests verify END RESULT of system** - Arbiter's final decision, NOT individual branch scores.

- ✅ **Test:** `final_status`, `final_decision`, `threat_score`, `pii_sanitized`
- ❌ **Don't test:** `branch_a_score`, `branch_b_score`, `branch_c_score` (diagnostic metadata)

Branch scores are implementation details - they may change as algorithms evolve.
The Arbiter's combined decision is the contract we test.

## Final Status Values

| Status | Description | Decision |
|--------|-------------|----------|
| `ALLOWED` | Benign input, no threats | `ALLOW` |
| `SANITIZED` | PII detected and redacted | `ALLOW` |
| `BLOCKED` | Malicious input detected | `BLOCK` |

## Test Execution

### Prerequisites

All services must be running:
```bash
docker-compose up -d
./scripts/status.sh  # Verify all services healthy
```

### Run All Workflow Tests

```bash
cd services/workflow
npm test
```

### Run Specific Test Suites

```bash
# v2.0.0 Core Tests
npm test -- system-decisions.test.js     # Final decision tests
npm test -- events-v2-schema.test.js     # Schema validation

# Service Health
npm test -- smoke-services.test.js       # All services healthy

# Detection Tests
npm test -- bypass-scenarios.test.js     # Attack detection
npm test -- false-positives.test.js      # Benign input handling

# OWASP Tests
npm test -- owasp-aitg-app-01.test.js    # Direct injection
npm test -- owasp-aitg-app-02.test.js    # Indirect injection
npm test -- owasp-aitg-app-07.test.js    # Prompt extraction
```

### Run Service-Specific Tests

```bash
# Heuristics Service (Branch A)
cd services/heuristics-service
npm test                          # All tests
npm test -- tests/unit/           # Unit only

# Semantic Service (Branch B)
cd services/semantic-service
npm test                          # Unit only
INTEGRATION_TESTS=true npm test   # With integration
```

## events_v2 Schema

ClickHouse table: `n8n_logs.events_v2`

### Key Columns

| Column | Type | Description |
|--------|------|-------------|
| `sessionId` | String | Unique session identifier |
| `timestamp` | DateTime64(3) | Event timestamp |
| `branch_a_score` | UInt8 | Heuristics score (0-100) |
| `branch_b_score` | UInt8 | Semantic score (0-100) |
| `branch_c_score` | UInt8 | LLM Safety Engine analysis score (0-100) |
| `threat_score` | UInt8 | Combined Arbiter score (0-100) |
| `confidence` | Float32 | Arbiter confidence (0-1) |
| `boosts_applied` | Array(String) | Priority boosts applied |
| `final_status` | String | ALLOWED, SANITIZED, BLOCKED |
| `final_decision` | String | ALLOW, BLOCK |
| `pii_sanitized` | UInt8 | 1 if PII redacted |
| `pii_types_detected` | Array(String) | PII entity types found |
| `pii_entities_count` | UInt16 | Number of PII entities |
| `detected_language` | String | pl, en, or unknown |
| `arbiter_json` | String | Full Arbiter decision |
| `branch_results_json` | String | All branch responses |
| `pii_classification_json` | String | PII detection details |

## Assertion Functions

### `assertSystemDecision(event, expected)`

Primary assertion function for v2.0.0 tests.

```javascript
import { assertSystemDecision } from '../helpers/webhook.js';

// Test for blocked malicious input
assertSystemDecision(event, {
  status: 'BLOCKED',
  decision: 'BLOCK',
  minScore: 70
});

// Test for sanitized PII
assertSystemDecision(event, {
  status: 'SANITIZED',
  decision: 'ALLOW',
  piiDetected: true
});

// Test for allowed benign input
assertSystemDecision(event, {
  status: 'ALLOWED',
  decision: 'ALLOW',
  maxScore: 29
});
```

### `assertDetection(event, expected)`

Legacy-compatible assertion (same API).

```javascript
import { assertDetection } from '../helpers/webhook.js';

assertDetection(event, {
  status: 'BLOCKED',
  decision: 'BLOCK',
  minScore: 85
});
```

## Webhook Helper Functions

### `sendAndVerify(chatInput, options)`

Send input and get ClickHouse event.

```javascript
const event = await sendAndVerify('Test input');

expect(event.final_status).toBe('ALLOWED');
expect(event.final_decision).toBe('ALLOW');
expect(event.threat_score).toBeLessThan(30);
```

### `testWebhook(payloadOrString)`

Send input with PII enrichment.

```javascript
const event = await testWebhook('My email is test@example.com');

expect(event.pii.has).toBe(true);
expect(event.pii.entities[0].type).toBe('EMAIL_ADDRESS');
```

## Environment Variables

Required in `.env`:

```bash
CLICKHOUSE_PASSWORD=<32 chars>
CLICKHOUSE_USER=admin
CLICKHOUSE_HTTP_PORT=8123
WEB_UI_ADMIN_PASSWORD=<24 chars>
```

## Webhook URL

v2.0.0 webhook: `http://localhost:5678/webhook/vigil-guard-2`

## CI/CD Jobs

- `heuristics-service-tests` - Branch A unit tests
- `semantic-service-tests` - Branch B unit tests

## Test Coverage Targets

- **Workflow E2E:** 85%+ detection rate
- **Heuristics Service:** 80%+ unit coverage
- **Semantic Service:** 70%+ unit coverage
- **False Positive Rate:** <5%

## Troubleshooting

### Event not found in ClickHouse

```bash
# Check workflow is active
curl http://localhost:5678/healthz

# Check ClickHouse connection
curl http://localhost:8123/ping

# Check events_v2 table exists
docker exec vigil-clickhouse clickhouse-client --query "SHOW TABLES FROM n8n_logs"
```

### Test timeouts

Increase timeout in `vitest.config.js`:
```javascript
testTimeout: 30000  // 30 seconds
```

### Authentication failures

Verify `.env` has `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `WEB_UI_ADMIN_PASSWORD`.

## Migration from v1.8.1

**Changed:**
- Table: `events_processed` → `events_v2`
- Webhook URL: UUID → `vigil-guard-2`
- Fields: `sanitizer.score` → `threat_score`
- Fields: `sanitizer.pii.language_stats.detected_language` → `detected_language`

**Removed (no backward compat):**
- `normalized_input`, `after_sanitization`, `after_pii_redaction`
- `final_action`, `threat_severity`, `pg_score`, `removal_pct`
- `sanitizer_json`, `final_decision_json`, `raw_event`

**Added:**
- `branch_a_score`, `branch_b_score`, `branch_c_score`
- `confidence`, `boosts_applied`
- `arbiter_json`, `branch_results_json`
