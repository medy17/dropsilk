// js/preview/previewConfig.js
// Central configuration for all file preview handlers.

export const previewConfig = {
    // Handler for common image formats
    image: {
        extensions: ['avif', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'],
        handler: () => import('./handlers/imagePreview.js'),
    },
    // Handler for audio formats
    audio: {
        extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus'],
        dependencies: [
            'https://unpkg.com/wavesurfer.js@7'
        ],
        handler: () => import('./handlers/audioPreview.js'),
    },
    // Handler for plain text and common code formats
    code: {
        extensions: [
            'txt', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'py', 'java', 'c',
            'cpp', 'cs', 'go', 'rb', 'php', 'sh', 'yml', 'yaml', 'rtf'
        ],
        dependencies: ['https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js'],
        stylesheets: ['https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'],
        handler: () => import('./handlers/codePreview.js'),
    },
    // Handler for Markdown
    markdown: {
        extensions: ['md', 'markdown'],
        dependencies: ['https://cdn.jsdelivr.net/npm/marked/marked.min.js'],
        stylesheets: ['https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown-dark.min.css'], // Or light
        handler: () => import('./handlers/mdPreview.js'),
    },
    // handler for PDFs
    pdf: {
        extensions: ['pdf'],
        dependencies: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'],
        handler: () => import('./handlers/pdfPreview.js'),
    },
    // handler for DOCX
    docx: {
        extensions: ['docx'],
        dependencies: ['https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.7.0/mammoth.browser.min.js'],
        handler: () => import('./handlers/docxPreview.js'),
    },
    // handler for PPTX - FIXED VERSION
    pptx: {
        extensions: ['pptx'],
        dependencies: [
            // Use JSZip for PPTX parsing - much more reliable
            'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
        ],
        handler: () => import('./handlers/pptxPreview.js'),
    },
    // handler for XLSX
    xlsx: {
        extensions: ['xlsx', 'xls', 'csv'],
        dependencies: ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'],
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