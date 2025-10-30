/**
 * Webhook helper utilities for E2E testing
 */

export const WEBHOOK_URL = 'http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1';

/**
 * Safely parse JSON with detailed error reporting
 * @param {string} jsonString - JSON string to parse
 * @param {string} fieldName - Name of the field (for error messages)
 * @param {string} context - Additional context (e.g., sessionId)
 * @returns {Object} Parsed JSON object
 * @throws {Error} With detailed error message if parsing fails
 */
export function parseJSONSafely(jsonString, fieldName, context = '') {
    try {
        return JSON.parse(jsonString || '{}');
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
          timestamp,
          original_input,
          normalized_input,
          final_status,
          final_action,
          threat_score,
          sanitizer_json,
          final_decision_json,
          raw_event
        FROM n8n_logs.events_processed
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT 1
        FORMAT JSON
      `;

      // ClickHouse Basic Auth credentials (from environment or .env)
      const clickhousePassword = process.env.CLICKHOUSE_PASSWORD || '';
      const auth = Buffer.from(`admin:${clickhousePassword}`).toString('base64');

      const response = await fetch(`http://localhost:8123/?query=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Basic ${auth}`
        }
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
export async function sendAndVerify(chatInput, options = {}) {
  const webhookResponse = await sendToWorkflow(chatInput, options);

  // Wait a bit for async logging
  await new Promise(resolve => setTimeout(resolve, 1000));

  const event = await waitForClickHouseEvent({
    sessionId: webhookResponse.sessionId
  }, options.maxWait || 5000);

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
