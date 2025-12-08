// transfer/transferUI.js
// Handles all UI rendering for file transfer queue items

import i18next from '../i18n.js';
import { getFileIcon } from '../utils/helpers.js';

/**
 * Creates HTML for a queued file item in the sending queue.
 * @param {File} file - The file object
 * @param {string} fileId - Unique identifier for the file
 * @returns {string} HTML string for the queue item
 */
export function createSendQueueItemHTML(file, fileId) {
    return `
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
}

/**
 * Creates HTML for an actively sending file item.
 * @param {File} file - The file object
 * @param {string} fileId - Unique identifier for the file
 * @returns {string} HTML string for the sending state
 */
export function createSendingItemHTML(file, fileId) {
    return `
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

/**
 * Creates HTML for a receiving file item in the receiver queue.
 * @param {Object} fileInfo - The file info object with name property
 * @param {string} fileId - Unique identifier for the file
 * @returns {string} HTML string for the receiving queue item
 */
export function createReceiveQueueItemHTML(fileInfo, fileId) {
    return `
        <div class="queue-item" id="${fileId}">
            <div class="file-icon">${getFileIcon(fileInfo.name)}</div>
            <div class="file-details">
                <div class="file-details__name" title="${fileInfo.name}"><span>${fileInfo.name}</span></div>
                <progress class="file-details__progress-bar" value="0" max="1"></progress>
                <div class="file-details__status">
                    <span class="percent">0%</span>
                    <span class="status-text">${i18next.t('receiving', 'Receiving...')}</span>
                </div>
            </div>
            <div class="file-action"></div>
        </div>`;
}

/**
 * Updates the progress UI for a file transfer.
 * @param {HTMLElement} fileElement - The queue item DOM element
 * @param {number} progressValue - Value between 0 and 1
 * @param {string} statusText - Optional status text to display
 */
export function updateTransferProgress(fileElement, progressValue, statusText = null) {
    if (!fileElement) return;

    const progressBar = fileElement.querySelector('progress');
    const percentEl = fileElement.querySelector('.percent');
    const statusEl = fileElement.querySelector('.status-text');

    if (progressBar) progressBar.value = progressValue;
    if (percentEl) percentEl.textContent = `${Math.round(progressValue * 100)}%`;
    if (statusText && statusEl) statusEl.textContent = statusText;
}

/**
 * Marks a file transfer as complete and updates the UI.
 * @param {HTMLElement} fileElement - The queue item DOM element
 * @param {boolean} isSender - Whether this is a sender or receiver item
 */
export function markTransferComplete(fileElement, isSender = true) {
    if (!fileElement) return;

    fileElement.classList.remove('is-sending');

    const progressBar = fileElement.querySelector('progress');
    const percentEl = fileElement.querySelector('.percent');
    const statusEl = fileElement.querySelector('.status-text');

    if (progressBar) progressBar.value = 1;
    if (percentEl) percentEl.textContent = '100%';
    if (statusEl) {
        statusEl.textContent = isSender
            ? i18next.t('sentStatus', 'Sent!')
            : i18next.t('completeStatus', 'Complete!');
    }

    // Remove cancel button for sender
    if (isSender) {
        const cancelButton = fileElement.querySelector('.cancel-file-btn');
        if (cancelButton) cancelButton.remove();
    }
}

/**
 * Creates action buttons for a completed received file.
 * @param {Blob} blob - The file blob
 * @param {Object} fileInfo - File info with name and type
 * @param {boolean} canPreview - Whether the file can be previewed
 * @param {boolean} isVideo - Whether the file is a video
 * @param {boolean} isPptxDisabled - Whether PPTX preview is disabled
 * @returns {string} HTML string for action buttons
 */
export function createReceivedFileActions(blob, fileInfo, canPreview, isVideo, isPptxDisabled = false) {
    const downloadIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>`;
    const previewIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>`;

    const fileExtension = fileInfo.name.toLowerCase().split('.').pop();
    let buttonsHTML = '';

    if (isVideo && window.videoPlayer) {
        buttonsHTML += `<button class="file-action-btn preview-btn" data-preview-type="video" title="Preview Video">${previewIconSVG}</button>`;
    } else if (canPreview) {
        let titleText = 'Preview File';
        let disabledAttr = '';
        if (fileExtension === 'pptx' && isPptxDisabled) {
            titleText = 'PPTX preview disabled by your privacy choice';
            disabledAttr = 'disabled aria-disabled="true"';
        }
        buttonsHTML += `<button class="file-action-btn preview-btn" data-preview-type="generic" data-ext="${fileExtension}" ${disabledAttr} title="${titleText}">${previewIconSVG}</button>`;
    }

    buttonsHTML += `<a href="${URL.createObjectURL(blob)}" download="${fileInfo.name}" class="file-action-btn save-btn" title="Save">${downloadIconSVG}</a>`;

    return `<div class="file-action-group is-entering">${buttonsHTML}</div>`;
}

/**
 * Creates a checkmark complete indicator button.
 * @returns {string} HTML string for the complete indicator
 */
export function createCompleteIndicator() {
    const checkmarkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.061L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/></svg>`;
    return `<button class="file-action-btn file-action-btn--complete is-entering" disabled>${checkmarkIconSVG}</button>`;
}

/**
 * Creates the warning badge HTML for executable files.
 * @returns {string} HTML string for the warning badge
 */
export function createExecutableWarningBadge() {
    return `
        <span class="warning-badge">
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>
            </svg>
            Executable
        </span>`;
}

/**
 * Updates the groupings for suspicious/executable files in the queue.
 * This adds CSS classes for visual grouping of consecutive executable files.
 */
export function updateSuspiciousGroupings() {
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

        if (!isPrevSuspicious && !isNextSuspicious) {
            item.classList.add('suspicious-single');
        } else if (!isPrevSuspicious && isNextSuspicious) {
            item.classList.add('suspicious-start');
        } else if (isPrevSuspicious && isNextSuspicious) {
            item.classList.add('suspicious-middle');
        } else if (isPrevSuspicious && !isNextSuspicious) {
            item.classList.add('suspicious-end');
        }
    });
}

// Re-export formatTimeRemaining from etrCalculator for backward compatibility
export { formatTimeRemaining } from './etrCalculator.js';


