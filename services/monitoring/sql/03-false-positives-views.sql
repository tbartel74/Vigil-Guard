-- ============================================================================
-- False Positive Reporting - Views
-- Source: 03-false-positives.sql (views only, table in 01-create-tables-v2.sql)
-- ============================================================================

-- View: Last 7 days summary
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

-- View: Top reasons (last 30 days)
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
