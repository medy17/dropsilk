// features/theme/index.js
// Manages application theme (light/dark mode)

import { uiElements } from '../../ui/dom.js';
import { store } from '../../state.js';
import QRCode from 'qrcode';

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
 * Applies the specified theme to the document.
 * @param {string} theme - 'light' or 'dark'
 * @param {boolean} persist - Whether to save to localStorage (default: true)
 */
export function applyTheme(theme, persist = true) {
    const body = uiElements.body || document.body;
    body.setAttribute('data-theme', theme);
    if (persist) {
        localStorage.setItem('dropsilk-theme', theme);
    }
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const themeToggle = document.getElementById('theme-toggle');
    if (theme === 'dark') {
        themeToggle?.setAttribute('aria-label', 'Switch to Shades Up (Light Mode)');
        if (metaThemeColor) metaThemeColor.setAttribute('content', '#111113');
    } else {
        themeToggle?.setAttribute('aria-label', 'Switch to Shades Down (Dark Mode)');
        if (metaThemeColor) metaThemeColor.setAttribute('content', '#ffffff');
    }
    // Regenerate QR code if invite modal is open (QR colors depend on theme)
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
    const savedTheme = localStorage.getItem('dropsilk-theme');
    applyTheme(savedTheme || 'light', !!savedTheme);
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle?.addEventListener('click', () => {
        const currentTheme = getCurrentTheme();
        applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
}
