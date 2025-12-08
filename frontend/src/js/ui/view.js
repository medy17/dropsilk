// js/ui/view.js
// Contains functions for rendering UI updates based on application state.

import i18next from '../i18n.js';
import { uiElements } from './dom.js';
import { store } from '../state.js';
import { formatBytes } from '../utils/helpers.js';

// Import chat functions for internal use
import {
    initializeChatPanel,
    resetChatView,
    disableChat,
} from '../features/chat/index.js';

export function showBoardingOverlay(flightCode) {
    if (uiElements.boardingOverlay) {
        uiElements.setupContainer.style.display = 'none';
        const codeEl = document.getElementById('boarding-flight-code');
        if (codeEl) {
            codeEl.textContent = flightCode.toUpperCase();
        } else {
            console.warn('Boarding flight code element not found');
        }
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

    // Safety check for elements
    const setup = uiElements.setupContainer || document.querySelector(".main-content");
    const dash = uiElements.dashboard || document.getElementById("dashboard");

    if (setup) setup.style.display = 'none';
    if (dash) dash.style.display = 'flex';

    setDashboardFlightCode(flightCode);
    disableDropZone();
    renderNetworkUsersView();
    resetChatView();
    // Disable chat until a peer connects
    disableChat();
    // Initialize chat visibility tracking when entering a flight
    setTimeout(() => {
        initializeChatPanel();
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
            <button class="btn btn-primary invite-user-btn" data-invitee-id="${user.id
            }" ${!currentFlightCode
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
            <div class="inflight-user-details"><span class="inflight-user-name">${peerInfo.name
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
