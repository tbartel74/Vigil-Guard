# Vigil Guard Plugin - HYBRID Architecture (3-Layer Defense)

**Version:** 0.2.0
**Date:** 2025-10-23
**Architecture:** Defense in Depth (3 layers of protection)

---

## 🏗️ ARCHITECTURE OVERVIEW

```
User Prompt → [Layer 1] → [Layer 2] → [Layer 3] → Service Worker → Webhook → Decision
              Quick Filter  Validation  Deduplication
              ↓ 90% rejected
                         ↓ 5% rejected
                                      ↓ 3% duplicated
                                                 ↓ 2% reaches webhook
```

---

## 🛡️ LAYER 1: QUICK FILTER (Fail Fast)

**Location:**
- `src/inject/interceptor.js:135-159`
- `src/content/content.js:198-216` (inline fallback)

**Purpose:** Reject ~90% of requests before any processing

**Rejection criteria:**
1. ✅ **Method === 'GET'** → allow immediately
2. ✅ **No body** → allow immediately
3. ✅ **Not a chat endpoint** → allow immediately
4. ✅ **Blacklisted endpoint** (analytics/telemetry) → allow immediately

**Chat endpoints (whitelist):**
```javascript
url.includes('/conversation') ||
url.includes('/chat') ||
url.includes('/completions') ||
url.includes('/append_message')  // Claude
```

**Blacklisted endpoints** (added 2025-10-23 to prevent ChatGPT freezes):
```javascript
url.includes('/ces/v1/') ||           // Customer Event Stream (analytics)
url.includes('/ab.chatgpt.com') ||    // A/B testing
url.includes('/rgstr') ||             // Register events
url.includes('browser-intake-datadoghq.com') ||  // DataDog telemetry
url.includes('/sentinel/') ||         // Monitoring
url.includes('/telemetry')            // Generic telemetry
```

**Performance:** O(1) — instant decision, no overhead

**Logs:**
```
✅ [VG EXT] Layer 1: ✅ PASSED (POST with body to chat endpoint)
❌ [VG EXT] Layer 1: No body, skipping: /backend-api/accounts/check
⛔ [VG EXT] Layer 1: ⛔ BLACKLISTED (analytics): https://chatgpt.com/ces/v1/t
```

---

## 🔍 LAYER 2: BODY VALIDATION

**Location:**
- `src/inject/interceptor.js:181-218`
- `src/content/content.js:234-260` (inline fallback)

**Purpose:** Validate data structure and ensure it's truly a user prompt

**Validation:**
1. ✅ `body.messages` exists and is an Array
2. ✅ At least one message has `author.role === 'user'`
3. ✅ The message has `content.parts` with text

**Code:**
```javascript
const hasMessages = body && body.messages && Array.isArray(body.messages);
if (!hasMessages) return originalFetch.apply(this, args);

const hasUserContent = body.messages.some(msg =>
  msg.author?.role === 'user' &&
  msg.content?.parts &&
  msg.content.parts.length > 0
);
if (!hasUserContent) return originalFetch.apply(this, args);
```

**Performance:** O(n) where n = number of messages (typically 1–10)

**Logs:**
```
✅ [VG EXT] Layer 2: ✅ PASSED - Valid user message found
❌ [VG EXT] Layer 2: ❌ FAILED - No messages array
```

---

## 🔄 LAYER 3: DEDUPLICATION

**Location:**
- `src/content/content.js:14-57` (helpers)
- `src/content/content.js:356-412` (logic)

**Purpose:** Eliminate duplicates and pick the best request to send to the webhook

**Algorithm:**
1. Extract `conversationId` from the URL
2. Check whether the queue (Map) already has a request for that conversation
3. If it exists and is < 2s old:
   - New has body, old doesn't → REPLACE the old with the new
   - Both have body or both don't → DROP the new
4. If none exists or the old one is > 2s → ADD the new to the queue
5. Clean up stale entries (> 4s)

**Data Structure:**
```javascript
requestQueue = Map<conversationId, {
  requestId: string,
  timestamp: number,
  payload: object
}>
```

**Helper Functions:**
```javascript
extractConversationId(url):
  '/backend-api/f/conversation' → 'new-conversation'
  '/backend-api/conversation/abc-123/stream' → 'abc-123'
  '/api/append_message' → 'claude-append'

cleanupQueue(queue, window):
  Removes entries older than window * 2
```

**Performance:** O(1) lookup in Map, O(m) cleanup where m = queue size (typically 1–5)

**Logs:**
```
[Vigil Guard] Layer 3: Checking for duplicates...
[Vigil Guard] Layer 3: Conversation ID: new-conversation
✅ [Vigil Guard] Layer 3: ✅ New request, adding to queue
✅ [Vigil Guard] Layer 3: ✅ Replacing empty request with full body
⚠️ [Vigil Guard] Layer 3: ⚠️ Skipping duplicate/inferior request
[Vigil Guard] Layer 3: Queue size: 1
[Vigil Guard] Layer 3: Cleaned 3 old entries from queue
```

---

## 📊 REQUEST ID TRACKING

**Purpose:** Track a request through the entire pipeline for debugging

**Flow:**
```
Interceptor: fetch_4_1761221749384
    ↓
Content Script: requestId added to payload
    ↓
Service Worker: requestId logged in SW
    ↓
n8n Webhook: _debug.requestId in payload
```

**Locations:**
- Generated: `interceptor.js:162` — `fetch_\${++requestCounter}_\${Date.now()}`
- Added to payload: `content.js:459`
- Logged in SW: `service-worker.js:131, 247`
- Sent to webhook: `service-worker.js:220`

**Webhook Payload:**
```json
{
  "sessionId": "1761221749384",
  "chatInput": "test message from vigil guard",
  "_debug": {
    "requestId": "fetch_4_1761221749384",
    "fullBody": {...},
    "url": "https://chatgpt.com/backend-api/f/conversation",
    "method": "POST",
    "domain": "chatgpt.com",
    "timestamp": "2025-10-23T12:15:49.384Z"
  }
}
```

---

## 🧪 TESTING GUIDE

### 1. Reload the Extension

```
chrome://extensions/
→ Vigil Guard AI Protection
→ Click ⟳ (reload)
```

### 2. Open DevTools in 2 places

**A. Service Worker Console:**
```
chrome://extensions/
→ Vigil Guard AI Protection
→ "Inspect views: service worker"
→ Console tab
```

**B. ChatGPT Page Console:**
```
https://chat.openai.com
→ F12
→ Console tab
```

### 3. Send a Test Prompt

In ChatGPT, type and send: **"test vigil guard 123"**

### 4. Verify Logs — ChatGPT Console

**Expected (in order):**

```
[Vigil Guard Interceptor] Fetch request: https://chatgpt.com/backend-api/f/conversation
[VG EXT] Layer 1: ✅ PASSED (POST with body to chat endpoint)
[VG EXT] 🔍 RAW init.body: {"action":"next","messages":[...]}
[VG EXT] 📦 PARSED body: {action: 'next', messages: Array(1), ...}
[VG EXT] Layer 2: ✅ PASSED - Valid user message found
[VG EXT] 💬 MESSAGES ARRAY: [{...}]
[VG EXT] Message[0].content.parts: ["test vigil guard 123"]

[Vigil Guard] Intercepted request: {type: 'VIGIL_GUARD_INTERCEPT', ...}
[Vigil Guard] Layer 3: Checking for duplicates...
[Vigil Guard] Layer 3: Conversation ID: new-conversation
[Vigil Guard] Layer 3: ✅ New request, adding to queue
[Vigil Guard] Layer 3: Queue size: 1
[Vigil Guard] Layer 3: ✅ PASSED - Proceeding to service worker

[Vigil Guard] 📤 Sending to service worker...
[Vigil Guard] 📦 Payload being sent: {...}
[Vigil Guard] 📥 Service worker response: {action: 'allow', ...}
```

**May appear (normal):**
```
⛔ [VG EXT] Layer 1: ⛔ BLACKLISTED (analytics): .../ces/v1/t  (15+ times — that's OK!)
```

**Should NOT appear:**
```
❌ [VG EXT] Layer 1: No body, skipping
❌ [VG EXT] Layer 2: ❌ FAILED - No messages array
❌ [Vigil Guard] Layer 3: ⚠️ Skipping duplicate
```

### 5. Verify Logs — Service Worker Console

**Expected:**

```
[Vigil Guard] Message received: FILTER_REQUEST
[Vigil Guard] 🚀 sendToVigilGuard called with requestId: fetch_4_1761221749384
[Vigil Guard] 🔍 Raw body type: object
[Vigil Guard] 📋 Parsed body: {action: 'next', messages: [...]}
[Vigil Guard] 🔍 Last message: {...}
[Vigil Guard] 📝 Extracted message: test vigil guard 123

[Vigil Guard] 📍 RequestID: fetch_4_1761221749384
[Vigil Guard] 📍 Webhook URL: http://localhost:5678/webhook/...
[Vigil Guard] 📦 n8n Payload: {
  "sessionId": "...",
  "chatInput": "test vigil guard 123",
  "_debug": {
    "requestId": "fetch_4_1761221749384",
    ...
  }
}
[Vigil Guard] 🔗 Sending POST to: http://localhost:5678/webhook/...
[Vigil Guard] 📨 Response status: 200
[Vigil Guard] ✅ Response data: {action: 'allow', ...}
```

### 6. Verify n8n Webhook

**Expected (1× request, not 5×!):**

```json
{
  "sessionId": "1761221749384",
  "chatInput": "test vigil guard 123",
  "_debug": {
    "requestId": "fetch_4_1761221749384",
    "url": "https://chatgpt.com/backend-api/f/conversation",
    "method": "POST",
    "domain": "chatgpt.com"
  }
}
```

**Invocation count:** **1** (not 5!)

---

## ✅ SUCCESS CRITERIA

| Criterion | Expected Result |
|-----------|-----------------|
| **Number of webhook calls** | 1× (not 5×) |
| **chatInput in webhook** | "test vigil guard 123" |
| **_debug.url in webhook** | `.../backend-api/f/conversation` |
| **_debug.method** | "POST" |
| **_debug.requestId** | `fetch_*_*` (unique) |
| **Layer 1 pass rate** | > 0% (at least one request passed) |
| **Layer 2 pass rate** | 100% (for all that passed L1) |
| **Layer 3 dedup** | 0 duplicates |

---

## 🐛 TROUBLESHOOTING

### Problem: No "[VG EXT]" logs

**Diagnosis:** External interceptor failed to load; inline fallback is used

**Fix:**
1. Check if CSP blocks it: DevTools → Network → interceptor.js (red?)
2. Check whether inline has Layer 1+2: Search for "[VG] Layer 1:" in logs

### Problem: Webhook receives the same request 5×

**Diagnosis:** Layer 3 not working or Layer 1/2 too permissive

**Fix:**
1. Check Layer 3 logs: Do you see "Skipping duplicate"?
2. If not: Layer 1/2 are letting all requests pass
3. Verify GETs are rejected: Look for logs without a Layer 1 ✅

### Problem: chatInput = "[Could not extract message]"

**Diagnosis:** Service worker received a wrong request (no body)

**Fix:**
1. Compare requestId in SW logs vs. ChatGPT console logs
2. If different: Layer 3 sent the wrong request
3. Verify Layer 2 isn't allowing requests without messages

### Problem: Layer 3 queue size grows endlessly

**Diagnosis:** Cleanup isn't running

**Fix:**
1. Check for "Cleaned X old entries" in logs
2. If missing: cleanup interval may be too sparse
3. Add a manual cleanup every 10s via setInterval

---

## 📈 PERFORMANCE METRICS

**Expected:**
- Layer 1 rejection rate: 90-95%
- Layer 2 rejection rate: 3-5%
- Layer 3 deduplication rate: 2-3%
- Final webhook calls: 1-2% of all fetch requests

**Measured (example):**
- Total fetches: 100
- Layer 1 passed: 5 (95% rejected)
- Layer 2 passed: 4 (1 rejected)
- Layer 3 passed: 1 (3 duplicates)
- Webhook calls: **1** ✅

**Memory:**
- requestQueue size: typically 1-3 entries
- Cleanup frequency: every request + auto cleanup when > 2s old
- Max queue size: unbounded (but cleaned every 2s)

---

## 🔄 MAINTENANCE

### When ChatGPT changes an endpoint

**Example:** Instead of `/backend-api/f/conversation` it uses `/backend-api/g/conversation`

**Fix (Layer 1):**
```javascript
// src/inject/interceptor.js:150
const isChatEndpoint = (
  url.includes('/conversation') ||  // ← catches both /f/ and /g/
  url.includes('/chat') ||
  url.includes('/completions')
);
```

**No change needed!** Layer 1 uses substring matching, not exact matching.

### When ChatGPT changes the messages structure

**Example:** Instead of `messages[].content.parts` it uses `messages[].text`

**Fix (Layer 2):**
```javascript
// src/inject/interceptor.js:194-198
const hasUserContent = body.messages.some(msg =>
  msg.author?.role === 'user' && (
    (msg.content?.parts && msg.content.parts.length > 0) ||
    (msg.text && msg.text.length > 0)  // ← ADD NEW FORMAT
  )
);
```

---

## 📚 FILE REFERENCE

| File | Lines | Description |
|------|-------|-------------|
| `src/inject/interceptor.js` | 135-159 | Layer 1: Quick Filter |
| `src/inject/interceptor.js` | 181-218 | Layer 2: Body Validation |
| `src/content/content.js` | 14-57 | Layer 3: Helper functions |
| `src/content/content.js` | 356-412 | Layer 3: Deduplication logic |
| `src/content/content.js` | 198-260 | Layer 1+2: Inline fallback |
| `src/content/content.js` | 459 | RequestId tracking |
| `src/background/service-worker.js` | 131, 247 | RequestId logging |
| `src/background/service-worker.js` | 220 | RequestId in webhook payload |

---

**Status:** ✅ READY FOR TESTING  
**Next Steps:** Execute the testing guide above and verify all success criteria
