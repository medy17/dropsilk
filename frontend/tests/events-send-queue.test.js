import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancelFileSend = vi.fn();

vi.mock('../src/js/i18n.js', () => ({
    default: {
        t: (key) => key,
    },
}));

vi.mock('../src/js/state.js', () => ({
    store: {
        getState: vi.fn(() => ({
            peerInfo: { id: 'peer-1' },
            roomPeer: null,
        })),
        actions: {
            setIsFlightCreator: vi.fn(),
            reorderQueueByDom: vi.fn(),
        },
    },
}));

vi.mock('../src/js/network/websocket.js', () => ({
    sendMessage: vi.fn(),
}));

vi.mock('../src/js/network/roomSession.js', () => ({
    createRoomFlow: vi.fn(),
    joinRoomFlow: vi.fn(),
}));

vi.mock('../src/js/network/screenShareSession.js', () => ({
    startScreenShare: vi.fn(),
    stopScreenShare: vi.fn(),
}));

vi.mock('../src/js/transfer/fileHandler.js', () => ({
    handleFileSelection: vi.fn(),
    handleFolderSelection: vi.fn(),
    cancelFileSend,
}));

vi.mock('../src/js/utils/toast.js', () => ({
    showToast: vi.fn(),
}));

vi.mock('qr-scanner', () => ({
    default: class MockQrScanner {},
}));

vi.mock('sortablejs', () => ({
    default: class MockSortable {},
}));

vi.mock('../src/js/ui/view.js', () => ({
    clearAllPulseEffects: vi.fn(),
}));

vi.mock('../src/js/features/chat/index.js', () => ({
    setupChat: vi.fn(),
}));

describe('Send queue cancellation', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        document.body.innerHTML = `
            <div class="main-content"></div>
            <button id="createFlightBtn"></button>
            <button id="joinFlightBtn"></button>
            <div class="flight-code-input-wrapper"></div>
            <div id="sending-queue">
                <div class="queue-item" id="send-1">
                    <div class="file-details">draft.pdf</div>
                    <div class="file-action">
                        <button class="file-action-btn cancel-file-btn" data-file-id="send-1" type="button">Cancel</button>
                    </div>
                </div>
            </div>
            <div id="receiver-queue"></div>
            <div class="drop-zone">
                <p></p>
                <span class="secondary-text"></span>
                <div class="drop-zone__buttons">
                    <label for="fileInput_transfer"></label>
                    <button class="btn-secondary" type="button"></button>
                </div>
            </div>
            <input type="file" id="fileInput_transfer" />
            <div id="toast-container"></div>
            <div id="connection-panel-list"></div>
            <h3 id="connection-panel-title"></h3>
            <div id="dashboard-flight-status"></div>
        `;

        delete window.electronAPI;
    });

    it('does not cancel when clicking a queue item outside the cancel button', async () => {
        const { initializeEventListeners } = await import('../src/js/ui/events.js');
        initializeEventListeners();

        document.querySelector('.file-details').dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
        );

        expect(cancelFileSend).not.toHaveBeenCalled();
    });

    it('cancels when clicking the cancel button', async () => {
        const { initializeEventListeners } = await import('../src/js/ui/events.js');
        initializeEventListeners();

        document.querySelector('.cancel-file-btn').dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
        );

        expect(cancelFileSend).toHaveBeenCalledWith('send-1');
    });
});
