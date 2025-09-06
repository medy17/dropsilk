// js/preview/handlers/pptxPreview.js
// Renders PowerPoint (PPTX) files using the modern pptx2html library.

export default async function renderPptxPreview(blob, contentElement) {
    // Ensure jQuery is available and properly loaded
    if (!window.jQuery || !window.$) {
        throw new Error('jQuery is not available. Make sure it loads before pptx2html.');
    }

    if (!window.pptx2html) {
        throw new Error('pptx2html library not found.');
    }

    // Add a small delay to ensure jQuery is fully initialized
    await new Promise(resolve => setTimeout(resolve, 100));

    const pptxContainer = document.createElement('div');
    pptxContainer.className = 'pptx-render-target';
    contentElement.appendChild(pptxContainer);

    // This URL is correct and necessary
    const workerUrl = 'https://cdn.jsdelivr.net/npm/pptx2html@0.3.4/dist/pptx2html_worker.min.js';

    try {
        const arrayBuffer = await blob.arrayBuffer();

        // Ensure jQuery is attached to the container before calling pptx2html
        const $container = window.$(pptxContainer);
        if (!$container || $container.length === 0) {
            throw new Error('jQuery could not wrap the container element.');
        }

        // Call pptx2html with proper jQuery context
        await window.pptx2html(pptxContainer, arrayBuffer, {
            workerUrl: workerUrl
        });

    } catch (error) {
        console.error('!!! PPTX rendering library failed internally:', error);
        throw new Error('Could not render the presentation. The file might be corrupt or in an unsupported format.');
    }
}