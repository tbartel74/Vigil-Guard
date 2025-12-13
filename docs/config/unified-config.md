# unified_config.json – guide

Last updated: 2025-12-12

File: `services/workflow/config/unified_config.json`. Used by workflow v2.1.0 as the central configuration for pipeline, sanitization, PII, and arbiter.

## Key sections
- `version` – config version.
- `normalization` – Unicode form (NFKC), max_iterations, remove zero-width, collapse whitespace, homoglyph/leet maps.
- `sanitization.light/heavy` – regexes for jailbreak removal, redaction tokens, max_removal_percent, policy.
- `whitelist` – domains/patterns to allow.
- `enforcement` – `dry_run`, `audit_log`, `block_message`, `audit_fields`.
- `performance` – `timeout_ms`, `max_input_length`, `cache_ttl_ms`.
- `bloom`/`prefilter` – prefilter parameters (independent of branches A/B/C).
- `pii_detection` – Presidio provider, URL, timeouts, languages (pl/en), redaction tokens (incl. URL), fallback_to_regex, context_enhancement, confidence_threshold.
- `arbiter` – weights heuristics/semantic/llm_guard, thresholds block/confidence_min, priority_boosts, degradation, final_status_logic.
- `prompt_guard_policy` – risk policy for LLM Safety Engine (CRITICAL/MINIMAL).

## Minimal example (shortened)
```json
{
  "version": "5.0.0",
  "normalization": { "unicode_form": "NFKC", "remove_zero_width": true },
  "sanitization": {
    "light": { "remove_patterns": ["..."], "redact_token": "[removed]" },
    "heavy": { "remove_patterns": ["..."], "redact_token": "[REDACTED]", "max_removal_percent": 60 }
  },
  "enforcement": { "dry_run": false, "block_message": "Content blocked by security policy." },
  "pii_detection": {
    "enabled": true,
    "api_url": "http://vigil-presidio-pii:5001/analyze",
    "language_detector_url": "http://vigil-language-detector:5002/detect",
    "redaction_tokens": { "URL": "[URL]" }
  },
  "arbiter": {
    "version": "2.1.0",
    "weights": { "heuristics": 0.3, "semantic": 0.40, "llm_guard": 0.30 },
    "thresholds": { "block_score": 50 },
    "priority_boosts": {
      "CONSERVATIVE_OVERRIDE": { "min_score": 70, "exception": { "enabled": true } },
      "SEMANTIC_CORROBORATION": { "enabled": true, "new_score": 45 },
      "LLM_GUARD_VETO": { "threshold": 90, "requires_corroboration": true }
    },
    "degraded_weights": { "heuristics": 0.5, "semantic": 0.5, "llm_guard": 0 }
  },
  "prompt_guard_policy": { "enabled": true }
}
```

## Workflow usage
- Validation: uses `validation.max_input_length` (field in `performance` or `validation` if present).
- Arbiter: weights/thresholds/boosts from `arbiter.*`; decision ALLOW/BLOCK → PII/Block.
- PII: uses `pii_detection.*`; if API offline, regex fallback (`pii.conf` rules).
- Logging: `config_version` from `version` field is stored in ClickHouse.
