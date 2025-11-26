# NLP Safety Analysis (Branch C)

Last updated: 2025-11-26

## Role
Threat classification with a Llama Guard-based model. Returns the unified branch contract, used by the arbiter (weight 0.35).

## Endpoint
`POST http://prompt-guard-api:8000/detect`

Typical body:
```json
{ "text": "input" }
```

## Response normalization (in workflow)
- If `is_attack=true` → `score` set to 85 (HIGH).
- Otherwise `score = round((risk_score || 0.01) * 100)`.
- `threat_level`: HIGH when is_attack, else MEDIUM if score ≥ 40, LOW otherwise.
- `critical_signals.llm_attack` = bool.

## Timeout / degradation
- Timeout 3000 ms in 3-Branch Executor. On error/timeout branch is degraded (score 0, degraded=true).

## Arbiter integration
- Boosts: CONSERVATIVE_OVERRIDE (attack + high confidence), LLM_GUARD_HIGH_CONFIDENCE, UNANIMOUS_HIGH.
- Risk policy in `prompt_guard_policy` (CRITICAL/MINIMAL) – see `docs/config/unified-config.md`.

## Tests
- Run with the pipeline (integration). Ensure endpoint returns `is_attack`, `risk_score`, `confidence`, `verdict`.
