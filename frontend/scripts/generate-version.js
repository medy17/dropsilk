// scripts/generate-version.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

// --- CHANGED LOGIC START ---

// 1. Try Vercel Env Var first (Best for Vercel Previews)
// 2. Fallback to local git command
// 3. Fallback to 'main'
const rawBranch = process.env.VERCEL_GIT_COMMIT_REF ||
    runGit('git rev-parse --abbrev-ref HEAD') ||
    'main';

// Determine if this is a "Production" build
// Vercel usually uses 'main' or 'master' for prod.
const isMain = rawBranch === 'main' || rawBranch === 'master';

// --- CHANGED LOGIC END ---

let versionData = {
    full: baseVersion,
    base: baseVersion,
    isProduction: isMain,
    branch: 'main',
    build: '0'
};

if (!isMain) {
    const safeBranch = rawBranch.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

    // Attempt to get commit count.
    // On Vercel (shallow clone), this might fail or return a low number.
    // We can fallback to Vercel's commit SHA (shortened) if count fails.
    let buildId = runGit(`git rev-list --count main..HEAD`);

    if (!buildId && process.env.VERCEL_GIT_COMMIT_SHA) {
        // Fallback: Use first 7 chars of SHA if we can't count commits
        buildId = process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7);
    }

    buildId = buildId || 'dev'; // Final fallback

    versionData.full = `${baseVersion}-${safeBranch}.${buildId}`;
    versionData.branch = safeBranch;
    versionData.build = buildId;
}

const destDir = path.join(__dirname, '../src/js');
if (!fs.existsSync(destDir)){
    fs.mkdirSync(destDir, { recursive: true });
}

const content = `// Auto-generated. Do not edit.
export const VERSION = ${JSON.stringify(versionData, null, 4)};
`;

const destPath = path.join(destDir, 'version.gen.js');
fs.writeFileSync(destPath, content);

console.log(`✅ Version Generated: ${versionData.full} [${isMain ? 'PROD' : 'DEV'}]`);