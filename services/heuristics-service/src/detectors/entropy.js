/**
 * Entropy Detector
 * Detects: Shannon entropy, bigram anomalies, randomness patterns
 */

import { config } from '../config/index.js';
import { calculateShannonEntropy, getCharFrequency, calculateRelativeEntropy, calculateCharClassDiversity } from '../utils/unicode.js';

/**
 * Detect entropy and randomness patterns in text
 * @param {string} text - Input text to analyze
 * @param {Object} context - Optional context object with language information
 * @param {string} context.lang - Language code ('pl', 'en', or null)
 * @returns {Object} Entropy detection results
 */
export async function detectEntropy(text, context = {}) {
  const results = {
    entropy_raw: 0,
    entropy_normalized: 0,
    relative_entropy: 0,
    char_class_diversity: 0,
    bigram_anomaly_score: 0,
    random_segments: [],
    perplexity_score: 0,
    score: 0,
    signals: []
  };

  // Skip if entropy detection is disabled
  if (!config.detection.entropy.enabled) {
    return results;
  }

  // Skip very short texts
  if (text.length < 10) {
    return results;
  }

  // Extract language from context (supports both 'lang' and 'detected_language')
  const language = context.lang || context.detected_language || 'en';

  // 1. Calculate Shannon entropy (supporting metric)
  const entropy = calculateShannonEntropy(text);
  results.entropy_raw = parseFloat(entropy.toFixed(2));

  // Normalize entropy to 0-100 scale
  const maxEntropy = 8.0;
  results.entropy_normalized = Math.round((entropy / maxEntropy) * 100);

  // 2. Calculate Relative Entropy (KL Divergence) - PRIMARY METRIC
  // This compares text distribution to natural language reference
  const relEntropy = calculateRelativeEntropy(text, language);
  results.relative_entropy = Math.round(relEntropy * 100);

  // Get threshold from config or use default
  const relativeEntropyThreshold = config.detection.entropy.relative_entropy_threshold || 0.4;
  if (relEntropy > relativeEntropyThreshold) {
    results.signals.push(`Text deviates from natural ${language.toUpperCase()} patterns (KL: ${results.relative_entropy}%)`);
  }

  // 3. Calculate Character Class Diversity - NEW METRIC
  const classDiversity = calculateCharClassDiversity(text);
  results.char_class_diversity = classDiversity.score;

  // Get threshold from config or use default
  const diversityThreshold = config.detection.entropy.char_class_diversity_threshold || 4;
  if (classDiversity.count >= diversityThreshold) {
    results.signals.push(`High character class diversity: ${classDiversity.classes.join(', ')} (${classDiversity.count} classes)`);
  }

  // 4. Bigram analysis (language-aware) - SECOND KEY METRIC
  const bigramScore = calculateBigramAnomaly(text, language);
  results.bigram_anomaly_score = Math.round(bigramScore * 100);

  // Use updated threshold from config
  const bigramThreshold = config.detection.entropy.bigram_anomaly_threshold || 0.25;
  if (bigramScore > bigramThreshold) {
    results.signals.push(`Unusual bigram patterns detected (score: ${results.bigram_anomaly_score}%)`);
  }

  // 5. Detect random-looking segments
  const segments = text.split(/\s+/);
  for (const segment of segments) {
    if (segment.length > 15) {
      const segmentEntropy = calculateShannonEntropy(segment);
      if (segmentEntropy > 4.5 && !containsDictionaryWords(segment)) {
        results.random_segments.push({
          segment: segment.substring(0, 30) + (segment.length > 30 ? '...' : ''),
          entropy: segmentEntropy.toFixed(2),
          length: segment.length
        });
      }
    }
  }

  if (results.random_segments.length > 0) {
    results.signals.push(`Found ${results.random_segments.length} random-looking segments`);
  }

  // 6. Calculate perplexity-like score
  const perplexity = calculatePerplexityScore(text);
  results.perplexity_score = Math.round(perplexity * 100);

  if (perplexity > 0.7) {
    results.signals.push(`High perplexity detected (${results.perplexity_score}%) - unusual patterns`);
  }

  // 7. Pattern repetition detection
  const repetitionScore = detectPatternRepetition(text);
  if (repetitionScore > 0.3) {
    results.signals.push(`Pattern repetition detected (score: ${Math.round(repetitionScore * 100)}%)`);
  }

  // ========================================
  // NEW SCORING ALGORITHM (3 primary metrics)
  // ========================================
  // Old: Mainly Shannon entropy (ineffective for text)
  // New: Combination of KL divergence + bigram + character diversity
  let score = 0;

  // 1. Relative entropy (KL divergence) - MAIN METRIC (40% weight)
  // Higher = text deviates more from natural language
  if (relEntropy > relativeEntropyThreshold) {
    score += Math.min(40, relEntropy * 50);
  }

  // 2. Bigram anomaly - SECONDARY METRIC (35% weight)
  // Higher = fewer common bigrams (obfuscated text)
  if (bigramScore > bigramThreshold) {
    score += Math.min(35, bigramScore * 45);
  }

  // 3. Character class diversity - TERTIARY METRIC (15% weight)
  // More diverse classes = more suspicious
  score += Math.min(15, classDiversity.score * 0.15);

  // 4. Shannon entropy - SUPPORTING SIGNAL (10% weight)
  // Very high (>4.8) or very low (<2.0) is suspicious
  const shannonHighThreshold = config.detection.entropy.shannon_threshold_high || 4.8;
  const shannonLowThreshold = config.detection.entropy.shannon_threshold_low || 2.0;

  if (entropy > shannonHighThreshold) {
    const excess = entropy - shannonHighThreshold;
    score += Math.min(10, excess * 5);
    results.signals.push(`High Shannon entropy (${results.entropy_raw} bits)`);
  } else if (entropy < shannonLowThreshold) {
    const deficit = shannonLowThreshold - entropy;
    score += Math.min(10, deficit * 5);
    results.signals.push(`Low Shannon entropy (${results.entropy_raw} bits) - repetition`);
  }

  // 5. Random segments bonus
  if (results.random_segments.length > 0) {
    score += Math.min(15, results.random_segments.length * 8);
  }

  results.score = Math.min(100, Math.round(score));

  // Add summary signal if high score
  if (results.score >= 70) {
    results.signals.unshift('HIGH: Obfuscation/randomness patterns detected');
  } else if (results.score >= 40) {
    results.signals.unshift('MEDIUM: Entropy anomalies detected');
  }

  return results;
}

/**
 * Calculate bigram anomaly score with language-aware detection
 * @param {string} text - Input text
 * @param {string} language - Language code ('pl', 'en', or null for fallback)
 * @returns {number} Anomaly score (0-1)
 */
function calculateBigramAnomaly(text, language = null) {
  if (text.length < 2) return 0;

  const bigrams = {};
  const cleanText = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');

  // Count bigrams
  for (let i = 0; i < cleanText.length - 1; i++) {
    const bigram = cleanText.substring(i, i + 2);
    if (!bigram.includes(' ')) {  // Skip bigrams with spaces
      bigrams[bigram] = (bigrams[bigram] || 0) + 1;
    }
  }

  // Select language-specific bigrams from config
  const effectiveLanguage = language || config.detection.entropy.bigram_fallback_language || 'en';
  const bigramConfig = config.detection.entropy.bigram_sets?.[effectiveLanguage] ||
                       config.detection.entropy.bigram_sets?.['en'];

  // Fallback to hardcoded English if config not available (backward compatibility)
  const commonBigrams = bigramConfig?.bigrams || [
    'th', 'he', 'in', 'er', 'an', 're', 'ed', 'on', 'es', 'st',
    'en', 'at', 'to', 'nt', 'ha', 'nd', 'ou', 'ea', 'ng', 'as',
    'or', 'ti', 'is', 'et', 'it', 'ar', 'te', 'se', 'hi', 'of'
  ];

  // Calculate common bigram frequency (natural language has HIGH frequency of common bigrams)
  const totalBigrams = Object.values(bigrams).reduce((a, b) => a + b, 0);
  let commonBigramOccurrences = 0;

  for (const common of commonBigrams) {
    commonBigramOccurrences += (bigrams[common] || 0);
  }

  // Frequency ratio: what percentage of ALL bigrams are from common set
  const frequencyRatio = totalBigrams > 0 ? (commonBigramOccurrences / totalBigrams) : 0;

  // Anomaly score based on LOW frequency of common bigrams
  // Natural language: 25-50% of bigrams are from common set → low anomaly
  // Obfuscated text: <10% of bigrams are from common set → high anomaly
  const expectedFrequency = 0.20;  // Expect at least 20% common bigrams in natural text
  const anomalyScore = Math.max(0, Math.min(1.0, (expectedFrequency - frequencyRatio) / expectedFrequency));

  // Check for unusual bigrams (not in common set)
  const unusualCount = Object.keys(bigrams).filter(bg => !commonBigrams.includes(bg)).length;
  const totalBigramTypes = Object.keys(bigrams).length;
  const unusualRatio = totalBigramTypes > 0 ? (unusualCount / totalBigramTypes) : 0;

  // Combine scores: prioritize frequency over unusual types
  // Natural text has HIGH frequency of common bigrams (even if some types are unusual)
  return Math.min(1, (anomalyScore * 0.8) + (Math.max(0, unusualRatio - 0.5) * 0.2));
}

/**
 * Check if segment contains dictionary words
 * @param {string} segment - Text segment
 * @returns {boolean} True if contains common words
 */
function containsDictionaryWords(segment) {
  // Simple check for common English words
  const commonWords = [
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
    'with', 'from', 'have', 'this', 'that', 'what', 'when', 'where'
  ];

  const segmentLower = segment.toLowerCase();
  for (const word of commonWords) {
    if (segmentLower.includes(word)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate perplexity-like score
 * @param {string} text - Input text
 * @returns {number} Perplexity score (0-1)
 */
function calculatePerplexityScore(text) {
  // Simplified perplexity based on character transitions
  const transitions = {};
  const cleanText = text.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Count character transitions
  for (let i = 0; i < cleanText.length - 1; i++) {
    const pair = cleanText.substring(i, i + 2);
    transitions[pair] = (transitions[pair] || 0) + 1;
  }

  // Calculate surprise factor (inverse of predictability)
  const uniqueTransitions = Object.keys(transitions).length;
  const totalTransitions = cleanText.length - 1;

  if (totalTransitions === 0) return 0;

  // More unique transitions = higher perplexity
  const perplexity = uniqueTransitions / Math.min(totalTransitions, 100);

  return Math.min(1, perplexity);
}

/**
 * Detect pattern repetition in text
 * @param {string} text - Input text
 * @returns {number} Repetition score (0-1)
 */
function detectPatternRepetition(text) {
  if (text.length < 20) return 0;

  let repetitionScore = 0;

  // Check for repeated substrings (3+ characters)
  const substrings = {};
  for (let len = 3; len <= Math.min(20, text.length / 2); len++) {
    for (let i = 0; i <= text.length - len; i++) {
      const substring = text.substring(i, i + len);
      if (!/^\s+$/.test(substring)) {  // Skip whitespace-only
        substrings[substring] = (substrings[substring] || 0) + 1;
      }
    }
  }

  // Find repeated patterns
  const repeated = Object.entries(substrings)
    .filter(([_, count]) => count > 2)
    .sort((a, b) => b[0].length - a[0].length);  // Longer patterns first

  if (repeated.length > 0) {
    // Weight by pattern length and frequency
    for (const [pattern, count] of repeated) {
      const weight = (pattern.length / text.length) * (count / 10);
      repetitionScore += weight;
    }
  }

  return Math.min(1, repetitionScore);
}