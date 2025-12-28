// History RPG - Game Configuration

// Map dimensions (in tiles)
export const MAP_WIDTH = 256;
export const MAP_HEIGHT = 256;
export const CHUNK_SIZE = 16;

// Tile types
export const TILE_TYPES = {
    EMPTY: 0,
    GROUND: 1,
    RUBBLE: 2,
    WALL: 3,
    FLOOR: 4,
    SNOW: 5,
    WATER: 6,
    ROAD: 7,
    BUILDING: 8
};

// Height levels (0-15)
export const MAX_HEIGHT = 15;

// Game phases
export const PHASES = {
    LOADING: 'loading',
    SCENARIO_SELECT: 'scenario_select',
    GENERATING: 'generating',
    PLAYING: 'playing',
    CUTSCENE: 'cutscene',
    DIALOGUE: 'dialogue',
    PAUSED: 'paused',
    GAME_OVER: 'game_over'
};

// Isometric rendering constants
export const ISO = {
    TILE_WIDTH: 64,
    TILE_HEIGHT: 32,
    TILE_DEPTH: 16  // Height per elevation unit
};

// Level of Detail distances (in chunks)
export const LOD = {
    HIGH: 3,
    MEDIUM: 6,
    LOW: 10
};

// AI generation priorities (lower = higher priority)
export const AI_PRIORITY = {
    SCENARIO_SKELETON: 0,
    PLAYER_START_AREA: 1,
    NPC_DIALOGUE: 2,
    ADJACENT_CHUNKS: 3,
    LOCATION_DETAILS: 4,
    FAR_TERRAIN: 5
};

// Network sync rates
export const NETWORK = {
    STATE_SYNC_RATE: 10,  // RPG needs less frequent updates
    INPUT_SYNC_RATE: 30
};

// Player stats
export const DEFAULT_STATS = {
    strength: 5,
    agility: 5,
    charisma: 5,
    perception: 5
};

// Movement speed (tiles per second)
export const MOVEMENT = {
    WALK_SPEED: 3,
    RUN_SPEED: 5
};

// Time of day
export const TIME = {
    HOURS_PER_REAL_MINUTE: 2,  // 1 real minute = 2 game hours
    DAWN: 6,
    DUSK: 18
};

// Available scenarios (for MVP)
export const SCENARIOS = {
    STALINGRAD: {
        id: 'stalingrad_nov42',
        name: 'Battle of Stalingrad',
        timePeriod: 'World War 2',
        date: 'November 1942',
        location: 'Stalingrad, Soviet Union',
        lat: 48.708,
        lon: 44.513
    }
};

// Get initial game state
export function getInitialState(settings = {}) {
    return {
        // Core state
        phase: PHASES.LOADING,
        startTime: Date.now(),
        elapsed: 0,

        // Scenario
        scenario: null,
        scenarioId: settings.scenarioId || 'stalingrad_nov42',

        // Player
        player: {
            position: { x: 0, y: 0 },
            targetPosition: null,
            facing: 'south',
            inventory: [],
            health: 100,
            maxHealth: 100,
            stats: { ...DEFAULT_STATS },
            quests: [],
            activeQuest: null,
            knowledge: [],
            characterType: settings.characterType || 'civilian'
        },

        // World
        world: {
            loadedChunks: [],
            weather: 'clear',
            timeOfDay: 8,  // 0-24 hours
            daysPassed: 0
        },

        // NPCs (sparse - only nearby NPCs fully loaded)
        npcs: {},
        npcPositions: {},

        // Current interaction
        currentDialogue: null,
        currentCutscene: null,

        // AI generation state
        aiQueue: [],
        aiGenerating: false,
        aiGatewayPlayer: null,

        // Multiplayer
        players: {},
        isHost: settings.isHost || false,

        // Camera
        camera: {
            x: 0,
            y: 0,
            zoom: 1
        },

        // API settings
        apiKey: settings.apiKey || null,
        apiProvider: settings.apiProvider || 'claude'  // 'claude' or 'openai'
    };
}
