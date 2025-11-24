/**
 * Obfuscation Detector
 * Detects: zero-width characters, homoglyphs, base64/hex, mixed scripts, spacing anomalies
 */

import { config } from '../config/index.js';
import { loadPatterns } from '../utils/patterns.js';
import { detectScripts, normalizeHomoglyphs } from '../utils/unicode.js';

// Load patterns
const patterns = loadPatterns();

/**
 * Detect obfuscation techniques in text
 * @param {string} text - Input text to analyze
 * @returns {Object} Obfuscation detection results
 */
export async function detectObfuscation(text) {
  const results = {
    zero_width_count: 0,
    homoglyph_count: 0,
    scripts_detected: [],
    base64_detected: false,
    hex_detected: false,
    mixed_scripts: [],
    spacing_anomalies: 0,
    score: 0,
    signals: []
  };

  // 1. Zero-width character detection
  const zeroWidthChars = patterns.zeroWidth || [];
  for (const zwChar of zeroWidthChars) {
    const regex = new RegExp(zwChar.unicode, 'g');
    const matches = text.match(regex);
    if (matches) {
      results.zero_width_count += matches.length;
    }
  }

  if (results.zero_width_count > 0) {
    results.signals.push(`Found ${results.zero_width_count} zero-width characters`);
  }

  // 2. Homoglyph detection
  const normalized = normalizeHomoglyphs(text, patterns.homoglyphs);
  if (normalized !== text) {
    // Count differences
    let differences = 0;
    for (let i = 0; i < Math.min(text.length, normalized.length); i++) {
      if (text[i] !== normalized[i]) {
        differences++;
      }
    }
    results.homoglyph_count = differences;

    if (differences > 0) {
      results.signals.push(`Detected ${differences} homoglyph characters`);
    }
  }

  // 3. Script mixing detection
  const scripts = detectScripts(text);
  results.scripts_detected = scripts;

  if (scripts.length > 1) {
    results.mixed_scripts = scripts;
    results.signals.push(`Mixed scripts detected: ${scripts.join(', ')}`);
  }

  // 4. Base64 detection
  const base64Pattern = /^[A-Za-z0-9+/]{20,}={0,2}$/;
  const base64Chunks = text.match(/[A-Za-z0-9+/]{20,}={0,2}/g);
  if (base64Chunks && base64Chunks.length > 0) {
    // Check if it looks like valid base64
    for (const chunk of base64Chunks) {
      if (base64Pattern.test(chunk)) {
        results.base64_detected = true;
        results.signals.push('Base64 encoding detected');
        break;
      }
    }
  }

  // 5. Hex encoding detection
  const hexPattern = /(?:0x)?[0-9a-fA-F]{8,}/g;
  const hexMatches = text.match(hexPattern);
  if (hexMatches && hexMatches.length > 0) {
    // Check if it's substantial hex (not just a random hash)
    for (const match of hexMatches) {
      if (match.length >= 16) {
        results.hex_detected = true;
        results.signals.push('Hex encoding detected');
        break;
      }
    }
  }

  // 6. Spacing anomaly detection
  const spacingAnomalies = [
    /(\w)\s{2,}(\w)/g,  // Multiple spaces between words
    /\s{3,}/g,           // Triple or more spaces
    /[\t\r\n]{2,}/g,     // Multiple tabs/newlines
    /\u00A0{2,}/g        // Multiple non-breaking spaces
  ];

  for (const pattern of spacingAnomalies) {
    const matches = text.match(pattern);
    if (matches) {
      results.spacing_anomalies += matches.length;
    }
  }

  if (results.spacing_anomalies > 0) {
    results.signals.push(`Found ${results.spacing_anomalies} spacing anomalies`);
  }

  // Calculate sub-score (0-100)
  let score = 0;

  // Zero-width characters (HIGH weight - these are almost always malicious)
  if (results.zero_width_count >= config.detection.obfuscation.zero_width_threshold) {
    // Base: 25 points for presence, +15 per additional char, max 70
    score += Math.min(70, 25 + (results.zero_width_count - 1) * 15);
  }

  // Homoglyphs (HIGH weight - obfuscation technique)
  if (results.homoglyph_count >= config.detection.obfuscation.homoglyph_threshold) {
    // Base: 20 points for presence, +10 per additional char, max 60
    score += Math.min(60, 20 + (results.homoglyph_count - 1) * 10);
  }

  // Mixed scripts (medium-high weight)
  if (results.mixed_scripts.length >= config.detection.obfuscation.mixed_script_threshold) {
    // Base: 30 points for 2+ scripts, +15 per additional script, max 50
    score += Math.min(50, 30 + (results.mixed_scripts.length - 2) * 15);
  }

  // Base64/Hex (medium weight)
  if (results.base64_detected) score += 30;
  if (results.hex_detected) score += 25;

  // Spacing anomalies (low-medium weight)
  const textLength = text.length;
  const anomalyRatio = results.spacing_anomalies / Math.max(textLength, 1);
  if (anomalyRatio > config.detection.obfuscation.spacing_anomaly_ratio) {
    score += Math.min(20, anomalyRatio * 150);
  }

  results.score = Math.min(100, Math.round(score));

  return results;
}