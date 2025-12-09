const fs = require('fs');
const path = require('path');
const themeConfig = require('./theme-config');

// Paths
const stylesIndex = path.join(__dirname, '../src/styles/index.css');
const settingsUI = path.join(__dirname, '../src/js/features/settings/settingsUI.js');
const themeIndex = path.join(__dirname, '../src/js/features/theme/index.js');
const themesDir = path.join(__dirname, '../src/styles/themes');

/**
 * Helper to replace content between markers
 */
function replaceBlock(content, blockName, newContent) {
    let startTag = blockName;
    if (!blockName.startsWith('//') && !blockName.startsWith('/*') && !blockName.startsWith('<!--')) {
        startTag = `/* ${blockName} */`;
    }

    // Infer end tag based on start tag format
    let endTag = startTag.replace('START', 'END');

    // Regex explanation:
    // Escape the tags for regex safety
    const safeStart = startTag.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const safeEnd = endTag.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    const regex = new RegExp(`${safeStart}[\\s\\S]*?${safeEnd}`, 'g');

    if (!regex.test(content)) {
        console.warn(`⚠️ Marker ${startTag} not found.`);
        return content;
    }

    return content.replace(regex, `${startTag}\n${newContent}\n${endTag}`);
}

function main() {
    console.log('🎨 Updating Themes...');

    // 1. Verify CSS files exist
    const cssFiles = fs.readdirSync(themesDir);
    const validThemes = [];

    Object.keys(themeConfig).forEach(key => {
        if (cssFiles.includes(`${key}.css`)) {
            validThemes.push(key);
        } else {
            console.warn(`⚠️ Warning: Config has theme "${key}" but "${key}.css" not found in styles/themes/. Skipping.`);
        }
    });

    // 2. Update styles/index.css
    // Generates: @import 'themes/midnight.css';
    const cssImports = validThemes
        .map(theme => `@import 'themes/${theme}.css';`)
        .join('\n');

    let cssContent = fs.readFileSync(stylesIndex, 'utf8');
    cssContent = replaceBlock(cssContent, 'START-AUTOGEN-THEMES', cssImports);
    fs.writeFileSync(stylesIndex, cssContent);
    console.log('✅ Updated styles/index.css');

    // 3. Update settingsUI.js (Dropdown Options)
    // Generates: <option value="midnight" ${settings.theme === 'midnight' ? 'selected' : ''}>Midnight</option>
    const uiOptions = validThemes
        .map(theme => {
            const name = themeConfig[theme].name;
            return `            <option value="${theme}" \${settings.theme === '${theme}' ? 'selected' : ''}>${name}</option>`;
        })
        .join('\n');

    let uiContent = fs.readFileSync(settingsUI, 'utf8');
    uiContent = replaceBlock(uiContent, '<!-- START-AUTOGEN-THEME-OPTIONS -->', uiOptions);
    fs.writeFileSync(settingsUI, uiContent);
    console.log('✅ Updated settingsUI.js');

    // 4. Update theme/index.js (Meta Colors)
    // Generates: midnight: '#16161e', // Midnight Dark
    const metaColors = validThemes
        .map(theme => {
            const color = themeConfig[theme].darkColor;
            const name = themeConfig[theme].name;
            return `        ${theme}: '${color}', // ${name} Dark`;
        })
        .join('\n');

    let jsContent = fs.readFileSync(themeIndex, 'utf8');
    jsContent = replaceBlock(jsContent, '// START-AUTOGEN-META-COLORS', metaColors);
    fs.writeFileSync(themeIndex, jsContent);
    console.log('✅ Updated theme/index.js');

    console.log('🚀 Theme update complete!');
}

main();
