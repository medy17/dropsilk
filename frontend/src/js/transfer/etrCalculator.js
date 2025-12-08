// transfer/etrCalculator.js
// Estimated Time Remaining (ETR) calculator for file transfers

const SPEED_SAMPLE_COUNT = 10;

/**
 * Creates a new ETR calculator instance for tracking transfer speed
 * @returns {Object} ETR calculator with update and getETR methods
 */
export function createEtrCalculator() {
    let lastSpeedCalcTime = Date.now();
    let lastSpeedCalcOffset = 0;
    let speedSamples = [];

    return {
        /**
         * Updates the calculator with new progress
         * @param {number} currentOffset - Current bytes transferred
         * @returns {number|null} - Average speed in bytes/sec, or null if not enough data
         */
        update(currentOffset) {
            const now = Date.now();
            const elapsedSinceLastCalc = (now - lastSpeedCalcTime) / 1000;

            // Calculate speed every 500ms for stability
            if (elapsedSinceLastCalc > 0.5) {
                const bytesSinceLastCalc = currentOffset - lastSpeedCalcOffset;
                const currentSpeed = bytesSinceLastCalc / elapsedSinceLastCalc;

                if (isFinite(currentSpeed) && currentSpeed > 0) {
                    speedSamples.push(currentSpeed);
                    if (speedSamples.length > SPEED_SAMPLE_COUNT) {
                        speedSamples.shift();
                    }
                }

                lastSpeedCalcTime = now;
                lastSpeedCalcOffset = currentOffset;
            }

            if (speedSamples.length === 0) return null;
            return speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;
        },

        /**
         * Gets the ETR in seconds
         * @param {number} totalSize - Total file size in bytes
         * @param {number} currentOffset - Current bytes transferred
         * @returns {number|null} - Seconds remaining, or null if cannot calculate
         */
        getETR(totalSize, currentOffset) {
            const averageSpeed = this.getAverageSpeed();
            if (!averageSpeed || averageSpeed <= 0) return null;

            const bytesRemaining = totalSize - currentOffset;
            return bytesRemaining / averageSpeed;
        },

        /**
         * Gets the current average speed
         * @returns {number|null} - Average speed in bytes/sec
         */
        getAverageSpeed() {
            if (speedSamples.length === 0) return null;
            return speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;
        },

        /**
         * Resets the calculator for a new transfer
         */
        reset() {
            lastSpeedCalcTime = Date.now();
            lastSpeedCalcOffset = 0;
            speedSamples = [];
        }
    };
}

/**
 * Formats seconds into a human-readable time remaining string
 * @param {number} seconds - Seconds remaining
 * @returns {string} Formatted string like "~2m 30s" or "Almost done..."
 */
export function formatTimeRemaining(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '';

    if (seconds < 5) return 'Almost done...';
    if (seconds < 60) return `~${Math.round(seconds)}s`;
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
}
