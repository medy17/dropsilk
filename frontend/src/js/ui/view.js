// js/ui/view.js
// Contains functions for rendering UI updates based on application state.

import { uiElements } from './dom.js';
import { store } from '../state.js';
import { getFileIcon, formatBytes } from '../utils/helpers.js';

export function showBoardingOverlay(flightCode) {
    if (uiElements.boardingOverlay) {
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
        uiElements.setupContainer.style.display = "flex";
    }
}

function addPulseEffect(element) {
    if (!element || element.querySelector('.pulse-ring')) return;
    element.classList.add('pulse-effect');
    element.insertAdjacentHTML('beforeend', `<span class="pulse-ring"></span><span class="pulse-ring"></span><span class="pulse-ring"></span>`);
}

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
    disableDropZone();
    renderNetworkUsersView();
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

    const hasSeenPulse = localStorage.getItem('hasSeenInvitePulse') === 'true';
    const shouldShowPulse = !hasSeenPulse && currentFlightCode;

    if (shouldShowPulse) {
        const mainInviteBtn = document.getElementById('inviteBtn');
        if (mainInviteBtn) addPulseEffect(mainInviteBtn);
    }

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

        if (shouldShowPulse) {
            const inviteBtn = userEl.querySelector('.invite-user-btn');
            if (inviteBtn) addPulseEffect(inviteBtn);
        }
    });
}

export function renderInFlightView() {
    const { peerInfo, myId, myName } = store.getState();
    if (!peerInfo) return;
    uiElements.connectionPanelTitle.textContent = "In Flight With";
    uiElements.connectionPanelList.innerHTML = `
        <div class="inflight-user-item">
            <div class="inflight-user-details"><span class="inflight-user-name">${myName}</span><span class="user-badge">You</span></div>
            <span class="inflight-user-id">ID: ${myId}</span>
        </div>
        <div class="inflight-user-item">
            <div class="inflight-user-details"><span class="inflight-user-name">${peerInfo.name}</span></div>
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
            settingsMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            settingsMenu.style.display = 'none';
        }
    };

    settingsBtn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = settingsMenu.style.display === 'block';
        settingsMenu.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            document.addEventListener('click', () => { settingsMenu.style.display = 'none'; }, { once: true });
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
            console.error("Fullscreen or orientation lock failed:", err);
        }
    };

    fullscreenBtn.onclick = toggleFullscreen;
    video.ondblclick = toggleFullscreen;

    const handleFullscreenChange = () => {
        panel.classList.toggle('is-fullscreen', !!document.fullscreenElement);
        if (!document.fullscreenElement && screen.orientation && typeof screen.orientation.unlock === 'function') {
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
    const textSpan = btn.querySelector('span:last-of-type');
    if (isSharing) {
        btn.classList.add('is-sharing');
        if (textSpan) textSpan.textContent = btn.dataset.textStop;
    } else {
        btn.classList.remove('is-sharing');
        if (textSpan) textSpan.textContent = btn.dataset.textStart;
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
    }
    else if (!shouldShowButton && existingBtn) {
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