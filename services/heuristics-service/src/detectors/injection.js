/**
 * Injection Pattern Detector
 * Detects: Prompt injection, jailbreak, control override, prompt leak, roleplay escape
 *
 * This detector uses local patterns from injection-patterns.json
 * It is independent of external config files (rules.config.json)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load patterns from JSON file
let injectionPatterns = null;
let patternLoadingError = null;
let compiledPatterns = null;

function loadPatterns() {
  if (injectionPatterns) {
    return injectionPatterns;
  }

  try {
    const patternsPath = path.join(__dirname, '../../patterns/injection-patterns.json');
    const rawData = fs.readFileSync(patternsPath, 'utf8');
    injectionPatterns = JSON.parse(rawData);

    // Pre-compile all regex patterns for performance
    compiledPatterns = {};
    for (const [category, config] of Object.entries(injectionPatterns.categories)) {
      compiledPatterns[category] = {
        base_weight: config.base_weight,
        multiplier: config.multiplier,
        patterns: config.patterns.map(pattern => {
          try {
            return {
              regex: new RegExp(pattern, 'gi'),
              pattern: pattern
            };
          } catch (err) {
            console.warn(`Invalid regex in ${category}: ${pattern} - ${err.message}`);
            return null;
          }
        }).filter(p => p !== null)
      };
    }

    const totalPatterns = Object.values(compiledPatterns)
      .reduce((sum, cat) => sum + cat.patterns.length, 0);
    console.log(`[Injection Detector] Loaded ${totalPatterns} patterns across ${Object.keys(compiledPatterns).length} categories`);

  } catch (error) {
    console.error('CRITICAL: Failed to load injection patterns:', error.message);
    patternLoadingError = error.message;
    injectionPatterns = { categories: {} };
    compiledPatterns = {};
  }

  return injectionPatterns;
}

/**
 * Get pattern loading status for health checks
 */
export function getInjectionPatternStatus() {
  return {
    loaded: !patternLoadingError,
    error: patternLoadingError,
    categories: compiledPatterns ? Object.keys(compiledPatterns).length : 0
  };
}

/**
 * Detect injection patterns in text
 * @param {string} text - Input text to analyze
 * @returns {Object} Injection detection results
 */
export async function detectInjection(text) {
  const results = {
    injection_count: 0,
    jailbreak_count: 0,
    prompt_leak_count: 0,
    control_override_count: 0,
    roleplay_count: 0,
    detected_patterns: [],
    categories_triggered: [],
    score: 0,
    signals: []
  };

  if (!text || text.length < 3) {
    return results;
  }

  // Ensure patterns are loaded
  loadPatterns();

  if (!compiledPatterns || Object.keys(compiledPatterns).length === 0) {
    console.warn('[Injection Detector] No patterns loaded - returning empty result');
    return results;
  }

  // Track which categories were triggered
  const categoryScores = {};

  // Check each category
  for (const [category, config] of Object.entries(compiledPatterns)) {
    let categoryMatchCount = 0;

    for (const patternObj of config.patterns) {
      try {
        const matches = text.match(patternObj.regex);
        if (matches) {
          categoryMatchCount += matches.length;
          results.detected_patterns.push({
            category: category,
            pattern: patternObj.pattern.substring(0, 50) + (patternObj.pattern.length > 50 ? '...' : ''),
            count: matches.length,
            match_preview: matches[0].substring(0, 30) + (matches[0].length > 30 ? '...' : '')
          });
        }
      } catch (err) {
        // Skip patterns that fail at runtime
      }
    }

    if (categoryMatchCount > 0) {
      const categoryScore = Math.min(100, config.base_weight * config.multiplier * Math.min(categoryMatchCount, 3));
      categoryScores[category] = categoryScore;
      results.categories_triggered.push({
        category: category,
        matches: categoryMatchCount,
        score: Math.round(categoryScore)
      });

      // Update specific counters
      if (category.includes('INJECTION') || category.includes('CRITICAL')) {
        results.injection_count += categoryMatchCount;
      }
      if (category.includes('JAILBREAK') || category.includes('GODMODE')) {
        results.jailbreak_count += categoryMatchCount;
      }
      if (category.includes('LEAK') || category.includes('EXTRACTION')) {
        results.prompt_leak_count += categoryMatchCount;
      }
      if (category.includes('OVERRIDE') || category.includes('CONTROL')) {
        results.control_override_count += categoryMatchCount;
      }
      if (category.includes('ROLEPLAY') || category.includes('HYPOTHETICAL')) {
        results.roleplay_count += categoryMatchCount;
      }
    }
  }

  // Calculate final score - take highest category score as dominant
  // Then add 10% of other scores to account for multi-vector attacks
  const sortedScores = Object.values(categoryScores).sort((a, b) => b - a);
  if (sortedScores.length > 0) {
    results.score = Math.round(sortedScores[0]);
    for (let i = 1; i < sortedScores.length; i++) {
      results.score += Math.round(sortedScores[i] * 0.1);
    }
    results.score = Math.min(100, results.score);
  }

  // Generate signals
  if (results.injection_count > 0) {
    results.signals.push(`Detected ${results.injection_count} injection pattern(s)`);
  }
  if (results.jailbreak_count > 0) {
    results.signals.push(`Detected ${results.jailbreak_count} jailbreak pattern(s)`);
  }
  if (results.prompt_leak_count > 0) {
    results.signals.push(`Detected ${results.prompt_leak_count} prompt leak attempt(s)`);
  }
  if (results.control_override_count > 0) {
    results.signals.push(`Detected ${results.control_override_count} control override pattern(s)`);
  }
  if (results.roleplay_count > 0) {
    results.signals.push(`Detected ${results.roleplay_count} roleplay escape pattern(s)`);
  }

  // Add severity signal
  if (results.score >= 80) {
    results.signals.unshift('CRITICAL: Multiple injection patterns detected');
  } else if (results.score >= 50) {
    results.signals.unshift('HIGH: Injection patterns detected');
  } else if (results.score >= 30) {
    results.signals.unshift('MEDIUM: Suspicious injection patterns');
  }

  return results;
}
