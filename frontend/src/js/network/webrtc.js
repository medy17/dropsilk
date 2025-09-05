// js/network/webrtc.js
// Handles the creation and management of the WebRTC peer connection.

import { ICE_SERVERS } from '../config.js';
import { store } from '../state.js';
import { sendMessage, handlePeerLeft } from './websocket.js';
import { enableDropZone, updateDashboardStatus, disableDropZone, renderNetworkUsersView, showScreenShareView, hideScreenShareView, updateShareButton } from '../ui/view.js';
import { handleDataChannelMessage, ensureQueueIsActive, drainQueue } from '../transfer/fileHandler.js';

let peerConnection;
let dataChannel;
let localScreenStream = null;
let screenTrackSender = null;

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

    peerConnection.ontrack = (event) => {
        console.log("Received remote track:", event.track.kind);
        // The first (and only) stream associated with the track is the one we want.
        showScreenShareView(event.streams[0]);
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
        // Also enable the screen share button now that the connection is open
        updateShareButton(false);

        // When the connection is ready, ensure the queue manager runs.
        ensureQueueIsActive();

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
    stopScreenShare(false); // Stop sharing without notifying peer (connection is already down)
    hideScreenShareView();
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

export async function startScreenShare() {
    if (localScreenStream) return;

    try {
        localScreenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: false // Stick to video-only for simplicity
        });

        const videoTrack = localScreenStream.getVideoTracks()[0];
        screenTrackSender = peerConnection.addTrack(videoTrack, localScreenStream);

        // The 'negotiationneeded' event will fire, and we can send a new offer.
        // To be more explicit and immediate, we can create an offer here.
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendMessage({ type: "signal", data: { sdp: peerConnection.localDescription } });

        updateShareButton(true); // Update UI to "Stop Sharing"

        // Listen for when the user clicks the browser's native "Stop sharing" button
        videoTrack.onended = () => {
            stopScreenShare(true);
        };

    } catch (err) {
        console.error("Error starting screen share:", err);
        localScreenStream = null;
    }
}

export function stopScreenShare(notifyPeer = true) {
    if (localScreenStream) {
        localScreenStream.getTracks().forEach(track => track.stop());
        if (screenTrackSender) {
            peerConnection.removeTrack(screenTrackSender);
            // Removing a track also requires renegotiation
        }
    }
    localScreenStream = null;
