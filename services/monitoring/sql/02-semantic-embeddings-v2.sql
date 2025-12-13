-- ============================================================================
-- Semantic Service - Vector Embeddings Schema (v2.0.0)
-- ============================================================================
-- Creates embedding tables and auxiliary structures for Two-Phase Search.
-- Tables: pattern_embeddings_v2 (attack), semantic_safe_embeddings (safe)
-- ============================================================================

-- ============================================================================
-- TABLE: pattern_embeddings_v2 (Attack Patterns - E5 Model)
-- ============================================================================
CREATE TABLE IF NOT EXISTS n8n_logs.pattern_embeddings_v2 (
    pattern_id UUID DEFAULT generateUUIDv4(),
    category LowCardinality(String),
    pattern_text String CODEC(ZSTD(3)),
    pattern_hash UInt64 MATERIALIZED cityHash64(pattern_text),
    embedding Array(Float32),
    embedding_model LowCardinality(String) DEFAULT 'multilingual-e5-small-int8',
    model_revision String DEFAULT '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
    prefix_type Enum8('passage' = 1, 'query' = 2) DEFAULT 'passage',
    source_dataset String DEFAULT 'enterprise_prompt_dataset_small_reclassified',
    source_index UInt32 DEFAULT 0,
    created_at DateTime64(3) DEFAULT now64(3),
    updated_at DateTime64(3) DEFAULT now64(3),

    INDEX embedding_hnsw_idx embedding
        TYPE vector_similarity('hnsw', 'cosineDistance', 384)
        GRANULARITY 100000000
)
ENGINE = MergeTree()
PARTITION BY category
ORDER BY (category, pattern_hash, pattern_id)
TTL created_at + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- ============================================================================
-- TABLE: semantic_safe_embeddings (Safe Patterns - Contrastive Search)
-- ============================================================================
CREATE TABLE IF NOT EXISTS n8n_logs.semantic_safe_embeddings (
    pattern_id UUID DEFAULT generateUUIDv4(),
    category LowCardinality(String) DEFAULT 'SAFE',
    subcategory LowCardinality(String),
    pattern_text String CODEC(ZSTD(3)),
    pattern_hash UInt64 MATERIALIZED cityHash64(pattern_text),
    embedding Array(Float32),
    embedding_model LowCardinality(String) DEFAULT 'multilingual-e5-small-int8',
    model_revision String DEFAULT '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
    prefix_type Enum8('passage' = 1, 'query' = 2) DEFAULT 'passage',
    source_dataset String DEFAULT 'safe_patterns_small',
    source LowCardinality(String),
    language LowCardinality(String) DEFAULT 'en',
    source_index UInt32 DEFAULT 0,
    created_at DateTime64(3) DEFAULT now64(3),
    updated_at DateTime64(3) DEFAULT now64(3),

    INDEX embedding_hnsw_idx embedding
        TYPE vector_similarity('hnsw', 'cosineDistance', 384)
        GRANULARITY 100000000
)
ENGINE = MergeTree()
PARTITION BY subcategory
ORDER BY (subcategory, pattern_hash, pattern_id)
TTL created_at + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- ============================================================================
-- TABLE: embedding_metadata (track database state)
-- ============================================================================
CREATE TABLE IF NOT EXISTS n8n_logs.embedding_metadata (
    id UInt64,
    key String,
    value String,
    created_at DateTime DEFAULT now(),
    PRIMARY KEY (key)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (key);

-- ============================================================================
-- TABLE: embedding_audit_log (track changes)
-- ============================================================================
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

-- Initial metadata (v2.1.0 - E5 model)
INSERT INTO n8n_logs.embedding_metadata (id, key, value) VALUES
    (1, 'schema_version', '2.1.0'),
    (2, 'embedding_model', 'multilingual-e5-small-int8'),
    (3, 'embedding_dim', '384'),
    (4, 'hnsw_m', '16'),
    (5, 'hnsw_ef_construction', '200'),
    (6, 'hnsw_ef_search', '100'),
    (7, 'created_at', toString(now())),
    (8, 'attack_pattern_count', '0'),
    (9, 'safe_pattern_count', '0'),
    (10, 'last_rebuild', ''),
    (11, 'last_import', ''),
    (12, 'two_phase_enabled', 'true');

-- ============================================================================
-- VIEWS (require tables above to exist first)
-- ============================================================================
CREATE VIEW IF NOT EXISTS n8n_logs.v_embedding_category_stats AS
SELECT
    category,
    count() AS pattern_count,
    min(created_at) AS first_added,
    max(updated_at) AS last_updated
FROM n8n_logs.pattern_embeddings_v2
GROUP BY category
ORDER BY pattern_count DESC;

CREATE VIEW IF NOT EXISTS n8n_logs.v_safe_embedding_stats AS
SELECT
    subcategory,
    count() AS pattern_count,
    min(created_at) AS first_added,
    max(updated_at) AS last_updated
FROM n8n_logs.semantic_safe_embeddings
GROUP BY subcategory
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
