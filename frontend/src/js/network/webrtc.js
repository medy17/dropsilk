// js/network/webrtc.js
// Handles the creation and management of the WebRTC peer connection.

import { HIGH_WATER_MARK } from '../config.js';
import { store } from '../state.js';
import { sendMessage, handlePeerLeft } from './websocket.js';
import {
    enableDropZone,
} from '../ui/view.js';
import { enableChat, disableChat } from '../features/chat/index.js';
import {
    showRemoteStreamView,
    hideRemoteStreamView,
    showLocalStreamView,
    hideLocalStreamView,
    updateShareButton,
} from '../ui/streaming.js';
import {
    handleDataChannelMessage,
    ensureQueueIsActive,
    drainQueue,
} from '../transfer/fileHandler.js';

// --- NEW ---
// Read the backend URL from the environment variable, same as in uploadHelper.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * --- NEW ---
 * Fetches STUN/TURN server configuration from our backend.
 * This allows connections behind restrictive firewalls (NAT traversal) by
 * using temporary credentials generated securely by the server.
 * @returns {Promise<RTCIceServer[]>} A promise resolving to an array of ICE servers.
 */
async function getIceServers() {
    // For LAN-only connections, we don't need any external servers.
    if (store.getState().connectionType === 'lan') {
        return [];
    }

    // The backend endpoint we created to securely fetch Cloudflare credentials.
    const turnEndpoint = `${API_BASE_URL}/api/turn-credentials`;

    try {
        const response = await fetch(turnEndpoint);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        // --- FIX: The backend now sends the full { iceServers: [...] } object ---
        const data = await response.json();
        return data.iceServers;
    } catch (error) {
        console.error('Could not get TURN server credentials, falling back to public STUN.', error);
        // Fallback to a public STUN server if the backend call fails for any reason.
        return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
}

let peerConnection;
let dataChannel;
let localScreenStream = null;
let screenTrackSender = null;
let systemAudioTrackSender = null;

/**
 * Checks if the current device is a mobile device based on user agent.
 * @returns {boolean} True if it's a mobile device, false otherwise.
 */
function isMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Detect browser/OS info for pragmatic fallback logic.
 */
function getBrowserInfo() {
    const ua = navigator.userAgent || '';
    const plat = navigator.userAgentData?.platform || navigator.platform || '';

    const isiOSUA = /iP(hone|ad|od)/i.test(ua);
    const isiPadOS =
        /Mac/i.test(plat) && navigator.maxTouchPoints > 1 && !/Chrome/i.test(ua);

    let os = 'unknown';
    if (isiOSUA || isiPadOS) os = 'ios';
    else if (/Windows/i.test(plat)) os = 'windows';
    else if (/Mac/i.test(plat)) os = 'macos';
    else if (/Linux|X11/i.test(plat)) os = 'linux';
    else if (/Android/i.test(ua)) os = 'android';

    const versionOf = (re) => {
        const m = ua.match(re);
        return m ? parseInt(m[1], 10) : 0;
    };

    let browser = 'unknown';
    let version = 0;
    if (/Edg\//.test(ua)) {
        browser = 'edge';
        version = versionOf(/Edg\/(\d+)/);
    } else if (/OPR\//.test(ua)) {
        browser = 'opera';
        version = versionOf(/OPR\/(\d+)/);
    } else if (/Chrome\//.test(ua)) {
        browser = 'chrome';
        version = versionOf(/Chrome\/(\d+)/);
    } else if (/Firefox\//.test(ua)) {
        browser = 'firefox';
        version = versionOf(/Firefox\/(\d+)/);
    } else if (/Safari\//.test(ua) && !/Chrome|Chromium/i.test(ua)) {
        browser = 'safari';
        version = versionOf(/Version\/(\d+)/);
    }
    return { browser, version, os };
}

/**
 * Decide whether to request display audio depending on the UA.
 */
function chooseDisplayAudioByUA(wantAudio = true) {
    const info = getBrowserInfo();
    const supports = navigator.mediaDevices?.getSupportedConstraints?.() || {};

    if (!wantAudio) {
        return {
            audio: false,
            hint: 'Screen will be shared without audio (option disabled).',
        };
    }

    if (isMobile() || info.os === 'ios' || info.os === 'android') {
        return {
            audio: false,
            hint: 'Screen audio is not supported on mobile devices.',
        };
    }

    switch (info.browser) {
    case 'chrome':
    case 'edge':
    case 'opera': {
        const audio = {
            echoCancellation: false,
            noiseSuppression: false,
        };
        if (supports.suppressLocalAudioPlayback) {
            audio.suppressLocalAudioPlayback = true;
        }
        let hint =
                'For best results, use "Share tab audio". Full system audio works on Windows.';
        if (info.os === 'macos') {
            hint =
                    'Tab audio works. Full system audio may not be available on macOS.';
        }
        return { audio, hint };
    }
    case 'firefox':
        return {
            audio: true,
            hint: 'Firefox supports *tab audio only*. Full window/screen may be silent.',
        };
    case 'safari':
    default:
        return {
            audio: false,
            hint: 'This browser does not reliably support audio in screen share.',
        };
    }
}

function getDisplayMediaOptions(withSystemAudio = true) {
    const { audio, hint } = chooseDisplayAudioByUA(withSystemAudio);
    const video = { cursor: 'always', height: 720, frameRate: 30 };
    return { constraints: { video, audio }, hint };
}

async function renegotiate() {
    if (!peerConnection) return;
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendMessage({
            type: 'signal',
            data: { sdp: peerConnection.localDescription },
        });
    } catch (err) {
        console.error('Renegotiation error:', err);
    }
}

export async function initializePeerConnection(isOfferer) {
    if (peerConnection) return;

    const iceServers = await getIceServers();
    peerConnection = new RTCPeerConnection({ iceServers });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendMessage({ type: 'signal', data: { candidate: event.candidate } });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('Peer connection state:', peerConnection.connectionState);
        if (
            ['disconnected', 'failed', 'closed'].includes(
                peerConnection.connectionState
            )
        ) {
            handlePeerLeft();
        }
    };

    peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        showRemoteStreamView(event.streams[0]);
    };

    if (isOfferer) {
        dataChannel = peerConnection.createDataChannel('fileTransfer');
        dataChannel.binaryType = 'arraybuffer';
        // Fire onbufferedamountlow well before we stall
        dataChannel.bufferedAmountLowThreshold =
            Math.floor(HIGH_WATER_MARK / 2);
        setupDataChannel();
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            sendMessage({
                type: 'signal',
                data: { sdp: peerConnection.localDescription },
            });
        } catch (err) {
            console.error('Error creating offer:', err);
        }
    } else {
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            dataChannel.binaryType = 'arraybuffer';
            dataChannel.bufferedAmountLowThreshold =
                Math.floor(HIGH_WATER_MARK / 2);
            setupDataChannel();
        };
    }
}

export async function handleSignal(data) {
    if (!peerConnection) {
        console.warn(
            'Received signal before peerConnection initialized. Initializing now.'
        );
        await initializePeerConnection(store.getState().isFlightCreator);
    }
    try {
        if (data.sdp) {
            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(data.sdp)
            );
            if (data.sdp.type === 'offer') {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                sendMessage({
                    type: 'signal',
                    data: { sdp: peerConnection.localDescription },
                });
            }
        } else if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (error) {
        console.error('Error handling signal:', error);
    }
}

function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log('Data channel opened!');
        enableDropZone();
        enableChat();

        const shareScreenBtn = document.getElementById('shareScreenBtn');
        if (isMobile() || !navigator.mediaDevices?.getDisplayMedia) {
            shareScreenBtn.disabled = true;
            shareScreenBtn.title = 'Screen sharing is not supported on mobile devices.';
        } else {
            updateShareButton(false);
            const { hint } = getDisplayMediaOptions(true);
            if (shareScreenBtn) shareScreenBtn.title = hint;
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
        console.log('Data channel closed.');
        handlePeerLeft();
        disableChat();
        const { metricsInterval } = store.getState();
        if (metricsInterval) clearInterval(metricsInterval);
    };

    dataChannel.onerror = (error) => console.error('Data channel error:', error);
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
        .catch((err) => console.error('Error resetting transfer state:', err));
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
    case 'quality':
        constraints = { frameRate: 60, height: 1080 };
        break;
    case 'performance':
        constraints = { frameRate: 15, height: 480 };
        break;
    case 'clarity':
        constraints = { frameRate: 15, height: 1080 };
        break;
    case 'smoothness':
    default:
        constraints = { frameRate: 30, height: 720 };
        break;
    }

    try {
        await track.applyConstraints(constraints);
    } catch (err) {
        console.error('Error applying constraints:', err);
    }
}

export async function startScreenShare({ withSystemAudio = true } = {}) {
    if (localScreenStream) return;

    try {
        const { constraints } = getDisplayMediaOptions(withSystemAudio);
        localScreenStream = await navigator.mediaDevices.getDisplayMedia(
            constraints
        );

        const videoTrack = localScreenStream.getVideoTracks()[0];
        screenTrackSender = peerConnection.addTrack(videoTrack, localScreenStream);

        const audioTrack = localScreenStream.getAudioTracks()[0];
        if (audioTrack) {
            try {
                audioTrack.contentHint = 'music'; // hint for better quality
            } catch { /* empty */ }
            systemAudioTrackSender = peerConnection.addTrack(
                audioTrack,
                localScreenStream
            );
        }

        await renegotiate();

        showLocalStreamView(localScreenStream, (preset) =>
            handleQualityChange(preset, videoTrack)
        );
        updateShareButton(true);

        videoTrack.onended = () => stopScreenShare(true);
    } catch (err) {
        console.error('Error starting screen share:', err);
        localScreenStream = null;
    }
}

export function stopScreenShare(notifyPeer = true) {
    if (localScreenStream) {
        localScreenStream.getTracks().forEach((track) => track.stop());
        if (screenTrackSender) {
            peerConnection.removeTrack(screenTrackSender);
        }
        if (systemAudioTrackSender) {
            peerConnection.removeTrack(systemAudioTrackSender);
            systemAudioTrackSender = null;
        }
        if (notifyPeer) {
            sendData(JSON.stringify({ type: 'stream-ended' }));
        }
    }
    hideLocalStreamView();
    localScreenStream = null;
    screenTrackSender = null;
    updateShareButton(false);
    renegotiate().catch((e) => console.error('Renegotiate on stop failed:', e));
}
