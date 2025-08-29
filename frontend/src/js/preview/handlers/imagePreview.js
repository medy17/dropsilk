// js/preview/handlers/imagePreview.js
// Renders image files in the preview modal.

export default async function renderImagePreview(blob, contentElement) {
    const imageUrl = URL.createObjectURL(blob);

    try {
        const image = new Image();
        image.src = imageUrl;
        image.style.maxWidth = '100%';
        image.style.maxHeight = '80vh';
        image.style.display = 'block';
        image.style.margin = 'auto';

        await image.decode();

        contentElement.appendChild(image);
        // Store URL for cleanup when the modal is closed
        contentElement.dataset.objectUrl = imageUrl;

    } catch (error) {
        console.error('Failed to load or decode image:', error);
        URL.revokeObjectURL(imageUrl); // Clean up immediately on error
        throw new Error('Failed to load image. The format may be unsupported by your browser.');
    }
}