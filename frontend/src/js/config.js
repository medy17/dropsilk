// js/config.js (Updated)

function getWebSocketUrl() {
    // If the page is not served over HTTPS, assume it's a local dev environment.
    if (window.location.protocol !== "https:") {
        // Connect to the backend using the *same hostname* but on the backend port (8080).
        // This works for localhost, 127.0.0.1, and any LAN IP like 192.168.1.105.
        return `ws://${window.location.hostname}:8080`;
    }

    // Otherwise, connect to the production backend.
    return "wss://dropsilk-backend.onrender.com";
}

export const WEBSOCKET_URL = getWebSocketUrl();
export const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
export const HIGH_WATER_MARK = 1024 * 1024; // buffer size for data channel
export const RECAPTCHA_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
export const OPFS_THRESHOLD = 256 * 1024 * 1024; // 256 MB