// js/ui/modals.js
// Handles all modal interactions, including theme toggling and the side drawer.

import { showPreview, updatePptxPreviewButtonsDisabled } from '../preview/previewManager.js';
import { isPreviewable } from '../preview/previewConfig.js';
import { RECAPTCHA_SITE_KEY } from '../config.js';
import { store } from '../state.js';
import { uiElements } from './dom.js';
import { formatBytes } from '../utils/helpers.js';
import { downloadAllFilesAsZip } from '../transfer/zipHandler.js';
import { showToast } from '../utils/toast.js';
import QRCode from 'qrcode';
import { audioManager } from '../utils/audioManager.js';
import i18next from "../i18n.js";

let captchaWidgetId = null;
let zipModalMode = 'zip'; // 'zip' | 'settings'

// --- ANIMATION QUALITY ---
function applyAnimationQuality(level) {
    const body = uiElements.body || document.body;
    body.classList.remove('reduced-effects', 'no-effects');
    if (level === 'performance') {
        body.classList.add('reduced-effects');
    } else if (level === 'off') {
        body.classList.add('reduced-effects', 'no-effects');
    }
    localStorage.setItem('dropsilk-animation-quality', level);
}

function initializeAnimationQuality() {
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
            // Default for new users
            quality = 'performance';
        }
        localStorage.setItem(newKey, quality);
        // localStorage.removeItem(oldKey); // Optional: clean up old key
    }

    applyAnimationQuality(quality);
}

function onRecaptchaLoadCallback() {
    const recaptchaContainer = document.getElementById('recaptcha-container');
    if (recaptchaContainer && recaptchaContainer.innerHTML.trim() === '') {
        captchaWidgetId = grecaptcha.render('recaptcha-container', {
            'sitekey': RECAPTCHA_SITE_KEY,
            'callback': 'onCaptchaSuccessCallback',
            'theme': uiElements.body.getAttribute('data-theme') || 'light'
        });
    }
}
window.onRecaptchaLoad = onRecaptchaLoadCallback;

function onCaptchaSuccessCallback() {
    document.getElementById('email-view-captcha-state').style.display = 'none';
    document.getElementById('email-view-revealed-state').style.display = 'block';
    document.getElementById('captcha-pretext').style.display = 'none';
}
window.onCaptchaSuccessCallback = onCaptchaSuccessCallback;

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

    const url = `${location.origin}/?code=${currentFlightCode}`;
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

function populateZipModal() {
    const { receivedFiles } = store.getState();
    uiElements.zipFileList.innerHTML = '';

    if (receivedFiles.length === 0) {
        uiElements.zipFileList.innerHTML =
            `<div class="empty-state">${i18next.t('noFilesToDownload')}</div>`;
        // Also reset header info
        uiElements.zipSelectionInfo.textContent = i18next.t('filesSelected', { count: 0, size: formatBytes(0) });
        uiElements.downloadSelectedBtn.disabled = true;
        uiElements.selectAllZipCheckbox.checked = false;
        return;
    }

    receivedFiles.forEach((file, index) => {
        uiElements.zipFileList.insertAdjacentHTML(
            'beforeend',
            `
      <label class="zip-file-item checkbox-label">
        <input
          type="checkbox"
          class="zip-file-checkbox custom-checkbox-input"
          data-index="${index}"
        />
        <span class="custom-checkbox"></span>
        <div class="zip-file-details">
          <span class="zip-file-name" title="${file.name}">${file.name}</span>
          <span class="zip-file-size">${formatBytes(file.blob.size)}</span>
        </div>
      </label>
    `
        );
    });

    // Initialise summary
    updateZipSelection();
}

function updateZipSelection() {
    const { receivedFiles } = store.getState();
    const selected = Array.from(
        uiElements.zipFileList.querySelectorAll('.zip-file-checkbox:checked')
    ).map((cb) => parseInt(cb.dataset.index, 10));

    const totalSelected = selected.length;
    const totalSize = selected.reduce(
        (sum, idx) => sum + (receivedFiles[idx]?.blob?.size || 0),
        0
    );

    uiElements.zipSelectionInfo.textContent = i18next.t('filesSelected', { count: totalSelected, size: formatBytes(totalSize) });
    uiElements.downloadSelectedBtn.disabled = totalSelected === 0;

    const all = uiElements.zipFileList.querySelectorAll('.zip-file-checkbox');
    uiElements.selectAllZipCheckbox.checked =
        all.length > 0 && totalSelected === all.length;
}

function resetZipModal() {
    zipModalMode = 'zip';
    const modal = document.getElementById('zipModal');
    if(modal) {
        modal.classList.remove('settings-mode');
        modal.classList.remove('zipping-in-progress');
    }

    // --- Reset title ---
    const header = document.querySelector('#zipModal .modal-header h3');
    if (header) header.textContent = i18next.t('downloadFilesAsZip');

    uiElements.selectAllZipCheckbox.checked = false;
    updateZipSelection();

    if (uiElements.zipModalDefaultFooter) uiElements.zipModalDefaultFooter.style.display = 'block';
    if (uiElements.zipModalWarningFooter) uiElements.zipModalWarningFooter.style.display = 'none';

    const selectAllLabel = uiElements.selectAllZipCheckbox
        ?.closest('.checkbox-label')
        ?.querySelector('span:last-of-type');
    if (selectAllLabel) selectAllLabel.textContent = i18next.t('selectAll');
    uiElements.zipSelectionInfo.textContent = i18next.t('filesSelected', { count: 0, size: formatBytes(0) });

    const btn = uiElements.downloadSelectedBtn;
    const btnSpan = btn.querySelector('span');
    const downloadIcon = btn.querySelector('.download-icon');
    const saveIcon = btn.querySelector('.save-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');

    // --- Reset button text and icons to default state ---
    if (btnSpan) btnSpan.textContent = i18next.t('downloadSelectedAsZip');
    if (downloadIcon) downloadIcon.style.display = 'inline-block';
    if (saveIcon) saveIcon.style.display = 'none';
    if (spinnerIcon) spinnerIcon.style.display = 'none';
}

function applySystemFont(enabled) {
    uiElements.body.classList.toggle('use-system-font', !!enabled);
}

function initializeSystemFont() {
    const useSystem = localStorage.getItem('dropsilk-system-font') === 'true';
    applySystemFont(useSystem);
}

function resetPreviewModal() {
    const contentElement = document.getElementById('preview-content');
    if (contentElement.dataset.objectUrl) {
        URL.revokeObjectURL(contentElement.dataset.objectUrl);
        delete contentElement.dataset.objectUrl;
    }
    contentElement.innerHTML = '';
}

function initializeDrawer() {
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    const toggleBtn = document.getElementById('drawer-toggle');
    const closeBtn = document.getElementById('drawer-close');
    const drawerNav = document.getElementById('drawer-nav');

    if (!drawer || !overlay || !toggleBtn || !closeBtn || !drawerNav) return;

    // Prevents the drawer from animating on page load.
    setTimeout(() => {
        drawer.classList.add('drawer-ready');
    }, 0);

    const openDrawer = () => document.body.classList.add('drawer-open');
    const closeDrawer = () => document.body.classList.remove('drawer-open');

    toggleBtn.addEventListener('click', openDrawer);
    closeBtn.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    drawerNav.addEventListener('click', (e) => {
        if (e.target.matches('.drawer-nav-link')) {
            // ** NEW: Add tap feedback to the drawer itself **
            drawer.classList.add('drawer-tapped');
            setTimeout(() => {
                drawer.classList.remove('drawer-tapped');
            }, 200); // Duration of the "tapped" state

            // Find the original button and click it to trigger the modal
            const originalId = e.target.id.replace('drawer-', '');
            const originalButton = document.getElementById(originalId);
            if (originalButton) {
                originalButton.click();
            }
            closeDrawer();
        }
    });

    // Special handling for the header Donate button
    const donateBtnHeader = document.getElementById('donateBtnHeader');
    const kofiBtn = document.getElementById('ko-fiBtn');
    if (donateBtnHeader && kofiBtn) {
        donateBtnHeader.addEventListener('click', () => {
            kofiBtn.click();
        });
    }
}


export function initializeModals() {
    initializeTheme();
    initializeSystemFont();
    initializeAnimationQuality();

    const modals = {
        invite: { trigger: 'inviteBtn', close: 'closeInviteModal', overlay: 'inviteModal' },
        zip: { trigger: 'downloadAllBtn', close: 'closeZipModal', overlay: 'zipModal', onShow: populateZipModal },
        settings: { trigger: 'settingsBtn', close: 'closeZipModal', overlay: 'zipModal', onShow: openSettingsModal },
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

        const show = () => {
            if (typeof config.onShow === 'function') config.onShow();
            overlay.classList.add('show');
            uiElements.body.style.overflow = 'hidden';
        };
        const hide = () => {
            overlay.classList.remove('show');
            uiElements.body.style.overflow = '';
            if (name === 'contact') resetContactModal();
            if (name === 'zip' || name === 'settings') resetZipModal();
            if (name === 'preview') resetPreviewModal();
        };

        trigger.addEventListener('click', show);
        close.addEventListener('click', hide);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.body.classList.contains('drawer-open')) {
                document.body.classList.remove('drawer-open');
                return;
            }
            document.querySelectorAll('.modal-overlay.show').forEach(m => {
                if (m.id === 'zipModal' && m.classList.contains('zipping-in-progress')) return;
                const modalName = Object.keys(modals).find(key => modals[key].overlay === m.id);
                if (modalName) document.getElementById(modals[modalName].close)?.click();
            });
        }
    });

    setupInviteModal();
    setupContactModal();
    setupZipModal();
    initializeDrawer();

    i18next.on('languageChanged', () => {
        const settingsModal = document.getElementById('zipModal');
        if (settingsModal && settingsModal.classList.contains('show') && settingsModal.classList.contains('settings-mode')) {
            openSettingsModal();
        }
    });
}

// ... (rest of the file is unchanged) ...
function setupInviteModal() {
    document.getElementById('inviteBtn')?.addEventListener('click', () => {
        const { currentFlightCode } = store.getState();
        if (!currentFlightCode) return;
        document.getElementById('modalFlightCode').textContent = currentFlightCode;
        generateQRCode();
    });

    const shareNativeBtn = document.getElementById('shareNativeBtn');
    if (shareNativeBtn && navigator.share) shareNativeBtn.style.display = 'flex';

    document.getElementById('copyLinkBtn')?.addEventListener('click', (e) => {
        if (navigator.vibrate) {
            navigator.vibrate([50, 40, 15]);
        }
        copyToClipboard(`https://dropsilk.xyz/?code=${store.getState().currentFlightCode}`, e.currentTarget, i18next.t('linkCopied'));
    });

    document.getElementById('copyCodeBtn')?.addEventListener('click', (e) => {
        if (navigator.vibrate) {
            navigator.vibrate([50, 40, 15]);
        }
        copyToClipboard(store.getState().currentFlightCode, e.currentTarget, i18next.t('codeCopied'));
    });

    shareNativeBtn?.addEventListener('click', async () => {
        const { currentFlightCode } = store.getState();
        if (navigator.share) await navigator.share({ title: i18next.t('joinMyFlight'), text: i18next.t('joinMyFlightDescription', { code: currentFlightCode }), url: `${location.origin}/?code=${currentFlightCode}` });
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

        if (window.grecaptcha && captchaWidgetId === null) {
            onRecaptchaLoadCallback();
        }
    });

    copyEmailBtn?.addEventListener('click', (e) => {
        if (navigator.vibrate) {
            navigator.vibrate([50, 40, 15]);
        }
        copyToClipboard('ahmed@dropsilk.xyz', e.currentTarget, i18next.t('emailCopied'));
    });
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

// --- ZIP & Settings Modal Logic ---

function setupZipModal() {
    uiElements.zipFileList.addEventListener('change', (e) => {
        if (e.target.classList.contains('zip-file-checkbox')) updateZipSelection();
    });

    uiElements.selectAllZipCheckbox.addEventListener('change', () => {
        if (zipModalMode === 'settings') {
            const isOn = uiElements.selectAllZipCheckbox.checked;
            toggleAllSettings(isOn);
            updateSettingsSummary();
        } else {
            const isChecked = uiElements.selectAllZipCheckbox.checked;
            uiElements.zipFileList.querySelectorAll('.zip-file-checkbox').forEach(cb => cb.checked = isChecked);
            updateZipSelection();
        }
    });

    uiElements.downloadSelectedBtn.addEventListener('click', () => {
        if (zipModalMode === 'settings') {
            saveSettingsPreferences();
            return;
        }
        const { receivedFiles } = store.getState();
        const checkboxes = uiElements.zipFileList.querySelectorAll('.zip-file-checkbox:checked');
        const selectedFiles = Array.from(checkboxes).map(cb => receivedFiles[parseInt(cb.dataset.index, 10)]);
        if (selectedFiles.length > 0) downloadAllFilesAsZip(selectedFiles);
    });
}

// --- Settings Modal helpers (reused from ZIP) ---

function getPreviewConsentMap() {
    try { return JSON.parse(localStorage.getItem('dropsilk-preview-consent') || '{}'); }
    catch { return {}; }
}

function setPreviewConsent(ext, value) {
    const map = getPreviewConsentMap();
    if (value === 'ask') delete map[ext];
    else map[ext] = value;
    localStorage.setItem('dropsilk-preview-consent', JSON.stringify(map));
}

function openSettingsModal() {
    document.getElementById('zipModal')?.classList.add('settings-mode');
    zipModalMode = 'settings';

    const header = document.querySelector('#zipModal .modal-header h3');
    if (header) header.textContent = i18next.t('settings');

    const btn = uiElements.downloadSelectedBtn;
    btn.disabled = false;

    const btnSpan = btn.querySelector('span');
    const downloadIcon = btn.querySelector('.download-icon');
    const saveIcon = btn.querySelector('.save-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');

    if (btnSpan) btnSpan.textContent = i18next.t('savePreferences');
    if (downloadIcon) downloadIcon.style.display = 'none';
    if (saveIcon) saveIcon.style.display = 'inline-block';
    if (spinnerIcon) spinnerIcon.style.display = 'none';

    const selectAllLabel = uiElements.selectAllZipCheckbox?.closest('.checkbox-label')?.querySelector('span:last-of-type');
    if (selectAllLabel) selectAllLabel.textContent = i18next.t('enableAll');

    populateSettingsModal();
    updateSettingsSummary();
}

function populateSettingsModal() {
    const consentMap = getPreviewConsentMap();
    const pptxConsent = consentMap.pptx || 'ask';
    const soundsEnabled = audioManager.isEnabled();
    const analyticsConsented = localStorage.getItem('dropsilk-privacy-consent') === 'true';
    const theme = localStorage.getItem('dropsilk-theme') || 'light';
    const animationQuality = localStorage.getItem('dropsilk-animation-quality') || 'performance';
    const useSystemFont = localStorage.getItem('dropsilk-system-font') === 'true';
    const autoDownloadEnabled = localStorage.getItem('dropsilk-auto-download') === 'true';
    const autoDownloadMaxSize = localStorage.getItem('dropsilk-auto-download-max-size') || 100;
    const chunkSize = parseInt(localStorage.getItem('dropsilk-chunk-size') || '262144', 10);
    const opfsEnabled = localStorage.getItem('dropsilk-use-opfs-buffer') === 'true';
    const opfsSupported = !!navigator.storage?.getDirectory;


    uiElements.zipFileList.innerHTML = `
      <div class="settings-list">
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('sounds')}</div>
            <div class="settings-item-desc">${i18next.t('soundsDescription')}</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-sounds" ${soundsEnabled ? 'checked' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('analytics')}</div>
            <div class="settings-item-desc">${i18next.t('analyticsDescription')}</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-analytics" ${analyticsConsented ? 'checked' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('darkMode')}</div>
            <div class="settings-item-desc">${i18next.t('darkModeDescription')}</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-theme" ${theme === 'dark' ? 'checked' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('animationQuality')}</div>
            <div class="settings-item-desc">${i18next.t('animationQualityDescription')}</div>
          </div>
          <div class="segmented" id="settings-animation-quality">
            <button type="button" class="seg-btn ${animationQuality === 'quality' ? 'active' : ''}" data-value="quality">${i18next.t('best')}</button>
            <button type="button" class="seg-btn ${animationQuality === 'performance' ? 'active' : ''}" data-value="performance">${i18next.t('basic')}</button>
            <button type="button" class="seg-btn ${animationQuality === 'off' ? 'active' : ''}" data-value="off">${i18next.t('off')}</button>
          </div>
        </div>
        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">${i18next.t('language')}</div>
                <div class="settings-item-desc">${i18next.t('languageDescription')}</div>
            </div>
            <select class="settings-select" id="settings-language">
                // START-AUTOGEN-LANG_OPTIONS
                <option value="en" ${i18next.language.startsWith('en') ? 'selected' : ''}>${i18next.t('english')}</option>
                <option value="es" ${i18next.language.startsWith('es') ? 'selected' : ''}>${i18next.t('spanish')}</option>
                <option value="fr" ${i18next.language.startsWith('fr') ? 'selected' : ''}>${i18next.t('french')}</option>
                <option value="it" ${i18next.language.startsWith('it') ? 'selected' : ''}>${i18next.t('italian')}</option>
                <option value="ja" ${i18next.language.startsWith('ja') ? 'selected' : ''}>${i18next.t('japanese')}</option>
                <option value="ms" ${i18next.language.startsWith('ms') ? 'selected' : ''}>${i18next.t('malay')}</option>
                <option value="pt" ${i18next.language.startsWith('pt') ? 'selected' : ''}>${i18next.t('portuguese')}</option>
                <option value="sw" ${i18next.language.startsWith('sw') ? 'selected' : ''}>${i18next.t('swahili')}</option>
                <option value="zh" ${i18next.language.startsWith('zh') ? 'selected' : ''}>${i18next.t('chinese')}</option>
// END-AUTOGEN-LANG_OPTIONS
            </select>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('preferSystemFont')}</div>
            <div class="settings-item-desc">${i18next.t('preferSystemFontDescription')}</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-system-font" ${useSystemFont ? 'checked' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('autoDownload')}</div>
            <div class="settings-item-desc">${i18next.t('autoDownloadDescription')}</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-auto-download" ${autoDownloadEnabled ? 'checked' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="settings-item" id="auto-download-size-container" style="${autoDownloadEnabled ? '' : 'display: none;'}">
            <div class="settings-item-info">
                <div class="settings-item-title">${i18next.t('autoDownloadMaxSize')}</div>
                <div class="settings-item-desc">${i18next.t('autoDownloadMaxSizeDescription')}</div>
            </div>
            <input type="number" class="settings-number-input" id="settings-auto-download-max-size" value="${autoDownloadMaxSize}" min="0.001" max="3000" step="any" />
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('pptxPreview')}</div>
            <div class="settings-item-desc">${i18next.t('pptxPreviewDescription')}</div>
          </div>
          <div class="segmented" id="settings-pptx-consent">
            <button type="button" class="seg-btn ${pptxConsent === 'ask' ? 'active' : ''}" data-value="ask">${i18next.t('ask')}</button>
            <button type="button" class="seg-btn ${pptxConsent === 'allow' ? 'active' : ''}" data-value="allow">${i18next.t('allow')}</button>
            <button type="button" class="seg-btn ${pptxConsent === 'deny' ? 'active' : ''}" data-value="deny">${i18next.t('deny')}</button>
          </div>
        </div>

        <div class="settings-item-full-width" style="margin-top: 1rem; margin-bottom: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--c-panel-border);">
            <h4 style="margin: 0; color: var(--c-text-secondary); font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.05em;">${i18next.t('advanced')}</h4>
        </div>
        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">${i18next.t('safeMode')}</div>
                <div class="settings-item-desc">${i18next.t('safeModeDescription')}</div>
            </div>
            <label class="switch">
                <input type="checkbox" class="switch-input" id="settings-opfs-buffer" ${opfsEnabled ? 'checked' : ''} ${!opfsSupported ? 'disabled' : ''}/>
                <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('transferChunkSize')}</div>
            <div class="settings-item-desc">${i18next.t('transferChunkSizeDescription')}</div>
          </div>
          <input type="number" class="settings-number-input" id="settings-chunk-size" value="${chunkSize}" min="16384" max="1048576" step="16384" />
        </div>

        <div class="settings-item-full-width">
            <button class="btn btn-danger" id="reset-preferences-btn">${i18next.t('resetAllPreferences')}</button>
        </div>
      </div>
    `;

    const langSelector = document.getElementById('settings-language');
    if (langSelector) {
        langSelector.addEventListener('change', (e) => {
            const newLang = e.target.value;
            i18next.changeLanguage(newLang);
        });
    }

    const segControls = document.querySelectorAll('.segmented');
    segControls.forEach(seg => {
        seg.addEventListener('click', (e) => {
            const btn = e.target.closest('.seg-btn');
            if (!btn) return;
            seg.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateSettingsSummary();
        });
    });

    const settingsList = uiElements.zipFileList.querySelector('.settings-list');
    if (settingsList) {
        settingsList.addEventListener('change', (e) => {
            if (e.target.classList.contains('switch-input')) {
                if (e.target.id === 'settings-auto-download') {
                    const container = document.getElementById('auto-download-size-container');
                    if (container) {
                        container.style.display = e.target.checked ? '' : 'none';
                    }
                }
                updateSettingsSummary();
            }
        });
    }

    const resetBtn = document.getElementById('reset-preferences-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            showToast({
                type: 'danger',
                title: i18next.t('confirmReset'),
                body: i18next.t('confirmResetDescription'),
                duration: 0, // Persist until user action
                actions: [
                    { text: i18next.t('cancel'), class: 'btn-secondary', callback: () => {} },
                    { text: i18next.t('reset'), class: 'btn-danger', callback: () => {
                            Object.keys(localStorage).forEach(key => {
                                if (key.startsWith('dropsilk-')) {
                                    localStorage.removeItem(key);
                                }
                            });
                            location.reload();
                        }}
                ]
            });
        });
    }

    uiElements.selectAllZipCheckbox.checked = areAllSettingsEnabled();
}

function getSettingsSnapshot() {
    const sounds = document.getElementById('settings-sounds')?.checked ?? true;
    const analytics = document.getElementById('settings-analytics')?.checked ?? false;
    const darkMode = document.getElementById('settings-theme')?.checked ?? false;
    const systemFont = document.getElementById('settings-system-font')?.checked ?? false;
    const autoDownload = document.getElementById('settings-auto-download')?.checked ?? false;
    const autoDownloadMaxSize = document.getElementById('settings-auto-download-max-size')?.value || 100;
    const animationQualitySeg = document.getElementById('settings-animation-quality');
    const animationQuality = animationQualitySeg?.querySelector('.seg-btn.active')?.dataset.value || 'performance';
    const pptxSeg = document.getElementById('settings-pptx-consent');
    const pptx = pptxSeg?.querySelector('.seg-btn.active')?.dataset.value || 'ask';
    const chunkSize = document.getElementById('settings-chunk-size')?.value || 262144;
    const opfs = document.getElementById('settings-opfs-buffer')?.checked ?? false;
    return { sounds, analytics, darkMode, systemFont, autoDownload, autoDownloadMaxSize, animationQuality, pptx, chunkSize, opfs };
}

function areAllSettingsEnabled() {
    const s = getSettingsSnapshot();
    return s.sounds && s.analytics && s.darkMode && s.animationQuality === 'quality' && !s.systemFont && s.autoDownload && s.pptx === 'allow';
}

function toggleAllSettings(isOn) {
    const soundsEl = document.getElementById('settings-sounds');
    const analyticsEl = document.getElementById('settings-analytics');
    const themeEl = document.getElementById('settings-theme');
    const systemFontEl = document.getElementById('settings-system-font');
    const autoDownloadEl = document.getElementById('settings-auto-download');
    if (soundsEl) soundsEl.checked = isOn;
    if (analyticsEl) analyticsEl.checked = isOn;
    if (themeEl) themeEl.checked = isOn;
    if (systemFontEl) systemFontEl.checked = !isOn;
    if (autoDownloadEl) autoDownloadEl.checked = isOn;

    const chunkSizeEl = document.getElementById('settings-chunk-size');
    if (chunkSizeEl) {
        chunkSizeEl.value = '262144'; // Always reset to default on toggle all
    }

    const animationSeg = document.getElementById('settings-animation-quality');
    if (animationSeg) {
        animationSeg.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        const targetValue = isOn ? 'quality' : 'performance';
        const target = animationSeg.querySelector(`.seg-btn[data-value="${targetValue}"]`);
        target?.classList.add('active');
    }

    const pptxSeg = document.getElementById('settings-pptx-consent');
    if (pptxSeg) {
        pptxSeg.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        const target = pptxSeg.querySelector(`.seg-btn[data-value="${isOn ? 'allow' : 'ask'}"]`);
        target?.classList.add('active');
    }
}

function updateSettingsSummary() {
    const s = getSettingsSnapshot();
    const summary = [
        `${i18next.t('sounds')}: <strong>${s.sounds ? i18next.t('on') : i18next.t('off')}</strong>`,
        `${i18next.t('analytics')}: <strong>${s.analytics ? i18next.t('on') : i18next.t('off')}</strong>`,
        `${i18next.t('theme')}: <strong>${s.darkMode ? i18next.t('dark') : i18next.t('light')}</strong>`,
        `${i18next.t('animation')}: <strong>${i18next.t(s.animationQuality)}</strong>`,
        `${i18next.t('font')}: <strong>${s.systemFont ? i18next.t('system') : i18next.t('default')}</strong>`,
        `${i18next.t('autoDownload')}: <strong>${s.autoDownload ? `${i18next.t('on')} (${s.autoDownloadMaxSize} MB)` : i18next.t('off')}</strong>`,
        `${i18next.t('pptxPreview')}: <strong>${i18next.t(s.pptx)}</strong>`,
        `${i18next.t('safeMode')}: <strong>${s.opfs ? i18next.t('on') : i18next.t('off')}</strong>`
    ].join(' • ');
    uiElements.zipSelectionInfo.innerHTML = summary;
    uiElements.selectAllZipCheckbox.checked = areAllSettingsEnabled();
}

function saveSettingsPreferences() {
    const btn = uiElements.downloadSelectedBtn;
    const btnSpan = btn.querySelector('span');
    const saveIcon = btn.querySelector('.save-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');

    btn.disabled = true;

    if (saveIcon) saveIcon.style.display = 'none';
    if (spinnerIcon) spinnerIcon.style.display = 'inline-block';
    if (btnSpan) btnSpan.textContent = i18next.t('saving');

    const s = getSettingsSnapshot();
    applyTheme(s.darkMode ? 'dark' : 'light');
    if (s.sounds) audioManager.enable(); else audioManager.disable();
    applyAnimationQuality(s.animationQuality);
    applySystemFont(s.systemFont);
    localStorage.setItem('dropsilk-system-font', s.systemFont ? 'true' : 'false');
    localStorage.setItem('dropsilk-auto-download', s.autoDownload ? 'true' : 'false');

    // Validate and clamp the max size
    let maxSize = parseFloat(s.autoDownloadMaxSize) || 100;
    const minSize = 0.001;
    const maxAllowedSize = 3000;
    let clampedSize = Math.max(minSize, Math.min(maxSize, maxAllowedSize));

    if (maxSize !== clampedSize) {
        showToast({
            type: 'info',
            title: i18next.t('autoDownloadSizeAdjusted'),
            body: i18next.t('autoDownloadSizeAdjustedDescription'),
            duration: 7000
        });
    }
    localStorage.setItem('dropsilk-auto-download-max-size', clampedSize);
    localStorage.setItem('dropsilk-use-opfs-buffer', s.opfs ? 'true' : 'false');

    // Validate and clamp chunk size
    let chunkSize = parseInt(s.chunkSize, 10) || 262144;
    const minChunk = 16384; // 16 KB
    const maxChunk = 1048576; // 1 MB
    let clampedChunkSize = Math.max(minChunk, Math.min(chunkSize, maxChunk));

    if (chunkSize !== clampedChunkSize) {
        showToast({
            type: 'info',
            title: i18next.t('chunkSizeAdjusted'),
            body: i18next.t('chunkSizeAdjustedDescription', {min: formatBytes(minChunk), max: formatBytes(maxChunk)}),
            duration: 7000
        });
    }
    localStorage.setItem('dropsilk-chunk-size', clampedChunkSize);

    const wasConsented = localStorage.getItem('dropsilk-privacy-consent') === 'true';
    localStorage.setItem('dropsilk-privacy-consent', s.analytics ? 'true' : 'false');
    if (s.analytics && !wasConsented) window.dsActivateAnalytics?.();
    else if (!s.analytics && wasConsented) {
        showToast({
            type: 'info',
            title: i18next.t('analyticsDisabled'),
            body: i18next.t('analyticsDisabledDescription'),
            duration: 7000,
            actions: [{ text: i18next.t('reloadNow'), class: 'btn-primary', callback: () => location.reload() }]
        });
    }
    setPreviewConsent('pptx', s.pptx);
    updatePptxPreviewButtonsDisabled(s.pptx === 'deny');

    setTimeout(() => {
        document.getElementById('closeZipModal')?.click();
        showToast({ type: 'success', title: i18next.t('preferencesSaved'), body: i18next.t('preferencesSavedDescription'), duration: 4000 });
    }, 500);
}