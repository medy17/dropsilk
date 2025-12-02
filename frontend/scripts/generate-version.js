// scripts/generate-version.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Load Package.json safely
let pkg = { version: '0.0.0' };
try {
    pkg = require('../package.json');
} catch (e) {
    console.warn('⚠️ Could not find package.json, using default version.');
}

const runGit = (command) => {
    try {
        return execSync(command).toString().trim();
    } catch (e) {
        return null;
    }
};

const baseVersion = pkg.version;
// Default to 'main' if no git repo found
const branch = runGit('git rev-parse --abbrev-ref HEAD') || 'main';
const isMain = branch === 'main' || branch === 'master';

let versionData = {
    full: baseVersion,
    base: baseVersion,
    isProduction: isMain,
    branch: 'main',
    build: '0'
};

if (!isMain) {
    const safeBranch = branch.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const commitCount = runGit(`git rev-list --count main..HEAD`) || '0';

    versionData.full = `${baseVersion}-${safeBranch}.${commitCount}`;
    versionData.branch = safeBranch;
    versionData.build = commitCount;
}

// 2. Ensure directory exists before writing
const destDir = path.join(__dirname, '../src/js');
if (!fs.existsSync(destDir)){
    fs.mkdirSync(destDir, { recursive: true });
}

const content = `// Auto-generated. Do not edit.
export const VERSION = ${JSON.stringify(versionData, null, 4)};
`;

const destPath = path.join(destDir, 'version.gen.js');
fs.writeFileSync(destPath, content);

console.log(`✅ Version Generated: ${versionData.full}`);