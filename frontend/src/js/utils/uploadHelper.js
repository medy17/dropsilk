// js/utils/uploadHelper.js
// Loads UploadThing's client from a bundling CDN (esm.sh) so it works in plain browsers.

let uploaderPromise = null;

async function getUploader() {
    if (uploaderPromise) return uploaderPromise;

    uploaderPromise = (async () => {
        // Try a couple of URLs just in case
        const candidates = [
            // Pin to a major v7 and bundle dependencies for the browser
            "https://esm.sh/uploadthing@7/client?bundle&target=es2020",
            // Fallback (latest v7)
            "https://esm.sh/uploadthing@7/client?bundle",
        ];

        let lastErr;
        for (const url of candidates) {
            try {
                // @vite-ignore prevents some bundlers from rewriting this import
                const mod = await import(/* @vite-ignore */ url);
                if (mod && typeof mod.genUploader === "function") {
                    const { genUploader } = mod;
                    // Point to your vanilla Node endpoint you added
                    const ut = genUploader({ url: "/api/uploadthing" });
                    return ut;
                }
            } catch (e) {
                lastErr = e;
                // eslint-disable-next-line no-console
                console.warn("UploadThing CDN import failed for", url, e);
            }
        }
        throw lastErr || new Error("Could not load UploadThing client");
    })();

    return uploaderPromise;
}

/**
 * Upload a blob (PPTX) and return a public URL you can pass to Office Online Viewer.
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<string>} public URL
 */
export async function uploadBlobForPreview(
    blob,
    filename = "presentation.pptx"
) {
    const ut = await getUploader();
    const { uploadFiles } = ut;

    // UploadThing expects File objects
    const file = new File([blob], filename, {
        type:
            blob.type ||
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const out = await uploadFiles("previewUpload", {
        files: [file],
    });

    if (!out || !out.length || !out[0].url) {
        throw new Error("Upload failed: no URL returned");
    }
    return out[0].url;
}