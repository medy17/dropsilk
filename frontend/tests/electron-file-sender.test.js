import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const state = {
        peerInfo: { id: 'peer-1' },
        fileToSendQueue: [],
        currentlySendingFile: null,
        fileIdMap: new Map(),
    };

    return {
        state,
        sendData: vi.fn(),
        getBufferedAmount: vi.fn(() => 0),
        play: vi.fn(),
        showToast: vi.fn(),
        etrCalc: {
            reset: vi.fn(),
            update: vi.fn(),
            getETR: vi.fn(() => null),
        },
    };
});

vi.mock('../src/js/state.js', () => ({
    store: {
        getState: () => ({
            ...mocks.state,
            fileToSendQueue: [...mocks.state.fileToSendQueue],
        }),
        actions: {
            setCurrentlySendingFile: (file) => {
                mocks.state.currentlySendingFile = file;
            },
            getFileId: (file) => mocks.state.fileIdMap.get(file),
            finishCurrentFileSend: (file) => {
                mocks.state.currentlySendingFile = null;
                if (mocks.state.fileToSendQueue[0] === file) {
                    mocks.state.fileToSendQueue.shift();
                }
                mocks.state.fileIdMap.delete(file);
            },
            updateMetricsOnSend: vi.fn(),
            setCurrentlyReceivingFile: vi.fn(),
        },
    },
}));

vi.mock('../src/js/network/webrtc.js', () => ({
    sendData: mocks.sendData,
    getBufferedAmount: mocks.getBufferedAmount,
}));

vi.mock('../src/js/config.js', () => ({
    HIGH_WATER_MARK: 1024,
}));

vi.mock('../src/js/utils/audioManager.js', () => ({
    audioManager: {
        play: mocks.play,
    },
}));

vi.mock('../src/js/utils/toast.js', () => ({
    showToast: mocks.showToast,
}));

vi.mock('../src/js/ui/view.js', () => ({
    checkQueueOverflow: vi.fn(),
}));

vi.mock('../src/js/transfer/etrCalculator.js', () => ({
    createEtrCalculator: () => mocks.etrCalc,
    formatTimeRemaining: vi.fn(() => '1s'),
}));

vi.mock('../src/js/transfer/transferUI.js', () => ({
    createSendingItemHTML: vi.fn(
        (_file, fileId) => `
            <div class="file-icon"></div>
            <div class="file-details">
                <progress class="file-details__progress-bar" value="0" max="1"></progress>
                <div class="file-details__status">
                    <span class="percent">0%</span>
                    <span class="status-text">Sending...</span>
                </div>
            </div>
            <div class="file-action">
                <button class="file-action-btn cancel-file-btn" data-file-id="${fileId}"></button>
            </div>
        `,
    ),
}));

describe('Electron file sender', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        mocks.state.peerInfo = { id: 'peer-1' };
        mocks.state.fileToSendQueue = [];
        mocks.state.currentlySendingFile = null;
        mocks.state.fileIdMap = new Map();

        localStorage.clear();
        localStorage.setItem('dropsilk-chunk-size', '4');

        document.body.innerHTML = '<div id="send-1"></div>';

        window.electronAPI = {
            startReadSession: vi.fn().mockResolvedValue('session-1'),
            readFileChunk: vi
                .fn()
                .mockResolvedValueOnce(new Uint8Array([1, 2, 3, 4]))
                .mockResolvedValueOnce(new Uint8Array([5, 6])),
            closeReadSession: vi.fn().mockResolvedValue(true),
        };

        global.Worker = vi.fn();
    });

    it('streams Electron-selected files from disk instead of constructing a worker-backed File', async () => {
        const file = {
            name: 'large.bin',
            path: '/tmp/large.bin',
            size: 6,
            type: 'application/octet-stream',
        };

        mocks.state.fileToSendQueue = [file];
        mocks.state.fileIdMap.set(file, 'send-1');

        const { ensureQueueIsActive } = await import('../src/js/transfer/fileSender.js');

        ensureQueueIsActive();
        await new Promise((resolve) => setTimeout(resolve, 25));

        expect(window.electronAPI.startReadSession).toHaveBeenCalledWith('/tmp/large.bin');
        expect(window.electronAPI.readFileChunk).toHaveBeenNthCalledWith(1, {
            sessionId: 'session-1',
            offset: 0,
            length: 4,
        });
        expect(window.electronAPI.readFileChunk).toHaveBeenNthCalledWith(2, {
            sessionId: 'session-1',
            offset: 4,
            length: 2,
        });
        expect(window.electronAPI.closeReadSession).toHaveBeenCalledWith('session-1');
        expect(global.Worker).not.toHaveBeenCalled();
        expect(mocks.sendData).toHaveBeenNthCalledWith(
            1,
            JSON.stringify({
                name: 'large.bin',
                type: 'application/octet-stream',
                size: 6,
            }),
        );
        expect(mocks.sendData).toHaveBeenNthCalledWith(2, new Uint8Array([1, 2, 3, 4]));
        expect(mocks.sendData).toHaveBeenNthCalledWith(3, new Uint8Array([5, 6]));
        expect(mocks.sendData).toHaveBeenNthCalledWith(4, 'EOF');
        expect(mocks.showToast).not.toHaveBeenCalled();
        expect(mocks.state.fileToSendQueue).toHaveLength(0);
        expect(mocks.state.currentlySendingFile).toBeNull();
    });
});
