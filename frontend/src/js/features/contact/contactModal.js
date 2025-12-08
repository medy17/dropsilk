// features/contact/contactModal.js
// Handles the contact modal functionality

import i18next from '../../i18n.js';

/**
 * Copies text to clipboard and shows feedback on button
 */
async function copyToClipboard(text, button, successText = 'Copied!') {
    await navigator.clipboard.writeText(text);

    const originalText = button.innerHTML;
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/></svg>${successText}`;
    button.classList.add('success');
    setTimeout(() => {
        button.innerHTML = originalText;
        button.classList.remove('success');
    }, 2000);
}

/**
 * Sets up the contact modal event listeners
 */
export function setupContactModal() {
    const copyEmailBtn = document.getElementById('copyEmailBtn');

    copyEmailBtn?.addEventListener('click', (e) => {
        const el = document.getElementById('revealed-email-link');
        const email = el?.textContent?.trim() || '';
        if (!email) return;
        if (navigator.vibrate) navigator.vibrate([50, 40, 15]);
        copyToClipboard('ahmed@dropsilk.xyz', e.currentTarget, i18next.t('emailCopied'));
    });
}

/**
 * Resets the contact modal to its initial state
 */
export function resetContactModal() {
    const initialState = document.getElementById('email-view-initial-state');
    if (initialState) initialState.style.display = 'block';

    const captchaState = document.getElementById('email-view-captcha-state');
    if (captchaState) captchaState.style.display = 'none';

    const revealedState = document.getElementById('email-view-revealed-state');
    if (revealedState) revealedState.style.display = 'none';

    const pretext = document.getElementById('captcha-pretext');
    if (pretext) pretext.style.display = 'block';

    if (typeof window.grecaptcha?.reset === 'function') {
        window.grecaptcha.reset();
    }
}
