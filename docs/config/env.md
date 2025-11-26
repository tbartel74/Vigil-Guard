# Environment variables – quick reference

Last updated: 2025-11-26

## Workflow / n8n
- `WEBHOOK_URL` (if behind reverse proxy), `N8N_PORT` (default 5678).
- Config paths: `/home/node/config/allowlist.schema.json`, `/home/node/config/pii.conf`, `/home/node/config/unified_config.json`.

## Branch A – Heuristics
- Weights/thresholds: `WEIGHT_*`, `THRESHOLD_*`, `ENTROPY_*`, `BIGRAM_LANGUAGE_DETECTION`, `BIGRAM_FALLBACK_LANGUAGE`.
- Performance: `TARGET_LATENCY_MS`, `CIRCUIT_BREAKER_ENABLED`, `CIRCUIT_BREAKER_TIMEOUT_MS`, `CIRCUIT_BREAKER_RESET_MS`.

## Branch B – Semantic
- Typical: `PORT`, vector sources / databases (per semantic-service config).

## Branch C – NLP Safety
- `PORT`, model key (e.g., `GROQ_API_KEY` if used), timeouts in the service config.

## PII + Language Detector
- `PRESIDIO_API_URL` (if overridden), `LANGUAGE_DETECTOR_URL`, `LANGUAGE_DETECTOR_TIMEOUT_MS`.

## Web UI backend
- `HEURISTICS_SERVICE_URL`, `SEMANTIC_SERVICE_URL`, `PROMPT_GUARD_URL`, `LANGUAGE_DETECTOR_URL`.
- `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`.
- `JWT_SECRET`, `GF_SECURITY_ADMIN_PASSWORD`, `CLICKHOUSE_PASSWORD` (also in .env for docker-compose).

## Monitoring
- `GF_SECURITY_ADMIN_PASSWORD`, `CLICKHOUSE_PASSWORD`, ClickHouse retention configured via SQL.

## General
- `.env` in repo root (docker-compose): ports, passwords, volume paths, reverse proxy.
