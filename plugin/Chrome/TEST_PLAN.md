# 🧪 Vigil Guard Extension - Test Plan
**Date**: 2025-10-25
**Version**: 0.5.0
**Changes**: PR Review fixes (error handling, logging, documentation)

## 📋 Pre-Test Setup

### 1. Load Extension in Chrome
```bash
1. Open Chrome → chrome://extensions/
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Navigate to: /Users/tomaszbartel/Documents/Projects/Vigil-Guard/plugin/Chrome
5. Click "Select"
```

**Expected**: Extension loaded with icon visible, version 0.5.0

### 2. Open DevTools for Background Worker
```bash
1. On chrome://extensions/ page
2. Find "Vigil Guard AI Protection"
3. Click "service worker" link (under "Inspect views")
4. DevTools opens showing background console
```

**Keep this window open for all tests!**

---

## ✅ Test Case 1: Extension Loading & Storage Error Logging

**Purpose**: Verify chrome.storage error logging works

### Test 1.1: Normal Config Load (Baseline)
**Steps**:
1. Open background worker DevTools
2. Click extension icon (popup)
3. Check console logs

**Expected**:
```
[Vigil Guard] Message received: GET_CONFIG
```

**No errors** about storage

### Test 1.2: Storage Error Detection (Simulate)
**Steps**:
1. In DevTools console, run:
```javascript
// Simulate storage error
chrome.storage.local.get = () => Promise.reject(new Error('QuotaExceededError'));
```
2. Click extension icon again

**Expected**:
```
[Vigil Guard] Failed to retrieve config from storage: QuotaExceededError
[Vigil Guard] Error type: Error
[Vigil Guard] Storage may be corrupt or unavailable, using defaults
```

**Status**: ❌ Pass / ❌ Fail

---

## ✅ Test Case 2: extractChatMessage Error Handling

**Purpose**: Verify null return for errors, improved logging

### Test 2.1: Missing Body
**Steps**:
1. In background worker console:
```javascript
// Access the function (it's in global scope)
extractChatMessage(null)
```

**Expected**:
```
[Vigil Guard] ⚠️ No body in request
→ Returns: null
```

### Test 2.2: Truncated JSON
**Steps**:
```javascript
extractChatMessage('{"messages": [{"content":')
```

**Expected**:
```
[Vigil Guard] Failed to parse body as JSON: Unexpected end of JSON input
[Vigil Guard] Error type: SyntaxError
[Vigil Guard] Body appears truncated - this is unusual
→ Returns: null
```

### Test 2.3: Plain Text
**Steps**:
```javascript
extractChatMessage('Hello world, this is plain text')
```

**Expected**:
```
[Vigil Guard] Failed to parse body as JSON: ...
[Vigil Guard] Treating body as plain text
→ Returns: "Hello world, this is plain text"
```

### Test 2.4: Valid ChatGPT Format
**Steps**:
```javascript
extractChatMessage(JSON.stringify({
  messages: [{
    content: { parts: ['Test message from user'] }
  }]
}))
```

**Expected**:
```
[Vigil Guard] 📋 Parsed body successfully
→ Returns: "Test message from user"
```

**Status**: ❌ Pass / ❌ Fail

---

## ✅ Test Case 3: Stats Update Error Handling

**Purpose**: Distinguish "popup closed" from real errors

### Test 3.1: Normal Stats Update (Popup Closed)
**Steps**:
1. Close popup if open
2. In background worker console:
```javascript
// Trigger stats update
updateStats('blocked')
```

**Expected**:
```
// Silent - "popup not open" is ignored
// NO error logs
```

### Test 3.2: Simulate Real Error
**Steps**:
```javascript
// Mock sendMessage to return different error
const originalSendMessage = chrome.runtime.sendMessage;
chrome.runtime.sendMessage = () => Promise.reject(new Error('Extension context invalidated'));

updateStats('blocked');
```

**Expected**:
```
[Vigil Guard] Unexpected error sending stats update: Extension context invalidated
[Vigil Guard] This may indicate extension context issues
```

**Status**: ❌ Pass / ❌ Fail

---

## ✅ Test Case 4: Webhook Error Logging

**Purpose**: Comprehensive webhook error context

### Test 4.1: Webhook Timeout
**Steps**:
1. Configure webhook to slow endpoint (or use invalid)
2. In background console:
```javascript
const payload = { sessionId: "test123", chatInput: "test message" };
callWebhook("http://localhost:9999/test", payload);
```

**Expected**:
```
[Vigil Guard] 🔗 Sending POST to: http://localhost:9999/test
[Vigil Guard] 📦 Payload: {...}
[Vigil Guard] Webhook call failed: AbortError
[Vigil Guard] Error type: AbortError
[Vigil Guard] Webhook URL: http://localhost:9999/test
[Vigil Guard] Payload summary: {...}
[Vigil Guard] Request timed out after 10000ms
[Vigil Guard] Webhook may be down or unresponsive
```

### Test 4.2: Non-JSON Response
**Steps**:
1. Set webhook to URL that returns HTML
2. Run:
```javascript
callWebhook("https://example.com", {chatInput: "test"});
```

**Expected**:
```
[Vigil Guard] Webhook returned non-JSON response
[Vigil Guard] Content-Type: text/html
[Vigil Guard] Response preview: <!DOCTYPE html>...
```

### Test 4.3: HTTP Error Status
**Steps**:
```javascript
callWebhook("https://httpstat.us/500", {chatInput: "test"});
```

**Expected**:
```
[Vigil Guard] ⚠️ Webhook returned error status: 500
[Vigil Guard] Error body preview: ...
[Vigil Guard] Webhook URL: https://httpstat.us/500
```

**Status**: ❌ Pass / ❌ Fail

---

## ✅ Test Case 5: Integration Test (ChatGPT)

**Purpose**: End-to-end test with actual ChatGPT

### Setup
1. Navigate to https://chatgpt.com
2. Open background worker DevTools
3. Type test message (but don't send yet)

### Test 5.1: Normal Request Flow
**Steps**:
1. Type: "Hello, how are you?"
2. Press Enter / Click Send
3. Monitor console logs

**Expected Sequence**:
```
[Vigil Guard] Message received: FILTER_REQUEST
[Vigil Guard] 🚀 sendToVigilGuard called...
[Vigil Guard] 🔍 Raw body type: string
[Vigil Guard] 📋 Parsed body successfully
[Vigil Guard] 📝 Extracted message: "Hello, how are you?"
[Vigil Guard] 🔗 Sending POST to: [webhook URL]
[Vigil Guard] 📦 Payload: {...}
[Vigil Guard] 📨 Response status: 200
[Vigil Guard] ✅ Response data (raw): {...}
```

**No errors**

### Test 5.2: Webhook Down (Fail-Open)
**Steps**:
1. Stop Vigil Guard backend (docker-compose down)
2. Type: "Test message"
3. Press Enter

**Expected**:
```
[Vigil Guard] Webhook call failed: TypeError
[Vigil Guard] Error type: TypeError  
[Vigil Guard] Network error - check webhook URL is accessible
[Vigil Guard] Possible causes: CORS, DNS failure, network down
→ Message STILL SENT (fail-open design)
```

**Status**: ❌ Pass / ❌ Fail

---

## 📊 Test Results Summary

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1.1 Normal Config Load | ⬜ | |
| 1.2 Storage Error Detection | ⬜ | |
| 2.1 Missing Body → null | ⬜ | |
| 2.2 Truncated JSON → null | ⬜ | |
| 2.3 Plain Text → string | ⬜ | |
| 2.4 Valid ChatGPT Format | ⬜ | |
| 3.1 Stats Update (Popup Closed) | ⬜ | |
| 3.2 Stats Update (Real Error) | ⬜ | |
| 4.1 Webhook Timeout | ⬜ | |
| 4.2 Webhook Non-JSON | ⬜ | |
| 4.3 Webhook HTTP Error | ⬜ | |
| 5.1 Normal ChatGPT Flow | ⬜ | |
| 5.2 Fail-Open Behavior | ⬜ | |

**Overall**: ⬜ PASS / ⬜ FAIL

---

## 🐛 Issues Found

```
1. [Issue description]
   Location: [file:line]
   Severity: Critical/High/Medium/Low
   
2. ...
```

---

## ✅ Sign-Off

- [ ] All tests pass
- [ ] No console errors
- [ ] Fail-open behavior verified
- [ ] Error logging comprehensive
- [ ] Ready for commit

**Tester**: _________________
**Date**: _________________
