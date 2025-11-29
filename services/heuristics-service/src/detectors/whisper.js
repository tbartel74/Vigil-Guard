/**
 * Whisper/Narrative Detector
 * Detects: whisper phrases, divider patterns, role-play markers, narrative techniques
 */

import { config } from '../config/index.js';
import { loadPatterns } from '../utils/patterns.js';

// Load patterns
const patterns = loadPatterns();

/**
 * Detect whisper and narrative techniques in text
 * @param {string} text - Input text to analyze
 * @returns {Object} Whisper detection results
 */
export async function detectWhisper(text) {
  const results = {
    whisper_patterns_found: [],
    divider_count: 0,
    roleplay_markers: [],
    open_question_repetition: 0,
    narrative_markers: 0,
    stage_directions: 0,
    score: 0,
    signals: []
  };

  // 1. Whisper pattern detection
  const whisperPatterns = patterns.whisper || [];
  for (const patternObj of whisperPatterns) {
    try {
      const regex = new RegExp(patternObj.pattern, 'gi');
      const matches = text.match(regex);
      if (matches) {
        results.whisper_patterns_found.push({
          pattern: patternObj.description || patternObj.pattern,
          matches: matches.length,
          weight: patternObj.weight || 50
        });
      }
    } catch (error) {
      console.warn(`Invalid whisper pattern: ${patternObj.pattern}`, error.message);
    }
  }

  if (results.whisper_patterns_found.length > 0) {
    const totalMatches = results.whisper_patterns_found.reduce((acc, p) => acc + p.matches, 0);
    results.signals.push(`Found ${totalMatches} whisper patterns across ${results.whisper_patterns_found.length} types`);
  }

  // 2. Divider pattern detection
  const dividerPatterns = patterns.dividers || [];
  for (const patternObj of dividerPatterns) {
    try {
      const regex = new RegExp(patternObj.pattern, 'gi');
      const matches = text.match(regex);
      if (matches) {
        results.divider_count += matches.length;
      }
    } catch (error) {
      console.warn(`Invalid divider pattern: ${patternObj.pattern}`, error.message);
    }
  }

  if (results.divider_count > 0) {
    results.signals.push(`Detected ${results.divider_count} divider patterns`);
  }

  // 3. Role-play marker detection
  const roleplayPatterns = patterns.roleplay || [];
  for (const patternObj of roleplayPatterns) {
    try {
      const regex = new RegExp(patternObj.pattern, 'gi');
      const matches = text.match(regex);
      if (matches) {
        results.roleplay_markers.push({
          pattern: patternObj.description || patternObj.pattern,
          matches: matches.length,
          weight: patternObj.weight || 50
        });
      }
    } catch (error) {
      console.warn(`Invalid roleplay pattern: ${patternObj.pattern}`, error.message);
    }
  }

  if (results.roleplay_markers.length > 0) {
    const totalMatches = results.roleplay_markers.reduce((acc, p) => acc + p.matches, 0);
    results.signals.push(`Found ${totalMatches} roleplay markers across ${results.roleplay_markers.length} types`);
  }

  // 4. Open question repetition detection
  const questionPatterns = [
    /\?\?+/g,                          // Multiple question marks
    /\?[\s\n]*\?[\s\n]*\?/g,          // Spaced question marks
    /(?:\w+\s*\?){3,}/g,              // Repeated questions
    /\bwhy\b.*\bwhy\b.*\bwhy\b/gi,    // Repeated "why"
    /\bhow\b.*\bhow\b.*\bhow\b/gi     // Repeated "how"
  ];

  for (const pattern of questionPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      results.open_question_repetition += matches.length;
    }
  }

  if (results.open_question_repetition >= config.detection.whisper.question_repetition_threshold) {
    results.signals.push(`Detected ${results.open_question_repetition} question repetitions`);
  }

  // 5. Narrative marker detection
  const narrativePatterns = [
    /\*[^*\n]+\*/g,                    // Single asterisk actions
    /\([^)]*(?:thinks?|whispers?|mutters?|says? to (?:him|her|them)self)[^)]*\)/gi,  // Parenthetical thoughts
    /\[(?:internal|thought|whisper|aside)[^\]]*\]/gi,  // Bracketed internal dialogue
    /\.{3,}[^.]+\.{3,}/g,             // Ellipsis-wrapped text
    /—[^—]+—/g,                        // Em-dash asides
    /\bmeanwhile\b/gi,                 // Scene transitions
    /\bsuddenly\b/gi,                  // Narrative transitions
    /\bcut to:\b/gi,                   // Scene changes
    /\bscene:\b/gi,                    // Scene markers
    /\bnarrator:\b/gi                  // Narrator markers
  ];

  for (const pattern of narrativePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      results.narrative_markers += matches.length;
    }
  }

  if (results.narrative_markers > 0) {
    results.signals.push(`Found ${results.narrative_markers} narrative markers`);
  }

  // 6. Stage direction detection
  const stageDirectionPatterns = [
    /\[(?:enter|exit|stage|lights|sound|music)[^\]]*\]/gi,
    /\((?:enter|exit|stage|lights|sound|music)[^)]*\)/gi,
    /stage (?:left|right|center)/gi,
    /\bexeunt\b/gi,
    /\bsoliloquy\b/gi,
    /\baside\b:/gi
  ];

  for (const pattern of stageDirectionPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      results.stage_directions += matches.length;
    }
  }

  if (results.stage_directions > 0) {
    results.signals.push(`Found ${results.stage_directions} stage directions`);
  }

  // Calculate sub-score (0-100)
  let score = 0;

  // Whisper patterns (high weight)
  if (results.whisper_patterns_found.length > 0) {
    const whisperScore = results.whisper_patterns_found.reduce((acc, p) => {
      return acc + (p.matches * p.weight * 0.5);
    }, 0);
    score += Math.min(35, whisperScore);
  }

  // Dividers (high weight for context breaking)
  if (results.divider_count > 0) {
    score += Math.min(30, results.divider_count * config.detection.whisper.divider_weight * 0.5);
  }

  // Roleplay (high weight)
  if (results.roleplay_markers.length > 0) {
    const roleplayScore = results.roleplay_markers.reduce((acc, p) => {
      return acc + (p.matches * p.weight * 0.5);
    }, 0);
    score += Math.min(30, roleplayScore);
  }

  // Question repetition (medium weight)
  if (results.open_question_repetition >= config.detection.whisper.question_repetition_threshold) {
    score += Math.min(15, results.open_question_repetition * 5);
  }

  // Narrative markers (low-medium weight)
  if (results.narrative_markers > 0) {
    score += Math.min(10, results.narrative_markers * 2);
  }

  // Stage directions (medium weight)
  if (results.stage_directions > 0) {
    score += Math.min(10, results.stage_directions * 5);
  }

  // Apply pattern weight multiplier from config
  score *= config.detection.whisper.pattern_weight_multiplier;

  results.score = Math.min(100, Math.round(score));

  // Add summary signal if high score
  if (results.score >= 70) {
    results.signals.unshift('High whisper/narrative activity detected');
  } else if (results.score >= 40) {
    results.signals.unshift('Moderate whisper/narrative techniques detected');
  }

  return results;
}