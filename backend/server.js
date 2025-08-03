// --- Node.js Built-in Modules ---
const WebSocket = require("ws");
const os = require("os");
const http = require("http");
const querystring = require('querystring'); // For parsing POST request bodies
const fs = require('fs'); // For reading HTML files (like wp-login.html)
const path = require('path');

// --- Third-party Modules ---
const geoip = require('geoip-lite'); // For GeoIP lookup
const he = require('he'); // For HTML entity encoding

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

// --- Honeypot Data Store (in-memory, resets on server restart) ---
const honeypotData = {};
let honeypotRankCounter = 1; // Used for simple ranking in the leaderboard

// --- Server-wide Statistics ---
const connectionStats = {
    totalConnections: 0,
    totalDisconnections: 0,
    totalFlightsCreated: 0,
    totalFlightsJoined: 0,
    startTime: Date.now()
};

// --- Logging Utility ---
function log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`);
}

// --- HTTP Server Creation ---
const server = http.createServer((req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const clientIp = getClientIp(req); // <-- **FIX 1**: Use the correct IP helper function

        // --- HONEYPOT: Routing for fake WordPress endpoints ---
        if (req.method === 'GET' && (
            url.pathname === '/wp-admin/setup-config.php' ||
            url.pathname === '/wordpress/wp-admin/setup-config.php' ||
            url.pathname === '/wp-login.php'
        )) {
            log('warn', 'HONEYPOT: Serving fake WP login page', { ip: clientIp, path: url.pathname });
            const filePath = path.join(__dirname, 'wp-login.html');
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    log('error', 'HONEYPOT: Error reading wp-login.html', { error: err.message, path: filePath });
                    res.writeHead(500);
                    res.end('Error loading honeypot login page.');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(data);
            });
            return;
        }

        // --- HONEYPOT: Handling POST requests to the fake login endpoint ---
        if (req.method === 'POST' && url.pathname === '/wp-login.php') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const formData = querystring.parse(body);
                // The 'clientIp' variable is already correctly assigned above
                const geo = geoip.lookup(clientIp);
                const username = formData.log || 'N/A';
                const password = formData.pwd || 'N/A';
                const countryCode = geo ? geo.country : 'N/A';

                log('error', 'HONEYPOT: Bot caught!', { ip: clientIp, username, password, country: countryCode });

                if (!honeypotData[clientIp]) {
                    honeypotData[clientIp] = {
                        rank: honeypotRankCounter++,
                        attempts: 0,
                        topUser: '',
                        topPass: '',
                        topPassLength: 0,
                        country: countryCode,
                        flag: getFlagEmoji(countryCode),
                        firstSeen: new Date().toISOString(),
                        lastSeen: new Date().toISOString()
                    };
                }

                honeypotData[clientIp].attempts++;
                honeypotData[clientIp].lastSeen = new Date().toISOString();
                if (password.length > honeypotData[clientIp].topPassLength) {
                    honeypotData[clientIp].topUser = username;
                    honeypotData[clientIp].topPass = password;
                    honeypotData[clientIp].topPassLength = password.length;
                }

                res.writeHead(302, { 'Location': '/honeypot-leaderboard' });
                res.end();
            });
            return;
        }

        // --- HONEYPOT: Serve the leaderboard page ---
        if (req.method === 'GET' && url.pathname === '/honeypot-leaderboard') {
            log('info', 'HONEYPOT: Serving leaderboard', { ip: clientIp });
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(generateLeaderboardHtml()); // This now generates the responsive HTML
            return;
        }


        // --- Standard Server Routes ---
        if (req.method === 'GET' && req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Server is alive and waiting for WebSocket connections.');
            log('info', 'Health check accessed', { ip: clientIp });
        } else if (req.method === 'GET' && req.url === '/stats') {
            const stats = {
                activeConnections: clients.size,
                activeFlights: Object.keys(flights).length,
                honeypotVictims: Object.keys(honeypotData).length,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(stats, null, 2));
            log('info', 'Stats endpoint accessed', { stats });
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    } catch (error) {
        log('error', 'HTTP server error in request handler', { error: error.message, stack: error.stack, url: req.url });
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
});

// --- HTTP Server Error Handling ---
server.on('error', (error) => {
    log('error', 'HTTP server critical error', { error: error.message, code: error.code });
    if (error.code === 'EADDRINUSE') {
        log('error', `Port ${PORT} is already in use`);
        process.exit(1);
    }
});

// --- IP Helper Functions ---
function getClientIp(req) {
    // **NEW FUNCTION**: Get IP from the X-Forwarded-For header (if behind a proxy)
    // or fall back to the direct connection IP. This is crucial for deployed apps.
    const rawIp = req.headers['x-forwarded-for']?.split(',').shift() || req.socket.remoteAddress;
    return getCleanIPv4(rawIp);
}

function getCleanIPv4(ip) {
    if (!ip || typeof ip !== 'string') {
        log('warn', 'Invalid IP address received for cleaning', { ip });
        return 'unknown';
    }
    if (ip.startsWith('::ffff:')) {
        return ip.substring(7); // Remove IPv6 prefix for IPv4-mapped addresses
    }
    if (ip === '::1') {
        return '127.0.0.1'; // Loopback for IPv6
    }
    return ip;
}

function isPrivateIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    return ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
}

function isCgnatIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    return ip.startsWith('100.') && ip.match(/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./);
}

function getLocalIpForDisplay() {
    try {
        const nets = os.networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === "IPv4" && !net.internal) {
                    return net.address;
                }
            }
        }
        return "localhost";
    } catch (error) {
        log('error', 'Error getting local IP for display', { error: error.message });
        return "localhost";
    }
}

// --- HONEYPOT: Helper functions for leaderboard HTML generation ---
function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '❓';
    const codePoints = countryCode.toUpperCase().split('').map(char => 0x1F1E6 + (char.charCodeAt(0) - 'A'.charCodeAt(0)));
    return String.fromCodePoint(...codePoints);
}


// --- **FIX 2: RESPONSIVE LEADERBOARD HTML GENERATION** ---
function generateLeaderboardHtml() {
    // Sort IPs by attempts in descending order
    const sortedIps = Object.keys(honeypotData).sort((a, b) => honeypotData[b].attempts - honeypotData[a].attempts);

    let tableRows = '';
    if (sortedIps.length === 0) {
        tableRows = '<tr><td colspan="6" style="text-align: center; color: #888;">It\'s quiet... too quiet. No bots caught yet.</td></tr>';
    } else {
        sortedIps.forEach((ip, index) => {
            const data = honeypotData[ip];
            const maskedIp = ip.split('.').slice(0, 2).join('.') + '.***.***';

            // The <span> wrapper is correct and stays.
            tableRows += `
                <tr>
                    <td data-label="Rank"><span>${index + 1}</span></td>
                    <td data-label="IP Address"><span>${maskedIp}</span></td>
                    <td data-label="Attempts"><span>${data.attempts}</span></td>
                    <td data-label="Top Username"><span>${he.encode(String(data.topUser))}</span></td>
                    <td data-label="Top Password" class="pass-cell"><span>${he.encode(String(data.topPass))}</span></td>
                    <td data-label="Country"><span>${data.flag} ${he.encode(String(data.country))}</span></td>
                </tr>
            `;
        });
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Honeypot - Hall of Shame</title>
        <style>
            /* --- Base & Desktop Styles (Unchanged) --- */
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #121212; color: #e0e0e0; margin: 0; padding: 2em; }
            .container { max-width: 1000px; margin: 0 auto; background-color: #1e1e1e; border-radius: 8px; padding: 2em; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
            h1 { color: #bb86fc; text-align: center; border-bottom: 2px solid #bb86fc; padding-bottom: 0.5em; margin-bottom: 1.5em; }
            table { width: 100%; border-collapse: collapse; margin-top: 2em; }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #333; }
            th { background-color: #333; color: #bb86fc; font-weight: 600; }
            tr:nth-child(even) { background-color: #242424; }
            tr:hover { background-color: #4a4a4a; }
            .pass-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; }
            
            /* --- **FIXED** Responsive Styles for Mobile (< 768px) --- */
            @media screen and (max-width: 768px) {
                body { padding: 1em; }
                .container { padding: 1.5em 1em; }
                
                table thead { display: none; }
                table, tbody, tr, td { display: block; width: 100%; }
            
                tr {
                    margin-bottom: 1.5em;
                    border: 1px solid #333;
                    border-radius: 5px;
                    background-color: #242424;
                    overflow: hidden;
                }
                
                td {
                    display: flex;
                    align-items: center;
                    padding: 12px 15px;
                    border-bottom: 1px dotted #444;
                    gap: 1em; /* ADDED: Consistent spacing between label and value */
                }
                
                td:last-child { border-bottom: none; }
            
                td::before {
                    content: attr(data-label);
                    font-weight: bold;
                    color: #bb86fc;
                    flex-shrink: 0; /* Prevents the label from shrinking */
                    min-width: 120px; /* ADDED: Consistent width for labels */
                }
                
                /* FIXED: Better value container styling */
                td span {
                    flex-grow: 1;
                    min-width: 0; /* Allows shrinking */
                    text-align: left; /* CHANGED: From right to left alignment */
                    word-break: break-word; /* CHANGED: From break-all to break-word for better readability */
                    padding-right: 8px; /* ADDED: Small right padding to prevent edge touching */
                    overflow-wrap: break-word; /* ADDED: Better word wrapping */
                }
            
                .pass-cell { align-items: flex-start; }
                .pass-cell span { 
                    font-family: monospace; 
                    color: #ccc; 
                    font-size: 0.9em; /* ADDED: Slightly smaller font for long passwords */
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>WordPress Sisyphus Crew - Leaderboard of Idiots</h1>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>IP Address</th>
                        <th>Attempts</th>
                        <th>Top Username</th>
                        <th>Top Password</th>
                        <th>Country</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    </body>
    </html>`;
}


// --- WebRTC Signaling Server Logic (Existing) ---
const flights = {};
const clients = new Map();

const allowedOrigins = new Set([
    'https://dropsilk.xyz',
    'https://www.dropsilk.xyz',
    'https://dropsilk.vercel.app',
    'http://192.168.1.10:3000',
]);

function verifyClient(info, done) {
    const origin = info.req.headers.origin;

    if (NODE_ENV === 'production') {
        if (allowedOrigins.has(origin)) {
            log('debug', 'Client origin approved (production)', { origin });
            done(true);
        } else {
            log('warn', 'Client connection rejected due to invalid origin (production)', { origin });
            done(false, 403, 'Forbidden: Invalid Origin');
        }
        return;
    }

    log('info', 'Verifying new client connection (development)', { origin });

    if (allowedOrigins.has(origin) || (origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) || !origin) {
        log('debug', 'Client origin approved (dev mode)', { origin });
        done(true);
    } else {
        log('warn', 'Client connection rejected due to invalid origin (development)', { origin });
        done(false, 403, 'Forbidden: Invalid Origin');
    }
}

const wss = new WebSocket.Server({
    server,
    verifyClient,
    perMessageDeflate: false,
    maxPayload: 1024 * 1024,
    clientTracking: true
});

wss.on('error', (error) => {
    log('error', 'WebSocket server error', { error: error.message, stack: error.stack });
});

wss.on("connection", (ws, req) => {
    let clientId, metadata;

    try {
        clientId = Math.random().toString(36).substr(2, 9);
        const cleanRemoteIp = getClientIp(req); // Use the correct IP helper here too
        const userAgent = req.headers['user-agent'] || 'unknown';

        metadata = {
            id: clientId,
            name: "Anonymous",
            flightCode: null,
            remoteIp: cleanRemoteIp,
            connectedAt: new Date().toISOString(),
            userAgent: userAgent
        };

        clients.set(ws, metadata);
        connectionStats.totalConnections++;

        log('info', 'Client connected', { clientId, ip: cleanRemoteIp, userAgent, totalClients: clients.size, totalConnections: connectionStats.totalConnections });

        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        ws.send(JSON.stringify({ type: "registered", id: clientId }));
        broadcastUsersOnSameNetwork();

    } catch (error) {
        log('error', 'Error during client connection setup', { error: error.message, stack: error.stack, clientId: clientId || 'unknown' });
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1011, 'Server error during connection setup');
        }
        return;
    }

    ws.on("message", (message) => {
        let data;
        const meta = clients.get(ws);

        if (!meta) {
            log('warn', 'Received message from unregistered client', { messagePreview: message.toString().substring(0, 100) });
            return;
        }

        try {
            if (message.length > 1024 * 1024) {
                log('warn', 'Message too large', { clientId: meta.id, size: message.length });
                ws.send(JSON.stringify({ type: "error", message: "Message too large" }));
                return;
            }
            data = JSON.parse(message);
            if (!data.type) {
                log('warn', 'Message missing type field', { clientId: meta.id, messagePreview: message.toString().substring(0, 100) });
                return;
            }
            log('debug', 'Message received', { clientId: meta.id, type: data.type, messageSize: message.length });
        } catch (error) {
            log('error', 'Error parsing message JSON', { clientId: meta.id, error: error.message, messagePreview: message.toString().substring(0, 100) });
            ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
            return;
        }

        try {
            switch (data.type) {
                case "register-details":
                    if (!data.name || typeof data.name !== 'string' || data.name.length > 50 || data.name.trim().length === 0) {
                        log('warn', 'Invalid name in registration', { clientId: meta.id, name: data.name });
                        ws.send(JSON.stringify({ type: "error", message: "Invalid name" }));
                        return;
                    }
                    meta.name = data.name.trim();
                    clients.set(ws, meta);
                    log('info', 'Client registered details', { clientId: meta.id, newName: meta.name, ip: meta.remoteIp });
                    broadcastUsersOnSameNetwork();
                    break;
                case "create-flight":
                    if (meta.flightCode) {
                        ws.send(JSON.stringify({ type: "error", message: "Already in a flight" }));
                        return;
                    }
                    const flightCode = Math.random().toString(36).substr(2, 6).toUpperCase();
                    flights[flightCode] = [ws];
                    meta.flightCode = flightCode;
                    connectionStats.totalFlightsCreated++;
                    log('info', 'Flight created', { flightCode, creatorId: meta.id });
                    ws.send(JSON.stringify({ type: "flight-created", flightCode }));
                    broadcastUsersOnSameNetwork();
                    break;
                case "join-flight":
                    if (!data.flightCode || typeof data.flightCode !== 'string' || data.flightCode.length !== 6) {
                        ws.send(JSON.stringify({ type: "error", message: "Invalid flight code" }));
                        return;
                    }
                    if (meta.flightCode) {
                        ws.send(JSON.stringify({ type: "error", message: "Already in a flight" }));
                        return;
                    }
                    const flight = flights[data.flightCode];
                    if (!flight || flight.length >= 2) {
                        ws.send(JSON.stringify({ type: "error", message: "Flight not found or full" }));
                        return;
                    }
                    const creatorWs = flight[0];
                    const creatorMeta = clients.get(creatorWs);
                    if (!creatorMeta || creatorWs.readyState !== WebSocket.OPEN) {
                        delete flights[data.flightCode];
                        ws.send(JSON.stringify({ type: "error", message: "Flight creator disconnected" }));
                        return;
                    }
                    let connectionType = 'wan';
                    if (isPrivateIP(creatorMeta.remoteIp) && isPrivateIP(meta.remoteIp) && creatorMeta.remoteIp.split('.').slice(0, 3).join('.') === meta.remoteIp.split('.').slice(0, 3).join('.')) {
                        connectionType = 'lan';
                    } else if (creatorMeta.remoteIp === meta.remoteIp) {
                        connectionType = 'lan';
                    }
                    flight.push(ws);
                    meta.flightCode = data.flightCode;
                    connectionStats.totalFlightsJoined++;
                    log('info', 'Flight joined', { flightCode: data.flightCode, joinerId: meta.id, connectionType: connectionType.toUpperCase() });
                    ws.send(JSON.stringify({ type: "peer-joined", flightCode: data.flightCode, connectionType, peer: { id: creatorMeta.id, name: creatorMeta.name } }));
                    creatorWs.send(JSON.stringify({ type: "peer-joined", flightCode: data.flightCode, connectionType, peer: { id: meta.id, name: meta.name } }));
                    broadcastUsersOnSameNetwork();
                    break;
                case "invite-to-flight":
                    if (!data.inviteeId || !data.flightCode) return;
                    for (const [clientWs, clientMeta] of clients.entries()) {
                        if (clientMeta.id === data.inviteeId && clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({ type: "flight-invitation", flightCode: data.flightCode, fromName: meta.name, }));
                            break;
                        }
                    }
                    break;
                case "signal":
                    if (!meta.flightCode || !flights[meta.flightCode]) return;
                    flights[meta.flightCode].forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: "signal", data: data.data }));
                        }
                    });
                    break;
                default:
                    ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
            }
        } catch (error) {
            log('error', 'Error processing WebSocket message in switch', { clientId: meta.id, messageType: data?.type, error: error.message, stack: error.stack });
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "error", message: "Server error processing your request" }));
            }
        }
    });

    ws.on("close", (code, reason) => {
        const meta = clients.get(ws);
        clients.delete(ws);
        connectionStats.totalDisconnections++;
        if (meta) {
            log('info', 'Client disconnected', { clientId: meta.id, clientName: meta.name, flightCode: meta.flightCode, remainingClients: clients.size });
            if (meta.flightCode && flights[meta.flightCode]) {
                const flight = flights[meta.flightCode];
                const remainingClients = flight.filter((c) => c !== ws);
                flights[meta.flightCode] = remainingClients;
                remainingClients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "peer-left" }));
                });
                if (remainingClients.length === 0) {
                    delete flights[meta.flightCode];
                    log('info', 'Flight closed', { flightCode: meta.flightCode });
                }
            }
        }
        broadcastUsersOnSameNetwork();
    });

    ws.on("error", (error) => {
        const meta = clients.get(ws);
        log('error', 'WebSocket connection error', { clientId: meta?.id || 'unknown', error: error.message });
    });
});


// --- ENHANCED BROADCASTING LOGIC ---
function broadcastUsersOnSameNetwork() {
    try {
        const clientsByNetworkGroup = {};
        for (const [ws, meta] of clients.entries()) {
            if (!meta || ws.readyState !== WebSocket.OPEN) continue;
            if (meta.flightCode && flights[meta.flightCode] && flights[meta.flightCode].length === 2) continue;
            let groupingKey = isPrivateIP(meta.remoteIp) ? meta.remoteIp.split('.').slice(0, 3).join('.') : meta.remoteIp;
            if (!clientsByNetworkGroup[groupingKey]) clientsByNetworkGroup[groupingKey] = [];
            clientsByNetworkGroup[groupingKey].push({ id: meta.id, name: meta.name });
        }
        for (const [ws, meta] of clients.entries()) {
            if (!meta || ws.readyState !== WebSocket.OPEN) continue;
            try {
                if (meta.flightCode && flights[meta.flightCode] && flights[meta.flightCode].length === 2) {
                    ws.send(JSON.stringify({ type: "users-on-network-update", users: [] }));
                    continue;
                }
                let groupingKey = isPrivateIP(meta.remoteIp) ? meta.remoteIp.split('.').slice(0, 3).join('.') : meta.remoteIp;
                const usersOnNetwork = clientsByNetworkGroup[groupingKey] ? clientsByNetworkGroup[groupingKey].filter((c) => c.id !== meta.id) : [];
                ws.send(JSON.stringify({ type: "users-on-network-update", users: usersOnNetwork }));
            } catch (error) {
                log('error', 'Error sending network update to client', { clientId: meta.id, error: error.message });
            }
        }
    } catch (error) {
        log('error', 'Critical error in broadcastUsersOnSameNetwork', { error: error.message, stack: error.stack });
    }
}


// --- Production Health Monitoring (Ping/Pong and Stats Logging) ---
const healthInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            const meta = clients.get(ws);
            log('warn', 'Terminating dead connection (no pong received)', { clientId: meta?.id });
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
    if (clients.size > 0 || Object.keys(flights).length > 0) {
        log('info', 'Health check completed', { activeConnections: clients.size, activeFlights: Object.keys(flights).length, honeypotVictims: Object.keys(honeypotData).length });
    }
}, 30000);

// --- Graceful Shutdown Handling ---
function gracefulShutdown() {
    log('info', 'Initiating graceful shutdown...');
    clearInterval(healthInterval);
    wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "server-shutdown", message: "Server is shutting down for maintenance." }));
            ws.close(1001, 'Server shutdown');
        }
    });
    server.close(() => {
        log('info', 'HTTP server and WebSocket server closed.');
        process.exit(0);
    });
    setTimeout(() => {
        log('warn', 'Forcing shutdown after timeout due to unresponsive connections.');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('uncaughtException', (error) => {
    log('error', 'UNCAUGHT EXCEPTION!', { error: error.message, stack: error.stack });
    gracefulShutdown();
});
process.on('unhandledRejection', (reason, promise) => {
    log('error', 'UNHANDLED REJECTION!', { reason: reason?.toString() || 'unknown' });
});

// --- Server Startup ---
server.listen(PORT, '0.0.0.0', () => {
    log('info', `🚀 Signalling Server started`, { port: PORT, environment: NODE_ENV, localIp: getLocalIpForDisplay(), healthCheck: `http://localhost:${PORT}` });
});