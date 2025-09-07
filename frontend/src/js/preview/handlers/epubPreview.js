// js/preview/handlers/epubPreview.js

let currentBook = null;
let currentRendition = null;

export default async function renderEbookPreview(blob, contentElement) {
    if (!window.ePub) {
        throw new Error('Epub.js library not found.');
    }

    const bookUrl = URL.createObjectURL(blob);
    contentElement.dataset.objectUrl = bookUrl; // For cleanup

    // Create the main container
    const container = document.createElement('div');
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 75vh;
        width: 100%;
        background: #1a1a1a;
        border-radius: 8px;
        overflow: hidden;
    `;

    // Create navigation bar
    const navBar = document.createElement('div');
    navBar.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 20px;
        background: #2a2a2a;
        border-bottom: 1px solid #444;
        color: white;
        font-size: 14px;
    `;

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '← Previous';
    prevBtn.disabled = true;
    prevBtn.style.cssText = `
        padding: 5px 15px;
        background: #007acc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;

    const pageInfo = document.createElement('span');
    pageInfo.textContent = 'Loading...';

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next →';
    nextBtn.disabled = true;
    nextBtn.style.cssText = prevBtn.style.cssText;

    navBar.appendChild(prevBtn);
    navBar.appendChild(pageInfo);
    navBar.appendChild(nextBtn);

    // Create viewer container
    const viewerContainer = document.createElement('div');
    viewerContainer.id = `epub-viewer-${Date.now()}`; // Unique ID
    viewerContainer.style.cssText = `
        flex: 1;
        width: 100%;
        background: white;
        position: relative;
        overflow: hidden;
    `;

    // Create loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 16px;
        z-index: 10;
    `;
    loadingOverlay.textContent = 'Loading book...';

    viewerContainer.appendChild(loadingOverlay);
    container.appendChild(navBar);
    container.appendChild(viewerContainer);
    contentElement.appendChild(container);

    try {
        // Initialize the book
        currentBook = window.ePub(bookUrl);

        // Wait for book to be ready
        await currentBook.ready;

        // Create rendition
        currentRendition = currentBook.renderTo(viewerContainer.id, {
            width: "100%",
            height: "100%",
            spread: "none", // Single page view works better in modals
            allowScriptedContent: false // Security consideration
        });

        // Display first chapter
        await currentRendition.display();

        // Remove loading overlay
        loadingOverlay.remove();

        // Set up navigation
        let currentLocation = null;

        // Update page info and button states
        function updateNavigation() {
            if (currentLocation) {
                const progress = Math.round(currentLocation.start.percentage * 100);
                pageInfo.textContent = `${progress}%`;

                prevBtn.disabled = currentLocation.atStart;
                nextBtn.disabled = currentLocation.atEnd;
            }
        }

        // Navigation event handlers
        prevBtn.addEventListener('click', async () => {
            if (currentRendition) {
                await currentRendition.prev();
            }
        });

        nextBtn.addEventListener('click', async () => {
            if (currentRendition) {
                await currentRendition.next();
            }
        });

        // Track location changes
        currentRendition.on('relocated', (location) => {
            currentLocation = location;
            updateNavigation();
        });

        // Keyboard navigation
        const handleKeyPress = (e) => {
            if (!currentRendition) return;

            switch(e.key) {
                case 'ArrowLeft':
                case 'ArrowUp':
                    e.preventDefault();
                    currentRendition.prev();
                    break;
                case 'ArrowRight':
                case 'ArrowDown':
                case ' ': // Spacebar
                    e.preventDefault();
                    currentRendition.next();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyPress);

        // Store cleanup reference
        viewerContainer.dataset.keyHandler = 'attached';
        viewerContainer.keyHandler = handleKeyPress;

        // Enable button styling on hover
        [prevBtn, nextBtn].forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                if (!btn.disabled) btn.style.background = '#005a9e';
            });
            btn.addEventListener('mouseleave', () => {
                if (!btn.disabled) btn.style.background = '#007acc';
            });
        });

        // Initial navigation update after a short delay
        setTimeout(updateNavigation, 500);

    } catch (error) {
        loadingOverlay.textContent = `Failed to load book: ${error.message}`;
        console.error('EPUB loading error:', error);
        throw error;
    }
}

// Cleanup function - called by previewManager
export async function cleanup() {
    // Remove keyboard event listener
    const viewer = document.querySelector('[data-key-handler="attached"]');
    if (viewer && viewer.keyHandler) {
        document.removeEventListener('keydown', viewer.keyHandler);
    }

    // Clean up epub.js resources
    if (currentRendition) {
        try {
            currentRendition.destroy();
        } catch (e) {
            console.warn('Error destroying rendition:', e);
        }
        currentRendition = null;
    }

    if (currentBook) {
        try {
            currentBook.destroy();
        } catch (e) {
            console.warn('Error destroying book:', e);
        }
        currentBook = null;
    }
}