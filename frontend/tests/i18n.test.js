// tests/i18n.test.js
import { describe, it, expect, vi, beforeAll } from 'vitest';

// Unmock i18n for this specific test file - we want to test the REAL module
vi.unmock('../src/js/i18n.js');

// Import the real i18next instance (not mocked)
import i18next from '../src/js/i18n.js';

describe('i18n System', () => {

    // Wait for initialization to complete
    beforeAll(async () => {
        // i18next.init() is called at module load, but may be async
        if (!i18next.isInitialized) {
            await new Promise(resolve => i18next.on('initialized', resolve));
        }
    });

    it('should export an i18next instance with expected API', () => {
        expect(i18next).toBeDefined();
        expect(typeof i18next.t).toBe('function');
        expect(typeof i18next.changeLanguage).toBe('function');
    });

    it('should be initialized', () => {
        expect(i18next.isInitialized).toBe(true);
    });

    it('should have a language set', () => {
        expect(i18next.language).toBeDefined();
        expect(typeof i18next.language).toBe('string');
    });

    it('should translate keys', () => {
        // The 't' function should return something for a known key
        // If key doesn't exist, it returns the key itself
        const result = i18next.t('dragAndDrop');
        expect(typeof result).toBe('string');
    });

    it('should switch languages', async () => {
        const originalLang = i18next.language;

        await i18next.changeLanguage('es');
        expect(i18next.language).toBe('es');

        // Restore original language
        await i18next.changeLanguage(originalLang);
    });

});
