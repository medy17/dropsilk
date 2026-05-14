// electron/main.js

const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

const readSessions = new Map();
let nextReadSessionId = 1;

if (process.platform === 'linux' && process.env.VITE_DEV_SERVER_URL) {
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-setuid-sandbox');
}

// --- NEW AND IMPORTANT ---
// Register our 'app' protocol as a privileged scheme.
// This allows it to use APIs like fetch, localStorage, service workers, etc.
// This MUST be called before the app's 'ready' event.
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            standard: true,      // Required for fetch, localStorage, etc.
            secure: true,        // Treat it as a secure protocol (like https)
            corsEnabled: true,   // Allow it to make CORS requests
            supportFetchAPI: true, // Explicitly enable fetch API support
        },
    },
]);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
        },
    });

    // Disable the default menu bar
    mainWindow.setMenu(null);

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadURL('app://./index.html');
    }
};

async function createFileDescriptor(filePath, nameOverride = null) {
    const stats = await fsPromises.stat(filePath);
    return {
        name: nameOverride || path.basename(filePath),
        path: filePath,
        size: stats.size,
        lastModified: stats.mtimeMs,
    };
}

async function closeReadSession(sessionId) {
    const fileHandle = readSessions.get(sessionId);
    if (!fileHandle) {
        return false;
    }

    readSessions.delete(sessionId);

    try {
        await fileHandle.close();
    } catch (error) {
        console.error(`Failed to close read session ${sessionId}:`, error);
    }

    return true;
}

async function closeAllReadSessions() {
    const sessionIds = Array.from(readSessions.keys());
    await Promise.all(sessionIds.map((sessionId) => closeReadSession(sessionId)));
}

app.whenReady().then(() => {
    // Register the file protocol handler now that the app is ready.
    protocol.registerFileProtocol('app', (request, callback) => {
        const url = request.url.substring(6);
        callback({ path: path.join(__dirname, '../dist', url) });
    });

    // --- IPC Handlers (Unchanged) ---
    ipcMain.handle('dialog:openFile', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
        });
        if (canceled || filePaths.length === 0) {
            return [];
        }
        return Promise.all(filePaths.map((filePath) => createFileDescriptor(filePath)));
    });

    ipcMain.handle('dialog:openDirectory', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openDirectory', 'multiSelections'],
        });
        if (canceled || filePaths.length === 0) {
            return [];
        }
        const allFiles = [];
        for (const dirPath of filePaths) {
            try {
                const filesInDir = await fsPromises.readdir(dirPath, { withFileTypes: true });
                for (const file of filesInDir) {
                    if (file.isFile()) {
                        const filePath = path.join(dirPath, file.name);
                        allFiles.push(await createFileDescriptor(filePath, file.name));
                    }
                }
            } catch (err) {
                console.error(`Error reading directory ${dirPath}:`, err);
            }
        }
        return allFiles;
    });

    ipcMain.handle('file:startReadSession', async (_event, filePath) => {
        if (typeof filePath !== 'string' || filePath.length === 0) {
            throw new Error('A valid file path is required.');
        }

        const fileHandle = await fsPromises.open(filePath, 'r');
        const sessionId = String(nextReadSessionId++);
        readSessions.set(sessionId, fileHandle);
        return sessionId;
    });

    ipcMain.handle('file:readChunk', async (_event, options = {}) => {
        const { sessionId, offset, length } = options;
        const fileHandle = readSessions.get(sessionId);

        if (!fileHandle) {
            throw new Error(`No active read session for ${sessionId}.`);
        }

        const chunkLength = Math.max(0, Number(length) || 0);
        const chunkOffset = Math.max(0, Number(offset) || 0);

        if (chunkLength === 0) {
            return new Uint8Array();
        }

        const buffer = Buffer.allocUnsafe(chunkLength);
        const { bytesRead } = await fileHandle.read(
            buffer,
            0,
            chunkLength,
            chunkOffset,
        );

        return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
    });

    ipcMain.handle('file:closeReadSession', async (_event, sessionId) =>
        closeReadSession(sessionId)
    );

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        closeAllReadSessions().catch((error) => {
            console.error('Failed to close read sessions during shutdown:', error);
        });
        app.quit();
    }
});

app.on('before-quit', () => {
    closeAllReadSessions().catch((error) => {
        console.error('Failed to close read sessions before quit:', error);
    });
});
