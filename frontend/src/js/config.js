// js/config.js (FINAL, CORRECTED VERSION)

function getWebSocketUrl() {
    // Vite sets this variable automatically. It's 'production' during a build, and 'development' during dev.
    if (import.meta.env.MODE === 'production') {
        // For any production build (web deploy OR Electron), always use the production URL.
        return "wss://dropsilk-backend.onrender.com";
    }

    // The following logic will only run in development mode (`npm run dev` or `npm run dev:electron`).
    if (window.location.protocol !== "https:") {
        // Connect to the local backend using the same hostname but on port 8080.
        return `ws://${window.location.hostname}:8080`;
    }

    // A fallback for rare cases like using HTTPS in local dev.
    return "wss://dropsilk-backend.onrender.com";
}

export const WEBSOCKET_URL = getWebSocketUrl();
// ICE_SERVERS are now fetched dynamically from the backend in webrtc.js to support TURN.
export const HIGH_WATER_MARK = 1024 * 1024; // buffer size for data channel
// reCAPTCHA: read from Vite env; do not hardcode in source.
export const RECAPTCHA_SITE_KEY =
  (import.meta.env && import.meta.env.VITE_RECAPTCHA_SITE_KEY) || "";
// Backend base URL (already used elsewhere in the app via import.meta.env),
// exporting here for consistency so other modules can rely on a single source.
export const API_BASE_URL =
  (import.meta.env && import.meta.env.VITE_API_BASE_URL) || "";
export const OPFS_THRESHOLD = 256 * 1024 * 1024; // 256 MB