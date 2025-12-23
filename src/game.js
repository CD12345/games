// Game page entry point - P2P version

import { leaveGame } from './core/gameSession.js';
import {
    initPeer,
    waitForConnection,
    connectToPeer,
    onMessage,
    offMessage,
    sendMessage
} from './core/peer.js';
import { GameRegistry } from './games/GameRegistry.js';
import { ResponsiveCanvas } from './ui/responsive.js';
import { PONG_CONFIG } from './games/pong/config.js';

// Import games
import './games/pong/index.js';

// DOM Elements
const canvas = document.getElementById('game-canvas');
const statusOverlay = document.getElementById('status-overlay');
const statusMessage = document.getElementById('status-message');
const errorOverlay = document.getElementById('error-overlay');
const errorMessage = document.getElementById('error-message');
const btnBackHome = document.getElementById('btn-back-home');
const gameoverOverlay = document.getElementById('gameover-overlay');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverMessage = document.getElementById('gameover-message');
const btnPlayAgain = document.getElementById('btn-play-again');
const btnBackMenu = document.getElementById('btn-back-menu');

// State
let gameCode = null;
let isHost = false;
let gameInstance = null;
let responsiveCanvas = null;

// Get parameters from URL
function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        code: params.get('code'),
        host: params.get('host'),
        gameType: params.get('game')
    };
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

async function connectForGame(code, host) {
    if (host) {
        showStatus('Waiting for player to connect...');
        await initHostPeer(code);
        await waitForConnection();
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

function showGameOver(winnerId, playerNumber) {
    const isWinner = (winnerId === 'p1' && playerNumber === 1) ||
        (winnerId === 'p2' && playerNumber === 2);
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
    cleanup();
    clearStoredSession();
    window.location.href = 'index.html';
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

    if (!gameCode) {
        showError('No game code provided.');
        return;
    }

    if (!gameType) {
        showError('Game type not found. Please rejoin from the lobby.');
        return;
    }

    showStatus('Preparing game...');

    try {
        await connectForGame(gameCode, isHost);

        const playerNumber = isHost ? 1 : 2;

        // Get game class
        const GameClass = GameRegistry.getGameClass(gameType);
        if (!GameClass) {
            showError(`Unknown game type: ${gameType}`);
            return;
        }

        // Set up responsive canvas
        const gameConfig = GameRegistry.getGame(gameType);
        const aspectRatio = gameConfig?.id === 'pong' ? PONG_CONFIG.aspectRatio : 9 / 16;
        responsiveCanvas = new ResponsiveCanvas(canvas, aspectRatio);

        // Create game instance
        gameInstance = new GameClass(canvas, gameCode, isHost, playerNumber);
        gameInstance.onGameOver = (winnerId) => showGameOver(winnerId, playerNumber);
        gameInstance.onGameReset = hideGameOver;

        // Initialize and start game
        await gameInstance.initialize();
        hideStatus();
        gameInstance.start();

        onMessage('return_to_menu', () => {
            returnToMenu(false);
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
    leaveGame();
}

// Event listeners
btnBackHome.addEventListener('click', () => {
    returnToMenu(true);
});

btnBackMenu.addEventListener('click', () => {
    returnToMenu(true);
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
