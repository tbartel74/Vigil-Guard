// Minimal vitest config without importing vitest/config
// This avoids ERR_MODULE_NOT_FOUND when vitest is not in local node_modules

export default {
  test: {
    // Test environment
    environment: 'node',

    // Test files location
    include: ['tests/**/*.test.js'],

    // Global timeout (important for E2E tests with workflow execution)
    testTimeout: 30000, // 30 seconds for slow workflow executions
    hookTimeout: 10000,

    // Global setup/teardown
    globalSetup: './tests/setup.js',

    // Retry failed tests (useful for flaky webhook tests)
    retry: 1,

    // Run tests in sequence (safer for webhook testing)
    sequence: {
      concurrent: false
    }
  }
};
