-- ============================================================================
-- Semantic Service - ClickHouse DDL
-- Branch B: Pattern Embeddings with HNSW Vector Search
-- Version: 2.0.0 (E5 model - Two-Phase Search)
-- Date: 2025-12-12
-- ============================================================================
-- NOTE: This file creates auxiliary tables only.
-- Main embedding tables are created by:
--   - 04-semantic-embeddings-v2.sql (pattern_embeddings_v2 - ATTACK patterns)
--   - 05-semantic-safe-embeddings.sql (semantic_safe_embeddings - SAFE patterns)
-- ============================================================================

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
-- Initial metadata entries (E5 model - Two-Phase Search)
-- ============================================================================

INSERT INTO n8n_logs.embedding_metadata (id, key, value) VALUES
    (1, 'schema_version', '2.0.0'),
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
-- Views for common queries
-- ============================================================================

-- Category statistics view (ATTACK patterns)
CREATE VIEW IF NOT EXISTS n8n_logs.v_embedding_category_stats AS
SELECT
    category,
    count() AS pattern_count,
    min(created_at) AS first_added,
    max(updated_at) AS last_updated
FROM n8n_logs.pattern_embeddings_v2
GROUP BY category
ORDER BY pattern_count DESC;

-- Safe embeddings statistics view
CREATE VIEW IF NOT EXISTS n8n_logs.v_safe_embedding_stats AS
SELECT
    subcategory,
    count() AS pattern_count,
    min(created_at) AS first_added,
    max(updated_at) AS last_updated
FROM n8n_logs.semantic_safe_embeddings
GROUP BY subcategory
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

-- Top-K similar ATTACK patterns query:
-- SELECT
--     pattern_id,
--     category,
--     pattern_text,
--     cosineDistance(embedding, [/* 384 floats */]) AS distance,
--     1 - cosineDistance(embedding, [/* 384 floats */]) AS similarity
-- FROM n8n_logs.pattern_embeddings_v2
-- ORDER BY distance ASC
-- LIMIT 5;

-- Top-K similar SAFE patterns query (for false positive check):
-- SELECT
--     subcategory,
--     pattern_text,
--     cosineDistance(embedding, [/* 384 floats */]) AS distance,
--     1 - cosineDistance(embedding, [/* 384 floats */]) AS similarity
-- FROM n8n_logs.semantic_safe_embeddings
-- ORDER BY distance ASC
-- LIMIT 5;

-- Category distribution (ATTACK):
-- SELECT category, count() AS cnt FROM n8n_logs.pattern_embeddings_v2 GROUP BY category ORDER BY cnt DESC;

-- Subcategory distribution (SAFE):
-- SELECT subcategory, count() AS cnt FROM n8n_logs.semantic_safe_embeddings GROUP BY subcategory ORDER BY cnt DESC;

-- Embedding health check (ATTACK):
-- SELECT
--     count() AS total_patterns,
--     countIf(length(embedding) = 384) AS valid_embeddings,
--     countIf(length(embedding) != 384) AS invalid_embeddings
-- FROM n8n_logs.pattern_embeddings_v2;

-- Embedding health check (SAFE):
-- SELECT
--     count() AS total_patterns,
--     countIf(length(embedding) = 384) AS valid_embeddings,
--     countIf(length(embedding) != 384) AS invalid_embeddings
-- FROM n8n_logs.semantic_safe_embeddings;
