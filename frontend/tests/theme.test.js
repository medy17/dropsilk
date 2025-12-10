// tests/theme.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyTheme, getCurrentTheme } from '../src/js/features/theme/index.js';
import { uiElements } from '../src/js/ui/dom.js';

// Mocks
vi.mock('../src/js/ui/dom.js', () => ({
    uiElements: {
        body: document.createElement('body') // Will be reset in beforeEach
    }
}));

vi.mock('../src/js/state.js', () => ({
    store: {
        getState: vi.fn(() => ({ currentFlightCode: 'TEST12' }))
    }
}));

vi.mock('../src/js/features/settings/settingsData.js', () => ({
    getAllSettings: vi.fn(() => ({ theme: 'default', mode: 'light' }))
}));

// Mock generated config
vi.mock('../src/js/themeConfig.gen.js', () => ({
    THEME_CONFIG: {
        nebula: { darkColor: '#123456' },
        terminal: { darkColor: '#00ff00' }
    }
}));

vi.mock('qrcode', () => ({
    default: {
        toCanvas: vi.fn()
    }
}));

describe('Theme Logic', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset DOM
        uiElements.body = document.createElement('body');
        document.body.innerHTML = `
            <meta name="theme-color" content="#ffffff">
            <button id="theme-toggle"></button>
            <div id="inviteModal" class="modal-overlay"></div>
            <canvas id="qrCanvas"></canvas>
        `;
        localStorage.clear();
    });

    describe('applyTheme', () => {
        it('should apply "nebula" theme', () => {
            applyTheme('nebula', 'dark');
            expect(uiElements.body.getAttribute('data-theme')).toBe('nebula');
            expect(uiElements.body.getAttribute('data-mode')).toBe('dark');
            expect(localStorage.getItem('dropsilk-color-theme')).toBe('nebula');
        });

        it('should apply "terminal" theme', () => {
            applyTheme('terminal', 'light');
            expect(uiElements.body.getAttribute('data-theme')).toBe('terminal');
            expect(uiElements.body.getAttribute('data-mode')).toBe('light');
        });

        it('should apply "default" theme', () => {
            applyTheme('default', 'dark');
            expect(uiElements.body.getAttribute('data-theme')).toBe('default');
        });

        it('should update meta theme color for dark mode (using config)', () => {
            // Mock config return
            applyTheme('nebula', 'dark');
            const meta = document.querySelector('meta[name="theme-color"]');
            expect(meta.getAttribute('content')).toBe('#123456'); // From mock
        });

        it('should use default dark color for unconfigured themes', () => {
            applyTheme('unknown-theme', 'dark');
            const meta = document.querySelector('meta[name="theme-color"]');
            // Default defined in index.js for dark is #111113
            expect(meta.getAttribute('content')).toBe('#111113');
        });

        it('should use default light color for light mode', () => {
            applyTheme('nebula', 'light');
            const meta = document.querySelector('meta[name="theme-color"]');
            expect(meta.getAttribute('content')).toBe('#ffffff');
        });
    });

    describe('getCurrentTheme', () => {
        it('should retrieve current theme from DOM', () => {
            uiElements.body.setAttribute('data-theme', 'sunset');
            expect(getCurrentTheme()).toBe('sunset');
        });

        it('should default to light if missing', () => {
            // Current logic actually defaults string 'light' if attr is missing, 
            // though semantically 'default' theme might be better, the code says 'light' or 'default'?
            // Code: return body.getAttribute('data-theme') || 'light';
            expect(getCurrentTheme()).toBe('light');
        });
    });

});
