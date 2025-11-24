import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'coverage/',
        '*.config.js'
      ]
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: [],
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules', 'dist']
  }
});