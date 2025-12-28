// Terrain Generator - Seeded procedural terrain with lanes

import {
    MAP_WIDTH,
    MAP_HEIGHT,
    TILE_TYPES,
    HEIGHT_LOW,
    HEIGHT_HIGH,
    TERRAIN,
    SPAWN
} from '../config.js';
import { HexGrid } from './HexGrid.js';
import {
    hexDistance,
    hexLine,
    hexNeighbors,
    hexesInRange,
    hexInBounds
} from './HexMath.js';

// Seeded random number generator (mulberry32)
function createRNG(seed) {
    let state = seed;
    return function() {
        state += 0x6D2B79F5;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Simple noise function using RNG
function noise2D(rng, x, y, scale) {
    // Simple value noise using grid
    const ix = Math.floor(x * scale);
    const iy = Math.floor(y * scale);
    const fx = (x * scale) - ix;
    const fy = (y * scale) - iy;

    // Hash function for grid points
    const hash = (x, y) => {
        const n = x + y * 57;
        return (Math.sin(n * 12.9898 + rng() * 0.001) * 43758.5453) % 1;
    };

    // Bilinear interpolation
    const v00 = hash(ix, iy);
    const v10 = hash(ix + 1, iy);
    const v01 = hash(ix, iy + 1);
    const v11 = hash(ix + 1, iy + 1);

    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const v0 = v00 + sx * (v10 - v00);
    const v1 = v01 + sx * (v11 - v01);

    return v0 + sy * (v1 - v0);
}

// Generate terrain from a seed
export function generateTerrain(seed) {
    const seedNum = typeof seed === 'string'
        ? seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
        : seed;

    const rng = createRNG(seedNum);
    const grid = new HexGrid(MAP_WIDTH, MAP_HEIGHT);

    // Step 1: Generate height map
    generateHeightMap(grid, rng);

    // Step 2: Place main tower slots
    const p1Main = placeMainTowers(grid);
    const p2Main = { q: MAP_WIDTH - 1 - p1Main.q, r: MAP_HEIGHT - 1 - p1Main.r };

    // Step 3: Carve lanes
    const lanes = carveLanes(grid, rng, p1Main, p2Main);

    // Step 4: Add ramps where lanes cross height boundaries
    addRamps(grid);

    // Step 5: Place tower slots along lanes
    placeTowerSlots(grid, rng, lanes);

    // Step 6: Place resource nodes
    placeResourceNodes(grid, rng, p1Main, p2Main);

    // Step 7: Set ownership based on position
    setOwnership(grid);

    return {
        grid,
        p1Main,
        p2Main,
        lanes
    };
}

function generateHeightMap(grid, rng) {
    const baseRng = rng();

    for (let r = 0; r < MAP_HEIGHT; r++) {
        for (let q = 0; q < MAP_WIDTH; q++) {
            // Multi-octave noise for natural look
            let value = 0;
            value += noise2D(rng, q, r, TERRAIN.NOISE_SCALE) * 0.5;
            value += noise2D(rng, q, r, TERRAIN.NOISE_SCALE * 2) * 0.3;
            value += noise2D(rng, q, r, TERRAIN.NOISE_SCALE * 4) * 0.2;

            // Add some deterministic variation
            value += Math.sin(q * 0.1 + baseRng) * 0.1;
            value += Math.cos(r * 0.05 + baseRng) * 0.1;

            // Normalize
            value = (value + 0.5) / 1.5;

            const height = value >= TERRAIN.HIGH_GROUND_THRESHOLD ? HEIGHT_HIGH : HEIGHT_LOW;
            grid.setHeight(q, r, height);
        }
    }
}

function placeMainTowers(grid) {
    // Player 1's main tower in low q region, middle r
    const p1Main = {
        q: SPAWN.PLAYER_1_Q,
        r: Math.floor(MAP_HEIGHT / 2)
    };

    // Set main tower slots
    grid.setTileType(p1Main.q, p1Main.r, TILE_TYPES.MAIN_TOWER_SLOT);
    grid.setHeight(p1Main.q, p1Main.r, HEIGHT_HIGH);
    grid.setOwner(p1Main.q, p1Main.r, 0);

    // Player 2's main tower (mirrored)
    const p2Main = {
        q: SPAWN.PLAYER_2_Q,
        r: Math.floor(MAP_HEIGHT / 2)
    };

    grid.setTileType(p2Main.q, p2Main.r, TILE_TYPES.MAIN_TOWER_SLOT);
    grid.setHeight(p2Main.q, p2Main.r, HEIGHT_HIGH);
    grid.setOwner(p2Main.q, p2Main.r, 1);

    return p1Main;
}

function carveLanes(grid, rng, p1Main, p2Main) {
    const lanes = [];
    const laneCount = TERRAIN.LANE_COUNT;

    // Distribute lanes vertically
    const laneSpacing = MAP_HEIGHT / (laneCount + 1);

    for (let i = 0; i < laneCount; i++) {
        const laneR = Math.floor(laneSpacing * (i + 1));

        // Start and end points with some randomness
        const startR = laneR + Math.floor((rng() - 0.5) * 20);
        const endR = laneR + Math.floor((rng() - 0.5) * 20);

        const start = { q: SPAWN.PLAYER_1_Q + 3, r: clamp(startR, 10, MAP_HEIGHT - 10) };
        const end = { q: SPAWN.PLAYER_2_Q - 3, r: clamp(endR, 10, MAP_HEIGHT - 10) };

        // Generate lane path with control points
        const lane = generateCurvedPath(rng, start, end);
        lanes.push(lane);

        // Carve the lane
        for (const hex of lane) {
            carveLaneArea(grid, hex, TERRAIN.LANE_WIDTH);
        }
    }

    // Add connecting paths between lanes
    for (let i = 0; i < laneCount - 1; i++) {
        const connectCount = 2 + Math.floor(rng() * 2);
        for (let c = 0; c < connectCount; c++) {
            const t = 0.2 + rng() * 0.6;
            const idx1 = Math.floor(t * lanes[i].length);
            const idx2 = Math.floor(t * lanes[i + 1].length);

            const from = lanes[i][idx1];
            const to = lanes[i + 1][idx2];

            const connector = hexLine(from, to);
            for (const hex of connector) {
                carveLaneArea(grid, hex, 2);
            }
        }
    }

    // Connect main towers to nearest lanes
    connectMainToLanes(grid, p1Main, lanes);
    connectMainToLanes(grid, p2Main, lanes);

    return lanes;
}

function generateCurvedPath(rng, start, end) {
    const path = [];
    const segments = 5 + Math.floor(rng() * 5);

    // Generate control points
    const points = [start];
    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const baseQ = Math.floor(start.q + (end.q - start.q) * t);
        const baseR = Math.floor(start.r + (end.r - start.r) * t);

        // Add some curve
        const curveR = Math.floor((rng() - 0.5) * 40);

        points.push({
            q: baseQ,
            r: clamp(baseR + curveR, 5, MAP_HEIGHT - 5)
        });
    }
    points.push(end);

    // Connect points with straight lines
    for (let i = 0; i < points.length - 1; i++) {
        const segment = hexLine(points[i], points[i + 1]);
        for (const hex of segment) {
            if (!path.some(h => h.q === hex.q && h.r === hex.r)) {
                path.push(hex);
            }
        }
    }

    return path;
}

function carveLaneArea(grid, center, width) {
    const hexes = hexesInRange(center, Math.floor(width / 2));
    for (const hex of hexes) {
        if (hexInBounds(hex, MAP_WIDTH, MAP_HEIGHT)) {
            const currentType = grid.getTileType(hex.q, hex.r);
            // Don't overwrite main tower slots
            if (currentType !== TILE_TYPES.MAIN_TOWER_SLOT) {
                grid.setTileType(hex.q, hex.r, TILE_TYPES.EMPTY);
            }
        }
    }
}

function connectMainToLanes(grid, mainPos, lanes) {
    // Find closest lane point
    let closestLane = null;
    let closestDist = Infinity;
    let closestHex = null;

    for (const lane of lanes) {
        for (const hex of lane) {
            const dist = hexDistance(mainPos, hex);
            if (dist < closestDist) {
                closestDist = dist;
                closestHex = hex;
                closestLane = lane;
            }
        }
    }

    if (closestHex) {
        const path = hexLine(mainPos, closestHex);
        for (const hex of path) {
            carveLaneArea(grid, hex, 3);
        }
    }
}

function addRamps(grid) {
    // Find all height transitions and add ramps
    for (let r = 0; r < MAP_HEIGHT; r++) {
        for (let q = 0; q < MAP_WIDTH; q++) {
            const currentHeight = grid.getHeight(q, r);
            const currentType = grid.getTileType(q, r);

            // Only process walkable tiles
            if (currentType === TILE_TYPES.BLOCKED || currentType === TILE_TYPES.MAIN_TOWER_SLOT) {
                continue;
            }

            // Check if this tile borders a different height
            const neighbors = hexNeighbors({ q, r });
            let hasHighNeighbor = false;
            let hasLowNeighbor = false;

            for (const n of neighbors) {
                if (!hexInBounds(n, MAP_WIDTH, MAP_HEIGHT)) continue;

                const nHeight = grid.getHeight(n.q, n.r);
                const nType = grid.getTileType(n.q, n.r);

                if (nType !== TILE_TYPES.BLOCKED) {
                    if (nHeight === HEIGHT_HIGH) hasHighNeighbor = true;
                    if (nHeight === HEIGHT_LOW) hasLowNeighbor = true;
                }
            }

            // If this tile is between heights, make it a ramp
            if (hasHighNeighbor && hasLowNeighbor && currentType === TILE_TYPES.EMPTY) {
                grid.setTileType(q, r, TILE_TYPES.RAMP);
            }
        }
    }
}

function placeTowerSlots(grid, rng, lanes) {
    const slotsPlaced = { p1: 0, p2: 0 };
    const targetSlots = TERRAIN.TOWER_SLOTS_PER_HALF;

    // Collect candidate positions (tiles adjacent to lanes)
    const candidates = new Set();

    for (const lane of lanes) {
        for (const hex of lane) {
            const neighbors = hexNeighbors(hex);
            for (const n of neighbors) {
                if (!hexInBounds(n, MAP_WIDTH, MAP_HEIGHT)) continue;

                const type = grid.getTileType(n.q, n.r);
                if (type === TILE_TYPES.EMPTY) {
                    candidates.add(`${n.q},${n.r}`);
                }
            }
        }
    }

    // Convert to array and shuffle
    const candidateList = Array.from(candidates).map(s => {
        const [q, r] = s.split(',').map(Number);
        return { q, r };
    });

    // Shuffle using Fisher-Yates
    for (let i = candidateList.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [candidateList[i], candidateList[j]] = [candidateList[j], candidateList[i]];
    }

    // Place tower slots with some spacing
    const placed = [];
    const minSpacing = 3;

    for (const candidate of candidateList) {
        // Check spacing from other tower slots
        let tooClose = false;
        for (const p of placed) {
            if (hexDistance(candidate, p) < minSpacing) {
                tooClose = true;
                break;
            }
        }

        if (tooClose) continue;

        // Determine owner based on position
        const owner = candidate.q < MAP_WIDTH / 2 ? 0 : 1;
        const ownerKey = owner === 0 ? 'p1' : 'p2';

        if (slotsPlaced[ownerKey] >= targetSlots) continue;

        grid.setTileType(candidate.q, candidate.r, TILE_TYPES.TOWER_SLOT);
        grid.setOwner(candidate.q, candidate.r, owner);
        placed.push(candidate);
        slotsPlaced[ownerKey]++;

        if (slotsPlaced.p1 >= targetSlots && slotsPlaced.p2 >= targetSlots) {
            break;
        }
    }
}

function placeResourceNodes(grid, rng, p1Main, p2Main) {
    const safeNodes = TERRAIN.SAFE_RESOURCE_NODES;
    const contestedNodes = TERRAIN.CONTESTED_RESOURCE_NODES;

    // Safe nodes for player 1 (near their base)
    placeNodesNear(grid, rng, p1Main, safeNodes, 10, 25);

    // Safe nodes for player 2 (near their base)
    placeNodesNear(grid, rng, p2Main, safeNodes, 10, 25);

    // Contested nodes in the middle
    const middleHex = { q: Math.floor(MAP_WIDTH / 2), r: Math.floor(MAP_HEIGHT / 2) };
    placeNodesNear(grid, rng, middleHex, contestedNodes, 5, 40);
}

function placeNodesNear(grid, rng, center, count, minDist, maxDist) {
    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 20;

    while (placed < count && attempts < maxAttempts) {
        attempts++;

        // Random position within range
        const angle = rng() * Math.PI * 2;
        const dist = minDist + rng() * (maxDist - minDist);

        const q = Math.floor(center.q + Math.cos(angle) * dist);
        const r = Math.floor(center.r + Math.sin(angle) * dist * 0.5); // Adjust for hex aspect

        if (!hexInBounds({ q, r }, MAP_WIDTH, MAP_HEIGHT)) continue;

        const type = grid.getTileType(q, r);
        if (type !== TILE_TYPES.EMPTY) continue;

        // Check not too close to other resource nodes
        let valid = true;
        for (let dr = -5; dr <= 5 && valid; dr++) {
            for (let dq = -5; dq <= 5 && valid; dq++) {
                const nq = q + dq;
                const nr = r + dr;
                if (hexInBounds({ q: nq, r: nr }, MAP_WIDTH, MAP_HEIGHT)) {
                    if (grid.getTileType(nq, nr) === TILE_TYPES.RESOURCE_NODE) {
                        if (hexDistance({ q, r }, { q: nq, r: nr }) < 8) {
                            valid = false;
                        }
                    }
                }
            }
        }

        if (valid) {
            grid.setTileType(q, r, TILE_TYPES.RESOURCE_NODE);
            placed++;
        }
    }
}

function setOwnership(grid) {
    // Set tile ownership based on horizontal position
    const midQ = MAP_WIDTH / 2;

    for (let r = 0; r < MAP_HEIGHT; r++) {
        for (let q = 0; q < MAP_WIDTH; q++) {
            const type = grid.getTileType(q, r);

            // Only set ownership for tower slots and resource nodes not already owned
            if (type === TILE_TYPES.TOWER_SLOT || type === TILE_TYPES.RESOURCE_NODE) {
                if (grid.getOwner(q, r) === -1) {
                    // Middle region is neutral
                    if (q < midQ - 10) {
                        grid.setOwner(q, r, 0);
                    } else if (q > midQ + 10) {
                        grid.setOwner(q, r, 1);
                    }
                    // Middle 20 columns stay neutral (-1)
                }
            }
        }
    }
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
