// js/app.js
// This is the main entry point for the application.

import { store } from './state.js';
import { renderUserName } from './ui/view.js';
import { initializeEventListeners } from './ui/events.js';
import { initializeModals } from './ui/modals.js';
import { connect as connectWebSocket } from './network/websocket.js';

function main() {
    console.log("DropSilk Initializing...");

    // Initialize all UI components (modals, theme, etc.)
    // This is run for both index.html and 404.html
    initializeModals();

    // The rest of the app logic is only for the main application page
    const isAppPage = document.querySelector(".main-content");
    if (!isAppPage) return;

    // Attach all event listeners to the DOM.
    initializeEventListeners();

    // Initialize the user's state.
    store.actions.initializeUser();

    // Render initial user name
    renderUserName();

    // Connect to the signaling server.
    connectWebSocket();
}

// Run the main application logic
document.addEventListener('DOMContentLoaded', main);