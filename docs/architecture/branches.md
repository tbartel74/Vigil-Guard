# Detection branches (A/B/C)

Last updated: 2025-11-26

## Branch A – Heuristics Service
- Endpoint: `POST http://heuristics-service:5005/analyze`
- Input: `{ text, request_id, lang? }` (lang propagated from workflow; fallback en).
- Detectors: obfuscation, structure, whisper, entropy (KL + lang-aware bigram + char-class), security keywords (SQLi/XSS/command/priv-esc).
- Default weights: obfuscation 0.25, structure 0.20, whisper 0.25, entropy 0.15, security 0.15.
- Thresholds: low_max 30, medium_max 65; entropy: shannon_low 2.0, shannon_high 4.8, bigram_anomaly 0.25, relative_entropy 0.4, char_class_diversity 4.
- Output (branch_result): `score 0-100`, `threat_level`, `confidence`, `signals`, `critical_signals`, `features` (entropy/security stats), `timing_ms`, `degraded`.

## Branch B – Semantic Service
- Endpoint: `POST http://semantic-service:5006/analyze`
- Role: embedding similarity to known attacks; `high_similarity` signals can trigger arbiter boosts.
- Output: unified branch contract (score, threat_level, confidence, critical_signals, timing_ms, degraded).

## Branch C – NLP Safety Analysis
- Endpoint: `POST http://prompt-guard-api:8000/detect`
- Role: threat classification via Llama Guard-based model.
- Normalization: if `is_attack=true` → score 85 (HIGH); otherwise `score = risk_score × 100`; threat_level HIGH/MED/LOW by score.
- Output: unified branch contract (score, threat_level, confidence, `critical_signals.llm_attack`, timing_ms, degraded).

## Arbiter (v2.0.0)
- Default weights: A 0.30, B 0.35, C 0.35; BLOCK threshold 50.
- Boosts: CONSERVATIVE_OVERRIDE (C attack + high confidence), SEMANTIC_HIGH_SIMILARITY, HEURISTICS_CRITICAL, LLM_GUARD_HIGH_CONFIDENCE, UNANIMOUS_HIGH.
- Degradation: offline branch weight × degr.multiplier (0.1 default), then normalized to sum 1; all degraded → BLOCK.

## PII Redaction (after ALLOW)
- Presidio pl/en in parallel; deduplication, FP filters, regex fallback.
- Redaction tokens: EMAIL, PHONE, PERSON, PL_PESEL, PL_NIP, PL_REGON, PL_ID_CARD, CREDIT_CARD, IBAN_CODE, IP_ADDRESS, URL, etc.
- Audit flags: `_pii_sanitized`, `pii_classification` (types, count, method), `detected_language`.
