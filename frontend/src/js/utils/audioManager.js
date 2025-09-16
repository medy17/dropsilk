// --- js/utils/audioManager.js ---

/**
 * Manages all audio and haptic feedback for the application.
 * Ensures feedback is appropriate for the device and can be globally toggled.
 */
export const audioManager = (() => {
    // Default to sounds being on, but respect the user's saved preference.
    let isEnabled = localStorage.getItem('dropsilk-sounds-enabled') !== 'false';

    const sounds = {
        connect: new Audio('/sounds/connect.mp3'),
        disconnect: new Audio('/sounds/disconnect.mp3'),
        invite: new Audio('/sounds/invite.mp3'),
        queue_start: new Audio('/sounds/queue_start.mp3'),
        send_complete: new Audio('/sounds/send_complete.mp3'),
        receive_complete: new Audio('/sounds/receive_complete.mp3'),
        error: new Audio('/sounds/error.mp3'),
        // The 'click' sound is no longer used by the copy action, but we can keep it for potential future use.
        click: new Audio('/sounds/queue_start.mp3'),
    };

    // Set a universal, non-jarring volume for all sounds.
    Object.values(sounds).forEach(sound => {
        sound.volume = 0.6;
        sound.load(); // Pre-load the audio files for faster playback
    });

    /**
     * Plays a sound by its key name.
     * @param {string} soundName - The key of the sound to play (e.g., 'connect').
     */
    const play = (soundName) => {
        if (!isEnabled || !sounds[soundName]) return;

        const sound = sounds[soundName];
        sound.currentTime = 0; // Rewind to start to allow for rapid re-playing
        sound.play().catch(e => console.warn(`Audio play failed for "${soundName}":`, e));
    };

    /**
     * --- REVISED FUNCTION ---
     * Provides haptic feedback if the browser supports it. Does nothing otherwise.
     * @param {number} vibrationMs - The duration of the vibration in milliseconds.
     */
    const vibrate = (vibrationMs = 50) => {
        if (!isEnabled) return;

        // Check for the existence of the vibrate function and use it if available.
        if (navigator.vibrate) {
            navigator.vibrate(vibrationMs);
        }
        // No 'else' block. No sound fallback.
    };

    // These can be hooked up to a UI toggle button in the future.
    const enable = () => { isEnabled = true; localStorage.setItem('dropsilk-sounds-enabled', 'true'); };
    const disable = () => { isEnabled = false; localStorage.setItem('dropsilk-sounds-enabled', 'false'); };

    return {
        play,
        vibrate, // Expose the new, more accurately named function
        enable,
        disable,
        isEnabled: () => isEnabled
    };
})();