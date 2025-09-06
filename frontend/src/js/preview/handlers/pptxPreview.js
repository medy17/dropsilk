// js/preview/handlers/pptxPreview.js
// Renders PowerPoint (PPTX) files using pptxjs.

export default async function renderPptxPreview(blob, contentElement) {
    if (!window.pptx) {
        throw new Error('pptxjs library not found.');
    }

    const arrayBuffer = await blob.arrayBuffer();

    const pptxContainer = document.createElement('div');
    pptxContainer.className = 'pptx-preview-container';
    contentElement.appendChild(pptxContainer);

    try {
        await window.pptx.render(arrayBuffer, pptxContainer, null, {
            use_worker: false // Simplified for this environment
        });
    } catch (error) {
        console.error('Error rendering PPTX preview:', error);
        throw new Error('Could not render the presentation. The file might be corrupt or in an unsupported format.');
    }
}