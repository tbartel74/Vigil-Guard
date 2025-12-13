/**
 * Unit Tests - Scoring Module
 * Tests threat level calculation and branch_result building
 */

import { describe, it, expect } from 'vitest';
import {
    ThreatLevel,
    calculateScore,
    generateExplanations,
    buildBranchResult,
    buildTwoPhaseResult,
    buildDegradedResult
} from '../../src/scoring/scorer.js';

describe('Scorer Module', () => {

    describe('calculateScore', () => {

        it('should return LOW threat for empty results', () => {
            const result = calculateScore([]);
            expect(result.score).toBe(0);
            expect(result.threat_level).toBe(ThreatLevel.LOW);
            expect(result.confidence).toBe(0);
        });

        it('should return LOW threat for null results', () => {
            const result = calculateScore(null);
            expect(result.score).toBe(0);
            expect(result.threat_level).toBe(ThreatLevel.LOW);
        });

        it('should calculate LOW threat for similarity < 0.40', () => {
            const results = [{ similarity: 0.35, pattern_id: 'test_1', category: 'TEST' }];
            const result = calculateScore(results);
            expect(result.score).toBe(35);
            expect(result.threat_level).toBe(ThreatLevel.LOW);
            expect(result.confidence).toBeCloseTo(0.35, 2);
        });

        it('should calculate MEDIUM threat for similarity 0.40-0.69', () => {
            const results = [{ similarity: 0.55, pattern_id: 'test_1', category: 'TEST' }];
            const result = calculateScore(results);
            expect(result.score).toBe(55);
            expect(result.threat_level).toBe(ThreatLevel.MEDIUM);
        });

        it('should calculate HIGH threat for similarity >= 0.70', () => {
            const results = [{ similarity: 0.85, pattern_id: 'test_1', category: 'TEST' }];
            const result = calculateScore(results);
            expect(result.score).toBe(85);
            expect(result.threat_level).toBe(ThreatLevel.HIGH);
        });

        it('should cap score at 100', () => {
            const results = [{ similarity: 1.05, pattern_id: 'test_1', category: 'TEST' }];
            const result = calculateScore(results);
            expect(result.score).toBe(100);
        });

        it('should use top result for scoring', () => {
            const results = [
                { similarity: 0.90, pattern_id: 'high', category: 'HIGH' },
                { similarity: 0.50, pattern_id: 'medium', category: 'MEDIUM' },
                { similarity: 0.20, pattern_id: 'low', category: 'LOW' }
            ];
            const result = calculateScore(results);
            expect(result.score).toBe(90);
            expect(result.top_similarity).toBeCloseTo(0.90, 2);
        });

    });

    describe('generateExplanations', () => {

        it('should return "no patterns found" for empty results', () => {
            const explanations = generateExplanations([], 0);
            expect(explanations).toContain('No similar patterns found in database');
        });

        it('should include top similarity info', () => {
            const results = [
                { similarity: 0.75, pattern_id: 'SQL_001', category: 'SQL_INJECTION' }
            ];
            const explanations = generateExplanations(results, 75);
            expect(explanations[0]).toContain('75.0%');
            expect(explanations[0]).toContain('SQL_001');
            expect(explanations[0]).toContain('SQL_INJECTION');
        });

        it('should list multiple categories', () => {
            const results = [
                { similarity: 0.75, pattern_id: 'SQL_001', category: 'SQL_INJECTION' },
                { similarity: 0.65, pattern_id: 'XSS_001', category: 'XSS_ATTACK' }
            ];
            const explanations = generateExplanations(results, 75);
            const categoryExplanation = explanations.find(e => e.includes('Matched categories'));
            expect(categoryExplanation).toBeDefined();
            expect(categoryExplanation).toContain('SQL_INJECTION');
            expect(categoryExplanation).toContain('XSS_ATTACK');
        });

        it('should add high similarity note for >= 0.90', () => {
            const results = [{ similarity: 0.95, pattern_id: 'test', category: 'TEST' }];
            const explanations = generateExplanations(results, 95);
            expect(explanations).toContain('Very high semantic similarity detected');
        });

        it('should add high similarity note for >= 0.70', () => {
            const results = [{ similarity: 0.75, pattern_id: 'test', category: 'TEST' }];
            const explanations = generateExplanations(results, 75);
            expect(explanations).toContain('High semantic similarity detected');
        });

        it('should add moderate similarity note for >= 0.50', () => {
            const results = [{ similarity: 0.55, pattern_id: 'test', category: 'TEST' }];
            const explanations = generateExplanations(results, 55);
            expect(explanations).toContain('Moderate semantic similarity detected');
        });

    });

    describe('buildBranchResult', () => {

        it('should build complete branch_result object', () => {
            const results = [
                { similarity: 0.80, pattern_id: 'SQL_001', category: 'SQL_INJECTION', pattern_text: 'test' }
            ];
            const result = buildBranchResult(results, 15, false);

            expect(result.branch_id).toBe('B');
            expect(result.name).toBe('semantic');
            expect(result.score).toBe(80);
            expect(result.threat_level).toBe(ThreatLevel.HIGH);
            expect(result.confidence).toBeCloseTo(0.80, 2);
            expect(result.timing_ms).toBe(15);
            expect(result.degraded).toBe(false);
            expect(result.features.top_similarity).toBeCloseTo(0.80, 2);
            expect(result.features.embedding_model).toBe('multilingual-e5-small-int8');
            expect(result.features.top_k).toHaveLength(1);
            expect(result.explanations.length).toBeGreaterThan(0);
        });

        it('should include top_k results in features', () => {
            const results = [
                { similarity: 0.80, pattern_id: 'P1', category: 'CAT1' },
                { similarity: 0.70, pattern_id: 'P2', category: 'CAT2' },
                { similarity: 0.60, pattern_id: 'P3', category: 'CAT3' }
            ];
            const result = buildBranchResult(results, 10);

            expect(result.features.top_k).toHaveLength(3);
            expect(result.features.top_k[0].pattern_id).toBe('P1');
            expect(result.features.top_k[0].similarity).toBeCloseTo(0.80, 2);
        });

        it('should mark degraded if specified', () => {
            const result = buildBranchResult([], 5, true);
            expect(result.degraded).toBe(true);
        });

    });

    describe('buildDegradedResult', () => {

        it('should build degraded result with reason (fail-secure by default)', () => {
            const result = buildDegradedResult('ClickHouse connection failed', 100);

            expect(result.branch_id).toBe('B');
            expect(result.name).toBe('semantic');
            // Fail-secure: score=100 (BLOCK) when service is degraded
            expect(result.score).toBe(100);
            expect(result.threat_level).toBe(ThreatLevel.HIGH);
            expect(result.degraded).toBe(true);
            expect(result.timing_ms).toBe(100);
            expect(result.features.degraded_reason).toBe('ClickHouse connection failed');
            expect(result.explanations[0]).toContain('ClickHouse connection failed');
        });

        it('should build degraded result with fail-open option', () => {
            const result = buildDegradedResult('Connection timeout', 50, { failSecure: false });

            expect(result.score).toBe(0);
            expect(result.threat_level).toBe(ThreatLevel.LOW);
            expect(result.degraded).toBe(true);
        });

    });

    // ============================================================
    // buildTwoPhaseResult Tests (v2.1.0 - Two-Phase Search)
    // ============================================================
    describe('buildTwoPhaseResult', () => {

        it('should return score=0 for SAFE classification', () => {
            const twoPhaseResult = {
                classification: 'SAFE',
                attack_max_similarity: 0.75,
                safe_max_similarity: 0.85,
                delta: -0.10,
                confidence: 0.8,
                attack_matches: [{ pattern_id: 'A1', category: 'SQL_INJECTION', similarity: 0.75 }],
                safe_matches: [{ pattern_id: 'S1', category: 'CODE_SAMPLE', similarity: 0.85 }],
                delta_threshold: 0.05
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 50);

            expect(result.score).toBe(0);
            expect(result.threat_level).toBe(ThreatLevel.LOW);
            expect(result.critical_signals.two_phase_safe).toBe(true);
            expect(result.features.classification).toBe('SAFE');
        });

        it('should return score=0 for UNCERTAIN classification', () => {
            const twoPhaseResult = {
                classification: 'UNCERTAIN',
                attack_max_similarity: 0.80,
                safe_max_similarity: 0.79,
                delta: 0.01,
                confidence: 0.2,
                attack_matches: [],
                safe_matches: [],
                delta_threshold: 0.05
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 50);

            expect(result.score).toBe(0);
            expect(result.threat_level).toBe(ThreatLevel.LOW);
            expect(result.critical_signals.two_phase_uncertain).toBe(true);
        });

        it('should return score=0 for UNCERTAIN with low similarities (U1 rule)', () => {
            // U1: Both attack and safe are low - no confident match
            const twoPhaseResult = {
                classification: 'UNCERTAIN',
                attack_max_similarity: 0.72,
                safe_max_similarity: 0.70,
                delta: 0.02,
                confidence: 0.1,
                attack_matches: [{ pattern_id: 'A1', category: 'UNKNOWN', similarity: 0.72 }],
                safe_matches: [{ pattern_id: 'S1', category: 'GENERAL', similarity: 0.70 }],
                delta_threshold: 0.05
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 25);

            expect(result.score).toBe(0);
            expect(result.threat_level).toBe(ThreatLevel.LOW);
            expect(result.critical_signals.two_phase_uncertain).toBe(true);
            expect(result.critical_signals.high_similarity).toBe(false);
            expect(result.explanations).toContain('Two-Phase v2.3: UNCERTAIN (delta 2.0%)');
        });

        it('should return score=0 for UNCERTAIN with ambiguous delta (U2 rule)', () => {
            // U2: Very small delta with moderate similarities - truly ambiguous
            const twoPhaseResult = {
                classification: 'UNCERTAIN',
                attack_max_similarity: 0.78,
                safe_max_similarity: 0.77,
                delta: 0.01, // < 0.02 threshold
                confidence: 0.15,
                attack_matches: [{ pattern_id: 'A1', category: 'SQL_INJECTION', similarity: 0.78 }],
                safe_matches: [{ pattern_id: 'S1', category: 'CODE_SAMPLE', similarity: 0.77 }],
                delta_threshold: 0.05
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 30);

            expect(result.score).toBe(0);
            expect(result.threat_level).toBe(ThreatLevel.LOW);
            expect(result.critical_signals.two_phase_uncertain).toBe(true);
            expect(result.features.classification).toBe('UNCERTAIN');
            expect(result.features.two_phase_search).toBe(true);
        });

        it('should not set two_phase_safe or high_similarity for UNCERTAIN', () => {
            const twoPhaseResult = {
                classification: 'UNCERTAIN',
                attack_max_similarity: 0.76,
                safe_max_similarity: 0.78,
                delta: -0.02,
                confidence: 0.2,
                attack_matches: [],
                safe_matches: [],
                delta_threshold: 0.05
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 50);

            expect(result.critical_signals.two_phase_safe).toBeUndefined();
            expect(result.critical_signals.high_similarity).toBe(false);
            expect(result.critical_signals.two_phase_uncertain).toBe(true);
        });

        it('should return elevated score for ATTACK classification', () => {
            const twoPhaseResult = {
                classification: 'ATTACK',
                attack_max_similarity: 0.88,
                safe_max_similarity: 0.75,
                delta: 0.13,
                confidence: 0.9,
                attack_matches: [
                    { pattern_id: 'A1', category: 'JAILBREAK', similarity: 0.88 }
                ],
                safe_matches: [],
                delta_threshold: 0.05,
                safe_is_instruction_type: false
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 50);

            // ATTACK classification should result in score based on attack_max_similarity
            expect(result.score).toBeGreaterThan(0);
            expect(result.score).toBeLessThanOrEqual(100);
            expect(result.features.classification).toBe('ATTACK');
        });

        it('should reduce score when delta is small for ATTACK', () => {
            const twoPhaseResult = {
                classification: 'ATTACK',
                attack_max_similarity: 0.85,
                safe_max_similarity: 0.82,
                delta: 0.03, // Small delta
                confidence: 0.5,
                attack_matches: [{ pattern_id: 'A1', category: 'SQL_INJECTION', similarity: 0.85 }],
                safe_matches: [{ pattern_id: 'S1', category: 'CODE_SAMPLE', similarity: 0.82 }],
                delta_threshold: 0.05,
                safe_is_instruction_type: false
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 50);

            // Score should be reduced due to small delta (ambiguity)
            expect(result.score).toBeLessThan(88);
            expect(result.score).toBeGreaterThan(0);
        });

        it('should apply extra dampening for instruction-type safe matches', () => {
            const twoPhaseResult = {
                classification: 'ATTACK',
                attack_max_similarity: 0.85,
                safe_max_similarity: 0.83,
                delta: 0.02,
                confidence: 0.5,
                attack_matches: [{ pattern_id: 'A1', category: 'SQL_INJECTION', similarity: 0.85 }],
                safe_matches: [{ pattern_id: 'S1', category: 'CODE_INSTRUCTION', similarity: 0.83 }],
                delta_threshold: 0.05,
                safe_is_instruction_type: true // Educational/code context
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 50);

            // Score should be extra dampened for instruction-type matches
            expect(result.score).toBeLessThan(70);
            expect(result.features.safe_is_instruction_type).toBe(true);
        });

        it('should include classification_version in features', () => {
            const twoPhaseResult = {
                classification: 'SAFE',
                attack_max_similarity: 0.50,
                safe_max_similarity: 0.70,
                delta: -0.20,
                confidence: 0.9,
                attack_matches: [],
                safe_matches: [],
                delta_threshold: 0.05
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 50);

            expect(result.features.classification_version).toBe('2.3');
            expect(result.features.two_phase_search).toBe(true);
        });

        it('should include timing_ms in result', () => {
            const twoPhaseResult = {
                classification: 'SAFE',
                attack_max_similarity: 0.40,
                safe_max_similarity: 0.60,
                delta: -0.20,
                confidence: 0.8,
                attack_matches: [],
                safe_matches: [],
                delta_threshold: 0.05
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 123);

            expect(result.timing_ms).toBe(123);
        });

        it('should mark degraded if specified', () => {
            const twoPhaseResult = {
                classification: 'SAFE',
                attack_max_similarity: 0.40,
                safe_max_similarity: 0.60,
                delta: -0.20,
                confidence: 0.8,
                attack_matches: [],
                safe_matches: [],
                delta_threshold: 0.05
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 50, true);

            expect(result.degraded).toBe(true);
        });

        it('should have branch_id B for semantic service', () => {
            const twoPhaseResult = {
                classification: 'SAFE',
                attack_max_similarity: 0.40,
                safe_max_similarity: 0.60,
                delta: -0.20,
                confidence: 0.8,
                attack_matches: [],
                safe_matches: [],
                delta_threshold: 0.05
            };
            const result = buildTwoPhaseResult(twoPhaseResult, 50);

            expect(result.branch_id).toBe('B');
            expect(result.name).toBe('semantic');
        });

    });

});
