-- 06-add-audit-columns-v1.7.0.sql
-- Migration: Add audit trail columns for v1.7.0
-- Purpose: Client identification and browser metadata for security analysis
-- Date: 2025-11-01
--
-- New Columns:
-- 1. pii_sanitized (UInt8): Boolean flag - was PII detected and redacted?
-- 2. pii_types_detected (Array(String)): Entity types found (e.g., ['EMAIL_ADDRESS', 'CREDIT_CARD'])
-- 3. pii_entities_count (UInt16): Number of PII entities detected
-- 4. client_id (String): Persistent browser instance identifier (vigil_<timestamp>_<random>)
-- 5. browser_name (LowCardinality(String)): Chrome, Firefox, Safari, etc.
-- 6. browser_version (String): Browser version (e.g., "120.0")
-- 7. os_name (LowCardinality(String)): Windows, macOS, Linux, Android, iOS
-- 8. browser_language (String): Browser language setting (e.g., "en-US")
-- 9. browser_timezone (String): Browser timezone (e.g., "America/New_York")
--
-- IMPORTANT: These columns have DEFAULT values for backward compatibility
-- Old workflow versions (< v1.7.0) will use defaults

USE n8n_logs;

-- Add PII classification columns (from Task 2)
ALTER TABLE events_processed
  ADD COLUMN IF NOT EXISTS pii_sanitized UInt8 DEFAULT 0 COMMENT 'Boolean flag: was PII detected and redacted?';

ALTER TABLE events_processed
  ADD COLUMN IF NOT EXISTS pii_types_detected Array(String) DEFAULT [] COMMENT 'Entity types found: EMAIL_ADDRESS, CREDIT_CARD, PL_PESEL, etc.';

ALTER TABLE events_processed
  ADD COLUMN IF NOT EXISTS pii_entities_count UInt16 DEFAULT 0 COMMENT 'Number of PII entities detected';

-- Add client identification columns (from Task 3)
ALTER TABLE events_processed
  ADD COLUMN IF NOT EXISTS client_id String DEFAULT '' COMMENT 'Persistent browser instance identifier';

ALTER TABLE events_processed
  ADD COLUMN IF NOT EXISTS browser_name LowCardinality(String) DEFAULT 'unknown' COMMENT 'Browser name: Chrome, Firefox, Safari, etc.';

ALTER TABLE events_processed
  ADD COLUMN IF NOT EXISTS browser_version String DEFAULT 'unknown' COMMENT 'Browser version (e.g., 120.0)';

ALTER TABLE events_processed
  ADD COLUMN IF NOT EXISTS os_name LowCardinality(String) DEFAULT 'unknown' COMMENT 'Operating system: Windows, macOS, Linux, etc.';

ALTER TABLE events_processed
  ADD COLUMN IF NOT EXISTS browser_language String DEFAULT 'unknown' COMMENT 'Browser language setting (e.g., en-US)';

ALTER TABLE events_processed
  ADD COLUMN IF NOT EXISTS browser_timezone String DEFAULT 'unknown' COMMENT 'Browser timezone (e.g., America/New_York)';

-- Verification query (optional - run manually to verify migration)
-- SELECT
--   count() AS total_rows,
--   countIf(pii_sanitized = 1) AS rows_with_pii,
--   uniq(client_id) AS unique_clients,
--   uniq(browser_name) AS unique_browsers,
--   uniq(os_name) AS unique_os
-- FROM events_processed
-- WHERE timestamp >= now() - INTERVAL 1 HOUR;

-- Migration complete!
-- Next steps:
-- 1. Update workflow v1.7.0 to populate these columns (Task 3.4)
-- 2. Update Grafana dashboards to visualize new audit data
-- 3. Run verification query above to confirm data is being populated
