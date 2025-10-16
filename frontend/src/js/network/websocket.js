// js/network/websocket.js
// Manages the WebSocket signalling server connection.

import i18next from "../i18n.js";
import { WEBSOCKET_URL } from '../config.js';
import { store } from '../state.js';
import { showInvitationToast, showToast } from '../utils/toast.js';
import { initializePeerConnection, handleSignal, resetPeerConnectionState } from './webrtc.js';
import { enterFlightMode, updateDashboardStatus, renderInFlightView, renderNetworkUsersView, disableDropZone, hideBoardingOverlay, failBoarding, clearAllPulseEffects } from '../ui/view.js';
import { showInviteOnboarding } from '../ui/onboarding.js';
import { audioManager } from '../utils/audioManager.js';

let ws;

// Local, side-effect-free demo helper
const DEMO_FILES = {
    photo_1: {
        name: 'mountain-vista.jpg',
        type: 'image/jpeg',
        base64: 'R0lGODlhAQABAIABAP8AAP///yH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
    },
    doc_1: {
        name: 'project-notes.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        content: 'This is a demo DOCX file.',
    },
    audio_1: {
        name: 'background-music.mp3',
        type: 'audio/mpeg',
        content: 'This is a demo MP3 file.',
    },
    text_1: {
        name: 'readme.txt',
        type: 'text/plain',
        content: 'This is a demo text file.',
    },
};

async function getDemoFileBlob(fileId) {
    const fileInfo = DEMO_FILES[fileId];
    if (!fileInfo) return null;
    let blob;
    if (fileInfo.base64) {
        const res = await fetch(`data:${fileInfo.type};base64,${fileInfo.base64}`);
        blob = await res.blob();
    } else {
        blob = new Blob([fileInfo.content], { type: fileInfo.type });
    }
    return { name: fileInfo.name, type: fileInfo.type, blob };
}

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
        localIp: "unknown",
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
            audioManager.play('invite');
            showInvitationToast(msg.fromName, msg.flightCode);
            break;

        case "flight-created":
            enterFlightMode(msg.flightCode);
            setTimeout(showInviteOnboarding, 300);
            break;

        case "flight-created-for-demo":
            enterFlightMode(msg.flightCode);
            break;

        case "bot-file-incoming": {
            const { handleDataChannelMessage } = await import('../transfer/fileHandler.js');
            const demoFile = await getDemoFileBlob(msg.fileId);
            if (!demoFile) return;

            // Feed metadata, data, EOF into the receiver just like a real peer
            await handleDataChannelMessage(new MessageEvent('message', {
                data: JSON.stringify({
                    name: demoFile.name,
                    type: demoFile.type,
                    size: demoFile.blob.size,
                }),
            }));
            await handleDataChannelMessage(new MessageEvent('message', { data: await demoFile.blob.arrayBuffer() }));
            await handleDataChannelMessage(new MessageEvent('message', { data: "EOF" }));
            break;
        }

        case "peer-joined":
            audioManager.play('connect');
            showToast({
                type: 'success',
                title: i18next.t('peerConnected'),
                body: i18next.t('peerConnectedDescription', { peerName: msg.peer.name }),
                duration: 5000,
            });

            document.getElementById('closeInviteModal')?.click();
            hideBoardingOverlay();
            clearAllPulseEffects();
            localStorage.setItem('hasSeenInvitePulse', 'true');

            if (!state.currentFlightCode) {
                enterFlightMode(msg.flightCode);
            }
            store.actions.setConnectionType(msg.connectionType || 'wan');
            store.actions.setPeerInfo(msg.peer);
            updateDashboardStatus(
                `${i18next.t('peerConnected')} (${store.getState().connectionType.toUpperCase()} mode)`,
                'connected',
            );
            renderInFlightView();

            if (state.isFlightCreator) {
                initializePeerConnection(true);
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
            break;

        case "signal":
            await handleSignal(msg.data);
            break;

        case "peer-left":
            handlePeerLeft();
            break;

        case "error":
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
    console.error("WebSocket error:", error);
}

export function handlePeerLeft() {
    if (!store.getState().peerInfo) return;
    audioManager.play('disconnect');
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
        audioManager.play('error');
        if (navigator.vibrate) navigator.vibrate([75, 50, 75, 50, 75]);

        const { setOtpInputError } = await import('../ui/events.js');
        const { uiElements } = await import('../ui/dom.js');

        const inputs = uiElements.flightCodeInputWrapper.querySelectorAll('.otp-input');
        const currentCode = Array.from(inputs).map((input) => input.value).join('').toUpperCase();

        setOtpInputError(currentCode);

        showToast({
            type: 'danger',
            title: i18next.t('flightNotFound'),
            body: i18next.t('flightNotFoundDescription'),
            duration: 8000,
        });
    } else {
        showToast({ type: 'danger', title: i18next.t('anErrorOccurred'), body: message, duration: 8000 });
    }
}