-- ============================================================================
-- Vigil Guard v2.0.0 - Core Tables
-- Fresh installation (NO backward compatibility with v1.8.1)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS n8n_logs;

-- ============================================================================
-- TABLE 1: events_v2 (3-Branch Detection Architecture)
-- Source: 08-events-v2-3branch.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS n8n_logs.events_v2
(
    -- Identity
    id                      UUID DEFAULT generateUUIDv4(),
    event_id                String DEFAULT '',
    sessionId               String,
    action                  LowCardinality(String) DEFAULT 'sendMessage',
    timestamp               DateTime64(3, 'UTC') DEFAULT now64(3),

    -- Input/Output
    original_input          String CODEC(ZSTD(3)),
    chat_input              String CODEC(ZSTD(3)),
    result                  String CODEC(ZSTD(3)),
    detected_language       LowCardinality(String) DEFAULT 'unknown',

    -- 3-Branch Scores (v2.0.0)
    branch_a_score          UInt8 DEFAULT 0,
    branch_b_score          UInt8 DEFAULT 0,
    branch_c_score          UInt8 DEFAULT 0,

    -- Arbiter Decision
    threat_score            UInt8 DEFAULT 0,
    confidence              Float32 DEFAULT 0,
    boosts_applied          Array(String),

    -- Final Decision
    final_status            LowCardinality(String) DEFAULT 'UNKNOWN',
    final_decision          LowCardinality(String) DEFAULT 'UNKNOWN',
    user_message            String DEFAULT '',

    -- PII Detection
    pii_sanitized           UInt8 DEFAULT 0,
    pii_types_detected      Array(String),
    pii_entities_count      UInt16 DEFAULT 0,

    -- Client Metadata
    client_id               String DEFAULT '',
    browser_name            LowCardinality(String) DEFAULT 'unknown',
    browser_version         String DEFAULT 'unknown',
    os_name                 LowCardinality(String) DEFAULT 'unknown',

    -- Pipeline Metadata
    pipeline_version        LowCardinality(String) DEFAULT 'v2.0.0',
    config_version          LowCardinality(String) DEFAULT 'unknown',
    processing_time_ms      UInt32 DEFAULT 0,

    -- JSON Fields
    arbiter_json            String CODEC(ZSTD(3)),
    branch_results_json     String CODEC(ZSTD(3)),
    pii_classification_json String CODEC(ZSTD(3)),
    pipeline_flow_json      String CODEC(ZSTD(3))
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, sessionId, id)
TTL toDateTime(timestamp) + INTERVAL 365 DAY DELETE
SETTINGS
    index_granularity = 8192,
    merge_with_ttl_timeout = 3600,
    ttl_only_drop_parts = 1;

-- Indexes
ALTER TABLE n8n_logs.events_v2 ADD INDEX IF NOT EXISTS idx_event_id event_id TYPE bloom_filter GRANULARITY 4;
ALTER TABLE n8n_logs.events_v2 ADD INDEX IF NOT EXISTS idx_final_status final_status TYPE bloom_filter GRANULARITY 4;
ALTER TABLE n8n_logs.events_v2 ADD INDEX IF NOT EXISTS idx_threat_score threat_score TYPE minmax GRANULARITY 4;
ALTER TABLE n8n_logs.events_v2 ADD INDEX IF NOT EXISTS idx_client_id client_id TYPE bloom_filter GRANULARITY 4;
ALTER TABLE n8n_logs.events_v2 ADD INDEX IF NOT EXISTS idx_pii_sanitized pii_sanitized TYPE minmax GRANULARITY 4;

-- ============================================================================
-- TABLE 2: false_positive_reports (Quality Reporting)
-- Source: 03-false-positives.sql (table only, views in separate file)
-- ============================================================================

CREATE TABLE IF NOT EXISTS n8n_logs.false_positive_reports
(
  report_id           UUID            DEFAULT generateUUIDv4(),
  event_id            String,
  reported_by         String,
  report_type         LowCardinality(String) DEFAULT 'FP',
  reason              LowCardinality(String),
  comment             String          CODEC(ZSTD(3)),
  partition_date      Date            MATERIALIZED toDate(timestamp),
  timestamp           DateTime64(3, 'UTC') DEFAULT now64(3),

  -- Denormalized fields
  event_timestamp     DateTime64(3, 'UTC'),
  original_input      String          CODEC(ZSTD(3)),
  final_status        LowCardinality(String),
  threat_score        Float64
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (report_type, timestamp, report_id)
SETTINGS index_granularity = 8192;

-- ============================================================================
-- TABLE 3: retention_config (TTL Policy Management)
-- Source: 05-retention-config.sql
-- NOTE: pattern_embeddings_v2 and semantic_safe_embeddings have 90-day TTL
-- ============================================================================

CREATE TABLE IF NOT EXISTS n8n_logs.retention_config
(
  id                              UInt8 DEFAULT 1,

  -- Retention periods (days)
  events_raw_ttl_days             UInt16 DEFAULT 90,
  events_processed_ttl_days       UInt16 DEFAULT 365,

  -- TTL execution settings
  merge_with_ttl_timeout_seconds  UInt32 DEFAULT 3600,
  ttl_only_drop_parts             UInt8  DEFAULT 1,

  -- Disk usage thresholds
  warn_disk_usage_percent         UInt8  DEFAULT 80,
  critical_disk_usage_percent     UInt8  DEFAULT 90,

  -- Audit trail
  last_modified_at                DateTime DEFAULT now(),
  last_modified_by                String   DEFAULT 'system',

  CONSTRAINT single_row CHECK id = 1
)
ENGINE = MergeTree
ORDER BY id
SETTINGS index_granularity = 1;

-- Insert default config
INSERT INTO n8n_logs.retention_config (id) VALUES (1);
