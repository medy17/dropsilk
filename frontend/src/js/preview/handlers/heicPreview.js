// js/preview/handlers/heicPreview.js
// Renders HEIC/HEIF images by converting them to a browser-compatible format.
import heic2any from 'heic2any';

export default async function renderHeicPreview(blob, contentElement) {
    let convertedBlob;
    let objectUrl;

    try {
        // Step 1: Convert the HEIC blob to a JPEG blob.
        // We choose JPEG for its good compression and universal support.
        convertedBlob = await heic2any({
            blob,
            toType: 'image/jpeg',
            quality: 0.4, // Optional: control the quality
        });

        // If the result is an array, take the first one (for multi-image files)
        if (Array.isArray(convertedBlob)) {
            convertedBlob = convertedBlob[0];
        }

        // Step 2: Use the exact same logic as your imagePreview.js to display the *new* blob.
        objectUrl = URL.createObjectURL(convertedBlob);
        const image = new Image();
        image.src = objectUrl;
        image.style.maxWidth = '100%';
        image.style.maxHeight = '80vh';
        image.style.display = 'block';
        image.style.margin = 'auto';

        await image.decode();

        contentElement.appendChild(image);
        // Store URL for cleanup when the modal is closed
        contentElement.dataset.objectUrl = objectUrl;

    } catch (error) {
        console.error('Failed to convert or load HEIC image:', error);
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl); // Clean up if URL was created before error
        }
        throw new Error('Could not preview the HEIC file. It might be corrupt or in an unsupported variation.');
    }
}