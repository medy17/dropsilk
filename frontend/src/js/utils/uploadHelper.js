// Loads UploadThing's client from a bundling CDN (esm.sh) so it works in plain browsers.

let uploaderPromise = null;

async function getUploader() {
    if (uploaderPromise) return uploaderPromise;

    uploaderPromise = (async () => {
        const candidates = [
            "https://esm.sh/uploadthing@7/client?bundle&target=es2020",
            "https://esm.sh/uploadthing@7/client?bundle",
        ];

        let lastErr;
        for (const url of candidates) {
            try {
                // @vite-ignore
                const mod = await import(/* @vite-ignore */ url);
                if (mod && typeof mod.genUploader === "function") {
                    const { genUploader } = mod;
                    // Point to your vanilla Node endpoint
                    const ut = genUploader({ url: "/api/uploadthing" });
                    return ut;
                }
            } catch (e) {
                lastErr = e;
                console.warn("UploadThing CDN import failed for", url, e);
            }
        }
        throw lastErr || new Error("Could not load UploadThing client");
    })();

    return uploaderPromise;
}

export async function uploadBlobForPreview(
    blob,
    filename = "presentation.pptx"
) {
    const ut = await getUploader();
    const { uploadFiles } = ut;

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