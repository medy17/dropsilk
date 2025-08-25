// js/ui/view.js
// Contains functions for rendering UI updates based on application state.

import { uiElements } from './dom.js';
import { store } from '../state.js';
import { getFileIcon, formatBytes } from '../utils/helpers.js';

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
    list.innerHTML = '';
    if (lastNetworkUsers.length === 0) {
        list.innerHTML = '<div class="empty-state">No other users found on your network.</div>';
        return;
    }
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