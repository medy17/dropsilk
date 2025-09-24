// js/preview/previewManager.js
// Manages loading and displaying file previews in a modal.
import i18next from "../i18n.js";
import { previewConfig } from './previewConfig.js';
import { store } from '../state.js';
import { showToast } from '../utils/toast.js';

// --- DOM elements for the preview modal ---
const previewModal = document.getElementById('previewModal');
const previewHeader = document.getElementById('preview-header-title');
const previewContent = document.getElementById('preview-content');
const previewLoader = document.getElementById('preview-loader');
const closePreviewModalBtn = document.getElementById('closePreviewModal');

// --- Resource Loading & State ---
const loadedResources = new Set();
let currentHandlerModule = null; // Store the currently active handler module
const PREVIEW_CONSENT_KEY = 'dropsilk-preview-consent';

function getConsentMap() {
    try {
        return JSON.parse(localStorage.getItem(PREVIEW_CONSENT_KEY) || '{}');
    } catch { return {}; }
}

function loadScript(url) {
    if (loadedResources.has(url)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => {
            loadedResources.add(url);
            // Add extra wait time for jQuery specifically
            if (url.includes('jquery')) {
                setTimeout(resolve, 200); // Give jQuery extra time to initialize
            } else {
                resolve();
            }
        };
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

function setConsent(ext, value) {
    const map = getConsentMap();
    map[ext] = value; // 'allow' | 'deny'
    localStorage.setItem(PREVIEW_CONSENT_KEY, JSON.stringify(map));
}

export function updatePptxPreviewButtonsDisabled(isDisabled) {
    // Disable/enable any PPTX preview buttons currently in the UI
    const buttons = document.querySelectorAll(
        '.preview-btn[data-ext="pptx"]'
    );
    buttons.forEach((btn) => {
        if (!(btn instanceof HTMLButtonElement)) return;
        btn.disabled = !!isDisabled;
        // CORRECTED: Use i18next here for the tooltips
        btn.title = isDisabled
            ? i18next.t('pptxPreviewDisabledTooltip')
            : i18next.t('previewFileTooltip');
    });
}

/**
 * Show consent if required and not previously decided.
 * Returns true if allowed, false if declined.
 */
function ensureUploadConsent(ext) {
    const map = getConsentMap();
    const decided = map[ext];
    if (decided === 'allow') return Promise.resolve(true);
    if (decided === 'deny') return Promise.resolve(false);

    const rememberId = `remember-consent-${ext}-${Date.now()}`;
    return new Promise((resolve) => {
        const toast = showToast({
            type: 'info',
            // CORRECTED: Use i18next and the translation key
            title: i18next.t('pptxConsentTitle'),
            duration: 0,
            body: `
        ${i18next.t('pptxConsentBody')}
        <br/><br/>
        <label class="checkbox-label">
          <input type="checkbox"
                 id="${rememberId}"
                 class="custom-checkbox-input" />
          <span class="custom-checkbox"></span>
          <span>${i18next.t('pptxConsentRemember')}</span>
        </label>
      `,
            actions: [
                {
                    // CORRECTED: Use i18next
                    text: i18next.t('decline'),
                    class: 'btn-secondary',
                    callback: () => {
                        const remember = !!toast.element.querySelector(
                            `#${rememberId}`
                        )?.checked;
                        if (remember) {
                            setConsent(ext, 'deny');
                            if (ext === 'pptx') updatePptxPreviewButtonsDisabled(true);
                        }
                        resolve(false);
                    },
                },
                {
                    // CORRECTED: Use i18next
                    text: i18next.t('continue'),
                    class: 'btn-primary',
                    callback: () => {
                        const remember = !!toast.element.querySelector(
                            `#${rememberId}`
                        )?.checked;
                        if (remember) {
                            setConsent(ext, 'allow');
                            if (ext === 'pptx') updatePptxPreviewButtonsDisabled(false);
                        }
                        resolve(true);
                    },
                },
            ],
        });
    });
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

    // If this preview requires upload consent (e.g., PPTX), handle that first.
    if (config.requiresUploadConsent) {
        const allowed = await ensureUploadConsent(extension);
        if (!allowed) {
            // User declined; cancel the pending operation silently.
            return;
        }
    }

    // Proceed with preview (open modal only after consent is granted)
    previewHeader.textContent = file.name;
    previewLoader.style.display = 'flex';
    previewContent.innerHTML = '';
    previewContent.style.display = 'none';
    document.getElementById('openPreviewModal').click();

    try {
        // CRITICAL: Load dependencies SEQUENTIALLY to guarantee jQuery is ready before pptx2html
        if (config.dependencies) {
            for (const url of config.dependencies) {
                await loadScript(url); // Using the sequential loop
            }
        }

        // Run any custom initialization for this config
        if (config.init && typeof config.init === 'function') {
            await config.init();
        }

        if (config.stylesheets) {
            config.stylesheets.forEach(loadStylesheet);
        }

        const handlerModule = await config.handler();
        currentHandlerModule = handlerModule;
        await handlerModule.default(file.blob, previewContent);

        previewLoader.style.display = 'none';
        previewContent.style.display = 'block';

    } catch (error) {
        console.error("Error loading preview:", error);
        previewContent.innerHTML = `<div class="empty-state">Preview failed: ${error.message}</div>`;
        previewLoader.style.display = 'none';
        previewContent.style.display = 'block';
        currentHandlerModule = null;
    }
}