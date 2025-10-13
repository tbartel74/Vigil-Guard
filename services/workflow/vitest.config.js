import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Test files location
    include: ['tests/**/*.test.js'],

    // Global timeout (important for E2E tests with workflow execution)
    testTimeout: 30000, // 30 seconds for slow workflow executions
    hookTimeout: 10000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['lib/**/*.js'],
      exclude: [
        'tests/**',
        'node_modules/**',
        'workflows/**',
        'config/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    },

    // Reporter configuration
    reporters: ['verbose'],

    // Global setup/teardown
    globalSetup: './tests/setup.js',

    // Retry failed tests (useful for flaky webhook tests)
    retry: 1,

    // Run tests in sequence (safer for webhook testing)
    sequence: {
      concurrent: false
    }
  }
});
