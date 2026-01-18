// vitest.config.js
import { defineConfig } from 'vitest/config';
import PrettyReporter from './tests/pretty-reporter.js';

export default defineConfig({
    test: {
        environment: 'jsdom', // Simulates browser for DOM tests
        globals: true,        // Allows using describe, it, expect without imports
        setupFiles: ['./tests/setup.js'], // We need to mock some browser APIs
        include: ['tests/**/*.test.js'],
        reporters: [new PrettyReporter()],
    },
});