// transfer/opfsHandler.js
// Handles Origin Private File System (OPFS) operations for large file storage

import i18next from '../i18n.js';
import { showToast } from '../utils/toast.js';
import { OPFS_THRESHOLD } from '../config.js';

// OPFS-specific state
const opfsState = new Map();

/**
 * Checks if OPFS should be used for a given file
 * @param {number} fileSize - Size of the file in bytes
 * @returns {boolean}
 */
export function shouldUseOpfs(fileSize) {
    return (
        localStorage.getItem('dropsilk-use-opfs-buffer') === 'true' &&
        fileSize > OPFS_THRESHOLD &&
        !!navigator.storage?.getDirectory
    );
}

/**
 * Initializes OPFS storage for an incoming file
 * @param {string} fileName - Name of the file
 * @returns {Promise<boolean>} - True if OPFS was initialized successfully
 */
export async function initOpfsForFile(fileName) {
    try {
        const root = await navigator.storage.getDirectory();

        // Try to remove the file if it already exists to ensure fresh start, 
        // but ignore errors if it fails (e.g. locked).
        try {
            await root.removeEntry(fileName);
        } catch (e) {
            // Ignore - might not exist or be locked
        }

        const fileHandle = await root.getFileHandle(fileName, { create: true });
        const writer = await fileHandle.createWritable();
        opfsState.set(fileName, { writer, fileHandle });
        return true;
    } catch (error) {
        console.error('OPFS setup failed, falling back to memory.', error);
        showToast({
            type: 'danger',
            title: i18next.t('opfsError'),
            body: i18next.t('opfsErrorDescription'),
            duration: 8000,
        });
        opfsState.delete(fileName);
        return false;
    }
}

/**
 * Writes a chunk to the OPFS file
 * @param {string} fileName - Name of the file
 * @param {ArrayBuffer} data - Chunk data to write
 * @returns {Promise<boolean>} - True if write succeeded
 */
export async function writeOpfsChunk(fileName, data) {
    const opfsFile = opfsState.get(fileName);
    if (!opfsFile) return false;

    try {
        await opfsFile.writer.write(data);
        return true;
    } catch (error) {
        console.error('OPFS write failed:', error);
        opfsState.delete(fileName);
        showToast({
            type: 'danger',
            title: i18next.t('outOfDiskSpace'),
            body: i18next.t('outOfDiskSpaceDescription'),
            duration: 10000,
        });
        return false;
    }
}

/**
 * Finalizes an OPFS file and returns the blob
 * @param {string} fileName - Name of the file
 * @returns {Promise<Blob|null>} - The completed file as a Blob, or null on error
 */
export async function finalizeOpfsFile(fileName) {
    const opfsFile = opfsState.get(fileName);
    if (!opfsFile) return null;

    try {
        await opfsFile.writer.close();
        const blob = await opfsFile.fileHandle.getFile();
        opfsState.delete(fileName);
        return blob;
    } catch (error) {
        console.error('Failed to finalize OPFS file:', error);
        showToast({
            type: 'danger',
            title: i18next.t('fileSaveError'),
            body: i18next.t('fileSaveErrorDescription'),
            duration: 8000,
        });
        opfsState.delete(fileName);
        return null;
    }
}

/**
 * Checks if a file is being handled via OPFS
 * @param {string} fileName - Name of the file
 * @returns {boolean}
 */
export function isUsingOpfs(fileName) {
    return opfsState.has(fileName);
}

/**
 * Clears all OPFS storage and state
 * @returns {Promise<void>}
 */
export async function clearOpfsStorage() {
    if (!navigator.storage?.getDirectory) return;

    try {
        const root = await navigator.storage.getDirectory();

        // Close any open writers first
        for (const [key, value] of opfsState.entries()) {
            if (value.writer) {
                await value.writer.close().catch((e) =>
                    console.error('Error closing writer on reset:', e)
                );
            }
            opfsState.delete(key);
        }

        // iterate and remove files
        for await (const key of root.keys()) {
            try {
                await root.removeEntry(key);
            } catch (e) {
                console.warn(`Failed to remove OPFS entry ${key}:`, e);
            }
        }
    } catch (e) {
        console.error('Could not clear OPFS on reset:', e);
    }
}
