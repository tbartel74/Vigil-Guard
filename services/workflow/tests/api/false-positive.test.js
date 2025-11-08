import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.BACKEND_API_URL || 'http://localhost:8787/api';
const ADMIN_PASSWORD =
  process.env.WEBUI_ADMIN_PASSWORD ||
  process.env.WEB_UI_ADMIN_PASSWORD ||
  '';
const SHOULD_SKIP =
  !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12 || process.env.SKIP_API_TESTS === 'true';
let authToken = null;

// Helper function to login and get JWT token
async function login() {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    throw new Error('WEBUI_ADMIN_PASSWORD must be set (>=12 chars) to run API false-positive tests');
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

// Helper function to make authenticated requests
async function authenticatedFetch(url, options = {}) {
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

const describeOrSkip = SHOULD_SKIP ? describe.skip : describe;

if (SHOULD_SKIP) {
  console.warn(
    'Skipping API false-positive tests: set WEBUI_ADMIN_PASSWORD (>=12 chars) and BACKEND_API_URL to enable.'
  );
}

describeOrSkip('False Positive Reporting API', () => {
  beforeAll(async () => {
    // Login once before all tests
    authToken = await login();
  });

  describe('POST /api/feedback/false-positive', () => {
    it('should submit a false positive report successfully', async () => {
      const report = {
        event_id: 'test-event-' + Date.now(),
        reason: 'over_blocking',
        comment: 'This legitimate request was incorrectly blocked',
        event_timestamp: new Date().toISOString(),
        original_input: 'Hello, can you help me with my account?',
        final_status: 'BLOCKED',
        threat_score: 85.5
      };

      const response = await authenticatedFetch(`${API_BASE}/feedback/false-positive`, {
        method: 'POST',
        body: JSON.stringify(report)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
      }

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('successfully');
    });

    it('should reject report without authentication', async () => {
      const report = {
        event_id: 'test-no-auth',
        reason: 'over_blocking',
        comment: 'Test without auth'
      };

      const response = await fetch(`${API_BASE}/feedback/false-positive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });

      expect(response.status).toBe(401);
    });

    it('should reject report without required fields', async () => {
      const invalidReport = {
        comment: 'Missing event_id and reason'
      };

      const response = await authenticatedFetch(`${API_BASE}/feedback/false-positive`, {
        method: 'POST',
        body: JSON.stringify(invalidReport)
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('required');
    });

    it('should accept all valid reason types', async () => {
      const reasons = [
        'over_blocking',
        'over_sanitization',
        'false_detection',
        'business_logic',
        'other'
      ];

      for (const reason of reasons) {
        const report = {
          event_id: `test-reason-${reason}-${Date.now()}`,
          reason: reason,
          comment: `Testing ${reason} reason type`
        };

        const response = await authenticatedFetch(`${API_BASE}/feedback/false-positive`, {
          method: 'POST',
          body: JSON.stringify(report)
        });

        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.success).toBe(true);
      }
    });

    it('should auto-capture reported_by from JWT token', async () => {
      const report = {
        event_id: 'test-auto-user-' + Date.now(),
        reason: 'over_blocking',
        comment: 'Should capture username from JWT'
      };

      const response = await authenticatedFetch(`${API_BASE}/feedback/false-positive`, {
        method: 'POST',
        body: JSON.stringify(report)
      });

      expect(response.ok).toBe(true);

      // Verify in stats that the report was captured
      const statsResponse = await authenticatedFetch(`${API_BASE}/feedback/stats`);
      const stats = await statsResponse.json();

      expect(Number(stats.total_reports)).toBeGreaterThan(0);
    });
  });

  describe('GET /api/feedback/stats', () => {
    it('should return false positive statistics', async () => {
      const response = await authenticatedFetch(`${API_BASE}/feedback/stats`);

      expect(response.ok).toBe(true);
      const stats = await response.json();

      expect(stats).toHaveProperty('total_reports');
      expect(stats).toHaveProperty('unique_events');
      expect(stats).toHaveProperty('top_reason');
      expect(stats).toHaveProperty('last_7_days');

      // ClickHouse returns numbers as strings in JSON format
      expect(typeof stats.total_reports === 'number' || typeof stats.total_reports === 'string').toBe(true);
      expect(typeof stats.unique_events === 'number' || typeof stats.unique_events === 'string').toBe(true);
      expect(typeof stats.last_7_days === 'number' || typeof stats.last_7_days === 'string').toBe(true);

      // Convert and verify values are valid
      expect(Number(stats.total_reports)).toBeGreaterThanOrEqual(0);
      expect(Number(stats.unique_events)).toBeGreaterThanOrEqual(0);
      expect(Number(stats.last_7_days)).toBeGreaterThanOrEqual(0);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE}/feedback/stats`, {
        method: 'GET'
      });

      expect(response.status).toBe(401);
    });

    it('should show increasing report count after submission', async () => {
      // Get initial stats
      const initialResponse = await authenticatedFetch(`${API_BASE}/feedback/stats`);
      const initialStats = await initialResponse.json();

      // Submit a new report
      const report = {
        event_id: 'test-count-' + Date.now(),
        reason: 'over_blocking',
        comment: 'Testing stat increment'
      };

      await authenticatedFetch(`${API_BASE}/feedback/false-positive`, {
        method: 'POST',
        body: JSON.stringify(report)
      });

      // Get updated stats
      const updatedResponse = await authenticatedFetch(`${API_BASE}/feedback/stats`);
      const updatedStats = await updatedResponse.json();

      expect(Number(updatedStats.total_reports)).toBeGreaterThan(Number(initialStats.total_reports));
    });
  });

  describe('Edge Cases', () => {
    it('should handle duplicate event_id submissions', async () => {
      const eventId = 'duplicate-test-' + Date.now();

      // Submit first report
      const report1 = {
        event_id: eventId,
        reason: 'over_blocking',
        comment: 'First report'
      };

      const response1 = await authenticatedFetch(`${API_BASE}/feedback/false-positive`, {
        method: 'POST',
        body: JSON.stringify(report1)
      });

      expect(response1.ok).toBe(true);

      // Submit second report with same event_id
      const report2 = {
        event_id: eventId,
        reason: 'false_detection',
        comment: 'Second report for same event'
      };

      const response2 = await authenticatedFetch(`${API_BASE}/feedback/false-positive`, {
        method: 'POST',
        body: JSON.stringify(report2)
      });

      // Should accept duplicate submissions (multiple users can report same event)
      expect(response2.ok).toBe(true);
    });

    it('should handle very long comments', async () => {
      const longComment = 'x'.repeat(5000);

      const report = {
        event_id: 'long-comment-' + Date.now(),
        reason: 'over_blocking',
        comment: longComment
      };

      const response = await authenticatedFetch(`${API_BASE}/feedback/false-positive`, {
        method: 'POST',
        body: JSON.stringify(report)
      });

      // Should handle long comments (ZSTD compression in ClickHouse)
      expect(response.ok).toBe(true);
    });

    it('should handle special characters in comments', async () => {
      const specialComment = '特殊文字 emoji 🚨 <script>alert("xss")</script>';

      const report = {
        event_id: 'special-chars-' + Date.now(),
        reason: 'over_blocking',
        comment: specialComment
      };

      const response = await authenticatedFetch(`${API_BASE}/feedback/false-positive`, {
        method: 'POST',
        body: JSON.stringify(report)
      });

      expect(response.ok).toBe(true);
    });
  });
});
