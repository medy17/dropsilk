// src/js/ui/chat.js
import i18next from '../i18n.js';
import { store } from '../state.js';
import { sendData } from '../network/webrtc.js';
import { showToast } from '../utils/toast.js';

let chatPanelInView = true;
let unreadChatCount = 0;
let chatNewMsgBtn = null;
let chatVisibilityObserver = null;
let chatFullscreenInitialized = false;

function ensureChatVisibilityObserver() {
    if (chatVisibilityObserver) return;
    const panel = document.getElementById('chat-panel');
    if (!panel) return;
    chatVisibilityObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        chatPanelInView = entry && entry.isIntersecting;
        if (chatPanelInView) {
            unreadChatCount = 0;
            if (chatNewMsgBtn) chatNewMsgBtn.style.display = 'none';
        }
    }, { threshold: 0.2 });
    chatVisibilityObserver.observe(panel);
}

function initializeChatFullscreenToggle() {
    if (chatFullscreenInitialized) return;
    const panel = document.getElementById('chat-panel');
    const btn = document.getElementById('chat-fullscreen-btn');
    if (!panel || !btn) return;

    const expandSVG = () => '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M1 5V1h4v1H2v3H1zM11 1h4v4h-1V2h-3V1zM1 11h1v3h3v1H1v-4zM14 11h1v4h-4v-1h3v-3z"/></svg>';
    const collapseSVG = () => '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M5 1H1v4h1V2h3V1zM10 1v1h3v3h1V1h-4zM1 10v4h4v-1H2v-3H1zM14 10h-1v3h-3v1h4v-4z"/></svg>';

    const refreshIcon = () => {
        const isFs = document.fullscreenElement === panel;
        if (isFs) {
            btn.innerHTML = collapseSVG();
            btn.title = i18next.t('exitFullscreen', 'Exit fullscreen');
            btn.setAttribute('aria-label', i18next.t('exitFullscreen', 'Exit fullscreen'));
        } else {
            btn.innerHTML = expandSVG();
            btn.title = i18next.t('enterFullscreen', 'Expand chat');
            btn.setAttribute('aria-label', i18next.t('enterFullscreen', 'Expand chat'));
        }
    };

    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            if (document.fullscreenElement === panel) await document.exitFullscreen();
            else await panel.requestFullscreen();
        } catch (err) {
            console.error('Chat fullscreen toggle failed:', err);
        }
    });

    document.addEventListener('fullscreenchange', refreshIcon);
    refreshIcon();
    chatFullscreenInitialized = true;
}

function ensureChatNewMsgButton() {
    if (chatNewMsgBtn) return chatNewMsgBtn;
    const btn = document.createElement('button');
    btn.id = 'chat-new-msg-btn';
    btn.className = 'btn btn-primary expand-queue-btn';
    btn.type = 'button';
    btn.style.display = 'none';
    const label = i18next.t('newMessage', 'New Message');
    const chevronSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 6.646a.5.5 0 0 1 .708 0L8 12.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/><path fill-rule="evenodd" d="M1.646 2.646a.5.5 0 0 1 .708 0L8 8.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>`;
    btn.innerHTML = `${chevronSVG}<span>${label}</span>`;

    btn.onclick = () => {
        const panel = document.getElementById('chat-panel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        unreadChatCount = 0;
        btn.style.display = 'none';
    };
    document.body.appendChild(btn);
    chatNewMsgBtn = btn;
    return btn;
}

function isElementInViewport(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const vWidth = window.innerWidth || document.documentElement.clientWidth;
    const vHeight = window.innerHeight || document.documentElement.clientHeight;
    return (rect.bottom > 0 && rect.right > 0 && rect.top < vHeight && rect.left < vWidth);
}

export function initializeChat() {
    setTimeout(() => {
        ensureChatVisibilityObserver();
        ensureChatNewMsgButton();
        initializeChatFullscreenToggle();
    }, 0);
}

export function resetChatView() {
    const log = document.getElementById('chat-log');
    if (!log) return;
    log.innerHTML = `<div class="empty-state">${i18next.t('startChatPlaceholder')}</div>`;
    unreadChatCount = 0;
    if (chatNewMsgBtn) chatNewMsgBtn.style.display = 'none';
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

    ensureChatVisibilityObserver();
    ensureChatNewMsgButton();

    const trimmed = (text || '').trim();
    if (!trimmed) return;

    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
    const isFirstChatMessage = !!log.querySelector('.empty-state');

    if (author === 'peer' && isFirstChatMessage && !store.getState().hasScrolledForChatReceive) {
        const panel = document.getElementById('chat-panel');
        if (panel) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            store.actions.setHasScrolledForChatReceive(true);
        }
    }

    if (log.querySelector('.empty-state')) log.innerHTML = '';

    const item = document.createElement('div');
    item.className = `chat-message chat-message--${author === 'me' ? 'me' : 'peer'}`;
    const safeTime = timestamp || Date.now();
    const authorLabel = author === 'me' ? i18next.t('you') : store.getState().peerInfo?.name || i18next.t('peer');
    const timeLabel = new Date(safeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    item.innerHTML = `
    <div class="chat-bubble">
      <div class="chat-text"></div>
      <div class="chat-meta">
        <span class="chat-author">${authorLabel}</span>
        <span class="chat-time">${timeLabel}</span>
      </div>
    </div>`;

    const TRUNCATE_LIMIT = 2000;
    const needsTruncate = trimmed.length > TRUNCATE_LIMIT;
    const shortText = needsTruncate ? `${trimmed.slice(0, TRUNCATE_LIMIT)}…` : trimmed;
    const textEl = item.querySelector('.chat-text');
    textEl.textContent = shortText;

    if (needsTruncate) {
        const readMoreBtn = document.createElement('button');
        readMoreBtn.type = 'button';
        readMoreBtn.className = 'btn btn-secondary chat-read-more-btn';
        readMoreBtn.textContent = i18next.t('readMore', 'Read More');
        readMoreBtn.addEventListener('click', () => {
            textEl.textContent = trimmed;
            readMoreBtn.remove();
        });
        const bubble = item.querySelector('.chat-bubble');
        bubble.insertBefore(readMoreBtn, bubble.querySelector('.chat-meta'));
    }
    log.appendChild(item);

    if (atBottom) log.scrollTop = log.scrollHeight;

    const panel = document.getElementById('chat-panel');
    const panelInViewNow = isElementInViewport(panel);
    if (author === 'peer' && store.getState().hasScrolledForChatReceive && chatNewMsgBtn && !panelInViewNow) {
        unreadChatCount += 1;
        const label = unreadChatCount === 1 ? i18next.t('newMessage', 'New Message') : i18next.t('newMessages', 'New Messages');
        const chevronSVG = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" viewBox=\"0 0 16 16\"><path fill-rule=\"evenodd\" d=\"M1.646 6.646a.5.5 0 0 1 .708 0L8 12.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z\"/><path fill-rule=\"evenodd\" d=\"M1.646 2.646a.5.5 0 0 1 .708 0L8 8.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z\"/></svg>`;
        chatNewMsgBtn.innerHTML = `${chevronSVG}<span>${label}</span>`;
        chatNewMsgBtn.style.display = 'inline-flex';
    }
}

export function setupChatEvents() {
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    if (!form || !input || !sendBtn) return;

    const getInputText = () => {
        if (input.isContentEditable) return (input.innerText || '').replace(/\u00a0/g, ' ').trim();
        return (input.value || '').trim();
    };

    const clearInput = () => {
        if (input.isContentEditable) input.textContent = '';
        else input.value = '';
    };

    const send = () => {
        const text = getInputText();
        if (!text) return;

        const MAX_CHAT_CHARS = 20000;
        if (text.length > MAX_CHAT_CHARS) {
            showToast({
                type: 'danger',
                title: i18next.t('chatTooLongTitle'),
                body: i18next.t('chatTooLongBody'),
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

        const payload = { kind: 'chat', text, sentAt: Date.now() };
        try {
            sendData(JSON.stringify(payload));
            appendChatMessage({ author: 'me', text, timestamp: payload.sentAt });
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

    sendBtn.addEventListener('click', () => send());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });
    input.addEventListener('input', () => {
        const MAX_CHAT_CHARS = 20000;
        if (input.isContentEditable) {
            const text = (input.innerText || '').replace(/\u00a0/g, ' ');
            if (text.length > MAX_CHAT_CHARS) {
                input.innerText = text.slice(0, MAX_CHAT_CHARS);
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