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

// We don't need listeners for this simple refactor.
// The `view.js` will manually re-render when needed.

export const store = {
    getState: () => ({ ...state }),

    // ACTIONS: Functions that are allowed to modify the state.
    // This is a more direct mutation approach, mirroring the original script.
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

        // REMOVED: This action was the source of the bug.
        // dequeueNextFile: () => { return state.fileToSendQueue.shift(); },

        // NEW: This action removes the top file from the queue after it's sent/cancelled.
        removeFirstFileFromQueue: () => {
            if (state.fileToSendQueue.length > 0) {
                state.fileToSendQueue.shift();
            }
        },

        removeFileFromQueue: (fileId) => {
            let fileToRemove = null;
            // Find the file object associated with the DOM ID
            for (const [file, id] of state.fileIdMap.entries()) {
                if (id === fileId) {
                    fileToRemove = file;
                    break;
                }
            }

            if (fileToRemove) {
                // Filter it out of the queue
                state.fileToSendQueue = state.fileToSendQueue.filter(f => f !== fileToRemove);
                // Remove it from the ID map to prevent memory leaks
                state.fileIdMap.delete(fileToRemove);
                console.log(`Removed ${fileToRemove.name} from the send queue.`);
            }
        },

        // NEW ACTION: Reorders the file queue based on drag-and-drop
        reorderFileToSendQueue: (draggedId, targetId) => {
            let draggedFile = null;
            let targetFile = null;
            const { fileIdMap, fileToSendQueue } = state;

            // Find the actual File objects from the map
            for (const [file, id] of fileIdMap.entries()) {
                if (id === draggedId) draggedFile = file;
                if (id === targetId) targetFile = file;
            }

            if (!draggedFile) return;

            // Create a new queue without the dragged file
            const newQueue = fileToSendQueue.filter(f => f !== draggedFile);

            if (targetId) { // If dropped before a specific target
                const targetIndex = newQueue.indexOf(targetFile);
                if (targetIndex !== -1) {
                    newQueue.splice(targetIndex, 0, draggedFile);
                } else { // Fallback if target not found (should not happen)
                    newQueue.push(draggedFile);
                }
            } else { // If dropped at the end of the list
                newQueue.push(draggedFile);
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