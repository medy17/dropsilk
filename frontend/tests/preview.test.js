// tests/preview.test.js
import { describe, it, expect } from 'vitest';
// Corrected path: includes 'src'
import { isPreviewable, previewConfig } from '../src/js/preview/previewConfig.js';

describe('Preview Configuration', () => {

    it('should identify image files as previewable', () => {
        expect(isPreviewable('image.png')).toBe(true);
        expect(isPreviewable('photo.jpg')).toBe(true);
    });

    it('should identify code files as previewable', () => {
        expect(isPreviewable('script.js')).toBe(true);
    });

    it('should identify PDF files as previewable', () => {
        expect(isPreviewable('document.pdf')).toBe(true);
    });

    it('should identify PPTX files as previewable', () => {
        expect(isPreviewable('slides.pptx')).toBe(true);
    });

    it('should check requiresUploadConsent for PPTX', () => {
        let pptxConfig;
        for (const key in previewConfig) {
            if (previewConfig[key].extensions.includes('pptx')) {
                pptxConfig = previewConfig[key];
            }
        }
        expect(pptxConfig).toBeDefined();
        expect(pptxConfig.requiresUploadConsent).toBe(true);
    });

    it('should return false for unknown extensions', () => {
        expect(isPreviewable('unknown.exe')).toBe(false);
    });
});