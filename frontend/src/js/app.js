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

// Function now accepts a parameter to know if the user was invited
function initializeAppCore(isInvitedUser = false) {
    console.log("Initializing App Core Logic...");

    // Attach all event listeners specific to the app.
    initializeEventListeners();

    // Initialize the user's state (including onboarding state).
    store.actions.initializeUser();

    // Now that the user's state is loaded, we can safely check their consent/onboarding status.
    initializePrivacyConsent();

    // Render the initial user name on the ticket.
    renderUserName();

    // Connect to the signaling server.
    connectWebSocket();

    // Only show the welcome guide if it's a new, non-invited user.
    if (!isInvitedUser) {
        // Use a small delay to allow the main layout to settle.
        setTimeout(showWelcomeOnboarding, 500);
    }
}

// Privacy Consent Logic (no changes to the function itself)
function initializePrivacyConsent() {
    const consentToast = document.getElementById('privacy-consent-toast');
    const acceptBtn = document.getElementById('accept-privacy-btn');

    if (!consentToast || !acceptBtn) return;

    const showPrivacyToast = () => {
        // Make sure it's not already shown or accepted
        if (localStorage.getItem('dropsilk-privacy-consent')) return;

        setTimeout(() => {
            consentToast.style.display = 'block';
            consentToast.offsetHeight; // Force reflow
            consentToast.classList.add('show');
        }, 500); // A small delay after onboarding closes
    };

    const hasConsented = localStorage.getItem('dropsilk-privacy-consent');
    if (!hasConsented) {
        const hasSeenWelcome = store.getState().onboardingState.welcome;

        if (hasSeenWelcome) {
            // User has seen onboarding before, but not the new privacy toast. Show it now.
            showPrivacyToast();
        } else {
            // User is brand new. Wait for the welcome tutorial to be dismissed.
            document.addEventListener('onboardingWelcomeDismissed', showPrivacyToast, { once: true });
        }
    }


    acceptBtn.addEventListener('click', () => {
        localStorage.setItem('dropsilk-privacy-consent', 'true');
        consentToast.classList.remove('show');
        setTimeout(() => {
            consentToast.style.display = 'none';
        }, 500);
    });
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
        // Pass the invited status to the core initializer
        initializeAppCore(isInvited);
    } else {
        console.log("On a non-app page (e.g., 404). Core logic will not be initialized.");
    }
});