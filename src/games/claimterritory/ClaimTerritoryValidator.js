/**
 * Claim Territory - Game Validation Logic
 *
 * Provides move validation and win detection for Claim Territory game.
 */

/**
 * Check if a claim is valid
 * - Cell must be within bounds
 * - Cell must be unclaimed
 * - Cell must be adjacent (orthogonally) to player's existing territory
 */
export function isValidClaim(state, playerId, x, y) {
    // Bounds check
    if (x < 0 || x >= 10 || y < 0 || y >= 10) {
        return false;
    }

    // Check if cell is unclaimed
    if (state.grid[y][x] !== null) {
        return false;
    }

    // Check if adjacent to player's territory
    const directions = [
        { dx: 0, dy: -1 },  // Up
        { dx: 0, dy: 1 },   // Down
        { dx: -1, dy: 0 },  // Left
        { dx: 1, dy: 0 }    // Right
    ];

    for (const dir of directions) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;

        if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10) {
            if (state.grid[ny][nx] === playerId) {
                return true;  // Adjacent to own territory
            }
        }
    }

    return false;  // Not adjacent to any owned cells
}

/**
 * Get all valid claim positions for a player
 * Returns array of { x, y } positions
 */
export function getValidMoves(state, playerId) {
    const validMoves = [];

    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            if (isValidClaim(state, playerId, x, y)) {
                validMoves.push({ x, y });
            }
        }
    }

    return validMoves;
}

/**
 * Check win condition
 * Returns: { gameOver: boolean, winner: 'p1'|'p2'|null, skipTurn: boolean }
 */
export function checkWinCondition(state) {
    // Check if grid is full
    let emptyCells = 0;
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            if (state.grid[y][x] === null) {
                emptyCells++;
            }
        }
    }

    if (emptyCells === 0) {
        // Grid full - player with most cells wins
        const winner = state.cellCounts.p1 > state.cellCounts.p2 ? 'p1' :
                       state.cellCounts.p2 > state.cellCounts.p1 ? 'p2' : null;
        return { gameOver: true, winner, skipTurn: false };
    }

    // Check if current player has no valid moves
    const currentMoves = getValidMoves(state, state.currentTurn);
    if (currentMoves.length === 0) {
        // No moves available for current player
        // Check if next player has moves
        const nextPlayer = state.currentTurn === 'p1' ? 'p2' : 'p1';
        const nextMoves = getValidMoves(state, nextPlayer);

        if (nextMoves.length === 0) {
            // Both players stuck - game over
            const winner = state.cellCounts.p1 > state.cellCounts.p2 ? 'p1' :
                           state.cellCounts.p2 > state.cellCounts.p1 ? 'p2' : null;
            return { gameOver: true, winner, skipTurn: false };
        } else {
            // Current player stuck but opponent has moves - skip turn
            return { gameOver: false, winner: null, skipTurn: true };
        }
    }

    return { gameOver: false, winner: null, skipTurn: false };
}

/**
 * Count cells owned by each player
 * Returns: { p1: number, p2: number }
 */
export function countCells(state) {
    let p1Count = 0;
    let p2Count = 0;

    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            if (state.grid[y][x] === 'p1') p1Count++;
            else if (state.grid[y][x] === 'p2') p2Count++;
        }
    }

    return { p1: p1Count, p2: p2Count };
}
