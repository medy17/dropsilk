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
    btn.disabled = false;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg><span>Download Selected as Zip</span>`;
}

async function proceedWithZipping(files) {
    const btn = uiElements.downloadSelectedBtn; // Progress will still be shown on the main button
    const originalBtnHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg class="spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg><span>Zipping...</span>`;

    // Also disable the new buttons if they exist
    uiElements.proceedZipBtn.disabled = true;
    uiElements.cancelZipBtn.disabled = true;


    try {
        const zip = new JSZip();
        files.forEach(file => {
            zip.file(file.name, file.blob);
        });

        const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (metadata) => {
            // Update the main button's text, which is now visible
            btn.querySelector('span').textContent = `Zipping... ${Math.round(metadata.percent)}%`;
        });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `dropsilk-files-${new Date().toISOString().split('T')[0]}.zip`;
        link.click();
        URL.revokeObjectURL(link.href);

        // Close the modal only on success
        document.getElementById('closeZipModal').click();

    } catch (error) {
        showToast({ type: 'danger', title: 'Zipping Failed', body: 'An error occurred while creating the zip file.', duration: 8000 });
    } finally {
        // Reset button state regardless of outcome, but don't close modal on failure
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
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
        showToast({ type: 'info', title: 'No Files Selected', body: 'Please select at least one file to download.', duration: 5000 });
        return;
    }

    const totalSize = files.reduce((sum, file) => sum + file.blob.size, 0);
    const sizeWarningLimit = 1 * 1024 * 1024 * 1024; // 1 GB

    if (totalSize > sizeWarningLimit) {
        // Show the warning inside the modal instead of a toast
        uiElements.zipModalDefaultFooter.style.display = 'none';
        uiElements.zipModalWarningFooter.style.display = 'flex';
        uiElements.zipWarningText.innerHTML = `The total size of the selected files is <strong>${formatBytes(totalSize)}</strong>. Zipping may use significant memory and take some time. Do you want to proceed?`;

        // We need to manage these button events manually now
        const proceedHandler = () => proceedWithZipping(files);
        const cancelHandler = () => resetZipModalUI();

        uiElements.proceedZipBtn.onclick = proceedHandler;
        uiElements.cancelZipBtn.onclick = cancelHandler;

    } else {
        await proceedWithZipping(files);
    }
}