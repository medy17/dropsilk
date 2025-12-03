// src/js/utils/security.js

// The "Oh Fuck No" list
const EXECUTABLE_EXTENSIONS = new Set([
    'exe', 'msi', 'com', 'bat', 'cmd', 'vbs', 'ps1', // Windows
    'dmg', 'pkg', 'app', // macOS
    'sh', 'bin', 'run', 'appimage', 'deb', 'rpm', // Linux
    'apk', // Android
    'jar', // Java
    'js', 'jsx', 'vbe', 'wsf', 'wsc' // Scripts
]);

export function isExecutable(filename) {
    if (!filename) return false;

    // Trim whitespace and force lowercase
    const cleanName = filename.trim().toLowerCase();
    const parts = cleanName.split('.');

    // Check if we have an extension
    if (parts.length < 2) return false;

    const ext = parts.pop();
    return EXECUTABLE_EXTENSIONS.has(ext);
}