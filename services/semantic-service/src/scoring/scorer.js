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
 * Build branch_result from Two-Phase Search (attack vs safe pattern comparison).
 * Calibrated on 55-example dataset; real-world accuracy may vary.
 *
 * @param {Object} twoPhaseResult - Result from searchTwoPhase()
 * @param {number} timingMs - Processing time in milliseconds
 * @param {boolean} degraded - Whether service is in degraded mode
 * @returns {Object} - Complete branch_result object
 */
function buildTwoPhaseResult(twoPhaseResult, timingMs, degraded = false) {
    const {
        classification,
        attack_max_similarity,
        safe_max_similarity,
        delta,
        adjusted_delta,
        safe_is_instruction_type,
        confidence,
        attack_matches,
        safe_matches,
        delta_threshold
    } = twoPhaseResult;

    // SAFE classification - confident that input is benign
    if (classification === 'SAFE') {
        return {
            branch_id: config.branch.id,
            name: config.branch.name,
            score: 0,  // Safe input - no threat
            threat_level: ThreatLevel.LOW,
            confidence: parseFloat(confidence.toFixed(4)),
            critical_signals: {
                high_similarity: false,
                two_phase_safe: true  // Flag for Arbiter
            },
            features: {
                top_similarity: parseFloat(attack_max_similarity.toFixed(4)),
                safe_similarity: parseFloat(safe_max_similarity.toFixed(4)),
                delta: parseFloat(delta.toFixed(4)),
                adjusted_delta: adjusted_delta !== undefined ? parseFloat(adjusted_delta.toFixed(4)) : undefined,
                safe_is_instruction_type: safe_is_instruction_type,
                delta_threshold,
                classification,
                attack_matches: attack_matches.slice(0, 3),
                safe_matches: safe_matches.slice(0, 3),
                embedding_model: config.model.name,
                two_phase_search: true,
                classification_version: '2.3'
            },
            explanations: [
                `Two-Phase v2.3: SAFE (delta ${(delta * 100).toFixed(1)}%)`,
                `Attack: ${(attack_max_similarity * 100).toFixed(1)}%, Safe: ${(safe_max_similarity * 100).toFixed(1)}%`,
                safe_is_instruction_type
                    ? 'Safe match is instruction-type - lexically similar but safe intent'
                    : 'Input more similar to safe patterns'
            ],
            timing_ms: timingMs,
            degraded
        };
    }

    // UNCERTAIN classification - let other branches decide
    // This is KEY to reducing FP: ambiguous cases don't contribute to blocking
    if (classification === 'UNCERTAIN') {
        return {
            branch_id: config.branch.id,
            name: config.branch.name,
            score: 0,  // Neutral - don't influence Arbiter
            threat_level: ThreatLevel.LOW,
            confidence: parseFloat(confidence.toFixed(4)),
            critical_signals: {
                high_similarity: false,
                two_phase_uncertain: true  // New flag for Arbiter
            },
            features: {
                top_similarity: parseFloat(attack_max_similarity.toFixed(4)),
                safe_similarity: parseFloat(safe_max_similarity.toFixed(4)),
                delta: parseFloat(delta.toFixed(4)),
                adjusted_delta: adjusted_delta !== undefined ? parseFloat(adjusted_delta.toFixed(4)) : undefined,
                safe_is_instruction_type: safe_is_instruction_type,
                delta_threshold,
                classification,
                attack_matches: attack_matches.slice(0, 3),
                safe_matches: safe_matches.slice(0, 3),
                embedding_model: config.model.name,
                two_phase_search: true,
                classification_version: '2.3'
            },
            explanations: [
                `Two-Phase v2.3: UNCERTAIN (delta ${(delta * 100).toFixed(1)}%)`,
                `Attack: ${(attack_max_similarity * 100).toFixed(1)}%, Safe: ${(safe_max_similarity * 100).toFixed(1)}%`,
                'Ambiguous match - deferring to other detection branches'
            ],
            timing_ms: timingMs,
            degraded
        };
    }

    // ATTACK classification - score based on confidence (delta)
    // Key insight: When safe_sim is close to attack_sim, reduce score
    // This prevents FP from borderline cases while keeping clear attacks high-scoring

    // Delta-adjusted scoring v2.5:
    // - If delta >= 0.10 (clear attack): full score
    // - If delta < 0.10: reduce score proportionally
    // - Min score floor: 40 (so attacks still contribute to Arbiter)
    let deltaFactor = 1.0;
    if (delta < 0.10) {
        // Scale from 0.5 (delta=0) to 1.0 (delta=0.10)
        deltaFactor = 0.5 + (delta / 0.10) * 0.5;
        deltaFactor = Math.max(0.5, Math.min(1.0, deltaFactor));
    }

    // Additional reduction for instruction-type safe matches (educational content)
    if (safe_is_instruction_type && delta < 0.05) {
        deltaFactor *= 0.7;
    }

    const rawScore = attack_max_similarity * 100;
    const score = Math.min(100, Math.max(0, Math.round(rawScore * deltaFactor)));

    // Determine threat level based on score
    let threat_level;
    if (score >= config.scoring.thresholds.medium) {
        threat_level = ThreatLevel.HIGH;
    } else if (score >= config.scoring.thresholds.low) {
        threat_level = ThreatLevel.MEDIUM;
    } else {
        threat_level = ThreatLevel.LOW;
    }

    // High similarity flag for Arbiter - only when delta is significant
    const highSimilarity = attack_max_similarity >= 0.85 && delta >= 0.05;

    // Build top_k from attack matches
    const top_k = attack_matches.slice(0, config.search.topK).map(m => ({
        pattern_id: m.pattern_id,
        category: m.category,
        similarity: parseFloat(m.similarity.toFixed(4))
    }));

    return {
        branch_id: config.branch.id,
        name: config.branch.name,
        score,
        threat_level,
        confidence: parseFloat(confidence.toFixed(4)),
        critical_signals: {
            high_similarity: highSimilarity,
            two_phase_safe: false
        },
        features: {
            top_similarity: parseFloat(attack_max_similarity.toFixed(4)),
            safe_similarity: parseFloat(safe_max_similarity.toFixed(4)),
            delta: parseFloat(delta.toFixed(4)),
            adjusted_delta: adjusted_delta !== undefined ? parseFloat(adjusted_delta.toFixed(4)) : undefined,
            safe_is_instruction_type: safe_is_instruction_type,
            delta_threshold,
            classification,
            top_k,
            safe_matches: safe_matches.slice(0, 3),
            embedding_model: config.model.name,
            patterns_searched: attack_matches.length,
            two_phase_search: true,
            classification_version: '2.3'
        },
        explanations: [
            `Two-Phase v2.3: ATTACK (delta ${(delta * 100).toFixed(1)}%)`,
            `Attack: ${(attack_max_similarity * 100).toFixed(1)}%, Safe: ${(safe_max_similarity * 100).toFixed(1)}%`,
            `Top match: ${attack_matches[0]?.category || 'UNKNOWN'} (${(attack_max_similarity * 100).toFixed(1)}% similarity)`,
            safe_is_instruction_type
                ? 'Safe match is instruction-type (higher threshold applied)'
                : undefined
        ].filter(Boolean),
        timing_ms: timingMs,
        degraded
    };
}

/**
 * Build degraded branch_result (when service has issues)
 *
 * IMPORTANT: Degraded responses return HTTP 200 (not 5xx) by design.
 * This allows the Arbiter to continue processing with other branches.
 *
 * Unified Contract v2.1 (FAIL-SECURE):
 * - score: 100 (BLOCK, fail-secure mode)
 * - threat_level: HIGH (secure default)
 * - decision: 'BLOCK' (explicit decision)
 * - degraded: true (signals to Arbiter to use other branches)
 * - critical_signals.high_similarity: false (no boost applied)
 *
 * Arbiter behavior on degraded response:
 * - Excludes this branch from weighted average
 * - Uses remaining branches for decision
 * - Logs degraded state in arbiter_json
 *
 * @param {string} reason - Reason for degraded mode
 * @param {number} timingMs - Processing time
 * @param {Object} options - Options object with failSecure flag
 * @returns {Object} - Degraded branch_result with score=100 (fail-secure), degraded=true
 */
function buildDegradedResult(reason, timingMs, options = {}) {
    const failSecure = options.failSecure !== false; // Default to fail-secure
    return {
        branch_id: config.branch.id,
        name: config.branch.name,
        score: failSecure ? 100 : 0,
        threat_level: failSecure ? ThreatLevel.HIGH : ThreatLevel.LOW,
        decision: failSecure ? 'BLOCK' : 'ALLOW',
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
        reason: failSecure ? 'Service error - fail-secure mode' : 'Service error - degraded mode',
        timing_ms: timingMs,
        degraded: true
    };
}

module.exports = {
    ThreatLevel,
    calculateScore,
    generateExplanations,
    buildBranchResult,
    buildTwoPhaseResult,
    buildDegradedResult
};
