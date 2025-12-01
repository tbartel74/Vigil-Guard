/**
 * Smoke Tests - Service Health Checks
 *
 * Validates that all 9 Vigil Guard services are running and healthy.
 * Run this before the full test suite to catch infrastructure issues early.
 *
 * Services tested:
 * - n8n workflow engine
 * - Presidio PII API
 * - Language Detector API
 * - ClickHouse database
 * - Grafana monitoring
 * - Web UI Backend
 * - Web UI Frontend
 * - Caddy reverse proxy
 * - Prompt Guard API (optional)
 *
 * Usage:
 *   npm run test:smoke
 *   npm test -- smoke-services.test.js
 */

import { describe, test, expect } from 'vitest';
import { WEBHOOK_URL } from '../helpers/webhook.js';

// Timeout for health checks (5 seconds per service)
const HEALTH_CHECK_TIMEOUT = 5000;

/**
 * Helper to make HTTP GET request with timeout
 * @param {string} url - Endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || HEALTH_CHECK_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${options.timeout || HEALTH_CHECK_TIMEOUT}ms`);
    }
    throw error;
  }
}

describe('Service Health Checks (Smoke Tests)', () => {

  describe('Core Workflow Services', () => {
    test('n8n workflow engine should be healthy', async () => {
      const response = await fetchWithTimeout('http://localhost:5678/healthz');

      expect(response.status).toBe(200);
    }, 10000);

    test('Presidio PII API should be healthy', async () => {
      const response = await fetchWithTimeout('http://localhost:5001/health');

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data.status).toBe('healthy');

    }, 10000);

    test('Language Detector API should be healthy', async () => {
      const response = await fetchWithTimeout('http://localhost:5002/health');

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data.status).toBe('healthy');

    }, 10000);
  });

  describe('Data & Monitoring Services', () => {
    test('ClickHouse database should be healthy', async () => {
      const response = await fetchWithTimeout('http://localhost:8123/ping');

      expect(response.status).toBe(200);

      const text = await response.text();
      expect(text).toBe('Ok.\n');

    }, 10000);

    test('Grafana monitoring should be healthy', async () => {
      const response = await fetchWithTimeout('http://localhost:3001/api/health');

      expect(response.status).toBe(200);
    }, 10000);
  });

  describe('Web UI Services', () => {
    test('Web UI Backend should be healthy', async () => {
      const response = await fetchWithTimeout('http://localhost:8787/health');

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      // Backend returns 'ok' not 'healthy'
      expect(data.status).toBe('ok');

    }, 10000);

    test('Web UI Frontend should be accessible', async () => {
      const response = await fetchWithTimeout('http://localhost/ui/', {
        redirect: 'follow'
      });

      expect(response.status).toBe(200);

      const contentType = response.headers.get('content-type');
      expect(contentType).toMatch(/text\/html/);

    }, 10000);

    test('Caddy reverse proxy should be healthy', async () => {
      const response = await fetchWithTimeout('http://localhost/', {
        redirect: 'manual'
      });

      // Accept 200 OK or 3xx redirects as healthy
      expect([200, 301, 302, 303, 307, 308]).toContain(response.status);
    }, 10000);
  });

  describe('Optional Services', () => {
    test('Prompt Guard API should be healthy (optional)', async () => {
      try {
        const response = await fetchWithTimeout('http://localhost:8000/health');

        expect(response.status).toBe(200);
      } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
          // Don't fail test - this service is optional
        } else {
          throw error;
        }
      }
    }, 10000);
  });

  describe('Critical Endpoint Tests', () => {
    test('n8n webhook endpoint should be accessible', async () => {
      // This doesn't test execution, just that the webhook URL is reachable
      // Real webhook test in other suites
      // v2.0.0: Uses centralized WEBHOOK_URL from helpers/webhook.js

      try {
        const response = await fetchWithTimeout(WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId: 'smoke-test',
            action: 'sendMessage',
            chatInput: 'health check'
          })
        });

        // Accept any response (even errors) as long as endpoint is reachable
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);

      } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
          throw new Error('n8n webhook endpoint not accessible - is n8n running?');
        }
        throw error;
      }
    }, 10000);

    test('ClickHouse can execute simple query', async () => {
      const query = 'SELECT 1 as test';
      const clickhousePassword = process.env.CLICKHOUSE_PASSWORD || '';
      const auth = Buffer.from(`admin:${clickhousePassword}`).toString('base64');

      const response = await fetchWithTimeout(
        `http://localhost:8123/?query=${encodeURIComponent(query)}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );

      expect(response.status).toBe(200);

      const text = await response.text();
      expect(text).toContain('1');

    }, 10000);

    test('ClickHouse n8n_logs database exists', async () => {
      const query = 'SHOW DATABASES';
      const clickhousePassword = process.env.CLICKHOUSE_PASSWORD || '';
      const auth = Buffer.from(`admin:${clickhousePassword}`).toString('base64');

      const response = await fetchWithTimeout(
        `http://localhost:8123/?query=${encodeURIComponent(query)}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );

      expect(response.status).toBe(200);

      const text = await response.text();
      expect(text).toContain('n8n_logs');

    }, 10000);

    test('ClickHouse events_v2 table exists', async () => {
      // v2.0.0: Test for events_v2 table (3-branch detection architecture)
      const query = 'SHOW TABLES FROM n8n_logs';
      const clickhousePassword = process.env.CLICKHOUSE_PASSWORD || '';
      const auth = Buffer.from(`admin:${clickhousePassword}`).toString('base64');

      const response = await fetchWithTimeout(
        `http://localhost:8123/?query=${encodeURIComponent(query)}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );

      expect(response.status).toBe(200);

      const text = await response.text();
      expect(text).toContain('events_v2');

    }, 10000);
  });

  describe('Service Integration Tests', () => {
    test('Web UI Backend can connect to ClickHouse', async () => {
      // The backend health endpoint verifies database connectivity
      const response = await fetchWithTimeout('http://localhost:8787/health');

      expect(response.status).toBe(200);

      const data = await response.json();
      // Backend returns 'ok' not 'healthy'
      expect(data.status).toBe('ok');

      // If the backend can respond with healthy status, it has database access
    }, 10000);

    test('Caddy can proxy to Web UI Frontend', async () => {
      const response = await fetchWithTimeout('http://localhost/ui/', {
        redirect: 'follow'
      });

      expect(response.status).toBe(200);

      // Verify we got HTML content (not an error page)
      const text = await response.text();
      // HTML5 allows lowercase <!doctype html>
      expect(text.toLowerCase()).toContain('<!doctype html>');

    }, 10000);
  });
});
