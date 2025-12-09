// features/settings/settingsData.js
// Handles settings state and persistence

import { audioManager } from '../../utils/audioManager.js';
import { applyTheme, getCurrentTheme } from '../theme/index.js';
import i18next from '../../i18n.js';

/**
 * Gets all current settings values
 * @returns {Object} All settings values
 */
export function getAllSettings() {
    const consentMap = getPreviewConsentMap();
    return {
        sounds: audioManager.isEnabled(),
        analytics: localStorage.getItem('dropsilk-privacy-consent') === 'true',
        theme: localStorage.getItem('dropsilk-color-theme') || 'default',
        mode: localStorage.getItem('dropsilk-mode') || 'light',
        animationQuality: localStorage.getItem('dropsilk-animation-quality') || 'performance',
        systemFont: localStorage.getItem('dropsilk-system-font') === 'true',
        autoDownload: localStorage.getItem('dropsilk-auto-download') === 'true',
        autoDownloadMaxSize: parseFloat(localStorage.getItem('dropsilk-auto-download-max-size') || '100'),
        chunkSize: parseInt(localStorage.getItem('dropsilk-chunk-size') || '262144', 10),
        opfsEnabled: localStorage.getItem('dropsilk-use-opfs-buffer') === 'true',
        opfsSupported: !!navigator.storage?.getDirectory,
        pptxConsent: consentMap.pptx || 'ask',
        language: i18next.language,
    };
}

// Migration helper (run once on load implicitly via logic below or separate init)
(function migrateTheme() {
    const oldTheme = localStorage.getItem('dropsilk-theme');
    if (oldTheme) {
        if (oldTheme === 'midnight' || oldTheme === 'sunset') {
            if (!localStorage.getItem('dropsilk-color-theme')) {
                localStorage.setItem('dropsilk-color-theme', oldTheme);
                localStorage.setItem('dropsilk-mode', 'dark');
            }
        } else if (oldTheme === 'dark') {
            if (!localStorage.getItem('dropsilk-mode')) {
                localStorage.setItem('dropsilk-mode', 'dark');
            }
        }
        // Clear old key to prevent re-migration issues (optional, but good practice)
        localStorage.removeItem('dropsilk-theme');
    }
})();

/**
 * Gets a detailed human-readable summary of all settings
 * @returns {string} Summary like "Sounds: On • Analytics: Off • Theme: Light..."
 */
export function getSettingsSummary() {
    const settings = getAllSettings();
    const animationLabels = { quality: 'Best', performance: 'Basic', off: 'Off' };
    const pptxLabels = { allow: 'Allow', deny: 'Deny', ask: 'Ask' };

    const parts = [
        `Sounds: ${settings.sounds ? 'On' : 'Off'}`,
        `Analytics: ${settings.analytics ? 'On' : 'Off'}`,
        `Mode: ${settings.mode === 'dark' ? 'Dark' : 'Light'}`,
        `Theme: ${settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}`,
        `Animation: ${animationLabels[settings.animationQuality] || 'Basic'}`,
        `Font: ${settings.systemFont ? 'System' : 'Default'}`,
        `Auto-Download: ${settings.autoDownload ? 'On' : 'Off'}`,
        `PPTX Preview: ${pptxLabels[settings.pptxConsent] || 'Ask'}`,
        `Safe Mode (OPFS): ${settings.opfsEnabled ? 'On' : 'Off'}`,
    ];

    return parts.join(' • ');
}

/**
 * Gets the preview consent map from localStorage
 * @returns {Object} Consent map
 */
export function getPreviewConsentMap() {
    try {
        return JSON.parse(localStorage.getItem('dropsilk-preview-consent') || '{}');
    } catch {
        return {};
    }
}

/**
 * Sets a preview consent value
 * @param {string} type - Preview type (e.g., 'pptx')
 * @param {string} value - 'ask', 'allow', or 'deny'
 */
export function setPreviewConsent(type, value) {
    const map = getPreviewConsentMap();
    map[type] = value;
    localStorage.setItem('dropsilk-preview-consent', JSON.stringify(map));
}

/**
 * Updates a single setting
 * @param {string} key - Setting key
 * @param {any} value - New value
 */
export function updateSetting(key, value) {
    switch (key) {
        case 'sounds':
            if (value) audioManager.enable();
            else audioManager.disable();
            break;
        case 'analytics':
            localStorage.setItem('dropsilk-privacy-consent', value ? 'true' : 'false');
            break;
        case 'mode':
            applyTheme(null, value); // Pass null theme to only update mode
            break;
        case 'theme':
            applyTheme(value, null); // Pass null mode to only update theme
            break;
        case 'animationQuality':
            applyAnimationQuality(value);
            break;
        case 'systemFont':
            localStorage.setItem('dropsilk-system-font', value ? 'true' : 'false');
            applySystemFont(value);
            break;
        case 'autoDownload':
            localStorage.setItem('dropsilk-auto-download', value ? 'true' : 'false');
            break;
        case 'autoDownloadMaxSize':
            localStorage.setItem('dropsilk-auto-download-max-size', String(value));
            break;
        case 'chunkSize':
            localStorage.setItem('dropsilk-chunk-size', String(value));
            break;
        case 'opfsEnabled':
            localStorage.setItem('dropsilk-use-opfs-buffer', value ? 'true' : 'false');
            break;
        case 'pptxConsent':
            setPreviewConsent('pptx', value);
            break;
        case 'language':
            i18next.changeLanguage(value);
            localStorage.setItem('dropsilk-language', value);
            break;
    }
}

/**
 * Applies animation quality setting
 * @param {string} level - 'quality', 'performance', or 'off'
 */
export function applyAnimationQuality(level) {
    const body = document.body;
    body.classList.remove('reduced-effects', 'no-effects');
    if (level === 'performance') {
        body.classList.add('reduced-effects');
    } else if (level === 'off') {
        body.classList.add('reduced-effects', 'no-effects');
    }
    localStorage.setItem('dropsilk-animation-quality', level);
}

/**
 * Applies system font preference
 * @param {boolean} useSystemFont
 */
export function applySystemFont(useSystemFont) {
    document.body.classList.toggle('use-system-font', useSystemFont);
}

/**
 * Initializes animation quality from localStorage
 */
export function initializeAnimationQuality() {
    const newKey = 'dropsilk-animation-quality';
    const oldKey = 'dropsilk-performance-mode';
    let quality = localStorage.getItem(newKey);

    if (!quality) {
        const oldSetting = localStorage.getItem(oldKey);
        if (oldSetting === 'true') {
            quality = 'performance';
        } else if (oldSetting === 'false') {
            quality = 'quality';
        } else {
            quality = 'performance';
        }
        localStorage.setItem(newKey, quality);
    }

    applyAnimationQuality(quality);
}

/**
 * Initializes system font preference from localStorage
 */
export function initializeSystemFont() {
    const useSystemFont = localStorage.getItem('dropsilk-system-font') === 'true';
    applySystemFont(useSystemFont);
}

/**
 * Resets all preferences to defaults
 */
export function resetAllPreferences() {
    const keys = [
        'dropsilk-mode',
        'dropsilk-color-theme',
        'dropsilk-animation-quality',
        'dropsilk-system-font',
        'dropsilk-auto-download',
        'dropsilk-auto-download-max-size',
        'dropsilk-chunk-size',
        'dropsilk-use-opfs-buffer',
        'dropsilk-preview-consent',
        'dropsilk-language',
    ];

    keys.forEach(key => localStorage.removeItem(key));

    // Reset sounds separately
    audioManager.enable();

    // Apply defaults
    applyTheme('default', 'light');
    applyAnimationQuality('performance');
    applySystemFont(false);
    i18next.changeLanguage('en');

    // Reload to apply all changes
    location.reload();
}
