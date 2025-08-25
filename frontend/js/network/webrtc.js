// js/network/webrtc.js
// Handles the creation and management of the WebRTC peer connection.

import { ICE_SERVERS } from '../config.js';
import { store } from '../state.js';
import { sendMessage } from './websocket.js';
import { enableDropZone, updateDashboardStatus, disableDropZone, renderNetworkUsersView } from '../ui/view.js';
import { handleDataChannelMessage, processFileToSendQueue, drainQueue } from '../transfer/fileHandler.js';

let peerConnection;
let dataChannel;

export function initializePeerConnection(isOfferer) {
    if (peerConnection) return;

    const { connectionType } = store.getState();
    const pcConfig = connectionType === 'lan' ? { iceServers: [] } : { iceServers: ICE_SERVERS };

    peerConnection = new RTCPeerConnection(pcConfig);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendMessage({ type: "signal", data: { candidate: event.candidate } });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log("Peer connection state:", peerConnection.connectionState);
        if (["disconnected", "failed", "closed"].includes(peerConnection.connectionState)) {
            handlePeerLeft();
        }
    };

    if (isOfferer) {
        dataChannel = peerConnection.createDataChannel("fileTransfer");
        setupDataChannel();
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => sendMessage({ type: "signal", data: { sdp: peerConnection.localDescription } }));
    } else {
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel();
        };
    }
}

export async function handleSignal(data) {
    if (!peerConnection) {
        console.warn("Received signal before peerConnection initialized. Initializing now.");
        initializePeerConnection(store.getState().isFlightCreator);
    }
    try {
        if (data.sdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === "offer") {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                sendMessage({ type: "signal", data: { sdp: peerConnection.localDescription } });
            }
        } else if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (error) {
        console.error("Error handling signal:", error);
    }
}

function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log("Data channel opened!");
        enableDropZone();
        processFileToSendQueue();

        const { metricsInterval } = store.getState();
        if (metricsInterval) clearInterval(metricsInterval);
        const newInterval = setInterval(async () => {
            const { updateMetricsUI } = await import('../ui/view.js');
            updateMetricsUI();
        }, 1000);
        store.actions.setMetricsInterval(newInterval);
    };

    dataChannel.onclose = () => {
        console.log("Data channel closed.");
        handlePeerLeft();
        const { metricsInterval } = store.getState();
        if (metricsInterval) clearInterval(metricsInterval);
    };

    dataChannel.onerror = (error) => console.error("Data channel error:", error);

    dataChannel.onbufferedamountlow = () => drainQueue();

    dataChannel.onmessage = (event) => handleDataChannelMessage(event);
}

function handlePeerLeft() {
    if (!store.getState().peerInfo) return;
    console.log("Peer has left the flight.");
    store.actions.clearPeerInfo();
    resetPeerConnectionState();
    updateDashboardStatus('Peer disconnected. Waiting...', 'disconnected');
    disableDropZone();
    renderNetworkUsersView();
}

export function resetPeerConnectionState() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    const { metricsInterval } = store.getState();
    if (metricsInterval) clearInterval(metricsInterval);
    dataChannel = null;
    const { resetTransferState } = import('../transfer/fileHandler.js');
    resetTransferState();
}

export function sendData(data) {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(data);
    }
}

export function getBufferedAmount() {
    return dataChannel ? dataChannel.bufferedAmount : 0;
}