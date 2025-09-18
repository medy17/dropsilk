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

    const url = `https://dropsilk.xyz/?code=${currentFlightCode}`;
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
            '<div class="empty-state">No files to download.</div>';
        // Also reset header info
        uiElements.zipSelectionInfo.textContent = '0 files selected (0 Bytes)';
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

    uiElements.zipSelectionInfo.textContent = `${totalSelected} files selected (${formatBytes(
        totalSize
    )})`;
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
    if (header) header.textContent = 'Download Files as Zip';

    uiElements.selectAllZipCheckbox.checked = false;
    updateZipSelection();

    if (uiElements.zipModalDefaultFooter) uiElements.zipModalDefaultFooter.style.display = 'block';
    if (uiElements.zipModalWarningFooter) uiElements.zipModalWarningFooter.style.display = 'none';

    const selectAllLabel = uiElements.selectAllZipCheckbox
        ?.closest('.checkbox-label')
        ?.querySelector('span:last-of-type');
    if (selectAllLabel) selectAllLabel.textContent = 'Select All';
    uiElements.zipSelectionInfo.textContent = '0 files selected (0 Bytes)';

    const btn = uiElements.downloadSelectedBtn;
    const btnSpan = btn.querySelector('span');
    const downloadIcon = btn.querySelector('.download-icon');
    const saveIcon = btn.querySelector('.save-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');

    // --- Reset button text and icons to default state ---
    if (btnSpan) btnSpan.textContent = 'Download Selected as Zip';
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
        copyToClipboard(`https://dropsilk.xyz/?code=${store.getState().currentFlightCode}`, e.currentTarget, 'Link Copied!');
    });

    document.getElementById('copyCodeBtn')?.addEventListener('click', (e) => {
        if (navigator.vibrate) {
            navigator.vibrate([50, 40, 15]);
        }
        copyToClipboard(store.getState().currentFlightCode, e.currentTarget, 'Code Copied!');
    });

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

        if (window.grecaptcha && captchaWidgetId === null) {
            onRecaptchaLoadCallback();
        }
    });

    copyEmailBtn?.addEventListener('click', (e) => {
        if (navigator.vibrate) {
            navigator.vibrate([50, 40, 15]);
        }
        copyToClipboard('ahmed@dropsilk.xyz', e.currentTarget, 'Email Copied!');
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
    if (header) header.textContent = 'Settings';

    const btn = uiElements.downloadSelectedBtn;

    btn.disabled = false;

    const btnSpan = btn.querySelector('span');
    const downloadIcon = btn.querySelector('.download-icon');
    const saveIcon = btn.querySelector('.save-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');

    if (btnSpan) btnSpan.textContent = 'Save Preferences';
    if (downloadIcon) downloadIcon.style.display = 'none';
    if (saveIcon) saveIcon.style.display = 'inline-block';
    if (spinnerIcon) spinnerIcon.style.display = 'none';

    const selectAllLabel = uiElements.selectAllZipCheckbox?.closest('.checkbox-label')?.querySelector('span:last-of-type');
    if (selectAllLabel) selectAllLabel.textContent = 'Enable All';

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
            <div class="settings-item-title">Sounds</div>
            <div class="settings-item-desc">Play sounds for connects, invites, and transfers.</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-sounds" ${soundsEnabled ? 'checked' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">Analytics</div>
            <div class="settings-item-desc">Anonymous usage analytics (with your consent).</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-analytics" ${analyticsConsented ? 'checked' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">Dark Mode</div>
            <div class="settings-item-desc">Prefer darker colours throughout the app.</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-theme" ${theme === 'dark' ? 'checked' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">Animation Quality</div>
            <div class="settings-item-desc">Control background animations to improve performance.</div>
          </div>
          <div class="segmented" id="settings-animation-quality">
            <button type="button" class="seg-btn ${animationQuality === 'quality' ? 'active' : ''}" data-value="quality">Best</button>
            <button type="button" class="seg-btn ${animationQuality === 'performance' ? 'active' : ''}" data-value="performance">Basic</button>
            <button type="button" class="seg-btn ${animationQuality === 'off' ? 'active' : ''}" data-value="off">Off</button>
          </div>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">Prefer System Font</div>
            <div class="settings-item-desc">Use your device's default font for a native feel.</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-system-font" ${useSystemFont ? 'checked' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">Auto-Download</div>
            <div class="settings-item-desc">Automatically download completed files under a certain size.</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-auto-download" ${autoDownloadEnabled ? 'checked' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
        <div class="settings-item" id="auto-download-size-container" style="${autoDownloadEnabled ? '' : 'display: none;'}">
            <div class="settings-item-info">
                <div class="settings-item-title">Auto-Download Max Size (MB)</div>
                <div class="settings-item-desc">Range: 0.001MB to 3000MB. Limits prevent browser crashes and spam.</div>
            </div>
            <input type="number" class="settings-number-input" id="settings-auto-download-max-size" value="${autoDownloadMaxSize}" min="0.001" max="3000" step="any" />
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">PPTX Preview</div>
            <div class="settings-item-desc">Control consent for PPTX preview uploads.</div>
          </div>
          <div class="segmented" id="settings-pptx-consent">
            <button type="button" class="seg-btn ${pptxConsent === 'ask' ? 'active' : ''}" data-value="ask">Ask</button>
            <button type="button" class="seg-btn ${pptxConsent === 'allow' ? 'active' : ''}" data-value="allow">Allow</button>
            <button type="button" class="seg-btn ${pptxConsent === 'deny' ? 'active' : ''}" data-value="deny">Deny</button>
          </div>
        </div>

        <div class="settings-item-full-width" style="margin-top: 1rem; margin-bottom: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--c-panel-border);">
            <h4 style="margin: 0; color: var(--c-text-secondary); font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.05em;">Advanced</h4>
        </div>
        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">Safe Mode (OPFS)</div>
                <div class="settings-item-desc">Write directly to local storage instead of RAM to prevent browser crashes. May cause slower transfers on especially large files or slow storage devices. Requires refresh to apply.</div>
            </div>
            <label class="switch">
                <input type="checkbox" class="switch-input" id="settings-opfs-buffer" ${opfsEnabled ? 'checked' : ''} ${!opfsSupported ? 'disabled' : ''}/>
                <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">Transfer Chunk Size (Bytes)</div>
            <div class="settings-item-desc">Adjust for network conditions. Default: 262144 (256KB). Larger for LAN, smaller for Wi-Fi and Mobile Data. <br>Warning: too large or too small will cause disconnects and throttle downloads respectively.</div>
          </div>
          <input type="number" class="settings-number-input" id="settings-chunk-size" value="${chunkSize}" min="16384" max="1048576" step="16384" />
        </div>

        <div class="settings-item-full-width">
            <button class="btn btn-danger" id="reset-preferences-btn">Reset All Preferences</button>
        </div>
      </div>
    `;

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
                title: 'Confirm Reset',
                body: 'Are you sure? This will reset all your preferences and disconnect you from your current session.',
                duration: 0, // Persist until user action
                actions: [
                    { text: 'Cancel', class: 'btn-secondary', callback: () => {} },
                    { text: 'Reset', class: 'btn-danger', callback: () => {
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
        `Sounds: <strong>${s.sounds ? 'On' : 'Off'}</strong>`,
        `Analytics: <strong>${s.analytics ? 'On' : 'Off'}</strong>`,
        `Theme: <strong>${s.darkMode ? 'Dark' : 'Light'}</strong>`,
        `Animation: <strong>${s.animationQuality.charAt(0).toUpperCase() + s.animationQuality.slice(1)}</strong>`,
        `Font: <strong>${s.systemFont ? 'System' : 'Default'}</strong>`,
        `Auto-Download: <strong>${s.autoDownload ? `On (${s.autoDownloadMaxSize} MB)` : 'Off'}</strong>`,
        `PPTX: <strong>${s.pptx[0].toUpperCase() + s.pptx.slice(1)}</strong>`,
        `Safe Mode: <strong>${s.opfs ? 'On' : 'Off'}</strong>`
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
    if (btnSpan) btnSpan.textContent = 'Saving...';

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
            title: 'Auto-Download Size Adjusted',
            body: `The value was adjusted to fit the allowed range (0.001MB - 3000MB).`,
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
            title: 'Chunk Size Adjusted',
            body: `Value was adjusted to fit the allowed range (${formatBytes(minChunk)} - ${formatBytes(maxChunk)}).`,
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
            title: 'Analytics disabled',
            body: 'Your preference will fully apply after a reload.',
            duration: 7000,
            actions: [{ text: 'Reload now', class: 'btn-primary', callback: () => location.reload() }]
        });
    }
    setPreviewConsent('pptx', s.pptx);
    updatePptxPreviewButtonsDisabled(s.pptx === 'deny');

    setTimeout(() => {
        document.getElementById('closeZipModal')?.click();
        showToast({ type: 'success', title: 'Preferences saved', body: 'Your settings have been updated.', duration: 4000 });
    }, 500);
}