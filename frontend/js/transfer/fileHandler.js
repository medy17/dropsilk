// js/transfer/fileHandler.js
// Contains the core logic for file transfers, including queueing, chunking, and handling selections.
import { store } from '../state.js';
import { showToast } from '../utils/toast.js';
import { sendData, getBufferedAmount } from '../network/webrtc.js';
import { HIGH_WATER_MARK } from '../config.js';
import { uiElements } from '../ui/dom.js';
import { getFileIcon } from '../utils/helpers.js';
import { updateReceiverActions, checkQueueOverflow } from '../ui/view.js';
import { isPreviewable } from '../preview/previewConfig.js';
import { showPreview } from '../preview/previewManager.js';

let worker;
let chunkQueue = [];
let fileReadingDone = false;
let sentOffset = 0;

let incomingFileInfo = null;
let incomingFileData = [];
let incomingFileReceived = 0;

export function cancelFileSend(fileId) {
    const element = document.getElementById(fileId);
    if (element) {
        element.remove();
    }

    const state = store.getState();
    const currentlySendingFile = state.currentlySendingFile;
    const currentFileId = currentlySendingFile ? store.actions.getFileId(currentlySendingFile) : null;

    if (fileId === currentFileId) {
        // The file is actively being sent
        console.log("Cancelling active transfer:", currentlySendingFile.name);
        if (worker) {
            worker.terminate();
            worker = null;
        }
        chunkQueue = [];
        fileReadingDone = false;
        sentOffset = 0;
        store.actions.setCurrentlySendingFile(null);
        store.actions.removeFirstFileFromQueue();
        processFileToSendQueue();
    } else {
        // The file is in the queue but not actively sending
        store.actions.removeFileFromQueue(fileId);
    }
    checkQueueOverflow('sending-queue');
}

export function handleFileSelection(files) {
    if (files.length === 0) return;
    const isFirstSend = store.getState().fileToSendQueue.length === 0;
    store.actions.addFilesToQueue(files);

    if (uiElements.sendingQueueDiv.querySelector('.empty-state')) {
        uiElements.sendingQueueDiv.innerHTML = '';
    }

    Array.from(files).forEach(file => {
        const fileId = `send-${Date.now()}-${Math.random()}`;
        store.actions.addFileIdMapping(file, fileId);

        // This `draggable="true"` is essential for SortableJS to work correctly.
        uiElements.sendingQueueDiv.insertAdjacentHTML('beforeend', `
            <div class="queue-item" id="${fileId}" draggable="true">
                <div class="drag-handle" title="Drag to reorder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-3 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                    </svg>
                </div>
                <div class="file-icon">${getFileIcon(file.name)}</div>
                <div class="file-details">
                    <div class="file-details__name" title="${file.name}"><span>${file.name}</span></div>
                    <div class="file-details__status"><span class="status-text">Queued</span></div>
                </div>
                <div class="file-action">
                    <button class="file-action-btn cancel-file-btn" data-file-id="${fileId}" title="Cancel transfer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>
                    </button>
                </div>
            </div>`);
    });


    if (isFirstSend && !store.getState().hasScrolledForSend) {
        uiElements.sendingQueueDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        store.actions.setHasScrolledForSend(true);
    }
    checkQueueOverflow('sending-queue');

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
        const nextFile = state.fileToSendQueue[0];
        startFileSend(nextFile);
    }
}

function startFileSend(file) {
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
            fileElement.classList.remove('is-sending');
            fileElement.querySelector('.status-text').textContent = 'Sent!';
            fileElement.querySelector('.percent').textContent = `100%`;
            const cancelButton = fileElement.querySelector('.cancel-file-btn');
            if (cancelButton) cancelButton.remove();
        }

        store.actions.setCurrentlySendingFile(null);
        store.actions.removeFirstFileFromQueue();
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
            const isFirstReceivedFile = store.getState().receivedFiles.length === 0;

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

            if (isFirstReceivedFile && !store.getState().hasScrolledForReceive) {
                uiElements.receiverQueueDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                store.actions.setHasScrolledForReceive(true);
            }
            checkQueueOverflow('receiver-queue');

            return;
        }
        if (data === "EOF") { // End of File
            const receivedBlob = new Blob(incomingFileData, { type: incomingFileInfo.type });
            const finalFileInfo = { ...incomingFileInfo };

            store.actions.addReceivedFile({ name: finalFileInfo.name, blob: receivedBlob });
            updateReceiverActions();

            const fileId = store.actions.getFileId(finalFileInfo.name);
            const fileElement = document.getElementById(fileId);

            if (fileElement) {
                const actionContainer = fileElement.querySelector('.file-action');

                const downloadIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>`;
                const previewIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>`;

                const fileExtension = finalFileInfo.name.toLowerCase().split('.').pop();
                const isVideo = finalFileInfo.type.startsWith('video/') ||
                    (['mkv'].includes(fileExtension) && !finalFileInfo.type.startsWith('text/')) ||
                    (fileExtension === 'ts' && finalFileInfo.type === 'video/mp2t');
                const isStandardImage = finalFileInfo.type.startsWith('image/');
                const canPreviewByExt = isPreviewable(finalFileInfo.name);
                const canPreview = isStandardImage || canPreviewByExt;

                let buttonsHTML = '';
                if (isVideo && window.videoPlayer) {
                    buttonsHTML += `<button class="file-action-btn preview-btn" data-preview-type="video" title="Preview Video">${previewIconSVG}</button>`;
                } else if (canPreview) {
                    buttonsHTML += `<button class="file-action-btn preview-btn" data-preview-type="generic" title="Preview File">${previewIconSVG}</button>`;
                }
                buttonsHTML += `<a href="${URL.createObjectURL(receivedBlob)}" download="${finalFileInfo.name}" class="file-action-btn save-btn" title="Save">${downloadIconSVG}</a>`;
                actionContainer.innerHTML = `<div class="file-action-group">${buttonsHTML}</div>`;

                const previewBtn = actionContainer.querySelector('.preview-btn');
                if (previewBtn) {
                    const previewType = previewBtn.dataset.previewType;
                    if (previewType === 'video') {
                        previewBtn.onclick = () => window.videoPlayer.open(receivedBlob, finalFileInfo.name);
                    } else if (previewType === 'generic') {
                        previewBtn.onclick = () => showPreview(finalFileInfo.name);
                    }
                }

                fileElement.querySelector('.percent').textContent = 'Complete!';
            }
            incomingFileInfo = null;
            return;
        }
    }

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