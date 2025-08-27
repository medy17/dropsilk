// js/network/webrtc.js
// Handles the creation and management of the WebRTC peer connection.

import { ICE_SERVERS, HIGH_WATER_MARK } from '../config.js';
import { store } from '../state.js';
import { sendMessage, handlePeerLeft } from './websocket.js';
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
            // Prefer direct/local paths; skip relayed candidates to avoid internet routing
            const cand = event.candidate;
            const candidateStr = cand.candidate || "";
            const isRelay = (cand.type && cand.type === 'relay') || candidateStr.includes(' typ relay');
            if (isRelay) {
                console.log('Skipping relay ICE candidate');
                return;
            }
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
            try {
                // Ignore relayed candidates to prefer LAN/direct paths
                const cand = data.candidate;
                const candidateStr = (cand && cand.candidate) || "";
                const isRelay = (cand && cand.type === 'relay') || candidateStr.includes(' typ relay');
                if (isRelay) {
                    console.log('Ignoring incoming relay ICE candidate');
                    return;
                }
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
                console.error("Error adding ICE candidate:", error);
            }
        }
    } catch (error) {
        console.error("Error handling signal:", error);
    }
}

function setupDataChannel() {
    // Tune backpressure: trigger onbufferedamountlow when buffer drops sufficiently
    try { dataChannel.bufferedAmountLowThreshold = Math.floor(HIGH_WATER_MARK / 2); } catch (e) { /* no-op */ }
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

export function resetPeerConnectionState() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    const { metricsInterval } = store.getState();
    if (metricsInterval) clearInterval(metricsInterval);
    dataChannel = null;
    import('../transfer/fileHandler.js')
        .then(({ resetTransferState }) => {
            if (resetTransferState) resetTransferState();
        })
        .catch(err => console.error("Error resetting transfer state:", err));
}

export function sendData(data) {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(data);
    }
}

export function getBufferedAmount() {
    return dataChannel ? dataChannel.bufferedAmount : 0;
}