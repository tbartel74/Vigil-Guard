/**
 * Threat Scorer for Semantic Service
 * Maps similarity results to threat levels according to branch_result contract
 */

const config = require('../config');

/**
 * Threat level enum
 */
const ThreatLevel = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH'
};

/**
 * Calculate threat score from similarity results
 *
 * Score = top_similarity * 100 (0-100 scale)
 * Threat Level:
 *   - LOW: score < 40
 *   - MEDIUM: 40 <= score < 70
 *   - HIGH: score >= 70
 *
 * @param {Array} results - Array of similarity search results
 * @returns {Object} - Score, threat level, confidence
 */
function calculateScore(results) {
    if (!results || results.length === 0) {
        return {
            score: 0,
            threat_level: ThreatLevel.LOW,
            confidence: 0,
            top_similarity: 0
        };
    }

    const topResult = results[0];
    const topSimilarity = topResult.similarity;

    // Score = similarity * 100
    const score = Math.min(100, Math.round(topSimilarity * 100));

    // Determine threat level
    let threat_level;
    if (score >= config.scoring.thresholds.medium) {
        threat_level = ThreatLevel.HIGH;
    } else if (score >= config.scoring.thresholds.low) {
        threat_level = ThreatLevel.MEDIUM;
    } else {
        threat_level = ThreatLevel.LOW;
    }

    // Confidence is the top similarity
    const confidence = topSimilarity;

    return {
        score,
        threat_level,
        confidence,
        top_similarity: topSimilarity
    };
}

/**
 * Generate explanations from results
 *
 * @param {Array} results - Similarity search results
 * @param {number} score - Calculated score
 * @returns {Array<string>} - Human-readable explanations
 */
function generateExplanations(results, score) {
    const explanations = [];

    if (!results || results.length === 0) {
        explanations.push('No similar patterns found in database');
        return explanations;
    }

    const topResult = results[0];
    const topSimilarity = (topResult.similarity * 100).toFixed(1);

    explanations.push(
        `Top similarity ${topSimilarity}% to pattern ${topResult.pattern_id} (${topResult.category})`
    );

    // Add category breakdown if multiple categories
    const categories = [...new Set(results.map(r => r.category))];
    if (categories.length > 1) {
        explanations.push(
            `Matched categories: ${categories.slice(0, 3).join(', ')}${categories.length > 3 ? ` (+${categories.length - 3} more)` : ''}`
        );
    }

    // Add confidence note
    if (topResult.similarity >= 0.9) {
        explanations.push('Very high semantic similarity detected');
    } else if (topResult.similarity >= 0.7) {
        explanations.push('High semantic similarity detected');
    } else if (topResult.similarity >= 0.5) {
        explanations.push('Moderate semantic similarity detected');
    }

    return explanations;
}

/**
 * Build branch_result object for API response
 *
 * Unified Contract v2.1:
 * - Arbiter uses ONLY: score, threat_level, confidence, critical_signals
 * - Arbiter does NOT inspect features internals
 * - critical_signals.high_similarity = true when top_similarity >= 0.85
 *
 * @param {Array} results - Similarity search results
 * @param {number} timingMs - Processing time in milliseconds
 * @param {boolean} degraded - Whether service is in degraded mode
 * @returns {Object} - Complete branch_result object
 */
function buildBranchResult(results, timingMs, degraded = false) {
    const { score, threat_level, confidence, top_similarity } = calculateScore(results);
    const explanations = generateExplanations(results, score);

    // Build top_k features
    const top_k = results.slice(0, config.search.topK).map(r => ({
        pattern_id: r.pattern_id,
        category: r.category,
        similarity: parseFloat(r.similarity.toFixed(4))
    }));

    // Unified Contract v2.1: critical_signals for Arbiter
    // Arbiter uses ONLY this flag, NOT features.top_similarity
    const highSimilarityThreshold = 0.85;
    const highSimilarity = top_similarity >= highSimilarityThreshold;

    return {
        branch_id: config.branch.id,
        name: config.branch.name,
        score,
        threat_level,
        confidence: parseFloat(confidence.toFixed(4)),
        // Unified contract v2.1: critical_signals for Arbiter
        critical_signals: {
            high_similarity: highSimilarity
        },
        // Internal details for debugging (Arbiter ignores this)
        features: {
            top_similarity: parseFloat(top_similarity.toFixed(4)),
            top_k,
            embedding_model: config.model.name,
            patterns_searched: results.length
        },
        explanations,
        timing_ms: timingMs,
        degraded
    };
}

/**
 * Build degraded branch_result (when service has issues)
 *
 * Unified Contract v2.1: critical_signals always present
 *
 * @param {string} reason - Reason for degraded mode
 * @param {number} timingMs - Processing time
 * @returns {Object} - Degraded branch_result
 */
function buildDegradedResult(reason, timingMs) {
    return {
        branch_id: config.branch.id,
        name: config.branch.name,
        score: 0,
        threat_level: ThreatLevel.LOW,
        confidence: 0,
        // Unified contract v2.1: critical_signals for Arbiter
        critical_signals: {
            high_similarity: false
        },
        features: {
            top_similarity: 0,
            top_k: [],
            embedding_model: config.model.name,
            patterns_searched: 0,
            degraded_reason: reason
        },
        explanations: [`Service degraded: ${reason}`],
        timing_ms: timingMs,
        degraded: true
    };
}

module.exports = {
    ThreatLevel,
    calculateScore,
    generateExplanations,
    buildBranchResult,
    buildDegradedResult
};
