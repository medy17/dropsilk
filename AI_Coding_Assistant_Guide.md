# AI Agent Guide for DropSilk

This document provides comprehensive guidance for AI agents working with the DropSilk codebase. It serves as a knowledge base to help AI understand the project's structure, technology, conventions, and key architectural patterns.

## Project Overview

DropSilk is a peer-to-peer (P2P) file transfer application that allows users to share files directly between devices without cloud storage. It uses WebRTC for secure, end-to-end encrypted transfers and a WebSocket server for signaling. The project is built with vanilla HTML, CSS, and JavaScript for both the frontend and backend, prioritizing performance and minimizing dependencies.

A unique feature is the integrated "honeypot" on the backend, designed to trap bots attempting to find WordPress vulnerabilities.

## Project Structure for AI Navigation

The repository is organized into two main parts: a frontend application and a backend server.

```
Dropsilk/
├── Backend/
│   ├── server.js           # The core Node.js WebSocket & HTTP server
│   ├── wp-login.html       # The fake WordPress login page for the honeypot
│   └── package.json        # Backend dependencies (ws, geoip-lite)
└── Frontend/
    ├── index.html          # Main application HTML file
    ├── 404.html            # Custom 'Not Found' page
    ├── script.js           # Core frontend application logic (WebRTC, UI, etc.)
    ├── styles.css          # All application styles
    ├── video.js            # Self-contained video player component
    ├── sender.worker.js    # Web Worker for file chunking
    ├── vercel.json         # Deployment configuration for Vercel
    └── (assets)            # Images, favicons, etc.
```

### Key Files AI Should Understand

*   **`Frontend/index.html`**: The single HTML file defining the entire UI structure, including the initial setup screen, the main dashboard, and all modals.
*   **`Frontend/404.html`**: A static page that Vercel automatically serves for any route not found. It reuses the main header, footer, styles, and scripts to maintain brand consistency.
*   **`Frontend/script.js`**: The most critical frontend file. It manages application state, WebSocket communication, WebRTC peer connections, UI updates, and event handling.
*   **`Frontend/styles.css`**: Defines all styling for the application. It uses CSS variables for theming (light/dark modes).
*   **`Backend/server.js`**: The complete backend. It's a Node.js server that handles WebSocket signaling for WebRTC, user registration, "flight" management, and the honeypot logic.

## Technology Stack

### Core Technologies

*   **Frontend**:
    *   **Language**: Vanilla JavaScript (ES6+)
    *   **Markup**: HTML5
    *   **Styling**: CSS3 with CSS Variables for Theming
    *   **Core APIs**: WebRTC (for P2P), WebSockets (for signaling), Web Workers (for file processing)
*   **Backend**:
    *   **Runtime**: Node.js
    *   **Server**: Built-in `http` and `ws` (WebSocket) modules (no frameworks like Express)
    *   **Dependencies**: `ws`, `geoip-lite`, `he`
*   **Deployment**:
    *   **Frontend**: Vercel
    *   **Backend**: Render (`dropsilk-server.onrender.com`)

## Coding Conventions for AI Agents

### JavaScript (Vanilla JS)

*   **No Frameworks**: This is not a React, Vue, or Angular project. All DOM manipulation must be done directly using standard browser APIs (e.g., `document.getElementById`, `document.createElement`, `element.addEventListener`).
*   **State Management**: Global variables are used for state management (e.g., `ws`, `peerConnection`, `currentFlightCode`). Be careful to manage this state correctly in functions.
*   **Modularity**: Logic is grouped into functions. Self-contained components like the video player (`video.js`) are encapsulated in Immediately Invoked Function Expressions (IIFE) to create a public interface.
*   **Functions**: Use standard function declarations (`function myFunction() {}`).
*   **Asynchronicity**: Use Promises and `async/await` for handling WebRTC signaling and other asynchronous operations.

### HTML Structure

*   **Single Page App (SPA)**: The main app logic is in a single `index.html`. UI views are toggled by changing the `display` style of container elements.
*   **Static Pages**: For content like the 404 page, create a separate HTML file (e.g., `404.html`). These pages should reuse the same `<head>`, `<header>`, and `<footer>` from `index.html` to ensure visual and functional consistency (like theme switching).
*   **Modals**: All modals exist in the DOM from the start and are hidden. They are shown by adding a `.show` class to the `.modal-overlay`.
*   **Data Attributes**: Use `data-*` attributes for state, especially for theming (`data-theme`) and identifying elements in the JS (`data-invitee-id`).

### CSS & Styling

*   **CSS Variables**: All theming is controlled by CSS variables defined in `:root` and overridden in `body[data-theme="dark"]`. To change a color, modify the variable, not individual rules.
*   **Naming Convention**: A BEM-like convention is used (e.g., `.flight-ticket`, `.flight-ticket__code`, `.not-found-container`).
*   **Layout**: Modern CSS like Flexbox and Grid is used for layout.
*   **Responsiveness**: The design is mobile-first, with `@media` queries for larger screens.

## Core Application Logic

### The "Flight" Concept

A "Flight" is the central metaphor for a private, temporary P2P file transfer session between two or more users. A user can either "Create a Flight" (becoming the offerer) or "Join a Flight" with a 6-character code (becoming the answerer).

### Connection & Transfer Flow

*(This section remains unchanged)*

## The Honeypot Feature

The backend includes a security honeypot to trap and log automated bots.

*   **Mechanism**: The `vercel.json` on the frontend rewrites any requests to common hacking paths like `/wp-admin` to the backend server.
*   **Action**: `server.js` serves a fake `wp-login.html` page for these paths.
*   **Logging**: When a bot submits the login form, `server.js` logs the attempt (IP, username, password, geo-location) and adds the bot to the "Hall of Shame".
*   **Leaderboard**: The `/honeypot-leaderboard` endpoint generates a live HTML page displaying all the bots that have been caught.

## Deployment

*   **Frontend**: Deployed on Vercel.
    *   **Custom 404 Page**: Vercel automatically detects and serves the `Frontend/404.html` file for any requests that do not match an existing file.
*   **Backend**: Deployed on Render.

## How to Fulfill Common AI Requests

#### **Task: "Add a new modal for 'About the Tech'."**

1.  **HTML (`index.html`)**: Copy the structure of an existing modal (e.g., `#aboutModal`). Create a new `<div class="modal-overlay" id="techModal">` with a unique ID. Populate its `.modal-header` and `.modal-body`.
2.  **HTML (`index.html` or `footer-nav`)**: Add a trigger button, e.g., `<button id="techBtn">Tech</button>`.
3.  **JavaScript (`script.js`)**: In the `setupAllModalsAndNav` function, add the new modal to the `modals` object:
    ```javascript
    tech: { overlay: document.getElementById('techModal'), trigger: document.getElementById('techBtn'), close: document.getElementById('closeTechModal') }
    ```

#### **Task: "Create a new static page, for example a 'Changelog' page."**

1.  **HTML (`Frontend/changelog.html`)**: Create a new HTML file.
2.  **Boilerplate**: Copy the entire contents of `Frontend/404.html` into `changelog.html` as a starting point. This provides the correct `<head>`, header, footer, and script tags.
3.  **Content**: Replace the content inside the `.not-found-container` with a new container (e.g., `.changelog-container`) and add your new static content.
4.  **Styling (`styles.css`)**: Add new CSS rules for your `.changelog-container` and its elements at the end of the file. Use the existing CSS variables to ensure theme compatibility.

#### **Task: "Change the primary color of the application."**

1.  **CSS (`styles.css`)**: Go to the `:root` selector at the top of the file.
2.  Modify the value of the `--brilliant-blue` variable and/or the `--c-primary` variable. All components that use this variable will update automatically.