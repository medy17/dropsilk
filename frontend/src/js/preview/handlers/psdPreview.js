// js/preview/handlers/psdPreview.js
// Renders PSD files in the preview modal using ag-psd (flattened image only).
import { readPsd } from 'ag-psd';

let viewerContainer = null;


export async function cleanup() {
    if (viewerContainer) {
        viewerContainer.innerHTML = '';
        viewerContainer = null;
    }
}

export default async function renderPsdPreview(blob, contentElement) {
    await cleanup();

    contentElement.innerHTML = `
        <div id="psd-viewer-container" class="psd-viewer">
            <div class="page-loader">
                <svg class="spinner" viewBox="0 0 50 50">
                    <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                </svg>
            </div>
        </div>
    `;

    viewerContainer = contentElement.querySelector('#psd-viewer-container');

    const psdUrl = URL.createObjectURL(blob);
    contentElement.dataset.objectUrl = psdUrl;

    try {
        const buffer = await blob.arrayBuffer();
        const psd = readPsd(buffer, {
            skipLayerImageData: true,
            skipThumbnail: false,
        });

        const canvas = psd.canvas;
        if (!canvas) {
            throw new Error('Could not find a composite image in the PSD file. It may need to be saved with "Maximize Compatibility" enabled.');
        }

        viewerContainer.innerHTML = '';
        viewerContainer.appendChild(canvas);

    } catch (error) {
        console.error('Error rendering PSD:', error);
        viewerContainer.innerHTML = `
            <p class="empty-state">Failed to render PSD: ${error.message}. 
            It might be corrupted or contain unsupported data.</p>
        `;
        throw error;
    }
}