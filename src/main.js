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
    btnJoinOffer: document.getElementById('btn-join-offer'),
    namePanel: document.getElementById('name-panel'),
    playerName: document.getElementById('player-name'),
    menuCodeDisplay: document.getElementById('menu-code-display')
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
let playerName = '';

const NAME_SCREENS = new Set(['mainMenu', 'joinScreen']);
const ADJECTIVES = [
    'Brave', 'Calm', 'Clever', 'Daring', 'Fierce', 'Gentle', 'Happy', 'Jolly',
    'Kind', 'Lucky', 'Mighty', 'Nimble', 'Proud', 'Quick', 'Quiet', 'Silly',
    'Smart', 'Swift', 'Witty', 'Zany'
];
const ANIMALS = [
    'Badger', 'Bear', 'Bison', 'Cat', 'Cobra', 'Deer', 'Dolphin', 'Eagle',
    'Falcon', 'Fox', 'Koala', 'Lion', 'Otter', 'Panda', 'Rabbit', 'Raven',
    'Shark', 'Tiger', 'Wolf', 'Yak'
];

function getCookie(name) {
    const prefix = `${name}=`;
    const parts = document.cookie.split(';');
    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith(prefix)) {
            return decodeURIComponent(trimmed.slice(prefix.length));
        }
    }
    return '';
}

function setCookie(name, value, days = 365) {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/`;
}

function generateName() {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `${adjective}${animal}${digits}`;
}

function normalizeName(value) {
    return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
}

function ensurePlayerName() {
    let stored = getCookie('playerName');
    if (!stored) {
        stored = generateName();
        setCookie('playerName', stored);
    }
    playerName = stored;
    if (elements.playerName) {
        elements.playerName.value = stored;
    }
}

function getEffectivePlayerName() {
    if (!playerName) {
        playerName = generateName();
        setCookie('playerName', playerName);
        if (elements.playerName) {
            elements.playerName.value = playerName;
        }
    }
    return playerName;
}

function updateNamePanelVisibility(screenName) {
    if (!elements.namePanel) return;
    elements.namePanel.classList.toggle('hidden', !NAME_SCREENS.has(screenName));
}

function setMenuCodeDisplay(code, options = {}) {
    if (!elements.menuCodeDisplay) return;
    const display = code || '';
    elements.menuCodeDisplay.textContent = display;
    if (options.updateUrl !== false) {
        const url = new URL(window.location.href);
        if (display) {
            url.searchParams.set('code', display);
        } else {
            url.searchParams.delete('code');
        }
        window.history.replaceState({}, '', url.toString());
    }
}

function getKnownCode() {
    const display = elements.menuCodeDisplay?.textContent?.trim();
    if (display) {
        return display.toUpperCase();
    }
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');
    if (urlCode) {
        return urlCode.toUpperCase();
    }
    return '';
}

function setJoinCodeValue(value) {
    if (!elements.joinCode) return;
    const cleaned = (value || '').toUpperCase().replace(/[^A-Z]/g, '');
    elements.joinCode.value = cleaned;
    elements.btnJoinSubmit.disabled = cleaned.length !== 4;
    elements.joinError.textContent = '';
    if (cleaned.length === 4) {
        setMenuCodeDisplay(cleaned);
    }
}

// Debug mode state
let debugModeHoldTimer = null;
let debugModeIndicator = null;

function isDebugMode() {
    return sessionStorage.getItem('debugMode') === 'true' ||
        localStorage.getItem('debugMode') === 'true';
}

function enableDebugMode() {
    sessionStorage.setItem('debugMode', 'true');
    localStorage.setItem('debugMode', 'true');
    showDebugIndicator();
}

function showDebugIndicator() {
    if (debugModeIndicator) return;
    debugModeIndicator = document.createElement('div');
    debugModeIndicator.textContent = 'debug mode';
    debugModeIndicator.style.cssText = `
        position: fixed;
        bottom: 8px;
        right: 8px;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        font-family: monospace;
        pointer-events: none;
        z-index: 9999;
    `;
    document.body.appendChild(debugModeIndicator);
}

function setupDebugModeActivation() {
    if (isDebugMode()) {
        showDebugIndicator();
    }

    const startHold = () => {
        debugModeHoldTimer = setTimeout(() => {
            if (!isDebugMode()) {
                enableDebugMode();
            }
        }, 5000);
    };

    const cancelHold = () => {
        if (debugModeHoldTimer) {
            clearTimeout(debugModeHoldTimer);
            debugModeHoldTimer = null;
        }
    };

    elements.btnCreate.addEventListener('mousedown', startHold);
    elements.btnCreate.addEventListener('mouseup', cancelHold);
    elements.btnCreate.addEventListener('mouseleave', cancelHold);
    elements.btnCreate.addEventListener('touchstart', startHold);
    elements.btnCreate.addEventListener('touchend', cancelHold);
    elements.btnCreate.addEventListener('touchcancel', cancelHold);
}

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
    updateNamePanelVisibility(screenName);
    if (screenName === 'joinScreen') {
        setJoinCodeValue(getKnownCode());
    }
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
    if (window.location.pathname !== '/') {
        const url = new URL(window.location.href);
        url.pathname = '/';
        window.history.replaceState({}, '', url.toString());
    }
    showScreen('mainMenu');
    ensurePlayerName();
    setupEventListeners();
    setupSessionLink();

    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');
    if (urlCode) {
        setMenuCodeDisplay(urlCode.toUpperCase(), { updateUrl: false });
    } else {
        const storedSession = sessionStorage.getItem('gameSession');
        if (storedSession) {
            try {
                const parsed = JSON.parse(storedSession);
                if (parsed?.code) {
                setMenuCodeDisplay(parsed.code, { updateUrl: false });
                }
            } catch (error) {
            setMenuCodeDisplay('', { updateUrl: false });
            }
        }
    }

    const existingOffer = loadPendingOffer();
    if (existingOffer) {
        showJoinOffer(existingOffer);
    }
}

// Event listeners
function setupEventListeners() {
    setupDebugModeActivation();
    if (elements.playerName) {
        elements.playerName.addEventListener('input', (e) => {
            const cleaned = normalizeName(e.target.value);
            e.target.value = cleaned;
            playerName = cleaned;
            if (cleaned) {
                setCookie('playerName', cleaned);
            }
        });

        elements.playerName.addEventListener('blur', (e) => {
            const cleaned = normalizeName(e.target.value);
            if (!cleaned) {
                const generated = generateName();
                playerName = generated;
                setCookie('playerName', generated);
                e.target.value = generated;
            }
        });
    }
    // Main menu
    elements.btnCreate.addEventListener('click', () => {
        populateGameList();
        showScreen('selectGame');
    });

    elements.btnJoin.addEventListener('click', () => {
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
        if (value.length === 4) {
            setMenuCodeDisplay(value);
        }
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
        const result = await createGame(gameType, getEffectivePlayerName());
        currentGameCode = result.code;
        isHost = result.isHost;
        setMenuCodeDisplay(currentGameCode);
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
        const result = await joinGame(code, getEffectivePlayerName());
        currentGameCode = result.code;
        isHost = result.isHost;
        setMenuCodeDisplay(currentGameCode);
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
        const result = await joinGame(offerCode, getEffectivePlayerName());
        currentGameCode = result.code;
        isHost = result.isHost;
        setMenuCodeDisplay(currentGameCode);
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
    setMenuCodeDisplay(currentGameCode);
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

    const keepPeer = isHost && !!currentGameCode;
    leaveGame({ keepPeer });
    clearStoredSession();
    currentGameCode = null;
    currentGameType = null;
    isHost = false;
    if (!keepPeer) {
        setMenuCodeDisplay('');
    }
    showScreen('mainMenu');
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    leaveGame();
});

// Start the app
init();
