/**
 * Unicode utilities for script detection and homoglyph normalization
 */

/**
 * Detect scripts used in text
 * @param {string} text - Input text
 * @returns {string[]} Array of detected script names
 */
export function detectScripts(text) {
  const scripts = new Set();

  for (const char of text) {
    const code = char.charCodeAt(0);

    // Latin
    if ((code >= 0x0041 && code <= 0x005A) ||
        (code >= 0x0061 && code <= 0x007A) ||
        (code >= 0x00C0 && code <= 0x00FF) ||
        (code >= 0x0100 && code <= 0x017F)) {
      scripts.add('Latin');
    }
    // Cyrillic
    else if ((code >= 0x0400 && code <= 0x04FF) ||
             (code >= 0x0500 && code <= 0x052F)) {
      scripts.add('Cyrillic');
    }
    // Greek
    else if ((code >= 0x0370 && code <= 0x03FF) ||
             (code >= 0x1F00 && code <= 0x1FFF)) {
      scripts.add('Greek');
    }
    // Arabic
    else if ((code >= 0x0600 && code <= 0x06FF) ||
             (code >= 0x0750 && code <= 0x077F) ||
             (code >= 0x08A0 && code <= 0x08FF)) {
      scripts.add('Arabic');
    }
    // Hebrew
    else if (code >= 0x0590 && code <= 0x05FF) {
      scripts.add('Hebrew');
    }
    // CJK (Chinese, Japanese, Korean)
    else if ((code >= 0x4E00 && code <= 0x9FFF) ||  // CJK Unified Ideographs
             (code >= 0x3040 && code <= 0x309F) ||  // Hiragana
             (code >= 0x30A0 && code <= 0x30FF) ||  // Katakana
             (code >= 0xAC00 && code <= 0xD7AF)) {  // Hangul Syllables
      scripts.add('CJK');
    }
    // Devanagari
    else if (code >= 0x0900 && code <= 0x097F) {
      scripts.add('Devanagari');
    }
    // Thai
    else if (code >= 0x0E00 && code <= 0x0E7F) {
      scripts.add('Thai');
    }
    // Emoji
    else if ((code >= 0x1F300 && code <= 0x1F9FF) ||
             (code >= 0x2600 && code <= 0x26FF)) {
      scripts.add('Emoji');
    }
  }

  return Array.from(scripts);
}

/**
 * Normalize homoglyphs in text
 * @param {string} text - Input text
 * @param {Object} homoglyphMap - Homoglyph mappings
 * @returns {string} Normalized text
 */
export function normalizeHomoglyphs(text, homoglyphMap) {
  if (!homoglyphMap) return text;

  let normalized = text;

  // Process each category of homoglyphs
  const categories = ['cyrillic', 'greek', 'arabic', 'mathematical', 'fullwidth', 'other'];

  for (const category of categories) {
    const mappings = homoglyphMap[category] || {};

    for (const [from, to] of Object.entries(mappings)) {
      // Use global replace for each homoglyph
      const regex = new RegExp(escapeRegExp(from), 'g');
      normalized = normalized.replace(regex, to);
    }
  }

  return normalized;
}

/**
 * Calculate character frequency distribution
 * @param {string} text - Input text
 * @returns {Object} Character frequency map
 */
export function getCharFrequency(text) {
  const frequency = {};

  for (const char of text) {
    if (char.match(/\s/)) continue; // Skip whitespace
    frequency[char] = (frequency[char] || 0) + 1;
  }

  return frequency;
}

/**
 * Detect unusual character patterns
 * @param {string} text - Input text
 * @returns {Object} Pattern detection results
 */
export function detectUnusualPatterns(text) {
  const results = {
    repeatingChars: [],
    unusualSequences: [],
    highEntropySegments: []
  };

  // Detect repeating characters (3+ repetitions)
  const repeatingPattern = /(.)\1{2,}/g;
  const repeatingMatches = text.match(repeatingPattern);
  if (repeatingMatches) {
    results.repeatingChars = repeatingMatches.map(match => ({
      char: match[0],
      count: match.length,
      position: text.indexOf(match)
    }));
  }

  // Detect unusual sequences (alternating patterns)
  const alternatingPattern = /(.)(.)\1\2\1/g;
  const alternatingMatches = text.match(alternatingPattern);
  if (alternatingMatches) {
    results.unusualSequences = alternatingMatches;
  }

  // Detect high entropy segments (random-looking strings)
  const segments = text.split(/\s+/);
  for (const segment of segments) {
    if (segment.length > 10) {
      const entropy = calculateShannonEntropy(segment);
      if (entropy > 4.0) {
        results.highEntropySegments.push({
          segment: segment.substring(0, 20) + (segment.length > 20 ? '...' : ''),
          entropy: entropy.toFixed(2)
        });
      }
    }
  }

  return results;
}

/**
 * Calculate Shannon entropy of a string
 * @param {string} text - Input text
 * @returns {number} Entropy value
 */
export function calculateShannonEntropy(text) {
  if (!text || text.length === 0) return 0;

  const frequency = getCharFrequency(text);
  const length = text.replace(/\s/g, '').length;
  let entropy = 0;

  for (const char in frequency) {
    const probability = frequency[char] / length;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }

  return entropy;
}

/**
 * Escape special regex characters
 * @param {string} string - String to escape
 * @returns {string} Escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if text contains invisible characters
 * @param {string} text - Input text
 * @returns {boolean} True if invisible characters found
 */
export function hasInvisibleChars(text) {
  // Check for various invisible Unicode characters
  const invisiblePattern = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF\uFFF9-\uFFFB]/;
  return invisiblePattern.test(text);
}

/**
 * Remove invisible characters from text
 * @param {string} text - Input text
 * @returns {string} Cleaned text
 */
export function removeInvisibleChars(text) {
  return text.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF\uFFF9-\uFFFB]/g, '');
}

// Reference character frequency distributions for natural language
// Based on research: natural English ~4.0-4.2 bpc at zero-order, random ~4.7 bpc
const ENGLISH_FREQ = {
  e: 0.127, t: 0.091, a: 0.082, o: 0.075, i: 0.070, n: 0.067, s: 0.063, h: 0.061,
  r: 0.060, d: 0.043, l: 0.040, c: 0.028, u: 0.028, m: 0.024, w: 0.024, f: 0.022,
  g: 0.020, y: 0.020, p: 0.019, b: 0.015, v: 0.010, k: 0.008, j: 0.002, x: 0.002,
  q: 0.001, z: 0.001
};

const POLISH_FREQ = {
  a: 0.099, i: 0.082, e: 0.077, o: 0.075, n: 0.055, r: 0.047, z: 0.046, w: 0.046,
  s: 0.043, c: 0.040, t: 0.040, k: 0.035, y: 0.035, d: 0.032, p: 0.031, m: 0.028,
  l: 0.027, j: 0.023, u: 0.021, ą: 0.010, ę: 0.010, b: 0.015, g: 0.014, ł: 0.018,
  h: 0.011, ś: 0.008, ż: 0.006, ó: 0.010, ń: 0.006, ć: 0.004, ź: 0.001, f: 0.003
};

/**
 * Calculate Relative Entropy (KL Divergence) comparing text distribution to reference language
 * Higher value = text deviates more from natural language patterns
 * @param {string} text - Input text
 * @param {string} language - Language code ('en' or 'pl')
 * @returns {number} Relative entropy value (0 = natural, higher = more random)
 */
export function calculateRelativeEntropy(text, language = 'en') {
  if (!text || text.length === 0) return 0;

  const refDist = language === 'pl' ? POLISH_FREQ : ENGLISH_FREQ;

  // Get text character frequency (lowercase, letters only)
  const cleanText = text.toLowerCase().replace(/[^a-ząćęłńóśźża-z]/g, '');
  if (cleanText.length < 10) return 0; // Too short for meaningful analysis

  const textDist = {};
  for (const char of cleanText) {
    textDist[char] = (textDist[char] || 0) + 1;
  }

  // Normalize to probabilities
  const total = cleanText.length;
  for (const char in textDist) {
    textDist[char] /= total;
  }

  // Calculate KL divergence: KL(P||Q) = Σ P(x) * log(P(x)/Q(x))
  // Where P is text distribution, Q is reference distribution
  let klDivergence = 0;
  const epsilon = 0.0001; // Small value to avoid log(0)

  for (const char in textDist) {
    const p = textDist[char];
    const q = refDist[char] || epsilon;
    if (p > 0) {
      klDivergence += p * Math.log2(p / q);
    }
  }

  // Normalize to 0-1 range (typical KL divergence for text is 0-5)
  return Math.min(1, Math.max(0, klDivergence / 5));
}

/**
 * Calculate Character Class Diversity
 * Natural text uses mainly letters + spaces, obfuscated text mixes many classes
 * @param {string} text - Input text
 * @returns {Object} { count: number, classes: string[], score: number }
 */
export function calculateCharClassDiversity(text) {
  if (!text || text.length === 0) {
    return { count: 0, classes: [], score: 0 };
  }

  const classPatterns = {
    lowercase: /[a-z]/,
    uppercase: /[A-Z]/,
    digits: /[0-9]/,
    symbols: /[!@#$%^&*()_+=\-\[\]{}|;:'",.<>?\/\\`~]/,
    unicode: /[^\x00-\x7F]/,
    whitespace: /\s/
  };

  const detectedClasses = [];

  for (const [className, pattern] of Object.entries(classPatterns)) {
    if (pattern.test(text)) {
      detectedClasses.push(className);
    }
  }

  // Calculate diversity score (0-100)
  // Natural text: 2-3 classes (lowercase, uppercase, whitespace) = low score
  // Obfuscated: 4-6 classes = high score
  const count = detectedClasses.length;
  let score = 0;

  if (count <= 2) {
    score = 0; // Very natural
  } else if (count === 3) {
    score = 10; // Slightly complex
  } else if (count === 4) {
    score = 30; // Moderately suspicious
  } else if (count === 5) {
    score = 60; // Highly suspicious
  } else {
    score = 90; // Maximum diversity
  }

  return {
    count,
    classes: detectedClasses,
    score
  };
}