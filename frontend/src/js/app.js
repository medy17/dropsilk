// js/app.js
// This is the main entry point for the application.
import '../styles.css'; // load for vite
import { store } from './state.js';
import { renderUserName, showBoardingOverlay } from './ui/view.js'; // MODIFIED: Import showBoardingOverlay
import { initializeEventListeners } from './ui/events.js';
import { initializeModals } from './ui/modals.js';
import { connect as connectWebSocket } from './network/websocket.js';

function initializeGlobalUI() {
    console.log("Initializing Global UI (Theme, Modals)...");
    initializeModals();
}

function initializeAppCore() {
    console.log("Initializing App Core Logic...");

    // Attach all event listeners specific to the app.
    initializeEventListeners();

    // Initialize the user's state.
    store.actions.initializeUser();

    // Render the initial user name on the ticket.
    renderUserName();

    // Connect to the signaling server.
    connectWebSocket();
}


// --- Main Execution ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DropSilk Initializing...");

    initializeGlobalUI();

    const isAppPage = document.querySelector(".main-content");

    // --- MODIFIED BLOCK ---
    const urlParams = new URLSearchParams(window.location.search);
    const flightCodeFromUrl = urlParams.get('code');

    if (isAppPage) {
        // If there's a valid code in the URL, show the boarding screen immediately.
        if (flightCodeFromUrl && flightCodeFromUrl.length === 6) {
            showBoardingOverlay(flightCodeFromUrl);
        }
        initializeAppCore();
    } else {
        console.log("On a non-app page (e.g., 404). Core logic will not be initialized.");
    }
    // --- END MODIFIED BLOCK ---
});