// features/theme/index.js
// Manages application theme (light/dark mode)

import { uiElements } from '../../ui/dom.js';
import { store } from '../../state.js';
import { getAllSettings } from '../settings/settingsData.js'; // Helper to get current state if needed
import QRCode from 'qrcode';
// --- NEW IMPORT ---
import { THEME_CONFIG } from '../../themeConfig.gen.js';

/**
 * Generates a QR code for the current flight code.
 * Called when theme changes while invite modal is open.
 */
function generateQRCode() {
    const qrCanvas = document.getElementById('qrCanvas');
    const { currentFlightCode } = store.getState();

    if (!qrCanvas || !currentFlightCode || !QRCode) {
        if (qrCanvas) qrCanvas.style.display = 'none';
        return;
    }

    const origin = window.electronAPI ? 'https://dropsilk.xyz' : location.origin;
    const url = `${origin}/?code=${currentFlightCode}`;
    const qrDotColor = getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim();
    const qrColors = { dark: qrDotColor, light: '#00000000' };

    QRCode.toCanvas(qrCanvas, url, { width: 200, margin: 2, color: qrColors, errorCorrectionLevel: 'M' }, (err) => {
        if (err) console.error('QR Code generation error:', err);
    });
}

/**
 * Applies the specified theme and mode to the document.
 * @param {string|null} theme - 'default', 'midnight', 'sunset' or null to keep current
 * @param {string|null} mode - 'light', 'dark' or null to keep current
 */
export function applyTheme(theme = null, mode = null) {
    const body = uiElements.body || document.body;

    // Resolve current values if not provided
    if (!theme || !mode) {
        const currentSettings = getAllSettings();
        if (!theme) theme = currentSettings.theme;
        if (!mode) mode = currentSettings.mode;
    }

    // Apply attributes
    body.setAttribute('data-theme', theme);
    body.setAttribute('data-mode', mode);

    // Persist
    localStorage.setItem('dropsilk-color-theme', theme);
    localStorage.setItem('dropsilk-mode', mode);

    // Update Meta and UI
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const themeToggle = document.getElementById('theme-toggle');

    const themeMetaColors = {
        light: '#ffffff',
        dark: '#111113', // Default Dark Fallback
    };

    // --- NEW LOGIC: Look up the dark mode color from the generated config ---
    if (theme && theme !== 'default' && THEME_CONFIG[theme]) {
        themeMetaColors.dark = THEME_CONFIG[theme].darkColor;
    }
    // -----------------------------------------------------------------------

    if (mode === 'light') {
        themeToggle?.setAttribute('aria-label', 'Switch to Shades Down (Dark Mode)');
        if (metaThemeColor) metaThemeColor.setAttribute('content', themeMetaColors.light);
    } else {
        themeToggle?.setAttribute('aria-label', 'Switch to Shades Up (Light Mode)');
        // Use the dynamically resolved dark color
        if (metaThemeColor) metaThemeColor.setAttribute('content', themeMetaColors.dark);
    }

    // Regenerate QR code if invite modal is open (QR colors depend on theme/mode)
    const inviteModal = document.getElementById('inviteModal');
    if (inviteModal && inviteModal.classList.contains('show')) {
        generateQRCode();
    }
}

/**
 * Gets the current theme from the document.
 * @returns {string} 'light' or 'dark'
 */
export function getCurrentTheme() {
    const body = uiElements.body || document.body;
    return body.getAttribute('data-theme') || 'light';
}

/**
 * Initializes the theme from localStorage and sets up the toggle listener.
 */
export function initializeTheme() {
    // Migration logic handles initial read in settingsData, but we explicitly apply here to be safe
    // getAllSettings includes the migration result if we call it.
    const { theme, mode } = getAllSettings();
    applyTheme(theme, mode);

    const themeToggle = document.getElementById('theme-toggle');
    themeToggle?.addEventListener('click', () => {
        const currentMode = uiElements.body.getAttribute('data-mode') || 'light';
        applyTheme(null, currentMode === 'dark' ? 'light' : 'dark');
    });
}