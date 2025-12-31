/**
 * Slide Puzzle Battle - Configuration and Initial State
 */

export const SLIDE_PUZZLE_CONFIG = {
    gridSize: 5,
    countdownDuration: 3000,

    colors: {
        background: '#1a1a2e',
        gridLine: '#2d2d44',
        cellBg: '#2a2a3e',

        p1: '#4a9eff',
        p1Light: '#7bb5ff',
        p1Dark: '#2d7ddb',

        p2: '#ff4a6e',
        p2Light: '#ff7d98',
        p2Dark: '#db2d52',

        neutral: '#3a3a4e',
        outerRingBorder: '#5a5a7e',

        validMove: 'rgba(74, 222, 128, 0.3)',
        preview: 'rgba(74, 222, 128, 0.5)',
        confirm: 'rgba(74, 222, 128, 0.7)',

        arrowNormal: '#ffffff',
        arrowHover: 'rgba(74, 222, 128, 0.8)',
        arrowConfirmed: 'rgba(74, 222, 128, 1.0)',

        winLine: 'rgba(74, 222, 128, 0.9)',

        text: '#ffffff',
        textShadow: 'rgba(0, 0, 0, 0.5)'
    }
};

/**
 * Returns initial game state
 */
export function getInitialState() {
    return {
        // Game phase
        phase: 'countdown',

        // Turn management
        currentTurn: 'p1',
        turnNumber: 0,

        // Grid state (5x5, each cell is null or { owner: 'p1' | 'p2' })
        grid: Array(5).fill(null).map(() => Array(5).fill(null)),

        // Selected cell for current turn
        selectedCell: null,

        // Player info
        playerNames: {
            p1: 'Player 1',
            p2: 'Player 2'
        },

        // Game outcome
        winner: null,
        winningLine: null,
        forfeitBy: null,

        // Timing
        elapsed: 0,
        countdownStartTime: null
    };
}
