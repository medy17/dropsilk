const fs = require('fs');
const path = require('path');
const { TextEncoder, TextDecoder } = require('text-encoding');

// Load the main HTML file into the JSDOM environment
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
document.body.innerHTML = html;

// Polyfill for TextEncoder/TextDecoder which are used by some libraries
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// --- MOCK BROWSER APIs ---

// Mock Web Workers
global.Worker = class {
    constructor(stringUrl) {
        this.url = stringUrl;
        this.onmessage = () => {};
    }
    postMessage(msg) {
        // You can add logic here to simulate worker behavior if needed
    }
    terminate() {}
};

// Mock FileReader
global.FileReader = class {
    constructor() {
        this.onload = null;
        this.onerror = null;
    }
    readAsArrayBuffer(blob) {
        // Simulate successful read with a mock ArrayBuffer
        if (this.onload) {
            const mockBuffer = new ArrayBuffer(blob.size || 10);
            this.onload({ target: { result: mockBuffer } });
        }
    }
};

// Mock URL object methods
global.URL.createObjectURL = jest.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = jest.fn();

// Mock WebRTC
global.RTCPeerConnection = jest.fn().mockImplementation(() => ({
    createDataChannel: jest.fn(() => ({
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        onbufferedamountlow: null,
        readyState: 'open',
        send: jest.fn(),
        close: jest.fn(),
    })),
    createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-offer' }),
    createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-answer' }),
    setLocalDescription: jest.fn().mockResolvedValue(),
    setRemoteDescription: jest.fn().mockResolvedValue(),
    addIceCandidate: jest.fn().mockResolvedValue(),
    close: jest.fn(),
    onicecandidate: null,
    onconnectionstatechange: null,
    ontrack: null,
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
}));
global.RTCSessionDescription = jest.fn();
global.RTCIceCandidate = jest.fn();


// Mock WebSocket
global.WebSocket = jest.fn().mockImplementation(() => ({
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1, // WebSocket.OPEN
}));

// Mock Navigator APIs
Object.defineProperty(global.navigator, 'clipboard', {
    value: {
        writeText: jest.fn().mockResolvedValue(),
    },
    writable: true,
});
Object.defineProperty(global.navigator, 'share', {
    value: jest.fn().mockResolvedValue(),
    writable: true,
});
Object.defineProperty(global.navigator, 'vibrate', {
    value: jest.fn(),
    writable: true,
});
Object.defineProperty(global.navigator, 'mediaDevices', {
    value: {
        getDisplayMedia: jest.fn().mockResolvedValue({
            getVideoTracks: () => [{ onended: null, stop: jest.fn() }],
            getAudioTracks: () => [],
            getTracks: () => [{ stop: jest.fn() }],
        })
    },
    writable: true,
});
Object.defineProperty(global.navigator, 'storage', {
    value: {
        getDirectory: jest.fn().mockRejectedValue(new Error("OPFS not available in this test environment")),
    },
    writable: true
});


// Mock LocalStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => {
            store[key] = value.toString();
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock Audio
global.Audio = jest.fn().mockImplementation(() => ({
    play: jest.fn().mockResolvedValue(),
    load: jest.fn(),
    pause: jest.fn(),
    volume: 1,
    currentTime: 0,
}));

// --- MOCK EXTERNAL LIBRARIES ---
global.QrScanner = jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn(),
    destroy: jest.fn(),
}));

global.Sortable = jest.fn().mockImplementation(() => ({
    option: jest.fn(),
    destroy: jest.fn(),
}));

global.QRCode = {
    toCanvas: jest.fn((canvas, text, options, cb) => {
        if (cb) cb(null);
        return Promise.resolve();
    }),
};

global.JSZip = jest.fn().mockImplementation(() => ({
    file: jest.fn(),
    generateAsync: jest.fn().mockResolvedValue(new Blob(['zip_content'], {type: 'application/zip'}))
}));

// Mock previewer libraries
global.WaveSurfer = {
    create: jest.fn(() => ({
        on: jest.fn(),
        destroy: jest.fn(),
        playPause: jest.fn(),
        toggleMute: jest.fn(),
        getMuted: jest.fn(() => false),
    })),
};
global.hljs = { highlightElement: jest.fn() };
global.marked = { parse: jest.fn(text => `<p>${text}</p>`) };
global.pdfjsLib = {
    getDocument: jest.fn().mockResolvedValue({
        promise: Promise.resolve({
            numPages: 3,
            getPage: jest.fn().mockResolvedValue({
                getViewport: jest.fn(() => ({ width: 100, height: 150 })),
                render: jest.fn(() => ({ promise: Promise.resolve() })),
            }),
        }),
    }),
    GlobalWorkerOptions: { workerSrc: '' },
};
global.mammoth = {
    convertToHtml: jest.fn().mockResolvedValue({ value: '<h1>DOCX Content</h1>' }),
};
global.XLSX = {
    read: jest.fn(() => ({ SheetNames: ['Sheet1'], Sheets: { 'Sheet1': {} } })),
    utils: { sheet_to_html: jest.fn(() => '<table><tr><td>XLSX</td></tr></table>') },
};


// Clear mocks before each test to ensure isolation
beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
});