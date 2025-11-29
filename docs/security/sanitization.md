# Sanitization

Last updated: 2025-11-26

## Policy
- Arbiter decides ALLOW/BLOCK (BLOCK threshold 50). Sanitization applies to PII after ALLOW.
- `sanitization.light` and `sanitization.heavy` in `unified_config.json` define regexes for jailbreak/instruction removal.
- `block_message` in enforcement is returned on BLOCK (skipping PII).

## Redaction tokens
- Light: `[removed]`
- Heavy: `[REDACTED]`, `max_removal_percent` default 60.

## Example patterns (light/heavy)
- ignore/forget/override instructions, “you are now…”, format in markdown/json/yaml, godmode/dan/love pliny, etc.

## Pipeline behavior
- BLOCK: PII is skipped, immediate response.
- ALLOW: PII_Redactor_v2 redacts PII, inserts tokens, sets `_pii_sanitized`, `pii_classification`.

## Enforcement settings
- `dry_run`: log only, no block.
- `audit_log`: store fields from `audit_fields`.
- `block_message`: text returned on BLOCK (and logged).
