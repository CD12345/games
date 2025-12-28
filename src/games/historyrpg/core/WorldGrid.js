// History RPG - World Grid
// Tile-based world storage using typed arrays for performance

import { MAP_WIDTH, MAP_HEIGHT, CHUNK_SIZE, TILE_TYPES, MAX_HEIGHT } from '../config.js';

export class WorldGrid {
    constructor(width = MAP_WIDTH, height = MAP_HEIGHT) {
        this.width = width;
        this.height = height;
        this.chunkSize = CHUNK_SIZE;

        // Calculate chunk dimensions
        this.chunksX = Math.ceil(width / CHUNK_SIZE);
        this.chunksY = Math.ceil(height / CHUNK_SIZE);

        // Typed arrays for performance (like HexGrid)
        this.tiles = new Uint8Array(width * height);       // Tile type
        this.heights = new Uint8Array(width * height);     // 0-15 height levels
        this.visibility = new Uint8Array(width * height);  // 0=hidden, 1=fog, 2=visible
        this.explored = new Uint8Array(width * height);    // Has player seen this

        // Track which chunks are loaded/generated
        this.loadedChunks = new Set();
        this.generatedChunks = new Set();

        // Sparse entity storage (by tile key)
        this.npcsAt = new Map();     // key -> Set<npcId>
        this.itemsAt = new Map();    // key -> Set<itemId>
        this.featuresAt = new Map(); // key -> feature object

        // Initialize with empty tiles
        this.tiles.fill(TILE_TYPES.EMPTY);
    }

    // Convert x,y to array index
    getIndex(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return -1;
        }
        return y * this.width + x;
    }

    // Convert array index to x,y
    getCoords(index) {
        return {
            x: index % this.width,
            y: Math.floor(index / this.width)
        };
    }

    // Get tile key for sparse storage
    getTileKey(x, y) {
        return `${x},${y}`;
    }

    // Get/set tile type
    getTile(x, y) {
        const idx = this.getIndex(x, y);
        if (idx === -1) return TILE_TYPES.EMPTY;
        return this.tiles[idx];
    }

    setTile(x, y, type) {
        const idx = this.getIndex(x, y);
        if (idx === -1) return;
        this.tiles[idx] = type;
    }

    // Get/set height
    getHeight(x, y) {
        const idx = this.getIndex(x, y);
        if (idx === -1) return 0;
        return this.heights[idx];
    }

    setHeight(x, y, height) {
        const idx = this.getIndex(x, y);
        if (idx === -1) return;
        this.heights[idx] = Math.min(MAX_HEIGHT, Math.max(0, height));
    }

    // Get/set visibility (0=hidden, 1=fog, 2=visible)
    getVisibility(x, y) {
        const idx = this.getIndex(x, y);
        if (idx === -1) return 0;
        return this.visibility[idx];
    }

    setVisibility(x, y, vis) {
        const idx = this.getIndex(x, y);
        if (idx === -1) return;
        this.visibility[idx] = vis;
        if (vis > 0) {
            this.explored[idx] = 1;
        }
    }

    // Check if tile has been explored
    isExplored(x, y) {
        const idx = this.getIndex(x, y);
        if (idx === -1) return false;
        return this.explored[idx] === 1;
    }

    // Check if tile is walkable
    isWalkable(x, y) {
        const tile = this.getTile(x, y);
        // Most tiles are walkable except walls and water
        return tile !== TILE_TYPES.EMPTY &&
               tile !== TILE_TYPES.WALL &&
               tile !== TILE_TYPES.WATER &&
               tile !== TILE_TYPES.BUILDING;
    }

    // Get chunk coordinates
    getChunkCoords(x, y) {
        return {
            cx: Math.floor(x / this.chunkSize),
            cy: Math.floor(y / this.chunkSize)
        };
    }

    // Get chunk key
    getChunkKey(cx, cy) {
        return `${cx},${cy}`;
    }

    // Check if chunk is loaded
    isChunkLoaded(cx, cy) {
        return this.loadedChunks.has(this.getChunkKey(cx, cy));
    }

    // Check if chunk is generated
    isChunkGenerated(cx, cy) {
        return this.generatedChunks.has(this.getChunkKey(cx, cy));
    }

    // Mark chunk as generated
    markChunkGenerated(cx, cy) {
        this.generatedChunks.add(this.getChunkKey(cx, cy));
    }

    // Get all tiles in a chunk
    getChunkTiles(cx, cy) {
        const tiles = [];
        const startX = cx * this.chunkSize;
        const startY = cy * this.chunkSize;

        for (let dy = 0; dy < this.chunkSize; dy++) {
            for (let dx = 0; dx < this.chunkSize; dx++) {
                const x = startX + dx;
                const y = startY + dy;
                if (x < this.width && y < this.height) {
                    tiles.push({
                        x,
                        y,
                        type: this.getTile(x, y),
                        height: this.getHeight(x, y),
                        visibility: this.getVisibility(x, y)
                    });
                }
            }
        }

        return tiles;
    }

    // Set tiles for a chunk (used during generation)
    setChunkTiles(cx, cy, tileData) {
        const startX = cx * this.chunkSize;
        const startY = cy * this.chunkSize;

        for (const tile of tileData) {
            const x = startX + tile.dx;
            const y = startY + tile.dy;
            if (x < this.width && y < this.height) {
                this.setTile(x, y, tile.type);
                if (tile.height !== undefined) {
                    this.setHeight(x, y, tile.height);
                }
            }
        }

        this.markChunkGenerated(cx, cy);
    }

    // Add NPC to tile
    addNPCAt(x, y, npcId) {
        const key = this.getTileKey(x, y);
        if (!this.npcsAt.has(key)) {
            this.npcsAt.set(key, new Set());
        }
        this.npcsAt.get(key).add(npcId);
    }

    // Remove NPC from tile
    removeNPCAt(x, y, npcId) {
        const key = this.getTileKey(x, y);
        if (this.npcsAt.has(key)) {
            this.npcsAt.get(key).delete(npcId);
        }
    }

    // Get NPCs at tile
    getNPCsAt(x, y) {
        const key = this.getTileKey(x, y);
        return this.npcsAt.get(key) || new Set();
    }

    // Add item to tile
    addItemAt(x, y, itemId) {
        const key = this.getTileKey(x, y);
        if (!this.itemsAt.has(key)) {
            this.itemsAt.set(key, new Set());
        }
        this.itemsAt.get(key).add(itemId);
    }

    // Remove item from tile
    removeItemAt(x, y, itemId) {
        const key = this.getTileKey(x, y);
        if (this.itemsAt.has(key)) {
            this.itemsAt.get(key).delete(itemId);
        }
    }

    // Get items at tile
    getItemsAt(x, y) {
        const key = this.getTileKey(x, y);
        return this.itemsAt.get(key) || new Set();
    }

    // Set feature at tile
    setFeatureAt(x, y, feature) {
        const key = this.getTileKey(x, y);
        this.featuresAt.set(key, feature);
    }

    // Get feature at tile
    getFeatureAt(x, y) {
        const key = this.getTileKey(x, y);
        return this.featuresAt.get(key) || null;
    }

    // Update visibility around player position
    updateVisibility(playerX, playerY, viewDistance = 10) {
        // First, reduce all visible tiles to fog
        for (let i = 0; i < this.visibility.length; i++) {
            if (this.visibility[i] === 2) {
                this.visibility[i] = 1;
            }
        }

        // Set tiles near player to visible
        const px = Math.floor(playerX);
        const py = Math.floor(playerY);

        for (let dy = -viewDistance; dy <= viewDistance; dy++) {
            for (let dx = -viewDistance; dx <= viewDistance; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= viewDistance) {
                    const x = px + dx;
                    const y = py + dy;
                    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                        this.setVisibility(x, y, 2);
                    }
                }
            }
        }
    }

    // Get chunks that should be loaded for a given position
    getRequiredChunks(x, y, loadDistance = 3) {
        const { cx, cy } = this.getChunkCoords(x, y);
        const chunks = [];

        for (let dy = -loadDistance; dy <= loadDistance; dy++) {
            for (let dx = -loadDistance; dx <= loadDistance; dx++) {
                const chunkX = cx + dx;
                const chunkY = cy + dy;
                if (chunkX >= 0 && chunkX < this.chunksX &&
                    chunkY >= 0 && chunkY < this.chunksY) {
                    chunks.push({
                        cx: chunkX,
                        cy: chunkY,
                        distance: Math.abs(dx) + Math.abs(dy),
                        key: this.getChunkKey(chunkX, chunkY)
                    });
                }
            }
        }

        // Sort by distance (closest first)
        chunks.sort((a, b) => a.distance - b.distance);

        return chunks;
    }

    // Generate placeholder terrain for a chunk (simple noise-based)
    generatePlaceholderChunk(cx, cy, seed = 0) {
        const tileData = [];

        for (let dy = 0; dy < this.chunkSize; dy++) {
            for (let dx = 0; dx < this.chunkSize; dx++) {
                const worldX = cx * this.chunkSize + dx;
                const worldY = cy * this.chunkSize + dy;

                // Simple seeded pseudo-random
                const noise = this.seededNoise(worldX, worldY, seed);

                let type = TILE_TYPES.GROUND;
                let height = 0;

                // Create some variation
                if (noise > 0.7) {
                    type = TILE_TYPES.RUBBLE;
                    height = 1;
                } else if (noise > 0.5) {
                    type = TILE_TYPES.FLOOR;
                } else if (noise < 0.1) {
                    type = TILE_TYPES.SNOW;
                }

                tileData.push({ dx, dy, type, height });
            }
        }

        this.setChunkTiles(cx, cy, tileData);
    }

    // Simple seeded noise function
    seededNoise(x, y, seed) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
        return n - Math.floor(n);
    }
}
