// History RPG - Main Game Class

import { GameEngine } from '../../engine/GameEngine.js';
import { WorldGrid } from './core/WorldGrid.js';
import { ScenarioManager } from './core/ScenarioManager.js';
import { EventSystem } from './core/EventSystem.js';
import { TerrainGenerator } from './core/TerrainGenerator.js';
import { EntityManager, ENTITY_TYPES } from './core/EntityManager.js';
import { QuestManager, Quest, QUEST_STATES } from './core/QuestManager.js';
import { CutsceneManager, CUTSCENE_TRIGGERS } from './core/CutsceneManager.js';
import { ConversationTreeManager } from './core/ConversationTreeManager.js';
import { IsometricRenderer } from './rendering/IsometricRenderer.js';
import { CutsceneRenderer } from './rendering/CutsceneRenderer.js';
import { DialoguePanel } from './ui/DialoguePanel.js';
import { JournalPanel } from './ui/JournalPanel.js';
import { InventoryPanel } from './ui/InventoryPanel.js';
import { LoadingScreen } from './ui/LoadingScreen.js';
import { AIGateway } from './ai/AIGateway.js';
import { PromptBuilder } from './ai/PromptBuilder.js';
import { ResponseParser } from './ai/ResponseParser.js';
import { GenerationQueue } from './ai/GenerationQueue.js';
import { ScenarioGenerator } from './ai/ScenarioGenerator.js';
import { PHASES, MOVEMENT, TIME, getInitialState } from './config.js';
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
        this.cutsceneManager = null;
        this.conversationManager = null;

        // Renderers
        this.cutsceneRenderer = null;

        // UI panels
        this.dialoguePanel = null;
        this.journalPanel = null;
        this.inventoryPanel = null;
        this.loadingScreen = null;

        // AI systems
        this.aiGateway = null;
        this.promptBuilder = null;
        this.responseParser = null;
        this.generationQueue = null;
        this.scenarioGenerator = null;

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

        // Create loading screen
        this.loadingScreen = new LoadingScreen(this.canvas);

        // Create UI panels
        this.dialoguePanel = new DialoguePanel(this.canvas);
        this.journalPanel = new JournalPanel(this.canvas);
        this.inventoryPanel = new InventoryPanel(this.canvas);
        this.setupDialogueCallbacks();
        this.setupInventoryCallbacks();

        // Initialize AI systems
        this.initializeAI();

        // Create scenario generator
        this.scenarioGenerator = new ScenarioGenerator(this.aiGateway);
        this.scenarioGenerator.onProgressUpdate = (progress, status) => {
            this.loadingScreen.setProgress(progress, status);
        };

        // Create conversation tree manager
        this.conversationManager = new ConversationTreeManager();
        this.setupConversationCallbacks();

        // Create scenario manager (pass generation queue for AI generation)
        this.scenarioManager = new ScenarioManager(this.generationQueue);

        // Create quest manager (linked to scenario manager)
        this.questManager = new QuestManager(this.scenarioManager);
        this.journalPanel.setQuestManager(this.questManager);
        this.setupQuestCallbacks();

        // Create cutscene system
        this.cutsceneRenderer = new CutsceneRenderer(this.canvas);
        this.cutsceneManager = new CutsceneManager(this.cutsceneRenderer);
        this.setupCutsceneCallbacks();

        // Create event system (linked to scenario manager)
        this.eventSystem = new EventSystem(this.scenarioManager);

        // Set up event system callbacks
        this.setupEventCallbacks();

        // Set up input handlers
        this.setupInputHandlers();

        // Start in generating phase with loading screen
        this.state.phase = PHASES.GENERATING;
        this.loadingScreen.show();

        // Start a temporary render loop for the loading screen
        // (main game loop doesn't start until start() is called after initialize)
        let loadingAnimationId = null;
        let lastTime = performance.now();
        let firstFrame = true;
        const renderLoadingScreen = (time) => {
            if (this.state.phase !== PHASES.GENERATING && this.state.phase !== PHASES.LOADING) {
                debugLog('[HistoryRPG] Loading render loop stopped - phase changed');
                return; // Stop when generation is complete
            }
            if (firstFrame) {
                debugLog(`[HistoryRPG] Loading render loop started - canvas: ${this.canvas.width}x${this.canvas.height}`);
                firstFrame = false;
            }
            const deltaTime = (time - lastTime) / 1000;
            lastTime = time;
            this.loadingScreen.update(deltaTime);
            this.loadingScreen.render();
            loadingAnimationId = requestAnimationFrame(renderLoadingScreen);
        };
        loadingAnimationId = requestAnimationFrame(renderLoadingScreen);

        // Generate the complete scenario
        try {
            await this.generateCompleteScenario();
            debugLog('[HistoryRPG] Scenario generation complete, building world...');
        } catch (error) {
            console.error('[HistoryRPG] Scenario generation failed:', error);
            this.loadingScreen.renderError(error.message);
            return;
        }

        try {
            // Generate initial terrain around start position
            debugLog('[HistoryRPG] Generating initial world terrain...');
            this.generateInitialWorld();

            // Center camera on player
            debugLog(`[HistoryRPG] Centering camera on player at (${this.state.player.position.x}, ${this.state.player.position.y})`);
            this.renderer.setCamera(
                this.state.player.position.x,
                this.state.player.position.y
            );

            // Stop loading animation and hide loading screen
            debugLog('[HistoryRPG] Hiding loading screen...');
            if (loadingAnimationId) {
                cancelAnimationFrame(loadingAnimationId);
            }
            this.loadingScreen.hide();

            // Transition to playing state
            this.state.phase = PHASES.PLAYING;
            debugLog('[HistoryRPG] Phase set to PLAYING');

            // Create and trigger intro cutscene based on generated scenario
            if (this.cutsceneManager && this.state.scenario) {
                debugLog('[HistoryRPG] Creating intro cutscene...');
                this.createIntroCutscene();
                this.cutsceneManager.checkTrigger(CUTSCENE_TRIGGERS.GAME_START);
            }

            console.log('[HistoryRPG] Initialized with scenario:', this.state.scenario?.title);
        } catch (error) {
            console.error('[HistoryRPG] World initialization failed:', error);
            debugLog(`[HistoryRPG] ERROR: ${error.message}`);
            debugLog(`[HistoryRPG] Stack: ${error.stack}`);
            this.loadingScreen.renderError(`World setup failed: ${error.message}`);
        }
    }

    // Set up conversation tree callbacks
    setupConversationCallbacks() {
        this.conversationManager.onObjectiveComplete = (objectiveId) => {
            debugLog(`[HistoryRPG] Objective completed via conversation: ${objectiveId}`);
            this.completeObjective(objectiveId);
        };

        this.conversationManager.onItemReceived = (itemId) => {
            debugLog(`[HistoryRPG] Item received via conversation: ${itemId}`);
            this.addItemToInventory(itemId);
        };

        this.conversationManager.onConversationEnd = (npcId) => {
            debugLog(`[HistoryRPG] Conversation ended with: ${npcId}`);
            this.endDialogue();
        };
    }

    // Generate the complete scenario using AI
    async generateCompleteScenario() {
        const { location, date } = this.state.scenarioSettings;

        debugLog(`[HistoryRPG] Generating scenario for ${location} on ${date}`);

        // Generate complete scenario with conversation trees
        const scenario = await this.scenarioGenerator.generateScenario({
            location,
            date,
            characterType: this.state.player.characterType
        });

        // Store the scenario
        this.state.scenario = scenario;

        // Load geography data into terrain generator
        if (scenario.geography && this.terrainGenerator) {
            debugLog(`[HistoryRPG] Loading geography: ${scenario.geography.streets?.length || 0} streets`);
            this.terrainGenerator.loadGeography(scenario.geography);
        }

        // Load conversation trees
        this.conversationManager.loadTrees(scenario.conversationTrees);

        // Set player start position
        this.state.player.position = {
            x: scenario.playerStart.x,
            y: scenario.playerStart.y
        };

        // Spawn main NPCs
        this.spawnScenarioNPCs(scenario);

        // Register quests from objectives
        this.registerScenarioQuests(scenario);

        debugLog(`[HistoryRPG] Scenario loaded: ${scenario.title}`);
        debugLog(`[HistoryRPG] Main goal: ${scenario.mainGoal.title}`);
        debugLog(`[HistoryRPG] ${Object.keys(scenario.mainNPCs).length} NPCs, ${scenario.objectives.length} objectives`);
    }

    // Spawn NPCs from the generated scenario
    spawnScenarioNPCs(scenario) {
        for (const [npcId, npc] of Object.entries(scenario.mainNPCs)) {
            // Get location for this NPC
            const location = scenario.locations[npc.locationId];
            const x = location?.gridX || scenario.playerStart.x + Math.floor(Math.random() * 20) - 10;
            const y = location?.gridY || scenario.playerStart.y + Math.floor(Math.random() * 20) - 10;

            // Add to entity manager
            if (this.entityManager) {
                this.entityManager.createNPC({
                    id: npcId,
                    name: npc.name,
                    role: npc.role,
                    faction: npc.faction,
                    personality: npc.description,
                    disposition: 50
                }, x, y);
            }

            // Also add to state for quick lookup
            this.state.npcs[npcId] = {
                id: npcId,
                name: npc.name,
                role: npc.role,
                faction: npc.faction,
                description: npc.description,
                locationId: npc.locationId,
                hasItem: npc.hasItem,
                wantsItem: npc.wantsItem,
                isEssential: npc.isEssential,
                disposition: 50,
                met: false,
                position: { x, y }
            };

            // Note: EntityManager.createNPC already registers with worldGrid

            debugLog(`[HistoryRPG] Spawned NPC: ${npc.name} at (${x}, ${y})`);
        }
    }

    // Register quests from scenario objectives
    registerScenarioQuests(scenario) {
        // Create main quest using Quest class
        const mainQuest = new Quest({
            id: scenario.mainGoal.id,
            title: scenario.mainGoal.title,
            description: scenario.mainGoal.description,
            type: 'main',
            objectives: scenario.objectives.map(obj => ({
                id: obj.id,
                description: obj.title,
                type: obj.type,
                target: obj.target
            }))
        });

        // Set quest as available so startQuest will work
        mainQuest.state = QUEST_STATES.AVAILABLE;

        if (this.questManager) {
            this.questManager.addQuest(mainQuest);
            this.questManager.startQuest(mainQuest.id);
        }

        debugLog(`[HistoryRPG] Registered main quest: ${mainQuest.title}`);
    }

    // Complete an objective
    completeObjective(objectiveId) {
        if (!this.state.scenario) return;

        const objective = this.state.scenario.objectives.find(o => o.id === objectiveId);
        if (objective && !this.state.scenario.completedObjectives.includes(objectiveId)) {
            this.state.scenario.completedObjectives.push(objectiveId);
            debugLog(`[HistoryRPG] Completed objective: ${objective.title}`);

            // Update quest manager - get the quest and complete the objective
            if (this.questManager) {
                const mainQuestId = this.state.scenario.mainGoal.id;
                const quest = this.questManager.quests.get(mainQuestId);
                if (quest) {
                    quest.completeObjective(objectiveId);

                    // Trigger callback if all quest objectives are done
                    if (this.questManager.onObjectiveComplete) {
                        this.questManager.onObjectiveComplete(quest, objective);
                    }
                }
            }

            // Check if all objectives complete
            if (this.state.scenario.completedObjectives.length === this.state.scenario.objectives.length) {
                this.handleScenarioComplete();
            }
        }
    }

    // Handle scenario completion
    handleScenarioComplete() {
        debugLog(`[HistoryRPG] SCENARIO COMPLETE!`);

        // Create ending cutscene
        if (this.cutsceneManager && this.state.scenario.mainGoal.successEnding) {
            const endingCutscene = {
                id: 'ending',
                title: 'Victory',
                autoAdvance: false,
                frames: [
                    {
                        environment: 'exterior_day',
                        title: this.state.scenario.mainGoal.title,
                        text: this.state.scenario.mainGoal.successEnding
                    },
                    {
                        environment: 'exterior_day',
                        title: 'THE END',
                        text: 'Your choices shaped history. Well done!'
                    }
                ],
                trigger: CUTSCENE_TRIGGERS.CUSTOM
            };

            this.cutsceneManager.addCutscene(endingCutscene);
            this.cutsceneManager.queueCutscene('ending');
        }
    }

    // Create intro cutscene from generated scenario
    createIntroCutscene() {
        if (!this.state.scenario) return;

        const scenario = this.state.scenario;
        const introCutscene = {
            id: 'intro',
            title: scenario.title,
            autoAdvance: false,
            frames: [
                {
                    environment: 'exterior_day',
                    title: scenario.inputSettings.location,
                    subtitle: scenario.inputSettings.date,
                    text: scenario.setting
                },
                {
                    environment: 'interior_ruined',
                    text: scenario.historicalContext || 'You find yourself caught in the currents of history.'
                },
                {
                    environment: 'interior_ruined',
                    title: 'Your Goal',
                    text: scenario.mainGoal.description
                }
            ],
            trigger: CUTSCENE_TRIGGERS.GAME_START
        };

        this.cutsceneManager.addCutscene(introCutscene);
    }

    // Add item to player inventory
    addItemToInventory(itemId) {
        if (!this.state.scenario?.items) return;

        const item = this.state.scenario.items[itemId];
        if (item && !this.state.player.inventory.includes(itemId)) {
            this.state.player.inventory.push(itemId);
            this.state.scenario.collectedItems.push(itemId);

            debugLog(`[HistoryRPG] Added to inventory: ${item.name}`);

            // Update inventory panel
            if (this.inventoryPanel) {
                this.inventoryPanel.addItem({
                    id: itemId,
                    name: item.name,
                    description: item.description
                });
            }
        }
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
        this.dialoguePanel.onChoiceSelected = async (choice, choiceIndex) => {
            debugLog(`[HistoryRPG] Player chose: ${choice.text}`);

            // Check if using conversation tree
            if (this.state.currentDialogue?.usingTree) {
                this.processTreeChoice(choiceIndex);
            } else {
                await this.continueDialogue(choice.text);
            }
        };

        this.dialoguePanel.onDialogueEnd = () => {
            debugLog(`[HistoryRPG] Dialogue ended`);
            this.endDialogue();
        };
    }

    // Process a choice in tree-based dialogue
    processTreeChoice(choiceIndex) {
        if (!this.state.currentDialogue?.usingTree) return;

        const result = this.conversationManager.processChoice(
            choiceIndex,
            this.state.player.inventory
        );

        if (!result) {
            debugLog(`[HistoryRPG] Failed to process tree choice`);
            this.endDialogue();
            return;
        }

        // Add player choice to history
        this.state.currentDialogue.history.push({
            speaker: 'player',
            text: result.choiceText,
            isPlayer: true
        });

        // Handle item received
        if (result.itemReceived) {
            this.addItemToInventory(result.itemReceived);
        }

        // Handle objective completed
        if (result.objectiveCompleted) {
            this.completeObjective(result.objectiveCompleted);
        }

        // Check if conversation ended
        if (result.ended) {
            debugLog(`[HistoryRPG] Tree conversation ended`);
            this.endDialogue();
            return;
        }

        // Add NPC response to history
        this.state.currentDialogue.history.push({
            speaker: this.state.currentDialogue.npc.name,
            text: result.speech,
            isPlayer: false
        });

        // Format response for dialogue panel
        const response = {
            speech: result.speech,
            emotion: 'neutral',
            suggestedChoices: result.choices.map(c => ({
                text: c.text,
                type: c.type || 'neutral',
                nodeId: c.nextNode,
                requiresItem: c.requiresItem,
                givesItem: c.givesItem,
                completesObjective: c.completesObjective
            }))
        };

        // Update dialogue state and panel
        this.state.currentDialogue.response = response;
        this.dialoguePanel.updateDialogue(response);
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

    // Set up cutscene manager callbacks
    setupCutsceneCallbacks() {
        this.cutsceneManager.onCutsceneStart = (cutscene) => {
            debugLog(`[HistoryRPG] Cutscene started: ${cutscene?.title}`);
            this.state.phase = PHASES.CUTSCENE;
            this.state.currentCutscene = cutscene;
        };

        this.cutsceneManager.onCutsceneEnd = (cutscene) => {
            debugLog(`[HistoryRPG] Cutscene ended: ${cutscene?.title}`);
            this.state.currentCutscene = null;

            // Only return to playing if no more cutscenes pending
            if (!this.cutsceneManager.isPlaying()) {
                this.state.phase = PHASES.PLAYING;
            }
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

        // Handle cutscene input
        if (this.state.phase === PHASES.CUTSCENE && this.cutsceneManager) {
            if (this.cutsceneManager.handleInput(e.key)) {
                e.preventDefault();
                return;
            }
        }

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
        // Don't process world clicks during dialogue, cutscene, or when UI panels are open
        if (this.state.phase === PHASES.DIALOGUE ||
            this.state.phase === PHASES.CUTSCENE ||
            this.journalPanel?.isOpen ||
            this.inventoryPanel?.isOpen) {
            return;
        }

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
        // Handle loading/generating phase
        if (this.state.phase === PHASES.LOADING || this.state.phase === PHASES.GENERATING) {
            if (this.loadingScreen) {
                this.loadingScreen.update(deltaTime);
            }
            return;
        }

        // Handle cutscene phase
        if (this.state.phase === PHASES.CUTSCENE) {
            if (this.cutsceneManager) {
                this.cutsceneManager.update(deltaTime);
            }
            return;
        }

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

                // Trigger location cutscene if any
                if (this.cutsceneManager) {
                    this.cutsceneManager.checkTrigger(CUTSCENE_TRIGGERS.LOCATION, location.id);
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
        // Render loading screen during scenario generation
        if (this.state.phase === PHASES.GENERATING || this.state.phase === PHASES.LOADING) {
            if (this.loadingScreen?.isVisible) {
                this.loadingScreen.render();
            }
            return;
        }

        // Render cutscene if in cutscene phase
        if (this.state.phase === PHASES.CUTSCENE && this.cutsceneManager?.isPlaying()) {
            this.cutsceneManager.render();
            return;
        }

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

        // Render street names (from AI-generated geography)
        if (this.terrainGenerator) {
            this.renderer.renderStreetNames(this.terrainGenerator, this.state.player.position);
        }

        // Render location markers for key quest locations
        if (this.state.scenario) {
            this.renderer.renderLocationMarkers(this.state.scenario, this.state.player.position);
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
        // GUARD: Prevent re-entry if already in dialogue or starting dialogue
        if (this.state.phase === PHASES.DIALOGUE ||
            this.state.phase === PHASES.CUTSCENE ||
            this.state.currentDialogue ||
            this._startingDialogue) {
            debugLog(`[HistoryRPG] startDialogue blocked - already in dialogue or starting`);
            return;
        }

        const npc = this.state.npcs[npcId];
        if (!npc) return;

        // Set flag to prevent race conditions
        this._startingDialogue = true;
        debugLog(`[HistoryRPG] Starting dialogue with ${npc.name} (id: ${npcId})`);

        // Mark as met in both local state and scenario manager
        const firstMeeting = !npc.met;
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

        // Check if NPC has a pre-generated conversation tree
        if (this.conversationManager.hasTree(npcId)) {
            this.startTreeDialogue(npcId, npc);
        } else {
            // Ambient NPC - use simple fallback dialogue
            this.startFallbackDialogue(npc);
        }

        this._startingDialogue = false;
    }

    // Start dialogue using pre-generated conversation tree
    startTreeDialogue(npcId, npc) {
        // Get conversation from tree
        const conversation = this.conversationManager.startConversation(
            npcId,
            this.state.player.inventory
        );

        if (!conversation) {
            debugLog(`[HistoryRPG] Failed to start tree dialogue for ${npcId}`);
            this.startFallbackDialogue(npc);
            return;
        }

        // Format for dialogue panel
        const response = {
            speech: conversation.speech,
            emotion: 'neutral',
            suggestedChoices: conversation.choices.map(c => ({
                text: c.text,
                type: c.type || 'neutral',
                nodeId: c.nextNode,
                requiresItem: c.requiresItem,
                givesItem: c.givesItem,
                completesObjective: c.completesObjective
            }))
        };

        this.state.currentDialogue = {
            npcId,
            npc,
            response,
            usingTree: true,
            history: [
                { speaker: npc.name, text: conversation.speech, isPlayer: false }
            ]
        };

        // Start dialogue panel
        this.dialoguePanel.startDialogue(npc, response);
        this.state.phase = PHASES.DIALOGUE;
        debugLog(`[HistoryRPG] Started tree dialogue with ${npc.name}`);
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
            history: [
                // Include initial greeting in history for context
                { speaker: npc.name, text: response.speech, isPlayer: false }
            ],
            fallbackState: 'greeting' // Track fallback conversation state
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

        // Add player's response to history BEFORE generating response
        history.push({ speaker: 'player', text: playerInput, isPlayer: true });

        debugLog(`[HistoryRPG] Continuing dialogue, history length: ${history.length}`);

        let response;

        if (this.aiGateway.isAvailable()) {
            try {
                const context = {
                    location: this.state.scenario?.setting || 'the city',
                    timePeriod: 'World War 2',
                    situation: 'The city is under siege.',
                    playerRole: this.state.player.characterType || 'civilian',
                    history: history // Pass conversation history to AI
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
        history.push({ speaker: npc.name, text: response.speech, isPlayer: false });

        debugLog(`[HistoryRPG] NPC responded: "${response.speech.substring(0, 50)}..."`);

        // Update dialogue panel with new response
        this.dialoguePanel.updateDialogue(response);
    }

    // Get fallback response when AI is unavailable
    getFallbackResponse(npc, playerInput) {
        const lowerInput = playerInput.toLowerCase();
        const history = this.state.currentDialogue?.history || [];
        const historyLength = history.length;

        // Track topics already discussed to avoid repetition
        const discussedTopics = new Set();
        for (const entry of history) {
            const text = entry.text.toLowerCase();
            if (text.includes('supplies') || text.includes('food')) discussedTopics.add('supplies');
            if (text.includes('area') || text.includes('dangerous')) discussedTopics.add('area');
            if (text.includes('escape') || text.includes('tunnel') || text.includes('river')) discussedTopics.add('escape');
            if (text.includes('safe') || text.includes('shelter')) discussedTopics.add('safety');
            if (text.includes('soldier') || text.includes('army')) discussedTopics.add('soldiers');
        }

        debugLog(`[HistoryRPG] Fallback response - history: ${historyLength}, discussed: ${[...discussedTopics].join(', ')}`);

        // Simple keyword matching for fallback responses
        if (lowerInput.includes('supplies') || lowerInput.includes('food')) {
            return {
                speech: `${npc.name} shakes their head. "Supplies are scarce. Everyone is looking for food and water."`,
                emotion: 'concerned',
                suggestedChoices: this.getContextualChoices(npc, discussedTopics, 'supplies')
            };
        }

        if (lowerInput.includes('where') && lowerInput.includes('find')) {
            return {
                speech: `${npc.name} thinks for a moment. "There's an old warehouse to the east. It was bombed, but the basement might still have something. Be careful though."`,
                emotion: 'helpful',
                suggestedChoices: this.getContextualChoices(npc, discussedTopics, 'location_hint')
            };
        }

        if (lowerInput.includes('area') || lowerInput.includes('tell me')) {
            return {
                speech: `${npc.name} looks around warily. "This area is dangerous. The fighting has destroyed most buildings. Stay low and avoid open streets."`,
                emotion: 'cautious',
                suggestedChoices: this.getContextualChoices(npc, discussedTopics, 'area')
            };
        }

        if (lowerInput.includes('safe') || lowerInput.includes('shelter')) {
            return {
                speech: `${npc.name} gestures vaguely. "The cellars are the safest. When the shelling starts, get underground. Some buildings still have intact basements."`,
                emotion: 'concerned',
                suggestedChoices: this.getContextualChoices(npc, discussedTopics, 'safety')
            };
        }

        if (lowerInput.includes('soldier') || lowerInput.includes('army')) {
            return {
                speech: `${npc.name}'s expression darkens. "Both sides are everywhere. Soviet soldiers might help civilians, or they might conscript you. Germans... it depends on the officer."`,
                emotion: 'wary',
                suggestedChoices: this.getContextualChoices(npc, discussedTopics, 'soldiers')
            };
        }

        if (lowerInput.includes('way out') || lowerInput.includes('escape')) {
            return {
                speech: `${npc.name} lowers their voice. "The river might be a way out, but it's heavily watched. I've heard rumors of tunnels, but I don't know where."`,
                emotion: 'secretive',
                suggestedChoices: this.getContextualChoices(npc, discussedTopics, 'escape')
            };
        }

        if (lowerInput.includes('tunnel')) {
            return {
                speech: `${npc.name} shrugs. "I've only heard whispers. They say the old factory district has passages underneath. Built before the war for something."`,
                emotion: 'uncertain',
                suggestedChoices: this.getContextualChoices(npc, discussedTopics, 'tunnels')
            };
        }

        if (lowerInput.includes('thank')) {
            return {
                speech: `${npc.name} gives a small nod. "Stay safe out there. These days, that's all any of us can do."`,
                emotion: 'neutral',
                suggestedChoices: [
                    { text: "You too. Take care.", type: "friendly" },
                    { text: "I should go.", type: "leaving" }
                ]
            };
        }

        // Default response - varies based on how long conversation has been
        if (historyLength > 4) {
            return {
                speech: `${npc.name} seems to grow restless. "I've told you what I know. Is there something else?"`,
                emotion: 'impatient',
                suggestedChoices: [
                    { text: "No, thank you for your help.", type: "friendly" },
                    { text: "I should go.", type: "leaving" }
                ]
            };
        }

        return {
            speech: `${npc.name} considers your words. "I understand. We're all just trying to survive."`,
            emotion: 'neutral',
            suggestedChoices: this.getContextualChoices(npc, discussedTopics, 'default')
        };
    }

    // Get contextual choices based on what's been discussed
    getContextualChoices(npc, discussedTopics, currentTopic) {
        const choices = [];

        // Add undiscussed topics as options
        if (!discussedTopics.has('supplies') && currentTopic !== 'supplies') {
            choices.push({ text: "Do you know where I can find supplies?", type: "neutral" });
        }
        if (!discussedTopics.has('area') && currentTopic !== 'area') {
            choices.push({ text: "What can you tell me about this area?", type: "neutral" });
        }
        if (!discussedTopics.has('escape') && currentTopic !== 'escape') {
            choices.push({ text: "Is there a way out of the city?", type: "neutral" });
        }
        if (!discussedTopics.has('safety') && currentTopic !== 'safety') {
            choices.push({ text: "Is there anywhere safe?", type: "neutral" });
        }
        if (!discussedTopics.has('soldiers') && currentTopic !== 'soldiers' && choices.length < 3) {
            choices.push({ text: "What about the soldiers?", type: "neutral" });
        }

        // If we've discussed most topics, offer follow-ups based on current topic
        if (choices.length === 0) {
            if (currentTopic === 'escape' || currentTopic === 'tunnels') {
                choices.push({ text: "Who might know more about the tunnels?", type: "neutral" });
            }
            if (currentTopic === 'supplies' || currentTopic === 'location_hint') {
                choices.push({ text: "Thank you, that's helpful.", type: "friendly" });
            }
        }

        // Always add leaving option
        if (choices.length < 3) {
            choices.push({ text: "Thank you for your help.", type: "friendly" });
        }
        choices.push({ text: "I should go.", type: "leaving" });

        return choices.slice(0, 4); // Max 4 choices
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
