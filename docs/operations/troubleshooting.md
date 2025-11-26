# Troubleshooting

Last updated: 2025-11-26

## No entries in ClickHouse
- Check `Log to ClickHouse v2` node logs in n8n.
- Verify connection: `CLICKHOUSE_URL`, user/pass, port 8123.
- Ensure table `n8n_logs.events_v2` exists (SQL in `services/monitoring/sql/08-events-v2-3branch.sql`).

## Branch degraded / timeout
- A/B/C may timeout (1s/2s/3s). Check service logs (heuristics/semantic/NLP safety).
- Arbiter continues but weights shrink; multiple degraded branches can lead to BLOCK.

## PII API offline
- Workflow falls back to regex; check Presidio logs and `pii.conf`.
- If redaction is missing, ensure `pii_detection.enabled=true` and URL is correct.

## Web UI shows service unhealthy
- Verify `HEURISTICS_SERVICE_URL`, `SEMANTIC_SERVICE_URL`, `PROMPT_GUARD_URL`, `LANGUAGE_DETECTOR_URL`.
- Confirm containers running (`docker-compose ps`) and network `vigil-network` is up.

## Plugin not receiving data
- Check `output to plugin` node — ensure `Build NDJSON v2` returns `ndjson`.
- Final status BLOCK/SANITIZED/ALLOWED must be set; verify Merge Final path.

## Input validation blocks requests
- `Input Validator v2` rejects empty/non-string or too-long input. Increase `validation.max_input_length` in unified_config (performance/validation section).
