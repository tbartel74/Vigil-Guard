# 3-Branch Pipeline

Last updated: 2025-11-26

## Execution steps (Vigil Guard v2.0.0)
1) **Input**: Webhook `POST /webhook/vigil-guard-2` or Chat Trigger.  
2) **Extract Input**: build `chat_payload` (chatInput, sessionId, action, browser metadata).  
3) **Config load**: `allowlist.schema.json`, `pii.conf`, `unified_config.json`.  
4) **Validation**: `Input Validator v2` – string, non-empty, length ≤ `validation.max_input_length` (default 10k).  
5) **3-Branch Executor** (parallel):  
   - A: Heuristics `http://heuristics-service:5005/analyze` (timeout 1000 ms).  
   - B: Semantic `http://semantic-service:5006/analyze` (timeout 2000 ms).  
   - C: NLP Safety `http://prompt-guard-api:8000/detect` (timeout 3000 ms).  
   - Degraded fallback: score 0, `degraded=true`, unified contract.  
6) **Arbiter v2**:  
   - Default weights: A 0.30, B 0.35, C 0.35.  
   - BLOCK threshold: 50.  
   - Boosts: conservative override (C attack + high confidence), semantic high similarity, heuristics critical, llm_guard_high_confidence, unanimous_high.  
   - Degradation: offline branch weights scaled, normalized to 1; all-degraded → BLOCK fail-secure.  
7) **Decision**:  
   - ALLOW → **PII_Redactor_v2** (Presidio pl/en + regex fallback, redaction tokens, audit `_pii_sanitized`, `pii_classification`).  
   - BLOCK → **Block Response v2** (skip PII).  
8) **Logging**:  
   - **Build NDJSON v2**: prepares ClickHouse row (`branch_a/b/c_score`, `threat_score`, boosts, confidence, PII classification, metadata).  
   - **Log to ClickHouse v2**: JSONEachRow insert into `n8n_logs.events_v2`.  
9) **Output**:  
   - `Clean Output v2` – final fields for client.  
   - `output to plugin` – mapping to allow/block/sanitize + sanitizedBody.  

## Diagram
![Workflow pipeline](../pic/Workflow-pipeline.png)

## Key data contracts
- `branch_results`: A/B/C with `score`, `threat_level`, `confidence`, `critical_signals`, `features`, `timing_ms`, `degraded`.
- `arbiter_result`: `combined_score`, `final_decision` (ALLOW/BLOCK), `confidence`, `boosts_applied`, `branches` (weights, degraded), `explanations`.
- PII: `_pii_sanitized` (bool), `pii_classification` (types[], count, method), `detected_language`.
- ClickHouse row (events_v2): `sessionId`, `original_input`, `chat_input`, `threat_score`, `branch_a/b/c_score`, `final_status` (ALLOWED/SANITIZED/BLOCKED), `pii_types_detected`, `pii_entities_count`, browser metadata.

## Timeout / degradation paths
- Timeouts per branch: A 1s, B 2s, C 3s; on timeout degrade the branch (score 0) and continue decision.
- All branches degraded → BLOCK (fail-secure).
