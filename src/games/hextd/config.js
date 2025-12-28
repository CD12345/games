// Hex Tower Defense - Game Configuration

// Map dimensions
export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 400;

// Tile types
export const TILE_TYPES = {
    EMPTY: 0,
    BLOCKED: 1,
    RAMP: 2,
    RESOURCE_NODE: 3,
    TOWER_SLOT: 4,
    MAIN_TOWER_SLOT: 5
};

// Height levels
export const HEIGHT_LOW = 0;
export const HEIGHT_HIGH = 1;

// Phase timing (milliseconds)
export const PHASE_TIMING = {
    PRE_WAVE: 20000,
    WAVE: 40000,
    INTER_WAVE: 5000
};

// Game phases
export const PHASES = {
    PRE_WAVE: 'PRE_WAVE',
    WAVE: 'WAVE',
    INTER_WAVE: 'INTER_WAVE',
    GAME_OVER: 'GAME_OVER'
};

// Economy
export const ECONOMY = {
    STARTING_ORE: 150,
    BASE_INCOME_PER_SEC: 2,
    RECYCLE_REFUND_RATIO: 0.75
};

// Mine stats
export const MINE_STATS = {
    COST: 80,
    HP: 200,
    INCOME_PER_SEC: 3
};

// Tower stats
export const TOWER_TYPES = {
    LIGHT: 'LIGHT',
    MEDIUM: 'MEDIUM',
    HEAVY: 'HEAVY',
    MAIN: 'MAIN'
};

export const TOWER_STATS = {
    LIGHT: {
        cost: 60,
        maxHP: 200,
        damage: 15,
        cooldown: 0.7,
        range: 4
    },
    MEDIUM: {
        cost: 100,
        maxHP: 280,
        damage: 28,
        cooldown: 1.0,
        range: 4
    },
    HEAVY: {
        cost: 160,
        maxHP: 360,
        damage: 60,
        cooldown: 1.6,
        range: 5
    },
    MAIN: {
        cost: 0,
        maxHP: 1000,
        damage: 40,
        cooldown: 1.2,
        range: 6
    }
};

// Unit stats
export const UNIT_TYPES = {
    LIGHT: 'LIGHT',
    MEDIUM: 'MEDIUM',
    HEAVY: 'HEAVY'
};

export const UNIT_STATS = {
    LIGHT: {
        cost: 30,
        maxHP: 80,
        speed: 3.0,
        damage: 8,
        cooldown: 0.7,
        attackRange: 0.6,
        radius: 0.3
    },
    MEDIUM: {
        cost: 70,
        maxHP: 180,
        speed: 2.2,
        damage: 16,
        cooldown: 0.9,
        attackRange: 0.6,
        radius: 0.4
    },
    HEAVY: {
        cost: 140,
        maxHP: 380,
        speed: 1.6,
        damage: 34,
        cooldown: 1.2,
        attackRange: 0.6,
        radius: 0.5
    }
};

// Combat modifiers
export const COMBAT = {
    HIGH_GROUND_RANGE_BONUS: 0.20
};

// Rendering
export const RENDER = {
    HEX_SIZE: 1.0,
    HEIGHT_SCALE: 0.5,
    CHUNK_SIZE: 20
};

// Network
export const NETWORK = {
    STATE_SYNC_RATE: 30,
    INPUT_SYNC_RATE: 60
};

// AI difficulty settings
export const AI_DIFFICULTY = {
    EASY: {
        reactionDelay: 2000,
        buildEfficiency: 0.6,
        compositionQuality: 0.5
    },
    MEDIUM: {
        reactionDelay: 1000,
        buildEfficiency: 0.8,
        compositionQuality: 0.75
    },
    HARD: {
        reactionDelay: 500,
        buildEfficiency: 0.95,
        compositionQuality: 0.9
    }
};

// Terrain generation
export const TERRAIN = {
    NOISE_SCALE: 0.05,
    HIGH_GROUND_THRESHOLD: 0.5,
    LANE_COUNT: 3,
    LANE_WIDTH: 4,
    TOWER_SLOTS_PER_HALF: 80,
    SAFE_RESOURCE_NODES: 3,
    CONTESTED_RESOURCE_NODES: 5
};

// Spawn settings
export const SPAWN = {
    PLAYER_1_Q: 5,
    PLAYER_2_Q: 94,
    SPAWN_DURATION: 2000
};

// Get initial game state
export function getInitialState(settings = {}) {
    return {
        phase: PHASES.PRE_WAVE,
        waveNumber: 1,
        phaseStartTime: Date.now(),

        players: {
            p1: {
                ore: ECONOMY.STARTING_ORE,
                mainTowerHP: TOWER_STATS.MAIN.maxHP,
                pendingUnits: [],
                isAI: false
            },
            p2: {
                ore: ECONOMY.STARTING_ORE,
                mainTowerHP: TOWER_STATS.MAIN.maxHP,
                pendingUnits: [],
                isAI: settings.aiDifficulty ? true : false
            }
        },

        towers: [],
        units: [],
        mines: [],

        mapSeed: settings.mapSeed || Math.random().toString(36).substring(2, 10),
        aiDifficulty: settings.aiDifficulty || 'MEDIUM',

        nextEntityId: 1
    };
}
