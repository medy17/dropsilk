// js/preview/handlers/xlsxPreview.js
// Renders Excel (XLSX, XLS) files using SheetJS.

export default async function renderXlsxPreview(blob, contentElement) {
    if (!window.XLSX) {
        throw new Error('SheetJS (XLSX) library not found.');
    }

    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = window.XLSX.read(data, { type: "array" });

    // Create main container
    const xlsxContainer = document.createElement('div');
    xlsxContainer.className = 'xlsx-preview-container';

    // Create tabs container
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'xlsx-tabs';

    // Create content container for sheets
    const sheetsContainer = document.createElement('div');
    sheetsContainer.className = 'xlsx-sheets';

    // Process each sheet
    workbook.SheetNames.forEach((sheetName, index) => {
        // Create tab button
        const tabButton = document.createElement('button');
        tabButton.className = 'xlsx-tab-btn';
        tabButton.textContent = sheetName;
        if (index === 0) {
            tabButton.classList.add('active');
        }

        // Create sheet content div
        const sheetDiv = document.createElement('div');
        sheetDiv.className = 'xlsx-sheet';
        if (index > 0) {
            sheetDiv.style.display = 'none';
        }

        // Convert sheet to HTML table
        const worksheet = workbook.Sheets[sheetName];
        sheetDiv.innerHTML = window.XLSX.utils.sheet_to_html(worksheet);

        // Add event listener to tab button
        tabButton.addEventListener('click', () => {
            // Deactivate all tabs and hide all sheets
            tabsContainer.querySelectorAll('.xlsx-tab-btn').forEach(btn => btn.classList.remove('active'));
            sheetsContainer.querySelectorAll('.xlsx-sheet').forEach(sheet => sheet.style.display = 'none');

            // Activate the clicked tab and show its sheet
            tabButton.classList.add('active');
            sheetDiv.style.display = 'block';
        });

        tabsContainer.appendChild(tabButton);
        sheetsContainer.appendChild(sheetDiv);
    });

    xlsxContainer.appendChild(tabsContainer);
    xlsxContainer.appendChild(sheetsContainer);
    contentElement.appendChild(xlsxContainer);
}