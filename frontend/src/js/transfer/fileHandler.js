// src/js/transfer/fileHandler.js
import i18next from '../i18n.js';
import { store } from '../state.js';
import { showToast } from '../utils/toast.js';
import { uiElements } from '../ui/dom.js';
import { getFileIcon } from '../utils/helpers.js';
import { checkQueueOverflow } from '../ui/view.js';
import { ensureQueueIsActive as ensureSenderActive, cancelCurrentTransfer, resetSenderState } from './sender.js';
import { resetReceiverState, handleDataChannelMessage as receiverHandleMessage } from './receiver.js';

// Re-export specific functions for WebRTC module compatibility
export { drainQueue } from './sender.js';
export { handleDataChannelMessage } from './receiver.js';

export function ensureQueueIsActive() {
    ensureSenderActive();
}

export function cancelFileSend(fileId) {
    const element = document.getElementById(fileId);
    if (element) element.remove();

    const state = store.getState();
    const currentlySendingFile = state.currentlySendingFile;
    const currentFileId = currentlySendingFile
        ? store.actions.getFileId(currentlySendingFile)
        : null;

    if (fileId === currentFileId) {
        cancelCurrentTransfer(currentlySendingFile);
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

    Array.from(files).forEach((file) => {
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

    if (files.length > fileLimit || Array.from(files).some((f) => f.size > sizeLimit)) {
        showToast({
            type: 'info',
            title: i18next.t('folderSelectionWarning'),
            body: i18next.t('folderSelectionWarningDescription'),
            duration: 0,
            actions: [
                { text: i18next.t('cancel'), class: 'btn-secondary', callback: () => {} },
                { text: i18next.t('proceedAnyway'), class: 'btn-primary', callback: () => handleFileSelection(files) },
            ],
        });
    } else {
        handleFileSelection(files);
    }
}

export function resetTransferState() {
    resetSenderState();
    resetReceiverState();
}