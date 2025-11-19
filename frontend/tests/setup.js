// tests/setup.js
import { vi } from 'vitest';

// Corrected path: includes 'src'
vi.mock('../src/js/i18n.js', () => ({
    default: {
        t: (key, options) => {
            if(options && options.count) return `${key} ${options.count}`;
            return key;
        },
        changeLanguage: vi.fn(),
        on: vi.fn(),
        language: 'en'
    },
}));

// Mock Audio API
window.Audio = class {
    play() { return Promise.resolve(); }
    load() { }
};

// Mock LocalStorage
const localStorageMock = (function() {
    let store = {};
    return {
        getItem: function(key) { return store[key] || null; },
        setItem: function(key, value) { store[key] = value.toString(); },
        removeItem: function(key) { delete store[key]; },
        clear: function() { store = {}; }
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Basic DOM structure
document.body.innerHTML = `
  <div class="main-content"></div>
  <div id="userNameDisplay"></div>
  <button id="createFlightBtn"></button>
  <button id="joinFlightBtn"></button>
  <div class="flight-code-input-wrapper"></div>
  <div id="dashboard"></div>
  <div id="sending-queue"></div>
  <div id="receiver-queue"></div>
  <div class="drop-zone"><p></p><span class="secondary-text"></span><div class="drop-zone__buttons"><button class="btn-secondary"></button></div></div>
  <div id="toast-container"></div>
  <div id="connection-panel-list"></div>
  <h3 id="connection-panel-title"></h3>
  <div id="metrics-sent"></div>
  <div id="metrics-received"></div>
  <div id="metrics-speed"></div>
  <div id="dashboard-flight-status"></div>
`;