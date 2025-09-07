// More robust approach for vanilla JS environments
let uploadThing = null;

async function initializeUploadThing() {
    if (uploadThing) return uploadThing;

    try {
        // Import the client library dynamically
        const { genUploader } = await import("https://unpkg.com/uploadthing@latest/client");

        uploadThing = genUploader({
            url: "/api/uploadthing",
        });

        return uploadThing;
    } catch (error) {
        console.error("Failed to initialize UploadThing:", error);
        throw new Error("Could not load upload service");
    }
}

export async function uploadBlobForPreview(blob, filename) {
    try {
        const { uploadFiles } = await initializeUploadThing();

        // Convert blob to File
        const file = new File([blob], filename, {
            type: blob.type || "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        });

        console.log("Starting upload:", filename);

        const result = await uploadFiles("previewUpload", {
            files: [file],
        });

        if (!result || result.length === 0) {
            throw new Error("Upload failed - no response from server");
        }

        console.log("Upload successful:", result[0].url);
        return result[0].url;

    } catch (error) {
        console.error("Upload error:", error);
        throw new Error(`Upload failed: ${error.message}`);
    }
}