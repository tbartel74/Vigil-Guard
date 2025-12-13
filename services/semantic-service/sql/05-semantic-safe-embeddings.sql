-- ============================================================================
-- Semantic Service: SAFE Pattern Embeddings (Two-Table Search)
-- Purpose: Contrastive table for false positive reduction
-- ============================================================================
-- PRD Reference: VG-SEM-PRD-001 v1.1.1, Phase 3
-- Strategy: Two-Table Search - compare similarity to ATTACK vs SAFE patterns
-- ============================================================================

-- SAFE patterns table for contrastive search
-- Uses same E5 model embeddings as attack patterns (V2 table)
CREATE TABLE IF NOT EXISTS n8n_logs.semantic_safe_embeddings (
    -- Primary identifier
    pattern_id UUID DEFAULT generateUUIDv4(),

    -- Classification (always SAFE, with subcategory)
    category LowCardinality(String) DEFAULT 'SAFE',
    subcategory LowCardinality(String),

    -- Pattern content with compression
    pattern_text String CODEC(ZSTD(3)),

    -- Materialized hash for deduplication
    pattern_hash UInt64 MATERIALIZED cityHash64(pattern_text),

    -- 384-dimensional embedding vector (E5 multilingual)
    embedding Array(Float32),

    -- Model metadata (same as V2 attack table)
    embedding_model LowCardinality(String) DEFAULT 'multilingual-e5-small-int8',
    model_revision String DEFAULT '761b726dd34fb83930e26aab4e9ac3899aa1fa78',

    -- E5 prefix (always 'passage' for database patterns)
    prefix_type Enum8('passage' = 1, 'query' = 2) DEFAULT 'passage',

    -- Source information
    source_dataset String DEFAULT 'safe_patterns_small',
    source LowCardinality(String),  -- e.g., 'dolly', 'code_alpaca'
    language LowCardinality(String) DEFAULT 'en',
    source_index UInt32 DEFAULT 0,

    -- Timestamps
    created_at DateTime64(3) DEFAULT now64(3),
    updated_at DateTime64(3) DEFAULT now64(3),

    -- ==========================================================================
    -- HNSW Vector Similarity Index
    -- Same parameters as attack table for fair comparison
    -- ==========================================================================
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
-- Verification Queries
-- ============================================================================
-- After import, run these to verify:
--
-- 1. Count total records:
--    SELECT count() FROM n8n_logs.semantic_safe_embeddings;
--    -- Expected: ~1545 (safe_patterns: 1445 + security_education: 100)
--
-- 2. Verify subcategory distribution:
--    SELECT subcategory, count() as cnt
--    FROM n8n_logs.semantic_safe_embeddings
--    GROUP BY subcategory
--    ORDER BY cnt DESC;
--
-- 3. Verify embedding dimensions:
--    SELECT length(embedding) as dim, count()
--    FROM n8n_logs.semantic_safe_embeddings
--    GROUP BY dim;
--    -- Expected: dim=384, count=~1545
--
-- 4. Sample contrastive search:
--    WITH [0.1, 0.2, ...] AS query_vec  -- 384-dim vector
--    SELECT
--        'SAFE' as table_type,
--        pattern_id,
--        subcategory,
--        cosineDistance(embedding, query_vec) as distance,
--        1 - cosineDistance(embedding, query_vec) as similarity
--    FROM n8n_logs.semantic_safe_embeddings
--    ORDER BY distance ASC
--    LIMIT 3;
-- ============================================================================
