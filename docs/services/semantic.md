# Semantic Service (Branch B)

Last updated: 2025-11-26

## Role
Semantic similarity to known attack prompts (embedding similarity). Feeds arbiter (default weight 0.35).

## Endpoint
`POST http://semantic-service:5006/analyze`

Typical body:
```json
{ "text": "input", "request_id": "id-123" }
```

Response (branch_result):
- `score` 0-100, `threat_level`, `confidence`, `critical_signals` (e.g., high_similarity), `explanations`, `timing_ms`, `degraded`.

## Timeout / degradation
- Timeout 2000 ms (set in 3-Branch Executor). On timeout, branch is degraded (score 0, degraded=true) and arbiter reweights.

## Arbiter integration
- Boost `SEMANTIC_HIGH_SIMILARITY` can raise the combined score on high similarity.

## Tests
- Unit: `npm test -- tests/unit/` (semantic service).
- E2E: via workflow tests (events_v2 schema, owasp-aitg).
