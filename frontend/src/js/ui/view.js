// js/ui/view.js
// Contains functions for rendering UI updates based on application state.

import i18next from '../i18n.js';
import { uiElements } from './dom.js';
import { store } from '../state.js';
import { getFileIcon, formatBytes } from '../utils/helpers.js';

// --- Chat new message indicator state ---
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

function ensureChatNewMsgButton() {
    if (chatNewMsgBtn) return chatNewMsgBtn;
    const btn = document.createElement('button');
    btn.id = 'chat-new-msg-btn';
    btn.className = 'btn btn-primary expand-queue-btn';
    btn.type = 'button';
    btn.style.display = 'none';
    {
        const label = i18next.t('newMessage', 'New Message');
        const chevronSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 6.646a.5.5 0 0 1 .708 0L8 12.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/><path fill-rule="evenodd" d="M1.646 2.646a.5.5 0 0 1 .708 0L8 8.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>`;
        btn.innerHTML = `${chevronSVG}<span>${label}</span>`;
    }
    btn.onclick = () => {
        const panel = document.getElementById('chat-panel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Hide and reset count after navigating
        unreadChatCount = 0;
        btn.style.display = 'none';
    };
    // Append to body so it’s visible even if chat panel is off-screen
    document.body.appendChild(btn);
    chatNewMsgBtn = btn;
    return btn;
}

function isElementInViewport(el) {
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

export function showBoardingOverlay(flightCode) {
    if (uiElements.boardingOverlay) {
        uiElements.setupContainer.style.display = 'none';
        document.getElementById('boarding-flight-code').textContent =
            flightCode.toUpperCase();
        uiElements.boardingOverlay.classList.add('show');
    }
}

export function hideBoardingOverlay() {
    if (uiElements.boardingOverlay) {
        uiElements.boardingOverlay.classList.remove('show');
    }
}

export function failBoarding() {
    if (uiElements.boardingOverlay) {
        uiElements.boardingOverlay.classList.remove('show');
        uiElements.setupContainer.style.display = 'flex';
    }
}

function addPulseEffect(element) {
    if (!element || element.querySelector('.pulse-ring')) return;
    element.classList.add('pulse-effect');
    element.insertAdjacentHTML(
        'beforeend',
        `<span class="pulse-ring"></span><span class="pulse-ring"></span><span class="pulse-ring"></span>`,
    );

    // Allow the parent ticket (if it exists) to overflow so the pulse isn't clipped.
    const parentTicket = element.closest('.flight-ticket');
    if (parentTicket) {
        parentTicket.classList.add('allow-pulse-overflow');
    }
}

export function clearAllPulseEffects() {
    document.querySelectorAll('.pulse-effect').forEach((element) => {
        element.classList.remove('pulse-effect');
        element.querySelectorAll('.pulse-ring').forEach((ring) => ring.remove());
    });
    // Clean up any overflow overrides on flight tickets.
    document
        .querySelectorAll('.flight-ticket.allow-pulse-overflow')
        .forEach((ticket) => {
            ticket.classList.remove('allow-pulse-overflow');
        });
}

export function initializeOnboardingPulses() {
    const hasSeenCreateFlightPulse =
        localStorage.getItem('hasSeenCreateFlightPulse') === 'true';
    if (!hasSeenCreateFlightPulse && uiElements.createFlightBtn) {
        addPulseEffect(uiElements.createFlightBtn);
    }
}

export function renderUserName() {
    uiElements.userNameDisplay.textContent = store.getState().myName;
}

export function enterFlightMode(flightCode) {
    store.actions.setCurrentFlightCode(flightCode);
    uiElements.setupContainer.style.display = 'none';
    uiElements.dashboard.style.display = 'flex';
    setDashboardFlightCode(flightCode);
    disableDropZone();
    renderNetworkUsersView();
    resetChatView();
    // Disable chat until a peer connects
    disableChat();
    // Initialize chat visibility tracking when entering a flight
    setTimeout(() => {
        ensureChatVisibilityObserver();
        ensureChatNewMsgButton();
        initializeChatFullscreenToggle();
    }, 0);
}

export function exitFlightMode() {
    uiElements.setupContainer.style.display = 'flex';
    uiElements.dashboard.style.display = 'none';

    // === OTP Input Reset ===
    const ghostInput = document.getElementById('otp-ghost-input');
    if (ghostInput) {
        ghostInput.value = '';
        // Manually trigger the update since we don't have a native event here
        if (typeof window.updateOtpInputStates === 'function') {
            window.updateOtpInputStates();
        }
    }

    uiElements.sendingQueueDiv.innerHTML = `<div class="empty-state">${i18next.t(
        'selectFilesToSend',
    )}</div>`;
    uiElements.receiverQueueDiv.innerHTML = `<div class="empty-state">${i18next.t(
        'waitingForIncomingFiles',
    )}</div>`;
    store.actions.clearReceivedFiles();
    updateReceiverActions();
    resetChatView();
}

function setDashboardFlightCode(code) {
    const btn = uiElements.dashboardFlightCodeBtn;
    btn.setAttribute('data-code', code);
    btn.innerHTML = `<span class="code-text">${code}</span>`;
    if (!btn.querySelector('.copy-feedback')) {
        const feedback = document.createElement('span');
        feedback.className = 'copy-feedback';
        feedback.textContent = i18next.t('copied');
        btn.appendChild(feedback);
    }
}

export function updateDashboardStatus(text, type) {
    const statusEl = uiElements.dashboardFlightStatus;
    statusEl.textContent = text;
    const styles = {
        connected: {
            color: '#15803d',
            bgColor: '#f0fdf4',
            borderColor: '#bbf7d0',
        },
        disconnected: {
            color: '#d97706',
            bgColor: '#fffbe6',
            borderColor: '#fde68a',
        },
        default: {
            color: 'var(--c-secondary)',
            bgColor: 'var(--c-panel-bg)',
            borderColor: 'var(--c-primary)',
        },
    };
    const style = styles[type] || styles.default;
    statusEl.style.color = style.color;
    statusEl.style.backgroundColor = style.bgColor;
    statusEl.style.borderColor = style.borderColor;
}

export function renderNetworkUsersView() {
    const { lastNetworkUsers, currentFlightCode, isFlightCreator } =
        store.getState();
    uiElements.connectionPanelTitle.textContent = i18next.t(
        'usersOnYourNetwork',
    );
    const list = uiElements.connectionPanelList;
    list.innerHTML = '';

    const hasSeenPulse = localStorage.getItem('hasSeenInvitePulse') === 'true';
    const shouldShowCreatorPulse =
        !hasSeenPulse && currentFlightCode && isFlightCreator;

    if (shouldShowCreatorPulse) {
        const mainInviteBtn = document.getElementById('inviteBtn');
        if (mainInviteBtn) addPulseEffect(mainInviteBtn);
        if (uiElements.dashboardFlightCodeBtn)
            addPulseEffect(uiElements.dashboardFlightCodeBtn);
    }

    if (lastNetworkUsers.length === 0) {
        list.innerHTML = `<div class="empty-state">${i18next.t(
            'noOtherUsersFoundOnNetwork',
        )}</div>`;
        return;
    }

    lastNetworkUsers.forEach((user) => {
        const userEl = document.createElement('div');
        userEl.className = 'network-user-item';
        userEl.innerHTML = `
            <div class="network-user-details">
                <span class="network-user-name">${user.name}</span>
                <span class="network-user-id">${i18next.t('userId', {
            id: user.id,
        })}</span>
            </div>
            <button class="btn btn-primary invite-user-btn" data-invitee-id="${
            user.id
        }" ${
            !currentFlightCode
                ? `disabled title="${i18next.t('createOrJoinFlightToInvite')}"`
                : ''
        }>
                ${i18next.t('invite')}
            </button>`;
        list.appendChild(userEl);

        if (shouldShowCreatorPulse) {
            const inviteBtn = userEl.querySelector('.invite-user-btn');
            if (inviteBtn) addPulseEffect(inviteBtn);
        }
    });
}

export function renderInFlightView() {
    const { peerInfo, myId, myName } = store.getState();
    if (!peerInfo) return;
    uiElements.connectionPanelTitle.textContent = i18next.t('inFlightWith');
    uiElements.connectionPanelList.innerHTML = `
        <div class="inflight-user-item">
            <div class="inflight-user-details"><span class="inflight-user-name">${myName}</span><span class="user-badge">${i18next.t(
        'you',
    )}</span></div>
            <span class="inflight-user-id">${i18next.t('userId', {
        id: myId,
    })}</span>
        </div>
        <div class="inflight-user-item">
            <div class="inflight-user-details"><span class="inflight-user-name">${
        peerInfo.name
    }</span></div>
            <span class="inflight-user-id">${i18next.t('userId', {
        id: peerInfo.id,
    })}</span>
        </div>`;
}

export function disableDropZone() {
    uiElements.dropZone.classList.add('disabled');
    uiElements.dropZoneText.textContent = i18next.t('waitingForPeer');
    uiElements.dropZoneSecondaryText.textContent = i18next.t('invitePeer');
}

export function enableDropZone() {
    uiElements.dropZone.classList.remove('disabled');
    uiElements.dropZoneText.textContent = i18next.t('dragAndDrop');
    uiElements.dropZoneSecondaryText.textContent = i18next.t('orSelectManually');
}

export function showLocalStreamView(stream, qualityChangeCallback) {
    const panel = document.getElementById('local-stream-panel');
    const video = document.getElementById('local-video');
    const settingsMenu = panel.querySelector('.stream-settings-menu');
    const settingsBtn = panel.querySelector('.stream-settings-btn');

    if (!panel || !video) return;
    video.srcObject = stream;
    panel.classList.remove('hidden');

    settingsMenu.onclick = (e) => {
        const button = e.target.closest('button');
        if (button && button.dataset.quality) {
            qualityChangeCallback(button.dataset.quality);
            settingsMenu
                .querySelectorAll('button')
                .forEach((b) => b.classList.remove('active'));
            button.classList.add('active');
            settingsMenu.style.display = 'none';
        }
    };

    settingsBtn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = settingsMenu.style.display === 'block';
        settingsMenu.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            document.addEventListener(
                'click',
                () => {
                    settingsMenu.style.display = 'none';
                },
                { once: true },
            );
        }
    };
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function hideLocalStreamView() {
    const panel = document.getElementById('local-stream-panel');
    const video = document.getElementById('local-video');
    if (panel && video) {
        video.srcObject = null;
        panel.classList.add('hidden');
    }
}

export function showRemoteStreamView(stream) {
    const panel = document.getElementById('screen-share-panel');
    const video = document.getElementById('remote-video');
    const fullscreenBtn = document.getElementById('fullscreen-stream-btn');

    if (!panel || !video) return;
    video.srcObject = stream;
    panel.classList.remove('hidden');

    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await panel.requestFullscreen();
                if (screen.orientation && typeof screen.orientation.lock === 'function') {
                    if (video.videoWidth > video.videoHeight) {
                        await screen.orientation.lock('landscape');
                    }
                }
            } else {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error('Fullscreen or orientation lock failed:', err);
        }
    };

    fullscreenBtn.onclick = toggleFullscreen;
    video.ondblclick = toggleFullscreen;

    const handleFullscreenChange = () => {
        panel.classList.toggle('is-fullscreen', !!document.fullscreenElement);
        if (
            !document.fullscreenElement &&
            screen.orientation &&
            typeof screen.orientation.unlock === 'function'
        ) {
            screen.orientation.unlock();
        }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    stream.getVideoTracks()[0].onended = () => hideRemoteStreamView();

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function hideRemoteStreamView() {
    const panel = document.getElementById('screen-share-panel');
    const video = document.getElementById('remote-video');
    if (panel && video) {
        if (document.fullscreenElement === panel) {
            document.exitFullscreen();
        }
        video.srcObject = null;
        panel.classList.add('hidden');
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            screen.orientation.unlock();
        }
    }
}

export function updateShareButton(isSharing) {
    const btn = document.getElementById('shareScreenBtn');
    if (!btn) return;

    btn.classList.remove('hidden');
    const textSpan = btn.querySelector('span:not([class])');
    if (isSharing) {
        btn.classList.add('is-sharing');
        if (textSpan) textSpan.textContent = i18next.t('stopSharing');
    } else {
        btn.classList.remove('is-sharing');
        if (textSpan) textSpan.textContent = i18next.t('shareScreen');
    }
}

export function resetChatView() {
    const log = document.getElementById('chat-log');
    if (!log) return;

    log.innerHTML = `<div class="empty-state">${i18next.t(
        'startChatPlaceholder',
    )}</div>`;
    // Reset new message indicator
    unreadChatCount = 0;
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
        input.disabled = true;
        // Keep existing placeholder; disabled state communicates clearly
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
        input.disabled = false;
        input.placeholder = i18next.t('typeMessagePlaceholder', 'Type a message…');
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
    item.className = `chat-message chat-message--${
        author === 'me' ? 'me' : 'peer'
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
    if (
        author === 'peer' &&
        store.getState().hasScrolledForChatReceive &&
        chatNewMsgBtn &&
        !panelInViewNow
    ) {
        unreadChatCount += 1;
        const label = unreadChatCount === 1
            ? i18next.t('newMessage', 'New Message')
            : i18next.t('newMessages', 'New Messages');
        const chevronSVG = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"currentColor\" viewBox=\"0 0 16 16\"><path fill-rule=\"evenodd\" d=\"M1.646 6.646a.5.5 0 0 1 .708 0L8 12.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z\"/><path fill-rule=\"evenodd\" d=\"M1.646 2.646a.5.5 0 0 1 .708 0L8 8.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z\"/></svg>`;
        chatNewMsgBtn.innerHTML = `${chevronSVG}<span>${label}</span>`;
        chatNewMsgBtn.style.display = 'inline-flex';
    }
}

export function updateReceiverActions() {
    const { receivedFiles } = store.getState();
    uiElements.receiverActionsContainer.style.display =
        receivedFiles.length > 3 ? 'block' : 'none';
}

export function updateMetricsUI() {
    const state = store.getState();
    const now = Date.now();
    const elapsedSeconds = (now - state.lastMetricsUpdateTime) / 1000;
    if (elapsedSeconds === 0) return;

    const totalBytesInInterval = state.sentInInterval + state.receivedInInterval;
    const speed = totalBytesInInterval / elapsedSeconds;

    uiElements.metricsSentEl.textContent = formatBytes(state.totalBytesSent);
    uiElements.metricsReceivedEl.textContent = formatBytes(
        state.totalBytesReceived,
    );
    uiElements.metricsSpeedEl.textContent = `${formatBytes(speed)}/s`;

    store.actions.resetIntervalMetrics(now);
}

export function checkQueueOverflow(queueId) {
    const queueDiv = document.getElementById(queueId);
    if (!queueDiv) return;
    const parent = queueDiv.parentElement;
    if (!parent) return;

    const existingBtn = parent.querySelector('.expand-queue-btn');
    const itemCount = queueDiv.querySelectorAll('.queue-item').length;
    const isCollapsible = itemCount > 4;
    const isExpanded = queueDiv.classList.contains('expanded');

    // Determine if the button should be visible
    const shouldShowButton = isCollapsible && !isExpanded;

    // Case 1: Button should exist, but it doesn't. Create it.
    if (shouldShowButton && !existingBtn) {
        queueDiv.classList.add('queue-collapsible');
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary expand-queue-btn';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 6.646a.5.5 0 0 1 .708 0L8 12.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/><path fill-rule="evenodd" d="M1.646 2.646a.5.5 0 0 1 .708 0L8 8.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg><span>Expand</span>`;
        btn.onclick = () => {
            queueDiv.classList.remove('queue-collapsible');
            queueDiv.classList.add('expanded');
            btn.remove(); // This will now correctly remove the one and only button
        };
        parent.appendChild(btn);
    } else if (!shouldShowButton && existingBtn) {
        existingBtn.remove();
    }

    // Case 3: Cleanup the class if the queue is no longer large enough to be collapsible
    if (!isCollapsible) {
        queueDiv.classList.remove('queue-collapsible');
        // If it was expanded, we can remove that state too, as it's no longer relevant
        if (isExpanded) {
            queueDiv.classList.remove('expanded');
        }
    }
}
