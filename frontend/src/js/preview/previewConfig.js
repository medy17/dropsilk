// js/preview/previewConfig.js
// Central configuration for all file preview handlers.

export const previewConfig = {
    // Handler for common image formats
    image: {
        extensions: ['avif', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic'],
        handler: () => import('./handlers/imagePreview.js'),
    },
    // Handler for audio formats
    audio: {
        extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus'],
        handler: () => import('./handlers/audioPreview.js'),
    },
    // Handler for plain text and common code formats
    code: {
        extensions: [
            'txt', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'py', 'java', 'c',
            'cpp', 'cs', 'go', 'rb', 'php', 'sh', 'yml', 'yaml', 'rtf'
        ],
        stylesheets: [], // handler imports its own theme
        handler: () => import('./handlers/codePreview.js'),
    },
    // Handler for Markdown
    markdown: {
        extensions: ['md', 'markdown'],
        stylesheets: ['https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown-dark.min.css'], // Or light
        handler: () => import('./handlers/mdPreview.js'),
    },
    // handler for PDFs
    pdf: {
        extensions: ['pdf'],
        handler: () => import('./handlers/pdfPreview.js'),
    },
    // handler for DOCX
    docx: {
        extensions: ['docx'],
        handler: () => import('./handlers/docxPreview.js'),
    },
    // handler for PPTX
    pptx: {
        extensions: ['pptx'],
        handler: () => import('./handlers/pptxPreview.js'),
        requiresUploadConsent: true,
    },
    // handler for XLSX
    xlsx: {
        extensions: ['xlsx', 'xls', 'csv'],
        handler: () => import('./handlers/xlsxPreview.js'),
    },
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
            return !!previewConfig[key].handler;
        }
    }
    return false;
}
