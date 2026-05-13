import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleFileSelection = vi.fn();
const showToast = vi.fn();

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
    handleFileSelection,
    handleFolderSelection: vi.fn(),
    cancelFileSend: vi.fn(),
}));

vi.mock('../src/js/utils/toast.js', () => ({
    showToast,
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

describe('Electron file picker', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        document.body.innerHTML = `
            <div class="drop-zone">
                <p></p>
                <div class="drop-zone__buttons">
                    <label for="fileInput_transfer" class="btn btn-primary">Select Files</label>
                    <button class="btn btn-secondary" type="button">Select Folder</button>
                </div>
            </div>
            <input type="file" id="fileInput_transfer" style="display:none" multiple />
        `;

        window.electronAPI = {
            selectFiles: vi.fn().mockResolvedValue([
                {
                    name: 'slides.pptx',
                    path: '/tmp/slides.pptx',
                    data: new Uint8Array([1, 2, 3]),
                },
            ]),
            selectFolder: vi.fn().mockResolvedValue([]),
        };
    });

    it('prevents the label default and only uses the Electron picker', async () => {
        const { initializeEventListeners } = await import('../src/js/ui/events.js');
        initializeEventListeners();

        const selectFilesBtn = document.querySelector('label[for="fileInput_transfer"]');
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        const dispatchResult = selectFilesBtn.dispatchEvent(clickEvent);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(dispatchResult).toBe(false);
        expect(clickEvent.defaultPrevented).toBe(true);
        expect(window.electronAPI.selectFiles).toHaveBeenCalledTimes(1);
        expect(handleFileSelection).toHaveBeenCalledTimes(1);
        expect(handleFileSelection.mock.calls[0][0][0].name).toBe('slides.pptx');
        expect(showToast).not.toHaveBeenCalled();
    });
});
