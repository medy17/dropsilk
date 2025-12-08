// features/chat/index.js
// Re-exports all chat-related functionality

export {
    initializeChatPanel,
    ensureChatVisibilityObserver,
    ensureChatNewMsgButton,
    initializeChatFullscreenToggle,
} from './chatPanel.js';

export {
    appendChatMessage,
    resetChatView,
    disableChat,
    enableChat,
} from './chatMessages.js';

export { setupChat } from './chatEvents.js';
