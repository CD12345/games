// History RPG - Character Renderer
// Renders blocky Minecraft-style characters for player and NPCs

import { ISO } from '../config.js';
import { NPC_STATES } from '../core/EntityManager.js';

// Character color palettes by faction/role
const CHARACTER_PALETTES = {
    player: {
        body: '#3498db',
        head: '#f1c40f',
        outline: '#2c3e50'
    },
    civilian: {
        body: '#7f8c8d',
        head: '#e8d5b7',
        outline: '#2c3e50'
    },
    soviet: {
        body: '#8b4513',
        head: '#e8d5b7',
        outline: '#2c3e50',
        accent: '#cc0000'  // Red star
    },
    german: {
        body: '#556b2f',
        head: '#e8d5b7',
        outline: '#2c3e50',
        accent: '#808080'
    },
    resistance: {
        body: '#34495e',
        head: '#e8d5b7',
        outline: '#2c3e50'
    }
};

// Facing direction offsets for animation
const FACING_OFFSETS = {
    north: { bodyX: 0, headX: 0 },
    south: { bodyX: 0, headX: 0 },
    east: { bodyX: 2, headX: 1 },
    west: { bodyX: -2, headX: -1 }
};

export class CharacterRenderer {
    constructor() {
        this.spriteCache = new Map();
        this.shadowColor = 'rgba(0,0,0,0.3)';
    }

    // Render the player character
    renderPlayer(ctx, screenX, screenY, player, zoom = 1) {
        const palette = CHARACTER_PALETTES.player;
        const facing = player.facing || 'south';
        const isMoving = player.velocity &&
            (player.velocity.x !== 0 || player.velocity.y !== 0);

        this.renderCharacter(ctx, screenX, screenY, palette, facing, isMoving, zoom);

        // Player indicator (small arrow above head)
        ctx.fillStyle = '#3498db';
        ctx.beginPath();
        const arrowY = screenY - 40 * zoom;
        ctx.moveTo(screenX, arrowY);
        ctx.lineTo(screenX - 5 * zoom, arrowY - 8 * zoom);
        ctx.lineTo(screenX + 5 * zoom, arrowY - 8 * zoom);
        ctx.closePath();
        ctx.fill();
    }

    // Render an NPC
    renderNPC(ctx, screenX, screenY, npc, zoom = 1) {
        const faction = npc.faction || 'civilian';
        const palette = CHARACTER_PALETTES[faction] || CHARACTER_PALETTES.civilian;
        const facing = npc.facing || 'south';
        const isMoving = npc.velocity &&
            (npc.velocity.x !== 0 || npc.velocity.y !== 0);

        // Modify color based on disposition
        const modifiedPalette = this.getDispositionPalette(palette, npc.disposition);

        // State-based effects
        const alpha = npc.state === NPC_STATES.DEAD ? 0.5 : 1;
        ctx.globalAlpha = alpha;

        this.renderCharacter(ctx, screenX, screenY, modifiedPalette, facing, isMoving, zoom);

        ctx.globalAlpha = 1;

        // Name label
        if (npc.name) {
            this.renderNameLabel(ctx, screenX, screenY, npc, zoom);
        }

        // State indicator (alert, etc)
        this.renderStateIndicator(ctx, screenX, screenY, npc, zoom);
    }

    // Render a blocky character
    renderCharacter(ctx, screenX, screenY, palette, facing, isMoving, zoom) {
        const baseSize = 24 * zoom;
        const headSize = baseSize * 0.5;
        const bodyHeight = baseSize * 1.5;
        const bodyWidth = baseSize;

        const offsets = FACING_OFFSETS[facing] || FACING_OFFSETS.south;

        // Shadow
        ctx.fillStyle = this.shadowColor;
        ctx.beginPath();
        ctx.ellipse(
            screenX,
            screenY + 2 * zoom,
            bodyWidth * 0.6,
            bodyWidth * 0.25,
            0, 0, Math.PI * 2
        );
        ctx.fill();

        // Legs (when moving, animate)
        const legOffset = isMoving ? Math.sin(Date.now() / 100) * 3 * zoom : 0;
        ctx.fillStyle = palette.outline;

        // Left leg
        ctx.fillRect(
            screenX - bodyWidth * 0.35 + offsets.bodyX * zoom,
            screenY - bodyHeight * 0.3 + legOffset,
            bodyWidth * 0.3,
            bodyHeight * 0.4
        );

        // Right leg
        ctx.fillRect(
            screenX + bodyWidth * 0.05 + offsets.bodyX * zoom,
            screenY - bodyHeight * 0.3 - legOffset,
            bodyWidth * 0.3,
            bodyHeight * 0.4
        );

        // Body (torso)
        ctx.fillStyle = palette.body;
        ctx.fillRect(
            screenX - bodyWidth * 0.4 + offsets.bodyX * zoom,
            screenY - bodyHeight * 0.9,
            bodyWidth * 0.8,
            bodyHeight * 0.7
        );

        // Arms
        const armSwing = isMoving ? Math.sin(Date.now() / 100) * 4 * zoom : 0;

        ctx.fillRect(
            screenX - bodyWidth * 0.55 + offsets.bodyX * zoom,
            screenY - bodyHeight * 0.85 - armSwing,
            bodyWidth * 0.2,
            bodyHeight * 0.5
        );

        ctx.fillRect(
            screenX + bodyWidth * 0.35 + offsets.bodyX * zoom,
            screenY - bodyHeight * 0.85 + armSwing,
            bodyWidth * 0.2,
            bodyHeight * 0.5
        );

        // Head
        ctx.fillStyle = palette.head;
        ctx.fillRect(
            screenX - headSize * 0.5 + offsets.headX * zoom,
            screenY - bodyHeight - headSize * 0.7,
            headSize,
            headSize * 0.8
        );

        // Face details based on facing
        ctx.fillStyle = palette.outline;
        if (facing === 'south' || facing === 'north') {
            // Eyes
            const eyeY = screenY - bodyHeight - headSize * 0.4;
            const eyeSize = 3 * zoom;

            if (facing === 'south') {
                ctx.fillRect(screenX - 4 * zoom, eyeY, eyeSize, eyeSize);
                ctx.fillRect(screenX + 2 * zoom, eyeY, eyeSize, eyeSize);
            }
        }

        // Faction accent (e.g., red star for soviets)
        if (palette.accent) {
            ctx.fillStyle = palette.accent;
            ctx.beginPath();
            ctx.arc(
                screenX + offsets.bodyX * zoom,
                screenY - bodyHeight * 0.6,
                3 * zoom,
                0, Math.PI * 2
            );
            ctx.fill();
        }

        // Outline
        ctx.strokeStyle = palette.outline;
        ctx.lineWidth = 1;
        ctx.strokeRect(
            screenX - bodyWidth * 0.4 + offsets.bodyX * zoom,
            screenY - bodyHeight - headSize * 0.7,
            bodyWidth * 0.8,
            bodyHeight + headSize * 0.7
        );
    }

    // Get palette modified by disposition
    getDispositionPalette(basePalette, disposition) {
        if (disposition >= 60) {
            // Friendly - slight green tint
            return {
                ...basePalette,
                body: this.tintColor(basePalette.body, '#27ae60', 0.2)
            };
        } else if (disposition <= 30) {
            // Hostile - slight red tint
            return {
                ...basePalette,
                body: this.tintColor(basePalette.body, '#e74c3c', 0.3)
            };
        }
        return basePalette;
    }

    // Tint a color toward another
    tintColor(baseColor, tintColor, amount) {
        // Simple hex color mixing
        const base = this.hexToRgb(baseColor);
        const tint = this.hexToRgb(tintColor);

        if (!base || !tint) return baseColor;

        const r = Math.round(base.r * (1 - amount) + tint.r * amount);
        const g = Math.round(base.g * (1 - amount) + tint.g * amount);
        const b = Math.round(base.b * (1 - amount) + tint.b * amount);

        return `rgb(${r},${g},${b})`;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    // Render NPC name label
    renderNameLabel(ctx, screenX, screenY, npc, zoom) {
        const name = npc.name;
        ctx.font = `${12 * zoom}px monospace`;
        ctx.textAlign = 'center';

        // Background
        const textWidth = ctx.measureText(name).width;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(
            screenX - textWidth / 2 - 4,
            screenY - 50 * zoom - 14 * zoom,
            textWidth + 8,
            16 * zoom
        );

        // Text
        ctx.fillStyle = npc.met ? '#fff' : '#999';
        ctx.fillText(name, screenX, screenY - 50 * zoom - 2 * zoom);
    }

    // Render state indicator
    renderStateIndicator(ctx, screenX, screenY, npc, zoom) {
        const indicatorY = screenY - 55 * zoom;

        switch (npc.state) {
            case NPC_STATES.ALERT:
                // Exclamation mark
                ctx.fillStyle = '#e74c3c';
                ctx.font = `bold ${16 * zoom}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('!', screenX, indicatorY);
                break;

            case NPC_STATES.TALK:
                // Speech bubble
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.ellipse(screenX, indicatorY, 8 * zoom, 6 * zoom, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#333';
                ctx.font = `${8 * zoom}px monospace`;
                ctx.fillText('...', screenX, indicatorY + 2 * zoom);
                break;

            case NPC_STATES.FLEE:
                // Fear indicator
                ctx.fillStyle = '#9b59b6';
                ctx.font = `${12 * zoom}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('~', screenX, indicatorY);
                break;
        }
    }

    // Render an item
    renderItem(ctx, screenX, screenY, item, zoom = 1) {
        const size = 16 * zoom;

        // Glow effect for visibility
        ctx.fillStyle = 'rgba(241, 196, 15, 0.3)';
        ctx.beginPath();
        ctx.arc(screenX, screenY - size / 2, size, 0, Math.PI * 2);
        ctx.fill();

        // Item box
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(
            screenX - size / 2,
            screenY - size,
            size,
            size
        );

        // Outline
        ctx.strokeStyle = '#c9a227';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            screenX - size / 2,
            screenY - size,
            size,
            size
        );

        // Icon hint based on item type
        ctx.fillStyle = '#c9a227';
        ctx.font = `${10 * zoom}px monospace`;
        ctx.textAlign = 'center';

        switch (item.itemType) {
            case 'supply':
                ctx.fillText('+', screenX, screenY - size / 2 + 3 * zoom);
                break;
            case 'document':
                ctx.fillText('D', screenX, screenY - size / 2 + 3 * zoom);
                break;
            case 'weapon':
                ctx.fillText('W', screenX, screenY - size / 2 + 3 * zoom);
                break;
            default:
                ctx.fillText('?', screenX, screenY - size / 2 + 3 * zoom);
        }
    }

    // Clear sprite cache
    clearCache() {
        this.spriteCache.clear();
    }
}
