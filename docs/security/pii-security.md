# PII Security

Last updated: 2025-11-26

## Scope
- PII redaction in two languages (pl/en) using Presidio with regex fallback.
- Audit of types (`pii_classification`) and `_pii_sanitized` flag (for logs/plugin).

## Tokens (selected)
- EMAIL, PHONE, PERSON, PL_PESEL, PL_NIP, PL_REGON, PL_ID_CARD, CREDIT_CARD, IBAN_CODE, IP_ADDRESS, URL.

## False-positive filtering
- Stopwords for PERSON, brand filtering (vigil guard, claude), very short lowercase, short all-caps LOCATION, operational metadata (dates).

## Regex fallback
- Active when Presidio is offline or missing coverage; uses `pii.conf` rules (with validators PESEL/NIP/REGON/card/IBAN).
- URL redacted via URL rule → `[URL]`.

## Logged fields
- `pii_sanitized` (UInt8), `pii_types_detected` (Array), `pii_entities_count`, `pii_classification_json` in ClickHouse `events_v2`.

## Security guidance
- Ensure `pii_detection.confidence_threshold` and timeouts match expected RPS.
- If PII must never pass, raise arbiter thresholds or add heavy sanitization.
