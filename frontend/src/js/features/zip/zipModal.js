// features/zip/zipModal.js
// Handles the zip download modal functionality

import { store } from '../../state.js';
import { uiElements } from '../../ui/dom.js';
import { formatBytes } from '../../utils/helpers.js';
import { downloadAllFilesAsZip } from '../../transfer/zipHandler.js';
import i18next from '../../i18n.js';

let zipModalMode = 'zip'; // 'zip' | 'settings'

/**
 * Gets the current zip modal mode
 * @returns {string} 'zip' or 'settings'
 */
export function getZipModalMode() {
    return zipModalMode;
}

/**
 * Sets the zip modal mode
 * @param {string} mode - 'zip' or 'settings'
 */
export function setZipModalMode(mode) {
    zipModalMode = mode;
}

/**
 * Populates the zip modal with received files
 */
export function populateZipModal() {
    const { receivedFiles } = store.getState();
    uiElements.zipFileList.innerHTML = '';

    if (receivedFiles.length === 0) {
        uiElements.zipFileList.innerHTML =
            `<div class="empty-state">${i18next.t('noFilesToDownload')}</div>`;
        uiElements.zipSelectionInfo.textContent = i18next.t('filesSelected', { count: 0, size: formatBytes(0) });
        uiElements.downloadSelectedBtn.disabled = true;
        uiElements.selectAllZipCheckbox.checked = false;
        return;
    }

    receivedFiles.forEach((file, index) => {
        uiElements.zipFileList.insertAdjacentHTML(
            'beforeend',
            `
      <label class="zip-file-item checkbox-label">
        <input
          type="checkbox"
          class="zip-file-checkbox custom-checkbox-input"
          data-index="${index}"
        />
        <span class="custom-checkbox"></span>
        <div class="zip-file-details">
          <span class="zip-file-name" title="${file.name}">${file.name}</span>
          <span class="zip-file-size">${formatBytes(file.blob.size)}</span>
        </div>
      </label>
    `
        );
    });

    updateZipSelection();
}

/**
 * Updates the selection summary in the zip modal
 */
export function updateZipSelection() {
    const { receivedFiles } = store.getState();
    const selected = Array.from(
        uiElements.zipFileList.querySelectorAll('.zip-file-checkbox:checked')
    ).map((cb) => parseInt(cb.dataset.index, 10));

    const totalSelected = selected.length;
    const totalSize = selected.reduce(
        (sum, idx) => sum + (receivedFiles[idx]?.blob?.size || 0),
        0
    );

    uiElements.zipSelectionInfo.textContent = i18next.t('filesSelected', { count: totalSelected, size: formatBytes(totalSize) });
    uiElements.downloadSelectedBtn.disabled = totalSelected === 0;

    const all = uiElements.zipFileList.querySelectorAll('.zip-file-checkbox');
    uiElements.selectAllZipCheckbox.checked = all.length > 0 && totalSelected === all.length;
}

/**
 * Resets the zip modal to its default state
 */
export function resetZipModal() {
    zipModalMode = 'zip';
    const modal = document.getElementById('zipModal');
    if (modal) {
        modal.classList.remove('settings-mode');
        modal.classList.remove('zipping-in-progress');
    }

    const header = document.querySelector('#zipModal .modal-header h3');
    if (header) header.textContent = i18next.t('downloadFilesAsZip');

    uiElements.selectAllZipCheckbox.checked = false;
    updateZipSelection();

    if (uiElements.zipModalDefaultFooter) uiElements.zipModalDefaultFooter.style.display = 'block';
    if (uiElements.zipModalWarningFooter) uiElements.zipModalWarningFooter.style.display = 'none';

    const selectAllLabel = uiElements.selectAllZipCheckbox
        ?.closest('.checkbox-label')
        ?.querySelector('span:last-of-type');
    if (selectAllLabel) selectAllLabel.textContent = i18next.t('selectAll');
    uiElements.zipSelectionInfo.textContent = i18next.t('filesSelected', { count: 0, size: formatBytes(0) });

    const btn = uiElements.downloadSelectedBtn;
    const btnSpan = btn.querySelector('span');
    const downloadIcon = btn.querySelector('.download-icon');
    const saveIcon = btn.querySelector('.save-icon');
    const spinnerIcon = btn.querySelector('.spinner-icon');

    if (btnSpan) btnSpan.textContent = i18next.t('downloadSelectedAsZip');
    if (downloadIcon) downloadIcon.style.display = 'inline-block';
    if (saveIcon) saveIcon.style.display = 'none';
    if (spinnerIcon) spinnerIcon.style.display = 'none';
}

/**
 * Sets up event listeners for the zip modal
 * @param {Function} onSettingsToggle - Callback for settings toggle
 * @param {Function} onSettingsSave - Callback for saving settings
 */
export function setupZipModal(onSettingsToggle, onSettingsSave) {
    uiElements.zipFileList.addEventListener('change', (e) => {
        if (e.target.classList.contains('zip-file-checkbox')) updateZipSelection();
    });

    uiElements.selectAllZipCheckbox.addEventListener('change', () => {
        if (zipModalMode === 'settings') {
            onSettingsToggle?.(uiElements.selectAllZipCheckbox.checked);
        } else {
            const isChecked = uiElements.selectAllZipCheckbox.checked;
            uiElements.zipFileList.querySelectorAll('.zip-file-checkbox').forEach(cb => cb.checked = isChecked);
            updateZipSelection();
        }
    });

    uiElements.downloadSelectedBtn.addEventListener('click', () => {
        if (zipModalMode === 'settings') {
            onSettingsSave?.();
            return;
        }
        const { receivedFiles } = store.getState();
        const checkboxes = uiElements.zipFileList.querySelectorAll('.zip-file-checkbox:checked');
        const selectedFiles = Array.from(checkboxes).map(cb => receivedFiles[parseInt(cb.dataset.index, 10)]);
        if (selectedFiles.length > 0) downloadAllFilesAsZip(selectedFiles);
    });
}
