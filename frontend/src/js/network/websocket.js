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
    resetChatView,
    disableChat,
} from '../ui/view.js';
import { showInviteOnboarding } from '../ui/onboarding.js';
import { audioManager } from '../utils/audioManager.js';
import { uiElements } from '../ui/dom.js';

let ws;
let isAutoJoining = false;

export function connect() {
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

function onOpen() {
    sendMessage({
        type: 'register-details',
        name: store.getState().myName,
        localIpPrefix: 'unknown',
        localIp: 'unknown',
    });

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const flightCodeFromUrl = urlParams.get('code');

        if (flightCodeFromUrl && flightCodeFromUrl.length === 6) {
            console.log(
                `Found flight code in URL, attempting to auto-join via ticket flow: ${flightCodeFromUrl}`,
            );
            isAutoJoining = true;

            // Pass code into the ticket input flow
            const ghostInput = document.getElementById('otp-ghost-input');
            const joinBtn = document.getElementById('joinFlightBtn');

            if (ghostInput && joinBtn) {
                ghostInput.value = flightCodeFromUrl.toUpperCase();
                // Trigger visual update if the global helper exists (optional but good)
                if (typeof window.updateOtpInputStates === 'function') {
                    window.updateOtpInputStates();
                }
                joinBtn.click();
            } else {
                console.warn('Auto-join failed: Input or Button not found in DOM.');
                // Fallback to direct message if UI elements are missing (shouldn't happen)
                store.actions.setIsFlightCreator(false);
                sendMessage({
                    type: 'join-flight',
                    flightCode: flightCodeFromUrl.toUpperCase(),
                });
            }

            window.history.replaceState(
                {},
                document.title,
                window.location.pathname,
            );
        }
    } catch (e) {
        console.error('Error processing URL for auto-join:', e);
    }
}

async function onMessage(event) {
    const msg = JSON.parse(event.data);
    const state = store.getState();

    switch (msg.type) {
        case 'registered':
            store.actions.setMyId(msg.id);
            break;
        case 'users-on-network-update':
            store.actions.setLastNetworkUsers(msg.users);
            if (!state.peerInfo) {
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
                audioManager.play('connect');
                showToast({
                    type: 'success',
                    title: i18next.t('peerConnected'),
                    body: i18next.t('peerConnectedDescription', {
                        peerName: msg.peer.name,
                    }),
                    duration: 5000,
                });

                document.getElementById('closeInviteModal')?.click();
                hideBoardingOverlay();

                clearAllPulseEffects();

                localStorage.setItem('hasSeenInvitePulse', 'true');

                // Check for dashboard visibility and auto-join state
                const dashboard = uiElements.dashboard || document.getElementById('dashboard');
                const isDashboardHidden = !dashboard || dashboard.style.display !== 'flex';

                if (!state.currentFlightCode || isDashboardHidden || isAutoJoining) {
                    console.log('Force entering flight mode. Reason:', {
                        missingCode: !state.currentFlightCode,
                        hidden: isDashboardHidden,
                        autoJoin: isAutoJoining
                    });
                    enterFlightMode(msg.flightCode);
                    isAutoJoining = false;
                }
                store.actions.setConnectionType(msg.connectionType || 'wan');
                store.actions.setPeerInfo(msg.peer);
                updateDashboardStatus(
                    `${i18next.t('peerConnected')} (${store
                        .getState()
                        .connectionType.toUpperCase()} mode)`,
                    'connected',
                );
                renderInFlightView();

                if (state.isFlightCreator) {
                    await initializePeerConnection(true);
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
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
    failBoarding();
    showToast({
        type: 'danger',
        title: 'Connection Lost',
        body: 'Connection to the server was lost. Please refresh the page to reconnect.',
        duration: 0,
    });
    store.actions.resetState();
}

function onError(error) {
    console.error('WebSocket error:', error);
}

export function handlePeerLeft() {
    if (!store.getState().peerInfo) return;
    audioManager.play('disconnect');
    console.log('Peer has left the flight.');
    store.actions.clearPeerInfo();
    store.actions.setHasScrolledForSend(false);
    store.actions.setHasScrolledForReceive(false);
    store.actions.setHasScrolledForChatReceive(false);
    resetPeerConnectionState();
    resetChatView();
    disableChat();
    updateDashboardStatus('Peer disconnected. Waiting...', 'disconnected');
    disableDropZone();
    renderNetworkUsersView();
}

async function handleServerError(message) {
    console.error('Server error:', message);
    if (message.includes('Flight not found')) {
        audioManager.play('error');
        if (navigator.vibrate) navigator.vibrate([75, 50, 75, 50, 75]);

        const { setOtpInputError } = await import('../ui/events.js');
        const { uiElements } = await import('../ui/dom.js');

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
