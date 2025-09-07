// js/preview/handlers/pptxPreview.js
// Advanced PPTX preview with proper image handling

// Array to store all created object URLs for easy cleanup
let objectUrlsToRevoke = [];

export default async function renderPptxPreview(blob, contentElement) {
    if (!window.JSZip) {
        throw new Error('JSZip library not found.');
    }

    try {
        const zip = await window.JSZip.loadAsync(blob);
        const parser = new DOMParser();

        // 1. Get presentation-level details
        const presentationXmlDoc = await getXmlDoc(zip, "ppt/presentation.xml", parser);
        if (!presentationXmlDoc) {
            throw new Error('Invalid PPTX file: missing presentation.xml');
        }

        const sldSzElement = presentationXmlDoc.querySelector('sldSz');
        const slideWidthEmu = parseInt(sldSzElement?.getAttribute('cx') || '9144000', 10);
        const slideHeightEmu = parseInt(sldSzElement?.getAttribute('cy') || '6858000', 10);
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
                if (i > 0) slideElement.style.display = 'none';
                slideViewer.appendChild(slideElement);

                // Create and render the thumbnail
                const thumbnailElement = await createSlideElement(slideXmlDoc, slideFile.path, zip, slideWidthEmu, slideHeightEmu, `thumb-${slideNumber}`, true);
                thumbnailElement.dataset.targetSlide = `slide-${slideNumber}`;
                if (i === 0) thumbnailElement.classList.add('active');
                thumbnailNav.appendChild(thumbnailElement);
            }
        }

        // 5. Add event listener for thumbnail navigation
        thumbnailNav.addEventListener('click', (e) => {
            const targetThumbnail = e.target.closest('.thumbnail-item');
            if (!targetThumbnail) return;

            const targetId = targetThumbnail.dataset.targetSlide;

            slideViewer.querySelectorAll('.slide-container').forEach(slide => {
                slide.style.display = (slide.id === targetId) ? 'block' : 'none';
            });

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
        container.style.aspectRatio = `${slideWidthEmu / slideHeightEmu}`;
    }

    // Process all shapes on the slide
    const shapes = slideXmlDoc.querySelectorAll('sp'); // Shape elements

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
        elementDiv.style.position = 'absolute';
        elementDiv.style.left = `${(x / slideWidthEmu) * 100}%`;
        elementDiv.style.top = `${(y / slideHeightEmu) * 100}%`;
        elementDiv.style.width = `${(w / slideWidthEmu) * 100}%`;
        elementDiv.style.height = `${(h / slideHeightEmu) * 100}%`;

        // Handle images first
        const blipFill = shape.querySelector('blipFill');
        if (blipFill) {
            const blip = blipFill.querySelector('blip');
            const embedId = blip?.getAttribute('r:embed');
            if (embedId) {
                try {
                    const imgSrc = await getImageUrl(embedId, slidePath, zip);
                    const img = document.createElement('img');
                    img.src = imgSrc;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'contain';
                    img.onerror = () => {
                        console.warn(`Failed to load image with embed ID: ${embedId}`);
                        elementDiv.innerHTML = '<div class="image-placeholder">🖼️ Image unavailable</div>';
                    };
                    elementDiv.appendChild(img);
                } catch (error) {
                    console.warn(`Error loading image ${embedId}:`, error);
                    elementDiv.innerHTML = '<div class="image-placeholder">🖼️ Image error</div>';
                }
            }
        }

        // Handle text content
        const txBody = shape.querySelector('txBody');
        if (txBody) {
            const textContainer = document.createElement('div');
            textContainer.className = 'text-content';
            textContainer.style.width = '100%';
            textContainer.style.height = '100%';
            textContainer.style.display = 'flex';
            textContainer.style.flexDirection = 'column';
            textContainer.style.justifyContent = 'center';
            textContainer.style.padding = '2%';
            textContainer.style.boxSizing = 'border-box';
            textContainer.style.overflow = 'hidden';

            const paragraphs = txBody.querySelectorAll('p');
            paragraphs.forEach(p => {
                const pElement = document.createElement('p');
                pElement.style.margin = '0.1em 0';
                pElement.style.fontSize = isThumbnail ? '0.25rem' : '1rem';
                pElement.style.lineHeight = '1.2';

                const textRuns = p.querySelectorAll('r');
                if (textRuns.length === 0) {
                    // Direct text content
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

                            // Apply basic formatting
                            const rPr = run.querySelector('rPr');
                            if (rPr) {
                                if (rPr.querySelector('b')) span.style.fontWeight = 'bold';
                                if (rPr.querySelector('i')) span.style.fontStyle = 'italic';
                                if (rPr.querySelector('u')) span.style.textDecoration = 'underline';
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
        // Get the slide relationships file
        const slideFileName = slidePath.split('/').pop();
        const slideRelsPath = `ppt/slides/_rels/${slideFileName}.rels`;

        const relsDoc = await getXmlDoc(zip, slideRelsPath, new DOMParser());
        if (!relsDoc) {
            throw new Error(`Relationship file not found: ${slideRelsPath}`);
        }

        // Find the relationship for this embed ID
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
        if (imageTarget.startsWith('../media/')) {
            // Most common: ../media/image1.png
            imagePath = imageTarget.replace('../', 'ppt/');
        } else if (imageTarget.startsWith('media/')) {
            // Sometimes: media/image1.png
            imagePath = `ppt/${imageTarget}`;
        } else if (imageTarget.startsWith('../')) {
            // Other relative paths: ../something/image.png
            imagePath = imageTarget.replace('../', 'ppt/');
        } else {
            // Assume it's in the media folder if no path info
            imagePath = `ppt/media/${imageTarget}`;
        }

        console.log(`Loading image: ${embedId} -> ${imageTarget} -> ${imagePath}`);

        // Try to find the image file
        let imageFile = zip.file(imagePath);

        // If not found, try common alternative paths
        if (!imageFile) {
            const alternativePaths = [
                `ppt/media/${imageTarget.split('/').pop()}`,
                imageTarget,
                `media/${imageTarget.split('/').pop()}`,
                `ppt/${imageTarget}`
            ];

            for (const altPath of alternativePaths) {
                imageFile = zip.file(altPath);
                if (imageFile) {
                    imagePath = altPath;
                    console.log(`Found image at alternative path: ${altPath}`);
                    break;
                }
            }
        }

        if (!imageFile) {
            throw new Error(`Image file not found at any path for: ${imageTarget}`);
        }

        const imageBlob = await imageFile.async('blob');
        const imageUrl = URL.createObjectURL(imageBlob);
        objectUrlsToRevoke.push(imageUrl);

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
    objectUrlsToRevoke = [];
}