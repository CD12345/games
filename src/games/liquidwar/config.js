// Liquid War game configuration and constants

export const LIQUID_WAR_CONFIG = {
    // Grid settings
    grid: {
        width: 100,              // Logical grid width
        height: 100,             // Logical grid height (square for simplicity)
    },

    // Particle settings
    particle: {
        initialCount: 800,       // Particles per player at start
        maxHealth: 100,          // Maximum health per particle
        attackDamage: 8,         // Damage dealt per tick when attacking
        healAmount: 3,           // Health restored per tick when near ally
        moveSpeed: 1,            // Cells moved per tick
    },

    // Cursor settings
    cursor: {
        radius: 0.04,            // Visual radius relative to canvas
        speed: 0.02,             // Movement speed per frame
    },

    // Game settings
    game: {
        tickRate: 15,            // Logic updates per second
        syncRate: 10,            // State syncs per second
        countdownTime: 3000,     // Countdown before game starts (ms)
        maxTime: 180000,         // Max game time (3 minutes)
    },

    // Team colors
    colors: {
        teams: [
            '#FF4444',  // Player 1 - Red
            '#4444FF',  // Player 2 - Blue
            '#44FF44',  // Player 3 - Green
            '#FFFF44',  // Player 4 - Yellow
            '#FF44FF',  // Player 5 - Magenta
            '#44FFFF',  // Player 6 - Cyan
        ],
        wall: '#333333',
        floor: '#1a1a2e',
        cursor: '#FFFFFF',
    },
};

// Classic maps - 1 = wall, 0 = floor
// Maps are defined as arrays of strings for readability
export const MAPS = {
    // Simple open arena
    arena: {
        name: 'Arena',
        data: `
            1111111111111111
            1..............1
            1..............1
            1..............1
            1..............1
            1..............1
            1..............1
            1..............1
            1..............1
            1..............1
            1..............1
            1..............1
            1..............1
            1..............1
            1..............1
            1111111111111111
        `,
    },

    // Cross/Plus shape
    cross: {
        name: 'Cross',
        data: `
            1111111111111111
            1111111..1111111
            1111111..1111111
            1111111..1111111
            1111111..1111111
            1......11......1
            1......11......1
            1111111111111111
            1111111111111111
            1......11......1
            1......11......1
            1111111..1111111
            1111111..1111111
            1111111..1111111
            1111111..1111111
            1111111111111111
        `,
    },

    // Four rooms connected by corridors
    rooms: {
        name: 'Rooms',
        data: `
            1111111111111111
            1......11......1
            1......11......1
            1......11......1
            1...1..11..1...1
            1...1......1...1
            1...1......1...1
            1111111..1111111
            1111111..1111111
            1...1......1...1
            1...1......1...1
            1...1..11..1...1
            1......11......1
            1......11......1
            1......11......1
            1111111111111111
        `,
    },

    // Maze-like structure
    maze: {
        name: 'Maze',
        data: `
            1111111111111111
            1..............1
            1.111.1111.111.1
            1.1...1..1...1.1
            1.1.111..111.1.1
            1.1..........1.1
            1.1111.11.1111.1
            1......11......1
            1......11......1
            1.1111.11.1111.1
            1.1..........1.1
            1.1.111..111.1.1
            1.1...1..1...1.1
            1.111.1111.111.1
            1..............1
            1111111111111111
        `,
    },

    // Spiral pattern
    spiral: {
        name: 'Spiral',
        data: `
            1111111111111111
            1..............1
            1.111111111111.1
            1.1..........1.1
            1.1.11111111.1.1
            1.1.1......1.1.1
            1.1.1.1111.1.1.1
            1.1.1.1..1.1.1.1
            1.1.1.1..1.1.1.1
            1.1.1.1111.1.1.1
            1.1.1......1.1.1
            1.1.11111111.1.1
            1.1..........1.1
            1.111111111111.1
            1..............1
            1111111111111111
        `,
    },

    // Islands (multiple disconnected areas - tests pathfinding)
    islands: {
        name: 'Islands',
        data: `
            1111111111111111
            1..1....11....1.
            1..1....11....11
            1..1..........11
            1111..1111..1111
            1.....1..1.....1
            1.....1..1.....1
            11....1111....11
            11....1111....11
            1.....1..1.....1
            1.....1..1.....1
            1111..1111..1111
            1..1..........11
            1..1....11....11
            1..1....11....1.
            1111111111111111
        `,
    },

    // Narrow passages
    narrow: {
        name: 'Narrow',
        data: `
            1111111111111111
            1.1..........1.1
            1.1.11111111.1.1
            1.1.1......1.1.1
            1...1......1...1
            11111......11111
            1..............1
            1.111......111.1
            1.111......111.1
            1..............1
            11111......11111
            1...1......1...1
            1.1.1......1.1.1
            1.1.11111111.1.1
            1.1..........1.1
            1111111111111111
        `,
    },

    // Classic LW5-style "battlefield"
    battlefield: {
        name: 'Battlefield',
        data: `
            1111111111111111
            1..............1
            1.11..1111..11.1
            1.11..1111..11.1
            1..............1
            1....111111....1
            1..1.1....1.1..1
            1..1.1....1.1..1
            1..1.1....1.1..1
            1..1.1....1.1..1
            1....111111....1
            1..............1
            1.11..1111..11.1
            1.11..1111..11.1
            1..............1
            1111111111111111
        `,
    },
};

// Parse a map string into a 2D grid array
export function parseMap(mapData) {
    const lines = mapData.trim().split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const height = lines.length;
    const width = Math.max(...lines.map(l => l.length));

    const grid = [];
    for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
            const char = lines[y][x] || '1';
            row.push(char === '1' ? 1 : 0);  // 1 = wall, 0 = floor
        }
        grid.push(row);
    }

    return { grid, width, height };
}

// Scale a map to the target grid size
export function scaleMap(mapGrid, targetWidth, targetHeight) {
    const sourceHeight = mapGrid.length;
    const sourceWidth = mapGrid[0].length;

    const scaleX = targetWidth / sourceWidth;
    const scaleY = targetHeight / sourceHeight;

    const result = [];
    for (let y = 0; y < targetHeight; y++) {
        const row = [];
        const srcY = Math.floor(y / scaleY);
        for (let x = 0; x < targetWidth; x++) {
            const srcX = Math.floor(x / scaleX);
            row.push(mapGrid[srcY]?.[srcX] ?? 1);
        }
        result.push(row);
    }

    return result;
}

// Get starting positions for players based on team count
export function getStartPositions(width, height, teamCount) {
    const margin = 0.1;  // 10% margin from edges

    const positions = [
        { x: margin, y: margin },                    // Top-left
        { x: 1 - margin, y: 1 - margin },            // Bottom-right
        { x: 1 - margin, y: margin },                // Top-right
        { x: margin, y: 1 - margin },                // Bottom-left
        { x: 0.5, y: margin },                       // Top-center
        { x: 0.5, y: 1 - margin },                   // Bottom-center
    ];

    return positions.slice(0, teamCount).map(pos => ({
        x: Math.floor(pos.x * width),
        y: Math.floor(pos.y * height),
    }));
}

// Get initial game state
export function getInitialState() {
    return {
        phase: 'countdown',  // 'countdown', 'playing', 'gameover'
        startTime: Date.now(),
        winner: null,
        mapId: 'arena',
        cursors: {
            p1: { x: 0.15, y: 0.15 },
            p2: { x: 0.85, y: 0.85 },
        },
        particleCounts: {
            p1: 0,
            p2: 0,
        },
        playerNames: {
            p1: 'Player 1',
            p2: 'Player 2',
        },
    };
}

// Convert a setting value (map name) to a map ID
export function getMapIdFromSetting(settingValue) {
    // First check if it's already a valid map ID
    if (MAPS[settingValue]) {
        return settingValue;
    }

    // Try to find by name
    for (const [id, map] of Object.entries(MAPS)) {
        if (map.name === settingValue) {
            return id;
        }
    }

    // Default to arena
    return 'arena';
}
