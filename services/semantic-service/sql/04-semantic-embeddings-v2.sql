-- ============================================================================
-- Semantic Service: Pattern Embeddings V2 (E5 Model)
-- Migration: MiniLM → multilingual-e5-small
-- ============================================================================
-- PRD Reference: VG-SEM-PRD-001 v1.1.1
-- Source: Vigil-Roadmap/semantic-mod/SEMANTIC_MIGRATION_PLAN.md
-- ============================================================================

-- Shadow table for V2 embeddings (E5 model)
-- Runs parallel to pattern_embeddings (V1) during migration
CREATE TABLE IF NOT EXISTS n8n_logs.pattern_embeddings_v2 (
    -- Primary identifier
    pattern_id UUID DEFAULT generateUUIDv4(),

    -- Classification
    category LowCardinality(String),

    -- Pattern content with compression
    pattern_text String CODEC(ZSTD(3)),

    -- Materialized hash for deduplication and fast lookups
    pattern_hash UInt64 MATERIALIZED cityHash64(pattern_text),

    -- 384-dimensional embedding vector (same as V1, no schema change)
    embedding Array(Float32),

    -- Model metadata (V2: E5)
    embedding_model LowCardinality(String) DEFAULT 'multilingual-e5-small-int8',
    model_revision String DEFAULT 'fce5169d6bd6e56c54b0ef02ae54b24ee5b44ed5',

    -- E5-specific: prefix type used during embedding generation
    -- 'passage' for database patterns, 'query' for runtime queries
    prefix_type Enum8('passage' = 1, 'query' = 2) DEFAULT 'passage',

    -- Dataset provenance
    source_dataset String DEFAULT 'enterprise_prompt_dataset_small_reclassified',
    source_index UInt32 DEFAULT 0,

    -- Timestamps
    created_at DateTime64(3) DEFAULT now64(3),
    updated_at DateTime64(3) DEFAULT now64(3),

    -- ==========================================================================
    -- HNSW Vector Similarity Index
    -- ==========================================================================
    -- ClickHouse 25.x: vector_similarity(method, distance, dimensions)
    -- Using same parameters as V1 table for compatibility
    -- ==========================================================================
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
-- Verification Queries
-- ============================================================================
-- After import, run these to verify:
--
-- 1. Count total records:
--    SELECT count() FROM n8n_logs.pattern_embeddings_v2;
--    -- Expected: 4994
--
-- 2. Verify model metadata:
--    SELECT embedding_model, model_revision, count()
--    FROM n8n_logs.pattern_embeddings_v2
--    GROUP BY embedding_model, model_revision;
--
-- 3. Check category distribution:
--    SELECT category, count() as cnt
--    FROM n8n_logs.pattern_embeddings_v2
--    GROUP BY category
--    ORDER BY cnt DESC
--    LIMIT 10;
--
-- 4. Verify embedding dimensions:
--    SELECT length(embedding) as dim, count()
--    FROM n8n_logs.pattern_embeddings_v2
--    GROUP BY dim;
--    -- Expected: dim=384, count=4994
--
-- 5. Sample similarity search (after index builds):
--    WITH [0.1, 0.2, ...] AS query_vec  -- 384-dim vector
--    SELECT
--        pattern_id,
--        category,
--        cosineDistance(embedding, query_vec) as distance
--    FROM n8n_logs.pattern_embeddings_v2
--    ORDER BY distance ASC
--    LIMIT 5;
-- ============================================================================
