# Workflow Service

n8n-based detection engine with 3-branch parallel architecture.

## Architecture

```
services/workflow/
├── workflows/
│   └── Vigil Guard v2.0.0.json  # Main workflow
├── config/
│   ├── unified_config.json      # Detection settings
│   ├── rules.config.json        # Pattern definitions
│   ├── pii.conf                 # PII redaction rules
│   └── allowlist.schema.json    # Whitelist patterns
└── tests/
    ├── e2e/                     # End-to-end tests
    └── fixtures/                # Test payloads
```

## 3-Branch Detection Pipeline

```
Input → Validation → Language Detection
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   Branch A          Branch B          Branch C
  (Heuristics)      (Semantic)      (LLM Safety)
   :5005              :5006            :8000
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
                       Arbiter
                    (Score Fusion)
                          │
                          ▼
         PII Detection → Sanitization → Response
```

### Branch Weights
- **Branch A (Heuristics)**: 0.30
- **Branch B (Semantic)**: 0.35
- **Branch C (LLM Safety)**: 0.35

## Quick Start

### Import Workflow

1. Open n8n: http://localhost:5678
2. Menu → Import from File
3. Select `workflows/Vigil Guard v2.0.0.json`
4. Configure ClickHouse credentials
5. Activate workflow (toggle ON)

### Test Webhook

```bash
curl -X POST http://localhost:5678/webhook/vigil-guard-2 \
  -H "Content-Type: application/json" \
  -d '{"chatInput":"Hello world","sessionId":"test"}'
```

## Configuration

**Important:** Configuration files are managed via Web UI at http://localhost/ui/config

### unified_config.json

Main detection settings including:
- Threshold values
- Category weights
- Sanitization patterns
- PII settings

### rules.config.json

Pattern definitions for 44 threat categories:
- 993 keywords in Aho-Corasick prefilter
- Regex patterns per category
- Score multipliers

### pii.conf

PII redaction rules with:
- Entity type definitions
- Replacement tokens
- Validator functions

## Testing

```bash
cd services/workflow
npm install
npm test
```

### Test Suites

| Suite | Tests | Description |
|-------|-------|-------------|
| bypass-scenarios | 29 | Attack vector testing |
| false-positives | 15 | Benign input validation |
| pii-detection | 24 | PII redaction |
| owasp-aitg-app-01 | 50 | Direct injection |
| owasp-aitg-app-02 | 40 | Indirect injection |

### Run Specific Suite

```bash
npm test -- bypass-scenarios.test.js
npm test -- pii-detection.test.js
```

## Decision Thresholds

| Score | Action | Description |
|-------|--------|-------------|
| 0-29 | ALLOW | Clean content |
| 30-49 | SANITIZE (Light) | Remove suspicious patterns |
| 50-84 | SANITIZE (Heavy) | Aggressive sanitization |
| 85-100 | BLOCK | Reject content |

## ClickHouse Logging

Events are logged to `events_v2` table:

```sql
SELECT
    event_id,
    final_status,
    arbiter_score,
    branch_a_score,
    branch_b_score,
    branch_c_score,
    categories_detected
FROM n8n_logs.events_v2
ORDER BY timestamp DESC
LIMIT 10;
```

## Workflow Nodes

Key nodes in the pipeline:

| Node | Purpose |
|------|---------|
| Chat Trigger | Input webhook |
| Language Detector | PL/EN detection |
| Branch A Call | Heuristics service |
| Branch B Call | Semantic service |
| Branch C Call | LLM Safety Engine |
| Arbiter | Score fusion |
| PII Redactor v2 | Presidio integration |
| Logging | ClickHouse insert |

## Debugging

### View n8n Logs
```bash
docker logs vigil-n8n --tail 100 -f
```

### Test Individual Branch
```bash
# Branch A
curl http://localhost:5005/analyze \
  -d '{"text":"test","request_id":"1"}'

# Branch B
curl http://localhost:5006/analyze \
  -d '{"text":"test","request_id":"1"}'
```

## Related Documentation

- [Architecture](../../docs/ARCHITECTURE.md)
- [Detection Categories](../../docs/DETECTION_CATEGORIES.md)
- [Testing Guide](../../docs/tests/index.md)
