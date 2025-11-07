# Vigil Guard Workflow v1.7.6 – PII Regression Fixes

**Date:** 2025-11-06  \
**Scope:** Resolves task T-02 (international PII regressions) and hardens fallback redaction logic.  \
**Status:** Ready for manual import into n8n (replace v1.7.5).

## Highlights
- **Workflow upgrade:** `services/workflow/workflows/Vigil Guard v1.7.6.json` refreshes `PII_Redactor_v2` with config-driven entity routing, checksum-aware fallback, and clearer audit telemetry (`detection_mode`, `regex_validated_entities`).
- **Config refresh:** `services/workflow/config/pii.conf` and `config/unified_config.json` now describe every international identifier (URL, IBAN, US/UK/AU/CA IDs) so the workflow can stay data-driven instead of hard-coding rules.
- **Presidio validators:** `services/presidio-pii-api/app.py`, `config/recognizers.yaml`, and the new `validators/international.py` register checksum/structure validators for SSN, UK NHS/NINO, Canadian SIN, Australian TFN/Medicare, IBAN, and US passports. spaCy-based PERSON recognizers for EN/PL reduce misses on English names.
- **Test coverage:** `npm test -- pii-detection-comprehensive.test.js` now passes 63/63 after import plus container restart (`docker compose up -d --build presidio-pii-api n8n language-detector`).

## Manual Import Procedure
1. Pull latest repo changes and install dependencies if needed.
2. Stop the running n8n workflow or switch to a maintenance branch.
3. In the n8n UI choose *Import from File* and select `services/workflow/workflows/Vigil Guard v1.7.6.json`.
4. Activate the imported workflow and confirm the `PII_Redactor_v2` code node contains no hard-coded entity tables (everything should reference `config/pii.conf`).
5. Restart Presidio + workflow containers so new validators and configs take effect.
6. Run `npm test -- pii-detection-comprehensive.test.js` inside `services/workflow` to verify.

## Known Follow-Ups
- Investigate benign data that still triggers PERSON redaction in regression logs (mainly `Date_as_digits`).
- Extend test automation harness to cover additional locales once new fixtures are available.
- Keep workflow version numbers in lockstep with n8n exports to avoid ambiguity in future imports.
