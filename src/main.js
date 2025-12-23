// Main application entry point

import {
    createGame,
    joinGame,
    subscribeToPlayers,
    subscribeToGame,
    startGame,
    leaveGame
} from './core/gameSession.js';
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

// Import and register games
import './games/pong/index.js';

// DOM Elements
const screens = {
    mainMenu: document.getElementById('main-menu'),
    joinScreen: document.getElementById('join-screen'),
    selectGame: document.getElementById('select-game-screen'),
    lobby: document.getElementById('lobby-screen'),
    loading: document.getElementById('loading-screen')
};

const elements = {
    btnCreate: document.getElementById('btn-create'),
    btnJoin: document.getElementById('btn-join'),
    btnBackJoin: document.getElementById('btn-back-join'),
    btnBackSelect: document.getElementById('btn-back-select'),
    btnBackLobby: document.getElementById('btn-back-lobby'),
    joinCode: document.getElementById('join-code'),
    btnJoinSubmit: document.getElementById('btn-join-submit'),
    joinError: document.getElementById('join-error'),
    gameList: document.getElementById('game-list'),
    lobbyGameName: document.getElementById('lobby-game-name'),
    lobbyCode: document.getElementById('lobby-code'),
    btnCopyCode: document.getElementById('btn-copy-code'),
    codeDisplay: document.querySelector('.code-display'),
    codeHint: document.querySelector('.code-hint'),
    playerList: document.getElementById('player-list'),
    btnStartGame: document.getElementById('btn-start-game'),
    loadingMessage: document.getElementById('loading-message'),
    btnJoinOffer: document.getElementById('btn-join-offer')
};

// State
let currentScreen = 'mainMenu';
let currentGameCode = null;
let currentGameType = null;
let isHost = false;
let playersUnsubscribe = null;
let gameUnsubscribe = null;
let pendingOffer = null;
let sessionLinkReady = false;

function storeSession() {
    if (!currentGameCode || !currentGameType) {
        return;
    }

    const payload = {
        code: currentGameCode,
        gameType: currentGameType,
        isHost
    };

    sessionStorage.setItem('gameSession', JSON.stringify(payload));
}

function clearStoredSession() {
    sessionStorage.removeItem('gameSession');
    sessionStorage.removeItem('pendingOffer');
}

function buildGameUrl() {
    const code = encodeURIComponent(currentGameCode || '');
    const host = encodeURIComponent(String(isHost));
    const game = encodeURIComponent(currentGameType || '');
    return `game.html?code=${code}&host=${host}&game=${game}`;
}

function getPairInfo() {
    const code = sessionStorage.getItem('pairCode');
    const role = sessionStorage.getItem('pairIsHost');
    if (!code || role === null) {
        return null;
    }
    return {
        code,
        isHost: role === 'true'
    };
}

function storePendingOffer(offer) {
    pendingOffer = offer;
    sessionStorage.setItem('pendingOffer', JSON.stringify(offer));
}

function loadPendingOffer() {
    const raw = sessionStorage.getItem('pendingOffer');
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

// Screen management
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
    currentScreen = screenName;
}

function showLoading(message = 'Loading...') {
    elements.loadingMessage.textContent = message;
    showScreen('loading');
}

function showJoinOffer(offer) {
    const game = GameRegistry.getGame(offer.gameType);
    if (!game) {
        return;
    }

    storePendingOffer(offer);
    elements.btnJoinOffer.textContent = `Join ${game.name}`;
    elements.btnJoinOffer.classList.remove('hidden');
}

function clearJoinOffer() {
    pendingOffer = null;
    sessionStorage.removeItem('pendingOffer');
    elements.btnJoinOffer.classList.add('hidden');
}

async function setupSessionLink() {
    const pairInfo = getPairInfo();
    if (!pairInfo) {
        return;
    }

    try {
        if (pairInfo.isHost) {
            await initPeer(pairInfo.code);
            await waitForConnection();
        } else {
            await initPeer();
            await connectToPeer(pairInfo.code);
        }
        sessionLinkReady = true;
    } catch (error) {
        console.warn('Session link failed:', error);
        sessionLinkReady = false;
    }

    onMessage('game_offer', (offer) => {
        if (!offer?.gameType) {
            return;
        }
        showJoinOffer(offer);
    });

    onMessage('game_request', async (request) => {
        if (!pairInfo.isHost || !request?.gameType) {
            return;
        }
        await handleCreateGame(request.gameType, { fromRequest: true });
    });

    onMessage('return_to_menu', () => {
        handleLeaveLobby(false);
        showScreen('mainMenu');
    });
}

// Initialize app
function init() {
    // No backend initialization needed for P2P
    showScreen('mainMenu');
    setupEventListeners();
    setupSessionLink();

    const existingOffer = loadPendingOffer();
    if (existingOffer) {
        showJoinOffer(existingOffer);
    }
}

// Event listeners
function setupEventListeners() {
    // Main menu
    elements.btnCreate.addEventListener('click', () => {
        populateGameList();
        showScreen('selectGame');
    });

    elements.btnJoin.addEventListener('click', () => {
        elements.joinCode.value = '';
        elements.joinError.textContent = '';
        elements.btnJoinSubmit.disabled = true;
        showScreen('joinScreen');
    });

    // Back buttons
    elements.btnBackJoin.addEventListener('click', () => showScreen('mainMenu'));
    elements.btnBackSelect.addEventListener('click', () => showScreen('mainMenu'));
    elements.btnBackLobby.addEventListener('click', () => handleLeaveLobby(true));

    // Join screen
    elements.joinCode.addEventListener('input', (e) => {
        const value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
        e.target.value = value;
        elements.btnJoinSubmit.disabled = value.length !== 4;
        elements.joinError.textContent = '';
    });

    elements.btnJoinSubmit.addEventListener('click', handleJoinGame);

    // Also submit on enter
    elements.joinCode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !elements.btnJoinSubmit.disabled) {
            handleJoinGame();
        }
    });

    // Lobby
    elements.btnCopyCode.addEventListener('click', handleCopyCode);
    elements.btnStartGame.addEventListener('click', handleStartGame);

    // Join offer
    elements.btnJoinOffer.addEventListener('click', handleJoinOffer);
}

// Populate game list for selection
function populateGameList() {
    const games = GameRegistry.getGameList();
    elements.gameList.innerHTML = '';

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <h3>${game.icon} ${game.name}</h3>
            <p>${game.description}</p>
            <div class="player-count">${game.minPlayers}-${game.maxPlayers} players</div>
        `;
        card.addEventListener('click', () => handleCreateGame(game.id));
        elements.gameList.appendChild(card);
    });
}

// Handle game creation
async function handleCreateGame(gameType, options = {}) {
    const pairInfo = getPairInfo();
    if (!options.fromRequest && pairInfo && !pairInfo.isHost) {
        if (sessionLinkReady) {
            showLoading('Waiting for host...');
            sendMessage('game_request', { gameType });
            return;
        }
        alert('Host is not connected yet. Try again in a moment.');
        return;
    }

    showLoading('Creating game...');

    try {
        const result = await createGame(gameType);
        currentGameCode = result.code;
        isHost = result.isHost;
        enterLobby(gameType);
        clearJoinOffer();

        if (sessionLinkReady && isConnected()) {
            sendMessage('game_offer', { gameType, code: currentGameCode });
        }
    } catch (error) {
        console.error('Create game error:', error);
        showScreen('selectGame');
        alert('Failed to create game: ' + error.message);
    }
}

// Handle joining a game
async function handleJoinGame() {
    const code = elements.joinCode.value;
    showLoading('Joining game...');

    try {
        const result = await joinGame(code);
        currentGameCode = result.code;
        isHost = result.isHost;
        enterLobby(result.gameType);
        clearJoinOffer();
    } catch (error) {
        console.error('Join game error:', error);
        showScreen('joinScreen');
        elements.joinError.textContent = error.message;
    }
}

async function handleJoinOffer() {
    if (!pendingOffer) {
        return;
    }

    const pairInfo = getPairInfo();
    const offerCode = pendingOffer?.code || pairInfo?.code;
    if (!offerCode) {
        elements.joinError.textContent = 'Session code missing.';
        return;
    }

    showLoading('Joining game...');

    try {
        const result = await joinGame(offerCode);
        currentGameCode = result.code;
        isHost = result.isHost;
        enterLobby(result.gameType);
        clearJoinOffer();
    } catch (error) {
        console.error('Join offer error:', error);
        showScreen('mainMenu');
        alert('Failed to join game: ' + error.message);
    }
}

// Enter the lobby
function enterLobby(gameType) {
    currentGameType = gameType;
    const game = GameRegistry.getGame(gameType);
    elements.lobbyGameName.textContent = `${game.icon} ${game.name}`;
    elements.lobbyCode.textContent = currentGameCode;
    storeSession();

    const isLinked = sessionStorage.getItem('sessionLinked') === 'true';
    if (elements.codeDisplay && elements.codeHint) {
        if (isLinked) {
            elements.codeDisplay.classList.add('hidden');
            elements.codeHint.classList.add('hidden');
        } else {
            elements.codeDisplay.classList.remove('hidden');
            elements.codeHint.classList.remove('hidden');
        }
    }

    // Subscribe to player updates
    if (playersUnsubscribe) playersUnsubscribe();
    playersUnsubscribe = subscribeToPlayers(currentGameCode, updatePlayerList);

    // Subscribe to game status (to know when host starts the game)
    if (gameUnsubscribe) gameUnsubscribe();
    gameUnsubscribe = subscribeToGame(currentGameCode, (gameData) => {
        if (gameData && gameData.status === 'playing') {
            // Game has started - redirect to game page
            storeSession();
            window.location.href = buildGameUrl();
        }
    });

    showScreen('lobby');
}

// Update player list in lobby
function updatePlayerList(players) {
    if (!players) {
        elements.playerList.innerHTML = '<p>No players connected</p>';
        return;
    }

    const game = GameRegistry.getGame(currentGameType);

    elements.playerList.innerHTML = '';
    let connectedCount = 0;

    Object.entries(players).forEach(([playerId, player]) => {
        const div = document.createElement('div');
        div.className = `player-item${player.isHost ? ' host' : ''}`;

        // Mark our own entry
        const isYou = (player.isHost && isHost) || (!player.isHost && !isHost);
        const nameText = `${player.name}${isYou ? ' (You)' : ''}`;

        div.innerHTML = `
            <span>${nameText}</span>
            <div class="status${player.connected ? '' : ' disconnected'}"></div>
        `;
        elements.playerList.appendChild(div);

        if (player.connected) connectedCount++;
    });

    const isLinked = sessionStorage.getItem('sessionLinked') === 'true';
    if (elements.codeDisplay && elements.codeHint && isLinked) {
        elements.codeDisplay.classList.add('hidden');
        elements.codeHint.classList.add('hidden');
    }

    // Update start button
    if (isHost) {
        const minPlayers = game?.minPlayers || 2;
        if (connectedCount >= minPlayers) {
            elements.btnStartGame.disabled = false;
            elements.btnStartGame.textContent = 'Start Game';
        } else {
            elements.btnStartGame.disabled = true;
            elements.btnStartGame.textContent = `Waiting for players (${connectedCount}/${minPlayers})...`;
        }
    } else {
        elements.btnStartGame.disabled = true;
        elements.btnStartGame.textContent = 'Waiting for host to start...';
    }
}

// Copy code to clipboard
async function handleCopyCode() {
    try {
        await navigator.clipboard.writeText(currentGameCode);
        elements.btnCopyCode.textContent = '✓';
        setTimeout(() => {
            elements.btnCopyCode.textContent = '📋';
        }, 2000);
    } catch (error) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = currentGameCode;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        elements.btnCopyCode.textContent = '✓';
        setTimeout(() => {
            elements.btnCopyCode.textContent = '📋';
        }, 2000);
    }
}

// Start the game
async function handleStartGame() {
    try {
        elements.btnStartGame.disabled = true;
        elements.btnStartGame.textContent = 'Starting...';
        storeSession();
        await startGame(currentGameCode);

        // Navigate to game page (host also redirects here)
        window.location.href = buildGameUrl();
    } catch (error) {
        console.error('Start game error:', error);
        alert('Failed to start game: ' + error.message);
        elements.btnStartGame.disabled = false;
        elements.btnStartGame.textContent = 'Start Game';
    }
}

// Leave lobby
function handleLeaveLobby(notifyPeer = true) {
    if (playersUnsubscribe) {
        playersUnsubscribe();
        playersUnsubscribe = null;
    }

    if (gameUnsubscribe) {
        gameUnsubscribe();
        gameUnsubscribe = null;
    }

    if (notifyPeer && sessionLinkReady && isConnected()) {
        sendMessage('return_to_menu', {});
    }

    leaveGame();
    clearStoredSession();
    currentGameCode = null;
    currentGameType = null;
    isHost = false;
    showScreen('mainMenu');
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    leaveGame();
});

// Start the app
init();
