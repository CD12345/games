/**
 * Stack Race - Game Configuration
 *
 * 3D pyramid stacking game inspired by Pylos.
 * Players build a pyramid, create 2x2 patterns to retrieve pieces,
 * and race to place the first piece on the top.
 */

export const STACK_RACE_CONFIG = {
    // Grid dimensions (5 levels with decreasing sizes)
    levelSizes: [5, 4, 3, 2, 1],  // Level 0-4 grid sizes

    // Starting piece counts
    initialPieceCount: 15,

    // Timing
    countdownDuration: 3000,  // 3 seconds

    // Rendering constants
    cellWidth: 40,           // Base cell width for isometric projection
    cellHeight: 20,          // Base cell height (2:1 ratio)
    stackHeight: 25,         // Vertical spacing between levels

    // Colors
    colors: {
        background: '#1a1a2e',
        gridLine: '#2d2d44',

        p1: '#4a9eff',          // Blue for player 1
        p1Light: '#7bb5ff',     // Lighter blue for highlights
        p1Dark: '#2d7ddb',      // Darker blue for shading

        p2: '#ff4a6e',          // Red for player 2
        p2Light: '#ff7d98',     // Lighter red for highlights
        p2Dark: '#db2d52',      // Darker red for shading

        neutral: '#3a3a4e',     // Empty positions
        validMove: 'rgba(74, 222, 128, 0.3)',
        preview: 'rgba(74, 222, 128, 0.5)',
        retrieval: 'rgba(74, 222, 128, 0.4)',

        text: '#ffffff',
        textShadow: 'rgba(0, 0, 0, 0.5)'
    }
};

/**
 * Get initial game state
 */
export function getInitialState() {
    return {
        // Game phase
        phase: 'countdown',  // 'countdown', 'placement', 'select_retrieval', 'gameover'

        // Turn management
        currentTurn: 'p1',
        turnNumber: 0,

        // 3D Grid - grid[level][row][col]
        // Level 0: 5x5, Level 1: 4x4, Level 2: 3x3, Level 3: 2x2, Level 4: 1x1
        // Each cell: null | { owner: 'p1'|'p2' }
        grid: [
            Array(5).fill(null).map(() => Array(5).fill(null)),  // Level 0: 5x5
            Array(4).fill(null).map(() => Array(4).fill(null)),  // Level 1: 4x4
            Array(3).fill(null).map(() => Array(3).fill(null)),  // Level 2: 3x3
            Array(2).fill(null).map(() => Array(2).fill(null)),  // Level 3: 2x2
            Array(1).fill(null).map(() => Array(1).fill(null))   // Level 4: 1x1
        ],

        // Piece counts
        pieceCounts: {
            p1: 15,
            p2: 15
        },

        // Retrieval state (when player created 2x2)
        retrievalOptions: [],        // [{ level, row, col }, ...]
        selectedForRetrieval: [],    // [{ level, row, col }, ...]

        // Player info
        playerNames: {
            p1: 'Player 1',
            p2: 'Player 2'
        },

        // Game outcome
        winner: null,       // 'p1' or 'p2'
        forfeitBy: null,    // 'p1' or 'p2'

        // Timing
        elapsed: 0,         // Elapsed time in ms
        countdownStartTime: null
    };
}
