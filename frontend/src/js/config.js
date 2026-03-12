// js/config.js (FINAL, CORRECTED VERSION)

function normalizeConfiguredUrl(rawUrl) {
    if (!rawUrl) {
        return rawUrl;
    }

    try {
        const parsed = new URL(rawUrl);
        const isLoopbackHost =
            parsed.hostname === 'localhost' ||
            parsed.hostname === '127.0.0.1' ||
            parsed.hostname === '0.0.0.0';
        const isLanPage =
            window.location.hostname !== 'localhost' &&
            window.location.hostname !== '127.0.0.1';

        if (isLoopbackHost && isLanPage) {
            parsed.hostname = window.location.hostname;
            return parsed.toString().replace(/\/$/, '');
        }
    } catch {
        return rawUrl;
    }

    return rawUrl;
}

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

function getApiBaseUrl() {
    const configuredBaseUrl = import.meta.env?.VITE_API_BASE_URL;
    if (configuredBaseUrl) {
        return normalizeConfiguredUrl(configuredBaseUrl);
    }

    const isPreviewMode = window.location.port === '4173' ||
        (window.location.hostname === 'localhost' && window.location.port !== '5173');

    if (import.meta.env.MODE === 'production' && !isPreviewMode) {
        return 'https://dropsilk-backend.onrender.com';
    }

    if (window.location.protocol !== 'https:') {
        return `http://${window.location.hostname}:8080`;
    }

    return 'https://dropsilk-backend.onrender.com';
}

export const WEBSOCKET_URL = getWebSocketUrl();
// ICE_SERVERS are now fetched dynamically from the backend in webrtc.js to support TURN.
export const HIGH_WATER_MARK = 1024 * 1024; // buffer size for data channel
// reCAPTCHA: read from Vite env; do not hardcode in source.
export const RECAPTCHA_SITE_KEY = (import.meta.env?.VITE_RECAPTCHA_SITE_KEY) || '';
export const API_BASE_URL = getApiBaseUrl();
export const OPFS_THRESHOLD = 256 * 1024 * 1024; // 256 MB