-- ============================================================================
-- Semantic Service - Vector Embeddings for Branch B
-- Pattern matching via HNSW cosine similarity search
-- Source: services/semantic-service/sql/01-create-tables.sql
-- ============================================================================

-- TABLE: pattern_embeddings (3000 malicious prompt patterns)
-- NOTE: NO TTL - permanent data, never expires
CREATE TABLE IF NOT EXISTS n8n_logs.pattern_embeddings (
    -- Primary identifiers
    pattern_id String COMMENT 'Format: category_index',
    category String COMMENT 'Threat category (29 types)',

    -- Pattern content
    pattern_text String COMMENT 'Original malicious prompt',
    pattern_norm String DEFAULT '' COMMENT 'Normalized text',

    -- Embedding vector (384-dim MiniLM)
    embedding Array(Float32) COMMENT '384-dim from all-MiniLM-L6-v2-int8',

    -- Metadata
    embedding_model String DEFAULT 'all-MiniLM-L6-v2-int8',
    source_dataset String DEFAULT '',
    source_index UInt32 DEFAULT 0,

    -- Timestamps
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),

    -- Vector similarity index for fast cosine search
    -- Note: vector_similarity requires ClickHouse 24.1+
    -- Arguments: method, distance_function, dimensions (384 = all-MiniLM-L6-v2 output)
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

-- Initial metadata
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

-- Views
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
