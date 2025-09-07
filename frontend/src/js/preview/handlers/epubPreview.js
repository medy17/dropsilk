// js/preview/handlers/epubPreview.js

export default async function renderEbookPreview(blob, contentElement) {
    if (!window.ePub) {
        throw new Error('Epub.js library not found.');
    }

    const bookUrl = URL.createObjectURL(blob);
    contentElement.dataset.objectUrl = bookUrl; // For cleanup

    const viewerContainer = document.createElement('div');
    viewerContainer.id = 'epub-viewer';
    viewerContainer.style.width = '100%';
    viewerContainer.style.height = '75vh'; // Adjust as needed
    contentElement.appendChild(viewerContainer);

    const book = window.ePub(bookUrl);
    const rendition = book.renderTo("epub-viewer", {
        width: "100%",
        height: "100%",
        spread: "auto"
    });

    await rendition.display();
}