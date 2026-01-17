// History RPG - Tile Factory
// Generates blocky Minecraft-style tile sprites with variations

import { ISO, TILE_TYPES } from '../config.js';

// Extended color palettes with variations
const TILE_PALETTES = {
    [TILE_TYPES.EMPTY]: {
        top: ['#1a1a2e', '#1f1f35', '#15152a'],
        left: ['#0f0f1a', '#121220', '#0a0a15'],
        right: ['#141425', '#18182c', '#101020']
    },
    [TILE_TYPES.GROUND]: {
        top: ['#5a4a3a', '#5e4e3e', '#564638'],
        left: ['#3a3028', '#3e342c', '#362c24'],
        right: ['#4a3f32', '#4e4336', '#463b2e']
    },
    [TILE_TYPES.RUBBLE]: {
        top: ['#6b5b4a', '#726252', '#645446'],
        left: ['#4a3f34', '#504538', '#443a30'],
        right: ['#5a4f40', '#605544', '#544a3c']
    },
    [TILE_TYPES.WALL]: {
        top: ['#8b7b6a', '#928272', '#847464'],
        left: ['#5a4f40', '#605544', '#544a3c'],
        right: ['#6b5b4a', '#726252', '#645446']
    },
    [TILE_TYPES.FLOOR]: {
        top: ['#4a4a4a', '#505050', '#444444'],
        left: ['#3a3a3a', '#404040', '#343434'],
        right: ['#404040', '#464646', '#3a3a3a']
    },
    [TILE_TYPES.SNOW]: {
        top: ['#ffffff', '#f8f8f8', '#f0f0f0'],
        left: ['#cccccc', '#d0d0d0', '#c8c8c8'],
        right: ['#e0e0e0', '#e4e4e4', '#dcdcdc']
    },
    [TILE_TYPES.WATER]: {
        top: ['#4488aa', '#4080a0', '#4890b0'],
        left: ['#336688', '#306080', '#387090'],
        right: ['#3377aa', '#3070a0', '#3880b0']
    },
    [TILE_TYPES.ROAD]: {
        top: ['#555555', '#5a5a5a', '#505050'],
        left: ['#444444', '#484848', '#404040'],
        right: ['#4a4a4a', '#4e4e4e', '#464646']
    },
    [TILE_TYPES.BUILDING]: {
        top: ['#7a6a5a', '#806f5f', '#746456'],
        left: ['#4a4038', '#50463e', '#443a32'],
        right: ['#5a5048', '#60564e', '#544a42']
    }
};

// Detail overlays for visual interest
const DETAIL_TYPES = {
    NONE: 0,
    CRACK: 1,
    DEBRIS: 2,
    SNOW_PATCH: 3,
    PUDDLE: 4,
    SCORCH: 5
};

export class TileFactory {
    constructor() {
        this.tileWidth = ISO.TILE_WIDTH;
        this.tileHeight = ISO.TILE_HEIGHT;
        this.tileDepth = ISO.TILE_DEPTH;

        // Sprite cache: key -> canvas
        this.cache = new Map();

        // Variation seed for deterministic randomness
        this.variationSeed = 12345;
    }

    // Get or create tile sprite
    getTileSprite(tileType, height, variation = 0) {
        const key = `${tileType}_${height}_${variation}`;

        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const sprite = this.createTileSprite(tileType, height, variation);
        this.cache.set(key, sprite);
        return sprite;
    }

    // Create a tile sprite
    createTileSprite(tileType, height, variation = 0) {
        const palette = TILE_PALETTES[tileType] || TILE_PALETTES[TILE_TYPES.GROUND];

        const w = this.tileWidth;
        const h = this.tileHeight + height * this.tileDepth;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h + this.tileHeight;
        const ctx = canvas.getContext('2d');

        const halfW = w / 2;
        const halfH = this.tileHeight / 2;
        const depth = height * this.tileDepth;

        // Select color variation
        const varIndex = variation % 3;
        const topColor = palette.top[varIndex];
        const leftColor = palette.left[varIndex];
        const rightColor = palette.right[varIndex];

        // Top face (diamond/rhombus)
        ctx.fillStyle = topColor;
        ctx.beginPath();
        ctx.moveTo(halfW, 0);
        ctx.lineTo(w, halfH);
        ctx.lineTo(halfW, this.tileHeight);
        ctx.lineTo(0, halfH);
        ctx.closePath();
        ctx.fill();

        // Add detail to top
        this.addTopDetail(ctx, tileType, halfW, halfH, variation);

        // Grid lines on top
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (height > 0) {
            // Left face
            ctx.fillStyle = leftColor;
            ctx.beginPath();
            ctx.moveTo(0, halfH);
            ctx.lineTo(halfW, this.tileHeight);
            ctx.lineTo(halfW, this.tileHeight + depth);
            ctx.lineTo(0, halfH + depth);
            ctx.closePath();
            ctx.fill();

            // Left face detail
            this.addSideDetail(ctx, tileType, 0, halfH, halfW, depth, 'left', variation);

            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.stroke();

            // Right face
            ctx.fillStyle = rightColor;
            ctx.beginPath();
            ctx.moveTo(halfW, this.tileHeight);
            ctx.lineTo(w, halfH);
            ctx.lineTo(w, halfH + depth);
            ctx.lineTo(halfW, this.tileHeight + depth);
            ctx.closePath();
            ctx.fill();

            // Right face detail
            this.addSideDetail(ctx, tileType, halfW, halfH, halfW, depth, 'right', variation);

            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.stroke();
        }

        return canvas;
    }

    // Add detail to top of tile
    addTopDetail(ctx, tileType, halfW, halfH, variation) {
        const random = this.seededRandom(variation);

        switch (tileType) {
            case TILE_TYPES.RUBBLE:
                // Add scattered debris shapes
                ctx.fillStyle = 'rgba(80,70,60,0.4)';
                for (let i = 0; i < 3; i++) {
                    const ox = (random() - 0.5) * halfW * 0.8;
                    const oy = (random() - 0.5) * halfH * 0.8;
                    const size = random() * 6 + 2;
                    ctx.fillRect(halfW + ox - size / 2, halfH + oy - size / 2, size, size);
                }
                break;

            case TILE_TYPES.SNOW:
                // Add subtle texture
                ctx.fillStyle = 'rgba(200,200,220,0.3)';
                for (let i = 0; i < 5; i++) {
                    const ox = (random() - 0.5) * halfW;
                    const oy = (random() - 0.5) * halfH * 0.8;
                    const size = random() * 4 + 1;
                    ctx.beginPath();
                    ctx.arc(halfW + ox, halfH + oy, size, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;

            case TILE_TYPES.ROAD:
                // Add road markings or cracks
                if (random() > 0.7) {
                    ctx.strokeStyle = 'rgba(80,80,80,0.3)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    const startX = halfW + (random() - 0.5) * halfW;
                    const startY = halfH * 0.5 + random() * halfH;
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(startX + (random() - 0.5) * 10, startY + random() * 8);
                    ctx.stroke();
                }
                break;

            case TILE_TYPES.WATER:
                // Add wave ripples
                ctx.strokeStyle = 'rgba(100,150,180,0.3)';
                ctx.lineWidth = 1;
                for (let i = 0; i < 2; i++) {
                    const oy = halfH + (random() - 0.5) * halfH;
                    ctx.beginPath();
                    ctx.moveTo(halfW * 0.3, oy);
                    ctx.quadraticCurveTo(halfW, oy + 3, halfW * 1.7, oy);
                    ctx.stroke();
                }
                break;

            case TILE_TYPES.BUILDING:
                // Add window-like details
                ctx.fillStyle = 'rgba(40,50,60,0.4)';
                const windowSize = 4;
                const wx = halfW - windowSize;
                const wy = halfH - windowSize / 2;
                ctx.fillRect(wx, wy, windowSize, windowSize);
                ctx.fillRect(wx + windowSize * 2, wy, windowSize, windowSize);
                break;
        }
    }

    // Add detail to side faces
    addSideDetail(ctx, tileType, startX, startY, width, depth, side, variation) {
        if (depth < 8) return;

        const random = this.seededRandom(variation + (side === 'left' ? 100 : 200));

        switch (tileType) {
            case TILE_TYPES.BUILDING:
                // Window patterns
                ctx.fillStyle = 'rgba(30,40,50,0.5)';
                const windowW = 6;
                const windowH = 8;
                const numWindows = Math.floor(depth / 16);

                for (let i = 0; i < numWindows; i++) {
                    const wx = startX + width / 2 - windowW / 2 + (random() - 0.5) * 4;
                    const wy = startY + this.tileHeight / 2 + i * 16 + 4;
                    ctx.fillRect(wx, wy, windowW, windowH);
                }
                break;

            case TILE_TYPES.RUBBLE:
                // Irregular edges
                ctx.fillStyle = 'rgba(100,90,80,0.3)';
                for (let i = 0; i < 2; i++) {
                    const bx = startX + random() * width * 0.8;
                    const by = startY + this.tileHeight / 2 + random() * depth;
                    const size = random() * 5 + 2;
                    ctx.fillRect(bx, by, size, size);
                }
                break;

            case TILE_TYPES.WALL:
                // Brick pattern hint
                ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                ctx.lineWidth = 1;
                const brickHeight = 8;
                for (let i = 0; i < Math.floor(depth / brickHeight); i++) {
                    const by = startY + this.tileHeight / 2 + i * brickHeight;
                    ctx.beginPath();
                    ctx.moveTo(startX, by);
                    ctx.lineTo(startX + width, by);
                    ctx.stroke();
                }
                break;
        }
    }

    // Seeded random for deterministic variations
    seededRandom(seed) {
        let state = seed + this.variationSeed;
        return () => {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
    }

    // Get variation index for world position
    getVariation(x, y) {
        // Deterministic variation based on position
        const n = Math.abs(Math.floor(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453));
        return n % 10; // 10 variations
    }

    // Pre-generate common sprites
    pregenerate() {
        for (const type of Object.values(TILE_TYPES)) {
            for (let height = 0; height <= 4; height++) {
                for (let variation = 0; variation < 3; variation++) {
                    this.getTileSprite(type, height, variation);
                }
            }
        }
    }

    // Clear cache
    clearCache() {
        this.cache.clear();
    }

    // Get cache size
    getCacheSize() {
        return this.cache.size;
    }
}
