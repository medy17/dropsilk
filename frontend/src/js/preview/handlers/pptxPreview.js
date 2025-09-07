// js/preview/handlers/pptxPreview.js
// Advanced PPTX preview with proper image handling

// Array to store all created object URLs for easy cleanup
let objectUrlsToRevoke = [];

// OOXML namespaces
const NS = {
    p: "http://schemas.openxmlformats.org/presentationml/2006/main",
    a: "http://schemas.openxmlformats.org/drawingml/2006/main",
    r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};

export default async function renderPptxPreview(blob, contentElement) {
    if (!window.JSZip) {
        throw new Error("JSZip library not found.");
    }

    try {
        const zip = await window.JSZip.loadAsync(blob);
        const parser = new DOMParser();

        // 1. Get presentation-level details
        const presentationXmlDoc = await getXmlDoc(
            zip,
            "ppt/presentation.xml",
            parser
        );
        if (!presentationXmlDoc) {
            throw new Error("Invalid PPTX file: missing presentation.xml");
        }

        const sldSzElement = presentationXmlDoc.getElementsByTagNameNS(
            NS.p,
            "sldSz"
        )[0];
        const slideWidthEmu = parseInt(
            sldSzElement?.getAttribute("cx") || "9144000",
            10
        );
        const slideHeightEmu = parseInt(
            sldSzElement?.getAttribute("cy") || "6858000",
            10
        );
        const slideAspectRatio = slideWidthEmu / slideHeightEmu;

        // 2. Build the UI structure
        contentElement.innerHTML = `
      <div class="pptx-preview-container">
        <div class="pptx-main-view">
          <div class="pptx-slide-viewer" style="aspect-ratio: ${slideAspectRatio};">
            <!-- Full size slides will be injected here -->
          </div>
        </div>
        <div class="pptx-thumbnail-nav">
          <!-- Thumbnails will be injected here -->
        </div>
      </div>
    `;

        const slideViewer = contentElement.querySelector(".pptx-slide-viewer");
        const thumbnailNav = contentElement.querySelector(".pptx-thumbnail-nav");

        // 3. Get the list of slide files in order
        const slideFiles = await getSlideFiles(presentationXmlDoc, zip, parser);
        if (slideFiles.length === 0) {
            throw new Error("No slides found in presentation");
        }

        // 4. Process each slide
        for (let i = 0; i < slideFiles.length; i++) {
            const slideFile = slideFiles[i];
            const slideXmlDoc = await getXmlDoc(zip, slideFile.path, parser);
            if (slideXmlDoc) {
                const slideNumber = i + 1;

                // Create and render the full slide
                const slideElement = await createSlideElement(
                    slideXmlDoc,
                    slideFile.path,
                    zip,
                    slideWidthEmu,
                    slideHeightEmu,
                    `slide-${slideNumber}`
                );
                if (i > 0) slideElement.style.display = "none";
                slideViewer.appendChild(slideElement);

                // Create and render the thumbnail
                const thumbnailElement = await createSlideElement(
                    slideXmlDoc,
                    slideFile.path,
                    zip,
                    slideWidthEmu,
                    slideHeightEmu,
                    `thumb-${slideNumber}`,
                    true
                );
                thumbnailElement.dataset.targetSlide = `slide-${slideNumber}`;
                if (i === 0) thumbnailElement.classList.add("active");
                thumbnailNav.appendChild(thumbnailElement);
            }
        }

        // 5. Add event listener for thumbnail navigation
        thumbnailNav.addEventListener("click", (e) => {
            const targetThumbnail = e.target.closest(".thumbnail-item");
            if (!targetThumbnail) return;

            const targetId = targetThumbnail.dataset.targetSlide;

            slideViewer.querySelectorAll(".slide-container").forEach((slide) => {
                slide.style.display = slide.id === targetId ? "block" : "none";
            });

            thumbnailNav.querySelectorAll(".thumbnail-item").forEach((thumb) => {
                thumb.classList.toggle(
                    "active",
                    thumb.dataset.targetSlide === targetId
                );
            });
        });
    } catch (error) {
        console.error("PPTX parsing error:", error);
        throw new Error(`Could not render the presentation: ${error.message}`);
    }
}

async function createSlideElement(
    slideXmlDoc,
    slidePath,
    zip,
    slideWidthEmu,
    slideHeightEmu,
    id,
    isThumbnail = false
) {
    const container = document.createElement("div");
    container.id = id;
    container.className = isThumbnail ? "thumbnail-item" : "slide-container";

    if (isThumbnail) {
        const slideNum = id.split("-")[1];
        container.innerHTML = `<div class="thumb-number">${slideNum}</div>`;
        container.style.aspectRatio = `${slideWidthEmu / slideHeightEmu}`;
    }

    const readXfrm = (node) => {
        const xfrm = node.getElementsByTagNameNS(NS.a, "xfrm")[0];
        if (!xfrm) return null;
        const off = xfrm.getElementsByTagNameNS(NS.a, "off")[0];
        const ext = xfrm.getElementsByTagNameNS(NS.a, "ext")[0];
        if (!off || !ext) return null;
        return {
            x: parseInt(off.getAttribute("x") || "0", 10),
            y: parseInt(off.getAttribute("y") || "0", 10),
            w: parseInt(ext.getAttribute("cx") || "0", 10),
            h: parseInt(ext.getAttribute("cy") || "0", 10),
        };
    };

    const addPositionedDiv = (x, y, w, h) => {
        const el = document.createElement("div");
        el.className = "slide-element";
        el.style.position = "absolute";
        el.style.left = `${(x / slideWidthEmu) * 100}%`;
        el.style.top = `${(y / slideHeightEmu) * 100}%`;
        el.style.width = `${(w / slideWidthEmu) * 100}%`;
        el.style.height = `${(h / slideHeightEmu) * 100}%`;
        return el;
    };

    // Process PICTURES (p:pic)
    const pics = Array.from(slideXmlDoc.getElementsByTagNameNS(NS.p, "pic"));
    for (const pic of pics) {
        const xfrm = readXfrm(pic);
        if (!xfrm) continue;
        const el = addPositionedDiv(xfrm.x, xfrm.y, xfrm.w, xfrm.h);

        const blip = pic.getElementsByTagNameNS(NS.a, "blip")[0];
        const embedId =
            blip?.getAttributeNS(NS.r, "embed") || blip?.getAttribute("r:embed");
        if (embedId) {
            try {
                const imgSrc = await getImageUrl(embedId, slidePath, zip);
                const img = document.createElement("img");
                img.src = imgSrc;
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.objectFit = "contain";
                el.appendChild(img);
            } catch (error) {
                el.innerHTML =
                    '<div class="image-placeholder">🖼️ Image unavailable</div>';
            }
        }
        container.appendChild(el);
    }

    // Process SHAPES (p:sp) for text and picture fills
    const shapes = Array.from(slideXmlDoc.getElementsByTagNameNS(NS.p, "sp"));
    for (const shape of shapes) {
        const xfrm = readXfrm(shape);
        if (!xfrm) continue;
        const elementDiv = addPositionedDiv(xfrm.x, xfrm.y, xfrm.w, xfrm.h);

        // Picture fills
        const blipFill = shape.getElementsByTagNameNS(NS.a, "blipFill")[0];
        if (blipFill) {
            const blip = blipFill.getElementsByTagNameNS(NS.a, "blip")[0];
            const embedId =
                blip?.getAttributeNS(NS.r, "embed") || blip?.getAttribute("r:embed");
            if (embedId) {
                try {
                    const imgSrc = await getImageUrl(embedId, slidePath, zip);
                    const img = document.createElement("img");
                    img.src = imgSrc;
                    img.style.width = "100%";
                    img.style.height = "100%";
                    img.style.objectFit = "contain";
                    elementDiv.appendChild(img);
                } catch (error) {
                    elementDiv.innerHTML =
                        '<div class="image-placeholder">🖼️ Image error</div>';
                }
            }
        }

        // Text content
        const txBody = shape.getElementsByTagNameNS(NS.p, "txBody")[0];
        if (txBody) {
            const textContainer = document.createElement("div");
            textContainer.className = "text-content";
            textContainer.style.width = "100%";
            textContainer.style.height = "100%";
            textContainer.style.display = "flex";
            textContainer.style.flexDirection = "column";
            textContainer.style.justifyContent = "center";
            textContainer.style.padding = "2%";
            textContainer.style.boxSizing = "border-box";
            textContainer.style.overflow = "hidden";

            const paragraphs = Array.from(txBody.getElementsByTagNameNS(NS.a, "p"));
            paragraphs.forEach((p) => {
                const pElement = document.createElement("p");
                pElement.style.margin = "0.1em 0";
                pElement.style.fontSize = isThumbnail ? "0.25rem" : "1rem";
                pElement.style.lineHeight = "1.2";

                const textRuns = Array.from(p.getElementsByTagNameNS(NS.a, "r"));
                if (textRuns.length === 0) {
                    const directText =
                        p.getElementsByTagNameNS(NS.a, "t")[0]?.textContent?.trim();
                    if (directText) pElement.textContent = directText;
                } else {
                    textRuns.forEach((run) => {
                        const text =
                            run.getElementsByTagNameNS(NS.a, "t")[0]?.textContent || "";
                        if (text.trim()) {
                            const span = document.createElement("span");
                            span.textContent = text;

                            const rPr = run.getElementsByTagNameNS(NS.a, "rPr")[0];
                            if (rPr) {
                                if (rPr.getAttribute("b") === "1")
                                    span.style.fontWeight = "bold";
                                if (rPr.getAttribute("i") === "1")
                                    span.style.fontStyle = "italic";
                                if (rPr.getAttribute("u"))
                                    span.style.textDecoration = "underline";
                            }
                            pElement.appendChild(span);
                        }
                    });
                }
                if (pElement.hasChildNodes() || pElement.textContent.trim()) {
                    textContainer.appendChild(pElement);
                }
            });

            if (textContainer.hasChildNodes()) {
                elementDiv.appendChild(textContainer);
            }
        }

        if (elementDiv.hasChildNodes()) {
            container.appendChild(elementDiv);
        }
    }

    return container;
}

async function getImageUrl(embedId, slidePath, zip) {
    try {
        const slideFileName = slidePath.split("/").pop();
        const slideRelsPath = `ppt/slides/_rels/${slideFileName}.rels`;

        const relsDoc = await getXmlDoc(zip, slideRelsPath, new DOMParser());
        if (!relsDoc) {
            throw new Error(`Relationship file not found: ${slideRelsPath}`);
        }

        const rel = relsDoc.querySelector(`Relationship[Id="${embedId}"]`);
        if (!rel) {
            throw new Error(`Relationship not found for ID: ${embedId}`);
        }

        let imageTarget = rel.getAttribute("Target");
        if (!imageTarget) {
            throw new Error(`No target found for relationship: ${embedId}`);
        }

        if (imageTarget.startsWith("/")) {
            imageTarget = imageTarget.replace(/^\//, "");
        }

        let imagePath;
        if (imageTarget.startsWith("../media/")) {
            imagePath = imageTarget.replace("../", "ppt/");
        } else if (imageTarget.startsWith("media/")) {
            imagePath = `ppt/${imageTarget}`;
        } else if (imageTarget.startsWith("../")) {
            imagePath = imageTarget.replace("../", "ppt/");
        } else {
            imagePath = `ppt/media/${imageTarget}`;
        }

        let imageFile = zip.file(imagePath);
        if (!imageFile) {
            const alternatives = [
                `ppt/media/${imageTarget.split("/").pop()}`,
                imageTarget,
                `media/${imageTarget.split("/").pop()}`,
                `ppt/${imageTarget}`,
            ];
            for (const alt of alternatives) {
                imageFile = zip.file(alt);
                if (imageFile) {
                    imagePath = alt;
                    break;
                }
            }
        }

        if (!imageFile) {
            throw new Error(`Image file not found for: ${imageTarget}`);
        }

        const arrayBuffer = await imageFile.async("arraybuffer");
        const mime = mimeFromFilename(imagePath);
        const imageBlob = new Blob([arrayBuffer], { type: mime });
        const imageUrl = URL.createObjectURL(imageBlob);
        objectUrlsToRevoke.push(imageUrl);

        return imageUrl;
    } catch (error) {
        console.error(`Error loading image ${embedId}:`, error);
        throw error;
    }
}

async function getSlideFiles(presentationXmlDoc, zip, parser) {
    const slideIds = Array.from(
        presentationXmlDoc.getElementsByTagNameNS(NS.p, "sldId")
    ).map((el) => ({ id: el.getAttribute("r:id") }));

    const relsDoc = await getXmlDoc(
        zip,
        "ppt/_rels/presentation.xml.rels",
        parser
    );
    if (!relsDoc) return [];

    return slideIds
        .map((slide) => {
            const rel = relsDoc.querySelector(`Relationship[Id="${slide.id}"]`);
            if (rel) {
                return { path: `ppt/${rel.getAttribute("Target")}` };
            }
            return null;
        })
        .filter(Boolean);
}

async function getXmlDoc(zip, path, parser) {
    try {
        const file = zip.file(path);
        if (!file) return null;
        const content = await file.async("string");
        return parser.parseFromString(content, "application/xml");
    } catch (error) {
        console.error(`Error loading XML document ${path}:`, error);
        return null;
    }
}

function mimeFromFilename(name) {
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "gif":
            return "image/gif";
        case "bmp":
            return "image/bmp";
        case "webp":
            return "image/webp";
        case "svg":
            return "image/svg+xml";
        default:
            return "application/octet-stream";
    }
}

// Centralized cleanup function
export function cleanup() {
    console.log(
        `Revoking ${objectUrlsToRevoke.length} object URLs from PPTX preview.`
    );
    objectUrlsToRevoke.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsToRevoke = [];
}