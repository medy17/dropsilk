// js/transfer/zipHandler.js
// Logic for zipping and downloading received files.

import { store } from '../state.js';
import { showToast } from '../utils/toast.js';
import { uiElements } from '../ui/dom.js';
import { formatBytes } from '../utils/helpers.js';

function resetZipModalUI() {
    uiElements.zipModalDefaultFooter.style.display = 'block';
    uiElements.zipModalWarningFooter.style.display = 'none';
    const btn = uiElements.downloadSelectedBtn;
    const btnSpan = btn.querySelector('span');
    if (btnSpan) {
        btnSpan.textContent = 'Download Selected as Zip';
    }
    // Let updateZipSelection handle the disabled state correctly
    const checkboxes = uiElements.zipFileList.querySelectorAll('.zip-file-checkbox:checked');
    btn.disabled = checkboxes.length === 0;
}

async function proceedWithZipping(files) {
    const btn = uiElements.downloadSelectedBtn;
    const originalBtnHTML = btn.innerHTML; // We can simplify this later if we want
    btn.disabled = true;
    btn.innerHTML = `<svg class="spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg><span>Zipping...</span>`;

    // Also disable the other buttons just in case
    uiElements.proceedZipBtn.disabled = true;
    uiElements.cancelZipBtn.disabled = true;

    try {
        const zip = new JSZip();
        files.forEach(file => {
            zip.file(file.name, file.blob);
        });

        const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (metadata) => {
            const btnSpan = btn.querySelector('span');
            if(btnSpan) btnSpan.textContent = `Zipping... ${Math.round(metadata.percent)}%`;
        });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `dropsilk-files-${new Date().toISOString().split('T')[0]}.zip`;
        link.click();
        URL.revokeObjectURL(link.href);

        document.getElementById('closeZipModal').click();

    } catch (error) {
        showToast({ type: 'danger', title: 'Zipping Failed', body: 'An error occurred while creating the zip file.', duration: 8000 });
        // If it fails, restore the button to its original state so the user can try again
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
    } finally {
        // Re-enable warning buttons in case of failure
        uiElements.proceedZipBtn.disabled = false;
        uiElements.cancelZipBtn.disabled = false;
    }
};

export async function downloadAllFilesAsZip(filesToZip) {
    if (typeof JSZip === 'undefined') {
        showToast({ type: 'danger', title: 'Error', body: 'Zipping library is not available. Please refresh the page.', duration: 8000 });
        return;
    }

    const files = filesToZip || store.getState().receivedFiles;
    if (files.length === 0) {
        // Use an in-modal warning for consistency if possible, but a toast is fine here.
        showToast({ type: 'info', title: 'No Files Selected', body: 'Please select at least one file to download.', duration: 5000 });
        return;
    }

    const totalSize = files.reduce((sum, file) => sum + file.blob.size, 0);
    const sizeWarningLimit = 1 * 1024 * 1024 * 1024; // 1 GB

    if (totalSize > sizeWarningLimit) {
        uiElements.zipModalDefaultFooter.style.display = 'none';
        uiElements.zipModalWarningFooter.style.display = 'flex';
        uiElements.zipWarningText.innerHTML = `The total size of the selected files is <strong>${formatBytes(totalSize)}</strong>. Zipping may use significant memory and take some time. Do you want to proceed?`;

        // Define handlers that also clean up after themselves
        const cleanup = () => {
            uiElements.proceedZipBtn.onclick = null;
            uiElements.cancelZipBtn.onclick = null;
        };

        const proceedHandler = () => {
            cleanup();
            // FIX: Reset the UI *before* starting the zipping process
            resetZipModalUI();
            proceedWithZipping(files);
        };

        const cancelHandler = () => {
            cleanup();
            resetZipModalUI();
        };

        uiElements.proceedZipBtn.onclick = proceedHandler;
        uiElements.cancelZipBtn.onclick = cancelHandler;

    } else {
        await proceedWithZipping(files);
    }
}