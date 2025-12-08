// features/invite/inviteModal.js
// Handles the invite modal UI and functionality

import { store } from '../../state.js';
import i18next from '../../i18n.js';
import QRCode from 'qrcode';

/**
 * Generates a QR code for the invite modal
 */
export function generateQRCode() {
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
 * Copies text to clipboard and shows feedback on button
 * @param {string} text - Text to copy
 * @param {HTMLElement} button - Button element to show feedback on
 * @param {string} successText - Text to show on success
 */
export async function copyToClipboard(text, button, successText = 'Copied!') {
    await navigator.clipboard.writeText(text);

    const originalText = button.innerHTML;
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/></svg>${successText}`;
    button.classList.add('success');
    setTimeout(() => {
        button.innerHTML = originalText;
        button.classList.remove('success');
    }, 2000);
}

/**
 * Sets up event listeners for the invite modal
 */
export function setupInviteModal() {
    document.getElementById('inviteBtn')?.addEventListener('click', () => {
        const { currentFlightCode } = store.getState();
        if (!currentFlightCode) return;
        document.getElementById('modalFlightCode').textContent = currentFlightCode;
        generateQRCode();
    });

    const shareNativeBtn = document.getElementById('shareNativeBtn');
    if (shareNativeBtn && navigator.share) {
        shareNativeBtn.style.display = 'flex';
    }

    document.getElementById('copyLinkBtn')?.addEventListener('click', (e) => {
        if (navigator.vibrate) navigator.vibrate([50, 40, 15]);
        const origin = window.electronAPI ? 'https://dropsilk.xyz' : location.origin;
        copyToClipboard(
            `${origin}/?code=${store.getState().currentFlightCode}`,
            e.currentTarget,
            i18next.t('linkCopied')
        );
    });

    document.getElementById('copyCodeBtn')?.addEventListener('click', (e) => {
        if (navigator.vibrate) navigator.vibrate([50, 40, 15]);
        copyToClipboard(
            store.getState().currentFlightCode,
            e.currentTarget,
            i18next.t('codeCopied')
        );
    });

    shareNativeBtn?.addEventListener('click', async () => {
        const { currentFlightCode } = store.getState();
        const origin = window.electronAPI ? 'https://dropsilk.xyz' : location.origin;
        try {
            await navigator.share({
                title: i18next.t('shareTitle', 'Join my DropSilk session'),
                text: i18next.t('shareText', 'Use this code to connect:') + ` ${currentFlightCode}`,
                url: `${origin}/?code=${currentFlightCode}`,
            });
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error sharing:', err);
            }
        }
    });
}
