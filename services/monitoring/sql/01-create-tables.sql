-- 01-create-tables.updated.sql
-- Schema: n8n_logs
-- Notes:
-- * All timestamps are stored in UTC (DateTime64(3, 'UTC')).
-- * Tables are MergeTree, partitioned by month and ordered for common queries (time + session).
-- * 'events_processed' mirrors the structure observed in production, incl. JSON snapshots.
-- * 'events_raw' is a lightweight ingestion table for request-side metadata.
-- * Added optional 'event_id' to events_processed (used by views/join with events_raw).

CREATE DATABASE IF NOT EXISTS n8n_logs;

-- ============
-- events_raw
-- ============
-- Retention: 90 days (debug data, raw webhook inputs)
-- TTL: Automatic deletion after 90 days
CREATE TABLE IF NOT EXISTS n8n_logs.events_raw
(
  event_id            String,
  workflow_id         String,
  execution_id        String,
  node_id             String,
  node_name           String,
  partition_date      Date            MATERIALIZED toDate(timestamp),
  timestamp           DateTime64(3, 'UTC') DEFAULT now64(3),
  input_text          String          CODEC(ZSTD(3)),
  input_length        UInt32,
  processing_time_ms  UInt32
)
ENGINE = MergeTree
PARTITION BY partition_date
ORDER BY (timestamp, event_id)
TTL toDateTime(timestamp) + INTERVAL 90 DAY DELETE
SETTINGS
  index_granularity = 8192,
  merge_with_ttl_timeout = 3600,
  ttl_only_drop_parts = 1;

-- ==================
-- events_processed
-- ==================
-- Retention: 365 days (full analysis data)
-- TTL: Automatic deletion after 365 days
-- Estimated size: 9-18 GB @ 5000 prompts/day (study: clickhouse_retention_study.md)
CREATE TABLE IF NOT EXISTS n8n_logs.events_processed
(
  id                    UUID,
  event_id              String           DEFAULT '',
  sessionId             String,
  action                LowCardinality(String),
  timestamp             DateTime64(3, 'UTC'),

  original_input        String,
  normalized_input      String,
  after_sanitization    String,
  after_pii_redaction   String,
  chat_input            String,
  result                String,

  threat_score          Float64,
  threat_severity       LowCardinality(String),
  pg_score              Float64,
  pg_score_percent      Float64,  -- Stored as basis points: 0-10000 (represents 0.00-100.00%)

  final_status          LowCardinality(String),
  final_action          LowCardinality(String),
  user_message          String,

  removal_pct           Float64,
  threat_labels         Array(String),
  threat_matches        Array(String),

  config_version        LowCardinality(String),
  config_hash           String,
  pipeline_version      LowCardinality(String),
  processing_time_ms    UInt32,

  sanitizer_json        String,
  prompt_guard_json     String,
  scoring_json          String,
  final_decision_json   String,
  pipeline_flow_json    String,
  config_metadata_json  String,
  raw_event             String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, sessionId, id)
TTL toDateTime(timestamp) + INTERVAL 365 DAY DELETE
SETTINGS
  index_granularity = 8192,
  merge_with_ttl_timeout = 3600,
  ttl_only_drop_parts = 1;

-- Optional helper table for NDJSON landing (if you ever need it).
-- Uncomment if you want a raw NDJSON bucket + MV into events_processed.
/*
CREATE TABLE IF NOT EXISTS n8n_logs.landing_raw
(
  raw String
)
ENGINE = MergeTree
ORDER BY tuple();
*/
