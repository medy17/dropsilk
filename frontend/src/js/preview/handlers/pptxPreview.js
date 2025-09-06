// js/preview/handlers/pptxPreview.js
// Modern PPTX preview using JSZip and custom rendering

export default async function renderPptxPreview(blob, contentElement) {
    if (!window.JSZip) {
        throw new Error('JSZip library not found.');
    }

    try {
        const zip = new window.JSZip();
        const zipContent = await zip.loadAsync(blob);

        // Create container for slides
        const pptxContainer = document.createElement('div');
        pptxContainer.className = 'pptx-render-target';
        contentElement.appendChild(pptxContainer);

        // Extract presentation structure
        const presentationXml = await zipContent.file("ppt/presentation.xml")?.async("text");
        if (!presentationXml) {
            throw new Error('Invalid PPTX file: missing presentation.xml');
        }

        // Parse slides
        const slideMatches = presentationXml.match(/<p:sldId[^>]*r:id="([^"]*)"[^>]*>/g);
        if (!slideMatches) {
            throw new Error('No slides found in presentation');
        }

        // Extract relationships
        const relsXml = await zipContent.file("ppt/_rels/presentation.xml.rels")?.async("text");
        const slideFiles = [];

        if (relsXml) {
            slideMatches.forEach((match, index) => {
                const idMatch = match.match(/r:id="([^"]*)"/);
                if (idMatch) {
                    const relationId = idMatch[1];
                    const targetMatch = relsXml.match(new RegExp(`Id="${relationId}"[^>]*Target="([^"]*)"`, 'i'));
                    if (targetMatch) {
                        slideFiles.push(`ppt/${targetMatch[1]}`);
                    }
                }
            });
        }

        // If we couldn't extract slide relationships, fallback to standard naming
        if (slideFiles.length === 0) {
            for (let i = 1; i <= slideMatches.length; i++) {
                slideFiles.push(`ppt/slides/slide${i}.xml`);
            }
        }

        // Process each slide
        let slideCount = 0;
        for (const slideFile of slideFiles) {
            const slideXml = await zipContent.file(slideFile)?.async("text");
            if (slideXml) {
                slideCount++;
                await renderSlide(slideXml, pptxContainer, slideCount, zipContent);
            }
        }

        if (slideCount === 0) {
            throw new Error('No valid slides found');
        }

    } catch (error) {
        console.error('PPTX parsing error:', error);
        throw new Error(`Could not render the presentation: ${error.message}`);
    }
}

async function renderSlide(slideXml, container, slideNumber, zipContent) {
    const slideDiv = document.createElement('div');
    slideDiv.className = 'slide';
    slideDiv.innerHTML = `
        <div class="slide-header">
            <h3>Slide ${slideNumber}</h3>
        </div>
        <div class="slide-content">
            <div class="slide-preview">
                <p>📊 PowerPoint Slide ${slideNumber}</p>
                <div class="slide-text-content"></div>
                <div class="slide-images"></div>
            </div>
        </div>
    `;

    // Extract text content
    const textContent = slideDiv.querySelector('.slide-text-content');
    const textMatches = slideXml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
    if (textMatches) {
        textMatches.forEach(match => {
            const text = match.replace(/<[^>]*>/g, '').trim();
            if (text) {
                const p = document.createElement('p');
                p.textContent = text;
                textContent.appendChild(p);
            }
        });
    }

    // Extract images
    const imageContent = slideDiv.querySelector('.slide-images');
    const imageMatches = slideXml.match(/<a:blip[^>]*r:embed="([^"]*)"[^>]*>/g);
    if (imageMatches) {
        for (const match of imageMatches) {
            const embedId = match.match(/r:embed="([^"]*)"/)?.[1];
            if (embedId) {
                try {
                    await extractAndDisplayImage(embedId, slideNumber, imageContent, zipContent);
                } catch (e) {
                    console.warn('Could not extract image:', e);
                }
            }
        }
    }

    container.appendChild(slideDiv);
}

async function extractAndDisplayImage(embedId, slideNumber, imageContainer, zipContent) {
    try {
        // Get slide relationships
        const slideRelsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
        const slideRels = await zipContent.file(slideRelsPath)?.async("text");

        if (!slideRels) return;

        // Find the image target
        const targetMatch = slideRels.match(new RegExp(`Id="${embedId}"[^>]*Target="([^"]*)"`, 'i'));
        if (!targetMatch) return;

        const imagePath = `ppt/slides/${targetMatch[1]}`;
        const imageFile = zipContent.file(imagePath);
        if (!imageFile) return;

        // Get image data
        const imageBlob = await imageFile.async('blob');
        const imageUrl = URL.createObjectURL(imageBlob);

        // Create image element
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.margin = '10px 0';

        imageContainer.appendChild(img);

        // Store URL for cleanup
        if (!imageContainer.dataset.imageUrls) {
            imageContainer.dataset.imageUrls = '';
        }
        imageContainer.dataset.imageUrls += imageUrl + ',';
    } catch (error) {
        console.warn('Image extraction failed:', error);
    }
}

// Cleanup function to revoke object URLs
export function cleanup() {
    const slides = document.querySelectorAll('.slide-images');
    slides.forEach(slideImages => {
        if (slideImages.dataset.imageUrls) {
            const urls = slideImages.dataset.imageUrls.split(',').filter(url => url);
            urls.forEach(url => URL.revokeObjectURL(url));
            delete slideImages.dataset.imageUrls;
        }
    });
}