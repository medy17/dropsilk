// tests/queue.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleFileSelection, handleFolderSelection, setupQueueDragDrop } from '../src/js/transfer/queueManager.js';
import { store } from '../src/js/state.js';
import { uiElements } from '../src/js/ui/dom.js';
import { showToast } from '../src/js/utils/toast.js';

// Mocks
vi.mock('../src/js/state.js', () => ({
    store: {
        getState: vi.fn(() => ({
            fileToSendQueue: [],
            hasScrolledForSend: false
        })),
        actions: {
            addFilesToQueue: vi.fn(),
            addFileIdMapping: vi.fn(),
            setHasScrolledForSend: vi.fn(),
            reorderQueue: vi.fn(),
        }
    }
}));

vi.mock('../src/js/ui/dom.js', () => ({
    uiElements: {
        sendingQueueDiv: document.createElement('div'),
    }
}));

vi.mock('../src/js/utils/toast.js', () => ({
    showToast: vi.fn()
}));

vi.mock('../src/js/ui/view.js', () => ({
    checkQueueOverflow: vi.fn()
}));

vi.mock('../src/js/transfer/transferUI.js', () => ({
    createSendQueueItemHTML: vi.fn(() => '<div class="queue-item"></div>')
}));

vi.mock('../src/js/transfer/fileSender.js', () => ({
    ensureQueueIsActive: vi.fn()
}));

vi.mock('../src/js/i18n.js', () => ({
    default: {
        t: (key) => key
    }
}));

describe('Queue Manager', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset DOM
        const div = document.createElement('div');
        div.scrollIntoView = vi.fn(); // Mock scrollIntoView
        uiElements.sendingQueueDiv = div;

        // Reset Store Mock Return
        store.getState.mockReturnValue({
            fileToSendQueue: [],
            hasScrolledForSend: false
        });
    });

    describe('handleFileSelection', () => {
        it('should do nothing if no files provided', () => {
            handleFileSelection([]);
            expect(store.actions.addFilesToQueue).not.toHaveBeenCalled();
        });

        it('should add files to queue and update DOM', () => {
            const files = [
                new File(['content'], 'test1.txt'),
                new File(['content'], 'test2.txt')
            ];

            handleFileSelection(files);

            expect(store.actions.addFilesToQueue).toHaveBeenCalledWith(files);
            expect(store.actions.addFileIdMapping).toHaveBeenCalledTimes(2);
            // Check DOM
            expect(uiElements.sendingQueueDiv.children.length).toBe(2);
        });

        it('should clear empty state if present', () => {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            uiElements.sendingQueueDiv.appendChild(emptyState);

            handleFileSelection([new File([''], 'test.txt')]);

            expect(uiElements.sendingQueueDiv.querySelector('.empty-state')).toBeNull();
        });
    });

    describe('handleFolderSelection', () => {
        it('should show warning for large folders', () => {
            // Mock a large file
            const largeFile = { size: 2 * 1024 * 1024 * 1024 }; // 2GB
            const files = [largeFile];

            handleFolderSelection(files);

            expect(showToast).toHaveBeenCalled();
            expect(store.actions.addFilesToQueue).not.toHaveBeenCalled(); // Wait for user action
        });

        it('should show warning for too many files', () => {
            const files = new Array(51).fill({ size: 100 });
            handleFolderSelection(files);
            expect(showToast).toHaveBeenCalled();
        });

        it('should proceed directly if within limits', () => {
            const files = [new File([''], 'test.txt')];
            handleFolderSelection(files);
            expect(store.actions.addFilesToQueue).toHaveBeenCalled();
        });
    });

    describe('Drag and Drop', () => {
        it('should attach event listeners', () => {
            // Spy on addEventListener
            const spy = vi.spyOn(uiElements.sendingQueueDiv, 'addEventListener');
            setupQueueDragDrop();
            expect(spy).toHaveBeenCalledWith('dragstart', expect.any(Function));
            expect(spy).toHaveBeenCalledWith('dragend', expect.any(Function));
            expect(spy).toHaveBeenCalledWith('dragover', expect.any(Function));
            expect(spy).toHaveBeenCalledWith('drop', expect.any(Function));
        });
    });

});
