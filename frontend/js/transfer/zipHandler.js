// js/transfer/zipHandler.js
// Logic for zipping and downloading received files.

import { store } from '../state.js';
import { showToast } from '../utils/toast.js';
import { uiElements } from '../ui/dom.js';
import { formatBytes } from '../utils/helpers.js';

export async function downloadAllFilesAsZip() {
    if (typeof JSZip === 'undefined') {
        showToast({ type: 'danger', title: 'Error', body: 'Zipping library is not available. Please refresh the page.', duration: 8000 });
        return;
    }

    const { receivedFiles } = store.getState();
    const totalSize = receivedFiles.reduce((sum, file) => sum + file.blob.size, 0);
    const sizeWarningLimit = 1 * 1024 * 1024 * 1024; // 1 GB

    const proceedWithZipping = async () => {
        const btn = uiElements.downloadAllBtn;
        const originalBtnHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<svg class="spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg><span>Zipping...</span>`;

        try {
            const zip = new JSZip();
            receivedFiles.forEach(file => {
                zip.file(file.name, file.blob);
            });

            const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (metadata) => {
                btn.querySelector('span').textContent = `Zipping... ${Math.round(metadata.percent)}%`;
            });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = `dropsilk-files-${new Date().toISOString().split('T')[0]}.zip`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (error) {
            showToast({ type: 'danger', title: 'Zipping Failed', body: 'An error occurred while creating the zip file.', duration: 8000 });
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalBtnHTML;
        }
    };

    if (totalSize > sizeWarningLimit) {
        showToast({
            type: 'info',
            title: 'Large Download Warning',
            body: `The total size of the files is ${formatBytes(totalSize)}, over 1 GB. Zipping may use significant memory. Proceed?`,
            duration: 0,
            actions: [
                { text: 'Cancel', class: 'btn-secondary', callback: () => {} },
                { text: 'Proceed', class: 'btn-primary', callback: proceedWithZipping }
            ]
        });
    } else {
        await proceedWithZipping();
    }
}