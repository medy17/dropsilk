// src/js/utils/helpers.js
// This file contains pure utility functions that can be used anywhere in the application.

export function generateRandomName() {
    const adjectives = ['Swift', 'Clever', 'Silent', 'Agile', 'Brave', 'Bright', 'Eager', 'Bold', 'Flying', 'Soaring', 'Windy', 'Cloudy'];
    const nouns = ['Fox', 'Jaguar', 'Eagle', 'Sparrow', 'Lion', 'Tiger', 'River', 'Sky', 'Aero', 'Jet', 'Pilot', 'Wing'];
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

    // DESIGN SYSTEM:
    // Frame: 28x28
    // Container: x=4.2 y=5.6 w=19.6 h=16.8 rx=2.8
    // Container Stroke: 2.1 (Primary)
    // Content Stroke: 1.5 - 1.8 (Secondary/Primary)

    const ICONS = {
        image: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8"
          fill="#e3f7fd" stroke="var(--c-primary)" />
        <circle cx="9.8" cy="10.5" r="2.8" fill="var(--c-primary)" stroke="none" />
        <path d="M5.6 22.4 L10.5 15.4 L14.7 19.6 L19.6 11.2 L23.8 22.4 H5.6 Z"
          fill="var(--c-secondary)" stroke="none" />
      </svg>
    `,
        video: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.2" y="5.6" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#f5eafd" stroke="var(--c-secondary)" />
        <path d="M10 10 L19 14 L10 18 Z"
          fill="var(--c-primary)" stroke="none" />
      </svg>
    `,
        audio: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.2" y="5.6" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#eafdff" stroke="var(--c-primary)" />
        <g transform="translate(14, 14) scale(1) translate(-14, -14)">
          <path d="M11.3,9.6v7.3c-.4-.3-.8-.4-1.4-.4-1.1,0-2.1.8-2.1,1.7
            s.9,1.7,2.1,1.7,2.1-.8,2.1-1.7v-6.8l6.5-.8v5.5
            c-.4-.3-.8-.4-1.4-.4-1.1,0-2.1.8-2.1,1.7s.9,1.7,2.1,1.7,
            2.1-.8,2.1-1.7v-8.5c0-.5-.5-.9-1-.9l-6.1.6c-.5,0-.8.4-.8.9Z"
            fill="var(--c-secondary)" stroke="none" />
        </g>
      </svg>
    `,
        document: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8"
          fill="#fff" stroke="var(--c-primary)" />
        <rect x="7" y="11" width="14" height="2.8" rx="1" fill="var(--c-secondary)" stroke="none" />
        <rect x="7" y="15.4" width="9" height="2.8" rx="1" fill="var(--c-secondary)" stroke="none" />
      </svg>
    `,
        archive: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.2" y="5.6" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#fffaf7" stroke="var(--c-secondary)" />
        <rect x="12.2" y="8.4" width="3.6" height="11.2" rx="1"
          fill="var(--c-primary)" stroke="none" />
        <rect x="9.1" y="13.3" width="9.8" height="3.6" rx="1"
          fill="var(--c-secondary)" stroke="none" />
      </svg>
    `,
        code: `
            <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
        stroke-linejoin="round">
        <rect x="4.2" y="5.6" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#f5eafd" stroke="var(--c-primary)" />
        <polyline points="11 10 8 14 11 18"
          stroke="var(--c-secondary)" fill="none" />
        <polyline points="17 10 20 14 17 18"
          stroke="var(--c-secondary)" fill="none" />
        <line x1="15" y1="9" x2="13" y2="19"
          stroke="var(--c-primary)" />
      </svg>
    `,
        executable: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.2" y="5.6" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#fff0f5" stroke="var(--c-secondary)" />
        <path d="M8.5 10.5 L12.5 14 L8.5 17.5 L8.5 15 L10.5 14 L8.5 13 Z" fill="var(--c-primary)" stroke="none" />
        <rect x="13.5" y="15.5" width="6.5" height="2.2" rx="0.75" fill="var(--c-primary)" stroke="none" />
      </svg>
    `,
        presentation: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8" ry="2.8"
          fill="#fffaf7" stroke="var(--c-primary)" />
        <rect x="8.4" y="8.9" width="2.8" height="10.8" rx="1" fill="var(--c-secondary)" stroke="none" />
        <rect x="12.6" y="12.6" width="2.8" height="7.2" rx="1" fill="var(--c-primary)" stroke="none" />
        <rect x="16.8" y="10.8" width="2.8" height="9" rx="1" fill="var(--c-secondary)" stroke="none" />
      </svg>
    `,
        default: `
      <svg viewBox="0 0 28 28" width="28" height="28" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.2" y="5.6" width="19.6" height="16.8"
          rx="2.8" ry="2.8" fill="#f4f4f5" stroke="var(--c-primary)" />
        <g transform="translate(14, 14) scale(1) translate(-14, -14)">
          <path d="M12.2,16v-.4c0-.6.1-1.2.3-1.6.2-.4.7-.8,1.4-1.2
            .6-.3.9-.6,1.1-.8.2-.2.3-.4.3-.7s-.1-.6-.4-.8
            c-.3-.2-.7-.3-1.1-.3s-.9.1-1.2.3c-.3.2-.5.5-.6.8h-2.5
            c0-.7.3-1.3.7-1.8s.9-.9,1.5-1.2,1.4-.5,2.2-.5,1.5.1,2.1.4,
            1.1.7,1.4,1.2c.3.5.5,1.1.5,1.8s-.2,1.1-.5,1.6
            c-.3.5-.8.9-1.5,1.3-.5.3-.9.6-1,.8-.2.2-.2.5-.2.7v.2h-2.5Z
            M13.5,16.9c.4,0,.8.2,1.1.5.3.3.5.7.5,1.1s-.2.8-.5,1.1
            c-.3.3-.7.5-1.1.5s-.8-.2-1.1-.5c-.3-.3-.5-.7-.5-1.1
            s.2-.8.5-1.1c.3-.3.7-.5,1.1-.5Z"
            fill="var(--c-secondary)" stroke="none" />
        </g>
      </svg>
    `,
    };

    const EXTENSION_MAP = {
        image: [
            'ai', 'arw', 'bmp', 'cr2', 'eps', 'gif', 'heic', 'heif', 'ico',
            'jpeg', 'jpg', 'nef', 'png', 'psd', 'svg', 'tiff', 'webp'
        ],
        video: [
            '3gp', 'avi', 'flv', 'm4v', 'mkv', 'mov', 'mp4', 'mpg', 'qt', 'webm', 'wmv', 'ts'
        ],
        audio: [
            'aac', 'aiff', 'alac', 'flac', 'm4a', 'mid', 'midi', 'mp3', 'ogg', 'opus', 'wav', 'wma'
        ],
        document: [
            'csv', 'doc', 'docx', 'epub', 'log', 'mobi', 'numbers', 'odt', 'pages', 'pdf', 'rtf', 'xls', 'xlsx'
        ],
        archive: [
            '7z', 'bz2', 'cab', 'gz', 'iso', 'rar', 'tar', 'xz', 'zip'
        ],
        executable: [
            'exe', 'msi', 'dmg', 'pkg', 'app', 'apk', 'jar', // Packages
            'sh', 'bin', 'run', 'appimage', 'deb', 'rpm', // Linux
            'bat', 'cmd', 'vbs', 'ps1' // Scripts
        ],
        presentation: [
            'key', 'odp', 'pps', 'ppt', 'pptx'
        ],
        code: [
            'c', 'cfg', 'conf', 'cpp', 'cs', 'css', 'dart', 'env', 'go', 'gradle',
            'h', 'hs', 'html', 'ini', 'ipynb', 'java', 'js', 'json', 'jsx', 'kt',
            'less', 'lua', 'm', 'md', 'php', 'pl', 'py', 'r', 'rb', 'rs',
            'sass', 'scss', 'sql', 'swift', 'tex', 'toml', 'ts', 'tsx', 'txt',
            'vb', 'vue', 'xml', 'yaml', 'yml'
        ],
    };

    const iconType =
        Object.keys(EXTENSION_MAP).find((type) =>
            EXTENSION_MAP[type].includes(extension)
        ) || 'default';

    return ICONS[iconType];
}