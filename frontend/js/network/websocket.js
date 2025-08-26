// js/network/websocket.js
// Manages the WebSocket signaling server connection.

import { WEBSOCKET_URL } from '../config.js';
import { store } from '../state.js';
import { showInvitationToast, showToast } from '../utils/toast.js';
import { initializePeerConnection, handleSignal, resetPeerConnectionState } from './webrtc.js';
// MODIFIED: Import new overlay functions
import { enterFlightMode, updateDashboardStatus, renderInFlightView, renderNetworkUsersView, disableDropZone, hideBoardingOverlay, failBoarding } from '../ui/view.js';

let ws;

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
        type: "register-details",
        name: store.getState().myName,
        localIpPrefix: "unknown",
        localIp: "unknown"
    });

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const flightCodeFromUrl = urlParams.get('code');

        if (flightCodeFromUrl && flightCodeFromUrl.length === 6) {
            console.log(`Found flight code in URL, attempting to auto-join: ${flightCodeFromUrl}`);
            store.actions.setIsFlightCreator(false);
            sendMessage({ type: "join-flight", flightCode: flightCodeFromUrl.toUpperCase() });
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } catch (e) {
        console.error("Error processing URL for auto-join:", e);
    }
}

async function onMessage(event) {
    const msg = JSON.parse(event.data);
    const state = store.getState();

    switch (msg.type) {
        case "registered":
            store.actions.setMyId(msg.id);
            break;
        case "users-on-network-update":
            store.actions.setLastNetworkUsers(msg.users);
            if (!state.peerInfo) {
                renderNetworkUsersView();
            }
            break;
        case "flight-invitation":
            showInvitationToast(msg.fromName, msg.flightCode);
            break;
        case "flight-created":
            enterFlightMode(msg.flightCode);
            break;
        case "peer-joined":
            showToast({
                type: 'success', // A new type, but will default gracefully
                title: 'Peer Connected!',
                body: `${msg.peer.name} has joined the flight.`,
                duration: 5000
            });

            document.getElementById('closeInviteModal')?.click();
            hideBoardingOverlay();
            if (!state.currentFlightCode) {
                enterFlightMode(msg.flightCode);
            }
            store.actions.setConnectionType(msg.connectionType || 'wan');
            store.actions.setPeerInfo(msg.peer);
            updateDashboardStatus(`Peer Connected! (${store.getState().connectionType.toUpperCase()} mode)`, 'connected');
            renderInFlightView();
            initializePeerConnection(state.isFlightCreator);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            break;
        case "signal":
            await handleSignal(msg.data);
            break;
        case "peer-left":
            handlePeerLeft();
            break;
        case "error":
            // MODIFIED: Handle boarding failure on error
            failBoarding();
            await handleServerError(msg.message);
            break;
    }
}

function onClose() {
    // MODIFIED: Handle boarding failure on connection close
    failBoarding();
    showToast({ type: 'danger', title: 'Connection Lost', body: 'Connection to the server was lost. Please refresh the page to reconnect.', duration: 0 });
    store.actions.resetState();
}

function onError(error) {
    console.error("WebSocket error:", error);
}

export function handlePeerLeft() {
    if (!store.getState().peerInfo) return;
    console.log("Peer has left the flight.");
    store.actions.clearPeerInfo();
    store.actions.setHasScrolledForSend(false);
    store.actions.setHasScrolledForReceive(false);
    resetPeerConnectionState();
    updateDashboardStatus('Peer disconnected. Waiting...', 'disconnected');
    disableDropZone();
    renderNetworkUsersView();
}

async function handleServerError(message) {
    console.error("Server error:", message);
    if (message.includes("Flight not found")) {
        const { flightCodeInputWrapper } = await import('../ui/dom.js');
        flightCodeInputWrapper.classList.add('input-error');
        setTimeout(() => flightCodeInputWrapper.classList.remove('input-error'), 1500);

        showToast({
            type: 'danger',
            title: 'Flight Not Found',
            body: "Please double-check the 6-character code and try again.",
            duration: 8000
        });
    } else {
        showToast({ type: 'danger', title: 'An Error Occurred', body: message, duration: 8000 });
    }
}