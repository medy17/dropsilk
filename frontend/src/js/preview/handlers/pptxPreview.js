// js/preview/handlers/pptxPreview.js
// Renders PowerPoint (PPTX) files using the modern pptx2html library.

export default async function renderPptxPreview(blob, contentElement) {
    if (!window.pptx2html) {
        throw new Error('pptx2html library not found.');
    }

    // Create a container with a CLASS instead of an ID for robustness.
    const pptxContainer = document.createElement('div');
    pptxContainer.className = 'pptx-render-target';
    contentElement.appendChild(pptxContainer);

    try {
        // STEP 1: THE CRITICAL FIX - Convert the Blob to an ArrayBuffer.
        const arrayBuffer = await blob.arrayBuffer();

        // STEP 2: THE SECOND CRITICAL FIX - Use the correct argument order.
        // The library expects the HTML element to render into FIRST, then the data.
        // We pass the DOM element directly, which is better than a selector string.
        await window.pptx2html(pptxContainer, arrayBuffer, {
            slideMode: false, // Show all slides vertically
            slideModeConfig: {
                loop: false,
                nav: true
            }
        });
    } catch (error) {
        // This is the block that was being triggered. Now we log the REAL error.
        console.error('!!! PPTX rendering library failed internally:', error);
        throw new Error('Could not render the presentation. The file might be corrupt or in an unsupported format.');
    }
}