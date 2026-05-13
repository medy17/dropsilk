import { API_BASE_URL, WEBSOCKET_URL } from '../config.js';
import { store } from '../state.js';
import { setParticipantChatActive } from './roomApi.js';
import { sendData } from './webrtc.js';
import { appendChatMessage } from '../features/chat/chatMessages.js';

let chatWs = null;
let pendingAttach = null;
let suppressCloseHandling = false;
let peerConnection = null;
let chatDataChannel = null;
let chatRequested = false;
let activationPromise = null;
const pendingMessages = [];

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
        console.error('Could not get TURN server credentials for chat.', error);
        return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
}

function sendChatSignal(payload) {
    if (chatWs && chatWs.readyState === WebSocket.OPEN) {
        chatWs.send(JSON.stringify(payload));
    }
}

function disconnectChatSocket({ silent = false } = {}) {
    suppressCloseHandling = silent;
    pendingAttach = null;

    if (
        chatWs &&
        (chatWs.readyState === WebSocket.OPEN ||
            chatWs.readyState === WebSocket.CONNECTING)
    ) {
        chatWs.close();
        return;
    }

    chatWs = null;
    suppressCloseHandling = false;
}

function connectChatSocket(options = {}) {
    if (options?.roomCode && options?.participantId) {
        pendingAttach = options;
    }

    if (chatWs && chatWs.readyState === WebSocket.OPEN) {
        if (pendingAttach?.roomCode && pendingAttach?.participantId) {
            sendChatSignal({
                type: 'attach-room',
                roomCode: pendingAttach.roomCode,
                participantId: pendingAttach.participantId,
                channel: 'chat',
            });
        }
        return;
    }

    if (chatWs && chatWs.readyState === WebSocket.CONNECTING) {
        return;
    }

    chatWs = new WebSocket(WEBSOCKET_URL);
    chatWs.onopen = onOpen;
    chatWs.onmessage = onMessage;
    chatWs.onclose = onClose;
    chatWs.onerror = onError;
}

function closePeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    chatDataChannel = null;
}

function flushPendingMessages() {
    if (!chatDataChannel || chatDataChannel.readyState !== 'open') {
        return;
    }

    while (pendingMessages.length > 0) {
        chatDataChannel.send(pendingMessages.shift());
    }
}

function setupDataChannel(channel) {
    chatDataChannel = channel;
    chatDataChannel.onopen = () => {
        flushPendingMessages();
    };
    chatDataChannel.onclose = () => {
        chatDataChannel = null;
    };
    chatDataChannel.onerror = (error) => {
        console.error('Chat data channel error:', error);
    };
    chatDataChannel.onmessage = (event) => {
        if (typeof event.data !== 'string') {
            return;
        }

        try {
            const parsedData = JSON.parse(event.data);
            if (parsedData.kind !== 'chat') {
                return;
            }

            appendChatMessage({
                author: 'peer',
                text: parsedData.text || '',
                timestamp: parsedData.sentAt || Date.now(),
            });
        } catch (error) {
            console.error('Failed to parse incoming chat message:', error);
        }
    };
}

async function createAndSendOffer() {
    if (!peerConnection) {
        return;
    }

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendChatSignal({
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
            sendChatSignal({ type: 'signal', data: { candidate: event.candidate } });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (!peerConnection) {
            return;
        }

        if (['failed', 'closed', 'disconnected'].includes(peerConnection.connectionState)) {
            closePeerConnection();
            disconnectChatSocket({ silent: true });
        }
    };

    if (isOfferer) {
        const channel = peerConnection.createDataChannel('chat');
        setupDataChannel(channel);
        await createAndSendOffer();
    } else {
        peerConnection.ondatachannel = (event) => {
            setupDataChannel(event.channel);
        };
    }

    return peerConnection;
}

async function handleSignal(data) {
    try {
        if (!peerConnection) {
            await ensurePeerConnection(store.getState().isFlightCreator);
        }

        if (!peerConnection) {
            return;
        }

        if (data.sdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === 'offer') {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                sendChatSignal({
                    type: 'signal',
                    data: { sdp: peerConnection.localDescription },
                });
            }
        } else if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (error) {
        console.error('Error handling chat signal:', error);
    }
}

async function onMessage(event) {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
    case 'registered':
    case 'room-attached':
        break;
    case 'peer-joined':
        await ensurePeerConnection(store.getState().isFlightCreator);
        break;
    case 'signal':
        await handleSignal(msg.data);
        break;
    case 'peer-left':
        resetChatSession();
        break;
    case 'error':
        console.error('Chat session error:', msg.message);
        resetChatSession();
        break;
    }
}

function onOpen() {
    sendChatSignal({
        type: 'register-details',
        name: store.getState().myName,
    });

    if (pendingAttach?.roomCode && pendingAttach?.participantId) {
        sendChatSignal({
            type: 'attach-room',
            roomCode: pendingAttach.roomCode,
            participantId: pendingAttach.participantId,
            channel: 'chat',
        });
    }
}

function onClose() {
    const wasSuppressed = suppressCloseHandling;
    suppressCloseHandling = false;
    pendingAttach = null;
    chatWs = null;

    if (!wasSuppressed) {
        closePeerConnection();
        const { currentFlightCode, roomParticipantId, roomPeer, peerInfo } = store.getState();
        if (currentFlightCode && roomParticipantId && (roomPeer || peerInfo) && chatRequested) {
            window.setTimeout(() => {
                connectChatSocket({
                    roomCode: currentFlightCode,
                    participantId: roomParticipantId,
                });
            }, 250);
        }
    }
}

function onError(error) {
    console.error('Chat WebSocket error:', error);
}

async function ensureChatSession() {
    const { currentFlightCode, roomParticipantId, roomPeer } = store.getState();
    if (!currentFlightCode || !roomParticipantId || !roomPeer) {
        throw new Error('No peer connected');
    }

    if (!chatRequested) {
        if (!activationPromise) {
            activationPromise = setParticipantChatActive(
                currentFlightCode,
                roomParticipantId,
                true,
            )
                .then(() => {
                    chatRequested = true;
                })
                .finally(() => {
                    activationPromise = null;
                });
        }
        await activationPromise;
        sendData(JSON.stringify({ type: 'chat-requested' }));
    }

    connectChatSocket({
        roomCode: currentFlightCode,
        participantId: roomParticipantId,
    });
}

export function syncChatSession(summary) {
    if (!summary?.peer) {
        resetChatSession();
        return;
    }

    if (summary?.chat?.requestedBySelf) {
        chatRequested = true;
    }

    if (summary?.chat?.isActive) {
        connectChatSocket({
            roomCode: summary.roomCode,
            participantId: summary.self.participantId,
        });
    }
}

export async function sendChatMessage(text) {
    const payload = {
        kind: 'chat',
        text,
        sentAt: Date.now(),
    };

    if (chatDataChannel && chatDataChannel.readyState === 'open') {
        chatDataChannel.send(JSON.stringify(payload));
        return payload;
    }

    await ensureChatSession();
    pendingMessages.push(JSON.stringify(payload));
    flushPendingMessages();
    return payload;
}

export function handleChatWakeRequest() {
    const { currentFlightCode, roomParticipantId, roomPeer } = store.getState();
    if (!currentFlightCode || !roomParticipantId || !roomPeer) {
        return;
    }

    connectChatSocket({
        roomCode: currentFlightCode,
        participantId: roomParticipantId,
    });
}

export function resetChatSession() {
    pendingMessages.length = 0;
    activationPromise = null;
    chatRequested = false;
    closePeerConnection();
    disconnectChatSocket({ silent: true });
}
