const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    {
        // Common settings
        languageOptions: {
            ecmaVersion: 2022,
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.jest,
            }
        },
        rules: {
            'indent': ['error', 4],
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            'no-unused-vars': 'warn'
        }
    },
    {
        // ESM files (Source, Tests, Vite config)
        files: ['src/**/*.{js,jsx}', 'tests/**/*.{js,jsx}', 'vite.config.js'],
        languageOptions: {
            sourceType: 'module'
        }
    },
    {
        // CJS files (Scripts, Electron, ESLint config)
        files: ['scripts/**/*.js', 'electron/**/*.js', 'eslint.config.js'], // explicitly CJS
        languageOptions: {
            sourceType: 'commonjs'
        }
    },
    {
        ignores: ['dist/', 'release/', 'coverage/', 'public/', '**/*.gen.js']
    }
];
