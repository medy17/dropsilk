// src/js/transfer/sender.js
import i18next from '../i18n.js';
import { store } from '../state.js';
import { sendData, getBufferedAmount } from '../network/webrtc.js';
import { HIGH_WATER_MARK } from '../config.js';
import { getFileIcon } from '../utils/helpers.js';
import { audioManager } from '../utils/audioManager.js';

let worker;
let chunkQueue = [];
let fileReadingDone = false;
let sentOffset = 0;
let lastSendProgressUpdate = 0;

// ETR state
let transferStartTime = 0;
let lastSpeedCalcTime = 0;
let lastSpeedCalcOffset = 0;
let speedSamples = [];
const SPEED_SAMPLE_COUNT = 10;

// Sound state management
let isNewBatch = true;
let queueStartSoundTimeout = null;

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

export function resetSenderState() {
    if (worker) {
        worker.terminate();
        worker = null;
    }
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

export function cancelCurrentTransfer(file) {
    console.log('Cancelling active transfer:', file.name);
    resetSenderState();
    store.actions.finishCurrentFileSend(file);
    // Determine if we should reset batch logic based on remaining queue
    if (store.getState().fileToSendQueue.length === 0) {
        isNewBatch = true;
    }
}

function formatTimeRemaining(seconds) {
    if (!isFinite(seconds) || seconds < 0) return i18next.t('calculating');
    if (seconds < 1) return i18next.t('lessThanASecond');

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    const parts = [];
    if (hours > 0) parts.push(i18next.t('hr', { count: hours }));
    if (minutes > 0) parts.push(i18next.t('min', { count: minutes }));
    if (remainingSeconds > 0 || parts.length === 0) {
        parts.push(i18next.t('sec', { count: remainingSeconds }));
    }

    return i18next.t('timeRemaining', { time: parts.slice(0, 2).join(' ') });
}

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
        fileElement.innerHTML = `
            <div class="file-icon">${getFileIcon(file.name)}</div>
            <div class="file-details">
                <div class="file-details__name" title="${file.name}"><span>${file.name}</span></div>
                <progress class="file-details__progress-bar" value="0" max="1"></progress>
                <div class="file-details__status">
                    <span class="percent">0%</span>
                    <span class="status-text">Sending...</span>
                </div>
            </div>
            <div class="file-action">
                <button class="file-action-btn cancel-file-btn" data-file-id="${fileId}" title="Cancel transfer">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>
                </button>
            </div>`;
    }

    if (worker) worker.terminate();
    worker = new Worker('sender.worker.js');
    chunkQueue = [];
    fileReadingDone = false;
    sentOffset = 0;

    transferStartTime = Date.now();
    lastSpeedCalcTime = Date.now();
    lastSpeedCalcOffset = 0;
    speedSamples = [];

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
    const customChunkSize =
        parseInt(localStorage.getItem('dropsilk-chunk-size'), 10) || null;
    worker.postMessage({ file: file, config: { chunkSize: customChunkSize } });
}

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

                // ETR Calculation
                const elapsedSinceLastCalc = (now - lastSpeedCalcTime) / 1000;
                if (elapsedSinceLastCalc > 0.5) {
                    const bytesSinceLastCalc = sentOffset - lastSpeedCalcOffset;
                    const currentSpeed = bytesSinceLastCalc / elapsedSinceLastCalc;

                    if (isFinite(currentSpeed) && currentSpeed > 0) {
                        speedSamples.push(currentSpeed);
                        if (speedSamples.length > SPEED_SAMPLE_COUNT) {
                            speedSamples.shift();
                        }
                    }
                    lastSpeedCalcTime = now;
                    lastSpeedCalcOffset = sentOffset;
                }

                if (speedSamples.length > 0) {
                    const averageSpeed = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;
                    if (averageSpeed > 0) {
                        const bytesRemaining = file.size - sentOffset;
                        const etrSeconds = bytesRemaining / averageSpeed;
                        fileElement.querySelector('.status-text').textContent = formatTimeRemaining(etrSeconds);
                    }
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
            fileElement.querySelector('.percent').textContent = `100%`;
            const cancelButton = fileElement.querySelector('.cancel-file-btn');
            if (cancelButton) cancelButton.remove();
        }

        store.actions.finishCurrentFileSend(file);
        lastSendProgressUpdate = 0;

        if (store.getState().fileToSendQueue.length === 0) {
            // Last file in batch
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