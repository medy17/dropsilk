// transfer/fileReceiver.js
// Handles file receiving logic

import i18next from '../i18n.js';
import { store } from '../state.js';
import { showToast } from '../utils/toast.js';
import { uiElements } from '../ui/dom.js';
import { audioManager } from '../utils/audioManager.js';
import { isExecutable } from '../utils/security.js';
import { isPreviewable } from '../preview/previewConfig.js';
import { showPreview } from '../preview/previewManager.js';
import { updateReceiverActions, checkQueueOverflow } from '../ui/view.js';
import { appendChatMessage } from '../features/chat/index.js';
import {
    createReceiveQueueItemHTML,
    createReceivedFileActions,
    createCompleteIndicator,
    createExecutableWarningBadge,
    updateSuspiciousGroupings,
} from './transferUI.js';
import { createEtrCalculator, formatTimeRemaining } from './etrCalculator.js';
import {
    shouldUseOpfs,
    initOpfsForFile,
    writeOpfsChunk,
    finalizeOpfsFile,
    isUsingOpfs,
} from './opfsHandler.js';

// Receiver state
let incomingFileInfo = null;
let incomingFileData = [];
let incomingFileReceived = 0;
let lastReceiveProgressUpdate = 0;
let etrCalc = createEtrCalculator();

// Batch tracking
let batchExecutableCount = 0;
let receiveCompletionTimer = null;

/**
 * Handles incoming data channel messages
 * @param {MessageEvent} event - The data channel message event
 */
export async function handleDataChannelMessage(event) {
    const data = event.data;

    if (typeof data === 'string') {
        if (data.startsWith('{')) {
            const parsedData = JSON.parse(data);

            // Control message for screen-share ending
            if (parsedData.type === 'stream-ended') {
                const { hideRemoteStreamView } = await import('../ui/streaming.js');
                hideRemoteStreamView();
                return;
            }

            // Chat message
            if (parsedData.kind === 'chat') {
                appendChatMessage({
                    author: 'peer',
                    text: parsedData.text || '',
                    timestamp: parsedData.sentAt || Date.now(),
                });
                return;
            }

            // File metadata - new file starting
            if (receiveCompletionTimer) {
                clearTimeout(receiveCompletionTimer);
                receiveCompletionTimer = null;
            }

            incomingFileInfo = parsedData;
            incomingFileData = [];
            incomingFileReceived = 0;
            etrCalc.reset();

            // Initialize OPFS if needed
            if (shouldUseOpfs(incomingFileInfo.size)) {
                await initOpfsForFile(incomingFileInfo.name);
            }

            // Create UI element
            const isFirstReceivedFile = store.getState().receivedFiles.length === 0;

            if (uiElements.receiverQueueDiv.querySelector('.empty-state')) {
                uiElements.receiverQueueDiv.innerHTML = '';
            }

            const fileId = `file-recv-${Date.now()}`;
            store.actions.addFileIdMapping(incomingFileInfo.name, fileId);

            uiElements.receiverQueueDiv.insertAdjacentHTML(
                'beforeend',
                createReceiveQueueItemHTML(incomingFileInfo, fileId),
            );

            if (isFirstReceivedFile && !store.getState().hasScrolledForReceive) {
                uiElements.receiverQueueDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                store.actions.setHasScrolledForReceive(true);
            }
            checkQueueOverflow('receiver-queue');

            return;
        }

        if (data === 'EOF') {
            await handleFileComplete();
            return;
        }
    }

    // Binary data - file chunk
    await handleIncomingChunk(data);
}

/**
 * Handles an incoming file chunk
 */
async function handleIncomingChunk(data) {
    if (!incomingFileInfo) return;

    // Write to OPFS or memory
    if (isUsingOpfs(incomingFileInfo.name)) {
        const success = await writeOpfsChunk(incomingFileInfo.name, data);
        if (!success) {
            incomingFileInfo = null;
            return;
        }
    } else {
        incomingFileData.push(data);
    }

    const chunkSize = data.byteLength || data.size || 0;
    store.actions.updateMetricsOnReceive(chunkSize);
    incomingFileReceived += chunkSize;

    // Update UI
    const now = Date.now();
    if (now - lastReceiveProgressUpdate > 100 && incomingFileInfo?.size) {
        const progressValue = incomingFileReceived / incomingFileInfo.size;
        const fileId = store.actions.getFileId(incomingFileInfo.name);
        const fileElement = document.getElementById(fileId);

        if (fileElement) {
            fileElement.querySelector('progress').value = progressValue;
            fileElement.querySelector('.percent').textContent = `${Math.round(progressValue * 100)}%`;

            etrCalc.update(incomingFileReceived);
            const etr = etrCalc.getETR(incomingFileInfo.size, incomingFileReceived);
            if (etr !== null) {
                const statusEl = fileElement.querySelector('.status-text');
                if (statusEl) statusEl.textContent = formatTimeRemaining(etr);
            }
        }
        lastReceiveProgressUpdate = now;
    }
}

/**
 * Handles file transfer completion
 */
async function handleFileComplete() {
    let receivedBlob;

    if (isUsingOpfs(incomingFileInfo.name)) {
        receivedBlob = await finalizeOpfsFile(incomingFileInfo.name);
        if (!receivedBlob) return;
    } else {
        receivedBlob = new Blob(incomingFileData, { type: incomingFileInfo.type });
    }

    const finalFileInfo = { ...incomingFileInfo };
    const isDangerous = isExecutable(finalFileInfo.name);

    if (isDangerous) {
        batchExecutableCount++;
    }

    // Auto-download if enabled and safe
    handleAutoDownload(receivedBlob, finalFileInfo, isDangerous);

    // Store the file
    store.actions.addReceivedFile({ name: finalFileInfo.name, blob: receivedBlob });
    updateReceiverActions();

    // Update UI
    updateCompletedFileUI(finalFileInfo, receivedBlob, isDangerous);

    incomingFileInfo = null;
    lastReceiveProgressUpdate = 0;

    // Batch notification
    scheduleBatchNotification();
}

/**
 * Handles auto-download for received files
 */
function handleAutoDownload(blob, fileInfo, isDangerous) {
    const autoDownloadEnabled = localStorage.getItem('dropsilk-auto-download') === 'true';

    if (autoDownloadEnabled && !isDangerous) {
        const maxSizeMB = parseFloat(localStorage.getItem('dropsilk-auto-download-max-size') || '100');
        const maxSizeBytes = maxSizeMB * 1024 * 1024;

        if (blob.size > 0 && blob.size <= maxSizeBytes) {
            try {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = fileInfo.name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (e) {
                console.error('Auto-download failed:', e);
            }
        }
    }
}

/**
 * Updates the UI for a completed file transfer
 */
function updateCompletedFileUI(fileInfo, blob, isDangerous) {
    const fileId = store.actions.getFileId(fileInfo.name);
    const fileElement = document.getElementById(fileId);

    if (!fileElement) return;

    fileElement.querySelector('progress').value = 1;
    fileElement.querySelector('.percent').textContent = '100%';

    const statusTextElement = fileElement.querySelector('.status-text');
    if (statusTextElement) {
        if (isDangerous) {
            statusTextElement.innerHTML = createExecutableWarningBadge();
            statusTextElement.style.color = '';
            statusTextElement.style.fontWeight = '';
            fileElement.classList.add('is-suspicious');
            updateSuspiciousGroupings();
        } else {
            statusTextElement.textContent = i18next.t('completeStatus', 'Complete!');
        }
    }

    const actionContainer = fileElement.querySelector('.file-action');
    const fileExtension = fileInfo.name.toLowerCase().split('.').pop();
    const isVideo = fileInfo.type.startsWith('video/') ||
        ['mp4', 'mov', 'mkv', 'webm', 'ts', 'm4v', 'avi'].includes(fileExtension);
    const canPreview = isPreviewable(fileInfo.name);

    let previewConsent = {};
    try {
        previewConsent = JSON.parse(localStorage.getItem('dropsilk-preview-consent') || '{}');
    } catch (_) { }

    const isPptxDisabled = fileExtension === 'pptx' && previewConsent?.pptx === 'deny';
    actionContainer.innerHTML = createCompleteIndicator();

    setTimeout(() => {
        if (!document.body.contains(fileElement)) return;

        actionContainer.innerHTML = createReceivedFileActions(blob, fileInfo, canPreview, isVideo, isPptxDisabled);

        const previewBtn = actionContainer.querySelector('.preview-btn');
        if (previewBtn) {
            previewBtn.onclick = () => {
                const previewType = previewBtn.dataset.previewType;
                if (previewType === 'video') {
                    window.videoPlayer.open(blob, fileInfo.name);
                } else if (previewType === 'generic') {
                    showPreview(fileInfo.name);
                }
            };
        }
    }, 1200);
}

/**
 * Schedules the batch completion notification
 */
function scheduleBatchNotification() {
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
}

/**
 * Resets all receiver state
 */
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
}
