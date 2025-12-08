// ui/streaming.js
// Manages screen sharing UI (local and remote stream views)

import i18next from '../i18n.js';

/**
 * Shows the local stream view when screen sharing starts.
 * @param {MediaStream} stream - The local media stream
 * @param {Function} qualityChangeCallback - Callback for quality preset changes
 */
export function showLocalStreamView(stream, qualityChangeCallback) {
    const panel = document.getElementById('local-stream-panel');
    const video = document.getElementById('local-video');
    const settingsMenu = panel?.querySelector('.stream-settings-menu');
    const settingsBtn = panel?.querySelector('.stream-settings-btn');

    if (!panel || !video) return;
    video.srcObject = stream;
    panel.classList.remove('hidden');

    if (settingsMenu) {
        settingsMenu.onclick = (e) => {
            const button = e.target.closest('button');
            if (button && button.dataset.quality) {
                qualityChangeCallback(button.dataset.quality);
                settingsMenu
                    .querySelectorAll('button')
                    .forEach((b) => b.classList.remove('active'));
                button.classList.add('active');
                settingsMenu.style.display = 'none';
            }
        };
    }

    if (settingsBtn) {
        settingsBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = settingsMenu?.style.display === 'block';
            if (settingsMenu) {
                settingsMenu.style.display = isVisible ? 'none' : 'block';
            }
            if (!isVisible) {
                document.addEventListener(
                    'click',
                    () => {
                        if (settingsMenu) settingsMenu.style.display = 'none';
                    },
                    { once: true },
                );
            }
        };
    }
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Hides the local stream view when screen sharing stops.
 */
export function hideLocalStreamView() {
    const panel = document.getElementById('local-stream-panel');
    const video = document.getElementById('local-video');
    if (panel && video) {
        video.srcObject = null;
        panel.classList.add('hidden');
    }
}

/**
 * Shows the remote stream view when receiving a screen share.
 * @param {MediaStream} stream - The remote media stream
 */
export function showRemoteStreamView(stream) {
    const panel = document.getElementById('screen-share-panel');
    const video = document.getElementById('remote-video');
    const fullscreenBtn = document.getElementById('fullscreen-stream-btn');

    if (!panel || !video) return;
    video.srcObject = stream;
    panel.classList.remove('hidden');

    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await panel.requestFullscreen();
                if (screen.orientation && typeof screen.orientation.lock === 'function') {
                    if (video.videoWidth > video.videoHeight) {
                        await screen.orientation.lock('landscape');
                    }
                }
            } else {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error('Fullscreen or orientation lock failed:', err);
        }
    };

    if (fullscreenBtn) {
        fullscreenBtn.onclick = toggleFullscreen;
    }
    video.ondblclick = toggleFullscreen;

    const handleFullscreenChange = () => {
        panel.classList.toggle('is-fullscreen', !!document.fullscreenElement);
        if (
            !document.fullscreenElement &&
            screen.orientation &&
            typeof screen.orientation.unlock === 'function'
        ) {
            screen.orientation.unlock();
        }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.onended = () => hideRemoteStreamView();
    }

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Hides the remote stream view when the remote screen share ends.
 */
export function hideRemoteStreamView() {
    const panel = document.getElementById('screen-share-panel');
    const video = document.getElementById('remote-video');
    if (panel && video) {
        if (document.fullscreenElement === panel) {
            document.exitFullscreen();
        }
        video.srcObject = null;
        panel.classList.add('hidden');
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            screen.orientation.unlock();
        }
    }
}

/**
 * Updates the share screen button state.
 * @param {boolean} isSharing - Whether screen is currently being shared
 */
export function updateShareButton(isSharing) {
    const btn = document.getElementById('shareScreenBtn');
    if (!btn) return;

    btn.classList.remove('hidden');
    const textSpan = btn.querySelector('span:not([class])');
    if (isSharing) {
        btn.classList.add('is-sharing');
        if (textSpan) textSpan.textContent = i18next.t('stopSharing');
    } else {
        btn.classList.remove('is-sharing');
        if (textSpan) textSpan.textContent = i18next.t('shareScreen');
    }
}
