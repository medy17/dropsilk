// js/app.js
// This is the main entry point for the application.
import '../styles.css'; // load for vite
import { store } from './state.js';
import { renderUserName, showBoardingOverlay } from './ui/view.js';
import { initializeEventListeners } from './ui/events.js';
import { initializeModals } from './ui/modals.js';
import { connect as connectWebSocket } from './network/websocket.js';
import { showWelcomeOnboarding } from './ui/onboarding.js';

function initializeGlobalUI() {
    console.log("Initializing Global UI (Theme, Modals)...");
    initializeModals();
}

// MODIFIED: Function now accepts a parameter to know if the user was invited
function initializeAppCore(isInvitedUser = false) {
    console.log("Initializing App Core Logic...");

    // Attach all event listeners specific to the app.
    initializeEventListeners();

    // Initialize the user's state (including onboarding state).
    store.actions.initializeUser();

    // Render the initial user name on the ticket.
    renderUserName();

    // Connect to the signaling server.
    connectWebSocket();

    // MODIFIED: Only show the welcome guide if it's a new, non-invited user.
    if (!isInvitedUser) {
        // Use a small delay to allow the main layout to settle.
        setTimeout(showWelcomeOnboarding, 500);
    }
}


// --- Main Execution ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DropSilk Initializing...");

    initializeGlobalUI();

    const isAppPage = document.querySelector(".main-content");

    const urlParams = new URLSearchParams(window.location.search);
    const flightCodeFromUrl = urlParams.get('code');

    if (isAppPage) {
        const isInvited = flightCodeFromUrl && flightCodeFromUrl.length === 6;
        // If there's a valid code in the URL, show the boarding screen immediately.
        if (isInvited) {
            showBoardingOverlay(flightCodeFromUrl);
        }
        // MODIFIED: Pass the invited status to the core initializer
        initializeAppCore(isInvited);
    } else {
        console.log("On a non-app page (e.g., 404). Core logic will not be initialized.");
    }
});