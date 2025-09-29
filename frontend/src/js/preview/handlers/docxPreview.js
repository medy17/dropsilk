// js/preview/handlers/docxPreview.js
// Renders DOCX and other word processing documents using Mammoth.js.
import * as mammoth from "mammoth";

export default async function renderDocxPreview(blob, contentElement) {
    try {
        // 1. Read the blob as an ArrayBuffer, which Mammoth.js requires.
        const arrayBuffer = await blob.arrayBuffer();

        // 2. Use Mammoth.js to convert the document to HTML.
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const html = result.value; // The generated HTML

        // 3. Create a container for the styled content.
        const docxContainer = document.createElement('div');
        docxContainer.className = 'docx-preview-container';
        docxContainer.innerHTML = html;

        // 4. Append the styled container to the main content element.
        contentElement.appendChild(docxContainer);

    } catch (error) {
        console.error('Error rendering DOCX preview:', error);
        // Provide a more user-friendly error message.
        let errorMessage = 'Could not render the document. The file might be corrupt or in an unsupported format.';
        if (error.message && error.message.includes('File is not a zip file')) {
            errorMessage = 'This document format is not supported for preview. Please try a .docx file.';
        }
        throw new Error(errorMessage);
    }
}
