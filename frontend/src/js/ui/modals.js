// ui/modals.js
// Thin orchestration layer for modal management
// All specific modal logic is in feature modules

import { uiElements } from './dom.js';
import i18next from '../i18n.js';

// Import feature modules
import { initializeTheme } from '../features/theme/index.js';
import { initializeAnimationQuality, initializeSystemFont, getAllSettings, getSettingsSummary } from '../features/settings/settingsData.js';
import { createSettingsModalHTML, bindSettingsEvents } from '../features/settings/settingsUI.js';
import { setupInviteModal } from '../features/invite/inviteModal.js';
import {
    populateZipModal,
    resetZipModal,
    updateZipSelection,
    setupZipModal,
    setZipModalMode,
    getZipModalMode
} from '../features/zip/zipModal.js';
import { setupContactModal, resetContactModal } from '../features/contact/contactModal.js';
import { initializeDrawer } from './drawer.js';
import { audioManager } from '../utils/audioManager.js';
import { updatePptxPreviewButtonsDisabled } from '../preview/previewManager.js';
import { formatBytes } from '../utils/helpers.js';

/**
 * Resets the preview modal
 */
function resetPreviewModal() {
    const contentElement = document.getElementById('preview-content');
    if (contentElement.dataset.objectUrl) {
        URL.revokeObjectURL(contentElement.dataset.objectUrl);
        delete contentElement.dataset.objectUrl;
    }
    contentElement.innerHTML = '';
}

/**
 * Opens the settings modal (reuses the zip modal UI)
 */
function openSettingsModal() {
    setZipModalMode('settings');
    const modal = document.getElementById('zipModal');
    if (modal) modal.classList.add('settings-mode');

    const header = document.querySelector('#zipModal .modal-header h3');
    if (header) header.textContent = i18next.t('settings');

    // Show default footer (contains save button), hide warning footer
    if (uiElements.zipModalDefaultFooter) uiElements.zipModalDefaultFooter.style.display = 'block';
    if (uiElements.zipModalWarningFooter) uiElements.zipModalWarningFooter.style.display = 'none';

    const btn = uiElements.downloadSelectedBtn;
    const btnSpan = btn.querySelector('span');
    const downloadIcon = btn.querySelector('.download-icon');
    const saveIcon = btn.querySelector('.save-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');
    const checkIcon = btn.querySelector('.check-icon');

    if (btnSpan) btnSpan.textContent = i18next.t('savePreferences');
    if (downloadIcon) downloadIcon.style.display = 'none';
    if (saveIcon) saveIcon.style.display = 'inline-block';
    if (spinnerIcon) spinnerIcon.style.display = 'none';
    if (checkIcon) checkIcon.style.display = 'none';
    btn.disabled = false;

    const selectAllLabel = uiElements.selectAllZipCheckbox?.closest('.checkbox-label')?.querySelector('span:last-of-type');
    if (selectAllLabel) selectAllLabel.textContent = i18next.t('enableAll');

    // Populate settings
    uiElements.zipFileList.innerHTML = createSettingsModalHTML();

    // Bind events
    bindSettingsEvents(uiElements.zipFileList, updateSettingsSummary);

    updateSettingsSummary();
}

/**
 * Updates the settings summary in the header
 */
function updateSettingsSummary() {
    // Use the summary from settingsData module
    uiElements.zipSelectionInfo.innerHTML = getSettingsSummary();
    uiElements.downloadSelectedBtn.disabled = false;

    // Update select all checkbox based on boolean settings
    const settings = getAllSettings();
    const booleanSettings = [settings.sounds, settings.analytics, settings.systemFont, settings.autoDownload, settings.opfsEnabled];
    const allOn = booleanSettings.every(v => v === true);
    uiElements.selectAllZipCheckbox.checked = allOn;
}

/**
 * Toggles all boolean settings
 */
function toggleAllSettings(isOn) {
    // Sounds
    const soundsEl = document.getElementById('settings-sounds');
    if (soundsEl) {
        soundsEl.checked = isOn;
        soundsEl.dispatchEvent(new Event('change'));
    }

    // Analytics
    const analyticsEl = document.getElementById('settings-analytics');
    if (analyticsEl) {
        analyticsEl.checked = isOn;
        analyticsEl.dispatchEvent(new Event('change'));
    }

    // Theme
    const themeEl = document.getElementById('settings-theme');
    if (themeEl) {
        themeEl.checked = isOn;
        themeEl.dispatchEvent(new Event('change'));
    }

    // System font
    const fontEl = document.getElementById('settings-system-font');
    if (fontEl) {
        fontEl.checked = isOn;
        fontEl.dispatchEvent(new Event('change'));
    }

    // Auto download
    const autoEl = document.getElementById('settings-auto-download');
    if (autoEl) {
        autoEl.checked = isOn;
        autoEl.dispatchEvent(new Event('change'));
    }

    // OPFS
    const opfsEl = document.getElementById('settings-opfs-buffer');
    if (opfsEl && !opfsEl.disabled) {
        opfsEl.checked = isOn;
        opfsEl.dispatchEvent(new Event('change'));
    }
}

/**
 * Saves settings preferences (closes modal)
 */
const saveSettingsPreferences = () => {
    // Visual feedback elements
    const btn = uiElements.downloadSelectedBtn;
    const saveIcon = btn.querySelector('.save-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');
    const checkIcon = btn.querySelector('.check-icon');
    const btnSpan = btn.querySelector('span');
    const originalText = i18next.t('savePreferences');

    // 1. Show spinner
    if (saveIcon) saveIcon.style.display = 'none';
    if (spinnerIcon) spinnerIcon.style.display = 'inline-block';
    if (btnSpan) btnSpan.textContent = i18next.t('saving');
    btn.disabled = true;

    // Simulate saving delay (e.g. 500ms)
    setTimeout(() => {
        // 2. Show checkmark
        if (spinnerIcon) spinnerIcon.style.display = 'none';
        if (checkIcon) checkIcon.style.display = 'inline-block';
        if (btnSpan) btnSpan.textContent = i18next.t('saved', 'Saved!'); // Ensure 'saved' key exists or use fallback

        // 3. Close after delay
        setTimeout(() => {
            // Update PPTX preview buttons
            updatePptxPreviewButtonsDisabled();

            // Close modal
            document.getElementById('closeZipModal')?.click();

            // Reset button state (optional, but good for next open)
            // Ideally existing openSettingsModal resets it, but safe to do here if needed
            // For now, rely on openSettingsModal to reset.
        }, 750);
    }, 500);
};

/**
 * Initializes all modals
 */
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
    setupZipModal(
        (isOn) => { toggleAllSettings(isOn); updateSettingsSummary(); },
        saveSettingsPreferences
    );
    initializeDrawer();

    i18next.on('languageChanged', () => {
        const settingsModal = document.getElementById('zipModal');
        if (settingsModal && settingsModal.classList.contains('show') && settingsModal.classList.contains('settings-mode')) {
            openSettingsModal();
        }
    });
}