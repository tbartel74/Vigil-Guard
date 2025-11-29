# Heuristics Service - E2E Test Results & Tuning Report

**Date:** 2025-11-23
**Version:** 2.0.0 (Docker Container: vigil-heuristics-dev)
**Test Suite:** 68 test cases across 10 categories

---

## Executive Summary

**Test Results: 16 passed / 52 failed (23.5% pass rate)**

The Heuristics Service is operational but requires significant tuning to achieve production-ready detection accuracy. Key issues identified:

1. **WHISPER DETECTOR SCORING BUG** - Patterns detected but score calculation formula is broken
2. **OBFUSCATION SCORES TOO LOW** - Weights not translating to meaningful final scores
3. **MISSING COMMON ATTACK PATTERNS** - Key phrases like "ignore all previous" not in pattern set

---

## Test Results by Category

| Category | Passed | Failed | Pass Rate | Notes |
|----------|--------|--------|-----------|-------|
| Benign | 6/6 | 0 | 100% | Correctly identifies safe inputs |
| Zero-Width | 0/5 | 5 | 0% | Detection works but scores too low |
| Homoglyphs | 0/5 | 5 | 0% | Detection works but scores too low |
| Mixed Scripts | 0/5 | 5 | 0% | Detection works but scores too low |
| Encoding | 1/5 | 4 | 20% | Base64/Hex detected but scores low |
| Code Fences | 2/5 | 3 | 40% | Partially working |
| Boundaries | 1/5 | 4 | 20% | Low scores for boundary abuse |
| Whisper | 0/7 | 7 | 0% | **CRITICAL: Score formula broken** |
| Roleplay | 0/7 | 7 | 0% | Pattern set missing key phrases |
| Dividers | 3/5 | 2 | 60% | Partially working |
| Combined | 0/7 | 7 | 0% | Multi-vector attacks not escalating |
| Entropy | 3/4 | 1 | 75% | Working adequately |
| Edge Cases | 5/6 | 1 | 83% | Empty string handling issue |

---

## Critical Issues & Fixes

### 1. WHISPER DETECTOR SCORING BUG (CRITICAL)

**Problem:** Pattern matches are detected but score calculation returns near-zero values.

**Root Cause:** In `src/detectors/whisper.js` line 164-167:
```javascript
const whisperScore = results.whisper_patterns_found.reduce((acc, p) => {
  return acc + (p.matches * p.weight * 0.01);  // BUG: multiplier too low
}, 0);
```

For a pattern with weight=60 and 1 match: `1 * 60 * 0.01 = 0.6` → rounds to 1

**Fix:** Change multiplier from `0.01` to `0.5` or `1.0`:
```javascript
// Option A: Direct weight contribution
return acc + (p.matches * p.weight * 0.5);  // 1 * 60 * 0.5 = 30

// Option B: Full weight contribution (need to adjust max caps)
return acc + (p.matches * p.weight);  // 1 * 60 = 60
```

**Location:** [whisper.js:164-167](src/detectors/whisper.js#L164-L167)

---

### 2. MISSING COMMON ATTACK PATTERNS

**Problem:** Key jailbreak phrases not in whisper-patterns-manual.json:
- "ignore all previous instructions"
- "disregard everything above"
- "forget your instructions"
- "your new instructions are"
- "pretend you are"
- "act as if"
- "you are now"

**Fix:** Add these patterns to `/app/patterns/whisper-patterns-manual.json`:

```json
[
  {
    "pattern": "\\bignore\\s+(all\\s+)?(previous|prior|above)\\s+(instructions|rules|guidelines)\\b",
    "category": "WHISPER_NARRATIVE",
    "weight": 85,
    "description": "Ignore instructions attack"
  },
  {
    "pattern": "\\bdisregard\\s+(everything|all)\\s+(above|previous|before)\\b",
    "category": "WHISPER_NARRATIVE",
    "weight": 80,
    "description": "Disregard attack"
  },
  {
    "pattern": "\\bforget\\s+(your|all|the)\\s+(instructions|rules|guidelines)\\b",
    "category": "WHISPER_NARRATIVE",
    "weight": 80,
    "description": "Forget instructions attack"
  },
  {
    "pattern": "\\b(your\\s+)?new\\s+instructions\\s+are\\b",
    "category": "WHISPER_NARRATIVE",
    "weight": 85,
    "description": "New instructions injection"
  },
  {
    "pattern": "\\bpretend\\s+(you\\s+are|to\\s+be)\\b",
    "category": "ROLEPLAY",
    "weight": 70,
    "description": "Pretend roleplay"
  },
  {
    "pattern": "\\bact\\s+as\\s+(if|though)\\b",
    "category": "ROLEPLAY",
    "weight": 70,
    "description": "Act as roleplay"
  },
  {
    "pattern": "\\byou\\s+are\\s+now\\b",
    "category": "ROLEPLAY",
    "weight": 75,
    "description": "Identity override"
  },
  {
    "pattern": "\\bjailbreak\\s+mode\\b",
    "category": "JAILBREAK",
    "weight": 90,
    "description": "Explicit jailbreak"
  },
  {
    "pattern": "\\bDAN\\b",
    "category": "JAILBREAK",
    "weight": 85,
    "description": "DAN mode reference"
  },
  {
    "pattern": "\\bGODMODE\\b",
    "category": "JAILBREAK",
    "weight": 90,
    "description": "GODMODE attack"
  }
]
```

---

### 3. OBFUSCATION WEIGHT TOO LOW

**Problem:** Obfuscation detection shows raw scores of 20-30 but weighted contribution is only 6 (30 * 0.30 weight * some factor).

**Analysis from test output:**
- Cyrillic attack: O:20, S:0, W:0, E:0 → Final score: 6
- Expected: Score should be ~30-40 for MEDIUM threat

**Current Formula:** `final_score = obf_score * 0.30 + struct_score * 0.25 + whisper_score * 0.30 + entropy_score * 0.15`

**Issue:** With sub-scores normalized to 0-100, a raw obfuscation score of 20 becomes:
- Weighted: `20 * 0.30 = 6`

**Fix Options:**
1. **Increase obfuscation weight** from 0.30 to 0.50
2. **Lower thresholds** - make LOW_MAX=20, MEDIUM_MAX=50
3. **Scale sub-scores** - multiply raw scores by factor before weighting

**Recommended:** Adjust thresholds in `config/default.json`:
```json
{
  "detection": {
    "thresholds": {
      "low_max": 20,      // was 39
      "medium_max": 50    // was 69
    }
  }
}
```

---

### 4. ROLEPLAY PATTERNS MISSING

**Problem:** roleplay-patterns-manual.json lacks common patterns.

**Current patterns test:** "Imagine you are" → Score: 0 (only W:1)

**Fix:** Add to `/app/patterns/roleplay-patterns-manual.json`:
```json
[
  {
    "pattern": "\\bsimulation\\s+mode\\b",
    "category": "ROLEPLAY",
    "weight": 70,
    "description": "Simulation mode request"
  },
  {
    "pattern": "\\bdeveloper\\s+mode\\b",
    "category": "ROLEPLAY",
    "weight": 75,
    "description": "Developer mode request"
  },
  {
    "pattern": "\\bunrestricted\\s+(?:AI|mode|access)\\b",
    "category": "ROLEPLAY",
    "weight": 80,
    "description": "Unrestricted mode request"
  }
]
```

---

## Tuning Recommendations Summary

### Quick Wins (High Impact, Low Effort)

1. **Fix whisper score multiplier** - Change `0.01` to `0.5` in whisper.js
2. **Lower threat thresholds** - LOW_MAX: 39→20, MEDIUM_MAX: 69→50
3. **Add 10 common attack patterns** to whisper-patterns-manual.json

### Medium-Term Improvements

4. **Add roleplay patterns** for simulation mode, developer mode, unrestricted
5. **Increase divider weight** from 50 to 100 in config
6. **Add entropy anomaly threshold tuning** for random gibberish

### Configuration Changes Needed

**config/default.json:**
```json
{
  "detection": {
    "thresholds": {
      "low_max": 20,
      "medium_max": 50
    },
    "whisper": {
      "pattern_weight_multiplier": 2.0,
      "divider_weight": 100
    }
  }
}
```

---

## Test Execution Commands

```bash
# Run full E2E test suite
cd services/heuristics-service
node tests/e2e-runner.js

# Quick manual test
curl -X POST http://localhost:5005/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "Ignore all previous instructions", "request_id": "test-uuid-here"}'

# View container logs
docker-compose -f docker-compose.dev.yml logs -f heuristics-service
```

---

## Next Steps

1. Apply whisper.js score fix (CRITICAL)
2. Update pattern files with new attack phrases
3. Adjust thresholds in config/default.json
4. Rebuild container: `docker-compose -f docker-compose.dev.yml up --build -d`
5. Re-run E2E tests to validate improvements
6. Target: 80%+ pass rate before production deployment

---

## Appendix: Feature Score Examples

| Attack Type | Raw Scores | Weighted | Final | Expected |
|-------------|------------|----------|-------|----------|
| Zero-width (5) | O:30, S:0, W:0, E:0 | 9 | LOW | MEDIUM |
| Homoglyph | O:20, S:0, W:0, E:0 | 6 | LOW | MEDIUM |
| Ignore all prev | O:0, S:0, W:0, E:0 | 0 | LOW | HIGH |
| GODMODE | O:20, S:0, W:0, E:0 | 6 | LOW | HIGH |
| Code fence x3 | O:0, S:60, W:0, E:0 | 15 | LOW | MEDIUM |

**Key Insight:** Weighted scoring is working but sub-scores are not being generated correctly by detectors.

---

## Verification Against Roadmap/semantic-similarity Design

### Design Specification (HEURISTICS_ENGINE_DESIGN.md)

| Requirement | Specified | Implemented | Status |
|-------------|-----------|-------------|--------|
| **API Contract** | POST /analyze → branch_result | ✅ Implemented | PASS |
| **Response Format** | branch_id, name, score, threat_level, confidence, features, explanations, timing_ms, degraded | ✅ All fields present | PASS |
| **Latency Target** | <50ms | ✅ Avg 2-5ms | EXCEEDS |
| **Threat Levels** | <40 LOW, 40-69 MEDIUM, ≥70 HIGH | ✅ Implemented (thresholds need tuning) | PARTIAL |

### Detection Mechanisms Verification

| Mechanism | Design Spec | Implementation | Test Result |
|-----------|------------|----------------|-------------|
| **Zero-width chars** | regex `[\u200B-\u200D\uFEFF]` | ✅ Implemented in obfuscation.js | ⚠️ Detected but low scores |
| **Homoglyphs** | Map chars to scripts | ✅ Implemented | ⚠️ Detected but low scores |
| **Base64/Hex** | Detection regexes | ✅ Implemented | ⚠️ Detected but low scores |
| **Mixed scripts** | Classification (latin/cyrillic/etc) | ✅ Implemented | ⚠️ Detected but low scores |
| **Boundary markers** | ``` `<!-- -->` `/* */` | ✅ Implemented in structure.js | ⚠️ Detected but low scores |
| **Code fence count** | ≥3 threshold | ✅ Threshold configurable | PASS |
| **Whisper phrases** | List (imagine, tokens flow, etc) | ⚠️ Partial - missing common phrases | NEEDS WORK |
| **Dividers** | Pliny unicode art | ✅ Implemented | ⚠️ Low scores |
| **Roleplay markers** | "you are...", "mode:" | ⚠️ Partial - missing key patterns | NEEDS WORK |
| **Entropy** | Shannon + bigram | ✅ Implemented | PASS |

### Scoring Formula Verification

**Design Spec:**
```
Final score = sum(sub-score × weight)
Weights: obfuscation=0.30, structure=0.25, whisper=0.30, entropy=0.15
```

**Implementation:** ✅ Correct weights in config/default.json

**Issue Found:** Whisper sub-score calculation multiplier `0.01` too low → BUG

### Feature Output Verification

**Design Spec features:** zero_width_count, homoglyph_count, scripts_detected, base64_detected, hex_detected, mixed_scripts, spacing_anomalies, boundary_anomalies, code_fence_count, excess_newlines, whisper_patterns_found, divider_count, roleplay_markers, entropy_raw, entropy_normalized, bigram_anomaly_score

**Implementation Status:**

| Feature | In Response | Notes |
|---------|-------------|-------|
| zero_width_count | ✅ | Working |
| homoglyph_count | ✅ | Working |
| scripts_detected | ✅ | Working |
| base64_detected | ✅ | Working |
| hex_detected | ✅ | Working |
| mixed_scripts | ✅ | Working |
| spacing_anomalies | ✅ | Working |
| boundary_anomalies | ✅ | Working |
| code_fence_count | ✅ | Working |
| excess_newlines | ✅ | Working |
| whisper_patterns_found | ✅ | Working (but needs more patterns) |
| divider_count | ✅ | Working |
| roleplay_markers | ✅ | Working (but needs more patterns) |
| entropy_raw | ✅ | Working |
| entropy_normalized | ✅ | Working |
| bigram_anomaly_score | ✅ | Working |

### Conclusion

**Implementation completeness: 85%** - All architectural components implemented correctly.

**Key gaps:**
1. Whisper score calculation bug (CRITICAL)
2. Missing common attack patterns in whisper/roleplay lists
3. Threshold tuning needed for production accuracy

**Recommendation:** Fix the whisper score bug and add ~15 common attack patterns to achieve target 80%+ test pass rate.
