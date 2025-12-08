// src/js/transfer/receiver.js
import i18next from '../i18n.js';
import { store } from '../state.js';
import { showToast } from '../utils/toast.js';
import { uiElements } from '../ui/dom.js';
import { OPFS_THRESHOLD } from '../config.js';
import { getFileIcon } from '../utils/helpers.js';
import {
    updateReceiverActions,
    checkQueueOverflow,
} from '../ui/view.js';
import { appendChatMessage } from '../ui/chat.js';
import { isPreviewable } from '../preview/previewConfig.js';
import { showPreview } from '../preview/previewManager.js';
import { audioManager } from '../utils/audioManager.js';
import { isExecutable } from '../utils/security.js';

// OPFS & Transfer State
const opfsState = new Map();
let incomingFileInfo = null;
let incomingFileData = [];
let incomingFileReceived = 0;
let lastReceiveProgressUpdate = 0;

// ETR calculation state
let incomingTransferStartTime = 0;
let lastIncomingSpeedCalcTime = 0;
let lastIncomingSpeedCalcOffset = 0;
let incomingSpeedSamples = [];
const SPEED_SAMPLE_COUNT = 10;

let batchExecutableCount = 0;
let receiveCompletionTimer = null;

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

export function resetReceiverState() {
    incomingFileInfo = null;
    incomingFileData = [];
    incomingFileReceived = 0;
    lastReceiveProgressUpdate = 0;
    if (receiveCompletionTimer) {
        clearTimeout(receiveCompletionTimer);
        receiveCompletionTimer = null;
    }
    batchExecutableCount = 0;

    // Clear OPFS storage on reset
    if (!!navigator.storage?.getDirectory) {
        (async () => {
            try {
                const root = await navigator.storage.getDirectory();
                for await (const key of root.keys()) {
                    await root.removeEntry(key);
                }
                for (const [key, value] of opfsState.entries()) {
                    if (value.writer) {
                        await value.writer
                            .close()
                            .catch((e) => console.error('Error closing writer on reset:', e));
                    }
                    opfsState.delete(key);
                }
            } catch (e) {
                console.error('Could not clear OPFS on reset:', e);
            }
        })();
    }
}

function updateSuspiciousGroupings() {
    const queue = document.getElementById('receiver-queue');
    if (!queue) return;
    const items = Array.from(queue.querySelectorAll('.queue-item'));

    items.forEach((item, index) => {
        if (!item.classList.contains('is-suspicious')) return;
        item.classList.remove('suspicious-single', 'suspicious-start', 'suspicious-middle', 'suspicious-end');

        const prev = items[index - 1];
        const next = items[index + 1];
        const isPrevSuspicious = prev && prev.classList.contains('is-suspicious');
        const isNextSuspicious = next && next.classList.contains('is-suspicious');

        if (!isPrevSuspicious && !isNextSuspicious) item.classList.add('suspicious-single');
        else if (!isPrevSuspicious && isNextSuspicious) item.classList.add('suspicious-start');
        else if (isPrevSuspicious && isNextSuspicious) item.classList.add('suspicious-middle');
        else if (isPrevSuspicious && !isNextSuspicious) item.classList.add('suspicious-end');
    });
}

export async function handleDataChannelMessage(event) {
    const data = event.data;

    if (typeof data === 'string') {
        if (data.startsWith('{')) {
            const parsedData = JSON.parse(data);

            if (parsedData.type === 'stream-ended') {
                const { hideRemoteStreamView } = await import('../ui/view.js');
                hideRemoteStreamView();
                return;
            }

            if (parsedData.kind === 'chat') {
                appendChatMessage({
                    author: 'peer',
                    text: parsedData.text || '',
                    timestamp: parsedData.sentAt || Date.now(),
                });
                return;
            }

            // Start of a new file transfer
            if (receiveCompletionTimer) {
                clearTimeout(receiveCompletionTimer);
                receiveCompletionTimer = null;
            }

            incomingFileInfo = parsedData;
            incomingFileData = [];
            incomingFileReceived = 0;
            incomingTransferStartTime = Date.now();
            lastIncomingSpeedCalcTime = Date.now();
            lastIncomingSpeedCalcOffset = 0;
            incomingSpeedSamples = [];

            const useOpfs =
                localStorage.getItem('dropsilk-use-opfs-buffer') === 'true' &&
                incomingFileInfo.size > OPFS_THRESHOLD &&
                !!navigator.storage?.getDirectory;

            if (useOpfs) {
                try {
                    const root = await navigator.storage.getDirectory();
                    for await (const key of root.keys()) await root.removeEntry(key);
                    const fileHandle = await root.getFileHandle(incomingFileInfo.name, { create: true });
                    const writer = await fileHandle.createWritable();
                    opfsState.set(incomingFileInfo.name, { writer, fileHandle });
                } catch (error) {
                    console.error('OPFS setup failed, falling back to memory.', error);
                    showToast({
                        type: 'danger',
                        title: i18next.t('opfsError'),
                        body: i18next.t('opfsErrorDescription'),
                        duration: 8000,
                    });
                    opfsState.delete(incomingFileInfo.name);
                }
            }

            const isFirstReceivedFile = store.getState().receivedFiles.length === 0;
            if (uiElements.receiverQueueDiv.querySelector('.empty-state')) {
                uiElements.receiverQueueDiv.innerHTML = '';
            }

            const fileId = `file-recv-${Date.now()}`;
            store.actions.addFileIdMapping(incomingFileInfo.name, fileId);

            uiElements.receiverQueueDiv.insertAdjacentHTML(
                'beforeend',
                `
                <div class="queue-item" id="${fileId}">
                    <div class="file-icon">${getFileIcon(incomingFileInfo.name)}</div>
                        <div class="file-details">
                        <div class="file-details__name" title="${incomingFileInfo.name}"><span>${incomingFileInfo.name}</span></div>
                            <progress class="file-details__progress-bar" value="0" max="1"></progress>
                            <div class="file-details__status">
                                <span class="percent">0%</span>
                                <span class="status-text">${i18next.t('receiving', 'Receiving...')}</span>
                            </div>
                        </div>
                    <div class="file-action"></div>
                </div>`,
            );

            if (isFirstReceivedFile && !store.getState().hasScrolledForReceive) {
                uiElements.receiverQueueDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                store.actions.setHasScrolledForReceive(true);
            }
            checkQueueOverflow('receiver-queue');
            return;
        }

        if (data === 'EOF') {
            // End of current file transfer
            let receivedBlob;
            const opfsFile = opfsState.get(incomingFileInfo.name);

            if (opfsFile) {
                try {
                    await opfsFile.writer.close();
                    receivedBlob = await opfsFile.fileHandle.getFile();
                } catch (e) {
                    console.error('Failed to finalize OPFS file:', e);
                    showToast({
                        type: 'danger',
                        title: i18next.t('fileSaveError'),
                        body: i18next.t('fileSaveErrorDescription'),
                        duration: 8000,
                    });
                    opfsState.delete(incomingFileInfo.name);
                    return;
                }
                opfsState.delete(incomingFileInfo.name);
            } else {
                receivedBlob = new Blob(incomingFileData, { type: incomingFileInfo.type });
            }

            const finalFileInfo = { ...incomingFileInfo };
            const isDangerous = isExecutable(finalFileInfo.name);
            console.log(`[Receiver] Processing "${finalFileInfo.name}" - Dangerous? ${isDangerous}`);

            if (isDangerous) batchExecutableCount++;

            // Auto-Download Logic
            const autoDownloadEnabled = localStorage.getItem('dropsilk-auto-download') === 'true';
            if (autoDownloadEnabled && !isDangerous) {
                const maxSizeMB = parseFloat(localStorage.getItem('dropsilk-auto-download-max-size') || '100');
                if (receivedBlob.size > 0 && receivedBlob.size <= maxSizeMB * 1024 * 1024) {
                    try {
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(receivedBlob);
                        link.download = incomingFileInfo.name;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    } catch (e) { console.error('Auto-download failed:', e); }
                }
            }

            store.actions.addReceivedFile({ name: finalFileInfo.name, blob: receivedBlob });
            updateReceiverActions();

            // UI Finalization
            const fileId = store.actions.getFileId(finalFileInfo.name);
            const fileElement = document.getElementById(fileId);

            if (fileElement) {
                fileElement.querySelector('progress').value = 1;
                fileElement.querySelector('.percent').textContent = '100%';
                const statusTextElement = fileElement.querySelector('.status-text');

                if (statusTextElement) {
                    if (isDangerous) {
                        statusTextElement.innerHTML = `
                            <span class="warning-badge">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                                  <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>
                                </svg>
                                Executable
                            </span>`;
                        statusTextElement.style.color = '';
                        fileElement.classList.add('is-suspicious');
                        updateSuspiciousGroupings();
                    } else {
                        statusTextElement.textContent = i18next.t('completeStatus', 'Complete!');
                    }
                }

                const actionContainer = fileElement.querySelector('.file-action');
                const fileExtension = finalFileInfo.name.toLowerCase().split('.').pop();
                const isVideo = finalFileInfo.type.startsWith('video/') || ['mp4', 'mov', 'mkv', 'webm', 'ts', 'm4v', 'avi'].includes(fileExtension);
                const canPreview = isPreviewable(finalFileInfo.name);

                let previewConsent = {};
                try { previewConsent = JSON.parse(localStorage.getItem('dropsilk-preview-consent') || '{}'); } catch (_) {}

                // Temporary checkmark
                actionContainer.innerHTML = `<button class="file-action-btn file-action-btn--complete is-entering" disabled>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/></svg>
                </button>`;

                setTimeout(() => {
                    if (!document.body.contains(fileElement)) return;
                    const downloadIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>`;
                    const previewIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>`;

                    let buttonsHTML = '';
                    if (isVideo && window.videoPlayer) {
                        buttonsHTML += `<button class="file-action-btn preview-btn" data-preview-type="video" title="Preview Video">${previewIcon}</button>`;
                    } else if (canPreview) {
                        let titleText = 'Preview File';
                        let disabledAttr = '';
                        if (fileExtension === 'pptx' && previewConsent?.pptx === 'deny') {
                            titleText = 'PPTX preview disabled by your privacy choice';
                            disabledAttr = 'disabled aria-disabled="true"';
                        }
                        buttonsHTML += `<button class="file-action-btn preview-btn" data-preview-type="generic" data-ext="${fileExtension}" ${disabledAttr} title="${titleText}">${previewIcon}</button>`;
                    }
                    buttonsHTML += `<a href="${URL.createObjectURL(receivedBlob)}" download="${finalFileInfo.name}" class="file-action-btn save-btn" title="Save">${downloadIcon}</a>`;

                    actionContainer.innerHTML = `<div class="file-action-group is-entering">${buttonsHTML}</div>`;

                    const previewBtn = actionContainer.querySelector('.preview-btn');
                    if (previewBtn) {
                        previewBtn.onclick = () => {
                            const previewType = previewBtn.dataset.previewType;
                            if (previewType === 'video') window.videoPlayer.open(receivedBlob, finalFileInfo.name);
                            else if (previewType === 'generic') showPreview(finalFileInfo.name);
                        };
                    }
                }, 1200);
            }

            incomingFileInfo = null;
            lastReceiveProgressUpdate = 0;

            if (receiveCompletionTimer) clearTimeout(receiveCompletionTimer);
            receiveCompletionTimer = setTimeout(() => {
                if (batchExecutableCount > 0) {
                    audioManager.play('error');
                    showToast({
                        type: 'danger',
                        title: i18next.t('securityAlertTitle', 'Security Alert'),
                        body: i18next.t('securityAlertBody', {
                            count: batchExecutableCount,
                            defaultValue: `Received ${batchExecutableCount} executable files. Auto-download blocked.`
                        }),
                        duration: 8000,
                    });
                } else {
                    audioManager.play('receive_complete');
                }
                batchExecutableCount = 0;
                receiveCompletionTimer = null;
            }, 1500);
            return;
        }
    }

    // Binary Chunk Handling
    const opfsFile = incomingFileInfo ? opfsState.get(incomingFileInfo.name) : undefined;

    if (opfsFile) {
        try {
            await opfsFile.writer.write(data);
        } catch (error) {
            console.error('OPFS write failed:', error);
            opfsState.delete(incomingFileInfo.name);
            showToast({
                type: 'danger',
                title: i18next.t('outOfDiskSpace'),
                body: i18next.t('outOfDiskSpaceDescription'),
                duration: 10000,
            });
            incomingFileInfo = null;
            return;
        }
    } else {
        incomingFileData.push(data);
    }

    const chunkSize = data.byteLength || data.size || 0;
    store.actions.updateMetricsOnReceive(chunkSize);
    incomingFileReceived += chunkSize;

    if (incomingFileInfo?.size) {
        const now = Date.now();
        if (now - lastReceiveProgressUpdate > 100) {
            const progressValue = incomingFileReceived / incomingFileInfo.size;
            const fileId = store.actions.getFileId(incomingFileInfo.name);
            const fileElement = document.getElementById(fileId);

            if (fileElement) {
                fileElement.querySelector('progress').value = progressValue;
                fileElement.querySelector('.percent').textContent = `${Math.round(progressValue * 100)}%`;

                const elapsedSinceLastCalc = (now - lastIncomingSpeedCalcTime) / 1000;
                if (elapsedSinceLastCalc > 0.5) {
                    const bytesSinceLastCalc = incomingFileReceived - lastIncomingSpeedCalcOffset;
                    const currentSpeed = bytesSinceLastCalc / elapsedSinceLastCalc;
                    if (isFinite(currentSpeed) && currentSpeed > 0) {
                        incomingSpeedSamples.push(currentSpeed);
                        if (incomingSpeedSamples.length > SPEED_SAMPLE_COUNT) incomingSpeedSamples.shift();
                    }
                    lastIncomingSpeedCalcTime = now;
                    lastIncomingSpeedCalcOffset = incomingFileReceived;
                }

                if (incomingSpeedSamples.length > 0) {
                    const averageSpeed = incomingSpeedSamples.reduce((a, b) => a + b, 0) / incomingSpeedSamples.length;
                    if (averageSpeed > 0) {
                        const bytesRemaining = incomingFileInfo.size - incomingFileReceived;
                        const etrSeconds = bytesRemaining / averageSpeed;
                        fileElement.querySelector('.status-text').textContent = formatTimeRemaining(etrSeconds);
                    }
                }
            }
            lastReceiveProgressUpdate = now;
        }
    }
}