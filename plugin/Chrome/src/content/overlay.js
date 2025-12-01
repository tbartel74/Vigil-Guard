/**
 * Vigil Guard - Overlay Proxy Architecture
 * Version: 0.5.0 - Service Worker Keep-Alive (ChatGPT Only)
 *
 * ⚠️ FROZEN: Claude.ai support disabled (work in progress)
 * ✅ ACTIVE: ChatGPT protection fully functional
 *
 * Simple approach - intercept submit, send to Guard, inject cleaned text
 *
 * Architecture:
 * 1. Content script intercepts Enter key + Button clicks + PASTE (CAPTURE + BUBBLE phase)
 * 2. NETWORK INTERCEPT: intercept fetch() calls to ChatGPT API (v0.4.0)
 * 3. Sends message to service worker (CSP prevention)
 * 4. Service worker fetches n8n webhook
 * 5. Returns response to content script
 * 6. Content script decides: allow/sanitize/block
 * 7. MutationObserver watches textarea/button replacements → NO-OP (handlers immortal)
 *
 * CRITICAL FIX (v0.5.0):
 * - Service Worker Keep-Alive: Use chrome.runtime.connect() to maintain persistent connection
 * - Auto-reconnect: If SW dies, attempt to reconnect before showing error
 * - Companion change in service-worker.js: chrome.alarms API keeps SW alive
 *
 * STATUS (v0.4.0 - CURRENT):
 * ✅ ChatGPT: FULLY WORKING
 *   - Enter key intercept (CAPTURE + BUBBLE phase)
 *   - Send button intercept (event delegation on document)
 *   - Paste event intercept (prevents auto-submit)
 *   - Network layer intercept (fetch() override for ChatGPT API)
 *   - Service Worker death detection
 *
 * ⚠️ Claude.ai: FROZEN (auto-submit race condition)
 *   - Issue: Claude uses debounced auto-submit (~200ms after last keystroke)
 *   - Enter handler was TOO LATE - textarea already empty
 *   - Network intercept attempted but API format unclear
 *   - Code preserved but disabled (if false && ...)
 *   - TODO: Resume development in future session
 *
 * Previous fixes (v0.3.9):
 * - FIX SERVICE WORKER INVALIDATION: Detect "Extension context invalidated" error
 * - Show user-friendly message to reload extension when SW dies
 * - INTERCEPT PASTE EVENTS: Claude/ChatGPT auto-submit pasted content before Enter!
 * - Check pasted content immediately, prevent auto-submit if malicious
 *
 * Previous fixes (v0.3.8):
 * - FIX CLAUDE.AI ENTER KEY: Check ProseMirror class instead of contentEditable
 * - Claude.ai dynamically changes contentEditable from "true" to "false" when Enter pressed
 * - Our handler was checking contentEditable === 'true' → always false for Enter key!
 * - Now checking classList.contains('ProseMirror') OR contentEditable === 'true'
 *
 * Previous fixes (v0.3.7):
 * - IMMORTAL HANDLERS: Attach to `document` instead of `document.body`
 * - IDEMPOTENT SETUP: Only attach handlers once, never cleanup/reattach
 * - ZERO GAP: Handlers ALWAYS active, no teardown during DOM mutations
 * - FIX RACE CONDITION: Claude's submit mutations no longer orphan handlers
 * - setupInterception() is now idempotent - safe to call multiple times
 *
 * Previous fixes (v0.3.6):
 * - BUTTON EVENT DELEGATION: Attach click handlers to document.body for ALL buttons
 * - Intercepts ALL button clicks and checks if it's a submit/send button
 * - Fixes bug where clicking Send button bypassed Vigil Guard completely
 * - Claude.ai's Send button selector changed → findSendButton() was returning null
 *
 * Previous fixes (v0.3.5):
 * - EVENT DELEGATION for Enter key: Attach to document.body instead of specific textarea
 * - Claude.ai has MULTIPLE ProseMirror divs → querySelector finds wrong one
 * - Event delegation catches ALL keydown events and filters by contentEditable
 *
 * CRITICAL FIXES (v0.3.4):
 * - Enhanced debug logging: logs ALL Enter key presses (not just processed ones)
 * - Button click handler logging to detect manual clicks
 * - Element change tracking (shows if textarea/button DOM changed)
 * - Platform-aware messages (dynamically shows "ChatGPT" or "Claude.ai")
 * - Improved blocking logs (clearer console output for debugging)
 *
 * CRITICAL FIXES (v0.3.3):
 * - Rate limiting: 500ms minimum between webhook calls (prevent n8n overload)
 * - Debounced MutationObserver: 100ms debounce on setupInterception (prevent spam)
 * - Cleaned up debug logs (reduced console noise)
 *
 * Supported platforms:
 * - ChatGPT: <div contenteditable="true" id="prompt-textarea"> (ProseMirror)
 * - Claude.ai: <div class="ProseMirror" contenteditable="true"> (ProseMirror)
 *
 * NOTE: Both use contenteditable div, so we use .textContent instead of .value
 */

console.log('[Vigil Guard] Overlay proxy initializing (v0.5.0)...');

// =============================================================================
// SERVICE WORKER CONNECTION (v0.5.0)
// =============================================================================
// Use persistent port connection to keep service worker alive.
// This prevents "Extension context invalidated" errors.

let serviceWorkerPort = null;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 500;

/**
 * Establish persistent connection to service worker
 * This keeps the SW alive as long as the tab is open
 */
function connectToServiceWorker() {
  try {
    serviceWorkerPort = chrome.runtime.connect({ name: 'vigil-guard-content' });

    serviceWorkerPort.onDisconnect.addListener(() => {
      console.log('[Vigil Guard] 📡 Service worker connection lost');
      serviceWorkerPort = null;

      // The SW might have been terminated - it will restart on next message
      // We don't auto-reconnect here to avoid infinite loops
    });

    console.log('[Vigil Guard] 📡 Connected to service worker (keep-alive active)');
    connectionAttempts = 0; // Reset counter on successful connection
    return true;
  } catch (error) {
    console.error('[Vigil Guard] 📡 Failed to connect to service worker:', error);
    serviceWorkerPort = null;
    return false;
  }
}

/**
 * Attempt to reconnect to service worker
 * Used when sendMessage fails with "Extension context invalidated"
 */
async function attemptReconnect() {
  if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[Vigil Guard] 📡 Max reconnection attempts reached');
    return false;
  }

  connectionAttempts++;
  console.log(`[Vigil Guard] 📡 Reconnection attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

  // Wait a bit before reconnecting
  await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));

  return connectToServiceWorker();
}

// Initial connection
connectToServiceWorker();

// =============================================================================
// DEFENSE LAYER 5: NETWORK INTERCEPT (v0.4.0)
// =============================================================================
// This is the ULTIMATE defense - intercepts fetch() calls BEFORE they leave browser
// Claude.ai/ChatGPT use auto-submit with debouncing - our Enter handler is too late!
// We intercept outgoing API requests and check prompts before they reach the server.

const ORIGINAL_FETCH = window.fetch;
let pendingNetworkChecks = new Set(); // Track in-flight checks to prevent duplicates

window.fetch = async function(...args) {
  const [url, options] = args;
  const urlStr = url.toString();

  // ⚠️ FROZEN: Claude.ai intercept disabled (v0.4.0 - work in progress)
  // TODO: Resume Claude.ai development in future session
  // Reason: Auto-submit race condition not fully solved yet
  if (false && urlStr.includes('claude.ai/api') && urlStr.includes('completion')) {
    console.log('[Vigil Guard] 🌐 NETWORK INTERCEPT: Claude API completion request detected (FROZEN)');

    try {
      // Extract prompt from request body
      const body = options?.body;
      let promptText = null;

      if (body) {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        const bodyObj = JSON.parse(bodyStr);

        // Claude API format: {"prompt": "...", ...}
        promptText = bodyObj.prompt;

        if (promptText && promptText.trim()) {
          console.log('[Vigil Guard] 🌐 Extracted prompt:', promptText.substring(0, 100) + '...');

          // Check if we're already checking this exact prompt (prevent duplicates)
          if (pendingNetworkChecks.has(promptText)) {
            console.log('[Vigil Guard] 🌐 ⏭️ Duplicate check in progress, allowing original request');
            return ORIGINAL_FETCH.apply(this, args);
          }

          // Mark as checking
          pendingNetworkChecks.add(promptText);

          try {
            // Check with Vigil Guard
            const decision = await checkWithGuard(promptText);

            if (decision.action === 'block') {
              console.log('[Vigil Guard] 🌐 🚫 BLOCKED by network intercept:', decision.reason);
              updateStatus('block', `Blocked: ${decision.reason || 'threat detected'}`);

              // Reject the request
              pendingNetworkChecks.delete(promptText);
              throw new Error('⛔ Vigil Guard: Request blocked - ' + (decision.reason || 'Potential security threat detected'));

            } else if (decision.action === 'sanitize') {
              console.log('[Vigil Guard] 🌐 🧹 SANITIZED by network intercept');
              updateStatus('sanitize', `Sanitized: ${decision.reason || 'cleaned'}`);

              // PRIORITY 1: Use structured sanitizedBody if available (v1.7.0+)
              if (decision.sanitizedBody) {
                console.log('[Vigil Guard] ✅ Using sanitizedBody from workflow (Claude)');
                const newOptions = { ...options, body: JSON.stringify(decision.sanitizedBody) };
                pendingNetworkChecks.delete(promptText);
                return ORIGINAL_FETCH.apply(this, [url, newOptions]);
              }

              // PRIORITY 2: Construct from chatInput (fallback)
              console.warn('[Vigil Guard] ⚠️ sanitizedBody missing, using chatInput fallback (Claude)');
              const sanitizedText = decision.chatInput || decision.cleaned_prompt || '[Content sanitized by Vigil Guard]';
              const newBody = { ...bodyObj, prompt: sanitizedText };
              const newOptions = {
                ...options,
                body: JSON.stringify(newBody)
              };

              pendingNetworkChecks.delete(promptText);
              return ORIGINAL_FETCH.apply(this, [url, newOptions]);

            } else {
              // ALLOW - proceed with original request
              console.log('[Vigil Guard] 🌐 ✅ ALLOWED by network intercept');
              updateStatus('allow', 'Allowed - safe content');
              pendingNetworkChecks.delete(promptText);
              return ORIGINAL_FETCH.apply(this, args);
            }
          } catch (error) {
            console.error('[Vigil Guard] 🌐 ❌ Network intercept error:', error);
            pendingNetworkChecks.delete(promptText);

            // Fail open - allow the request if VG check fails
            return ORIGINAL_FETCH.apply(this, args);
          }
        }
      }
    } catch (parseError) {
      console.error('[Vigil Guard] 🌐 ⚠️ Failed to parse request body:', parseError);
    }
  }

  // ChatGPT API intercept (similar logic for OpenAI API)
  if ((urlStr.includes('chatgpt.com') || urlStr.includes('api.openai.com')) &&
      (urlStr.includes('conversation') || urlStr.includes('completions'))) {
    console.log('[Vigil Guard] 🌐 NETWORK INTERCEPT: ChatGPT API request detected');

    try {
      const body = options?.body;
      let promptText = null;

      if (body) {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        const bodyObj = JSON.parse(bodyStr);

        // ChatGPT API format: {"messages": [{"content": "..."}]}
        if (bodyObj.messages && Array.isArray(bodyObj.messages)) {
          const lastMessage = bodyObj.messages[bodyObj.messages.length - 1];
          promptText = lastMessage?.content || lastMessage?.text;
        } else if (bodyObj.prompt) {
          promptText = bodyObj.prompt;
        }

        if (promptText && promptText.trim()) {
          console.log('[Vigil Guard] 🌐 Extracted ChatGPT prompt:', promptText.substring(0, 100) + '...');

          // Same intercept logic as Claude
          if (pendingNetworkChecks.has(promptText)) {
            console.log('[Vigil Guard] 🌐 ⏭️ Duplicate check in progress');
            return ORIGINAL_FETCH.apply(this, args);
          }

          pendingNetworkChecks.add(promptText);

          try {
            const decision = await checkWithGuard(promptText);

            if (decision.action === 'block') {
              console.log('[Vigil Guard] 🌐 🚫 BLOCKED ChatGPT request');
              updateStatus('block', `Blocked: ${decision.reason || 'threat detected'}`);
              pendingNetworkChecks.delete(promptText);
              throw new Error('⛔ Vigil Guard: Request blocked - ' + (decision.reason || 'Potential security threat'));

            } else if (decision.action === 'sanitize') {
              console.log('[Vigil Guard] 🌐 🧹 SANITIZED ChatGPT request');

              // PRIORITY 1: Use structured sanitizedBody if available (v1.7.0+)
              if (decision.sanitizedBody) {
                console.log('[Vigil Guard] ✅ Using sanitizedBody from workflow');
                const newOptions = { ...options, body: JSON.stringify(decision.sanitizedBody) };
                pendingNetworkChecks.delete(promptText);
                return ORIGINAL_FETCH.apply(this, [url, newOptions]);
              }

              // PRIORITY 2: Construct sanitizedBody from chatInput (fallback for backward compatibility)
              console.warn('[Vigil Guard] ⚠️ sanitizedBody missing, constructing from chatInput (fallback)');
              const sanitizedText = decision.chatInput || decision.cleaned_prompt || '[Content sanitized by Vigil Guard]';

              // Construct proper ChatGPT API format
              if (bodyObj.messages && Array.isArray(bodyObj.messages)) {
                const lastIdx = bodyObj.messages.length - 1;

                // Update last message with proper structure
                bodyObj.messages[lastIdx] = {
                  ...bodyObj.messages[lastIdx],
                  content: {
                    content_type: "text",
                    parts: [sanitizedText]
                  }
                };

                console.log('[Vigil Guard] 🔧 Constructed sanitizedBody for messages[] format');
              } else if (bodyObj.prompt) {
                // Simple prompt field (legacy or alternative API format)
                bodyObj.prompt = sanitizedText;
                console.log('[Vigil Guard] 🔧 Constructed sanitizedBody for prompt field');
              }

              const newOptions = { ...options, body: JSON.stringify(bodyObj) };
              pendingNetworkChecks.delete(promptText);
              return ORIGINAL_FETCH.apply(this, [url, newOptions]);

            } else {
              console.log('[Vigil Guard] 🌐 ✅ ALLOWED ChatGPT request');
              pendingNetworkChecks.delete(promptText);
              return ORIGINAL_FETCH.apply(this, args);
            }
          } catch (error) {
            console.error('[Vigil Guard] 🌐 ❌ ChatGPT intercept error:', error);
            pendingNetworkChecks.delete(promptText);
            return ORIGINAL_FETCH.apply(this, args);
          }
        }
      }
    } catch (parseError) {
      console.error('[Vigil Guard] 🌐 ⚠️ Failed to parse ChatGPT body:', parseError);
    }
  }

  // Default: pass through all other requests
  return ORIGINAL_FETCH.apply(this, args);
};

console.log('[Vigil Guard] 🌐 Network intercept layer activated (DEFENSE LAYER 5)');

// =============================================================================
// END NETWORK INTERCEPT
// =============================================================================

// Status indicator element
let statusIndicator = null;
let isProcessing = false;

// Tracked elements dla cleanup
let currentTextarea = null;
let currentSendButton = null;

// Event handlers (stored for proper removeEventListener)
let textareaHandlerCapture = null;
let textareaHandlerBubble = null;
let buttonHandler = null;
let pasteHandler = null; // v0.3.9: Intercept paste events (Claude/ChatGPT auto-submit)

// Rate limiting (prevent n8n overload)
let lastCheckTime = 0;
const MIN_CHECK_INTERVAL = 500; // 500ms minimum between webhook calls
let debounceTimer = null;

// MutationObserver instance
let domObserver = null;

// Detect current platform
function getPlatformName() {
  const hostname = window.location.hostname;
  // ⚠️ FROZEN: Claude.ai disabled (v0.4.0)
  // if (hostname.includes('claude.ai')) return 'Claude.ai (FROZEN)';
  if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) return 'ChatGPT';
  return 'AI platform';
}

// Bypass flag - allows skipping button handler for programmatic clicks
let bypassButtonHandler = false;

// Find textarea - ChatGPT only (Claude.ai frozen)
function findTextarea() {
  const hostname = window.location.hostname;

  // ChatGPT uses #prompt-textarea
  if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
    return document.getElementById('prompt-textarea');
  }

  // ⚠️ FROZEN: Claude.ai code disabled (v0.4.0)
  // if (hostname.includes('claude.ai')) {
  //   const proseMirror = document.querySelector('div.ProseMirror[contenteditable="true"]');
  //   if (proseMirror) return proseMirror;
  //   const contentEditable = document.querySelector('[contenteditable="true"]');
  //   return contentEditable;
  // }

  // Fallback: ChatGPT only
  return document.getElementById('prompt-textarea');
}

// Create status indicator
function createStatusIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'vigil-status-indicator allow';
  indicator.setAttribute('data-status', 'Protected by Vigil Guard');
  document.body.appendChild(indicator);
  return indicator;
}

// Update status
function updateStatus(status, message) {
  if (!statusIndicator) return;

  statusIndicator.className = `vigil-status-indicator ${status}`;
  statusIndicator.setAttribute('data-status', message);

  console.log(`[Vigil Guard] Status: ${status} - ${message}`);
}

// Send to Vigil Guard webhook (via service worker)
async function checkWithGuard(text, isRetry = false) {
  // RATE LIMITING: Prevent n8n overload
  const now = Date.now();
  const timeSinceLastCheck = now - lastCheckTime;

  if (timeSinceLastCheck < MIN_CHECK_INTERVAL) {
    console.log(`[Vigil Guard] ⏱️ Rate limit: waiting ${MIN_CHECK_INTERVAL - timeSinceLastCheck}ms`);
    await new Promise(resolve => setTimeout(resolve, MIN_CHECK_INTERVAL - timeSinceLastCheck));
  }

  lastCheckTime = Date.now();
  updateStatus('processing', 'Checking with Vigil Guard...');

  const payload = {
    sessionId: Date.now().toString(),
    chatInput: text,
    _debug: {
      requestId: `overlay_${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: 'overlay-proxy'
    }
  };

  console.log('[Vigil Guard] 📤 Sending to webhook:', text.substring(0, 50) + '...');

  try {
    // Send via service worker (content script cannot fetch localhost because of CSP)
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_WITH_GUARD',
      payload: payload
    });

    console.log('[Vigil Guard] 📥 Response:', response);

    // Reset connection attempts on successful response
    connectionAttempts = 0;

    return response;
  } catch (error) {
    console.error('[Vigil Guard] ❌ Error:', error);

    // CRITICAL: Service Worker invalidation detection
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.error('[Vigil Guard] 🔴 SERVICE WORKER CONTEXT LOST');

      // v0.5.0: Attempt to reconnect before showing error
      if (!isRetry) {
        console.log('[Vigil Guard] 🔄 Attempting to reconnect...');
        updateStatus('processing', 'Reconnecting to service...');

        const reconnected = await attemptReconnect();
        if (reconnected) {
          console.log('[Vigil Guard] ✅ Reconnected! Retrying request...');
          return checkWithGuard(text, true); // Retry with isRetry=true
        }
      }

      // Reconnection failed - show error to user
      console.error('[Vigil Guard] 🔴 RECONNECTION FAILED - Extension needs reload!');
      updateStatus('block', '⚠️ Extension context lost - reload needed');

      // Show user-friendly message
      const platformName = getPlatformName();
      alert(
        `⚠️ Vigil Guard Extension Context Lost\n\n` +
        `The extension's background service has stopped and couldn't be restarted.\n\n` +
        `Please reload this ${platformName} page to restore protection.`
      );

      // Block the prompt to be safe (don't fail open when extension is broken)
      return {
        action: 'block',
        reason: 'extension_context_invalidated',
        error: error.message
      };
    }

    // v0.5.0: Handle "Receiving end does not exist" error (SW was asleep)
    if (error.message && error.message.includes('Receiving end does not exist')) {
      console.warn('[Vigil Guard] ⚠️ Service worker was asleep, retrying...');

      if (!isRetry) {
        // Wait for SW to wake up
        await new Promise(resolve => setTimeout(resolve, 300));
        return checkWithGuard(text, true);
      }
    }

    // Other errors: fail open - allow sending original text
    return {
      action: 'allow',
      reason: 'service_unavailable',
      error: error.message
    };
  }
}

// Find Send button - works for ChatGPT and Claude.ai
function findSendButton() {
  const hostname = window.location.hostname;

  // ChatGPT uses data-testid="send-button"
  if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
    return document.querySelector('[data-testid="send-button"]');
  }

  // ⚠️ FROZEN: Claude.ai code disabled (v0.4.0)
  // if (hostname.includes('claude.ai')) {
  //   console.log('[Vigil Guard] 🔍 DEBUG: Searching for Claude.ai Send button (FROZEN)...');
  //   const submitButton = document.querySelector('button[type="submit"]');
  //   if (submitButton) return submitButton;
  //   const sendButton = document.querySelector('button[aria-label*="end"]');
  //   if (sendButton) return sendButton;
  //   const form = document.querySelector('form');
  //   if (form) {
  //     const buttons = form.querySelectorAll('button');
  //     if (buttons.length > 0) return buttons[buttons.length - 1];
  //   }
  //   return null;
  // }

  // Fallback: ChatGPT only
  return document.querySelector('[data-testid="send-button"]');
}

// Enter key handler - extracted for reuse
async function handleEnterKey(e, textarea) {
  // DEBUG: Always log Enter key press for debugging
  if (e.key === 'Enter') {
    const textContent = (textarea.textContent || '').trim();
    const innerText = (textarea.innerText || '').trim();
    console.log(`[Vigil Guard] 🔍 Enter key detected - Shift: ${e.shiftKey}, isProcessing: ${isProcessing}`);
    console.log(`[Vigil Guard] 📝 Textarea: textContent="${textContent.substring(0, 50)}", innerText="${innerText.substring(0, 50)}"`);
    console.log(`[Vigil Guard] 🎯 Element:`, textarea);
  }

  // Enter bez Shift = submit
  if (e.key === 'Enter' && !e.shiftKey) {
    // contenteditable div - czytaj textContent zamiast value
    const text = (textarea.textContent || textarea.innerText || '').trim();

    if (!text || isProcessing) {
      console.log(`[Vigil Guard] ⚠️ Skipping - empty: ${!text}, processing: ${isProcessing}`);
      return; // Empty prompt or already processing
    }

    // ZATRZYMAJ oryginalny submit - DEFENSE IN DEPTH
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation(); // ⚡ Zatrzymuje wszystkie inne listenery

    console.log('[Vigil Guard] 🛑 Intercepted Enter - checking with Guard...');
    console.log('[Vigil Guard] 📝 Text:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
    isProcessing = true;

    try {
      // Send to Guard
      const decision = await checkWithGuard(text);

      if (decision.action === 'block') {
        // BLOCK - do not send
        console.log('[Vigil Guard] 🚫 BLOCKED - preventing submission');
        updateStatus('block', `Blocked: ${decision.reason || 'threat detected'}`);
        alert('⛔ Vigil Guard blocked this message:\n\n' + (decision.reason || 'Potential security threat detected'));

        // Clear contenteditable div
        textarea.textContent = '';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

      } else if (decision.action === 'sanitize') {
        // SANITIZE - use cleaned text
        updateStatus('sanitize', `Sanitized: ${decision.reason || 'cleaned'}`);

        const cleanedText = decision.chatInput || decision.cleaned_prompt || '[Message cleaned by Vigil Guard]';

        console.log('[Vigil Guard] 🧹 Using sanitized text:', cleanedText);

        // Podstaw wyczyszczony tekst do contenteditable div
        textarea.textContent = cleanedText;

        // Trigger input event
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // Send (with bypass flag)
        setTimeout(() => {
          const sendBtn = findSendButton();
          if (sendBtn && !isProcessing) {
            bypassButtonHandler = true;
            sendBtn.click();
            setTimeout(() => { bypassButtonHandler = false; }, 50);
            console.log(`[Vigil Guard] ✅ Sent sanitized text to ${getPlatformName()}`);
          }
        }, 100);

      } else {
        // ALLOW - send original text
        updateStatus('allow', 'Allowed - safe to send');

        // Send (with bypass flag)
        setTimeout(() => {
          const sendBtn = findSendButton();
          if (sendBtn && !isProcessing) {
            bypassButtonHandler = true;
            sendBtn.click();
            setTimeout(() => { bypassButtonHandler = false; }, 50);
            console.log(`[Vigil Guard] ✅ Sent original text to ${getPlatformName()}`);
          }
        }, 100);
      }

    } catch (error) {
      console.error('[Vigil Guard] ❌ Error during processing:', error);
      updateStatus('allow', 'Error - failed open');

      // Fail open - allow send (with bypass flag)
      setTimeout(() => {
        const sendBtn = findSendButton();
        if (sendBtn) {
          bypassButtonHandler = true;
          sendBtn.click();
          setTimeout(() => { bypassButtonHandler = false; }, 50);
        }
      }, 100);

    } finally {
      isProcessing = false;
      // Status stays until next prompt arrives
    }
  }
}

// Handler dla button click - backup layer
async function handleButtonClick(e, button) {
  console.log('[Vigil Guard] 🖱️ Send button clicked - bypass:', bypassButtonHandler);

  // BYPASS: allow programmatic clicks from Enter handler
  if (bypassButtonHandler) {
    console.log('[Vigil Guard] 🟢 Allowing programmatic click (bypass active)');
    return;
  }

  const textarea = findTextarea();
  if (!textarea) {
    console.log('[Vigil Guard] ⚠️ Button click handler: no textarea found');
    return;
  }

  const text = (textarea.textContent || textarea.innerText || '').trim();

  // If empty or already processing, allow to continue
  if (!text) {
    return; // Pusty prompt - ChatGPT sam zablokuje
  }

  if (isProcessing) {
    // Already processing (Enter handler) - let it pass without extra check
    return;
  }

  // ZATRZYMAJ oryginalny submit - BACKUP LAYER
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  console.log('[Vigil Guard] 🛡️ Button click intercepted (backup layer)');
  isProcessing = true;

  try {
    const decision = await checkWithGuard(text);

    if (decision.action === 'block') {
      updateStatus('block', `Blocked: ${decision.reason || 'threat detected'}`);
      alert('⛔ Vigil Guard blocked this message:\n\n' + (decision.reason || 'Potential security threat detected'));
      textarea.textContent = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

    } else if (decision.action === 'sanitize') {
      updateStatus('sanitize', `Sanitized: ${decision.reason || 'cleaned'}`);
      const cleanedText = decision.chatInput || decision.cleaned_prompt || '[Message cleaned by Vigil Guard]';

      console.log('[Vigil Guard] 🧹 Using sanitized text:', cleanedText);
      textarea.textContent = cleanedText;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      // Trigger programmatic click - with bypass flag
      isProcessing = false; // Reset before click
      setTimeout(() => {
        bypassButtonHandler = true;
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        button.dispatchEvent(clickEvent);
        setTimeout(() => { bypassButtonHandler = false; }, 50);
      }, 100);
      return; // Exit before finally

    } else {
      updateStatus('allow', 'Allowed - safe to send');
      // Allow to proceed - with bypass flag
      isProcessing = false; // Reset before click
      setTimeout(() => {
        bypassButtonHandler = true;
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        button.dispatchEvent(clickEvent);
        setTimeout(() => { bypassButtonHandler = false; }, 50);
      }, 100);
      return; // Exit before finally
    }

  } catch (error) {
    console.error('[Vigil Guard] ❌ Error during button processing:', error);
    updateStatus('allow', 'Error - failed open');
    isProcessing = false;
    setTimeout(() => {
      bypassButtonHandler = true;
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      button.dispatchEvent(clickEvent);
      setTimeout(() => { bypassButtonHandler = false; }, 50);
    }, 100);
    return;
  } finally {
    isProcessing = false;
  }
}

// v0.3.7: REMOVED cleanupListeners() - handlers are immortal, never removed
// Handlers attached to `document` survive all DOM mutations
// Only cleanup on extension unload (if needed in future)

// v0.3.7: REMOVED debouncedSetupInterception() - no longer needed
// setupInterception() is now idempotent, safe to call multiple times
// No cleanup/reattach cycle, so no need for debouncing

// v0.3.7: Main interception logic - IDEMPOTENT & IMMORTAL
// Handlers attached to `document` (not body) - survive all DOM mutations
// IDEMPOTENT: safe to call multiple times, only attaches once
function setupInterception() {
  // v0.3.7+v0.3.9: IDEMPOTENT - only setup if handlers not already attached
  if (textareaHandlerCapture && textareaHandlerBubble && buttonHandler && pasteHandler) {
    console.log('[Vigil Guard] ⏭️  Handlers already active, skipping setup');
    return;
  }

  console.log('[Vigil Guard] 🔧 Setting up immortal event handlers...');

  // v0.3.7: NO CLEANUP - handlers stay alive forever
  // Reason: Cleanup creates timing gap where events can escape

  // CRITICAL FIX v0.3.7: Attach to `document`, not `document.body`
  // Reason: `document` NEVER changes, survives all body mutations
  // Claude's submit mutations replace body subtree → body handlers orphaned
  // document handlers → immortal, always active

  // DEFENSE LAYER 1: Capture phase - przechwytuje PRZED AI chat handlers
  if (!textareaHandlerCapture) {
    textareaHandlerCapture = (e) => {
      // Find the actual target element that has focus
      const target = e.target;

      // FIX: Claude.ai changes contentEditable to "false" when Enter is pressed!
      // Instead of checking contentEditable, check for ProseMirror class (never changes)
      const isProseMirror = target && target.classList && target.classList.contains('ProseMirror');
      const isContentEditable = target && target.contentEditable === 'true';

      if (isProseMirror || isContentEditable) {
        // Log ALL keydown events for debugging
        if (e.key) {
          console.log(`[Vigil Guard] 🔑 Key pressed: "${e.key}" on`, target.tagName, target.className);
        }

        // Pass the actual target element to handler
        handleEnterKey(e, target);
      }
    };

    // v0.3.7: Attach to DOCUMENT (immortal), not body
    document.addEventListener('keydown', textareaHandlerCapture, true);
    console.log('[Vigil Guard] ✅ Capture phase keydown handler attached to document');
  }

  // DEFENSE LAYER 2: Bubble phase - backup
  if (!textareaHandlerBubble) {
    textareaHandlerBubble = (e) => {
      const target = e.target;
      // FIX: Claude.ai changes contentEditable to "false" when Enter is pressed
      const isProseMirror = target && target.classList && target.classList.contains('ProseMirror');
      const isContentEditable = target && target.contentEditable === 'true';

      if (isProseMirror || isContentEditable) {
        handleEnterKey(e, target);
      }
    };

    // v0.3.7: Attach to DOCUMENT (immortal), not body
    document.addEventListener('keydown', textareaHandlerBubble, false);
    console.log('[Vigil Guard] ✅ Bubble phase keydown handler attached to document');
  }

  // DEFENSE LAYER 3: Button click intercept - EVENT DELEGATION for ALL buttons
  if (!buttonHandler) {
    buttonHandler = (e) => {
      const target = e.target;

      // Check if clicked element is a button (or inside a button)
      const button = target.closest('button');
      if (!button) return;

      // Log ALL button clicks for debugging
      console.log('[Vigil Guard] 🖱️ Button click detected:', button.type, button.getAttribute('aria-label'), button.textContent?.substring(0, 20));

      // Check if it's a submit/send button
      const isSubmitButton = button.type === 'submit' ||
                            button.getAttribute('data-testid') === 'send-button' ||
                            button.getAttribute('aria-label')?.toLowerCase().includes('send');

      if (isSubmitButton) {
        console.log('[Vigil Guard] ✅ Send button click intercepted!');
        // Handle the submission (findTextarea is called inside handleButtonClick)
        handleButtonClick(e, button);
      }
    };

    // v0.3.7: Attach to DOCUMENT (immortal), not body
    document.addEventListener('click', buttonHandler, true);
    console.log('[Vigil Guard] ✅ Button click handler attached to document');
  }

  // DEFENSE LAYER 4: Paste intercept - CRITICAL for Claude/ChatGPT auto-submit
  // v0.3.9: Claude.ai and ChatGPT auto-submit pasted content before Enter key!
  // Must check pasted content IMMEDIATELY to prevent malicious paste bypass
  if (!pasteHandler) {
    pasteHandler = async (e) => {
      const target = e.target;

      // Check if pasting into contenteditable (ChatGPT/Claude.ai textarea)
      const isProseMirror = target && target.classList && target.classList.contains('ProseMirror');
      const isContentEditable = target && target.contentEditable === 'true';

      if (!isProseMirror && !isContentEditable) return;

      console.log('[Vigil Guard] 📋 Paste event detected on', target.tagName, target.className);

      // Extract pasted text from clipboard
      const pastedText = e.clipboardData?.getData('text/plain') || '';
      if (!pastedText.trim()) {
        console.log('[Vigil Guard] ⚠️ Empty paste, allowing');
        return;
      }

      console.log('[Vigil Guard] 📋 Pasted text:', pastedText.substring(0, 100) + (pastedText.length > 100 ? '...' : ''));

      // PREVENT default paste temporarily - we'll check first
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (isProcessing) {
        console.log('[Vigil Guard] ⏳ Already processing, ignoring paste');
        return;
      }

      isProcessing = true;

      try {
        // Check with Vigil Guard
        const decision = await checkWithGuard(pastedText);

        if (decision.action === 'block') {
          console.log('[Vigil Guard] 🚫 BLOCKED PASTE - malicious content detected');
          updateStatus('block', `Blocked paste: ${decision.reason || 'threat detected'}`);
          alert('⛔ Vigil Guard blocked this paste:\n\n' + (decision.reason || 'Potential security threat detected'));

        } else if (decision.action === 'sanitize') {
          console.log('[Vigil Guard] 🧹 SANITIZED PASTE');
          updateStatus('sanitize', `Sanitized paste: ${decision.reason || 'cleaned'}`);

          const cleanedText = decision.chatInput || decision.cleaned_prompt || '[Paste cleaned by Vigil Guard]';

          // Insert sanitized text manually
          document.execCommand('insertText', false, cleanedText);

        } else {
          // ALLOW - insert original pasted text
          console.log('[Vigil Guard] ✅ ALLOWED PASTE - safe content');
          updateStatus('allow', 'Paste allowed - safe content');

          // Insert original text manually
          document.execCommand('insertText', false, pastedText);
        }

      } catch (error) {
        console.error('[Vigil Guard] ❌ Error during paste processing:', error);
        updateStatus('allow', 'Error - failed open');

        // Fail open - allow the paste
        document.execCommand('insertText', false, pastedText);

      } finally {
        isProcessing = false;
      }
    };

    // Attach to DOCUMENT in CAPTURE phase (before AI chat handlers)
    document.addEventListener('paste', pasteHandler, true);
    console.log('[Vigil Guard] ✅ Paste handler attached to document');
  }

  console.log('[Vigil Guard] 🛡️ All immortal handlers active - ZERO gap protection');
}

// Setup MutationObserver - pilnuje podmiany textarea/button
function setupMutationObserver() {
  // If it already exists, disconnect
  if (domObserver) {
    domObserver.disconnect();
  }

  domObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check if textarea or send button was replaced
      if (mutation.type === 'childList') {
        const addedNodes = Array.from(mutation.addedNodes);
        const removedNodes = Array.from(mutation.removedNodes);

        // Helper: check if node is textarea (ChatGPT or Claude.ai)
        const isTextarea = (node) => {
          if (!node || !node.matches) return false;
          return (
            node.id === 'prompt-textarea' || // ChatGPT
            (node.matches('div.ProseMirror[contenteditable="true"]')) || // Claude.ai ProseMirror
            (node.matches('[contenteditable="true"]')) // Generic contenteditable
          );
        };

        // Helper: check if node is send button (ChatGPT or Claude.ai)
        const isSendButton = (node) => {
          if (!node || !node.matches) return false;
          return (
            node.matches('[data-testid="send-button"]') || // ChatGPT
            node.matches('button[type="submit"]') || // Generic submit
            (node.matches('button') && node.getAttribute('aria-label')?.toLowerCase().includes('send')) // Claude.ai
          );
        };

        // Check if textarea was removed or added
        const textareaChanged =
          removedNodes.some(isTextarea) ||
          addedNodes.some(isTextarea);

        // Check if button was replaced
        const buttonChanged =
          removedNodes.some(isSendButton) ||
          addedNodes.some(isSendButton);

        if (textareaChanged || buttonChanged) {
          console.log('[Vigil Guard] 🔄 DOM change detected - checking handlers');
          // v0.3.7: setupInterception() is now idempotent, safe to call directly
          // No debounce needed - function returns immediately if handlers already active
          setupInterception();
        }
      }
    }
  });

  // Observe entire body (AI chat apps can dynamically build UI)
  domObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('[Vigil Guard] 👁️ MutationObserver active - monitoring DOM changes');
}

// Init
function init() {
  console.log('[Vigil Guard] Starting overlay proxy...');

  // Create status indicator
  statusIndicator = createStatusIndicator();
  updateStatus('allow', 'Protected by Vigil Guard');

  // Setup MutationObserver
  setupMutationObserver();

  // Wait for DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupInterception);
  } else {
    setupInterception();
  }
}

// Start
init();
