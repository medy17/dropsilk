// js/preview/handlers/mdPreview.js

export default async function renderMarkdownPreview(blob, contentElement) {
    if (!window.marked) {
        throw new Error('Marked.js library not found.');
    }

    try {
        const markdownText = await blob.text();
        const html = window.marked.parse(markdownText);

        const container = document.createElement('div');
        container.className = 'markdown-body'; // Use the class from github-markdown-css
        container.innerHTML = html;

        // Sanitize links to open in a new tab for security
        container.querySelectorAll('a').forEach(a => {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        });

        contentElement.appendChild(container);

    } catch (error) {
        console.error('Error rendering Markdown preview:', error);
        throw new Error('Could not render the Markdown file.');
    }
}