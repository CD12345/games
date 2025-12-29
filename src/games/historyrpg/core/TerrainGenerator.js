// History RPG - Terrain Generator
// Seeded procedural terrain generation for historical scenarios

import { TILE_TYPES, CHUNK_SIZE } from '../config.js';
import { debugLog } from '../../../ui/DebugOverlay.js';

// Simplex-like noise implementation (based on HexTD TerrainGenerator)
class SeededRandom {
    constructor(seed = 12345) {
        this.seed = seed;
        this.state = seed;
    }

    // Linear congruential generator
    next() {
        this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
        return this.state / 0x7fffffff;
    }

    // Reset to original seed
    reset() {
        this.state = this.seed;
    }

    // Get deterministic value for coordinates
    at(x, y) {
        // Hash the coordinates with seed
        const h = (x * 374761393 + y * 668265263 + this.seed) & 0xffffffff;
        const n = (h ^ (h >> 13)) * 1274126177;
        return ((n ^ (n >> 16)) & 0x7fffffff) / 0x7fffffff;
    }
}

// Terrain biome types for WW2 urban environment
const BIOMES = {
    INDUSTRIAL: 'industrial',      // Factory districts
    RESIDENTIAL: 'residential',    // Housing areas
    COMMERCIAL: 'commercial',      // City center
    RIVER: 'river',               // Volga river
    RUINS: 'ruins',               // Destroyed areas
    OPEN: 'open'                  // Parks, squares
};

export class TerrainGenerator {
    constructor(seed = 12345) {
        this.seed = seed;
        this.random = new SeededRandom(seed);

        // Noise octaves for different features
        this.baseScale = 0.02;      // Large features
        this.detailScale = 0.1;     // Small features
        this.destructionScale = 0.05; // Destruction patterns

        // Urban grid parameters
        this.blockSize = 8;         // Building block size
        this.streetWidth = 2;       // Street width in tiles

        // Cached biome map
        this.biomeCache = new Map();
    }

    // Generate terrain for a chunk
    generateChunk(cx, cy, context = {}) {
        const tileData = [];
        const startX = cx * CHUNK_SIZE;
        const startY = cy * CHUNK_SIZE;

        debugLog(`[TerrainGen] Generating chunk (${cx}, ${cy})`);

        for (let dy = 0; dy < CHUNK_SIZE; dy++) {
            for (let dx = 0; dx < CHUNK_SIZE; dx++) {
                const worldX = startX + dx;
                const worldY = startY + dy;

                const tile = this.generateTile(worldX, worldY, context);
                tileData.push({
                    dx,
                    dy,
                    type: tile.type,
                    height: tile.height
                });
            }
        }

        return tileData;
    }

    // Generate a single tile
    generateTile(x, y, context = {}) {
        // Get biome at this location
        const biome = this.getBiome(x, y, context);

        // Get base noise values
        const baseNoise = this.fractalNoise(x, y, this.baseScale, 3);
        const detailNoise = this.fractalNoise(x, y, this.detailScale, 2);
        const destructionNoise = this.fractalNoise(x, y, this.destructionScale, 2);

        // Check if this is a street
        const isStreet = this.isStreet(x, y);

        // Generate based on biome
        let type = TILE_TYPES.GROUND;
        let height = 0;

        switch (biome) {
            case BIOMES.RIVER:
                type = TILE_TYPES.WATER;
                height = 0;
                break;

            case BIOMES.INDUSTRIAL:
                if (isStreet) {
                    type = TILE_TYPES.ROAD;
                } else if (this.isBuilding(x, y, 0.6)) {
                    // Industrial buildings are larger
                    type = destructionNoise > 0.4 ? TILE_TYPES.RUBBLE : TILE_TYPES.BUILDING;
                    height = destructionNoise > 0.4 ? 1 : Math.floor(detailNoise * 3) + 1;
                } else {
                    type = TILE_TYPES.FLOOR;
                }
                break;

            case BIOMES.RESIDENTIAL:
                if (isStreet) {
                    type = TILE_TYPES.ROAD;
                } else if (this.isBuilding(x, y, 0.5)) {
                    type = destructionNoise > 0.5 ? TILE_TYPES.RUBBLE : TILE_TYPES.BUILDING;
                    height = destructionNoise > 0.5 ? 1 : Math.floor(detailNoise * 2) + 1;
                } else {
                    // Courtyards and gardens
                    type = detailNoise > 0.7 ? TILE_TYPES.SNOW : TILE_TYPES.GROUND;
                }
                break;

            case BIOMES.COMMERCIAL:
                if (isStreet) {
                    type = TILE_TYPES.ROAD;
                } else if (this.isBuilding(x, y, 0.7)) {
                    // More destruction in city center (heavy fighting)
                    type = destructionNoise > 0.35 ? TILE_TYPES.RUBBLE : TILE_TYPES.BUILDING;
                    height = destructionNoise > 0.35 ? 2 : Math.floor(detailNoise * 4) + 1;
                } else {
                    type = TILE_TYPES.FLOOR;
                }
                break;

            case BIOMES.RUINS:
                // Almost everything is destroyed
                if (isStreet) {
                    type = destructionNoise > 0.6 ? TILE_TYPES.RUBBLE : TILE_TYPES.ROAD;
                } else {
                    type = TILE_TYPES.RUBBLE;
                    height = Math.floor(destructionNoise * 3);
                }
                break;

            case BIOMES.OPEN:
                // Parks, squares - some snow
                type = baseNoise > 0.6 ? TILE_TYPES.SNOW : TILE_TYPES.GROUND;
                if (destructionNoise > 0.7) {
                    type = TILE_TYPES.RUBBLE;
                    height = 1;
                }
                break;

            default:
                type = TILE_TYPES.GROUND;
        }

        return { type, height };
    }

    // Get biome for a location
    getBiome(x, y, context = {}) {
        const key = `${Math.floor(x / 32)},${Math.floor(y / 32)}`;

        if (this.biomeCache.has(key)) {
            return this.biomeCache.get(key);
        }

        // Use noise to determine biome
        const biomeNoise = this.fractalNoise(x / 4, y / 4, 0.01, 2);

        // River runs through specific area (east side for Volga)
        const mapCenterX = 128;
        const riverOffset = 80;
        if (x > mapCenterX + riverOffset) {
            this.biomeCache.set(key, BIOMES.RIVER);
            return BIOMES.RIVER;
        }

        // Near river is more destroyed (heavy fighting)
        if (x > mapCenterX + riverOffset - 20) {
            this.biomeCache.set(key, BIOMES.RUINS);
            return BIOMES.RUINS;
        }

        // Biome selection based on location
        let biome;
        if (y < 80) {
            // Northern industrial district
            biome = biomeNoise > 0.6 ? BIOMES.RUINS : BIOMES.INDUSTRIAL;
        } else if (y > 180) {
            // Southern residential
            biome = biomeNoise > 0.7 ? BIOMES.RUINS : BIOMES.RESIDENTIAL;
        } else if (x < 80) {
            // Western residential
            biome = BIOMES.RESIDENTIAL;
        } else {
            // Central commercial/administrative
            biome = biomeNoise > 0.5 ? BIOMES.RUINS : BIOMES.COMMERCIAL;
        }

        this.biomeCache.set(key, biome);
        return biome;
    }

    // Check if position is on a street
    isStreet(x, y) {
        const gridX = x % (this.blockSize + this.streetWidth);
        const gridY = y % (this.blockSize + this.streetWidth);

        return gridX < this.streetWidth || gridY < this.streetWidth;
    }

    // Check if position is a building
    isBuilding(x, y, density = 0.5) {
        // Not on streets
        if (this.isStreet(x, y)) return false;

        // Use deterministic random per building block
        const blockX = Math.floor(x / this.blockSize);
        const blockY = Math.floor(y / this.blockSize);
        const buildingRandom = this.random.at(blockX * 100, blockY * 100);

        // Check if this block has a building
        if (buildingRandom > density) return false;

        // Check if we're inside the building footprint (not at edges)
        const localX = x % this.blockSize;
        const localY = y % this.blockSize;

        // Buildings don't go to block edges
        return localX > 0 && localX < this.blockSize - 1 &&
               localY > 0 && localY < this.blockSize - 1;
    }

    // Fractal noise (multiple octaves)
    fractalNoise(x, y, scale, octaves = 3) {
        let value = 0;
        let amplitude = 1;
        let frequency = scale;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            value += this.noise(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }

        return value / maxValue;
    }

    // Basic value noise
    noise(x, y) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const fx = x - x0;
        const fy = y - y0;

        // Smoothstep interpolation
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);

        // Get values at corners
        const n00 = this.random.at(x0, y0);
        const n10 = this.random.at(x1, y0);
        const n01 = this.random.at(x0, y1);
        const n11 = this.random.at(x1, y1);

        // Bilinear interpolation
        const nx0 = n00 * (1 - sx) + n10 * sx;
        const nx1 = n01 * (1 - sx) + n11 * sx;

        return nx0 * (1 - sy) + nx1 * sy;
    }

    // Generate landmarks at specific locations
    generateLandmark(x, y, type, radius = 5) {
        const tiles = [];

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius) continue;

                let tileType = TILE_TYPES.FLOOR;
                let height = 0;

                switch (type) {
                    case 'factory':
                        if (dist < radius * 0.8) {
                            tileType = TILE_TYPES.BUILDING;
                            height = 3;
                        } else {
                            tileType = TILE_TYPES.FLOOR;
                        }
                        break;

                    case 'square':
                        tileType = TILE_TYPES.FLOOR;
                        break;

                    case 'ruins':
                        tileType = TILE_TYPES.RUBBLE;
                        height = Math.floor(Math.random() * 3);
                        break;

                    case 'bunker':
                        if (dist < radius * 0.5) {
                            tileType = TILE_TYPES.WALL;
                            height = 1;
                        } else {
                            tileType = TILE_TYPES.FLOOR;
                        }
                        break;
                }

                tiles.push({
                    x: x + dx,
                    y: y + dy,
                    type: tileType,
                    height
                });
            }
        }

        return tiles;
    }

    // Apply destruction to an area
    applyDestruction(worldGrid, centerX, centerY, radius, intensity = 0.5) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius) continue;

                const x = centerX + dx;
                const y = centerY + dy;

                // Destruction decreases with distance
                const localIntensity = intensity * (1 - dist / radius);
                const destructionRoll = this.random.at(x * 7, y * 13);

                if (destructionRoll < localIntensity) {
                    const currentType = worldGrid.getTile(x, y);

                    // Convert buildings to rubble
                    if (currentType === TILE_TYPES.BUILDING) {
                        worldGrid.setTile(x, y, TILE_TYPES.RUBBLE);
                        worldGrid.setHeight(x, y, Math.floor(localIntensity * 3));
                    }
                    // Damage roads
                    else if (currentType === TILE_TYPES.ROAD && destructionRoll < localIntensity * 0.5) {
                        worldGrid.setTile(x, y, TILE_TYPES.RUBBLE);
                    }
                }
            }
        }
    }

    // Generate based on scenario locations
    applyScenarioLocations(worldGrid, scenario) {
        if (!scenario?.keyLocations) return;

        for (const location of scenario.keyLocations) {
            // Skip if no explicit position
            if (!location.position) continue;

            const { x, y } = location.position;
            const radius = location.radius || 10;

            debugLog(`[TerrainGen] Applying location: ${location.name} at (${x}, ${y})`);

            // Generate appropriate terrain for location type
            switch (location.type) {
                case 'building':
                    const landmark = this.generateLandmark(x, y, 'factory', radius);
                    for (const tile of landmark) {
                        worldGrid.setTile(tile.x, tile.y, tile.type);
                        worldGrid.setHeight(tile.x, tile.y, tile.height);
                    }
                    break;

                case 'district':
                    // Districts are larger areas, apply destruction based on danger level
                    if (location.dangerLevel > 3) {
                        this.applyDestruction(worldGrid, x, y, radius * 2, location.dangerLevel / 10);
                    }
                    break;

                case 'water':
                    // Water areas
                    for (let dy = -radius; dy <= radius; dy++) {
                        for (let dx = -radius; dx <= radius; dx++) {
                            worldGrid.setTile(x + dx, y + dy, TILE_TYPES.WATER);
                            worldGrid.setHeight(x + dx, y + dy, 0);
                        }
                    }
                    break;
            }
        }
    }

    // Clear biome cache (call when switching scenarios)
    clearCache() {
        this.biomeCache.clear();
    }
}
