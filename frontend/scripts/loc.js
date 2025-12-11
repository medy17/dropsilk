#!/usr/bin/env node

/**
 * DropSilk LoC Counter v2.2
 * Counts lines of code because we're nosy bastards who love stats.
 * ESLint Compliant Edition (because the linter is a nag).
 */

const fs = require('fs').promises;
const path = require('path');

// Config - mess with these if you need to
const TARGET_DIRS = ['src', 'public', 'tests', 'electron'];
const EXCLUDE_DIRS = [
    'node_modules',
    'dist',
    'build',
    'release',
    'coverage',
    '.git',
];

// Binary nonsense we don’t count
const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
    '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac',
    '.mp4', '.webm', '.avi', '.mov', '.mkv',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.zip', '.tar', '.gz', '.7z', '.rar',
    '.bin', '.dat', '.db', '.sqlite', '.pdf', '.exe', '.dll', '.so',
]);

// Stuff we flat-out ignore
const EXCLUDE_PATTERNS = [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /bun\.lockb$/,
    /^LICENSE(\.|$)/i,
    /^COPYING(\.|$)/i,
    /^README(\.|$)/i,
    /^CHANGELOG(\.|$)/i,
    /^CONTRIBUTING(\.|$)/i,
    /^HISTORY(\.|$)/i,
    /^ARCHITECTURE(\.|$)/i,
    /^\.env(\.|$)/,
    /\.gitignore$/,
    /\.dockerignore$/,
    /\.editorconfig$/,
    /\.prettierrc$/,
    /\.eslintrc$/,
    /\.md$/,
];

// Workflow files always included
const WORKFLOW_PATTERN = /\.github\/workflows\/.*\.(yml|yaml)$/;

// Brand colour palette (ANSI)
const EXT_COLOURS = {
    '.js': '\x1b[33m', // yellow
    '.ts': '\x1b[36m', // cyan
    '.jsx': '\x1b[35m', // magenta-ish
    '.tsx': '\x1b[36m',
    '.css': '\x1b[34m', // blue
    '.scss': '\x1b[34m',
    '.html': '\x1b[31m', // red
    '.json': '\x1b[32m', // green
    '.yml': '\x1b[35m', // magenta
    '.yaml': '\x1b[35m',
    '.svg': '\x1b[35m',
    '.md': '\x1b[90m', // grey
    '.webmanifest': '\x1b[36m',
    '.txt': '\x1b[37m',
    '.sh': '\x1b[32m',
};
const COLOUR_RESET = '\x1b[0m';

// Storage for our precious stats
const results = {
    totalFiles: 0,
    totalLines: 0,
    totalBytes: 0,
    totalCode: 0,
    totalComments: 0,
    totalBlanks: 0,
    byExtension: {},
    byExtensionCount: {},
    byDirectory: {},
    byDirectoryDetailed: {},
    topFiles: [],
    files: [],
};

/*───────────────────────────────*\
│        Helper Functions        │
\*───────────────────────────────*/

function shouldExclude(filePath, relativePath) {
    if (WORKFLOW_PATTERN.test(relativePath)) return false;
    const baseName = path.basename(filePath);
    const ext = path.extname(baseName).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) return true;
    for (const pattern of EXCLUDE_PATTERNS) {
        if (pattern.test(baseName)) return true;
    }
    return false;
}

// Draws a sexy bar
function drawBar(percentage, width = 40) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
}

// Update top 5 biggest files list
function updateTopFiles(fileInfo) {
    results.topFiles.push(fileInfo);
    results.topFiles.sort((a, b) => b.lines - a.lines);
    if (results.topFiles.length > 5) results.topFiles.pop();
}

/**
 * Analyses content to distinguish between code, comments, and whitespace.
 */
function analyseContent(content, extension) {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    let code = 0;
    let comments = 0;
    let blanks = 0;
    let inBlockComment = false;

    // Define comment styles based on extension
    const isCStyle = ['.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.less', '.java', '.c', '.cpp', '.h', '.php', '.go', '.rs'].includes(extension);
    const isHashStyle = ['.yaml', '.yml', '.sh', '.py', '.rb', '.dockerfile', '.conf'].includes(extension);
    const isHtmlStyle = ['.html', '.xml', '.svg', '.vue', '.svelte'].includes(extension);

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.length === 0) {
            blanks++;
            continue;
        }

        if (isCStyle) {
            if (inBlockComment) {
                comments++;
                if (trimmed.includes('*/')) inBlockComment = false;
                continue;
            }
            if (trimmed.startsWith('/*')) {
                comments++;
                if (!trimmed.includes('*/')) inBlockComment = true;
                continue;
            }
            if (trimmed.startsWith('//')) {
                comments++;
                continue;
            }
        }

        if (isHashStyle) {
            if (trimmed.startsWith('#')) {
                comments++;
                continue;
            }
        }

        if (isHtmlStyle) {
            if (inBlockComment) {
                comments++;
                if (trimmed.includes('-->')) inBlockComment = false;
                continue;
            }
            if (trimmed.startsWith('<!--')) {
                comments++;
                if (!trimmed.includes('-->')) inBlockComment = true;
                continue;
            }
        }

        code++;
    }

    return { total: lines.length, code, comments, blanks };
}

/**
 * Core processor for a single file
 */
async function processFile(fullPath, relativePath, fileName) {
    if (shouldExclude(fullPath, relativePath)) return;

    try {
        const content = await fs.readFile(fullPath, 'utf8');
        const bytes = Buffer.byteLength(content, 'utf8');
        const ext = path.extname(fileName).toLowerCase() || '(no extension)';

        const stats = analyseContent(content, ext);

        // Update totals
        results.totalFiles++;
        results.totalLines += stats.total;
        results.totalCode += stats.code;
        results.totalComments += stats.comments;
        results.totalBlanks += stats.blanks;
        results.totalBytes += bytes;

        // by extension
        results.byExtension[ext] = (results.byExtension[ext] || 0) + stats.total;
        results.byExtensionCount[ext] = (results.byExtensionCount[ext] || 0) + 1;

        // by directory
        const pathParts = relativePath.split(path.sep);
        let topDir = pathParts[0];

        // Handle files in the root folder
        if (pathParts.length === 1 && topDir !== '.github') {
            topDir = '(root)';
        } else if (topDir === '.github') {
            topDir = '.github'; // ensure .github stays clean
        }

        if (TARGET_DIRS.includes(topDir) || topDir === '.github' || topDir === '(root)') {
            results.byDirectory[topDir] = (results.byDirectory[topDir] || 0) + stats.total;

            if (topDir === 'src' && pathParts.length > 1) {
                const subDir = pathParts[1];
                results.byDirectoryDetailed[topDir] = results.byDirectoryDetailed[topDir] || {};
                results.byDirectoryDetailed[topDir][subDir] =
                    (results.byDirectoryDetailed[topDir][subDir] || 0) + stats.total;
            }
        }

        updateTopFiles({ path: relativePath, lines: stats.total, bytes, extension: ext });
        results.files.push({ path: relativePath, lines: stats.total, bytes, extension: ext });

    } catch (err) {
        console.warn(`⚠️  Couldn't read ${fullPath}: ${err.message}`);
    }
}

// Walk through dirs like a boss
async function walkDir(dir, currentPath = '') {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
        console.warn(`⚠️  Can't read ${dir}: ${err.message}`);
        return;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(currentPath, entry.name);

        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory() && EXCLUDE_DIRS.includes(entry.name)) continue;

        if (entry.isDirectory()) {
            await walkDir(fullPath, relativePath);
        } else if (entry.isFile()) {
            await processFile(fullPath, relativePath, entry.name);
        }
    }
}

/*───────────────────────────────*\
│         Output Section         │
\*───────────────────────────────*/

function visibleLength(str) {
    // Strip ANSI escape codes like \x1b[33m
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B\[[0-9;]*m/g, '').length;
}

function padVisible(str, targetLength) {
    const len = visibleLength(str);
    const diff = targetLength - len;
    return str + ' '.repeat(Math.max(0, diff));
}

function printHeader() {
    console.log(`
╔════════════════════════════════════════╗
║         DropSilk LoC Counter           ║
║   Because size does fucking matter     ║
╚════════════════════════════════════════╝
`);
}

function printSummaryBox() {
    const boxWidth = 50;
    const line = (text) => `║ ${padVisible(text, boxWidth - 3)} ║`;
    const separator = '╠' + '═'.repeat(boxWidth - 2) + '╣';
    const top = '╔' + '═'.repeat(boxWidth - 2) + '╗';
    const bottom = '╚' + '═'.repeat(boxWidth - 2) + '╝';

    const avgSize = results.totalFiles > 0 ? (results.totalLines / results.totalFiles) : 0;
    const mainLangEntry = Object.entries(results.byExtension).sort((a,b)=>b[1]-a[1])[0];
    const mainLang = mainLangEntry ? mainLangEntry[0] : 'None';

    // Ratios
    const codePct = ((results.totalCode / results.totalLines) * 100).toFixed(1);
    const commentPct = ((results.totalComments / results.totalLines) * 100).toFixed(1);
    const blankPct = ((results.totalBlanks / results.totalLines) * 100).toFixed(1);

    console.log(`\n${top}`);
    console.log(line('📊  PROJECT SUMMARY'));
    console.log(separator);
    console.log(line(`📁  Total Files:    ${results.totalFiles.toLocaleString()}`));
    console.log(line(`📝  Total Lines:    ${results.totalLines.toLocaleString()}`));
    console.log(line(`💾  Total Size:     ${(results.totalBytes / 1024).toFixed(2)} KB`));
    console.log(separator);
    console.log(line(`💻  Actual Code:    ${results.totalCode.toLocaleString()} (${codePct}%)`));
    console.log(line(`💬  Comments:       ${results.totalComments.toLocaleString()} (${commentPct}%)`));
    console.log(line(`💨  Blanks:         ${results.totalBlanks.toLocaleString()} (${blankPct}%)`));
    console.log(separator);
    console.log(line(`🧮  Avg per file:   ${Math.round(avgSize)} lines`));
    console.log(line(`🪄  Main language:  ${mainLang}`));
    console.log(bottom);
}

async function printResults() {
    console.log('\n📊  === DETAILED RESULTS ===\n');
    console.log(`Total Files: ${results.totalFiles.toLocaleString()}`);
    console.log(`Total Lines: ${results.totalLines.toLocaleString()}`);
    console.log(`Total Bytes: ${(results.totalBytes / 1024).toFixed(2)} KB\n`);

    console.log('📁  By Directory:');
    const sortedDirs = Object.entries(results.byDirectory).sort(
        (a, b) => b[1] - a[1]
    );
    const maxDirLength =
        Math.max(...Object.keys(results.byDirectory).map((d) => d.length), 0) + 2;

    for (const [dir, lines] of sortedDirs) {
        const percentage = ((lines / results.totalLines) * 100).toFixed(1);
        const bar = drawBar(percentage);
        console.log(
            `  ${dir.padEnd(maxDirLength)} ${bar} ${percentage}% (${lines.toLocaleString()} lines)`
        );

        if (results.byDirectoryDetailed?.[dir]) {
            const subDirs = Object.entries(results.byDirectoryDetailed[dir]).sort(
                (a, b) => b[1] - a[1]
            );
            for (const [subDir, subLines] of subDirs) {
                const subPct = ((subLines / results.totalLines) * 100).toFixed(1);
                const subBar = drawBar(subPct);
                console.log(
                    `    ${subDir.padEnd(maxDirLength - 2)} ${subBar} ${subPct}% (${subLines.toLocaleString()} lines)`
                );
            }
        }
    }

    await printFileExtensions();

    console.log('\n🏆  Top 5 Fattest Files (Bloat Alert):');
    for (const f of results.topFiles) {
        const pct = ((f.lines / results.totalLines) * 100).toFixed(1);
        console.log(
            `  ${f.path.padEnd(40)} ${f.lines.toLocaleString().padStart(6)} lines (${pct}%)`
        );
    }

    printSummaryBox();
}

async function printFileExtensions() {
    console.log('\n🔧  By File Extension:');

    const sortedExts = Object.entries(results.byExtension).sort(
        (a, b) => b[1] - a[1]
    );

    if (sortedExts.length === 0) {
        console.log('  No extensions found. Is this folder empty?');
        return;
    }

    const maxExtLength = Math.max(...sortedExts.map(([ext]) => ext.length)) + 2;

    for (const [ext, lines] of sortedExts) {
        const percentage = ((lines / results.totalLines) * 100).toFixed(1);
        const bar = drawBar(percentage);
        const colour = EXT_COLOURS[ext] || '\x1b[37m'; // default white
        const fileCount = results.byExtensionCount[ext] || 0;
        console.log(
            `${colour}  ${ext.padEnd(maxExtLength)} ${bar} ${percentage}% (${lines.toLocaleString()} lines, ${fileCount} files)${COLOUR_RESET}`
        );
        await new Promise((res) => setTimeout(res, 60));
    }
}

/*───────────────────────────────*\
│            Engine              │
\*───────────────────────────────*/

async function findRepoRoot(startDir) {
    let cur = startDir;
    for (let i = 0; i < 3; i++) {
        const gh = path.join(cur, '.github');
        const git = path.join(cur, '.git');
        try {
            await fs.stat(gh);
            return cur;
        } catch {
            // ignore
        }
        try {
            await fs.stat(git);
            return cur;
        } catch {
            // ignore
        }
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
    }
    return startDir;
}

async function processWorkflows(repoRoot) {
    const workflowsPath = path.join(repoRoot, '.github', 'workflows');
    try {
        const stats = await fs.stat(workflowsPath);
        if (stats.isDirectory()) {
            console.log('📂  Processing .github/workflows/...');
            await walkDir(workflowsPath, '.github/workflows');
            if (!results.byDirectory['.github'])
                results.byDirectory['.github'] = 0;
        }
    } catch {
        // quiet fail
    }
}

/*───────────────────────────────*\
│            Main Run            │
\*───────────────────────────────*/

async function main() {
    printHeader();

    const scriptDir = __dirname;
    const projectRoot = path.join(scriptDir, '..');
    const repoRoot = await findRepoRoot(projectRoot);
    if (repoRoot !== projectRoot) console.log(`📍  Found repo root: ${repoRoot}`);

    console.log('🔍  Scanning directories and judging your code style...\n');

    // 1. Scan files in the root folder specifically
    try {
        const rootEntries = await fs.readdir(projectRoot, { withFileTypes: true });
        for (const entry of rootEntries) {
            if (entry.isFile()) {
                const fullPath = path.join(projectRoot, entry.name);
                await processFile(fullPath, entry.name, entry.name);
            }
        }
    } catch (err) {
        console.warn(`⚠️  Problem scanning root dir: ${err.message}`);
    }

    // 2. Scan target directories
    for (const target of TARGET_DIRS) {
        const dirPath = path.join(projectRoot, target);
        try {
            const stats = await fs.stat(dirPath);
            if (stats.isDirectory()) {
                console.log(`📂  Processing ${target}/...`);
                await walkDir(dirPath, target);
            }
        } catch {
            console.warn(`⚠️   Directory ${target}/ not found, skipping...`);
        }
    }

    await processWorkflows(repoRoot);

    if (results.totalFiles === 0) {
        console.log(
            '\n❌  Found absolutely nothing to count. Check your directories exist, you plonker!'
        );
        return;
    }

    await printResults();

    if (process.argv.includes('--json')) {
        const jsonPath = path.join(projectRoot, 'loc-report.json');
        await fs.writeFile(jsonPath, JSON.stringify(results, null, 2));
        console.log(`\n💾  Detailed JSON report saved to ${jsonPath}`);
    }

    console.log('\n✅  Done! Now stop pissing about and get back to coding.');
}

main().catch((err) => {
    console.error('💥  Well, shit. Something exploded:', err);
    process.exit(1);
});