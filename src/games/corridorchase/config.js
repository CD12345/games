// Corridor Chase game configuration and constants

export const CORRIDOR_CONFIG = {
    // Grid dimensions
    gridSize: 9,

    // Starting positions (grid coordinates 0-8)
    startPositions: {
        p1: { x: 4, y: 8 },  // Bottom center
        p2: { x: 4, y: 0 }   // Top center
    },

    // Goal rows (player wins by reaching opponent's starting row)
    goalRows: {
        p1: 0,  // Player 1 wins by reaching row 0 (top)
        p2: 8   // Player 2 wins by reaching row 8 (bottom)
    },

    // Wall settings
    wallsPerPlayer: 10,

    // Timing
    countdownDuration: 3000,  // 3 seconds before game starts
    turnTimer: null           // Optional: time limit per turn (null = no limit)
};

/**
 * Get initial game state
 * @returns {Object} Initial game state
 */
export function getInitialState() {
    return {
        // Game phase
        phase: 'countdown',  // 'countdown', 'playing', 'gameover'

        // Turn management
        currentTurn: 'p1',
        turnNumber: 0,

        // Player positions (grid coordinates 0-8)
        pawns: {
            p1: { ...CORRIDOR_CONFIG.startPositions.p1 },
            p2: { ...CORRIDOR_CONFIG.startPositions.p2 }
        },

        // Walls array
        // Each wall: { x, y, orientation: 'h'|'v', owner: 'p1'|'p2' }
        // x,y is top-left cell for the wall
        // 'h' = horizontal wall (blocks vertical movement between rows)
        // 'v' = vertical wall (blocks horizontal movement between columns)
        walls: [],

        // Resources
        wallsRemaining: {
            p1: CORRIDOR_CONFIG.wallsPerPlayer,
            p2: CORRIDOR_CONFIG.wallsPerPlayer
        },

        // Player info
        playerNames: {
            p1: 'Player 1',
            p2: 'Player 2'
        },

        // Game outcome
        winner: null,       // 'p1' or 'p2'
        forfeitBy: null,    // 'p1' or 'p2'

        // Timing
        elapsed: 0          // Elapsed time in ms
    };
}
