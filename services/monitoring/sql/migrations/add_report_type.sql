-- Migration: Add report_type column to support both FP and TP reports
-- Date: 2025-11-20
-- Description: Extends false_positive_reports table to handle True Positive reports

-- Step 1: Add report_type column with default value 'FP'
ALTER TABLE n8n_logs.false_positive_reports
ADD COLUMN IF NOT EXISTS report_type LowCardinality(String) DEFAULT 'FP';

-- Step 2: Update existing records to have report_type = 'FP'
ALTER TABLE n8n_logs.false_positive_reports
UPDATE report_type = 'FP'
WHERE report_type = '';

-- Step 3: Recreate views to include report_type
DROP VIEW IF EXISTS n8n_logs.fp_reports_7d;
DROP VIEW IF EXISTS n8n_logs.fp_top_reasons_30d;

-- View: Quality Reports Summary (last 7 days) - FP & TP combined
CREATE VIEW n8n_logs.fp_reports_7d AS
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
CREATE VIEW n8n_logs.fp_top_reasons_30d AS
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
