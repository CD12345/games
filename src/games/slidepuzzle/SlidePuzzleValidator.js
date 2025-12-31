/**
 * Slide Puzzle Battle - Validation Logic
 */

/**
 * Check if a cell is on the outer ring (not center 3x3)
 */
export function isOuterRingCell(row, col) {
    return row === 0 || row === 4 || col === 0 || col === 4;
}

/**
 * Check if a cell can be selected by a player
 */
export function canSelectCell(state, playerId, row, col) {
    // Must be on outer ring
    if (!isOuterRingCell(row, col)) {
        return false;
    }

    // Must be neutral or owned by current player
    const cell = state.grid[row][col];
    if (cell === null || cell.owner === playerId) {
        return true;
    }

    return false;
}

/**
 * Get valid push directions for a cell position
 */
export function getValidDirections(row, col) {
    const directions = [];

    // Can push up if not on top row
    if (row > 0) {
        directions.push('up');
    }

    // Can push down if not on bottom row
    if (row < 4) {
        directions.push('down');
    }

    // Can push left if not on left column
    if (col > 0) {
        directions.push('left');
    }

    // Can push right if not on right column
    if (col < 4) {
        directions.push('right');
    }

    return directions;
}

/**
 * Execute a slide operation (mutates grid)
 * Removes cell from position, slides row/column, inserts cell on opposite side with player color
 */
export function executeSlide(grid, row, col, direction, playerId) {
    if (direction === 'up') {
        // Slide column upward
        for (let r = row; r > 0; r--) {
            grid[r][col] = grid[r - 1][col];
        }
        // Insert at top with player's color
        grid[0][col] = { owner: playerId };

    } else if (direction === 'down') {
        // Slide column downward
        for (let r = row; r < 4; r++) {
            grid[r][col] = grid[r + 1][col];
        }
        // Insert at bottom with player's color
        grid[4][col] = { owner: playerId };

    } else if (direction === 'left') {
        // Slide row leftward
        for (let c = col; c > 0; c--) {
            grid[row][c] = grid[row][c - 1];
        }
        // Insert at left with player's color
        grid[row][0] = { owner: playerId };

    } else if (direction === 'right') {
        // Slide row rightward
        for (let c = col; c < 4; c++) {
            grid[row][c] = grid[row][c + 1];
        }
        // Insert at right with player's color
        grid[row][4] = { owner: playerId };
    }
}

/**
 * Check if an array of cells forms a winning line
 */
function checkLine(cells) {
    if (cells.length !== 5) {
        return null;
    }

    // All cells must be filled
    if (cells.some(c => !c || !c.owner)) {
        return null;
    }

    // All cells must have same owner
    const owner = cells[0].owner;
    if (cells.every(c => c.owner === owner)) {
        return owner;
    }

    return null;
}

/**
 * Check for win condition (5 in a row)
 * Returns { won: boolean, line: { type, index } | null, winner: 'p1' | 'p2' | null }
 */
export function checkWinCondition(grid) {
    // Check rows
    for (let row = 0; row < 5; row++) {
        const winner = checkLine(grid[row]);
        if (winner) {
            return {
                won: true,
                line: { type: 'row', index: row },
                winner
            };
        }
    }

    // Check columns
    for (let col = 0; col < 5; col++) {
        const cells = [
            grid[0][col],
            grid[1][col],
            grid[2][col],
            grid[3][col],
            grid[4][col]
        ];
        const winner = checkLine(cells);
        if (winner) {
            return {
                won: true,
                line: { type: 'col', index: col },
                winner
            };
        }
    }

    // Check diagonal (top-left to bottom-right)
    const diag1 = [
        grid[0][0],
        grid[1][1],
        grid[2][2],
        grid[3][3],
        grid[4][4]
    ];
    const winner1 = checkLine(diag1);
    if (winner1) {
        return {
            won: true,
            line: { type: 'diag', index: 0 },
            winner: winner1
        };
    }

    // Check diagonal (top-right to bottom-left)
    const diag2 = [
        grid[0][4],
        grid[1][3],
        grid[2][2],
        grid[3][1],
        grid[4][0]
    ];
    const winner2 = checkLine(diag2);
    if (winner2) {
        return {
            won: true,
            line: { type: 'diag', index: 1 },
            winner: winner2
        };
    }

    return {
        won: false,
        line: null,
        winner: null
    };
}

/**
 * Check if a player has any valid moves
 */
export function hasValidMoves(state, playerId) {
    // Check all outer ring cells
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            if (isOuterRingCell(row, col)) {
                if (canSelectCell(state, playerId, row, col)) {
                    return true;
                }
            }
        }
    }
    return false;
}
