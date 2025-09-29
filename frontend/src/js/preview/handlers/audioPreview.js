// js/preview/handlers/audioPreview.js
// Renders audio files with a visual waveform using WaveSurfer.js.
import WaveSurfer from "wavesurfer.js";

let wavesurfer = null;

export async function cleanup() {
    if (wavesurfer) {
        wavesurfer.destroy();
        wavesurfer = null;
    }
}

export default async function renderAudioPreview(blob, contentElement) {
    // Clean up any previous instance
    await cleanup();

    const audioUrl = URL.createObjectURL(blob);
    contentElement.dataset.objectUrl = audioUrl;

    // Create the container for the player
    const playerContainer = document.createElement('div');
    playerContainer.className = 'audio-preview-container';

    // Create the waveform container
    const waveformContainer = document.createElement('div');
    waveformContainer.id = 'waveform';

    // Create controls
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'audio-controls';
    controlsContainer.innerHTML = `
        <button id="audio-play-pause-btn" class="audio-btn" title="Play/Pause">
             <svg class="play-icon" viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z" /></svg>
             <svg class="pause-icon" style="display: none;" viewBox="0 0 24 24"><path d="M14,19H18V5H14M6,19H10V5H6V19Z" /></svg>
        </button>
        <div class="audio-time">
            <span id="audio-current-time">0:00</span> / <span id="audio-total-time">0:00</span>
        </div>
        <button id="audio-mute-btn" class="audio-btn" title="Mute/Unmute">
            <svg class="unmuted-icon" viewBox="0 0 24 24"><path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z" /></svg>
            <svg class="muted-icon" style="display: none;" viewBox="0 0 24 24"><path d="M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.94 18.8,13.82 18.46,14.64L19.97,16.15C20.62,14.91 21,13.5 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,12.22 16.47,12.43 16.43,12.64L14,10.21V7.97C15.5,8.71 16.5,10.23 16.5,12Z" /></svg>
        </button>
    `;

    playerContainer.appendChild(waveformContainer);
    playerContainer.appendChild(controlsContainer);
    contentElement.appendChild(playerContainer);

    // Initialize WaveSurfer
    wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: 'rgba(245, 169, 184, 0.7)',
        progressColor: '#5bcefa',
        cursorColor: '#f5a9b8',
        barWidth: 3,
        barRadius: 3,
        barGap: 2,
        height: 120,
        url: audioUrl,
    });

    const playPauseBtn = document.getElementById('audio-play-pause-btn');
    const muteBtn = document.getElementById('audio-mute-btn');
    const currentTimeEl = document.getElementById('audio-current-time');
    const totalTimeEl = document.getElementById('audio-total-time');

    const formatTime = (time) => new Date(time * 1000).toISOString().substr(14, 5);

    wavesurfer.on('ready', () => {
        totalTimeEl.textContent = formatTime(wavesurfer.getDuration());
    });

    wavesurfer.on('audioprocess', () => {
        currentTimeEl.textContent = formatTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('play', () => {
        playPauseBtn.querySelector('.play-icon').style.display = 'none';
        playPauseBtn.querySelector('.pause-icon').style.display = 'block';
    });

    wavesurfer.on('pause', () => {
        playPauseBtn.querySelector('.play-icon').style.display = 'block';
        playPauseBtn.querySelector('.pause-icon').style.display = 'none';
    });

    playPauseBtn.onclick = () => wavesurfer.playPause();
    muteBtn.onclick = () => {
        wavesurfer.toggleMute();
        const isMuted = wavesurfer.getMuted();
        muteBtn.querySelector('.unmuted-icon').style.display = isMuted ? 'none' : 'block';
        muteBtn.querySelector('.muted-icon').style.display = isMuted ? 'block' : 'none';
    };
}