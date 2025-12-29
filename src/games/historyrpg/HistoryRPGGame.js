// History RPG - Main Game Class

import { GameEngine } from '../../engine/GameEngine.js';
import { WorldGrid } from './core/WorldGrid.js';
import { ScenarioManager } from './core/ScenarioManager.js';
import { EventSystem } from './core/EventSystem.js';
import { TerrainGenerator } from './core/TerrainGenerator.js';
import { EntityManager, ENTITY_TYPES } from './core/EntityManager.js';
import { QuestManager } from './core/QuestManager.js';
import { IsometricRenderer } from './rendering/IsometricRenderer.js';
import { DialoguePanel } from './ui/DialoguePanel.js';
import { JournalPanel } from './ui/JournalPanel.js';
import { InventoryPanel } from './ui/InventoryPanel.js';
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
        this.scenarioManager = null;
        this.eventSystem = null;
        this.terrainGenerator = null;
        this.entityManager = null;
        this.questManager = null;

        // UI panels
        this.dialoguePanel = null;
        this.journalPanel = null;
        this.inventoryPanel = null;

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

        // Create terrain generator with seeded randomness
        const terrainSeed = this.gameCode ? this.gameCode.charCodeAt(0) * 1000 : 12345;
        this.terrainGenerator = new TerrainGenerator(terrainSeed);

        // Create entity manager
        this.entityManager = new EntityManager(this.worldGrid);

        // Create renderer
        this.renderer = new IsometricRenderer(this.canvas);

        // Create UI panels
        this.dialoguePanel = new DialoguePanel(this.canvas);
        this.journalPanel = new JournalPanel(this.canvas);
        this.inventoryPanel = new InventoryPanel(this.canvas);
        this.setupDialogueCallbacks();
        this.setupInventoryCallbacks();

        // Initialize AI systems
        this.initializeAI();

        // Create scenario manager (pass generation queue for AI generation)
        this.scenarioManager = new ScenarioManager(this.generationQueue);

        // Create quest manager (linked to scenario manager)
        this.questManager = new QuestManager(this.scenarioManager);
        this.journalPanel.setQuestManager(this.questManager);
        this.setupQuestCallbacks();

        // Create event system (linked to scenario manager)
        this.eventSystem = new EventSystem(this.scenarioManager);

        // Set up event system callbacks
        this.setupEventCallbacks();

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

    // Set up event system callbacks
    setupEventCallbacks() {
        // Objective complete notification
        this.scenarioManager.onObjectiveComplete = (objective) => {
            debugLog(`[HistoryRPG] Objective complete: ${objective.objective}`);
            this.showNotification(`Objective Complete: ${objective.objective}`);
        };

        // Location discovered notification
        this.scenarioManager.onLocationDiscovered = (location) => {
            debugLog(`[HistoryRPG] Location discovered: ${location.name}`);
            this.showNotification(`Discovered: ${location.name}`);
        };

        // Historical event triggered
        this.scenarioManager.onEventTriggered = (event) => {
            debugLog(`[HistoryRPG] Event triggered: ${event?.name || 'Unknown'}`);
        };

        // Game completion
        this.scenarioManager.onGameComplete = (result) => {
            debugLog(`[HistoryRPG] Game complete! Deviation: ${result.deviationScore}`);
            this.state.phase = PHASES.GAME_OVER;
            this.state.gameResult = result;
        };

        // Event system callbacks
        this.eventSystem.onEventStart = (event) => {
            debugLog(`[HistoryRPG] Historical event: ${event.name}`);
            this.showNotification(`Historical Event: ${event.name}`, event.description);
        };

        this.eventSystem.onDayChange = (date) => {
            debugLog(`[HistoryRPG] New day: ${date.toDateString()}`);
        };

        this.eventSystem.onTimeChange = (timeInfo) => {
            this.state.world.timeOfDay = timeInfo.hour + timeInfo.minute / 60;
        };
    }

    // Set up dialogue panel callbacks
    setupDialogueCallbacks() {
        this.dialoguePanel.onChoiceSelected = async (choice) => {
            debugLog(`[HistoryRPG] Player chose: ${choice.text}`);
            await this.continueDialogue(choice.text);
        };

        this.dialoguePanel.onDialogueEnd = () => {
            debugLog(`[HistoryRPG] Dialogue ended`);
            this.endDialogue();
        };
    }

    // Set up quest manager callbacks
    setupQuestCallbacks() {
        this.questManager.onQuestStarted = (quest) => {
            this.showNotification(`Quest Started: ${quest.title}`);
        };

        this.questManager.onQuestCompleted = (quest) => {
            this.showNotification(`Quest Completed: ${quest.title}`, 'Check your rewards!');
        };

        this.questManager.onQuestFailed = (quest, reason) => {
            this.showNotification(`Quest Failed: ${quest.title}`, reason);
        };

        this.questManager.onObjectiveComplete = (quest, objective) => {
            this.showNotification('Objective Complete', objective.description);
        };

        this.questManager.onQuestDiscovered = (quest) => {
            this.showNotification(`New Quest: ${quest.title}`);
        };
    }

    // Set up inventory panel callbacks
    setupInventoryCallbacks() {
        this.inventoryPanel.onItemUse = (item) => {
            this.useItem(item);
        };

        this.inventoryPanel.onItemDrop = (item) => {
            this.dropItem(item);
        };

        this.inventoryPanel.onItemSelect = (item) => {
            debugLog(`[HistoryRPG] Selected item: ${item.name}`);
        };
    }

    // Show in-game notification
    showNotification(title, description = '') {
        // Add to notification queue (rendered in UI)
        if (!this.state.notifications) {
            this.state.notifications = [];
        }

        this.state.notifications.push({
            title,
            description,
            timestamp: Date.now(),
            duration: 5000
        });

        // Keep only recent notifications
        if (this.state.notifications.length > 5) {
            this.state.notifications.shift();
        }
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

                // Load scenario into manager
                this.scenarioManager.loadScenario(scenario);
                this.state.scenario = scenario;
                debugLog(`[HistoryRPG] Scenario generated: ${scenario.title}`);
                console.log('[HistoryRPG] Scenario generated:', scenario.title);

                // Initialize event system with scenario
                this.eventSystem.initialize(scenario);

                // Set player start position from scenario
                if (scenario.playerStart) {
                    this.state.player.position = {
                        x: scenario.playerStart.position?.x || 128,
                        y: scenario.playerStart.position?.y || 128
                    };
                    debugLog(`[HistoryRPG] Player start: (${this.state.player.position.x}, ${this.state.player.position.y})`);
                }

                // Load NPCs from scenario
                this.loadScenarioNPCs(scenario);
                debugLog(`[HistoryRPG] NPCs loaded: ${Object.keys(this.state.npcs).length}`);

                // Load quests from scenario
                this.questManager.loadFromScenario(scenario);

                return;
            } catch (error) {
                debugLog(`[HistoryRPG] Scenario generation FAILED: ${error.message}`);
                console.warn('[HistoryRPG] Failed to generate scenario, trying pre-built:', error);
            }
        } else {
            debugLog(`[HistoryRPG] AI not available, trying pre-built scenario`);
        }

        // Try to load pre-built scenario from JSON file
        const prebuiltLoaded = await this.loadPrebuiltScenario(scenarioConfig);
        if (prebuiltLoaded) {
            debugLog(`[HistoryRPG] Pre-built scenario loaded`);
            return;
        }

        // Use minimal fallback scenario
        this.loadFallbackScenario(scenarioConfig);
        debugLog(`[HistoryRPG] Fallback scenario loaded`);
    }

    // Try to load pre-built scenario from JSON file
    async loadPrebuiltScenario(config) {
        try {
            // Determine the scenario data path based on config
            const scenarioPath = `./src/games/historyrpg/data/stalingrad/scenario.json`;
            debugLog(`[HistoryRPG] Loading pre-built scenario from: ${scenarioPath}`);

            this.renderLoadingScreen('Loading scenario...');

            const scenario = await this.scenarioManager.loadFromFile(scenarioPath);

            this.state.scenario = scenario;
            debugLog(`[HistoryRPG] Pre-built scenario loaded: ${scenario.title}`);

            // Initialize event system with scenario
            this.eventSystem.initialize(scenario);

            // Set player start position
            if (scenario.playerStart) {
                this.state.player.position = {
                    x: scenario.playerStart.position?.x || 128,
                    y: scenario.playerStart.position?.y || 128
                };
            }

            // Load NPCs from scenario
            this.loadScenarioNPCs(scenario);

            // Load quests from scenario
            this.questManager.loadFromScenario(scenario);

            return true;
        } catch (error) {
            debugLog(`[HistoryRPG] Failed to load pre-built scenario: ${error.message}`);
            console.warn('[HistoryRPG] Could not load pre-built scenario:', error);
            return false;
        }
    }

    // Load NPCs from generated scenario
    loadScenarioNPCs(scenario) {
        if (!scenario.keyNPCs) return;

        const baseX = this.state.player.position.x;
        const baseY = this.state.player.position.y;

        for (let i = 0; i < scenario.keyNPCs.length; i++) {
            const npcData = scenario.keyNPCs[i];

            // Calculate position (spread around player start)
            const offsetX = (i % 5) * 3 - 6;
            const offsetY = Math.floor(i / 5) * 3 - 3;
            const x = baseX + offsetX;
            const y = baseY + offsetY;

            // Create entity via EntityManager
            if (this.entityManager) {
                this.entityManager.createNPC(npcData, x, y);
            }

            // Also keep in state for backwards compatibility
            this.state.npcs[npcData.id] = {
                ...npcData,
                mood: 'neutral',
                met: false
            };
            this.state.npcPositions[npcData.id] = { x, y };
        }

        debugLog(`[HistoryRPG] Loaded ${scenario.keyNPCs.length} NPCs`);
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
        const startX = this.state.player.position.x || 128;
        const startY = this.state.player.position.y || 128;

        debugLog(`[HistoryRPG] Generating initial world around (${startX}, ${startY})`);

        // Generate nearby chunks with terrain generator
        const chunks = this.worldGrid.getRequiredChunks(startX, startY, 3);

        for (const chunk of chunks) {
            if (!this.worldGrid.isChunkGenerated(chunk.cx, chunk.cy)) {
                this.generateChunk(chunk.cx, chunk.cy);
            }
        }

        // Apply scenario locations if available
        if (this.state.scenario && this.terrainGenerator) {
            this.terrainGenerator.applyScenarioLocations(this.worldGrid, this.state.scenario);
        }

        // Update visibility
        this.worldGrid.updateVisibility(startX, startY, 12);

        debugLog(`[HistoryRPG] Initial world generated - ${chunks.length} chunks`);
    }

    // Generate a single chunk using terrain generator
    generateChunk(cx, cy) {
        if (!this.terrainGenerator) {
            // Fallback to placeholder
            this.worldGrid.generatePlaceholderChunk(cx, cy, 12345);
            return;
        }

        const tileData = this.terrainGenerator.generateChunk(cx, cy, {
            scenario: this.state.scenario
        });

        this.worldGrid.setChunkTiles(cx, cy, tileData);
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

        // UI panel keys (when not in dialogue)
        if (this.state.phase === PHASES.PLAYING) {
            // J - Toggle Journal
            if (e.key === 'j' || e.key === 'J') {
                this.journalPanel.toggle();
                if (this.journalPanel.isOpen) {
                    this.inventoryPanel.close();
                }
                e.preventDefault();
                return;
            }

            // I - Toggle Inventory
            if (e.key === 'i' || e.key === 'I') {
                this.inventoryPanel.setInventory(this.state.player.inventory);
                this.inventoryPanel.toggle();
                if (this.inventoryPanel.isOpen) {
                    this.journalPanel.close();
                }
                e.preventDefault();
                return;
            }

            // E - Interact with nearby entity
            if (e.key === 'e' || e.key === 'E') {
                this.interactWithNearby();
                e.preventDefault();
                return;
            }
        }

        // Close panels with ESC
        if (e.key === 'Escape') {
            if (this.journalPanel.isOpen) {
                this.journalPanel.close();
                return;
            }
            if (this.inventoryPanel.isOpen) {
                this.inventoryPanel.close();
                return;
            }
        }

        // Handle zoom
        if (e.key === '+' || e.key === '=') {
            this.renderer.setZoom(this.renderer.zoom + 0.1);
        } else if (e.key === '-') {
            this.renderer.setZoom(this.renderer.zoom - 0.1);
        }

        // ESC to pause (when no panels open)
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
        // Handle dialogue phase separately
        if (this.state.phase === PHASES.DIALOGUE) {
            // Update dialogue panel animation (text reveal)
            if (this.dialoguePanel) {
                this.dialoguePanel.update(deltaTime);
            }
            return;
        }

        if (this.state.phase !== PHASES.PLAYING) {
            return;
        }

        // Update elapsed time
        this.state.elapsed += deltaTime;

        // Update event system (handles game time and historical events)
        if (this.eventSystem) {
            this.eventSystem.update(deltaTime);
        }

        // Handle player movement
        this.updatePlayerMovement(deltaTime);

        // Update entities (NPCs, items)
        if (this.entityManager) {
            this.entityManager.update(deltaTime, this.state.player.position);
        }

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

        // Check for location discovery
        this.checkLocationDiscovery();

        // Check for nearby interactables
        this.checkNearbyInteractables();

        // Update notifications (fade out old ones)
        this.updateNotifications(deltaTime);
    }

    // Check for interactable entities nearby
    checkNearbyInteractables() {
        if (!this.entityManager) return;

        const nearbyEntities = this.entityManager.getInteractablesNear(
            this.state.player.position.x,
            this.state.player.position.y,
            2
        );

        // Store for UI hints
        this.state.nearbyInteractables = nearbyEntities;
    }

    // Check if player has discovered a new location
    checkLocationDiscovery() {
        if (!this.state.scenario?.keyLocations || !this.scenarioManager) return;

        const px = Math.floor(this.state.player.position.x);
        const py = Math.floor(this.state.player.position.y);

        // For now, just check proximity to key locations
        // In future, this could be more sophisticated
        for (const location of this.state.scenario.keyLocations) {
            if (this.scenarioManager.discoveredLocations.has(location.id)) continue;

            // Simplified proximity check (could be improved with actual location bounds)
            // For now, discover locations when nearby
            const locX = location.position?.x || 128;
            const locY = location.position?.y || 128;
            const dist = Math.abs(px - locX) + Math.abs(py - locY);

            if (dist < 10) {
                this.scenarioManager.discoverLocation(location.id);

                // Trigger quest progress for "visit" objectives
                if (this.questManager) {
                    this.questManager.onPlayerAction('visit', location.id);
                }
            }
        }
    }

    // Update notifications (remove expired ones)
    updateNotifications(deltaTime) {
        if (!this.state.notifications) return;

        const now = Date.now();
        this.state.notifications = this.state.notifications.filter(
            n => now - n.timestamp < n.duration
        );
    }

    // Get current time info from event system
    getTimeInfo() {
        if (this.eventSystem) {
            return this.eventSystem.getTimeInfo();
        }
        return {
            hour: Math.floor(this.state.world.timeOfDay),
            minute: 0,
            timeOfDay: 'day',
            dateString: 'Unknown Date',
            timeString: '12:00 PM'
        };
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
                // Generate chunk with terrain generator
                this.generateChunk(chunk.cx, chunk.cy);
            }
        }
    }

    render() {
        // Render world with player data (for facing direction, etc)
        const playerData = {
            ...this.state.player.position,
            facing: this.state.player.facing,
            velocity: this.targetPos ? { x: 1, y: 1 } : { x: 0, y: 0 }
        };
        this.renderer.renderWorld(this.worldGrid, playerData);

        // Render entities from entity manager
        if (this.entityManager) {
            const entities = this.entityManager.getEntitiesByType('npc');
            for (const entity of entities) {
                this.renderer.renderNPC(entity.position.x, entity.position.y, entity);
            }

            // Render items
            const items = this.entityManager.getEntitiesByType('item');
            for (const item of items) {
                this.renderer.renderItem(item.position.x, item.position.y, item);
            }
        } else {
            // Fallback to state.npcs
            for (const [npcId, npc] of Object.entries(this.state.npcs)) {
                const pos = this.state.npcPositions[npcId];
                if (pos) {
                    this.renderer.renderNPC(pos.x, pos.y, npc);
                }
            }
        }

        // Render UI with time info
        const timeInfo = this.getTimeInfo();
        this.renderer.renderUI(this.state, timeInfo);

        // Render minimap
        this.renderer.renderMinimap(
            this.worldGrid,
            this.state.player.position,
            120
        );

        // Render notifications
        this.renderNotifications();

        // Render interaction hint (if near interactable)
        this.renderInteractionHint();

        // Render dialogue panel (if in dialogue)
        if (this.state.phase === PHASES.DIALOGUE && this.dialoguePanel?.isActive()) {
            this.dialoguePanel.render();
        }

        // Render journal panel (if open)
        if (this.journalPanel?.isOpen) {
            this.journalPanel.render();
        }

        // Render inventory panel (if open)
        if (this.inventoryPanel?.isOpen) {
            this.inventoryPanel.render();
        }

        // Render pause overlay
        if (this.state.phase === PHASES.PAUSED) {
            this.renderPauseOverlay();
        }

        // Render game over overlay
        if (this.state.phase === PHASES.GAME_OVER) {
            this.renderGameOverOverlay();
        }

        // Render keyboard hints
        this.renderKeyHints();
    }

    // Render keyboard shortcut hints
    renderKeyHints() {
        if (this.state.phase !== PHASES.PLAYING) return;
        if (this.journalPanel?.isOpen || this.inventoryPanel?.isOpen) return;

        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(10, this.canvas.height - 30, 220, 20);

        ctx.fillStyle = '#888';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('[I] Inventory  [J] Journal  [E] Interact', 15, this.canvas.height - 16);
    }

    // Render interaction hint when near interactable
    renderInteractionHint() {
        if (this.state.phase !== PHASES.PLAYING) return;
        if (!this.state.nearbyInteractables?.length) return;

        const ctx = this.ctx;
        const entity = this.state.nearbyInteractables[0];
        const name = entity.name || 'Object';

        // Draw hint above player
        const screenPos = this.renderer.worldToScreen(
            this.state.player.position.x,
            this.state.player.position.y - 1
        );

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        const text = `[E] ${entity.type === 'npc' ? 'Talk to' : 'Pick up'} ${name}`;
        const textWidth = ctx.measureText(text).width + 20;
        ctx.fillRect(screenPos.x - textWidth / 2, screenPos.y - 60, textWidth, 25);

        ctx.fillStyle = '#c9a227';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(text, screenPos.x, screenPos.y - 43);
    }

    // Render notification popups
    renderNotifications() {
        if (!this.state.notifications || this.state.notifications.length === 0) return;

        const ctx = this.ctx;
        const now = Date.now();

        let y = 100;
        for (const notification of this.state.notifications) {
            const elapsed = now - notification.timestamp;
            const remaining = notification.duration - elapsed;

            // Fade out in last second
            let alpha = 1;
            if (remaining < 1000) {
                alpha = remaining / 1000;
            }

            // Slide in effect
            let slideOffset = 0;
            if (elapsed < 300) {
                slideOffset = (1 - elapsed / 300) * 200;
            }

            ctx.save();
            ctx.globalAlpha = alpha;

            // Background
            const x = this.canvas.width - 320 + slideOffset;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(x, y, 300, notification.description ? 60 : 40);

            // Border
            ctx.strokeStyle = '#c9a227';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, 300, notification.description ? 60 : 40);

            // Title
            ctx.fillStyle = '#c9a227';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(notification.title, x + 10, y + 20);

            // Description
            if (notification.description) {
                ctx.fillStyle = '#ccc';
                ctx.font = '12px monospace';
                ctx.fillText(notification.description.substring(0, 40), x + 10, y + 45);
            }

            ctx.restore();
            y += notification.description ? 70 : 50;
        }
    }

    // Render game over screen
    renderGameOverOverlay() {
        const ctx = this.ctx;
        const result = this.state.gameResult || {};

        // Dim background
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Title
        ctx.fillStyle = '#c9a227';
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SCENARIO COMPLETE', this.canvas.width / 2, this.canvas.height / 2 - 60);

        // Main goal status
        ctx.fillStyle = '#fff';
        ctx.font = '18px monospace';
        ctx.fillText(
            result.mainGoalComplete ? 'Main objective achieved!' : 'Main objective failed',
            this.canvas.width / 2,
            this.canvas.height / 2
        );

        // Historical deviation score
        ctx.font = '16px monospace';
        ctx.fillStyle = '#888';
        ctx.fillText(
            `Historical Deviation: ${result.deviationScore || 0}%`,
            this.canvas.width / 2,
            this.canvas.height / 2 + 40
        );

        // Optional goals
        const optionalComplete = result.optionalGoalsComplete?.length || 0;
        ctx.fillText(
            `Optional Goals: ${optionalComplete} completed`,
            this.canvas.width / 2,
            this.canvas.height / 2 + 70
        );
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

        // Mark as met in both local state and scenario manager
        npc.met = true;
        if (this.scenarioManager) {
            this.scenarioManager.meetNPC(npcId);
        }

        // Set NPC to talk state if using entity manager
        if (this.entityManager) {
            const entity = this.entityManager.getEntity(npcId);
            if (entity) {
                entity.setState('talk');
            }
        }

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

                // Start dialogue panel
                this.dialoguePanel.startDialogue(npc, response);
                this.state.phase = PHASES.DIALOGUE;
                debugLog(`[HistoryRPG] Started AI dialogue with ${npc.name}`);
            } catch (error) {
                debugLog(`[HistoryRPG] Failed to generate dialogue: ${error.message}`);
                this.startFallbackDialogue(npc);
            }
        } else {
            this.startFallbackDialogue(npc);
        }
    }

    // Fallback dialogue when AI is unavailable
    startFallbackDialogue(npc) {
        const response = {
            speech: this.getFallbackGreeting(npc),
            emotion: npc.disposition > 50 ? 'friendly' : 'suspicious',
            suggestedChoices: this.getFallbackChoices(npc)
        };

        this.state.currentDialogue = {
            npcId: npc.id,
            npc,
            response,
            history: []
        };

        // Start dialogue panel
        this.dialoguePanel.startDialogue(npc, response);
        this.state.phase = PHASES.DIALOGUE;
        debugLog(`[HistoryRPG] Started fallback dialogue with ${npc.name}`);
    }

    // Get fallback greeting based on NPC personality
    getFallbackGreeting(npc) {
        const greetings = {
            friendly: [
                `${npc.name} nods at you. "Comrade, what brings you here?"`,
                `${npc.name} looks relieved to see another survivor. "Thank God, a friendly face."`,
                `"Welcome," says ${npc.name}. "It's dangerous to be out alone."`
            ],
            neutral: [
                `${npc.name} looks at you cautiously. "What do you want?"`,
                `${npc.name} eyes you warily. "State your business."`,
                `"You're not from around here," ${npc.name} observes.`
            ],
            hostile: [
                `${npc.name} glares at you. "Get out of my sight."`,
                `${npc.name} backs away defensively. "Stay back!"`,
                `"I don't trust strangers," ${npc.name} growls.`
            ]
        };

        let mood = 'neutral';
        if (npc.disposition > 60) mood = 'friendly';
        else if (npc.disposition < 30) mood = 'hostile';

        const options = greetings[mood];
        return options[Math.floor(Math.random() * options.length)];
    }

    // Get fallback dialogue choices based on NPC
    getFallbackChoices(npc) {
        const choices = [
            { text: "I need help finding supplies.", type: "friendly" },
            { text: "What can you tell me about this area?", type: "neutral" }
        ];

        if (npc.canProvide?.includes('directions') || npc.knowledge?.length > 0) {
            choices.push({ text: "Do you know a way out of the city?", type: "neutral" });
        }

        choices.push({ text: "I should go.", type: "leaving" });

        return choices;
    }

    // Continue dialogue with player input
    async continueDialogue(playerInput) {
        if (!this.state.currentDialogue) return;

        const { npc, history } = this.state.currentDialogue;

        // Add to history
        history.push({ speaker: 'player', text: playerInput });

        let response;

        if (this.aiGateway.isAvailable()) {
            try {
                const context = {
                    location: this.state.scenario?.setting || 'the city',
                    timePeriod: 'World War 2',
                    situation: 'The city is under siege.',
                    playerRole: this.state.player.characterType || 'civilian'
                };

                response = await this.generationQueue.generateDialogue(
                    npc,
                    playerInput,
                    context
                );

                // Apply disposition change
                if (response.dispositionChange) {
                    npc.disposition = Math.max(0, Math.min(100,
                        npc.disposition + response.dispositionChange
                    ));

                    // Update entity disposition if using entity manager
                    if (this.entityManager) {
                        const entity = this.entityManager.getEntity(npc.id);
                        if (entity) {
                            entity.disposition = npc.disposition;
                        }
                    }
                }

                // Add revealed information to player knowledge
                if (response.informationRevealed) {
                    for (const info of response.informationRevealed) {
                        if (!this.state.player.knowledge.includes(info)) {
                            this.state.player.knowledge.push(info);
                        }
                    }
                }

            } catch (error) {
                console.error('[HistoryRPG] Failed to continue dialogue:', error);
                response = this.getFallbackResponse(npc, playerInput);
            }
        } else {
            response = this.getFallbackResponse(npc, playerInput);
        }

        // Update dialogue state
        this.state.currentDialogue.response = response;
        history.push({ speaker: npc.name, text: response.speech });

        // Update dialogue panel with new response
        this.dialoguePanel.updateDialogue(response);
    }

    // Get fallback response when AI is unavailable
    getFallbackResponse(npc, playerInput) {
        const lowerInput = playerInput.toLowerCase();

        // Simple keyword matching for fallback responses
        if (lowerInput.includes('supplies') || lowerInput.includes('food')) {
            return {
                speech: `${npc.name} shakes their head. "Supplies are scarce. Everyone is looking for food and water."`,
                emotion: 'concerned',
                suggestedChoices: [
                    { text: "Where might I find some?", type: "neutral" },
                    { text: "Thank you anyway.", type: "friendly" },
                    { text: "I should go.", type: "leaving" }
                ]
            };
        }

        if (lowerInput.includes('area') || lowerInput.includes('tell me')) {
            return {
                speech: `${npc.name} looks around warily. "This area is dangerous. The fighting has destroyed most buildings. Stay low and avoid open streets."`,
                emotion: 'cautious',
                suggestedChoices: [
                    { text: "Is there anywhere safe?", type: "neutral" },
                    { text: "What about the soldiers?", type: "neutral" },
                    { text: "I should go.", type: "leaving" }
                ]
            };
        }

        if (lowerInput.includes('way out') || lowerInput.includes('escape')) {
            return {
                speech: `${npc.name} lowers their voice. "The river might be a way out, but it's heavily watched. I've heard rumors of tunnels, but I don't know where."`,
                emotion: 'secretive',
                suggestedChoices: [
                    { text: "Who would know about the tunnels?", type: "neutral" },
                    { text: "Thank you for the information.", type: "friendly" },
                    { text: "I should go.", type: "leaving" }
                ]
            };
        }

        // Default response
        return {
            speech: `${npc.name} nods slowly. "Times are hard for everyone. We do what we can to survive."`,
            emotion: 'neutral',
            suggestedChoices: this.getFallbackChoices(npc)
        };
    }

    // End current dialogue
    endDialogue() {
        // Trigger quest progress for "talk" objectives
        if (this.state.currentDialogue && this.questManager) {
            const npcId = this.state.currentDialogue.npcId;
            this.questManager.onPlayerAction('talk', npcId);
        }

        // Restore NPC state from 'talk' to 'idle'
        if (this.state.currentDialogue && this.entityManager) {
            const npcId = this.state.currentDialogue.npcId;
            const entity = this.entityManager.getEntity(npcId);
            if (entity && entity.state === 'talk') {
                entity.setState('idle');
            }
        }

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

    // Interact with nearest entity (NPC or item)
    interactWithNearby() {
        if (!this.entityManager) return;

        const nearby = this.entityManager.getInteractablesNear(
            this.state.player.position.x,
            this.state.player.position.y,
            2
        );

        if (nearby.length === 0) {
            debugLog('[HistoryRPG] Nothing nearby to interact with');
            return;
        }

        const entity = nearby[0]; // Closest entity

        if (entity.type === ENTITY_TYPES.NPC) {
            this.startDialogue(entity.id);
        } else if (entity.type === ENTITY_TYPES.ITEM) {
            this.pickupItem(entity);
        }
    }

    // Pick up an item
    pickupItem(itemEntity) {
        if (!itemEntity || !itemEntity.pickupable) return;

        // Add to player inventory
        const item = {
            id: itemEntity.id,
            name: itemEntity.name,
            description: itemEntity.description,
            itemType: itemEntity.itemType,
            type: itemEntity.itemType,
            quantity: itemEntity.quantity || 1,
            value: itemEntity.value || 0,
            weight: itemEntity.weight || 0,
            questItem: itemEntity.questItem || false
        };

        this.state.player.inventory.push(item);

        // Remove from world
        this.entityManager.removeEntity(itemEntity.id);

        // Show notification
        this.showNotification(`Picked up: ${item.name}`, item.description);

        // Quest progress
        if (this.questManager) {
            this.questManager.onPlayerAction('pickup', itemEntity.id);
        }

        debugLog(`[HistoryRPG] Picked up item: ${item.name}`);
    }

    // Use an item from inventory
    useItem(item) {
        if (!item) return;

        debugLog(`[HistoryRPG] Using item: ${item.name}`);

        // Handle different item types
        switch (item.itemType || item.type) {
            case 'supply':
                // Restore health
                const healAmount = item.value || 20;
                this.state.player.health = Math.min(
                    this.state.player.maxHealth,
                    this.state.player.health + healAmount
                );
                this.showNotification(`Used ${item.name}`, `+${healAmount} health`);
                this.removeItemFromInventory(item);
                break;

            case 'document':
                // Read document (add to knowledge)
                if (item.knowledge && !this.state.player.knowledge.includes(item.knowledge)) {
                    this.state.player.knowledge.push(item.knowledge);
                    this.showNotification(`Read: ${item.name}`, 'Gained new knowledge');
                } else {
                    this.showNotification(`${item.name}`, item.description || 'A document');
                }
                break;

            case 'quest':
                // Quest items typically can't be used directly
                this.showNotification(item.name, 'This item is needed for a quest');
                break;

            default:
                this.showNotification(item.name, item.description || 'Cannot use this item');
        }
    }

    // Drop an item from inventory
    dropItem(item) {
        if (!item) return;

        // Prevent dropping quest items
        if (item.questItem || item.itemType === 'quest') {
            this.showNotification('Cannot drop', 'Quest items cannot be dropped');
            return;
        }

        // Remove from inventory
        const removed = this.removeItemFromInventory(item);
        if (!removed) return;

        // Create item entity at player position
        if (this.entityManager) {
            const itemEntity = this.entityManager.createItem(
                {
                    id: `dropped_${item.id}_${Date.now()}`,
                    name: item.name,
                    description: item.description,
                    type: item.itemType || item.type,
                    quantity: item.quantity || 1,
                    value: item.value || 0,
                    weight: item.weight || 0
                },
                Math.floor(this.state.player.position.x),
                Math.floor(this.state.player.position.y)
            );
        }

        this.showNotification(`Dropped: ${item.name}`);
        debugLog(`[HistoryRPG] Dropped item: ${item.name}`);
    }

    // Remove item from player inventory
    removeItemFromInventory(item) {
        const index = this.state.player.inventory.findIndex(i => i.id === item.id);
        if (index === -1) return false;

        // If stackable and quantity > 1, reduce quantity
        if (item.quantity > 1) {
            this.state.player.inventory[index].quantity--;
            if (this.state.player.inventory[index].quantity <= 0) {
                this.state.player.inventory.splice(index, 1);
            }
        } else {
            this.state.player.inventory.splice(index, 1);
        }

        // Update inventory panel if open
        if (this.inventoryPanel.isOpen) {
            this.inventoryPanel.setInventory(this.state.player.inventory);
        }

        return true;
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
