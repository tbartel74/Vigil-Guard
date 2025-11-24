/**
 * Entropy Detector
 * Detects: Shannon entropy, bigram anomalies, randomness patterns
 */

import { config } from '../config/index.js';
import { calculateShannonEntropy, getCharFrequency } from '../utils/unicode.js';

/**
 * Detect entropy and randomness patterns in text
 * @param {string} text - Input text to analyze
 * @returns {Object} Entropy detection results
 */
export async function detectEntropy(text) {
  const results = {
    entropy_raw: 0,
    entropy_normalized: 0,
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

  // 1. Calculate Shannon entropy
  const entropy = calculateShannonEntropy(text);
  results.entropy_raw = parseFloat(entropy.toFixed(2));

  // Normalize entropy to 0-100 scale
  // Shannon entropy typically ranges from 0-8 bits for text
  const maxEntropy = 8.0;
  results.entropy_normalized = Math.round((entropy / maxEntropy) * 100);

  // Determine if entropy is suspicious
  if (entropy < config.detection.entropy.shannon_threshold_low) {
    results.signals.push(`Low entropy detected (${results.entropy_raw} bits) - possible repetition`);
  } else if (entropy > config.detection.entropy.shannon_threshold_high) {
    results.signals.push(`High entropy detected (${results.entropy_raw} bits) - possible randomness`);
  }

  // 2. Bigram analysis
  const bigramScore = calculateBigramAnomaly(text);
  results.bigram_anomaly_score = Math.round(bigramScore * 100);

  if (bigramScore > config.detection.entropy.bigram_anomaly_threshold) {
    results.signals.push(`Unusual bigram patterns detected (score: ${results.bigram_anomaly_score})`);
  }

  // 3. Detect random-looking segments
  const segments = text.split(/\s+/);
  for (const segment of segments) {
    if (segment.length > 15) {
      const segmentEntropy = calculateShannonEntropy(segment);

      // Check if segment looks random (high entropy + no dictionary words)
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

  // 4. Calculate perplexity-like score
  // This is a simplified version that measures how "surprising" the text is
  const perplexity = calculatePerplexityScore(text);
  results.perplexity_score = Math.round(perplexity * 100);

  if (perplexity > 0.7) {
    results.signals.push(`High perplexity detected (${results.perplexity_score}) - unusual patterns`);
  }

  // 5. Pattern repetition detection
  const repetitionScore = detectPatternRepetition(text);
  if (repetitionScore > 0.3) {
    results.signals.push(`Pattern repetition detected (score: ${Math.round(repetitionScore * 100)})`);
  }

  // Calculate sub-score (0-100)
  let score = 0;

  // High entropy (potential randomness/obfuscation)
  if (entropy > config.detection.entropy.shannon_threshold_high) {
    const entropyExcess = entropy - config.detection.entropy.shannon_threshold_high;
    score += Math.min(40, entropyExcess * 20);
  }

  // Low entropy (potential repetition/patterns)
  if (entropy < config.detection.entropy.shannon_threshold_low) {
    const entropyDeficit = config.detection.entropy.shannon_threshold_low - entropy;
    score += Math.min(30, entropyDeficit * 15);
  }

  // Bigram anomalies
  if (bigramScore > config.detection.entropy.bigram_anomaly_threshold) {
    score += Math.min(30, bigramScore * 50);
  }

  // Random segments
  if (results.random_segments.length > 0) {
    score += Math.min(25, results.random_segments.length * 10);
  }

  // Perplexity
  if (perplexity > 0.5) {
    score += Math.min(20, perplexity * 30);
  }

  results.score = Math.min(100, Math.round(score));

  // Add summary signal if high score
  if (results.score >= 70) {
    results.signals.unshift('High entropy/randomness anomalies detected');
  } else if (results.score >= 40) {
    results.signals.unshift('Moderate entropy anomalies detected');
  }

  return results;
}

/**
 * Calculate bigram anomaly score
 * @param {string} text - Input text
 * @returns {number} Anomaly score (0-1)
 */
function calculateBigramAnomaly(text) {
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

  // Common English bigrams (top 30)
  const commonBigrams = [
    'th', 'he', 'in', 'er', 'an', 're', 'ed', 'on', 'es', 'st',
    'en', 'at', 'to', 'nt', 'ha', 'nd', 'ou', 'ea', 'ng', 'as',
    'or', 'ti', 'is', 'et', 'it', 'ar', 'te', 'se', 'hi', 'of'
  ];

  // Calculate how many common bigrams are missing or rare
  let anomalyScore = 0;
  const totalBigrams = Object.values(bigrams).reduce((a, b) => a + b, 0);

  for (const common of commonBigrams) {
    const frequency = (bigrams[common] || 0) / totalBigrams;
    if (frequency < 0.001) {  // Very rare or missing
      anomalyScore += 0.033;  // 1/30 weight per missing bigram
    }
  }

  // Check for unusual bigrams (not in common set)
  const unusualCount = Object.keys(bigrams).filter(bg => !commonBigrams.includes(bg)).length;
  const unusualRatio = unusualCount / Object.keys(bigrams).length;

  // Combine scores
  return Math.min(1, (anomalyScore + unusualRatio) / 2);
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