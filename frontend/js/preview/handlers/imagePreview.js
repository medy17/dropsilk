// js/preview/handlers/imagePreview.js
// Renders image files in the preview modal.

export default function renderImagePreview(blob, contentElement) {
    return new Promise((resolve, reject) => {
        const imageUrl = URL.createObjectURL(blob);

        const image = new Image();
        image.src = imageUrl;
        image.style.maxWidth = '100%';
        image.style.maxHeight = '80vh';
        image.style.display = 'block';
        image.style.margin = 'auto';

        image.onload = () => {
            contentElement.appendChild(image);
            // The object URL is revoked when the modal is closed (see modals.js)
            contentElement.dataset.objectUrl = imageUrl; // Store URL for cleanup
            resolve();
        };
        image.onerror = () => {
            URL.revokeObjectURL(imageUrl);
            reject(new Error('Failed to load image.'));
        };
    });
}