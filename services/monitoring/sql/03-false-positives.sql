-- 03-false-positives.sql
-- Schema: False Positive Reporting System
-- Notes:
-- * Stores user-reported false positives for monitoring and analysis
-- * Links to events_processed via event_id for full context
-- * Partitioned by month, ordered by timestamp for time-series queries
-- * Reasons are low-cardinality for efficient aggregation

CREATE TABLE IF NOT EXISTS n8n_logs.false_positive_reports
(
  report_id           UUID            DEFAULT generateUUIDv4(),
  event_id            String,
  reported_by         String,
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
ORDER BY (timestamp, report_id)
SETTINGS index_granularity = 8192;

-- Index for event_id lookups
ALTER TABLE n8n_logs.false_positive_reports
ADD INDEX idx_event_id (event_id) TYPE bloom_filter(0.01) GRANULARITY 1;

-- View: FP Reports Summary (last 7 days)
CREATE VIEW IF NOT EXISTS n8n_logs.fp_reports_7d AS
SELECT
  toDate(timestamp) AS date,
  reason,
  count() AS report_count,
  uniq(event_id) AS unique_events,
  uniq(reported_by) AS unique_reporters
FROM n8n_logs.false_positive_reports
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY date, reason
ORDER BY date DESC, report_count DESC;

-- View: Top Reasons (last 30 days)
CREATE VIEW IF NOT EXISTS n8n_logs.fp_top_reasons_30d AS
SELECT
  reason,
  count() AS total_reports,
  uniq(event_id) AS unique_events,
  round(avg(threat_score), 2) AS avg_threat_score,
  max(timestamp) AS last_reported
FROM n8n_logs.false_positive_reports
WHERE timestamp >= now() - INTERVAL 30 DAY
GROUP BY reason
ORDER BY total_reports DESC
LIMIT 20;
