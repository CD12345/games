/**
 * Pattern Match (Quarto) - Game Configuration
 *
 * Turn-based strategy game where players place pieces their opponent selected,
 * trying to create a row of 4 pieces sharing any common attribute.
 */

export const PATTERN_MATCH_CONFIG = {
    gridSize: 4,
    pieceCount: 16,
    attributes: ['color', 'shape', 'size', 'fill'],
    countdownDuration: 3000, // 3 seconds

    // Visual settings
    cellPadding: 0.1,     // Padding inside cells (0-1)
    pieceScale: 0.7,      // Size of piece relative to cell

    // Colors
    colors: {
        red: '#FF4A6E',
        blue: '#4A9EFF',
        background: '#1a1a2e',
        gridLine: '#2d2d44',
        text: '#ffffff',
        validMove: 'rgba(74, 222, 128, 0.3)',
        preview: 'rgba(74, 222, 128, 0.5)',
        placed: 'rgba(128, 128, 128, 0.3)'
    }
};

/**
 * Get piece attributes from ID (0-15)
 * Each piece ID encodes its 4 binary attributes:
 * - Bit 0 (1): Color - 0=Red, 1=Blue
 * - Bit 1 (2): Shape - 0=Circle, 1=Square
 * - Bit 2 (4): Size - 0=Small, 1=Big
 * - Bit 3 (8): Fill - 0=Hollow, 1=Solid
 */
export function getPieceAttributes(id) {
    return {
        id,
        color: (id & 1) ? 'blue' : 'red',
        shape: (id & 2) ? 'square' : 'circle',
        size: (id & 4) ? 'big' : 'small',
        fill: (id & 8) ? 'solid' : 'hollow',
        placed: false
    };
}

/**
 * Generate all 16 unique pieces
 */
export function generateAllPieces() {
    return Array.from({ length: 16 }, (_, id) => getPieceAttributes(id));
}

/**
 * Get initial game state
 */
export function getInitialState() {
    return {
        // Game phase
        phase: 'countdown',  // countdown | select_placement | select_next_piece | gameover

        // Turn management
        currentTurn: 'p1',
        turnNumber: 0,

        // Grid state (4x4, null for empty cells)
        grid: [
            [null, null, null, null],
            [null, null, null, null],
            [null, null, null, null],
            [null, null, null, null]
        ],

        // All 16 pieces
        pieces: generateAllPieces(),

        // Current piece that must be placed (null at start)
        selectedPiece: null,

        // Player info
        playerNames: {
            p1: 'Player 1',
            p2: 'Player 2'
        },

        // Game outcome
        winner: null,           // 'p1' or 'p2' or null for draw
        winningLine: null,      // { type: 'row'|'col'|'diag', index: number, attribute: string }
        forfeitBy: null,        // 'p1' or 'p2'

        // Timing
        elapsed: 0,
        countdownStartTime: null
    };
}
