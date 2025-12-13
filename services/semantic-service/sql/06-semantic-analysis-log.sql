-- ============================================================================
-- Semantic Analysis Log Table
-- Purpose: Log semantic classification results for A/B testing and threshold calibration
-- Version: 1.0.0
-- Created: 2025-12-12
-- Phase: E5 Migration Phase 4
-- ============================================================================

-- Create table for semantic analysis logging
CREATE TABLE IF NOT EXISTS n8n_logs.semantic_analysis_log
(
    -- Request Metadata
    timestamp DateTime64(3) DEFAULT now64(3),
    request_id UUID DEFAULT generateUUIDv4(),
    client_id String DEFAULT '',

    -- Input Data
    input_text String CODEC(ZSTD(3)),
    input_length UInt32,

    -- Classification Results
    classification LowCardinality(String),  -- ATTACK, SAFE
    attack_max_similarity Float32,
    safe_max_similarity Float32,
    delta Float32,                          -- attack_max - safe_max (raw)
    adjusted_delta Float32,                 -- delta after instruction-type adjustment
    confidence_score Float32,               -- Overall confidence (0-1)
    safe_is_instruction_type UInt8,         -- Boolean: SAFE match is instruction/programming type

    -- Version Info
    classification_version LowCardinality(String) DEFAULT '2.0',
    model_name LowCardinality(String) DEFAULT 'multilingual-e5-small',
    model_version LowCardinality(String) DEFAULT 'onnx-int8',

    -- Performance Metrics
    latency_ms UInt32,
    embedding_latency_ms UInt32 DEFAULT 0,
    search_latency_ms UInt32 DEFAULT 0,

    -- Top Matches (for debugging and analysis)
    attack_matches String CODEC(ZSTD(3)),   -- JSON array of top 3 matches
    safe_matches String CODEC(ZSTD(3)),     -- JSON array of top 3 matches

    -- Context
    pipeline_version LowCardinality(String) DEFAULT '',
    source LowCardinality(String) DEFAULT 'semantic-service',

    -- Indexes for common queries
    INDEX idx_classification classification TYPE set(10) GRANULARITY 4,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
    INDEX idx_client_id client_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_version classification_version TYPE set(10) GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, request_id)
TTL timestamp + INTERVAL 30 DAY DELETE
SETTINGS index_granularity = 8192;

-- ============================================================================
-- Example Queries for Threshold Calibration (calibrate-thresholds.js):
-- ============================================================================

-- 1. Distribution of similarity scores
-- SELECT
--     quantile(0.10)(attack_max_similarity) as p10,
--     quantile(0.25)(attack_max_similarity) as p25,
--     quantile(0.50)(attack_max_similarity) as p50,
--     quantile(0.75)(attack_max_similarity) as p75,
--     quantile(0.90)(attack_max_similarity) as p90,
--     quantile(0.95)(attack_max_similarity) as p95,
--     quantile(0.99)(attack_max_similarity) as p99,
--     count() as total_samples
-- FROM n8n_logs.semantic_analysis_log
-- WHERE classification_version = '2.0'
--   AND timestamp > now() - INTERVAL 3 DAY;

-- 2. Category distribution
-- SELECT
--     classification,
--     count() as samples,
--     avg(attack_max_similarity) as avg_sim,
--     quantile(0.50)(attack_max_similarity) as median_sim,
--     quantile(0.90)(attack_max_similarity) as p90_sim,
--     avg(delta) as avg_delta
-- FROM n8n_logs.semantic_analysis_log
-- WHERE classification_version = '2.0'
--   AND timestamp > now() - INTERVAL 3 DAY
-- GROUP BY classification
-- ORDER BY avg_sim DESC;

-- 3. Delta distribution by classification
-- SELECT
--     classification,
--     count() as samples,
--     quantile(0.10)(delta) as delta_p10,
--     quantile(0.25)(delta) as delta_p25,
--     quantile(0.50)(delta) as delta_p50,
--     quantile(0.75)(delta) as delta_p75,
--     quantile(0.90)(delta) as delta_p90
-- FROM n8n_logs.semantic_analysis_log
-- WHERE classification_version = '2.0'
--   AND timestamp > now() - INTERVAL 3 DAY
-- GROUP BY classification;

-- 4. Performance percentiles
-- SELECT
--     quantile(0.50)(latency_ms) AS p50,
--     quantile(0.95)(latency_ms) AS p95,
--     quantile(0.99)(latency_ms) AS p99,
--     avg(latency_ms) AS avg_latency
-- FROM n8n_logs.semantic_analysis_log
-- WHERE timestamp >= now() - INTERVAL 1 DAY;

-- 5. Instruction-type SAFE match analysis
-- SELECT
--     safe_is_instruction_type,
--     count() as samples,
--     avg(delta) as avg_delta,
--     avg(adjusted_delta) as avg_adjusted_delta,
--     countIf(classification = 'ATTACK') as attacks,
--     countIf(classification = 'SAFE') as safes
-- FROM n8n_logs.semantic_analysis_log
-- WHERE classification_version = '2.0'
--   AND timestamp > now() - INTERVAL 3 DAY
-- GROUP BY safe_is_instruction_type;
