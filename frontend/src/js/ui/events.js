// js/ui/events.js
// This file is responsible for attaching all event listeners to the DOM.

import i18next from "../i18n.js";
import {uiElements, folderInputTransfer} from "./dom.js";
import {store} from "../state.js";
import {sendMessage} from "../network/websocket.js";
import {startScreenShare, stopScreenShare} from "../network/webrtc.js";
import {
    handleFileSelection,
    handleFolderSelection,
    cancelFileSend,
} from "../transfer/fileHandler.js";
import {downloadAllFilesAsZip} from "../transfer/zipHandler.js";
import {showToast} from "../utils/toast.js";
import QrScanner from "qr-scanner";
import Sortable from "sortablejs";
import {clearAllPulseEffects} from "./view.js";

/**
 * A simple helper to guess a file's MIME type from its extension.
 * Crucial for creating proper File objects in the Electron renderer process.
 * @param {string} fileName The name of the file (e.g., "my-video.mp4").
 * @returns {string} The guessed MIME type or a generic fallback.
 */
function getMimeTypeFromPath(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    const mimeTypes = {
        // Video
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'mkv': 'video/x-matroska',
        'webm': 'video/webm',
        'avi': 'video/x-msvideo',
        'm4v': 'video/x-m4v',
        // Image
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        // Audio
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'm4a': 'audio/mp4',
        // Document
        'pdf': 'application/pdf',
        // Add other common types as needed
    };
    return mimeTypes[extension] || 'application/octet-stream'; // Generic binary fallback
}

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
        otpWrapper.classList.add("input-error");
        lastOtpErrorSnapshot = errorCode;
    }
}

/**
 * Reusable function to handle the logic for joining a flight.
 */
function attemptToJoinFlight() {
    const inputs =
        uiElements.flightCodeInputWrapper.querySelectorAll(".otp-input");
    const code = Array.from(inputs)
        .map((input) => input.value)
        .join("")
        .trim()
        .toUpperCase();

    if (code.length === 6) {
        store.actions.setIsFlightCreator(false);
        sendMessage({type: "join-flight", flightCode: code});
        lastOtpErrorSnapshot = null;
    } else {
        uiElements.flightCodeInputWrapper.classList.add("input-error");
        lastOtpErrorSnapshot = code;
        showToast({
            type: "danger",
            title: i18next.t("invalidCode"),
            body: i18next.t("invalidCodeDescription"),
            duration: 5000,
        });
    }
}

/**
 * Initializes the SortableJS library on the sending queue for smooth drag-and-drop reordering.
 */
function initializeSortableQueue() {
    if (uiElements.sendingQueueDiv && typeof Sortable !== "undefined") {
        new Sortable(uiElements.sendingQueueDiv, {
            handle: ".drag-handle",
            animation: 250,
            filter: ".is-sending",
            onEnd: () => {
                // Get the new order of element IDs directly from the DOM
                const orderedIds = Array.from(uiElements.sendingQueueDiv.children)
                    .map((child) => child.id)
                    .filter((id) => id.startsWith("send-")); // Ensure we only get file items

                store.actions.reorderQueueByDom(orderedIds);
            },
        });
    } else {
        console.warn(i18next.t("sortableJsNotFound"));
    }
}

export function initializeEventListeners() {
    uiElements.createFlightBtn?.addEventListener("click", () => {
        localStorage.setItem("hasSeenCreateFlightPulse", "true");
        clearAllPulseEffects();
        store.actions.setIsFlightCreator(true);
        sendMessage({type: "create-flight"});
    });

    uiElements.joinFlightBtn?.addEventListener("click", attemptToJoinFlight);

    const otpWrapper = uiElements.flightCodeInputWrapper;
    if (otpWrapper) {
        const inputs = Array.from(otpWrapper.querySelectorAll(".otp-input"));

        const forceCaretAtEnd = (input) => {
            // Only force if the caret isn't already at the end
            if (
                document.activeElement === input &&
                input.selectionStart !== input.value.length
            ) {
                setTimeout(() => {
                    if (document.activeElement === input) {
                        input.setSelectionRange(input.value.length, input.value.length);
                    }
                }, 0);
            }
        };

        const updateInputStates = (focusedInput = null, shouldAutoFocus = true) => {
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

                // 1. Update 'filled' class only if it has changed
                const hasValue = !!input.value;
                if (hasValue !== input.classList.contains("filled")) {
                    input.classList.toggle("filled", hasValue);
                }

                // 2. Update 'inactive'/'locked' classes only if they have changed
                const shouldBeInactive = !isActive;
                if (shouldBeInactive !== input.classList.contains("inactive")) {
                    input.classList.toggle("inactive", shouldBeInactive);
                    input.classList.toggle("locked", shouldBeInactive);
                }

                // 3. Update 'disabled' attribute only if it has changed
                const shouldBeDisabled = index > activeSlotIndex;
                if (shouldBeDisabled !== input.disabled) {
                    input.disabled = shouldBeDisabled;
                }

                // 4. Update 'readonly' attribute only if it has changed
                const shouldBeReadonly = index < activeSlotIndex;
                if (shouldBeReadonly !== input.readOnly) {
                    input.readOnly = shouldBeReadonly;
                }

                // 5. Update 'tabindex' attribute only if it has changed
                const newTabIndex = isActive ? "0" : "-1";
                if (input.getAttribute("tabindex") !== newTabIndex) {
                    input.setAttribute("tabindex", newTabIndex);
                }
            });

            // Only auto-focus if shouldAutoFocus is true
            if (shouldAutoFocus) {
                const activeInput = inputs[activeSlotIndex];
                if (activeInput && document.activeElement !== activeInput) {
                    activeInput.focus();
                }

                const inputToForceCaretOn = focusedInput || activeInput;
                if (inputToForceCaretOn) {
                    forceCaretAtEnd(inputToForceCaretOn);
                }
            }
        };

        // Initialize states without auto-focusing on first load
        updateInputStates(null, false);
        window.updateOtpInputStates = (focusedInput = null) =>
            updateInputStates(focusedInput, true);

        otpWrapper.addEventListener("focusin", (e) => {
            if (e.target.classList.contains("otp-input")) {
                updateInputStates(e.target, true);
            }
        });

        otpWrapper.addEventListener("click", (e) => {
            if (
                (e.target.classList.contains("otp-input") && e.target.disabled) ||
                e.target === otpWrapper ||
                e.target.classList.contains("otp-input-container")
            ) {
                e.preventDefault();
                const activeInput = inputs.find(
                    (input) => !input.disabled && !input.readOnly
                );
                if (activeInput) {
                    activeInput.focus();
                }
            }
        });

        otpWrapper.addEventListener("mouseup", (e) => {
            if (e.target.classList.contains("otp-input")) {
                forceCaretAtEnd(e.target);
            }
        });

        otpWrapper.addEventListener("input", (e) => {
            const target = e.target;
            if (!target.classList.contains("otp-input")) return;

            const value = target.value.trim();
            target.value = value.toUpperCase().slice(-1);

            if (target.value && target.nextElementSibling) {
                setTimeout(() => target.nextElementSibling.focus(), 0);
            }
            updateInputStates(target, true);
        });

        otpWrapper.addEventListener("keydown", (e) => {
            const target = e.target;
            if (!target.classList.contains("otp-input")) return;

            const currentIndex = inputs.indexOf(target);

            switch (e.key) {
                case "Backspace":
                    e.preventDefault();
                    if (otpWrapper.classList.contains("input-error")) {
                        otpWrapper.classList.remove("input-error");
                        lastOtpErrorSnapshot = null;
                    }
                    if (target.value) {
                        target.value = "";
                    } else if (currentIndex > 0) {
                        inputs[currentIndex - 1].value = "";
                        inputs[currentIndex - 1].focus();
                    }
                    break;
                case "Delete":
                    e.preventDefault();
                    if (otpWrapper.classList.contains("input-error")) {
                        otpWrapper.classList.remove("input-error");
                        lastOtpErrorSnapshot = null;
                    }
                    target.value = "";
                    if (target.nextElementSibling) {
                        setTimeout(() => target.nextElementSibling.focus(), 0);
                    }
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    if (currentIndex > 0) inputs[currentIndex - 1].focus();
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    if (currentIndex < inputs.length - 1)
                        inputs[currentIndex + 1].focus();
                    break;
                case "Enter":
                    e.preventDefault();
                    attemptToJoinFlight();
                    break;
            }
            updateInputStates(document.activeElement, true);
        });

        otpWrapper.addEventListener("paste", (e) => {
            e.preventDefault();
            const pasteData = (e.clipboardData || window.clipboardData)
                .getData("text")
                .trim()
                .toUpperCase();
            if (/^[A-Z0-9]{6}$/.test(pasteData)) {
                inputs.forEach((input, index) => {
                    input.value = pasteData[index] || "";
                });
                inputs[inputs.length - 1].focus();
                otpWrapper.classList.remove("input-error");
                lastOtpErrorSnapshot = null;
            }
            updateInputStates(null, true);
        });
    }

    let qrScanner = null;
    const stopScanner = () => {
        if (qrScanner) {
            qrScanner.stop();
            qrScanner.destroy();
            qrScanner = null;
        }
        uiElements.qrScannerOverlay.classList.remove("show");
    };

    uiElements.scanQrBtn?.addEventListener("click", async () => {
        if (qrScanner) return;
        uiElements.qrScannerOverlay.classList.add("show");
        try {
            qrScanner = new QrScanner(
                uiElements.qrVideo,
                (result) => {
                    try {
                        const url = new URL(result.data);
                        const code = url.searchParams.get("code");
                        if (code && code.length === 6) {
                            const inputs =
                                uiElements.flightCodeInputWrapper.querySelectorAll(".otp-input");
                            const codeUpper = code.toUpperCase();
                            inputs.forEach((input, index) => {
                                input.value = codeUpper[index] || "";
                            });
                            if (window.updateOtpInputStates) window.updateOtpInputStates();
                            stopScanner();
                            uiElements.joinFlightBtn.click();
                        } else {
                            showToast({
                                type: "danger",
                                title: i18next.t("invalidQrCode"),
                                body: i18next.t("invalidQrCodeDescription"),
                            });
                            stopScanner();
                        }
                    } catch {
                        showToast({
                            type: "danger",
                            title: i18next.t("invalidQrCode"),
                            body: i18next.t("notDropSilkLink"),
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
            console.error("QR Scanner Error:", error);
            showToast({
                type: "danger",
                title: i18next.t("cameraError"),
                body: i18next.t("cameraErrorDescription"),
                duration: 8000,
            });
            stopScanner();
        }
    });

    uiElements.closeQrScannerBtn?.addEventListener("click", stopScanner);

    uiElements.leaveFlightBtnDashboard?.addEventListener("click", () =>
        location.reload()
    );

    // --- NON-INVASIVE FILE & FOLDER SELECTION ---

    // 1. Original web-based file/folder input fallback
    if (uiElements.fileInputTransfer) {
        uiElements.fileInputTransfer.onchange = () => {
            if (uiElements.fileInputTransfer.files.length > 0) {
                handleFileSelection(uiElements.fileInputTransfer.files);
                uiElements.fileInputTransfer.value = "";
            }
        };
    }
    folderInputTransfer.onchange = () => {
        if (folderInputTransfer.files.length > 0) {
            handleFolderSelection(folderInputTransfer.files);
            folderInputTransfer.value = "";
        }
    };

    // 2. Electron-specific enhancement (if available)
    if (window.electronAPI) {
        const selectFilesBtn = document.querySelector(
            'label[for="fileInput_transfer"]'
        );
        if (selectFilesBtn) {
            selectFilesBtn.onclick = async (e) => {
                e.preventDefault();
                const filesData = await window.electronAPI.selectFiles();
                if (filesData.length > 0) {
                    const fileObjects = filesData.map(
                        (f) => new File([f.data], f.name, {
                            type: getMimeTypeFromPath(f.name),
                            path: f.path
                        })
                    );
                    handleFileSelection(fileObjects);
                }
            };
        }

        if (uiElements.selectFolderBtn) {
            uiElements.selectFolderBtn.onclick = async () => {
                const filesData = await window.electronAPI.selectFolder();
                if (filesData.length > 0) {
                    const fileObjects = filesData.map(
                        (f) => new File([f.data], f.name, {
                            type: getMimeTypeFromPath(f.name),
                            path: f.path
                        })
                    );
                    handleFolderSelection(fileObjects);
                }
            };
        }
    } else {
        uiElements.selectFolderBtn?.addEventListener("click", () =>
            folderInputTransfer.click()
        );
    }

    if (uiElements.sendingQueueDiv) {
        uiElements.sendingQueueDiv.addEventListener("click", (e) => {
            const cancelBtn = e.target.closest(".cancel-file-btn");
            if (cancelBtn) {
                const fileId = cancelBtn.dataset.fileId;
                if (fileId) cancelFileSend(fileId);
            }
        });
        initializeSortableQueue();
    }

    uiElements.connectionPanelList?.addEventListener("click", (e) => {
        const inviteBtn = e.target.closest(".invite-user-btn");
        if (inviteBtn && !inviteBtn.disabled) {
            const inviteeId = inviteBtn.dataset.inviteeId;
            const {currentFlightCode} = store.getState();
            if (inviteeId && currentFlightCode) {
                sendMessage({
                    type: "invite-to-flight",
                    inviteeId,
                    flightCode: currentFlightCode,
                });
                inviteBtn.textContent = i18next.t("invited");
                inviteBtn.disabled = true;
                setTimeout(() => {
                    const currentBtn = document.querySelector(
                        `.invite-user-btn[data-invitee-id="${inviteeId}"]`
                    );
                    if (currentBtn) {
                        currentBtn.textContent = i18next.t("invite");
                        currentBtn.disabled = false;
                    }
                }, 3000);
            }
        }
    });

    uiElements.dashboardFlightCodeBtn?.addEventListener("click", async () => {
        const code = uiElements.dashboardFlightCodeBtn.getAttribute("data-code");
        if (!code) return;
        if (navigator.vibrate) navigator.vibrate([50, 40, 15]);
        await navigator.clipboard.writeText(code);
        uiElements.dashboardFlightCodeBtn.classList.add("copied");
        setTimeout(
            () => uiElements.dashboardFlightCodeBtn.classList.remove("copied"),
            1200
        );
    });

    document
        .getElementById("shareAppBtn")
        ?.addEventListener("click", () =>
            document.getElementById("inviteBtn").click()
        );

    document.getElementById("shareScreenBtn")?.addEventListener("click", () => {
        const btn = document.getElementById("shareScreenBtn");
        const isSharing = btn.classList.contains("is-sharing");
        if (isSharing) stopScreenShare();
        else startScreenShare();
    });

    setupDragAndDrop();
    setupDonateButton();
}

function setupDonateButton() {
    const donateButtons = [
        document.getElementById("donateBtnHeader"),
        document.getElementById("ko-fiBtn"),
    ];
    const kofiIframe = document.getElementById("kofiframe");

    if (!kofiIframe) return;

    const loadKoFi = () => {
        if (kofiIframe.getAttribute("src")) return;
        const src = kofiIframe.getAttribute("data-src");
        if (src) kofiIframe.setAttribute("src", src);
    };

    donateButtons.forEach((btn) => {
        if (btn) btn.addEventListener("click", loadKoFi);
    });
}

function setupDragAndDrop() {
    const dropZone = uiElements.dropZone;
    if (!dropZone) return;

    let dragCounter = 0;

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) =>
        document.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        })
    );
    ["dragenter", "dragover"].forEach((eventName) =>
        dropZone.addEventListener(eventName, handleDragEnter, false)
    );
    ["dragleave", "drop"].forEach((eventName) =>
        dropZone.addEventListener(eventName, handleDragLeave, false)
    );
    dropZone.addEventListener("drop", handleDrop, false);

    document.addEventListener("dragenter", (e) => {
        if (e.dataTransfer.types.includes("Files")) {
            dragCounter++;
            uiElements.body.classList.add("dragging");
        }
    });
    document.addEventListener("dragleave", () => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            uiElements.body.classList.remove("dragging");
        }
    });
    document.addEventListener("drop", () => {
        dragCounter = 0;
        uiElements.body.classList.remove("dragging");
    });

    function handleDragEnter(e) {
        if (dropZone.classList.contains("disabled")) return;
        dropZone.classList.add("drag-over");
    }

    function handleDragLeave() {
        if (dropZone.classList.contains("disabled")) return;
        dropZone.classList.remove("drag-over", "drag-active");
    }

    function handleDrop(e) {
        if (dropZone.classList.contains("disabled")) return;
        dropZone.classList.remove("drag-over", "drag-active");
        handleFileSelection(e.dataTransfer.files);
    }
}