// Vigil Guard Browser Extension - Service Worker
// Version: 0.5.0

console.log('[Vigil Guard] Service Worker initialized');

// Default GUI URL for fetching configuration
const DEFAULT_GUI_URL = 'http://localhost:80/ui';

// Default configuration (fallback if GUI unavailable)
const DEFAULT_CONFIG = {
  enabled: true,
  endpoint: 'http://localhost/ui/api/browser-filter',  // GUI through Caddy proxy
  n8nEndpoint: 'http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1',  // Fallback direct to n8n
  customWebhook: '',  // User can set custom public webhook URL
  apiKey: '',
  mode: 'monitor', // 'monitor', 'block', 'sanitize'
  cache: true,
  cacheTimeout: 300000 // 5 minutes
};

// Cache for processed requests
const requestCache = new Map();

/**
 * Fetch configuration from GUI
 * Called on install and every 5 minutes
 */
async function fetchConfigFromGUI() {
  const configUrl = `${DEFAULT_GUI_URL}/api/plugin-config`;

  console.log('[Vigil Guard] Fetching config from:', configUrl);

  try {
    const response = await fetch(configUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    console.log('[Vigil Guard] Config fetched successfully:', data);

    // Map GUI response to internal config format
    await chrome.storage.local.set({
      config: {
        enabled: data.enabled !== undefined ? data.enabled : true,
        n8nEndpoint: data.webhookUrl || DEFAULT_CONFIG.n8nEndpoint,
        customWebhook: '',
        guiUrl: data.guiUrl || DEFAULT_GUI_URL,
        version: data.version || '1.4.0',
        endpoint: DEFAULT_CONFIG.endpoint,
        apiKey: '',
        mode: 'monitor',
        cache: true,
        cacheTimeout: 300000,
        lastFetch: Date.now()
      }
    });

    console.log('[Vigil Guard] Configuration updated from GUI');
    return { success: true };
  } catch (error) {
    console.error('[Vigil Guard] Failed to fetch config from GUI:', error);

    // Fallback to defaults if no config exists
    const existingConfig = await chrome.storage.local.get('config');
    if (!existingConfig.config) {
      await chrome.storage.local.set({
        config: {
          ...DEFAULT_CONFIG,
          guiUrl: DEFAULT_GUI_URL,
          lastFetch: 0
        }
      });
      console.log('[Vigil Guard] Fallback to default configuration');
    }

    return { success: false, error: error.message };
  }
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Vigil Guard] Extension installed');

  // Fetch configuration from GUI
  await fetchConfigFromGUI();

  // Set badge
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  chrome.action.setBadgeText({ text: 'ON' });
});

// Periodic configuration refresh (every 5 minutes)
setInterval(() => {
  console.log('[Vigil Guard] Periodic config refresh');
  fetchConfigFromGUI();
}, 5 * 60 * 1000); // 5 minutes

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Vigil Guard] Message received:', request.type);

  switch (request.type) {
    case 'CHECK_WITH_GUARD':
      // Nowa architektura overlay proxy - bezpośrednie wywołanie webhooka
      checkWithGuardOverlay(request.payload)
        .then(sendResponse)
        .catch(error => {
          console.error('[Vigil Guard] Overlay check error:', error);
          sendResponse({ action: 'allow', reason: 'service_unavailable', error: error.message });
        });
      return true; // Keep channel open for async response

    case 'FILTER_REQUEST':
      handleFilterRequest(request.data)
        .then(sendResponse)
        .catch(error => {
          console.error('[Vigil Guard] Filter error:', error);
          sendResponse({ action: 'allow', error: error.message });
        });
      return true; // Keep channel open for async response

    case 'GET_CONFIG':
      chrome.storage.local.get('config')
        .then(data => sendResponse(data.config || DEFAULT_CONFIG))
        .catch(error => sendResponse(DEFAULT_CONFIG));
      return true;

    case 'UPDATE_STATUS':
      updateExtensionStatus(request.data);
      sendResponse({ success: true });
      break;

    case 'GET_TAB_ID':
      // Get the tab ID from sender
      sendResponse({ tabId: sender.tab?.id || 'unknown' });
      break;

    case 'REFRESH_CONFIG':
      // Manual configuration refresh from popup
      fetchConfigFromGUI()
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response

    default:
      console.warn('[Vigil Guard] Unknown message type:', request.type);
      sendResponse({ error: 'Unknown message type' });
  }
});

// Handle filter request
async function handleFilterRequest(data) {
  const config = await getConfig();

  // Update stats
  updateStats('requestsProcessed');

  // Check if filtering is enabled
  if (!config.enabled) {
    console.log('[Vigil Guard] Filtering disabled, allowing request');
    return { action: 'allow', reason: 'filtering_disabled' };
  }

  // Check cache
  if (config.cache) {
    const cacheKey = generateCacheKey(data);
    const cached = requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < config.cacheTimeout) {
      console.log('[Vigil Guard] Using cached response');
      return cached.response;
    }
  }

  try {
    // Send to Vigil Guard
    const response = await sendToVigilGuard(data, config);

    // Cache response
    if (config.cache) {
      const cacheKey = generateCacheKey(data);
      requestCache.set(cacheKey, {
        response: response,
        timestamp: Date.now()
      });

      // Clean old cache entries
      cleanCache();
    }

    // Update badge based on response
    updateBadge(response);

    return response;
  } catch (error) {
    console.error('[Vigil Guard] Failed to filter request:', error);

    // Fail open - allow request if Vigil Guard is down
    return {
      action: 'allow',
      reason: 'service_unavailable',
      error: error.message
    };
  }
}

// Send request to Vigil Guard
async function sendToVigilGuard(data, config) {
  const requestId = data.requestId || 'unknown';
  console.log('[Vigil Guard] 🚀 sendToVigilGuard called with requestId:', requestId);
  console.log('[Vigil Guard] 🚀 Data:', data);

  // Extract actual message from ChatGPT request body
  let chatInput = '';

  console.log('[Vigil Guard] 🔍 Raw body type:', typeof data.body);
  console.log('[Vigil Guard] 🔍 Raw body:', data.body);

  try {
    if (data.body) {
      let bodyData;

      // Parse the body if it's a string
      if (typeof data.body === 'string') {
        try {
          bodyData = JSON.parse(data.body);
          console.log('[Vigil Guard] 📋 Parsed body:', bodyData);
        } catch (e) {
          console.log('[Vigil Guard] Body is not JSON, using as plain text');
          chatInput = data.body;
        }
      } else {
        bodyData = data.body;
      }

      // Extract message from ChatGPT format
      if (bodyData && !chatInput) {
        // ChatGPT format: messages[].content.parts[]
        if (bodyData.messages && Array.isArray(bodyData.messages)) {
          const lastMessage = bodyData.messages[bodyData.messages.length - 1];
          console.log('[Vigil Guard] 🔍 Last message:', lastMessage);

          if (lastMessage) {
            // Check different possible formats
            if (lastMessage.content) {
              if (lastMessage.content.parts && Array.isArray(lastMessage.content.parts)) {
                chatInput = lastMessage.content.parts.join(' ');
              } else if (typeof lastMessage.content === 'string') {
                chatInput = lastMessage.content;
              } else if (lastMessage.content.text) {
                chatInput = lastMessage.content.text;
              }
            } else if (lastMessage.text) {
              chatInput = lastMessage.text;
            } else if (lastMessage.message) {
              chatInput = lastMessage.message;
            }
          }
        }
        // Other possible formats
        else if (bodyData.prompt) {
          chatInput = bodyData.prompt;
        } else if (bodyData.message) {
          chatInput = bodyData.message;
        } else if (bodyData.text) {
          chatInput = bodyData.text;
        } else if (bodyData.query) {
          chatInput = bodyData.query;
        } else if (bodyData.input) {
          chatInput = bodyData.input;
        } else if (typeof bodyData === 'string') {
          chatInput = bodyData;
        }
      }

      console.log('[Vigil Guard] 📝 Extracted message:', chatInput || '(empty)');
    } else {
      console.log('[Vigil Guard] ⚠️ No body in request');
    }
  } catch (error) {
    console.error('[Vigil Guard] ❌ Failed to parse body:', error);
    console.error('[Vigil Guard] Body was:', data.body);
    // Try to use raw body as fallback
    if (data.body) {
      chatInput = String(data.body).substring(0, 1000); // Limit length
    }
  }

  // Don't use "test message" - show what we actually got
  if (!chatInput) {
    console.warn('[Vigil Guard] ⚠️ Could not extract message from request');
    chatInput = '[Could not extract message]';
  }

  // Prepare n8n payload format with full context for debugging
  const n8nPayload = {
    sessionId: Date.now().toString(),
    chatInput: chatInput,
    // DEBUG: Include full body for analysis and requestId tracking
    _debug: {
      requestId: data.requestId || 'unknown',  // Track request through entire pipeline
      fullBody: data.body,
      url: data.url,
      method: data.method,
      domain: data.domain,
      timestamp: new Date().toISOString()
    }
  };

  // Old format for backward compatibility
  const payload = {
    url: data.url,
    method: data.method,
    content: data.body,
    metadata: {
      timestamp: Date.now(),
      domain: data.domain,
      tabId: data.tabId,
      userAgent: navigator.userAgent
    }
  };

  // Use custom webhook if configured
  const webhookUrl = config.customWebhook || config.n8nEndpoint;

  console.log('[Vigil Guard] 📍 RequestID:', requestId);
  console.log('[Vigil Guard] 📍 Webhook URL:', webhookUrl);
  console.log('[Vigil Guard] 📦 n8n Payload:', JSON.stringify(n8nPayload, null, 2));

  try {
    // First try the custom webhook or n8n endpoint
    if (webhookUrl) {
      console.log('[Vigil Guard] 🔗 Sending POST to:', webhookUrl);

      // Add timeout to webhook request
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);  // 10 second timeout

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(n8nPayload),  // Use n8n format directly
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      console.log('[Vigil Guard] 📨 Response status:', response.status);

      if (response.ok) {
        try {
          let responseData = await response.json();
          console.log('[Vigil Guard] ✅ Response data (raw):', responseData);

          // n8n może zwracać array [{...}] - weź pierwszy element
          if (Array.isArray(responseData) && responseData.length > 0) {
            responseData = responseData[0];
            console.log('[Vigil Guard] ✅ Extracted from array:', responseData);
          }

          // Ensure response has required format
          if (!responseData.action) {
            console.log('[Vigil Guard] No action in response, defaulting to allow');
            return { action: 'allow', reason: 'no_action_specified' };
          }

          return responseData;
        } catch (error) {
          console.error('[Vigil Guard] Failed to parse response:', error);
          return { action: 'allow', reason: 'parse_error' };
        }
      }
      console.warn('[Vigil Guard] ⚠️ Webhook returned error:', response.status);
    }

    // Fallback to backend API endpoint
    console.log('[Vigil Guard] Trying backend API:', config.endpoint);
    const apiResponse = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey || 'development'
      },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      throw new Error(`API failed: ${apiResponse.status}`);
    }

    return await apiResponse.json();
  } catch (error) {
    console.error('[Vigil Guard] All endpoints failed:', error);
    // Fail open - allow request if all endpoints are down
    return { action: 'allow', reason: 'service_unavailable' };
  }
}

// Get current configuration
async function getConfig() {
  const data = await chrome.storage.local.get('config');
  return data.config || DEFAULT_CONFIG;
}

// Generate cache key
function generateCacheKey(data) {
  const str = `${data.url}:${data.method}:${data.body || ''}`;
  // Simple hash for cache key
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// Clean old cache entries
function cleanCache() {
  const now = Date.now();
  const timeout = DEFAULT_CONFIG.cacheTimeout;

  for (const [key, value] of requestCache.entries()) {
    if (now - value.timestamp > timeout) {
      requestCache.delete(key);
    }
  }

  // Limit cache size
  if (requestCache.size > 1000) {
    // Remove oldest entries
    const entries = Array.from(requestCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (let i = 0; i < entries.length - 500; i++) {
      requestCache.delete(entries[i][0]);
    }
  }
}

// Update extension badge
function updateBadge(response) {
  // Update stats based on action
  switch (response.action) {
    case 'block':
      updateStats('threatsBlocked');
      chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
      chrome.action.setBadgeText({ text: '!' });
      setTimeout(() => {
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        chrome.action.setBadgeText({ text: 'ON' });
      }, 3000);
      break;

    case 'sanitize':
      updateStats('contentSanitized');
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
      chrome.action.setBadgeText({ text: 'S' });
      setTimeout(() => {
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        chrome.action.setBadgeText({ text: 'ON' });
      }, 2000);
      break;

    case 'allow':
      // Keep green
      break;
  }
}

// Update statistics
async function updateStats(statName) {
  const data = await chrome.storage.local.get('stats');
  const stats = data.stats || {
    requestsProcessed: 0,
    threatsBlocked: 0,
    contentSanitized: 0
  };

  if (statName in stats) {
    stats[statName]++;
    await chrome.storage.local.set({ stats });

    // Notify popup if open
    chrome.runtime.sendMessage({
      type: 'STATS_UPDATE',
      stats: stats
    }).catch(() => {
      // Popup not open, ignore
    });
  }
}

// Update extension status
function updateExtensionStatus(status) {
  if (status.enabled) {
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    chrome.action.setBadgeText({ text: 'ON' });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: '#9E9E9E' });
    chrome.action.setBadgeText({ text: 'OFF' });
  }
}

// Check with Guard - Overlay Proxy Architecture
async function checkWithGuardOverlay(payload) {
  console.log('[Vigil Guard] 🚀 Overlay proxy check:', payload.chatInput?.substring(0, 50) + '...');

  const config = await getConfig();
  const webhookUrl = config.customWebhook || config.n8nEndpoint;

  try {
    // Add timeout to webhook request
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);  // 10 second timeout

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    console.log('[Vigil Guard] 📨 Webhook response status:', response.status);

    if (response.ok) {
      try {
        let responseData = await response.json();
        console.log('[Vigil Guard] ✅ Response data (raw):', responseData);

        // n8n może zwracać array [{...}] - weź pierwszy element
        if (Array.isArray(responseData) && responseData.length > 0) {
          responseData = responseData[0];
          console.log('[Vigil Guard] ✅ Extracted from array:', responseData);
        }

        // Ensure response has required format
        if (!responseData.action) {
          console.log('[Vigil Guard] No action in response, defaulting to allow');
          return { action: 'allow', reason: 'no_action_specified' };
        }

        return responseData;
      } catch (error) {
        console.error('[Vigil Guard] Failed to parse response:', error);
        return { action: 'allow', reason: 'parse_error' };
      }
    }

    console.warn('[Vigil Guard] ⚠️ Webhook returned error:', response.status);
    return { action: 'allow', reason: 'webhook_error' };
  } catch (error) {
    console.error('[Vigil Guard] All endpoints failed:', error);
    // Fail open - allow request if all endpoints are down
    return { action: 'allow', reason: 'service_unavailable' };
  }
}

// Log for debugging
console.log('[Vigil Guard] Service Worker ready');