// js/network/websocket.js
// Manages the WebSocket signalling server connection.
// Includes reconnect engine, visibility lifecycle handlers, and session token management.

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

// --- Connection state ---
let ws;
let isAutoJoining = false;

// --- Reconnect engine state ---
let reconnectAttempts = 0;
let reconnectTimer = null;
let reconnectToastHandle = null;
const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_RECONNECT_DELAY = 1000; // 1s
const MAX_RECONNECT_DELAY = 30000; // 30s

// --- Lifecycle state ---
let wasHiddenDuringFlight = false;
let lifecycleHandlersAttached = false;

// ─────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────

export function connect() {
    cleanupSocket();
    ws = new WebSocket(WEBSOCKET_URL);
    ws.onopen = onOpen;
    ws.onmessage = onMessage;
    ws.onclose = onClose;
    ws.onerror = onError;
    attachLifecycleHandlers();
}

export function sendMessage(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

// ─────────────────────────────────────────────
//  LIFECYCLE HANDLERS (Mobile background/foreground)
// ─────────────────────────────────────────────

function attachLifecycleHandlers() {
    if (lifecycleHandlersAttached) return;
    lifecycleHandlersAttached = true;

    // visibilitychange: fires when user switches tabs, opens file picker, etc.
    document.addEventListener('visibilitychange', onVisibilityChange);

    // pageshow: fires when returning from bfcache (back-forward cache), common on iOS
    window.addEventListener('pageshow', onPageShow);

    // beforeunload: user is intentionally navigating away or refreshing
    window.addEventListener('beforeunload', onBeforeUnload);
}

function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
        // Tab went to background. Mark this so we know to attempt reconnect on return.
        const { currentFlightCode } = store.getState();
        if (currentFlightCode) {
            wasHiddenDuringFlight = true;
        }
    } else if (document.visibilityState === 'visible') {
        // Tab came back to foreground
        console.log('[WS] Tab became visible. WS readyState:', ws?.readyState);
        if (wasHiddenDuringFlight && (!ws || ws.readyState !== WebSocket.OPEN)) {
            console.log('[WS] Connection lost while in background. Attempting reconnect...');
            attemptReconnect();
        }
        wasHiddenDuringFlight = false;
    }
}

function onPageShow(event) {
    // event.persisted is true when the page is restored from bfcache
    if (event.persisted || (ws && ws.readyState !== WebSocket.OPEN)) {
        const { currentFlightCode } = store.getState();
        if (currentFlightCode) {
            console.log('[WS] Page restored (bfcache or stale). Reconnecting...');
            attemptReconnect();
        }
    }
}

function onBeforeUnload() {
    // Mark as intentional so onClose doesn't try to reconnect
    store.actions.setIntentionalLeave(true);
}

// ─────────────────────────────────────────────
//  RECONNECT ENGINE
// ─────────────────────────────────────────────

function attemptReconnect() {
    if (reconnectTimer) return; // Already scheduled
    if (store.getState().intentionalLeave) return; // User chose to leave

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('[WS] Max reconnect attempts reached. Giving up.');
        handlePermanentDisconnect();
        return;
    }

    const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY,
    );
    reconnectAttempts++;

    console.log(`[WS] Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

    // Show a non-destructive toast (only on first attempt)
    if (reconnectAttempts === 1) {
        reconnectToastHandle = showToast({
            type: 'info',
            title: i18next.t('reconnecting', 'Reconnecting...'),
            body: i18next.t('reconnectingDescription', 'Connection interrupted. Reconnecting to your flight...'),
            duration: 0,
        });
    }

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        doReconnect();
    }, delay);
}

function doReconnect() {
    cleanupSocket();
    ws = new WebSocket(WEBSOCKET_URL);
    ws.onopen = onReconnectOpen;
    ws.onmessage = onMessage;
    ws.onclose = onReconnectClose;
    ws.onerror = onError;
}

function onReconnectOpen() {
    console.log('[WS] Reconnected to server.');

    // Re-register with the server
    sendMessage({
        type: 'register-details',
        name: store.getState().myName,
        localIpPrefix: 'unknown',
        localIp: 'unknown',
    });

    // The server will respond with 'registered' which gives us a new ID.
    // We then attempt to rejoin our flight via the session token.
    // The rejoin attempt happens in onMessage when we receive 'registered'.
}

function onReconnectClose() {
    console.warn('[WS] Reconnect socket closed.');
    attemptReconnect();
}

function resetReconnectState() {
    reconnectAttempts = 0;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (reconnectToastHandle) {
        reconnectToastHandle.remove();
        reconnectToastHandle = null;
    }
    wasHiddenDuringFlight = false;
}

function cleanupSocket() {
    if (ws) {
        // Remove handlers to prevent stale callbacks
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
        }
        ws = null;
    }
}

/**
 * Called when reconnection has completely failed or grace period expired.
 * NOW we nuke state and show the fatal error.
 */
function handlePermanentDisconnect() {
    resetReconnectState();
    failBoarding();
    showToast({
        type: 'danger',
        title: i18next.t('connectionLost', 'Connection Lost'),
        body: i18next.t('connectionLostDescription', 'Could not reconnect to the server. Please refresh the page.'),
        duration: 0,
    });
    store.actions.resetState();
}

// ─────────────────────────────────────────────
//  WEBSOCKET EVENT HANDLERS
// ─────────────────────────────────────────────

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
        // Store the session token for reconnection
        if (msg.sessionToken) {
            store.actions.setSessionToken(msg.sessionToken);
        }

        // If we're reconnecting and have a prior flight + session, attempt rejoin
        if (reconnectAttempts > 0 && state.currentFlightCode && state.sessionToken) {
            console.log('[WS] Attempting rejoin-flight:', state.currentFlightCode);
            sendMessage({
                type: 'rejoin-flight',
                sessionToken: state.sessionToken,
                flightCode: state.currentFlightCode,
            });
        }
        break;

    case 'rejoin-success':
        console.log('[WS] Rejoin successful:', msg.flightCode);
        resetReconnectState();

        // Update session token if the server echoed a new one
        if (msg.sessionToken) {
            store.actions.setSessionToken(msg.sessionToken);
        }
        store.actions.setCurrentFlightCode(msg.flightCode);
        store.actions.setConnectionType(msg.connectionType || 'wan');

        if (msg.peer) {
            store.actions.setPeerInfo(msg.peer);
            updateDashboardStatus(
                `${i18next.t('peerConnected')} (${(msg.connectionType || 'wan').toUpperCase()} mode)`,
                'connected',
            );
            renderInFlightView();

            // Re-establish WebRTC with the peer (preserve file queue)
            resetPeerConnectionState(true);
            if (state.isFlightCreator) {
                await initializePeerConnection(true);
            }
        } else {
            updateDashboardStatus(
                i18next.t('reconnectedWaiting', 'Reconnected. Waiting for peer...'),
                'disconnected',
            );
        }

        showToast({
            type: 'success',
            title: i18next.t('reconnected', 'Reconnected'),
            body: i18next.t('reconnectedDescription', 'Successfully rejoined your flight.'),
            duration: 3000,
        });
        break;

    case 'rejoin-failed':
        console.warn('[WS] Rejoin failed:', msg.reason, msg.message);
        resetReconnectState();
        // The flight is gone or grace period expired — do a full reset
        handlePermanentDisconnect();
        break;

    case 'peer-temporarily-disconnected':
        // Our peer's connection dropped but they may reconnect within the grace period.
        // Do NOT tear down the flight. Show a waiting state.
        console.log('[WS] Peer temporarily disconnected. Grace period:', msg.gracePeriodMs, 'ms');
        resetPeerConnectionState(true);
        disableChat();
        disableDropZone();
        updateDashboardStatus(
            i18next.t('peerReconnecting', 'Peer reconnecting...'),
            'disconnected',
        );
        break;

    case 'peer-reconnected':
        // Our peer has come back within the grace period.
        console.log('[WS] Peer reconnected:', msg.peer?.name);
        store.actions.setPeerInfo(msg.peer);
        store.actions.setConnectionType(msg.connectionType || 'wan');
        updateDashboardStatus(
            `${i18next.t('peerConnected')} (${(msg.connectionType || 'wan').toUpperCase()} mode)`,
            'connected',
        );
        renderInFlightView();

        // Re-establish WebRTC (preserve file queue)
        resetPeerConnectionState(true);
        if (state.isFlightCreator) {
            await initializePeerConnection(true);
        }

        showToast({
            type: 'success',
            title: i18next.t('peerReconnected', 'Peer Reconnected'),
            body: i18next.t('peerReconnectedDescription', 'Your peer has reconnected.'),
            duration: 3000,
        });
        break;

    case 'server-shutdown':
        // Server is going down intentionally — don't attempt reconnect
        store.actions.setIntentionalLeave(true);
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
    const { intentionalLeave, currentFlightCode } = store.getState();

    // If we were in a flight and this wasn't intentional, attempt to reconnect
    if (currentFlightCode && !intentionalLeave) {
        console.log('[WS] Connection lost during active flight. Starting reconnect...');
        // Soft-reset: clear peer/metrics but preserve flight code, session token, and file queue
        store.actions.softReset();
        resetPeerConnectionState(true);
        disableChat();
        disableDropZone();
        updateDashboardStatus(
            i18next.t('reconnecting', 'Reconnecting...'),
            'disconnected',
        );
        attemptReconnect();
        return;
    }

    // If not in a flight, or user intentionally left — full reset
    if (intentionalLeave) {
        store.actions.setIntentionalLeave(false); // Reset the flag
        return; // Let the page reload/navigation happen naturally
    }

    // Not in a flight, lost connection — show error and reset
    failBoarding();
    showToast({
        type: 'danger',
        title: i18next.t('connectionLost', 'Connection Lost'),
        body: i18next.t('connectionLostDescription', 'Connection to the server was lost. Please refresh the page to reconnect.'),
        duration: 0,
    });
    store.actions.resetState();
}

function onError(error) {
    console.error('WebSocket error:', error);
}

// ─────────────────────────────────────────────
//  PEER LEFT / SERVER ERROR HANDLERS
// ─────────────────────────────────────────────

export function handlePeerLeft() {
    // During an active reconnect, the peer connection closing is expected.
    // Don't cascade into a destructive reset — the reconnect engine owns UI state.
    if (reconnectAttempts > 0 || reconnectTimer) {
        console.log('[WS] Ignoring peer-left during reconnect cycle.');
        return;
    }
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
