// tests/security.test.js
import { describe, it, expect } from 'vitest';
import { isExecutable } from '../src/js/utils/security.js';

describe('Security Checks', () => {

    it('should flag standard executables', () => {
        const dangerous = [
            'setup.exe', 'script.bat', 'installer.msi',
            'app.dmg', 'linux_tool.sh', 'program.bin',
            'package.deb', 'mobile_app.apk', 'server.jar'
        ];

        dangerous.forEach(file => {
            expect(isExecutable(file)).toBe(true);
        });
    });

    it('should NOT flag safe files', () => {
        const safe = [
            'image.png', 'photo.jpeg', 'doc.pdf',
            'notes.txt', 'music.mp3', 'movie.mp4',
            'archive.zip', 'styles.css'
        ];

        safe.forEach(file => {
            expect(isExecutable(file)).toBe(false);
        });
    });

    it('should handle case insensitivity', () => {
        expect(isExecutable('VIRUS.EXE')).toBe(true);
        expect(isExecutable('Script.Sh')).toBe(true);
    });

    it('should handle whitespace padding', () => {
        expect(isExecutable('  malware.exe  ')).toBe(true);
    });

    it('should handle double extensions correctly', () => {
        // Last extension matches
        expect(isExecutable('document.pdf.exe')).toBe(true);
        // Last extension is safe
        expect(isExecutable('program.exe.txt')).toBe(false);
    });

    it('should return false for files without extensions', () => {
        expect(isExecutable('makefile')).toBe(false);
        expect(isExecutable('LICENSE')).toBe(false);
    });

    it('should return false for empty or invalid input', () => {
        expect(isExecutable('')).toBe(false);
        expect(isExecutable(null)).toBe(false);
        expect(isExecutable(undefined)).toBe(false);
    });
});