// features/chat/chatMessages.js
// Handles chat message rendering, enabling/disabling chat

import i18next from '../../i18n.js';
import { store } from '../../state.js';
import {
    ensureChatVisibilityObserver,
    ensureChatNewMsgButton,
    isElementInViewport,
    getChatNewMsgBtn,
    incrementUnreadCount,
    resetUnreadCount,
} from './chatPanel.js';

export function resetChatView() {
    const log = document.getElementById('chat-log');
    if (!log) return;

    log.innerHTML = `<div class="empty-state">${i18next.t(
        'startChatPlaceholder',
    )}</div>`;
    // Reset new message indicator
    resetUnreadCount();
    const chatNewMsgBtn = getChatNewMsgBtn();
    if (chatNewMsgBtn) {
        chatNewMsgBtn.style.display = 'none';
    }
}

export function disableChat() {
    const panel = document.getElementById('chat-panel');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const fsBtn = document.getElementById('chat-fullscreen-btn');
    if (panel) panel.classList.add('disabled');
    if (input) {
        if (input.isContentEditable) {
            input.setAttribute('contenteditable', 'false');
            input.setAttribute('aria-disabled', 'true');
            input.setAttribute('tabindex', '-1');
        } else {
            input.disabled = true;
        }
    }
    if (sendBtn) sendBtn.disabled = true;
    if (fsBtn) fsBtn.disabled = true;
}

export function enableChat() {
    const panel = document.getElementById('chat-panel');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const fsBtn = document.getElementById('chat-fullscreen-btn');
    if (panel) panel.classList.remove('disabled');
    if (input) {
        if (input.isContentEditable || input.getAttribute('contenteditable') !== null) {
            input.setAttribute('contenteditable', 'true');
            input.removeAttribute('aria-disabled');
            input.removeAttribute('tabindex');
            input.setAttribute('data-placeholder', i18next.t('typeMessagePlaceholder', 'Type a message…'));
        } else {
            input.disabled = false;
            input.placeholder = i18next.t('typeMessagePlaceholder', 'Type a message…');
        }
    }
    if (sendBtn) sendBtn.disabled = false;
    if (fsBtn) fsBtn.disabled = false;
}

export function appendChatMessage({ author, text, timestamp }) {
    const log = document.getElementById('chat-log');
    if (!log) return;

    // Make sure the observer and button are ready
    ensureChatVisibilityObserver();
    ensureChatNewMsgButton();

    const trimmed = (text || '').trim();
    if (!trimmed) return;

    const atBottom =
        log.scrollTop + log.clientHeight >= log.scrollHeight - 40;

    // Scroll chat into view on the first received message (peer)
    const isFirstChatMessage = !!log.querySelector('.empty-state');
    if (
        author === 'peer' &&
        isFirstChatMessage &&
        !store.getState().hasScrolledForChatReceive
    ) {
        const panel = document.getElementById('chat-panel');
        if (panel) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            store.actions.setHasScrolledForChatReceive(true);
        }
    }

    if (log.querySelector('.empty-state')) {
        log.innerHTML = '';
    }

    const item = document.createElement('div');
    item.className = `chat-message chat-message--${author === 'me' ? 'me' : 'peer'
    }`;

    const safeTime = timestamp || Date.now();
    const authorLabel =
        author === 'me'
            ? i18next.t('you')
            : store.getState().peerInfo?.name || i18next.t('peer');

    const timeLabel = new Date(safeTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });

    item.innerHTML = `
    <div class="chat-bubble">
      <div class="chat-text"></div>
      <div class="chat-meta">
        <span class="chat-author">${authorLabel}</span>
        <span class="chat-time">${timeLabel}</span>
      </div>
    </div>
  `;

    // Truncate long messages to current limit (2000), with Read More toggle
    const TRUNCATE_LIMIT = 2000;
    const needsTruncate = trimmed.length > TRUNCATE_LIMIT;
    const shortText = needsTruncate
        ? `${trimmed.slice(0, TRUNCATE_LIMIT)}…`
        : trimmed;

    const textEl = item.querySelector('.chat-text');
    textEl.textContent = shortText;

    if (needsTruncate) {
        const readMoreBtn = document.createElement('button');
        readMoreBtn.type = 'button';
        readMoreBtn.className = 'btn btn-secondary chat-read-more-btn';
        readMoreBtn.textContent = i18next.t('readMore', 'Read More');
        readMoreBtn.addEventListener('click', () => {
            textEl.textContent = trimmed; // expand to full
            readMoreBtn.remove();
        });
        const bubble = item.querySelector('.chat-bubble');
        bubble.insertBefore(readMoreBtn, bubble.querySelector('.chat-meta'));
    }
    log.appendChild(item);

    if (atBottom) {
        log.scrollTop = log.scrollHeight;
    }

    // After the initial auto-scroll: if user isn't viewing chat panel, show indicator
    const panel = document.getElementById('chat-panel');
    const panelInViewNow = isElementInViewport(panel);
    const chatNewMsgBtn = getChatNewMsgBtn();
    if (
        author === 'peer' &&
        store.getState().hasScrolledForChatReceive &&
        chatNewMsgBtn &&
        !panelInViewNow
    ) {
        const count = incrementUnreadCount();
        const label = count === 1
            ? i18next.t('newMessage', 'New Message')
            : i18next.t('newMessages', 'New Messages');
        const chevronSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 6.646a.5.5 0 0 1 .708 0L8 12.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/><path fill-rule="evenodd" d="M1.646 2.646a.5.5 0 0 1 .708 0L8 8.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>';
        chatNewMsgBtn.innerHTML = `${chevronSVG}<span>${label}</span>`;
        chatNewMsgBtn.style.display = 'inline-flex';
    }
}
