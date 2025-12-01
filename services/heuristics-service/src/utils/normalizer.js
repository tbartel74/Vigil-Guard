/**
 * Normalizer module for Heuristics Service
 *
 * Migrated from n8n Normalize_Node to enable internal normalization.
 * This allows the Arbiter to send original text to all 3 branches,
 * while Heuristics normalizes internally for pattern matching.
 *
 * @version 2.0.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration Parser
// ============================================================================

/**
 * Parse normalize.conf file into structured maps
 *
 * Format: key=value (one per line)
 * Special prefixes:
 *   - leet.char.X=Y (single character substitution)
 *   - leet.single.X=Y (single word replacement)
 *   - leet.phrase.X=Y (phrase replacement)
 *   - leet.identity.X=X (identity mapping, ignored)
 *   - No prefix: direct character/string mapping
 *
 * @param {string} configPath - Path to normalize.conf
 * @returns {Object} Parsed configuration maps
 */
export function parseNormalizeConf(configPath) {
  const config = {
    zeroWidth: new Set(),           // Characters to strip completely
    templateMarkers: new Set(),     // Template markers to remove
    charMap: new Map(),             // Direct char→char mappings (homoglyphs, spaces, quotes)
    leetCharMap: new Map(),         // leet.char.X→Y (single char substitution)
    leetSingleMap: new Map(),       // leet.single.X→Y (word replacement)
    leetPhraseMap: new Map(),       // leet.phrase.X→Y (phrase replacement)
    emojiMap: new Map(),            // Emoji→text mappings
    polishDiacritics: new Map(),    // Polish ą→a, ę→e etc.
    repetitionPatterns: []          // Repeated chars to collapse (----, ====, etc.)
  };

  let content;
  try {
    content = fs.readFileSync(configPath, 'utf-8');
  } catch (error) {
    console.warn(`Failed to load normalize.conf from ${configPath}:`, error.message);
    return config;
  }

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse key=value
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    let key = trimmed.substring(0, eqIndex);
    let value = trimmed.substring(eqIndex + 1);

    // Handle Unicode escapes in key (\uXXXX)
    key = key.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );

    // Handle Unicode escapes in value
    value = value.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );

    // Categorize based on key format
    if (key.startsWith('leet.char.')) {
      // leet.char.$=s → Map '$' to 's'
      const char = key.substring('leet.char.'.length);
      if (char && value) {
        config.leetCharMap.set(char, value);
      }
    } else if (key.startsWith('leet.single.')) {
      // leet.single.b4=before → Map 'b4' to 'before'
      const word = key.substring('leet.single.'.length);
      if (word && value) {
        config.leetSingleMap.set(word.toLowerCase(), value.toLowerCase());
      }
    } else if (key.startsWith('leet.phrase.')) {
      // leet.phrase.g0dm0d3=godmode → Map 'g0dm0d3' to 'godmode'
      const phrase = key.substring('leet.phrase.'.length);
      if (phrase && value) {
        config.leetPhraseMap.set(phrase.toLowerCase(), value.toLowerCase());
      }
    } else if (key.startsWith('leet.identity.')) {
      // Identity mappings - skip (D=D, M=M etc.)
      continue;
    } else if (value === '') {
      // Empty value = strip this character/string
      if (key.startsWith('<|') || key.startsWith('{{') || key.startsWith('[[') ||
          key.startsWith('[/') || key.startsWith('[')) {
        // Template markers
        config.templateMarkers.add(key);
      } else if (key.length === 1) {
        // Single char to strip (zero-width, wrappers)
        config.zeroWidth.add(key);
      } else if (/^[-_.=+*\/\\|,;:!?]+$/.test(key)) {
        // Repetition pattern (----, ====, etc.) → collapse to single space
        config.repetitionPatterns.push(key);
      }
    } else if (isEmoji(key)) {
      // Emoji mapping
      config.emojiMap.set(key, value);
    } else if (isPolishDiacritic(key)) {
      // Polish diacritic
      config.polishDiacritics.set(key, value);
    } else {
      // General character mapping (homoglyphs, spaces, quotes, punctuation)
      config.charMap.set(key, value);
    }
  }

  return config;
}

/**
 * Check if character is an emoji
 */
function isEmoji(char) {
  // Basic emoji detection - matches most common emoji ranges
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F000}-\u{1F02F}]/u;
  return emojiRegex.test(char);
}

/**
 * Check if character is Polish diacritic
 */
function isPolishDiacritic(char) {
  return /^[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]$/.test(char);
}

// ============================================================================
// Decoding Functions
// ============================================================================

/**
 * Decode nested encodings (URL → Base64 → Hex) up to maxDepth layers
 *
 * @param {string} text - Input text
 * @param {number} maxDepth - Maximum decoding iterations
 * @returns {Object} { decoded, layers }
 */
export function decodeNested(text, maxDepth = 5) {
  let current = text;
  let layers = 0;
  let changed = true;

  while (changed && layers < maxDepth) {
    changed = false;
    const before = current;

    // 1. URL decode
    try {
      const urlDecoded = decodeURIComponent(current.replace(/\+/g, ' '));
      if (urlDecoded !== current && urlDecoded.length > 0) {
        current = urlDecoded;
        changed = true;
      }
    } catch (e) {
      // Invalid URL encoding, skip
    }

    // 2. Base64 decode (only if looks like base64)
    const base64Match = current.match(/[A-Za-z0-9+/]{20,}={0,2}/g);
    if (base64Match) {
      for (const match of base64Match) {
        try {
          const decoded = Buffer.from(match, 'base64').toString('utf-8');
          // Only accept if result is printable ASCII/UTF-8
          if (decoded && /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(decoded)) {
            current = current.replace(match, decoded);
            changed = true;
          }
        } catch (e) {
          // Invalid base64, skip
        }
      }
    }

    // 3. Hex decode (0x... or continuous hex strings)
    const hexMatch = current.match(/(?:0x)?([0-9A-Fa-f]{8,})/g);
    if (hexMatch) {
      for (const match of hexMatch) {
        try {
          const hexStr = match.startsWith('0x') ? match.slice(2) : match;
          if (hexStr.length % 2 === 0) {
            const bytes = [];
            for (let i = 0; i < hexStr.length; i += 2) {
              bytes.push(parseInt(hexStr.substr(i, 2), 16));
            }
            const decoded = Buffer.from(bytes).toString('utf-8');
            if (decoded && /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(decoded)) {
              current = current.replace(match, decoded);
              changed = true;
            }
          }
        } catch (e) {
          // Invalid hex, skip
        }
      }
    }

    // 3b. Hex escape sequences (\xHH\xHH...)
    const escapeHexMatch = current.match(/(?:\\x[0-9A-Fa-f]{2})+/g);
    if (escapeHexMatch) {
      for (const match of escapeHexMatch) {
        try {
          const decoded = match.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16))
          );
          if (decoded && /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(decoded)) {
            current = current.replace(match, decoded);
            changed = true;
          }
        } catch (e) {
          // Invalid hex escape, skip
        }
      }
    }

    // 4. HTML entity decode
    current = current.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
    current = current.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    current = current.replace(/&lt;/gi, '<');
    current = current.replace(/&gt;/gi, '>');
    current = current.replace(/&amp;/gi, '&');
    current = current.replace(/&quot;/gi, '"');
    current = current.replace(/&apos;/gi, "'");
    current = current.replace(/&nbsp;/gi, ' ');

    if (current !== before) {
      changed = true;
      layers++;
    }
  }

  return { decoded: current, layers };
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Strip zero-width and invisible characters
 *
 * @param {string} text - Input text
 * @param {Set} zeroWidthSet - Set of characters to strip
 * @returns {Object} { text, count }
 */
export function stripZeroWidth(text, zeroWidthSet) {
  let count = 0;
  let result = '';

  for (const char of text) {
    if (zeroWidthSet.has(char)) {
      count++;
    } else {
      result += char;
    }
  }

  return { text: result, count };
}

/**
 * Strip template markers like <|system|>, {{system}}, etc.
 *
 * @param {string} text - Input text
 * @param {Set} markers - Set of markers to remove
 * @returns {Object} { text, count }
 */
export function stripTemplateMarkers(text, markers) {
  let count = 0;
  let result = text;

  for (const marker of markers) {
    const regex = new RegExp(escapeRegex(marker), 'gi');
    const matches = result.match(regex);
    if (matches) {
      count += matches.length;
      result = result.replace(regex, '');
    }
  }

  return { text: result, count };
}

/**
 * Apply character map (homoglyphs, spaces, quotes, punctuation)
 *
 * @param {string} text - Input text
 * @param {Map} charMap - Character mapping
 * @returns {Object} { text, count }
 */
export function applyCharMap(text, charMap) {
  let count = 0;
  let result = '';

  for (const char of text) {
    if (charMap.has(char)) {
      result += charMap.get(char);
      count++;
    } else {
      result += char;
    }
  }

  return { text: result, count };
}

/**
 * Apply leet character substitution ($ → s, ! → i, etc.)
 *
 * @param {string} text - Input text
 * @param {Map} leetCharMap - Leet character mapping
 * @returns {Object} { text, count }
 */
export function applyLeetChars(text, leetCharMap) {
  let count = 0;
  let result = '';

  for (const char of text) {
    if (leetCharMap.has(char)) {
      result += leetCharMap.get(char);
      count++;
    } else {
      result += char;
    }
  }

  return { text: result, count };
}

/**
 * Apply leet word replacement (b4 → before, l8r → later, etc.)
 *
 * @param {string} text - Input text
 * @param {Map} leetSingleMap - Leet word mapping
 * @returns {Object} { text, count }
 */
export function applyLeetWords(text, leetSingleMap) {
  let count = 0;
  let result = text;

  // Sort by length (longest first) to avoid partial matches
  const sortedWords = [...leetSingleMap.entries()].sort((a, b) => b[0].length - a[0].length);

  for (const [leetWord, replacement] of sortedWords) {
    // Word boundary matching (case-insensitive)
    const regex = new RegExp(`\\b${escapeRegex(leetWord)}\\b`, 'gi');
    const matches = result.match(regex);
    if (matches) {
      count += matches.length;
      result = result.replace(regex, replacement);
    }
  }

  return { text: result, count };
}

/**
 * Apply leet phrase replacement (g0dm0d3 → godmode, etc.)
 *
 * @param {string} text - Input text
 * @param {Map} leetPhraseMap - Leet phrase mapping
 * @returns {Object} { text, count }
 */
export function applyLeetPhrases(text, leetPhraseMap) {
  let count = 0;
  let result = text;

  // Sort by length (longest first)
  const sortedPhrases = [...leetPhraseMap.entries()].sort((a, b) => b[0].length - a[0].length);

  for (const [leetPhrase, replacement] of sortedPhrases) {
    const regex = new RegExp(escapeRegex(leetPhrase), 'gi');
    const matches = result.match(regex);
    if (matches) {
      count += matches.length;
      result = result.replace(regex, replacement);
    }
  }

  return { text: result, count };
}

/**
 * Apply emoji to text conversion
 *
 * @param {string} text - Input text
 * @param {Map} emojiMap - Emoji mapping
 * @returns {Object} { text, count }
 */
export function applyEmojiMap(text, emojiMap) {
  let count = 0;
  let result = text;

  for (const [emoji, replacement] of emojiMap) {
    if (result.includes(emoji)) {
      const regex = new RegExp(escapeRegex(emoji), 'g');
      const matches = result.match(regex);
      if (matches) {
        count += matches.length;
        result = result.replace(regex, replacement);
      }
    }
  }

  return { text: result, count };
}

/**
 * Apply Polish diacritics normalization
 *
 * @param {string} text - Input text
 * @param {Map} diacriticsMap - Diacritics mapping
 * @returns {Object} { text, count }
 */
export function applyPolishDiacritics(text, diacriticsMap) {
  let count = 0;
  let result = '';

  for (const char of text) {
    if (diacriticsMap.has(char)) {
      result += diacriticsMap.get(char);
      count++;
    } else {
      result += char;
    }
  }

  return { text: result, count };
}

/**
 * Collapse repetition patterns (----, ====, etc.) to single space
 *
 * @param {string} text - Input text
 * @param {string[]} patterns - Patterns to collapse
 * @returns {Object} { text, count }
 */
export function collapseRepetitions(text, patterns) {
  let count = 0;
  let result = text;

  for (const pattern of patterns) {
    const char = pattern[0];
    // Match 4+ repetitions of this character
    const regex = new RegExp(`${escapeRegex(char)}{4,}`, 'g');
    const matches = result.match(regex);
    if (matches) {
      count += matches.length;
      result = result.replace(regex, ' ');
    }
  }

  return { text: result, count };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Main Normalization Function
// ============================================================================

/**
 * Full normalization pipeline
 *
 * Order of operations (matches original Normalize_Node):
 * 1. Unicode NFKC normalization
 * 2. Nested encoding decode (URL, Base64, Hex, HTML entities)
 * 3. Zero-width character removal
 * 4. Template marker removal
 * 5. Homoglyph mapping (Cyrillic, Greek → Latin)
 * 6. Unicode space normalization
 * 7. Quote/punctuation normalization
 * 8. Leet character substitution
 * 9. Leet word replacement
 * 10. Leet phrase replacement
 * 11. Polish diacritics normalization
 * 12. Emoji to text conversion
 * 13. Repetition collapse
 * 14. Whitespace normalization
 *
 * @param {string} text - Original input text
 * @param {Object} config - Parsed normalize config
 * @returns {Object} { normalizedText, signals }
 */
export function normalizeText(text, config) {
  const signals = {
    zero_width_count: 0,
    homoglyph_count: 0,
    leet_conversions: 0,
    emoji_conversions: 0,
    encoding_layers: 0,
    template_markers_removed: 0,
    polish_diacritics: 0,
    total_transformations: 0
  };

  if (!text || typeof text !== 'string') {
    return { normalizedText: text || '', signals };
  }

  let current = text;

  // 1. Unicode NFKC normalization
  current = current.normalize('NFKC');

  // 2. Nested encoding decode
  const decoded = decodeNested(current);
  current = decoded.decoded;
  signals.encoding_layers = decoded.layers;

  // 3. Zero-width removal
  const zeroWidthResult = stripZeroWidth(current, config.zeroWidth);
  current = zeroWidthResult.text;
  signals.zero_width_count = zeroWidthResult.count;

  // 4. Template markers removal
  const templateResult = stripTemplateMarkers(current, config.templateMarkers);
  current = templateResult.text;
  signals.template_markers_removed = templateResult.count;

  // 5-7. Character map (homoglyphs, spaces, quotes, punctuation)
  const charMapResult = applyCharMap(current, config.charMap);
  current = charMapResult.text;
  signals.homoglyph_count = charMapResult.count;

  // 8. Leet character substitution
  const leetCharResult = applyLeetChars(current, config.leetCharMap);
  current = leetCharResult.text;
  signals.leet_conversions += leetCharResult.count;

  // 9. Leet word replacement
  const leetWordResult = applyLeetWords(current, config.leetSingleMap);
  current = leetWordResult.text;
  signals.leet_conversions += leetWordResult.count;

  // 10. Leet phrase replacement
  const leetPhraseResult = applyLeetPhrases(current, config.leetPhraseMap);
  current = leetPhraseResult.text;
  signals.leet_conversions += leetPhraseResult.count;

  // 11. Polish diacritics
  const polishResult = applyPolishDiacritics(current, config.polishDiacritics);
  current = polishResult.text;
  signals.polish_diacritics = polishResult.count;

  // 12. Emoji to text
  const emojiResult = applyEmojiMap(current, config.emojiMap);
  current = emojiResult.text;
  signals.emoji_conversions = emojiResult.count;

  // 13. Repetition collapse
  const repetitionResult = collapseRepetitions(current, config.repetitionPatterns);
  current = repetitionResult.text;

  // 14. Final whitespace normalization
  current = current.replace(/\s+/g, ' ').trim();

  // Calculate total
  signals.total_transformations =
    signals.zero_width_count +
    signals.homoglyph_count +
    signals.leet_conversions +
    signals.emoji_conversions +
    signals.template_markers_removed +
    signals.polish_diacritics +
    signals.encoding_layers;

  return {
    normalizedText: current,
    signals
  };
}

// ============================================================================
// Singleton Config Loader
// ============================================================================

let cachedConfig = null;

/**
 * Get or load normalize config (singleton pattern)
 *
 * @param {string} configPath - Optional custom path
 * @returns {Object} Parsed config
 */
export function getNormalizeConfig(configPath = null) {
  if (cachedConfig && !configPath) {
    return cachedConfig;
  }

  const defaultPath = path.join(__dirname, '../../config/normalize.conf');
  const finalPath = configPath || defaultPath;

  cachedConfig = parseNormalizeConf(finalPath);

  console.log(`[Normalizer] Loaded config from ${finalPath}:`);
  console.log(`  - Zero-width chars: ${cachedConfig.zeroWidth.size}`);
  console.log(`  - Template markers: ${cachedConfig.templateMarkers.size}`);
  console.log(`  - Char mappings: ${cachedConfig.charMap.size}`);
  console.log(`  - Leet chars: ${cachedConfig.leetCharMap.size}`);
  console.log(`  - Leet words: ${cachedConfig.leetSingleMap.size}`);
  console.log(`  - Leet phrases: ${cachedConfig.leetPhraseMap.size}`);
  console.log(`  - Emoji: ${cachedConfig.emojiMap.size}`);
  console.log(`  - Polish diacritics: ${cachedConfig.polishDiacritics.size}`);

  return cachedConfig;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  parseNormalizeConf,
  decodeNested,
  stripZeroWidth,
  stripTemplateMarkers,
  applyCharMap,
  applyLeetChars,
  applyLeetWords,
  applyLeetPhrases,
  applyEmojiMap,
  applyPolishDiacritics,
  collapseRepetitions,
  normalizeText,
  getNormalizeConfig
};
