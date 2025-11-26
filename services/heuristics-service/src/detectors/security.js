/**
 * Security Keywords Detector
 * Detects: SQL injection, XSS, command injection, privilege escalation
 */

import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load patterns from JSON file
let securityPatterns = null;

function loadPatterns() {
  if (!securityPatterns) {
    const patternsPath = path.join(__dirname, '../../patterns/security-keywords.json');
    securityPatterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
  }
  return securityPatterns;
}

/**
 * Detect security attack patterns in text
 * @param {string} text - Input text to analyze
 * @returns {Object} Security detection results
 */
export async function detectSecurityKeywords(text) {
  const results = {
    sql_injection_count: 0,
    xss_count: 0,
    command_injection_count: 0,
    privilege_escalation_count: 0,
    detected_patterns: [],
    score: 0,
    signals: []
  };

  if (!text || text.length < 3) {
    return results;
  }

  const patterns = loadPatterns();
  const normalizedText = text.toLowerCase();

  // 1. SQL Injection Detection
  const sqlHighConfidence = patterns.sql_injection.high_confidence;
  for (const patternDef of sqlHighConfidence) {
    const regex = new RegExp(patternDef.pattern, 'gi');
    const matches = text.match(regex);
    if (matches) {
      results.sql_injection_count += matches.length;
      results.detected_patterns.push({
        type: 'SQL_INJECTION',
        description: patternDef.description,
        weight: patternDef.weight,
        count: matches.length
      });
    }
  }

  const sqlMediumConfidence = patterns.sql_injection.medium_confidence;
  for (const patternDef of sqlMediumConfidence) {
    const regex = new RegExp(patternDef.pattern, 'gi');
    const matches = text.match(regex);
    if (matches) {
      results.sql_injection_count += matches.length;
      results.detected_patterns.push({
        type: 'SQL_INJECTION',
        description: patternDef.description,
        weight: patternDef.weight,
        count: matches.length
      });
    }
  }

  // 2. XSS Detection
  const xssHighConfidence = patterns.xss.high_confidence;
  for (const patternDef of xssHighConfidence) {
    const regex = new RegExp(patternDef.pattern, 'gi');
    const matches = text.match(regex);
    if (matches) {
      results.xss_count += matches.length;
      results.detected_patterns.push({
        type: 'XSS',
        description: patternDef.description,
        weight: patternDef.weight,
        count: matches.length
      });
    }
  }

  // 3. Command Injection Detection
  const cmdHighConfidence = patterns.command_injection.high_confidence;
  for (const patternDef of cmdHighConfidence) {
    const regex = new RegExp(patternDef.pattern, 'gi');
    const matches = text.match(regex);
    if (matches) {
      results.command_injection_count += matches.length;
      results.detected_patterns.push({
        type: 'COMMAND_INJECTION',
        description: patternDef.description,
        weight: patternDef.weight,
        count: matches.length
      });
    }
  }

  // 4. Privilege Escalation Detection
  const privHighConfidence = patterns.privilege_escalation.high_confidence;
  for (const patternDef of privHighConfidence) {
    const regex = new RegExp(patternDef.pattern, 'gi');
    const matches = text.match(regex);
    if (matches) {
      results.privilege_escalation_count += matches.length;
      results.detected_patterns.push({
        type: 'PRIVILEGE_ESCALATION',
        description: patternDef.description,
        weight: patternDef.weight,
        count: matches.length
      });
    }
  }

  // Calculate score based on detected patterns
  let score = 0;
  for (const pattern of results.detected_patterns) {
    score += pattern.weight * pattern.count;
  }

  // Cap score at 100
  results.score = Math.min(100, Math.round(score));

  // Generate signals
  if (results.sql_injection_count > 0) {
    results.signals.push(`Detected ${results.sql_injection_count} SQL injection pattern(s)`);
  }
  if (results.xss_count > 0) {
    results.signals.push(`Detected ${results.xss_count} XSS pattern(s)`);
  }
  if (results.command_injection_count > 0) {
    results.signals.push(`Detected ${results.command_injection_count} command injection pattern(s)`);
  }
  if (results.privilege_escalation_count > 0) {
    results.signals.push(`Detected ${results.privilege_escalation_count} privilege escalation pattern(s)`);
  }

  // Add severity signal
  if (results.score >= 80) {
    results.signals.unshift('CRITICAL: Multiple security attack patterns detected');
  } else if (results.score >= 50) {
    results.signals.unshift('HIGH: Security attack patterns detected');
  } else if (results.score >= 30) {
    results.signals.unshift('MEDIUM: Suspicious security patterns detected');
  }

  return results;
}
