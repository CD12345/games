/**
 * Claim Territory - Game Configuration
 *
 * Strategic territory control game where players claim adjacent cells
 * to expand their domain. Most cells wins!
 */

export const CLAIM_TERRITORY_CONFIG = {
    gridSize: 10,

    // Starting positions (opposite corners)
    startPositions: {
        p1: { x: 0, y: 0 },    // Top-left corner
        p2: { x: 9, y: 9 }     // Bottom-right corner
    },

    // Timing
    countdownDuration: 3000,  // 3 seconds

    // Colors
    colors: {
        background: '#1a1a2e',
        gridLine: '#2d2d44',
        cellBg: '#2a2a3e',

        p1: '#4a9eff',          // Blue for player 1
        p1Light: '#7bb5ff',     // Lighter blue for highlights
        p1Dark: '#2d7ddb',      // Darker blue for borders

        p2: '#ff4a6e',          // Red for player 2
        p2Light: '#ff7d98',     // Lighter red for highlights
        p2Dark: '#db2d52',      // Darker red for borders

        neutral: '#3a3a4e',     // Unclaimed cells

        validMove: 'rgba(74, 222, 128, 0.3)',
        preview: 'rgba(74, 222, 128, 0.5)',
        previewInvalid: 'rgba(255, 74, 110, 0.4)',

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
        phase: 'countdown',  // 'countdown', 'playing', 'gameover'

        // Turn management
        currentTurn: 'p1',
        turnNumber: 0,

        // Grid state (10x10, null = unclaimed, 'p1' or 'p2' for owned cells)
        grid: Array(10).fill(null).map(() => Array(10).fill(null)),

        // Cell counts
        cellCounts: {
            p1: 1,  // Starts with 1 (starting position)
            p2: 1
        },

        // Player info
        playerNames: {
            p1: 'Player 1',
            p2: 'Player 2'
        },

        // Game outcome
        winner: null,       // 'p1' or 'p2' or null for draw
        forfeitBy: null,    // 'p1' or 'p2'

        // Timing
        elapsed: 0,         // Elapsed time in ms
        countdownStartTime: null
    };
}
