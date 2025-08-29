// js/state.js
// Manages the application's global state. This is the single source of truth.

import { generateRandomName } from './utils/helpers.js';

const initialState = {
    // Core state
    myId: "",
    myName: "",
    currentFlightCode: null,
    isFlightCreator: false,
    peerInfo: null,
    connectionType: 'wan',
    lastNetworkUsers: [],

    // Transfer state
    fileToSendQueue: [],
    currentlySendingFile: null,
    fileIdMap: new Map(), // Maps file objects to DOM element IDs
    receivedFiles: [], // For zipping

    // Metrics state
    totalBytesSent: 0,
    totalBytesReceived: 0,
    metricsInterval: null,
    lastMetricsUpdateTime: 0,
    sentInInterval: 0,
    receivedInInterval: 0,

    // UI State
    hasScrolledForSend: false,
    hasScrolledForReceive: false,
};

let state = { ...initialState };

export const store = {
    getState: () => ({ ...state }),

    actions: {
        initializeUser: () => {
            state.myName = generateRandomName();
        },
        resetState: () => {
            if (state.metricsInterval) clearInterval(state.metricsInterval);
            Object.assign(state, initialState);
            state.fileIdMap = new Map();
            store.actions.initializeUser();
        },
        setMyId: (id) => { state.myId = id; },
        setCurrentFlightCode: (code) => { state.currentFlightCode = code; },
        setIsFlightCreator: (isCreator) => { state.isFlightCreator = isCreator; },
        setConnectionType: (type) => { state.connectionType = type; },
        setPeerInfo: (peer) => { state.peerInfo = peer; },
        clearPeerInfo: () => { state.peerInfo = null; },
        setLastNetworkUsers: (users) => { state.lastNetworkUsers = users; },

        addFilesToQueue: (files) => {
            state.fileToSendQueue.push(...Array.from(files));
        },
        setCurrentlySendingFile: (file) => { state.currentlySendingFile = file; },

        /**
         * Atomically completes the current file transfer.
         * It clears the "currently sending" slot, removes the file from the queue,
         * AND crucially removes it from the ID map to prevent re-addition.
         * @param {File} completedFile The file object that has finished sending.
         */
        finishCurrentFileSend: (completedFile) => {
            if (!completedFile) return;
            state.currentlySendingFile = null;
            if (state.fileToSendQueue.length > 0 && state.fileToSendQueue[0] === completedFile) {
                state.fileToSendQueue.shift();
            }
            state.fileIdMap.delete(completedFile);
        },

        removeFileFromQueue: (fileId) => {
            let fileToRemove = null;
            for (const [file, id] of state.fileIdMap.entries()) {
                if (id === fileId) {
                    fileToRemove = file;
                    break;
                }
            }
            if (fileToRemove) {
                state.fileToSendQueue = state.fileToSendQueue.filter(f => f !== fileToRemove);
                state.fileIdMap.delete(fileToRemove);
                console.log(`Removed ${fileToRemove.name} from the send queue.`);
            }
        },

        reorderQueueByDom: (idArray) => {
            const { fileIdMap } = state;
            const idToFileMap = new Map();
            for (const [file, id] of fileIdMap.entries()) {
                idToFileMap.set(id, file);
            }
            const newQueue = idArray.map(id => idToFileMap.get(id)).filter(Boolean);
            const currentlySendingFile = state.currentlySendingFile;
            if (currentlySendingFile && !newQueue.includes(currentlySendingFile)) {
                newQueue.unshift(currentlySendingFile);
            }
            state.fileToSendQueue = newQueue;
            console.log("Reordered send queue:", state.fileToSendQueue.map(f => f.name));
        },

        addFileIdMapping: (file, id) => { state.fileIdMap.set(file, id); },
        getFileId: (file) => { return state.fileIdMap.get(file); },

        addReceivedFile: (file) => { state.receivedFiles.push(file); },
        clearReceivedFiles: () => { state.receivedFiles = []; },

        setMetricsInterval: (interval) => { state.metricsInterval = interval; },
        updateMetricsOnSend: (chunkSize) => {
            state.totalBytesSent += chunkSize;
            state.sentInInterval += chunkSize;
        },
        updateMetricsOnReceive: (chunkSize) => {
            state.totalBytesReceived += chunkSize;
            state.receivedInInterval += chunkSize;
        },
        resetIntervalMetrics: (time) => {
            state.lastMetricsUpdateTime = time;
            state.sentInInterval = 0;
            state.receivedInInterval = 0;
        },
        setHasScrolledForSend: (value) => { state.hasScrolledForSend = value; },
        setHasScrolledForReceive: (value) => { state.hasScrolledForReceive = value; }
    }
};