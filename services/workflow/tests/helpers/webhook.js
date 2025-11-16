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
        throw new Error(`ClickHouse query failed: HTTP ${response.status}`);
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

/**
 * Test webhook for sanitization-integrity tests
 * Sends prompt to workflow and returns webhook response
 * @param {Object} payload - Request payload with chatInput
 * @returns {Promise<Object>} Webhook response with action and sanitizedBody
 */
export async function testWebhook(payload) {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
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

// Backwards compatibility for auto-generated tests that still import sendToWebhook
export { sendToWorkflow as sendToWebhook };
