/**
 * @jest-environment jsdom
 */

// Import modules to test
import { store } from '../src/js/state.js';
import { formatBytes, generateRandomName, getFileIcon } from '../src/js/utils/helpers.js';
import { handleFileSelection, cancelFileSend, startFileSend, drainQueue, handleDataChannelMessage, resetTransferState } from '../src/js/transfer/fileHandler.js';
import { isPreviewable } from '../src/js/preview/previewConfig.js';
import { initializeModals } from '../src/js/ui/modals.js';
import { initializeEventListeners, setOtpInputError } from '../src/js/ui/events.js';
import { uiElements } from '../src/js/ui/dom.js';
import { initializePeerConnection, handleSignal } from '../src/js/network/webrtc.js';

// Mock dependencies that are imported inside the modules
jest.mock('../src/js/network/webrtc.js', () => ({
    ...jest.requireActual('../src/js/network/webrtc.js'),
    sendData: jest.fn(),
    getBufferedAmount: jest.fn(() => 0),
}));

jest.mock('../src/js/network/websocket.js', () => ({
    sendMessage: jest.fn(),
}));

jest.mock('../src/js/utils/toast.js', () => ({
    showToast: jest.fn(),
}));

jest.mock('../src/js/ui/view.js', () => ({
    ...jest.requireActual('../src/js/ui/view.js'),
    renderInFlightView: jest.fn(),
    renderNetworkUsersView: jest.fn(),
    updateReceiverActions: jest.fn(),
    checkQueueOverflow: jest.fn(),
    showRemoteStreamView: jest.fn(),
    hideRemoteStreamView: jest.fn()
}));


describe('DropSilk Frontend Test Suite', () => {

    // Reset state before each test
    beforeEach(() => {
        store.actions.resetState();
        // Re-load HTML and re-attach listeners before each test to ensure a clean slate
        document.body.innerHTML = require('fs').readFileSync(require('path').resolve(__dirname, '../index.html'), 'utf8');
        initializeEventListeners();
        initializeModals();
    });

    //============================================
    // 1. State Management (state.js)
    //============================================
    describe('State Management', () => {
        it('should initialize with a random name and default state', () => {
            store.actions.initializeUser();
            const state = store.getState();
            expect(state.myName).not.toBe('');
            expect(state.myId).toBe('');
            expect(state.peerInfo).toBeNull();
        });

        it('should add files to the send queue', () => {
            const files = [new File([''], 'file1.txt'), new File([''], 'file2.txt')];
            store.actions.addFilesToQueue(files);
            expect(store.getState().fileToSendQueue.length).toBe(2);
            expect(store.getState().fileToSendQueue[0].name).toBe('file1.txt');
        });

        it('should correctly finish a file send and remove it from the queue', () => {
            const file1 = new File([''], 'file1.txt');
            const file2 = new File([''], 'file2.txt');
            store.actions.addFilesToQueue([file1, file2]);
            store.actions.setCurrentlySendingFile(file1);

            store.actions.finishCurrentFileSend(file1);

            const state = store.getState();
            expect(state.currentlySendingFile).toBeNull();
            expect(state.fileToSendQueue.length).toBe(1);
            expect(state.fileToSendQueue[0].name).toBe('file2.txt');
        });

        it('should reset state while preserving onboarding status', () => {
            store.actions.updateOnboardingState('welcome');
            store.actions.setMyId('123');
            expect(store.getState().onboardingState.welcome).toBe(true);

            store.actions.resetState();

            const state = store.getState();
            expect(state.myId).toBe(''); // a core value that gets reset
            expect(state.onboardingState.welcome).toBe(true); // onboarding state is preserved
        });
    });

    //============================================
    // 2. Utility Functions (helpers.js)
    //============================================
    describe('Utility Functions', () => {
        it('formatBytes should format bytes correctly', () => {
            expect(formatBytes(0)).toBe('0 Bytes');
            expect(formatBytes(1024)).toBe('1 KB');
            expect(formatBytes(1500, 0)).toBe('1 KB');
            expect(formatBytes(1024 * 1024 * 5.25)).toBe('5.25 MB');
        });

        it('generateRandomName should return a string', () => {
            expect(typeof generateRandomName()).toBe('string');
            expect(generateRandomName().length).toBeGreaterThan(5);
        });

        it('getFileIcon should return an SVG string', () => {
            expect(getFileIcon('image.jpg')).toContain('<svg');
            expect(getFileIcon('archive.zip')).toContain('<svg');
            expect(getFileIcon('document.pdf')).toContain('<svg');
            expect(getFileIcon('unknown.xyz')).toContain('<svg');
        });
    });

    //============================================
    // 3. UI and Events (events.js, modals.js, view.js)
    //============================================
    describe('UI and Events', () => {
        it('should open and close the invite modal', () => {
            const inviteModal = document.getElementById('inviteModal');
            const inviteBtn = document.getElementById('inviteBtn');
            const closeBtn = document.getElementById('closeInviteModal');

            // Set a flight code so the modal opens
            store.actions.setCurrentFlightCode('TESTCD');

            expect(inviteModal.classList.contains('show')).toBe(false);
            inviteBtn.click();
            expect(inviteModal.classList.contains('show')).toBe(true);
            closeBtn.click();
            expect(inviteModal.classList.contains('show')).toBe(false);
        });

        it('should toggle theme and update localStorage', () => {
            const themeToggle = document.getElementById('theme-toggle');
            const body = document.body;

            expect(body.getAttribute('data-theme')).not.toBe('dark');
            expect(localStorage.getItem('dropsilk-theme')).toBeNull();

            themeToggle.click();
            expect(body.getAttribute('data-theme')).toBe('dark');
            expect(localStorage.getItem('dropsilk-theme')).toBe('dark');

            themeToggle.click();
            expect(body.getAttribute('data-theme')).toBe('light');
            expect(localStorage.getItem('dropsilk-theme')).toBe('light');
        });

        it('should handle OTP input correctly', () => {
            const inputs = Array.from(uiElements.flightCodeInputWrapper.querySelectorAll('.otp-input'));
            const joinBtn = document.getElementById('joinFlightBtn');
            const { sendMessage } = require('../src/js/network/websocket.js');

            inputs[0].value = 'A';
            inputs[0].dispatchEvent(new Event('input'));
            inputs[1].value = 'B';
            inputs[1].dispatchEvent(new Event('input'));
            inputs[2].value = 'C';
            inputs[2].dispatchEvent(new Event('input'));
            inputs[3].value = '1';
            inputs[3].dispatchEvent(new Event('input'));
            inputs[4].value = '2';
            inputs[4].dispatchEvent(new Event('input'));
            inputs[5].value = '3';
            inputs[5].dispatchEvent(new Event('input'));

            joinBtn.click();

            expect(sendMessage).toHaveBeenCalledWith({
                type: 'join-flight',
                flightCode: 'ABC123'
            });
        });

        it('should show error state on OTP input', () => {
            setOtpInputError('FAIL');
            expect(uiElements.flightCodeInputWrapper.classList.contains('input-error')).toBe(true);
        });
    });

    //============================================
    // 4. File Transfer Logic (fileHandler.js)
    //============================================
    describe('File Transfer Logic', () => {
        const { sendData, getBufferedAmount } = require('../src/js/network/webrtc.js');

        it('handleFileSelection should add files to queue and update UI', () => {
            const files = [new File(['content'], 'test.txt', { type: 'text/plain' })];
            handleFileSelection(files);

            expect(store.getState().fileToSendQueue.length).toBe(1);
            expect(document.querySelector('.queue-item')).not.toBeNull();
            expect(document.querySelector('.file-details__name span').textContent).toBe('test.txt');
        });

        it('drainQueue should send chunks when buffer is not full', () => {
            const file = new File(['a'.repeat(500)], 'large.txt');
            store.actions.addFilesToQueue([file]);
            startFileSend(file);

            const mockChunk = new ArrayBuffer(100);

            // This is a way to modify the internal state of the module for testing
            const fileHandlerModule = require('../src/js/transfer/fileHandler.js');
            const chunkQueue = [];
            Object.defineProperty(fileHandlerModule, 'chunkQueue', {
                get: () => chunkQueue,
                configurable: true,
            });
            chunkQueue.push(mockChunk, mockChunk);

            getBufferedAmount.mockReturnValue(50);
            drainQueue();

            expect(sendData).toHaveBeenCalledTimes(2 + 1); // +1 for the initial metadata call
            expect(sendData).toHaveBeenCalledWith(mockChunk);
        });

        it('handleDataChannelMessage should process file metadata and EOF', async () => {
            const metadata = { name: 'incoming.txt', type: 'text/plain', size: 100 };
            const eof = 'EOF';

            await handleDataChannelMessage({ data: JSON.stringify(metadata) });
            expect(document.querySelector('.receiver-queue .queue-item')).not.toBeNull();
            expect(document.querySelector('.receiver-queue .file-details__name span').textContent).toBe('incoming.txt');
            expect(store.getState().receivedFiles.length).toBe(0);

            await handleDataChannelMessage({ data: eof });
            expect(store.getState().receivedFiles.length).toBe(1);
            expect(store.getState().receivedFiles[0].name).toBe('incoming.txt');
            expect(store.getState().receivedFiles[0].blob).toBeInstanceOf(Blob);
            expect(document.querySelector('.save-btn')).not.toBeNull();
        });

        it('resetTransferState should clear all transfer-related state', () => {
            const file = new File([''], 'test.txt');
            store.actions.addFilesToQueue([file]);
            store.actions.setCurrentlySendingFile(file);
            resetTransferState();
            const state = store.getState();
            expect(state.currentlySendingFile).toBeNull();
            expect(state.fileToSendQueue.length).toBe(0);
        });
    });


    //============================================
    // 5. Preview System (previewManager.js)
    //============================================
    describe('File Preview System', () => {
        afterEach(() => {
            jest.resetModules();
        });

        it('isPreviewable should return true for supported extensions and false otherwise', () => {
            expect(isPreviewable('image.jpg')).toBe(true);
            expect(isPreviewable('document.pdf')).toBe(true);
            expect(isPreviewable('code.js')).toBe(true);
            expect(isPreviewable('archive.zip')).toBe(false);
            expect(isPreviewable('filewithnoextension')).toBe(false);
        });

        it('showPreview should call the correct handler for a given file type', async () => {
            const mockImagePreview = jest.fn().mockResolvedValue();

            jest.doMock('../src/js/preview/handlers/imagePreview.js', () => ({
                __esModule: true,
                default: mockImagePreview,
            }), { virtual: true });

            jest.doMock('../src/js/preview/previewConfig.js', () => ({
                previewConfig: {
                    image: {
                        extensions: ['png'],
                        handler: () => import('../src/js/preview/handlers/imagePreview.js'),
                    },
                },
                isPreviewable: jest.requireActual('../src/js/preview/previewConfig.js').isPreviewable,
            }));

            const { showPreview } = require('../src/js/preview/previewManager.js');

            const blob = new Blob([''], { type: 'image/png' });
            const file = { name: 'test.png', blob };
            store.actions.addReceivedFile(file);

            await showPreview('test.png');

            expect(document.getElementById('previewModal').classList.contains('show')).toBe(true);
            expect(mockImagePreview).toHaveBeenCalled();
            expect(mockImagePreview).toHaveBeenCalledWith(blob, document.getElementById('preview-content'));
        });

        it('showPreview should handle consent flow for PPTX files', async () => {
            const mockPptxPreview = jest.fn().mockResolvedValue();

            jest.doMock('../src/js/preview/handlers/pptxPreview.js', () => ({
                default: mockPptxPreview
            }), { virtual: true });

            jest.doMock('../src/js/preview/previewConfig.js', () => ({
                previewConfig: {
                    pptx: {
                        extensions: ['pptx'],
                        handler: () => import('../src/js/preview/handlers/pptxPreview.js'),
                        requiresUploadConsent: true,
                    },
                },
                isPreviewable: jest.requireActual('../src/js/preview/previewConfig.js').isPreviewable,
            }));

            const { showToast } = require('../src/js/utils/toast.js');
            showToast.mockImplementation(({ actions }) => {
                const continueAction = actions.find(a => a.text === 'continue' || a.text === 'pptxConsentRemember');
                if (continueAction) {
                    continueAction.callback();
                }
                return { element: document.createElement('div') };
            });

            const { showPreview } = require('../src/js/preview/previewManager.js');

            const blob = new Blob([''], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
            const file = { name: 'presentation.pptx', blob };
            store.actions.addReceivedFile(file);

            await showPreview('presentation.pptx');

            expect(showToast).toHaveBeenCalled();
            expect(mockPptxPreview).toHaveBeenCalled();
        });
    });

    //============================================
    // 6. WebRTC Networking (webrtc.js)
    //============================================
    describe('WebRTC Networking', () => {
        it('initializePeerConnection should create an RTCPeerConnection', () => {
            initializePeerConnection(true); // isOfferer = true
            expect(global.RTCPeerConnection).toHaveBeenCalled();
        });

        it('handleSignal should process SDP offers and create answers', async () => {
            initializePeerConnection(false); // isOfferer = false, will receive offer
            const offer = { type: 'offer', sdp: 'test-offer' };

            await handleSignal({ sdp: offer });

            const pcInstance = global.RTCPeerConnection.mock.results[0].value;
            expect(pcInstance.setRemoteDescription).toHaveBeenCalledWith(expect.any(Object));
            expect(pcInstance.createAnswer).toHaveBeenCalled();
            expect(pcInstance.setLocalDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'mock-answer' });
        });

        it('handleSignal should process ICE candidates', async () => {
            initializePeerConnection(true);
            const candidate = { candidate: 'test-candidate', sdpMid: '1', sdpMLineIndex: 0 };

            await handleSignal({ candidate: candidate });

            const pcInstance = global.RTCPeerConnection.mock.results[0].value;
            expect(pcInstance.addIceCandidate).toHaveBeenCalledWith(expect.any(Object));
        });
    });
});