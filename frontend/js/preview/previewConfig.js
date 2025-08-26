// js/preview/previewConfig.js
// Central configuration for all file preview handlers.

export const previewConfig = {
    // Handler for common image formats
    image: {
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'],
        handler: () => import('./handlers/imagePreview.js'),
    },
    // Handler for plain text and common code formats
    code: {
        extensions: [
            'txt', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'py', 'java', 'c',
            'cpp', 'cs', 'go', 'rb', 'php', 'sh', 'yml', 'yaml', 'md', 'markdown', 'rtf'
        ],
        // Dynamically load the highlight.js library when needed
        dependencies: [
            'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js'
        ],
        // We'll also need its stylesheet
        stylesheets: [
            'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
        ],
        handler: () => import('./handlers/codePreview.js'),
    },
    // Future handler for PDFs
    pdf: {
        extensions: ['pdf'],
        // pdf.js is a bit more complex, often requiring a worker script
        dependencies: [
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        ],
        // handler: () => import('./handlers/pdfPreview.js'), // To be created
    },
    // Future handler for DOCX
    docx: {
        extensions: ['docx'],
        dependencies: [
            'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js'
        ],
        // handler: () => import('./handlers/docxPreview.js'), // To be created
    }
};

/**
 * Checks if a given filename has a supported preview handler.
 * @param {string} filename - The name of the file.
 * @returns {boolean} - True if a handler exists, false otherwise.
 */
export function isPreviewable(filename) {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension) return false;

    for (const key in previewConfig) {
        if (previewConfig[key].extensions.includes(extension)) {
            // Check if the handler is actually implemented (not commented out)
            return !!previewConfig[key].handler;
        }
    }
    return false;
}