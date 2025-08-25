// js/ui/modals.js
// Handles all modal interactions, including theme toggling.

import { RECAPTCHA_SITE_KEY } from '../config.js';
import { store } from '../state.js';
import { uiElements } from './dom.js';

let captchaWidgetId = null;

function onRecaptchaLoadCallback() {
    const recaptchaContainer = document.getElementById('recaptcha-container');
    // We only render the widget if the container exists and is empty.
    if (recaptchaContainer && recaptchaContainer.innerHTML.trim() === '') {
        captchaWidgetId = grecaptcha.render('recaptcha-container', {
            'sitekey': RECAPTCHA_SITE_KEY,
            'callback': 'onCaptchaSuccessCallback', // We provide the *name* of the success function as a string.
            'theme': uiElements.body.getAttribute('data-theme') || 'light'
        });
    }
}
window.onRecaptchaLoad = onRecaptchaLoadCallback; // Attach it to the window.


function onCaptchaSuccessCallback() {
    document.getElementById('email-view-captcha-state').style.display = 'none';
    document.getElementById('email-view-revealed-state').style.display = 'block';
    document.getElementById('captcha-pretext').style.display = 'none';
}
window.onCaptchaSuccessCallback = onCaptchaSuccessCallback; // Attach it to the window.


// --- MODULE LOGIC ---

function applyTheme(theme, persist = true) {
    uiElements.body.setAttribute('data-theme', theme);
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
    const inviteModal = document.getElementById('inviteModal');
    if (inviteModal && inviteModal.classList.contains('show')) {
        generateQRCode();
    }
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('dropsilk-theme');
    applyTheme(savedTheme || 'light', !!savedTheme);
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle?.addEventListener('click', () => {
        const currentTheme = uiElements.body.getAttribute('data-theme') || 'light';
        applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
}

function generateQRCode() {
    const qrCanvas = document.getElementById('qrCanvas');
    const { currentFlightCode } = store.getState();

    if (!qrCanvas || !currentFlightCode || typeof QRCode === 'undefined') {
        if (qrCanvas) qrCanvas.style.display = 'none';
        return;
    }

    const url = `https://dropsilk.xyz?code=${currentFlightCode}`;
    const qrDotColor = getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim();
    const qrColors = { dark: qrDotColor, light: '#00000000' };

    QRCode.toCanvas(qrCanvas, url, { width: 200, margin: 2, color: qrColors, errorCorrectionLevel: 'M' }, (err) => {
        if (err) console.error('QR Code generation error:', err);
    });
}

async function copyToClipboard(text, button, successText = 'Copied!') {
    await navigator.clipboard.writeText(text);
    const originalText = button.innerHTML;
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/></svg>${successText}`;
    button.classList.add('success');
    setTimeout(() => {
        button.innerHTML = originalText;
        button.classList.remove('success');
    }, 2000);
}

export function initializeModals() {
    initializeTheme();

    const modals = {
        invite: { trigger: 'inviteBtn', close: 'closeInviteModal', overlay: 'inviteModal' },
        about: { trigger: 'aboutBtn', close: 'closeAboutModal', overlay: 'aboutModal' },
        contact: { trigger: 'contactBtn', close: 'closeContactModal', overlay: 'contactModal' },
        terms: { trigger: 'termsBtn', close: 'closeTermsModal', overlay: 'termsModal' },
        privacy: { trigger: 'privacyBtn', close: 'closePrivacyModal', overlay: 'privacyModal' },
        security: { trigger: 'securityBtn', close: 'closeSecurityModal', overlay: 'securityModal' },
        faq: { trigger: 'faqBtn', close: 'closeFaqModal', overlay: 'faqModal' }
    };

    Object.entries(modals).forEach(([name, config]) => {
        const overlay = document.getElementById(config.overlay);
        const trigger = document.getElementById(config.trigger);
        const close = document.getElementById(config.close);
        if (!overlay || !trigger || !close) return;

        const show = () => { overlay.classList.add('show'); uiElements.body.style.overflow = 'hidden'; };
        const hide = () => {
            overlay.classList.remove('show');
            uiElements.body.style.overflow = '';
            if (name === 'contact') resetContactModal();
        };

        trigger.addEventListener('click', show);
        close.addEventListener('click', hide);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.show').forEach(m => {
                const modalName = Object.keys(modals).find(key => modals[key].overlay === m.id);
                if (modalName) document.getElementById(modals[modalName].close)?.click();
            });
        }
    });

    setupInviteModal();
    setupContactModal();
}

function setupInviteModal() {
    document.getElementById('inviteBtn')?.addEventListener('click', () => {
        const { currentFlightCode } = store.getState();
        if (!currentFlightCode) return;
        document.getElementById('modalFlightCode').textContent = currentFlightCode;
        generateQRCode();
    });

    const shareNativeBtn = document.getElementById('shareNativeBtn');
    if (shareNativeBtn && navigator.share) shareNativeBtn.style.display = 'flex';

    document.getElementById('copyLinkBtn')?.addEventListener('click', (e) => copyToClipboard(`https://dropsilk.xyz?code=${store.getState().currentFlightCode}`, e.currentTarget, 'Link Copied!'));
    document.getElementById('copyCodeBtn')?.addEventListener('click', (e) => copyToClipboard(store.getState().currentFlightCode, e.currentTarget, 'Code Copied!'));
    shareNativeBtn?.addEventListener('click', async () => {
        const { currentFlightCode } = store.getState();
        if (navigator.share) await navigator.share({ title: 'Join my DropSilk flight!', text: `Join my file transfer session with code: ${currentFlightCode}`, url: `https://dropsilk.xyz?code=${currentFlightCode}` });
    });
}

function setupContactModal() {
    const viewEmailBtn = document.getElementById('viewEmailBtn');
    const copyEmailBtn = document.getElementById('copyEmailBtn');
    const initialState = document.getElementById('email-view-initial-state');
    const captchaState = document.getElementById('email-view-captcha-state');

    viewEmailBtn?.addEventListener('click', () => {
        initialState.style.display = 'none';
        captchaState.style.display = 'block';

        // This handles cases where the modal is opened *after* the google script has already loaded.
        if (window.grecaptcha && captchaWidgetId === null) {
            onRecaptchaLoadCallback();
        }
    });

    copyEmailBtn?.addEventListener('click', (e) => copyToClipboard('ahmed@dropsilk.xyz', e.currentTarget, 'Email Copied!'));
}

function resetContactModal() {
    const initialState = document.getElementById('email-view-initial-state');
    if (initialState) initialState.style.display = 'block';

    const captchaState = document.getElementById('email-view-captcha-state');
    if (captchaState) captchaState.style.display = 'none';

    const revealedState = document.getElementById('email-view-revealed-state');
    if (revealedState) revealedState.style.display = 'none';

    const pretext = document.getElementById('captcha-pretext');
    if (pretext) pretext.style.display = 'block';

    if (window.grecaptcha && captchaWidgetId !== null) {
        grecaptcha.reset(captchaWidgetId);
    }
}