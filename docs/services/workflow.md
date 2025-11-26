# Workflow (n8n)

Last updated: 2025-11-26

## Workflow file
- `services/workflow/workflows/Vigil Guard v2.0.0.json`
- Imported into n8n; active webhook `POST /webhook/vigil-guard-2`.

## Inputs
- `chatInput`, `sessionId`, optional `clientId`, `browser_metadata`.
- Configuration loaded from `/home/node/config` (allowlist, pii.conf, unified_config).

## Key nodes
- Extract Input → Merge/Load Config → Config Loader → Input Validator.
- 3-Branch Executor (Heuristics/Semantic/NLP Safety in parallel).
- Arbiter v2 (weights 0.30/0.35/0.35, BLOCK threshold 50, boosts, degradation).
- PII_Redactor_v2 (after ALLOW) / Block Response (after BLOCK).
- Build NDJSON v2 → Log to ClickHouse v2 → output to plugin.

## Timeouts and degradation
- A 1s, B 2s, C 3s; on error branch degraded, arbiter reweights.
- All degraded → BLOCK.

## Logging
- JSONEachRow insert into `n8n_logs.events_v2` (ClickHouse).
- Fields: branch_a/b/c_score, threat_score, final_status (ALLOWED/SANITIZED/BLOCKED), boosts, confidence, PII, metadata.

## Export/import
- JSON file (v2.0.0) can be imported into n8n UI.
- After import set ClickHouse credentials (Basic Auth) and ensure config paths point to `/home/node/config`.
