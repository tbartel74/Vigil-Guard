# Browser plugin contract

Last updated: 2025-11-26

Workflow node `output to plugin` returns JSON for the browser extension aligned with arbiter and PII decisions.

## Response
```json
{
  "action": "allow|block|sanitize",
  "chatInput": "text (after PII or block message)",
  "reason": "allowed|blocked|sanitized",
  "threat_score": 42,
  "sessionId": "abc",
  "arbiter": {
    "combined_score": 42,
    "confidence": 0.71,
    "boosts_applied": ["..."]
  },
  "sanitizedBody": { ... } // only when action=sanitize
}
```

## Rules
- `action=block` when final_status is BLOCKED; plugin should stop content.
- `action=sanitize` when `_pii_sanitized=true`; `sanitizedBody` contains reconstructed payload (full metadata if available, minimal fallback otherwise).
- `action=allow` otherwise; `chatInput` is the final text.

## Helpful details
- `sessionId` comes from `chat_payload.sessionId`.
- `threat_score` mirrors arbiter combined_score stored in ClickHouse.
- `sanitizedBody` is built from the original webhook body when available; minimal fallback has one message with the filtered text.
