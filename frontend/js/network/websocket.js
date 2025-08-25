// js/network/websocket.js
// Manages the WebSocket signaling server connection.

import { WEBSOCKET_URL } from '../config.js';
import { store } from '../state.js';
import { showInvitationToast, showToast } from '../utils/toast.js';
import { initializePeerConnection, handleSignal, resetPeerConnectionState } from './webrtc.js';
import { enterFlightMode, updateDashboardStatus, renderInFlightView, renderNetworkUsersView, disableDropZone } from '../ui/view.js';

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

    // --- NEW: Auto-join from URL parameter ---
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const flightCodeFromUrl = urlParams.get('code');

        // Check if the code exists and has the correct length.
        if (flightCodeFromUrl && flightCodeFromUrl.length === 6) {
            console.log(`Found flight code in URL, attempting to auto-join: ${flightCodeFromUrl}`);

            // Set the user as a joiner, not a creator.
            store.actions.setIsFlightCreator(false);

            // Send the join message directly. The server will respond with `peer-joined` or an error.
            sendMessage({ type: "join-flight", flightCode: flightCodeFromUrl.toUpperCase() });

            // For a cleaner user experience, remove the code from the URL after using it.
            // This prevents the user from trying to re-join the same room on a page refresh.
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } catch (e) {
        console.error("Error processing URL for auto-join:", e);
    }
    // --- END NEW ---
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
            if (!state.currentFlightCode) {
                enterFlightMode(msg.flightCode);
            }
            store.actions.setConnectionType(msg.connectionType || 'wan');
            store.actions.setPeerInfo(msg.peer);
            updateDashboardStatus(`Peer Connected! (${store.getState().connectionType.toUpperCase()} mode)`, 'connected');
            renderInFlightView();
            initializePeerConnection(state.isFlightCreator);
            // Scroll to top on connection
            window.scrollTo({ top: 0, behavior: 'smooth' });
            break;
        case "signal":
            await handleSignal(msg.data);
            break;
        case "peer-left":
            handlePeerLeft();
            break;
        case "error":
            handleServerError(msg.message);
            break;
    }
}

function onClose() {
    showToast({ type: 'danger', title: 'Connection Lost', body: 'Connection to the server was lost. Please refresh the page to reconnect.', duration: 0 });
    store.actions.resetState();
}

function onError(error) {
    console.error("WebSocket error:", error);
}

export function handlePeerLeft() {
    // Add a guard to prevent this from running multiple times if triggered by different events
    if (!store.getState().peerInfo) return;

    console.log("Peer has left the flight.");
    store.actions.clearPeerInfo();
    // Reset scroll flags for the next connection
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