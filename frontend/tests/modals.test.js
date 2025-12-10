// tests/modals.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeModals } from '../src/js/ui/modals.js';
import { uiElements } from '../src/js/ui/dom.js';
import i18next from '../src/js/i18n.js';

// Mocks
vi.mock('../src/js/ui/dom.js', () => ({
    uiElements: {
        body: document.createElement('body'),
        zipModalDefaultFooter: document.createElement('div'),
        zipModalWarningFooter: document.createElement('div'),
        downloadSelectedBtn: document.createElement('button'),
        zipSelectionInfo: document.createElement('div'),
        zipFileList: document.createElement('div'),
        selectAllZipCheckbox: document.createElement('input'),
    }
}));

// Mock button structure
uiElements.downloadSelectedBtn.innerHTML = `
    <span></span>
    <i class="download-icon"></i>
    <i class="save-icon"></i>
    <i class="spinner-icon"></i>
    <i class="check-icon"></i>
`;
uiElements.selectAllZipCheckbox.type = 'checkbox';
uiElements.selectAllZipCheckbox.closest = () => {
    const label = document.createElement('label');
    label.innerHTML = '<span></span><span>Label</span>';
    return label;
};

vi.mock('../src/js/i18n.js', () => ({
    default: {
        t: (key) => key,
        on: vi.fn(),
        language: 'en'
    }
}));

vi.mock('../src/js/features/theme/index.js', () => ({
    initializeTheme: vi.fn(),
}));

vi.mock('../src/js/features/settings/settingsData.js', () => ({
    initializeAnimationQuality: vi.fn(),
    initializeSystemFont: vi.fn(),
    getAllSettings: vi.fn(() => ({ sounds: true, analytics: false })),
    getSettingsSummary: vi.fn(() => 'Summary'),
}));

vi.mock('../src/js/features/settings/settingsUI.js', () => ({
    createSettingsModalHTML: vi.fn(() => '<div>Settings</div>'),
    bindSettingsEvents: vi.fn(),
}));

vi.mock('../src/js/features/invite/inviteModal.js', () => ({ setupInviteModal: vi.fn() }));
vi.mock('../src/js/features/zip/zipModal.js', () => ({
    setupZipModal: vi.fn(),
    resetZipModal: vi.fn(),
    setZipModalMode: vi.fn(),
    getZipModalMode: vi.fn(),
    populateZipModal: vi.fn(),
    updateZipSelection: vi.fn(),
}));

vi.mock('../src/js/utils/helpers.js', () => ({
    formatBytes: vi.fn(),
}));
vi.mock('../src/js/features/contact/contactModal.js', () => ({ setupContactModal: vi.fn() }));
vi.mock('../src/js/ui/drawer.js', () => ({ initializeDrawer: vi.fn() }));
vi.mock('../src/js/utils/audioManager.js', () => ({ audioManager: {} }));
vi.mock('../src/js/preview/previewManager.js', () => ({ updatePptxPreviewButtonsDisabled: vi.fn() }));


describe('Modals System', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = `
            <div id="inviteBtn"></div><div id="closeInviteModal"></div><div id="inviteModal" class="modal-overlay"></div>
            <div id="downloadAllBtn"></div><div id="closeZipModal"></div><div id="zipModal" class="modal-overlay"></div>
            <div id="settingsBtn"></div>
            <button id="ko-fiBtn"></button><div id="closeDonateModal"></div><div id="donateModal" class="modal-overlay"></div>
            <button id="aboutBtn"></button><div id="closeAboutModal"></div><div id="aboutModal" class="modal-overlay"></div>
            <button id="contactBtn"></button><div id="closeContactModal"></div><div id="contactModal" class="modal-overlay"></div>
            <button id="termsBtn"></button><div id="closeTermsModal"></div><div id="termsModal" class="modal-overlay"></div>
            <button id="privacyBtn"></button><div id="closePrivacyModal"></div><div id="privacyModal" class="modal-overlay"></div>
            <button id="securityBtn"></button><div id="closeSecurityModal"></div><div id="securityModal" class="modal-overlay"></div>
            <button id="faqBtn"></button><div id="closeFaqModal"></div><div id="faqModal" class="modal-overlay"></div>
            <button id="openPreviewModal"></button><div id="closePreviewModal"></div><div id="previewModal" class="modal-overlay"></div>
        `;
    });

    it('should initialize all modal listeners', () => {
        const inviteBtn = document.getElementById('inviteBtn');
        const spy = vi.spyOn(inviteBtn, 'addEventListener');

        initializeModals();

        expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should open modal when trigger clicked', () => {
        initializeModals();

        const inviteBtn = document.getElementById('inviteBtn');
        const inviteModal = document.getElementById('inviteModal');

        inviteBtn.click();

        expect(inviteModal.classList.contains('show')).toBe(true);
        // Check body overflow mock in uiElements
        // uiElements.body.style.overflow should be 'hidden'
        expect(uiElements.body.style.overflow).toBe('hidden');
    });

    it('should close modal when close button clicked', () => {
        initializeModals();
        const inviteBtn = document.getElementById('inviteBtn');
        const closeBtn = document.getElementById('closeInviteModal');
        const inviteModal = document.getElementById('inviteModal');

        inviteBtn.click();
        expect(inviteModal.classList.contains('show')).toBe(true);

        closeBtn.click();
        expect(inviteModal.classList.contains('show')).toBe(false);
    });

});
