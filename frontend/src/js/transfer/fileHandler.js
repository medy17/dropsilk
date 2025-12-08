// transfer/fileHandler.js
// Thin orchestration layer for file transfers
// All actual logic is in specialized modules

// Re-export sender functions
export {
    ensureQueueIsActive,
    cancelFileSend,
    drainQueue,
    resetSenderState,
} from './fileSender.js';

// Re-export receiver functions
export {
    handleDataChannelMessage,
    resetReceiverState,
} from './fileReceiver.js';

// Re-export queue management functions
export {
    handleFileSelection,
    handleFolderSelection,
    setupQueueDragDrop,
} from './queueManager.js';

// Re-export OPFS functions
export {
    clearOpfsStorage,
} from './opfsHandler.js';

// Combined reset function
import { resetSenderState } from './fileSender.js';
import { resetReceiverState } from './fileReceiver.js';
import { clearOpfsStorage } from './opfsHandler.js';

/**
 * Resets all transfer state (both sending and receiving)
 */
export function resetTransferState() {
    resetSenderState();
    resetReceiverState();
    clearOpfsStorage();
}