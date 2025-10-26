-- ============================================================================
-- Retention Policy Configuration Table
-- ============================================================================
-- Purpose: Store retention policy settings (GUI-configurable)
-- Strategy: Single-row singleton pattern (CONSTRAINT id = 1)
-- Reference: backup/IMPLEMENTATION_PLAN.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS n8n_logs.retention_config
(
  id                              UInt8 DEFAULT 1,  -- Single row table (config singleton)

  -- Retention periods (in days)
  -- Based on clickhouse_retention_study.md:
  --   events_raw: 90 days (~110-135 MB)
  --   events_processed: 365 days (~9-18 GB @ 5000 prompts/day)
  events_raw_ttl_days             UInt16 DEFAULT 90,
  events_processed_ttl_days       UInt16 DEFAULT 365,

  -- TTL execution settings
  -- merge_with_ttl_timeout: How often to check for expired data (seconds)
  -- Default 3600 (1 hour) vs ClickHouse default 14400 (4 hours) for faster cleanup
  merge_with_ttl_timeout_seconds  UInt32 DEFAULT 3600,

  -- ttl_only_drop_parts: Drop whole partitions when all data expires (efficient!)
  -- 1 = enabled (recommended), 0 = row-by-row deletion (slower)
  ttl_only_drop_parts             UInt8  DEFAULT 1,

  -- Disk usage thresholds for alerts (percentages)
  warn_disk_usage_percent         UInt8  DEFAULT 80,
  critical_disk_usage_percent     UInt8  DEFAULT 90,

  -- Audit trail
  last_modified_at                DateTime DEFAULT now(),
  last_modified_by                String   DEFAULT 'system',

  -- Ensure only one configuration row exists
  CONSTRAINT single_row CHECK id = 1
)
ENGINE = MergeTree
ORDER BY id
SETTINGS index_granularity = 1;

-- Insert default configuration
-- Note: This will fail on subsequent runs (CONSTRAINT single_row), which is expected
INSERT INTO n8n_logs.retention_config (id) VALUES (1);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check configuration
-- SELECT * FROM n8n_logs.retention_config;

-- Check TTL settings on tables
-- SELECT table, engine_full
-- FROM system.tables
-- WHERE database = 'n8n_logs'
--   AND table IN ('events_raw', 'events_processed');

-- Check partition sizes and ages
-- SELECT
--   table,
--   partition,
--   formatReadableSize(sum(bytes)) AS size,
--   min(min_date) AS oldest_date,
--   max(max_date) AS newest_date,
--   dateDiff('day', min(min_date), today()) AS age_days
-- FROM system.parts
-- WHERE database = 'n8n_logs'
--   AND active = 1
--   AND table IN ('events_raw', 'events_processed')
-- GROUP BY table, partition
-- ORDER BY table, partition DESC;
