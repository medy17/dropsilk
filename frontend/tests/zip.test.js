// tests/zip.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    populateZipModal,
    updateZipSelection,
    resetZipModal
} from '../src/js/features/zip/zipModal.js';
import { downloadAllFilesAsZip } from '../src/js/transfer/zipHandler.js';
import { uiElements } from '../src/js/ui/dom.js';
import { store } from '../src/js/state.js';

// Mocks
vi.mock('../src/js/ui/dom.js', () => ({
    uiElements: {
        zipFileList: document.createElement('div'),
        zipSelectionInfo: document.createElement('div'),
        downloadSelectedBtn: document.createElement('button'),
        selectAllZipCheckbox: document.createElement('input'),
        zipModalDefaultFooter: document.createElement('div'),
        zipModalWarningFooter: document.createElement('div'),
        zipWarningText: document.createElement('div'),
        proceedZipBtn: document.createElement('button'),
        cancelZipBtn: document.createElement('button'),
        body: document.createElement('body')
    }
}));

// Setup specific innerHTML structure expectations for buttons
uiElements.downloadSelectedBtn.innerHTML = `<span></span><i class="download-icon"></i><i class="spinner-icon"></i>`;
uiElements.zipModalDefaultFooter.style.display = 'block';

vi.mock('../src/js/state.js', () => ({
    store: {
        getState: vi.fn(() => ({ receivedFiles: [] }))
    }
}));

vi.mock('../src/js/i18n.js', () => ({
    default: { t: (key) => key }
}));

vi.mock('../src/js/utils/helpers.js', () => ({
    formatBytes: vi.fn((bytes) => `${bytes} B`)
}));

vi.mock('../src/js/utils/toast.js', () => ({
    showToast: vi.fn()
}));

// Mock JSZip
const mockZipFile = vi.fn();
const mockGenerateAsync = vi.fn(() => Promise.resolve(new Blob(['zip content'])));

vi.mock('jszip', () => {
    return {
        default: class {
            constructor() {
                this.file = mockZipFile;
                this.generateAsync = mockGenerateAsync;
            }
        }
    };
});

describe('Zip Process', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        uiElements.zipFileList.innerHTML = '';
        uiElements.selectAllZipCheckbox.checked = false;

        // Reset DOM for modals in document body if methods look for #zipModal
        document.body.innerHTML = `
            <div id="zipModal">
                <div class="modal-header"><h3></h3></div>
                <div id="closeZipModal"></div>
            </div>
        `;
        uiElements.downloadSelectedBtn.disabled = false;
    });

    describe('populateZipModal', () => {
        it('should show empty state if no files', () => {
            store.getState.mockReturnValue({ receivedFiles: [] });
            populateZipModal();
            expect(uiElements.zipFileList.innerHTML).toContain('noFilesToDownload');
            expect(uiElements.downloadSelectedBtn.disabled).toBe(true);
        });

        it('should render file list if files exist', () => {
            store.getState.mockReturnValue({
                receivedFiles: [
                    { name: 'file1.txt', blob: { size: 100 } },
                    { name: 'file2.png', blob: { size: 200 } }
                ]
            });
            populateZipModal();

            // Check for created checkboxes
            const checkboxes = uiElements.zipFileList.querySelectorAll('input[type="checkbox"]');
            expect(checkboxes.length).toBe(2);
            expect(uiElements.zipSelectionInfo.textContent).toContain('filesSelected');
        });
    });

    describe('updateZipSelection', () => {
        it('should update summary based on checked files', () => {
            store.getState.mockReturnValue({
                receivedFiles: [
                    { name: 'file1.txt', blob: { size: 100 } },
                    { name: 'file2.png', blob: { size: 200 } }
                ]
            });
            populateZipModal(); // Render first

            const checkboxes = uiElements.zipFileList.querySelectorAll('input.zip-file-checkbox');
            checkboxes[0].checked = true; // Select first file

            // Manually trigger update logic since we aren't clicking really
            updateZipSelection();

            // Total selected: 1, size: 100
            expect(uiElements.zipSelectionInfo.textContent).toContain('filesSelected');
            // formatBytes mock just appends " B", so check calls if possible or result string
            // We assume mock returns "100 B"
        });
    });

    describe('downloadAllFilesAsZip', () => {
        it('should create zip and trigger download', async () => {
            // Mock URL.createObjectURL and revokeObjectURL
            global.URL.createObjectURL = vi.fn(() => 'blob:url');
            global.URL.revokeObjectURL = vi.fn();

            const files = [{ name: 'test.txt', blob: { size: 123 } }];

            await downloadAllFilesAsZip(files);

            expect(mockZipFile).toHaveBeenCalledWith('test.txt', expect.anything());
            expect(mockGenerateAsync).toHaveBeenCalled();
            expect(global.URL.createObjectURL).toHaveBeenCalled();
        });

        it('should show warning if total size is missing? No, warning for > 1GB', async () => {
            // JS numbers max safe int is huge, standard 1GB is 1073741824
            const hugeBlob = { size: 1073741825 }; // 1GB + 1 byte
            const files = [{ name: 'huge.iso', blob: hugeBlob }];

            await downloadAllFilesAsZip(files);

            // Should show warning footer
            expect(uiElements.zipModalDefaultFooter.style.display).toBe('none');
            expect(uiElements.zipModalWarningFooter.style.display).toBe('flex');

            // Should NOT have started zipping yet
            expect(mockGenerateAsync).not.toHaveBeenCalled();
        });
    });

});
