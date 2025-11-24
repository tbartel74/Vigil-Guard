/**
 * Structure Detector
 * Detects: boundary markers, code fences, excessive newlines, segmentation anomalies
 */

import { config } from '../config/index.js';

/**
 * Detect structural anomalies in text
 * @param {string} text - Input text to analyze
 * @returns {Object} Structure detection results
 */
export async function detectStructure(text) {
  const results = {
    boundary_anomalies: 0,
    code_fence_count: 0,
    excess_newlines: 0,
    segmentation_score: 0,
    nested_structures: 0,
    score: 0,
    signals: []
  };

  // 1. Code fence detection
  const codeFencePattern = /```/g;
  const codeFences = text.match(codeFencePattern);
  if (codeFences) {
    results.code_fence_count = codeFences.length;
    if (codeFences.length >= config.detection.structure.code_fence_threshold) {
      results.signals.push(`Found ${codeFences.length} code fence markers (threshold: ${config.detection.structure.code_fence_threshold})`);
    }
  }

  // 2. Boundary marker detection
  const boundaryMarkers = [
    /<!--.*?-->/g,           // HTML comments
    /\/\*.*?\*\//g,          // C-style comments
    /\[\[.*?\]\]/g,          // Double brackets
    /\{\{.*?\}\}/g,          // Double braces
    /<\|.*?\|>/g,            // Pipe brackets
    /---+/g,                 // Horizontal rules (3+ dashes)
    /===/g,                 // Triple equals
    /###/g,                  // Triple hash
    /\*\*\*/g,               // Triple asterisk
    /^-{3,}$/gm,             // Line of only dashes
    /^={3,}$/gm,             // Line of only equals
    /^#{3,}$/gm              // Line of only hashes
  ];

  for (const pattern of boundaryMarkers) {
    const matches = text.match(pattern);
    if (matches) {
      results.boundary_anomalies += matches.length;
    }
  }

  if (results.boundary_anomalies >= config.detection.structure.boundary_threshold) {
    results.signals.push(`Detected ${results.boundary_anomalies} boundary markers (threshold: ${config.detection.structure.boundary_threshold})`);
  }

  // 3. Newline analysis
  const newlinePattern = /\n/g;
  const newlines = text.match(newlinePattern);
  const newlineCount = newlines ? newlines.length : 0;

  // Check for excessive consecutive newlines
  const consecutiveNewlines = /\n{3,}/g;
  const excessiveNewlines = text.match(consecutiveNewlines);
  if (excessiveNewlines) {
    results.excess_newlines = excessiveNewlines.reduce((acc, match) => acc + match.length - 2, 0);
    if (results.excess_newlines >= config.detection.structure.newline_threshold) {
      results.signals.push(`Found ${results.excess_newlines} excessive newlines`);
    }
  }

  // 4. Segmentation analysis
  const lines = text.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim().length > 0);

  if (nonEmptyLines.length > 0) {
    // Calculate average line length
    const avgLineLength = nonEmptyLines.reduce((acc, line) => acc + line.length, 0) / nonEmptyLines.length;

    // Check for unusual segmentation (many short lines)
    const shortLines = nonEmptyLines.filter(line => line.length < avgLineLength * 0.3);
    const segmentationRatio = shortLines.length / nonEmptyLines.length;

    results.segmentation_score = Math.round(segmentationRatio * 100);

    if (segmentationRatio > config.detection.structure.segmentation_ratio) {
      results.signals.push(`High segmentation detected (${results.segmentation_score}% short lines)`);
    }
  }

  // 5. Nested structure detection
  const nestedPatterns = [
    /\[\[.*?\[\[.*?\]\].*?\]\]/g,     // Nested double brackets
    /\{\{.*?\{\{.*?\}\}.*?\}\}/g,     // Nested double braces
    /```.*?```.*?```/gs,               // Nested code blocks
    /<!--.*?<!--.*?-->.*?-->/gs       // Nested HTML comments
  ];

  for (const pattern of nestedPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      results.nested_structures += matches.length;
    }
  }

  if (results.nested_structures > 0) {
    results.signals.push(`Found ${results.nested_structures} nested structures`);
  }

  // 6. Pattern density analysis
  const totalLength = text.length;
  const structuralElements = results.boundary_anomalies + results.code_fence_count + results.nested_structures;
  const structuralDensity = totalLength > 0 ? (structuralElements * 100) / totalLength : 0;

  // Calculate sub-score (0-100)
  let score = 0;

  // Code fences (high weight)
  if (results.code_fence_count >= config.detection.structure.code_fence_threshold) {
    score += Math.min(30, results.code_fence_count * 10);
  }

  // Boundary markers (medium-high weight)
  if (results.boundary_anomalies >= config.detection.structure.boundary_threshold) {
    score += Math.min(25, results.boundary_anomalies * 3);
  }

  // Excessive newlines (medium weight)
  if (results.excess_newlines >= config.detection.structure.newline_threshold) {
    score += Math.min(20, results.excess_newlines * 2);
  }

  // Segmentation (medium weight)
  score += Math.min(15, results.segmentation_score * 0.3);

  // Nested structures (high weight for complexity)
  if (results.nested_structures > 0) {
    score += Math.min(20, results.nested_structures * 10);
  }

  // Structural density bonus
  if (structuralDensity > 1) {
    score += Math.min(10, structuralDensity * 2);
  }

  results.score = Math.min(100, Math.round(score));

  // Add summary signal if high score
  if (results.score >= 70) {
    results.signals.unshift('High structural complexity detected');
  } else if (results.score >= 40) {
    results.signals.unshift('Moderate structural anomalies detected');
  }

  return results;
}