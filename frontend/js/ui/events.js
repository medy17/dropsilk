// js/ui/events.js
// This file is responsible for attaching all event listeners to the DOM.

import { uiElements, folderInputTransfer } from './dom.js';
import { store } from '../state.js';
import { sendMessage } from '../network/websocket.js';
import { handleFileSelection, handleFolderSelection, cancelFileSend, processFileToSendQueue } from '../transfer/fileHandler.js';
import { downloadAllFilesAsZip } from '../transfer/zipHandler.js';
import { showToast } from '../utils/toast.js';

/**
 * Initializes the SortableJS library on the sending queue for smooth drag-and-drop reordering.
 */
function initializeSortableQueue() {
    if (uiElements.sendingQueueDiv && typeof Sortable !== 'undefined') {
        new Sortable(uiElements.sendingQueueDiv, {
            handle: '.drag-handle', // Restrict dragging to the handle element
            animation: 250, // Smooth animation speed in ms
            filter: '.is-sending', // Elements with this class cannot be dragged
            forceFallback: true, // This is the key to locking the axis.
            onEnd: () => {
                // Get the new order of element IDs directly from the DOM
                const orderedIds = Array.from(uiElements.sendingQueueDiv.children)
                    .map(child => child.id)
                    .filter(id => id.startsWith('send-')); // Ensure we only get file items

                // Update the application's state to match the new visual order
                store.actions.reorderQueueByDom(orderedIds);

                // If nothing is currently being sent, this will start the new top item
                processFileToSendQueue();
            },
        });
    } else {
        console.warn('SortableJS library not found or sending queue element is missing.');
    }
}

export function initializeEventListeners() {
    uiElements.createFlightBtn?.addEventListener('click', () => {
        store.actions.setIsFlightCreator(true);
        sendMessage({ type: "create-flight" });
    });

    uiElements.joinFlightBtn?.addEventListener('click', () => {
        const code = uiElements.flightCodeInput.value.trim().toUpperCase();
        if (code) {
            store.actions.setIsFlightCreator(false);
            sendMessage({ type: "join-flight", flightCode: code });
        } else {
            uiElements.flightCodeInputWrapper.classList.add('input-error');
            setTimeout(() => uiElements.flightCodeInputWrapper.classList.remove('input-error'), 1500);
            showToast({ type: 'danger', title: 'Empty Code', body: 'Please enter a 6-character flight code to join.', duration: 5000 });
        }
    });

    uiElements.leaveFlightBtnDashboard?.addEventListener('click', () => location.reload());

    if (uiElements.fileInputTransfer) {
        uiElements.fileInputTransfer.onchange = () => {
            if (uiElements.fileInputTransfer.files.length > 0) {
                handleFileSelection(uiElements.fileInputTransfer.files);
                uiElements.fileInputTransfer.value = "";
            }
        };
    }

    // Handles cancel clicks, text selection prevention, and drag-and-drop
    if (uiElements.sendingQueueDiv) {

        // --- THIS IS THE NEW FIX ---
        // Prevent text selection when starting a drag on the handle.
        uiElements.sendingQueueDiv.addEventListener('mousedown', (e) => {
            if (e.target.closest('.drag-handle')) {
                e.preventDefault(); // This stops the browser's default text selection behavior.
            }
        });

        // Click handler for cancel buttons remains the same.
        uiElements.sendingQueueDiv.addEventListener('click', (e) => {
            const cancelBtn = e.target.closest('.cancel-file-btn');
            if (cancelBtn) {
                const fileId = cancelBtn.dataset.fileId;
                if (fileId) {
                    cancelFileSend(fileId);
                }
            }
        });

        // Initialize the smooth, animated drag-and-drop functionality
        initializeSortableQueue();
    }

    uiElements.selectFolderBtn?.addEventListener('click', () => folderInputTransfer.click());
    folderInputTransfer.onchange = () => {
        if (folderInputTransfer.files.length > 0) {
            handleFolderSelection(folderInputTransfer.files);
            folderInputTransfer.value = "";
        }
    };

    // uiElements.downloadAllBtn?.addEventListener('click', downloadAllFilesAsZip); // This is now handled in modals.js

    uiElements.connectionPanelList?.addEventListener('click', (e) => {
        const inviteBtn = e.target.closest('.invite-user-btn');
        if (inviteBtn && !inviteBtn.disabled) {
            const inviteeId = inviteBtn.dataset.inviteeId;
            const { currentFlightCode } = store.getState();
            if (inviteeId && currentFlightCode) {
                sendMessage({ type: 'invite-to-flight', inviteeId, flightCode: currentFlightCode });
                inviteBtn.textContent = 'Invited';
                inviteBtn.disabled = true;
                setTimeout(() => {
                    inviteBtn.textContent = 'Invite';
                }, 3000);
            }
        }
    });

    uiElements.dashboardFlightCodeBtn?.addEventListener('click', async () => {
        const code = uiElements.dashboardFlightCodeBtn.getAttribute('data-code');
        if (!code) return;
        await navigator.clipboard.writeText(code);
        uiElements.dashboardFlightCodeBtn.classList.add('copied');
        setTimeout(() => uiElements.dashboardFlightCodeBtn.classList.remove('copied'), 1200);
    });

    document.getElementById('shareAppBtn')?.addEventListener('click', () => document.getElementById('inviteBtn').click());

    setupDragAndDrop();
}

function setupDragAndDrop() {
    const dropZone = uiElements.dropZone;
    if (!dropZone) return;

    let dragCounter = 0;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => document.addEventListener(eventName, e => {e.preventDefault(); e.stopPropagation();}));
    ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, handleDragEnter, false));
    ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, handleDragLeave, false));
    dropZone.addEventListener('drop', handleDrop, false);

    document.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { dragCounter++; uiElements.body.classList.add('dragging'); }});
    document.addEventListener('dragleave', () => { dragCounter--; if (dragCounter <= 0) { dragCounter = 0; uiElements.body.classList.remove('dragging'); }});
    document.addEventListener('drop', () => { dragCounter = 0; uiElements.body.classList.remove('dragging'); });

    function handleDragEnter(e) {
        if (dropZone.classList.contains('disabled')) return;
        dropZone.classList.add('drag-over');
    }

    function handleDragLeave() {
        if (dropZone.classList.contains('disabled')) return;
        dropZone.classList.remove('drag-over', 'drag-active');
    }

    function handleDrop(e) {
        if (dropZone.classList.contains('disabled')) return;
        dropZone.classList.remove('drag-over', 'drag-active');
        handleFileSelection(e.dataTransfer.files);
    }
}