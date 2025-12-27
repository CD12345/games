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
import { getBasePath, storeEntryPath } from './ui/url.js';

// Import and register games
import './games/pong/index.js';
import './games/debug/index.js';
import './games/liquidwar/index.js';

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
    btnNewSession: document.getElementById('btn-new-session'),
    btnBackJoin: document.getElementById('btn-back-join'),
    btnBackSelect: document.getElementById('btn-back-select'),
    btnBackLobby: document.getElementById('btn-back-lobby'),
    joinCode: document.getElementById('join-code'),
    btnJoinSubmit: document.getElementById('btn-join-submit'),
    joinError: document.getElementById('join-error'),
    gameList: document.getElementById('game-list'),
    gameOptionsPanel: document.getElementById('game-options-panel'),
    gameOptionsTitle: document.getElementById('game-options-title'),
    gameOptionsMeta: document.getElementById('game-options-meta'),
    gameOptionsList: document.getElementById('game-options-list'),
    gameOptionsEmpty: document.getElementById('game-options-empty'),
    btnCreateSelected: document.getElementById('btn-create-selected'),
    lobbyGameName: document.getElementById('lobby-game-name'),
    lobbyCode: document.getElementById('lobby-code'),
    btnCopyCode: document.getElementById('btn-copy-code'),
    codeDisplay: document.querySelector('.code-display'),
    codeHint: document.querySelector('.code-hint'),
    playerList: document.getElementById('player-list'),
    gameSettings: document.getElementById('game-settings'),
    settingsList: document.getElementById('settings-list'),
    btnStartGame: document.getElementById('btn-start-game'),
    loadingMessage: document.getElementById('loading-message'),
    btnJoinOffer: document.getElementById('btn-join-offer'),
    namePanel: document.getElementById('name-panel'),
    playerName: document.getElementById('player-name'),
    menuCodeDisplay: document.getElementById('menu-code-display'),
    lastModified: document.getElementById('last-modified')
};

// Show last modified timestamp
if (elements.lastModified) {
    const lastMod = new Date(document.lastModified);
    if (!isNaN(lastMod.getTime())) {
        elements.lastModified.textContent = lastMod.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } else {
        elements.lastModified.textContent = 'v' + Date.now().toString(36).slice(-6);
    }
}

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
let currentSettings = {}; // Current game settings values
let currentSettingsGameId = null;
let selectedGameType = null;
let selectedGameCard = null;
let lastConnectedCount = 1; // Track connected human players (host = 1)

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

function getSettingsCookieKey(gameType) {
    return `gameSettings_${gameType}`;
}

function normalizeSettings(gameType, settings) {
    const game = GameRegistry.getGame(gameType);
    const defaults = GameRegistry.getDefaultSettings(gameType);
    const normalized = { ...defaults };
    const values = settings && typeof settings === 'object' ? settings : {};

    (game?.settings || []).forEach(setting => {
        if (!(setting.id in values)) {
            return;
        }
        const value = values[setting.id];
        switch (setting.type) {
            case 'checkbox':
                if (typeof value === 'boolean') {
                    normalized[setting.id] = value;
                } else if (typeof value === 'string') {
                    normalized[setting.id] = value === 'true';
                } else {
                    normalized[setting.id] = Boolean(value);
                }
                break;
            case 'string':
                if (value === null || value === undefined) {
                    normalized[setting.id] = '';
                } else {
                    normalized[setting.id] = String(value);
                }
                break;
            case 'enum':
                if ((setting.options || []).includes(value)) {
                    normalized[setting.id] = value;
                }
                break;
        }
    });

    return normalized;
}

function loadSettingsFromCookie(gameType) {
    if (!gameType) return {};
    const raw = getCookie(getSettingsCookieKey(gameType));
    if (!raw) {
        return normalizeSettings(gameType, {});
    }
    try {
        return normalizeSettings(gameType, JSON.parse(raw));
    } catch (error) {
        return normalizeSettings(gameType, {});
    }
}

function storeSettingsToCookie(gameType, settings) {
    if (!gameType) return;
    const normalized = normalizeSettings(gameType, settings);
    setCookie(getSettingsCookieKey(gameType), JSON.stringify(normalized));
}

function setCurrentSettingsForGame(gameType, settings) {
    if (!gameType) return;
    currentSettings = normalizeSettings(gameType, settings);
    currentSettingsGameId = gameType;
}

function ensureCurrentSettings(gameType) {
    if (!gameType) return;
    if (currentSettingsGameId !== gameType) {
        setCurrentSettingsForGame(gameType, loadSettingsFromCookie(gameType));
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        url.searchParams.set('code', display);
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

    ensureCurrentSettings(currentGameType);
    const payload = {
        code: currentGameCode,
        gameType: currentGameType,
        isHost,
        settings: currentSettings
    };

    sessionStorage.setItem('gameSession', JSON.stringify(payload));
}

function clearStoredSession() {
    sessionStorage.removeItem('gameSession');
    sessionStorage.removeItem('pendingOffer');
}

function clearPairInfo() {
    sessionStorage.removeItem('pairCode');
    sessionStorage.removeItem('pairIsHost');
    sessionStorage.removeItem('sessionLinked');
    sessionLinkReady = false;
}

function buildGameUrl() {
    const code = encodeURIComponent(currentGameCode || '');
    const host = encodeURIComponent(String(isHost));
    const game = encodeURIComponent(currentGameType || '');
    return `${getBasePath()}game.html?code=${code}&host=${host}&game=${game}`;
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

async function requestHostHandoff(code) {
    if (!sessionLinkReady || !isConnected()) {
        return false;
    }

    return new Promise((resolve) => {
        let settled = false;
        const cleanup = () => {
            if (settled) return;
            settled = true;
            offMessage('handoff_ack');
        };

        const timer = setTimeout(() => {
            cleanup();
            resolve(false);
        }, 2000);

        onMessage('handoff_ack', () => {
            clearTimeout(timer);
            cleanup();
            resolve(true);
        });

        sendMessage('handoff_host', { code });
    });
}

async function createGameWithRetries(gameType, name, preferredCode) {
    const attempts = preferredCode ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await createGame(gameType, name, { code: preferredCode });
        } catch (error) {
            const isInUse = error?.message?.toLowerCase().includes('already in use');
            if (preferredCode && isInUse && attempt < attempts - 1) {
                await delay(1000);
                continue;
            }
            throw error;
        }
    }
    return null;
}

function handleNewSession() {
    clearPairInfo();
    leaveGame();
    clearStoredSession();
    clearJoinOffer();
    currentGameCode = null;
    currentGameType = null;
    isHost = false;
    resetGameSelection();
    setMenuCodeDisplay('');
    if (elements.joinCode) {
        elements.joinCode.value = '';
    }
    if (elements.joinError) {
        elements.joinError.textContent = '';
    }
    if (elements.btnJoinSubmit) {
        elements.btnJoinSubmit.disabled = true;
    }
    showScreen('mainMenu');
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

    onMessage('handoff_host', (data) => {
        const pairInfo = getPairInfo();
        if (!pairInfo?.isHost) {
            return;
        }
        const reuseCode = (data?.code || sessionStorage.getItem('pairCode') || '')
            .toUpperCase()
            .replace(/[^A-Z]/g, '')
            .slice(0, 4);
        if (reuseCode) {
            sessionStorage.setItem('pairCode', reuseCode);
        }
        sessionStorage.setItem('pairIsHost', 'false');
        sessionStorage.setItem('sessionLinked', 'true');
        sendMessage('handoff_ack', {});
        sessionLinkReady = false;
        setTimeout(() => {
            leaveGame();
        }, 50);
    });
}

// Initialize app
function init() {
    // No backend initialization needed for P2P
    storeEntryPath();
    showScreen('mainMenu');
    ensurePlayerName();
    setupEventListeners();
    setupSessionLink();

    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');
    if (urlCode !== null) {
        setMenuCodeDisplay(urlCode.toUpperCase(), { updateUrl: false });
    } else {
        const storedSession = sessionStorage.getItem('gameSession');
        if (storedSession) {
            try {
                const parsed = JSON.parse(storedSession);
                if (parsed?.code) {
                    setMenuCodeDisplay(parsed.code);
                } else {
                    setMenuCodeDisplay('');
                }
            } catch (error) {
                setMenuCodeDisplay('');
            }
        } else {
            setMenuCodeDisplay('');
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

    elements.btnNewSession.addEventListener('click', handleNewSession);

    // Back buttons
    elements.btnBackJoin.addEventListener('click', () => showScreen('mainMenu'));
    elements.btnBackSelect.addEventListener('click', () => showScreen('mainMenu'));
    elements.btnBackLobby.addEventListener('click', () => handleLeaveLobby(true));

    if (elements.btnCreateSelected) {
        elements.btnCreateSelected.addEventListener('click', () => {
            if (!selectedGameType) return;
            handleCreateGame(selectedGameType);
        });
    }

    // Join screen
    elements.joinCode.addEventListener('input', (e) => {
        const value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
        e.target.value = value;
        elements.btnJoinSubmit.disabled = value.length !== 4;
        elements.joinError.textContent = '';
        if (value.length === 4) {
            setMenuCodeDisplay(value);
        } else {
            setMenuCodeDisplay('');
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

    // Copy join URL when tapping the menu code display
    elements.menuCodeDisplay.addEventListener('click', handleCopyMenuCode);
}

async function handleCopyMenuCode() {
    const code = elements.menuCodeDisplay?.textContent?.trim();
    if (!code) return;

    const url = new URL(window.location.href);
    url.searchParams.set('code', code.toUpperCase());
    const joinUrl = url.toString();

    try {
        await navigator.clipboard.writeText(joinUrl);
        const original = elements.menuCodeDisplay.textContent;
        elements.menuCodeDisplay.textContent = 'Copied!';
        elements.menuCodeDisplay.classList.add('copied');
        setTimeout(() => {
            elements.menuCodeDisplay.textContent = original;
            elements.menuCodeDisplay.classList.remove('copied');
        }, 1500);
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = joinUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        const original = elements.menuCodeDisplay.textContent;
        elements.menuCodeDisplay.textContent = 'Copied!';
        elements.menuCodeDisplay.classList.add('copied');
        setTimeout(() => {
            elements.menuCodeDisplay.textContent = original;
            elements.menuCodeDisplay.classList.remove('copied');
        }, 1500);
    }
}

function resetGameSelection() {
    if (selectedGameCard) {
        selectedGameCard.classList.remove('selected');
    }
    selectedGameType = null;
    selectedGameCard = null;
    currentSettings = {};
    currentSettingsGameId = null;
    if (elements.gameOptionsPanel) {
        elements.gameOptionsPanel.classList.add('hidden');
    }
    if (elements.btnCreateSelected) {
        elements.btnCreateSelected.disabled = true;
    }
}

function updateSettingValue(gameType, settingId, value) {
    ensureCurrentSettings(gameType);
    currentSettings[settingId] = value;
    storeSettingsToCookie(gameType, currentSettings);
}

function refreshPreviews(gameType, changedSettingId) {
    const game = GameRegistry.getGame(gameType);
    if (!game?.getPreview) return;

    // Find all preview containers that depend on the changed setting
    const previews = document.querySelectorAll('.setting-preview');
    previews.forEach(container => {
        const dependsOn = container.dataset.dependsOn;
        if (!dependsOn || dependsOn === changedSettingId) {
            const settingId = container.dataset.settingId;
            container.innerHTML = '';
            const previewElement = game.getPreview(settingId, currentSettings);
            if (previewElement) {
                container.appendChild(previewElement);
            }
        }
    });
}

function renderSettingsPanel(gameType, options = {}) {
    const game = GameRegistry.getGame(gameType);
    const settings = game?.settings || [];
    const container = options.container || elements.gameSettings;
    const list = options.list || elements.settingsList;
    const editable = options.editable ?? isHost;
    const emptyMessage = options.emptyMessage || null;
    const showWhenEmpty = options.showWhenEmpty === true;

    if (!container || !list) {
        return;
    }

    if (settings.length === 0 && !showWhenEmpty) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    if (emptyMessage) {
        emptyMessage.classList.toggle('hidden', settings.length !== 0);
    }

    list.innerHTML = '';
    if (settings.length === 0) {
        return;
    }

    ensureCurrentSettings(gameType);

    settings.forEach(setting => {
        const div = document.createElement('div');
        div.className = 'setting-item';

        const label = document.createElement('label');
        label.className = 'setting-label';
        label.textContent = setting.label;
        label.setAttribute('for', `setting-${options.prefix || 'lobby'}-${setting.id}`);

        const control = document.createElement('div');
        control.className = 'setting-control';

        let input;
        switch (setting.type) {
            case 'checkbox': {
                const checkboxWrapper = document.createElement('label');
                checkboxWrapper.className = 'setting-checkbox';
                input = document.createElement('input');
                input.type = 'checkbox';
                input.id = `setting-${options.prefix || 'lobby'}-${setting.id}`;
                input.checked = !!currentSettings[setting.id];
                input.disabled = !editable;
                input.addEventListener('change', () => {
                    updateSettingValue(gameType, setting.id, input.checked);
                });
                const toggle = document.createElement('span');
                toggle.className = 'toggle';
                checkboxWrapper.appendChild(input);
                checkboxWrapper.appendChild(toggle);
                control.appendChild(checkboxWrapper);
                break;
            }

            case 'string':
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'setting-string';
                input.id = `setting-${options.prefix || 'lobby'}-${setting.id}`;
                input.value = currentSettings[setting.id] || '';
                input.disabled = !editable;
                input.addEventListener('input', () => {
                    updateSettingValue(gameType, setting.id, input.value);
                });
                control.appendChild(input);
                break;

            case 'enum':
                input = document.createElement('select');
                input.className = 'setting-enum';
                input.id = `setting-${options.prefix || 'lobby'}-${setting.id}`;
                input.disabled = !editable;
                (setting.options || []).forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option;
                    opt.textContent = option;
                    if (option === currentSettings[setting.id]) {
                        opt.selected = true;
                    }
                    input.appendChild(opt);
                });
                input.addEventListener('change', () => {
                    updateSettingValue(gameType, setting.id, input.value);
                    // Refresh previews that depend on this setting
                    refreshPreviews(gameType, setting.id);
                });
                control.appendChild(input);
                break;

            case 'preview': {
                // Read-only preview canvas/image
                const previewContainer = document.createElement('div');
                previewContainer.className = 'setting-preview';
                previewContainer.id = `setting-preview-${options.prefix || 'lobby'}-${setting.id}`;
                previewContainer.dataset.settingId = setting.id;
                previewContainer.dataset.dependsOn = setting.dependsOn || '';

                // Generate initial preview
                if (game?.getPreview) {
                    const previewElement = game.getPreview(setting.id, currentSettings);
                    if (previewElement) {
                        previewContainer.appendChild(previewElement);
                    }
                }

                control.appendChild(previewContainer);
                break;
            }
        }

        div.appendChild(label);
        div.appendChild(control);
        list.appendChild(div);
    });
}

function selectGame(game, card) {
    if (!game) return;
    selectedGameType = game.id;
    if (selectedGameCard && selectedGameCard !== card) {
        selectedGameCard.classList.remove('selected');
    }
    selectedGameCard = card;
    if (selectedGameCard) {
        selectedGameCard.classList.add('selected');
    }

    setCurrentSettingsForGame(game.id, loadSettingsFromCookie(game.id));

    if (elements.gameOptionsTitle) {
        elements.gameOptionsTitle.textContent = `${game.icon} ${game.name}`;
    }
    if (elements.gameOptionsMeta) {
        elements.gameOptionsMeta.textContent = `${game.minPlayers}-${game.maxPlayers} players`;
    }
    if (elements.btnCreateSelected) {
        elements.btnCreateSelected.disabled = false;
    }

    renderSettingsPanel(game.id, {
        container: elements.gameOptionsPanel,
        list: elements.gameOptionsList,
        emptyMessage: elements.gameOptionsEmpty,
        showWhenEmpty: true,
        editable: true,
        prefix: 'select'
    });
}

// Populate game list for selection
function populateGameList() {
    const games = GameRegistry.getGameList(isDebugMode());
    elements.gameList.innerHTML = '';
    resetGameSelection();

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <h3>${game.icon} ${game.name}</h3>
            <p>${game.description}</p>
            <div class="player-count">${game.minPlayers}-${game.maxPlayers} players</div>
        `;
        card.addEventListener('click', () => selectGame(game, card));
        elements.gameList.appendChild(card);
    });
}

// Handle game creation
async function handleCreateGame(gameType, options = {}) {
    ensureCurrentSettings(gameType);
    storeSettingsToCookie(gameType, currentSettings);
    const pairInfo = getPairInfo();
    let preferredCode = null;
    if (!options.fromRequest && pairInfo && !pairInfo.isHost) {
        const reuseCode = pairInfo.code || currentGameCode || getKnownCode();
        if (reuseCode && reuseCode.length === 4) {
            preferredCode = reuseCode;
            await requestHostHandoff(reuseCode);
        }
        sessionLinkReady = false;
        leaveGame();
    }

    showLoading('Creating game...');

    try {
        if (!preferredCode) {
            const reuseCode = getKnownCode();
            preferredCode = reuseCode && reuseCode.length === 4 ? reuseCode : null;
        }
        const result = await createGameWithRetries(gameType, getEffectivePlayerName(), preferredCode);
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
    ensureCurrentSettings(gameType);
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
            // Guest receives settings from host via game_start message
            if (gameData.settings) {
                setCurrentSettingsForGame(gameType, gameData.settings);
            }
            // Game has started - redirect to game page
            storeSession();
            window.location.href = buildGameUrl();
        }
    });

    // Render game settings (host can edit, guest sees read-only)
    renderSettings(gameType);

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

    // Store for use when starting game
    lastConnectedCount = connectedCount;

    const isLinked = sessionStorage.getItem('sessionLinked') === 'true';
    if (elements.codeDisplay && elements.codeHint && isLinked) {
        elements.codeDisplay.classList.add('hidden');
        elements.codeHint.classList.add('hidden');
    }

    // Update start button
    if (isHost) {
        const minPlayers = game?.minPlayers || 2;
        const supportsAI = game?.supportsAI === true;
        const targetPlayerCount = parseInt(currentSettings?.playerCount) || minPlayers;
        const aiSlots = Math.max(0, targetPlayerCount - connectedCount);

        if (connectedCount >= minPlayers) {
            elements.btnStartGame.disabled = false;
            if (supportsAI && aiSlots > 0) {
                elements.btnStartGame.textContent = `Start Game (${aiSlots} AI)`;
            } else {
                elements.btnStartGame.textContent = 'Start Game';
            }
        } else {
            elements.btnStartGame.disabled = true;
            elements.btnStartGame.textContent = `Waiting for players (${connectedCount}/${minPlayers})...`;
        }
    } else {
        elements.btnStartGame.disabled = true;
        elements.btnStartGame.textContent = 'Waiting for host to start...';
    }
}

// Render game settings in lobby
function renderSettings(gameType) {
    renderSettingsPanel(gameType, {
        container: elements.gameSettings,
        list: elements.settingsList,
        editable: isHost,
        prefix: 'lobby'
    });
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
        ensureCurrentSettings(currentGameType);
        elements.btnStartGame.disabled = true;
        elements.btnStartGame.textContent = 'Starting...';

        // Add connected human count to settings so game knows who is AI
        currentSettings.connectedHumans = lastConnectedCount;

        storeSession();
        await startGame(currentGameCode, currentSettings);

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
    resetGameSelection();
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
