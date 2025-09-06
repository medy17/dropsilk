// js/preview/handlers/pptxPreview.js
// Renders PowerPoint (PPTX) files using the modern pptx2html library.

export default async function renderPptxPreview(blob, contentElement) {
    if (!window.pptx2html) {
        throw new Error('pptx2html library not found.');
    }

    const pptxContainer = document.createElement('div');
    pptxContainer.className = 'pptx-render-target';
    contentElement.appendChild(pptxContainer);

    // THE CRITICAL FIX: We must define the path to the library's background worker script.
    const workerUrl = 'https://cdn.jsdelivr.net/npm/pptx2html@0.3.4/dist/pptx2html_worker.min.js';

    try {
        const arrayBuffer = await blob.arrayBuffer();

        // Pass the workerUrl into the configuration object.
        await window.pptx2html(pptxContainer, arrayBuffer, {
            workerUrl: workerUrl
        });

    } catch (error) {
        console.error('!!! PPTX rendering library failed internally:', error);
        // If it still fails, the console will now have a detailed error from the library itself.
        throw new Error('Could not render the presentation. The file might be corrupt or in an unsupported format.');
    }
}