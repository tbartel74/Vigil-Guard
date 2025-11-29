# Branch A Configuration (Heuristics)

Last updated: 2025-11-26

Files: `services/heuristics-service/config/default.json`, `src/config/index.js`. Key parameters and environment variables below.

## Weights and thresholds
- `detection.weights`: obfuscation 0.25, structure 0.20, whisper 0.25, entropy 0.15, security 0.15.
- `detection.thresholds`: `low_max` 30, `medium_max` 65.

## Entropy (language-aware)
- `shannon_threshold_high`: 4.8
- `shannon_threshold_low`: 2.0
- `bigram_anomaly_threshold`: 0.25
- `relative_entropy_threshold`: 0.4
- `char_class_diversity_threshold`: 4
- `bigram_language_detection`: true
- `bigram_fallback_language`: "en"
- `bigram_sets.en/pl`: lists of 30 bigrams, `min_frequency_threshold` 0.001

## Security keywords
- Thresholds: `sql_injection_threshold`, `xss_threshold`, `command_injection_threshold` = 1, `privilege_escalation_threshold` = 2 (defaults).
- Patterns in `patterns/security-keywords.json` (SQLi/XSS/command/priv-esc).

## Performance
- `target_latency_ms`: 50
- Circuit breaker: `enabled` true, `timeout_ms` 1000, `reset_ms` 30000.

## Environment variables (selected)
- `WEIGHT_OBFUSCATION`, `WEIGHT_STRUCTURE`, `WEIGHT_WHISPER`, `WEIGHT_ENTROPY`, `WEIGHT_SECURITY`
- `THRESHOLD_LOW_MAX`, `THRESHOLD_MEDIUM_MAX`
- `ENTROPY_HIGH_THRESHOLD`, `ENTROPY_LOW_THRESHOLD`, `ENTROPY_BIGRAM_ANOMALY_THRESHOLD`
- `BIGRAM_LANGUAGE_DETECTION`, `BIGRAM_FALLBACK_LANGUAGE`
- `TARGET_LATENCY_MS`, `CIRCUIT_BREAKER_ENABLED`, `CIRCUIT_BREAKER_TIMEOUT_MS`, `CIRCUIT_BREAKER_RESET_MS`

## API contract (summary)
`POST /analyze` body `{ text, request_id, lang? }`  
Response (branch_result): `score`, `threat_level`, `confidence`, `critical_signals`, `signals`, `features` (entropy/security stats), `timing_ms`, `degraded`.

## Tuning tips
- Increase `relative_entropy_threshold` if too many false positives on natural text.
- Disable `bigram_language_detection=false` only as a fallback (will raise FPs for PL).
- Raise security thresholds if traffic is noisy/technical; lower if SQLi/XSS coverage is insufficient.
