const { spawn } = require('child_process');

const electronBinary = require('electron');

const args = ['.'];
const env = { ...process.env };

if (process.platform === 'linux' && !env.ELECTRON_DISABLE_SANDBOX) {
    // Local dev installs typically don't have a root-owned setuid sandbox helper.
    // Disable it for development launches only; packaged apps are unaffected.
    env.ELECTRON_DISABLE_SANDBOX = '1';
}

const child = spawn(electronBinary, args, {
    stdio: 'inherit',
    env,
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 0);
});

child.on('error', (error) => {
    console.error('Failed to launch Electron:', error);
    process.exit(1);
});
