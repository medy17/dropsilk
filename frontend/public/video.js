// --- NEW FILE: video.js ---
// This is a self-contained video player component.

window.videoPlayer = (() => {
    // --- PRIVATE VARIABLES ---
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

    // --- PRIVATE FUNCTIONS ---
    function bindEvents() {
        closeBtn.addEventListener('click', close);
        videoModalOverlay.addEventListener('click', (e) => {
            if (e.target === videoModalOverlay) close();
        });
        playPauseBtn.addEventListener('click', togglePlay);
        video.addEventListener('click', togglePlay);
        video.addEventListener('dblclick', toggleFullscreen);
        video.addEventListener('play', () => playerContainer.classList.remove('paused'));
        video.addEventListener('pause', () => playerContainer.classList.add('paused'));
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
        playerContainer.addEventListener('mouseleave', () => clearTimeout(controlsTimeout));
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
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            if (!video.paused) playerContainer.classList.remove('controls-visible');
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