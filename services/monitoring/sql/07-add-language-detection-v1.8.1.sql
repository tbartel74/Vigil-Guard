-- 07-add-language-detection-v1.8.1.sql
-- Migration: Add language detection column for v1.8.1
-- Purpose: Track detected language for dual-language PII processing
-- Date: 2025-11-16
--
-- New Column:
-- 1. detected_language (LowCardinality(String)): ISO 639-1 language code (pl, en, etc.)
--
-- IMPORTANT: This column has DEFAULT value for backward compatibility
-- Old workflow versions (< v1.8.1) will use 'unknown'

USE n8n_logs;

-- Add language detection column
ALTER TABLE events_processed
  ADD COLUMN IF NOT EXISTS detected_language LowCardinality(String) DEFAULT 'unknown' COMMENT 'Detected language ISO 639-1 code: pl, en, de, etc.';

-- Verification query (optional - run manually to verify migration)
-- SELECT
--   detected_language,
--   count() AS total_requests,
--   countIf(pii_sanitized = 1) AS pii_detected
-- FROM events_processed
-- WHERE timestamp >= now() - INTERVAL 1 HOUR
-- GROUP BY detected_language
-- ORDER BY total_requests DESC;

-- Migration complete!
-- Workflow v1.8.1+ will populate this column with language detector results
