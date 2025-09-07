import { genUploader } from "uploadthing/client";

export const { uploadFiles } = genUploader({
    url: "/api/uploadthing", // points to your Node server
});

export async function uploadBlobForPreview(blob, filename) {
    const file = new File([blob], filename, {
        type:
            blob.type ||
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const out = await uploadFiles("previewUpload", { files: [file] });
    if (!out?.length) throw new Error("Upload failed");
    return out[0].url;
}