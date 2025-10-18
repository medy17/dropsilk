<div align="center">
  <img src="https://raw.githubusercontent.com/medy17/dropsilk/refs/heads/main/frontend/public/logo.webp" alt="DropSilk Logo" width="120" />
  <h1>DropSilk</h1>
  <p>
    <b>Unlimited. Secure. Swift.</b>
    <br />
    <i>Instantly share files and screen, device-to-device. No cloud. No limits.</i>
  </p>
  
  <p>
    <a href="https://dropsilk.xyz"><strong>Production Deployment »</strong></a> <br />
    <a href="https://dropsilk.vercel.app"><strong>Mirror »</strong></a> <br />
    <a href="https://github.com/medy17/DropSilk_Backend"><strong>Backend Code »</strong></a>
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
-   **Desktop App Support:** DropSilk is available as a desktop app for Windows at the moment.
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
    -   **Zero-Cost Idle UI:** Animations are programmatically paused when hidden or disabled, ensuring the UI consumes no CPU at idle for a smooth experience.
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
5.  **Performance-First UI Rendering:** The application is engineered to feel fast, not just transfer files fast. Hidden UI elements with infinite animations (like loading spinners) are paused to prevent background CPU usage. All browser resources are hence dedicated to the user's current interaction for a smooth, lag-free experience.

### Project Structure

This project uses a modular structure for extensibility and maintainability.
The following is a list of most of the important files and folders.
(I wish I could have made this prettier, but CSS support is limited in GFM. Thanks, GitHub.)

<details open>
  <summary><strong>dropsilk</strong></summary>
  <ul>
    <li>
      <details open>
        <summary>frontend/</summary>
        <ul>
          <li>index.html</li>
          <li>package.json</li>
          <li>vercel.json</li>
          <li>
            <details>
              <summary>scripts/</summary>
              <ul>
                <li>update-locales.js</li>
              </ul>
            </details>
          </li>
          <li>
            <details>
              <summary>SVGs/</summary>
              <ul>
                <li>archive.svg</li>
                <li>audio.svg</li>
                <li>code.svg</li>
                <li>document.svg</li>
                <li>generic.svg</li>
                <li>image.svg</li>
                <li>video.svg</li>
              </ul>
            </details>
          </li>
          <li>
            <details>
              <summary>electron/</summary>
              <ul>
                <li>main.js</li>
                <li>preload.js</li>
              </ul>
            </details>
          </li>
          <li>
            <details>
              <summary>public/</summary>
              <ul>
                <li>404.html</li>
                <li>logo.webp</li>
                <li>robots.txt</li>
                <li>sender.worker.js</li>
                <li>site.webmanifest</li>
                <li>sitemap.xml</li>
                <li>social-share-image.jpg</li>
                <li>social-share-image-square.jpg</li>
                <li>SSIV2.png</li>
                <li>video.js</li>
                <li>favicons/</li>
                <li>
                  <details>
                    <summary>sounds/</summary>
                    <ul>
                      <li>connect.mp3</li>
                      <li>disconnect.mp3</li>
                      <li>error.mp3</li>
                      <li>invite.mp3</li>
                      <li>queue_start.mp3</li>
                      <li>receive_complete.mp3</li>
                      <li>send_complete.mp3</li>
                    </ul>
                  </details>
                </li>
              </ul>
            </details>
          </li>
          <li>
            <details>
              <summary>src/</summary>
              <ul>
                <li>
                  <details>
                    <summary>js/</summary>
                    <ul>
                      <li>
                        <details>
                          <summary>network/</summary>
                          <ul>
                            <li>webrtc.js</li>
                            <li>websocket.js</li>
                          </ul>
                        </details>
                      </li>
                      <li>
                        <details>
                          <summary>preview/</summary>
                          <ul>
                            <li>handlers/</li>
                            <li>previewConfig.js</li>
                            <li>previewManager.js</li>
                          </ul>
                        </details>
                      </li>
                      <li>
                        <details>
                          <summary>transfer/</summary>
                          <ul>
                            <li>fileHandler.js</li>
                            <li>zipHandler.js</li>
                          </ul>
                        </details>
                      </li>
                      <li>
                        <details>
                          <summary>ui/</summary>
                          <ul>
                            <li>dom.js</li>
                            <li>effects.js</li>
                            <li>events.js</li>
                            <li>modals.js</li>
                            <li>onboarding.js</li>
                            <li>view.js</li>
                          </ul>
                        </details>
                      </li>
                      <li>
                        <details>
                          <summary>utils/</summary>
                          <ul>
                            <li>audioManager.js</li>
                            <li>helpers.js</li>
                            <li>toast.js</li>
                            <li>uploadHelper.js</li>
                          </ul>
                        </details>
                      </li>
                      <li>app.js</li>
                      <li>config.js</li>
                      <li>i18n.js</li>
                      <li>state.js</li>
                    </ul>
                  </details>
                </li>
                <li>
                  <details>
                    <summary>styles/</summary>
                    <ul>
                      <li>index.css</li>
                      <li>responsive.css</li>
                      <li>utilities.css</li>
                      <li>
                        <details>
                          <summary>base/</summary>
                          <ul>
                            <li>animations.css</li>
                            <li>globals.css</li>
                            <li>theme.css</li>
                            <li>variables.css</li>
                          </ul>
                        </details>
                      </li>
                      <li>
                        <details>
                          <summary>components/</summary>
                          <ul>
                            <li>audio.css</li>
                            <li>boarding.css</li>
                            <li>buttons.css</li>
                            <li>connections.css</li>
                            <li>dashboard.css</li>
                            <li>docx.css</li>
                            <li>drawer.css</li>
                            <li>dropzone.css</li>
                            <li>footer.css</li>
                            <li>forms.css</li>
                            <li>header.css</li>
                            <li>metrics.css</li>
                            <li>modals.css</li>
                            <li>not-found.css</li>
                            <li>onboarding.css</li>
                            <li>pdf.css</li>
                            <li>pptx.css</li>
                            <li>preview.css</li>
                            <li>privacy-toast.css</li>
                            <li>qr-scanner.css</li>
                            <li>queues.css</li>
                            <li>settings.css</li>
                            <li>share.css</li>
                            <li>stream.css</li>
                            <li>ticket.css</li>
                            <li>toast.css</li>
                            <li>video-player.css</li>
                            <li>xlsx.css</li>
                            <li>zip.css</li>
                          </ul>
                        </details>
                      </li>
                      <li>
                        <details>
                          <summary>layout/</summary>
                          <ul>
                            <li>aurora.css</li>
                            <li>layout.css</li>
                          </ul>
                        </details>
                      </li>
                    </ul>
                  </details>
                </li>
              </ul>
            </details>
          </li>
        </ul>
      </details>
    </li>
    <li>readme-assets</li>
    <li>ARCHITECTURE.md</li>
    <li>LICENSE.md</li>
    <li>README.md</li>
  </ul>
</details>

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
