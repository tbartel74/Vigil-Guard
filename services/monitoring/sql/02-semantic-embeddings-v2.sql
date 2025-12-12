-- ============================================================================
-- Semantic Service - Vector Embeddings for Branch B (LEGACY)
-- ============================================================================
-- DEPRECATED: This file is for v1.0.0 (MiniLM model)
--
-- For v2.0.0 (E5 model + Two-Phase Search), use the authoritative schema files:
--   - services/semantic-service/sql/04-semantic-embeddings-v2.sql (attack patterns)
--   - services/semantic-service/sql/05-semantic-safe-embeddings.sql (safe patterns)
--   - services/semantic-service/sql/06-semantic-analysis-log.sql (logging)
--
-- v2.0.0 uses:
--   - Model: multilingual-e5-small (Xenova/ONNX INT8)
--   - Two-Phase Search: attack + safe pattern comparison
--   - Tables: pattern_embeddings_v2, semantic_safe_embeddings
-- ============================================================================

-- LEGACY TABLE: pattern_embeddings (v1.0.0 - MiniLM)
-- Kept for backward compatibility / rollback scenarios
-- New deployments should use pattern_embeddings_v2 (E5 model)
CREATE TABLE IF NOT EXISTS n8n_logs.pattern_embeddings (
    -- Primary identifiers
    pattern_id String COMMENT 'Format: category_index',
    category String COMMENT 'Threat category',

    -- Pattern content
    pattern_text String COMMENT 'Original malicious prompt',
    pattern_norm String DEFAULT '' COMMENT 'Normalized text',

    -- Embedding vector (384-dim, legacy MiniLM)
    embedding Array(Float32) COMMENT '384-dim from MiniLM (v1.0.0 LEGACY)',

    -- Metadata
    embedding_model String DEFAULT 'all-MiniLM-L6-v2-int8' COMMENT 'LEGACY: v2.0.0 uses multilingual-e5-small-int8',
    source_dataset String DEFAULT '',
    source_index UInt32 DEFAULT 0,

    -- Timestamps
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),

    -- Vector similarity index
    INDEX embedding_idx embedding TYPE vector_similarity('hnsw', 'cosineDistance', 384)
)
ENGINE = MergeTree()
ORDER BY (category, pattern_id)
SETTINGS index_granularity = 8192;

-- TABLE: embedding_metadata (track database state)
CREATE TABLE IF NOT EXISTS n8n_logs.embedding_metadata (
    id UInt64,
    key String,
    value String,
    created_at DateTime DEFAULT now(),
    PRIMARY KEY (key)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (key);

-- TABLE: embedding_audit_log (track changes)
CREATE TABLE IF NOT EXISTS n8n_logs.embedding_audit_log (
    id UUID DEFAULT generateUUIDv4(),
    action String COMMENT 'INSERT, UPDATE, DELETE, REBUILD, TRUNCATE',
    pattern_id String DEFAULT '',
    category String DEFAULT '',
    details String DEFAULT '',
    user_id String DEFAULT 'system',
    timestamp DateTime DEFAULT now(),

    INDEX action_idx action TYPE bloom_filter GRANULARITY 4,
    INDEX timestamp_idx timestamp TYPE minmax GRANULARITY 4
)
ENGINE = MergeTree()
ORDER BY (timestamp, id)
TTL timestamp + INTERVAL 90 DAY;

-- Initial metadata (LEGACY - v1.0.0)
-- For v2.0.0, use pattern_embeddings_v2 with E5 model
INSERT INTO n8n_logs.embedding_metadata (id, key, value) VALUES
    (1, 'schema_version', '1.0.0'),
    (2, 'embedding_model', 'all-MiniLM-L6-v2-int8'),
    (3, 'embedding_dim', '384'),
    (4, 'hnsw_m', '16'),
    (5, 'hnsw_ef_construction', '200'),
    (6, 'hnsw_ef_search', '100'),
    (7, 'created_at', toString(now())),
    (8, 'pattern_count', '0'),
    (9, 'last_rebuild', ''),
    (10, 'last_import', '');

-- Views (LEGACY - reference pattern_embeddings v1.0.0)
CREATE VIEW IF NOT EXISTS n8n_logs.v_embedding_category_stats AS
SELECT
    category,
    count() AS pattern_count,
    min(created_at) AS first_added,
    max(updated_at) AS last_updated
FROM n8n_logs.pattern_embeddings
GROUP BY category
ORDER BY pattern_count DESC;

CREATE VIEW IF NOT EXISTS n8n_logs.v_embedding_recent_audit AS
SELECT
    timestamp,
    action,
    pattern_id,
    category,
    details,
    user_id
FROM n8n_logs.embedding_audit_log
ORDER BY timestamp DESC
LIMIT 100;

-- ============================================================================
-- MIGRATION NOTE
-- ============================================================================
-- To migrate to v2.0.0 (E5 model + Two-Phase Search):
--
-- 1. Create new tables:
--    docker exec -i vigil-clickhouse clickhouse-client \
--        --password $CLICKHOUSE_PASSWORD \
--        < services/semantic-service/sql/04-semantic-embeddings-v2.sql
--
--    docker exec -i vigil-clickhouse clickhouse-client \
--        --password $CLICKHOUSE_PASSWORD \
--        < services/semantic-service/sql/05-semantic-safe-embeddings.sql
--
-- 2. Generate E5 embeddings from source patterns
-- 3. Import to new tables (pattern_embeddings_v2, semantic_safe_embeddings)
-- 4. Enable Two-Phase Search: SEMANTIC_ENABLE_TWO_PHASE=true
--
-- See: services/semantic-service/SETUP.md
-- ============================================================================
