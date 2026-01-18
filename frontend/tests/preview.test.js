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

    it('should identify HEIC files as previewable', () => {
        expect(isPreviewable('photo.heic')).toBe(true);
        expect(isPreviewable('image.heif')).toBe(true);
    });

    it('should identify audio files as previewable', () => {
        expect(isPreviewable('song.mp3')).toBe(true);
        expect(isPreviewable('recording.wav')).toBe(true);
    });

    it('should identify markdown files as previewable', () => {
        expect(isPreviewable('readme.md')).toBe(true);
    });

    it('should identify DOCX files as previewable', () => {
        expect(isPreviewable('doc.docx')).toBe(true);
    });

    it('should identify PSD files as previewable', () => {
        expect(isPreviewable('design.psd')).toBe(true);
    });

    it('should identify XLSX files as previewable', () => {
        expect(isPreviewable('sheet.xlsx')).toBe(true);
        expect(isPreviewable('data.csv')).toBe(true);
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

// NOTE: Preview Manager (previewManager.js) requires extensive DOM manipulation
// and dynamic script loading. Its core functionality is better tested via E2E
// tests rather than unit tests with heavy mocking.