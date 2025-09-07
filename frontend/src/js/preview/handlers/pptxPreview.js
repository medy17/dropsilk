// This file is correct. No changes were needed.
import { uploadBlobForPreview } from "../../utils/uploadHelper.js";

export default async function renderPptxPreview(
    blob,
    contentElement,
    fileName = "presentation.pptx"
) {
    contentElement.innerHTML = `
    <div class="pptx-upload-loading">
      <div class="loading-spinner"></div>
      <p>Uploading presentation for preview...</p>
      <p style="font-size: 0.9em; color: #666;">This may take a moment</p>
    </div>
  `;

    try {
        const publicUrl = await uploadBlobForPreview(blob, fileName);
        const src =
            "https://view.officeapps.live.com/op/embed.aspx?src=" +
            encodeURIComponent(publicUrl);

        contentElement.innerHTML = `
      <iframe
        src="${src}"
        width="100%"
        height="100%"
        frameborder="0"
        style="border:none;min-height:600px;">
      </iframe>
    `;
    } catch (err) {
        console.error("PPTX preview failed:", err);
        contentElement.innerHTML = `
      <div class="empty-state">
        <h3>Preview Unavailable</h3>
        <p>Could not load presentation preview.</p>
        <p style="font-size: 0.9em; color: #666;">Error: ${
            err?.message || "Unknown error"
        }</p>
      </div>
    `;
    }
}