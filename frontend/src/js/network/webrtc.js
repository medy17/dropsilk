// js/network/webrtc.js
// Handles the creation and management of the WebRTC peer connection.

import { ICE_SERVERS } from '../config.js';
import { store } from '../state.js';
import { sendMessage, handlePeerLeft } from './websocket.js';
import { enableDropZone, updateDashboardStatus, disableDropZone, renderNetworkUsersView, showRemoteStreamView, hideRemoteStreamView, showLocalStreamView, hideLocalStreamView, updateShareButton } from '../ui/view.js';
import { handleDataChannelMessage, ensureQueueIsActive, drainQueue } from '../transfer/fileHandler.js';

let peerConnection;
let dataChannel;
let localScreenStream = null;
let screenTrackSender = null;

/**
 * Checks if the current device is a mobile device based on user agent.
 * @returns {boolean} True if it's a mobile device, false otherwise.
 */
function isMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}


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
        showRemoteStreamView(event.streams[0]);
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

        // Disable screen sharing entirely on mobile devices
        const shareScreenBtn = document.getElementById('shareScreenBtn');
        if (isMobile() || !navigator.mediaDevices?.getDisplayMedia) {
            shareScreenBtn.disabled = true;
            shareScreenBtn.title = "Screen sharing is not supported on mobile devices.";
        } else {
            updateShareButton(false);
        }

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
    stopScreenShare(false);
    hideRemoteStreamView();
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

async function handleQualityChange(preset, track) {
    if (!track) return;
    console.log(`Changing stream quality to: ${preset}`);

    let constraints = {};
    switch (preset) {
        case 'smoothness': constraints = { frameRate: 30, height: 720 }; break;
        case 'performance': constraints = { frameRate: 15, height: 480 }; break;
        case 'clarity': default: constraints = { frameRate: 15, height: 1080 }; break;
    }

    try {
        await track.applyConstraints(constraints);
    } catch (err) {
        console.error("Error applying constraints:", err);
    }
}

export async function startScreenShare() {
    if (localScreenStream) return;

    try {
        localScreenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always", height: 1080, frameRate: 15 },
            audio: true
        });

        localScreenStream.getTracks().forEach(track => {
            screenTrackSenders.push(peerConnection.addTrack(track, localScreenStream));
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendMessage({ type: "signal", data: { sdp: peerConnection.localDescription } });

        const videoTrack = localScreenStream.getVideoTracks()[0];
        showLocalStreamView(localScreenStream, (preset) => handleQualityChange(preset, videoTrack));
        updateShareButton(true);

        if (videoTrack) {
            videoTrack.onended = () => stopScreenShare(true);
        }

    } catch (err) {
        console.error("Error starting screen share:", err);
        if (err.name === 'NotAllowedError') {
            alert("Screen share permission was denied. Please try again and grant permission.");
        } else {
            alert("Could not start screen share. Your browser may not support audio capture, or another error occurred.");
        }
        localScreenStream = null;
        screenTrackSenders = []; // Reset on error
    }
}

export function stopScreenShare(notifyPeer = true) {
    if (localScreenStream) {
        localScreenStream.getTracks().forEach(track => track.stop());
    }

    if (screenTrackSenders.length > 0) {
        screenTrackSenders.forEach(sender => {
            peerConnection.removeTrack(sender);
        });
    }

    if (notifyPeer) {
        sendData(JSON.stringify({ type: 'stream-ended' }));
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => sendMessage({ type: "signal", data: { sdp: peerConnection.localDescription } }));
    }

    hideLocalStreamView();
    localScreenStream = null;
    screenTrackSenders = [];
    updateShareButton(false);
}
