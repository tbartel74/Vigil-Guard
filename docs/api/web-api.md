# Web API (backend)

Last updated: 2025-11-26

Web UI backend (Express, port 8787) exposes APIs for configuration, service health, and audit.

## Main endpoints
- `GET /api/system/containers` – status of Heuristics, Semantic, NLP Safety, Language Detector, ClickHouse, PII, Grafana (includes latency/status).
- `GET /api/config` – fetch configuration (including unified_config, allowlist, pii.conf if exposed).
- `POST /api/config` – save configuration; uses ETag for race protection.
- `GET /api/audit` – configuration change log.

## Authorization
- JWT; secrets in `JWT_SECRET`. Ensure reverse proxy restricts public access in production.

## Service integrations
- Environment vars: `HEURISTICS_SERVICE_URL`, `SEMANTIC_SERVICE_URL`, `PROMPT_GUARD_URL`, `LANGUAGE_DETECTOR_URL`.
- ClickHouse: `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`.

## Health-check contract
Example item:
```json
{
  "name": "Branch C (NLP Safety Analysis)",
  "status": "healthy|unhealthy|unknown",
  "latency_ms": 123
}
```
