// features/chat/chatPanel.js
// Manages chat panel visibility, fullscreen, and new message indicator

import i18next from '../../i18n.js';

// --- Chat new message indicator state ---
let chatPanelInView = true;
let unreadChatCount = 0;
let chatNewMsgBtn = null;
let chatVisibilityObserver = null;
let chatFullscreenInitialized = false;

export function ensureChatVisibilityObserver() {
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

export function initializeChatFullscreenToggle() {
    if (chatFullscreenInitialized) return;
    const panel = document.getElementById('chat-panel');
    const btn = document.getElementById('chat-fullscreen-btn');
    if (!panel || !btn) return;

    const expandSVG = () =>
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M1 5V1h4v1H2v3H1zM11 1h4v4h-1V2h-3V1zM1 11h1v3h3v1H1v-4zM14 11h1v4h-4v-1h3v-3z"/></svg>';
    const collapseSVG = () =>
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M5 1H1v4h1V2h3V1zM10 1v1h3v3h1V1h-4zM1 10v4h4v-1H2v-3H1zM14 10h-1v3h-3v1h4v-4z"/></svg>';

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
            if (document.fullscreenElement === panel) {
                await document.exitFullscreen();
            } else {
                await panel.requestFullscreen();
            }
        } catch (err) {
            console.error('Chat fullscreen toggle failed:', err);
        }
    });

    document.addEventListener('fullscreenchange', () => {
        refreshIcon();
    });

    refreshIcon();
    chatFullscreenInitialized = true;
}

export function ensureChatNewMsgButton() {
    if (chatNewMsgBtn) return chatNewMsgBtn;
    const btn = document.createElement('button');
    btn.id = 'chat-new-msg-btn';
    btn.className = 'btn btn-primary expand-queue-btn';
    btn.type = 'button';
    btn.style.display = 'none';
    {
        const label = i18next.t('newMessage', 'New Message');
        const chevronSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 6.646a.5.5 0 0 1 .708 0L8 12.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/><path fill-rule="evenodd" d="M1.646 2.646a.5.5 0 0 1 .708 0L8 8.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>';
        btn.innerHTML = `${chevronSVG}<span>${label}</span>`;
    }
    btn.onclick = () => {
        const panel = document.getElementById('chat-panel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Hide and reset count after navigating
        unreadChatCount = 0;
        btn.style.display = 'none';
    };
    // Append to body so it's visible even if chat panel is off-screen
    document.body.appendChild(btn);
    chatNewMsgBtn = btn;
    return btn;
}

export function isElementInViewport(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const vWidth = window.innerWidth || document.documentElement.clientWidth;
    const vHeight = window.innerHeight || document.documentElement.clientHeight;
    return (
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < vHeight &&
        rect.left < vWidth
    );
}

export function initializeChatPanel() {
    ensureChatVisibilityObserver();
    ensureChatNewMsgButton();
    initializeChatFullscreenToggle();
}

// Expose state getters for use by chatMessages.js
export function getChatNewMsgBtn() {
    return chatNewMsgBtn;
}

export function getUnreadChatCount() {
    return unreadChatCount;
}

export function incrementUnreadCount() {
    unreadChatCount += 1;
    return unreadChatCount;
}

export function resetUnreadCount() {
    unreadChatCount = 0;
}
