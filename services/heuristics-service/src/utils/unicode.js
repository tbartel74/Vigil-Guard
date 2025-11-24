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