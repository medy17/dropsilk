// --- Node.js Built-in Modules ---
const WebSocket = require("ws");
const os = require("os");
const http = require("http");
const querystring = require('querystring'); // For parsing POST request bodies
const fs = require('fs'); // For reading HTML files (like wp-login.html)
const path = require('path'); // <-- ADD THIS LINE

// --- Third-party Modules ---
const geoip = require('geoip-lite'); // For GeoIP lookup
const he = require('he'); // <-- ADD THIS LINE

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

        // --- HONEYPOT: Routing for fake WordPress endpoints ---
        if (req.method === 'GET' && (
            url.pathname === '/wp-admin/setup-config.php' ||
            url.pathname === '/wordpress/wp-admin/setup-config.php' ||
            url.pathname === '/wp-login.php' // Bots also directly GET this path
        )) {
            log('warn', 'HONEYPOT: Serving fake WP login page', { ip: getCleanIPv4(req.socket.remoteAddress), path: url.pathname });
            const filePath = path.join(__dirname, 'wp-login.html'); // <-- Define the correct, absolute path
            fs.readFile(filePath, 'utf8', (err, data) => {             // <-- Use the correct path here
                if (err) {
                    log('error', 'HONEYPOT: Error reading wp-login.html', { error: err.message, path: filePath });
                    res.writeHead(500);
                    res.end('Error loading honeypot login page.');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(data);
            });
            return; // Stop further processing of this request
        }

        // --- HONEYPOT: Handling POST requests to the fake login endpoint ---
        if (req.method === 'POST' && url.pathname === '/wp-login.php') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const formData = querystring.parse(body);
                const ip = getCleanIPv4(req.socket.remoteAddress);
                const geo = geoip.lookup(ip); // Get geo information from IP
                const username = formData.log || 'N/A';
                const password = formData.pwd || 'N/A';
                const countryCode = geo ? geo.country : 'N/A';

                log('error', 'HONEYPOT: Bot caught!', { ip, username, password, country: countryCode });

                if (!honeypotData[ip]) {
                    honeypotData[ip] = {
                        rank: honeypotRankCounter++, // Simple rank based on order of first seen
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

                honeypotData[ip].attempts++;
                honeypotData[ip].lastSeen = new Date().toISOString();
                // Store the longest password attempt, as it's often more interesting
                if (password.length > honeypotData[ip].topPassLength) {
                    honeypotData[ip].topUser = username;
                    honeypotData[ip].topPass = password;
                    honeypotData[ip].topPassLength = password.length;
                }

                // Redirect the bot to the leaderboard
                res.writeHead(302, { 'Location': '/honeypot-leaderboard' });
                res.end();
            });
            return; // Stop further processing
        }

        // --- HONEYPOT: Serve the leaderboard page ---
        if (req.method === 'GET' && url.pathname === '/honeypot-leaderboard') {
            log('info', 'HONEYPOT: Serving leaderboard', { ip: getCleanIPv4(req.socket.remoteAddress) });
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(generateLeaderboardHtml());
            return; // Stop further processing
        }
        // --- END HONEYPOT: Routing ---


        // --- Standard Server Routes ---
        if (req.method === 'GET' && req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Server is alive and waiting for WebSocket connections.');
            log('info', 'Health check accessed', { ip: req.socket.remoteAddress });
        } else if (req.method === 'GET' && req.url === '/stats') {
            // Production stats endpoint
            const stats = {
                activeConnections: clients.size,
                activeFlights: Object.keys(flights).length,
                honeypotVictims: Object.keys(honeypotData).length, // Add honeypot stats
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
function getCleanIPv4(ip) {
    if (!ip || typeof ip !== 'string') {
        log('warn', 'Invalid IP address received for cleaning', { ip });
        return 'unknown';
    }
    try {
        if (ip.startsWith('::ffff:')) {
            return ip.substring(7); // Remove IPv6 prefix for IPv4-mapped addresses
        }
        if (ip === '::1') {
            return '127.0.0.1'; // Loopback for IPv6
        }
        return ip;
    } catch (error) {
        log('error', 'Error processing IP address in getCleanIPv4', { ip, error: error.message });
        return 'unknown';
    }
}

function isPrivateIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    // RFC 1918 private IP ranges
    return ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
}

function isCgnatIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    // CGNAT range (RFC 6598) 100.64.0.0/10
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
    // Unicode for regional indicator symbol letters
    const codePoints = countryCode.toUpperCase().split('').map(char => 0x1F1E6 + (char.charCodeAt(0) - 'A'.charCodeAt(0)));
    return String.fromCodePoint(...codePoints);
}


function generateLeaderboardHtml() {
    // Sort IPs by attempts in descending order
    const sortedIps = Object.keys(honeypotData).sort((a, b) => honeypotData[b].attempts - honeypotData[a].attempts);

    let tableRows = '';
    if (sortedIps.length === 0) {
        tableRows = '<tr><td colspan="6" style="text-align: center; color: #888;">It\'s quiet... too quiet. No bots caught yet.</td></tr>';
    } else {
        sortedIps.forEach((ip, index) => {
            const data = honeypotData[ip];
            // Mask IP address for privacy, showing only the first two octets
            const maskedIp = ip.split('.').slice(0, 2).join('.') + '.***.***';
            tableRows += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${maskedIp}</td>
                    <td>${data.attempts}</td>
                    <td>${he.encode(String(data.topUser))}</td>
                    <td class="pass-cell">${he.encode(String(data.topPass))}</td>
                    <td>${data.flag} ${he.encode(String(data.country))}</td>
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
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #121212; color: #e0e0e0; margin: 0; padding: 2em; }
            .container { max-width: 1000px; margin: 0 auto; background-color: #1e1e1e; border-radius: 8px; padding: 2em; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
            h1 { color: #bb86fc; text-align: center; border-bottom: 2px solid #bb86fc; padding-bottom: 0.5em; margin-bottom: 1.5em; }
            table { width: 100%; border-collapse: collapse; margin-top: 2em; }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #333; }
            th { background-color: #333; color: #bb86fc; font-weight: 600; }
            tr:nth-child(even) { background-color: #242424; }
            tr:hover { background-color: #4a4a4a; }
            .pass-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; }
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
    </html>
    `;
}

// --- WebRTC Signaling Server Logic (Existing) ---
const flights = {}; // Manages active flights (peer groups)
const clients = new Map(); // Stores WebSocket client connections and their metadata

// --- Allowed Origins for WebSocket Connection (Security Measure) ---
const allowedOrigins = new Set([
    'https://dropsilk.xyz',
    'https://www.dropsilk.xyz',
    'https://dropsilk.vercel.app'
]);

/**
 * Verifies the client's origin before establishing a WebSocket connection.
 * This is a security measure to prevent Cross-Site WebSocket Hijacking.
 * @param {object} info - Information about the incoming request (req, origin, secure, etc.).
 * @param {function} done - Callback to accept or reject the connection (done(true) or done(false, code, reason)).
 */
function verifyClient(info, done) {
    const origin = info.req.headers.origin;

    // Strict production environment check
    if (NODE_ENV === 'production') {
        if (allowedOrigins.has(origin)) {
            log('debug', 'Client origin approved (production)', { origin });
            done(true);
        } else {
            log('warn', 'Client connection rejected due to invalid origin (production)', { origin });
            done(false, 403, 'Forbidden: Invalid Origin');
        }
        return; // Exit after handling production case
    }

    // --- Flexible development environment check ---
    log('info', 'Verifying new client connection (development)', { origin });

    // 1. Allow if the origin is one of the "production" domains (for local testing against deployed frontend)
    if (allowedOrigins.has(origin)) {
        log('debug', 'Client origin approved (dev mode, matched prod origin)', { origin });
        done(true);
        return;
    }

    // 2. Allow if origin is from a localhost or 127.0.0.1 URL on ANY port (for IDEs like WebStorm)
    if (origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
        log('debug', 'Client origin approved (dev mode, matched localhost pattern)', { origin });
        done(true);
        return;
    }

    // 3. Allow if there is NO origin header (e.g., opening file directly via file:// in browser)
    // This is common for local file-based testing.
    if (!origin) {
        log('debug', 'Client origin approved (dev mode, no origin header - likely file://)', { origin });
        done(true);
        return;
    }

    // 4. If none of the above conditions are met, reject the connection in development.
    log('warn', 'Client connection rejected due to invalid origin (development)', { origin });
    done(false, 403, 'Forbidden: Invalid Origin');
}

// --- WebSocket Server Initialization ---
const wss = new WebSocket.Server({
    server,
    verifyClient, // Integrate the origin verification function here
    perMessageDeflate: false, // Disable compression for better performance
    maxPayload: 1024 * 1024, // 1MB max payload limit per message
    clientTracking: true // Enable internal client tracking by `ws` library
});

// --- WebSocket Server Event Handling ---
wss.on('error', (error) => {
    log('error', 'WebSocket server error', { error: error.message, stack: error.stack });
});

wss.on("connection", (ws, req) => {
    let clientId, metadata;

    try {
        clientId = Math.random().toString(36).substr(2, 9); // Generate a unique ID for the client
        // Extract remote IP from x-forwarded-for (if behind a proxy) or socket
        const rawIp = req.headers['x-forwarded-for']?.split(',').shift() || req.socket.remoteAddress;
        const cleanRemoteIp = getCleanIPv4(rawIp);
        const userAgent = req.headers['user-agent'] || 'unknown';

        metadata = {
            id: clientId,
            name: "Anonymous", // Default name, updated by client later
            flightCode: null, // No flight assigned initially
            remoteIp: cleanRemoteIp,
            connectedAt: new Date().toISOString(),
            userAgent: userAgent
        };

        clients.set(ws, metadata);
        connectionStats.totalConnections++; // Increment connection counter

        log('info', 'Client connected', {
            clientId,
            ip: cleanRemoteIp,
            userAgent,
            totalClients: clients.size,
            totalConnections: connectionStats.totalConnections
        });

        // Keep-alive mechanism for WebSocket connections
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        // Send registration confirmation to the client
        ws.send(JSON.stringify({ type: "registered", id: clientId }));

        // Send initial list of users on the network (for direct invites)
        broadcastUsersOnSameNetwork();

    } catch (error) {
        log('error', 'Error during client connection setup', {
            error: error.message,
            stack: error.stack,
            clientId: clientId || 'unknown'
        });

        // Close connection if setup failed
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1011, 'Server error during connection setup');
        }
        return;
    }

    ws.on("message", (message) => {
        let data;
        const meta = clients.get(ws); // Get metadata for the current client

        if (!meta) {
            log('warn', 'Received message from unregistered client (no metadata)', { messagePreview: message.toString().substring(0, 100) });
            return;
        }

        try {
            // Validate message size to prevent abuse
            if (message.length > 1024 * 1024) { // 1MB limit
                log('warn', 'Message too large', { clientId: meta.id, size: message.length });
                ws.send(JSON.stringify({ type: "error", message: "Message too large" }));
                return;
            }

            data = JSON.parse(message); // Parse incoming JSON message

            if (!data.type) {
                log('warn', 'Message missing type field', { clientId: meta.id, messagePreview: message.toString().substring(0, 100) });
                return;
            }

            log('debug', 'Message received', {
                clientId: meta.id,
                type: data.type,
                messageSize: message.length
            });

        } catch (error) {
            log('error', 'Error parsing message JSON', {
                clientId: meta.id,
                error: error.message,
                messagePreview: message.toString().substring(0, 100)
            });
            ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
            return;
        }

        try {
            switch (data.type) {
                case "register-details":
                    // Validate incoming name
                    if (!data.name || typeof data.name !== 'string' || data.name.length > 50 || data.name.trim().length === 0) {
                        log('warn', 'Invalid name in registration', { clientId: meta.id, name: data.name });
                        ws.send(JSON.stringify({ type: "error", message: "Invalid name" }));
                        return;
                    }

                    const oldName = meta.name;
                    meta.name = data.name.trim(); // Update client's name
                    clients.set(ws, meta); // Update metadata in map

                    log('info', 'Client registered details', {
                        clientId: meta.id,
                        oldName,
                        newName: meta.name,
                        ip: meta.remoteIp
                    });

                    broadcastUsersOnSameNetwork(); // Notify others of updated client list
                    break;

                case "create-flight":
                    if (meta.flightCode) {
                        log('warn', 'Client already in flight trying to create new one', {
                            clientId: meta.id,
                            currentFlight: meta.flightCode
                        });
                        ws.send(JSON.stringify({ type: "error", message: "Already in a flight" }));
                        return;
                    }

                    const flightCode = Math.random().toString(36).substr(2, 6).toUpperCase(); // Generate 6-char code
                    flights[flightCode] = [ws]; // Create new flight with creator as first participant
                    meta.flightCode = flightCode; // Assign flight code to client's metadata
                    connectionStats.totalFlightsCreated++; // Increment stat

                    log('info', 'Flight created', {
                        flightCode,
                        creatorId: meta.id,
                        creatorName: meta.name,
                        creatorIp: meta.remoteIp,
                        totalFlights: Object.keys(flights).length,
                        totalFlightsCreated: connectionStats.totalFlightsCreated
                    });

                    ws.send(JSON.stringify({ type: "flight-created", flightCode })); // Confirm flight creation to client
                    broadcastUsersOnSameNetwork(); // Update network visibility
                    break;

                case "join-flight":
                    if (!data.flightCode || typeof data.flightCode !== 'string' || data.flightCode.length !== 6) {
                        log('warn', 'Invalid flight code in join request', {
                            clientId: meta.id,
                            flightCode: data.flightCode
                        });
                        ws.send(JSON.stringify({ type: "error", message: "Invalid flight code" }));
                        return;
                    }

                    if (meta.flightCode) {
                        log('warn', 'Client already in flight trying to join another', {
                            clientId: meta.id,
                            currentFlight: meta.flightCode,
                            requestedFlight: data.flightCode
                        });
                        ws.send(JSON.stringify({ type: "error", message: "Already in a flight" }));
                        return;
                    }

                    const flight = flights[data.flightCode];
                    if (!flight) {
                        log('warn', 'Flight not found', {
                            flightCode: data.flightCode,
                            joinerId: meta.id
                        });
                        ws.send(JSON.stringify({ type: "error", message: "Flight not found" }));
                        return;
                    }

                    if (flight.length >= 2) {
                        log('warn', 'Flight is full', {
                            flightCode: data.flightCode,
                            joinerId: meta.id,
                            currentSize: flight.length
                        });
                        ws.send(JSON.stringify({ type: "error", message: "Flight is full" }));
                        return;
                    }

                    const creatorWs = flight[0]; // Get the WebSocket of the flight creator
                    const creatorMeta = clients.get(creatorWs); // Get metadata of the creator

                    // Ensure creator is still connected and valid
                    if (!creatorMeta || creatorWs.readyState !== WebSocket.OPEN) {
                        log('error', 'Creator websocket invalid during join attempt, deleting flight', {
                            flightCode: data.flightCode,
                            joinerId: meta.id,
                            creatorId: creatorMeta?.id || 'unknown'
                        });
                        delete flights[data.flightCode]; // Clean up invalid flight
                        ws.send(JSON.stringify({ type: "error", message: "Flight creator disconnected" }));
                        return;
                    }

                    // Determine connection type (LAN vs. WAN) based on IP prefixes
                    let connectionType = 'wan';
                    const creatorIp = creatorMeta.remoteIp;
                    const joinerIp = meta.remoteIp;

                    if (isPrivateIP(creatorIp) && isPrivateIP(joinerIp)) {
                        const creatorSubnet = creatorIp.split('.').slice(0, 3).join('.');
                        const joinerSubnet = joinerIp.split('.').slice(0, 3).join('.');
                        if (creatorSubnet === joinerSubnet) {
                            connectionType = 'lan';
                        }
                    } else if (creatorIp === joinerIp) {
                        // Same public IP or loopback, implies LAN (e.g., behind same NAT, or localhost testing)
                        connectionType = 'lan';
                    }

                    flight.push(ws); // Add joiner to the flight
                    meta.flightCode = data.flightCode; // Assign flight code to joiner
                    connectionStats.totalFlightsJoined++; // Increment stat

                    log('info', 'Flight joined', {
                        flightCode: data.flightCode,
                        joinerId: meta.id,
                        joinerName: meta.name,
                        joinerIp: meta.remoteIp,
                        creatorId: creatorMeta.id,
                        creatorName: creatorMeta.name,
                        creatorIp: creatorMeta.remoteIp,
                        connectionType: connectionType.toUpperCase(),
                        totalFlightsJoined: connectionStats.totalFlightsJoined
                    });

                    // Send personalized "peer-joined" messages to both creator and joiner
                    const creatorPeerData = { id: creatorMeta.id, name: creatorMeta.name };
                    const joinerPeerData = { id: meta.id, name: meta.name };

                    ws.send(JSON.stringify({
                        type: "peer-joined",
                        flightCode: data.flightCode,
                        connectionType: connectionType,
                        peer: creatorPeerData // Joiner receives info about creator
                    }));

                    creatorWs.send(JSON.stringify({
                        type: "peer-joined",
                        flightCode: data.flightCode,
                        connectionType: connectionType,
                        peer: joinerPeerData // Creator receives info about joiner
                    }));

                    broadcastUsersOnSameNetwork(); // Update network visibility (flight is now full)
                    break;

                case "invite-to-flight":
                    // Validate invitation data
                    if (!data.inviteeId || typeof data.inviteeId !== 'string' || !data.flightCode || typeof data.flightCode !== 'string') {
                        log('warn', 'Invalid invitation data received', {
                            clientId: meta.id,
                            inviteeId: data.inviteeId,
                            flightCode: data.flightCode
                        });
                        return;
                    }

                    let invitationSent = false;
                    // Find the invitee's WebSocket connection
                    for (const [clientWs, clientMeta] of clients.entries()) {
                        if (clientMeta.id === data.inviteeId && clientWs.readyState === WebSocket.OPEN) {
                            log('info', 'Flight invitation sent', {
                                flightCode: data.flightCode,
                                inviterId: meta.id,
                                inviterName: meta.name,
                                inviteeId: clientMeta.id,
                                inviteeName: clientMeta.name
                            });

                            clientWs.send(JSON.stringify({
                                type: "flight-invitation",
                                flightCode: data.flightCode,
                                fromName: meta.name,
                            }));
                            invitationSent = true;
                            break;
                        }
                    }

                    if (!invitationSent) {
                        log('warn', 'Invitation target not found or not open', {
                            inviteeId: data.inviteeId,
                            inviterId: meta.id
                        });
                    }
                    break;

                case "signal":
                    if (!meta.flightCode) {
                        log('warn', 'Signal sent without associated flight', { clientId: meta.id });
                        return;
                    }

                    const targetFlight = flights[meta.flightCode];
                    if (!targetFlight) {
                        log('warn', 'Signal sent to non-existent flight', {
                            clientId: meta.id,
                            flightCode: meta.flightCode
                        });
                        return;
                    }

                    let signalsSent = 0;
                    // Relay the signal to all other clients in the same flight
                    targetFlight.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            try {
                                client.send(JSON.stringify({ type: "signal", data: data.data }));
                                signalsSent++;
                            } catch (error) {
                                log('error', 'Error sending signal to peer', {
                                    error: error.message,
                                    flightCode: meta.flightCode,
                                    recipientId: clients.get(client)?.id || 'unknown'
                                });
                            }
                        }
                    });

                    log('debug', 'WebRTC signal relayed', {
                        flightCode: meta.flightCode,
                        senderId: meta.id,
                        signalsSent
                    });
                    break;

                default:
                    log('warn', 'Unknown message type received', {
                        clientId: meta.id,
                        type: data.type
                    });
                    ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
            }
        } catch (error) {
            log('error', 'Error processing WebSocket message in switch', {
                clientId: meta.id,
                messageType: data?.type,
                error: error.message,
                stack: error.stack
            });

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "error", message: "Server error processing your request" }));
            }
        }
    });

    ws.on("close", (code, reason) => {
        const meta = clients.get(ws); // Get metadata before deleting
        clients.delete(ws); // Remove client from map
        connectionStats.totalDisconnections++; // Increment stat

        if (meta) {
            log('info', 'Client disconnected', {
                clientId: meta.id,
                clientName: meta.name,
                ip: meta.remoteIp,
                flightCode: meta.flightCode,
                closeCode: code,
                closeReason: reason?.toString() || 'none',
                connectionDuration: Date.now() - new Date(meta.connectedAt).getTime(),
                remainingClients: clients.size,
                totalDisconnections: connectionStats.totalDisconnections
            });

            // If the client was in a flight, handle flight cleanup
            if (meta.flightCode) {
                const flight = flights[meta.flightCode];
                if (flight) {
                    const remainingClients = flight.filter((client) => client !== ws);
                    flights[meta.flightCode] = remainingClients; // Update flight with remaining clients

                    // Notify remaining peers in the flight that someone left
                    remainingClients.forEach((client) => {
                        try {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: "peer-left" }));
                            }
                        } catch (error) {
                            log('error', 'Error notifying peer of disconnection during flight close', {
                                error: error.message,
                                flightCode: meta.flightCode
                            });
                        }
                    });

                    if (remainingClients.length === 0) {
                        log('info', 'Flight closed - no remaining participants', {
                            flightCode: meta.flightCode,
                            remainingFlights: Object.keys(flights).length - 1
                        });
                        delete flights[meta.flightCode]; // Delete flight if empty
                    } else {
                        log('info', 'Flight continues with remaining participants', {
                            flightCode: meta.flightCode,
                            remainingParticipants: remainingClients.length
                        });
                    }
                }
            }
        } else {
            log('warn', 'Unknown client disconnected (no metadata)', {
                closeCode: code,
                closeReason: reason?.toString() || 'none'
            });
        }

        broadcastUsersOnSameNetwork(); // Update network visibility for all clients
    });

    ws.on("error", (error) => {
        const meta = clients.get(ws);
        log('error', 'WebSocket connection error', {
            clientId: meta?.id || 'unknown',
            error: error.message,
            code: error.code
        });
    });
});

// --- ENHANCED BROADCASTING LOGIC ---
// Sends updated list of available users to all clients on the same network
function broadcastUsersOnSameNetwork() {
    try {
        const clientsByNetworkGroup = {}; // Group clients by network subnet/IP

        // First pass: Group clients who are not in a full flight
        for (const [ws, meta] of clients.entries()) {
            if (!meta || ws.readyState !== WebSocket.OPEN) {
                log('warn', 'Skipping invalid or closed client in first broadcast pass', { clientId: meta?.id });
                continue;
            }

            // Only consider clients not currently in a full 2-person flight
            if (meta.flightCode && flights[meta.flightCode] && flights[meta.flightCode].length === 2) {
                continue;
            }

            let groupingKey;
            const cleanIp = meta.remoteIp;

            if (isPrivateIP(cleanIp)) {
                groupingKey = cleanIp.split('.').slice(0, 3).join('.'); // Use /24 subnet for private IPs
            } else if (isCgnatIP(cleanIp)) {
                groupingKey = cleanIp; // CGNAT IPs might be grouped more broadly if necessary
            } else {
                groupingKey = cleanIp; // Public IPs
            }

            if (!clientsByNetworkGroup[groupingKey]) {
                clientsByNetworkGroup[groupingKey] = [];
            }
            clientsByNetworkGroup[groupingKey].push({
                id: meta.id,
                name: meta.name,
            });
        }

        // Second pass: Send updates to each client
        let broadcastsSent = 0;
        for (const [ws, meta] of clients.entries()) {
            if (!meta || ws.readyState !== WebSocket.OPEN) {
                log('warn', 'Skipping invalid or closed client in second broadcast pass', { clientId: meta?.id });
                continue;
            }

            try {
                // If client is in a full flight, send an empty list (they won't see other users)
                if (meta.flightCode && flights[meta.flightCode] && flights[meta.flightCode].length === 2) {
                    ws.send(JSON.stringify({ type: "users-on-network-update", users: [] }));
                    broadcastsSent++;
                    continue;
                }

                let groupingKey;
                const cleanIp = meta.remoteIp;

                if (isPrivateIP(cleanIp)) {
                    groupingKey = cleanIp.split('.').slice(0, 3).join('.');
                } else if (isCgnatIP(cleanIp)) {
                    groupingKey = cleanIp;
                } else {
                    groupingKey = cleanIp;
                }

                const usersOnNetwork = clientsByNetworkGroup[groupingKey] ?
                    clientsByNetworkGroup[groupingKey].filter((c) => c.id !== meta.id) :
                    []; // Filter out self

                ws.send(
                    JSON.stringify({ type: "users-on-network-update", users: usersOnNetwork }),
                );
                broadcastsSent++;
            } catch (error) {
                log('error', 'Error sending network update to client', {
                    clientId: meta.id,
                    error: error.message
                });
            }
        }

        log('debug', 'Network broadcast completed', {
            activeClientsForBroadcast: clients.size,
            broadcastsSent,
            networkGroupsCount: Object.keys(clientsByNetworkGroup).length
        });
    } catch (error) {
        log('error', 'Critical error in broadcastUsersOnSameNetwork', {
            error: error.message,
            stack: error.stack
        });
    }
}


// --- Production Health Monitoring (Ping/Pong and Stats Logging) ---
const healthInterval = setInterval(() => {
    const now = Date.now();
    let deadConnectionsRemoved = 0;

    // Iterate over all connected clients to check their aliveness
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) { // If a client didn't respond to the last ping
            const meta = clients.get(ws);
            log('warn', 'Terminating dead connection (no pong received)', { clientId: meta?.id });
            ws.terminate(); // Terminate the connection
            deadConnectionsRemoved++;
            return;
        }

        ws.isAlive = false; // Mark as not alive for the next check
        try {
            ws.ping(); // Send a ping to the client
        } catch (error) {
            log('error', 'Error sending WebSocket ping to client', { error: error.message });
        }
    });

    // Log periodic server health statistics
    if (clients.size > 0 || Object.keys(flights).length > 0) {
        log('info', 'Health check completed', {
            activeConnections: clients.size,
            activeFlights: Object.keys(flights).length,
            honeypotVictims: Object.keys(honeypotData).length,
            deadConnectionsRemoved: deadConnectionsRemoved,
            uptimeSeconds: Math.floor((now - connectionStats.startTime) / 1000),
            totalConnectionsMade: connectionStats.totalConnections,
            totalDisconnectionsMade: connectionStats.totalDisconnections,
            memoryUsage: process.memoryUsage() // Node.js process memory usage
        });
    }
}, 30000); // Run every 30 seconds

// --- Graceful Shutdown Handling ---
function gracefulShutdown() {
    log('info', 'Initiating graceful shutdown...');
    clearInterval(healthInterval); // Stop health checks

    // Notify all active WebSocket clients of server shutdown
    wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "server-shutdown", message: "Server is shutting down for maintenance." }));
            ws.close(1001, 'Server shutdown'); // 1001: Going Away
        }
    });

    // Close the HTTP server, which will also close the WebSocket server
    server.close(() => {
        log('info', 'HTTP server and WebSocket server closed.');
        process.exit(0); // Exit process
    });

    // Force exit if shutdown takes too long (e.g., stuck connections)
    setTimeout(() => {
        log('warn', 'Forcing shutdown after timeout due to unresponsive connections.');
        process.exit(1);
    }, 10000); // 10 seconds timeout
}

process.on('SIGTERM', gracefulShutdown); // Handle termination signals (e.g., from Render)
process.on('SIGINT', gracefulShutdown);  // Handle interrupt signals (e.g., Ctrl+C)

// --- Uncaught Exception and Unhandled Rejection Handling ---
process.on('uncaughtException', (error) => {
    log('error', 'UNCAUGHT EXCEPTION!', {
        error: error.message,
        stack: error.stack
    });
    // Attempt graceful shutdown, then exit.
    gracefulShutdown();
    setTimeout(() => process.exit(1), 5000); // Ensure exit
});

process.on('unhandledRejection', (reason, promise) => {
    log('error', 'UNHANDLED REJECTION!', {
        reason: reason?.toString() || 'unknown',
        promise: promise?.toString() || 'unknown'
    });
    // Log the error but don't exit immediately unless it indicates a critical state,
    // as it might be a recoverable promise rejection.
});

// --- Server Startup ---
server.listen(PORT, '0.0.0.0', () => {
    const localIpForDisplay = getLocalIpForDisplay();
    log('info', `🚀 Signalling Server started`, {
        port: PORT,
        environment: NODE_ENV,
        localIp: localIpForDisplay,
        healthCheck: `http://localhost:${PORT}`, // Accessible locally for verification
        statsEndpoint: `http://localhost:${PORT}/stats`
    });
});