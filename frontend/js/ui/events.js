// js/ui/events.js
// This file is responsible for attaching all event listeners to the DOM.

import { uiElements, folderInputTransfer } from './dom.js';
import { store } from '../state.js';
import { sendMessage } from '../network/websocket.js';
import { handleFileSelection, handleFolderSelection, cancelFileSend, processFileToSendQueue } from '../transfer/fileHandler.js';
import { downloadAllFilesAsZip } from '../transfer/zipHandler.js';
import { showToast } from '../utils/toast.js';

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

    // MODIFIED: Added comprehensive drag-and-drop reordering logic
    if (uiElements.sendingQueueDiv) {
        let draggedElement = null;

        // Click handler for cancel buttons
        uiElements.sendingQueueDiv.addEventListener('click', (e) => {
            const cancelBtn = e.target.closest('.cancel-file-btn');
            if (cancelBtn) {
                const fileId = cancelBtn.dataset.fileId;
                if (fileId) cancelFileSend(fileId);
            }
        });

        // Drag and drop handlers for reordering
        uiElements.sendingQueueDiv.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('queue-item')) {
                draggedElement = e.target;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedElement.id);
                setTimeout(() => draggedElement.classList.add('dragging'), 0);
            }
        });

        uiElements.sendingQueueDiv.addEventListener('dragend', () => {
            if (draggedElement) {
                draggedElement.classList.remove('dragging');
                draggedElement = null;
            }
        });

        const getDragAfterElement = (container, y) => {
            const draggableElements = [...container.querySelectorAll('.queue-item:not(.dragging)')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        };

        uiElements.sendingQueueDiv.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(uiElements.sendingQueueDiv, e.clientY);
            document.querySelectorAll('.queue-item').forEach(item => item.classList.remove('drag-over'));
            if (afterElement) {
                afterElement.classList.add('drag-over');
            } else {
                // If dragging to the end, no specific element gets the class,
                // which is visually fine as it will append.
            }
        });

        uiElements.sendingQueueDiv.addEventListener('dragleave', () => {
            document.querySelectorAll('.queue-item.drag-over').forEach(item => item.classList.remove('drag-over'));
        });


        uiElements.sendingQueueDiv.addEventListener('drop', (e) => {
            e.preventDefault();
            document.querySelectorAll('.queue-item.drag-over').forEach(item => item.classList.remove('drag-over'));
            if (!draggedElement) return;

            const afterElement = getDragAfterElement(uiElements.sendingQueueDiv, e.clientY);
            const draggedId = draggedElement.id;
            const targetId = afterElement ? afterElement.id : null;

            // Reorder DOM
            if (afterElement == null) {
                uiElements.sendingQueueDiv.appendChild(draggedElement);
            } else {
                uiElements.sendingQueueDiv.insertBefore(draggedElement, afterElement);
            }

            // Update state
            store.actions.reorderFileToSendQueue(draggedId, targetId);

            // If nothing is sending, the newly arranged top file might need to be sent
            processFileToSendQueue();
        });
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