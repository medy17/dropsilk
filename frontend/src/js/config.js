// js/config.js (FINAL, CORRECTED VERSION)

function getWebSocketUrl() {
    // Check if we're running in vite preview (localhost:4173 or similar)
    const isPreviewMode = window.location.port === '4173' || 
                         (window.location.hostname === 'localhost' && window.location.port !== '5173');
    
    // Vite sets this variable automatically. It's 'production' during a build, and 'development' during dev.
    if (import.meta.env.MODE === 'production' && !isPreviewMode) {
        // For production builds (web deploy OR Electron), use the production URL.
        return 'wss://dropsilk-backend.onrender.com';
    }

    // For development mode or preview mode, connect to local backend
    if (window.location.protocol !== 'https:') {
        // Connect to the local backend using the same hostname but on port 8080.
        return `ws://${window.location.hostname}:8080`;
    }

    // A fallback for rare cases like using HTTPS in local dev.
    return 'wss://dropsilk-backend.onrender.com';
}

export const WEBSOCKET_URL = getWebSocketUrl();
// ICE_SERVERS are now fetched dynamically from the backend in webrtc.js to support TURN.
export const HIGH_WATER_MARK = 1024 * 1024; // buffer size for data channel
// reCAPTCHA: read from Vite env; do not hardcode in source.
export const RECAPTCHA_SITE_KEY = (import.meta.env?.VITE_RECAPTCHA_SITE_KEY) || '';
export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL) || '';
export const OPFS_THRESHOLD = 256 * 1024 * 1024; // 256 MB