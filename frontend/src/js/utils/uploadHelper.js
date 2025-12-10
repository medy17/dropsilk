// js/utils/uploadHelper.js
// FINAL VERSION

// 1. Read the backend URL from the environment variable set in Vercel.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// 2. Add a check to ensure the variable is set, providing a clear error if it's not.
if (!API_BASE_URL) {
    const errorMsg = 'FATAL: VITE_API_BASE_URL environment variable is not set. The frontend doesn\'t know where the backend is located.';
    console.error(errorMsg);
    // You might want to display this error to the user as well.
    alert(errorMsg);
    throw new Error(errorMsg);
}

let uploaderPromise = null;

async function getUploader() {
    if (uploaderPromise) return uploaderPromise;

    uploaderPromise = (async () => {
        // This part, loading the client from a CDN, is correct and unchanged.
        const candidates = [
            'https://esm.sh/uploadthing@7/client?bundle&target=es2020',
            'https://esm.sh/uploadthing@7/client?bundle',
        ];

        let lastErr;
        for (const url of candidates) {
            try {
                // @vite-ignore
                const mod = await import(/* @vite-ignore */ url);
                if (mod && typeof mod.genUploader === 'function') {
                    const { genUploader } = mod;

                    const ut = genUploader({ url: `${API_BASE_URL}/api/uploadthing` });

                    return ut;
                }
            } catch (e) {
                lastErr = e;
                console.warn('UploadThing CDN import failed for', url, e);
            }
        }
        throw lastErr || new Error('Could not load UploadThing client');
    })();

    return uploaderPromise;
}

/**
 * Upload a blob and return a public URL. This function is correct and unchanged.
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<string>} public URL
 */
export async function uploadBlobForPreview(
    blob,
    filename = 'presentation.pptx'
) {
    const ut = await getUploader();
    const { uploadFiles } = ut;

    const file = new File([blob], filename, {
        type:
            blob.type ||
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    const out = await uploadFiles('previewUpload', {
        files: [file],
    });

    if (!out || !out.length || !out[0].url) {
        throw new Error('Upload failed: no URL returned');
    }
    return out[0].url;
}