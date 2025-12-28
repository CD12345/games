// History RPG - Main Game Class

import { GameEngine } from '../../engine/GameEngine.js';
import { WorldGrid } from './core/WorldGrid.js';
import { IsometricRenderer } from './rendering/IsometricRenderer.js';
import { AIGateway } from './ai/AIGateway.js';
import { PromptBuilder } from './ai/PromptBuilder.js';
import { ResponseParser } from './ai/ResponseParser.js';
import { GenerationQueue } from './ai/GenerationQueue.js';
import { PHASES, MOVEMENT, TIME, SCENARIOS, getInitialState } from './config.js';
import { debugLog } from '../../ui/DebugOverlay.js';

export class HistoryRPGGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber, settings = {}) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber;
        this.settings = settings;

        // Initialize state
        this.state = getInitialState({
            ...settings,
            isHost
        });

        // Core systems
        this.worldGrid = null;
        this.renderer = null;

        // AI systems
        this.aiGateway = null;
        this.promptBuilder = null;
        this.responseParser = null;
        this.generationQueue = null;

        // Input state
        this.keys = {};
        this.mousePos = { x: 0, y: 0 };
        this.targetPos = null;

        // Network handlers
        this.network = null;

        // Bind input handlers
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleClick = this.handleClick.bind(this);
    }

    async initialize() {
        // Create world grid
        this.worldGrid = new WorldGrid();

        // Create renderer
        this.renderer = new IsometricRenderer(this.canvas);

        // Initialize AI systems
        this.initializeAI();

        // Set up input handlers
        this.setupInputHandlers();

        // Start in loading phase
        this.state.phase = PHASES.LOADING;
        this.renderLoadingScreen('Initializing...');

        // Try to generate or load scenario
        await this.initializeScenario();

        // Generate initial terrain around start position
        this.generateInitialWorld();

        // Center camera on player
        this.renderer.setCamera(
            this.state.player.position.x,
            this.state.player.position.y
        );

        // Transition to playing state
        this.state.phase = PHASES.PLAYING;

        console.log('[HistoryRPG] Initialized');
    }

    // Initialize AI systems
    initializeAI() {
        debugLog(`[HistoryRPG] initializeAI() called`);

        // Determine AI mode based on settings
        const apiKey = this.settings.apiKey || null;
        const provider = this.settings.apiProvider === 'OpenAI' ? 'openai' : 'claude';

        debugLog(`[HistoryRPG] API Key provided: ${apiKey ? 'YES (' + apiKey.length + ' chars)' : 'NO'}`);
        debugLog(`[HistoryRPG] Provider: ${provider}`);

        const mode = apiKey ? 'local' : (this.isHost ? 'none' : 'gateway');
        debugLog(`[HistoryRPG] AI mode: ${mode}`);

        this.aiGateway = new AIGateway({
            mode: mode,
            isHost: this.isHost,
            apiKey: apiKey,
            provider: provider
        });

        // Save API key if provided
        if (apiKey) {
            this.aiGateway.saveApiKey(apiKey);
            this.aiGateway.saveProvider(provider);
            debugLog(`[HistoryRPG] API key saved to localStorage`);
        }

        // Set up gateway mode for multiplayer
        if (this.isHost || !apiKey) {
            this.aiGateway.setupGatewayMode();
            debugLog(`[HistoryRPG] Gateway mode set up`);
        }

        // Create prompt builder and parser
        this.promptBuilder = new PromptBuilder();
        this.responseParser = new ResponseParser();

        // Create generation queue
        this.generationQueue = new GenerationQueue(
            this.aiGateway,
            this.promptBuilder,
            this.responseParser
        );

        // Set up queue callbacks
        this.generationQueue.onRequestStart = (request) => {
            this.state.aiGenerating = true;
            debugLog(`[HistoryRPG] AI generating: ${request.type}`);
        };

        this.generationQueue.onRequestComplete = (request, result) => {
            debugLog(`[HistoryRPG] AI completed: ${request.type}`);
        };

        this.generationQueue.onRequestError = (request, error) => {
            debugLog(`[HistoryRPG] AI ERROR for ${request.type}: ${error.message}`);
            console.error(`[HistoryRPG] AI error for ${request.type}:`, error);
        };

        this.generationQueue.onQueueEmpty = () => {
            this.state.aiGenerating = false;
            debugLog(`[HistoryRPG] AI queue empty`);
        };

        debugLog(`[HistoryRPG] AI systems initialized`);
    }

    // Initialize scenario (generate or use fallback)
    async initializeScenario() {
        debugLog(`[HistoryRPG] initializeScenario() called`);

        const scenarioId = this.settings.scenarioId || 'stalingrad_nov42';
        debugLog(`[HistoryRPG] Scenario ID: ${scenarioId}`);

        const scenarioConfig = Object.values(SCENARIOS).find(s =>
            s.name === this.settings.scenarioId || s.id === scenarioId
        ) || SCENARIOS.STALINGRAD;

        debugLog(`[HistoryRPG] Using config: ${scenarioConfig.name}`);

        // Check if AI is available
        const aiAvailable = this.aiGateway.isAvailable();
        debugLog(`[HistoryRPG] AI available: ${aiAvailable}`);

        if (aiAvailable) {
            try {
                this.renderLoadingScreen('Generating scenario...');
                debugLog(`[HistoryRPG] Starting scenario generation...`);

                const scenario = await this.generationQueue.generateScenario({
                    timePeriod: scenarioConfig.timePeriod,
                    location: scenarioConfig.location,
                    date: scenarioConfig.date,
                    characterType: this.settings.characterType || 'Civilian'
                });

                this.state.scenario = scenario;
                debugLog(`[HistoryRPG] Scenario generated: ${scenario.title}`);
                console.log('[HistoryRPG] Scenario generated:', scenario.title);

                // Set player start position from scenario
                if (scenario.playerStart) {
                    this.state.player.position = {
                        x: scenario.playerStart.x,
                        y: scenario.playerStart.y
                    };
                    debugLog(`[HistoryRPG] Player start: (${scenario.playerStart.x}, ${scenario.playerStart.y})`);
                }

                // Load NPCs from scenario
                this.loadScenarioNPCs(scenario);
                debugLog(`[HistoryRPG] NPCs loaded: ${Object.keys(this.state.npcs).length}`);

                return;
            } catch (error) {
                debugLog(`[HistoryRPG] Scenario generation FAILED: ${error.message}`);
                console.warn('[HistoryRPG] Failed to generate scenario, using fallback:', error);
            }
        } else {
            debugLog(`[HistoryRPG] AI not available, using fallback`);
        }

        // Use fallback scenario
        this.loadFallbackScenario(scenarioConfig);
        debugLog(`[HistoryRPG] Fallback scenario loaded`);
    }

    // Load NPCs from generated scenario
    loadScenarioNPCs(scenario) {
        if (!scenario.keyNPCs) return;

        for (const npc of scenario.keyNPCs) {
            this.state.npcs[npc.id] = {
                ...npc,
                mood: 'neutral'
            };

            // Find NPC's starting location
            if (npc.locationId && scenario.keyLocations) {
                const location = scenario.keyLocations.find(l => l.id === npc.locationId);
                if (location) {
                    this.state.npcPositions[npc.id] = { x: location.x, y: location.y };
                    this.worldGrid.addNPCAt(location.x, location.y, npc.id);
                }
            }
        }
    }

    // Load fallback scenario when AI is unavailable
    loadFallbackScenario(config) {
        this.state.scenario = {
            id: config.id,
            title: config.name,
            setting: `${config.location}, ${config.date}. The city is under siege.`,
            playerStart: { x: 128, y: 128, locationId: null },
            mainGoal: {
                id: 'survive',
                title: 'Survive',
                description: 'Find food and shelter to survive another day.',
                completed: false
            },
            optionalGoals: [],
            goalPath: [
                { step: 1, objective: 'Explore the area', hints: ['Look around'], completed: false }
            ],
            keyLocations: [],
            keyNPCs: [],
            historicalEvents: [],
            items: []
        };

        // Add a sample NPC
        const sampleNPC = {
            id: 'npc_survivor',
            name: 'Yuri',
            role: 'Survivor',
            faction: 'civilian',
            personality: 'Cautious but helpful',
            knowledge: ['food_cache'],
            disposition: 50,
            met: false,
            mood: 'neutral'
        };

        this.state.npcs[sampleNPC.id] = sampleNPC;
        this.state.npcPositions[sampleNPC.id] = { x: 130, y: 128 };
        this.worldGrid.addNPCAt(130, 128, sampleNPC.id);

        console.log('[HistoryRPG] Loaded fallback scenario');
    }

    // Render loading screen
    renderLoadingScreen(message) {
        const ctx = this.ctx;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = '#fff';
        ctx.font = '24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('History RPG', this.canvas.width / 2, this.canvas.height / 2 - 40);

        ctx.font = '16px monospace';
        ctx.fillStyle = '#888';
        ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2 + 20);

        // Loading spinner (simple dots)
        const dots = '.'.repeat(Math.floor(Date.now() / 500) % 4);
        ctx.fillText(dots, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    generateInitialWorld() {
        // Generate chunks around the starting position
        const startX = 128;
        const startY = 128;

        // Set player start position
        this.state.player.position = { x: startX, y: startY };

        // Generate nearby chunks with placeholder terrain
        const chunks = this.worldGrid.getRequiredChunks(startX, startY, 3);

        for (const chunk of chunks) {
            if (!this.worldGrid.isChunkGenerated(chunk.cx, chunk.cy)) {
                this.worldGrid.generatePlaceholderChunk(chunk.cx, chunk.cy, 12345);
            }
        }

        // Update visibility
        this.worldGrid.updateVisibility(startX, startY, 12);
    }

    setupInputHandlers() {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('click', this.handleClick);
        this.canvas.addEventListener('touchend', this.handleClick);
    }

    removeInputHandlers() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('click', this.handleClick);
        this.canvas.removeEventListener('touchend', this.handleClick);
    }

    handleKeyDown(e) {
        this.keys[e.key.toLowerCase()] = true;

        // Handle zoom
        if (e.key === '+' || e.key === '=') {
            this.renderer.setZoom(this.renderer.zoom + 0.1);
        } else if (e.key === '-') {
            this.renderer.setZoom(this.renderer.zoom - 0.1);
        }

        // ESC to pause
        if (e.key === 'Escape') {
            if (this.state.phase === PHASES.PLAYING) {
                this.state.phase = PHASES.PAUSED;
            } else if (this.state.phase === PHASES.PAUSED) {
                this.state.phase = PHASES.PLAYING;
            }
        }
    }

    handleKeyUp(e) {
        this.keys[e.key.toLowerCase()] = false;
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mousePos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    handleClick(e) {
        // Convert screen position to world position
        let screenX, screenY;

        if (e.type === 'touchend' && e.changedTouches) {
            const rect = this.canvas.getBoundingClientRect();
            screenX = e.changedTouches[0].clientX - rect.left;
            screenY = e.changedTouches[0].clientY - rect.top;
        } else {
            screenX = this.mousePos.x;
            screenY = this.mousePos.y;
        }

        const worldPos = this.renderer.screenToWorld(screenX, screenY);

        // Check if clicked tile is walkable
        if (this.worldGrid.isWalkable(worldPos.x, worldPos.y)) {
            this.targetPos = worldPos;
            this.state.player.targetPosition = worldPos;
        }

        // Check for NPC at position
        const npcsAtTile = this.worldGrid.getNPCsAt(worldPos.x, worldPos.y);
        if (npcsAtTile.size > 0) {
            // Start dialogue with first NPC at this tile
            const npcId = npcsAtTile.values().next().value;
            this.startDialogue(npcId);
        }
    }

    update(deltaTime) {
        if (this.state.phase !== PHASES.PLAYING) {
            return;
        }

        // Update elapsed time
        this.state.elapsed += deltaTime;

        // Update game time
        this.updateGameTime(deltaTime);

        // Handle player movement
        this.updatePlayerMovement(deltaTime);

        // Update camera
        this.renderer.setCamera(
            this.state.player.position.x,
            this.state.player.position.y
        );

        // Update visibility
        this.worldGrid.updateVisibility(
            this.state.player.position.x,
            this.state.player.position.y,
            12
        );

        // Check for chunks that need loading
        this.checkChunkLoading();
    }

    updateGameTime(deltaTime) {
        // Advance game time
        const hoursPerSecond = TIME.HOURS_PER_REAL_MINUTE / 60;
        this.state.world.timeOfDay += deltaTime * hoursPerSecond;

        // Wrap around at 24 hours
        if (this.state.world.timeOfDay >= 24) {
            this.state.world.timeOfDay -= 24;
            this.state.world.daysPassed++;
        }
    }

    updatePlayerMovement(deltaTime) {
        const player = this.state.player;
        let dx = 0;
        let dy = 0;

        // Keyboard movement (WASD or arrow keys)
        // Note: In isometric, we adjust for the projection
        if (this.keys['w'] || this.keys['arrowup']) {
            dx -= 1;
            dy -= 1;
        }
        if (this.keys['s'] || this.keys['arrowdown']) {
            dx += 1;
            dy += 1;
        }
        if (this.keys['a'] || this.keys['arrowleft']) {
            dx -= 1;
            dy += 1;
        }
        if (this.keys['d'] || this.keys['arrowright']) {
            dx += 1;
            dy -= 1;
        }

        // Click-to-move
        if (this.targetPos) {
            const tdx = this.targetPos.x - player.position.x;
            const tdy = this.targetPos.y - player.position.y;
            const dist = Math.sqrt(tdx * tdx + tdy * tdy);

            if (dist > 0.5) {
                dx = tdx / dist;
                dy = tdy / dist;
            } else {
                this.targetPos = null;
                player.targetPosition = null;
            }
        }

        // Normalize diagonal movement
        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;

            // Apply movement
            const speed = this.keys['shift'] ? MOVEMENT.RUN_SPEED : MOVEMENT.WALK_SPEED;
            const newX = player.position.x + dx * speed * deltaTime;
            const newY = player.position.y + dy * speed * deltaTime;

            // Check collision
            if (this.worldGrid.isWalkable(Math.floor(newX), Math.floor(newY))) {
                player.position.x = newX;
                player.position.y = newY;

                // Update facing direction
                if (Math.abs(dx) > Math.abs(dy)) {
                    player.facing = dx > 0 ? 'east' : 'west';
                } else {
                    player.facing = dy > 0 ? 'south' : 'north';
                }
            }
        }
    }

    checkChunkLoading() {
        const chunks = this.worldGrid.getRequiredChunks(
            this.state.player.position.x,
            this.state.player.position.y,
            4
        );

        for (const chunk of chunks) {
            if (!this.worldGrid.isChunkGenerated(chunk.cx, chunk.cy)) {
                // Generate placeholder for now
                // TODO: Queue AI generation for detailed terrain
                this.worldGrid.generatePlaceholderChunk(chunk.cx, chunk.cy, 12345);
            }
        }
    }

    render() {
        // Render world
        this.renderer.renderWorld(this.worldGrid, this.state.player.position);

        // Render NPCs
        for (const [npcId, npc] of Object.entries(this.state.npcs)) {
            const pos = this.state.npcPositions[npcId];
            if (pos) {
                this.renderer.renderNPC(pos.x, pos.y, npc);
            }
        }

        // Render UI
        this.renderer.renderUI(this.state);

        // Render minimap
        this.renderer.renderMinimap(
            this.worldGrid,
            this.state.player.position,
            120
        );

        // Render pause overlay
        if (this.state.phase === PHASES.PAUSED) {
            this.renderPauseOverlay();
        }
    }

    renderPauseOverlay() {
        const ctx = this.ctx;

        // Dim background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Pause text
        ctx.fillStyle = '#fff';
        ctx.font = '32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);

        ctx.font = '16px monospace';
        ctx.fillText('Press ESC to resume', this.canvas.width / 2, this.canvas.height / 2 + 40);
    }

    // Network methods
    setNetworkSync(network) {
        this.network = network;

        if (this.isHost) {
            // Host receives input from guests
            network.onInputUpdate = (input, playerId) => {
                this.handleNetworkInput(input, playerId);
            };
        } else {
            // Guest receives state from host
            network.onStateUpdate = (state) => {
                this.handleNetworkState(state);
            };
        }
    }

    handleNetworkInput(input, playerId) {
        // Handle guest player input
        if (input.position) {
            if (!this.state.players[playerId]) {
                this.state.players[playerId] = { position: input.position };
            } else {
                this.state.players[playerId].position = input.position;
            }
        }
    }

    handleNetworkState(state) {
        // Apply host's state update
        if (state.world) {
            this.state.world = { ...this.state.world, ...state.world };
        }
        if (state.players) {
            this.state.players = state.players;
        }
    }

    sendStateUpdate() {
        if (!this.network || !this.isHost) return;

        this.network.sendState({
            world: {
                timeOfDay: this.state.world.timeOfDay,
                weather: this.state.world.weather
            },
            players: this.state.players
        });
    }

    sendInputUpdate() {
        if (!this.network || this.isHost) return;

        this.network.sendInput({
            position: this.state.player.position
        });
    }

    // Start dialogue with an NPC
    async startDialogue(npcId) {
        const npc = this.state.npcs[npcId];
        if (!npc) return;

        // Mark as met
        npc.met = true;

        // If AI is available, generate dynamic greeting
        if (this.aiGateway.isAvailable()) {
            try {
                const context = {
                    location: this.state.scenario?.setting || 'the city',
                    timePeriod: 'World War 2',
                    situation: 'The city is under siege.',
                    playerRole: this.state.player.characterType || 'civilian'
                };

                const response = await this.generationQueue.generateDialogue(
                    npc,
                    'Hello',
                    context
                );

                this.state.currentDialogue = {
                    npcId,
                    npc,
                    response,
                    history: []
                };

                this.state.phase = PHASES.DIALOGUE;
                console.log('[HistoryRPG] Started dialogue with', npc.name);
            } catch (error) {
                console.error('[HistoryRPG] Failed to generate dialogue:', error);
                this.startFallbackDialogue(npc);
            }
        } else {
            this.startFallbackDialogue(npc);
        }
    }

    // Fallback dialogue when AI is unavailable
    startFallbackDialogue(npc) {
        this.state.currentDialogue = {
            npcId: npc.id,
            npc,
            response: {
                speech: `${npc.name} looks at you cautiously. "What do you want?"`,
                emotion: 'suspicious',
                suggestedChoices: [
                    { text: "I need help.", type: "friendly" },
                    { text: "Never mind.", type: "leaving" }
                ]
            },
            history: []
        };
        this.state.phase = PHASES.DIALOGUE;
    }

    // Continue dialogue with player input
    async continueDialogue(playerInput) {
        if (!this.state.currentDialogue) return;

        const { npc, history } = this.state.currentDialogue;

        // Add to history
        history.push({ speaker: 'player', text: playerInput });

        if (this.aiGateway.isAvailable()) {
            try {
                const context = {
                    location: this.state.scenario?.setting || 'the city',
                    timePeriod: 'World War 2',
                    situation: 'The city is under siege.',
                    playerRole: this.state.player.characterType || 'civilian'
                };

                const response = await this.generationQueue.generateDialogue(
                    npc,
                    playerInput,
                    context
                );

                // Apply disposition change
                if (response.dispositionChange) {
                    npc.disposition = Math.max(0, Math.min(100,
                        npc.disposition + response.dispositionChange
                    ));
                }

                // Add revealed information to player knowledge
                if (response.informationRevealed) {
                    for (const info of response.informationRevealed) {
                        if (!this.state.player.knowledge.includes(info)) {
                            this.state.player.knowledge.push(info);
                        }
                    }
                }

                this.state.currentDialogue.response = response;
                history.push({ speaker: npc.name, text: response.speech });

            } catch (error) {
                console.error('[HistoryRPG] Failed to continue dialogue:', error);
            }
        }
    }

    // End current dialogue
    endDialogue() {
        this.state.currentDialogue = null;
        this.state.phase = PHASES.PLAYING;
    }

    // Get AI status for UI
    getAIStatus() {
        return {
            available: this.aiGateway?.isAvailable() || false,
            generating: this.state.aiGenerating,
            queueStatus: this.generationQueue?.getStatus() || null
        };
    }

    destroy() {
        this.removeInputHandlers();

        // Clean up AI systems
        if (this.aiGateway) {
            this.aiGateway.destroy();
        }
        if (this.generationQueue) {
            this.generationQueue.clear();
        }

        super.destroy();
    }
}
