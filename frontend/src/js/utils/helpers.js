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
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) return `<svg viewBox="0 0 20 20" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="12" rx="2" fill="#e3f7fd" stroke="var(--c-primary)"/><circle cx="7" cy="8" r="1.5" fill="var(--c-primary)"/><path d="M3 16l4-5 3 4 4-6 3 7" stroke="var(--c-secondary)" stroke-width="1.5" fill="none"/></svg>`;
    if (['mp4', 'mov', 'avi', 'mkv', 'm4v'].includes(extension)) return `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8" ry="2.8" fill="#f5eafd" stroke="var(--c-secondary)"/><polygon points="9.2 10 17.9 14.2 9.2 18.4" fill="var(--c-primary)"/></svg>`;
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) return `<svg viewBox="0 0 28 28" width="28" height="28" fill="none"><rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8" ry="2.8" fill="#eafdff" stroke="var(--c-primary)"/><path d="M11.3,9.6v7.3c-.4-.3-.8-.4-1.4-.4-1.1,0-2.1.8-2.1,1.7s.9,1.7,2.1,1.7,2.1-.8,2.1-1.7v-6.8l6.5-.8v5.5c-.4-.3-.8-.4-1.4-.4-1.1,0-2.1.8-2.1,1.7s.9,1.7,2.1,1.7,2.1-.8,2.1-1.7v-8.5c0-.5-.5-.9-1-.9l-6.1.6c-.5,0-.8.4-.8.9Z" fill="var(--c-secondary)"/></svg>`;
    if (['pdf'].includes(extension)) return `<svg viewBox="0 0 20 20" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="12" rx="2" fill="#fff" stroke="var(--c-primary)"/><rect x="6" y="8" width="8" height="1.5" fill="var(--c-secondary)"/><rect x="6" y="11" width="5" height="1.5" fill="var(--c-secondary)"/></svg>`;
    if (['zip', 'rar', '7z'].includes(extension)) return `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8" ry="2.8" fill="#fffaf7" stroke="var(--c-secondary)"/><rect x="12.6" y="8.4" width="2.8" height="11.2" fill="var(--c-primary)"/><rect x="9.8" y="14" width="8.4" height="2.8" fill="var(--c-secondary)"/></svg>`;
    if (['txt', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rb', 'php', 'sh', 'yml', 'yaml', 'rtf'].includes(extension)) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21.7 18.9" width="28" height="28" fill="none"><rect x="1.05" y="1.05" width="19.6" height="16.8" rx="2.8" ry="2.8" fill="#f5eafd" stroke="var(--c-primary)" stroke-width="2.1"/><polyline points="7.23 6.45 3.8 9.45 7.23 12.45" stroke="var(--c-secondary)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14.47 6.45 17.9 9.45 14.47 12.45" stroke="var(--c-secondary)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12.02" y1="4.94" x2="9.68" y2="13.96" stroke="var(--c-primary)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.2" y="5.6" width="19.6" height="16.8" rx="2.8" ry="2.8" fill="#f4f4f5" stroke="var(--c-primary)"/><path d="M12.2,16v-.4c0-.6.1-1.2.3-1.6.2-.4.7-.8,1.4-1.2.6-.3.9-.6,1.1-.8.2-.2.3-.4.3-.7s-.1-.6-.4-.8c-.3-.2-.7-.3-1.1-.3s-.9.1-1.2.3c-.3.2-.5.5-.6.8h-2.5c0-.7.3-1.3.7-1.8s.9-.9,1.5-1.2,1.4-.5,2.2-.5,1.5.1,2.1.4,1.1.7,1.4,1.2c.3.5.5,1.1.5,1.8s-.2,1.1-.5,1.6c-.3.5-.8.9-1.5,1.3-.5.3-.9.6-1,.8-.2.2-.2.5-.2.7v.2h-2.5ZM13.5,16.9c.4,0,.8.2,1.1.5.3.3.5.7.5,1.1s-.2.8-.5,1.1c-.3.3-.7.5-1.1.5s-.8-.2-1.1-.5c-.3-.3-.5-.7-.5-1.1s.2-.8.5-1.1c.3-.3.7-.5,1.1-.5Z" fill="var(--c-secondary)" stroke="var(--c-primary)" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.8"/></svg>`;
}
