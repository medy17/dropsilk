// js/config.js
// This file contains all the static configuration for the application.

export const WEBSOCKET_URL = "wss://dropsilk-server.onrender.com";
export const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
export const HIGH_WATER_MARK = 1024 * 1024; // 1MB buffer for data channel
export const RECAPTCHA_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'; // Google's v2 Test Key