/**
 * Pattern loader utility
 * Loads and caches detection patterns from configuration files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache for loaded patterns
let patternsCache = null;

// Track loading errors for health endpoint
const loadingErrors = [];

/**
 * Load all detection patterns
 * @returns {Object} Loaded patterns organized by type
 */
export function loadPatterns() {
  if (patternsCache) {
    return patternsCache;
  }

  const patternsDir = path.join(__dirname, '../../config/patterns');
  // In Docker, patterns are mounted to /app/patterns
  // In local dev, they're in Roadmap/semantic-similarity/extracted-patterns
  const extractedDir = process.env.PATTERNS_DIR ||
    (fs.existsSync('/app/patterns') ? '/app/patterns' : path.join(__dirname, '../../../../Roadmap/semantic-similarity/extracted-patterns'));

  const patterns = {
    zeroWidth: [],
    homoglyphs: {},
    systemMarkers: [],
    whisper: [],
    dividers: [],
    roleplay: [],
    boundaries: [],
    emojiMappings: {}
  };

  // Load zero-width characters
  try {
    const zeroWidthFile = path.join(extractedDir, 'zero-width.json');
    if (fs.existsSync(zeroWidthFile)) {
      patterns.zeroWidth = JSON.parse(fs.readFileSync(zeroWidthFile, 'utf-8'));
    }
  } catch (error) {
    console.warn('Failed to load zero-width patterns:', error.message);
    loadingErrors.push({ file: 'zero-width.json', error: error.message });
  }

  // Load homoglyphs
  try {
    const homoglyphFile = path.join(extractedDir, 'homoglyphs.json');
    if (fs.existsSync(homoglyphFile)) {
      patterns.homoglyphs = JSON.parse(fs.readFileSync(homoglyphFile, 'utf-8'));
    }
  } catch (error) {
    console.warn('Failed to load homoglyph patterns:', error.message);
    loadingErrors.push({ file: 'homoglyphs.json', error: error.message });
  }

  // Load system markers
  try {
    const markersFile = path.join(extractedDir, 'system-markers.json');
    if (fs.existsSync(markersFile)) {
      patterns.systemMarkers = JSON.parse(fs.readFileSync(markersFile, 'utf-8'));
    }
  } catch (error) {
    console.warn('Failed to load system markers:', error.message);
    loadingErrors.push({ file: 'system-markers.json', error: error.message });
  }

  // Load whisper patterns (manual version)
  try {
    const whisperFile = path.join(extractedDir, 'whisper-patterns-manual.json');
    if (fs.existsSync(whisperFile)) {
      patterns.whisper = JSON.parse(fs.readFileSync(whisperFile, 'utf-8'));
    } else {
      // Fallback to auto-extracted
      const autoWhisperFile = path.join(extractedDir, 'whisper-patterns.json');
      if (fs.existsSync(autoWhisperFile)) {
        patterns.whisper = JSON.parse(fs.readFileSync(autoWhisperFile, 'utf-8'));
      }
    }
  } catch (error) {
    console.warn('Failed to load whisper patterns:', error.message);
    loadingErrors.push({ file: 'whisper-patterns.json', error: error.message });
  }

  // Load divider patterns (manual version)
  try {
    const dividerFile = path.join(extractedDir, 'divider-patterns-manual.json');
    if (fs.existsSync(dividerFile)) {
      patterns.dividers = JSON.parse(fs.readFileSync(dividerFile, 'utf-8'));
    } else {
      // Fallback to auto-extracted
      const autoDividerFile = path.join(extractedDir, 'divider-patterns.json');
      if (fs.existsSync(autoDividerFile)) {
        patterns.dividers = JSON.parse(fs.readFileSync(autoDividerFile, 'utf-8'));
      }
    }
  } catch (error) {
    console.warn('Failed to load divider patterns:', error.message);
    loadingErrors.push({ file: 'divider-patterns.json', error: error.message });
  }

  // Load roleplay patterns (manual version)
  try {
    const roleplayFile = path.join(extractedDir, 'roleplay-patterns-manual.json');
    if (fs.existsSync(roleplayFile)) {
      patterns.roleplay = JSON.parse(fs.readFileSync(roleplayFile, 'utf-8'));
    } else {
      // Fallback to auto-extracted
      const autoRoleplayFile = path.join(extractedDir, 'roleplay-patterns.json');
      if (fs.existsSync(autoRoleplayFile)) {
        patterns.roleplay = JSON.parse(fs.readFileSync(autoRoleplayFile, 'utf-8'));
      }
    }
  } catch (error) {
    console.warn('Failed to load roleplay patterns:', error.message);
    loadingErrors.push({ file: 'roleplay-patterns.json', error: error.message });
  }

  // Load boundary patterns
  try {
    const boundaryFile = path.join(extractedDir, 'boundary-patterns.json');
    if (fs.existsSync(boundaryFile)) {
      patterns.boundaries = JSON.parse(fs.readFileSync(boundaryFile, 'utf-8'));
    }
  } catch (error) {
    console.warn('Failed to load boundary patterns:', error.message);
    loadingErrors.push({ file: 'boundary-patterns.json', error: error.message });
  }

  // Load emoji mappings
  try {
    const emojiFile = path.join(extractedDir, 'emoji-mappings.json');
    if (fs.existsSync(emojiFile)) {
      patterns.emojiMappings = JSON.parse(fs.readFileSync(emojiFile, 'utf-8'));
    }
  } catch (error) {
    console.warn('Failed to load emoji mappings:', error.message);
    loadingErrors.push({ file: 'emoji-mappings.json', error: error.message });
  }

  // Cache the loaded patterns
  patternsCache = patterns;

  console.log('Loaded patterns summary:', {
    zeroWidth: patterns.zeroWidth.length,
    homoglyphs: Object.keys(patterns.homoglyphs).reduce((acc, key) =>
      acc + Object.keys(patterns.homoglyphs[key]).length, 0),
    systemMarkers: patterns.systemMarkers.length,
    whisper: patterns.whisper.length,
    dividers: patterns.dividers.length,
    roleplay: patterns.roleplay.length,
    boundaries: patterns.boundaries.length,
    emojiMappings: Object.keys(patterns.emojiMappings).length
  });

  return patterns;
}

/**
 * Clear the patterns cache (useful for testing)
 */
export function clearPatternsCache() {
  patternsCache = null;
}

/**
 * Get pattern loading status for health checks
 * @returns {Object} Loading status with errors if any
 */
export function getPatternLoadingStatus() {
  return {
    loaded: patternsCache !== null,
    errors: loadingErrors,
    degraded: loadingErrors.length > 0
  };
}