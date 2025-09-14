// js/state.js
// Manages the application's global state.

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
    onboardingState: {
        welcome: false, // Has the user seen the initial welcome message?
        invite: false,  // Has the user seen the "now invite someone" message?
    },
    invitationPending: false, // Is there currently an invitation toast visible?
};

let state = { ...initialState };

export const store = {
    getState: () => ({ ...state }),

    actions: {
        initializeUser: () => {
            state.myName = generateRandomName();
            // Load onboarding state from localStorage
            const savedOnboardingState = localStorage.getItem('dropsilk-onboarding');
            if (savedOnboardingState) {
                try {
                    // Merge saved state with initial state to handle new properties
                    const parsedState = JSON.parse(savedOnboardingState);
                    state.onboardingState = { ...initialState.onboardingState, ...parsedState };
                } catch (e) {
                    console.error("Could not parse saved onboarding state.");
                }
            }
        },
        resetState: () => {
            if (state.metricsInterval) clearInterval(state.metricsInterval);
            const savedOnboardingState = state.onboardingState; // Preserve onboarding state on reset
            Object.assign(state, initialState);
            state.onboardingState = savedOnboardingState;
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
        setHasScrolledForReceive: (value) => { state.hasScrolledForReceive = value; },
        updateOnboardingState: (step) => {
            if (state.onboardingState.hasOwnProperty(step)) {
                state.onboardingState[step] = true;
                localStorage.setItem('dropsilk-onboarding', JSON.stringify(state.onboardingState));
            }
        },
        setInvitationPending: (isPending) => { state.invitationPending = isPending; },
    }
};