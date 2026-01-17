/**
 * Pattern Match - Game Validation Logic
 *
 * Provides win detection and move validation for Pattern Match game.
 */

/**
 * Check if there's a winning line after placement
 * Returns: { won: boolean, line: { type, index, attribute } | null }
 */
export function checkWinCondition(grid) {
    // Build all 8 possible lines (4 rows, 4 cols, 2 diagonals)
    const lines = [];

    // Rows
    for (let i = 0; i < 4; i++) {
        lines.push({
            type: 'row',
            index: i,
            cells: grid[i]
        });
    }

    // Columns
    for (let i = 0; i < 4; i++) {
        lines.push({
            type: 'col',
            index: i,
            cells: [grid[0][i], grid[1][i], grid[2][i], grid[3][i]]
        });
    }

    // Diagonal (top-left to bottom-right)
    lines.push({
        type: 'diag',
        index: 0,
        cells: [grid[0][0], grid[1][1], grid[2][2], grid[3][3]]
    });

    // Diagonal (top-right to bottom-left)
    lines.push({
        type: 'diag',
        index: 1,
        cells: [grid[0][3], grid[1][2], grid[2][1], grid[3][0]]
    });

    // Check each line
    for (const line of lines) {
        // Skip if any cell is empty
        if (line.cells.some(cell => cell === null)) {
            continue;
        }

        // Check each attribute for matching values
        const attributes = ['color', 'shape', 'size', 'fill'];
        for (const attr of attributes) {
            const firstValue = line.cells[0][attr];
            if (line.cells.every(cell => cell[attr] === firstValue)) {
                // Found a winning line!
                return {
                    won: true,
                    line: {
                        type: line.type,
                        index: line.index,
                        attribute: attr
                    }
                };
            }
        }
    }

    return { won: false, line: null };
}

/**
 * Check if placement is valid (cell is empty and in bounds)
 */
export function isValidPlacement(grid, row, col) {
    if (row < 0 || row >= 4 || col < 0 || col >= 4) {
        return false;
    }
    return grid[row][col] === null;
}

/**
 * Check if piece can be selected (not already placed)
 */
export function canSelectPiece(pieces, pieceId) {
    if (pieceId < 0 || pieceId >= 16) {
        return false;
    }
    return !pieces[pieceId].placed;
}

/**
 * Check if grid is full (all cells occupied)
 */
export function isGridFull(grid) {
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            if (grid[row][col] === null) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Get list of available pieces (not yet placed)
 */
export function getAvailablePieces(pieces) {
    return pieces.filter(piece => !piece.placed);
}

/**
 * Get list of empty cells
 */
export function getEmptyCells(grid) {
    const cells = [];
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            if (grid[row][col] === null) {
                cells.push({ row, col });
            }
        }
    }
    return cells;
}
