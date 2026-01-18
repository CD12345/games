// Game session management using PeerJS P2P connections
// Supports multiple guests with unique player numbers

import {
    initPeer,
    waitForConnection,
    connectToPeer,
    sendMessage,
    sendMessageTo,
    onMessage,
    offMessage,
    isConnected,
    getIsHost,
    getPeerId,
    disconnect,
    onGuestConnect,
    onGuestDisconnect,
    getGuestPeerIds
} from './peer.js';
import { generateCode, isValidCodeFormat, normalizeCode } from './codeGenerator.js';
import { GameRegistry } from '../games/GameRegistry.js';

// Session state
let currentSession = null;
let playerUpdateCallback = null;
let gameStatusCallback = null;

// Map of peerId -> playerNumber (host only)
let peerPlayerMap = new Map();
let nextPlayerNumber = 2;  // Host is always player 1

// Create a new game session (as host)
export async function createGame(gameType, playerName, options = {}) {
    const gameConfig = GameRegistry.getGame(gameType);
    if (!gameConfig) {
        throw new Error(`Unknown game type: ${gameType}`);
    }

    const existingCode = sessionStorage.getItem('pairCode');
    const existingHost = sessionStorage.getItem('pairIsHost') === 'true';
    const preferredCode = options.code || null;

    // Reset player tracking
    peerPlayerMap.clear();
    nextPlayerNumber = 2;

    // Generate a unique code and use it as the peer ID (reuse session code when linked)
    let code = null;
    let attempts = 0;

    if (preferredCode) {
        code = preferredCode;
        try {
            await initPeer(code);
            waitForConnection();
        } catch (error) {
            if (error?.message?.includes('already in use')) {
                throw new Error('Game code already in use. Please wait a moment and try again.');
            } else {
                throw error;
            }
        }
    } else if (existingHost && existingCode) {
        code = existingCode;
        try {
            await initPeer(code);
            waitForConnection();
        } catch (error) {
            if (error?.message?.includes('already in use')) {
                throw new Error('Game code already in use. Please wait a moment and try again.');
            } else {
                throw error;
            }
        }
    }

    if (!code) {
        while (attempts < 5) {
            code = generateCode();
            try {
                await initPeer(code);
                // Start listening for incoming connections from guests.
                waitForConnection();
                break;
            } catch (error) {
                if (error.message.includes('already in use')) {
                    attempts++;
                    continue;
                }
                throw error;
            }
        }

        if (attempts >= 5) {
            throw new Error('Unable to generate unique code. Try again.');
        }
    }

    const hostName = playerName || 'Player 1';
    currentSession = {
        code,
        gameType,
        isHost: true,
        playerNumber: 1,  // Host is always player 1
        status: 'waiting',
        players: {
            p1: {
                name: hostName,
                peerId: code,
                connected: true,
                isHost: true,
                playerNumber: 1
            }
        }
    };

    sessionStorage.setItem('pairCode', code);
    sessionStorage.setItem('pairIsHost', 'true');
    sessionStorage.setItem('playerNumber', '1');

    // Wait for guest to connect
    setupHostListeners();

    return {
        code,
        gameType,
        isHost: true,
        playerNumber: 1
    };
}

// Join an existing game (as guest)
export async function joinGame(code, playerName) {
    code = normalizeCode(code);
    if (!isValidCodeFormat(code)) {
        throw new Error('Invalid code format');
    }

    // Initialize our peer (with random ID)
    const peerId = await initPeer();

    // Connect to the host
    await connectToPeer(code);

    // Request game info from host
    sendMessage('join_request', { name: playerName || 'Player', peerId });

    // Wait for acceptance
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            offMessage('join_accepted');
            offMessage('join_rejected');
            reject(new Error('Join request timeout'));
        }, 10000);

        onMessage('join_accepted', (data) => {
            clearTimeout(timeout);
            offMessage('join_accepted');
            offMessage('join_rejected');

            const playerNumber = data.playerNumber;

            currentSession = {
                code,
                gameType: data.gameType,
                isHost: false,
                playerNumber,
                status: 'waiting',
                players: data.players
            };

            sessionStorage.setItem('pairCode', code);
            sessionStorage.setItem('pairIsHost', 'false');
            sessionStorage.setItem('playerNumber', String(playerNumber));
            sessionStorage.setItem('sessionLinked', 'true');

            setupGuestListeners();

            resolve({
                code,
                gameType: data.gameType,
                isHost: false,
                playerNumber
            });
        });

        onMessage('join_rejected', (data) => {
            clearTimeout(timeout);
            offMessage('join_accepted');
            offMessage('join_rejected');
            reject(new Error(data.reason || 'Join request rejected'));
        });
    });
}

// Host: Set up listeners for guest actions
function setupHostListeners() {
    // Handle join requests - now includes fromPeerId
    onMessage('join_request', (data, fromPeerId) => {
        const gameConfig = GameRegistry.getGame(currentSession.gameType);
        const maxPlayers = gameConfig?.maxPlayers || 6;

        // Check if we have room for more players
        const currentPlayerCount = Object.keys(currentSession.players).length;
        if (currentPlayerCount >= maxPlayers) {
            sendMessageTo(fromPeerId, 'join_rejected', { reason: 'Game is full' });
            return;
        }

        // Assign player number
        const playerNumber = nextPlayerNumber++;
        const playerId = `p${playerNumber}`;

        // Track peer -> player mapping
        peerPlayerMap.set(fromPeerId, playerNumber);

        // Add to players list
        currentSession.players[playerId] = {
            name: data.name || `Player ${playerNumber}`,
            peerId: fromPeerId,
            connected: true,
            isHost: false,
            playerNumber
        };

        sessionStorage.setItem('sessionLinked', 'true');

        // Send acceptance with player number to this specific guest
        sendMessageTo(fromPeerId, 'join_accepted', {
            gameType: currentSession.gameType,
            players: currentSession.players,
            playerNumber
        });

        // Broadcast updated player list to all guests
        sendMessage('players_update', currentSession.players);

        // Notify local UI
        if (playerUpdateCallback) {
            playerUpdateCallback(currentSession.players);
        }
    });

    // Handle disconnections - now includes peerId info
    onMessage('_disconnect', (data) => {
        const peerId = data?.peerId;
        if (!peerId) return;

        const playerNumber = peerPlayerMap.get(peerId);
        if (playerNumber) {
            const playerId = `p${playerNumber}`;
            if (currentSession?.players?.[playerId]) {
                currentSession.players[playerId].connected = false;

                // Broadcast updated player list
                sendMessage('players_update', currentSession.players);

                if (playerUpdateCallback) {
                    playerUpdateCallback(currentSession.players);
                }
            }
            peerPlayerMap.delete(peerId);
        }
    });
}

// Guest: Set up listeners for host messages
function setupGuestListeners() {
    onMessage('players_update', (players) => {
        if (currentSession) {
            currentSession.players = players;
        }
        if (playerUpdateCallback) {
            playerUpdateCallback(players);
        }
    });

    onMessage('game_start', (data) => {
        if (currentSession) {
            currentSession.status = 'playing';
            currentSession.initialState = data.initialState;
        }
        if (gameStatusCallback) {
            gameStatusCallback({ status: 'playing', initialState: data.initialState });
        }
    });

    onMessage('_disconnect', () => {
        if (gameStatusCallback) {
            gameStatusCallback({ status: 'disconnected' });
        }
    });
}

// Leave the current game
export function leaveGame(options = {}) {
    disconnect({ keepPeer: options.keepPeer === true });
    currentSession = null;
    playerUpdateCallback = null;
    gameStatusCallback = null;
    peerPlayerMap.clear();
    nextPlayerNumber = 2;
}

// Start the game (host only)
export async function startGame(code, settings = {}) {
    if (!currentSession?.isHost) {
        throw new Error('Only the host can start the game');
    }

    if (currentSession.status !== 'waiting') {
        throw new Error('Game already started');
    }

    const gameConfig = GameRegistry.getGame(currentSession.gameType);
    const playerCount = Object.values(currentSession.players).filter(p => p.connected).length;

    if (playerCount < gameConfig.minPlayers) {
        throw new Error(`Need at least ${gameConfig.minPlayers} players to start`);
    }

    const initialState = gameConfig.getInitialState ? gameConfig.getInitialState() : {};
    currentSession.status = 'playing';
    currentSession.initialState = initialState;
    currentSession.settings = settings;

    // Notify all guests
    sendMessage('game_start', { initialState, settings });

    // Notify local callback
    if (gameStatusCallback) {
        gameStatusCallback({ status: 'playing', initialState, settings });
    }
}

// Subscribe to player updates
export function subscribeToPlayers(code, callback) {
    playerUpdateCallback = callback;

    // Immediately call with current players
    if (currentSession?.players) {
        callback(currentSession.players);
    }

    // Return unsubscribe function
    return () => {
        playerUpdateCallback = null;
    };
}

// Subscribe to game status changes
export function subscribeToGame(code, callback) {
    gameStatusCallback = callback;

    // Return unsubscribe function
    return () => {
        gameStatusCallback = null;
    };
}

// Subscribe to game state (for gameplay)
export function subscribeToState(code, callback) {
    onMessage('state_update', callback);
    return () => offMessage('state_update');
}

// Subscribe to inputs (for host to receive guest inputs)
export function subscribeToInputs(code, callback) {
    onMessage('input_update', callback);
    return () => offMessage('input_update');
}

// Send game state update (host -> guests)
export function sendStateUpdate(state) {
    sendMessage('state_update', state);
}

// Send input update (guest -> host)
export function sendInputUpdate(input) {
    sendMessage('input_update', input);
}

// Get current session info
export function getCurrentSession() {
    return currentSession;
}

// Get player number for this client
export function getPlayerNumber() {
    return currentSession?.playerNumber || parseInt(sessionStorage.getItem('playerNumber')) || 1;
}

// Get player number for a peer ID (host only)
export function getPlayerNumberForPeer(peerId) {
    return peerPlayerMap.get(peerId) || null;
}

// Check if user is host
export function isUserHost() {
    return currentSession?.isHost || false;
}

// Get game info
export async function getGameInfo(code) {
    return currentSession;
}
