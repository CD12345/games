// History RPG - Isometric Renderer
// 2.5D rendering with blocky Minecraft-style tiles

import { ISO, TILE_TYPES, LOD, CHUNK_SIZE } from '../config.js';

// Tile color palettes (Minecraft-style blocky aesthetic)
const TILE_PALETTES = {
    [TILE_TYPES.EMPTY]: { top: '#1a1a2e', left: '#0f0f1a', right: '#141425' },
    [TILE_TYPES.GROUND]: { top: '#5a4a3a', left: '#3a3028', right: '#4a3f32' },
    [TILE_TYPES.RUBBLE]: { top: '#6b5b4a', left: '#4a3f34', right: '#5a4f40' },
    [TILE_TYPES.WALL]: { top: '#8b7b6a', left: '#5a4f40', right: '#6b5b4a' },
    [TILE_TYPES.FLOOR]: { top: '#4a4a4a', left: '#3a3a3a', right: '#404040' },
    [TILE_TYPES.SNOW]: { top: '#ffffff', left: '#cccccc', right: '#e0e0e0' },
    [TILE_TYPES.WATER]: { top: '#4488aa', left: '#336688', right: '#3377aa' },
    [TILE_TYPES.ROAD]: { top: '#555555', left: '#444444', right: '#4a4a4a' },
    [TILE_TYPES.BUILDING]: { top: '#7a6a5a', left: '#4a4038', right: '#5a5048' }
};

export class IsometricRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Isometric tile dimensions
        this.tileWidth = ISO.TILE_WIDTH;
        this.tileHeight = ISO.TILE_HEIGHT;
        this.tileDepth = ISO.TILE_DEPTH;

        // Camera position (world coordinates)
        this.cameraX = 0;
        this.cameraY = 0;
        this.zoom = 1;

        // Pre-rendered tile sprites
        this.tileCache = new Map();

        // Generate base tile sprites
        this.generateTileSprites();
    }

    // Generate pre-rendered sprites for each tile type and height
    generateTileSprites() {
        for (const [typeStr, palette] of Object.entries(TILE_PALETTES)) {
            const type = parseInt(typeStr);
            for (let height = 0; height <= 4; height++) {
                const key = `${type}_${height}`;
                this.tileCache.set(key, this.createTileSprite(palette, height));
            }
        }
    }

    // Create a single tile sprite (isometric block)
    createTileSprite(palette, height) {
        const w = this.tileWidth;
        const h = this.tileHeight + height * this.tileDepth;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h + this.tileHeight; // Extra space for height
        const ctx = offCanvas.getContext('2d');

        const halfW = w / 2;
        const halfH = this.tileHeight / 2;
        const depth = height * this.tileDepth;

        // Top face (diamond/rhombus)
        ctx.fillStyle = palette.top;
        ctx.beginPath();
        ctx.moveTo(halfW, 0);
        ctx.lineTo(w, halfH);
        ctx.lineTo(halfW, this.tileHeight);
        ctx.lineTo(0, halfH);
        ctx.closePath();
        ctx.fill();

        // Add subtle grid lines on top
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (height > 0) {
            // Left face
            ctx.fillStyle = palette.left;
            ctx.beginPath();
            ctx.moveTo(0, halfH);
            ctx.lineTo(halfW, this.tileHeight);
            ctx.lineTo(halfW, this.tileHeight + depth);
            ctx.lineTo(0, halfH + depth);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Right face
            ctx.fillStyle = palette.right;
            ctx.beginPath();
            ctx.moveTo(halfW, this.tileHeight);
            ctx.lineTo(w, halfH);
            ctx.lineTo(w, halfH + depth);
            ctx.lineTo(halfW, this.tileHeight + depth);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        return offCanvas;
    }

    // Convert world coordinates to screen coordinates
    worldToScreen(x, y, z = 0) {
        // Isometric projection (2:1 ratio)
        const isoX = (x - y) * (this.tileWidth / 2) * this.zoom;
        const isoY = (x + y) * (this.tileHeight / 2) * this.zoom - z * this.tileDepth * this.zoom;

        return {
            x: isoX - this.cameraX + this.canvas.width / 2,
            y: isoY - this.cameraY + this.canvas.height / 2
        };
    }

    // Convert screen coordinates to world coordinates
    screenToWorld(screenX, screenY) {
        const sx = (screenX - this.canvas.width / 2 + this.cameraX) / this.zoom;
        const sy = (screenY - this.canvas.height / 2 + this.cameraY) / this.zoom;

        const x = (sx / (this.tileWidth / 2) + sy / (this.tileHeight / 2)) / 2;
        const y = (sy / (this.tileHeight / 2) - sx / (this.tileWidth / 2)) / 2;

        return { x: Math.floor(x), y: Math.floor(y) };
    }

    // Set camera position (centered on world coordinates)
    setCamera(x, y) {
        const screen = this.worldToScreen(x, y, 0);
        this.cameraX = (x - y) * (this.tileWidth / 2) * this.zoom;
        this.cameraY = (x + y) * (this.tileHeight / 2) * this.zoom;
    }

    // Set zoom level
    setZoom(zoom) {
        this.zoom = Math.max(0.25, Math.min(2, zoom));
    }

    // Clear the canvas
    clear() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Get visible tile range
    getVisibleRange() {
        // Calculate which tiles are visible on screen
        const topLeft = this.screenToWorld(0, 0);
        const topRight = this.screenToWorld(this.canvas.width, 0);
        const bottomLeft = this.screenToWorld(0, this.canvas.height);
        const bottomRight = this.screenToWorld(this.canvas.width, this.canvas.height);

        // Find bounds with some padding
        const padding = 3;
        return {
            minX: Math.floor(Math.min(topLeft.x, bottomLeft.x)) - padding,
            maxX: Math.ceil(Math.max(topRight.x, bottomRight.x)) + padding,
            minY: Math.floor(Math.min(topLeft.y, topRight.y)) - padding,
            maxY: Math.ceil(Math.max(bottomLeft.y, bottomRight.y)) + padding
        };
    }

    // Render the world grid
    renderWorld(worldGrid, playerPos = null) {
        this.clear();

        const range = this.getVisibleRange();

        // Render tiles back-to-front (painter's algorithm)
        // Sort by (x + y) to ensure proper occlusion
        const tiles = [];

        for (let y = range.minY; y <= range.maxY; y++) {
            for (let x = range.minX; x <= range.maxX; x++) {
                if (x >= 0 && x < worldGrid.width && y >= 0 && y < worldGrid.height) {
                    const type = worldGrid.getTile(x, y);
                    const height = worldGrid.getHeight(x, y);
                    const visibility = worldGrid.getVisibility(x, y);

                    // Skip completely hidden tiles
                    if (visibility === 0 && !worldGrid.isExplored(x, y)) {
                        continue;
                    }

                    tiles.push({
                        x,
                        y,
                        type,
                        height,
                        visibility,
                        sortKey: x + y
                    });
                }
            }
        }

        // Sort for proper depth ordering
        tiles.sort((a, b) => a.sortKey - b.sortKey);

        // Render tiles
        for (const tile of tiles) {
            this.renderTile(tile.x, tile.y, tile.type, tile.height, tile.visibility);
        }

        // Render player
        if (playerPos) {
            this.renderPlayer(playerPos.x, playerPos.y);
        }
    }

    // Render a single tile
    renderTile(x, y, type, height, visibility) {
        const screen = this.worldToScreen(x, y, height);

        // Get cached sprite
        const cacheHeight = Math.min(height, 4);
        const key = `${type}_${cacheHeight}`;
        const sprite = this.tileCache.get(key);

        if (!sprite) return;

        // Calculate draw position (centered on tile position)
        const drawX = screen.x - (this.tileWidth * this.zoom) / 2;
        const drawY = screen.y - (this.tileHeight * this.zoom) / 2 - height * this.tileDepth * this.zoom;

        // Draw with appropriate opacity based on visibility
        if (visibility === 0) {
            // Explored but not visible - fog of war (very dim)
            this.ctx.globalAlpha = 0.3;
        } else if (visibility === 1) {
            // Fog - previously visible
            this.ctx.globalAlpha = 0.6;
        } else {
            // Fully visible
            this.ctx.globalAlpha = 1;
        }

        this.ctx.drawImage(
            sprite,
            drawX,
            drawY,
            sprite.width * this.zoom,
            sprite.height * this.zoom
        );

        this.ctx.globalAlpha = 1;
    }

    // Render the player character
    renderPlayer(x, y) {
        const screen = this.worldToScreen(x, y, 0);

        // Simple blocky character representation
        const size = 24 * this.zoom;

        // Body (rectangle)
        this.ctx.fillStyle = '#3498db';
        this.ctx.fillRect(
            screen.x - size / 2,
            screen.y - size * 1.5,
            size,
            size * 1.5
        );

        // Head (smaller rectangle)
        this.ctx.fillStyle = '#f1c40f';
        this.ctx.fillRect(
            screen.x - size / 3,
            screen.y - size * 2,
            size * 0.66,
            size * 0.5
        );

        // Outline
        this.ctx.strokeStyle = '#2c3e50';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(
            screen.x - size / 2,
            screen.y - size * 2,
            size,
            size * 2
        );
    }

    // Render an NPC
    renderNPC(x, y, npc) {
        const screen = this.worldToScreen(x, y, 0);
        const size = 20 * this.zoom;

        // NPC color based on disposition
        let color = '#95a5a6'; // Neutral gray
        if (npc.disposition > 60) {
            color = '#27ae60'; // Friendly green
        } else if (npc.disposition < 40) {
            color = '#e74c3c'; // Hostile red
        }

        // Body
        this.ctx.fillStyle = color;
        this.ctx.fillRect(
            screen.x - size / 2,
            screen.y - size * 1.5,
            size,
            size * 1.5
        );

        // Name label
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `${12 * this.zoom}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(npc.name || 'NPC', screen.x, screen.y - size * 2 - 5);
    }

    // Render UI elements (HUD)
    renderUI(state) {
        const ctx = this.ctx;

        // Time of day indicator (top right)
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(this.canvas.width - 100, 10, 90, 30);
        ctx.fillStyle = '#fff';
        ctx.font = '14px monospace';
        ctx.textAlign = 'right';
        const hours = Math.floor(state.world.timeOfDay);
        const mins = Math.floor((state.world.timeOfDay % 1) * 60);
        ctx.fillText(
            `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`,
            this.canvas.width - 20,
            30
        );

        // Phase indicator (top left)
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(10, 10, 120, 30);
        ctx.fillStyle = '#fff';
        ctx.fillText(state.phase.toUpperCase(), 20, 30);

        // Health bar (bottom left)
        if (state.player) {
            const barWidth = 150;
            const barHeight = 20;
            const healthPercent = state.player.health / state.player.maxHealth;

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(10, this.canvas.height - 40, barWidth + 10, barHeight + 10);

            // Background
            ctx.fillStyle = '#333';
            ctx.fillRect(15, this.canvas.height - 35, barWidth, barHeight);

            // Health fill
            ctx.fillStyle = healthPercent > 0.5 ? '#27ae60' : healthPercent > 0.25 ? '#f39c12' : '#e74c3c';
            ctx.fillRect(15, this.canvas.height - 35, barWidth * healthPercent, barHeight);
        }

        // Loading indicator
        if (state.aiGenerating) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(this.canvas.width / 2 - 60, 10, 120, 30);
            ctx.fillStyle = '#f39c12';
            ctx.textAlign = 'center';
            ctx.fillText('Generating...', this.canvas.width / 2, 30);
        }
    }

    // Render minimap
    renderMinimap(worldGrid, playerPos, size = 150) {
        const ctx = this.ctx;
        const x = this.canvas.width - size - 10;
        const y = this.canvas.height - size - 10;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x - 5, y - 5, size + 10, size + 10);

        // Calculate scale
        const scale = size / Math.max(worldGrid.width, worldGrid.height);

        // Draw explored tiles
        for (let ty = 0; ty < worldGrid.height; ty++) {
            for (let tx = 0; tx < worldGrid.width; tx++) {
                if (worldGrid.isExplored(tx, ty)) {
                    const type = worldGrid.getTile(tx, ty);
                    const palette = TILE_PALETTES[type] || TILE_PALETTES[TILE_TYPES.GROUND];

                    ctx.fillStyle = palette.top;
                    ctx.fillRect(
                        x + tx * scale,
                        y + ty * scale,
                        Math.max(1, scale),
                        Math.max(1, scale)
                    );
                }
            }
        }

        // Draw player position
        if (playerPos) {
            ctx.fillStyle = '#3498db';
            ctx.beginPath();
            ctx.arc(
                x + playerPos.x * scale,
                y + playerPos.y * scale,
                4,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }

        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, size, size);
    }
}
