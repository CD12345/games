/**
 * Stack Race - Game Validation Logic
 *
 * Provides stacking validation, 2x2 pattern detection,
 * piece retrieval validation, and win conditions.
 */

/**
 * Check if a piece can be placed at the given position
 * Level 0: Just check if empty
 * Level 1+: Need 4 support pieces forming a 2x2 base
 */
export function canPlaceOnLevel(state, level, row, col) {
    // Bounds check
    if (level < 0 || level >= 5) {
        return false;
    }

    const gridSize = state.grid[level].length;
    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) {
        return false;
    }

    // Check if position is empty
    if (state.grid[level][row][col] !== null) {
        return false;
    }

    // Level 0 (base): Can place anywhere empty
    if (level === 0) {
        return true;
    }

    // Level 1+: Need 4 support pieces on level below
    const prevLevel = level - 1;
    const prevGridSize = state.grid[prevLevel].length;

    // Check if 2x2 support area is within bounds
    if (row >= prevGridSize - 1 || col >= prevGridSize - 1) {
        return false;
    }

    // Check if all 4 support pieces exist
    const supports = [
        state.grid[prevLevel][row][col],
        state.grid[prevLevel][row + 1][col],
        state.grid[prevLevel][row][col + 1],
        state.grid[prevLevel][row + 1][col + 1]
    ];

    return supports.every(piece => piece !== null);
}

/**
 * Find all 2x2 patterns of the player's color on a given level
 * Returns array of pattern positions (top-left corner of each 2x2)
 */
export function find2x2Patterns(state, level, playerId) {
    const patterns = [];
    const gridSize = state.grid[level].length;

    // Can't have 2x2 if grid is smaller than 2x2
    if (gridSize < 2) {
        return patterns;
    }

    // Check all possible 2x2 positions
    for (let row = 0; row < gridSize - 1; row++) {
        for (let col = 0; col < gridSize - 1; col++) {
            const cells = [
                state.grid[level][row][col],
                state.grid[level][row + 1][col],
                state.grid[level][row][col + 1],
                state.grid[level][row + 1][col + 1]
            ];

            // All 4 must belong to the player
            if (cells.every(cell => cell && cell.owner === playerId)) {
                patterns.push({ level, row, col });
            }
        }
    }

    return patterns;
}

/**
 * Check if a piece can be retrieved
 * - Must be owned by the player
 * - Must NOT be supporting any pieces on the level above
 */
export function canRetrievePiece(state, level, row, col, playerId) {
    const piece = state.grid[level][row][col];

    // Must be owned by player
    if (!piece || piece.owner !== playerId) {
        return false;
    }

    // Check if piece is supporting anything on level above
    if (level < 4) {
        const nextLevel = level + 1;
        const nextGrid = state.grid[nextLevel];
        const nextSize = nextGrid.length;

        // A piece at (row, col) on level N can support positions on level N+1:
        // (row-1, col-1), (row-1, col), (row, col-1), (row, col)
        const supportedPositions = [
            { r: row - 1, c: col - 1 },
            { r: row - 1, c: col },
            { r: row, c: col - 1 },
            { r: row, c: col }
        ];

        for (const pos of supportedPositions) {
            if (pos.r >= 0 && pos.c >= 0 && pos.r < nextSize && pos.c < nextSize) {
                if (nextGrid[pos.r][pos.c] !== null) {
                    return false; // This piece is supporting something
                }
            }
        }
    }

    return true;
}

/**
 * Get all positions where pieces can be retrieved by a player
 * Returns array of { level, row, col }
 */
export function getRetrievablePositions(state, playerId) {
    const positions = [];

    // Check all levels (from top down for easier visualization)
    for (let level = 4; level >= 0; level--) {
        const grid = state.grid[level];
        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[row].length; col++) {
                if (canRetrievePiece(state, level, row, col, playerId)) {
                    positions.push({ level, row, col });
                }
            }
        }
    }

    return positions;
}

/**
 * Get all valid placement positions for a player
 * Returns array of { level, row, col }
 */
export function getValidPlacements(state) {
    const placements = [];

    for (let level = 0; level < 5; level++) {
        const grid = state.grid[level];
        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[row].length; col++) {
                if (canPlaceOnLevel(state, level, row, col)) {
                    placements.push({ level, row, col });
                }
            }
        }
    }

    return placements;
}

/**
 * Check win condition
 * Win: Piece on level 4 (pyramid top)
 * Lose: Out of pieces with no retrievable options
 */
export function checkWinCondition(state) {
    // Check if someone reached level 4 (1x1 top)
    const topPiece = state.grid[4][0][0];
    if (topPiece) {
        return {
            gameOver: true,
            winner: topPiece.owner
        };
    }

    // Check if current player is out of pieces and cannot continue
    const currentPlayer = state.currentTurn;
    const opponentPlayer = currentPlayer === 'p1' ? 'p2' : 'p1';

    // If current player has pieces, they can continue
    if (state.pieceCounts[currentPlayer] > 0) {
        return {
            gameOver: false,
            winner: null
        };
    }

    // Current player has 0 pieces - check if they can retrieve any
    const retrievable = getRetrievablePositions(state, currentPlayer);
    if (retrievable.length > 0) {
        // They can potentially retrieve pieces, game continues
        return {
            gameOver: false,
            winner: null
        };
    }

    // Current player has no pieces and cannot retrieve - they lose
    return {
        gameOver: true,
        winner: opponentPlayer
    };
}
