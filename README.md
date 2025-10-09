<div align="center">
  <img src="https://raw.githubusercontent.com/medy17/dropsilk/refs/heads/main/frontend/public/logo.webp" alt="DropSilk Logo" width="120" />
  <h1>DropSilk</h1>
  <p>
    <b>Unlimited. Secure. Swift.</b>
    <br />
    <i>Instantly share files and screen, device-to-device. No cloud. No limits.</i>
  </p>
  
  <p>
    <a href="https://dropsilk.xyz"><strong>Live Demo »</strong></a> <br />
    <a href="https://dropsilk.vercel.app"><strong>Backup Live Demo »</strong></a>
  </p>
  
  <div>
    <img src="https://img.shields.io/github/license/medy17/dropsilk?style=for-the-badge" alt="License"/>
    <img src="https://img.shields.io/github/last-commit/medy17/dropsilk?style=for-the-badge" alt="Last Commit"/>
  </div>
</div>

## Overview

DropSilk is a modern, privacy-focused, peer-to-peer file transfer application built with WebRTC. It allows users to create temporary, private "flights" to directly share files of any size and stream their screen between two devices without ever storing data on a central server.

This project was born from the desire for a simple, fast, and secure way to move files between devices without the limitations of cloud storage, file size caps, or privacy concerns.

### Key Features

-   **Direct P2P Transfers:** Files are sent directly between browsers using WebRTC for maximum speed and privacy.
-   **End-to-End Encrypted:** All transfers (files and screen sharing) are encrypted using DTLS and SRTP protocols.
-   **No File Size Limits:** Transfer large files without worrying about hitting a server-side limit.
-   **Screen Sharing:** Securely share your screen with the connected peer, with adjustable quality settings.
-   **In-Browser File Previews:** Preview a wide range of file types directly in the browser before downloading:
    -   Images (`jpg`, `png`, `gif`, `webp`, `svg`...)
    -   Audio (`mp3`, `wav`, `ogg`...) with a waveform visualizer.
    -   Documents (`pdf`, `docx`).
    -   Spreadsheets (`xlsx`, `csv`).
    -   Presentations (`pptx`).
    -   Code & Text with syntax highlighting.
-   **High-Performance Architecture:**
    -   **Web Worker:** File reading and chunking are offloaded to a background thread to keep the UI perfectly responsive.
    -   **OPFS "Safe Mode":** For very large files, DropSilk can write directly to the Origin Private File System, preventing browser memory crashes.
    -   **Adjustable Chunk Size:** Advanced users can tune transfer performance for their network conditions.
-   **Rich Transfer Management:**
    -   Multi-file and folder uploads.
    -   Drag-and-drop file selection.
    -   Real-time progress, speed, and ETA calculation.
    -   Drag-to-reorder sending queue.
    -   Download all received files as a single ZIP archive.
-   **Modern UI/UX:**
    -   Fully responsive design for desktop and mobile.
    -   Beautiful animated aurora background.
    -   Light & Dark themes.
    -   Comprehensive settings panel for user preferences.
    -   Guided onboarding for new users.
-   **Internationalization (i18n):** Full support for multiple languages.

### Screenshots & Demo

|                                                           Main Interface (Light)                                                           |                                                     Settings Modal                                                      |
| :----------------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------: |
| <img src="https://raw.githubusercontent.com/medy17/dropsilk/refs/heads/main/readme-assets/light-mode-home.png" alt="DropSilk Home Light"/> | <img src="https://raw.githubusercontent.com/medy17/dropsilk/refs/heads/main/readme-assets/settings.png" alt="License"/> |

|                                                        Dashboard (Dark)                                                         |                                                          File Preview                                                          |
| :-----------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------: |
| <img src="https://raw.githubusercontent.com/medy17/dropsilk/refs/heads/main/readme-assets/dashboard-dark.png" alt="Dashboard"/> | <img src="https://raw.githubusercontent.com/medy17/dropsilk/refs/heads/main/readme-assets/sample-preview.jpeg" alt="Preview"/> |

## Technical Deep Dive

### Tech Stack

| Category             | Technology                                                                                                                              |
| :------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**         | `HTML5`, `CSS3` (Custom Properties, Flexbox, Grid), `JavaScript` (ES Modules)                                                           |
| **Build Tool**       | `Vite`                                                                                                                                  |
| **Core Protocol**    | `WebRTC` (for DataChannels and MediaStreams)                                                                                            |
| **Signaling Server** | `Node.js`, `WebSocket` (deployed on Render)                                                                                             |
| **Key Libraries**    | `i18next`, `JSZip`, `SortableJS`, `QrScanner`, `pdf.js`, `mammoth.js`, `SheetJS (xlsx)`, `highlight.js`, `WaveSurfer.js`, `UploadThing` |
| **Hosting**          | `Vercel` (Frontend), `Render` (Backend)                                                                                                 |

### Architectural Decisions

DropSilk is built on a few key architectural principles to ensure performance, privacy, and a smooth user experience.

1.  **WebRTC for Peer-to-Peer Communication:** Instead of a traditional client-server upload/download model, DropSilk uses WebRTC. This creates a direct, encrypted connection between the two users' browsers. This means files never touch our server, dramatically enhancing privacy and speed, especially on a local network.
2.  **Decoupled Signaling:** A lightweight WebSocket server acts as a "rendezvous" point. Its only job is to help two peers find each other and exchange the metadata needed to establish the direct WebRTC connection. Once the connection is made, the signaling server is no longer involved in the transfer itself.
3.  **Non-Blocking File Processing with Web Workers:** Reading large files on the main browser thread can freeze the UI. DropSilk delegates all file reading and chunking to a dedicated Web Worker. The main thread simply sends the file object to the worker and receives ready-to-send chunks, ensuring the interface remains fluid and responsive at all times.
4.  **OPFS for Stability (Safe Mode):** Browsers have memory limits. Attempting to buffer a multi-gigabyte file in RAM can cause the tab to crash. The "Safe Mode" feature leverages the **Origin Private File System (OPFS)** to stream incoming file chunks directly to disk instead of memory, making the application robust enough to handle massive files.

### Project Structure

The project follows a modular structure to separate concerns, making it easier to maintain and scale.

```
dropsilk
└── frontend/
    ├── SVGs/              # Vector graphics
    ├── public/            # Static assets (favicons, sounds, images, workers, video)
    │   └── etc.
    └── src/
        ├── js/
        │   ├── network/   # WebRTC and WebSocket
        │   ├── preview/   # File preview handlers (audio, code, docx, image, md, pdf, pptx, xlsx)
        │   │   └── handlers/ # Specific preview logic
        │   ├── transfer/  # File and ZIP transfer logic
        │   ├── ui/        # UI elements (DOM, events, modals, onboarding, views)
        │   ├── utils/     # Helper functions (audio, toast, upload)
        │   ├── app.js     # Main application entry
        │   ├── config.js  # Application configuration
        │   └── state.js   # Global state
        └── styles/
            ├── base/      # Core styles (animations, globals, theme, variables)
            ├── components/ # Component-specific styles (audio, buttons, forms, previews, etc.)
            │   └── etc.
            ├── layout/    # Page layout styles
            ├── index.css    # Main CSS entry
            ├── responsive.css # Responsive design
            └── utilities.css # Utility styles
```

## Getting Started

To run DropSilk locally, you'll need both this frontend repository and the corresponding [signaling server backend](https://github.com/medy17/DropSilk_Backend).

### Prerequisites

-   Node.js (^22)
-   npm / pnpm / yarn

### Installation & Setup

1.  **Clone the Frontend (this repository):**
    ```bash
    git clone https://github.com/medy17/dropsilk.git
    cd dropsilk
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    The PPTX preview feature uses UploadThing, which requires API endpoints hosted on a server. Create a `.env.local` file in the root of the project and add the URL of your backend.
    ```
    # .env.local
    VITE_API_BASE_URL=http://localhost:8080
    ```

4.  **Clone and run the Backend Signaling Server:**
    *(Follow the instructions in the backend repository's README)*. By default, it runs on `localhost:8080`. The frontend is already configured to connect to this address in development mode.

### Running the Application

Once the backend is running, start the frontend development server:

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:5173` (or the address provided by Vite). You should now have a fully functional local version of DropSilk!

## License

This project is licensed under the **GPLv3**. See the `LICENSE` file for more information.

## Contact & Acknowledgements

Thanks to Jihah in particular for her contribution in adding coherent ms-MY support.

Ahmed - [GitHub](https://github.com/medy17)
