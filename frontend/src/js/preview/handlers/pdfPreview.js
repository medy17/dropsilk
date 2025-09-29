// js/preview/handlers/pdfPreview.js
// Renders PDF files in the preview modal using PDF.js.
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

// PDF.js will be available globally as 'pdfjsLib' after pdf.min.js is loaded.
// We explicitly set the worker source to the CDN path.

// Observer for lazy loading ---
let activeObserver = null;

async function renderPage(pdfDoc, pageNum, canvas) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
        canvasContext: context,
        viewport: viewport,
    };
    await page.render(renderContext).promise;
}

export default async function renderPdfPreview(blob, contentElement) {
    // Observer Cleanup ---
    // Disconnect any existing observer from a previous preview
    if (activeObserver) {
        activeObserver.disconnect();
        activeObserver = null;
    }

    // Ensure contentElement is clean and ready
    contentElement.innerHTML = '<div id="pdf-viewer-container"></div>';
    const viewerContainer = contentElement.querySelector('#pdf-viewer-container');

    const pdfUrl = URL.createObjectURL(blob);
    contentElement.dataset.objectUrl = pdfUrl;

    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdfDoc = await loadingTask.promise;

        // --- Setup Intersection Observer ---
        const observerOptions = {
            root: viewerContainer,
            rootMargin: '200px 0px', // Start loading pages 200px before they enter the viewport
        };

        const pageObserver = new IntersectionObserver(async (entries, observer) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    const pageContainer = entry.target;
                    const pageNum = parseInt(pageContainer.dataset.pageNumber, 10);

                    // Stop observing this page once it's triggered
                    observer.unobserve(pageContainer);

                    // Render the page
                    const canvas = pageContainer.querySelector('canvas');
                    try {
                        await renderPage(pdfDoc, pageNum, canvas);
                        pageContainer.querySelector('.page-loader')?.remove(); // Remove loader on success
                    } catch (renderError) {
                        console.error(`Failed to render page ${pageNum}`, renderError);
                        pageContainer.innerHTML = '<p class="empty-state">Error</p>'; // Show error on failure
                    }
                }
            }
        }, observerOptions);

        activeObserver = pageObserver;

        // Create placeholders instead of rendering directly ---
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page-container';
            pageContainer.dataset.pageNumber = pageNum;
            // Set dimensions on the container to prevent layout shifts and ensure correct scrollbar size
            pageContainer.style.width = `${viewport.width}px`;
            pageContainer.style.height = `${viewport.height}px`;

            pageContainer.innerHTML = `
                <canvas class="pdf-page-canvas"></canvas>
                <div class="page-loader">
                    <svg class="spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>
                </div>
            `;

            viewerContainer.appendChild(pageContainer);
            pageObserver.observe(pageContainer); // Start observing the placeholder
        }

        // Add self-cleaning event listener for when the modal closes ---
        const modal = document.getElementById('previewModal');
        const cleanup = () => {
            if (activeObserver) {
                activeObserver.disconnect();
                activeObserver = null;
            }
            modal.removeEventListener('click', cleanupOnOverlay);
        };
        const cleanupOnOverlay = (e) => { if (e.target === modal) cleanup(); };

        document.getElementById('closePreviewModal').addEventListener('click', cleanup, { once: true });
        modal.addEventListener('click', cleanupOnOverlay, { once: true });


    } catch (error) {
        console.error('Error rendering PDF:', error);
        viewerContainer.innerHTML = `<p class="empty-state">Failed to render PDF: ${error.message}. It might be corrupted or unsupported.</p>`;
        if (activeObserver) activeObserver.disconnect(); // Clean up on error
        throw error;
    }
}