// js/preview/previewManager.js
// Manages loading and displaying file previews in a modal.

import { previewConfig } from './previewConfig.js';
import { store } from '../state.js';

// --- DOM elements for the preview modal ---
const previewModal = document.getElementById('previewModal');
const previewHeader = document.getElementById('preview-header-title');
const previewContent = document.getElementById('preview-content');
const previewLoader = document.getElementById('preview-loader');
const closePreviewModalBtn = document.getElementById('closePreviewModal');

// --- Resource Loading & State ---
const loadedResources = new Set();
let currentHandlerModule = null; // Store the currently active handler module

function loadScript(url) {
    if (loadedResources.has(url)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => { loadedResources.add(url); resolve(); };
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

function loadStylesheet(url) {
    if (loadedResources.has(url)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
    loadedResources.add(url);
}

// --- Cleanup function, attached to modal close events ---
async function cleanupPreview() {
    // If the active handler has a specific cleanup function, run it.
    if (currentHandlerModule && typeof currentHandlerModule.cleanup === 'function') {
        try {
            await currentHandlerModule.cleanup();
        } catch (e) {
            console.error("Error during custom preview cleanup:", e);
        }
    }
    currentHandlerModule = null;

    // Generic cleanup
    if (previewContent.dataset.objectUrl) {
        URL.revokeObjectURL(previewContent.dataset.objectUrl);
        delete previewContent.dataset.objectUrl;
    }
    previewContent.innerHTML = '';
}

// --- Setup Modal Close Listeners ---
// This ensures cleanup happens regardless of how the modal is closed.
closePreviewModalBtn?.addEventListener('click', cleanupPreview);
previewModal?.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        cleanupPreview();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewModal.classList.contains('show')) {
        cleanupPreview();
    }
});


// --- Public Preview Function ---

/**
 * Initiates the preview process for a given file name.
 * @param {string} fileName - The name of the file to be previewed.
 */
export async function showPreview(fileName) {
    const { receivedFiles } = store.getState();
    const file = receivedFiles.find(f => f.name === fileName);

    if (!file) {
        console.error("File not found for preview:", fileName);
        return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const config = Object.values(previewConfig).find(c => c.extensions.includes(extension) && c.handler);

    if (!config) {
        console.warn(`No preview handler found for extension: ${extension}`);
        return;
    }

    // 1. Open modal and show loading state
    previewHeader.textContent = file.name;
    previewLoader.style.display = 'flex';
    previewContent.innerHTML = ''; // Ensure it's clean before loading
    previewContent.style.display = 'none';
    document.getElementById('openPreviewModal').click(); // Use the hidden trigger

    try {
        // 2. Load dependencies SEQUENTIALLY to respect order (e.g., jQuery before pptxjs)
        if (config.dependencies) {
            for (const url of config.dependencies) {
                await loadScript(url);
            }
        }
        if (config.stylesheets) {
            config.stylesheets.forEach(loadStylesheet);
        }

        // 3. Dynamically import, store, and execute the handler
        const handlerModule = await config.handler();
        currentHandlerModule = handlerModule; // Store for cleanup
        await handlerModule.default(file.blob, previewContent);

        // 4. Hide loader and show content
        previewLoader.style.display = 'none';
        previewContent.style.display = 'block';

    } catch (error) {
        console.error("Error loading preview:", error);
        previewContent.innerHTML = `<div class="empty-state">Preview failed: ${error.message}</div>`;
        previewLoader.style.display = 'none';
        previewContent.style.display = 'block';
        currentHandlerModule = null; // Clear handler on error
    }
}