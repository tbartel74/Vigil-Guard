/**
 * Webhook helper utilities for E2E testing
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (4 levels up from tests/helpers/)
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

export const WEBHOOK_URL = 'http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1';

function getClickhouseConnection() {
  // Ensure CLICKHOUSE_HOST has protocol and port
  // For tests, always use localhost (Docker hostname not accessible from test process)
  const rawHost = 'localhost';  // Override env CLICKHOUSE_HOST for tests
  const port = process.env.CLICKHOUSE_HTTP_PORT || '8123';

  // Build full URL if not already formatted
  let clickhouseHost;
  if (rawHost.startsWith('http://') || rawHost.startsWith('https://')) {
    clickhouseHost = rawHost;
  } else {
    clickhouseHost = `http://${rawHost}:${port}`;
  }

  const clickhouseUser = process.env.CLICKHOUSE_USER;
  const clickhousePassword = process.env.CLICKHOUSE_PASSWORD;

  if (!clickhouseUser || !clickhousePassword) {
    throw new Error(
      'ClickHouse credentials missing. Set CLICKHOUSE_USER and CLICKHOUSE_PASSWORD in your .env file.'
    );
  }

  const auth = Buffer.from(`${clickhouseUser}:${clickhousePassword}`).toString('base64');
  return {
    clickhouseHost,
    headers: {
      Authorization: `Basic ${auth}`
    }
  };
}

/**
 * Safely parse JSON with detailed error reporting
 * @param {string} jsonString - JSON string to parse
 * @param {string} fieldName - Name of the field (for error messages)
 * @param {string} context - Additional context (e.g., sessionId)
 * @returns {Object} Parsed JSON object
 * @throws {Error} With detailed error message if parsing fails
 */
export function parseJSONSafely(jsonString, fieldName, context = '') {
    // Check for null, undefined, or empty string BEFORE attempting parse
    if (jsonString === null || jsonString === undefined || jsonString === '') {
        const contextStr = context ? ` for session ${context}` : ' (no session context)';
        throw new Error(
            `${fieldName} is null or empty${contextStr}. ` +
            `Check workflow execution logs - field was not populated. ` +
            `This usually indicates ClickHouse connection failure or workflow misconfiguration.`
        );
    }

    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error(`❌ JSON parse failed for field: ${fieldName}`);
        if (context) console.error(`   Context: ${context}`);
        console.error(`   Raw value (first 500 chars): ${jsonString?.substring(0, 500)}`);
        throw new Error(
            `Failed to parse ${fieldName}: ${error.message}. ` +
            `Raw value starts with: ${jsonString?.substring(0, 100)}`
        );
    }
}

/**
 * Send a prompt to the Vigil Guard workflow via webhook
 * @param {string} chatInput - The prompt text to test
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Response from workflow
 */
export async function sendToWorkflow(chatInput, options = {}) {
  const payload = {
    chatInput,
    ...options
  };

  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Webhook request failed: HTTP ${response.status}\n${text}`
    );
  }

  return response.json();
}

/**
 * Query ClickHouse for the latest event matching criteria
 * @param {Object} criteria - Search criteria
 * @param {number} maxWaitMs - Maximum time to wait for event (default: 5000ms)
 * @returns {Promise<Object|null>} Event data or null if not found
 */
export async function waitForClickHouseEvent(criteria = {}, maxWaitMs = 10000) {
  const startTime = Date.now();
  const pollInterval = 500; // Poll every 500ms
  let lastError = null;
  let errorCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      // Build WHERE clause from criteria
      const conditions = [];
      if (criteria.original_input) {
        conditions.push(`original_input = '${criteria.original_input.replace(/'/g, "\\'")}'`);
      }
      if (criteria.sessionId) {
        conditions.push(`sessionId = '${criteria.sessionId}'`);
      }

      // Removed timestamp filter to avoid UTC/local timezone issues
      // sessionId is unique enough for test identification
      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : `WHERE 1=1`;

      const query = `
        SELECT
          sessionId,
          action,
          timestamp,
          original_input,
          normalized_input,
          after_sanitization,
          after_pii_redaction,
          chat_input,
          result,
          detected_language,
          final_status,
          final_action,
          threat_score,
          threat_severity,
          pg_score,
          removal_pct,
          pii_sanitized,
          pii_types_detected,
          pii_entities_count,
          sanitizer_json,
          final_decision_json,
          raw_event
        FROM n8n_logs.events_processed
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT 1
        FORMAT JSON
      `;

      const { clickhouseHost, headers } = getClickhouseConnection();

      const response = await fetch(`${clickhouseHost}/?query=${encodeURIComponent(query)}`, {
        headers
      });

      if (!response.ok) {
        const authError = new Error(`ClickHouse query failed: HTTP ${response.status}`);
        authError.responseStatus = response.status;
        throw authError;
      }

      const result = await response.json();

      if (result.data && result.data.length > 0) {
        const event = result.data[0];

        // Parse JSON fields (using safe parser for better error messages)
        if (event.sanitizer_json) {
          event.sanitizer = parseJSONSafely(event.sanitizer_json, 'sanitizer_json', event.sessionId);
        }
        if (event.final_decision_json) {
          event.final_decision = parseJSONSafely(event.final_decision_json, 'final_decision_json', event.sessionId);
        }
        if (event.pii_classification_json) {
          event.pii_classification = parseJSONSafely(event.pii_classification_json, 'pii_classification_json', event.sessionId);
        } else if (event.sanitizer?.pii?.entities) {
          event.pii_classification = event.sanitizer.pii.entities;
        } else {
          event.pii_classification = [];
        }
        if (!event.pii_sanitized && event.sanitizer?.pii?.has !== undefined) {
          event.pii_sanitized = event.sanitizer.pii.has ? 1 : 0;
        }

        return event;
      }
    } catch (error) {
      errorCount++;
      lastError = error;

      const status =
        error?.responseStatus ??
        Number(error?.message?.match?.(/HTTP (\d{3})/)?.[1]);

      if (status === 401 || status === 403) {
        throw new Error(
          `ClickHouse authentication failed (HTTP ${status}). `
          + 'Check CLICKHOUSE_USER / CLICKHOUSE_PASSWORD configuration.'
        );
      }

      // Log warning but continue polling (may be transient error)
      console.warn(`ClickHouse query error (attempt ${errorCount}):`, error.message);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Timeout reached - if we have persistent errors, throw them
  if (lastError && errorCount > 3) {
    throw new Error(
      `ClickHouse polling failed after ${errorCount} attempts over ${maxWaitMs}ms. ` +
      `Last error: ${lastError.message}. ` +
      `Criteria: ${JSON.stringify(criteria)}`
    );
  }

  return null; // Timeout - event not found (no persistent errors)
}

/**
 * Send prompt and wait for ClickHouse logging
 * Combines sendToWorkflow() and waitForClickHouseEvent()
 * @param {string} chatInput - The prompt text to test
 * @param {Object} options - Additional options
 * @returns {Promise<{webhook: Object, event: Object}>}
 */
export async function sendAndVerify(chatInput, maxWaitOrOptions = {}, maybeOptions = {}) {
  let maxWait = 5000;
  let requestOptions = {};
  let initialDelayMs = 50;

  const applyOptionsObject = (opt = {}) => {
    let delay = initialDelayMs;
    let waitOverride = undefined;
    const {
      initialDelayMs: providedDelay,
      maxWait: providedMaxWait,
      ...rest
    } = opt || {};

    if (typeof providedDelay === 'number' && providedDelay >= 0) {
      delay = providedDelay;
    }
    if (typeof providedMaxWait === 'number' && providedMaxWait > 0) {
      waitOverride = providedMaxWait;
    }
    return {
      delay,
      waitOverride,
      rest
    };
  };

  if (typeof maxWaitOrOptions === 'number') {
    maxWait = maxWaitOrOptions;
    if (maybeOptions && typeof maybeOptions === 'object') {
      const { delay, waitOverride, rest } = applyOptionsObject(maybeOptions);
      initialDelayMs = delay;
      if (waitOverride) {
        maxWait = waitOverride;
      }
      requestOptions = rest;
    }
  } else if (typeof maxWaitOrOptions === 'object' && maxWaitOrOptions !== null) {
    const { delay, waitOverride, rest } = applyOptionsObject(maxWaitOrOptions);
    initialDelayMs = delay;
    if (waitOverride) {
      maxWait = waitOverride;
    }
    requestOptions = rest;
  } else if (maybeOptions && typeof maybeOptions === 'object') {
    const { delay, waitOverride, rest } = applyOptionsObject(maybeOptions);
    initialDelayMs = delay;
    if (waitOverride) {
      maxWait = waitOverride;
    }
    requestOptions = rest;
  }

  const webhookResponse = await sendToWorkflow(chatInput, requestOptions);

  if (initialDelayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, initialDelayMs));
  }

  const event = await waitForClickHouseEvent({
    sessionId: webhookResponse.sessionId
  }, maxWait);

  if (!event) {
    throw new Error(
      `Event not found in ClickHouse for sessionId: ${webhookResponse.sessionId}`
    );
  }

  // Return event directly (not wrapped) so tests can access properties directly
  return event;
}

/**
 * Helper to assert detection results
 * @param {Object} event - ClickHouse event
 * @param {Object} expected - Expected values
 */
export function assertDetection(event, expected) {
  const errors = [];

  if (expected.status) {
    const acceptableStatuses = Array.isArray(expected.status)
      ? expected.status
      : [expected.status];

    if (!acceptableStatuses.includes(event.final_status)) {
      errors.push(
        `Expected status ${acceptableStatuses.join(' OR ')}, got ${event.final_status}`
      );
    }
  }

  if (expected.minScore !== undefined && event.sanitizer.score < expected.minScore) {
    errors.push(
      `Expected score >= ${expected.minScore}, got ${event.sanitizer.score}`
    );
  }

  if (expected.maxScore !== undefined && event.sanitizer.score > expected.maxScore) {
    errors.push(
      `Expected score <= ${expected.maxScore}, got ${event.sanitizer.score}`
    );
  }

  if (expected.categories) {
    const detectedCategories = Object.keys(event.sanitizer.breakdown || {});
    for (const category of expected.categories) {
      if (!detectedCategories.includes(category)) {
        errors.push(
          `Expected category '${category}' not found. Detected: ${detectedCategories.join(', ')}`
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Detection assertion failed:\n${errors.join('\n')}`);
  }
}

function extractEntityText(entity, input) {
  if (typeof entity?.start !== 'number' || typeof entity?.end !== 'number') {
    throw new Error(
      `Invalid entity bounds: start=${entity?.start}, end=${entity?.end}`
    );
  }

  if (
    entity.start < 0 ||
    entity.end < 0 ||
    entity.end > input.length ||
    entity.start > entity.end
  ) {
    throw new Error(
      `Entity bounds out of range: start=${entity.start}, end=${entity.end}, `
      + `input length=${input.length}`
    );
  }

  return input.substring(entity.start, entity.end);
}

/**
 * Test webhook for PII tests (returns full event with ClickHouse data)
 * Sends prompt to workflow and returns ClickHouse event with PII details
 * @param {string|Object} payloadOrString - Request payload with chatInput or just the string
 * @returns {Promise<Object>} ClickHouse event with pii field populated
 */
export async function testWebhook(payloadOrString) {
  // Handle both string and object inputs for backward compatibility
  const chatInput = typeof payloadOrString === 'string'
    ? payloadOrString
    : (payloadOrString.chatInput || payloadOrString);

  // Use sendAndVerify to get full ClickHouse event with PII details
  const event = await sendAndVerify(chatInput);

  // Add pii field from sanitizer for backward compatibility
  if (event.sanitizer?.pii) {
    event.pii = event.sanitizer.pii;
  }

  // CRITICAL: Enrich entities with text field extracted from ORIGINAL UNREDACTED INPUT
  // Workflow stores minimal entity format (type, start, end, score) to minimize ClickHouse storage
  // Tests expect full format with text and entity_type fields
  // IMPORTANT: Use the chatInput we sent (original unredacted), NOT event.chat_input (ClickHouse redacted)
  if (event.pii?.entities && Array.isArray(event.pii.entities)) {
    event.pii.entities = event.pii.entities.map(e => ({
      ...e,
      text: extractEntityText(e, chatInput),  // Use ORIGINAL chatInput, not ClickHouse data
      entity_type: e.type  // Map type to entity_type for test compatibility
    }));
  }

  // BACKWARD COMPATIBILITY: Map v1.8.1 ClickHouse fields to old test field names
  // v1.8.1 renamed fields: final_action, final_status, after_sanitization
  // Legacy tests expect: action, status, sanitizedBody
  if (!event.action && event.final_action !== undefined && event.final_action !== null) {
    if (typeof event.final_action !== 'string') {
      throw new Error(
        `Invalid final_action type: expected string, got ${typeof event.final_action}. `
        + `SessionId: ${event.sessionId || 'unknown'}`
      );
    }
    event.action = event.final_action.toLowerCase();
  }
  if (!event.status && event.final_status) {
    event.status = event.final_status;
  }
  if (!event.sanitizedBody && event.after_sanitization) {
    event.sanitizedBody = event.after_sanitization;
  }

  return event;
}

/**
 * Verify that an event with given original_input exists in ClickHouse
 * Used for audit trail verification
 * @param {string} originalInput - The original input text to search for
 * @returns {Promise<boolean>} True if event found, false otherwise
 */
export async function verifyClickHouseLog(originalInput) {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM n8n_logs.events_processed
      WHERE original_input = '${originalInput.replace(/'/g, "\\'")}'
      FORMAT JSON
    `;

    const { clickhouseHost, headers } = getClickhouseConnection();

    const response = await fetch(`${clickhouseHost}/?query=${encodeURIComponent(query)}`, {
      headers
    });

    if (!response.ok) {
      console.warn(`ClickHouse query failed: HTTP ${response.status}`);
      return false;
    }

    const result = await response.json();
    return result.data && result.data[0] && result.data[0].count > 0;
  } catch (error) {
    console.warn(`ClickHouse verification error: ${error.message}`);
    return false;
  }
}

// JWT token cache to avoid rate limiting (HTTP 429)
// Backend tokens are valid for 24 hours, but we cache for only 23 hours
// to provide a 1-hour safety margin and avoid edge cases where token
// expires between validation check and actual use
let cachedToken = null;
let tokenExpiryTime = 0;

/**
 * Login to Web UI backend and get JWT token (with caching)
 *
 * CACHING BEHAVIOR:
 * - Tokens valid for 24 hours (backend JWT_SECRET configuration)
 * - Cached for 23 hours (1-hour safety margin)
 * - Safety margin accounts for:
 *   1. Clock skew between test runner and backend (max 60s expected)
 *   2. Test execution time (avoid mid-test expiration)
 *   3. Token validation race conditions
 *
 * @param {boolean} forceRefresh - Force new login even if cached token exists
 * @returns {Promise<string>} JWT token
 * @throws {Error} If login fails (wrong password, backend down, rate limited)
 */
export async function loginToBackend(forceRefresh = false) {
  // Return cached token if still valid (23-hour safety margin)
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiryTime) {
    return cachedToken;
  }

  const password = process.env.WEB_UI_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('WEB_UI_ADMIN_PASSWORD not set in .env file');
  }

  const response = await fetch('http://localhost:8787/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed: HTTP ${response.status}\n${text}`);
  }

  const data = await response.json();

  // Cache token for 23 hours (tokens valid for 24h)
  cachedToken = data.token;
  tokenExpiryTime = Date.now() + (23 * 60 * 60 * 1000);

  return data.token;
}

/**
 * Get current PII configuration from backend
 *
 * Reads unified_config.json via /api/parse to get actual entity list and ETag
 * for optimistic locking. This is CRITICAL for tests to capture and restore
 * the user's original configuration.
 *
 * @param {string} token - JWT token
 * @returns {Promise<{entities: string[], etag: string}>}
 */
export async function getPiiConfig(token) {
  const response = await fetch('http://localhost:8787/api/parse/unified_config.json', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to get PII config: HTTP ${response.status}`);
  }

  const data = await response.json();

  // Extract PII entities from unified_config.json structure
  const entities = data.parsed?.pii_detection?.entities || [];
  const etag = data.etag || '';

  return { entities, etag };
}

/**
 * Update PII entity configuration via backend API
 *
 * CRITICAL: Uses optimistic locking with ETags to prevent race conditions.
 * Tests MUST capture and restore the original config to avoid data loss.
 *
 * @param {string} token - JWT token
 * @param {string[]} entities - List of enabled entity types
 * @param {string} etag - Current unified_config.json ETag for optimistic locking
 * @returns {Promise<{success: boolean, etags: Record<string, string>}>} Updated configuration with new ETags
 */
export async function updatePiiEntities(token, entities, etag) {
  // Backend expects etags as {filename: etag} object
  const etags = { 'unified_config.json': etag };

  const response = await fetch('http://localhost:8787/api/pii-detection/save-config', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ enabledEntities: entities, etags })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update PII entities: HTTP ${response.status}\n${text}`);
  }

  return response.json();
}

/**
 * Disable a specific PII entity type
 * @param {string} entityType - Entity type to disable (e.g., 'URL', 'EMAIL_ADDRESS')
 * @returns {Promise<void>}
 */
export async function disablePiiEntity(entityType) {
  const token = await loginToBackend();
  const { entities, etag } = await getPiiConfig(token);

  // Remove entity if present
  const updatedEntities = entities.filter(e => e !== entityType);

  if (updatedEntities.length === entities.length) {
    console.log(`Entity ${entityType} was already disabled`);
    return;
  }

  await updatePiiEntities(token, updatedEntities, etag);
  console.log(`✅ Disabled PII entity: ${entityType}`);
}

/**
 * Enable a specific PII entity type
 * @param {string} entityType - Entity type to enable (e.g., 'URL', 'EMAIL_ADDRESS')
 * @returns {Promise<void>}
 */
export async function enablePiiEntity(entityType) {
  const token = await loginToBackend();
  const { entities, etag } = await getPiiConfig(token);

  // Add entity if not present
  if (entities.includes(entityType)) {
    console.log(`Entity ${entityType} was already enabled`);
    return;
  }

  const updatedEntities = [...entities, entityType];
  await updatePiiEntities(token, updatedEntities, etag);
  console.log(`✅ Enabled PII entity: ${entityType}`);
}

/**
 * Set PII configuration to exact entity list (deterministic setup)
 * This replaces the entity list entirely, ensuring tests start from known state
 * @param {string[]} entities - Exact list of enabled entities
 * @returns {Promise<void>}
 */
export async function setPiiConfig(entities) {
  const token = await loginToBackend();
  const { etag } = await getPiiConfig(token);

  await updatePiiEntities(token, entities, etag);
  console.log(`✅ Set PII config to: ${entities.join(', ')}`);
}

/**
 * Wait for PII configuration to sync across all services
 *
 * ARCHITECTURE: PII config is stored in unified_config.json and read by:
 * 1. Web UI backend (immediate)
 * 2. n8n workflow Code nodes (cached, ~500ms to reload)
 * 3. Presidio API service (file watcher, ~1-2s delay)
 *
 * This function polls /api/pii-detection/validate-config which checks
 * MD5 hashes across all three services until they match.
 *
 * Polling interval: 500ms (balances responsiveness vs API load)
 * Default timeout: 5000ms (covers worst-case Presidio file watcher delay)
 *
 * @param {number} maxWaitMs - Maximum time to wait (default: 5000ms)
 * @returns {Promise<boolean>} True if consistent, throws on timeout or errors
 * @throws {Error} On timeout, authentication failure, or service unavailable
 *
 * IMPORTANT: This function THROWS on failure to prevent tests from running
 * with stale configuration which would cause flaky failures.
 */
export async function waitForPiiConfigSync(maxWaitMs = 5000) {
  const token = await loginToBackend();
  const startTime = Date.now();
  const pollInterval = 500;
  let lastError = null;
  let errorCount = 0;
  const MAX_TRANSIENT_ERRORS = 3;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch('http://localhost:8787/api/pii-detection/validate-config', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        // CRITICAL: Don't swallow HTTP errors
        const text = await response.text();
        const error = new Error(
          `Config validation failed: HTTP ${response.status}\n${text}`
        );
        error.responseStatus = response.status;
        throw error;
      }

      const data = await response.json();
      if (data.consistent) {
        console.log('✅ PII config synced across all services');
        return true;
      }
      console.log(`⏳ Config not synced yet (${Date.now() - startTime}ms elapsed)`);

      // Reset error count on successful poll
      errorCount = 0;

    } catch (error) {
      errorCount++;
      lastError = error;

      const status = error?.responseStatus ??
        Number(error?.message?.match?.(/HTTP (\d{3})/)?.[1]);

      // CRITICAL: Authentication/authorization errors should fail immediately
      if (status === 401 || status === 403) {
        throw new Error(
          `Config sync authentication failed: ${error.message}. ` +
          `Check JWT token validity and user permissions.`
        );
      }

      console.error(
        `Config sync check failed (attempt ${errorCount}/${MAX_TRANSIENT_ERRORS}): ${error.message}`
      );

      // CRITICAL: Too many transient errors indicate real problem
      if (errorCount > MAX_TRANSIENT_ERRORS) {
        throw new Error(
          `Config sync check failed ${errorCount} times. ` +
          `Last error: ${lastError.message}. ` +
          `Backend service may be down or unreachable. ` +
          `Check: docker ps | grep web-ui-backend`
        );
      }
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // CRITICAL: Timeout without sync is a FAILURE, not a warning
  throw new Error(
    `Config sync timeout after ${maxWaitMs}ms. ` +
    `Configuration may be inconsistent across services. ` +
    `Last error: ${lastError?.message || 'none'}. ` +
    `This will cause test failures - cannot proceed with stale config.`
  );
}

// Backwards compatibility for auto-generated tests that still import sendToWebhook
export { sendToWorkflow as sendToWebhook };
