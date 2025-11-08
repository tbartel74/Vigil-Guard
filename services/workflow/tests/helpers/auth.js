/**
 * Authentication test helpers for API testing
 *
 * Provides reusable utilities for testing JWT authentication
 * and authorization in backend API tests.
 */

const API_BASE = process.env.BACKEND_API_URL || 'http://localhost:8787/api';
const ADMIN_PASSWORD =
  process.env.WEBUI_ADMIN_PASSWORD ||
  process.env.WEB_UI_ADMIN_PASSWORD ||
  '';

// Shared token cache (per test file)
let authToken = null;

/**
 * Login and get JWT token
 * @returns {Promise<string>} JWT auth token
 * @throws {Error} If credentials are missing or login fails
 */
export async function login() {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    throw new Error(
      'WEBUI_ADMIN_PASSWORD must be set (>=12 chars) to run API tests'
    );
  }

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: ADMIN_PASSWORD
    })
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  const data = await response.json();
  return data.token;
}

/**
 * Make authenticated fetch request with JWT token
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authenticatedFetch(url, options = {}) {
  // Lazy token initialization
  if (!authToken) {
    authToken = await login();
  }

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Test that endpoint rejects requests without authentication
 * @param {string} endpoint - API endpoint path (e.g., '/feedback/false-positive')
 * @param {string} method - HTTP method (default: 'GET')
 * @param {Object} body - Optional request body
 * @returns {Promise<void>}
 * @throws {Error} If endpoint doesn't return 401 Unauthorized
 */
export async function expectUnauthorized(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);

  if (response.status !== 401) {
    throw new Error(
      `Expected 401 Unauthorized, got ${response.status} for ${method} ${endpoint}`
    );
  }
}

/**
 * Reset auth token cache (useful in beforeEach/afterEach hooks)
 */
export function resetAuthToken() {
  authToken = null;
}

/**
 * Check if tests should be skipped due to missing credentials
 * @returns {boolean} True if tests should be skipped
 */
export function shouldSkipAuthTests() {
  return (
    !ADMIN_PASSWORD ||
    ADMIN_PASSWORD.length < 12 ||
    process.env.SKIP_API_TESTS === 'true'
  );
}

/**
 * Get describe/describe.skip based on credential availability
 * @returns {Function} describe or describe.skip
 */
export function getDescribeOrSkip() {
  if (shouldSkipAuthTests()) {
    console.warn(
      '⚠️  Skipping API auth tests: set WEBUI_ADMIN_PASSWORD (>=12 chars) to enable.'
    );
    return describe.skip;
  }
  return describe;
}
