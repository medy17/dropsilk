// electron/main.js

const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

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
        return filePaths.map(filePath => ({
            name: path.basename(filePath),
            path: filePath,
            data: fs.readFileSync(filePath)
        }));
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
                const filesInDir = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const file of filesInDir) {
                    if (file.isFile()) {
                        const filePath = path.join(dirPath, file.name);
                        allFiles.push({
                            name: file.name,
                            path: filePath,
                            data: fs.readFileSync(filePath)
                        });
                    }
                }
            } catch (err) {
                console.error(`Error reading directory ${dirPath}:`, err);
            }
        }
        return allFiles;
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});