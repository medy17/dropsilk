// --- NEW: THEME TOGGLE LOGIC ---
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

const applyTheme = (theme, persist = true) => {
    body.setAttribute('data-theme', theme);
    if (persist) {
        localStorage.setItem('dropsilk-theme', theme);
    }
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (theme === 'dark') {
        themeToggle.setAttribute('aria-label', 'Switch to Shades Up (Light Mode)');
        if (metaThemeColor) metaThemeColor.setAttribute('content', '#111113');
    } else {
        themeToggle.setAttribute('aria-label', 'Switch to Shades Down (Dark Mode)');
        if (metaThemeColor) metaThemeColor.setAttribute('content', '#ffffff');
    }
};

const toggleTheme = () => {
    const currentTheme = body.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
};

const initializeTheme = () => {
    const savedTheme = localStorage.getItem('dropsilk-theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        applyTheme('light', false); // Default to light mode, do not save preference yet
    }
};

initializeTheme(); // Apply theme on initial script load to prevent FOUC
themeToggle.addEventListener('click', toggleTheme);

// --- CONFIG ---
// We will replace this URL after deploying the backend in the next step.
const WEBSOCKET_URL = "wss://dropsilk-server.onrender.com";
const ICE_SERVERS = [{
    urls: "stun:stun.l.google.com:19302"
}];

// --- STATE ---
let ws, peerConnection, dataChannel, worker;
let myId = "",
    myName = "",
    currentFlightCode = null,
    isFlightCreator = false,
    connectionType = 'wan',
    peerInfo = null; // NEW: To store connected peer's info
let fileToSendQueue = [];
let currentlySendingFile = null;
const fileIdMap = new Map();

// --- NEW: METRICS STATE ---
let totalBytesSent = 0,
    totalBytesReceived = 0,
    metricsInterval = null,
    lastMetricsUpdateTime = 0,
    sentInInterval = 0,
    receivedInInterval = 0;


// --- UI ELEMENTS ---
const setupContainer = document.querySelector(".main-content");
const userNameDisplay = document.getElementById("userNameDisplay");
const createFlightBtn = document.getElementById("createFlightBtn");
const joinFlightBtn = document.getElementById("joinFlightBtn");
const flightCodeInput = document.getElementById("flightCodeInput");
const flightCodeInputWrapper = flightCodeInput.closest('.flight-code-input-wrapper'); // NEW

const dashboard = document.getElementById("dashboard");
const dashboardFlightCode = document.getElementById("dashboard-flight-code");
const dashboardFlightStatus = document.getElementById("dashboard-flight-status");
const leaveFlightBtnDashboard = document.getElementById("leaveFlightBtnDashboard");
const fileInputTransfer = document.getElementById("fileInput_transfer");
const sendingQueueDiv = document.getElementById("sending-queue");
const receiverQueueDiv = document.getElementById("receiver-queue");
const toastContainer = document.getElementById("toast-container");

// --- MODIFIED: Dynamic connection panel elements ---
const connectionPanelTitle = document.getElementById("connection-panel-title");
const connectionPanelList = document.getElementById("connection-panel-list");


// --- NEW: METRICS UI ELEMENTS ---
const metricsSentEl = document.getElementById('metrics-sent');
const metricsReceivedEl = document.getElementById('metrics-received');
const metricsSpeedEl = document.getElementById('metrics-speed');

// This function will be called to switch to the dashboard view
let enterFlightMode;

// --- INITIALIZATION & CORE LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
    const dashboardFlightCodeBtn = document.getElementById('dashboard-flight-code');

    function setFlightCode(code) {
        dashboardFlightCodeBtn.setAttribute('data-code', code);
        dashboardFlightCodeBtn.innerHTML = `<span class="code-text">${code}</span>`;
        if (!dashboardFlightCodeBtn.querySelector('.copy-feedback')) {
            const feedback = document.createElement('span');
            feedback.className = 'copy-feedback';
            feedback.textContent = 'Copied!';
            dashboardFlightCodeBtn.appendChild(feedback);
        }
    }

    dashboardFlightCodeBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const code = dashboardFlightCodeBtn.getAttribute('data-code');
        if (!code) return;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(code);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = code;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            dashboardFlightCodeBtn.classList.add('copied');
            setTimeout(() => dashboardFlightCodeBtn.classList.remove('copied'), 1200);
        } catch (error) {
            console.error('Copy failed:', error);
            const codeSpan = dashboardFlightCodeBtn.querySelector('.code-text');
            if (codeSpan) {
                const range = document.createRange();
                range.selectNodeContents(codeSpan);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    });

    enterFlightMode = function(flightCode) {
        currentFlightCode = flightCode;
        setupContainer.style.display = "none";
        dashboard.style.display = "flex";
        setFlightCode(flightCode);
        // Re-render the network list to enable invite buttons if not yet connected
        if (!peerInfo) {
            renderNetworkUsersView(lastNetworkUsers || []);
        }
    }

    initializeUser();
    initializeWebSocket();
    setupEventListeners();
});

// --- NEW HELPER: IP ADDRESS CHECKS ---
function isPrivateIp(ip) {
    if (!ip) return false;
    // Exclude CGNAT range 100.64.0.0/10 as it's not a true private network for our purpose
    const cgnatMatch = ip.match(/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./);
    if (cgnatMatch) {
        return false;
    }
    // Check for private IP ranges (RFC 1918)
    return ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
}

// --- NEW: GLOBAL MODAL UTILITIES ---
async function copyToClipboard(text, button, successText = 'Copied!') {
    try {
        await navigator.clipboard.writeText(text);
        showButtonSuccess(button, successText);
    } catch (error) {
        console.error('Copy failed:', error);
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showButtonSuccess(button, successText);
    }
}

function showButtonSuccess(button, text) {
    if (!button) return;
    const originalText = button.innerHTML;
    button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
            <path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/>
        </svg>
        ${text}
        `;
    button.classList.add('success');
    setTimeout(() => {
        button.innerHTML = originalText;
        button.classList.remove('success');
    }, 2000);
}

// --- NEW: Refactored Modal Setup ---
function setupAllModalsAndNav() {
    const modals = {
        invite: {
            overlay: document.getElementById('inviteModal'),
            trigger: document.getElementById('inviteBtn'),
            close: document.getElementById('closeInviteModal')
        },
        about: {
            overlay: document.getElementById('aboutModal'),
            trigger: document.getElementById('aboutBtn'),
            close: document.getElementById('closeAboutModal')
        },
        contact: {
            overlay: document.getElementById('contactModal'),
            trigger: document.getElementById('contactBtn'),
            close: document.getElementById('closeContactModal')
        },
        // --- NEW: Footer Modals ---
        terms: {
            overlay: document.getElementById('termsModal'),
            trigger: document.getElementById('termsBtn'),
            close: document.getElementById('closeTermsModal')
        },
        privacy: {
            overlay: document.getElementById('privacyModal'),
            trigger: document.getElementById('privacyBtn'),
            close: document.getElementById('closePrivacyModal')
        },
        security: {
            overlay: document.getElementById('securityModal'),
            trigger: document.getElementById('securityBtn'),
            close: document.getElementById('closeSecurityModal')
        },
        faq: {
            overlay: document.getElementById('faqModal'),
            trigger: document.getElementById('faqBtn'),
            close: document.getElementById('closeFaqModal')
        }
    };

    const setupModal = (modalConfig) => {
        if (!modalConfig.overlay || !modalConfig.trigger || !modalConfig.close) return;
        const showModal = () => {
            modalConfig.overlay.classList.add('show');
            document.body.style.overflow = 'hidden';
        };
        const hideModal = () => {
            modalConfig.overlay.classList.remove('show');
            document.body.style.overflow = '';
        };
        modalConfig.trigger.addEventListener('click', showModal);
        modalConfig.close.addEventListener('click', hideModal);
        modalConfig.overlay.addEventListener('click', (e) => {
            if (e.target === modalConfig.overlay) hideModal();
        });
    };

    Object.values(modals).forEach(setupModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.show').forEach(m => {
                m.classList.remove('show');
                document.body.style.overflow = '';
            });
        }
    });

    // Invite Modal Specifics
    const inviteModalSpecifics = () => {
        const modalFlightCode = document.getElementById('modalFlightCode');
        const qrCanvas = document.getElementById('qrCanvas');
        const copyLinkBtn = document.getElementById('copyLinkBtn');
        const shareNativeBtn = document.getElementById('shareNativeBtn');
        const copyCodeBtn = document.getElementById('copyCodeBtn');

        if (navigator.share) shareNativeBtn.style.display = 'flex';

        modals.invite.trigger.addEventListener('click', () => {
            if (!currentFlightCode) return;
            modalFlightCode.textContent = currentFlightCode;
            generateQRCode();
        });

        function generateQRCode() {
            const url = `https://dropsilk.xyz?code=${currentFlightCode}`;
            if (typeof QRCode === 'undefined') {
                console.error('QRCode library not loaded');
                if (qrCanvas) qrCanvas.style.display = 'none';
                return;
            }
            const isDarkMode = document.body.getAttribute('data-theme') === 'dark';
            const qrColors = {
                dark: isDarkMode ? '#5bcefa' : '#18181b', // QR Code dots
                light: '#00000000' // Transparent background
            };
            QRCode.toCanvas(qrCanvas, url, {
                width: 200,
                margin: 2,
                color: qrColors,
                errorCorrectionLevel: 'M'
            }, (err) => {
                if (err) console.error('QR Code generation error:', err);
            });
        }
        copyLinkBtn.addEventListener('click', () => copyToClipboard(`https://dropsilk.xyz?code=${currentFlightCode}`, copyLinkBtn, 'Link Copied!'));
        copyCodeBtn.addEventListener('click', () => copyToClipboard(currentFlightCode, copyCodeBtn, 'Code Copied!'));
        shareNativeBtn.addEventListener('click', async () => {
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Join my DropSilk flight!',
                        text: `Join my file transfer session with code: ${currentFlightCode}`,
                        url: `https://dropsilk.xyz?code=${currentFlightCode}`
                    });
                } catch (error) {
                    if (error.name !== 'AbortError') copyToClipboard(`https://dropsilk.xyz?code=${currentFlightCode}`, shareNativeBtn, 'Link Copied!');
                }
            }
        });
    };

    // Contact Modal Specifics
    const contactModalSpecifics = () => {
        const copyEmailBtn = document.getElementById('copyEmailBtn');
        copyEmailBtn.addEventListener('click', () => copyToClipboard('aratahmed@gmail.com', copyEmailBtn, 'Email Copied!'));
    };

    inviteModalSpecifics();
    contactModalSpecifics();
}

function setupDragAndDrop() {
    const dropZone = document.querySelector('.drop-zone');
    let dragCounter = 0;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => document.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
    }));
    ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, handleDragEnter, false));
    ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, handleDragLeave, false));
    dropZone.addEventListener('drop', handleDrop, false);

    document.addEventListener('dragenter', e => {
        if (e.dataTransfer.types.includes('Files')) {
            dragCounter++;
            document.body.classList.add('dragging');
        }
    });
    document.addEventListener('dragleave', e => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            document.body.classList.remove('dragging');
        }
    });
    document.addEventListener('drop', e => {
        dragCounter = 0;
        document.body.classList.remove('dragging');
    });

    function handleDragEnter(e) {
        dropZone.classList.add('drag-over');
        if (e.dataTransfer.types.includes('Files')) {
            dropZone.classList.add('drag-active');
            if (dropZone.querySelector('p').textContent === 'Drag & Drop files or folders') {
                dropZone.querySelector('p').textContent = 'Drop your files here!';
                dropZone.querySelector('.secondary-text').textContent = 'Release to add to queue';
            }
        }
    }

    function handleDragLeave(e) {
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drag-over', 'drag-active');
            dropZone.querySelector('p').textContent = 'Drag & Drop files or folders';
            dropZone.querySelector('.secondary-text').textContent = 'or select manually';
        }
    }

    function handleDrop(e) {
        dropZone.classList.remove('drag-over', 'drag-active');
        dropZone.querySelector('p').textContent = 'Drag & Drop files or folders';
        dropZone.querySelector('.secondary-text').textContent = 'or select manually';
        handleFileSelection(e.dataTransfer.files);
    }
}

// --- CODE TRUNCATE ---
const input = document.querySelector('.flight-code-input-wrapper input');
input.addEventListener('input', function() {
    if (this.value.length > 6) {
        this.value = this.value.slice(0, 6);
    }
});

function initializeUser() {
    myName = generateRandomName();
    userNameDisplay.textContent = myName;
}

function generateRandomName() {
    const adjectives = ["Swift", "Clever", "Silent", "Agile", "Brave", "Bright", "Eager", "Bold", "Flying", "Soaring", "Windy", "Cloudy"];
    const nouns = ["Fox", "Jaguar", "Eagle", "Sparrow", "Lion", "Tiger", "River", "Sky", "Aero", "Jet", "Pilot", "Wing"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 900) + 100}`;
}

function initializeWebSocket() {
    ws = new WebSocket(WEBSOCKET_URL);
    ws.onopen = () => discoverLocalIpAndRegister(); // Still useful for LAN/WAN detection
    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        // console.log("Received:", msg);
        switch (msg.type) {
            case "registered":
                myId = msg.id;
                break;
            case "users-on-network-update":
                lastNetworkUsers = msg.users;
                if (!peerInfo) { // Only render if we're not in an active P2P session
                    renderNetworkUsersView(msg.users);
                }
                break;
            case "flight-invitation":
                showInvitationToast(msg.fromName, msg.flightCode);
                break;
            case "flight-created":
                enterFlightMode(msg.flightCode);
                break;
            case "peer-joined":
                connectionType = msg.connectionType || 'wan';
                peerInfo = msg.peer;
                console.log(`Peer ${peerInfo.name} joined. Connection type: ${connectionType}`);
                handlePeerJoined(msg.flightCode);
                break;
            case "signal":
                if (!peerConnection) initializePeerConnection(isFlightCreator);
                await handleSignal(msg.data);
                break;
            case "peer-left":
                handlePeerLeft();
                break;
            case "error":
                handleServerError(msg.message);
                break;
        }
    };
    ws.onclose = () => {
        showToast({
            type: 'danger',
            title: 'Connection Lost',
            body: 'Connection to the server was lost. Please refresh the page to reconnect.',
            duration: 0 // Persist until dismissed
        });
        resetState();
    };
    ws.onerror = (error) => console.error("WebSocket error:", error);
}

// --- NEW: Centralized Error Handling ---
function handleServerError(message) {
    console.error("Server error:", message);
    // Check for specific, user-facing errors
    if (message.includes("Flight not found")) {
        flightCodeInputWrapper.classList.add('input-error');
        setTimeout(() => flightCodeInputWrapper.classList.remove('input-error'), 1500);

        showToast({
            type: 'danger',
            title: 'Flight Not Found',
            body: "Please double-check the 6-character code and try again. The flight creator must be online. If you're on the same Wi-Fi, they can invite you directly from their dashboard.",
            duration: 8000
        });
    } else {
        // Generic error for other problems
        showToast({
            type: 'danger',
            title: 'An Error Occurred',
            body: message,
            duration: 8000
        });
    }
}


function handlePeerJoined(flightCode) {
    if (!currentFlightCode) { // Receiver joins
        enterFlightMode(flightCode);
    }
    if (!peerConnection) {
        initializePeerConnection(isFlightCreator);
    }
    dashboardFlightStatus.textContent = `Peer Connected! (${connectionType.toUpperCase()} mode)`;
    dashboardFlightStatus.style.color = '#15803d';
    dashboardFlightStatus.style.backgroundColor = '#f0fdf4';
    dashboardFlightStatus.style.borderColor = '#bbf7d0';
    renderInFlightView();
    processFileToSendQueue();
}

function handlePeerLeft() {
    console.log("Peer has left the flight.");
    peerInfo = null; // Clear peer info
    resetPeerConnectionState();
    dashboardFlightStatus.textContent = 'Peer disconnected. Waiting...';
    dashboardFlightStatus.style.color = '#d97706';
    dashboardFlightStatus.style.backgroundColor = '#fffbe6';
    dashboardFlightStatus.style.borderColor = '#fde68a';
    // Revert to network view. The server will send a `users-on-network-update` which will
    // trigger the render, but we can be proactive to make the UI feel instant.
    renderNetworkUsersView(lastNetworkUsers);
}

// --- FILE TRANSFER & UI LOGIC (WITH FIXES) ---
let chunkQueue = [],
    isSending = false,
    fileReadingDone = false,
    sentOffset = 0;
const HIGH_WATER_MARK = 1024 * 1024;
let incomingFileInfo = null,
    incomingFileData = [],
    incomingFileReceived = 0;

function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log("Data channel opened!");
        // The peer-joined message from the server already handles the UI update.
        // Re-calling handlePeerJoined here would be redundant.

        // NEW: Start tracking metrics when channel opens
        lastMetricsUpdateTime = Date.now();
        if (metricsInterval) clearInterval(metricsInterval);
        metricsInterval = setInterval(updateMetrics, 1000);
    };
    dataChannel.onclose = () => {
        console.log("Data channel closed.");
        handlePeerLeft();
        // NEW: Stop tracking metrics when channel closes
        if (metricsInterval) clearInterval(metricsInterval);
        metricsSpeedEl.textContent = '0 KB/s';
    };
    dataChannel.onerror = (error) => console.error("Data channel error:", error);
    dataChannel.onbufferedamountlow = () => drainQueue();
    dataChannel.onmessage = (event) => {
        // METADATA
        if (typeof event.data === "string" && event.data.startsWith("{")) {
            incomingFileInfo = JSON.parse(event.data);
            incomingFileData = [];
            incomingFileReceived = 0;

            if (receiverQueueDiv.querySelector('.empty-state')) receiverQueueDiv.innerHTML = '';

            const fileId = `file-recv-${Date.now()}`;
            const fileIcon = getFileIcon(incomingFileInfo.name);
            receiverQueueDiv.insertAdjacentHTML('beforeend', `
                    <div class="queue-item" id="${fileId}">
                        <div class="file-icon">${fileIcon}</div>
                        <div class="file-details">
                            <div class="file-details__name" title="${incomingFileInfo.name}"><span>${incomingFileInfo.name}</span></div>
                            <progress class="file-details__progress-bar" value="0" max="1"></progress>
                            <div class="file-details__status"><span class="percent">0%</span></div>
                        </div>
                        <div class="file-action"></div>
                    </div>`);
            fileIdMap.set(incomingFileInfo.name, fileId);
            return;
        }
        // EOF
        if (event.data === "EOF") {
            const received = new Blob(incomingFileData, {
                type: incomingFileInfo.type
            });
            const url = URL.createObjectURL(received);
            const fileId = fileIdMap.get(incomingFileInfo.name);
            const fileElement = document.getElementById(fileId);
            if (fileElement) {
                fileElement.querySelector('.file-action').innerHTML = `<a href="${url}" download="${incomingFileInfo.name}">Download</a>`;
                fileElement.querySelector('.percent').textContent = 'Complete!';
            }
            return;
        }
        // CHUNK
        const chunkSize = event.data.byteLength || event.data.size || 0;
        // NEW: Update received metrics
        totalBytesReceived += chunkSize;
        receivedInInterval += chunkSize;
        metricsReceivedEl.textContent = formatBytes(totalBytesReceived);

        incomingFileData.push(event.data);
        incomingFileReceived += chunkSize;
        if (incomingFileInfo?.size) {
            const progressValue = incomingFileReceived / incomingFileInfo.size;
            const fileId = fileIdMap.get(incomingFileInfo.name);
            const fileElement = document.getElementById(fileId);
            if (fileElement) {
                fileElement.querySelector('progress').value = progressValue;
                fileElement.querySelector('.percent').textContent = `${Math.round(progressValue * 100)}%`;
            }
        }
    };
}

function startFileSend(file) {
    currentlySendingFile = file;
    const fileId = fileIdMap.get(file);
    const fileElement = document.getElementById(fileId);
    isSending = true;

    if (fileElement) {
        fileElement.innerHTML = `
                <div class="file-icon">${getFileIcon(file.name)}</div>
                <div class="file-details">
                    <div class="file-details__name" title="${file.name}"><span>${file.name}</span></div>
                    <progress class="file-details__progress-bar" value="0" max="1"></progress>
                    <div class="file-details__status">
                        <span class="percent">0%</span>
                        <span class="status-text">Sending...</span>
                    </div>
                </div>`;
    }

    if (worker) worker.terminate();
    worker = new Worker("sender.worker.js");
    chunkQueue = [];
    fileReadingDone = false;
    sentOffset = 0;
    dataChannel.send(JSON.stringify({
        name: file.name,
        type: file.type,
        size: file.size
    }));
    worker.onmessage = (e) => {
        const {
            type,
            chunk
        } = e.data;
        if (type === "chunk") {
            chunkQueue.push(chunk);
            drainQueue();
        } else if (type === "done") {
            fileReadingDone = true;
            worker.terminate();
            worker = null;
            drainQueue();
        }
    };
    worker.postMessage(file);
}

function drainQueue() {
    const file = currentlySendingFile;
    if (!file) return;

    const fileId = fileIdMap.get(file);
    const fileElement = document.getElementById(fileId);

    while (chunkQueue.length > 0) {
        if (dataChannel.bufferedAmount > HIGH_WATER_MARK) return;
        const chunk = chunkQueue.shift();
        dataChannel.send(chunk);

        // NEW: Update sent metrics
        const chunkSize = chunk.byteLength;
        totalBytesSent += chunkSize;
        sentInInterval += chunkSize;
        metricsSentEl.textContent = formatBytes(totalBytesSent);

        sentOffset += chunkSize;
        if (fileElement) {
            const progressValue = sentOffset / file.size;
            fileElement.querySelector('progress').value = progressValue;
            fileElement.querySelector('.percent').textContent = `${Math.round(progressValue * 100)}%`;
        }
    }

    if (fileReadingDone && chunkQueue.length === 0) {
        dataChannel.send("EOF");
        if (fileElement) {
            fileElement.querySelector('.status-text').textContent = 'Sent!';
            fileElement.querySelector('.percent').textContent = `100%`;
        }
        isSending = false;
        currentlySendingFile = null;
        processFileToSendQueue();
    }
}

function processFileToSendQueue() {
    if (fileToSendQueue.length > 0 && dataChannel && dataChannel.readyState === 'open' && !isSending) {
        const nextFile = fileToSendQueue.shift();
        startFileSend(nextFile);
    }
}

// Define the global file handling function
function handleFileSelection(files) {
    if (files.length === 0) return;

    // Add success animation for drag and drop
    const dropZone = document.querySelector('.drop-zone');
    if (dropZone) {
        dropZone.style.transform = 'scale(0.98)';
        dropZone.style.transition = 'transform 0.1s ease-out';

        setTimeout(() => {
            dropZone.style.transform = '';
            dropZone.style.transition = '';
        }, 100);
    }

    if (sendingQueueDiv.querySelector('.empty-state')) {
        sendingQueueDiv.innerHTML = '';
    }

    Array.from(files).forEach(file => {
        fileToSendQueue.push(file);
        const fileId = `send-${Date.now()}-${Math.random()}`;
        fileIdMap.set(file, fileId);

        sendingQueueDiv.insertAdjacentHTML('beforeend', `
            <div class="queue-item" id="${fileId}" style="opacity: 0; transform: translateY(10px);">
                <div class="file-icon">${getFileIcon(file.name)}</div>
                <div class="file-details">
                    <div class="file-details__name" title="${file.name}"><span>${file.name}</span></div>
                    <div class="file-details__status"><span class="status-text">Queued</span></div>
                </div>
            </div>
        `);

        // Animate the new file item in
        const fileElement = document.getElementById(fileId);
        setTimeout(() => {
            fileElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            fileElement.style.opacity = '1';
            fileElement.style.transform = 'translateY(0)';
        }, 50);
    });

    processFileToSendQueue();
    console.log(`Added ${files.length} file(s) to the sending queue`);
}

// --- EVENT LISTENERS & UI HELPERS ---
function setupEventListeners() {
    createFlightBtn.onclick = () => {
        isFlightCreator = true;
        ws.send(JSON.stringify({
            type: "create-flight"
        }));
    };
    joinFlightBtn.onclick = () => {
        const code = flightCodeInput.value.trim().toUpperCase();
        if (code) {
            isFlightCreator = false;
            ws.send(JSON.stringify({
                type: "join-flight",
                flightCode: code
            }));
        } else {
            flightCodeInputWrapper.classList.add('input-error');
            setTimeout(() => flightCodeInputWrapper.classList.remove('input-error'), 1500);
            showToast({
                type: 'danger',
                title: 'Empty Code',
                body: 'Please enter a 6-character flight code to join.',
                duration: 5000
            });
        }
    };
    leaveFlightBtnDashboard.onclick = () => {
        location.reload();
    };

    fileInputTransfer.onchange = () => {
        if (fileInputTransfer.files.length > 0) {
            handleFileSelection(fileInputTransfer.files);
            fileInputTransfer.value = ""; // Clear the input
        }
    };

    // --- MODIFIED: Event delegation for invite buttons on the dynamic panel ---
    connectionPanelList.addEventListener('click', (e) => {
        const inviteBtn = e.target.closest('.invite-user-btn');
        if (inviteBtn && !inviteBtn.disabled) {
            const inviteeId = inviteBtn.dataset.inviteeId;
            if (inviteeId && currentFlightCode) {
                ws.send(JSON.stringify({
                    type: 'invite-to-flight',
                    inviteeId: inviteeId,
                    flightCode: currentFlightCode
                }));
                // Provide feedback
                inviteBtn.textContent = 'Invited';
                inviteBtn.disabled = true;
                setTimeout(() => {
                    inviteBtn.textContent = 'Invite';
                    // The button will be re-enabled on the next user list update if still applicable
                }, 3000);
            }
        }
    });

    document.getElementById('shareAppBtn').onclick = () => document.getElementById('inviteBtn').click();

    // Initialize drag and drop and ALL modals
    setupDragAndDrop();
    setupAllModalsAndNav();
}



// --- NEW: METRICS FUNCTIONS ---
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function updateMetrics() {
    const now = Date.now();
    const elapsedSeconds = (now - lastMetricsUpdateTime) / 1000;
    if (elapsedSeconds === 0) return;

    const totalBytesInInterval = sentInInterval + receivedInInterval;
    const speed = totalBytesInInterval / elapsedSeconds;

    metricsSpeedEl.textContent = `${formatBytes(speed)}/s`;

    // Reset for the next interval
    lastMetricsUpdateTime = now;
    sentInInterval = 0;
    receivedInInterval = 0;
}


function getFileIcon(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();

    // Image
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) return `<svg viewBox="0 0 20 20" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="12" rx="2" fill="#e3f7fd" stroke="var(--c-primary)"/><circle cx="7" cy="8" r="1.5" fill="var(--c-primary)"/><path d="M3 16l4-5 3 4 4-6 3 7" stroke="var(--c-secondary)" stroke-width="1.5" fill="none"/></svg>`;
    // Video
    if (['mp4', 'mov', 'avi', 'mkv', 'm4v'].includes(extension)) return `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8" ry="2.8" fill="#f5eafd" stroke="var(--c-secondary)"/><polygon points="9.2 10 17.9 14.2 9.2 18.4" fill="var(--c-primary)"/></svg>`;
    // Audio
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) return `<svg viewBox="0 0 28 28" width="28" height="28" fill="none"><rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8" ry="2.8" fill="#eafdff" stroke="var(--c-primary)"/><path d="M11.3,9.6v7.3c-.4-.3-.8-.4-1.4-.4-1.1,0-2.1.8-2.1,1.7s.9,1.7,2.1,1.7,2.1-.8,2.1-1.7v-6.8l6.5-.8v5.5c-.4-.3-.8-.4-1.4-.4-1.1,0-2.1.8-2.1,1.7s.9,1.7,2.1,1.7,2.1-.8,2.1-1.7v-8.5c0-.5-.5-.9-1-.9l-6.1.6c-.5,0-.8.4-.8.9Z" fill="var(--c-secondary)"/></svg>`;
    // PDF/Document
    if (['pdf'].includes(extension)) return `<svg viewBox="0 0 20 20" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="12" rx="2" fill="#fff" stroke="var(--c-primary)"/><rect x="6" y="8" width="8" height="1.5" fill="var(--c-secondary)"/><rect x="6" y="11" width="5" height="1.5" fill="var(--c-secondary)"/></svg>`;
    // Archive/Zip
    if (['zip', 'rar', '7z'].includes(extension)) return `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8" ry="2.8" fill="#fffaf7" stroke="var(--c-secondary)"/><rect x="12.6" y="8.4" width="2.8" height="11.2" fill="var(--c-primary)"/><rect x="9.8" y="14" width="8.4" height="2.8" fill="var(--c-secondary)"/></svg>`;
    // Generic File
    return `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8" ry="2.8" fill="#f4f4f5" stroke="var(--c-primary)"/><path d="M12.2,16v-.4c0-.6.1-1.2.3-1.6.2-.4.7-.8,1.4-1.2.6-.3.9-.6,1.1-.8.2-.2.3-.4.3-.7s-.1-.6-.4-.8c-.3-.2-.7-.3-1.1-.3s-.9.1-1.2.3c-.3.2-.5.5-.6.8h-2.5c0-.7.3-1.3.7-1.8s.9-.9,1.5-1.2,1.4-.5,2.2-.5,1.5.1,2.1.4,1.1.7,1.4,1.2c.3.5.5,1.1.5,1.8s-.2,1.1-.5,1.6c-.3.5-.8.9-1.5,1.3-.5.3-.9.6-1,.8-.2.2-.2.5-.2.7v.2h-2.5ZM13.5,16.9c.4,0,.8.2,1.1.5.3.3.5.7.5,1.1s-.2.8-.5,1.1c-.3.3-.7.5-1.1.5s-.8-.2-1.1-.5c-.3-.3-.5-.7-.5-1.1s.2-.8.5-1.1c.3-.3.7-.5,1.1-.5Z" fill="var(--c-secondary)" stroke="var(--c-primary)" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.8"/></svg>`;
}

// --- NEW: Keep track of the last user list to re-render it ---
let lastNetworkUsers = [];

function renderNetworkUsersView(users) {
    connectionPanelTitle.textContent = "Users on Your Network";
    connectionPanelList.innerHTML = '';
    if (users.length === 0) {
        connectionPanelList.innerHTML = '<div class="empty-state">No other users found on your network.</div>';
        return;
    }

    const isInFlight = !!currentFlightCode;
    users.forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'network-user-item';
        userEl.innerHTML = `
                <div class="network-user-details">
                    <span class="network-user-name">${user.name}</span>
                    <span class="network-user-id">ID: ${user.id}</span>
                </div>
                <button
                    class="btn btn-primary invite-user-btn"
                    data-invitee-id="${user.id}"
                    ${!isInFlight ? 'disabled title="Create or join a flight to invite users"' : ''}>
                    Invite
                </button>
            `;
        connectionPanelList.appendChild(userEl);
    });
}

// --- NEW: Renders the "In Flight" view ---
function renderInFlightView() {
    if (!peerInfo) return; // Safety check
    connectionPanelTitle.textContent = "In Flight With";
    connectionPanelList.innerHTML = `
            <div class="inflight-user-item">
                <div class="inflight-user-details">
                    <span class="inflight-user-name">${myName}</span>
                    <span class="user-badge">You</span>
                </div>
                <span class="inflight-user-id">ID: ${myId}</span>
            </div>
            <div class="inflight-user-item">
                <div class="inflight-user-details">
                    <span class="inflight-user-name">${peerInfo.name}</span>
                </div>
                <span class="inflight-user-id">ID: ${peerInfo.id}</span>
            </div>
        `;
}

// --- NEW: Generic Toast Creation Function ---
function showToast({
                       type = 'info',
                       title,
                       body,
                       duration = 10000,
                       actions = []
                   }) {
    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.id = toastId;

    let actionsHTML = '';
    if (actions.length > 0) {
        actionsHTML = '<div class="toast-actions">';
        actions.forEach((action, index) => {
            actionsHTML += `<button class="btn ${action.class || ''} action-btn-${index}">${action.text}</button>`;
        });
        actionsHTML += '</div>';
    }

    toast.innerHTML = `
            <div class="toast-header">
                <strong>${title}</strong>
                <button class="toast-close">&times;</button>
            </div>
            <div class="toast-body">${body}</div>
            ${actionsHTML}
        `;

    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);

    const removeToast = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    };

    let autoDismiss;
    if (duration > 0) {
        autoDismiss = setTimeout(removeToast, duration);
    }

    toast.addEventListener('click', (e) => {
        if (e.target.matches('.toast-close')) {
            clearTimeout(autoDismiss);
            removeToast();
        }
        actions.forEach((action, index) => {
            if (e.target.matches(`.action-btn-${index}`)) {
                action.callback();
                clearTimeout(autoDismiss);
                removeToast();
            }
        });
    });
}

function showInvitationToast(fromName, flightCode) {
    showToast({
        type: 'info',
        title: 'Flight Invitation',
        body: `<b>${fromName}</b> has invited you to a flight.`,
        duration: 15000,
        actions: [{
            text: 'Decline',
            class: 'btn-secondary',
            callback: () => console.log('Invitation declined.')
        },
            {
                text: 'Join',
                class: 'btn-primary',
                callback: () => {
                    isFlightCreator = false; // Important: set flag when joining
                    ws.send(JSON.stringify({
                        type: "join-flight",
                        flightCode
                    }));
                }
            }
        ]
    });
}


function resetState() {
    if (metricsInterval) clearInterval(metricsInterval);
    resetPeerConnectionState();
    currentFlightCode = null;
    isFlightCreator = false;
    connectionType = 'wan';
    fileToSendQueue = [];
    peerInfo = null; // Also reset peerInfo
    setupContainer.style.display = "flex";
    dashboard.style.display = "none";
    flightCodeInput.value = "";
    fileInputTransfer.value = "";
    sendingQueueDiv.innerHTML = '<div class="empty-state">Select files to send</div>';
    receiverQueueDiv.innerHTML = '<div class="empty-state">Waiting for incoming files</div>';

    // NEW: Reset metrics UI and state
    totalBytesSent = 0;
    totalBytesReceived = 0;
    metricsSentEl.textContent = '0.00 GB';
    metricsReceivedEl.textContent = '0.00 GB';
    metricsSpeedEl.textContent = '0 KB/s';

    initializeUser();
}

function resetPeerConnectionState() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (worker) {
        worker.terminate();
        worker = null;
    }
    if (metricsInterval) clearInterval(metricsInterval);
    dataChannel = null;
    chunkQueue = [];
    isSending = false;
    fileReadingDone = false;
    sentOffset = 0;
    incomingFileInfo = null;
    incomingFileData = [];
    incomingFileReceived = 0;
    currentlySendingFile = null;
    metricsSpeedEl.textContent = '0 KB/s';
}

// --- WEBRTC & SERVER COMMUNICATION FUNCTIONS ---
discoverLocalIpAndRegister = function() {
    // This function is now mainly for the client to register its name.
    // The local IP discovery part is less critical but can still help the server's LAN/WAN detection heuristic.
    // console.log("Registering user details with server...");
    ws.send(JSON.stringify({
        type: "register-details",
        name: myName,
        // We can still attempt to get local IP for the LAN/WAN detection, but don't rely on it for grouping.
        localIpPrefix: "unknown",
        localIp: "unknown"
    }));
}

initializePeerConnection = function(isOfferer) {
    if (peerConnection) return;
    let pcConfig;
    if (connectionType === 'lan') {
        console.log("LAN connection mode: Using host candidates only (no STUN).");
        pcConfig = {
            iceServers: []
        };
    } else {
        console.log("WAN connection mode: Using STUN servers.");
        pcConfig = {
            iceServers: ICE_SERVERS
        };
    }

    peerConnection = new RTCPeerConnection(pcConfig);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) ws.send(JSON.stringify({
            type: "signal",
            data: {
                candidate: event.candidate
            },
        }));
    };
    peerConnection.onconnectionstatechange = () => {
        console.log("Peer connection state:", peerConnection.connectionState);
        if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed" || peerConnection.connectionState === "closed") {
            console.log("Peer connection lost or failed. Resetting state.");
            handlePeerLeft();
        }
    };
    if (isOfferer) {
        dataChannel = peerConnection.createDataChannel("fileTransfer");
        setupDataChannel();
        peerConnection.createOffer().then((offer) => peerConnection.setLocalDescription(offer)).then(() => {
            ws.send(JSON.stringify({
                type: "signal",
                data: {
                    sdp: peerConnection.localDescription
                },
            }));
        });
    } else {
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel();
        };
    }
}
handleSignal = async function(data) {
    if (!peerConnection) {
        console.warn("Received signal before peerConnection initialized. Initializing now.");
        initializePeerConnection(isFlightCreator);
    }
    if (data.sdp) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === "offer") {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                ws.send(JSON.stringify({
                    type: "signal",
                    data: {
                        sdp: peerConnection.localDescription
                    },
                }));
            }
        } catch (error) {
            console.error("Error setting remote description or creating answer:", error);
        }
    } else if (data.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error("Error adding ICE candidate:", error);
        }
    }
}