/**
 * ClickHouse Query Functions
 * HNSW vector similarity search using cosineDistance
 */

const client = require('./client');
const config = require('../config');

/**
 * Validates topK parameter to prevent SQL injection.
 *
 * @param {number} topK - Number of results to return
 * @returns {number} Validated topK (clamped to 1-100)
 * @throws Error if topK is not a valid integer
 */
function validateTopK(topK) {
    const parsed = parseInt(topK, 10);
    if (isNaN(parsed)) {
        throw new Error('topK must be a valid integer');
    }
    // Clamp to reasonable range
    return Math.max(1, Math.min(100, parsed));
}

/**
 * Search for similar patterns using HNSW index
 *
 * @param {number[]} embedding - Query embedding (384 dimensions)
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} - Array of similar patterns
 */
async function searchSimilar(embedding, topK = config.search.topK) {
    if (!Array.isArray(embedding) || embedding.length !== config.model.dimension) {
        throw new Error(`Invalid embedding: expected array of ${config.model.dimension} floats`);
    }

    const validatedTopK = validateTopK(topK);
    const embeddingStr = embedding.map(v => v.toFixed(8)).join(',');

    const sql = `
        SELECT
            pattern_id,
            category,
            pattern_text,
            cosineDistance(embedding, [${embeddingStr}]) AS distance,
            1 - cosineDistance(embedding, [${embeddingStr}]) AS similarity
        FROM ${config.clickhouse.table}
        ORDER BY distance ASC
        LIMIT ${validatedTopK}
        FORMAT JSON
    `;

    const result = await client.query(sql);

    if (!result || !result.data) {
        return [];
    }

    return result.data.map(row => ({
        pattern_id: row.pattern_id,
        category: row.category,
        pattern_text: row.pattern_text,
        distance: parseFloat(row.distance),
        similarity: parseFloat(row.similarity)
    }));
}

/**
 * Get categories with highest similarity
 *
 * @param {number[]} embedding - Query embedding
 * @param {number} topK - Number of patterns to consider
 * @returns {Promise<Object>} - Category counts and scores
 */
async function getCategoryBreakdown(embedding, topK = config.search.topK) {
    const validatedTopK = validateTopK(topK);
    const results = await searchSimilar(embedding, validatedTopK);

    const categories = {};
    results.forEach((r, i) => {
        if (!categories[r.category]) {
            categories[r.category] = {
                count: 0,
                maxSimilarity: 0,
                totalSimilarity: 0,
                patterns: []
            };
        }
        categories[r.category].count++;
        categories[r.category].maxSimilarity = Math.max(
            categories[r.category].maxSimilarity,
            r.similarity
        );
        categories[r.category].totalSimilarity += r.similarity;
        categories[r.category].patterns.push({
            pattern_id: r.pattern_id,
            similarity: r.similarity,
            rank: i + 1
        });
    });

    // Sort by max similarity
    const sorted = Object.entries(categories)
        .map(([category, data]) => ({
            category,
            ...data,
            avgSimilarity: data.totalSimilarity / data.count
        }))
        .sort((a, b) => b.maxSimilarity - a.maxSimilarity);

    return sorted;
}

/**
 * Get database statistics
 */
async function getStats() {
    const countSql = `SELECT count() as cnt FROM ${config.clickhouse.table} FORMAT JSON`;
    const categorySql = `
        SELECT category, count() as cnt
        FROM ${config.clickhouse.table}
        GROUP BY category
        ORDER BY cnt DESC
        LIMIT 10
        FORMAT JSON
    `;

    const [countResult, categoryResult] = await Promise.all([
        client.query(countSql),
        client.query(categorySql)
    ]);

    return {
        totalPatterns: countResult?.data?.[0]?.cnt || 0,
        topCategories: (categoryResult?.data || []).map(row => ({
            category: row.category,
            count: row.cnt
        }))
    };
}

/**
 * Two-Phase Search: Compare similarity to ATTACK vs SAFE patterns
 *
 * Algorithm:
 * 1. Search top-K in ATTACK table (pattern_embeddings_v2)
 * 2. Search top-K in SAFE table (semantic_safe_embeddings)
 * 3. Calculate delta = attack_max_similarity - safe_max_similarity
 * 4. If delta > threshold: classify as attack (true positive)
 * 5. If delta <= threshold: likely safe input (false positive reduction)
 *
 * @param {number[]} embedding - Query embedding (384 dimensions)
 * @param {number} topK - Number of results per table
 * @param {Object} options - Configuration options
 * @param {number} options.deltaThreshold - Delta threshold for classification (default: 0.05)
 * @returns {Promise<Object>} - Two-phase search results with classification
 */
async function searchTwoPhase(embedding, topK = 5, options = {}) {
    if (!Array.isArray(embedding) || embedding.length !== config.model.dimension) {
        throw new Error(`Invalid embedding: expected array of ${config.model.dimension} floats`);
    }

    const validatedTopK = validateTopK(topK);
    const deltaThreshold = options.deltaThreshold ?? 0.05;
    const embeddingStr = embedding.map(v => v.toFixed(8)).join(',');

    // Two-Phase Search: Single query with UNION ALL for both tables
    // Note: Both tables have UUID pattern_id, convert to String for UNION compatibility
    const sql = `
        WITH
            attack_matches AS (
                SELECT
                    'ATTACK' AS table_type,
                    category,
                    '' AS subcategory,
                    substring(pattern_text, 1, 100) AS pattern_snippet,
                    toString(pattern_id) AS pattern_id,
                    1 - cosineDistance(embedding, [${embeddingStr}]) AS similarity
                FROM ${config.clickhouse.database}.pattern_embeddings_v2
                ORDER BY similarity DESC
                LIMIT ${validatedTopK}
            ),
            safe_matches AS (
                SELECT
                    'SAFE' AS table_type,
                    category,
                    subcategory,
                    substring(pattern_text, 1, 100) AS pattern_snippet,
                    toString(pattern_id) AS pattern_id,
                    1 - cosineDistance(embedding, [${embeddingStr}]) AS similarity
                FROM ${config.clickhouse.database}.semantic_safe_embeddings
                ORDER BY similarity DESC
                LIMIT ${validatedTopK}
            )
        SELECT * FROM (
            SELECT * FROM attack_matches
            UNION ALL
            SELECT * FROM safe_matches
        )
        ORDER BY table_type, similarity DESC
        FORMAT JSON
    `;

    const result = await client.query(sql);

    if (!result || !result.data || result.data.length === 0) {
        return {
            classification: 'UNKNOWN',
            attack_max_similarity: 0,
            safe_max_similarity: 0,
            delta: 0,
            confidence: 0,
            attack_matches: [],
            safe_matches: [],
            delta_threshold: deltaThreshold
        };
    }

    // Separate results by table type
    const attackMatches = result.data
        .filter(r => r.table_type === 'ATTACK')
        .map(r => ({
            pattern_id: r.pattern_id,
            category: r.category,
            pattern_snippet: r.pattern_snippet,
            similarity: parseFloat(r.similarity)
        }));

    const safeMatches = result.data
        .filter(r => r.table_type === 'SAFE')
        .map(r => ({
            pattern_id: r.pattern_id,
            category: r.category,
            subcategory: r.subcategory,
            pattern_snippet: r.pattern_snippet,
            similarity: parseFloat(r.similarity)
        }));

    // Calculate aggregated scores
    const attackMaxSim = attackMatches.length > 0
        ? Math.max(...attackMatches.map(m => m.similarity))
        : 0;
    const safeMaxSim = safeMatches.length > 0
        ? Math.max(...safeMatches.map(m => m.similarity))
        : 0;

    // Delta: positive means more similar to attacks, negative means more similar to safe
    const delta = attackMaxSim - safeMaxSim;

    // Classification v2.3: SAFE/ATTACK/UNCERTAIN (confident-only approach)
    let classification;

    // Subcategory detection for threshold adjustments
    const topSafeSubcat = safeMatches[0]?.subcategory || '';
    const safeIsInstructionType = topSafeSubcat.includes('programming') ||
                                  topSafeSubcat.includes('instruction') ||
                                  topSafeSubcat.includes('alpaca') ||
                                  topSafeSubcat.includes('code') ||
                                  topSafeSubcat.includes('general');
    const safeIsSecurityEducation = topSafeSubcat.includes('security_education');

    // Instruction-type matches get +0.05 delta bonus (security_education excluded)
    const adjustedDelta = safeIsInstructionType && !safeIsSecurityEducation
        ? delta + 0.05
        : delta;

    // === SAFE RULES (S1-S4) ===
    // S1: safe > attack + margin, attack < 0.85
    const s1Threshold = safeIsSecurityEducation ? 0.04 : (safeIsInstructionType ? 0.05 : 0.02);
    if (safeMaxSim >= attackMaxSim + s1Threshold && attackMaxSim < 0.85) {
        classification = 'SAFE';
    }
    // S2: security_education with high safe (>=0.92) and strong delta (<-0.07)
    else if (safeIsSecurityEducation && safeMaxSim >= 0.92 && delta < -0.07) {
        classification = 'SAFE';
    }
    // S3: instruction-type with delta <-0.05 and attack <0.82
    else if (safeIsInstructionType && delta < -0.05 && attackMaxSim < 0.82) {
        classification = 'SAFE';
    }
    // S4: non-instruction with safe >=0.88, delta <-0.01, attack <0.85
    else if (!safeIsInstructionType && safeMaxSim >= 0.88 && delta < -0.01 && attackMaxSim < 0.85) {
        classification = 'SAFE';
    }

    // === ATTACK RULES (A1-A6) ===
    // A1: attack >=0.88, unless safe overwhelms (safe >=0.92 && delta <-0.02)
    else if (attackMaxSim >= 0.88 && !(safeMaxSim >= 0.92 && delta < -0.02)) {
        classification = 'ATTACK';
    }
    // A2: attack >=0.865 + instruction-type, exceptions for high safe
    else if (attackMaxSim >= 0.865 && safeIsInstructionType
             && !(safeMaxSim >= 0.92 && delta < -0.02)
             && !(safeMaxSim >= 0.91 && delta < -0.04)) {
        classification = 'ATTACK';
    }
    // A3: attack >=0.85 + instruction-type + delta >-0.022
    else if (attackMaxSim >= 0.85 && safeIsInstructionType && delta > -0.022 && !(safeMaxSim >= 0.91 && delta < -0.03)) {
        classification = 'ATTACK';
    }
    // A4a: attack >=0.85 + delta >-0.02 (non-instruction)
    else if (attackMaxSim >= 0.85 && delta > -0.02) {
        classification = 'ATTACK';
    }
    // A4b: attack >=0.82 + instruction-type + delta >-0.02
    else if (attackMaxSim >= 0.82 && safeIsInstructionType && delta > -0.02 && !(safeMaxSim >= 0.88 && delta < -0.04)) {
        classification = 'ATTACK';
    }
    // A5: attack >=0.82 + delta >0.02
    else if (attackMaxSim >= 0.82 && delta > 0.02) {
        classification = 'ATTACK';
    }
    // A6: attack >=0.78 + delta >0.08
    else if (attackMaxSim >= 0.78 && delta > 0.08) {
        classification = 'ATTACK';
    }

    // === BORDERLINE RULES (B1-B2) ===
    // B1: security_education with safe <0.92 and attack >=0.82
    else if (safeIsSecurityEducation && safeMaxSim < 0.92 && attackMaxSim >= 0.82) {
        classification = 'ATTACK';
    }
    // B2: attack 0.78-0.85 + instruction-type + delta >-0.03
    else if (attackMaxSim >= 0.78 && attackMaxSim < 0.85 && safeIsInstructionType && delta > -0.03) {
        classification = 'ATTACK';
    }
    // Default: SAFE (borderline cases default to safe)
    else {
        classification = 'SAFE';
    }

    // Confidence: how certain we are about the classification
    // Higher absolute delta = higher confidence
    const confidence = Math.min(1, Math.abs(delta) * 10); // Scale to 0-1

    return {
        classification,
        attack_max_similarity: attackMaxSim,
        safe_max_similarity: safeMaxSim,
        delta,
        adjusted_delta: adjustedDelta,
        safe_is_instruction_type: safeIsInstructionType,
        safe_is_security_education: safeIsSecurityEducation,
        confidence,
        attack_matches: attackMatches.slice(0, 3),
        safe_matches: safeMatches.slice(0, 3),
        delta_threshold: deltaThreshold
    };
}

/**
 * Check embedding health (validate dimensions)
 */
async function checkEmbeddingHealth() {
    const sql = `
        SELECT
            count() AS total,
            countIf(length(embedding) = ${config.model.dimension}) AS valid,
            countIf(length(embedding) != ${config.model.dimension}) AS invalid
        FROM ${config.clickhouse.table}
        FORMAT JSON
    `;

    const result = await client.query(sql);
    const data = result?.data?.[0] || { total: 0, valid: 0, invalid: 0 };

    return {
        total: data.total,
        valid: data.valid,
        invalid: data.invalid,
        healthy: data.invalid === 0 || data.invalid === '0'
    };
}

module.exports = {
    searchSimilar,
    searchTwoPhase,
    getCategoryBreakdown,
    getStats,
    checkEmbeddingHealth
};
