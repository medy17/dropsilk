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
import { audioManager } from '../utils/audioManager.js';

let worker;
let chunkQueue = [];
let fileReadingDone = false;
let sentOffset = 0;
let lastSendProgressUpdate = 0; // For throttling UI updates

let incomingFileInfo = null;
let incomingFileData = [];
let incomingFileReceived = 0;
let lastReceiveProgressUpdate = 0; // For throttling UI updates

// State variables for audio cues
let isNewBatch = true;
let receiveCompletionTimer = null;
let queueStartSoundTimeout = null; // To manage the "start" sound timing

export function ensureQueueIsActive() {
    const state = store.getState();
    if (state.peerInfo && !state.currentlySendingFile && state.fileToSendQueue.length > 0) {
        const nextFile = state.fileToSendQueue[0];
        startFileSend(nextFile);
    }
}

export function cancelFileSend(fileId) {
    const element = document.getElementById(fileId);
    if (element) {
        element.remove();
    }

    const state = store.getState();
    const currentlySendingFile = state.currentlySendingFile;
    const currentFileId = currentlySendingFile ? store.actions.getFileId(currentlySendingFile) : null;

    if (fileId === currentFileId) {
        console.log("Cancelling active transfer:", currentlySendingFile.name);
        if (worker) {
            worker.terminate();
            worker = null;
        }
        chunkQueue = [];
        fileReadingDone = false;
        sentOffset = 0;
        lastSendProgressUpdate = 0; // Reset throttle timer on cancel
        store.actions.finishCurrentFileSend(currentlySendingFile);
    } else {
        store.actions.removeFileFromQueue(fileId);
    }

    checkQueueOverflow('sending-queue');

    ensureQueueIsActive();
}

export function handleFileSelection(files) {
    if (files.length === 0) return;
    const isFirstSend = store.getState().fileToSendQueue.length === 0;
    store.actions.addFilesToQueue(files);

    if (uiElements.sendingQueueDiv.querySelector('.empty-state')) {
        uiElements.sendingQueueDiv.innerHTML = '';
    }

    const fragment = document.createDocumentFragment();

    Array.from(files).forEach(file => {
        const fileId = `send-${Date.now()}-${Math.random()}`;
        store.actions.addFileIdMapping(file, fileId);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `
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
            </div>`;
        fragment.appendChild(tempDiv.firstElementChild);
    });

    uiElements.sendingQueueDiv.appendChild(fragment);

    if (isFirstSend && !store.getState().hasScrolledForSend) {
        uiElements.sendingQueueDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        store.actions.setHasScrolledForSend(true);
    }
    checkQueueOverflow('sending-queue');

    ensureQueueIsActive();
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

function startFileSend(file) {
    // Schedule the queue_start sound instead of playing it immediately
    if (isNewBatch) {
        // Clear any previously lingering timeout to be safe
        if (queueStartSoundTimeout) clearTimeout(queueStartSoundTimeout);

        // Schedule the sound to play after a short delay. If the transfer finishes
        // before this, we will cancel it. 0.5-2s is a good delay.
        queueStartSoundTimeout = setTimeout(() => {
            audioManager.play('queue_start');
            queueStartSoundTimeout = null; // Clear the handle once it has run
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
    const customChunkSize = parseInt(localStorage.getItem('dropsilk-chunk-size'), 10) || null;
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
        if (now - lastSendProgressUpdate > 100) { // Update every 100ms
            if (fileElement) {
                const progressValue = sentOffset / file.size;
                fileElement.querySelector('progress').value = progressValue;
                fileElement.querySelector('.percent').textContent = `${Math.round(progressValue * 100)}%`;
            }
            lastSendProgressUpdate = now;
        }
    }

    if (fileReadingDone && chunkQueue.length === 0) {
        sendData("EOF");
        if (fileElement) {
            fileElement.classList.remove('is-sending');
            fileElement.querySelector('progress').value = 1; // Final update
            fileElement.querySelector('.status-text').textContent = 'Sent!';
            fileElement.querySelector('.percent').textContent = `100%`;
            const cancelButton = fileElement.querySelector('.cancel-file-btn');
            if (cancelButton) cancelButton.remove();
        }

        store.actions.finishCurrentFileSend(file);
        lastSendProgressUpdate = 0; // Reset for next file

        // Add logic to handle sound overlap
        if (store.getState().fileToSendQueue.length === 0) {
            // This is the last file in the batch.

            // If the queue_start sound is still scheduled to play (meaning the
            // transfer was very fast), cancel it so it doesn't overlap.
            if (queueStartSoundTimeout) {
                clearTimeout(queueStartSoundTimeout);
                queueStartSoundTimeout = null;
            }

            // Now, play the completion sound. This is the only sound the user
            // will hear for very fast transfers.
            audioManager.play('send_complete');
            isNewBatch = true; // Ready the flag for the next batch
        }

        ensureQueueIsActive();
    }
}

// js/transfer/fileHandler.js

export async function handleDataChannelMessage(event) {
    const data = event.data;

    if (typeof data === "string") {
        if (data.startsWith("{")) {
            // A new file is starting, so cancel any pending "complete" sound
            if (receiveCompletionTimer) {
                clearTimeout(receiveCompletionTimer);
                receiveCompletionTimer = null;
            }

            const parsedData = JSON.parse(data);

            if (parsedData.type === 'stream-ended') {
                const { hideRemoteStreamView } = await import('../ui/view.js');
                hideRemoteStreamView();
                return;
            }

            // Otherwise, it's file metadata
            incomingFileInfo = parsedData;
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
        if (data === "EOF") {
            const receivedBlob = new Blob(incomingFileData, { type: incomingFileInfo.type });

            const autoDownloadEnabled = localStorage.getItem('dropsilk-auto-download') === 'true';
            if (autoDownloadEnabled) {
                const maxSizeMB = parseFloat(localStorage.getItem('dropsilk-auto-download-max-size') || '100');
                const maxSizeBytes = maxSizeMB * 1024 * 1024;

                if (receivedBlob.size > 0 && receivedBlob.size <= maxSizeBytes) {
                    try {
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(receivedBlob);
                        link.download = incomingFileInfo.name;
                        document.body.appendChild(link); // Required for Firefox
                        link.click();
                        document.body.removeChild(link);
                        // We do not call URL.revokeObjectURL here because the object URL is
                        // still needed for the manual "Save" button in the UI.
                    } catch (e) {
                        console.error("Auto-download failed:", e);
                        showToast({
                            type: 'danger',
                            title: 'Auto-Download Failed',
                            body: 'Could not automatically save the file. Please download it manually.',
                            duration: 8000
                        });
                    }
                }
            }

            const finalFileInfo = { ...incomingFileInfo };

            store.actions.addReceivedFile({ name: finalFileInfo.name, blob: receivedBlob });
            updateReceiverActions();

            const fileId = store.actions.getFileId(finalFileInfo.name);
            const fileElement = document.getElementById(fileId);

            if (fileElement) {
                // Final UI update for the progress bar and status text
                fileElement.querySelector('progress').value = 1;
                fileElement.querySelector('.percent').textContent = 'Complete!';

                const actionContainer = fileElement.querySelector('.file-action');

                const fileExtension = finalFileInfo.name.toLowerCase().split('.').pop();
                const isVideo = finalFileInfo.type.startsWith('video/') || ['mkv', 'ts'].includes(fileExtension);
                const canPreview = isPreviewable(finalFileInfo.name);

                // Read persisted preview consent map
                let previewConsent = {};
                try {
                    previewConsent = JSON.parse(
                        localStorage.getItem('dropsilk-preview-consent') || '{}'
                    );
                } catch (_) {}

                // Step 1: Show the animated checkmark
                const checkmarkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/></svg>`;
                actionContainer.innerHTML = `<button class="file-action-btn file-action-btn--complete is-entering" disabled>${checkmarkIconSVG}</button>`;

                // Step 2: After a delay, replace the checkmark with the final action buttons
                setTimeout(() => {
                    // Ensure the file element still exists in the DOM before proceeding
                    if (!document.body.contains(fileElement)) return;

                    const downloadIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>`;
                    const previewIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>`;

                    let buttonsHTML = '';
                    if (isVideo && window.videoPlayer) {
                        buttonsHTML += `<button class="file-action-btn preview-btn" data-preview-type="video" title="Preview Video">${previewIconSVG}</button>`;
                    } else if (canPreview) {
                        let titleText = 'Preview File';
                        let disabledAttr = '';
                        // Only apply disabled state if the file is a PPTX and consent is denied.
                        if (fileExtension === 'pptx' && previewConsent?.pptx === 'deny') {
                            titleText = 'PPTX preview disabled by your privacy choice';
                            disabledAttr = 'disabled aria-disabled="true"';
                        }
                        buttonsHTML += `<button class="file-action-btn preview-btn" data-preview-type="generic" data-ext="${fileExtension}" ${disabledAttr} title="${titleText}">${previewIconSVG}</button>`;
                    }
                    buttonsHTML += `<a href="${URL.createObjectURL(receivedBlob)}" download="${finalFileInfo.name}" class="file-action-btn save-btn" title="Save">${downloadIconSVG}</a>`;

                    // Add the 'is-entering' class to the group for the pop-in animation
                    actionContainer.innerHTML = `<div class="file-action-group is-entering">${buttonsHTML}</div>`;

                    // Re-attach event listeners to the newly created buttons
                    const previewBtn = actionContainer.querySelector('.preview-btn');
                    if (previewBtn) {
                        previewBtn.onclick = () => {
                            const previewType = previewBtn.dataset.previewType;
                            if (previewType === 'video') {
                                window.videoPlayer.open(receivedBlob, finalFileInfo.name);
                            } else if (previewType === 'generic') {
                                showPreview(finalFileInfo.name);
                            }
                        };
                    }
                }, 1200); // 1.2-second delay for the checkmark to be visible
            }

            incomingFileInfo = null;
            lastReceiveProgressUpdate = 0; // Reset for next file

            // Use a timer to play the sound if no new file arrives shortly
            if (receiveCompletionTimer) clearTimeout(receiveCompletionTimer);
            receiveCompletionTimer = setTimeout(() => {
                audioManager.play('receive_complete');
                receiveCompletionTimer = null;
            }, 1500); // 1.5-second delay to wait for a potential next file

            return;
        }
    }

    const chunkSize = data.byteLength || data.size || 0;
    store.actions.updateMetricsOnReceive(chunkSize);
    incomingFileData.push(data);
    incomingFileReceived += chunkSize;
    if (incomingFileInfo?.size) {
        const now = Date.now();
        if (now - lastReceiveProgressUpdate > 100) { // Update every 100ms
            const progressValue = incomingFileReceived / incomingFileInfo.size;
            const fileId = store.actions.getFileId(incomingFileInfo.name);
            const fileElement = document.getElementById(fileId);
            if (fileElement) {
                fileElement.querySelector('progress').value = progressValue;
                fileElement.querySelector('.percent').textContent = `${Math.round(progressValue * 100)}%`;
            }
            lastReceiveProgressUpdate = now;
        }
    }
}

export function resetTransferState() {
    if (worker) worker.terminate();
    worker = null;
    chunkQueue = [];
    fileReadingDone = false;
    sentOffset = 0;
    lastSendProgressUpdate = 0;
    incomingFileInfo = null;
    incomingFileData = [];
    incomingFileReceived = 0;
    lastReceiveProgressUpdate = 0;
    store.actions.setCurrentlySendingFile(null);

    // Reset all audio cue state variables
    isNewBatch = true;
    if (receiveCompletionTimer) {
        clearTimeout(receiveCompletionTimer);
        receiveCompletionTimer = null;
    }
    if (queueStartSoundTimeout) {
        clearTimeout(queueStartSoundTimeout);
        queueStartSoundTimeout = null;
    }
}