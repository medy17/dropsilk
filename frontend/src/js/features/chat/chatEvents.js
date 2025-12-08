// features/chat/chatEvents.js
// Handles chat form events and message sending

import i18next from '../../i18n.js';
import { store } from '../../state.js';
import { sendData } from '../../network/webrtc.js';
import { showToast } from '../../utils/toast.js';
import { appendChatMessage } from './chatMessages.js';

export function setupChat() {
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    if (!form || !input || !sendBtn) return;

    const getInputText = () => {
        // Support contenteditable or input
        if (input.isContentEditable) {
            return (input.innerText || '').replace(/\u00a0/g, ' ').trim();
        }
        return (input.value || '').trim();
    };

    const clearInput = () => {
        if (input.isContentEditable) {
            input.textContent = '';
        } else {
            input.value = '';
        }
    };

    const send = () => {
        const text = getInputText();
        if (!text) return;

        const MAX_CHAT_CHARS = 20000;
        if (text.length > MAX_CHAT_CHARS) {
            showToast({
                type: 'danger',
                title: i18next.t('chatTooLongTitle', 'Message too long'),
                body: i18next.t(
                    'chatTooLongBody',
                    'Limit is 20,000 characters. Consider sending a .txt via file sharing.',
                ),
                duration: 7000,
            });
            return;
        }

        const state = store.getState();
        if (!state.peerInfo) {
            showToast({
                type: 'danger',
                title: i18next.t('noPeerForChatTitle'),
                body: i18next.t('noPeerForChatBody'),
                duration: 5000,
            });
            return;
        }

        const payload = {
            kind: 'chat',
            text,
            sentAt: Date.now(),
        };

        try {
            sendData(JSON.stringify(payload));
            appendChatMessage({
                author: 'me',
                text,
                timestamp: payload.sentAt,
            });
            clearInput();
        } catch (err) {
            console.error('Failed to send chat message:', err);
            showToast({
                type: 'danger',
                title: i18next.t('chatSendFailedTitle'),
                body: i18next.t('chatSendFailedBody'),
                duration: 5000,
            });
        }
    };

    // Click to send (since chat input is no longer in a form)
    sendBtn.addEventListener('click', () => {
        send();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });

    // Optional: enforce max length while typing for contenteditable
    input.addEventListener('input', () => {
        const MAX_CHAT_CHARS = 20000;
        if (input.isContentEditable) {
            const text = (input.innerText || '').replace(/\u00a0/g, ' ');
            if (text.length > MAX_CHAT_CHARS) {
                input.innerText = text.slice(0, MAX_CHAT_CHARS);
                // move caret to end
                const range = document.createRange();
                range.selectNodeContents(input);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    });
}
