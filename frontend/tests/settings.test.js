// tests/settings.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getAllSettings,
    updateSetting,
    getSettingsSummary,
    initializeAnimationQuality,
    applyAnimationQuality,
    applySystemFont
} from '../src/js/features/settings/settingsData.js';
import { audioManager } from '../src/js/utils/audioManager.js';

// Mock dependencies
vi.mock('../src/js/utils/audioManager.js', () => ({
    audioManager: {
        isEnabled: vi.fn(() => true),
        enable: vi.fn(),
        disable: vi.fn(),
    }
}));

vi.mock('../src/js/theme/index.js', () => ({
    applyTheme: vi.fn(),
    getCurrentTheme: vi.fn(() => 'default'),
}));

vi.mock('../src/js/i18n.js', () => ({
    default: {
        language: 'en',
        changeLanguage: vi.fn(),
        t: vi.fn((key) => key),
    }
}));

describe('Settings Data & Logic', () => {

    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        vi.clearAllMocks();
    });

    describe('getAllSettings', () => {
        it('should return default values when localStorage is empty', () => {
            const settings = getAllSettings();

            expect(settings.sounds).toBe(true); // Mocked audioManager defaults to true
            expect(settings.analytics).toBe(false);
            expect(settings.theme).toBe('default');
            expect(settings.mode).toBe('light');
            expect(settings.animationQuality).toBe('performance');
            expect(settings.systemFont).toBe(false);
            expect(settings.autoDownload).toBe(false);
            expect(settings.opfsEnabled).toBe(false);
        });

        it('should read values from localStorage', () => {
            localStorage.setItem('dropsilk-mode', 'dark');
            localStorage.setItem('dropsilk-system-font', 'true');

            const settings = getAllSettings();
            expect(settings.mode).toBe('dark');
            expect(settings.systemFont).toBe(true);
        });
    });

    describe('updateSetting', () => {
        it('should update localStorage for analytics', () => {
            updateSetting('analytics', true);
            expect(localStorage.getItem('dropsilk-privacy-consent')).toBe('true');

            updateSetting('analytics', false);
            expect(localStorage.getItem('dropsilk-privacy-consent')).toBe('false');
        });

        it('should update audioManager for sounds', () => {
            updateSetting('sounds', false);
            expect(audioManager.disable).toHaveBeenCalled();

            updateSetting('sounds', true);
            expect(audioManager.enable).toHaveBeenCalled();
        });

        it('should update localStorage for system font', () => {
            updateSetting('systemFont', true);
            expect(localStorage.getItem('dropsilk-system-font')).toBe('true');
        });
    });

    describe('getSettingsSummary', () => {
        it('should generate a correct summary string', () => {
            // Setup a specific state
            updateSetting('mode', 'dark');
            localStorage.setItem('dropsilk-color-theme', 'sunset');

            const summary = getSettingsSummary();

            expect(summary).toContain('sounds: <span');
            expect(summary).toContain('mode: dark');
            // Mock returns 'default' for theme, so we expect default logic or mapped logic
            // Actually getSettingsSummary reads getAllSettings which reads localStorage for theme
            // Let's ensure getAllSettings reads what we set
            expect(summary).toContain('theme: theme_sunset');
        });
    });

    describe('Animation Quality', () => {
        it('should apply performance mode correctly', () => {
            applyAnimationQuality('performance');
            expect(document.body.classList.contains('reduced-effects')).toBe(true);
            expect(document.body.classList.contains('no-effects')).toBe(false);
            expect(localStorage.getItem('dropsilk-animation-quality')).toBe('performance');
        });

        it('should apply quality mode correctly', () => {
            applyAnimationQuality('quality');
            expect(document.body.classList.contains('reduced-effects')).toBe(false);
            expect(localStorage.getItem('dropsilk-animation-quality')).toBe('quality');
        });

        it('should initialize from localStorage', () => {
            localStorage.setItem('dropsilk-animation-quality', 'off');
            initializeAnimationQuality();
            expect(document.body.classList.contains('no-effects')).toBe(true);
        });
    });

    describe('System Font', () => {
        it('should toggle system font class', () => {
            applySystemFont(true);
            expect(document.body.classList.contains('use-system-font')).toBe(true);

            applySystemFont(false);
            expect(document.body.classList.contains('use-system-font')).toBe(false);
        });
    });

});
