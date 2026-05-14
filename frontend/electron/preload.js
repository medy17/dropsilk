// electron/preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFiles: () => ipcRenderer.invoke('dialog:openFile'),
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    startReadSession: (filePath) => ipcRenderer.invoke('file:startReadSession', filePath),
    readFileChunk: (options) => ipcRenderer.invoke('file:readChunk', options),
    closeReadSession: (sessionId) => ipcRenderer.invoke('file:closeReadSession', sessionId),
});
