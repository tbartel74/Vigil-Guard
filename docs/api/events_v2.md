# ClickHouse events_v2

Last updated: 2025-11-26

Table: `n8n_logs.events_v2` (ClickHouse). Insert format: JSONEachRow from the workflow node “Log to ClickHouse v2”.

## Key columns
- `sessionId` (String) – request/session id.
- `timestamp` (DateTime64) – event time.
- `original_input` (String) – original prompt.
- `chat_input` (String) – final text (after PII or block message).
- `result` (String) – same as chat_input.
- `detected_language` (String) – if available.
- `branch_a_score` (UInt8) – Heuristics.
- `branch_b_score` (UInt8) – Semantic.
- `branch_c_score` (UInt8) – LLM Safety Engine.
- `threat_score` (UInt8) – arbiter result.
- `final_status` (String) – ALLOWED / SANITIZED / BLOCKED.
- `final_decision` (String) – ALLOW / BLOCK.
- `boosts_applied` (Array(String)).
- `confidence` (Float32).
- `pii_sanitized` (UInt8) – 1/0.
- `pii_types_detected` (Array(String)).
- `pii_entities_count` (UInt32).
- `client_id`, `browser_name`, `browser_version`, `os_name` – client metadata.
- `arbiter_json`, `branch_results_json`, `pii_classification_json` – JSON blobs for analysis.
- `pipeline_version`, `config_version` – pipeline/config versions.

## Insert (example)
```bash
curl -X POST "http://clickhouse:8123/?query=INSERT%20INTO%20n8n_logs.events_v2%20FORMAT%20JSONEachRow" \
  -u user:pass \
  -H "Content-Type: application/x-ndjson" \
  -d '{"sessionId":"demo","branch_a_score":10,"branch_b_score":5,"branch_c_score":0,"threat_score":20,"final_status":"ALLOWED","original_input":"hi","chat_input":"hi"}'
```

## Grafana usage
- Dashboard uses branch_a/b/c_score, threat_score, final_status.
- JSON fields (`arbiter_json`, `branch_results_json`) support deeper analysis and FP reports.
