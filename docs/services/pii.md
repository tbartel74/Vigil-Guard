# PII Service (Presidio + regex fallback)

Last updated: 2025-11-26

## Role
PII redaction in two languages (pl/en) after ALLOW. Handles PII tokenization, deduplication, and audit (`_pii_sanitized`, `pii_classification`).

## Endpoint
`POST http://vigil-presidio-pii:5001/analyze` (configurable in unified_config).

## Language handling
- Dual Presidio calls (pl and en) in parallel; deduplicate entities.
- Additional language detection post-PII (logging only).

## Redaction tokens (selected)
- EMAIL, PHONE, PERSON, PL_PESEL, PL_NIP, PL_REGON, PL_ID_CARD, CREDIT_CARD, IBAN_CODE, IP_ADDRESS, URL.
- Tokens configurable in `pii_detection.redaction_tokens` (unified_config).

## Regex fallback
- If Presidio is offline or coverage is insufficient, regex rules from `pii.conf` run (with validators e.g., PESEL/NIP/REGON).
- URL rule masks links.

## Output (workflow)
- `_pii_sanitized`: bool
- `pii_classification`: `{ types[], count, method }`
- `detected_language`: language after PII (if available)
- `output_text_redacted`: prompt after redaction (replaces chatInput downstream)
