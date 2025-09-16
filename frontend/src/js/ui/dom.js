// js/ui/dom.js
// This file centralizes all DOM element queries for the application.

export const uiElements = {
    body: document.body,

    // Setup Screen
    setupContainer: document.querySelector(".main-content"),
    userNameDisplay: document.getElementById("userNameDisplay"),
    createFlightBtn: document.getElementById("createFlightBtn"),
    joinFlightBtn: document.getElementById("joinFlightBtn"),
    flightCodeInput: document.getElementById("flightCodeInput"),
    flightCodeInputWrapper: document.querySelector('.flight-code-input-wrapper'),

    // Scan QR Code
    scanQrBtn: document.getElementById('scanQrBtn'),
    qrScannerOverlay: document.getElementById('qr-scanner-overlay'),
    qrVideo: document.getElementById('qr-video'),
    closeQrScannerBtn: document.getElementById('closeQrScannerBtn'),

    // Boarding Overlay
    boardingOverlay: document.getElementById('boarding-overlay'),

    // Dashboard
    dashboard: document.getElementById("dashboard"),
    dashboardFlightCodeBtn: document.getElementById("dashboard-flight-code"),
    dashboardFlightStatus: document.getElementById("dashboard-flight-status"),
    leaveFlightBtnDashboard: document.getElementById("leaveFlightBtnDashboard"),
    inviteBtn: document.getElementById('inviteBtn'),

    // File Transfer
    fileInputTransfer: document.getElementById("fileInput_transfer"),
    sendingQueueDiv: document.getElementById("sending-queue"),
    receiverQueueDiv: document.getElementById("receiver-queue"),
    dropZone: document.querySelector('.drop-zone'),
    dropZoneText: document.querySelector('.drop-zone p'),
    dropZoneSecondaryText: document.querySelector('.drop-zone .secondary-text'),
    selectFolderBtn: document.querySelector('.drop-zone__buttons button.btn-secondary'),
    receiverActionsContainer: document.getElementById('receiver-actions'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),
    selectAllZipCheckbox: document.getElementById('selectAllZipCheckbox'),
    zipFileList: document.getElementById('zip-file-list'),
    zipSelectionInfo: document.getElementById('zipSelectionInfo'),
    downloadSelectedBtn: document.getElementById('downloadSelectedBtn'),

    // Zip Modal Specific
    zipModalDefaultFooter: document.getElementById('zip-modal-default-footer'),
    zipModalWarningFooter: document.getElementById('zip-modal-warning-footer'),
    zipWarningText: document.getElementById('zipWarningText'),
    cancelZipBtn: document.getElementById('cancelZipBtn'),
    proceedZipBtn: document.getElementById('proceedZipBtn'),


    // Modals & Nav
    toastContainer: document.getElementById("toast-container"),
    settingsBtn: document.getElementById("settingsBtn"),

    // Metrics
    metricsSentEl: document.getElementById('metrics-sent'),
    metricsReceivedEl: document.getElementById('metrics-received'),
    metricsSpeedEl: document.getElementById('metrics-speed'),

    // Connection Panel
    connectionPanelTitle: document.getElementById("connection-panel-title"),
    connectionPanelList: document.getElementById("connection-panel-list"),

    // Onboarding
    welcomeOnboarding: document.getElementById('welcomeOnboarding'),
    inviteOnboarding: document.getElementById('inviteOnboarding'),
    dismissWelcomeBtn: document.getElementById('dismissWelcome'),
    dismissInviteBtn: document.getElementById('dismissInvite'),
};

// Create the folder input element dynamically
export const folderInputTransfer = document.createElement('input');
folderInputTransfer.type = 'file';
folderInputTransfer.style.display = 'none';
folderInputTransfer.webkitdirectory = true;
document.body.appendChild(folderInputTransfer);