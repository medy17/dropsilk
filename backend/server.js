const WebSocket = require("ws");
const os = require("os");
const http = require("http");

const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Enhanced logging with timestamps and levels
function log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`);
}

// Create a simple HTTP server with enhanced error handling
const server = http.createServer((req, res) => {
    try {
        if (req.method === 'GET' && req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Server is alive and waiting for WebSocket connections.');
            log('info', 'Health check accessed', { ip: req.socket.remoteAddress });
        } else if (req.method === 'GET' && req.url === '/stats') {
            // Production stats endpoint
            const stats = {
                activeConnections: clients.size,
                activeFlights: Object.keys(flights).length,
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
        log('error', 'HTTP server error', { error: error.message, stack: error.stack });
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
});

// Enhanced error handling for HTTP server
server.on('error', (error) => {
    log('error', 'HTTP server error', { error: error.message, code: error.code });
    if (error.code === 'EADDRINUSE') {
        log('error', `Port ${PORT} is already in use`);
        process.exit(1);
    }
});

// Attach the WebSocket server to the HTTP server with enhanced options
const wss = new WebSocket.Server({
    server,
    perMessageDeflate: false, // Disable compression for better performance
    maxPayload: 1024 * 1024, // 1MB max payload
    clientTracking: true
});

// Enhanced WebSocket server error handling
wss.on('error', (error) => {
    log('error', 'WebSocket server error', { error: error.message, stack: error.stack });
});

// Start listening with enhanced error handling
server.listen(PORT, '0.0.0.0', () => {
    log('info', `🚀 Production Signalling Server started`, {
        port: PORT,
        environment: NODE_ENV,
        healthCheck: `http://localhost:${PORT}`,
        statsEndpoint: `http://localhost:${PORT}/stats`
    });
});

// Enhanced data structures with better tracking
const flights = {};
const clients = new Map();
const connectionStats = {
    totalConnections: 0,
    totalDisconnections: 0,
    totalFlightsCreated: 0,
    totalFlightsJoined: 0,
    startTime: Date.now()
};

// --- IP HELPER FUNCTIONS (Enhanced with validation) ---

function getCleanIPv4(ip) {
    if (!ip || typeof ip !== 'string') {
        log('warn', 'Invalid IP address received', { ip });
        return 'unknown';
    }

    try {
        if (ip.startsWith('::ffff:')) {
            return ip.substring(7);
        }
        if (ip === '::1') {
            return '127.0.0.1';
        }
        return ip;
    } catch (error) {
        log('error', 'Error processing IP address', { ip, error: error.message });
        return 'unknown';
    }
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
        log('error', 'Error getting local IP', { error: error.message });
        return "localhost";
    }
}

// --- ENHANCED BROADCASTING LOGIC ---
function broadcastUsersOnSameNetwork() {
    try {
        const clientsByNetworkGroup = {};
        let processedClients = 0;

        for (const [ws, meta] of clients.entries()) {
            if (!meta || !ws || ws.readyState !== WebSocket.OPEN) {
                log('warn', 'Skipping invalid client in broadcast', { clientId: meta?.id });
                continue;
            }

            // Only broadcast users who are not currently in a full flight
            if (meta.flightCode && flights[meta.flightCode] && flights[meta.flightCode].length === 2) {
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

            if (!clientsByNetworkGroup[groupingKey]) {
                clientsByNetworkGroup[groupingKey] = [];
            }
            clientsByNetworkGroup[groupingKey].push({
                id: meta.id,
                name: meta.name,
            });
            processedClients++;
        }

        let broadcastsSent = 0;
        for (const [ws, meta] of clients.entries()) {
            if (!meta || !ws || ws.readyState !== WebSocket.OPEN) {
                continue;
            }

            try {
                // Don't send network updates to users in a full flight
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

                if (clientsByNetworkGroup[groupingKey]) {
                    const usersOnNetwork = clientsByNetworkGroup[groupingKey].filter(
                        (c) => c.id !== meta.id
                    );
                    ws.send(
                        JSON.stringify({ type: "users-on-network-update", users: usersOnNetwork }),
                    );
                } else {
                    ws.send(JSON.stringify({ type: "users-on-network-update", users: [] }));
                }
                broadcastsSent++;
            } catch (error) {
                log('error', 'Error sending network update to client', {
                    clientId: meta.id,
                    error: error.message
                });
            }
        }

        log('debug', 'Network broadcast completed', {
            processedClients,
            broadcastsSent,
            networkGroups: Object.keys(clientsByNetworkGroup).length
        });
    } catch (error) {
        log('error', 'Critical error in broadcastUsersOnSameNetwork', {
            error: error.message,
            stack: error.stack
        });
    }
}

// Enhanced connection handling with comprehensive error handling
wss.on("connection", (ws, req) => {
    let clientId, metadata;

    try {
        clientId = Math.random().toString(36).substr(2, 9);
        const rawIp = req.headers['x-forwarded-for']?.split(',').shift() || req.socket.remoteAddress;
        const cleanRemoteIp = getCleanIPv4(rawIp);
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

        log('info', 'Client connected', {
            clientId,
            ip: cleanRemoteIp,
            userAgent,
            totalClients: clients.size,
            totalConnections: connectionStats.totalConnections
        });

        // Enhanced WebSocket configuration
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        // Send registration confirmation
        ws.send(JSON.stringify({ type: "registered", id: clientId }));

        // Send initial user list upon connection
        broadcastUsersOnSameNetwork();

    } catch (error) {
        log('error', 'Error during client connection setup', {
            error: error.message,
            stack: error.stack,
            clientId: clientId || 'unknown'
        });

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1011, 'Server error during connection setup');
        }
        return;
    }

    ws.on("message", (message) => {
        let data;
        const meta = clients.get(ws);

        if (!meta) {
            log('warn', 'Received message from unregistered client');
            return;
        }

        try {
            // Validate message size and format
            if (message.length > 1024 * 1024) { // 1MB limit
                log('warn', 'Message too large', { clientId: meta.id, size: message.length });
                ws.send(JSON.stringify({ type: "error", message: "Message too large" }));
                return;
            }

            data = JSON.parse(message);

            if (!data.type) {
                log('warn', 'Message missing type field', { clientId: meta.id });
                return;
            }

            log('debug', 'Message received', {
                clientId: meta.id,
                type: data.type,
                messageSize: message.length
            });

        } catch (error) {
            log('error', 'Error parsing message', {
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
                    if (!data.name || typeof data.name !== 'string' || data.name.length > 50) {
                        log('warn', 'Invalid name in registration', { clientId: meta.id, name: data.name });
                        ws.send(JSON.stringify({ type: "error", message: "Invalid name" }));
                        return;
                    }

                    const oldName = meta.name;
                    meta.name = data.name.trim();
                    clients.set(ws, meta);

                    log('info', 'Client registered details', {
                        clientId: meta.id,
                        oldName,
                        newName: meta.name,
                        ip: meta.remoteIp
                    });

                    broadcastUsersOnSameNetwork();
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

                    const flightCode = Math.random().toString(36).substr(2, 6).toUpperCase();
                    flights[flightCode] = [ws];
                    meta.flightCode = flightCode;
                    connectionStats.totalFlightsCreated++;

                    log('info', 'Flight created', {
                        flightCode,
                        creatorId: meta.id,
                        creatorName: meta.name,
                        creatorIp: meta.remoteIp,
                        totalFlights: Object.keys(flights).length,
                        totalFlightsCreated: connectionStats.totalFlightsCreated
                    });

                    ws.send(JSON.stringify({ type: "flight-created", flightCode }));
                    broadcastUsersOnSameNetwork();
                    break;

                case "join-flight":
                    if (!data.flightCode || typeof data.flightCode !== 'string') {
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

                    const creatorWs = flight[0];
                    const creatorMeta = clients.get(creatorWs);

                    if (!creatorMeta || creatorWs.readyState !== WebSocket.OPEN) {
                        log('error', 'Creator websocket invalid during join', {
                            flightCode: data.flightCode,
                            joinerId: meta.id
                        });
                        delete flights[data.flightCode];
                        ws.send(JSON.stringify({ type: "error", message: "Flight creator disconnected" }));
                        return;
                    }

                    // Determine connection type
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
                        connectionType = 'lan';
                    }

                    flight.push(ws);
                    meta.flightCode = data.flightCode;
                    connectionStats.totalFlightsJoined++;

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

                    // Send personalized peer-joined messages
                    const creatorPeerData = { id: creatorMeta.id, name: creatorMeta.name };
                    const joinerPeerData = { id: meta.id, name: meta.name };

                    // Send to joiner about creator
                    ws.send(JSON.stringify({
                        type: "peer-joined",
                        flightCode: data.flightCode,
                        connectionType: connectionType,
                        peer: creatorPeerData
                    }));

                    // Send to creator about joiner
                    creatorWs.send(JSON.stringify({
                        type: "peer-joined",
                        flightCode: data.flightCode,
                        connectionType: connectionType,
                        peer: joinerPeerData
                    }));

                    broadcastUsersOnSameNetwork();
                    break;

                case "invite-to-flight":
                    if (!data.inviteeId || !data.flightCode) {
                        log('warn', 'Invalid invitation data', {
                            clientId: meta.id,
                            inviteeId: data.inviteeId,
                            flightCode: data.flightCode
                        });
                        return;
                    }

                    let invitationSent = false;
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
                        log('warn', 'Invitation target not found', {
                            inviteeId: data.inviteeId,
                            inviterId: meta.id
                        });
                    }
                    break;

                case "signal":
                    if (!meta.flightCode) {
                        log('warn', 'Signal sent without flight', { clientId: meta.id });
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
                    targetFlight.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            try {
                                client.send(JSON.stringify({ type: "signal", data: data.data }));
                                signalsSent++;
                            } catch (error) {
                                log('error', 'Error sending signal', {
                                    error: error.message,
                                    flightCode: meta.flightCode
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
                    log('warn', 'Unknown message type', {
                        clientId: meta.id,
                        type: data.type
                    });
                    ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
            }
        } catch (error) {
            log('error', 'Error processing message', {
                clientId: meta.id,
                messageType: data?.type,
                error: error.message,
                stack: error.stack
            });

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "error", message: "Server error processing message" }));
            }
        }
    });

    ws.on("close", (code, reason) => {
        const meta = clients.get(ws);
        clients.delete(ws);
        connectionStats.totalDisconnections++;

        if (meta) {
            const flightInfo = meta.flightCode ? ` from flight ${meta.flightCode}` : "";
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

            if (meta.flightCode) {
                const flight = flights[meta.flightCode];
                if (flight) {
                    const remainingClients = flight.filter((client) => client !== ws);
                    flights[meta.flightCode] = remainingClients;

                    // Notify remaining peers
                    remainingClients.forEach((client) => {
                        try {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: "peer-left" }));
                            }
                        } catch (error) {
                            log('error', 'Error notifying peer of disconnection', {
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
                        delete flights[meta.flightCode];
                    } else {
                        log('info', 'Flight continues with remaining participants', {
                            flightCode: meta.flightCode,
                            remainingParticipants: remainingClients.length
                        });
                    }
                }
            }
        } else {
            log('warn', 'Unknown client disconnected', {
                closeCode: code,
                closeReason: reason?.toString() || 'none'
            });
        }

        broadcastUsersOnSameNetwork();
    });

    ws.on("error", (error) => {
        const meta = clients.get(ws);
        log('error', 'WebSocket error', {
            clientId: meta?.id || 'unknown',
            error: error.message,
            code: error.code
        });
    });
});

// Production health monitoring
const healthInterval = setInterval(() => {
    const now = Date.now();
    let deadConnections = 0;

    // Ping all connections to check if they're alive
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            const meta = clients.get(ws);
            log('warn', 'Terminating dead connection', { clientId: meta?.id });
            ws.terminate();
            deadConnections++;
            return;
        }

        ws.isAlive = false;
        try {
            ws.ping();
        } catch (error) {
            log('error', 'Error pinging client', { error: error.message });
        }
    });

    // Log periodic stats
    if (clients.size > 0 || Object.keys(flights).length > 0) {
        log('info', 'Health check completed', {
            activeConnections: clients.size,
            activeFlights: Object.keys(flights).length,
            deadConnectionsRemoved: deadConnections,
            uptime: Math.floor((now - connectionStats.startTime) / 1000),
            totalConnections: connectionStats.totalConnections,
            totalDisconnections: connectionStats.totalDisconnections,
            memoryUsage: process.memoryUsage()
        });
    }
}, 30000); // Every 30 seconds

// Graceful shutdown handling
process.on('SIGTERM', () => {
    log('info', 'SIGTERM received, starting graceful shutdown');
    clearInterval(healthInterval);

    wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "server-shutdown", message: "Server is shutting down" }));
            ws.close(1001, 'Server shutdown');
        }
    });

    server.close(() => {
        log('info', 'Server shutdown complete');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    log('info', 'SIGINT received, starting graceful shutdown');
    clearInterval(healthInterval);

    wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "server-shutdown", message: "Server is shutting down" }));
            ws.close(1001, 'Server shutdown');
        }
    });

    server.close(() => {
        log('info', 'Server shutdown complete');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log('error', 'Uncaught exception', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log('error', 'Unhandled rejection', {
        reason: reason?.toString() || 'unknown',
        promise: promise?.toString() || 'unknown'
    });
});

const localIpForDisplay = getLocalIpForDisplay();
log('info', 'Server initialization complete', { localIp: localIpForDisplay });