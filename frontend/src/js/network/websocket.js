// js/network/websocket.js
// Manages the WebSocket signalling server connection.

import i18next from '../i18n.js';
import { WEBSOCKET_URL } from '../config.js';
import { store } from '../state.js';
import { showInvitationToast, showToast } from '../utils/toast.js';
import {
    initializePeerConnection,
    handleSignal,
    resetPeerConnectionState,
} from './webrtc.js';
import {
    enterFlightMode,
    updateDashboardStatus,
    renderInFlightView,
    renderNetworkUsersView,
    disableDropZone,
    hideBoardingOverlay,
    failBoarding,
    clearAllPulseEffects,
} from '../ui/view.js';
import { resetChatView, disableChat } from '../features/chat/index.js';
import { showInviteOnboarding } from '../ui/onboarding.js';
import { audioManager } from '../utils/audioManager.js';
import { uiElements } from '../ui/dom.js';
import {
    stopRoomPolling,
    startRoomPolling,
    handleSignalingClosed,
    handlePeerDisconnected,
} from './roomSession.js';

import { setOtpInputError } from '../ui/events.js';

let ws;
let pendingAttach = null;
let suppressCloseHandling = false;

export function connect(options = {}) {
    if (options?.roomCode && options?.participantId) {
        pendingAttach = options;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        if (pendingAttach?.roomCode && pendingAttach?.participantId) {
            sendMessage({
                type: 'attach-room',
                roomCode: pendingAttach.roomCode,
                participantId: pendingAttach.participantId,
            });
        }
        return;
    }

    if (ws && ws.readyState === WebSocket.CONNECTING) {
        return;
    }

    ws = new WebSocket(WEBSOCKET_URL);
    ws.onopen = onOpen;
    ws.onmessage = onMessage;
    ws.onclose = onClose;
    ws.onerror = onError;
}

export function sendMessage(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

export function isConnected() {
    return Boolean(ws && ws.readyState === WebSocket.OPEN);
}

export function disconnect({ silent = false } = {}) {
    suppressCloseHandling = silent;
    pendingAttach = null;

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
        return;
    }

    ws = null;
    suppressCloseHandling = false;
}

function onOpen() {
    sendMessage({
        type: 'register-details',
        name: store.getState().myName,
        localIpPrefix: 'unknown',
        localIp: 'unknown',
    });

    if (pendingAttach?.roomCode && pendingAttach?.participantId) {
        sendMessage({
            type: 'attach-room',
            roomCode: pendingAttach.roomCode,
            participantId: pendingAttach.participantId,
        });
    }
}

async function onMessage(event) {
    const msg = JSON.parse(event.data);
    const state = store.getState();

    switch (msg.type) {
    case 'registered':
        store.actions.setMyId(msg.id);
        break;
    case 'room-attached':
        store.actions.setCurrentFlightCode(msg.flightCode);
        store.actions.setRoomRole(msg.role || store.getState().roomRole);
        break;
    case 'users-on-network-update':
        store.actions.setLastNetworkUsers(msg.users);
        if (!state.peerInfo && !state.roomPeer) {
            renderNetworkUsersView();
        }
        break;
    case 'flight-invitation':
        audioManager.play('invite');
        showInvitationToast(msg.fromName, msg.flightCode);
        break;
    case 'flight-created':
        enterFlightMode(msg.flightCode);
        // Show the "invite" onboarding step with a small delay for the UI transition
        setTimeout(showInviteOnboarding, 300);
        break;
    case 'peer-joined':
        try {
            document.getElementById('closeInviteModal')?.click();
            hideBoardingOverlay();

            clearAllPulseEffects();

            localStorage.setItem('hasSeenInvitePulse', 'true');

            // Check for dashboard visibility and auto-join state
            const dashboard = uiElements.dashboard || document.getElementById('dashboard');
            const isDashboardHidden = !dashboard || dashboard.style.display !== 'flex';

            if (!state.currentFlightCode || isDashboardHidden) {
                console.log('Force entering flight mode. Reason:', {
                    missingCode: !state.currentFlightCode,
                    hidden: isDashboardHidden,
                    pendingAttach: Boolean(pendingAttach)
                });
                enterFlightMode(msg.flightCode);
            }
            store.actions.setConnectionType(msg.connectionType || 'wan');
            store.actions.setPeerInfo(msg.peer);
            store.actions.setSignalingInitiated(true);
            updateDashboardStatus(
                `${i18next.t('peerConnected')} (${store
                    .getState()
                    .connectionType.toUpperCase()} mode)`,
                'connected',
            );
            renderInFlightView();

            stopRoomPolling();

            if (state.isFlightCreator) {
                await initializePeerConnection(true);
            }
        } catch (e) {
            console.error('Error in peer-joined handler:', e);
            // Emergency fallback
            try {
                enterFlightMode(msg.flightCode);
            } catch (err2) {
                console.error('Critical failure entering flight mode:', err2);
                alert('Failed to load flight dashboard. Please refresh.');
            }
        }
        break;
    case 'signal':
        await handleSignal(msg.data);
        break;
    case 'peer-left':
        handlePeerLeft();
        break;
    case 'error':
        failBoarding();
        await handleServerError(msg.message);
        break;
    }
}

function onClose() {
    const wasSuppressed = suppressCloseHandling;
    suppressCloseHandling = false;
    pendingAttach = null;
    ws = null;

    if (wasSuppressed) {
        return;
    }

    handleSignalingClosed();

    if (!store.getState().currentFlightCode) {
        failBoarding();
        showToast({
            type: 'danger',
            title: 'Connection Lost',
            body: 'Connection to the server was lost. Please refresh the page to reconnect.',
            duration: 0,
        });
        store.actions.resetState();
        return;
    }

    showToast({
        type: 'info',
        title: 'Secure channel closed',
        body: 'Waiting for the room to become ready again...',
        duration: 5000,
    });
}

function onError(error) {
    console.error('WebSocket error:', error);
}

export function handlePeerLeft() {
    const currentState = store.getState();
    if (!currentState.peerInfo && !currentState.roomPeer) return;

    console.log('Peer has left the flight.');
    const previousRoomPeerId =
        currentState.roomPeer?.participantId ||
        currentState.peerInfo?.participantId ||
        currentState.peerInfo?.id ||
        null;
    store.actions.clearPeerInfo();
    store.actions.setRoomPeer(null);
    store.actions.setRoomStatus('waiting');
    store.actions.setSignalingInitiated(false);
    store.actions.setHasScrolledForSend(false);
    store.actions.setHasScrolledForReceive(false);
    store.actions.setHasScrolledForChatReceive(false);
    resetPeerConnectionState();
    resetChatView();
    disableChat();
    updateDashboardStatus('Peer disconnected. Waiting...', 'disconnected');
    disableDropZone();
    renderNetworkUsersView();
    handlePeerDisconnected(previousRoomPeerId);
    startRoomPolling();
}

async function handleServerError(message) {
    console.error('Server error:', message);
    if (message.includes('Flight not found')) {
        audioManager.play('error');
        if (navigator.vibrate) navigator.vibrate([75, 50, 75, 50, 75]);

        const inputs =
            uiElements.flightCodeInputWrapper.querySelectorAll('.otp-input');
        const currentCode = Array.from(inputs)
            .map((input) => input.value)
            .join('')
            .toUpperCase();

        setOtpInputError(currentCode);

        showToast({
            type: 'danger',
            title: i18next.t('flightNotFound'),
            body: i18next.t('flightNotFoundDescription'),
            duration: 8000,
        });
    } else {
        showToast({
            type: 'danger',
            title: i18next.t('anErrorOccurred'),
            body: message,
            duration: 8000,
        });
    }
}
