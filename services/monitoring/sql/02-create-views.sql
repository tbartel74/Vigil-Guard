-- 02-create-views.updated.sql
-- Views tuned for Grafana & admin operations

-- ===============================
-- Realtime summary per workflow
-- ===============================
CREATE OR REPLACE VIEW n8n_logs.events_summary_realtime AS
SELECT
  toStartOfMinute(r.timestamp)                                         AS minute,
  r.workflow_id,
  count()                                                               AS event_count,
  sum(p.final_status = 'BLOCKED')                                       AS blocked_count,
  (blocked_count / event_count) * 100.0                                 AS block_rate_pct,
  avg( if(r.processing_time_ms > 60000, NULL, r.processing_time_ms) )   AS avg_processing_ms,
  max(
    greatest(
      -- sanitizer_score from JSON (0..100)
      toFloat64( ifNull(JSONExtract(p.scoring_json, 'sanitizer_score', 'Int32'), 0) ),
      -- pg_score_percent normalized to 0..100
      least(100.0, greatest(0.0, if(p.pg_score_percent <= 1, p.pg_score_percent * 100.0, p.pg_score_percent)))
    )
  )                                                                     AS max_malice_pct
FROM n8n_logs.events_raw AS r
LEFT JOIN n8n_logs.events_processed AS p
  ON r.event_id = p.event_id
GROUP BY minute, r.workflow_id
ORDER BY minute, r.workflow_id;

-- ==========================================
-- View for the main Grafana prompts table
-- (local time rendering for Warsaw)
-- Updated v1.7.0: Added browser fingerprinting and PII classification columns
-- ==========================================
CREATE OR REPLACE VIEW n8n_logs.v_grafana_prompts_table AS
SELECT
  -- Browser Fingerprinting (v1.7.0)
  client_id,
  browser_name,
  browser_version,
  os_name,
  browser_language,
  browser_timezone,
  -- PII Classification (v1.7.0)
  pii_sanitized,
  pii_types_detected,
  pii_entities_count,
  -- Timestamp
  toTimeZone(timestamp, 'Europe/Warsaw')                                AS time,
  -- Prompt and Decision
  JSONExtractString(pipeline_flow_json, 'input_raw')                    AS original_prompt,
  JSONExtractString(pipeline_flow_json, 'output_final')                 AS output_after_decision,
  final_status,
  multiIf(
    positionCaseInsensitive(final_action, 'SANITIZER')    > 0, 'SANITIZER',
    positionCaseInsensitive(final_action, 'PROMPT_GUARD') > 0, 'PROMPT_GUARD',
    final_action
  )                                                                     AS decision_source,
  arrayStringConcat(
    arraySlice(
      arrayMap(x -> x.1,
        arraySort(y -> -y.2,
          arrayMap(d -> (
            JSONExtractString(d, 'category'),
            toInt32( ifNull(JSONExtract(d, 'score', 'Int32'), 0) )
          ), JSONExtractArrayRaw(scoring_json, 'match_details'))
        )
      ),
      1, 2
    ),
    ' + '
  )                                                                     AS main_criteria
FROM n8n_logs.events_processed;

-- ==========================================
-- View for composite malice index time-series
-- ==========================================
CREATE OR REPLACE VIEW n8n_logs.v_malice_index_timeseries AS
SELECT
  toStartOfMinute(timestamp)                                            AS time,
  avg(
    greatest(
      toFloat64( ifNull(JSONExtract(scoring_json, 'sanitizer_score', 'Int32'), 0) ),
      least(100.0, greatest(0.0, if(pg_score_percent <= 1, pg_score_percent * 100.0, pg_score_percent)))
    )
  )                                                                     AS avg_malice_pct,
  quantileExact(0.95)(
    greatest(
      toFloat64( ifNull(JSONExtract(scoring_json, 'sanitizer_score', 'Int32'), 0) ),
      least(100.0, greatest(0.0, if(pg_score_percent <= 1, pg_score_percent * 100.0, pg_score_percent)))
    )
  )                                                                     AS p95_malice_pct
FROM n8n_logs.events_processed
GROUP BY time
ORDER BY time;

-- ==========================================
-- OPTIONAL: MV from landing_raw -> events_processed
-- (kept commented as you already ingest directly)
-- ==========================================
/*
CREATE MATERIALIZED VIEW IF NOT EXISTS n8n_logs.mv_events
TO n8n_logs.events_processed AS
SELECT
  -- map your NDJSON fields into the typed columns here...
  -- Example (expects JSON lines for the 'row' object you generate):
  generateUUIDv4()                                                      AS id,
  JSONExtractString(raw, 'event_id')                                    AS event_id,
  JSONExtractString(raw, 'sessionId')                                   AS sessionId,
  JSONExtractString(raw, 'action')                                      AS action,
  parseDateTime64BestEffortOrNull(JSONExtractString(raw, 'timestamp'), 3) AS timestamp,
  JSONExtractString(raw, 'original_input')                               AS original_input,
  JSONExtractString(raw, 'normalized_input')                             AS normalized_input,
  JSONExtractString(raw, 'after_sanitization')                           AS after_sanitization,
  JSONExtractString(raw, 'after_pii_redaction')                          AS after_pii_redaction,
  JSONExtractString(raw, 'chat_input')                                   AS chat_input,
  JSONExtractString(raw, 'result')                                       AS result,
  toFloat64OrZero(JSONExtract(raw, 'threat_score', 'Float64'))           AS threat_score,
  JSONExtractString(raw, 'threat_severity')                              AS threat_severity,
  toFloat64OrZero(JSONExtract(raw, 'pg_score', 'Float64'))               AS pg_score,
  toFloat64OrZero(JSONExtract(raw, 'pg_score_percent', 'Float64'))       AS pg_score_percent,
  JSONExtractString(raw, 'final_status')                                  AS final_status,
  JSONExtractString(raw, 'final_action')                                  AS final_action,
  JSONExtractString(raw, 'user_message')                                  AS user_message,
  toFloat64OrZero(JSONExtract(raw, 'removal_pct', 'Float64'))            AS removal_pct,
  JSONExtractString(raw, 'config_version')                                AS config_version,
  JSONExtractString(raw, 'config_hash')                                   AS config_hash,
  JSONExtractString(raw, 'pipeline_version')                              AS pipeline_version,
  toUInt32OrZero(JSONExtract(raw, 'processing_time_ms', 'UInt32'))       AS processing_time_ms,
  JSONExtractString(raw, 'sanitizer_json')                                AS sanitizer_json,
  JSONExtractString(raw, 'prompt_guard_json')                             AS prompt_guard_json,
  JSONExtractString(raw, 'scoring_json')                                  AS scoring_json,
  JSONExtractString(raw, 'final_decision_json')                           AS final_decision_json,
  JSONExtractString(raw, 'pipeline_flow_json')                            AS pipeline_flow_json,
  JSONExtractString(raw, 'config_metadata_json')                          AS config_metadata_json,
  raw                                                                     AS raw_event
FROM n8n_logs.landing_raw;
*/
