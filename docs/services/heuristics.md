# Heuristics Service (Branch A)

Last updated: 2025-11-26

## Role
Detect prompt injection/obfuscation and security attacks via multiple detectors: obfuscation, structure, whisper, entropy (lang-aware), security keywords.

## Endpoint
`POST /analyze` (default http://heuristics-service:5005/analyze)

Body:
```json
{ "text": "input", "request_id": "id-123", "lang": "pl|en|optional" }
```

Key response fields (branch_result):
- `score` 0-100, `threat_level` (LOW/MEDIUM/HIGH), `confidence`, `critical_signals`, `signals`.
- `features.entropy`: `entropy_raw`, `entropy_normalized`, `relative_entropy`, `char_class_diversity`, `bigram_anomaly_score`, `random_segments`, `perplexity_score`.
- `features.security`: counters for SQLi/XSS/command/priv-esc, `detected_patterns`, `score`.
- `timing_ms`, `degraded`.

## Detectors
- Obfuscation: zero-width, homoglyphs, mixed scripts, base64/hex, spacing anomalies.
- Structure: code fences, boundaries, newline ratio, segment variance.
- Whisper: roleplay, divider patterns, question repetition.
- Entropy: KL divergence vs EN/PL, lang-aware bigram, char-class diversity, Shannon, random segments, perplexity, repetition.
- Security keywords: regex (high/medium confidence) for SQLi, XSS, command injection, privilege escalation.

## Configuration
- File: `config/default.json`, loaded via `src/config/index.js`; ENV overrides (see `docs/config/heuristics.md`).
- Default weights: obfuscation 0.25, structure 0.20, whisper 0.25, entropy 0.15, security 0.15.
- Performance: target latency 50 ms; circuit breaker timeout 1000 ms, reset 30000 ms.

## Tests
- Unit: `npm test -- tests/unit/`
- E2E: `npm test -- tests/e2e/` (e.g., heuristics-comprehensive, security-attacks).
- Multi-language entropy: PL/EN scenarios in E2E (`heuristics-comprehensive.test.js`).
