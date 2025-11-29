import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import { resolve } from 'path'

// Suppress Node.js promise rejection warnings for cleaner test output
process.on('unhandledRejection', () => {});
process.on('rejectionHandled', () => {});
process.removeAllListeners('warning');

// Load environment variables from root .env file
config({ path: resolve(process.cwd(), '../../.env') })

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    pool: 'forks',  // Use forks instead of threads to avoid tinypool issues
    poolOptions: {
      forks: {
        singleFork: false
      }
    },
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    isolate: true,
    fileParallelism: false,
    maxConcurrency: 1,
    sequence: {
      concurrent: false,
      shuffle: false
    },
    // Custom progress bar reporter
    reporters: ['./tests/helpers/vitest-reporter.js']
  }
})
