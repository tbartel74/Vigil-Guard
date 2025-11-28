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
  cacheTimeout: 300000, // 5 minutes
  webhookAuthToken: '',
  webhookAuthHeader: 'X-Vigil-Auth'
};

// Timeouts and limits
const WEBHOOK_TIMEOUT_MS = 10000; // 10 second timeout for webhook requests
const CONFIG_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;
const CACHE_RETAIN_SIZE = 500;
const BADGE_BLOCK_DURATION_MS = 3000;
const BADGE_SANITIZE_DURATION_MS = 2000;

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
        webhookAuthToken: data.webhookAuthToken || '',
        webhookAuthHeader: data.webhookAuthHeader || 'X-Vigil-Auth',
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

/**
 * Generate or retrieve persistent clientId (v1.7.0)
 * Used for tracking browser instances across sessions
 * Format: vigil_<timestamp>_<random>
 * Stored in chrome.storage.local for persistence
 */
async function getOrCreateClientId() {
  try {
    const stored = await chrome.storage.local.get('clientId');

    if (stored.clientId) {
      return stored.clientId;
    }

    // Generate new clientId
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const clientId = `vigil_${timestamp}_${random}`;

    // Store for future use
    await chrome.storage.local.set({ clientId });

    console.log('[Vigil Guard] Generated new clientId:', clientId);
    return clientId;
  } catch (error) {
    console.error('[Vigil Guard] Failed to get/create clientId:', error);
    // Fallback to session-specific ID
    return `vigil_session_${Date.now()}`;
  }
}

/**
 * Collect browser metadata for audit trail (v1.7.0)
 * Returns anonymized browser/OS information for security analysis
 */
function collectBrowserMetadata() {
  const ua = navigator.userAgent;

  // Parse browser information
  let browserName = 'unknown';
  let browserVersion = 'unknown';

  if (ua.indexOf('Chrome') > -1) {
    browserName = 'Chrome';
    const match = ua.match(/Chrome\/(\d+\.\d+)/);
    browserVersion = match ? match[1] : 'unknown';
  } else if (ua.indexOf('Firefox') > -1) {
    browserName = 'Firefox';
    const match = ua.match(/Firefox\/(\d+\.\d+)/);
    browserVersion = match ? match[1] : 'unknown';
  } else if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) {
    browserName = 'Safari';
    const match = ua.match(/Version\/(\d+\.\d+)/);
    browserVersion = match ? match[1] : 'unknown';
  }

  // Parse OS information
  // IMPORTANT: Check iOS/iPhone/iPad BEFORE Mac, because iOS UA contains "like Mac OS X"
  let osName = 'unknown';
  if (ua.indexOf('Win') > -1) osName = 'Windows';
  else if (ua.indexOf('iOS') > -1 || ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) osName = 'iOS';
  else if (ua.indexOf('Android') > -1) osName = 'Android';
  else if (ua.indexOf('Mac') > -1) osName = 'macOS';
  else if (ua.indexOf('Linux') > -1) osName = 'Linux';

  return {
    browser: browserName,
    browser_version: browserVersion,
    os: osName,
    language: navigator.language || 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  };
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Vigil Guard] Extension installed');

  // Generate or retrieve clientId (v1.7.0)
  await getOrCreateClientId();

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
}, CONFIG_REFRESH_INTERVAL_MS);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Vigil Guard] Message received:', request.type);

  if (request.type === 'CHECK_WITH_GUARD') {
    checkWithGuardOverlay(request.payload)
      .then(sendResponse)
      .catch(error => {
        console.error('[Vigil Guard] Overlay check error:', error);
        sendResponse({ action: 'allow', reason: 'service_unavailable', error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.type === 'FILTER_REQUEST') {
    handleFilterRequest(request.data)
      .then(sendResponse)
      .catch(error => {
        console.error('[Vigil Guard] Filter error:', error);
        sendResponse({ action: 'allow', error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.type === 'GET_CONFIG') {
    chrome.storage.local.get('config')
      .then(data => sendResponse(data.config || DEFAULT_CONFIG))
      .catch(error => {
        console.error('[Vigil Guard] Failed to retrieve config from storage:', error);
        console.error('[Vigil Guard] Error type:', error.name);
        console.error('[Vigil Guard] Storage may be corrupt or unavailable, using defaults');
        sendResponse(DEFAULT_CONFIG);
      });
    return true;
  }

  if (request.type === 'UPDATE_STATUS') {
    updateExtensionStatus(request.data);
    sendResponse({ success: true });
    return false;
  }

  if (request.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender.tab?.id || 'unknown' });
    return false;
  }

  if (request.type === 'REFRESH_CONFIG') {
    fetchConfigFromGUI()
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  console.warn('[Vigil Guard] Unknown message type:', request.type);
  sendResponse({ error: 'Unknown message type' });
  return false;
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
  const chatInput = extractChatMessage(data.body);

  // Handle extraction errors
  if (chatInput === null) {
    console.warn('[Vigil Guard] ⚠️ Could not extract message from request body');
    console.warn('[Vigil Guard] ⚠️ Body preview:', String(data.body || '').substring(0, 200));
    // Decide: fail-open (allow) or use fallback
    // Using fallback message for logging purposes
    return { action: 'allow', reason: 'extraction_failed' };
  }

  console.log('[Vigil Guard] 📝 Extracted message:', chatInput || '(empty)');

  // Get persistent clientId (v1.7.0)
  const clientId = await getOrCreateClientId();

  // Collect browser metadata (v1.7.0)
  const browserMetadata = collectBrowserMetadata();

  // Prepare n8n payload format with full context for debugging
  const n8nPayload = {
    sessionId: Date.now().toString(),
    clientId: clientId,  // NEW v1.7.0: Persistent browser instance identifier
    chatInput: chatInput,
    // NEW v1.7.0: Browser metadata for audit trail
    browser_metadata: browserMetadata,
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
      const webhookResponse = await callWebhook(webhookUrl, n8nPayload);
      if (webhookResponse) {
        return webhookResponse;
      }
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

/**
 * Extract chat message from request body with multi-format support
 *
 * Attempts to parse and extract user messages from various chat platform formats
 * (ChatGPT messages array, Claude formats, plain text). Handles JSON parsing errors
 * and provides fallback behavior when extraction fails.
 *
 * @param {string|object} body - Request body (may be JSON string or object)
 * @returns {string|null} Extracted message, empty string if legitimately empty, or null on error
 */
function extractChatMessage(body) {
  if (!body) {
    console.log('[Vigil Guard] ⚠️ No body in request');
    return null; // Explicitly null for missing data
  }

  console.log('[Vigil Guard] 🔍 Raw body type:', typeof body);
  console.log('[Vigil Guard] 🔍 Raw body preview:', typeof body === 'string' ? body.substring(0, 200) : body);

  try {
    let bodyData = body;

    // Parse the body if it's a string
    if (typeof body === 'string') {
      try {
        bodyData = JSON.parse(body);
        console.log('[Vigil Guard] 📋 Parsed body successfully');
      } catch (e) {
        console.warn('[Vigil Guard] Failed to parse body as JSON:', e.message);
        console.warn('[Vigil Guard] Error type:', e.name);

        if (e.message.includes('Unexpected end')) {
          console.error('[Vigil Guard] Body appears truncated - this is unusual');
          return null; // Truncated JSON is an error, not plain text
        }

        // Use as plain text fallback
        console.log('[Vigil Guard] Treating body as plain text');
        return body;
      }
    }

    // Try to extract message from various formats
    if (bodyData.messages && Array.isArray(bodyData.messages)) {
      return extractFromMessages(bodyData.messages);
    }

    // Try other common formats
    const otherFormats = ['prompt', 'message', 'text', 'query', 'input'];
    for (const field of otherFormats) {
      if (bodyData[field]) {
        return bodyData[field];
      }
    }

    // If bodyData is a string, return it
    if (typeof bodyData === 'string') {
      return bodyData;
    }

    console.log('[Vigil Guard] 📝 Extracted message: (empty - no recognized format)');
    return ''; // Legitimately empty - no content found
  } catch (error) {
    console.error('[Vigil Guard] ❌ Failed to extract message:', error);
    console.error('[Vigil Guard] Error type:', error.name);
    console.error('[Vigil Guard] Body preview:', String(body).substring(0, 200));
    return null; // Error during extraction
  }
}

// Extract message from messages array
function extractFromMessages(messages) {
  const lastMessage = messages[messages.length - 1];
  console.log('[Vigil Guard] 🔍 Last message:', lastMessage);

  if (!lastMessage) {
    return '';
  }

  // Check different possible formats
  if (lastMessage.content) {
    if (lastMessage.content.parts && Array.isArray(lastMessage.content.parts)) {
      return lastMessage.content.parts.join(' ');
    }
    if (typeof lastMessage.content === 'string') {
      return lastMessage.content;
    }
    if (lastMessage.content.text) {
      return lastMessage.content.text;
    }
  }

  if (lastMessage.text) {
    return lastMessage.text;
  }

  if (lastMessage.message) {
    return lastMessage.message;
  }

  return '';
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

// Call webhook with timeout and response parsing
async function callWebhook(webhookUrl, payload) {
  console.log('[Vigil Guard] 🔗 Sending POST to:', webhookUrl);
  console.log('[Vigil Guard] 📦 Payload:', JSON.stringify(payload, null, 2));

  try {
    // Get current config for auth token
    const config = await getConfig();

    // Build headers object
    const headers = {
      'Content-Type': 'application/json'
    };

    // Add auth header if token is configured
    if (config.webhookAuthToken) {
      headers[config.webhookAuthHeader || 'X-Vigil-Auth'] = config.webhookAuthToken;
      console.log('[Vigil Guard] 🔐 Adding auth header:', config.webhookAuthHeader || 'X-Vigil-Auth');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    console.log('[Vigil Guard] 📨 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '[Could not read error body]');
      console.error('[Vigil Guard] ⚠️ Webhook returned error status:', response.status);
      console.error('[Vigil Guard] Error body preview:', errorText.substring(0, 500));
      console.error('[Vigil Guard] Webhook URL:', webhookUrl);
      return null;
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const textPreview = await response.text().catch(() => '[Could not read body]');
      console.error('[Vigil Guard] Webhook returned non-JSON response');
      console.error('[Vigil Guard] Content-Type:', contentType);
      console.error('[Vigil Guard] Response preview:', textPreview.substring(0, 500));
      return null;
    }

    let responseData = await response.json();
    console.log('[Vigil Guard] ✅ Response data (raw):', responseData);

    // n8n may return array [{...}] - extract first element
    if (Array.isArray(responseData) && responseData.length > 0) {
      responseData = responseData[0];
      console.log('[Vigil Guard] ✅ Extracted from array:', responseData);
    }

    // Ensure response has required format
    if (!responseData.action) {
      console.log('[Vigil Guard] No action in response, defaulting to allow');
      return { action: 'allow', reason: 'no_action_specified' };
    }

    // NEW v1.7.0: Validate sanitizedBody presence for SANITIZE actions
    if (responseData.action === 'sanitize' && !responseData.sanitizedBody) {
      console.error('[Vigil Guard] ❌ CRITICAL: sanitizedBody missing for SANITIZE action!');
      console.error('[Vigil Guard] Response:', JSON.stringify(responseData, null, 2));

      // Emergency fallback: Construct minimal sanitizedBody from chatInput
      const fallbackText = responseData.chatInput || '[Content sanitized by Vigil Guard]';

      responseData.sanitizedBody = {
        messages: [{
          id: Date.now().toString(),
          author: { role: "user" },
          content: {
            content_type: "text",
            parts: [fallbackText]
          }
        }]
      };

      console.warn('[Vigil Guard] 🔧 Emergency fallback: Constructed sanitizedBody from chatInput');
      console.warn('[Vigil Guard] This indicates a workflow issue - check "output to plugin" node');

      // Add error flag for monitoring
      responseData._warning = {
        type: 'sanitizedBody_missing',
        message: 'sanitizedBody was missing, constructed from chatInput',
        timestamp: new Date().toISOString()
      };
    }

    return responseData;
  } catch (error) {
    console.error('[Vigil Guard] Webhook call failed:', error);
    console.error('[Vigil Guard] Error type:', error.name);
    console.error('[Vigil Guard] Webhook URL:', webhookUrl);
    console.error('[Vigil Guard] Payload summary:', JSON.stringify({ chatInput: payload.chatInput?.substring(0, 100) }));

    if (error.name === 'AbortError') {
      console.error(`[Vigil Guard] Request timed out after ${WEBHOOK_TIMEOUT_MS}ms`);
      console.error('[Vigil Guard] Webhook may be down or unresponsive');
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('[Vigil Guard] Network error - check webhook URL is accessible');
      console.error('[Vigil Guard] Possible causes: CORS, DNS failure, network down');
    }

    return null;
  }
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
  if (requestCache.size > MAX_CACHE_SIZE) {
    // Remove oldest entries
    const entries = Array.from(requestCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (let i = 0; i < entries.length - CACHE_RETAIN_SIZE; i++) {
      requestCache.delete(entries[i][0]);
    }
  }
}

// Update extension badge
function updateBadge(response) {
  if (response.action === 'block') {
    updateStats('threatsBlocked');
    chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
    chrome.action.setBadgeText({ text: '!' });
    setTimeout(() => {
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      chrome.action.setBadgeText({ text: 'ON' });
    }, BADGE_BLOCK_DURATION_MS);
    return;
  }

  if (response.action === 'sanitize') {
    updateStats('contentSanitized');
    chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
    chrome.action.setBadgeText({ text: 'S' });
    setTimeout(() => {
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      chrome.action.setBadgeText({ text: 'ON' });
    }, BADGE_SANITIZE_DURATION_MS);
    return;
  }

  // action === 'allow' - keep green badge
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
    }).catch((error) => {
      // Expected case: popup not open (lastError: "Could not establish connection")
      if (error.message?.includes('Could not establish connection')) {
        // Silently ignore - popup is closed, which is normal
        return;
      }

      // Unexpected errors - these are real problems
      console.error('[Vigil Guard] Unexpected error sending stats update:', error);
      console.error('[Vigil Guard] This may indicate extension context issues');
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

  // NEW v1.7.0: Get persistent clientId for browser fingerprinting
  const clientId = await getOrCreateClientId();

  // NEW v1.7.0: Collect browser metadata for audit trail
  const browserMetadata = collectBrowserMetadata();

  // NEW v1.7.0: Enrich payload with browser fingerprinting data
  const enrichedPayload = {
    ...payload,
    clientId: clientId,
    browser_metadata: browserMetadata
  };

  console.log('[Vigil Guard] 📋 Enriched with clientId:', clientId);
  console.log('[Vigil Guard] 📋 Browser metadata:', browserMetadata);

  const config = await getConfig();
  const webhookUrl = config.customWebhook || config.n8nEndpoint;

  const webhookResponse = await callWebhook(webhookUrl, enrichedPayload);

  // If webhook call failed or returned null, fail open
  if (!webhookResponse) {
    console.warn('[Vigil Guard] Webhook unavailable, allowing request');
    return { action: 'allow', reason: 'service_unavailable' };
  }

  return webhookResponse;
}

// Log for debugging
console.log('[Vigil Guard] Service Worker ready');