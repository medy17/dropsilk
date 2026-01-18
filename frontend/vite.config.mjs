import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    build: {
        chunkSizeWarningLimit: 2000, // Suppress large chunk warnings (pdf.worker is ~1.9MB)
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                not_found: resolve(__dirname, '404.html'),
            },
        },
    },
    publicDir: 'public',
});
