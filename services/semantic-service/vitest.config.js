import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 30000,
        hookTimeout: 30000,
        include: ['tests/**/*.test.js'],
        exclude: ['node_modules', 'models', 'data'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.js'],
            exclude: ['src/server.js']
        },
        reporters: ['verbose'],
        sequence: {
            shuffle: false
        },
        pool: 'forks',
        deps: {
            interopDefault: true
        }
    }
});
