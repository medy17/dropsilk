
<div align="center">
  <img src="https://raw.githubusercontent.com/medy17/dropsilk/refs/heads/main/frontend/public/logo.webp" alt="DropSilk Logo" width="120" />
  <h1>DropSilk</h1>
  <p>
    <b>Unlimited. Secure. Swift.</b>
    <br />
    <i>Instantly share files and screen, device-to-device. No cloud. No limits.</i>
  </p>
  
  <p>
    <a href="https://dropsilk.xyz"><strong>Live Demo »</strong></a>
  </p>
  
  <div>
    <!-- Placeholder Badges - Replace with your actual links -->
    <img src="https://img.shields.io/github/v/release/medy17/dropsilk?style=for-the-badge" alt="Release Version"/>
    <img src="https://img.shields.io/github/license/medy17/dropsilk?style=for-the-badge" alt="License"/>
    <img src="https://img.shields.io/github/stars/medy17/dropsilk?style=for-the-badge&logo=github" alt="GitHub Stars"/>
    <img src="https://img.shields.io/github/last-commit/medy17/dropsilk?style=for-the-badge" alt="Last Commit"/>
  </div>
</div>

---

## Overview

DropSilk is a modern, privacy-focused, peer-to-peer file transfer application built with WebRTC. It allows users to create temporary, private "flights" to directly share files of any size and stream their screen between two devices without ever storing data on a central server.

This project was born from the desire for a simple, fast, and secure way to move files between devices without the limitations of cloud storage, file size caps, or privacy concerns.

### ✨ Key Features

-   **🚀 Direct P2P Transfers:** Files are sent directly between browsers using WebRTC for maximum speed and privacy.
-   **🔐 End-to-End Encrypted:** All transfers (files and screen sharing) are encrypted using DTLS and SRTP protocols.
-   **♾️ No File Size Limits:** Transfer large files without worrying about hitting a server-side limit.
-   **🖥️ Screen Sharing:** Securely share your screen with the connected peer, with adjustable quality settings.
-   **🔍 In-Browser File Previews:** Preview a wide range of file types directly in the browser before downloading:
    -   Images (`jpg`, `png`, `gif`, `webp`, `svg`...)
    -   Audio (`mp3`, `wav`, `ogg`...) with a waveform visualizer.
    -   Documents (`pdf`, `docx`).
    -   Spreadsheets (`xlsx`, `csv`).
    -   Presentations (`pptx`).
    -   Code & Text with syntax highlighting.
-   **⚡ High-Performance Architecture:**
    -   **Web Worker:** File reading and chunking are offloaded to a background thread to keep the UI perfectly responsive.
    -   **OPFS "Safe Mode":** For very large files, DropSilk can write directly to the Origin Private File System, preventing browser memory crashes.
    -   **Adjustable Chunk Size:** Advanced users can tune transfer performance for their network conditions.
-   **🗂️ Rich Transfer Management:**
    -   Multi-file and folder uploads.
    -   Drag-and-drop file selection.
    -   Real-time progress, speed, and ETA calculation.
    -   Drag-to-reorder sending queue.
    -   Download all received files as a single ZIP archive.
-   **🌐 Modern UI/UX:**
    -   Fully responsive design for desktop and mobile.
    -   Beautiful animated aurora background.
    -   Light & Dark themes.
    -   Comprehensive settings panel for user preferences.
    -   Guided onboarding for new users.
-   **🌍 Internationalization (i18n):** Full support for multiple languages.

### 🖼️ Screenshots & Demo

**(PLACEHOLDER: Insert a high-quality GIF showcasing the workflow: creating a flight, inviting a peer, and transferring a file.)**

| Main Interface (Light) | Dashboard (Dark) |
| :--------------------: | :--------------: |
| **(PLACEHOLDER: Insert screenshot of the main page)** | **(PLACEHOLDER: Insert screenshot of the dashboard in dark mode)** |

| Settings Modal | File Preview |
| :--------------------: | :--------------: |
| **(PLACEHOLDER: Insert screenshot of the settings modal)** | **(PLACEHOLDER: Insert screenshot of a file preview, e.g., a PDF or code file)** |

## 🛠️ Technical Deep Dive

### Tech Stack

| Category | Technology |
| :--- | :--- |
| **Frontend** | `HTML5`, `CSS3` (Custom Properties, Flexbox, Grid), `JavaScript` (ES Modules) |
| **Build Tool** | `Vite` |
| **Core Protocol** | `WebRTC` (for DataChannels and MediaStreams) |
| **Signaling Server** | `Node.js`, `WebSocket` (deployed on Render) |
| **Key Libraries** | `i18next`, `JSZip`, `SortableJS`, `QrScanner`, `pdf.js`, `mammoth.js`, `SheetJS (xlsx)`, `highlight.js`, `WaveSurfer.js`, `UploadThing` |
| **Hosting** | `Vercel` (Frontend), `Render` (Backend) |

### Architectural Decisions

DropSilk is built on a few key architectural principles to ensure performance, privacy, and a smooth user experience.

1.  **WebRTC for Peer-to-Peer Communication:** Instead of a traditional client-server upload/download model, DropSilk uses WebRTC. This creates a direct, encrypted connection between the two users' browsers. This means files never touch our server, dramatically enhancing privacy and speed, especially on a local network.
2.  **Decoupled Signaling:** A lightweight WebSocket server acts as a "rendezvous" point. Its only job is to help two peers find each other and exchange the metadata needed to establish the direct WebRTC connection. Once the connection is made, the signaling server is no longer involved in the transfer itself.
3.  **Non-Blocking File Processing with Web Workers:** Reading large files on the main browser thread can freeze the UI. DropSilk delegates all file reading and chunking to a dedicated Web Worker. The main thread simply sends the file object to the worker and receives ready-to-send chunks, ensuring the interface remains fluid and responsive at all times.
4.  **OPFS for Stability (Safe Mode):** Browsers have memory limits. Attempting to buffer a multi-gigabyte file in RAM can cause the tab to crash. The "Safe Mode" feature leverages the **Origin Private File System (OPFS)** to stream incoming file chunks directly to disk instead of memory, making the application robust enough to handle massive files.

### 📂 Project Structure

The project follows a modular structure to separate concerns, making it easier to maintain and scale.

```
/src
├── js
│   ├── network/      # WebSocket and WebRTC logic
│   ├── preview/      # File preview handlers and configuration
│   ├── state/        # Global state management
│   ├── transfer/     # File chunking, queueing, and transfer logic
│   ├── ui/           # DOM manipulation, events, modals, onboarding
│   ├── utils/        # Helpers, audio manager, toast notifications
│   ├── app.js        # Main application entry point
│   └── i18n.js       # Internationalization setup
├── locales/          # Language JSON files
├── styles/
│   ├── base/
│   ├── components/
│   ├── layout/
│   └── index.css     # Main CSS entry point
└── index.html        # Main HTML file
```

## 🚀 Getting Started

To run DropSilk locally, you'll need both this frontend repository and the corresponding [signaling server backend](PLACEHOLDER_FOR_BACKEND_REPO_LINK).

### Prerequisites

-   Node.js (v18.x or later recommended)
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

## 🗺️ Roadmap

**(PLACEHOLDER: Outline your future plans for the project. This shows vision and encourages contribution.)**

-   [ ] **Resumable Transfers:** Implement functionality to resume interrupted file transfers.
-   [ ] **Multi-Peer Flights:** Allow more than two users to join a single flight for group sharing.
-   [ ] **Text Chat:** Add a simple, ephemeral text chat within a flight session.
-   [ ] **Web App Manifest Enhancements:** Improve PWA capabilities for better "install to homescreen" support.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Please read through the **(PLACEHOLDER: Link to a `CONTRIBUTING.md` file)** for details on our code of conduct and the process for submitting pull requests.

## 📜 License

This project is licensed under the **(PLACEHOLDER: e.g., MIT License)**. See the `LICENSE` file for more information.

## 💌 Contact & Acknowledgements

**(PLACEHOLDER: Add your name, contact info (e.g., Twitter/LinkedIn link), and thank anyone who helped or inspired the project.)**

Ahmed - [GitHub](https://github.com/medy17)

Project inspired by the need for a better, more private file-sharing tool.
