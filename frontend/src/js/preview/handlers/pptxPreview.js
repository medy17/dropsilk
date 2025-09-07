// js/preview/handlers/pptxPreview.js
// Advanced PPTX preview using JSZip, DOMParser, and custom rendering with a slide navigator. (CORRECTED VERSION)

// Array to store all created object URLs for easy cleanup
let objectUrlsToRevoke = [];

// Constants for converting Office Open XML units (EMUs) to pixels
const EMU_PER_PIXEL = 9525;

export default async function renderPptxPreview(blob, contentElement) {
    if (!window.JSZip) {
        throw new Error('JSZip library not found.');
    }

    try {
        const zip = await window.JSZip.loadAsync(blob);
        const parser = new DOMParser();

        // 1. Get presentation-level details (like slide size)
        const presentationXmlDoc = await getXmlDoc(zip, "ppt/presentation.xml", parser);
        if (!presentationXmlDoc) {
            throw new Error('Invalid PPTX file: missing presentation.xml');
        }

        const sldSzElement = presentationXmlDoc.querySelector('sldSz');
        const slideWidthEmu = parseInt(sldSzElement?.getAttribute('cx') || '9144000', 10);
        const slideHeightEmu = parseInt(sldSzElement?.getAttribute('cy') || '6858000', 10);
        const slideAspectRatio = slideWidthEmu / slideHeightEmu;

        // 2. Build the UI structure (navigator + main view)
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

        const slideViewer = contentElement.querySelector('.pptx-slide-viewer');
        const thumbnailNav = contentElement.querySelector('.pptx-thumbnail-nav');

        // 3. Get the list of slide files in order
        const slideFiles = await getSlideFiles(presentationXmlDoc, zip, parser);
        if (slideFiles.length === 0) {
            throw new Error('No slides found in presentation');
        }

        // 4. Process each slide
        for (let i = 0; i < slideFiles.length; i++) {
            const slideFile = slideFiles[i];
            const slideXmlDoc = await getXmlDoc(zip, slideFile.path, parser);
            if (slideXmlDoc) {
                const slideNumber = i + 1;

                // Create and render the full slide
                const slideElement = await createSlideElement(slideXmlDoc, slideFile.path, zip, slideWidthEmu, slideHeightEmu, `slide-${slideNumber}`);
                if (i > 0) slideElement.style.display = 'none'; // Hide all but the first slide
                slideViewer.appendChild(slideElement);

                // Create and render the thumbnail
                const thumbnailElement = await createSlideElement(slideXmlDoc, slideFile.path, zip, slideWidthEmu, slideHeightEmu, `thumb-${slideNumber}`, true);
                thumbnailElement.dataset.targetSlide = `slide-${slideNumber}`;
                if (i === 0) thumbnailElement.classList.add('active'); // Mark first thumbnail as active
                thumbnailNav.appendChild(thumbnailElement);
            }
        }

        // 5. Add event listener for thumbnail navigation
        thumbnailNav.addEventListener('click', (e) => {
            const targetThumbnail = e.target.closest('.thumbnail-item');
            if (!targetThumbnail) return;

            const targetId = targetThumbnail.dataset.targetSlide;

            // Update slides
            slideViewer.querySelectorAll('.slide-container').forEach(slide => {
                slide.style.display = (slide.id === targetId) ? 'block' : 'none';
            });

            // Update thumbnails
            thumbnailNav.querySelectorAll('.thumbnail-item').forEach(thumb => {
                thumb.classList.toggle('active', thumb.dataset.targetSlide === targetId);
            });
        });

    } catch (error) {
        console.error('PPTX parsing error:', error);
        throw new Error(`Could not render the presentation: ${error.message}`);
    }
}

async function createSlideElement(slideXmlDoc, slidePath, zip, slideWidthEmu, slideHeightEmu, id, isThumbnail = false) {
    const container = document.createElement('div');
    container.id = id;
    container.className = isThumbnail ? 'thumbnail-item' : 'slide-container';

    // Set aspect ratio for thumbnails
    if (isThumbnail) {
        const slideNum = id.split('-')[1];
        container.innerHTML = `<div class="thumb-number">${slideNum}</div>`;
        container.style.aspectRatio = `${slideWidthEmu / slideHeightEmu}`;
    }

    const shapes = slideXmlDoc.querySelectorAll('sp'); // p:sp, but namespace is ignored by querySelector

    for(const shape of shapes) {
        const xfrm = shape.querySelector('xfrm');
        if(!xfrm) continue;

        const off = xfrm.querySelector('off');
        const ext = xfrm.querySelector('ext');
        if(!off || !ext) continue;

        const x = parseInt(off.getAttribute('x'), 10);
        const y = parseInt(off.getAttribute('y'), 10);
        const w = parseInt(ext.getAttribute('cx'), 10);
        const h = parseInt(ext.getAttribute('cy'), 10);

        const elementDiv = document.createElement('div');
        elementDiv.className = 'slide-element';
        elementDiv.style.left = `${(x / slideWidthEmu) * 100}%`;
        elementDiv.style.top = `${(y / slideHeightEmu) * 100}%`;
        elementDiv.style.width = `${(w / slideWidthEmu) * 100}%`;
        elementDiv.style.height = `${(h / slideHeightEmu) * 100}%`;

        // Check if it's an image
        const blipFill = shape.querySelector('blipFill'); // a:blipFill
        if(blipFill) {
            const blip = blipFill.querySelector('blip'); // a:blip
            const embedId = blip?.getAttribute('r:embed');
            if(embedId) {
                const img = document.createElement('img');
                try {
                    img.src = await getImageUrl(embedId, slidePath, zip);
                    elementDiv.appendChild(img);
                } catch (error) {
                    console.warn(`Failed to load image ${embedId}:`, error.message);
                }
            }
        }

        // Check for text
        const txBody = shape.querySelector('txBody'); // p:txBody
        if (txBody) {
            const paragraphs = txBody.querySelectorAll('p'); // a:p
            paragraphs.forEach(p => {
                const pElement = document.createElement('p');
                const textRuns = p.querySelectorAll('r'); // a:r
                textRuns.forEach(run => {
                    const text = run.querySelector('t')?.textContent || ''; // a:t
                    if (text.trim()) {
                        const span = document.createElement('span');
                        span.textContent = text;
                        // Basic styling can be added here by parsing rPr element
                        pElement.appendChild(span);
                    }
                });
                if (pElement.hasChildNodes()) {
                    elementDiv.appendChild(pElement);
                }
            });
        }
        container.appendChild(elementDiv);
    }
    return container;
}

async function getImageUrl(embedId, slidePath, zip) {
    // Get the slide filename from the full path
    const slideFileName = slidePath.split('/').pop();
    const slideRelsPath = `ppt/slides/_rels/${slideFileName}.rels`;

    const relsDoc = await getXmlDoc(zip, slideRelsPath, new DOMParser());
    if(!relsDoc) {
        throw new Error(`Could not find relationships file: ${slideRelsPath}`);
    }

    const rel = relsDoc.querySelector(`Relationship[Id="${embedId}"]`);
    if(!rel) {
        throw new Error(`Could not find relationship for embed ID: ${embedId}`);
    }

    let imageTarget = rel.getAttribute('Target');

    // Handle different path formats
    let imagePath;
    if (imageTarget.startsWith('../media/')) {
        // Most common case: ../media/image1.png
        imagePath = imageTarget.replace('../', 'ppt/');
    } else if (imageTarget.startsWith('media/')) {
        // Sometimes just media/image1.png
        imagePath = `ppt/${imageTarget}`;
    } else if (imageTarget.startsWith('../')) {
        // Other relative paths
        imagePath = imageTarget.replace('../', 'ppt/');
    } else {
        // Fallback: assume it's in media folder
        imagePath = `ppt/media/${imageTarget}`;
    }

    console.log(`Loading image: ${embedId} -> ${imageTarget} -> ${imagePath}`);

    const imageFile = zip.file(imagePath);
    if (!imageFile) {
        throw new Error(`Image file not found: ${imagePath}`);
    }

    const imageBlob = await imageFile.async('blob');
    const imageUrl = URL.createObjectURL(imageBlob);
    objectUrlsToRevoke.push(imageUrl); // Track for cleanup
    return imageUrl;
}

async function getSlideFiles(presentationXmlDoc, zip, parser) {
    const slideIds = Array.from(presentationXmlDoc.querySelectorAll('sldId')).map(el => ({
        id: el.getAttribute('r:id'),
    }));

    const relsDoc = await getXmlDoc(zip, "ppt/_rels/presentation.xml.rels", parser);
    if (!relsDoc) return [];

    return slideIds.map(slide => {
        const rel = relsDoc.querySelector(`Relationship[Id="${slide.id}"]`);
        if (rel) {
            return {
                path: `ppt/${rel.getAttribute('Target')}`,
            };
        }
        return null;
    }).filter(Boolean);
}

async function getXmlDoc(zip, path, parser) {
    const file = zip.file(path);
    if (!file) return null;
    const content = await file.async("string");
    return parser.parseFromString(content, "application/xml");
}

// Centralized cleanup function
export function cleanup() {
    console.log(`Revoking ${objectUrlsToRevoke.length} object URLs from PPTX preview.`);
    objectUrlsToRevoke.forEach(url => URL.revokeObjectURL(url));
    objectUrlsToRevoke = []; // Reset the array
}