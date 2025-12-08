// transfer/queueManager.js
// Manages the file transfer queue and selection

import { store } from '../state.js';
import { uiElements } from '../ui/dom.js';
import { showToast } from '../utils/toast.js';
import { checkQueueOverflow } from '../ui/view.js';
import { createSendQueueItemHTML } from './transferUI.js';
import { ensureQueueIsActive } from './fileSender.js';
import i18next from '../i18n.js';

/**
 * Handles file selection and adds them to the queue
 * @param {FileList|File[]} files - Files to add
 */
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
        tempDiv.innerHTML = createSendQueueItemHTML(file, fileId);
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

/**
 * Handles folder selection with warning for large folders
 * @param {FileList|File[]} files - Files from the folder
 */
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
                { text: i18next.t('cancel'), class: 'btn-secondary', callback: () => { } },
                {
                    text: i18next.t('proceedAnyway'),
                    class: 'btn-primary',
                    callback: () => handleFileSelection(files),
                },
            ],
        });
    } else {
        handleFileSelection(files);
    }
}

/**
 * Sets up drag and drop reordering for the send queue
 */
export function setupQueueDragDrop() {
    let draggedItem = null;

    uiElements.sendingQueueDiv.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.queue-item');
        if (!item) return;
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    uiElements.sendingQueueDiv.addEventListener('dragend', (e) => {
        const item = e.target.closest('.queue-item');
        if (item) item.classList.remove('dragging');
        draggedItem = null;
    });

    uiElements.sendingQueueDiv.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedItem) return;

        const afterElement = getDragAfterElement(uiElements.sendingQueueDiv, e.clientY);
        if (afterElement === null) {
            uiElements.sendingQueueDiv.appendChild(draggedItem);
        } else {
            uiElements.sendingQueueDiv.insertBefore(draggedItem, afterElement);
        }
    });

    uiElements.sendingQueueDiv.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedItem) return;

        // Sync the visual order with the state
        const items = Array.from(uiElements.sendingQueueDiv.querySelectorAll('.queue-item'));
        const fileIds = items.map(item => item.id);
        store.actions.reorderQueue(fileIds);
    });
}

/**
 * Gets the element to insert the dragged item after
 */
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.queue-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}
