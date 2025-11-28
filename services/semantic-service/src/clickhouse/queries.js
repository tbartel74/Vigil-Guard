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
    getCategoryBreakdown,
    getStats,
    checkEmbeddingHealth
};
