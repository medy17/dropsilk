// scripts/update-locales.js
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
// This map is the single source of truth for language names.
// When adding a new language (e.g., French with `fr.json`), add an entry here.
const languageMap = {
    en: { name: 'English', nativeName: 'English' },
    es: { name: 'Spanish', nativeName: 'Español' },
    sw: { name: 'Swahili', nativeName: 'Kiswahili' },
    zh: { name: 'Chinese', nativeName: '中文' },
    ja: { name: 'Japanese', nativeName: '日本語'},
    pt: { name: 'Portuguese', nativeName: 'Português'},
    fr: { name: 'French', nativeName: 'Français' },
    it: { name: 'Italian', nativeName: 'Italiano' },
    ms: { name: 'Malay', nativeName: 'Bahasa Melayu' },
    // Example for adding French:
    // fr: { name: 'French', nativeName: 'Français' },
};

// Paths to the files that need to be updated.
const localesDir = path.join(__dirname, '..', 'src', 'locales');
const i18nFilePath = path.join(__dirname, '..', 'src', 'js', 'i18n.js');
const modalsFilePath = path.join(__dirname, '..', 'src', 'js', 'ui', 'modals.js');

// --- SCRIPT LOGIC ---

/**
 * Finds placeholder blocks in file content and replaces them.
 * @param {string} content - The full content of the file.
 * @param {string} blockName - The name of the block (e.g., 'IMPORTS').
 * @param {string} newBlockContent - The new content to inject.
 * @returns {string} - The updated file content.
 */
function replaceBlock(content, blockName, newBlockContent) {
    const startTag = `// START-AUTOGEN-${blockName}`;
    const endTag = `// END-AUTOGEN-${blockName}`;
    const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'g');

    if (!regex.test(content)) {
        throw new Error(`Placeholder for block "${blockName}" not found in file.`);
    }

    return content.replace(regex, `${startTag}\n${newBlockContent}\n${endTag}`);
}

/**
 * Updates the i18n.js file with all found locales.
 * @param {string[]} locales - Array of locale codes (e.g., ['en', 'es']).
 */
function updateI18nFile(locales) {
    console.log(`Updating ${path.basename(i18nFilePath)}...`);
    let content = fs.readFileSync(i18nFilePath, 'utf8');

    const imports = locales.map(l => `import ${l} from '../locales/${l}.json';`).join('\n');
    const resources = locales.map(l => `            ${l}: {\n                translation: ${l},\n            },`).join('\n');

    content = replaceBlock(content, 'IMPORTS', imports);
    content = replaceBlock(content, 'RESOURCES', resources);

    fs.writeFileSync(i18nFilePath, content);
    console.log('✅ i18n.js updated successfully.');
}

/**
 * Updates the modals.js file with language options.
 * @param {string[]} locales - Array of locale codes.
 */
function updateModalsFile(locales) {
    console.log(`Updating ${path.basename(modalsFilePath)}...`);
    let content = fs.readFileSync(modalsFilePath, 'utf8');

    const options = locales.map(l => {
        const langKey = languageMap[l].name.toLowerCase();
        return `                <option value="${l}" \${i18next.language.startsWith('${l}') ? 'selected' : ''}>\${i18next.t('${langKey}')}</option>`;
    }).join('\n');

    content = replaceBlock(content, 'LANG_OPTIONS', options);

    fs.writeFileSync(modalsFilePath, content);
    console.log('✅ modals.js updated successfully.');
}

/**
 * Updates all locale JSON files to contain keys for all languages.
 * @param {string[]} locales - Array of locale codes.
 */
function updateLocaleFiles(locales) {
    console.log('Updating all locale JSON files...');
    const allLocaleFiles = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));

    for (const localeFile of allLocaleFiles) {
        const filePath = path.join(localesDir, localeFile);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Add a key for every known language
        for (const locale of locales) {
            const key = languageMap[locale].name.toLowerCase();
            const value = `${languageMap[locale].name} (${languageMap[locale].nativeName})`;
            if (!data[key]) {
                data[key] = value;
            }
        }

        // Add keys for language selector itself if missing
        if (!data['language']) data['language'] = languageMap['en'].nativeName === 'English' ? 'Language' : '';
        if (!data['languageDescription']) data['languageDescription'] = languageMap['en'].nativeName === 'English' ? 'Choose the application interface language.' : '';

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    }
    console.log('✅ All locale files updated.');
}


/**
 * Main function to run the script.
 */
function main() {
    try {
        console.log('Scanning for locales...');
        const discoveredFiles = fs.readdirSync(localesDir);
        const locales = discoveredFiles
            .filter(file => file.endsWith('.json'))
            .map(file => path.basename(file, '.json'))
            .sort();

        console.log(`Found locales: ${locales.join(', ')}`);

        // Validate that all found locales are in the map
        for (const l of locales) {
            if (!languageMap[l]) {
                throw new Error(`Locale "${l}" found in folder, but not defined in the languageMap in the script. Please update update-locales.js.`);
            }
        }

        updateI18nFile(locales);
        updateModalsFile(locales);
        updateLocaleFiles(locales);

        console.log('\n🚀 All files synchronized successfully!');
    } catch (error) {
        console.error('\n❌ An error occurred:');
        console.error(error.message);
        process.exit(1);
    }
}

main();