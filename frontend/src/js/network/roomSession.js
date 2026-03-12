import { store } from '../state.js';
import {
    createRoom,
    joinRoom,
    getRoomStatus,
    markParticipantReady as markParticipantReadyRequest,
} from './roomApi.js';
import { connect as connectWebSocket } from './websocket.js';
import {
    enterFlightMode,
    enableDropZone,
    hideBoardingOverlay,
    disableDropZone,
    renderInFlightView,
    renderNetworkUsersView,
    updateDashboardStatus,
} from '../ui/view.js';
import { showToast } from '../utils/toast.js';
import { audioManager } from '../utils/audioManager.js';

let pollInterval = null;

function getLobbyStatusText(summary) {
    if (summary.shouldConnect) {
        return 'Room ready. Connecting secure channel...';
    }
    if (!summary.peer) {
        return 'Room created. Waiting for peer...';
    }
    if (summary.self.ready) {
        return 'Files selected. Waiting for peer to connect...';
    }
    if (summary.peer.ready) {
        return 'Peer is ready. Opening connection...';
    }
    return 'Peer joined. Select files whenever you are ready.';
}

function applyRoomSummary(summary) {
    const state = store.getState();
    const previousRoomPeerId = state.roomPeer?.participantId || null;
    const dashboard = document.getElementById('dashboard');
    const shouldEnterFlightMode =
        state.currentFlightCode !== summary.roomCode ||
        !dashboard ||
        dashboard.style.display !== 'flex';

    if (shouldEnterFlightMode) {
        enterFlightMode(summary.roomCode);
    }

    store.actions.setCurrentFlightCode(summary.roomCode);
    store.actions.setRoomParticipantId(summary.self.participantId);
    store.actions.setRoomRole(summary.self.role);
    store.actions.setRoomStatus(summary.status);
    store.actions.setRoomPeer(summary.peer);
    store.actions.setIsFlightCreator(summary.self.role === 'host');
    hideBoardingOverlay();

    if (summary.peer) {
        enableDropZone();
        renderInFlightView();

        if (previousRoomPeerId !== summary.peer.participantId) {
            audioManager.play('connect');
            audioManager.vibrate(60);
            showToast({
                type: 'success',
                title: 'Peer Connected!',
                body: `${summary.peer.name} has joined the flight.`,
                duration: 5000,
            });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } else {
        disableDropZone();
        if (!store.getState().peerInfo) {
            renderNetworkUsersView();
        }
    }

    if (!store.getState().peerInfo) {
        updateDashboardStatus(getLobbyStatusText(summary), 'default');
    }

    if (
        summary.shouldConnect &&
        !store.getState().peerInfo &&
        !store.getState().signalingInitiated
    ) {
        store.actions.setSignalingInitiated(true);
        connectWebSocket({
            roomCode: summary.roomCode,
            participantId: summary.self.participantId,
        });
    }

    return summary;
}

function handleRoomError(error, fallbackTitle = 'Room Error') {
    showToast({
        type: 'danger',
        title: fallbackTitle,
        body: error instanceof Error ? error.message : String(error),
        duration: 8000,
    });
}

export async function createRoomFlow() {
    try {
        const summary = await createRoom(store.getState().myName);
        applyRoomSummary(summary);
        startRoomPolling();
        return summary;
    } catch (error) {
        handleRoomError(error, 'Could not create room');
        throw error;
    }
}

export async function joinRoomFlow(roomCode) {
    try {
        const summary = await joinRoom(roomCode, store.getState().myName);
        applyRoomSummary(summary);
        startRoomPolling();
        return summary;
    } catch (error) {
        handleRoomError(error, 'Could not join room');
        throw error;
    }
}

export async function syncCurrentRoomStatus() {
    const { currentFlightCode, roomParticipantId } = store.getState();
    if (!currentFlightCode || !roomParticipantId) {
        return null;
    }

    const summary = await getRoomStatus(currentFlightCode, roomParticipantId);
    return applyRoomSummary(summary);
}

export async function markCurrentParticipantReady(files) {
    const { currentFlightCode, roomParticipantId } = store.getState();
    if (!currentFlightCode || !roomParticipantId) {
        return null;
    }

    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) {
        return syncCurrentRoomStatus();
    }

    const payload = {
        fileCount: selectedFiles.length,
        totalBytes: selectedFiles.reduce(
            (total, file) => total + (Number(file?.size) || 0),
            0
        ),
    };

    const summary = await markParticipantReadyRequest(
        currentFlightCode,
        roomParticipantId,
        payload
    );
    return applyRoomSummary(summary);
}

export function startRoomPolling() {
    stopRoomPolling();
    syncCurrentRoomStatus().catch((error) => {
        console.error('Failed to sync room status:', error);
    });
    pollInterval = window.setInterval(() => {
        syncCurrentRoomStatus().catch((error) => {
            console.error('Failed to sync room status:', error);
        });
    }, 1000);
}

export function stopRoomPolling() {
    if (pollInterval) {
        window.clearInterval(pollInterval);
        pollInterval = null;
    }
}

export function handleSignalingClosed() {
    if (!store.getState().currentFlightCode || !store.getState().roomParticipantId) {
        return;
    }

    store.actions.setSignalingInitiated(false);
    if (!store.getState().peerInfo) {
        updateDashboardStatus('Secure channel closed. Waiting to reconnect...', 'disconnected');
    }
    startRoomPolling();
}
