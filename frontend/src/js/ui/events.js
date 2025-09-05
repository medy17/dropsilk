// js/ui/events.js
// This file is responsible for attaching all event listeners to the DOM.

import { uiElements, folderInputTransfer } from './dom.js';
import { store } from '../state.js';
import { sendMessage } from '../network/websocket.js';
import { startScreenShare, stopScreenShare } from '../network/webrtc.js';
import { handleFileSelection, handleFolderSelection, cancelFileSend } from '../transfer/fileHandler.js';
import { downloadAllFilesAsZip } from '../transfer/zipHandler.js';
import { showToast } from '../utils/toast.js';
import QrScanner from 'qr-scanner';
import Sortable from 'sortablejs';


/**
 * Initializes the SortableJS library on the sending queue for smooth drag-and-drop reordering.
 */
function initializeSortableQueue() {
    if (uiElements.sendingQueueDiv && typeof Sortable !== 'undefined') {
        new Sortable(uiElements.sendingQueueDiv, {
            handle: '.drag-handle',
            animation: 250,
            filter: '.is-sending',
            onEnd: () => {
                // Get the new order of element IDs directly from the DOM
                const orderedIds = Array.from(uiElements.sendingQueueDiv.children)
                    .map(child => child.id)
                    .filter(id => id.startsWith('send-')); // Ensure we only get file items

                store.actions.reorderQueueByDom(orderedIds);
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

    let qrScanner = null;

    const stopScanner = () => {
        if (qrScanner) {
            qrScanner.stop();
            qrScanner.destroy();
            qrScanner = null;
        }
        uiElements.qrScannerOverlay.classList.remove('show');
    };

    uiElements.scanQrBtn?.addEventListener('click', async () => {
        // Prevent re-initialization
        if (qrScanner) return;

        uiElements.qrScannerOverlay.classList.add('show');

        // The library needs this to be imported globally from the script tag
        // We wrap it in a try-catch for when the user denies camera permissions
        try {
            qrScanner = new QrScanner(
                uiElements.qrVideo,
                result => {
                    console.log('QR Code detected:', result.data);
                    try {
                        const url = new URL(result.data);
                        const code = url.searchParams.get('code');

                        if (code && code.length === 6) {
                            uiElements.flightCodeInput.value = code.toUpperCase();
                            stopScanner();
                            // Reuse existing join logic by simulating a click
                            uiElements.joinFlightBtn.click();
                        } else {
                            showToast({ type: 'danger', title: 'Invalid QR Code', body: 'The QR code does not contain a valid flight link.' });
                            stopScanner();
                        }
                    } catch (e) {
                        showToast({ type: 'danger', title: 'Invalid QR Code', body: 'This does not look like a DropSilk link.' });
                        stopScanner();
                    }
                },
                {
                    highlightScanRegion: true,
                    highlightCodeOutline: true,
                },
            );
            await qrScanner.start();
        } catch (error) {
            console.error("QR Scanner Error:", error);
            showToast({ type: 'danger', title: 'Camera Error', body: 'Could not access the camera. Please check permissions.', duration: 8000 });
            stopScanner();
        }
    });

    uiElements.closeQrScannerBtn?.addEventListener('click', stopScanner);


    uiElements.leaveFlightBtnDashboard?.addEventListener('click', () => location.reload());

    if (uiElements.fileInputTransfer) {
        uiElements.fileInputTransfer.onchange = () => {
            if (uiElements.fileInputTransfer.files.length > 0) {
                handleFileSelection(uiElements.fileInputTransfer.files);
                uiElements.fileInputTransfer.value = "";
            }
        };
    }

    if (uiElements.sendingQueueDiv) {

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
                    const currentBtn = document.querySelector(`.invite-user-btn[data-invitee-id="${inviteeId}"]`);
                    if (currentBtn) {
                        currentBtn.textContent = 'Invite';
                        currentBtn.disabled = false;
                    }
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

    document.getElementById('shareScreenBtn')?.addEventListener('click', () => {
        const btn = document.getElementById('shareScreenBtn');
        const isSharing = btn.classList.contains('is-sharing');

        if (isSharing) {
            stopScreenShare();
        } else {
            startScreenShare();
        }
    });


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