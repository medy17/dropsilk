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

This document explains how the frontend is structured. It is intended for
contributors who need to understand where code lives, how runtime responsibilities
are split, and what conventions to follow when extending the app.

If you are looking for setup and local run instructions, see the README. This
document focuses on the internal architecture of the frontend project itself.

## Table of contents

1. High-level overview
2. Runtime flow
3. Directory layout and generated files
4. Module boundaries and conventions
5. State management
6. Networking and room lifecycle
7. File transfers
8. Preview subsystem
9. Screen sharing
10. UI architecture
11. Styling and theming
12. Internationalisation
13. Privacy, consent, and third-party scripts
14. Build system and environments
15. Testing and manual QA
16. Performance guidelines
17. Accessibility notes
18. Security notes
19. Common workflows
20. Known limitations and cross-browser notes

## 1) High-level overview

DropSilk's frontend is a single-page app built with Vite and plain ES modules.
There is no client-side framework. The codebase is organized around a few clear
responsibilities:

- UI: DOM queries, event binding, view updates, onboarding, modals, drawer.
- Room/session flow: REST-backed room creation/join/status, then WebSocket attachment.
- Networking: WebSocket signaling plus WebRTC data-channel setup.
- Transfers: queueing, chunking, worker-based reads, receive orchestration, OPFS.
- Screen sharing: separate signaling/session handling from file-transfer WebRTC.
- Preview: lazy-loaded handlers for file-type-specific viewers.
- State: a small in-memory store with imperative actions.
- i18n: i18next with generated locale metadata.
- Styling: CSS split into base, layout, components, utilities, responsive, themes.
- Desktop shell: Electron provides native file/folder pickers through preload IPC.

Broadly, the frontend talks to the
backend's room API first, polls room state, and only attaches the WebSocket
signaling channel once one of the users selects a file, starts a chat, or shares their screen.

**The main idea is that WebSockets are disposable and the source-of-truth lives in PostgreSQL.**

## 2) Runtime flow

Boot sequence, simplified:

1. An inline script in `index.html` applies animation/performance classes before
   first paint to avoid flashes.
2. `src/js/app.js` runs on `DOMContentLoaded`.
3. `initEffects()` applies persisted animation quality.
4. i18n is initialized and static `[data-i18n]` nodes are translated.
5. Global UI is initialized: modals, theme, drawer, onboarding scaffolding.
6. Event listeners are bound.
7. User state is initialized from local storage and generated defaults.
8. Privacy consent and deferred third-party scripts are wired up.
9. If `?code=XXXXXX` exists, the app shows the boarding overlay and attempts
   `joinRoomFlow()`.
10. Otherwise the regular home/onboarding path is shown.

Room and connection flow:

1. `createRoomFlow()` or `joinRoomFlow()` calls the REST room API.
2. The returned room summary is applied to store + UI.
3. `roomSession.js` starts polling room status.
4. Once the summary says the room should connect, `websocket.connect()` attaches
   the signaling socket to the room with a participant ID.
5. WebSocket relays signaling messages and peer presence.
6. `webrtc.js` establishes the file-transfer data channel.
7. File transfers, chat, and optional screen sharing become available.

Screen sharing is separate from the file-transfer peer connection. It has its
own session module and its own signaling attachment flow.

## 3) Directory layout and generated files

Everything relevant to the client app lives under `frontend/`.

```
frontend/
├─ electron/
│  ├─ main.js
│  └─ preload.js
├─ public/
│  ├─ sender.worker.js
│  ├─ video.js
│  ├─ sounds/
│  └─ favicons/
├─ scripts/
│  ├─ generate-locales.js
│  ├─ generate-version.js
│  ├─ update-locales.js
│  ├─ update-themes.js
│  └─ theme-config.js
├─ src/
│  ├─ js/
│  │  ├─ app.js
│  │  ├─ config.js
│  │  ├─ i18n.js
│  │  ├─ locales.gen.js        # generated
│  │  ├─ state.js
│  │  ├─ themeConfig.gen.js    # generated
│  │  ├─ version.gen.js        # generated
│  │  ├─ features/
│  │  │  ├─ chat/
│  │  │  ├─ contact/
│  │  │  ├─ invite/
│  │  │  ├─ settings/
│  │  │  ├─ theme/
│  │  │  └─ zip/
│  │  ├─ network/
│  │  │  ├─ roomApi.js
│  │  │  ├─ roomSession.js
│  │  │  ├─ screenShareSession.js
│  │  │  ├─ webrtc.js
│  │  │  └─ websocket.js
│  │  ├─ preview/
│  │  │  ├─ handlers/
│  │  │  ├─ previewConfig.js
│  │  │  └─ previewManager.js
│  │  ├─ transfer/
│  │  │  ├─ etrCalculator.js
│  │  │  ├─ fileHandler.js
│  │  │  ├─ fileReceiver.js
│  │  │  ├─ fileSender.js
│  │  │  ├─ opfsHandler.js
│  │  │  ├─ queueManager.js
│  │  │  ├─ transferUI.js
│  │  │  └─ zipHandler.js
│  │  ├─ ui/
│  │  │  ├─ dom.js
│  │  │  ├─ drawer.js
│  │  │  ├─ effects.js
│  │  │  ├─ events.js
│  │  │  ├─ modals.js
│  │  │  ├─ onboarding.js
│  │  │  ├─ streaming.js
│  │  │  └─ view.js
│  │  └─ utils/
│  │     ├─ audioManager.js
│  │     ├─ helpers.js
│  │     ├─ security.js
│  │     ├─ toast.js
│  │     └─ uploadHelper.js
│  ├─ locales/
│  └─ styles/
├─ tests/
├─ index.html
├─ 404.html
├─ vite.config.mjs
└─ vitest.config.js
```

Notes:

- `public/sender.worker.js` is the transfer worker. It is not stored under
  `src/js/workers/`.
- `src/js/locales.gen.js`, `src/js/themeConfig.gen.js`, and
  `src/js/version.gen.js` are generated artifacts. Do not hand-edit them.
- Theme CSS files live under `src/styles/themes/` and are imported into
  `src/styles/index.css` by `scripts/update-themes.js`.

Where should new code go?

- New domain feature: `src/js/features/<feature>/`.
- Room or signaling concerns: `src/js/network/`.
- File-transfer logic: `src/js/transfer/`.
- Preview handler: `src/js/preview/handlers/`.
- DOM-heavy orchestration: `src/js/ui/`.
- Small shared helpers: `src/js/utils/`.
- CSS additions: the relevant file under `src/styles/`.

## 4) Module boundaries and conventions

- ES modules everywhere; avoid globals.
- `app.js` is the entry and top-level orchestrator.
- `state.js` is the only shared mutable store. Mutate through `store.actions`.
- `ui/dom.js` centralizes element lookups. Prefer importing it over scattering
  raw selectors across unrelated modules.
- `ui/events.js` binds listeners and routes user actions to feature/network code.
- `ui/view.js` and `ui/streaming.js` own DOM updates for their surfaces.
- `features/*` own domain-specific UI and persistence logic.
- `network/*` owns room lifecycle, signaling, peer setup, and screen-share sessions.
- `transfer/*` owns queueing, sender/receiver behavior, OPFS, and transfer UI.
- `preview/*` owns file-type dispatch and lazy preview rendering.

Conventions:

- Keep DOM mutation close to UI modules.
- Keep backend protocol handling in `network/*`.
- Keep side effects explicit; do not hide network calls inside generic helpers.
- Prefer small functions and named exports unless a module has one obvious default.
- Lazy-load heavy dependencies and preview handlers.

## 5) State management

`src/js/state.js` contains a small in-memory store with imperative actions.
There is no subscription system and no reactive layer.

State groups:

- Identity/session: `myId`, `myName`, `currentFlightCode`, `isFlightCreator`.
- Room lifecycle: `roomParticipantId`, `roomRole`, `roomStatus`, `roomPeer`,
  `signalingInitiated`.
- Peer/network: `peerInfo`, `connectionType`, `lastNetworkUsers`.
- Transfers: queue, current send, DOM file ID map, received files.
- Metrics: totals, interval counters, metrics timer handle.
- UI flags: onboarding, scroll state, invitation toast visibility.

Guidelines:

- Add state only when multiple modules truly need it.
- Prefer deriving display values instead of storing duplicates.
- Clear state on disconnect/reset through store actions, not ad hoc mutation.

## 6) Networking and room lifecycle

The networking layer has four distinct pieces:

- `roomApi.js`: REST calls for room creation, joining, polling status, marking
  readiness, and screen-share state.
- `roomSession.js`: applies room summaries to store/UI and manages polling.
- `websocket.js`: attaches signaling to a room and relays peer/signaling events.
- `webrtc.js`: creates the file-transfer `RTCPeerConnection` and data channel.

### Room-first model

Create/join flows go through `roomApi.js` first. The backend returns a room
summary that includes the local participant, peer state, room status, and
whether the signaling channel should attach yet.

`roomSession.js` then:

- updates the store with room metadata
- enters flight mode in the UI
- enables or disables the drop zone depending on peer presence
- keeps polling until the room is ready
- attaches the WebSocket signaling channel when `shouldConnect` is true

### Signaling

`websocket.js` does not own room creation/joining. It owns:

- registering the client
- attaching to a room with `roomCode` and `participantId`
- receiving signaling messages
- relaying SDP/ICE to `webrtc.js`
- handling peer-left/error/socket-close cases

### WebRTC

`webrtc.js` creates the file-transfer peer connection and data channel:

- ICE servers are fetched from `${API_BASE_URL}/api/turn-credentials`
- LAN connections skip external ICE
- fallback is public STUN if TURN fetch fails
- the data channel uses `HIGH_WATER_MARK` and `bufferedAmountLowThreshold`
  based flow control
- metrics are updated on an interval once the channel opens

The signaling socket and the file-transfer peer connection are separate from
the screen-sharing session described below.

## 7) File transfers

File-transfer logic lives under `src/js/transfer/`.

Key modules:

- `fileHandler.js`: thin facade that re-exports sender/receiver/queue functions
  and provides a combined reset helper.
- `fileSender.js`: worker-driven file reads, chunk dispatch, throttling.
- `fileReceiver.js`: incoming metadata/chunks/EOF handling, receive assembly,
  screen-share wake messages.
- `queueManager.js`: file/folder selection, queue state, drag-drop sorting,
  ready-state signaling to the room session.
- `transferUI.js`: transfer row/template HTML generation.
- `opfsHandler.js`: Origin Private File System streaming for large receives.
- `zipHandler.js`: "download all" archive support.

Transfer model:

1. User selects files or folders.
2. `queueManager.js` adds them to store state and updates UI.
3. The sender worker reads the current file in chunks from `public/sender.worker.js`.
4. Chunks are sent over the data channel with backpressure control.
5. Receiver writes to memory or OPFS depending on size/support/settings.
6. On EOF, the final Blob/File is assembled, stored, and surfaced in the UI.

OPFS safe mode is used to avoid exhausting tab memory on large receives.

## 8) Preview subsystem

The preview system is extension-driven and lazy-loaded.

- `previewConfig.js` maps file types to extensions and handlers.
- `previewManager.js` chooses a handler, loads dependencies, and mounts preview UI.
- Handlers live in `preview/handlers/`.

Supported handler groups include:

- images
- HEIC/HEIF
- audio
- code/text
- Markdown
- PDF
- DOCX
- PPTX
- PSD
- XLSX/XLS/CSV

Important details:

- Markdown is sanitized.
- PPTX preview requires explicit upload consent and backend availability.
- Some handlers load their own external styles or heavy libraries only when used.

Adding a new preview:

1. Create `src/js/preview/handlers/<type>Preview.js`.
2. Register extensions and handler import in `previewConfig.js`.
3. Add any consent or stylesheet requirements there as well.

## 9) Screen sharing

Screen sharing has its own session layer in `src/js/network/screenShareSession.js`.

Responsibilities of `screenShareSession.js`:

- track whether local screen share is active
- manage a second WebSocket attachment for the `screen-share` channel
- manage a dedicated peer connection for screen-share media
- keep room state in sync through `roomApi.setParticipantScreenShare()`
- wake the remote side when a share starts
- show/hide local and remote stream UI through `ui/streaming.js`

This separation keeps file transfer stable even when screen sharing is toggled.

Browser support behavior is pragmatic:

- mobile/iOS/Android: screen sharing is disabled or audio is unavailable
- Chrome/Edge/Opera: best support, especially for tab audio
- Firefox: tab audio only
- Safari: more limited audio support

## 10) UI architecture

UI responsibilities are intentionally split:

- `ui/dom.js`: stable element map
- `ui/events.js`: user input, drag-and-drop, OTP inputs, room actions, screen-share triggers
- `ui/view.js`: queue/dashboard/network/onboarding rendering helpers
- `ui/streaming.js`: stream-specific UI
- `ui/modals.js`: modal orchestration and delegation to feature modules
- `ui/onboarding.js`: welcome/invite overlays and positioning logic
- `ui/effects.js`: animation quality/performance classes
- `ui/drawer.js`: responsive drawer behavior

Feature modules extend this core shell:

- `features/chat/`: chat state/view/events
- `features/contact/`: contact modal and email reveal flow
- `features/invite/`: QR/share modal behavior
- `features/settings/`: settings persistence and settings UI
- `features/theme/`: theme application and QR regeneration
- `features/zip/`: ZIP modal state and actions

Electron support is progressive enhancement. When `window.electronAPI` exists,
the UI can route file/folder picking through native dialogs instead of browser
inputs.

## 11) Styling and theming

Styles are loaded from `src/styles/index.css`, which aggregates:

- `base/`
- `layout/`
- `components/`
- `utilities.css`
- `responsive.css`
- generated theme imports from `themes/*.css`

Theme system details:

- Theme name is stored separately from light/dark mode.
- The document uses `data-theme` and `data-mode` attributes.
- `scripts/update-themes.js` generates `themeConfig.gen.js` from
  `scripts/theme-config.js` and the actual theme CSS files present on disk.
- `features/theme/index.js` uses the generated config to update meta theme color
  and to regenerate QR codes when needed.

The architecture includes a catalog of named themes plus a mode toggle.

## 12) Internationalisation

i18n is built on `i18next` and locale JSON files under `src/locales/`.

The frontend uses generated locale metadata:

- `scripts/generate-locales.js` scans locale files and produces `src/js/locales.gen.js`
- `src/js/i18n.js` imports `SUPPORTED_LOCALES` from that generated file
- `scripts/update-locales.js` keeps locale wiring and labels synchronized

The app translates:

- static DOM nodes via `[data-i18n]`
- runtime strings via `i18next.t(...)`

Guidelines:

- add keys to `en.json` first
- keep keys descriptive and scoped
- do not hardcode user-facing strings in JS unless there is a strong reason

## 13) Privacy, consent, and third-party scripts

Consent-sensitive features are deferred until needed.

- Privacy consent gates Google Analytics, Vercel Speed Insights, and Vercel Analytics.
- `app.js` activates deferred scripts only after explicit consent.
- reCAPTCHA is lazy-loaded only when the user asks to reveal the contact email.
- PPTX preview requires separate explicit upload consent.

Client-side rules:

- no secrets in client code
- only public values use `VITE_*`
- external scripts should load lazily whenever possible

## 14) Build system and environments

Tooling:

- Vite for web builds and dev server
- Vitest for tests
- Electron + electron-builder for desktop packaging

Scripts in `package.json`:

- `pnpm dev`: generates version/locales/themes, then runs Vite
- `pnpm build:web`: generates version/locales/themes, then builds web output
- `pnpm dev:electron`: runs Vite plus Electron
- `pnpm build:electron`: builds web assets with `--base=./` and packages Electron
- `pnpm test`: regenerates locales/themes, then runs Vitest

Generated build metadata:

- `generate-version.js` writes `src/js/version.gen.js`
- branch/build metadata is derived from git or Vercel env vars

Environment values used by the frontend:

- `VITE_API_BASE_URL`
- `VITE_RECAPTCHA_SITE_KEY`

Runtime config behavior in `src/js/config.js`:

- API base URL is normalized for LAN usage when possible
- production builds default to the Render backend
- dev and preview builds connect to the local backend on port `8080`
- WebSocket URL and API base URL are resolved separately

## 15) Testing and manual QA

The repo includes a real test suite.

Test setup:

- Vitest with `jsdom`
- shared mocks in `tests/setup.js`
- custom pretty reporter for local runs

Coverage areas include:

- state/store behavior
- queue and transfer flows
- previews
- settings and settings UI
- onboarding and modals
- i18n
- contact flow
- streaming behavior
- security helpers
- ZIP/XLSX/QR related logic

Manual QA is still important for:

- real browser-to-browser transfers
- cross-browser screen sharing
- very large file receives and OPFS behavior
- Electron-native picker flows
- production-like privacy/analytics consent behavior

## 16) Performance guidelines

- Keep heavy libraries lazy.
- Use the worker for file reads instead of blocking the main thread.
- Respect data-channel backpressure.
- Prefer OPFS for large receives when supported.
- Avoid repeated DOM reads/writes inside tight loops.
- Hidden animated elements must be paused or removed from layout.
- Treat animation quality settings as a performance control, not just a visual preference.

## 17) Accessibility notes

- Keyboard interaction matters for modals, OTP inputs, drawer navigation, and controls.
- Reduced motion is respected through both system preference and user settings.
- Focus visibility should remain intact when adding new UI.
- Screen-sharing and media controls should continue to expose clear labels and states.

## 18) Security notes

- File contents stay peer-to-peer except optional consented preview uploads such as PPTX.
- WebRTC traffic is encrypted by the browser stack.
- Markdown and preview content must remain sanitized.
- reCAPTCHA is loaded on demand only for the contact flow.
- Client code must not contain secrets.
- Backend-dependent features should fail closed and visibly when config is missing.

## 19) Common workflows

Add a new room/session capability:

1. Update the backend contract first.
2. Extend `roomApi.js` or `websocket.js` as appropriate.
3. Apply room summary changes in `roomSession.js`.
4. Reflect state in `ui/view.js` or the relevant feature module.

Add a new file preview:

1. Create a handler in `preview/handlers/`.
2. Register it in `previewConfig.js`.
3. Lazy-load any heavy dependency.
4. Add tests for extension routing and handler behavior where feasible.

Add a new setting:

1. Define persistence in `features/settings/settingsData.js`.
2. Render controls in `features/settings/settingsUI.js`.
3. Apply side effects in the owning module, such as `ui/effects.js` or `features/theme/index.js`.
4. Add or update tests.

Add a new theme:

1. Add `<theme>.css` under `src/styles/themes/`.
2. Add its metadata to `scripts/theme-config.js`.
3. Run `pnpm update-themes`.

Add a new locale:

1. Add `src/locales/<code>.json`.
2. Run `pnpm gen:locales` and `pnpm update-locales`.
3. Fill translations and verify selector labels.

## 20) Known limitations and cross-browser notes

- OPFS is not available in every browser; the app falls back to memory.
- Mobile browsers have limited or no screen-share support, especially for audio.
- Firefox screen-share audio support is narrower than Chromium-based browsers.
- PPTX preview depends on backend availability, UploadThing, consent, and external viewing.
- Very restrictive networks can still block peer connectivity even with TURN.
- Some preview and visual effects behave slightly differently across browsers.

---

If you are unsure where something belongs:

- Room or connection lifecycle: `network/`
- File-transfer mechanics: `transfer/`
- Preview rendering: `preview/`
- Domain-specific UI slice: `features/`
- Shared DOM/view orchestration: `ui/`
- Small shared utility: `utils/`
- Build-time generation: `scripts/`
