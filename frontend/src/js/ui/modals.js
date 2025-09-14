// js/ui/modals.js
// Handles all modal interactions, including theme toggling.

import { showPreview } from '../preview/previewManager.js';
import { isPreviewable } from '../preview/previewConfig.js';
import { RECAPTCHA_SITE_KEY } from '../config.js';
import { store } from '../state.js';
import { uiElements } from './dom.js';
import { formatBytes } from '../utils/helpers.js';
import { downloadAllFilesAsZip } from '../transfer/zipHandler.js';
import QRCode from 'qrcode';
import { audioManager } from '../utils/audioManager.js';

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

    if (!qrCanvas || !currentFlightCode || !QRCode) {
        if (qrCanvas) qrCanvas.style.display = 'none';
        return;
    }

    // --- MODIFIED LINE ---
    const url = `https://dropsilk.xyz/?code=${currentFlightCode}`;
    const qrDotColor = getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim();
    const qrColors = { dark: qrDotColor, light: '#00000000' };

    QRCode.toCanvas(qrCanvas, url, { width: 200, margin: 2, color: qrColors, errorCorrectionLevel: 'M' }, (err) => {
        if (err) console.error('QR Code generation error:', err);
    });
}

async function copyToClipboard(text, button, successText = 'Copied!') {
    await navigator.clipboard.writeText(text);
    // This provides haptic feedback on supported devices and does nothing on others. Audio for copy to come later
    audioManager.vibrate(50);

    const originalText = button.innerHTML;
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/></svg>${successText}`;
    button.classList.add('success');
    setTimeout(() => {
        button.innerHTML = originalText;
        button.classList.remove('success');
    }, 2000);
}

// Helper function to reset the Zip Modal to its default state
function resetZipModal() {
    const modal = document.getElementById('zipModal');
    if (modal) modal.classList.remove('zipping-in-progress');

    uiElements.selectAllZipCheckbox.checked = false;
    updateZipSelection();

    if (uiElements.zipModalDefaultFooter) {
        uiElements.zipModalDefaultFooter.style.display = 'block';
    }
    if (uiElements.zipModalWarningFooter) {
        uiElements.zipModalWarningFooter.style.display = 'none';
    }

    const btn = uiElements.downloadSelectedBtn;
    const btnSpan = btn.querySelector('span');
    const downloadIcon = btn.querySelector('.download-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');

    if (btnSpan) btnSpan.textContent = 'Download Selected as Zip';
    if (downloadIcon) downloadIcon.style.display = 'inline-block';
    if (spinnerIcon) spinnerIcon.style.display = 'none';
}

function resetPreviewModal() {
    const contentElement = document.getElementById('preview-content');
    // Revoke object URL to prevent memory leaks, crucial for large image previews
    if (contentElement.dataset.objectUrl) {
        URL.revokeObjectURL(contentElement.dataset.objectUrl);
        delete contentElement.dataset.objectUrl;
    }
    contentElement.innerHTML = ''; // Clear the content
}

export function initializeModals() {
    initializeTheme();

    const modals = {
        invite: { trigger: 'inviteBtn', close: 'closeInviteModal', overlay: 'inviteModal' },
        zip: { trigger: 'downloadAllBtn', close: 'closeZipModal', overlay: 'zipModal' },
        donate: { trigger: 'ko-fiBtn', close: 'closeDonateModal', overlay: 'donateModal' },
        about: { trigger: 'aboutBtn', close: 'closeAboutModal', overlay: 'aboutModal' },
        contact: { trigger: 'contactBtn', close: 'closeContactModal', overlay: 'contactModal' },
        terms: { trigger: 'termsBtn', close: 'closeTermsModal', overlay: 'termsModal' },
        privacy: { trigger: 'privacyBtn', close: 'closePrivacyModal', overlay: 'privacyModal' },
        security: { trigger: 'securityBtn', close: 'closeSecurityModal', overlay: 'securityModal' },
        faq: { trigger: 'faqBtn', close: 'closeFaqModal', overlay: 'faqModal' },
        preview: { trigger: 'openPreviewModal', close: 'closePreviewModal', overlay: 'previewModal' }
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
            if (name === 'zip') resetZipModal();
            if (name === 'preview') resetPreviewModal();
        };

        trigger.addEventListener('click', show);
        close.addEventListener('click', hide);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.show').forEach(m => {
                // Prevent closing the zip modal while it's busy
                if (m.id === 'zipModal' && m.classList.contains('zipping-in-progress')) {
                    return;
                }
                const modalName = Object.keys(modals).find(key => modals[key].overlay === m.id);
                if (modalName) document.getElementById(modals[modalName].close)?.click();
            });
        }
    });

    setupInviteModal();
    setupContactModal();
    setupZipModal();
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

    document.getElementById('copyLinkBtn')?.addEventListener('click', (e) => copyToClipboard(`https://dropsilk.xyz/?code=${store.getState().currentFlightCode}`, e.currentTarget, 'Link Copied!'));
    document.getElementById('copyCodeBtn')?.addEventListener('click', (e) => copyToClipboard(store.getState().currentFlightCode, e.currentTarget, 'Code Copied!'));
    shareNativeBtn?.addEventListener('click', async () => {
        const { currentFlightCode } = store.getState();
        if (navigator.share) await navigator.share({ title: 'Join my DropSilk flight!', text: `Join my file transfer session with code: ${currentFlightCode}`, url: `https://dropsilk.xyz/?code=${currentFlightCode}` });
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

function populateZipModal() {
    const { receivedFiles } = store.getState();
    uiElements.zipFileList.innerHTML = '';

    if (receivedFiles.length === 0) {
        uiElements.zipFileList.innerHTML = '<div class="empty-state">No files to download.</div>';
        return;
    }

    receivedFiles.forEach((file, index) => {
        uiElements.zipFileList.insertAdjacentHTML('beforeend', `
            <label class="zip-file-item checkbox-label">
                <input type="checkbox" class="zip-file-checkbox custom-checkbox-input" data-index="${index}">
                <span class="custom-checkbox"></span>
                <div class="zip-file-details">
                    <span class="zip-file-name" title="${file.name}">${file.name}</span>
                    <span class="zip-file-size">${formatBytes(file.blob.size)}</span>
                </div>
            </label>
        `);
    });
}

function updateZipSelection() {
    const { receivedFiles } = store.getState();
    const checkboxes = uiElements.zipFileList.querySelectorAll('.zip-file-checkbox:checked');
    const selectedIndexes = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index, 10));

    const totalSelected = selectedIndexes.length;
    const totalSize = selectedIndexes.reduce((sum, index) => sum + receivedFiles[index].blob.size, 0);

    uiElements.zipSelectionInfo.textContent = `${totalSelected} files selected (${formatBytes(totalSize)})`;
    uiElements.downloadSelectedBtn.disabled = totalSelected === 0;

    const allCheckboxes = uiElements.zipFileList.querySelectorAll('.zip-file-checkbox');
    uiElements.selectAllZipCheckbox.checked = allCheckboxes.length > 0 && totalSelected === allCheckboxes.length;
}

function setupZipModal() {
    const trigger = document.getElementById('downloadAllBtn');
    if (!trigger) return;

    trigger.addEventListener('click', populateZipModal);

    uiElements.zipFileList.addEventListener('change', (e) => {
        if (e.target.classList.contains('zip-file-checkbox')) {
            updateZipSelection();
        }
    });

    uiElements.selectAllZipCheckbox.addEventListener('change', () => {
        const isChecked = uiElements.selectAllZipCheckbox.checked;
        uiElements.zipFileList.querySelectorAll('.zip-file-checkbox').forEach(cb => { cb.checked = isChecked; });
        updateZipSelection();
    });

    uiElements.downloadSelectedBtn.addEventListener('click', () => {
        const { receivedFiles } = store.getState();
        const checkboxes = uiElements.zipFileList.querySelectorAll('.zip-file-checkbox:checked');
        const selectedFiles = Array.from(checkboxes).map(cb => receivedFiles[parseInt(cb.dataset.index, 10)]);

        if (selectedFiles.length > 0) {
            downloadAllFilesAsZip(selectedFiles);
        }
    });
}