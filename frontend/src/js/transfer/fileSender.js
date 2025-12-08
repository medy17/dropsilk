// transfer/fileSender.js
// Handles file sending logic using a Web Worker

import { store } from '../state.js';
import { sendData, getBufferedAmount } from '../network/webrtc.js';
import { HIGH_WATER_MARK } from '../config.js';
import { audioManager } from '../utils/audioManager.js';
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

// Audio cue state
let isNewBatch = true;
let queueStartSoundTimeout = null;

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
        if (worker) {
            worker.terminate();
            worker = null;
        }
        chunkQueue = [];
        fileReadingDone = false;
        sentOffset = 0;
        lastSendProgressUpdate = 0;
        store.actions.finishCurrentFileSend(currentlySendingFile);
    } else {
        store.actions.removeFileFromQueue(fileId);
    }

    checkQueueOverflow('sending-queue');
    ensureQueueIsActive();
}

/**
 * Starts sending a file using a Web Worker
 * @param {File} file - The file to send
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

    // Reset state
    if (worker) worker.terminate();
    worker = new Worker('sender.worker.js');
    chunkQueue = [];
    fileReadingDone = false;
    sentOffset = 0;
    etrCalc.reset();

    // Send file metadata to peer
    sendData(JSON.stringify({ name: file.name, type: file.type, size: file.size }));

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

    const customChunkSize = parseInt(localStorage.getItem('dropsilk-chunk-size'), 10) || null;
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

        const now = Date.now();
        if (now - lastSendProgressUpdate > 100) {
            if (fileElement) {
                const progressValue = sentOffset / file.size;
                fileElement.querySelector('progress').value = progressValue;
                fileElement.querySelector('.percent').textContent = `${Math.round(progressValue * 100)}%`;

                // Update ETR
                etrCalc.update(sentOffset);
                const etr = etrCalc.getETR(file.size, sentOffset);
                if (etr !== null) {
                    const statusEl = fileElement.querySelector('.status-text');
                    if (statusEl) statusEl.textContent = formatTimeRemaining(etr);
                }
            }
            lastSendProgressUpdate = now;
        }
    }

    if (fileReadingDone && chunkQueue.length === 0) {
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

        // Handle batch completion sound
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
}

/**
 * Resets all sender state
 */
export function resetSenderState() {
    if (worker) worker.terminate();
    worker = null;
    chunkQueue = [];
    fileReadingDone = false;
    sentOffset = 0;
    lastSendProgressUpdate = 0;
    isNewBatch = true;
    if (queueStartSoundTimeout) {
        clearTimeout(queueStartSoundTimeout);
        queueStartSoundTimeout = null;
    }
    store.actions.setCurrentlySendingFile(null);
}
