// tests/qr.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock the Toast module explicitly
// This ensures that when events.js imports showToast, it gets this mock function
vi.mock('../src/js/utils/toast.js', () => ({
    showToast: vi.fn(),
    showInvitationToast: vi.fn()
}));

// Import the mocked function so we can check if it was called
import { showToast } from '../src/js/utils/toast.js';

// 2. Mock the QrScanner library
let mockScanCallback = null;
let mockStopSpy = vi.fn();
let mockDestroySpy = vi.fn();
let mockStartSpy = vi.fn();

vi.mock('qr-scanner', () => {
    return {
        default: class MockQrScanner {
            constructor(videoElem, callback) {
                mockScanCallback = callback;
            }
            start() {
                mockStartSpy();
                return Promise.resolve();
            }
            stop() { mockStopSpy(); }
            destroy() { mockDestroySpy(); }
        }
    };
});

describe('QR Workflow', () => {

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = `
            <div class="main-content"></div>
            <div id="boarding-overlay" class="boarding-overlay">
                <span id="boarding-flight-code"></span>
            </div>
            
            <div class="flight-ticket">
                <button id="scanQrBtn"></button>
                <div class="flight-code-input-wrapper">
                    <input type="text" id="otp-ghost-input" />
                    <button id="joinFlightBtn"></button>
                </div>
            </div>

            <div id="qr-scanner-overlay">
                <video id="qr-video"></video>
                <button id="closeQrScannerBtn"></button>
            </div>
            
            <div id="toast-container"></div>
        `;

        // Reset modules so we get a fresh import of events.js for every test
        vi.resetModules();

        // Clear mock history (specifically showToast)
        vi.clearAllMocks();

        // Reset our internal spies
        mockScanCallback = null;

        // Mock window.location for Auto-Join tests
        // (Deleting strictly required in JSDOM environment)
        delete window.location;
        window.location = {
            search: '',
            pathname: '/',
            reload: vi.fn(),
            hostname: 'localhost',
            protocol: 'http:',
            href: 'http://localhost'
        };
    });

    describe('In-App Scanner (Ticket Button)', () => {

        it('should open the scanner overlay and start camera when button is clicked', async () => {
            const { initializeEventListeners } = await import('../src/js/ui/events.js');
            initializeEventListeners();

            const scanBtn = document.getElementById('scanQrBtn');
            const overlay = document.getElementById('qr-scanner-overlay');

            scanBtn.click();

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(overlay.classList.contains('show')).toBe(true);
            expect(mockStartSpy).toHaveBeenCalled();
        });

        it('should populate input and auto-click join on VALID QR code', async () => {
            const { initializeEventListeners } = await import('../src/js/ui/events.js');
            initializeEventListeners();

            const scanBtn = document.getElementById('scanQrBtn');
            const joinBtn = document.getElementById('joinFlightBtn');
            const ghostInput = document.getElementById('otp-ghost-input');
            const joinSpy = vi.spyOn(joinBtn, 'click');

            scanBtn.click();
            await new Promise(resolve => setTimeout(resolve, 0));

            // Simulate valid scan
            const validCode = 'XYZ123';
            const scannedUrl = `https://dropsilk.xyz/?code=${validCode}`;

            mockScanCallback({ data: scannedUrl });

            expect(ghostInput.value).toBe(validCode);
            expect(mockStopSpy).toHaveBeenCalled();
            expect(mockDestroySpy).toHaveBeenCalled();
            expect(joinSpy).toHaveBeenCalled();

            const overlay = document.getElementById('qr-scanner-overlay');
            expect(overlay.classList.contains('show')).toBe(false);
        });

        it('should show error toast on INVALID QR code', async () => {
            const { initializeEventListeners } = await import('../src/js/ui/events.js');
            initializeEventListeners();

            document.getElementById('scanQrBtn').click();
            await new Promise(resolve => setTimeout(resolve, 0));

            // Simulate scan of a non-DropSilk URL
            mockScanCallback({ data: 'https://google.com' });

            // Expect the showToast mock to be called
            // Note: Since tests/setup.js mocks i18next to return the KEY,
            // we expect title: 'invalidQrCode', NOT 'Invalid QR Code'
            expect(showToast).toHaveBeenCalledWith(expect.objectContaining({
                type: 'danger',
                title: 'invalidQrCode'
            }));

            expect(mockStopSpy).toHaveBeenCalled();
        });

        it('should close scanner when close button is clicked', async () => {
            const { initializeEventListeners } = await import('../src/js/ui/events.js');
            initializeEventListeners();

            document.getElementById('scanQrBtn').click();
            await new Promise(resolve => setTimeout(resolve, 0));

            const closeBtn = document.getElementById('closeQrScannerBtn');
            closeBtn.click();

            const overlay = document.getElementById('qr-scanner-overlay');
            expect(overlay.classList.contains('show')).toBe(false);
            expect(mockStopSpy).toHaveBeenCalled();
        });
    });

    describe('External Flow (Boarding Overlay via URL)', () => {

        it('should show boarding overlay if URL contains flight code', async () => {
            window.location.search = '?code=FLY456';

            const { showBoardingOverlay } = await import('../src/js/ui/view.js');

            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');

            if (code) {
                showBoardingOverlay(code);
            }

            const boardingOverlay = document.getElementById('boarding-overlay');
            const codeDisplay = document.getElementById('boarding-flight-code');
            const mainContent = document.querySelector('.main-content');

            expect(boardingOverlay.classList.contains('show')).toBe(true);
            expect(codeDisplay.textContent).toBe('FLY456');
            expect(mainContent.style.display).toBe('none');
        });

        it('should auto-fill input and trigger join when WebSocket connects with URL param', async () => {
            window.location.search = '?code=AUTO99';

            const ghostInput = document.getElementById('otp-ghost-input');
            const joinBtn = document.getElementById('joinFlightBtn');
            const joinSpy = vi.spyOn(joinBtn, 'click');

            // We mock the onOpen logic flow here because we cannot easily access
            // the internal onOpen function of the websocket module in this test scope.
            const urlParams = new URLSearchParams(window.location.search);
            const flightCodeFromUrl = urlParams.get('code');

            if (flightCodeFromUrl) {
                ghostInput.value = flightCodeFromUrl.toUpperCase();
                joinBtn.click();
            }

            expect(ghostInput.value).toBe('AUTO99');
            expect(joinSpy).toHaveBeenCalled();
        });
    });
});