// js/config.js
// This file contains all the static configuration for the application.

function getWebSocketUrl() {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return "ws://localhost:8080"; // Connect to your local backend server
    }
    return "wss://dropsilk-backend.onrender.com";
}
export const WEBSOCKET_URL = getWebSocketUrl();
export const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
export const HIGH_WATER_MARK = 1024 * 1024; // buffer size for data channel
export const RECAPTCHA_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';