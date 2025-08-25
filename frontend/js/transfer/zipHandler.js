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
    const downloadIcon = btn.querySelector('.download-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');

    if (btnSpan) btnSpan.textContent = 'Download Selected as Zip';
    if (downloadIcon) downloadIcon.style.display = 'inline-block';
    if (spinnerIcon) spinnerIcon.style.display = 'none';

    const checkboxes = uiElements.zipFileList.querySelectorAll('.zip-file-checkbox:checked');
    btn.disabled = checkboxes.length === 0;
}

async function proceedWithZipping(files) {
    const modal = document.getElementById('zipModal');
    const btn = uiElements.downloadSelectedBtn;
    const btnSpan = btn.querySelector('span');
    const downloadIcon = btn.querySelector('.download-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');

    // --- LOCK THE UI ---
    modal.classList.add('zipping-in-progress');
    btn.disabled = true;
    if (downloadIcon) downloadIcon.style.display = 'none';
    if (spinnerIcon) spinnerIcon.style.display = 'inline-block';
    if (btnSpan) btnSpan.textContent = 'Zipping...';


    try {
        const zip = new JSZip();
        files.forEach(file => {
            zip.file(file.name, file.blob);
        });

        const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (metadata) => {
            if (btnSpan) btnSpan.textContent = `Zipping... ${Math.round(metadata.percent)}%`;
        });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `dropsilk-files-${new Date().toISOString().split('T')[0]}.zip`;
        link.click();
        URL.revokeObjectURL(link.href);

        document.getElementById('closeZipModal').click();

    } catch (error) {
        showToast({ type: 'danger', title: 'Zipping Failed', body: 'An error occurred while creating the zip file.', duration: 8000 });
    } finally {
        // --- GUARANTEED UI CLEANUP ---
        modal.classList.remove('zipping-in-progress');
        resetZipModalUI(); // Reset to a clean, non-busy state
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
        uiElements.zipModalDefaultFooter.style.display = 'none';
        uiElements.zipModalWarningFooter.style.display = 'flex';
        uiElements.zipWarningText.innerHTML = `The total size of the selected files is <strong>${formatBytes(totalSize)}</strong>. Zipping may use significant memory and take some time. Do you want to proceed?`;

        const cleanup = () => {
            uiElements.proceedZipBtn.onclick = null;
            uiElements.cancelZipBtn.onclick = null;
        };

        const proceedHandler = () => {
            cleanup();
            resetZipModalUI(); // Reset the footer to the default view
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