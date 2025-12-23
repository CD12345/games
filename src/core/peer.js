// PeerJS P2P connection management
// Uses PeerJS for WebRTC peer-to-peer connections

// PeerJS is loaded from CDN in HTML

let peer = null;
let currentConnection = null;
let isHost = false;
let messageHandlers = new Map();
let connectionHandler = null;

// Debug log for connection troubleshooting
const debugLog = [];
const MAX_DEBUG_ENTRIES = 50;

export function addDebugLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${message}`;
    debugLog.push(entry);
    console.log('PEER:', message);
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

// Initialize PeerJS with a custom ID (for host) or random ID (for guest)
export function initPeer(customId = null) {
    return new Promise((resolve, reject) => {
        addDebugLog(`initPeer called, customId=${customId || 'none'}`);

        if (peer && !peer.destroyed) {
            if (customId && peer.id && peer.id !== customId) {
                addDebugLog('ERROR: Peer already initialized with different ID');
                reject(new Error('Peer already initialized with a different ID.'));
                return;
            }
            addDebugLog(`Reusing existing peer: ${peer.id}`);
            resolve(peer.id);
            return;
        }

        // Use free PeerJS cloud server with STUN/TURN servers
        const options = {
            debug: 3, // 0 = no logs, 1 = errors, 2 = warnings, 3 = all
            config: {
                iceServers: [
                    // Google STUN servers
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    // Cloudflare TURN (free, no auth needed for basic use)
                    { urls: 'stun:stun.cloudflare.com:3478' },
                    {
                        urls: 'turn:turn.cloudflare.com:3478?transport=udp',
                        username: '',
                        credential: ''
                    },
                    {
                        urls: 'turn:turn.cloudflare.com:3478?transport=tcp',
                        username: '',
                        credential: ''
                    },
                    // Open Relay TURN servers (may require signup now)
                    {
                        urls: 'turn:openrelay.metered.ca:80',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
                ]
            }
        };

        addDebugLog(`Creating peer with ${options.config.iceServers.length} ICE servers`);

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

// Host: Wait for a guest to connect
export function waitForConnection() {
    return new Promise((resolve) => {
        isHost = true;
        addDebugLog('Host waiting for guest connection...');

        if (currentConnection && currentConnection.open) {
            addDebugLog('Reusing existing open connection');
            resolve(currentConnection);
            return;
        }

        clearConnectionHandler();
        connectionHandler = (conn) => {
            addDebugLog(`Guest connecting: ${conn.peer}`);
            currentConnection = conn;
            setupConnection(conn);

            conn.on('open', () => {
                addDebugLog('Guest connection OPEN');
                resolve(conn);
            });

            // If already open, resolve immediately
            if (conn.open) {
                addDebugLog('Guest connection already open');
                resolve(conn);
            }
        };
        peer.on('connection', connectionHandler);
    });
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
            currentConnection = conn;
            setupConnection(conn);
            resolve(conn);
        });

        conn.on('error', (err) => {
            addDebugLog(`Connection ERROR: ${err.message || err}`);
            clearInterval(checkIceState);
            reject(new Error('Failed to connect to game.'));
        });

        // Timeout after 20 seconds (increased for slow TURN negotiation)
        setTimeout(() => {
            if (!currentConnection) {
                addDebugLog('Connection TIMEOUT after 20s');
                clearInterval(checkIceState);
                reject(new Error('Connection timeout. Game may not exist.'));
            }
        }, 20000);
    });
}

// Set up connection event handlers
function setupConnection(conn) {
    conn.on('data', (data) => {
        handleMessage(data);
    });

    conn.on('close', () => {
        console.log('Connection closed');
        currentConnection = null;
        // Notify handlers
        const handler = messageHandlers.get('_disconnect');
        if (handler) handler();
    });

    conn.on('error', (err) => {
        console.error('Connection error:', err);
    });
}

// Handle incoming messages
function handleMessage(data) {
    if (data && data.type) {
        const handler = messageHandlers.get(data.type);
        if (handler) {
            handler(data.payload);
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

// Send a message to the connected peer
export function sendMessage(type, payload) {
    if (currentConnection && currentConnection.open) {
        currentConnection.send({ type, payload });
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

// Check if connected
export function isConnected() {
    return currentConnection && currentConnection.open;
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
    if (currentConnection) {
        currentConnection.close();
        currentConnection = null;
    }
    clearConnectionHandler();
    if (peer && !keepPeer) {
        peer.destroy();
        peer = null;
    }
    messageHandlers.clear();
    isHost = false;
}

// Export peer instance for advanced usage
export { peer };
