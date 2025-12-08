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
</div>


This document explains how DropSilk (frontend) is structured and how things
fit together. It’s intended for contributors and maintainers: where files live,
how modules talk to each other, how we keep code consistent, and how to add new
features without surprising the rest of the system.

If you’re looking for how to run the app, see the main README. This doc focuses
on the architecture of the project itself.

## Table of contents

1. High‑level overview
2. Runtime flow
3. Directory layout and file placement
4. Module boundaries and conventions
5. State management
6. Networking (WebSocket + WebRTC)
7. File transfers (worker + OPFS + flow control)
8. Preview subsystem
9. Screen sharing
10. UI architecture (DOM, events, view, modals, onboarding)
11. Styling and theming
12. Internationalisation (i18n)
13. Privacy, consent, and third‑party scripts
14. Build system and environments
15. Testing and manual QA
16. Performance guidelines
17. Accessibility notes
18. Security notes
19. Common workflows (recipes)
20. Adding or changing translations
21. Known limitations and cross‑browser notes


## 1) High‑level overview

DropSilk’s frontend is a single‑page, vanilla‑JS app built with Vite. There is
no front‑end framework. The app is structured around a small set of
responsibilities:

- UI: DOM queries, event listeners, small, focused view updates.
- Networking: a WebSocket signalling client and a WebRTC client.
- Transfer: chunking, queueing, throttling, OPFS safe mode, zipping.
- Preview: modular, lazy‑loaded handlers for different file types.
- State: a tiny in‑memory store with imperative actions (no reactivity lib).
- i18n: i18next with a language auto‑detector and a small tool to sync locales.
- Styling: CSS modules split into base/layout/components/utilities + themes.
- Desktop Shell (Electron): Provides native integrations like file/folder dialogs through a secure IPC bridge.

Data path in practice:

- UI actions (user input) trigger store actions and networking.
- The WebSocket server only handles signalling + aux messages (no file data).
- Files flow via WebRTC data channels, chunked in a Web Worker.
- Received files land in memory or OPFS (safe mode), then the UI updates.
- Previews are lazy‑loaded, sandboxed, and sanitised as needed.


## 2) Runtime flow

Boot sequence (simplified):

1. Inline script in `<head>` applies animation quality from `localStorage` to prevent flashes.
2. `DOMContentLoaded` in `js/app.js`.
3. Initialise UI shell (modals, theming, drawer, privacy toast scaffolding).
4. Bind DOM event listeners and set up drag‑and‑drop.
5. Initialise user store (random name, onboarding state).
6. Show onboarding pulses/coachmarks as appropriate.
7. If a “code” parameter is present in the URL, show the boarding overlay.
8. Connect to the WebSocket signalling server.
9. Translate static `[data-i18n]` strings; re‑translate on language change.
10. On consent, activate analytics and speed insights (deferred scripts).

Once connected:

- WebSocket “registered” message sets our ID; users list updates the “network”
  panel.
- Creating or joining a flight flips the UI into dashboard mode.
- A “peer‑joined” message triggers the WebRTC offerer to start (or the
  answerer to wait for a data channel).
- The data channel enables transfers and screen sharing controls.


## 3) Directory layout and file placement

Everything relevant to the client app lives under `src/`:

```
src/
├─ js/
│  ├─ app.js                  # Entry (wires everything together)
│  ├─ config.js               # Runtime config (WS URL, ICE, constants)
│  ├─ state.js                # Tiny global store (imperative actions)
│  ├─ i18n.js                 # i18next + detector setup
│  │
│  ├─ features/               # Domain-specific feature modules
│  │  ├─ chat/                # Chat logic, UI, and event handling
│  │  ├─ contact/             # Contact modal logic
│  │  ├─ invite/              # QR generation, sharing logic
│  │  ├─ settings/            # Settings persistence and UI generation
│  │  ├─ theme/               # Dark mode logic
│  │  └─ zip/                 # Zip modal logic (selection state)
│  │
│  ├─ network/
│  │  ├─ websocket.js         # Signalling client (Render in prod)
│  │  └─ webrtc.js            # Peer connection, data channel, screen share
│  │
│  ├─ transfer/
│  │  ├─ fileHandler.js       # Facade: orchestrates sender, receiver, queue
│  │  ├─ fileSender.js        # Worker management, upload throttling
│  │  ├─ fileReceiver.js      # Incoming stream, memory/OPFS storage
│  │  ├─ queueManager.js      # Drag-and-drop, file selection, queue state
│  │  ├─ transferUI.js        # HTML generation for transfer items
│  │  ├─ opfsHandler.js       # Origin Private File System operations
│  │  ├─ etrCalculator.js     # Shared speed/time-remaining logic
│  │  └─ zipHandler.js        # JSZip integration for “download all”
│  │
│  ├─ preview/
│  │  ├─ previewConfig.js     # Registry: ext → handler + metadata
│  │  ├─ previewManager.js    # Lazy‑load handlers, consent gates (PPTX)
│  │  └─ handlers/
│  │     ├─ imagePreview.js
│  │     ├─ audioPreview.js
│  │     ├─ codePreview.js
│  │     ├─ mdPreview.js
│  │     ├─ pdfPreview.js
│  │     ├─ docxPreview.js
│  │     ├─ pptxPreview.js    # Requires UploadThing + consent
│  │     └─ xlsxPreview.js
│  │
│  ├─ ui/
│  │  ├─ dom.js               # Centralised DOM element queries
│  │  ├─ events.js            # All event listeners + drag‑and‑drop
│  │  ├─ view.js              # Small “render” helpers (no framework)
│  │  ├─ modals.js            # Orchestrator for modals (delegates to features/)
│  │  ├─ onboarding.js        # Welcome/invite overlays & positioning
│  │  └─ effects.js           # Animation quality controller (persists + applies)
│  │
│  ├─ utils/
│  │  ├─ helpers.js           # Pure utilities (formatBytes, file icon, etc.)
│  │  ├─ toast.js             # Notification system
│  │  ├─ audioManager.js      # Shared sounds + haptics (user‑toggled)
│  │  └─ uploadHelper.js      # UploadThing client bootstrap
│  │
│  └─ workers/
│     └─ sender.worker.js     # (Placed at root as sender.worker.js for Vite)
│
├─ styles/
│  ├─ base/                   # Variables, animations, theme
│  ├─ layout/                 # Aurora background, grids, layout shells
│  ├─ components/             # Buttons, forms, modals, queues, etc.
│  ├─ utilities.css
│  ├─ index.css               # Aggregator @imports by category
│  └─ responsive.css
│
├─ locales/                   # JSON translations
│  ├─ en.json … zh.json
│
└─ scripts/
└─ update-locales.js       # Keeps i18n imports/resources/options in sync
```

Static assets (favicons, sounds, workers, images) live in `public/` and are
served as‑is by Vite.

Where should new things go?

- New feature slice: `js/features/newFeature/`.
- New network logic: `js/network/`.
- New transfer logic: `js/transfer/` (if core logic) or `js/features/` (if UI heavy).
- New preview type: `js/preview/handlers/` plus `previewConfig.js` entry.
- New UI behaviour: bind in `js/ui/events.js`, render helpers in `js/ui/view.js`.
- Small pure helpers: `js/utils/`.
- New CSS: follow the existing split (base/layout/components/utilities).


## 4) Module boundaries and conventions

- ES Modules everywhere; avoid globals. The only intentional global is
  `window.videoPlayer` for the self‑contained player in `public/video.js`.
- **Feature Modules**: Logic that owns a specific UI domain (Chat, Settings, Invite)
  lives in `js/features/`. These modules should export setup/teardown functions
  used by the main `ui/` orchestrators.
- Separate DOM concerns from logic:
    - `ui/dom.js` owns querying and exposes a stable `uiElements` map.
    - `ui/events.js` attaches listeners and calls actions/helpers.
    - `ui/view.js` mutates the DOM to reflect state changes.
- Avoid the network layer calling DOM directly. It calls small view utilities
  (e.g., `updateShareButton`) and store actions, not arbitrary DOM selectors.
- Lazy‑load heavy dependencies (PDF.js worker, preview handlers, UploadThing
  client, analytics scripts).
- Keep handlers side‑effect free (receive a `Blob` and a mount element; render
  there; return nothing). Optional `cleanup()` if needed.
- Filenames: kebab‑case for files, camelCase for functions, PascalCase for
  classes (rarely used here). Use named exports for utilities; default export
  for a single “main” function per module (e.g., preview handlers).
- CSS: prefer component‑scoped selectors; use CSS variables for colour and
  theme; avoid deep descendant selectors.


## 5) State management

`js/state.js` exposes a tiny store:

- `getState()` returns a shallow copy of the state.
- `actions` is the only way to mutate state.
- No subscriptions; modules update the UI after actions where needed.
- Metrics speed is computed on an interval from `webrtc.js`.

State slices include:

- Peer/session: `myId`, `myName`, `currentFlightCode`, `isFlightCreator`,
  `peerInfo`, `connectionType`, `lastNetworkUsers`.
- Transfer: `fileToSendQueue`, `currentlySendingFile`, `fileIdMap`,
  `receivedFiles`.
- Metrics: totals + per‑interval counters + a setInterval handle.
- UI: onboarding flags, whether invitation toast is visible, scroll flags.

Guidelines:

- Keep state minimal; prefer deriving, not storing the same data twice.
- Use `store.actions` to mutate; then call view helpers to reflect in the UI.


## 6) Networking (WebSocket + WebRTC)

WebSocket client (`js/network/websocket.js`):

- Establishes a signalling socket to the backend.
- On connection, registers user details and checks URL for `?code=XXXXXX` to
  auto‑join a flight.
- Handles messages:
    - `registered`, `users-on-network-update`, `flight-invitation`,
      `flight-created`, `peer-joined`, `signal`, `peer-left`, `error`.
- Delegates to:
    - Store actions (e.g., `setPeerInfo`, `setConnectionType`).
    - `webrtc.handleSignal` for SDP/ICE.
    - View helpers (boarding overlay, dashboard status, in‑flight panel).
    - Toasts + audio cues.

WebRTC client (`js/network/webrtc.js`):

- Builds `RTCPeerConnection` with a full ICE configuration. The backend provides
  STUN and TURN server credentials, allowing for robust NAT traversal even
  behind restrictive firewalls. In development or local network environments,
  it can fall back to operating without external ICE servers.
- Creates a reliable `RTCDataChannel` named `fileTransfer`.
    - `bufferedAmountLowThreshold` set to `HIGH_WATER_MARK / 2`.
    - `onbufferedamountlow` calls `drainQueue()` to keep the pipe full.
- Bootstraps offer/answer flow and relays SDP/ICE via WebSocket.
- Screen share:
    - `getDisplayMedia` with UA‑tailored audio constraints.
    - Adds tracks, renegotiates, and wires UI controls for quality presets.
- Emits small UI changes (enable drop zone, share button text) via view helpers.


## 7) File transfers (worker + OPFS + flow control)

The transfer logic is modularized under `js/transfer/`, with `fileHandler.js` acting as a facade to coordinate the specific modules.

Sender (`js/transfer/fileSender.js`):

- `startFileSend()`:
    - Spawns `sender.worker.js` to read the file in chunks (default 256 KB, user
      tunable).
    - Sends JSON metadata, then ArrayBuffers, then `"EOF"`.
    - Throttles on `getBufferedAmount()` against `HIGH_WATER_MARK`.
    - Updates UI using `transferUI.js` and calculates ETA via `etrCalculator.js`.
- Worker (`sender.worker.js`):
    - Reads slices with `FileReader`, transfers underlying buffers to main thread
      (zero‑copy), and posts `chunk` messages.
    - Self‑terminates on `done`.

Receiver (`js/transfer/fileReceiver.js`):

- `handleDataChannelMessage()`:
    - If metadata JSON: initialises receive state; delegates to `opfsHandler.js` if
      "safe mode" is active (large file + supported browser).
    - If ArrayBuffer:
        - Writes via `opfsHandler` (if safe mode) or pushes to memory array.
        - Tracks speed/ETA via `etrCalculator.js`.
    - On `"EOF"`:
        - Finalises writer (OPFS) or creates a `Blob` from parts.
        - Adds file to `store.receivedFiles`.
        - Updates UI actions (preview/save/complete).
        - Optional auto‑download if enabled and below a size threshold.

OPFS Safe Mode (`js/transfer/opfsHandler.js`):

- Encapsulates all Origin Private File System operations.
- `initOpfsForFile`: Get directory handle, remove stale files, create writer.
- `writeOpfsChunk`: Writes stream directly to disk.
- `finalizeOpfsFile`: Closes writer, returns File handle as Blob.

UI & Queue (`js/transfer/transferUI.js`, `js/transfer/queueManager.js`):

- `transferUI.js` contains all HTML generation templates for queue items to keep logic files clean.
- `queueManager.js` handles file selection, folder limits, and drag-and-drop reordering.


## 8) Preview subsystem

Design:

- `previewConfig.js` declares extension → handler mappings, optional
  dependencies and stylesheets, and a `requiresUploadConsent` flag.
- `previewManager.js` resolves a file by name, enforces consent (PPTX), lazy‑
  loads dependencies, then loads the handler and mounts it in the modal.
- Handlers live in `js/preview/handlers/` and export:
    - `default(blob, contentElement)` to render
    - optionally, `cleanup()` to tear down state between previews
- PPTX preview uploads the blob to UploadThing, uses Microsoft Office Online
  Viewer to display.

Adding a new preview:

1. Create `js/preview/handlers/yourTypePreview.js`:

   ```js
   // js/preview/handlers/xyzPreview.js
   export async function cleanup() {
     // Optionally tear down things here
   }

   export default async function renderXyzPreview(blob, mount) {
     // Read/process the blob
     const text = await blob.text();
     const pre = document.createElement('pre');
     pre.textContent = text.slice(0, 1000);
     mount.appendChild(pre);
   }
   ```

2. Wire it in `js/preview/previewConfig.js`:

   ```js
   export const previewConfig = {
     // …
     xyz: {
       extensions: ['xyz'],
       handler: () => import('./handlers/xyzPreview.js'),
     },
   };
   ```

3. The preview modal shows when you call `showPreview(fileName)`.

Security:

- Markdown uses DOMPurify.
- External styles/scripts are only added when needed and only for the active
  preview (lazy).
- PPTX requires explicit user consent before any upload.


## 9) Screen sharing

- Toggled by a single “Share Screen” button, disabled on mobile.
- UA‑aware audio constraints:
    - Chrome/Edge/Opera: tab audio works everywhere; full system audio on Windows.
    - Firefox: tab audio only.
    - Safari/Android/iOS: audio not reliably supported (disabled).
- Quality presets use `MediaTrackConstraints` via `track.applyConstraints`.
- Local and remote panels show small inline controls with a quality menu and a
  fullscreen toggle for the viewer.
- Renegotiation occurs when adding/removing tracks.


## 10) UI architecture (DOM, events, view, modals, onboarding)

- `ui/dom.js`: Single source of truth for DOM nodes.
- `ui/events.js`:
    - All listeners bound in one place.
    - Drag‑and‑drop, OTP flight code behaviour, QR scan flow, sortable queue,
      screen sharing toggles, “leave” behaviour.
    - Progressive Enhancement for Desktop: Checks for the existence of `window.electronAPI`. If present, it overrides the default file/folder input behavior to call the native OS dialogs via IPC.
- `ui/view.js`:
    - Small pure-ish functions that read from the store and mutate view state.
    - Manages queue expansion, metrics UI, panels, pulses, and stream views.
- `ui/modals.js`:
    - Acts as an orchestrator for global modals (About, Donate, etc.).
    - For complex modals (Settings, Zip, Invite), it delegates logic to the relevant
      modules in `js/features/`.
- `ui/onboarding.js`:
    - Welcome/Invite overlays; computes safe positions using VisualViewport and
      re‑positions on orientation/resize.
- `ui/effects.js`:
    - Manages the "Animation Quality" setting. Reads from `localStorage`, applies
      `<body>` classes (`reduced-effects`, `no-effects`), and reflects the
      current choice in the UI.

Design principle: keep each of these files scoped to one job to minimise
surprise and cross‑module coupling.


## 11) Styling and theming

- CSS is split by concern and loaded via `styles/index.css` which @imports:
  base, layout, components, utilities, responsive.
- Theme:
    - Light/dark toggled by `body[data-theme]` and CSS variables.
    - Theme switch updates `<meta name="theme-color">` and re‑draws QR codes.
- Animations:
    - Aurora background and blobs are managed via user settings (`high`/`reduced`/`off`)
      to ensure zero idle CPU cost when disabled or reduced.
    - Reduced motion is honoured with `prefers-reduced-motion`.
    - UI animations are paused in hidden elements (e.g., modal loaders) to prevent
      background style recalculations.
- Responsive:
    - Breakpoints at `max-width: 991px`, `768px`, etc.
    - Drawer appears on small screens; footer links collapse; controls compact.

Naming:

- Component file per surface (dropzone, buttons, queues, modals, etc).
- Keep selectors shallow; prefer CSS vars for colour and spacing.


## 12) Internationalisation (i18n)

- `i18n.js` wires i18next with `i18next-browser-languagedetector`.
- Static text is rendered by scanning DOM nodes with `[data-i18n]` attributes.
- Settings modal includes a language selector that triggers `i18next.changeLanguage`.
- Translation resources live in `src/locales/*.json`.

Automation:

- `scripts/update-locales.js` synchronises:
    - Imports/resources in `i18n.js`.
    - Language options in `ui/modals.js` (between markers).
    - Adds missing language labels to all locale JSON files.

Guidelines:

- Always add keys to `en.json` first; keep keys descriptive and scoped.
- Do not hardcode strings in JS/HTML; use `i18next.t(key, options)` or
  `[data-i18n]` where possible.


## 13) Privacy, consent, and third‑party scripts

- Privacy consent toast:
    - Appears after the welcome onboarding on first run.
    - Accepting sets `dropsilk-privacy-consent` and activates:
        - Google Analytics (gtag) script (deferred until consent).
        - Vercel Speed Insights (deferred until consent).
    - The settings modal can enable analytics later without a reload; disabling
      prompts a reload to fully stop collection.
- PPTX preview consent:
    - Explicit prompt with “remember” tickbox.
    - Stored per extension in `dropsilk-preview-consent`.
    - If denied, preview buttons for PPTX are disabled with a tooltip.
- reCAPTCHA:
    - Lazy‑loaded only when the user clicks “View Email”.
    - Uses the site key placeholder in the DOM attribute.

Security posture:

- No files are uploaded except optional PPTX previews and then only to the
  configured UploadThing endpoint, with auto‑clean up (server‑side).
- WebRTC data paths are end‑to‑end encrypted (DTLS/SRTP).
- Markdown is sanitised.
- reCAPTCHA is loaded on demand only for the contact email.
- QR scanner accepts only our URL schema; invalid scans are rejected.
- Do not include secrets in the client; use `VITE_` prefix for safe public
  env vars only.


## 14) Build system and environments

- Build tool: Vite (+ ESM everywhere).
- Dev server: `npm run dev` or `npm run dev:electron` for desktop. (see package.json).
- Environments:
    - `.env.local` must include:

      ```text
      VITE_API_BASE_URL=http://localhost:8080
      ```

      This powers the UploadThing client for PPTX previews.

- Electron Build: `npm run build:electron` orchestrates a two-step process:
    - `vite build --base=./`: Vite builds the frontend with relative paths (`./`) for the app to work when loaded from the local filesystem via Electron's protocol.
    - `electron-builder`: This tool packages the Vite output along with the `electron/` scripts into distributable installers (`.dmg`, `.exe`, `.AppImage`).

- WebSocket URL resolution is dynamic:
    - If `location.protocol !== 'https:'` → `ws://<host>:8080` (useful on LAN).
    - Else → production `wss://dropsilk-backend.onrender.com`.
- **Pre-paint script**: A small, inline script in `index.html` reads the animation
  quality from `localStorage` and applies a class to `<body>` before the first
  paint. This prevents a "flash" of unwanted animations on page load.

Public assets:

- Served from `public/`, accessible by `/…` at runtime (e.g., `/sounds/*.mp3`,
  `/video.js`).

PDF.js worker:

- Imported as `pdf.worker?url` and assigned to `GlobalWorkerOptions.workerSrc`
  at runtime.


## 15) Testing and manual QA

There’s no formal test suite yet. For manual checks:

- Flights:
    - Create and join flows.
    - Invitation toast → “Join” works.
    - URL `?code=` on load auto‑boards.
- Transfer:
    - Small and large files (multi‑GB) with and without OPFS.
    - Drag‑and‑drop and folder selection (size/count warnings).
    - Queue reordering and cancel mid‑transfer.
    - Auto‑download on and off; size cap respected.
- Screen share:
    - Chrome/Edge (tab audio), Firefox (tab only), macOS/Windows differences.
    - Fullscreen enter/exit and orientation lock on mobile/tablet.
- Previews:
    - Images, audio (WaveSurfer), code (HLJS), Markdown (sanitised),
      PDF (lazy page render), DOCX (Mammoth), XLSX (SheetJS), PPTX
      (consent + UploadThing + Office embed).
- Internationalisation:
    - Language selector and persisted choice.
    - Update‑locales script regenerates imports and options.
- Accessibility:
    - Keyboard only: modals, video player controls, drawer, OTP inputs.
    - Reduced motion and performance modes apply.
- Privacy:
    - Consent banner shows, toggling analytics works as described.

Future work: Vitest for units and Playwright for simple E2E flows could be
added later.


## 16) Performance guidelines

- Keep heavy libs lazy:
    - PDF.js, UploadThing client, preview handlers, analytics, reCAPTCHA.
- Use Web Workers for blocking IO (file reads).
- Avoid frequent DOM reads/writes in loops; batch updates and throttle.
- DataChannel: honour `bufferedAmount` thresholds to prevent stalling.
- **Animations**:
    - The single biggest source of idle performance cost comes from hidden but
      mounted elements with infinite CSS animations (e.g., spinners in modals).
      This causes constant style recalculations even when invisible.
    - **Rule**: All hidden elements with animations must either be unmounted (`display: none`)
      or have their animations explicitly paused (`animation-play-state: paused`).
    - The "Animation Quality" setting in the UI directly controls this, allowing
      the app to achieve near-zero CPU usage at idle in `reduced` or `off` modes.
- OPFS safe mode for large receives avoids memory spikes/crashes.


## 17) Accessibility notes

- Keyboard support:
    - Modals: Escape closes (with zipping guard), focus remains reasonable.
    - OTP inputs: left/right navigation, paste support, error animation.
    - Drawer links forward to original buttons; tap feedback on mobile.
- Reduced motion:
    - Follow `prefers-reduced-motion` and user “performance/off” settings.
- Colour contrast:
    - Palette set by CSS variables; maintain contrast for important UI.
- Video player:
    - Keyboard shortcuts: Space/F/M/←/→; focus states are visible.


## 18) Security notes

- No file content goes to our servers (P2P only) except PPTX preview uploads,
  which are opt‑in and time‑limited on the server.
- WebRTC encrypts media/data (DTLS/SRTP).
- Markdown is sanitised.
- reCAPTCHA is loaded on demand only for the contact email.
- QR scanner accepts only our URL schema; invalid scans are rejected.
- Do not include secrets in the client; use `VITE_` prefix for safe public
  env vars only.


## 19) Common workflows (recipes)

Add a new preview type:

1. Create a handler under `js/preview/handlers/`.
2. Register it in `previewConfig.js`.
3. If it needs external CSS, list it in `stylesheets`.
4. If it requires uploading (e.g., server‑side render), set
   `requiresUploadConsent: true` and implement that in the handler.

Add a new WebSocket message:

1. Update the backend protocol.
2. Add a `case` in `js/network/websocket.js:onMessage`.
3. Dispatch store actions and call view helpers; do not query DOM directly.

Add a new setting:

1. Add UI in `populateSettingsModal()` in `js/features/settings/settingsUI.js`.
2. Persist to `localStorage` (use a `dropsilk-*` key).
3. If it affects performance/animations, wire it up in `js/ui/effects.js`.
4. Apply in `js/features/settings/settingsData.js` and reflect in the UI.

Add a new language:

1. Add `src/locales/xx.json`.
2. Run `node scripts/update-locales.js`.
3. Fill translations in the new JSON file(s).


## 20) Adding or changing translations

- Keys live in `src/locales/en.json` first; keep names descriptive.
- To add a language:
    - Create `xx.json`, minimally copying the shape from `en.json`.
    - Run `scripts/update-locales.js` to update imports/resources/options and to
      seed language names across JSONs.
- In HTML, use `data-i18n` attributes; in code, `i18next.t(key, options)` or
  `[data-i18n]` where possible.
- For dynamic text (e.g., toasts) always use `i18next.t()`.


## 21) Known limitations and cross‑browser notes

- iOS and many Android browsers cannot share screen audio.
- Firefox supports tab‑audio only (not window/desktop audio).
- OPFS is not supported everywhere; we gracefully fall back to memory.
- PPTX preview depends on UploadThing and Microsoft Office embed; it will not
  work offline and requires consent/LAN connectivity to the backend.
- Some CSS effects vary slightly across browsers (e.g., gradient masks).
- Connectivity relies on WebRTC's ICE framework (STUN/TURN). In highly
  restrictive network environments where even TURN relaying is blocked, direct
  peer-to-peer connections may fail.

---

If you’re unsure where something belongs:

- Is it view code that touches the DOM? `ui/…`
- Is it a feature slice (chat, settings)? `features/…`
- Is it a network edge (signalling or peer)? `network/…`
- Is it file transfer orchestration or IO? `transfer/…`
- Is it a one‑off helper? `utils/…`
- Is it a file preview? `preview/…`
- Is it global app wiring? `app.js`
