
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSettingsModalHTML, bindSettingsEvents } from '../src/js/features/settings/settingsUI.js';
// We mock these to control the behavior during tests
import { audioManager } from '../src/js/utils/audioManager.js';
import * as themeForMock from '../src/js/features/theme/index.js';
import * as settingsData from '../src/js/features/settings/settingsData.js';
import i18next from '../src/js/i18n.js';

// --- MOCKS ---

// Mock i18n
vi.mock('../src/js/i18n.js', () => ({
    default: {
        t: (key) => key,
        changeLanguage: vi.fn(),
        language: 'en',
    }
}));

// Mock Audio Manager
vi.mock('../src/js/utils/audioManager.js', () => ({
    audioManager: {
        enable: vi.fn(),
        disable: vi.fn(),
    }
}));

// Mock Theme Actions
vi.mock('../src/js/features/theme/index.js', () => ({
    applyTheme: vi.fn(),
}));

// Mock Settings Data Layer
vi.mock('../src/js/features/settings/settingsData.js', () => ({
    getAllSettings: vi.fn(() => ({
        sounds: true,
        analytics: false,
        theme: 'default',
        mode: 'light',
        animationQuality: 'performance',
        systemFont: false,
        autoDownload: false,
        opfsEnabled: false,
        chunkSize: 16384,
    })),
    getPreviewConsentMap: vi.fn(() => ({ pptx: 'ask' })),
    setPreviewConsent: vi.fn(),
    applyAnimationQuality: vi.fn(),
    applySystemFont: vi.fn(),
    updateSetting: vi.fn(), // If used directly
}));

// Mock Theme Config
vi.mock('../src/themeConfig.gen.js', () => ({
    AVAILABLE_THEMES: ['default', 'ocean', 'sunset'],
    THEME_CONFIG: {
        'default': { name: 'Default' },
        'ocean': { name: 'Ocean' },
        'sunset': { name: 'Sunset' },
    }
}));

describe('Settings UI Integration', () => {
    let container;

    beforeEach(() => {
        vi.clearAllMocks();
        // Create a container to render the modal into
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    const renderAndBind = () => {
        container.innerHTML = createSettingsModalHTML();
        bindSettingsEvents(container, () => { });
    };

    describe('Rendering', () => {
        it('should render all settings keys', () => {
            renderAndBind();

            // basic check for existence
            expect(container.querySelector('#settings-sounds')).not.toBeNull();
            expect(container.querySelector('#settings-analytics')).not.toBeNull();
            expect(container.querySelector('#settings-mode')).not.toBeNull(); // Dark Mode
            expect(container.querySelector('#settings-theme-selector')).not.toBeNull();
            expect(container.querySelector('#settings-animation-quality')).not.toBeNull();
        });

        it('should render dynamic theme options', () => {
            renderAndBind();
            const selector = container.querySelector('#settings-theme-selector');
            const options = Array.from(selector.options).map(o => o.value);

            // Should include default + mocked values
            expect(options).toContain('default');
            expect(options).toContain('ocean');
            expect(options).toContain('sunset');
        });

        it('should respect initial state from data layer', () => {
            // Setup mock to return specific values
            settingsData.getAllSettings.mockReturnValueOnce({
                sounds: false,
                analytics: true,
                mode: 'dark',
                theme: 'ocean',
                animationQuality: 'quality', // 'quality' makes that btn active
                systemFont: true,
                autoDownload: true,
                opfsEnabled: true,
            });

            renderAndBind();

            expect(container.querySelector('#settings-sounds').checked).toBe(false);
            expect(container.querySelector('#settings-analytics').checked).toBe(true);

            // Mode checkbox: checked = dark
            expect(container.querySelector('#settings-mode').checked).toBe(true);

            // Theme selector
            expect(container.querySelector('#settings-theme-selector').value).toBe('ocean');

            // Segmented controls use 'active' class
            const qualityBtn = container.querySelector(`#settings-animation-quality .seg-btn[data-value="quality"]`);
            expect(qualityBtn.classList.contains('active')).toBe(true);
        });
    });

    describe('Interactions', () => {
        it('should toggle sounds and call audioManager', () => {
            renderAndBind();
            const checkbox = container.querySelector('#settings-sounds');

            // Initial is true (mock default), so let's uncheck it
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));

            expect(audioManager.disable).toHaveBeenCalled();

            // Check it back
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            expect(audioManager.enable).toHaveBeenCalled();
        });

        it('should toggle analytics and update localStorage', () => {
            const spy = vi.spyOn(window.localStorage, 'setItem');
            renderAndBind();

            const checkbox = container.querySelector('#settings-analytics');
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true })); // bubbles is important for delegation if any

            expect(spy).toHaveBeenCalledWith('dropsilk-privacy-consent', 'true');
        });

        it('should change dark mode and apply theme', () => {
            renderAndBind();
            const checkbox = container.querySelector('#settings-mode');

            // Toggle on (Dark)
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));

            expect(themeForMock.applyTheme).toHaveBeenCalledWith(null, 'dark');

            // Toggle off (Light)
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));

            expect(themeForMock.applyTheme).toHaveBeenCalledWith(null, 'light');
        });

        it('should change theme selector and apply theme', () => {
            renderAndBind();
            const selector = container.querySelector('#settings-theme-selector');

            selector.value = 'sunset';
            selector.dispatchEvent(new Event('change', { bubbles: true }));

            expect(themeForMock.applyTheme).toHaveBeenCalledWith('sunset', null);
        });

        it('should change animation quality and call data layer', () => {
            renderAndBind();

            // Find the 'off' button
            const offBtn = container.querySelector(`#settings-animation-quality .seg-btn[data-value="off"]`);
            offBtn.click();

            expect(settingsData.applyAnimationQuality).toHaveBeenCalledWith('off');
            expect(offBtn.classList.contains('active')).toBe(true);
        });

        it('should handle reset preferences', () => {
            // Mock confirm to return true
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            // Mock location.reload
            const reloadSpy = vi.fn();
            Object.defineProperty(window, 'location', {
                writable: true,
                value: { reload: reloadSpy }
            });
            const removeSpy = vi.spyOn(window.localStorage, 'removeItem');

            renderAndBind();

            const resetBtn = container.querySelector('#reset-preferences-btn');
            resetBtn.click();

            expect(window.confirm).toHaveBeenCalled();
            expect(removeSpy).toHaveBeenCalledWith('dropsilk-mode'); // Check at least one
            expect(themeForMock.applyTheme).toHaveBeenCalledWith('default', 'light');
            expect(reloadSpy).toHaveBeenCalled();
        });
    });
});
