import { API_BASE_URL, WEBSOCKET_URL } from '../config.js';
import { store } from '../state.js';
import { setParticipantScreenShare as setParticipantScreenShareRequest } from './roomApi.js';
import {
    showRemoteStreamView,
    hideRemoteStreamView,
    showLocalStreamView,
    hideLocalStreamView,
    updateShareButton,
} from '../ui/streaming.js';
import { showToast } from '../utils/toast.js';
import { sendData } from './webrtc.js';

let screenShareWs = null;
let pendingAttach = null;
let suppressCloseHandling = false;
let peerConnection = null;
let localScreenStream = null;
let screenTrackSender = null;
let systemAudioTrackSender = null;
let awaitingLocalShare = false;

async function getIceServers() {
    if (store.getState().connectionType === 'lan') {
        return [];
    }

    const turnEndpoint = `${API_BASE_URL}/api/turn-credentials`;

    try {
        const response = await fetch(turnEndpoint);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const data = await response.json();
        return data.iceServers;
    } catch (error) {
        console.error('Could not get TURN server credentials for screen sharing.', error);
        return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
}

function isMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

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
            hint: 'Firefox supports tab audio only. Full window or screen may be silent.',
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

function getShareButton() {
    return document.getElementById('shareScreenBtn');
}

function closePeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    screenTrackSender = null;
    systemAudioTrackSender = null;
}

function disconnectScreenShareSocket({ silent = false } = {}) {
    suppressCloseHandling = silent;
    pendingAttach = null;

    if (
        screenShareWs &&
        (screenShareWs.readyState === WebSocket.OPEN ||
            screenShareWs.readyState === WebSocket.CONNECTING)
    ) {
        screenShareWs.close();
        return;
    }

    screenShareWs = null;
    suppressCloseHandling = false;
}

function sendScreenShareMessage(payload) {
    if (screenShareWs && screenShareWs.readyState === WebSocket.OPEN) {
        screenShareWs.send(JSON.stringify(payload));
    }
}

function connectScreenShareSocket(options = {}) {
    if (options?.roomCode && options?.participantId) {
        pendingAttach = options;
    }

    if (screenShareWs && screenShareWs.readyState === WebSocket.OPEN) {
        if (pendingAttach?.roomCode && pendingAttach?.participantId) {
            sendScreenShareMessage({
                type: 'attach-room',
                roomCode: pendingAttach.roomCode,
                participantId: pendingAttach.participantId,
                channel: 'screen-share',
            });
        }
        return;
    }

    if (screenShareWs && screenShareWs.readyState === WebSocket.CONNECTING) {
        return;
    }

    screenShareWs = new WebSocket(WEBSOCKET_URL);
    screenShareWs.onopen = onOpen;
    screenShareWs.onmessage = onMessage;
    screenShareWs.onclose = onClose;
    screenShareWs.onerror = onError;
}

function attachLocalTracks() {
    if (!peerConnection || !localScreenStream) {
        return;
    }

    const videoTrack = localScreenStream.getVideoTracks()[0];
    if (videoTrack && !screenTrackSender) {
        screenTrackSender = peerConnection.addTrack(videoTrack, localScreenStream);
    }
  
    const audioTrack = localScreenStream.getAudioTracks()[0];
    if (audioTrack && !systemAudioTrackSender) {
        try {
            audioTrack.contentHint = 'music';
        } catch (error) {
            console.debug('Could not set screen share audio content hint.', error);
        }
        systemAudioTrackSender = peerConnection.addTrack(audioTrack, localScreenStream);
    }
}

async function createAndSendOffer() {
    if (!peerConnection) {
        return;
    }

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendScreenShareMessage({
        type: 'signal',
        data: { sdp: peerConnection.localDescription },
    });
}

async function ensurePeerConnection(isOfferer) {
    if (peerConnection) {
        return peerConnection;
    }

    const iceServers = await getIceServers();
    peerConnection = new RTCPeerConnection({ iceServers });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendScreenShareMessage({ type: 'signal', data: { candidate: event.candidate } });
        }
    };

    peerConnection.ontrack = (event) => {
        showRemoteStreamView(event.streams[0]);
    };

    peerConnection.onconnectionstatechange = () => {
        if (!peerConnection) {
            return;
        }

        if (['failed', 'closed', 'disconnected'].includes(peerConnection.connectionState)) {
            hideRemoteStreamView();
            if (!localScreenStream) {
                closePeerConnection();
                disconnectScreenShareSocket({ silent: true });
            }
        }
    };

    if (isOfferer) {
        attachLocalTracks();
        if (localScreenStream) {
            await createAndSendOffer();
        }
    }

    return peerConnection;
}

async function handleSignal(data) {
    try {
        if (!peerConnection) {
            await ensurePeerConnection(false);
        }

        if (!peerConnection) {
            return;
        }

        if (data.sdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === 'offer') {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                sendScreenShareMessage({
                    type: 'signal',
                    data: { sdp: peerConnection.localDescription },
                });
            }
        } else if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (error) {
        console.error('Error handling screen share signal:', error);
    }
}

function resetRemoteOnlySession() {
    hideRemoteStreamView();
    closePeerConnection();
    if (!localScreenStream) {
        disconnectScreenShareSocket({ silent: true });
    }
}

async function onMessage(event) {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
    case 'registered':
        break;
    case 'room-attached':
        break;
    case 'peer-joined':
        await ensurePeerConnection(awaitingLocalShare);
        break;
    case 'signal':
        await handleSignal(msg.data);
        break;
    case 'peer-left':
        resetRemoteOnlySession();
        break;
    case 'error':
        showToast({
            type: 'danger',
            title: 'Screen Share Error',
            body: msg.message,
            duration: 8000,
        });
        if (localScreenStream) {
            await stopScreenShare();
        } else {
            resetRemoteOnlySession();
        }
        break;
    }
}

function onOpen() {
    sendScreenShareMessage({
        type: 'register-details',
        name: store.getState().myName,
    });

    if (pendingAttach?.roomCode && pendingAttach?.participantId) {
        sendScreenShareMessage({
            type: 'attach-room',
            roomCode: pendingAttach.roomCode,
            participantId: pendingAttach.participantId,
            channel: 'screen-share',
        });
    }
}

function onClose() {
    const wasSuppressed = suppressCloseHandling;
    suppressCloseHandling = false;
    pendingAttach = null;
    screenShareWs = null;

    if (wasSuppressed) {
        return;
    }

    if (!localScreenStream) {
        hideRemoteStreamView();
        closePeerConnection();
    }
}

function onError(error) {
    console.error('Screen share WebSocket error:', error);
}

function updateShareButtonAvailability(summary) {
    const btn = getShareButton();
    if (!btn) {
        return;
    }

    const hasPeer = Boolean(summary?.peer);
    const supportsScreenShare = !isMobile() && Boolean(navigator.mediaDevices?.getDisplayMedia);

    if (!hasPeer || !supportsScreenShare) {
        btn.classList.add('hidden');
        btn.disabled = true;
        if (isMobile()) {
            btn.title = 'Screen sharing is not supported on mobile devices.';
        }
        return;
    }

    btn.disabled = Boolean(summary?.screenShare?.requestedByPeer && !summary?.screenShare?.requestedBySelf);
    btn.title = btn.disabled
        ? 'Peer is already screen sharing.'
        : getDisplayMediaOptions(true).hint;
    updateShareButton(Boolean(localScreenStream));
}

export function syncScreenShareSession(summary) {
    updateShareButtonAvailability(summary);

    if (!summary?.peer) {
        if (localScreenStream) {
            stopScreenShare().catch((error) => {
                console.error('Failed to stop screen share after peer left:', error);
            });
        } else {
            awaitingLocalShare = false;
            resetRemoteOnlySession();
        }
        return;
    }

    if (summary?.screenShare?.isActive) {
        connectScreenShareSocket({
            roomCode: summary.roomCode,
            participantId: summary.self.participantId,
        });
        return;
    }

    if (!localScreenStream) {
        awaitingLocalShare = false;
        resetRemoteOnlySession();
    }
}

export function handleScreenShareWakeRequest() {
    const { currentFlightCode, roomParticipantId, roomPeer } = store.getState();
    if (!currentFlightCode || !roomParticipantId || !roomPeer) {
        return;
    }

    connectScreenShareSocket({
        roomCode: currentFlightCode,
        participantId: roomParticipantId,
    });
}

export async function startScreenShare({ withSystemAudio = true } = {}) {
    const { currentFlightCode, roomParticipantId, roomPeer } = store.getState();
    if (!currentFlightCode || !roomParticipantId || !roomPeer) {
        showToast({
            type: 'info',
            title: 'Waiting for peer',
            body: 'A second user needs to join the room before you can share your screen.',
            duration: 5000,
        });
        return;
    }

    if (localScreenStream) {
        return;
    }

    try {
        const { constraints } = getDisplayMediaOptions(withSystemAudio);
        localScreenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
        awaitingLocalShare = true;
        showLocalStreamView(localScreenStream, () => {});
        updateShareButton(true);

        const videoTrack = localScreenStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.onended = () => {
                stopScreenShare().catch((error) => {
                    console.error('Failed to stop screen share after track ended:', error);
                });
            };
        }

        await setParticipantScreenShareRequest(currentFlightCode, roomParticipantId, true);
        sendData(JSON.stringify({ type: 'screen-share-requested' }));
        connectScreenShareSocket({
            roomCode: currentFlightCode,
            participantId: roomParticipantId,
        });
    } catch (error) {
        console.error('Error starting screen share:', error);
        hideLocalStreamView();
        updateShareButton(false);
        if (localScreenStream) {
            localScreenStream.getTracks().forEach((track) => track.stop());
        }
        localScreenStream = null;
        awaitingLocalShare = false;
        const message = error instanceof Error ? error.message : String(error);
        if (!/cancel|abort/i.test(message)) {
            showToast({
                type: 'danger',
                title: 'Screen Share Error',
                body: message,
                duration: 8000,
            });
        }
    }
}

export async function stopScreenShare() {
    const { currentFlightCode, roomParticipantId } = store.getState();

    if (localScreenStream) {
        localScreenStream.getTracks().forEach((track) => track.stop());
    }

    hideLocalStreamView();
    updateShareButton(false);
    localScreenStream = null;
    awaitingLocalShare = false;
    closePeerConnection();
    hideRemoteStreamView();
    disconnectScreenShareSocket();

    if (currentFlightCode && roomParticipantId) {
        try {
            await setParticipantScreenShareRequest(currentFlightCode, roomParticipantId, false);
        } catch (error) {
            console.error('Failed to clear screen share state:', error);
        }
    }
}

export function isScreenShareActive() {
    return Boolean(localScreenStream);
}
