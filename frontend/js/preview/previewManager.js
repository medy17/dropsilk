// js/preview/previewManager.js
// Manages loading and displaying file previews in a modal.

import { previewConfig } from './previewConfig.js';
import { store } from '../state.js';

// --- DOM elements for the preview modal ---
const previewModal = document.getElementById('previewModal');
const previewHeader = document.getElementById('preview-header-title');
const previewContent = document.getElementById('preview-content');
const previewLoader = document.getElementById('preview-loader');

// --- Resource Loading Utilities ---
const loadedResources = new Set();

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
    previewContent.innerHTML = '';
    previewContent.style.display = 'none';
    document.getElementById('openPreviewModal').click(); // Use the hidden trigger

    try {
        // 2. Load dependencies
        if (config.dependencies) {
            await Promise.all(config.dependencies.map(loadScript));
        }
        if (config.stylesheets) {
            config.stylesheets.forEach(loadStylesheet);
        }

        // 3. Dynamically import and execute the handler
        const handlerModule = await config.handler();
        await handlerModule.default(file.blob, previewContent); // Pass blob and content area

        // 4. Hide loader and show content
        previewLoader.style.display = 'none';
        previewContent.style.display = 'block';

    } catch (error) {
        console.error("Error loading preview:", error);
        previewContent.innerHTML = `<div class="empty-state">Preview for this file type is not available or the file may be corrupt.</div>`;
        previewLoader.style.display = 'none';
        previewContent.style.display = 'block';
    }
}