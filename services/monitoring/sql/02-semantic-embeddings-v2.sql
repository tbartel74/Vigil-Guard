-- ============================================================================
-- Semantic Service - Vector Embeddings Schema (v2.0.0)
-- ============================================================================
-- IMPORTANT: Main embedding tables are defined in semantic-service:
--   - services/semantic-service/sql/04-semantic-embeddings-v2.sql (attack patterns)
--   - services/semantic-service/sql/05-semantic-safe-embeddings.sql (safe patterns)
--   - services/semantic-service/sql/06-semantic-analysis-log.sql (logging)
--
-- This file creates auxiliary tables only (metadata, audit log, views).
-- See: services/semantic-service/SETUP.md for complete setup instructions.
-- ============================================================================

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

-- Initial metadata (v2.0.0 - E5 model)
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

-- Views for v2.0.0 tables
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
