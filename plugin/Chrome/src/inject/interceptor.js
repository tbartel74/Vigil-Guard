// Vigil Guard Browser Extension - Request Interceptor
// This script runs in the page context and intercepts fetch/XHR requests

(function() {
  'use strict';

  console.log('[Vigil Guard Interceptor] Initializing request interception');

  // Configuration
  const config = {
    debug: true,
    timeout: 10000,  // Extended to 10s for webhook response
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

  // Request counter for unique IDs
  let requestCounter = 0;

  // Pending requests map
  const pendingRequests = new Map();

  // Store original functions
  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  // Check if URL should be intercepted
  function shouldIntercept(url) {
    const patterns = [...config.patterns.chatgpt, ...config.patterns.claude];
    return patterns.some(pattern => url.includes(pattern));
  }

  // Parse request body
  function parseRequestBody(body) {
    if (!body) return null;

    console.log('[Vigil Guard Interceptor] Body type:', typeof body, body?.constructor?.name);

    // Handle string body
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        console.log('[Vigil Guard Interceptor] Parsed JSON body successfully');
        return parsed;
      } catch {
        console.log('[Vigil Guard Interceptor] Body is plain text, not JSON');
        return body;
      }
    }

    // Handle FormData
    if (body instanceof FormData) {
      const parsed = {};
      for (const [key, value] of body.entries()) {
        parsed[key] = value;
      }
      console.log('[Vigil Guard Interceptor] Parsed FormData');
      return parsed;
    }

    // Handle URLSearchParams
    if (body instanceof URLSearchParams) {
      const parsed = {};
      for (const [key, value] of body.entries()) {
        parsed[key] = value;
      }
      console.log('[Vigil Guard Interceptor] Parsed URLSearchParams');
      return parsed;
    }

    // Handle ReadableStream (common in fetch)
    if (body instanceof ReadableStream) {
      console.log('[Vigil Guard Interceptor] Body is ReadableStream - cannot parse synchronously');
      return '[ReadableStream - cannot parse]';
    }

    // Handle Blob
    if (body instanceof Blob) {
      console.log('[Vigil Guard Interceptor] Body is Blob - cannot parse synchronously');
      return '[Blob - cannot parse]';
    }

    // Return as-is if unknown type
    console.log('[Vigil Guard Interceptor] Unknown body type, returning as-is');
    return body;
  }

  // Wait for Vigil Guard decision
  function waitForDecision(requestId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
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

  // Intercept fetch API
  window.fetch = async function(...args) {
    const [resource, init = {}] = args;
    const url = typeof resource === 'string' ? resource : resource.url;
    const method = init.method || 'GET';

    // Log ALL requests in debug mode
    if (config.debug) {
      console.log('[Vigil Guard Interceptor] Fetch request:', url);
    }

    // ========== LAYER 1: QUICK FILTER (Fail Fast) ==========
    // Reject GET requests immediately (90% of traffic)
    if (method === 'GET') {
      return originalFetch.apply(this, args);
    }

    // Reject requests without body (no user input to check)
    if (!init.body) {
      if (config.debug && url.includes('backend-api')) {
        console.log('[VG EXT] Layer 1: No body, skipping:', url);
      }
      return originalFetch.apply(this, args);
    }

    // Heuristic: Only intercept chat-like endpoints
    const isChatEndpoint = (
      url.includes('/conversation') ||
      url.includes('/chat') ||
      url.includes('/completions') ||
      url.includes('/append_message')  // Claude
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
      if (config.debug && url.includes('ces')) {
        console.log('[VG EXT] Layer 1: ⛔ BLACKLISTED (analytics):', url);
      }
      return originalFetch.apply(this, args);
    }

    // ========== LAYER 1 PASSED → Continue Processing ==========
    const requestId = `fetch_${++requestCounter}_${Date.now()}`;

    if (config.debug) {
      console.log('[VG EXT] Layer 1: ✅ PASSED (POST with body to chat endpoint)');
      console.log('[Vigil Guard Interceptor] Intercepting fetch:', url);
    }

    try {
      // Debug logging - RAW body BEFORE parsing
      console.log('%c[VG EXT] 🔍 RAW init.body:', 'background: purple; color: white; padding: 2px', init.body);
      console.log('%c[VG EXT] 🔍 RAW init.body TYPE:', 'color: purple; font-weight: bold', typeof init.body, init.body?.constructor?.name);

      // Parse request body
      const body = parseRequestBody(init.body);

      // Debug logging - PARSED body AFTER parsing
      console.log('%c[VG EXT] 📦 PARSED body:', 'background: blue; color: white; padding: 2px', body);
      console.log('%c[VG EXT] 📦 PARSED body TYPE:', 'color: blue', typeof body);

      // ========== LAYER 2: BODY VALIDATION ==========
      const hasMessages = body && body.messages && Array.isArray(body.messages);

      if (!hasMessages) {
        console.log('%c[VG EXT] Layer 2: ❌ FAILED - No messages array', 'background: orange; color: white; padding: 2px');
        if (body) {
          console.log('%c[VG EXT] Body keys:', 'color: orange', Object.keys(body));
        }
        // Not a user chat message - allow without checking
        return originalFetch.apply(this, args);
      }

      // Check if messages have user content
      const hasUserContent = body.messages.some(msg =>
        msg.author?.role === 'user' &&
        msg.content?.parts &&
        msg.content.parts.length > 0
      );

      if (!hasUserContent) {
        console.log('%c[VG EXT] Layer 2: ❌ FAILED - No user content in messages', 'background: orange; color: white; padding: 2px');
        return originalFetch.apply(this, args);
      }

      // ========== LAYER 2 PASSED ==========
      console.log('%c[VG EXT] Layer 2: ✅ PASSED - Valid user message found', 'background: green; color: white; padding: 2px');

      // Log the actual message for debugging
      console.log('%c[VG EXT] 💬 MESSAGES ARRAY:', 'background: green; color: white; padding: 3px', body.messages);
      body.messages.forEach((msg, i) => {
        console.log(`%c[VG EXT] Message[${i}]:`, 'color: green; font-weight: bold', msg);
        if (msg.content) {
          console.log(`%c[VG EXT] Message[${i}].content:`, 'color: green', msg.content);
          if (msg.content.parts) {
            console.log(`%c[VG EXT] Message[${i}].content.parts:`, 'background: green; color: white', msg.content.parts);
          }
        }
      });

      // Serialize headers to avoid DataCloneError with postMessage
      let serializedHeaders = {};
      if (init.headers) {
        try {
          if (init.headers instanceof Headers) {
            serializedHeaders = Object.fromEntries(init.headers.entries());
          } else if (typeof init.headers === 'object') {
            serializedHeaders = Object.fromEntries(Object.entries(init.headers));
          }
        } catch (e) {
          console.warn('[Vigil Guard Interceptor] Failed to serialize headers:', e);
        }
      }

      // Send to content script for processing
      window.postMessage({
        type: 'VIGIL_GUARD_INTERCEPT',
        requestId: requestId,
        payload: {
          url: url,
          method: init.method || 'GET',
          body: body || init.body,  // Send original if parsing failed
          headers: serializedHeaders
        }
      }, '*');

      // Wait for decision
      const decision = await waitForDecision(requestId);

      if (config.debug) {
        console.log('[Vigil Guard Interceptor] Decision:', decision);
      }

      // Handle decision
      if (decision.action === 'block') {
        // Create blocked response
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
        // Use sanitized body
        if (config.debug) {
          console.log('[Vigil Guard Interceptor] Using sanitized body');
        }

        init.body = typeof decision.sanitizedBody === 'string' ?
          decision.sanitizedBody :
          JSON.stringify(decision.sanitizedBody);
      }

      // Continue with request (allow or sanitized)
      const response = await originalFetch.call(this, resource, init);

      // Add Vigil Guard header to response
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers)
      });

      modifiedResponse.headers.set('X-Vigil-Guard', decision.action);

      return modifiedResponse;

    } catch (error) {
      console.error('[Vigil Guard Interceptor] Error:', error);

      // On error, fail open (allow request)
      return originalFetch.apply(this, args);
    }
  };

  // Intercept XMLHttpRequest
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._vigilGuard = {
      method: method,
      url: url,
      shouldIntercept: shouldIntercept(url)
    };

    return originalXHROpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (!this._vigilGuard?.shouldIntercept) {
      return originalXHRSend.apply(this, arguments);
    }

    const requestId = `xhr_${++requestCounter}_${Date.now()}`;
    const xhr = this;

    if (config.debug) {
      console.log('[Vigil Guard Interceptor] Intercepting XHR:', this._vigilGuard.url);
    }

    // Parse body
    const parsedBody = parseRequestBody(body);

    // Send to content script
    window.postMessage({
      type: 'VIGIL_GUARD_INTERCEPT',
      requestId: requestId,
      payload: {
        url: this._vigilGuard.url,
        method: this._vigilGuard.method,
        body: parsedBody
      }
    }, '*');

    // Wait for decision
    waitForDecision(requestId)
      .then(decision => {
        if (config.debug) {
          console.log('[Vigil Guard Interceptor] XHR Decision:', decision);
        }

        if (decision.action === 'block') {
          // Simulate error
          xhr.dispatchEvent(new Event('error'));
          return;
        }

        if (decision.action === 'sanitize' && decision.sanitizedBody) {
          // Send with sanitized body
          const sanitizedBody = typeof decision.sanitizedBody === 'string' ?
            decision.sanitizedBody :
            JSON.stringify(decision.sanitizedBody);

          originalXHRSend.call(xhr, sanitizedBody);
        } else {
          // Send original
          originalXHRSend.call(xhr, body);
        }
      })
      .catch(error => {
        console.error('[Vigil Guard Interceptor] XHR Error:', error);
        // Fail open - send original
        originalXHRSend.call(xhr, body);
      });
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

  // Expose API for page scripts
  window.VigilGuard = {
    version: '0.1.0',
    enabled: true,
    getStats: () => ({
      intercepted: requestCounter,
      pending: pendingRequests.size
    }),
    disable: () => {
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalXHROpen;
      XMLHttpRequest.prototype.send = originalXHRSend;
      console.log('[Vigil Guard] Interception disabled');
    },
    enable: () => {
      console.log('[Vigil Guard] Interception already active');
    }
  };

  console.log('[Vigil Guard Interceptor] Ready - Monitoring AI requests');

})();