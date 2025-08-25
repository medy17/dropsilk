// js/transfer/fileHandler.js
// Contains the core logic for file transfers, including queueing, chunking, and handling selections.

import { store } from '../state.js';
import { showToast } from '../utils/toast.js';
import { sendData, getBufferedAmount } from '../network/webrtc.js';
import { HIGH_WATER_MARK } from '../config.js';
import { uiElements } from '../ui/dom.js';
import { getFileIcon, formatBytes } from '../utils/helpers.js';
import { updateReceiverActions } from '../ui/view.js';

let worker;
let chunkQueue = [];
let fileReadingDone = false;
let sentOffset = 0;

let incomingFileInfo = null;
let incomingFileData = [];
let incomingFileReceived = 0;

export function handleFileSelection(files) {
    if (files.length === 0) return;
    store.actions.addFilesToQueue(files);

    if (uiElements.sendingQueueDiv.querySelector('.empty-state')) {
        uiElements.sendingQueueDiv.innerHTML = '';
    }

    Array.from(files).forEach(file => {
        const fileId = `send-${Date.now()}-${Math.random()}`;
        store.actions.addFileIdMapping(file, fileId);

        uiElements.sendingQueueDiv.insertAdjacentHTML('beforeend', `
            <div class="queue-item" id="${fileId}">
                <div class="file-icon">${getFileIcon(file.name)}</div>
                <div class="file-details">
                    <div class="file-details__name" title="${file.name}"><span>${file.name}</span></div>
                    <div class="file-details__status"><span class="status-text">Queued</span></div>
                </div>
            </div>`);
    });

    processFileToSendQueue();
}

export function handleFolderSelection(files) {
    const fileLimit = 50;
    const sizeLimit = 1 * 1024 * 1024 * 1024; // 1 GB

    if (files.length > fileLimit || Array.from(files).some(f => f.size > sizeLimit)) {
        showToast({
            type: 'info', title: 'Folder Selection Warning',
            body: 'Folder contains a large number of files or files over 1GB. Continue?',
            duration: 0,
            actions: [
                { text: 'Cancel', class: 'btn-secondary', callback: () => {} },
                { text: 'Continue', class: 'btn-primary', callback: () => handleFileSelection(files) }
            ]
        });
    } else {
        handleFileSelection(files);
    }
}

export function processFileToSendQueue() {
    const state = store.getState();
    if (state.fileToSendQueue.length > 0 && !state.currentlySendingFile && state.peerInfo) {
        const nextFile = store.actions.dequeueNextFile();
        startFileSend(nextFile);
    }
}

function startFileSend(file) {
    store.actions.setCurrentlySendingFile(file);
    const fileId = store.actions.getFileId(file);
    const fileElement = document.getElementById(fileId);

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

    sendData(JSON.stringify({ name: file.name, type: file.type, size: file.size }));

    worker.onmessage = (e) => {
        const { type, chunk } = e.data;
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
    worker.postMessage({ file: file });
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
        if (fileElement) {
            const progressValue = sentOffset / file.size;
            fileElement.querySelector('progress').value = progressValue;
            fileElement.querySelector('.percent').textContent = `${Math.round(progressValue * 100)}%`;
        }
    }

    if (fileReadingDone && chunkQueue.length === 0) {
        sendData("EOF");
        if (fileElement) {
            fileElement.querySelector('.status-text').textContent = 'Sent!';
            fileElement.querySelector('.percent').textContent = `100%`;
        }
        store.actions.setCurrentlySendingFile(null);
        processFileToSendQueue();
    }
}

export function handleDataChannelMessage(event) {
    const data = event.data;

    if (typeof data === "string") {
        if (data.startsWith("{")) { // Metadata
            incomingFileInfo = JSON.parse(data);
            incomingFileData = [];
            incomingFileReceived = 0;

            if (uiElements.receiverQueueDiv.querySelector('.empty-state')) {
                uiElements.receiverQueueDiv.innerHTML = '';
            }

            const fileId = `file-recv-${Date.now()}`;
            store.actions.addFileIdMapping(incomingFileInfo.name, fileId);

            uiElements.receiverQueueDiv.insertAdjacentHTML('beforeend', `
                <div class="queue-item" id="${fileId}">
                    <div class="file-icon">${getFileIcon(incomingFileInfo.name)}</div>
                    <div class="file-details">
                        <div class="file-details__name" title="${incomingFileInfo.name}"><span>${incomingFileInfo.name}</span></div>
                        <progress class="file-details__progress-bar" value="0" max="1"></progress>
                        <div class="file-details__status"><span class="percent">0%</span></div>
                    </div>
                    <div class="file-action"></div>
                </div>`);
            return;
        }
        if (data === "EOF") { // End of File
            const receivedBlob = new Blob(incomingFileData, { type: incomingFileInfo.type });
            store.actions.addReceivedFile({ name: incomingFileInfo.name, blob: receivedBlob });
            updateReceiverActions();

            const fileId = store.actions.getFileId(incomingFileInfo.name);
            const fileElement = document.getElementById(fileId);

            if (fileElement) {
                const actionContainer = fileElement.querySelector('.file-action');
                const isVideo = incomingFileInfo.type.startsWith('video/') || incomingFileInfo.name.toLowerCase().endsWith('.mkv');

                if (isVideo && window.videoPlayer) {
                    actionContainer.innerHTML = `<div class="file-action-group">
                        <button class="btn btn-secondary preview-btn">Preview</button>
                        <a href="${URL.createObjectURL(receivedBlob)}" download="${incomingFileInfo.name}" class="btn btn-primary">Save</a>
                     </div>`;
                    actionContainer.querySelector('.preview-btn').onclick = () => window.videoPlayer.open(receivedBlob, incomingFileInfo.name);
                } else {
                    actionContainer.innerHTML = `<a href="${URL.createObjectURL(receivedBlob)}" download="${incomingFileInfo.name}" class="btn btn-primary">Download</a>`;
                }
                fileElement.querySelector('.percent').textContent = 'Complete!';
            }
            incomingFileInfo = null;
            return;
        }
    }

    // Binary data chunk
    const chunkSize = data.byteLength || data.size || 0;
    store.actions.updateMetricsOnReceive(chunkSize);

    incomingFileData.push(data);
    incomingFileReceived += chunkSize;
    if (incomingFileInfo?.size) {
        const progressValue = incomingFileReceived / incomingFileInfo.size;
        const fileId = store.actions.getFileId(incomingFileInfo.name);
        const fileElement = document.getElementById(fileId);
        if (fileElement) {
            fileElement.querySelector('progress').value = progressValue;
            fileElement.querySelector('.percent').textContent = `${Math.round(progressValue * 100)}%`;
        }
    }
}

export function resetTransferState() {
    if (worker) worker.terminate();
    worker = null;
    chunkQueue = [];
    fileReadingDone = false;
    sentOffset = 0;
    incomingFileInfo = null;
    incomingFileData = [];
    incomingFileReceived = 0;
    store.actions.setCurrentlySendingFile(null);
}