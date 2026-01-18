// vitest.config.js
import { defineConfig } from 'vitest/config';
import PrettyReporter from './tests/pretty-reporter.js';

// Use pretty reporter locally, default reporter in CI for cleaner logs
const isCI = process.env.CI === 'true';

export default defineConfig({
    test: {
        environment: 'jsdom', // Simulates browser for DOM tests
        globals: true,        // Allows using describe, it, expect without imports
        setupFiles: ['./tests/setup.js'], // We need to mock some browser APIs
        include: ['tests/**/*.test.js'],
        reporters: isCI ? ['default'] : [new PrettyReporter()],
    },
});