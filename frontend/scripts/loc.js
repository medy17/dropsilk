#!/usr/bin/env node

/**
 * DropSilk LoC Counter
 * Counts lines of code because we're nosy bastards who love stats
 */

const fs = require('fs').promises;
const path = require('path');

// Config - mess with these if you need to
const TARGET_DIRS = ['src', 'public', 'tests', 'electron'];
const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', 'release', 'coverage', '.git'];

// Binary file extensions to skip - these aren't code, are they?
const BINARY_EXTENSIONS = new Set([
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
    // Audio
    '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac',
    // Video
    '.mp4', '.webm', '.avi', '.mov', '.mkv',
    // Fonts
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    // Archives
    '.zip', '.tar', '.gz', '.7z', '.rar',
    // Other binary shite
    '.bin', '.dat', '.db', '.sqlite', '.pdf', '.exe', '.dll', '.so'
]);

// Files to ignore - regex patterns for maximum flexibility
const EXCLUDE_PATTERNS = [
    // Lock files - these wankers can fuck right off
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /bun\.lockb$/,
    // License bollocks
    /^LICENSE(\.|$)/i,
    /^COPYING(\.|$)/i,
    // Documentation wank
    /^README(\.|$)/i,
    /^CHANGELOG(\.|$)/i,
    /^CONTRIBUTING(\.|$)/i,
    /^HISTORY(\.|$)/i,
    /^ARCHITECTURE(\.|$)/i,
    // Environment files - keep your secrets secret, innit
    /^\.env(\.|$)/,
    // Other useless config shite
    /\.gitignore$/,
    /\.dockerignore$/,
    /\.editorconfig$/,
    /\.prettierrc$/,
    /\.eslintrc$/,
    /\.md$/ // All markdown files - boring!
];

// Workflow files are special - we want these little beauties
const WORKFLOW_PATTERN = /\.github\/workflows\/.*\.(yml|yaml)$/;

// Store all the juicy data
const results = {
    totalFiles: 0,
    totalLines: 0,
    totalBytes: 0,
    byExtension: {},
    byDirectory: {},
    files: []
};

// Should we skip this file? Let's check...
function shouldExclude(filePath, relativePath) {
    // Workflows are always included - they're proper code
    if (WORKFLOW_PATTERN.test(relativePath)) {
        return false;
    }

    const baseName = path.basename(filePath);
    const ext = path.extname(baseName).toLowerCase();

    // Skip binary files
    if (BINARY_EXTENSIONS.has(ext)) {
        return true;
    }

    // Check against our shitlist
    for (const pattern of EXCLUDE_PATTERNS) {
        if (pattern.test(baseName)) {
            return true;
        }
    }

    return false;
}

// Walk through directories like a boss
async function walkDir(dir, currentPath = '') {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        // Directory doesn't exist? No drama, skip it
        console.warn(`⚠️  Can't read ${dir}: ${error.message}`);
        return;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(currentPath, entry.name);

        // Skip symlinks to avoid circular bullshit
        if (entry.isSymbolicLink()) {
            continue;
        }

        // Skip excluded directories
        if (entry.isDirectory() && EXCLUDE_DIRS.includes(entry.name)) {
            continue;
        }

        if (entry.isDirectory()) {
            await walkDir(fullPath, relativePath);
        } else if (entry.isFile()) {
            // Skip excluded files
            if (shouldExclude(fullPath, relativePath)) {
                continue;
            }

            try {
                const content = await fs.readFile(fullPath, 'utf8');
                const lines = content.split('\n').length;
                const bytes = Buffer.byteLength(content, 'utf8');
                const ext = path.extname(entry.name) || '(no extension)';

                // Update totals
                results.totalFiles++;
                results.totalLines += lines;
                results.totalBytes += bytes;

                // Track by file extension
                results.byExtension[ext] = (results.byExtension[ext] || 0) + lines;

                // Track by top-level directory
                const pathParts = relativePath.split(path.sep);
                const topDir = pathParts[0] === '.github' ? '.github' : pathParts[0];
                if (TARGET_DIRS.includes(topDir) || topDir === '.github') {
                    results.byDirectory[topDir] = (results.byDirectory[topDir] || 0) + lines;
                }

                // Store individual file details
                results.files.push({
                    path: relativePath,
                    lines,
                    bytes,
                    extension: ext
                });
            } catch (error) {
                // Probably a binary file or some other bullshit we can't read
                console.warn(`⚠️  Couldn't read ${fullPath}: ${error.message}`);
            }
        }
    }
}

// Fancy header because we're not complete animals
function printHeader() {
    console.log(`
╔════════════════════════════════════════╗
║         DropSilk LoC Counter           ║
║   Because size does fucking matter     ║
╚════════════════════════════════════════╝
`);
}

// Print results all nice and pretty
function printResults() {
    console.log('\n📊 === RESULTS ===\n');

    console.log(`Total Files: ${results.totalFiles.toLocaleString()}`);
    console.log(`Total Lines: ${results.totalLines.toLocaleString()}`);
    console.log(`Total Bytes: ${(results.totalBytes / 1024).toFixed(2)} KB\n`);

    console.log('📁 By Directory:');
    const sortedDirs = Object.entries(results.byDirectory)
        .sort((a, b) => b[1] - a[1]);

    for (const [dir, lines] of sortedDirs) {
        const percentage = ((lines / results.totalLines) * 100).toFixed(1);
        console.log(`  ${dir.padEnd(15)}: ${lines.toLocaleString().padStart(8)} lines (${percentage}%)`);
    }

    console.log('\n🔧 By File Extension:');
    const sortedExts = Object.entries(results.byExtension)
        .sort((a, b) => b[1] - a[1]);

    for (const [ext, lines] of sortedExts) {
        const percentage = ((lines / results.totalLines) * 100).toFixed(1);
        console.log(`  ${ext.padEnd(10)}: ${lines.toLocaleString().padStart(8)} lines (${percentage}%)`);
    }
}

// Find repository root by looking for .github directory
async function findRepoRoot(startDir) {
    let currentDir = startDir;

    // Search up to 3 levels deep for .github or .git
    for (let i = 0; i < 3; i++) {
        const githubPath = path.join(currentDir, '.github');
        const gitPath = path.join(currentDir, '.git');

        try {
            await fs.stat(githubPath);
            return currentDir;
        } catch {}

        try {
            await fs.stat(gitPath);
            return currentDir;
        } catch {}

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            break; // Reached filesystem root
        }
        currentDir = parentDir;
    }

    return startDir; // Fallback to startDir
}

// Process workflow files from repo root
async function processWorkflows(repoRoot) {
    const workflowsPath = path.join(repoRoot, '.github', 'workflows');

    try {
        const stats = await fs.stat(workflowsPath);
        if (stats.isDirectory()) {
            console.log(`📂 Processing .github/workflows/...`);
            await walkDir(workflowsPath, '.github/workflows');
            // Ensure .github is tracked in results
            if (!results.byDirectory['.github']) {
                results.byDirectory['.github'] = 0;
            }
            return true;
        }
    } catch (error) {
        // No workflows? No drama, mate
        console.log('ℹ️  No .github/workflows directory found');
    }

    return false;
}

// Main event - let's get this party started
async function main() {
    printHeader();

    const scriptDir = __dirname;
    const projectRoot = path.join(scriptDir, '..');
    const repoRoot = await findRepoRoot(projectRoot);

    if (repoRoot !== projectRoot) {
        console.log(`📍 Found repo root: ${repoRoot}`);
    }

    console.log('🔍 Scanning directories...\n');

    // Process target directories (relative to project root)
    for (const targetDir of TARGET_DIRS) {
        const dirPath = path.join(projectRoot, targetDir);

        try {
            const stats = await fs.stat(dirPath);
            if (stats.isDirectory()) {
                console.log(`📂 Processing ${targetDir}/...`);
                await walkDir(dirPath, targetDir);
            }
        } catch (error) {
            console.warn(`⚠️  Directory ${targetDir}/ not found, skipping...`);
        }
    }

    // Process workflow files from repo root
    await processWorkflows(repoRoot);

    // If we found bugger all, say so
    if (results.totalFiles === 0) {
        console.log('\n❌ Found absolutely nothing to count. Check your directories exist, you plonker!');
        return;
    }

    printResults();

    // JSON output if requested for further nerdery
    if (process.argv.includes('--json')) {
        const jsonPath = path.join(projectRoot, 'loc-report.json');
        await fs.writeFile(jsonPath, JSON.stringify(results, null, 2));
        console.log(`\n💾 Detailed JSON report saved to ${jsonPath}`);
    }

    console.log('\n✅ Done! Now stop pissing about and get back to coding.');
}

// Let's fucking go
main().catch(error => {
    console.error('💥 Well, shit. Something exploded:', error);
    process.exit(1);
});