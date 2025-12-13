# Semantic Service - Two-Phase Search Algorithm

## Overview

Two-Phase Search compares input similarity to **ATTACK** patterns vs **SAFE** patterns to reduce false positives while maintaining detection accuracy.

## Algorithm

1. Generate E5 embedding for input text (384 dimensions, query prefix)
2. Search top-K in ATTACK table (pattern_embeddings_v2)
3. Search top-K in SAFE table (semantic_safe_embeddings)
4. Calculate delta = attack_max_similarity - safe_max_similarity
5. Apply classification rules (S1-S4, A1-A6, B1-B2)

## Classification Strategy

**"Confident-Only" approach**: Semantic service only signals HIGH CONFIDENCE decisions. Ambiguous cases return UNCERTAIN (score=0) and defer to other detection branches.

Key insight: Embeddings are static and cannot understand intent. The semantic branch should only claim ATTACK when very confident, letting Heuristics and LLM Guard handle ambiguous cases.

## Classification Rules

### SAFE Rules (S1-S4)

| Rule | Condition | Rationale |
|------|-----------|-----------|
| S1 | safe > attack + margin, attack < 0.85 | Clear safe winner |
| S2 | security_education, safe >= 0.92, delta < -0.07 | High-confidence education query |
| S3 | instruction-type, delta < -0.05, attack < 0.82 | Instruction pattern with negative delta |
| S4 | non-instruction, safe >= 0.88, delta < -0.01, attack < 0.85 | High safe match |

### ATTACK Rules (A1-A6)

| Rule | Condition | Rationale |
|------|-----------|-----------|
| A1 | attack >= 0.88, unless safe overwhelms | Very high attack similarity |
| A2 | attack >= 0.865 + instruction-type, exceptions | High attack with instruction-type |
| A3 | attack >= 0.85 + instruction-type + delta > -0.022 | Attack-leaning instruction match |
| A4a | attack >= 0.85 + delta > -0.02 | High attack with positive delta |
| A4b | attack >= 0.82 + instruction-type + delta > -0.02 | Good attack with instruction |
| A5 | attack >= 0.82 + delta > 0.02 | Good attack with positive delta |
| A6 | attack >= 0.78 + delta > 0.08 | Clear delta advantage |

### BORDERLINE Rules (B1-B2)

| Rule | Condition | Rationale |
|------|-----------|-----------|
| B1 | security_education, safe < 0.92, attack >= 0.82 | Low education match, decent attack |
| B2 | attack 0.78-0.85, instruction-type, delta > -0.03 | Moderate attack with instruction |

## Subcategory Handling

- **instruction-type**: programming, instruction, alpaca, code, general - lexically similar to attacks
- **security_education**: precise patterns for educational queries, requires high similarity (>0.92)

Instruction-type matches get +0.05 delta bonus to account for lexical similarity without malicious intent.

## Golden Dataset Calibration

Rules calibrated on 55 examples:
- 15 Polish attacks
- 15 English attacks
- 5 mixed language attacks
- 10 safe "tricky" inputs
- 10 edge cases

Target: 100% detection rate, 0% false positive rate.

## Version History

- v2.3: Confident-only strategy, instruction-type handling
- v2.0: Initial Two-Phase Search implementation
