// History RPG - Isometric Renderer
// 2.5D rendering with blocky Minecraft-style tiles

import { ISO, TILE_TYPES, LOD, CHUNK_SIZE } from '../config.js';
import { TileFactory } from './TileFactory.js';
import { CharacterRenderer } from './CharacterRenderer.js';

// Minimap colors (simpler than full tile palettes)
const MINIMAP_COLORS = {
    [TILE_TYPES.EMPTY]: '#1a1a2e',
    [TILE_TYPES.GROUND]: '#5a4a3a',
    [TILE_TYPES.RUBBLE]: '#6b5b4a',
    [TILE_TYPES.WALL]: '#8b7b6a',
    [TILE_TYPES.FLOOR]: '#4a4a4a',
    [TILE_TYPES.SNOW]: '#ffffff',
    [TILE_TYPES.WATER]: '#4488aa',
    [TILE_TYPES.ROAD]: '#555555',
    [TILE_TYPES.BUILDING]: '#7a6a5a'
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

        // Tile factory for sprite generation
        this.tileFactory = new TileFactory();

        // Character renderer for players/NPCs
        this.characterRenderer = new CharacterRenderer();

        // Pre-generate common sprites
        this.tileFactory.pregenerate();
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
            this.renderPlayer(playerPos.x, playerPos.y, playerPos);
        }
    }

    // Render a single tile
    renderTile(x, y, type, height, visibility) {
        const screen = this.worldToScreen(x, y, height);

        // Get sprite from factory with position-based variation
        const cacheHeight = Math.min(height, 4);
        const variation = this.tileFactory.getVariation(x, y);
        const sprite = this.tileFactory.getTileSprite(type, cacheHeight, variation);

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
    renderPlayer(x, y, player = {}) {
        const screen = this.worldToScreen(x, y, 0);
        this.characterRenderer.renderPlayer(this.ctx, screen.x, screen.y, player, this.zoom);
    }

    // Render an NPC
    renderNPC(x, y, npc) {
        const screen = this.worldToScreen(x, y, 0);
        this.characterRenderer.renderNPC(this.ctx, screen.x, screen.y, npc, this.zoom);
    }

    // Render an item
    renderItem(x, y, item) {
        const screen = this.worldToScreen(x, y, 0);
        this.characterRenderer.renderItem(this.ctx, screen.x, screen.y, item, this.zoom);
    }

    // Render UI elements (HUD)
    renderUI(state, timeInfo = null) {
        const ctx = this.ctx;

        // Time and date indicator (top right)
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(this.canvas.width - 180, 10, 170, timeInfo?.dateString ? 50 : 30);
        ctx.fillStyle = '#fff';
        ctx.font = '14px monospace';
        ctx.textAlign = 'right';

        // Display time from event system or fallback
        if (timeInfo) {
            ctx.fillText(timeInfo.timeString || '12:00 PM', this.canvas.width - 20, 28);
            if (timeInfo.dateString) {
                ctx.font = '11px monospace';
                ctx.fillStyle = '#aaa';
                ctx.fillText(timeInfo.dateString, this.canvas.width - 20, 48);
            }
        } else {
            const hours = Math.floor(state.world.timeOfDay);
            const mins = Math.floor((state.world.timeOfDay % 1) * 60);
            ctx.fillText(
                `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`,
                this.canvas.width - 20,
                28
            );
        }

        // Scenario title (top left)
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        const scenarioTitle = state.scenario?.title || 'History RPG';
        const titleWidth = Math.max(150, scenarioTitle.length * 9 + 20);
        ctx.fillRect(10, 10, titleWidth, 30);
        ctx.fillStyle = '#c9a227';
        ctx.font = '14px monospace';
        ctx.fillText(scenarioTitle, 20, 30);

        // Current objective (below title)
        if (state.scenario?.goalPath) {
            const currentObj = state.scenario.goalPath.find(g => !g.completed);
            if (currentObj) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(10, 45, 280, 25);
                ctx.fillStyle = '#fff';
                ctx.font = '12px monospace';
                ctx.fillText(`> ${currentObj.objective}`, 20, 62);
            }
        }

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
        const mapX = this.canvas.width - size - 10;
        const mapY = this.canvas.height - size - 10;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(mapX - 5, mapY - 5, size + 10, size + 10);

        // Calculate visible area around player (not the whole map)
        const viewRadius = 40;
        const centerX = playerPos?.x || 128;
        const centerY = playerPos?.y || 128;
        const pixelPerTile = size / (viewRadius * 2);

        // Draw explored tiles in visible area
        for (let dy = -viewRadius; dy <= viewRadius; dy++) {
            for (let dx = -viewRadius; dx <= viewRadius; dx++) {
                const tx = Math.floor(centerX + dx);
                const ty = Math.floor(centerY + dy);

                if (tx < 0 || tx >= worldGrid.width || ty < 0 || ty >= worldGrid.height) continue;
                if (!worldGrid.isExplored(tx, ty)) continue;

                const type = worldGrid.getTile(tx, ty);
                const color = MINIMAP_COLORS[type] || MINIMAP_COLORS[TILE_TYPES.GROUND];

                // Dim unexplored areas
                const visibility = worldGrid.getVisibility(tx, ty);
                ctx.globalAlpha = visibility === 2 ? 1 : 0.5;

                ctx.fillStyle = color;
                ctx.fillRect(
                    mapX + (dx + viewRadius) * pixelPerTile,
                    mapY + (dy + viewRadius) * pixelPerTile,
                    Math.ceil(pixelPerTile),
                    Math.ceil(pixelPerTile)
                );
            }
        }

        ctx.globalAlpha = 1;

        // Draw player position (center)
        ctx.fillStyle = '#3498db';
        ctx.beginPath();
        ctx.arc(
            mapX + size / 2,
            mapY + size / 2,
            4,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Border
        ctx.strokeStyle = '#c9a227';
        ctx.lineWidth = 2;
        ctx.strokeRect(mapX, mapY, size, size);

        // Direction indicator (N)
        ctx.fillStyle = '#c9a227';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('N', mapX + size / 2, mapY - 5);
    }
}
