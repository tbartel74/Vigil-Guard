# Webhook Configuration Guide for Testing

## Current Webhook Configuration

**From workflow:** `Vigil_LLM_guard_v1.json`

```json
{
  "type": "n8n-nodes-base.webhook",
  "parameters": {
    "httpMethod": "POST",
    "path": "42f773e2-7ebf-42f7-a993-8be016d218e1",
    "options": {}
  },
  "webhookId": "42f773e2-7ebf-42f7-a993-8be016d218e1"
}
```

## Webhook URLs

### Test URL (Development)
```
POST http://localhost:5678/webhook-test/42f773e2-7ebf-42f7-a993-8be016d218e1
```

**Usage:**
- Only works in **test mode** (after clicking "Execute workflow" in n8n UI)
- Works for **one call only** per execution
- Useful for debugging single requests
- Shows execution on canvas in real-time

### Production URL (Active Workflow)
```
POST http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1
```

**Usage:**
- Requires workflow to be **ACTIVE** (toggle ON in n8n UI)
- Works for **unlimited calls**
- **Use this for automated tests**
- Executions visible in "Executions" list (not on canvas)

## Setup Instructions

### Step 1: Access n8n UI

```bash
# Open in browser
open http://localhost:5678
```

**Default credentials:**
- Create account on first access (if not done yet)

### Step 2: Import Workflow (if not already imported)

1. Navigate to: **Workflows** → **Add workflow** → **Import from file**
2. Select: `/Users/tomaszbartel/Documents/Projects/Vigil-Guard/services/workflow/workflows/Vigil_LLM_guard_v1.json`
3. Click **Import**

### Step 3: Activate Workflow

1. Open the imported workflow: **Vigil-Guard-v1.0**
2. **IMPORTANT:** Click the toggle switch in the **top-right corner** (OFF → ON)
3. Status should change to: **Active** (green)
4. Webhook is now registered and ready

### Step 4: Verify Webhook Registration

```bash
# Check docker logs for confirmation
docker logs vigil-n8n 2>&1 | grep -i "webhook.*registered"

# Or test the production webhook
curl -X POST http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1 \
  -H "Content-Type: application/json" \
  -d '{"text": "Test verification"}'
```

**Expected response (if active):**
- 200 OK with workflow execution result
- OR 500+ if workflow has errors (but webhook is registered!)

**Error response (if NOT active):**
- 404 with message: "The requested webhook is not registered"

## Webhook Payload Format

### Standard Test Payload

```json
{
  "text": "Your test prompt here"
}
```

### Expected Response Structure

```json
{
  "sessionId": "auto-generated-uuid",
  "action": "sendMessage",
  "chat_payload": {
    "sessionId": "auto-generated-uuid",
    "action": "sendMessage",
    "chatInput": "Content after sanitization or block message"
  },
  "sanitizer": {
    "decision": "ALLOW|SANITIZE_LIGHT|SANITIZE_HEAVY|BLOCK",
    "score": 0-100,
    "breakdown": {}
  },
  "final_decision": {
    "status": "ALLOWED|SANITIZED|BLOCKED",
    "action_taken": "ALLOW|SANITIZE|BLOCK_BY_SANITIZER|BLOCK_BY_PROMPT_GUARD"
  }
}
```

## Troubleshooting

### Issue: "Webhook is not registered"

**Cause:** Workflow is not active

**Solution:**
1. Open n8n UI: http://localhost:5678
2. Navigate to workflow: **Vigil-Guard-v1.0**
3. Toggle to **Active** (top-right corner)
4. Wait 2-3 seconds for registration
5. Retry webhook call

### Issue: "Workflow must be active for production URL"

**Cause:** Using production URL without activating workflow

**Solution:**
- Activate workflow (see above)
- OR use test URL with manual execution

### Issue: Test URL works only once

**Expected behavior:** Test webhooks in n8n work for single execution only

**Solution:**
- Use **production URL** for automated tests
- OR click "Execute workflow" before each test URL call

### Issue: n8n container not running

**Check status:**
```bash
docker ps --filter "name=vigil-n8n"
```

**Start if needed:**
```bash
docker-compose up -d vigil-n8n
```

## For Automated Testing (vitest)

**Use production URL with active workflow:**

```javascript
// tests/e2e/webhook-helper.js
export const WEBHOOK_URL = 'http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1';

export async function sendToWorkflow(text) {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
```

**Pre-test check:**

```javascript
// tests/setup.js
import { beforeAll } from 'vitest';

beforeAll(async () => {
  // Verify webhook is active
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'health-check' })
  });

  if (!response.ok) {
    throw new Error(
      'Webhook is not active! Please activate workflow in n8n UI: http://localhost:5678'
    );
  }
});
```

## Additional Notes

- **Response Mode:** Current configuration returns immediately (default)
- **Authentication:** No authentication configured (localhost only)
- **Timeout:** n8n default timeout is 2 minutes per execution
- **Rate Limiting:** No rate limiting for localhost

## Next Steps

1. ✅ Activate workflow in n8n UI
2. ✅ Verify webhook responds (run test script)
3. Create test fixtures with malicious/benign prompts
4. Write vitest E2E tests using webhook
5. Setup CI/CD with pre-test workflow activation

---

**Generated:** 2025-10-13
**Workflow File:** `services/workflow/workflows/Vigil_LLM_guard_v1.json`
**Webhook ID:** `42f773e2-7ebf-42f7-a993-8be016d218e1`
