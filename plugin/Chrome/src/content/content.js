// Vigil Guard Browser Extension - Content Script
// Runs in isolated context on target pages

console.log('[Vigil Guard] Content script starting on', window.location.hostname);
console.log('[Vigil Guard] URL:', window.location.href);
console.log('[Vigil Guard] Document ready state:', document.readyState);

// Configuration
const config = {
  debug: true,
  targetDomains: ['chat.openai.com', 'chatgpt.com', 'claude.ai']
};

// ========== LAYER 3: REQUEST DEDUPLICATION ==========
const requestQueue = new Map(); // conversationId → {requestId, timestamp, payload}
const DEDUP_WINDOW = 2000; // 2 second deduplication window

// Helper: Extract conversation ID from URL
function extractConversationId(url) {
  // /backend-api/f/conversation → "conversation"
  // /backend-api/conversation/abc-123/stream → "abc-123"
  // /api/append_message → "append_message" (Claude)

  // ChatGPT patterns
  const chatgptMatch = url.match(/\/conversation(?:\/([a-f0-9-]+))?/i);
  if (chatgptMatch) {
    return chatgptMatch[1] || 'new-conversation';
  }

  // Claude patterns
  if (url.includes('append_message')) {
    return 'claude-append';
  }
  if (url.includes('/completion')) {
    return 'claude-completion';
  }

  // Fallback
  return 'unknown';
}

// Helper: Cleanup old queue entries
function cleanupQueue(queue, window) {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, value] of queue.entries()) {
    if (now - value.timestamp > window * 2) {
      queue.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0 && config.debug) {
    console.log(`[Vigil Guard] Layer 3: Cleaned ${cleaned} old entries from queue`);
  }
}

// Inject interceptor script into page context
function injectInterceptor() {
  console.log('[Vigil Guard] Attempting to inject interceptor...');

  try {
    // Method 1: Try external script first
    const externalScript = document.createElement('script');
    externalScript.src = chrome.runtime.getURL('src/inject/interceptor.js');
    externalScript.id = 'vigil-guard-interceptor-external';

    externalScript.onload = function() {
      console.log('[Vigil Guard] ✅ External interceptor loaded');
    };

    externalScript.onerror = function() {
      console.log('[Vigil Guard] External script failed, using inline fallback...');
      injectInlineInterceptor();
    };

    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(externalScript);
    } else {
      // If no target yet, use inline immediately
      injectInlineInterceptor();
    }
  } catch (error) {
    console.error('[Vigil Guard] Exception, using inline fallback:', error);
    injectInlineInterceptor();
  }
}

// Inline interceptor injection (more reliable) - FULL FEATURED VERSION
function injectInlineInterceptor() {
  console.log('[Vigil Guard] Injecting inline interceptor...');

  const inlineScript = document.createElement('script');
  inlineScript.id = 'vigil-guard-interceptor-inline';
  inlineScript.textContent = `
(function() {
  'use strict';

  console.log('%c[Vigil Guard] INTERCEPTOR ACTIVE (inline fallback)', 'background: #667eea; color: white; padding: 2px 5px; border-radius: 3px; font-weight: bold');

  // Configuration
  const config = {
    debug: true,
    timeout: 10000,
    patterns: {
      chatgpt: [
        '/backend-api/conversation',
        '/backend-api/conversations',
        '/backend-api/f/conversation',  // NEW: ChatGPT updated endpoint (main user prompts)
        '/v1/chat/completions'
      ],
      claude: [
        '/api/organizations',
        '/api/append_message',
        '/api/completion',
        'claude.ai/api/'
      ]
    }
  };

  // Store originals
  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  let requestCounter = 0;
  const pendingRequests = new Map();

  // Check if URL should be intercepted
  function shouldIntercept(url) {
    const patterns = [...config.patterns.chatgpt, ...config.patterns.claude];
    return patterns.some(pattern => url.includes(pattern));
  }

  // Parse request body
  function parseRequestBody(body) {
    if (!body) return null;

    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }

    if (body instanceof FormData) {
      const parsed = {};
      for (const [key, value] of body.entries()) {
        parsed[key] = value;
      }
      return parsed;
    }

    if (body instanceof URLSearchParams) {
      const parsed = {};
      for (const [key, value] of body.entries()) {
        parsed[key] = value;
      }
      return parsed;
    }

    return body;
  }

  // Wait for Vigil Guard decision
  function waitForDecision(requestId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        console.warn('[Vigil Guard Interceptor] Timeout waiting for decision - allowing request');
        reject(new Error('Vigil Guard timeout - allowing request'));
      }, config.timeout);

      pendingRequests.set(requestId, {
        resolve: (response) => {
          clearTimeout(timeout);
          pendingRequests.delete(requestId);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          pendingRequests.delete(requestId);
          reject(error);
        }
      });
    });
  }

  // Override fetch
  window.fetch = async function(...args) {
    const [resource, init = {}] = args;
    const url = typeof resource === 'string' ? resource : resource.url;
    const method = init.method || 'GET';

    // ========== LAYER 1: QUICK FILTER (Fail Fast) ==========
    if (method === 'GET') {
      return originalFetch.apply(this, args);
    }

    if (!init.body) {
      return originalFetch.apply(this, args);
    }

    const isChatEndpoint = (
      url.includes('/conversation') ||
      url.includes('/chat') ||
      url.includes('/completions') ||
      url.includes('/append_message')
    );

    if (!isChatEndpoint) {
      return originalFetch.apply(this, args);
    }

    // BLACKLIST: Exclude analytics/telemetry endpoints (prevent ChatGPT freeze)
    const isBlacklisted = (
      url.includes('/ces/v1/') ||          // Customer Event Stream (analytics)
      url.includes('/ab.chatgpt.com') ||   // A/B testing
      url.includes('/rgstr') ||            // Register events
      url.includes('browser-intake-datadoghq.com') ||  // DataDog telemetry
      url.includes('/sentinel/') ||        // Monitoring
      url.includes('/telemetry')           // Generic telemetry
    );

    if (isBlacklisted) {
      if (url.includes('ces')) {
        console.log('%c[VG] Layer 1: ⛔ BLACKLISTED (analytics):', 'color: gray', url);
      }
      return originalFetch.apply(this, args);
    }

    // ========== LAYER 1 PASSED ==========
    const requestId = 'fetch_' + (++requestCounter) + '_' + Date.now();

    console.log('%c[VG] Layer 1: ✅ PASSED (POST with body)', 'background: green; color: white; padding: 2px');
    console.log('%c[VG] Intercepting fetch:', 'color: #667eea; font-weight: bold', url);

    try {
      // Parse request body
      console.log('%c[VG] 🔍 RAW init.body:', 'color: orange; font-weight: bold', init.body);
      console.log('%c[VG] 🔍 RAW init.body TYPE:', 'color: orange', typeof init.body, init.body?.constructor?.name);

      const body = parseRequestBody(init.body);

      console.log('%c[VG] 📦 PARSED body:', 'color: #667eea; font-weight: bold', body);
      console.log('%c[VG] 📦 PARSED body TYPE:', 'color: #667eea', typeof body);

      // ========== LAYER 2: BODY VALIDATION ==========
      const hasMessages = body && body.messages && Array.isArray(body.messages);

      if (!hasMessages) {
        console.log('%c[VG] Layer 2: ❌ FAILED - No messages array', 'background: orange; color: white; padding: 2px');
        return originalFetch.apply(this, args);
      }

      const hasUserContent = body.messages.some(msg =>
        msg.author?.role === 'user' &&
        msg.content?.parts &&
        msg.content.parts.length > 0
      );

      if (!hasUserContent) {
        console.log('%c[VG] Layer 2: ❌ FAILED - No user content', 'background: orange; color: white; padding: 2px');
        return originalFetch.apply(this, args);
      }

      // ========== LAYER 2 PASSED ==========
      console.log('%c[VG] Layer 2: ✅ PASSED - Valid user message', 'background: green; color: white; padding: 2px');

      // Log messages array for debugging
      console.log('%c[VG] 💬 MESSAGES ARRAY:', 'background: green; color: white; padding: 3px', body.messages);
      body.messages.forEach((msg, i) => {
        console.log(\`%c[VG] Message[\${i}]:\`, 'color: green', msg);
      });

      // Serialize headers
      let serializedHeaders = {};
      if (init.headers) {
        try {
          if (init.headers instanceof Headers) {
            serializedHeaders = Object.fromEntries(init.headers.entries());
          } else if (typeof init.headers === 'object') {
            serializedHeaders = Object.fromEntries(Object.entries(init.headers));
          }
        } catch (e) {
          console.warn('[VG] Failed to serialize headers:', e);
        }
      }

      // Send to content script for processing
      window.postMessage({
        type: 'VIGIL_GUARD_INTERCEPT',
        requestId: requestId,
        payload: {
          url: url,
          method: init.method || 'GET',
          body: body || init.body,
          headers: serializedHeaders
        }
      }, '*');

      // Wait for decision
      const decision = await waitForDecision(requestId);

      if (config.debug) {
        console.log('%c[VG] Decision:', 'color: green; font-weight: bold', decision);
      }

      // Handle decision
      if (decision.action === 'block') {
        console.log('%c[VG] 🚫 REQUEST BLOCKED', 'background: red; color: white; padding: 2px 5px');
        const blockedResponse = new Response(
          JSON.stringify({
            error: 'Request blocked by Vigil Guard',
            reason: decision.reason || 'Security policy violation'
          }),
          {
            status: 403,
            statusText: 'Forbidden',
            headers: {
              'Content-Type': 'application/json',
              'X-Vigil-Guard': 'blocked'
            }
          }
        );
        return blockedResponse;
      }

      if (decision.action === 'sanitize' && decision.sanitizedBody) {
        console.log('%c[VG] 🧹 CONTENT SANITIZED', 'background: orange; color: white; padding: 2px 5px');
        init.body = typeof decision.sanitizedBody === 'string' ?
          decision.sanitizedBody :
          JSON.stringify(decision.sanitizedBody);
      }

      // Continue with request (allow or sanitized)
      const response = await originalFetch.call(this, resource, init);
      return response;

    } catch (error) {
      console.error('[VG] Error:', error);
      // On error, fail open (allow request)
      return originalFetch.apply(this, args);
    }
  };

  // Listen for responses from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'VIGIL_GUARD_RESPONSE') {
      const { requestId, response } = event.data;
      const pending = pendingRequests.get(requestId);

      if (pending) {
        pending.resolve(response);
      }
    }
  });

  // Test function
  window.testVG = function() {
    console.log('%c[VG] Manual test triggered!', 'background: green; color: white; padding: 5px');
    fetch('/test-vigil-guard').catch(() => console.log('Test complete'));
    return 'Vigil Guard is active. Intercepted ' + requestCounter + ' requests so far.';
  };

  // Expose status
  window.VigilGuard = {
    version: '0.1.0',
    enabled: true,
    mode: 'inline-fallback',
    getStats: () => ({
      intercepted: requestCounter,
      pending: pendingRequests.size
    })
  };

  console.log('%c[VG] Ready! Type testVG() in console to test', 'background: green; color: white; padding: 2px 5px');
})();
  `;

  const target = document.head || document.documentElement || document.body;
  if (target) {
    target.appendChild(inlineScript);
    console.log('[Vigil Guard] ✅ Inline interceptor injected!');
  } else {
    console.error('[Vigil Guard] No injection target available, retrying...');
    setTimeout(injectInlineInterceptor, 100);
  }
}

// Message relay between page and extension
function setupMessageRelay() {
  // Listen for messages from injected script
  window.addEventListener('message', async (event) => {
    // Only accept messages from same origin
    if (event.source !== window) return;

    const message = event.data;

    // Check if this is our message
    if (message?.type === 'VIGIL_GUARD_INTERCEPT') {
      if (config.debug) {
        console.log('[Vigil Guard] Intercepted request:', message);
      }

      // ========== LAYER 3: DEDUPLICATION ==========
      const conversationId = extractConversationId(message.payload.url);
      const existing = requestQueue.get(conversationId);

      console.log('[Vigil Guard] Layer 3: Checking for duplicates...');
      console.log('[Vigil Guard] Layer 3: Conversation ID:', conversationId);

      if (existing && Date.now() - existing.timestamp < DEDUP_WINDOW) {
        console.log('[Vigil Guard] Layer 3: Found existing request within window');

        // If new request has body and old doesn't, REPLACE
        if (message.payload.body && !existing.payload.body) {
          console.log('[Vigil Guard] Layer 3: ✅ Replacing empty request with full body');

          // Send allow response to old request (to prevent timeout)
          window.postMessage({
            type: 'VIGIL_GUARD_RESPONSE',
            requestId: existing.requestId,
            response: {action: 'allow', reason: 'superseded_by_newer_request'}
          }, '*');

          // Update queue with new request
          requestQueue.set(conversationId, {
            requestId: message.requestId,
            timestamp: Date.now(),
            payload: message.payload
          });

          console.log('[Vigil Guard] Layer 3: Updated queue with request:', message.requestId);
        } else {
          // Duplicate or less important - skip
          console.log('[Vigil Guard] Layer 3: ⚠️ Skipping duplicate/inferior request:', message.requestId);

          // Send allow response immediately (fail open)
          window.postMessage({
            type: 'VIGIL_GUARD_RESPONSE',
            requestId: message.requestId,
            response: {action: 'allow', reason: 'duplicate_request'}
          }, '*');

          return; // Don't process further
        }
      } else {
        // New request - add to queue
        console.log('[Vigil Guard] Layer 3: ✅ New request, adding to queue');
        requestQueue.set(conversationId, {
          requestId: message.requestId,
          timestamp: Date.now(),
          payload: message.payload
        });
      }

      // Cleanup old entries
      cleanupQueue(requestQueue, DEDUP_WINDOW);

      console.log('[Vigil Guard] Layer 3: Queue size:', requestQueue.size);
      console.log('[Vigil Guard] Layer 3: ✅ PASSED - Proceeding to service worker');

      console.log('[Vigil Guard] 📤 Sending to service worker...');
      console.log('[Vigil Guard] 📦 Payload being sent:', message.payload);

      // DEBUG: Log the actual body content
      if (message.payload.body) {
        console.log('[Vigil Guard] 📝 Body type:', typeof message.payload.body);
        console.log('[Vigil Guard] 📝 Body content:', message.payload.body);

        // If it's a string, try to parse and show
        if (typeof message.payload.body === 'string') {
          try {
            const parsed = JSON.parse(message.payload.body);
            console.log('[Vigil Guard] 📝 Parsed body:', parsed);
            if (parsed.messages) {
              console.log('[Vigil Guard] 💬 Messages array:', parsed.messages);
            }
          } catch (e) {
            console.log('[Vigil Guard] 📝 Body is not JSON');
          }
        } else if (typeof message.payload.body === 'object') {
          console.log('[Vigil Guard] 📝 Body is object:', message.payload.body);
          if (message.payload.body.messages) {
            console.log('[Vigil Guard] 💬 Messages array:', message.payload.body.messages);
          }
        }
      }

      try {
        // Check if extension is still valid
        if (!chrome.runtime?.id) {
          console.error('[Vigil Guard] Extension context lost, reloading page...');
          window.location.reload();
          return;
        }

        // Get current tab ID
        const tabId = await getTabId();

        // Send to service worker for processing
        const response = await chrome.runtime.sendMessage({
          type: 'FILTER_REQUEST',
          data: {
            ...message.payload,
            domain: window.location.hostname,
            tabId: tabId,
            requestId: message.requestId  // Add requestId for tracking
          }
        });

        console.log('[Vigil Guard] 📥 Service worker response:', response);

        if (config.debug) {
          console.log('[Vigil Guard] Filter response:', response);
        }

        // Send response back to injected script
        window.postMessage({
          type: 'VIGIL_GUARD_RESPONSE',
          requestId: message.requestId,
          response: response
        }, '*');

        // Show notification for blocked/sanitized content
        if (response.action === 'block') {
          showNotification('Request blocked by Vigil Guard', 'error');
        } else if (response.action === 'sanitize') {
          showNotification('Content sanitized by Vigil Guard', 'warning');
        }

      } catch (error) {
        console.error('[Vigil Guard] Error processing request:', error);

        // Send error response
        window.postMessage({
          type: 'VIGIL_GUARD_RESPONSE',
          requestId: message.requestId,
          response: {
            action: 'allow',
            error: error.message
          }
        }, '*');
      }
    }
  });

  // Listen for config requests from injected script
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'VIGIL_GUARD_GET_CONFIG') {
      try {
        if (!chrome.runtime?.id) {
          console.warn('[Vigil Guard] Extension context lost');
          return;
        }

        const config = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });

        window.postMessage({
          type: 'VIGIL_GUARD_CONFIG',
          config: config
        }, '*');
      } catch (error) {
        console.error('[Vigil Guard] Failed to get config:', error);
      }
    }
  });
}

// Get current tab ID
async function getTabId() {
  return new Promise((resolve) => {
    try {
      if (!chrome.runtime?.id) {
        resolve('unknown');
        return;
      }

      chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Vigil Guard] Tab ID error:', chrome.runtime.lastError);
          resolve('unknown');
        } else {
          resolve(response?.tabId || 'unknown');
        }
      });
    } catch (error) {
      console.warn('[Vigil Guard] Failed to get tab ID:', error);
      resolve('unknown');
    }
  });
}

// Show notification on page
function showNotification(message, type = 'info') {
  // Check if notification element exists
  let notification = document.getElementById('vigil-guard-notification');

  if (!notification) {
    // Create notification element
    notification = document.createElement('div');
    notification.id = 'vigil-guard-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      transition: all 0.3s ease;
      opacity: 0;
      transform: translateX(100%);
    `;
    document.body.appendChild(notification);
  }

  // Set type-specific styles
  const styles = {
    info: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white'
    },
    warning: {
      background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      color: 'white'
    },
    error: {
      background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      color: 'white'
    },
    success: {
      background: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
      color: 'white'
    }
  };

  const style = styles[type] || styles.info;
  Object.assign(notification.style, style);

  // Set message
  notification.textContent = message;

  // Show notification
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 10);

  // Auto hide after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
  }, 3000);
}

// Initialize status indicator
function initializeStatusIndicator() {
  // Add small status indicator to page
  const indicator = document.createElement('div');
  indicator.id = 'vigil-guard-status';
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #4CAF50;
    box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
    z-index: 99999;
    cursor: pointer;
    transition: all 0.3s ease;
  `;

  indicator.title = 'Vigil Guard Protection Active';

  // Add click handler
  indicator.addEventListener('click', async () => {
    const config = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
    showNotification(
      config.enabled ? 'Protection is active' : 'Protection is disabled',
      config.enabled ? 'success' : 'warning'
    );
  });

  document.body.appendChild(indicator);

  // Update status periodically
  setInterval(async () => {
    try {
      const config = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
      indicator.style.background = config.enabled ? '#4CAF50' : '#9E9E9E';
      indicator.title = config.enabled ?
        'Vigil Guard Protection Active' :
        'Vigil Guard Protection Disabled';
    } catch (error) {
      // Extension was reloaded - reload the page
      if (error.message?.includes('Extension context invalidated')) {
        console.log('[Vigil Guard] Extension reloaded, refreshing page...');
        window.location.reload();
      }
    }
  }, 5000);
}

// Check if we should activate on this domain
function shouldActivate() {
  const hostname = window.location.hostname;
  const url = window.location.href;

  console.log('[Vigil Guard] Checking activation for:', hostname);

  // Check both hostname and URL patterns
  const shouldRun = config.targetDomains.some(domain =>
    hostname.includes(domain) || url.includes(domain)
  );

  console.log('[Vigil Guard] Should activate:', shouldRun);
  return shouldRun;
}

// Initialize
function initialize() {
  if (!shouldActivate()) {
    console.log('[Vigil Guard] Not activating on', window.location.hostname);
    return;
  }

  console.log('[Vigil Guard] Initializing on', window.location.hostname);

  // Inject interceptor
  injectInterceptor();

  // Setup message relay
  setupMessageRelay();

  // Initialize UI elements
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeStatusIndicator();
    });
  } else {
    initializeStatusIndicator();
  }

  console.log('[Vigil Guard] Content script initialized');
}

// Start
initialize();