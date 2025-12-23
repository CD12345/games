// Game session management using PeerJS P2P connections

import {
    initPeer,
    waitForConnection,
    connectToPeer,
    sendMessage,
    onMessage,
    offMessage,
    isConnected,
    getIsHost,
    getPeerId,
    disconnect
} from './peer.js';
import { generateCode, isValidCodeFormat, normalizeCode } from './codeGenerator.js';
import { GameRegistry } from '../games/GameRegistry.js';

// Session state
let currentSession = null;
let playerUpdateCallback = null;
let gameStatusCallback = null;

// Create a new game session (as host)
export async function createGame(gameType) {
    const gameConfig = GameRegistry.getGame(gameType);
    if (!gameConfig) {
        throw new Error(`Unknown game type: ${gameType}`);
    }

    const existingCode = sessionStorage.getItem('pairCode');
    const existingHost = sessionStorage.getItem('pairIsHost') === 'true';
    const sessionLinked = sessionStorage.getItem('sessionLinked') === 'true';

    // Generate a unique code and use it as the peer ID (reuse session code when linked)
    let code = null;
    let attempts = 0;

    if (sessionLinked && existingHost && existingCode) {
        code = existingCode;
        await initPeer(code);
        waitForConnection();
    } else {
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

    currentSession = {
        code,
        gameType,
        isHost: true,
        status: 'waiting',
        players: {
            host: {
                name: 'Player 1',
                connected: true,
                isHost: true
            }
        }
    };

    sessionStorage.setItem('pairCode', code);
    sessionStorage.setItem('pairIsHost', 'true');

    // Wait for guest to connect
    setupHostListeners();

    return {
        code,
        gameType,
        isHost: true
    };
}

// Join an existing game (as guest)
export async function joinGame(code) {
    code = normalizeCode(code);
    if (!isValidCodeFormat(code)) {
        throw new Error('Invalid code format');
    }

    // Initialize our peer (with random ID)
    await initPeer();

    // Connect to the host
    await connectToPeer(code);

    // Request game info from host
    sendMessage('join_request', { name: 'Player 2' });

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

            currentSession = {
                code,
                gameType: data.gameType,
                isHost: false,
                status: 'waiting',
                players: data.players
            };

            sessionStorage.setItem('pairCode', code);
            sessionStorage.setItem('pairIsHost', 'false');
            sessionStorage.setItem('sessionLinked', 'true');

            setupGuestListeners();

            resolve({
                code,
                gameType: data.gameType,
                isHost: false
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
    onMessage('join_request', (data) => {
        // Accept the guest
        currentSession.players.guest = {
            name: data.name || 'Player 2',
            connected: true,
            isHost: false
        };

        sessionStorage.setItem('sessionLinked', 'true');

        // Send acceptance with game info
        sendMessage('join_accepted', {
            gameType: currentSession.gameType,
            players: currentSession.players
        });

        // Notify local UI
        if (playerUpdateCallback) {
            playerUpdateCallback(currentSession.players);
        }
    });

    onMessage('_disconnect', () => {
        if (currentSession?.players?.guest) {
            currentSession.players.guest.connected = false;
            if (playerUpdateCallback) {
                playerUpdateCallback(currentSession.players);
            }
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
export function leaveGame() {
    disconnect();
    currentSession = null;
    playerUpdateCallback = null;
    gameStatusCallback = null;
}

// Start the game (host only)
export async function startGame(code) {
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

    // Notify guest
    sendMessage('game_start', { initialState });

    // Notify local callback
    if (gameStatusCallback) {
        gameStatusCallback({ status: 'playing', initialState });
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

// Send game state update (host -> guest)
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

// Check if user is host
export function isUserHost() {
    return currentSession?.isHost || false;
}

// Get game info
export async function getGameInfo(code) {
    return currentSession;
}
