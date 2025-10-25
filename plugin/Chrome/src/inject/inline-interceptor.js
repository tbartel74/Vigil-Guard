// Inline version of interceptor for debugging
const INTERCEPTOR_CODE = `
(function() {
  'use strict';

  console.log('%c[Vigil Guard Interceptor] STARTING', 'background: #667eea; color: white; padding: 2px 5px; border-radius: 3px');

  // Store originals
  const originalFetch = window.fetch;

  // Counter
  let interceptCount = 0;

  // Override fetch
  window.fetch = function(...args) {
    const [url, init] = args;
    const urlStr = typeof url === 'string' ? url : url.toString();

    console.log('%c[VG] Fetch intercepted:', 'color: #667eea', urlStr);
    interceptCount++;

    // Check if it's a ChatGPT API call
    if (urlStr.includes('backend-api') || urlStr.includes('conversation')) {
      console.log('%c[VG] ⚠️ ChatGPT API Request Detected!', 'background: red; color: white; padding: 2px 5px');

      // Send message to content script
      window.postMessage({
        type: 'VIGIL_GUARD_INTERCEPT',
        requestId: 'test_' + Date.now(),
        payload: {
          url: urlStr,
          method: init?.method || 'GET',
          body: init?.body || null
        }
      }, '*');
    }

    // Continue with original fetch
    return originalFetch.apply(this, args);
  };

  // Add test function
  window.testVigilGuard = function() {
    console.log('%c[VG] Test function called!', 'background: green; color: white; padding: 2px 5px');
    console.log('Intercepted so far:', interceptCount, 'requests');

    // Test fetch
    fetch('/test-vigil-guard', { method: 'POST' }).catch(() => {
      console.log('Test fetch completed');
    });
  };

  // Expose status
  window.VigilGuardStatus = {
    active: true,
    interceptCount: 0,
    version: '0.1.0'
  };

  console.log('%c[Vigil Guard] Interceptor READY! Type window.testVigilGuard() to test', 'background: green; color: white; padding: 2px 5px');
})();
`;

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = INTERCEPTOR_CODE;
}