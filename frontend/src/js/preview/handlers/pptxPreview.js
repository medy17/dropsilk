// js/preview/handlers/pptxPreview.js
// Renders PowerPoint (PPTX) files using the modern pptx2html library.

export default async function renderPptxPreview(blob, contentElement) {
    if (!window.pptx2html) {
        throw new Error('pptx2html library not found.');
    }

    const pptxContainer = document.createElement('div');
    // The library uses a specific ID by default, so we'll comply.
    pptxContainer.id = 'pptx-container';
    contentElement.appendChild(pptxContainer);

    try {
        // The library works directly with the blob
        await window.pptx2html(blob, '#pptx-container', {
            slideMode: false, // Show all slides vertically
            slideModeConfig: {
                loop: false,
                nav: true
            }
        });
    } catch (error) {
        console.error('Error rendering PPTX preview:', error);
        throw new Error('Could not render the presentation. The file might be corrupt or in an unsupported format.');
    }
}