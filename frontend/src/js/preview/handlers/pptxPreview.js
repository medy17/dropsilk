import { uploadBlobForPreview } from "../../utils/uploadHelper.js";

export default async function renderPptxPreview(blob, contentElement, fileName) {
    contentElement.innerHTML = `
    <div class="pptx-upload-loading">
      <div class="loading-spinner"></div>
      <p>Uploading presentation for preview...</p>
    </div>
  `;

    try {
        const publicUrl = await uploadBlobForPreview(blob, fileName);
        const encodedUrl = encodeURIComponent(publicUrl);

        contentElement.innerHTML = `
      <iframe
        src="https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}"
        width="100%"
        height="100%"
        frameborder="0"
        style="border:none;min-height:600px;">
      </iframe>
    `;
    } catch (err) {
        contentElement.innerHTML = `
      <div class="empty-state">
        <h3>Preview Unavailable</h3>
        <p>${err.message}</p>
      </div>
    `;
    }
}