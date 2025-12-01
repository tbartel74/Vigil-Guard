import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from root .env file
// override: true ensures .env takes precedence over existing shell variables
config({ path: resolve(process.cwd(), '../../.env'), override: true })

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    pool: 'forks',  // Use forks instead of threads to avoid tinypool issues
    poolOptions: {
      forks: {
        singleFork: false,
        // Suppress PromiseRejectionHandledWarning in forked processes
        execArgv: ['--no-warnings']
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
