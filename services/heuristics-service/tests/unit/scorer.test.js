/**
 * Tests for Heuristics Service Scorer with Normalization Signals
 *
 * v2.1.0: Tests normalization signal integration into scoring
 */

import { describe, it, expect } from 'vitest';
import { calculateScore } from '../../src/scoring/scorer.js';

// Mock detector results (baseline - no signals)
const createMockDetectorResults = (overrides = {}) => ({
  obfuscation: {
    score: overrides.obfuscationScore ?? 0,
    signals: overrides.obfuscationSignals ?? [],
    zero_width_count: 0,
    homoglyph_count: 0,
    scripts_detected: ['Latin'],
    base64_detected: false,
    hex_detected: false,
    mixed_scripts: [],
    spacing_anomalies: 0
  },
  structure: {
    score: overrides.structureScore ?? 0,
    signals: overrides.structureSignals ?? [],
    boundary_anomalies: 0,
    code_fence_count: 0,
    excess_newlines: 0,
    segmentation_score: 0,
    nested_structures: 0
  },
  whisper: {
    score: overrides.whisperScore ?? 0,
    signals: overrides.whisperSignals ?? [],
    whisper_patterns_found: [],
    divider_count: 0,
    roleplay_markers: [],
    open_question_repetition: 0,
    narrative_markers: 0,
    stage_directions: 0
  },
  entropy: {
    score: overrides.entropyScore ?? 0,
    signals: overrides.entropySignals ?? [],
    entropy_raw: 4.0,
    entropy_normalized: 50,
    bigram_anomaly_score: 50,
    random_segments: [],
    perplexity_score: 80
  }
});

// Create normalization signals
const createNormSignals = (overrides = {}) => ({
  zero_width_count: overrides.zero_width_count ?? 0,
  homoglyph_count: overrides.homoglyph_count ?? 0,
  leet_conversions: overrides.leet_conversions ?? 0,
  emoji_conversions: overrides.emoji_conversions ?? 0,
  encoding_layers: overrides.encoding_layers ?? 0,
  template_markers_removed: overrides.template_markers_removed ?? 0,
  polish_diacritics: overrides.polish_diacritics ?? 0,
  total_transformations: overrides.total_transformations ?? 0
});

describe('Scorer - Basic Functionality', () => {
  it('should return score 0 for clean input without signals', () => {
    const result = calculateScore(createMockDetectorResults());
    expect(result.score).toBe(0);
    expect(result.threat_level).toBe('LOW');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('should calculate score from detector results without norm signals', () => {
    const result = calculateScore(createMockDetectorResults({
      whisperScore: 70,
      whisperSignals: ['Pattern detected']
    }));

    // With hybrid scoring (30% weighted + 70% max), whisper 70 dominates
    // weighted = 70 * 0.3 = 21, max = 70, hybrid = 21 * 0.3 + 70 * 0.7 = 55.3
    expect(result.score).toBeGreaterThan(40);
    // Score 55+ is HIGH threshold (>64 is HIGH in config)
    expect(['MEDIUM', 'HIGH']).toContain(result.threat_level);
  });
});

describe('Scorer - Normalization Signal Boosts', () => {
  it('should boost score for leet speak conversions', () => {
    const baseResult = calculateScore(createMockDetectorResults());
    const leetResult = calculateScore(
      createMockDetectorResults(),
      createNormSignals({ leet_conversions: 3 })
    );

    // 3 leet conversions = +15 to obfuscation score
    expect(leetResult.score).toBeGreaterThan(baseResult.score);
    expect(leetResult.explanations).toContainEqual(
      expect.stringContaining('Leet speak obfuscation')
    );
  });

  it('should cap leet boost at 25', () => {
    const result1 = calculateScore(
      createMockDetectorResults(),
      createNormSignals({ leet_conversions: 5 })  // 5 * 5 = 25 (at cap)
    );
    const result2 = calculateScore(
      createMockDetectorResults(),
      createNormSignals({ leet_conversions: 10 }) // 10 * 5 = 50, but cap at 25
    );

    // Both should have same boost (capped at 25)
    expect(result1.score).toBe(result2.score);
  });

  it('should boost score for emoji conversions', () => {
    const result = calculateScore(
      createMockDetectorResults(),
      createNormSignals({ emoji_conversions: 2 })
    );

    // 2 emoji conversions = +6 to obfuscation score
    expect(result.score).toBeGreaterThan(0);
    expect(result.explanations).toContainEqual(
      expect.stringContaining('Emoji obfuscation')
    );
  });

  it('should heavily boost for nested encoding layers', () => {
    const result = calculateScore(
      createMockDetectorResults(),
      createNormSignals({ encoding_layers: 2 })
    );

    // 2 encoding layers = +30 to obfuscation score
    expect(result.score).toBeGreaterThan(20);
    expect(result.explanations).toContainEqual(
      expect.stringContaining('Nested encoding')
    );
  });

  it('should boost for template markers', () => {
    const result = calculateScore(
      createMockDetectorResults(),
      createNormSignals({ template_markers_removed: 2 })
    );

    // Template markers = +20 to obfuscation score
    expect(result.score).toBeGreaterThan(10);
    expect(result.explanations).toContainEqual(
      expect.stringContaining('Template injection markers')
    );
  });

  it('should boost for zero-width characters', () => {
    const result = calculateScore(
      createMockDetectorResults(),
      createNormSignals({ zero_width_count: 10 })
    );

    // 10 zero-width = +20 to obfuscation score
    expect(result.score).toBeGreaterThan(10);
    expect(result.explanations).toContainEqual(
      expect.stringContaining('Zero-width characters')
    );
  });

  it('should boost for homoglyphs', () => {
    const result = calculateScore(
      createMockDetectorResults(),
      createNormSignals({ homoglyph_count: 5 })
    );

    // 5 homoglyphs = +15 to obfuscation score
    expect(result.score).toBeGreaterThan(10);
    expect(result.explanations).toContainEqual(
      expect.stringContaining('Homoglyph obfuscation')
    );
  });

  it('should cap total normalization boost at 50', () => {
    // Max out all signals
    const result = calculateScore(
      createMockDetectorResults(),
      createNormSignals({
        leet_conversions: 10,      // +25 (capped)
        emoji_conversions: 10,     // +15 (capped)
        encoding_layers: 3,        // +45
        template_markers_removed: 5, // +20
        zero_width_count: 20,      // +30 (capped)
        homoglyph_count: 20        // +30 (capped)
      })
    );

    // Total would be 165, but capped at 50
    // With hybrid scoring (30% weighted + 70% max) and max 50 obfuscation:
    // weighted = 50 * 0.3 = 15, max = 50, hybrid = 15*0.3 + 50*0.7 = 39.5
    expect(result.score).toBeLessThanOrEqual(50);
  });
});

describe('Scorer - Combined Signals', () => {
  it('should combine detector score with normalization boost', () => {
    const detectorOnly = calculateScore(createMockDetectorResults({
      whisperScore: 60,
      whisperSignals: ['Whisper pattern']
    }));

    const combined = calculateScore(
      createMockDetectorResults({
        whisperScore: 60,
        whisperSignals: ['Whisper pattern']
      }),
      createNormSignals({ leet_conversions: 3 })
    );

    expect(combined.score).toBeGreaterThan(detectorOnly.score);
  });

  it('should add normalization signals to total signals count', () => {
    const withoutNorm = calculateScore(createMockDetectorResults({
      whisperScore: 50,
      whisperSignals: ['Signal 1']
    }));

    const withNorm = calculateScore(
      createMockDetectorResults({
        whisperScore: 50,
        whisperSignals: ['Signal 1']
      }),
      createNormSignals({ leet_conversions: 2, homoglyph_count: 3 })
    );

    // More signals should increase confidence
    expect(withNorm.confidence).toBeGreaterThanOrEqual(withoutNorm.confidence);
  });

  it('should produce HIGH threat for heavily obfuscated attack', () => {
    const result = calculateScore(
      createMockDetectorResults({
        whisperScore: 80,
        whisperSignals: ['Critical pattern']
      }),
      createNormSignals({
        leet_conversions: 4,
        encoding_layers: 1,
        template_markers_removed: 1
      })
    );

    expect(result.threat_level).toBe('HIGH');
    expect(result.score).toBeGreaterThanOrEqual(65);
  });
});

describe('Scorer - Explanations', () => {
  it('should include normalization signals in explanations first', () => {
    const result = calculateScore(
      createMockDetectorResults({
        whisperScore: 50,
        whisperSignals: ['Whisper detected']
      }),
      createNormSignals({ leet_conversions: 3 })
    );

    // Normalization explanations should appear early
    const leetExplanation = result.explanations.find(e => e.includes('Leet'));
    expect(leetExplanation).toBeDefined();
  });

  it('should limit explanations to 10', () => {
    const result = calculateScore(
      createMockDetectorResults({
        obfuscationScore: 50,
        obfuscationSignals: ['O1', 'O2', 'O3', 'O4'],
        structureScore: 50,
        structureSignals: ['S1', 'S2', 'S3'],
        whisperScore: 50,
        whisperSignals: ['W1', 'W2', 'W3'],
        entropyScore: 50,
        entropySignals: ['E1', 'E2', 'E3']
      }),
      createNormSignals({
        leet_conversions: 5,
        emoji_conversions: 3,
        zero_width_count: 10
      })
    );

    expect(result.explanations.length).toBeLessThanOrEqual(10);
  });
});

describe('Scorer - Edge Cases', () => {
  it('should handle null normalization signals', () => {
    const result = calculateScore(createMockDetectorResults(), null);
    expect(result.score).toBe(0);
    expect(result.threat_level).toBe('LOW');
  });

  it('should handle undefined normalization signals', () => {
    const result = calculateScore(createMockDetectorResults(), undefined);
    expect(result.score).toBe(0);
    expect(result.threat_level).toBe('LOW');
  });

  it('should handle empty normalization signals', () => {
    const result = calculateScore(
      createMockDetectorResults(),
      createNormSignals()
    );
    expect(result.score).toBe(0);
    expect(result.threat_level).toBe('LOW');
  });

  it('should handle zero values in normalization signals', () => {
    const result = calculateScore(
      createMockDetectorResults(),
      createNormSignals({
        leet_conversions: 0,
        emoji_conversions: 0,
        encoding_layers: 0
      })
    );
    expect(result.score).toBe(0);
    expect(result.explanations.filter(e => e.includes('Leet'))).toHaveLength(0);
  });
});

describe('Scorer - Real Attack Scenarios', () => {
  it('should detect leet-speak injection attempt', () => {
    // "Ign0r3 pr3v10us 1n5truct10n5" → "Ignore previous instructions"
    const result = calculateScore(
      createMockDetectorResults({
        whisperScore: 70,  // Detected after normalization
        whisperSignals: ['Ignore previous instructions pattern']
      }),
      createNormSignals({
        leet_conversions: 3,  // ign0r3, pr3v10us, 1n5truct10n5
        total_transformations: 3
      })
    );

    expect(result.score).toBeGreaterThan(50);
    expect(result.threat_level).toBe('HIGH');
    expect(result.explanations).toContainEqual(
      expect.stringContaining('Leet speak')
    );
  });

  it('should detect emoji + godmode attack', () => {
    // "🗣️ g0dm0d3 enabled" → "say godmode enabled"
    const result = calculateScore(
      createMockDetectorResults({
        whisperScore: 100,  // Godmode detected
        whisperSignals: ['GODMODE reference', 'Identity override']
      }),
      createNormSignals({
        emoji_conversions: 1,
        leet_conversions: 1,  // g0dm0d3
        total_transformations: 2
      })
    );

    expect(result.score).toBeGreaterThan(70);
    expect(result.threat_level).toBe('HIGH');
  });

  it('should detect base64-encoded injection', () => {
    // Nested encoding attack
    const result = calculateScore(
      createMockDetectorResults({
        whisperScore: 50
      }),
      createNormSignals({
        encoding_layers: 2,  // Double-encoded Base64
        total_transformations: 2
      })
    );

    // 2 encoding layers = +30, capped at 50
    expect(result.score).toBeGreaterThan(20);
  });

  it('should detect template marker injection', () => {
    // <|system|> markers in user input
    const result = calculateScore(
      createMockDetectorResults({
        structureScore: 40,
        structureSignals: ['Boundary anomaly']
      }),
      createNormSignals({
        template_markers_removed: 2,  // <|system|> <|/system|>
        total_transformations: 2
      })
    );

    expect(result.score).toBeGreaterThan(20);
    expect(result.explanations).toContainEqual(
      expect.stringContaining('Template injection')
    );
  });

  it('should detect zero-width character attack', () => {
    // Invisible characters hiding malicious content
    const result = calculateScore(
      createMockDetectorResults({
        obfuscationScore: 20,
        obfuscationSignals: ['Unusual character patterns']
      }),
      createNormSignals({
        zero_width_count: 15,  // Many zero-width chars
        total_transformations: 15
      })
    );

    expect(result.score).toBeGreaterThan(20);
    expect(result.explanations).toContainEqual(
      expect.stringContaining('Zero-width')
    );
  });

  it('should detect cyrillic homoglyph attack', () => {
    // Cyrillic 'а' looks like Latin 'a'
    const result = calculateScore(
      createMockDetectorResults({
        obfuscationScore: 30,
        obfuscationSignals: ['Mixed scripts detected']
      }),
      createNormSignals({
        homoglyph_count: 8,
        total_transformations: 8
      })
    );

    expect(result.score).toBeGreaterThan(25);
    expect(result.explanations).toContainEqual(
      expect.stringContaining('Homoglyph')
    );
  });
});
