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
                const slideElement = await createSlideElement(
                    slideXmlDoc,
                    slideFile.path,
                    zip,
                    slideWidthEmu,
                    slideHeightEmu,
                    `slide-${slideNumber}`
                );
                if (i > 0) slideElement.style.display = 'none'; // Hide all but the first slide
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

    if (isThumbnail) {
        const slideNum = id.split('-')[1];
        container.innerHTML = `<div class="thumb-number">${slideNum}</div>`;
    }

    // Get all shape elements (includes text boxes and images)
    const shapes = slideXmlDoc.querySelectorAll('sp');

    for (const shape of shapes) {
        const xfrm = shape.querySelector('xfrm');
        if (!xfrm) continue;

        const off = xfrm.querySelector('off');
        const ext = xfrm.querySelector('ext');
        if (!off || !ext) continue;

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

        // Check if it's an image first
        const blipFill = shape.querySelector('blipFill');
        if (blipFill) {
            const blip = blipFill.querySelector('blip');
            const embedId = blip?.getAttribute('r:embed');
            if (embedId) {
                try {
                    const img = document.createElement('img');
                    img.src = await getImageUrl(embedId, slidePath, zip);
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'contain';
                    img.onerror = () => {
                        console.warn(`Failed to load image with embed ID: ${embedId}`);
                        img.style.display = 'none';
                    };
                    elementDiv.appendChild(img);
                } catch (error) {
                    console.warn(`Error loading image: ${error.message}`);
                }
            }
        }

        // Check for text content
        const txBody = shape.querySelector('txBody');
        if (txBody) {
            const textContainer = document.createElement('div');
            textContainer.className = 'text-content';

            const paragraphs = txBody.querySelectorAll('p');
            paragraphs.forEach(p => {
                const pElement = document.createElement('p');
                pElement.style.margin = '0.1em 0';

                const textRuns = p.querySelectorAll('r');
                if (textRuns.length === 0) {
                    // Check for direct text content
                    const directText = p.querySelector('t')?.textContent?.trim();
                    if (directText) {
                        pElement.textContent = directText;
                    }
                } else {
                    textRuns.forEach(run => {
                        const text = run.querySelector('t')?.textContent || '';
                        if (text.trim()) {
                            const span = document.createElement('span');
                            span.textContent = text;

                            // Apply basic formatting from run properties
                            const rPr = run.querySelector('rPr');
                            if (rPr) {
                                if (rPr.querySelector('b')) span.style.fontWeight = 'bold';
                                if (rPr.querySelector('i')) span.style.fontStyle = 'italic';
                                if (rPr.querySelector('u')) span.style.textDecoration = 'underline';

                                // Font size
                                const szElement = rPr.querySelector('sz');
                                if (szElement) {
                                    const fontSize = parseInt(szElement.getAttribute('val'), 10);
                                    if (fontSize) {
                                        span.style.fontSize = `${fontSize / 100}pt`;
                                    }
                                }
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
        // Construct the relationship file path correctly
        const slideFileName = slidePath.split('/').pop(); // e.g., "slide1.xml"
        const slideRelsPath = `ppt/slides/_rels/${slideFileName}.rels`;

        const relsDoc = await getXmlDoc(zip, slideRelsPath, new DOMParser());
        if (!relsDoc) {
            throw new Error(`Relationship file not found: ${slideRelsPath}`);
        }

        const rel = relsDoc.querySelector(`Relationship[Id="${embedId}"]`);
        if (!rel) {
            throw new Error(`Relationship not found for ID: ${embedId}`);
        }

        let imageTarget = rel.getAttribute('Target');
        if (!imageTarget) {
            throw new Error(`No target found for relationship: ${embedId}`);
        }

        // Resolve the image path correctly
        let imagePath;
        if (imageTarget.startsWith('../')) {
            // Relative path going up from slides directory
            imagePath = imageTarget.replace('../', 'ppt/');
        } else if (imageTarget.startsWith('./')) {
            // Relative path in same directory as slides
            imagePath = `ppt/slides/${imageTarget.replace('./', '')}`;
        } else if (!imageTarget.startsWith('/')) {
            // Relative path - assume it's relative to slides directory
            imagePath = `ppt/slides/${imageTarget}`;
        } else {
            // Absolute path (shouldn't happen in PPTX)
            imagePath = imageTarget.substring(1);
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
    } catch (error) {
        console.error(`Error loading image ${embedId}:`, error);
        throw error;
    }
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

// Centralized cleanup function
export function cleanup() {
    console.log(`Revoking ${objectUrlsToRevoke.length} object URLs from PPTX preview.`);
    objectUrlsToRevoke.forEach(url => URL.revokeObjectURL(url));
    objectUrlsToRevoke = []; // Reset the array
}