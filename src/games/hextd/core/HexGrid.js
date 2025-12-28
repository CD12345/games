// Hex Grid - Efficient storage for 100x400 hex tiles

import { MAP_WIDTH, MAP_HEIGHT, TILE_TYPES, HEIGHT_LOW } from '../config.js';
import { hexKey, hexInBounds, hexNeighbors } from './HexMath.js';

export class HexGrid {
    constructor(width = MAP_WIDTH, height = MAP_HEIGHT) {
        this.width = width;
        this.height = height;
        this.size = width * height;

        // Typed arrays for compact storage
        this.tiles = new Uint8Array(this.size);       // Tile types
        this.heights = new Uint8Array(this.size);     // Height levels (0 or 1)
        this.owners = new Int8Array(this.size);       // -1 = neutral, 0 = p1, 1 = p2

        // Entity references (sparse - use Maps)
        this.towerAt = new Map();      // hexKey -> tower
        this.mineAt = new Map();       // hexKey -> mine
        this.unitsAt = new Map();      // hexKey -> Set<unit>

        // Initialize all tiles as empty
        this.tiles.fill(TILE_TYPES.EMPTY);
        this.heights.fill(HEIGHT_LOW);
        this.owners.fill(-1);
    }

    // Convert q,r to array index
    index(q, r) {
        return r * this.width + q;
    }

    // Check if coordinates are valid
    isValid(q, r) {
        return q >= 0 && q < this.width && r >= 0 && r < this.height;
    }

    // Get tile type at position
    getTileType(q, r) {
        if (!this.isValid(q, r)) return TILE_TYPES.BLOCKED;
        return this.tiles[this.index(q, r)];
    }

    // Set tile type at position
    setTileType(q, r, type) {
        if (!this.isValid(q, r)) return;
        this.tiles[this.index(q, r)] = type;
    }

    // Get height at position
    getHeight(q, r) {
        if (!this.isValid(q, r)) return HEIGHT_LOW;
        return this.heights[this.index(q, r)];
    }

    // Set height at position
    setHeight(q, r, height) {
        if (!this.isValid(q, r)) return;
        this.heights[this.index(q, r)] = height;
    }

    // Get owner at position (-1 = neutral, 0 = p1, 1 = p2)
    getOwner(q, r) {
        if (!this.isValid(q, r)) return -1;
        return this.owners[this.index(q, r)];
    }

    // Set owner at position
    setOwner(q, r, owner) {
        if (!this.isValid(q, r)) return;
        this.owners[this.index(q, r)] = owner;
    }

    // Check if a tile is walkable
    isWalkable(q, r) {
        const type = this.getTileType(q, r);
        return type === TILE_TYPES.EMPTY ||
               type === TILE_TYPES.RAMP ||
               type === TILE_TYPES.RESOURCE_NODE ||
               type === TILE_TYPES.TOWER_SLOT ||
               type === TILE_TYPES.MAIN_TOWER_SLOT;
    }

    // Check if a tile can have a tower built on it
    isBuildable(q, r) {
        const type = this.getTileType(q, r);
        return type === TILE_TYPES.TOWER_SLOT && !this.towerAt.has(hexKey({ q, r }));
    }

    // Check if a tile can have a mine built on it
    isMineable(q, r) {
        const type = this.getTileType(q, r);
        return type === TILE_TYPES.RESOURCE_NODE && !this.mineAt.has(hexKey({ q, r }));
    }

    // Check if movement between two adjacent tiles is valid (height-aware)
    canMoveBetween(fromQ, fromR, toQ, toR) {
        if (!this.isValid(toQ, toR)) return false;
        if (!this.isWalkable(toQ, toR)) return false;

        const fromHeight = this.getHeight(fromQ, fromR);
        const toHeight = this.getHeight(toQ, toR);

        // Same height - always allowed if walkable
        if (fromHeight === toHeight) return true;

        // Different heights - need ramp
        const fromType = this.getTileType(fromQ, fromR);
        const toType = this.getTileType(toQ, toR);

        return fromType === TILE_TYPES.RAMP || toType === TILE_TYPES.RAMP;
    }

    // Get walkable neighbors from a position
    getWalkableNeighbors(q, r) {
        const neighbors = [];
        const hex = { q, r };

        for (const neighbor of hexNeighbors(hex)) {
            if (this.canMoveBetween(q, r, neighbor.q, neighbor.r)) {
                neighbors.push(neighbor);
            }
        }

        return neighbors;
    }

    // Tower management
    placeTower(q, r, tower) {
        const key = hexKey({ q, r });
        this.towerAt.set(key, tower);
    }

    removeTower(q, r) {
        const key = hexKey({ q, r });
        this.towerAt.delete(key);
    }

    getTower(q, r) {
        return this.towerAt.get(hexKey({ q, r }));
    }

    // Mine management
    placeMine(q, r, mine) {
        const key = hexKey({ q, r });
        this.mineAt.set(key, mine);
    }

    removeMine(q, r) {
        const key = hexKey({ q, r });
        this.mineAt.delete(key);
    }

    getMine(q, r) {
        return this.mineAt.get(hexKey({ q, r }));
    }

    // Unit tracking (multiple units can be on same hex)
    addUnit(q, r, unit) {
        const key = hexKey({ q, r });
        if (!this.unitsAt.has(key)) {
            this.unitsAt.set(key, new Set());
        }
        this.unitsAt.get(key).add(unit);
    }

    removeUnit(q, r, unit) {
        const key = hexKey({ q, r });
        const units = this.unitsAt.get(key);
        if (units) {
            units.delete(unit);
            if (units.size === 0) {
                this.unitsAt.delete(key);
            }
        }
    }

    getUnits(q, r) {
        const key = hexKey({ q, r });
        return this.unitsAt.get(key) || new Set();
    }

    moveUnit(unit, fromQ, fromR, toQ, toR) {
        this.removeUnit(fromQ, fromR, unit);
        this.addUnit(toQ, toR, unit);
    }

    // Get all tower slots for a player
    getTowerSlots(playerIndex) {
        const slots = [];
        for (let r = 0; r < this.height; r++) {
            for (let q = 0; q < this.width; q++) {
                if (this.getTileType(q, r) === TILE_TYPES.TOWER_SLOT) {
                    if (this.getOwner(q, r) === playerIndex || this.getOwner(q, r) === -1) {
                        slots.push({ q, r });
                    }
                }
            }
        }
        return slots;
    }

    // Get all resource nodes
    getResourceNodes() {
        const nodes = [];
        for (let r = 0; r < this.height; r++) {
            for (let q = 0; q < this.width; q++) {
                if (this.getTileType(q, r) === TILE_TYPES.RESOURCE_NODE) {
                    nodes.push({ q, r });
                }
            }
        }
        return nodes;
    }

    // Get main tower slot for a player
    getMainTowerSlot(playerIndex) {
        for (let r = 0; r < this.height; r++) {
            for (let q = 0; q < this.width; q++) {
                if (this.getTileType(q, r) === TILE_TYPES.MAIN_TOWER_SLOT &&
                    this.getOwner(q, r) === playerIndex) {
                    return { q, r };
                }
            }
        }
        return null;
    }

    // Iterate over all tiles
    forEach(callback) {
        for (let r = 0; r < this.height; r++) {
            for (let q = 0; q < this.width; q++) {
                callback(q, r, this.getTileType(q, r), this.getHeight(q, r));
            }
        }
    }

    // Get tiles in a rectangular region (for chunk rendering)
    getRegion(minQ, minR, maxQ, maxR) {
        const tiles = [];
        for (let r = minR; r <= maxR && r < this.height; r++) {
            for (let q = minQ; q <= maxQ && q < this.width; q++) {
                if (q >= 0 && r >= 0) {
                    tiles.push({
                        q,
                        r,
                        type: this.getTileType(q, r),
                        height: this.getHeight(q, r),
                        owner: this.getOwner(q, r)
                    });
                }
            }
        }
        return tiles;
    }

    // Serialize grid state (for networking - only dynamic parts)
    serialize() {
        return {
            towers: Array.from(this.towerAt.entries()),
            mines: Array.from(this.mineAt.entries())
        };
    }

    // Clear all entities (for wave reset)
    clearUnits() {
        this.unitsAt.clear();
    }
}
