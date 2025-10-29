// js/utils/helpers.js
// This file contains pure utility functions that can be used anywhere in the application.

export function generateRandomName() {
    const adjectives = ["Swift", "Clever", "Silent", "Agile", "Brave", "Bright", "Eager", "Bold", "Flying", "Soaring", "Windy", "Cloudy"];
    const nouns = ["Fox", "Jaguar", "Eagle", "Sparrow", "Lion", "Tiger", "River", "Sky", "Aero", "Jet", "Pilot", "Wing"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 900) + 100}`;
}

export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function getFileIcon(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();

    const ICONS = {
        image: `
      <svg viewBox="0 0 20 20" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="4" width="14" height="12" rx="2"
          fill="#e3f7fd" stroke="var(--c-primary)" />
        <circle cx="7" cy="8" r="1.5" fill="var(--c-primary)" />
        <path d="M3 16l4-5 3 4 4-6 3 7"
          stroke="var(--c-secondary)" stroke-width="1.5" fill="none" />
      </svg>
    `,
        video: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5">
        <rect x="4.2" y="5.6" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#f5eafd" stroke="var(--c-secondary)" />
        <polygon points="9.2 10 17.9 14.2 9.2 18.4"
          fill="var(--c-primary)" />
      </svg>
    `,
        audio: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none">
        <rect x="4.2" y="5.6" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#eafdff" stroke="var(--c-primary)" />
        <path d="M11.3,9.6v7.3c-.4-.3-.8-.4-1.4-.4-1.1,0-2.1.8-2.1,1.7
          s.9,1.7,2.1,1.7,2.1-.8,2.1-1.7v-6.8l6.5-.8v5.5
          c-.4-.3-.8-.4-1.4-.4-1.1,0-2.1.8-2.1,1.7s.9,1.7,2.1,1.7,
          2.1-.8,2.1-1.7v-8.5c0-.5-.5-.9-1-.9l-6.1.6c-.5,0-.8.4-.8.9Z"
          fill="var(--c-secondary)" />
      </svg>
    `,
        document: `
      <svg viewBox="0 0 20 20" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="4" width="14" height="12" rx="2"
          fill="#fff" stroke="var(--c-primary)" />
        <rect x="6" y="8" width="8" height="1.5" fill="var(--c-secondary)" />
        <rect x="6" y="11" width="5" height="1.5" fill="var(--c-secondary)" />
      </svg>
    `,
        archive: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5">
        <rect x="4.2" y="5.6" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#fffaf7" stroke="var(--c-secondary)" />
        <rect x="12.6" y="8.4" width="2.8" height="11.2"
          fill="var(--c-primary)" />
        <rect x="9.8" y="14" width="8.4" height="2.8"
          fill="var(--c-secondary)" />
      </svg>
    `,
        code: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor">
        <rect x="4.2" y="5.55" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#f5eafd" stroke="var(--c-primary)"
          stroke-width="2.1" />
        <g stroke-linecap="round" stroke-linejoin="round">
          <polyline stroke="var(--c-secondary)" stroke-width="1.5"
            points="10.38 10.95 6.95 13.95 10.38 16.95" />
          <polyline stroke="var(--c-secondary)" stroke-width="1.5"
            points="17.62 10.95 21.05 13.95 17.62 16.95" />
          <line stroke="var(--c-primary)" stroke-width="1.8"
            x1="15.17" y1="9.44" x2="12.83" y2="18.46" />
        </g>
      </svg>
    `,
        presentation: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none">
      <rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8" ry="2.8"
    fill="#fffaf7" stroke="var(--c-primary)" stroke-width="2.1" />
      <rect x="8.8" y="8.9" width="1.7" height="10.8" fill="var(--c-secondary)" />
      <rect x="13.1" y="12.6" width="1.7" height="7.2" fill="var(--c-primary)" />
      <rect x="17.5" y="10.8" width="1.7" height="9" fill="var(--c-secondary)" />
     </svg>
    `,
        default: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5">
        <rect x="4.2" y="5.6" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#f4f4f5" stroke="var(--c-primary)" />
        <path d="M12.2,16v-.4c0-.6.1-1.2.3-1.6.2-.4.7-.8,1.4-1.2
          .6-.3.9-.6,1.1-.8.2-.2.3-.4.3-.7s-.1-.6-.4-.8
          c-.3-.2-.7-.3-1.1-.3s-.9.1-1.2.3c-.3.2-.5.5-.6.8h-2.5
          c0-.7.3-1.3.7-1.8s.9-.9,1.5-1.2,1.4-.5,2.2-.5,1.5.1,2.1.4,
          1.1.7,1.4,1.2c.3.5.5,1.1.5,1.8s-.2,1.1-.5,1.6
          c-.3.5-.8.9-1.5,1.3-.5.3-.9.6-1,.8-.2.2-.2.5-.2.7v.2h-2.5Z
          M13.5,16.9c.4,0,.8.2,1.1.5.3.3.5.7.5,1.1s-.2.8-.5,1.1
          c-.3.3-.7.5-1.1.5s-.8-.2-1.1-.5c-.3-.3-.5-.7-.5-1.1
          s.2-.8.5-1.1c.3-.3.7-.5,1.1-.5Z"
          fill="var(--c-secondary)" stroke="var(--c-primary)"
          stroke-linecap="round" stroke-linejoin="round"
          stroke-width="0.8" />
      </svg>
    `,
    };

    const EXTENSION_MAP = {
        image: [
            'ai', // Added: Adobe Illustrator
            'arw', // Added: Sony RAW
            'bmp',
            'cr2', // Added: Canon RAW
            'eps', // Added: Encapsulated PostScript
            'gif',
            'heic', // Added: High Efficiency Image Format
            'heif', // Added: High Efficiency Image Format
            'ico',
            'jpeg',
            'jpg',
            'nef', // Added: Nikon RAW
            'png',
            'psd', // Added: Adobe Photoshop
            'svg',
            'tiff',
        ],
        video: [
            '3gp', // Added: Older Mobile Format
            'avi',
            'flv',
            'm4v',
            'mkv',
            'mov',
            'mp4',
            'mpg', // Added: Common Video Format
            'qt', // Added: Apple QuickTime
            'webm',
            'wmv',
        ],
        audio: [
            'aac',
            'aiff', // Added: Audio Interchange File Format
            'alac', // Added: Apple Lossless Audio Codec
            'flac',
            'm4a',
            'mid', // Added: MIDI File
            'midi', // Added: MIDI File
            'mp3',
            'ogg',
            'opus', // Added: Opus Audio Codec
            'wav',
            'wma',
        ],
        document: [
            'csv',
            'doc',
            'docx',
            'epub', // Added: eBook Format
            'log', // Added: Log files
            'mobi', // Added: eBook Format
            'numbers', // Added: Apple Numbers
            'odt', // Added: OpenDocument Text
            'pages', // Added: Apple Pages
            'pdf',
            'rtf',
            'xls',
            'xlsx',
        ],
        archive: [
            '7z',
            'bz2', // Added: Bzip2
            'cab', // Added: Windows Cabinet
            'dmg',
            'gz',
            'iso',
            'jar', // Added: Java Archive
            'rar',
            'tar',
            'xz', // Added: XZ compression
            'zip',
        ],
        presentation: [
            'key',
            'odp',
            'pps', // Added: PowerPoint Slide Show
            'ppt',
            'pptx',
        ],
        code: [
            'bat', // Added: Windows Batch Script
            'c',
            'cfg', // Added: Config File
            'conf', // Added: Config File
            'cpp',
            'cs',
            'css',
            'dart', // Added: Dart Language
            'env', // Added: Environment Variables
            'go',
            'gradle', // Added: Gradle Script
            'h', // Added: C/C++ Header
            'hs', // Added: Haskell
            'html',
            'ini', // Added: INI Config
            'ipynb', // Added: Jupyter Notebook
            'java',
            'js',
            'json',
            'jsx',
            'kt', // Added: Kotlin
            'less', // Added: LESS CSS Preprocessor
            'log', // Added
            'lua', // Added: Lua Language
            'm', // Added: Objective-C / MATLAB
            'md',
            'php',
            'pl', // Added: Perl
            'ps1', // Added: PowerShell
            'py',
            'r', // Added: R Language
            'rb',
            'rs', // Added: Rust Language
            'sass',
            'scss',
            'sh',
            'sql',
            'swift',
            'tex', // Added: LaTeX
            'toml', // Added: TOML Config
            'ts',
            'tsx',
            'txt',
            'vb', // Added: Visual Basic
            'vue', // Added: Vue.js Single File Component
            'xml',
            'yaml',
            'yml',
        ],
    };

    const iconType =
        Object.keys(EXTENSION_MAP).find((type) =>
            EXTENSION_MAP[type].includes(extension)
        ) || 'default';

    return ICONS[iconType];
}
