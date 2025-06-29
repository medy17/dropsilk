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
const clients = new Map();

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

    for (const [ws, meta] of clients.entries()) {
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

    for (const [ws, meta] of clients.entries()) {
        // Don't send network updates to users in a full flight
        if (meta.flightCode && flights[meta.flightCode] && flights[meta.flightCode].length === 2) {
            ws.send(JSON.stringify({ type: "users-on-network-update", users: [] }));
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

        // This logic is simplified; we just need to send the list of users in the same group.
        // We filter out the current user themselves.
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
    }
}

wss.on("connection", (ws, req) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    const rawIp = req.headers['x-forwarded-for']?.split(',').shift() || req.socket.remoteAddress;
    const cleanRemoteIp = getCleanIPv4(rawIp);

    const metadata = { id: clientId, name: "Anonymous", flightCode: null, remoteIp: cleanRemoteIp };
    clients.set(ws, metadata);

    ws.send(JSON.stringify({ type: "registered", id: clientId }));
    // Send initial user list upon connection
    broadcastUsersOnSameNetwork();


    ws.on("message", (message) => {
        const data = JSON.parse(message);
        const meta = clients.get(ws);

        switch (data.type) {
            case "register-details":
                meta.name = data.name;
                clients.set(ws, meta);
                broadcastUsersOnSameNetwork();
                break;

            case "create-flight":
                const flightCode = Math.random().toString(36).substr(2, 6).toUpperCase();
                flights[flightCode] = [ws];
                meta.flightCode = flightCode;
                ws.send(JSON.stringify({ type: "flight-created", flightCode }));
                broadcastUsersOnSameNetwork();
                break;

            case "join-flight":
                const flight = flights[data.flightCode];
                if (flight && flight.length < 2) {
                    const creatorWs = flight[0];
                    const creatorMeta = clients.get(creatorWs);
                    const joinerMeta = meta;

                    let connectionType = 'wan';
                    const creatorIp = creatorMeta.remoteIp;
                    const joinerIp = joinerMeta.remoteIp;

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

                    // --- Send personalized peer-joined messages ---
                    const creatorPeerData = { id: creatorMeta.id, name: creatorMeta.name };
                    const joinerPeerData = { id: joinerMeta.id, name: joinerMeta.name };

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

                    broadcastUsersOnSameNetwork(); // Update lists for all other clients
                } else {
                    ws.send(
                        JSON.stringify({
                            type: "error",
                            message: "Flight not found or is full.",
                        }),
                    );
                }
                break;

            case "invite-to-flight":
                for (const [clientWs, clientMeta] of clients.entries()) {
                    if (clientMeta.id === data.inviteeId && clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(
                            JSON.stringify({
                                type: "flight-invitation",
                                flightCode: data.flightCode,
                                fromName: meta.name,
                            }),
                        );
                        break;
                    }
                }
                break;

            case "signal":
                const targetFlight = flights[meta.flightCode];
                if (targetFlight) {
                    targetFlight.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: "signal", data: data.data }));
                        }
                    });
                }
                break;
        }
    });

    ws.on("close", () => {
        const meta = clients.get(ws);
        if (meta && meta.flightCode) {
            const flight = flights[meta.flightCode];
            if (flight) {
                flights[meta.flightCode] = flight.filter((client) => client !== ws);
                // Notify the remaining peer that their partner has left.
                flights[meta.flightCode].forEach((client) => {
                    // *** THE BUG FIX IS HERE: The remaining user STAYS in the flight. ***
                    // We no longer set their flightCode to null.
                    client.send(JSON.stringify({ type: "peer-left" }));
                });

                if (flights[meta.flightCode].length === 0) {
                    delete flights[meta.flightCode];
                }
            }
        }
        clients.delete(ws);
        broadcastUsersOnSameNetwork();
    });
});

const localIpForDisplay = getLocalIpForDisplay();
