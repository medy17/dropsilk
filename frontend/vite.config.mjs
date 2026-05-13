import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const utilPolyfillPath = require.resolve('util/');

export default defineConfig({
    resolve: {
        alias: [
            { find: /^util$/, replacement: utilPolyfillPath },
        ],
    },
    build: {
        chunkSizeWarningLimit: 2000, // Suppress large chunk warnings (pdf.worker is ~1.9MB)
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                not_found: resolve(__dirname, '404.html'),
                status: resolve(__dirname, 'status.html'),
            },
        },
    },
    publicDir: 'public',
    preview: {
        mode: 'development', // Run preview in development mode to connect to local backend
        port: 4173,
        host: true,
    },
});
