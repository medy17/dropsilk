// js/ui/view.js
// Contains functions for rendering UI updates based on application state.

import { uiElements } from './dom.js';
import { store } from '../state.js';
import { getFileIcon, formatBytes } from '../utils/helpers.js';

// --- NEW OVERLAY FUNCTIONS ---
export function showBoardingOverlay(flightCode) {
    if (uiElements.boardingOverlay) {
        // Hide the main landing page content to prevent it from flashing
        uiElements.setupContainer.style.display = "none";
        document.getElementById('boarding-flight-code').textContent = flightCode.toUpperCase();
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
        // IMPORTANT: Show the main landing page again so the user can take manual action
        uiElements.setupContainer.style.display = "flex";
    }
}
// --- END NEW OVERLAY FUNCTIONS ---

// --- HELPER FUNCTIONS for the pulse effect ---
function addPulseEffect(element) {
    if (!element || element.querySelector('.pulse-ring')) return; // Prevent duplicates
    element.classList.add('pulse-effect');
    // Add the span elements for the rings
    element.insertAdjacentHTML('beforeend', `
        <span class="pulse-ring"></span>
        <span class="pulse-ring"></span>
        <span class="pulse-ring"></span>
    `);
}

/**
 * Finds all elements with the pulse effect and removes the animation classes and elements.
 */
export function clearAllPulseEffects() {
    document.querySelectorAll('.pulse-effect').forEach(element => {
        element.classList.remove('pulse-effect');
        element.querySelectorAll('.pulse-ring').forEach(ring => ring.remove());
    });
}


export function renderUserName() {
    uiElements.userNameDisplay.textContent = store.getState().myName;
}

export function enterFlightMode(flightCode) {
    store.actions.setCurrentFlightCode(flightCode);
    uiElements.setupContainer.style.display = "none";
    uiElements.dashboard.style.display = "flex";
    setDashboardFlightCode(flightCode);
    disableDropZone(); // Initially disabled
    renderNetworkUsersView(); // Re-render to enable invite buttons
}

export function exitFlightMode() {
    uiElements.setupContainer.style.display = "flex";
    uiElements.dashboard.style.display = "none";
    uiElements.flightCodeInput.value = "";
    uiElements.sendingQueueDiv.innerHTML = '<div class="empty-state">Select files to send</div>';
    uiElements.receiverQueueDiv.innerHTML = '<div class="empty-state">Waiting for incoming files</div>';
    store.actions.clearReceivedFiles();
    updateReceiverActions();
}

function setDashboardFlightCode(code) {
    const btn = uiElements.dashboardFlightCodeBtn;
    btn.setAttribute('data-code', code);
    btn.innerHTML = `<span class="code-text">${code}</span>`;
    if (!btn.querySelector('.copy-feedback')) {
        const feedback = document.createElement('span');
        feedback.className = 'copy-feedback';
        feedback.textContent = 'Copied!';
        btn.appendChild(feedback);
    }
}

export function updateDashboardStatus(text, type) {
    const statusEl = uiElements.dashboardFlightStatus;
    statusEl.textContent = text;
    const styles = {
        connected: { color: '#15803d', bgColor: '#f0fdf4', borderColor: '#bbf7d0' },
        disconnected: { color: '#d97706', bgColor: '#fffbe6', borderColor: '#fde68a' },
        default: { color: 'var(--c-secondary)', bgColor: 'var(--c-panel-bg)', borderColor: 'var(--c-primary)' }
    };
    const style = styles[type] || styles.default;
    statusEl.style.color = style.color;
    statusEl.style.backgroundColor = style.bgColor;
    statusEl.style.borderColor = style.borderColor;
}

export function renderNetworkUsersView() {
    const { lastNetworkUsers, currentFlightCode } = store.getState();
    uiElements.connectionPanelTitle.textContent = "Users on Your Network";
    const list = uiElements.connectionPanelList;
    list.innerHTML = ''; // Clear previous list

    // --- CORRECTED LOGIC ---
    // 1. Handle the main invite button pulse effect. This is now independent of the network user list.
    const hasSeenPulse = localStorage.getItem('hasSeenInvitePulse') === 'true';
    const shouldShowPulse = !hasSeenPulse && currentFlightCode;

    if (shouldShowPulse) {
        const mainInviteBtn = document.getElementById('inviteBtn');
        if (mainInviteBtn) {
            addPulseEffect(mainInviteBtn);
        }
    }

    // 2. Handle the network user list itself.
    if (lastNetworkUsers.length === 0) {
        list.innerHTML = '<div class="empty-state">No other users found on your network.</div>';
        return; // Nothing more to do for the list.
    }

    // 3. If there are users, build the list and apply the pulse effect to their individual buttons.
    lastNetworkUsers.forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'network-user-item';
        userEl.innerHTML = `
            <div class="network-user-details">
                <span class="network-user-name">${user.name}</span>
                <span class="network-user-id">ID: ${user.id}</span>
            </div>
            <button class="btn btn-primary invite-user-btn" data-invitee-id="${user.id}" ${!currentFlightCode ? 'disabled title="Create or join a flight to invite users"' : ''}>
                Invite
            </button>`;
        list.appendChild(userEl);

        // Apply pulse to the per-user invite buttons if the conditions are met.
        if (shouldShowPulse) {
            const inviteBtn = userEl.querySelector('.invite-user-btn');
            if (inviteBtn) {
                addPulseEffect(inviteBtn);
            }
        }
    });
}

export function renderInFlightView() {
    const { peerInfo, myId, myName } = store.getState();
    if (!peerInfo) return;
    uiElements.connectionPanelTitle.textContent = "In Flight With";
    uiElements.connectionPanelList.innerHTML = `
        <div class="inflight-user-item">
            <div class="inflight-user-details">
                <span class="inflight-user-name">${myName}</span>
                <span class="user-badge">You</span>
            </div>
            <span class="inflight-user-id">ID: ${myId}</span>
        </div>
        <div class="inflight-user-item">
            <div class="inflight-user-details">
                <span class="inflight-user-name">${peerInfo.name}</span>
            </div>
            <span class="inflight-user-id">ID: ${peerInfo.id}</span>
        </div>`;
}

export function disableDropZone() {
    uiElements.dropZone.classList.add('disabled');
    uiElements.dropZoneText.textContent = 'Waiting for a peer to connect...';
    uiElements.dropZoneSecondaryText.textContent = 'You can invite them using the button above.';
}

export function enableDropZone() {
    uiElements.dropZone.classList.remove('disabled');
    uiElements.dropZoneText.textContent = 'Drag & Drop files or folders';
    uiElements.dropZoneSecondaryText.textContent = 'or select manually';
}

export function showScreenShareView(stream) {
    const panel = document.getElementById('screen-share-panel');
    const video = document.getElementById('remote-video');
    if (panel && video) {
        video.srcObject = stream;
        panel.style.display = 'block';

        // When the remote user stops sharing, their track will end.
        stream.getVideoTracks()[0].onended = () => {
            hideScreenShareView();
        };

        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

export function hideScreenShareView() {
    const panel = document.getElementById('screen-share-panel');
    const video = document.getElementById('remote-video');
    if (panel && video) {
        video.srcObject = null;
        panel.style.display = 'none';
    }
}

export function updateShareButton(isSharing) {
    const btn = document.getElementById('shareScreenBtn');
    if (!btn) return;
    btn.style.display = 'inline-flex'; // Make it visible once a peer connects
    const span = btn.querySelector('span');
    if (isSharing) {
        btn.classList.add('is-sharing', 'btn-secondary');
        btn.classList.remove('btn-primary');
        if (span) span.textContent = 'Stop Sharing';
    } else {
        btn.classList.remove('is-sharing', 'btn-secondary');
        btn.classList.add('btn-primary');
        if (span) span.textContent = 'Share Screen';
    }
}

export function updateReceiverActions() {
    const { receivedFiles } = store.getState();
    uiElements.receiverActionsContainer.style.display = receivedFiles.length > 3 ? 'block' : 'none';
}

export function updateMetricsUI() {
    const state = store.getState();
    const now = Date.now();
    const elapsedSeconds = (now - state.lastMetricsUpdateTime) / 1000;
    if (elapsedSeconds === 0) return;

    const totalBytesInInterval = state.sentInInterval + state.receivedInInterval;
    const speed = totalBytesInInterval / elapsedSeconds;

    uiElements.metricsSentEl.textContent = formatBytes(state.totalBytesSent);
    uiElements.metricsReceivedEl.textContent = formatBytes(state.totalBytesReceived);
    uiElements.metricsSpeedEl.textContent = `${formatBytes(speed)}/s`;

    store.actions.resetIntervalMetrics(now);
}

export function checkQueueOverflow(queueId) {
    const queueDiv = document.getElementById(queueId);
    if (!queueDiv) return;

    // We count .queue-item specifically, to ignore the expand button if it exists
    const itemCount = queueDiv.querySelectorAll('.queue-item').length;
    const isCollapsible = itemCount > 4;

    if (isCollapsible && !queueDiv.classList.contains('expanded')) {
        queueDiv.classList.add('queue-collapsible');

        let expandBtn = queueDiv.querySelector('.expand-queue-btn');
        if (!expandBtn) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary expand-queue-btn';
            btn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 6.646a.5.5 0 0 1 .708 0L8 12.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/><path fill-rule="evenodd" d="M1.646 2.646a.5.5 0 0 1 .708 0L8 8.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>
                <span>Expand</span>
            `;

            btn.onclick = () => {
                queueDiv.classList.remove('queue-collapsible');
                queueDiv.classList.add('expanded'); // Mark as permanently expanded for this session
                btn.remove();
            };
            const panel = queueDiv.parentElement;
            panel.appendChild(btn);
        }
    }
}