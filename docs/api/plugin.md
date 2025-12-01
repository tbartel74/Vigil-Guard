# Browser Plugin API Contract

Last updated: 2025-12-01

## Overview

The browser extension communicates with the Vigil Guard backend through a defined API contract. The workflow node `output to plugin` generates responses aligned with arbiter decisions and PII processing.

## Endpoint

```
POST /ui/api/browser-filter
```

**Authentication:** Required (via `X-Vigil-Auth` header with plugin token)

## Request Format

```json
{
  "chatInput": "User's prompt text",
  "sessionId": "browser-session-id",
  "platform": "chatgpt",
  "metadata": {
    "clientId": "vigil_1234567890_abc123",
    "browser": {
      "name": "Chrome",
      "version": "120.0.0"
    },
    "os": "Windows",
    "language": "en-US",
    "timezone": "America/New_York"
  }
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chatInput` | string | Yes | User's prompt text |
| `sessionId` | string | Yes | Browser session identifier |
| `platform` | string | No | Target platform (chatgpt, claude) |
| `metadata` | object | No | Browser metadata for analytics |
| `metadata.clientId` | string | No | Persistent client identifier |

## Response Format

### Allowed Response

```json
{
  "action": "allow",
  "chatInput": "Original user text",
  "reason": "allowed",
  "threat_score": 15,
  "sessionId": "abc123",
  "arbiter": {
    "combined_score": 15,
    "confidence": 0.95,
    "branch_scores": {
      "a": 10,
      "b": 12,
      "c": 5
    },
    "boosts_applied": []
  }
}
```

### Blocked Response

```json
{
  "action": "block",
  "chatInput": "Your request contains content that violates our usage policy.",
  "reason": "blocked",
  "threat_score": 92,
  "sessionId": "abc123",
  "arbiter": {
    "combined_score": 92,
    "confidence": 0.98,
    "branch_scores": {
      "a": 85,
      "b": 78,
      "c": 95
    },
    "boosts_applied": ["PROMPT_INJECTION_BOOST"],
    "categories": ["PROMPT_INJECTION", "INSTRUCTION_OVERRIDE"]
  }
}
```

### Sanitized Response

```json
{
  "action": "sanitize",
  "chatInput": "[removed] tell me a joke",
  "reason": "sanitized",
  "threat_score": 45,
  "sessionId": "abc123",
  "arbiter": {
    "combined_score": 45,
    "confidence": 0.82,
    "branch_scores": {
      "a": 40,
      "b": 38,
      "c": 25
    },
    "boosts_applied": []
  },
  "sanitizedBody": {
    "messages": [
      {
        "role": "user",
        "content": "[removed] tell me a joke"
      }
    ],
    "model": "gpt-4",
    "stream": true
  },
  "pii": {
    "detected": true,
    "entities": ["EMAIL_ADDRESS"],
    "count": 1
  }
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `action` | string | Action to take: `allow`, `block`, `sanitize` |
| `chatInput` | string | Text to display/send (original, sanitized, or block message) |
| `reason` | string | Human-readable reason for decision |
| `threat_score` | number | Combined threat score (0-100) |
| `sessionId` | string | Echo of request session ID |
| `arbiter` | object | Detailed arbiter decision data |
| `sanitizedBody` | object | Full sanitized payload (only when `action=sanitize`) |
| `pii` | object | PII detection summary (when PII found) |

### Arbiter Object

| Field | Type | Description |
|-------|------|-------------|
| `combined_score` | number | Weighted combination of branch scores |
| `confidence` | number | Confidence level (0-1) |
| `branch_scores` | object | Individual branch scores (a, b, c) |
| `boosts_applied` | array | List of boost policies applied |
| `categories` | array | Detected threat categories (when blocked) |

### SanitizedBody Object

When `action=sanitize`, this object contains the reconstructed payload:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Sanitized content here"
    }
  ],
  "model": "gpt-4",
  "stream": true
}
```

**Note:** The structure mirrors the original OpenAI/Anthropic API request format for seamless integration.

## Action Rules

### Block Action
- Triggered when `final_status` is `BLOCKED`
- Plugin should prevent content from being sent
- Display `chatInput` as error message to user
- Log the blocked attempt

### Sanitize Action
- Triggered when `_pii_sanitized=true` or threat sanitization applied
- `sanitizedBody` contains the reconstructed payload
- Plugin should use `sanitizedBody` instead of original content
- Show sanitization notification to user

### Allow Action
- Triggered when content passes all checks
- `chatInput` contains the original text
- Plugin should allow normal operation

## Error Responses

### Authentication Error (401)

```json
{
  "error": "unauthorized",
  "message": "Invalid or missing authentication token"
}
```

### Rate Limit Error (429)

```json
{
  "error": "rate_limited",
  "message": "Too many requests. Please wait.",
  "retry_after": 60
}
```

### Server Error (500)

```json
{
  "error": "internal_error",
  "message": "An error occurred processing your request"
}
```

## Client Implementation

### JavaScript Example

```javascript
async function filterPrompt(prompt) {
  const response = await fetch('/ui/api/browser-filter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Vigil-Auth': await getPluginToken()
    },
    body: JSON.stringify({
      chatInput: prompt,
      sessionId: getSessionId(),
      metadata: collectBrowserMetadata()
    })
  });

  const result = await response.json();

  switch (result.action) {
    case 'block':
      showBlockedMessage(result.chatInput);
      return null;
    case 'sanitize':
      showSanitizationNotice();
      return result.sanitizedBody;
    case 'allow':
    default:
      return { messages: [{ role: 'user', content: result.chatInput }] };
  }
}
```

## Fail-Open Behavior

If the API is unreachable:

1. Extension attempts connection with 5-second timeout
2. On failure, allows content to pass (fail-open)
3. Shows yellow status indicator
4. Logs connection failure locally
5. Retries on next request

## Related Documentation

- [Browser Extension Guide](../plugin/BROWSER_EXTENSION.md) - Installation and usage
- [Plugin Quick Start](../plugin/QUICK_START.md) - Getting started
- [API Reference](../API.md) - Full API documentation
