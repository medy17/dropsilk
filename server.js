const WebSocket = require("ws");
const os = require("os");
const http = require("http");

const PORT = process.env.PORT || 8080;

// Create a simple HTTP server
const server = http.createServer((req, res) => {
    // This is our health check endpoint.
    // It responds to any HTTP request with a success message.
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Server is alive and waiting for WebSocket connections.');
    } else {
        res.writeHead(404);
        res.end();
    }
});

// Attach the WebSocket server to the HTTP server
const wss = new WebSocket.Server({ server });

// Start listening
server.listen(PORT, () => {
    console.log(`🚀 Upgraded Signalling Server is running on port ${PORT}!`);
    console.log(`Health check available at http://localhost:${PORT}`);
});

const flights = {};
// --- NEW: STATE MANAGEMENT OVERHAUL ---
// Maps clientId -> sessionObject
const clients = new Map();
// Maps ws -> clientId
const connections = new Map();

// --- IP HELPER FUNCTIONS ---

function getCleanIPv4(ip) {
    if (!ip) return 'unknown';
    if (ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }
    if (ip === '::1') {
        return '127.0.0.1';
    }
    return ip;
}

function isPrivateIP(ip) {
    return ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
}

function isCgnatIP(ip) {
    return ip.startsWith('100.') && ip.match(/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./);
}


function getLocalIpForDisplay() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === "IPv4" && !net.internal) {
                return net.address;
            }
        }
    }
    return "localhost";
}

// --- CORE BROADCASTING LOGIC ---
function broadcastUsersOnSameNetwork() {
    const clientsByNetworkGroup = {};

    for (const [clientId, meta] of clients.entries()) {
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
    }

    for (const [clientId, meta] of clients.entries()) {
        if (!meta.ws || meta.ws.readyState !== WebSocket.OPEN) continue;

        // Don't send network updates to users in a full flight
        if (meta.flightCode && flights[meta.flightCode] && flights[meta.flightCode].length === 2) {
            meta.ws.send(JSON.stringify({ type: "users-on-network-update", users: [] }));
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
            meta.ws.send(
                JSON.stringify({ type: "users-on-network-update", users: usersOnNetwork }),
            );
        } else {
            meta.ws.send(JSON.stringify({ type: "users-on-network-update", users: [] }));
        }
    }
}

wss.on("connection", (ws, req) => {
    // This connection is temporary until a 'register-details' or 'reconnect' message arrives.
    // The worker architecture simplifies this; every new connection gets a temporary ID.
    const tempClientId = Math.random().toString(36).substr(2, 9);
    connections.set(ws, tempClientId);

    ws.on("message", (message) => {
        const data = JSON.parse(message);
        const senderId = connections.get(ws);
        if (!senderId) return;

        switch (data.type) {
            case "register-details":
                // This is a brand new session.
                const newClientId = Math.random().toString(36).substr(2, 9);
                const rawIp = req.headers['x-forwarded-for']?.split(',').shift() || req.socket.remoteAddress;
                const session = {
                    id: newClientId,
                    name: data.name,
                    flightCode: null,
                    remoteIp: getCleanIPv4(rawIp),
                    ws: ws,
                    state: 'ACTIVE', // 'ACTIVE', 'HELD'
                    holdTimer: null
                };
                clients.set(newClientId, session);
                connections.set(ws, newClientId); // Update mapping from temp to real ID

                ws.send(JSON.stringify({ type: "registered", id: newClientId }));
                broadcastUsersOnSameNetwork();
                break;

            case "create-flight":
            case "join-flight":
            case "invite-to-flight":
            case "signal":
                // These actions require a persistent session, which is guaranteed if we get here.
                const senderSession = clients.get(senderId);
                if (!senderSession) return;
                handleFlightActions(senderSession, data);
                break;
        }
    });

    ws.on("close", () => {
        const closedClientId = connections.get(ws);
        if (!closedClientId) return;

        const session = clients.get(closedClientId);
        console.log(`Client ${closedClientId} disconnected.`);

        // The worker logic means we don't need a complex HELD state anymore.
        // A disconnect is a disconnect. The worker keeps the session alive.
        // When the worker reconnects, it establishes a new session on the server.
        // For simplicity and robustness, we treat any disconnect as final.
        // The *real* session persistence is now entirely inside the client's worker.
        if (session) {
            cleanupSession(closedClientId);
        }
        connections.delete(ws);
    });
});

function handleFlightActions(senderSession, data) {
    const { type, payload } = data;
    const senderId = senderSession.id;
    const ws = senderSession.ws;

    switch(type) {
        case "create-flight":
            const flightCode = Math.random().toString(36).substr(2, 6).toUpperCase();
            flights[flightCode] = [senderId];
            senderSession.flightCode = flightCode;
            ws.send(JSON.stringify({ type: "flight-created", flightCode }));
            broadcastUsersOnSameNetwork();
            break;

        case "join-flight":
            const flightToJoin = flights[payload.code];
            if (flightToJoin && flightToJoin.length < 2) {
                const creatorId = flightToJoin[0];
                const creatorSession = clients.get(creatorId);

                if (!creatorSession || !creatorSession.ws || creatorSession.ws.readyState !== WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "error", message: "Flight creator is not available." }));
                    return;
                }

                let connectionType = 'wan';
                if (isPrivateIP(creatorSession.remoteIp) && isPrivateIP(senderSession.remoteIp) && creatorSession.remoteIp.split('.').slice(0, 3).join('.') === senderSession.remoteIp.split('.').slice(0, 3).join('.')) {
                    connectionType = 'lan';
                } else if (creatorSession.remoteIp === senderSession.remoteIp) {
                    connectionType = 'lan';
                }

                flightToJoin.push(senderId);
                senderSession.flightCode = payload.code;

                const creatorPeerData = { id: creatorSession.id, name: creatorSession.name };
                const joinerPeerData = { id: senderSession.id, name: senderSession.name };

                ws.send(JSON.stringify({ type: "peer-joined", flightCode: payload.code, connectionType, peer: creatorPeerData }));
                creatorSession.ws.send(JSON.stringify({ type: "peer-joined", flightCode: payload.code, connectionType, peer: joinerPeerData }));

                broadcastUsersOnSameNetwork();
            } else {
                ws.send(JSON.stringify({ type: "error", message: "Flight not found or is full." }));
            }
            break;

        case "invite-to-flight":
            const inviteeSession = clients.get(payload.inviteeId);
            if (inviteeSession && inviteeSession.ws && inviteeSession.ws.readyState === WebSocket.OPEN) {
                inviteeSession.ws.send(JSON.stringify({ type: "flight-invitation", flightCode: senderSession.flightCode, fromName: senderSession.name }));
            }
            break;

        case "signal":
            const targetFlightSignal = flights[senderSession.flightCode];
            if (targetFlightSignal) {
                targetFlightSignal.forEach((peerId) => {
                    if (peerId !== senderId) {
                        const peerSession = clients.get(peerId);
                        if (peerSession && peerSession.ws && peerSession.ws.readyState === WebSocket.OPEN) {
                            peerSession.ws.send(JSON.stringify({ type: "signal", data: payload.data }));
                        }
                    }
                });
            }
            break;
    }
}


function cleanupSession(clientId) {
    const session = clients.get(clientId);
    if (!session) return;

    console.log(`Cleaning up session for client ${clientId}`);

    if (session.flightCode) {
        const flight = flights[session.flightCode];
        if (flight) {
            // Notify the other peer
            flight.forEach((peerId) => {
                if (peerId !== clientId) {
                    const peerSession = clients.get(peerId);
                    if (peerSession && peerSession.ws && peerSession.ws.readyState === WebSocket.OPEN) {
                        peerSession.flightCode = null; // Mark them as out of the flight too
                        peerSession.ws.send(JSON.stringify({ type: "peer-left" }));
                    }
                }
            });
            // The flight is now dissolved
            delete flights[session.flightCode];
            console.log(`Flight ${session.flightCode} dissolved.`);
        }
    }

    clients.delete(clientId);
    console.log(`Client session for ${clientId} removed.`);
    broadcastUsersOnSameNetwork();
}
