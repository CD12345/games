// Liquid War Renderer - Handles all drawing

import { LIQUID_WAR_CONFIG } from './config.js';

export class LiquidWarRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Cache for wall rendering
        this.wallImageData = null;
        this.wallCanvas = null;
        this.wallCtx = null;
        this.cachedGridWidth = 0;
        this.cachedGridHeight = 0;

        // Off-screen canvas for particles
        this.particleCanvas = null;
        this.particleCtx = null;
    }

    setMap(walls, gridWidth, gridHeight) {
        // Create cached wall image
        this.cachedGridWidth = gridWidth;
        this.cachedGridHeight = gridHeight;

        this.wallCanvas = document.createElement('canvas');
        this.wallCanvas.width = gridWidth;
        this.wallCanvas.height = gridHeight;
        this.wallCtx = this.wallCanvas.getContext('2d');

        // Draw walls to cache
        const imageData = this.wallCtx.createImageData(gridWidth, gridHeight);
        const data = imageData.data;

        const wallColor = this.hexToRgb(LIQUID_WAR_CONFIG.colors.wall);
        const floorColor = this.hexToRgb(LIQUID_WAR_CONFIG.colors.floor);

        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const i = (y * gridWidth + x) * 4;
                const isWall = walls[y][x] === 1;
                const color = isWall ? wallColor : floorColor;

                data[i] = color.r;
                data[i + 1] = color.g;
                data[i + 2] = color.b;
                data[i + 3] = 255;
            }
        }

        this.wallCtx.putImageData(imageData, 0, 0);

        // Create particle canvas
        this.particleCanvas = document.createElement('canvas');
        this.particleCanvas.width = gridWidth;
        this.particleCanvas.height = gridHeight;
        this.particleCtx = this.particleCanvas.getContext('2d');
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        } : { r: 0, g: 0, b: 0 };
    }

    // Fallback wall rendering when cache isn't available
    renderWallsDirect(ctx, walls, gridWidth, gridHeight) {
        const wallColor = LIQUID_WAR_CONFIG.colors.wall;
        const floorColor = LIQUID_WAR_CONFIG.colors.floor;

        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const isWall = walls[y]?.[x] === 1;
                ctx.fillStyle = isWall ? wallColor : floorColor;
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    render(state, particleGrid, walls, gridWidth, gridHeight, playerNumber) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Safety check for canvas size
        if (width <= 0 || height <= 0) {
            return;
        }

        // Clear canvas
        ctx.fillStyle = LIQUID_WAR_CONFIG.colors.floor;
        ctx.fillRect(0, 0, width, height);

        // Calculate scaling with margin for cursor "pulling" space
        const margin = LIQUID_WAR_CONFIG.display?.mapMargin || 0.1;
        const availableWidth = width * (1 - margin * 2);
        const availableHeight = height * (1 - margin * 2);
        const scale = Math.min(availableWidth / gridWidth, availableHeight / gridHeight);
        if (scale <= 0 || !isFinite(scale)) {
            return;
        }
        const offsetX = (width - gridWidth * scale) / 2;
        const offsetY = (height - gridHeight * scale) / 2;

        // Draw game area
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // Draw walls (from cache) or fallback to direct rendering
        if (this.wallCanvas) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(this.wallCanvas, 0, 0);
        } else if (walls) {
            // Fallback: render walls directly if cache not available
            this.renderWallsDirect(ctx, walls, gridWidth, gridHeight);
        }

        // Draw particles
        if (particleGrid) {
            this.renderParticles(ctx, particleGrid, gridWidth, gridHeight);
        }

        ctx.restore();

        // Draw cursors in viewport space (so they can appear in margins)
        if (state.cursors) {
            this.renderCursorsViewport(ctx, state.cursors, width, height, gridWidth, gridHeight, scale, offsetX, offsetY, playerNumber);
        }

        // Draw UI overlay
        this.renderUI(state, playerNumber);
    }

    renderParticles(ctx, particleGrid, gridWidth, gridHeight) {
        const colors = LIQUID_WAR_CONFIG.colors.teams;

        // Pre-parse all team colors
        const teamColors = {};
        for (let i = 0; i < colors.length; i++) {
            teamColors[`p${i + 1}`] = this.hexToRgb(colors[i]);
        }

        // Try fast ImageData path first
        if (this.particleCanvas && this.particleCtx) {
            const imageData = this.particleCtx.createImageData(gridWidth, gridHeight);
            const data = imageData.data;

            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    const i = (y * gridWidth + x) * 4;
                    const particle = particleGrid[y]?.[x];

                    if (particle && teamColors[particle.team]) {
                        const color = teamColors[particle.team];
                        data[i] = color.r;
                        data[i + 1] = color.g;
                        data[i + 2] = color.b;
                        data[i + 3] = 255;
                    } else {
                        // Transparent for non-particles
                        data[i + 3] = 0;
                    }
                }
            }

            this.particleCtx.putImageData(imageData, 0, 0);
            ctx.drawImage(this.particleCanvas, 0, 0);
        } else {
            // Fallback: render particles directly (slower but works without offscreen canvas)
            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    const particle = particleGrid[y]?.[x];
                    if (particle) {
                        const teamIndex = parseInt(particle.team.slice(1)) - 1;
                        ctx.fillStyle = colors[teamIndex] || colors[0];
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }
    }

    renderCursors(ctx, cursors, gridWidth, gridHeight, playerNumber) {
        const radius = LIQUID_WAR_CONFIG.cursor.radius * Math.min(gridWidth, gridHeight);
        const colors = LIQUID_WAR_CONFIG.colors.teams;

        // Render cursors for all players
        Object.keys(cursors).forEach((playerId) => {
            const cursor = cursors[playerId];
            if (!cursor) return;

            const index = parseInt(playerId.slice(1)) - 1;
            const x = cursor.x * gridWidth;
            const y = cursor.y * gridHeight;

            // Draw cursor circle
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = colors[index];
            ctx.lineWidth = 2 / Math.min(gridWidth, gridHeight) * 10;
            ctx.stroke();

            // Draw crosshair
            const crossSize = radius * 0.7;
            ctx.beginPath();
            ctx.moveTo(x - crossSize, y);
            ctx.lineTo(x + crossSize, y);
            ctx.moveTo(x, y - crossSize);
            ctx.lineTo(x, y + crossSize);
            ctx.strokeStyle = colors[index];
            ctx.lineWidth = 1 / Math.min(gridWidth, gridHeight) * 10;
            ctx.stroke();

            // Draw "You" indicator
            const isYou = (playerId === 'p1' && playerNumber === 1) ||
                          (playerId === 'p2' && playerNumber === 2);
            if (isYou) {
                ctx.beginPath();
                ctx.arc(x, y, radius * 1.3, 0, Math.PI * 2);
                ctx.strokeStyle = LIQUID_WAR_CONFIG.colors.cursor;
                ctx.lineWidth = 1 / Math.min(gridWidth, gridHeight) * 10;
                ctx.stroke();
            }
        });
    }

    renderCursorsViewport(ctx, cursors, viewWidth, viewHeight, gridWidth, gridHeight, scale, offsetX, offsetY, playerNumber) {
        // Draw cursors in viewport space - allows them to appear in margins
        const colors = LIQUID_WAR_CONFIG.colors.teams;
        const radius = 12; // Fixed pixel radius in viewport space

        Object.keys(cursors).forEach((playerId) => {
            const cursor = cursors[playerId];
            if (!cursor) return;

            const index = parseInt(playerId.slice(1)) - 1;

            // Convert normalized cursor position (0-1) to viewport coordinates
            // Cursor can go into margins for "pulling" effect
            const x = offsetX + cursor.x * gridWidth * scale;
            const y = offsetY + cursor.y * gridHeight * scale;

            // Draw cursor circle
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = colors[index % colors.length];
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw crosshair
            const crossSize = radius * 0.7;
            ctx.beginPath();
            ctx.moveTo(x - crossSize, y);
            ctx.lineTo(x + crossSize, y);
            ctx.moveTo(x, y - crossSize);
            ctx.lineTo(x, y + crossSize);
            ctx.strokeStyle = colors[index % colors.length];
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw "You" indicator
            const isYou = playerId === `p${playerNumber}`;
            if (isYou) {
                ctx.beginPath();
                ctx.arc(x, y, radius * 1.4, 0, Math.PI * 2);
                ctx.strokeStyle = LIQUID_WAR_CONFIG.colors.cursor;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        });
    }

    renderUI(state, playerNumber) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const colors = LIQUID_WAR_CONFIG.colors.teams;

        // Get player count and particle counts
        const totalPlayers = state.playerCount || 2;
        const counts = state.particleCounts || {};
        let totalParticles = 0;
        for (let i = 1; i <= totalPlayers; i++) {
            totalParticles += counts[`p${i}`] || 0;
        }
        if (totalParticles === 0) totalParticles = 1;

        // Score bar at top
        const barHeight = 20;
        const barY = 10;
        const barPadding = 10;
        const barWidth = width - barPadding * 2;

        // Draw bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barPadding, barY, barWidth, barHeight);

        // Draw each player's portion of the bar
        let currentX = barPadding;
        for (let i = 1; i <= totalPlayers; i++) {
            const pid = `p${i}`;
            const count = counts[pid] || 0;
            const segmentWidth = (count / totalParticles) * barWidth;

            ctx.fillStyle = colors[(i - 1) % colors.length];
            ctx.fillRect(currentX, barY, segmentWidth, barHeight);
            currentX += segmentWidth;
        }

        // Draw player names and counts below the bar
        const names = state.playerNames || {};
        const nameY = barY + barHeight + 15;
        const nameSpacing = width / totalPlayers;

        ctx.font = '11px monospace';
        for (let i = 1; i <= totalPlayers; i++) {
            const pid = `p${i}`;
            const count = counts[pid] || 0;
            const percent = Math.round((count / totalParticles) * 100);
            const name = names[pid] || `Player ${i}`;
            const isYou = i === playerNumber;
            const isAI = state.aiPlayers?.[pid];

            ctx.fillStyle = colors[(i - 1) % colors.length];
            ctx.textAlign = 'center';

            const displayName = isYou ? `${name} (You)` : name;
            const x = barPadding + nameSpacing * (i - 0.5);

            ctx.fillText(`${displayName}`, x, nameY);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(`${count} (${percent}%)`, x, nameY + 12);
        }

        // Draw phase-specific overlays
        if (state.phase === 'countdown') {
            this.renderCountdown(state);
        } else if (state.phase === 'gameover') {
            this.renderGameOver(state, playerNumber);
        } else if (state.phase === 'playing') {
            // Draw time remaining
            const remaining = Math.max(0, LIQUID_WAR_CONFIG.game.maxTime - state.elapsed);
            const seconds = Math.ceil(remaining / 1000);
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;

            ctx.fillStyle = '#FFFFFF';
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(
                `${minutes}:${secs.toString().padStart(2, '0')}`,
                width / 2,
                barY + 15
            );
        }
    }

    renderCountdown(state) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        const remaining = LIQUID_WAR_CONFIG.game.countdownTime - state.elapsed;
        const seconds = Math.ceil(remaining / 1000);

        // Draw dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, width, height);

        // Draw countdown number
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 72px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(seconds > 0 ? seconds.toString() : 'GO!', width / 2, height / 2);

        ctx.textBaseline = 'alphabetic';
    }

    renderGameOver(state, playerNumber) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const colors = LIQUID_WAR_CONFIG.colors.teams;

        // Draw dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Determine winner text
        let winnerText = '';
        let winnerColor = '#FFFFFF';

        if (state.winner === 'tie') {
            winnerText = 'TIE!';
        } else if (state.winner) {
            const winnerNumber = parseInt(state.winner.slice(1));
            const winnerName = state.playerNames?.[state.winner] || `Player ${winnerNumber}`;

            if (winnerNumber === playerNumber) {
                winnerText = 'YOU WIN!';
            } else {
                winnerText = `${winnerName} WINS!`;
            }

            winnerColor = colors[(winnerNumber - 1) % colors.length];
        }

        // Draw winner text
        ctx.fillStyle = winnerColor;
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(winnerText, width / 2, height / 2 - 30);

        // Draw final standings
        const totalPlayers = state.playerCount || 2;
        const counts = state.particleCounts || {};
        const names = state.playerNames || {};

        // Build sorted standings
        const standings = [];
        for (let i = 1; i <= totalPlayers; i++) {
            const pid = `p${i}`;
            standings.push({
                pid,
                name: names[pid] || `Player ${i}`,
                count: counts[pid] || 0,
                color: colors[(i - 1) % colors.length],
            });
        }
        standings.sort((a, b) => b.count - a.count);

        // Draw standings
        ctx.font = '14px monospace';
        const standingsY = height / 2 + 10;
        standings.forEach((entry, index) => {
            const y = standingsY + index * 18;
            ctx.fillStyle = entry.color;
            ctx.textAlign = 'right';
            ctx.fillText(`${index + 1}.`, width / 2 - 60, y);
            ctx.textAlign = 'left';
            ctx.fillText(`${entry.name}: ${entry.count}`, width / 2 - 50, y);
        });

        // Draw forfeit notice if applicable
        if (state.forfeitBy) {
            const forfeitNumber = parseInt(state.forfeitBy.slice(1));
            const forfeitName = state.playerNames?.[state.forfeitBy] || `Player ${forfeitNumber}`;
            ctx.font = '14px monospace';
            ctx.fillStyle = '#888888';
            ctx.textAlign = 'center';
            ctx.fillText(`${forfeitName} forfeited`, width / 2, standingsY + totalPlayers * 18 + 10);
        }

        ctx.textBaseline = 'alphabetic';
    }
}
