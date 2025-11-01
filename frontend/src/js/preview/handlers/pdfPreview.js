// js/preview/handlers/pdfPreview.js
// Renders PDF files in the preview modal using PDF.js.
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

// Module-level state for the observer, accessible by both render and cleanup.
let activeObserver = null;

export async function cleanup() {
    if (activeObserver) {
        activeObserver.disconnect();
        activeObserver = null;
    }
}

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
    // Call cleanup at the start to handle any lingering state from a previous preview.
    await cleanup();

    contentElement.innerHTML = '<div id="pdf-viewer-container"></div>';
    const viewerContainer = contentElement.querySelector('#pdf-viewer-container');

    const pdfUrl = URL.createObjectURL(blob);
    contentElement.dataset.objectUrl = pdfUrl;

    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdfDoc = await loadingTask.promise;

        const observerOptions = {
            root: viewerContainer,
            rootMargin: '200px 0px',
        };

        const pageObserver = new IntersectionObserver(async (entries, observer) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    const pageContainer = entry.target;
                    const pageNum = parseInt(pageContainer.dataset.pageNumber, 10);
                    observer.unobserve(pageContainer);

                    const canvas = pageContainer.querySelector('canvas');
                    try {
                        await renderPage(pdfDoc, pageNum, canvas);
                        pageContainer.querySelector('.page-loader')?.remove();
                    } catch (renderError) {
                        console.error(`Failed to render page ${pageNum}`, renderError);
                        pageContainer.innerHTML = '<p class="empty-state">Error</p>';
                    }
                }
            }
        }, observerOptions);

        // Assign to the module-level variable so cleanup() can access it.
        activeObserver = pageObserver;

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page-container';
            pageContainer.dataset.pageNumber = pageNum;
            pageContainer.style.aspectRatio = viewport.width / viewport.height;
            pageContainer.innerHTML = `
                <canvas class="pdf-page-canvas"></canvas>
                <div class="page-loader">
                    <svg class="spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>
                </div>
            `;

            viewerContainer.appendChild(pageContainer);
            pageObserver.observe(pageContainer);
        }

        // REMOVED: All self-managed event listeners for modal closing.
        // The previewManager now handles this by calling our exported cleanup() function.

    } catch (error) {
        console.error('Error rendering PDF:', error);
        viewerContainer.innerHTML = `<p class="empty-state">Failed to render PDF: ${error.message}. It might be corrupted or unsupported.</p>`;
        await cleanup(); // Also clean up on error.
        throw error;
    }
}