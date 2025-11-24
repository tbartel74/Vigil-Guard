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
            expect(result.features.embedding_model).toBe('all-MiniLM-L6-v2-int8');
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

        it('should build degraded result with reason', () => {
            const result = buildDegradedResult('ClickHouse connection failed', 100);

            expect(result.branch_id).toBe('B');
            expect(result.name).toBe('semantic');
            expect(result.score).toBe(0);
            expect(result.threat_level).toBe(ThreatLevel.LOW);
            expect(result.degraded).toBe(true);
            expect(result.timing_ms).toBe(100);
            expect(result.features.degraded_reason).toBe('ClickHouse connection failed');
            expect(result.explanations[0]).toContain('ClickHouse connection failed');
        });

    });

});
