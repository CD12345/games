// Game page entry point - P2P version

import { getCurrentSession, leaveGame } from './core/gameSession.js';
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
        isHost: params.get('host') === 'true'
    };
}

// Show status
function showStatus(message) {
    statusMessage.textContent = message;
    statusOverlay.classList.remove('hidden');
    errorOverlay.classList.add('hidden');
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
}

// Initialize
async function init() {
    const params = getURLParams();
    gameCode = params.code;
    isHost = params.isHost;

    if (!gameCode) {
        showError('No game code provided.');
        return;
    }

    showStatus('Loading game...');

    try {
        // Get session info (should still exist from lobby)
        const session = getCurrentSession();

        if (!session) {
            showError('Session not found. Please rejoin from the lobby.');
            return;
        }

        if (session.status !== 'playing') {
            showError('Game is not in progress.');
            return;
        }

        const playerNumber = isHost ? 1 : 2;

        // Get game class
        const GameClass = GameRegistry.getGameClass(session.gameType);
        if (!GameClass) {
            showError(`Unknown game type: ${session.gameType}`);
            return;
        }

        // Set up responsive canvas
        const gameConfig = GameRegistry.getGame(session.gameType);
        const aspectRatio = gameConfig?.id === 'pong' ? PONG_CONFIG.aspectRatio : 9 / 16;
        responsiveCanvas = new ResponsiveCanvas(canvas, aspectRatio);

        // Create game instance
        gameInstance = new GameClass(canvas, gameCode, isHost, playerNumber);

        // Initialize and start game
        await gameInstance.initialize();
        hideStatus();
        gameInstance.start();

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
    leaveGame();
}

// Event listeners
btnBackHome.addEventListener('click', () => {
    cleanup();
    window.location.href = 'index.html';
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
