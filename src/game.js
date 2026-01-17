// Game page entry point - P2P version

import { leaveGame } from './core/gameSession.js';
import {
    initPeer,
    waitForConnection,
    connectToPeer,
    onMessage,
    offMessage,
    sendMessage,
    isConnected
} from './core/peer.js';
import { GameRegistry } from './games/GameRegistry.js';
import { ResponsiveCanvas } from './ui/responsive.js';
import { PONG_CONFIG } from './games/pong/config.js';
import { getBasePath } from './ui/url.js';

// Import games
import './games/pong/index.js';
import './games/debug/index.js';
import './games/liquidwar/index.js';
import './games/hextd/index.js';
import './games/historyrpg/index.js';

// DOM Elements
const canvas = document.getElementById('game-canvas');
const statusOverlay = document.getElementById('status-overlay');
const statusMessage = document.getElementById('status-message');
const errorOverlay = document.getElementById('error-overlay');
const errorMessage = document.getElementById('error-message');
const btnBackHome = document.getElementById('btn-back-home');
const btnForfeit = document.getElementById('btn-forfeit');
const gameoverOverlay = document.getElementById('gameover-overlay');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverMessage = document.getElementById('gameover-message');
const btnPlayAgain = document.getElementById('btn-play-again');
const btnBackMenu = document.getElementById('btn-back-menu');
const gameCodeDisplay = document.getElementById('game-code-display');

// State
let gameCode = null;
let isHost = false;
let gameSettings = {};
let gameInstance = null;
let responsiveCanvas = null;
let reconnectTimer = null;
let reconnectInFlight = false;
let reconnecting = false;

// Get parameters from URL
function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        code: params.get('code'),
        host: params.get('host'),
        gameType: params.get('game')
    };
}

function forceRootPath(code) {
    const url = new URL(window.location.href);
    let updated = false;
    if (code !== undefined) {
        const upperCode = (code || '').toUpperCase();
        if (url.searchParams.get('code') !== upperCode) {
            url.searchParams.set('code', upperCode);
            updated = true;
        }
    }
    if (updated) {
        window.history.replaceState({}, '', url.toString());
    }
}

function getStoredSession() {
    const raw = sessionStorage.getItem('gameSession');
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.warn('Failed to parse stored session:', error);
        return null;
    }
}

function clearStoredSession() {
    sessionStorage.removeItem('gameSession');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function initHostPeer(code) {
    let lastError = null;

    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            await initPeer(code);
            return;
        } catch (error) {
            lastError = error;
            if (!error?.message?.toLowerCase().includes('already in use')) {
                throw error;
            }
            await delay(250);
        }
    }

    throw lastError || new Error('Unable to reclaim game code.');
}

async function connectGuestToHost(code) {
    let lastError = null;

    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            await connectToPeer(code);
            return;
        } catch (error) {
            lastError = error;
            await delay(300);
        }
    }

    throw lastError || new Error('Unable to connect to host.');
}

async function connectForGame(code, host, skipWait = false) {
    if (host) {
        await initHostPeer(code);
        if (!skipWait) {
            showStatus('Waiting for player to connect...');
            await waitForConnection();
        }
        return;
    }

    showStatus('Connecting to host...');
    await initPeer();
    await connectGuestToHost(code);
}

// Show status
function showStatus(message) {
    statusMessage.textContent = message;
    statusOverlay.classList.remove('hidden');
    errorOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');
}

// Hide status
function hideStatus() {
    statusOverlay.classList.add('hidden');
}

// Show error
function showError(message) {
    errorMessage.textContent = message;
    errorOverlay.classList.remove('hidden');
    statusOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');
}

function showConnectionLost() {
    errorMessage.textContent = 'Connection lost. Retrying...';
    btnBackHome.textContent = 'Back to Menu';
    errorOverlay.classList.remove('hidden');
    statusOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');
}

function hideConnectionLost() {
    errorOverlay.classList.add('hidden');
}

function stopReconnectLoop() {
    reconnecting = false;
    reconnectInFlight = false;
    if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
    }
    hideConnectionLost();
    if (gameInstance && !document.hidden) {
        gameInstance.start();
    }
}

async function attemptReconnect() {
    if (!reconnecting || reconnectInFlight) {
        return;
    }
    if (isConnected()) {
        stopReconnectLoop();
        return;
    }
    reconnectInFlight = true;
    try {
        if (isHost) {
            await waitForConnection();
        } else {
            await connectToPeer(gameCode);
        }
        stopReconnectLoop();
    } catch (error) {
        reconnectInFlight = false;
    }
}

function startReconnectLoop() {
    if (reconnecting) {
        return;
    }
    reconnecting = true;
    showConnectionLost();
    if (gameInstance) {
        gameInstance.pause();
    }
    attemptReconnect();
    reconnectTimer = setInterval(() => {
        attemptReconnect();
    }, 1000);
}

function showGameOver(result, playerNumber, playerNames) {
    const getName = (id) => playerNames?.[id] || (id === 'p1' ? 'Player 1' : 'Player 2');
    if (result?.forfeitedBy) {
        gameoverTitle.textContent = 'Game Over';
        gameoverMessage.textContent = `Game forfeited by ${getName(result.forfeitedBy)}.`;
        gameoverOverlay.classList.remove('hidden');
        return;
    }

    const isWinner = (result?.winnerId === 'p1' && playerNumber === 1) ||
        (result?.winnerId === 'p2' && playerNumber === 2);
    gameoverTitle.textContent = isWinner ? 'You Win!' : 'You Lose!';
    gameoverMessage.textContent = isWinner ? 'Nice work!' : 'Good game!';
    gameoverOverlay.classList.remove('hidden');
}

function hideGameOver() {
    gameoverOverlay.classList.add('hidden');
}

function returnToMenu(notifyPeer = true) {
    if (notifyPeer) {
        sendMessage('return_to_menu', {});
    }
    const returnCode = gameCode || '';
    const targetUrl = new URL(window.location.href);
    // Always redirect to index.html (lobby), not back to game.html
    targetUrl.pathname = getBasePath() + 'index.html';
    targetUrl.searchParams.set('code', returnCode.toUpperCase());
    targetUrl.searchParams.delete('host');
    targetUrl.searchParams.delete('game');
    cleanup();
    clearStoredSession();
    window.location.href = targetUrl.toString();
}

// Initialize
async function init() {
    const params = getURLParams();
    const storedSession = getStoredSession();

    gameCode = params.code || storedSession?.code || null;
    if (params.host === 'true') {
        isHost = true;
    } else if (params.host === 'false') {
        isHost = false;
    } else if (typeof storedSession?.isHost === 'boolean') {
        isHost = storedSession.isHost;
    }

    const gameType = params.gameType || storedSession?.gameType || null;
    gameSettings = storedSession?.settings || {};

    if (!gameCode) {
        forceRootPath('');
        showError('No game code provided.');
        return;
    }

    forceRootPath(gameCode);

    if (gameCodeDisplay) {
        gameCodeDisplay.textContent = gameCode;
    }

    if (!gameType) {
        showError('Game type not found. Please rejoin from the lobby.');
        return;
    }

    try {
        // Check if we should skip waiting for connection
        const gameConfig = GameRegistry.getGame(gameType);

        // Show status unless game has its own loading screen
        if (!gameConfig?.hasLoadingScreen) {
            showStatus('Preparing game...');
        }

        const supportsAI = gameConfig?.supportsAI === true;
        const minPlayers = gameConfig?.minPlayers || 2;
        const connectedHumans = parseInt(gameSettings.connectedHumans) || 1;
        const totalPlayers = parseInt(gameSettings.playerCount) || 2;

        // Skip wait if: single-player game, OR AI fills missing slots
        const isSinglePlayerGame = isHost && minPlayers === 1 && connectedHumans === 1;
        const aiCanFillSlots = isHost && supportsAI && connectedHumans < totalPlayers;
        const skipConnectionWait = isSinglePlayerGame || aiCanFillSlots;

        await connectForGame(gameCode, isHost, skipConnectionWait);

        const playerNumber = isHost ? 1 : 2;

        // Get game class
        const GameClass = GameRegistry.getGameClass(gameType);
        if (!GameClass) {
            showError(`Unknown game type: ${gameType}`);
            return;
        }

        // Set up responsive canvas
        // Liquid War uses 1:1 (square), Pong uses portrait, HexTD uses landscape, others default to portrait
        let aspectRatio = 9 / 16;
        if (gameConfig?.id === 'pong') {
            aspectRatio = PONG_CONFIG.aspectRatio;
        } else if (gameConfig?.id === 'liquidwar') {
            aspectRatio = 1;  // Square
        } else if (gameConfig?.id === 'hextd') {
            aspectRatio = 16 / 9;  // Landscape for RTS
        } else if (gameConfig?.id === 'historyrpg') {
            aspectRatio = 16 / 9;  // Landscape for isometric view
        }
        const container = document.getElementById('game-container');
        responsiveCanvas = new ResponsiveCanvas(canvas, aspectRatio, container);

        // Create game instance
        gameInstance = new GameClass(canvas, gameCode, isHost, playerNumber, gameSettings);
        gameInstance.onGameOver = (result) => showGameOver(
            result,
            playerNumber,
            result?.playerNames || gameInstance?.state?.playerNames
        );
        gameInstance.onGameReset = hideGameOver;
        if (typeof gameInstance.forfeit === 'function') {
            btnForfeit.classList.remove('hidden');
            btnForfeit.disabled = false;
        } else {
            btnForfeit.classList.add('hidden');
        }

        // Initialize and start game
        await gameInstance.initialize();
        hideStatus();
        gameInstance.start();

        onMessage('return_to_menu', () => {
            returnToMenu(false);
        });
        onMessage('_disconnect', () => {
            startReconnectLoop();
        });

    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to start game: ' + error.message);
    }
}

// Cleanup
function cleanup() {
    if (gameInstance) {
        gameInstance.destroy();
        gameInstance = null;
    }
    if (responsiveCanvas) {
        responsiveCanvas.destroy();
        responsiveCanvas = null;
    }
    offMessage('return_to_menu');
    offMessage('_disconnect');
    stopReconnectLoop();
    leaveGame();
}

// Copy join URL when tapping the code display
gameCodeDisplay.addEventListener('click', async () => {
    if (!gameCode) return;

    const url = new URL(window.location.href);
    url.pathname = getBasePath() + 'index.html';
    url.searchParams.set('code', gameCode.toUpperCase());
    url.searchParams.delete('host');
    url.searchParams.delete('game');
    const joinUrl = url.toString();

    try {
        await navigator.clipboard.writeText(joinUrl);
        const original = gameCodeDisplay.textContent;
        gameCodeDisplay.textContent = 'Copied!';
        gameCodeDisplay.classList.add('copied');
        setTimeout(() => {
            gameCodeDisplay.textContent = original;
            gameCodeDisplay.classList.remove('copied');
        }, 1500);
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = joinUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        const original = gameCodeDisplay.textContent;
        gameCodeDisplay.textContent = 'Copied!';
        gameCodeDisplay.classList.add('copied');
        setTimeout(() => {
            gameCodeDisplay.textContent = original;
            gameCodeDisplay.classList.remove('copied');
        }, 1500);
    }
});

// Event listeners
btnBackHome.addEventListener('click', () => {
    returnToMenu(true);
});

btnBackMenu.addEventListener('click', () => {
    returnToMenu(true);
});

btnForfeit.addEventListener('click', () => {
    if (!gameInstance) {
        return;
    }
    btnForfeit.disabled = true;
    gameInstance.forfeit();
    setTimeout(() => {
        btnForfeit.disabled = false;
    }, 1000);
});

btnPlayAgain.addEventListener('click', () => {
    if (!gameInstance) {
        return;
    }
    btnPlayAgain.disabled = true;
    gameInstance.requestRematch();
    if (!isHost) {
        gameoverMessage.textContent = 'Waiting for host to start...';
    }
    setTimeout(() => {
        btnPlayAgain.disabled = false;
    }, 1000);
});

// Handle page unload
window.addEventListener('beforeunload', cleanup);

// Handle visibility change (pause when tab hidden)
document.addEventListener('visibilitychange', () => {
    if (gameInstance) {
        if (document.hidden) {
            gameInstance.pause();
        } else {
            gameInstance.start();
        }
    }
});

// Start
init();
