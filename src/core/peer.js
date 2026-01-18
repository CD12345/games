// PeerJS P2P connection management
// Uses PeerJS for WebRTC peer-to-peer connections
// Supports multiple guest connections for multiplayer games

// PeerJS is loaded from CDN in HTML

import { debugLog as overlayDebugLog } from '../ui/DebugOverlay.js';

let peer = null;
let connections = new Map();  // Map of peerId -> connection
let hostConnection = null;    // For guests: connection to host
let isHost = false;
let messageHandlers = new Map();
let connectionHandler = null;
let onGuestConnectCallback = null;
let onGuestDisconnectCallback = null;

// Debug log for connection troubleshooting
const debugLog = [];
const MAX_DEBUG_ENTRIES = 50;

export function addDebugLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${message}`;
    debugLog.push(entry);
    console.log('PEER:', message);
    overlayDebugLog(message);
    if (debugLog.length > MAX_DEBUG_ENTRIES) {
        debugLog.shift();
    }
}

export function getDebugLog() {
    return [...debugLog];
}

export function clearDebugLog() {
    debugLog.length = 0;
}

function clearConnectionHandler() {
    if (!peer || !connectionHandler) return;
    if (typeof peer.off === 'function') {
        peer.off('connection', connectionHandler);
    } else if (typeof peer.removeListener === 'function') {
        peer.removeListener('connection', connectionHandler);
    }
    connectionHandler = null;
}

// Metered.ca TURN credentials API
const METERED_API_URL = 'https://cd12345.metered.live/api/v1/turn/credentials?apiKey=b5093eb1b4d5852abb7fc078a031ed74f4a6';

// Fetch TURN credentials from Metered.ca
async function fetchTurnCredentials() {
    try {
        addDebugLog('Fetching TURN credentials from Metered...');
        const response = await fetch(METERED_API_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const iceServers = await response.json();
        addDebugLog(`Got ${iceServers.length} ICE servers from Metered`);
        return iceServers;
    } catch (error) {
        addDebugLog(`Failed to fetch TURN credentials: ${error.message}`);
        // Fallback to basic STUN only
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
    }
}

// Initialize PeerJS with a custom ID (for host) or random ID (for guest)
export async function initPeer(customId = null) {
    addDebugLog(`initPeer called, customId=${customId || 'none'}`);

    if (peer && !peer.destroyed) {
        if (customId && peer.id && peer.id !== customId) {
            addDebugLog('ERROR: Peer already initialized with different ID');
            throw new Error('Peer already initialized with a different ID.');
        }
        addDebugLog(`Reusing existing peer: ${peer.id}`);
        return peer.id;
    }

    // Fetch TURN credentials from Metered.ca
    const iceServers = await fetchTurnCredentials();

    const options = {
        debug: 3, // 0 = no logs, 1 = errors, 2 = warnings, 3 = all
        config: { iceServers }
    };

    addDebugLog(`Creating peer with ${iceServers.length} ICE servers`);

    return new Promise((resolve, reject) => {
        peer = customId ? new Peer(customId, options) : new Peer(options);

        peer.on('open', (id) => {
            addDebugLog(`Peer OPEN with ID: ${id}`);
            resolve(id);
        });

        peer.on('error', (err) => {
            addDebugLog(`Peer ERROR: ${err.type} - ${err.message || err}`);
            if (err.type === 'unavailable-id') {
                reject(new Error('Game code already in use. Try another.'));
            } else if (err.type === 'peer-unavailable') {
                reject(new Error('Game not found. Check the code.'));
            } else {
                reject(err);
            }
        });

        peer.on('disconnected', () => {
            addDebugLog('Peer DISCONNECTED from signaling server');
            // Try to reconnect
            if (peer && !peer.destroyed) {
                addDebugLog('Attempting to reconnect...');
                peer.reconnect();
            }
        });
    });
}

// Host: Start listening for guest connections (resolves on first connection)
export function waitForConnection() {
    return new Promise((resolve) => {
        isHost = true;
        addDebugLog('Host waiting for guest connections...');

        // If we already have connections, resolve with the first one
        if (connections.size > 0) {
            const firstConn = connections.values().next().value;
            if (firstConn && firstConn.open) {
                addDebugLog('Reusing existing open connection');
                resolve(firstConn);
                return;
            }
        }

        clearConnectionHandler();
        let firstConnectionResolved = false;

        connectionHandler = (conn) => {
            addDebugLog(`Guest connecting: ${conn.peer}`);

            conn.on('open', () => {
                addDebugLog(`Guest connection OPEN: ${conn.peer}`);
                connections.set(conn.peer, conn);
                setupHostConnection(conn);

                // Notify callback about new guest
                if (onGuestConnectCallback) {
                    onGuestConnectCallback(conn.peer, connections.size);
                }

                // Resolve promise on first connection
                if (!firstConnectionResolved) {
                    firstConnectionResolved = true;
                    resolve(conn);
                }
            });

            // If already open, handle immediately
            if (conn.open) {
                addDebugLog(`Guest connection already open: ${conn.peer}`);
                connections.set(conn.peer, conn);
                setupHostConnection(conn);

                if (onGuestConnectCallback) {
                    onGuestConnectCallback(conn.peer, connections.size);
                }

                if (!firstConnectionResolved) {
                    firstConnectionResolved = true;
                    resolve(conn);
                }
            }
        };
        peer.on('connection', connectionHandler);
    });
}

// Set callback for when guests connect/disconnect (host only)
export function onGuestConnect(callback) {
    onGuestConnectCallback = callback;
}

export function onGuestDisconnect(callback) {
    onGuestDisconnectCallback = callback;
}

// Guest: Connect to a host
export function connectToPeer(hostId) {
    return new Promise((resolve, reject) => {
        isHost = false;

        addDebugLog(`Guest connecting to host: ${hostId}`);
        const conn = peer.connect(hostId, {
            reliable: true
        });

        // Log ICE connection state changes
        conn.on('iceStateChanged', (state) => {
            addDebugLog(`ICE state: ${state}`);
        });

        // Monitor the underlying peer connection for more details
        const checkIceState = setInterval(() => {
            if (conn.peerConnection) {
                const pc = conn.peerConnection;
                addDebugLog(`ICE: ${pc.iceConnectionState}, Gather: ${pc.iceGatheringState}`);

                // Log ICE candidates
                if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                    addDebugLog('ICE FAILED - TURN servers may not be working');
                    clearInterval(checkIceState);
                }
                if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                    addDebugLog('ICE connected successfully');
                    clearInterval(checkIceState);
                }
            }
        }, 1000);

        conn.on('open', () => {
            addDebugLog('Connection OPEN to host');
            clearInterval(checkIceState);
            hostConnection = conn;
            setupGuestConnection(conn);
            resolve(conn);
        });

        conn.on('error', (err) => {
            addDebugLog(`Connection ERROR: ${err.message || err}`);
            clearInterval(checkIceState);
            reject(new Error('Failed to connect to game.'));
        });

        // Timeout after 20 seconds (increased for slow TURN negotiation)
        setTimeout(() => {
            if (!hostConnection) {
                addDebugLog('Connection TIMEOUT after 20s');
                clearInterval(checkIceState);
                reject(new Error('Connection timeout. Game may not exist.'));
            }
        }, 20000);
    });
}

// Set up connection handlers for host (receiving from a guest)
function setupHostConnection(conn) {
    conn.on('data', (data) => {
        // Include sender info in the message
        handleMessage(data, conn.peer);
    });

    conn.on('close', () => {
        addDebugLog(`Guest disconnected: ${conn.peer}`);
        connections.delete(conn.peer);

        if (onGuestDisconnectCallback) {
            onGuestDisconnectCallback(conn.peer, connections.size);
        }

        // Notify handlers
        const handler = messageHandlers.get('_disconnect');
        if (handler) handler({ peerId: conn.peer });
    });

    conn.on('error', (err) => {
        console.error('Connection error:', err);
    });
}

// Set up connection handlers for guest (receiving from host)
function setupGuestConnection(conn) {
    conn.on('data', (data) => {
        handleMessage(data, null);  // null = from host
    });

    conn.on('close', () => {
        console.log('Connection to host closed');
        hostConnection = null;
        // Notify handlers
        const handler = messageHandlers.get('_disconnect');
        if (handler) handler({ peerId: null });
    });

    conn.on('error', (err) => {
        console.error('Connection error:', err);
    });
}

// Handle incoming messages
function handleMessage(data, fromPeerId) {
    if (data && data.type) {
        const handler = messageHandlers.get(data.type);
        if (handler) {
            // Include sender info in payload for host to identify which guest sent it
            handler(data.payload, fromPeerId);
        }
    }
}

// Register a message handler
export function onMessage(type, handler) {
    messageHandlers.set(type, handler);
}

// Remove a message handler
export function offMessage(type) {
    messageHandlers.delete(type);
}

// Send a message (host broadcasts to all guests, guest sends to host)
export function sendMessage(type, payload) {
    if (isHost) {
        // Broadcast to all connected guests
        for (const conn of connections.values()) {
            if (conn.open) {
                conn.send({ type, payload });
            }
        }
    } else {
        // Send to host
        if (hostConnection && hostConnection.open) {
            hostConnection.send({ type, payload });
        }
    }
}

// Send a message to a specific peer (host only)
export function sendMessageTo(peerId, type, payload) {
    if (!isHost) return;
    const conn = connections.get(peerId);
    if (conn && conn.open) {
        conn.send({ type, payload });
    }
}

// Send message and wait for response
export function sendRequest(type, payload, responseType, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            offMessage(responseType);
            reject(new Error('Request timeout'));
        }, timeout);

        onMessage(responseType, (response) => {
            clearTimeout(timer);
            offMessage(responseType);
            resolve(response);
        });

        sendMessage(type, payload);
    });
}

// Check if connected (host: has any guests, guest: connected to host)
export function isConnected() {
    if (isHost) {
        return connections.size > 0;
    }
    return hostConnection && hostConnection.open;
}

// Get number of connected guests (host only)
export function getGuestCount() {
    return connections.size;
}

// Get list of connected guest peer IDs (host only)
export function getGuestPeerIds() {
    return Array.from(connections.keys());
}

// Check if this peer is the host
export function getIsHost() {
    return isHost;
}

// Get the current peer ID
export function getPeerId() {
    return peer?.id || null;
}

// Get connection latency (approximate)
export function getLatency() {
    // PeerJS doesn't provide latency directly
    // Could implement ping/pong if needed
    return 0;
}

// Disconnect and cleanup
export function disconnect(options = {}) {
    const keepPeer = options.keepPeer === true;

    // Close all guest connections (host)
    for (const conn of connections.values()) {
        conn.close();
    }
    connections.clear();

    // Close host connection (guest)
    if (hostConnection) {
        hostConnection.close();
        hostConnection = null;
    }

    clearConnectionHandler();
    onGuestConnectCallback = null;
    onGuestDisconnectCallback = null;

    if (peer && !keepPeer) {
        peer.destroy();
        peer = null;
    }
    messageHandlers.clear();
    isHost = false;
}

// Export peer instance for advanced usage
export { peer };
