// Path validation and wall collision detection for Corridor Chase

import { CORRIDOR_CONFIG } from './config.js';

/**
 * Check if movement from (x1, y1) to (x2, y2) is blocked by a wall
 * @param {Array} walls - Array of wall objects
 * @param {number} x1 - Starting X coordinate
 * @param {number} y1 - Starting Y coordinate
 * @param {number} x2 - Ending X coordinate
 * @param {number} y2 - Ending Y coordinate
 * @returns {boolean} True if movement is blocked
 */
export function isBlocked(walls, x1, y1, x2, y2) {
    // Moving vertically (up or down)
    if (x1 === x2) {
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        // Check for horizontal walls blocking vertical movement
        for (const wall of walls) {
            if (wall.orientation === 'h') {
                // Horizontal wall at (wall.x, wall.y) blocks vertical movement
                // between rows wall.y and wall.y+1 at columns wall.x and wall.x+1
                if (wall.y === minY) {
                    if (wall.x === x1 || wall.x + 1 === x1) {
                        return true;
                    }
                }
            }
        }
    }
    // Moving horizontally (left or right)
    else if (y1 === y2) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);

        // Check for vertical walls blocking horizontal movement
        for (const wall of walls) {
            if (wall.orientation === 'v') {
                // Vertical wall at (wall.x, wall.y) blocks horizontal movement
                // between columns wall.x and wall.x+1 at rows wall.y and wall.y+1
                if (wall.x === minX) {
                    if (wall.y === y1 || wall.y + 1 === y1) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

/**
 * Check if two walls intersect
 * @param {number} x1 - First wall X
 * @param {number} y1 - First wall Y
 * @param {string} o1 - First wall orientation
 * @param {number} x2 - Second wall X
 * @param {number} y2 - Second wall orientation
 * @param {string} o2 - Second wall orientation
 * @returns {boolean} True if walls intersect
 */
export function wallsIntersect(x1, y1, o1, x2, y2, o2) {
    // Same orientation walls are parallel, they don't intersect
    if (o1 === o2) {
        return false;
    }

    // Different orientations - check if they cross at the same point
    // Horizontal wall at (x1, y1) and vertical wall at (x2, y2) intersect
    // if they share the same grid intersection point
    if (o1 === 'h' && o2 === 'v') {
        return x2 === x1 && y2 === y1;
    } else {
        // o1 === 'v' && o2 === 'h'
        return x1 === x2 && y1 === y2;
    }
}

/**
 * Check if a player has a valid path to their goal row using BFS
 * @param {Array} walls - Array of wall objects
 * @param {Object} pawn - Pawn position {x, y}
 * @param {string} playerId - 'p1' or 'p2'
 * @returns {boolean} True if a valid path exists
 */
export function hasPathToGoal(walls, pawn, playerId) {
    const goalRow = CORRIDOR_CONFIG.goalRows[playerId];
    const gridSize = CORRIDOR_CONFIG.gridSize;

    // BFS initialization
    const visited = new Set();
    const queue = [{ x: pawn.x, y: pawn.y }];
    visited.add(`${pawn.x},${pawn.y}`);

    while (queue.length > 0) {
        const current = queue.shift();

        // Check if reached goal row
        if (current.y === goalRow) {
            return true;
        }

        // Explore 4 adjacent cells (up, down, left, right)
        const neighbors = [
            { x: current.x, y: current.y - 1 },  // Up
            { x: current.x, y: current.y + 1 },  // Down
            { x: current.x - 1, y: current.y },  // Left
            { x: current.x + 1, y: current.y }   // Right
        ];

        for (const next of neighbors) {
            // Check bounds
            if (next.x < 0 || next.x >= gridSize || next.y < 0 || next.y >= gridSize) {
                continue;
            }

            // Check if already visited
            const key = `${next.x},${next.y}`;
            if (visited.has(key)) {
                continue;
            }

            // Check if wall blocks this movement
            if (isBlocked(walls, current.x, current.y, next.x, next.y)) {
                continue;
            }

            // Add to queue
            visited.add(key);
            queue.push(next);
        }
    }

    // No path found
    return false;
}

/**
 * Get all valid moves for a player's pawn
 * @param {Object} state - Game state
 * @param {string} playerId - 'p1' or 'p2'
 * @returns {Array} Array of valid move positions {x, y}
 */
export function getValidMoves(state, playerId) {
    const pawn = state.pawns[playerId];
    const opponentId = playerId === 'p1' ? 'p2' : 'p1';
    const opponentPawn = state.pawns[opponentId];
    const gridSize = CORRIDOR_CONFIG.gridSize;
    const validMoves = [];

    // Check 4 adjacent cells
    const directions = [
        { dx: 0, dy: -1 },  // Up
        { dx: 0, dy: 1 },   // Down
        { dx: -1, dy: 0 },  // Left
        { dx: 1, dy: 0 }    // Right
    ];

    for (const dir of directions) {
        const newX = pawn.x + dir.dx;
        const newY = pawn.y + dir.dy;

        // Check bounds
        if (newX < 0 || newX >= gridSize || newY < 0 || newY >= gridSize) {
            continue;
        }

        // Check if wall blocks this move
        if (isBlocked(state.walls, pawn.x, pawn.y, newX, newY)) {
            continue;
        }

        // Check if opponent pawn occupies this cell
        if (opponentPawn.x === newX && opponentPawn.y === newY) {
            // Blocked by opponent (could add jump logic here in future)
            continue;
        }

        validMoves.push({ x: newX, y: newY });
    }

    return validMoves;
}

/**
 * Check if a wall placement is valid
 * @param {Object} state - Game state
 * @param {number} x - Wall X coordinate
 * @param {number} y - Wall Y coordinate
 * @param {string} orientation - 'h' or 'v'
 * @returns {boolean} True if placement is valid
 */
export function isValidWallPlacement(state, x, y, orientation) {
    const gridSize = CORRIDOR_CONFIG.gridSize;

    // Check bounds (walls are placed between cells, so max coordinate is gridSize-2)
    if (x < 0 || x >= gridSize - 1 || y < 0 || y >= gridSize - 1) {
        return false;
    }

    // Check if wall already exists at this exact location
    for (const wall of state.walls) {
        if (wall.x === x && wall.y === y && wall.orientation === orientation) {
            return false;
        }
    }

    // Check if wall intersects with existing walls
    for (const wall of state.walls) {
        if (wallsIntersect(x, y, orientation, wall.x, wall.y, wall.orientation)) {
            return false;
        }
    }

    // CRITICAL: Check if both players still have a valid path to their goal
    // Create temporary wall array with this new wall
    const tempWalls = [...state.walls, { x, y, orientation }];

    if (!hasPathToGoal(tempWalls, state.pawns.p1, 'p1')) {
        return false;
    }

    if (!hasPathToGoal(tempWalls, state.pawns.p2, 'p2')) {
        return false;
    }

    return true;
}
