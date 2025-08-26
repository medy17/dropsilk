// js/preview/handlers/pdfPreview.js
// Renders PDF files in the preview modal using PDF.js.

// PDF.js will be available globally as 'pdfjsLib' after pdf.min.js is loaded.
// We will explicitly set the worker source to the CDN path.
const PDF_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export default async function renderPdfPreview(blob, contentElement) {
    // Ensure contentElement is clean and ready
    contentElement.innerHTML = '<div id="pdf-viewer-container"></div>'; // Main container for all pages
    const viewerContainer = contentElement.querySelector('#pdf-viewer-container');

    // Store the object URL for cleanup when the modal closes
    const pdfUrl = URL.createObjectURL(blob);
    contentElement.dataset.objectUrl = pdfUrl; // Used by resetPreviewModal

    try {
        // Set up the PDF.js worker source
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
        } else {
            throw new Error("PDF.js library (pdfjsLib) not found. Ensure pdf.min.js is loaded.");
        }

        // Load the PDF document
        const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
        const pdfDoc = await loadingTask.promise;

        // Render each page
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 }); // Scale for better resolution

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.classList.add('pdf-page-canvas'); // Add class for styling

            // Render page into canvas
            const renderContext = {
                canvasContext: context,
                viewport: viewport,
            };
            await page.render(renderContext).promise;

            viewerContainer.appendChild(canvas);
        }

    } catch (error) {
        console.error('Error rendering PDF:', error);
        // Display a user-friendly error message in the viewer
        viewerContainer.innerHTML = `<p class="empty-state">Failed to render PDF: ${error.message}. It might be corrupted or unsupported.</p>`;
        // Re-throw to be caught by previewManager's outer try/catch
        throw error;
    }
}