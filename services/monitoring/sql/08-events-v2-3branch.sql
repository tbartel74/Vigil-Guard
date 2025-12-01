-- 08-events-v2-3branch.sql
-- Schema: n8n_logs
-- Purpose: ClickHouse table for Vigil Guard v2.0.0 with 3-Branch Detection Architecture
--
-- Key Changes from events_processed:
-- - 3 branch scores (heuristics, semantic, llm_guard/LLM Safety Engine analysis) instead of single threat_score
-- - Arbiter decision fields (combined_score, boosts_applied, confidence)
-- - event_id field for FP reports compatibility (sessionId-ISO8601 format)
-- - Full branch results in JSON for deep analysis
-- - pipeline_flow_json for audit trail

CREATE TABLE IF NOT EXISTS n8n_logs.events_v2
(
    -- Identity
    id                      UUID DEFAULT generateUUIDv4(),
    event_id                String DEFAULT '',             -- Format: sessionId-ISO8601 (for FP reports JOIN)
    sessionId               String,
    action                  LowCardinality(String) DEFAULT 'sendMessage',
    timestamp               DateTime64(3, 'UTC') DEFAULT now64(3),

    -- Input/Output Pipeline
    original_input          String CODEC(ZSTD(3)),
    chat_input              String CODEC(ZSTD(3)),
    result                  String CODEC(ZSTD(3)),
    detected_language       LowCardinality(String) DEFAULT 'unknown',

    -- 3-Branch Scores (NEW in v2.0.0)
    branch_a_score          UInt8 DEFAULT 0,       -- Heuristics (0-100)
    branch_b_score          UInt8 DEFAULT 0,       -- Semantic (0-100)
    branch_c_score          UInt8 DEFAULT 0,       -- LLM Safety Engine analysis (0-100)

    -- Arbiter Decision (NEW in v2.0.0)
    threat_score            UInt8 DEFAULT 0,       -- Combined weighted score (0-100)
    confidence              Float32 DEFAULT 0,     -- Arbiter confidence (0.0-1.0)
    boosts_applied          Array(String),         -- Priority boosts that affected decision

    -- Final Decision
    final_status            LowCardinality(String) DEFAULT 'UNKNOWN',  -- ALLOWED, SANITIZED, BLOCKED
    final_decision          LowCardinality(String) DEFAULT 'UNKNOWN',  -- ALLOW, BLOCK
    user_message            String DEFAULT '',     -- Message shown to user (e.g., block message)

    -- PII Detection
    pii_sanitized           UInt8 DEFAULT 0,       -- Boolean as integer
    pii_types_detected      Array(String),         -- Entity types found
    pii_entities_count      UInt16 DEFAULT 0,      -- Number of PII entities

    -- Client Metadata (preserved from v1.8.1)
    client_id               String DEFAULT '',
    browser_name            LowCardinality(String) DEFAULT 'unknown',
    browser_version         String DEFAULT 'unknown',
    os_name                 LowCardinality(String) DEFAULT 'unknown',

    -- Pipeline Metadata
    pipeline_version        LowCardinality(String) DEFAULT 'v2.0.0',
    config_version          LowCardinality(String) DEFAULT 'unknown',
    processing_time_ms      UInt32 DEFAULT 0,      -- Total pipeline processing time

    -- JSON Fields for Deep Analysis
    arbiter_json            String CODEC(ZSTD(3)),        -- Full arbiter result
    branch_results_json     String CODEC(ZSTD(3)),        -- All 3 branch responses
    pii_classification_json String CODEC(ZSTD(3)),        -- PII detection details
    pipeline_flow_json      String CODEC(ZSTD(3))         -- Audit trail of pipeline stages
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, sessionId, id)
TTL toDateTime(timestamp) + INTERVAL 365 DAY DELETE
SETTINGS
    index_granularity = 8192,
    merge_with_ttl_timeout = 3600,
    ttl_only_drop_parts = 1;

-- Indexes for common queries
ALTER TABLE n8n_logs.events_v2 ADD INDEX idx_event_id event_id TYPE bloom_filter GRANULARITY 4;
ALTER TABLE n8n_logs.events_v2 ADD INDEX idx_final_status final_status TYPE bloom_filter GRANULARITY 4;
ALTER TABLE n8n_logs.events_v2 ADD INDEX idx_threat_score threat_score TYPE minmax GRANULARITY 4;
ALTER TABLE n8n_logs.events_v2 ADD INDEX idx_client_id client_id TYPE bloom_filter GRANULARITY 4;
ALTER TABLE n8n_logs.events_v2 ADD INDEX idx_pii_sanitized pii_sanitized TYPE minmax GRANULARITY 4;
