-- ============================================================================
-- Semantic Service - ClickHouse DDL
-- Branch B: Pattern Embeddings with HNSW Vector Search
-- Version: 1.0.0
-- Date: 2025-11-23
-- ============================================================================

-- Table: pattern_embeddings
-- Purpose: Store MiniLM INT8 embeddings (384-dim) for malicious prompt patterns
-- Index: HNSW usearch for fast cosine similarity search
-- ============================================================================

CREATE TABLE IF NOT EXISTS n8n_logs.pattern_embeddings (
    -- Primary identifiers
    pattern_id String COMMENT 'Unique identifier for the pattern (format: category_index)',
    category String COMMENT 'Threat category (e.g., SQL_INJECTION, JAILBREAK)',

    -- Pattern content
    pattern_text String COMMENT 'Original malicious prompt text',
    pattern_norm String DEFAULT '' COMMENT 'Normalized text (lowercase, stripped)',

    -- Embedding vector (384-dimensional MiniLM)
    embedding Array(Float32) COMMENT '384-dim vector from MiniLM-L6-v2-INT8',

    -- Metadata
    embedding_model String DEFAULT 'all-MiniLM-L6-v2-int8' COMMENT 'Model used for embedding',
    source_dataset String DEFAULT '' COMMENT 'Source dataset (e.g., malicious_3k)',
    source_index UInt32 DEFAULT 0 COMMENT 'Original index in source file',

    -- Timestamps
    created_at DateTime DEFAULT now() COMMENT 'When embedding was created',
    updated_at DateTime DEFAULT now() COMMENT 'Last update timestamp',

    -- HNSW index for fast similarity search
    -- Parameters: M=16 (connections), efConstruction=200 (build quality), efSearch=100 (search quality)
    INDEX embedding_idx embedding TYPE usearch('cosine', 'M=16,efConstruction=200,efSearch=100')
)
ENGINE = MergeTree()
ORDER BY (category, pattern_id)
SETTINGS index_granularity = 8192;

-- ============================================================================
-- Table: embedding_metadata
-- Purpose: Track embedding database state, versions, and statistics
-- ============================================================================

CREATE TABLE IF NOT EXISTS n8n_logs.embedding_metadata (
    id UInt64 COMMENT 'Auto-increment ID',
    key String COMMENT 'Metadata key (e.g., version, model, count)',
    value String COMMENT 'Metadata value',
    created_at DateTime DEFAULT now(),

    PRIMARY KEY (key)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (key);

-- ============================================================================
-- Table: embedding_audit_log
-- Purpose: Track changes to embeddings (add, update, delete, rebuild)
-- ============================================================================

CREATE TABLE IF NOT EXISTS n8n_logs.embedding_audit_log (
    id UUID DEFAULT generateUUIDv4() COMMENT 'Unique audit entry ID',
    action String COMMENT 'Action type: INSERT, UPDATE, DELETE, REBUILD, TRUNCATE',
    pattern_id String DEFAULT '' COMMENT 'Affected pattern ID (empty for bulk ops)',
    category String DEFAULT '' COMMENT 'Affected category',
    details String DEFAULT '' COMMENT 'JSON details of the change',
    user_id String DEFAULT 'system' COMMENT 'User who made the change',
    timestamp DateTime DEFAULT now() COMMENT 'When change occurred',

    INDEX action_idx action TYPE bloom_filter GRANULARITY 4,
    INDEX timestamp_idx timestamp TYPE minmax GRANULARITY 4
)
ENGINE = MergeTree()
ORDER BY (timestamp, id)
TTL timestamp + INTERVAL 90 DAY;

-- ============================================================================
-- Initial metadata entries
-- ============================================================================

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

-- ============================================================================
-- Views for common queries
-- ============================================================================

-- Category statistics view
CREATE VIEW IF NOT EXISTS n8n_logs.v_embedding_category_stats AS
SELECT
    category,
    count() AS pattern_count,
    min(created_at) AS first_added,
    max(updated_at) AS last_updated
FROM n8n_logs.pattern_embeddings
GROUP BY category
ORDER BY pattern_count DESC;

-- Recent audit log view
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
-- Useful queries (for reference, not executed)
-- ============================================================================

-- Top-K similar patterns query:
-- SELECT
--     pattern_id,
--     category,
--     pattern_text,
--     cosineDistance(embedding, [/* 384 floats */]) AS distance,
--     1 - cosineDistance(embedding, [/* 384 floats */]) AS similarity
-- FROM n8n_logs.pattern_embeddings
-- ORDER BY distance ASC
-- LIMIT 5;

-- Category distribution:
-- SELECT category, count() AS cnt FROM n8n_logs.pattern_embeddings GROUP BY category ORDER BY cnt DESC;

-- Embedding health check:
-- SELECT
--     count() AS total_patterns,
--     countIf(length(embedding) = 384) AS valid_embeddings,
--     countIf(length(embedding) != 384) AS invalid_embeddings
-- FROM n8n_logs.pattern_embeddings;
