// --- WORKER-SIDE SCRIPT (worker.js) ---
// This is the new "engine" of the application.

// --- STATE ---
let ws, peerConnection, dataChannel;
let myId = "",
    myName = "",
    currentFlightCode = null,
    isFlightCreator = false,
    connectionType = 'wan',
    peerInfo = null;
let fileToSendQueue = [];
let currentlySendingFile = null;
const fileIdMap = new Map();

// --- METRICS STATE ---
let totalBytesSent = 0,
    totalBytesReceived = 0,
    metricsInterval = null,
    lastMetricsUpdateTime = 0,
    sentInInterval = 0,
    receivedInInterval = 0;

// --- CONFIG ---
const WEBSOCKET_URL = "wss://dropsilk-server.onrender.com";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];


// --- MESSAGE HANDLER FROM MAIN THREAD ---
self.onmessage = (e) => {
    const { type, payload } = e.data;
    // console.log('[Worker] Received from Main:', type, payload);

    switch (type) {
        case 'init':
            myName = payload.name;
            initializeWebSocket();
            break;
        case 'create-flight':
            isFlightCreator = true;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "create-flight" }));
            }
            break;
        case 'join-flight':
            isFlightCreator = false;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "join-flight", flightCode: payload.code }));
            }
            break;
        case 'invite-to-flight':
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'invite-to-flight',
                    inviteeId: payload.inviteeId,
                    flightCode: currentFlightCode
                }));
            }
            break;
        case 'send-files':
            handleFileSelection(payload.files);
            break;
        case 'leave-flight':
            if (ws) ws.close();
            self.postMessage({ type: 'reload' });
            break;
    }
};

function post(type, payload) {
    self.postMessage({ type, payload });
}

// --- WEBSOCKET & SIGNALING LOGIC ---
function initializeWebSocket() {
    ws = new WebSocket(WEBSOCKET_URL);

    ws.onopen = () => {
        // console.log('[Worker] WebSocket opened.');
        ws.send(JSON.stringify({ type: "register-details", name: myName }));
    };

    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        // console.log('[Worker] Received from Server:', msg);
        switch (msg.type) {
            case "registered":
                myId = msg.id;
                post('set-identity', { id: myId, name: myName });
                break;
            case "users-on-network-update":
                post('update-network-users', msg.users);
                break;
            case "flight-invitation":
                post('show-toast', {
                    type: 'info',
                    title: 'Flight Invitation',
                    body: `<b>${msg.fromName}</b> has invited you to a flight.`,
                    duration: 15000,
                    actions: [
                        { text: 'Decline', class: 'btn-secondary' },
                        { text: 'Join', class: 'btn-primary', action: { type: 'join-flight', payload: { code: msg.flightCode } } }
                    ]
                });
                break;
            case "flight-created":
                currentFlightCode = msg.flightCode;
                post('enter-flight-mode', { flightCode: msg.flightCode });
                post('update-flight-status', { text: 'Ready to connect', color: 'var(--c-secondary)', bg: 'var(--c-panel-bg)', border: 'var(--c-primary)' });
                break;
            case "peer-joined":
                connectionType = msg.connectionType || 'wan';
                peerInfo = msg.peer;
                currentFlightCode = msg.flightCode; // For the joiner
                // console.log(`[Worker] Peer ${peerInfo.name} joined. Connection type: ${connectionType}`);
                if (!peerConnection) initializePeerConnection(isFlightCreator);
                post('enter-flight-mode', { flightCode: msg.flightCode });
                post('update-flight-status', { text: `Peer Connected! (${connectionType.toUpperCase()} mode)`, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' });
                post('render-inflight-view', { myId, myName, peerInfo });
                processFileToSendQueue();
                break;
            case "signal":
                if (!peerConnection) initializePeerConnection(isFlightCreator);
                await handleSignal(msg.data);
                break;
            case "peer-left":
                // console.log('[Worker] Peer has left the flight.');
                peerInfo = null;
                resetPeerConnectionState();
                post('update-flight-status', { text: 'Peer disconnected. Waiting...', color: '#d97706', bg: '#fffbe6', border: '#fde68a' });
                post('render-network-view'); // Tell UI to revert to network list
                break;
            case "error":
                post('server-error', msg.message);
                break;
        }
    };

    ws.onclose = () => {
        // console.log('[Worker] WebSocket closed.');
        post('show-toast', { type: 'danger', title: 'Connection Lost', body: 'Connection to the server was lost. Please refresh the page to reconnect.', duration: 0 });
        resetState();
    };

    ws.onerror = (error) => console.error("[Worker] WebSocket error:", error);
}

// --- WEBRTC LOGIC ---
function initializePeerConnection(isOfferer) {
    if (peerConnection) return;

    const pcConfig = { iceServers: ICE_SERVERS };
    peerConnection = new RTCPeerConnection(pcConfig);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "signal", data: { candidate: event.candidate } }));
        }
    };

    peerConnection.onconnectionstatechange = () => {
        // console.log("[Worker] Peer connection state:", peerConnection.connectionState);
        const state = peerConnection.connectionState;
        if (state === "disconnected" || state === "failed" || state === "closed") {
            // Let the server's `peer-left` message be the source of truth for teardown.
            // The connection might just be temporarily unstable.
        }
    };

    if (isOfferer) {
        dataChannel = peerConnection.createDataChannel("fileTransfer");
        setupDataChannel();
        peerConnection.createOffer()
            .then((offer) => peerConnection.setLocalDescription(offer))
            .then(() => {
                ws.send(JSON.stringify({ type: "signal", data: { sdp: peerConnection.localDescription } }));
            });
    } else {
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel();
        };
    }
}

async function handleSignal(data) {
    if (data.sdp) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === "offer") {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                ws.send(JSON.stringify({ type: "signal", data: { sdp: peerConnection.localDescription } }));
            }
        } catch (error) { console.error("[Worker] Error handling SDP:", error); }
    } else if (data.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) { console.error("[Worker] Error adding ICE candidate:", error); }
    }
}


// --- DATA CHANNEL & FILE TRANSFER LOGIC ---
let chunkQueue = [], isSending = false, fileReadingDone = false, sentOffset = 0;
const HIGH_WATER_MARK = 1024 * 1024 * 16; // 16MB buffer
let incomingFileInfo = null, incomingFileData = [], incomingFileReceived = 0;

function setupDataChannel() {
    dataChannel.onopen = () => {
        // console.log("[Worker] Data channel opened!");
        lastMetricsUpdateTime = Date.now();
        if (metricsInterval) clearInterval(metricsInterval);
        metricsInterval = setInterval(updateMetrics, 1000);
    };
    dataChannel.onclose = () => {
        // console.log("[Worker] Data channel closed.");
        if (metricsInterval) clearInterval(metricsInterval);
        metricsInterval = null;
        post('update-speed', '0 KB/s');
    };
    dataChannel.onerror = (error) => console.error("[Worker] Data channel error:", error);
    dataChannel.onbufferedamountlow = () => drainQueue();
    dataChannel.onmessage = (event) => {
        // ... (message handling logic for receiving files)
        if (typeof event.data === "string" && event.data.startsWith("{")) {
            incomingFileInfo = JSON.parse(event.data);
            incomingFileData = [];
            incomingFileReceived = 0;
            const fileId = `file-recv-${Date.now()}`;
            fileIdMap.set(incomingFileInfo.webkitRelativePath || incomingFileInfo.name, fileId);
            post('add-remote-file-to-queue', { file: incomingFileInfo, id: fileId });
            return;
        }
        if (event.data === "EOF") {
            const displayName = incomingFileInfo.webkitRelativePath || incomingFileInfo.name;
            const received = new Blob(incomingFileData, { type: incomingFileInfo.type });
            const fileId = fileIdMap.get(displayName);
            post('file-download-ready', { id: fileId, blob: received, name: incomingFileInfo.name });
            fileIdMap.delete(displayName);
            return;
        }
        const chunkSize = event.data.byteLength || event.data.size || 0;
        totalBytesReceived += chunkSize;
        receivedInInterval += chunkSize;
        post('update-received-metric', totalBytesReceived);

        incomingFileData.push(event.data);
        incomingFileReceived += chunkSize;
        if (incomingFileInfo?.size) {
            const displayName = incomingFileInfo.webkitRelativePath || incomingFileInfo.name;
            const progress = incomingFileReceived / incomingFileInfo.size;
            const fileId = fileIdMap.get(displayName);
            post('update-file-progress', { id: fileId, progress: progress, isReceiving: true });
        }
    };
}

function handleFileSelection(files) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
        fileToSendQueue.push(file);
        const fileId = `send-${Date.now()}-${Math.random()}`;
        fileIdMap.set(file, fileId);
        post('add-local-file-to-queue', {
            file: { name: file.name, webkitRelativePath: file.webkitRelativePath || '' },
            id: fileId
        });
    });
    processFileToSendQueue();
}

function processFileToSendQueue() {
    if (fileToSendQueue.length > 0 && dataChannel && dataChannel.readyState === 'open' && !isSending) {
        const nextFile = fileToSendQueue.shift();
        startFileSend(nextFile);
    }
}

async function startFileSend(file) {
    currentlySendingFile = file;
    isSending = true;
    sentOffset = 0;

    const fileId = fileIdMap.get(file);
    post('update-file-status-sending', { id: fileId });

    const metadata = {
        name: file.name,
        type: file.type,
        size: file.size,
        webkitRelativePath: file.webkitRelativePath || ''
    };
    dataChannel.send(JSON.stringify(metadata));

    // Use file.stream() for efficient reading
    const reader = file.stream().getReader();

    while (true) {
        try {
            // Wait if the buffer is full
            if (dataChannel.bufferedAmount > HIGH_WATER_MARK) {
                await new Promise(resolve => {
                    const check = () => {
                        if (dataChannel.bufferedAmount <= HIGH_WATER_MARK) {
                            resolve();
                        } else {
                            setTimeout(check, 50);
                        }
                    };
                    check();
                });
            }

            const { done, value } = await reader.read();
            if (done) {
                dataChannel.send("EOF");
                post('update-file-progress', { id: fileId, progress: 1, isReceiving: false, isComplete: true });
                isSending = false;
                currentlySendingFile = null;
                processFileToSendQueue();
                break;
            }

            dataChannel.send(value);
            const chunkSize = value.byteLength;
            totalBytesSent += chunkSize;
            sentInInterval += chunkSize;
            post('update-sent-metric', totalBytesSent);

            sentOffset += chunkSize;
            const progress = sentOffset / file.size;
            post('update-file-progress', { id: fileId, progress: progress, isReceiving: false });

        } catch (error) {
            console.error('[Worker] Error reading or sending file chunk:', error);
            isSending = false;
            currentlySendingFile = null;
            break;
        }
    }
}

// --- STATE MANAGEMENT & HELPERS ---
function resetState() {
    resetPeerConnectionState();
    myId = ""; currentFlightCode = null; isFlightCreator = false; peerInfo = null;
    fileToSendQueue = []; currentlySendingFile = null; fileIdMap.clear();
    totalBytesSent = 0; totalBytesReceived = 0;
}

function resetPeerConnectionState() {
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (metricsInterval) clearInterval(metricsInterval);
    dataChannel = null; isSending = false;
    sentOffset = 0; incomingFileInfo = null;
    incomingFileData = []; incomingFileReceived = 0; currentlySendingFile = null;
    post('update-speed', '0 KB/s');
}

function updateMetrics() {
    const now = Date.now();
    const elapsedSeconds = (now - lastMetricsUpdateTime) / 1000;
    if (elapsedSeconds === 0) return;
    const speed = (sentInInterval + receivedInInterval) / elapsedSeconds;
    post('update-speed', speed);
    lastMetricsUpdateTime = now;
    sentInInterval = 0;
    receivedInInterval = 0;
}
