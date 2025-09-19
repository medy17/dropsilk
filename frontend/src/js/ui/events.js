// js/ui/events.js
// This file is responsible for attaching all event listeners to the DOM.

import { uiElements, folderInputTransfer } from './dom.js';
import { store } from '../state.js';
import { sendMessage } from '../network/websocket.js';
import { startScreenShare, stopScreenShare } from '../network/webrtc.js';
import {
    handleFileSelection,
    handleFolderSelection,
    cancelFileSend,
} from '../transfer/fileHandler.js';
import { downloadAllFilesAsZip } from '../transfer/zipHandler.js';
import { showToast } from '../utils/toast.js';
import QrScanner from 'qr-scanner';
import Sortable from 'sortablejs';

// Snapshot of OTP entered when last error was triggered
let lastOtpErrorSnapshot = null;
// Flag to track if the last action was a deletion
let lastActionWasDeletion = false;

/**
 * Exported function to set OTP input error state
 */
export function setOtpInputError(errorCode) {
    const otpWrapper = uiElements.flightCodeInputWrapper;
    if (otpWrapper) {
        otpWrapper.classList.add('input-error');
        lastOtpErrorSnapshot = errorCode;
    }
}

/**
 * Reusable function to handle the logic for joining a flight.
 */
function attemptToJoinFlight() {
    const inputs =
        uiElements.flightCodeInputWrapper.querySelectorAll('.otp-input');
    const code = Array.from(inputs).map((input) => input.value).join('').trim().toUpperCase();

    if (code.length === 6) {
        store.actions.setIsFlightCreator(false);
        sendMessage({ type: 'join-flight', flightCode: code });
        lastOtpErrorSnapshot = null;
    } else {
        uiElements.flightCodeInputWrapper.classList.add('input-error');
        lastOtpErrorSnapshot = code;
        showToast({
            type: 'danger',
            title: 'Invalid Code',
            body: 'Please enter a 6-character flight code to join.',
            duration: 5000,
        });
    }
}

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
                    .map((child) => child.id)
                    .filter((id) => id.startsWith('send-')); // Ensure we only get file items

                store.actions.reorderQueueByDom(orderedIds);
            },
        });
    } else {
        console.warn(
            'SortableJS library not found or sending queue element is missing.'
        );
    }
}

export function initializeEventListeners() {
    uiElements.createFlightBtn?.addEventListener('click', () => {
        store.actions.setIsFlightCreator(true);
        sendMessage({ type: 'create-flight' });
    });

    uiElements.joinFlightBtn?.addEventListener('click', attemptToJoinFlight);

    const otpWrapper = uiElements.flightCodeInputWrapper;
    if (otpWrapper) {
        const inputs = Array.from(otpWrapper.querySelectorAll('.otp-input'));

        const forceCaretAtEnd = (input) => {
            setTimeout(() => {
                if (document.activeElement === input) {
                    input.setSelectionRange(input.value.length, input.value.length);
                }
            }, 0);
        };

        const updateInputStates = (focusedInput = null) => {
            let firstEmptyIndex = -1;
            for (let i = 0; i < inputs.length; i++) {
                if (!inputs[i].value) {
                    firstEmptyIndex = i;
                    break;
                }
            }

            const isComplete = firstEmptyIndex === -1;
            const activeSlotIndex = isComplete ? inputs.length - 1 : firstEmptyIndex;

            inputs.forEach((input, index) => {
                const isActive = index === activeSlotIndex;

                if (input.value) {
                    input.classList.add('filled');
                } else {
                    input.classList.remove('filled');
                }

                input.classList.toggle('inactive', !isActive);
                input.classList.toggle('locked', !isActive);
                input.toggleAttribute('disabled', index > activeSlotIndex);
                input.toggleAttribute('readonly', index < activeSlotIndex);
                input.setAttribute('tabindex', isActive ? '0' : '-1');
            });

            const activeInput = inputs[activeSlotIndex];
            if (activeInput && document.activeElement !== activeInput) {
                activeInput.focus();
            }

            const inputToForceCaretOn = focusedInput || activeInput;
            if (inputToForceCaretOn) {
                forceCaretAtEnd(inputToForceCaretOn);
            }
        };

        updateInputStates();
        window.updateOtpInputStates = updateInputStates;

        otpWrapper.addEventListener('focusin', (e) => {
            if (e.target.classList.contains('otp-input')) {
                updateInputStates(e.target);
            }
        });

        otpWrapper.addEventListener('click', (e) => {
            // If user clicks anywhere in the wrapper (including disabled inputs or empty space),
            // focus the active input instead
            if ((e.target.classList.contains('otp-input') && e.target.disabled) ||
                e.target === otpWrapper ||
                e.target.classList.contains('otp-input-container')) {
                e.preventDefault();
                // Find the first non-disabled, non-readonly input
                const activeInput = inputs.find(input => !input.disabled && !input.readOnly);
                if (activeInput) {
                    activeInput.focus();
                }
            }
        });

        otpWrapper.addEventListener('mouseup', (e) => {
            if (e.target.classList.contains('otp-input')) {
                forceCaretAtEnd(e.target);
            }
        });

        otpWrapper.addEventListener('input', (e) => {
            const target = e.target;
            if (!target.classList.contains('otp-input')) return;

            const value = target.value.trim();
            target.value = value.toUpperCase().slice(-1);

            if (target.value && target.nextElementSibling) {
                setTimeout(() => target.nextElementSibling.focus(), 0);
            }
            updateInputStates(target);
        });

        otpWrapper.addEventListener('keydown', (e) => {
            const target = e.target;
            if (!target.classList.contains('otp-input')) return;

            const currentIndex = inputs.indexOf(target);

            switch (e.key) {
                case 'Backspace':
                    e.preventDefault();
                    // Clear error immediately on backspace
                    if (otpWrapper.classList.contains('input-error')) {
                        otpWrapper.classList.remove('input-error');
                        lastOtpErrorSnapshot = null;
                    }
                    if (target.value) {
                        target.value = '';
                    } else if (currentIndex > 0) {
                        inputs[currentIndex - 1].value = '';
                        inputs[currentIndex - 1].focus();
                    }
                    break;
                case 'Delete':
                    e.preventDefault();
                    // Clear error immediately on delete
                    if (otpWrapper.classList.contains('input-error')) {
                        otpWrapper.classList.remove('input-error');
                        lastOtpErrorSnapshot = null;
                    }
                    target.value = '';
                    if (target.nextElementSibling) {
                        setTimeout(() => target.nextElementSibling.focus(), 0);
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (currentIndex > 0) inputs[currentIndex - 1].focus();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (currentIndex < inputs.length - 1)
                        inputs[currentIndex + 1].focus();
                    break;
                case 'Enter':
                    e.preventDefault();
                    attemptToJoinFlight();
                    break;
            }
            updateInputStates(document.activeElement);
        });

        otpWrapper.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = (e.clipboardData || window.clipboardData)
                .getData('text')
                .trim()
                .toUpperCase();
            if (/^[A-Z0-9]{6}$/.test(pasteData)) {
                inputs.forEach((input, index) => {
                    input.value = pasteData[index] || '';
                });
                inputs[inputs.length - 1].focus();
                // Clear error if valid paste
                otpWrapper.classList.remove('input-error');
                lastOtpErrorSnapshot = null;
            }
            updateInputStates();
        });
    }

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
                            const inputs =
                                uiElements.flightCodeInputWrapper.querySelectorAll(
                                    '.otp-input'
                                );
                            const codeUpper = code.toUpperCase();
                            inputs.forEach((input, index) => {
                                input.value = codeUpper[index] || '';
                            });
                            if (window.updateOtpInputStates) window.updateOtpInputStates();

                            stopScanner();
                            uiElements.joinFlightBtn.click();
                        } else {
                            showToast({
                                type: 'danger',
                                title: 'Invalid QR Code',
                                body: 'The QR code does not contain a valid flight link.',
                            });
                            stopScanner();
                        }
                    } catch (e) {
                        showToast({
                            type: 'danger',
                            title: 'Invalid QR Code',
                            body: 'This does not look like a DropSilk link.',
                        });
                        stopScanner();
                    }
                },
                {
                    highlightScanRegion: true,
                    highlightCodeOutline: true,
                }
            );
            await qrScanner.start();
        } catch (error) {
            console.error('QR Scanner Error:', error);
            showToast({
                type: 'danger',
                title: 'Camera Error',
                body: 'Could not access the camera. Please check permissions.',
                duration: 8000,
            });
            stopScanner();
        }
    });

    uiElements.closeQrScannerBtn?.addEventListener('click', stopScanner);

    uiElements.leaveFlightBtnDashboard?.addEventListener('click', () =>
        location.reload()
    );

    if (uiElements.fileInputTransfer) {
        uiElements.fileInputTransfer.onchange = () => {
            if (uiElements.fileInputTransfer.files.length > 0) {
                handleFileSelection(uiElements.fileInputTransfer.files);
                uiElements.fileInputTransfer.value = '';
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

        initializeSortableQueue();
    }

    uiElements.selectFolderBtn?.addEventListener('click', () =>
        folderInputTransfer.click()
    );
    folderInputTransfer.onchange = () => {
        if (folderInputTransfer.files.length > 0) {
            handleFolderSelection(folderInputTransfer.files);
            folderInputTransfer.value = '';
        }
    };

    uiElements.connectionPanelList?.addEventListener('click', (e) => {
        const inviteBtn = e.target.closest('.invite-user-btn');
        if (inviteBtn && !inviteBtn.disabled) {
            const inviteeId = inviteBtn.dataset.inviteeId;
            const { currentFlightCode } = store.getState();
            if (inviteeId && currentFlightCode) {
                sendMessage({
                    type: 'invite-to-flight',
                    inviteeId,
                    flightCode: currentFlightCode,
                });
                inviteBtn.textContent = 'Invited';
                inviteBtn.disabled = true;
                setTimeout(() => {
                    const currentBtn = document.querySelector(
                        `.invite-user-btn[data-invitee-id="${inviteeId}"]`
                    );
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

        if (navigator.vibrate) {
            navigator.vibrate([50, 40, 15]);
        }

        await navigator.clipboard.writeText(code);
        uiElements.dashboardFlightCodeBtn.classList.add('copied');
        setTimeout(
            () => uiElements.dashboardFlightCodeBtn.classList.remove('copied'),
            1200
        );
    });

    document
        .getElementById('shareAppBtn')
        ?.addEventListener('click', () =>
            document.getElementById('inviteBtn').click()
        );

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

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) =>
        document.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        })
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