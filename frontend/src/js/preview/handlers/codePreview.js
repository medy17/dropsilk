// js/preview/handlers/codePreview.js
// Renders code and text files with syntax highlighting.

export default async function renderCodePreview(blob, contentElement) {
    try {
        const text = await blob.text();

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = text;

        // Use highlight.js to apply syntax highlighting
        if (window.hljs) {
            window.hljs.highlightElement(code);
        }

        pre.appendChild(code);
        contentElement.appendChild(pre);

    } catch (error) {
        console.error('Error reading file as text:', error);
        throw new Error('Could not read the file for preview.');
    }
}