// src/js/ui/events.js
import i18next from '../i18n.js';
import { uiElements, folderInputTransfer } from './dom.js';
import { store } from '../state.js';
import { sendMessage } from '../network/websocket.js';
import { startScreenShare, stopScreenShare } from '../network/webrtc.js';
import { handleFileSelection, handleFolderSelection, cancelFileSend } from '../transfer/fileHandler.js';
import { showToast } from '../utils/toast.js';
import QrScanner from 'qr-scanner';
import Sortable from 'sortablejs';
import { clearAllPulseEffects } from './view.js';
import { setupChatEvents } from './chat.js'; // Import new chat events

// ... (Rest of file helpers: getMimeTypeFromPath, setOtpInputError, attemptToJoinFlight, initializeSortableQueue) ...
// (Retain existing implementation of these helpers)

function getMimeTypeFromPath(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    const mimeTypes = {
        mp4: 'video/mp4',
        mov: 'video/quicktime',
        mkv: 'video/x-matroska',
        webm: 'video/webm',
        avi: 'video/x-msvideo',
        m4v: 'video/x-m4v',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        m4a: 'audio/mp4',
        pdf: 'application/pdf',
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

let lastOtpErrorSnapshot = null;

export function setOtpInputError(errorCode) {
    const otpWrapper = uiElements.flightCodeInputWrapper;
    if (otpWrapper) {
        otpWrapper.classList.add('input-error');
        lastOtpErrorSnapshot = errorCode;
    }
}

function attemptToJoinFlight() {
    const ghostInput = document.getElementById('otp-ghost-input');
    const code = ghostInput ? ghostInput.value.trim().toUpperCase() : '';

    if (code.length === 6) {
        store.actions.setIsFlightCreator(false);
        sendMessage({ type: 'join-flight', flightCode: code });
        lastOtpErrorSnapshot = null;
    } else {
        uiElements.flightCodeInputWrapper.classList.add('input-error');
        lastOtpErrorSnapshot = code;
        showToast({
            type: 'danger',
            title: i18next.t('invalidCode'),
            body: i18next.t('invalidCodeDescription'),
            duration: 5000,
        });
    }
}

function initializeSortableQueue() {
    if (uiElements.sendingQueueDiv && typeof Sortable !== 'undefined') {
        new Sortable(uiElements.sendingQueueDiv, {
            handle: '.drag-handle',
            animation: 250,
            filter: '.is-sending',
            onEnd: () => {
                const orderedIds = Array.from(uiElements.sendingQueueDiv.children)
                    .map((child) => child.id)
                    .filter((id) => id.startsWith('send-'));
                store.actions.reorderQueueByDom(orderedIds);
            },
        });
    } else {
        console.warn(i18next.t('sortableJsNotFound'));
    }
}

export function initializeEventListeners() {
    // ... (Keep existing UI listeners: createFlightBtn, joinFlightBtn, otpWrapper logic, QR scanner logic) ...
    uiElements.createFlightBtn?.addEventListener('click', () => {
        localStorage.setItem('hasSeenCreateFlightPulse', 'true');
        clearAllPulseEffects();
        store.actions.setIsFlightCreator(true);
        sendMessage({ type: 'create-flight' });
    });

    uiElements.joinFlightBtn?.addEventListener('click', attemptToJoinFlight);

    const otpWrapper = uiElements.flightCodeInputWrapper;
    if (otpWrapper) {
        const ghostInput = document.getElementById('otp-ghost-input');
        const visualSlots = Array.from(document.querySelectorAll('.otp-visual-slot'));
        const updateVisuals = () => {
            let val = ghostInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (val.length > 6) val = val.slice(0, 6);
            if (ghostInput.value !== val) ghostInput.value = val;
            visualSlots.forEach((slot, index) => {
                slot.textContent = val[index] || '';
                slot.classList.remove('active', 'filled');
                if (val[index]) slot.classList.add('filled');
                const isNextChar = index === val.length;
                const isFullAndLast = val.length === 6 && index === 5;
                if (isNextChar || isFullAndLast) slot.classList.add('active');
            });
            if (otpWrapper.classList.contains('input-error')) otpWrapper.classList.remove('input-error');
        };
        ghostInput.addEventListener('input', updateVisuals);
        ghostInput.addEventListener('change', updateVisuals);
        ghostInput.addEventListener('paste', () => setTimeout(updateVisuals, 0));
        ghostInput.addEventListener('focus', () => {
            otpWrapper.classList.add('focused');
            updateVisuals();
        });
        ghostInput.addEventListener('blur', () => {
            otpWrapper.classList.remove('focused');
            visualSlots.forEach((s) => s.classList.remove('active'));
        });
        ghostInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('joinFlightBtn').click();
            }
        });
    }

    // QR Logic
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
        if (qrScanner) return;
        uiElements.qrScannerOverlay.classList.add('show');
        try {
            qrScanner = new QrScanner(
                uiElements.qrVideo,
                (result) => {
                    try {
                        const url = new URL(result.data);
                        const code = url.searchParams.get('code');
                        if (code && code.length === 6) {
                            const ghostInput = document.getElementById('otp-ghost-input');
                            if (ghostInput) {
                                ghostInput.value = code.toUpperCase();
                                if (window.updateOtpInputStates) window.updateOtpInputStates();
                            }
                            stopScanner();
                            uiElements.joinFlightBtn.click();
                        } else {
                            showToast({ type: 'danger', title: i18next.t('invalidQrCode'), body: i18next.t('invalidQrCodeDescription') });
                            stopScanner();
                        }
                    } catch {
                        showToast({ type: 'danger', title: i18next.t('invalidQrCode'), body: i18next.t('notDropSilkLink') });
                        stopScanner();
                    }
                },
                { highlightScanRegion: true, highlightCodeOutline: true },
            );
            await qrScanner.start();
        } catch (error) {
            console.error('QR Scanner Error:', error);
            showToast({ type: 'danger', title: i18next.t('cameraError'), body: i18next.t('cameraErrorDescription'), duration: 8000 });
            stopScanner();
        }
    });

    uiElements.closeQrScannerBtn?.addEventListener('click', stopScanner);
    uiElements.leaveFlightBtnDashboard?.addEventListener('click', () => location.reload());

    /* === File & Folder Selection === */
    if (uiElements.fileInputTransfer) {
        uiElements.fileInputTransfer.onchange = () => {
            if (uiElements.fileInputTransfer.files.length > 0) {
                handleFileSelection(uiElements.fileInputTransfer.files);
                uiElements.fileInputTransfer.value = '';
            }
        };
    }
    folderInputTransfer.onchange = () => {
        if (folderInputTransfer.files.length > 0) {
            handleFolderSelection(folderInputTransfer.files);
            folderInputTransfer.value = '';
        }
    };

    // Electron specific file handling (unchanged logic)
    if (window.electronAPI) {
        const selectFilesBtn = document.querySelector('label[for="fileInput_transfer"]');
        if (selectFilesBtn) {
            selectFilesBtn.onclick = async (e) => {
                e.preventDefault();
                const filesData = await window.electronAPI.selectFiles();
                if (filesData.length > 0) {
                    const fileObjects = filesData.map((f) => new File([f.data], f.name, { type: getMimeTypeFromPath(f.name), path: f.path }));
                    handleFileSelection(fileObjects);
                }
            };
        }
        if (uiElements.selectFolderBtn) {
            uiElements.selectFolderBtn.onclick = async () => {
                const filesData = await window.electronAPI.selectFolder();
                if (filesData.length > 0) {
                    const fileObjects = filesData.map((f) => new File([f.data], f.name, { type: getMimeTypeFromPath(f.name), path: f.path }));
                    handleFolderSelection(fileObjects);
                }
            };
        }
    } else {
        uiElements.selectFolderBtn?.addEventListener('click', () => folderInputTransfer.click());
    }

    if (uiElements.sendingQueueDiv) {
        uiElements.sendingQueueDiv.addEventListener('click', (e) => {
            const cancelBtn = e.target.closest('.cancel-file-btn');
            if (cancelBtn) {
                const fileId = cancelBtn.dataset.fileId;
                if (fileId) cancelFileSend(fileId);
            }
        });
        initializeSortableQueue();
    }

    uiElements.connectionPanelList?.addEventListener('click', (e) => {
        const inviteBtn = e.target.closest('.invite-user-btn');
        if (inviteBtn && !inviteBtn.disabled) {
            const inviteeId = inviteBtn.dataset.inviteeId;
            const { currentFlightCode } = store.getState();
            if (inviteeId && currentFlightCode) {
                sendMessage({ type: 'invite-to-flight', inviteeId, flightCode: currentFlightCode });
                inviteBtn.textContent = i18next.t('invited');
                inviteBtn.disabled = true;
                setTimeout(() => {
                    const currentBtn = document.querySelector(`.invite-user-btn[data-invitee-id="${inviteeId}"]`);
                    if (currentBtn) {
                        currentBtn.textContent = i18next.t('invite');
                        currentBtn.disabled = false;
                    }
                }, 3000);
            }
        }
    });

    uiElements.dashboardFlightCodeBtn?.addEventListener('click', async () => {
        const code = uiElements.dashboardFlightCodeBtn.getAttribute('data-code');
        if (!code) return;
        if (navigator.vibrate) navigator.vibrate([50, 40, 15]);
        await navigator.clipboard.writeText(code);
        uiElements.dashboardFlightCodeBtn.classList.add('copied');
        setTimeout(() => uiElements.dashboardFlightCodeBtn.classList.remove('copied'), 1200);
    });

    document.getElementById('shareAppBtn')?.addEventListener('click', () => document.getElementById('inviteBtn').click());

    document.getElementById('shareScreenBtn')?.addEventListener('click', () => {
        const btn = document.getElementById('shareScreenBtn');
        const isSharing = btn.classList.contains('is-sharing');
        if (isSharing) stopScreenShare();
        else startScreenShare();
    });

    setupDragAndDrop();
    setupDonateButton();
    setupChatEvents(); // Use the new function
}

function setupDonateButton() {
    const donateButtons = [document.getElementById('donateBtnHeader'), document.getElementById('ko-fiBtn')];
    const kofiIframe = document.getElementById('kofiframe');
    if (!kofiIframe) return;
    const loadKoFi = () => {
        if (kofiIframe.getAttribute('src')) return;
        const src = kofiIframe.getAttribute('data-src');
        if (src) kofiIframe.setAttribute('src', src);
    };
    donateButtons.forEach((btn) => {
        if (btn) btn.addEventListener('click', loadKoFi);
    });
}

function setupDragAndDrop() {
    const dropZone = uiElements.dropZone;
    if (!dropZone) return;
    let dragCounter = 0;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) =>
        document.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); })
    );
    ['dragenter', 'dragover'].forEach((eventName) =>
        dropZone.addEventListener(eventName, handleDragEnter, false)
    );
    ['dragleave', 'drop'].forEach((eventName) =>
        dropZone.addEventListener(eventName, handleDragLeave, false)
    );
    dropZone.addEventListener('drop', handleDrop, false);

    document.addEventListener('dragenter', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            dragCounter++;
            uiElements.body.classList.add('dragging');
        }
    });
    document.addEventListener('dragleave', () => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            uiElements.body.classList.remove('dragging');
        }
    });
    document.addEventListener('drop', () => {
        dragCounter = 0;
        uiElements.body.classList.remove('dragging');
    });

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