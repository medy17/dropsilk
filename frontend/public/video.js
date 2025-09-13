// --- NEW FILE: video.js ---
// This is a self-contained video player component.

window.videoPlayer = (() => {
    // --- NEW: HTML structure is now defined inside the component ---
    const playerTemplate = `
        <div class="modal-overlay" id="videoModal" style="display: none;">
            <div id="video-player-container">
                <button id="close-video-btn" aria-label="Close Video Player">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>
                </button>
                <video id="video-element" preload="metadata"></video>
                <div class="video-controls-container">
                    <div class="timeline-container">
                        <div class="timeline">
                            <div class="hover-indicator"></div>
                            <div class="buffered-bar"></div>
                            <div class="progress-bar"></div>
                        </div>
                    </div>
                    <div class="controls">
                        <div class="controls-left">
                            <button class="play-pause-btn" aria-label="Play/Pause">
                                <svg class="play-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                <svg class="pause-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                            </button>
                            <div class="volume-container">
                                <button class="volume-btn" aria-label="Mute/Unmute">
                                    <svg class="high-volume-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z" /></svg>
                                    <svg class="low-volume-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M5,9V15H9L14,20V4L9,9M18.5,12C18.5,10.23 17.5,8.71 16,7.97V16C17.5,15.29 18.5,13.76 18.5,12Z" /></svg>
                                    <svg class="muted-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.94 18.8,13.82 18.46,14.64L19.97,16.15C20.62,14.91 21,13.5 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,12.22 16.47,12.43 16.43,12.64L14,10.21V7.97C15.5,8.71 16.5,10.23 16.5,12Z" /></svg>
                                </button>
                                <input class="volume-slider" type="range" min="0" max="1" step="any" value="1">
                            </div>
                            <div class="time-container">
                                <span class="current-time">0:00</span> / <span class="total-time">0:00</span>
                            </div>
                        </div>
                        <div class="controls-right">
                            <button class="download-btn" aria-label="Download Video">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 9l-5 5-5-5M12 12.8V2.5"/></svg>
                            </button>
                            <div class="settings-menu-container">
                                <button class="audio-track-btn" aria-label="Select Audio Track" style="display:none;">
                                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/><circle cx="9" cy="18" r="2"/></svg>
                                </button>
                                <div class="settings-menu audio-tracks-menu"></div>
                            </div>
                            <div class="settings-menu-container">
                                <button class="captions-btn" aria-label="Select Subtitles" style="display:none;">
                                    <svg viewBox="0 0 24 24"><path d="M18,11H16.5V10.5H14.5V13.5H16.5V13H18V14A1,1 0 0,1 17,15H14A1,1 0 0,1 13,14V10A1,1 0 0,1 14,9H17A1,1 0 0,1 18,10M21,4H3A2,2 0 0,0 1,6V18A2,2 0 0,0 3,20H21A2,2 0 0,0 23,18V6A2,2 0 0,0 21,4M11,11H9.5V10.5H7.5V13.5H9.5V13H11V14A1,1 0 0,1 10,15H7A1,1 0 0,1 6,14V10A1,1 0 0,1 7,9H10A1,1 0 0,1 11,10V11Z" /></svg>
                                </button>
                                <div class="settings-menu captions-menu"></div>
                            </div>
                            <button class="fullscreen-btn" aria-label="Toggle Fullscreen">
                                <svg class="enter-fullscreen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                                <svg class="exit-fullscreen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- Create and inject the player into the DOM ---
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = playerTemplate.trim();
    document.body.appendChild(tempContainer.firstChild);


    // --- Variables are selected from the newly created DOM ---
    const videoModalOverlay = document.getElementById('videoModal');
    const playerContainer = document.getElementById('video-player-container');
    const video = document.getElementById('video-element');
    const closeBtn = document.getElementById('close-video-btn');

    // Controls
    const playPauseBtn = playerContainer.querySelector('.play-pause-btn');
    const volumeBtn = playerContainer.querySelector('.volume-btn');
    const volumeSlider = playerContainer.querySelector('.volume-slider');
    const currentTimeEl = playerContainer.querySelector('.current-time');
    const totalTimeEl = playerContainer.querySelector('.total-time');
    const timelineContainer = playerContainer.querySelector('.timeline-container');
    const progressBar = playerContainer.querySelector('.progress-bar');
    const bufferedBar = playerContainer.querySelector('.buffered-bar');
    const hoverIndicator = playerContainer.querySelector('.hover-indicator');
    const fullscreenBtn = playerContainer.querySelector('.fullscreen-btn');
    const downloadBtn = playerContainer.querySelector('.download-btn');
    const audioBtn = playerContainer.querySelector('.audio-track-btn');
    const captionsBtn = playerContainer.querySelector('.captions-btn');
    const audioMenu = playerContainer.querySelector('.audio-tracks-menu');
    const captionsMenu = playerContainer.querySelector('.captions-menu');

    let currentVideoUrl = null;
    let currentFileName = '';
    let controlsTimeout;
    let lastVolume = 1;

    // --- PRIVATE FUNCTIONS
    function bindEvents() {
        closeBtn.addEventListener('click', close);
        videoModalOverlay.addEventListener('click', (e) => {
            if (e.target === videoModalOverlay) close();
        });
        playPauseBtn.addEventListener('click', togglePlay);
        video.addEventListener('click', togglePlay);
        video.addEventListener('dblclick', toggleFullscreen);
        video.addEventListener('play', () => playerContainer.classList.remove('paused'));

        video.addEventListener('pause', () => {
            playerContainer.classList.add('paused');
            playerContainer.classList.remove('cursor-hidden');
        });

        video.addEventListener('loadedmetadata', handleMetadataLoaded);
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('progress', handleBufferUpdate);
        video.addEventListener('volumechange', updateVolumeUI);
        volumeBtn.addEventListener('click', toggleMute);
        volumeSlider.addEventListener('input', handleVolumeChange);
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        downloadBtn.addEventListener('click', downloadVideo);
        document.addEventListener('fullscreenchange', () => playerContainer.classList.toggle('fullscreen', !!document.fullscreenElement));
        timelineContainer.addEventListener('mousemove', handleTimelineHover);
        timelineContainer.addEventListener('click', handleTimelineSeek);
        audioBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(audioMenu); });
        captionsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(captionsMenu); });
        playerContainer.addEventListener('mousemove', showControlsTemporarily);
    }

    function handleMetadataLoaded() {
        // Set aspect ratio on the container for responsive sizing
        const aspectRatio = video.videoWidth / video.videoHeight;
        playerContainer.style.aspectRatio = aspectRatio;

        // Standard setup
        playerContainer.classList.add('paused');
        totalTimeEl.textContent = formatTime(video.duration);
        video.volume = volumeSlider.value;
        updateVolumeUI();
        setupTrackMenus();
        video.play().catch(e => console.error("Autoplay was prevented:", e));
        showControlsTemporarily();
    }

    function togglePlay() { video.paused ? video.play() : video.pause(); }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            // When entering fullscreen, target the player container for a better experience
            playerContainer.requestFullscreen().catch(err => console.error(`Fullscreen error: ${err.message}`));
        } else {
            document.exitFullscreen();
        }
    }

    function toggleMute() {
        if (video.volume > 0) {
            lastVolume = video.volume;
            video.volume = 0;
        } else {
            video.volume = lastVolume;
        }
    }

    function handleVolumeChange(e) { video.volume = e.target.value; }

    function handleTimeUpdate() {
        currentTimeEl.textContent = formatTime(video.currentTime);
        const percent = (video.currentTime / video.duration) * 100;
        progressBar.style.width = `${percent}%`;
    }

    function handleBufferUpdate() {
        if (video.duration > 0) {
            for (let i = 0; i < video.buffered.length; i++) {
                if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) {
                    const percent = (video.buffered.end(i) / video.duration) * 100;
                    bufferedBar.style.width = `${percent}%`;
                    break;
                }
            }
        }
    }

    function handleTimelineHover(e) {
        const rect = timelineContainer.getBoundingClientRect();
        const percent = Math.min(Math.max(0, e.x - rect.x), rect.width) / rect.width;
        hoverIndicator.style.width = `${percent * 100}%`;
    }

    function handleTimelineSeek(e) {
        const rect = timelineContainer.getBoundingClientRect();
        const percent = Math.min(Math.max(0, e.x - rect.x), rect.width) / rect.width;
        video.currentTime = percent * video.duration;
    }

    function updateVolumeUI() {
        volumeSlider.value = video.volume;
        const [high, low, muted] = [volumeBtn.querySelector('.high-volume-icon'), volumeBtn.querySelector('.low-volume-icon'), volumeBtn.querySelector('.muted-icon')];
        high.style.display = 'none';
        low.style.display = 'none';
        muted.style.display = 'none';
        if (video.volume === 0 || video.muted) {
            muted.style.display = 'block';
        } else if (video.volume < 0.5) {
            low.style.display = 'block';
        } else {
            high.style.display = 'block';
        }
    }

    function formatTime(timeInSeconds) {
        const result = new Date(timeInSeconds * 1000).toISOString().substr(11, 8);
        return result.startsWith("00:") ? result.substr(3) : result;
    }

    function downloadVideo() {
        if (!video.src) return;
        const link = document.createElement('a');
        link.href = video.src;
        link.download = currentFileName || 'dropsilk-video.mp4';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function setupTrackMenus() {
        audioMenu.innerHTML = '';
        captionsMenu.innerHTML = '';
        if (video.audioTracks && video.audioTracks.length > 1) {
            audioBtn.style.display = 'flex';
            for (let i = 0; i < video.audioTracks.length; i++) {
                const track = video.audioTracks[i];
                const btn = document.createElement('button');
                btn.textContent = track.label || track.language || `Track ${i + 1}`;
                if (track.enabled) btn.classList.add('active');
                btn.onclick = (e) => { e.stopPropagation(); for (let j = 0; j < video.audioTracks.length; j++) video.audioTracks[j].enabled = false; track.enabled = true; audioMenu.querySelectorAll('button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); toggleMenu(audioMenu); };
                audioMenu.appendChild(btn);
            }
        } else { audioBtn.style.display = 'none'; }
        if (video.textTracks && video.textTracks.length > 0) {
            captionsBtn.style.display = 'flex';
            const offBtn = document.createElement('button');
            offBtn.textContent = 'Off';
            offBtn.classList.add('active');
            offBtn.onclick = (e) => { e.stopPropagation(); for (let j = 0; j < video.textTracks.length; j++) video.textTracks[j].mode = 'hidden'; captionsMenu.querySelectorAll('button').forEach(b => b.classList.remove('active')); offBtn.classList.add('active'); toggleMenu(captionsMenu); };
            captionsMenu.appendChild(offBtn);
            for (let i = 0; i < video.textTracks.length; i++) {
                const track = video.textTracks[i];
                track.mode = 'hidden';
                const btn = document.createElement('button');
                btn.textContent = track.label || track.language || `Track ${i + 1}`;
                btn.onclick = (e) => { e.stopPropagation(); for (let j = 0; j < video.textTracks.length; j++) video.textTracks[j].mode = 'hidden'; track.mode = 'showing'; captionsMenu.querySelectorAll('button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); toggleMenu(captionsMenu); };
                captionsMenu.appendChild(btn);
            }
        } else {
            captionsBtn.style.display = 'none';
        }
    }

    function toggleMenu(menu) {
        const isVisible = menu.style.display === 'block';
        audioMenu.style.display = 'none';
        captionsMenu.style.display = 'none';
        if (!isVisible) menu.style.display = 'block';
    }

    function showControlsTemporarily() {
        playerContainer.classList.add('controls-visible');
        playerContainer.classList.remove('cursor-hidden'); // Always show cursor on mouse move
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            if (!video.paused) {
                playerContainer.classList.remove('controls-visible');
                playerContainer.classList.add('cursor-hidden'); // Hide cursor after timeout
            }
        }, 3000);
    }

    function handleKeyboardShortcuts(e) {
        if (!videoModalOverlay.classList.contains('show')) return;
        const tagName = document.activeElement.tagName.toLowerCase();
        if (tagName === "input") return;

        switch (e.key.toLowerCase()) {
            case "escape": close(); break;
            case " ": if (tagName !== "button") { e.preventDefault(); togglePlay(); } break;
            case "f": toggleFullscreen(); break;
            case "m": toggleMute(); break;
            case "arrowright": video.currentTime = Math.min(video.duration, video.currentTime + 5); break;
            case "arrowleft": video.currentTime = Math.max(0, video.currentTime - 5); break;
        }
    }

    // --- PUBLIC INTERFACE ---
    function open(videoBlob, fileName) {
        if (currentVideoUrl) { URL.revokeObjectURL(currentVideoUrl); }
        currentVideoUrl = URL.createObjectURL(videoBlob);
        currentFileName = fileName;
        video.src = currentVideoUrl;
        video.load();

        videoModalOverlay.style.display = 'flex';
        setTimeout(() => videoModalOverlay.classList.add('show'), 10);

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyboardShortcuts);
    }

    function close() {
        if (document.fullscreenElement) { document.exitFullscreen(); }
        video.pause();

        videoModalOverlay.classList.remove('show');
        setTimeout(() => {
            videoModalOverlay.style.display = 'none';
            if (currentVideoUrl) {
                URL.revokeObjectURL(currentVideoUrl);
                currentVideoUrl = null;
                currentFileName = '';
                video.removeAttribute('src');
                video.load();
                // Reset aspect ratio to default for the next video
                playerContainer.style.aspectRatio = '16 / 9';
            }
        }, 300); // Match CSS transition duration

        document.body.style.overflow = '';
        document.removeEventListener('keydown', handleKeyboardShortcuts);
    }

    // Initialize the component
    bindEvents();

    // Expose public methods
    return { open, close };
})();