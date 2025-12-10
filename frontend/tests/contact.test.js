// tests/contact.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetContactModal } from '../src/js/features/contact/contactModal.js';

// Mock i18n
vi.mock('../src/js/i18n.js', () => ({
    default: { t: (k) => k }
}));

describe('Contact Modal', () => {

    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML = `
            <div id="email-view-initial-state" style="display: none;"></div>
            <div id="email-view-captcha-state" style="display: block;"></div>
            <div id="email-view-revealed-state" style="display: block;"></div>
            <div id="captcha-pretext" style="display: none;"></div>
        `;

        // Mock global recaptcha
        window.grecaptcha = {
            reset: vi.fn(),
        };
    });

    afterEach(() => {
        delete window.grecaptcha;
    });

    describe('resetContactModal', () => {
        it('should reset DOM elements to initial state', () => {
            resetContactModal();

            const initial = document.getElementById('email-view-initial-state');
            const captcha = document.getElementById('email-view-captcha-state');
            const revealed = document.getElementById('email-view-revealed-state');
            const pretext = document.getElementById('captcha-pretext');

            expect(initial.style.display).toBe('block');
            expect(captcha.style.display).toBe('none');
            expect(revealed.style.display).toBe('none');
            expect(pretext.style.display).toBe('block');
        });

        it('should call grecaptcha.reset()', () => {
            resetContactModal();
            expect(window.grecaptcha.reset).toHaveBeenCalled();
        });

        it('should handle missing grecaptcha gracefully', () => {
            delete window.grecaptcha;
            expect(() => resetContactModal()).not.toThrow();
        });
    });
});
