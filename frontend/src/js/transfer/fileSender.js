// transfer/fileSender.js
// Handles file sending logic using a Web Worker

import { store } from '../state.js';
import { sendData, getBufferedAmount } from '../network/webrtc.js';
import { HIGH_WATER_MARK } from '../config.js';
import { audioManager } from '../utils/audioManager.js';
import { showToast } from '../utils/toast.js';
import { checkQueueOverflow } from '../ui/view.js';
import { createEtrCalculator, formatTimeRemaining } from './etrCalculator.js';
import { createSendingItemHTML } from './transferUI.js';
import i18next from '../i18n.js';

let worker = null;
let chunkQueue = [];
let fileReadingDone = false;
let sentOffset = 0;
let lastSendProgressUpdate = 0;
let etrCalc = createEtrCalculator();
let activeSendToken = 0;
let activeReadSessionId = null;

// Audio cue state
let isNewBatch = true;
let queueStartSoundTimeout = null;

function getConfiguredChunkSize() {
    return parseInt(localStorage.getItem('dropsilk-chunk-size'), 10) || null;
}

function isElectronPathBackedFile(file) {
    return Boolean(
        window.electronAPI?.startReadSession &&
        window.electronAPI?.readFileChunk &&
        window.electronAPI?.closeReadSession &&
        file &&
        typeof file.path === 'string' &&
        Number.isFinite(file.size),
    );
}

function resetActiveTransferState() {
    chunkQueue = [];
    fileReadingDone = false;
    sentOffset = 0;
    lastSendProgressUpdate = 0;
    etrCalc.reset();
}

async function closeActiveReadSession(sessionId = activeReadSessionId) {
    if (!sessionId || !window.electronAPI?.closeReadSession) {
        return;
    }

    if (sessionId === activeReadSessionId) {
        activeReadSessionId = null;
    }

    try {
        await window.electronAPI.closeReadSession(sessionId);
    } catch (error) {
        console.error('Failed to close Electron read session:', error);
    }
}

function stopActiveReaders() {
    activeSendToken += 1;

    if (worker) {
        worker.terminate();
        worker = null;
    }

    const sessionId = activeReadSessionId;
    activeReadSessionId = null;
    void closeActiveReadSession(sessionId);

    resetActiveTransferState();
}

function updateSendProgressUI(file, fileElement) {
    const now = Date.now();
    if (now - lastSendProgressUpdate <= 100) {
        return;
    }

    if (fileElement) {
        const progressValue = sentOffset / file.size;
        fileElement.querySelector('progress').value = progressValue;
        fileElement.querySelector('.percent').textContent = `${Math.round(progressValue * 100)}%`;

        etrCalc.update(sentOffset);
        const etr = etrCalc.getETR(file.size, sentOffset);
        if (etr !== null) {
            const statusEl = fileElement.querySelector('.status-text');
            if (statusEl) statusEl.textContent = formatTimeRemaining(etr);
        }
    }

    lastSendProgressUpdate = now;
}

function finalizeCurrentSend(file, fileElement) {
    sendData('EOF');

    if (fileElement) {
        fileElement.classList.remove('is-sending');
        fileElement.querySelector('progress').value = 1;
        fileElement.querySelector('.status-text').textContent = i18next.t('sentStatus', 'Sent!');
        fileElement.querySelector('.percent').textContent = '100%';
        const cancelButton = fileElement.querySelector('.cancel-file-btn');
        if (cancelButton) cancelButton.remove();
    }

    store.actions.finishCurrentFileSend(file);
    lastSendProgressUpdate = 0;

    if (store.getState().fileToSendQueue.length === 0) {
        if (queueStartSoundTimeout) {
            clearTimeout(queueStartSoundTimeout);
            queueStartSoundTimeout = null;
        }
        audioManager.play('send_complete');
        isNewBatch = true;
    }

    ensureQueueIsActive();
}

async function waitForBufferCapacity(sendToken) {
    while (
        sendToken === activeSendToken &&
        getBufferedAmount() > HIGH_WATER_MARK
    ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

async function sendElectronFile(file, fileElement, sendToken) {
    const chunkSize = getConfiguredChunkSize() || 262144;
    let sessionId = null;

    try {
        sessionId = await window.electronAPI.startReadSession(file.path);

        if (sendToken !== activeSendToken || store.getState().currentlySendingFile !== file) {
            await closeActiveReadSession(sessionId);
            return;
        }

        activeReadSessionId = sessionId;

        while (sentOffset < file.size) {
            await waitForBufferCapacity(sendToken);

            if (sendToken !== activeSendToken || store.getState().currentlySendingFile !== file) {
                return;
            }

            const remainingBytes = Math.min(chunkSize, file.size - sentOffset);
            const chunk = await window.electronAPI.readFileChunk({
                sessionId,
                offset: sentOffset,
                length: remainingBytes,
            });

            if (sendToken !== activeSendToken || store.getState().currentlySendingFile !== file) {
                return;
            }

            const chunkSizeRead = chunk?.byteLength || 0;
            if (chunkSizeRead === 0 && remainingBytes > 0) {
                throw new Error(`Unexpected EOF while reading ${file.name}.`);
            }

            sendData(chunk);
            store.actions.updateMetricsOnSend(chunkSizeRead);
            sentOffset += chunkSizeRead;
            updateSendProgressUI(file, fileElement);
        }

        if (sendToken === activeSendToken && store.getState().currentlySendingFile === file) {
            finalizeCurrentSend(file, fileElement);
        }
    } catch (error) {
        if (sendToken !== activeSendToken || store.getState().currentlySendingFile !== file) {
            return;
        }

        console.error(`Failed to send Electron file "${file.name}":`, error);
        showToast({
            type: 'danger',
            title: 'File read failed',
            body: `Could not read "${file.name}" from disk.`,
            duration: 5000,
        });
        store.actions.finishCurrentFileSend(file);
        ensureQueueIsActive();
    } finally {
        if (sessionId) {
            await closeActiveReadSession(sessionId);
        }
    }
}

/**
 * Checks if the queue has files to send and starts the next transfer
 */
export function ensureQueueIsActive() {
    const state = store.getState();
    if (
        state.peerInfo &&
        !state.currentlySendingFile &&
        state.fileToSendQueue.length > 0
    ) {
        const nextFile = state.fileToSendQueue[0];
        startFileSend(nextFile);
    }
}

/**
 * Cancels an active or queued file send
 * @param {string} fileId - The file's DOM ID
 */
export function cancelFileSend(fileId) {
    const element = document.getElementById(fileId);
    if (element) element.remove();

    const state = store.getState();
    const currentlySendingFile = state.currentlySendingFile;
    const currentFileId = currentlySendingFile
        ? store.actions.getFileId(currentlySendingFile)
        : null;

    if (fileId === currentFileId) {
        console.log('Cancelling active transfer:', currentlySendingFile.name);
        stopActiveReaders();
        store.actions.finishCurrentFileSend(currentlySendingFile);
    } else {
        store.actions.removeFileFromQueue(fileId);
    }

    checkQueueOverflow('sending-queue');
    ensureQueueIsActive();
}

/**
 * Starts sending a file using a Web Worker or Electron chunked reads.
 * @param {File|Object} file - The file-like object to send
 */
function startFileSend(file) {
    // Schedule the queue_start sound
    if (isNewBatch) {
        if (queueStartSoundTimeout) clearTimeout(queueStartSoundTimeout);
        queueStartSoundTimeout = setTimeout(() => {
            audioManager.play('queue_start');
            queueStartSoundTimeout = null;
        }, 800);
        isNewBatch = false;
    }

    store.actions.setCurrentlySendingFile(file);
    const fileId = store.actions.getFileId(file);
    const fileElement = document.getElementById(fileId);

    if (fileElement) {
        fileElement.classList.add('is-sending');
        fileElement.innerHTML = createSendingItemHTML(file, fileId);
    }

    stopActiveReaders();
    const sendToken = activeSendToken;

    // Send file metadata to peer
    sendData(JSON.stringify({ name: file.name, type: file.type, size: file.size }));

    if (isElectronPathBackedFile(file)) {
        void sendElectronFile(file, fileElement, sendToken);
        return;
    }

    worker = new Worker('sender.worker.js');

    worker.onmessage = (e) => {
        const { type, chunk } = e.data;
        if (type === 'chunk') {
            chunkQueue.push(chunk);
            drainQueue();
        } else if (type === 'done') {
            fileReadingDone = true;
            worker.terminate();
            worker = null;
            drainQueue();
        }
    };

    const customChunkSize = getConfiguredChunkSize();
    worker.postMessage({ file: file, config: { chunkSize: customChunkSize } });
}

/**
 * Drains the chunk queue, sending data while buffer allows
 */
export function drainQueue() {
    const file = store.getState().currentlySendingFile;
    if (!file) return;

    const fileId = store.actions.getFileId(file);
    const fileElement = document.getElementById(fileId);

    while (chunkQueue.length > 0) {
        if (getBufferedAmount() > HIGH_WATER_MARK) return;

        const chunk = chunkQueue.shift();
        sendData(chunk);

        const chunkSize = chunk.byteLength;
        store.actions.updateMetricsOnSend(chunkSize);
        sentOffset += chunkSize;
        updateSendProgressUI(file, fileElement);
    }

    if (fileReadingDone && chunkQueue.length === 0) {
        finalizeCurrentSend(file, fileElement);
    }
}

/**
 * Resets all sender state
 */
export function resetSenderState() {
    stopActiveReaders();
    isNewBatch = true;
    if (queueStartSoundTimeout) {
        clearTimeout(queueStartSoundTimeout);
        queueStartSoundTimeout = null;
    }
    store.actions.setCurrentlySendingFile(null);
}
