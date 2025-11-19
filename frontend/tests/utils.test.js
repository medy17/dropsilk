// tests/utils.test.js
import { describe, it, expect } from 'vitest';
// Corrected path: includes 'src'
import { formatBytes, generateRandomName, getFileIcon } from '../src/js/utils/helpers.js';

describe('Helper Functions', () => {

    describe('formatBytes', () => {
        it('should return "0 Bytes" for 0 input', () => {
            expect(formatBytes(0)).toBe('0 Bytes');
        });

        it('should format KB correctly', () => {
            expect(formatBytes(1024)).toBe('1 KB');
        });

        it('should format MB correctly with decimals', () => {
            expect(formatBytes(1572864)).toBe('1.5 MB');
        });

        it('should format GB correctly', () => {
            expect(formatBytes(1073741824)).toBe('1 GB');
        });
    });

    describe('generateRandomName', () => {
        it('should return a string', () => {
            const name = generateRandomName();
            expect(typeof name).toBe('string');
        });

        it('should match the AdjectiveNounNumber pattern', () => {
            const name = generateRandomName();
            expect(name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d+$/);
        });
    });

    describe('getFileIcon', () => {
        it('should return image SVG for .jpg', () => {
            const icon = getFileIcon('test.jpg');
            expect(icon).toContain('<svg');
            expect(icon).toContain('#e3f7fd');
        });

        it('should return video SVG for .mp4', () => {
            const icon = getFileIcon('movie.mp4');
            expect(icon).toContain('#f5eafd');
        });

        it('should return default SVG for unknown extensions', () => {
            const icon = getFileIcon('unknown.xyz');
            expect(icon).toContain('#f4f4f5');
        });
    });
});