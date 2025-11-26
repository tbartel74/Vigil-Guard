/**
 * Scoring system for Heuristics Service
 * Combines sub-scores from detectors using weighted average
 *
 * v2.1.0: Added normalization signals scoring
 * - leet_conversions, emoji_conversions boost obfuscation score
 * - encoding_layers (nested Base64/Hex) indicates evasion attempt
 * - template_markers_removed indicates injection attempt
 * - zero_width_count and homoglyph_count from normalization
 */

import { config } from '../config/index.js';

// Normalization signal weights (configurable)
const NORM_WEIGHTS = {
  leet_per_conversion: 5,        // +5 per leet conversion (max 25)
  emoji_per_conversion: 3,       // +3 per emoji conversion (max 15)
  encoding_per_layer: 15,        // +15 per encoding layer (Base64/Hex nesting)
  template_marker_bonus: 20,     // +20 if any template markers removed
  zero_width_per_char: 2,        // +2 per zero-width char (max 30)
  homoglyph_per_char: 3,         // +3 per homoglyph (max 30)
  max_norm_boost: 50             // Cap normalization boost at 50
};

/**
 * Calculate normalization-based obfuscation score
 * @param {Object} normSignals - Signals from normalizer
 * @returns {Object} { score: number, signals: string[] }
 */
function calculateNormalizationScore(normSignals) {
  if (!normSignals) {
    return { score: 0, signals: [] };
  }

  let score = 0;
  const signals = [];

  // Leet speak conversions (indicates intentional obfuscation)
  if (normSignals.leet_conversions > 0) {
    const leetBoost = Math.min(25, normSignals.leet_conversions * NORM_WEIGHTS.leet_per_conversion);
    score += leetBoost;
    signals.push(`Leet speak obfuscation detected (${normSignals.leet_conversions} conversions)`);
  }

  // Emoji-to-text conversions (potential attack vector)
  if (normSignals.emoji_conversions > 0) {
    const emojiBoost = Math.min(15, normSignals.emoji_conversions * NORM_WEIGHTS.emoji_per_conversion);
    score += emojiBoost;
    signals.push(`Emoji obfuscation detected (${normSignals.emoji_conversions} conversions)`);
  }

  // Nested encoding layers (Base64/Hex/URL - strong evasion indicator)
  if (normSignals.encoding_layers > 0) {
    const encodingBoost = normSignals.encoding_layers * NORM_WEIGHTS.encoding_per_layer;
    score += encodingBoost;
    signals.push(`Nested encoding detected (${normSignals.encoding_layers} layers)`);
  }

  // Template markers removed (injection attempt)
  if (normSignals.template_markers_removed > 0) {
    score += NORM_WEIGHTS.template_marker_bonus;
    signals.push(`Template injection markers removed (${normSignals.template_markers_removed})`);
  }

  // Zero-width characters (invisible obfuscation)
  if (normSignals.zero_width_count > 0) {
    const zwBoost = Math.min(30, normSignals.zero_width_count * NORM_WEIGHTS.zero_width_per_char);
    score += zwBoost;
    signals.push(`Zero-width characters detected (${normSignals.zero_width_count})`);
  }

  // Homoglyph characters (visual spoofing)
  if (normSignals.homoglyph_count > 0) {
    const hgBoost = Math.min(30, normSignals.homoglyph_count * NORM_WEIGHTS.homoglyph_per_char);
    score += hgBoost;
    signals.push(`Homoglyph obfuscation detected (${normSignals.homoglyph_count} chars)`);
  }

  // Cap at max boost
  score = Math.min(NORM_WEIGHTS.max_norm_boost, score);

  return { score, signals };
}

/**
 * Calculate final score and threat level from detector results
 * @param {Object} detectorResults - Results from all detectors
 * @param {Object} normSignals - Optional normalization signals for scoring boost
 * @returns {Object} Final scoring results with branch_result format
 */
export function calculateScore(detectorResults, normSignals = null) {
  const { obfuscation, structure, whisper, entropy, security } = detectorResults;

  // Get weights from config
  const weights = config.detection.weights;

  // Calculate normalization-based obfuscation boost
  const normResult = calculateNormalizationScore(normSignals);

  // Combine obfuscation detector score with normalization boost
  // Normalization signals ADD to obfuscation score (capped at 100)
  const enhancedObfuscationScore = Math.min(100, obfuscation.score + normResult.score);

  // Calculate weighted average of sub-scores (using enhanced obfuscation)
  const weightedScore =
    (enhancedObfuscationScore * weights.obfuscation) +
    (structure.score * weights.structure) +
    (whisper.score * weights.whisper) +
    (entropy.score * weights.entropy) +
    (security.score * weights.security);

  // Find max sub-score (for single-detector attacks) - include enhanced obfuscation
  const maxSubScore = Math.max(
    enhancedObfuscationScore,
    structure.score,
    whisper.score,
    entropy.score,
    security.score
  );

  // Use hybrid scoring: blend weighted average with max-based scoring
  // This ensures single high-scoring detectors still produce meaningful final scores
  // Formula: 30% weighted average + 70% max sub-score (emphasize high signals)
  const hybridScore = (weightedScore * 0.3) + (maxSubScore * 0.7);

  // Round final score
  const finalScore = Math.round(hybridScore);

  // Determine threat level based on thresholds
  let threatLevel;
  if (finalScore <= config.detection.thresholds.low_max) {
    threatLevel = 'LOW';
  } else if (finalScore <= config.detection.thresholds.medium_max) {
    threatLevel = 'MEDIUM';
  } else {
    threatLevel = 'HIGH';
  }

  // Calculate confidence based on number of signals detected (including normalization)
  const totalSignals =
    obfuscation.signals.length +
    structure.signals.length +
    whisper.signals.length +
    entropy.signals.length +
    security.signals.length +
    normResult.signals.length;  // Include normalization signals

  // Base confidence + bonus for multiple independent signals
  const baseConfidence = 0.6;
  const signalBonus = Math.min(0.4, totalSignals * 0.05);
  // Additional confidence boost if normalization detected obfuscation
  const normConfidenceBoost = normResult.score > 0 ? 0.05 : 0;
  const confidence = parseFloat(Math.min(1.0, baseConfidence + signalBonus + normConfidenceBoost).toFixed(2));

  // Collect all explanations from detectors
  const explanations = [];

  // Add primary explanation based on highest scoring detector
  const detectorScores = [
    { name: 'obfuscation', score: obfuscation.score },
    { name: 'structure', score: structure.score },
    { name: 'whisper', score: whisper.score },
    { name: 'entropy', score: entropy.score },
    { name: 'security', score: security.score }
  ].sort((a, b) => b.score - a.score);

  const primaryDetector = detectorScores[0];
  if (primaryDetector.score > 0) {
    explanations.push(`Primary concern: ${primaryDetector.name} (score: ${primaryDetector.score})`);
  }

  // Add normalization signals FIRST (they reveal obfuscation attempts)
  if (normResult.signals.length > 0) {
    explanations.push(...normResult.signals.slice(0, 3));
  }

  // Add top signals from each detector
  if (obfuscation.signals.length > 0) {
    explanations.push(...obfuscation.signals.slice(0, 2));
  }
  if (structure.signals.length > 0) {
    explanations.push(...structure.signals.slice(0, 2));
  }
  if (whisper.signals.length > 0) {
    explanations.push(...whisper.signals.slice(0, 2));
  }
  if (entropy.signals.length > 0) {
    explanations.push(...entropy.signals.slice(0, 2));
  }
  if (security.signals.length > 0) {
    explanations.push(...security.signals.slice(0, 2));
  }

  // Limit explanations to 10 most important
  const topExplanations = explanations.slice(0, 10);

  // Build features object with all detector outputs
  const features = {
    obfuscation: {
      zero_width_count: obfuscation.zero_width_count,
      homoglyph_count: obfuscation.homoglyph_count,
      scripts_detected: obfuscation.scripts_detected,
      base64_detected: obfuscation.base64_detected,
      hex_detected: obfuscation.hex_detected,
      mixed_scripts: obfuscation.mixed_scripts,
      spacing_anomalies: obfuscation.spacing_anomalies,
      score: obfuscation.score
    },
    structure: {
      boundary_anomalies: structure.boundary_anomalies,
      code_fence_count: structure.code_fence_count,
      excess_newlines: structure.excess_newlines,
      segmentation_score: structure.segmentation_score,
      nested_structures: structure.nested_structures,
      score: structure.score
    },
    whisper: {
      whisper_patterns_found: whisper.whisper_patterns_found.map(p => p.pattern),
      divider_count: whisper.divider_count,
      roleplay_markers: whisper.roleplay_markers.map(p => p.pattern),
      open_question_repetition: whisper.open_question_repetition,
      narrative_markers: whisper.narrative_markers,
      stage_directions: whisper.stage_directions,
      score: whisper.score
    },
    entropy: {
      entropy_raw: entropy.entropy_raw,
      entropy_normalized: entropy.entropy_normalized,
      relative_entropy: entropy.relative_entropy,
      char_class_diversity: entropy.char_class_diversity,
      bigram_anomaly_score: entropy.bigram_anomaly_score,
      random_segments: entropy.random_segments.length,
      perplexity_score: entropy.perplexity_score,
      score: entropy.score
    },
    security: {
      sql_injection_count: security.sql_injection_count,
      xss_count: security.xss_count,
      command_injection_count: security.command_injection_count,
      privilege_escalation_count: security.privilege_escalation_count,
      detected_patterns: security.detected_patterns.length,
      score: security.score
    }
  };

  // Add debug information if in development mode
  if (process.env.NODE_ENV === 'development') {
    features.debug = {
      weights: weights,
      sub_scores: {
        obfuscation: obfuscation.score,
        structure: structure.score,
        whisper: whisper.score,
        entropy: entropy.score,
        security: security.score
      },
      normalization_boost: {
        score: normResult.score,
        signals: normResult.signals,
        enhanced_obfuscation: enhancedObfuscationScore
      },
      weighted_contributions: {
        obfuscation: enhancedObfuscationScore * weights.obfuscation,
        structure: structure.score * weights.structure,
        whisper: whisper.score * weights.whisper,
        entropy: entropy.score * weights.entropy,
        security: security.score * weights.security
      },
      total_signals: totalSignals
    };
  }

  // Build final result in branch_result format
  return {
    score: finalScore,
    threat_level: threatLevel,
    confidence: confidence,
    features: features,
    explanations: topExplanations
  };
}

/**
 * Apply priority boosts for critical patterns
 * @param {Object} result - Initial scoring result
 * @param {Object} detectorResults - Raw detector results
 * @returns {Object} Result with priority adjustments
 */
export function applyPriorityBoosts(result, detectorResults) {
  const { obfuscation, structure, whisper } = detectorResults;

  // Boost score if critical patterns detected with high confidence
  let boostedScore = result.score;

  // Critical obfuscation (zero-width + homoglyphs)
  if (obfuscation.zero_width_count > 5 && obfuscation.homoglyph_count > 5) {
    boostedScore = Math.max(boostedScore, 75);
    result.explanations.unshift('CRITICAL: Combined zero-width and homoglyph obfuscation');
  }

  // Critical structure (nested + code fences)
  if (structure.nested_structures > 0 && structure.code_fence_count >= 4) {
    boostedScore = Math.max(boostedScore, 70);
    result.explanations.unshift('CRITICAL: Complex nested structures with code fences');
  }

  // Critical whisper (dividers + roleplay)
  if (whisper.divider_count > 0 && whisper.roleplay_markers.length > 0) {
    boostedScore = Math.max(boostedScore, 70);
    result.explanations.unshift('CRITICAL: Context manipulation with dividers and roleplay');
  }

  // Update score and threat level if boosted
  if (boostedScore > result.score) {
    result.score = boostedScore;

    // Recalculate threat level
    if (boostedScore <= config.detection.thresholds.low_max) {
      result.threat_level = 'LOW';
    } else if (boostedScore <= config.detection.thresholds.medium_max) {
      result.threat_level = 'MEDIUM';
    } else {
      result.threat_level = 'HIGH';
    }

    // Increase confidence for priority boosts
    result.confidence = Math.min(1.0, result.confidence + 0.1);
  }

  return result;
}