-- 03-false-positives.sql
-- Schema: Quality Reporting System (FP & TP Reports)
-- Notes:
-- * Stores user-reported false positives (FP) and true positives (TP) for monitoring and analysis
-- * FP = incorrectly blocked/sanitized prompts (should have been allowed)
-- * TP = correctly blocked/sanitized prompts (worth analyzing for patterns/tuning)
-- * Links to events_processed via event_id for full context
-- * Partitioned by month, ordered by timestamp for time-series queries
-- * Reasons are low-cardinality for efficient aggregation

CREATE TABLE IF NOT EXISTS n8n_logs.false_positive_reports
(
  report_id           UUID            DEFAULT generateUUIDv4(),
  event_id            String,
  reported_by         String,
  report_type         LowCardinality(String) DEFAULT 'FP',  -- 'FP' or 'TP'
  reason              LowCardinality(String),
  comment             String          CODEC(ZSTD(3)),
  partition_date      Date            MATERIALIZED toDate(timestamp),
  timestamp           DateTime64(3, 'UTC') DEFAULT now64(3),

  -- Denormalized fields from event for faster queries (optional)
  event_timestamp     DateTime64(3, 'UTC'),
  original_input      String          CODEC(ZSTD(3)),
  final_status        LowCardinality(String),
  threat_score        Float64
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (report_type, timestamp, report_id)
SETTINGS index_granularity = 8192;

-- View: Quality Reports Summary (last 7 days) - FP & TP combined
CREATE VIEW IF NOT EXISTS n8n_logs.fp_reports_7d AS
SELECT
  toDate(timestamp) AS date,
  report_type,
  reason,
  count() AS report_count,
  uniq(event_id) AS unique_events,
  uniq(reported_by) AS unique_reporters
FROM n8n_logs.false_positive_reports
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY date, report_type, reason
ORDER BY date DESC, report_count DESC;

-- View: Top Reasons (last 30 days) - FP & TP combined
CREATE VIEW IF NOT EXISTS n8n_logs.fp_top_reasons_30d AS
SELECT
  report_type,
  reason,
  count() AS total_reports,
  uniq(event_id) AS unique_events,
  round(avg(threat_score), 2) AS avg_threat_score,
  max(timestamp) AS last_reported
FROM n8n_logs.false_positive_reports
WHERE timestamp >= now() - INTERVAL 30 DAY
GROUP BY report_type, reason
ORDER BY total_reports DESC
LIMIT 20;
