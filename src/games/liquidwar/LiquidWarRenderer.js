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

        // Calculate scaling to fit grid in canvas
        const scale = Math.min(width / gridWidth, height / gridHeight);
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

        // Draw cursors
        if (state.cursors) {
            this.renderCursors(ctx, state.cursors, gridWidth, gridHeight, playerNumber);
        }

        ctx.restore();

        // Draw UI overlay
        this.renderUI(state, playerNumber);
    }

    renderParticles(ctx, particleGrid, gridWidth, gridHeight) {
        const colors = LIQUID_WAR_CONFIG.colors.teams;

        // Try fast ImageData path first
        if (this.particleCanvas && this.particleCtx) {
            const imageData = this.particleCtx.createImageData(gridWidth, gridHeight);
            const data = imageData.data;

            const p1Color = this.hexToRgb(colors[0]);
            const p2Color = this.hexToRgb(colors[1]);

            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    const i = (y * gridWidth + x) * 4;
                    const particle = particleGrid[y]?.[x];

                    if (particle) {
                        const color = particle.team === 'p1' ? p1Color : p2Color;
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
                        ctx.fillStyle = particle.team === 'p1' ? colors[0] : colors[1];
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }
    }

    renderCursors(ctx, cursors, gridWidth, gridHeight, playerNumber) {
        const radius = LIQUID_WAR_CONFIG.cursor.radius * Math.min(gridWidth, gridHeight);
        const colors = LIQUID_WAR_CONFIG.colors.teams;

        ['p1', 'p2'].forEach((playerId, index) => {
            const cursor = cursors[playerId];
            if (!cursor) return;

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

    renderUI(state, playerNumber) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Draw particle counts
        const counts = state.particleCounts || { p1: 0, p2: 0 };
        const total = counts.p1 + counts.p2 || 1;
        const p1Percent = Math.round((counts.p1 / total) * 100);
        const p2Percent = 100 - p1Percent;

        // Score bar at top
        const barHeight = 20;
        const barY = 10;
        const barPadding = 10;
        const barWidth = width - barPadding * 2;

        // Draw bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barPadding, barY, barWidth, barHeight);

        // Draw P1 portion
        const p1Width = (counts.p1 / total) * barWidth;
        ctx.fillStyle = LIQUID_WAR_CONFIG.colors.teams[0];
        ctx.fillRect(barPadding, barY, p1Width, barHeight);

        // Draw P2 portion
        ctx.fillStyle = LIQUID_WAR_CONFIG.colors.teams[1];
        ctx.fillRect(barPadding + p1Width, barY, barWidth - p1Width, barHeight);

        // Draw counts text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${counts.p1} (${p1Percent}%)`, barPadding + 5, barY + 15);
        ctx.textAlign = 'right';
        ctx.fillText(`(${p2Percent}%) ${counts.p2}`, width - barPadding - 5, barY + 15);

        // Draw player names
        const names = state.playerNames || { p1: 'Player 1', p2: 'Player 2' };
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = LIQUID_WAR_CONFIG.colors.teams[0];
        ctx.fillText(names.p1 + (playerNumber === 1 ? ' (You)' : ''), barPadding, barY + barHeight + 15);
        ctx.textAlign = 'right';
        ctx.fillStyle = LIQUID_WAR_CONFIG.colors.teams[1];
        ctx.fillText((playerNumber === 2 ? '(You) ' : '') + names.p2, width - barPadding, barY + barHeight + 15);

        // Draw phase-specific overlays
        if (state.phase === 'countdown') {
            this.renderCountdown(state);
        } else if (state.phase === 'gameover') {
            this.renderGameOver(state, playerNumber);
        } else if (state.phase === 'playing') {
            // Draw time remaining
            const elapsed = Date.now() - state.startTime;
            const remaining = Math.max(0, LIQUID_WAR_CONFIG.game.maxTime - elapsed);
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

        const elapsed = Date.now() - state.startTime;
        const remaining = LIQUID_WAR_CONFIG.game.countdownTime - elapsed;
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

        // Draw dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Determine winner text
        let winnerText = '';
        let winnerColor = '#FFFFFF';

        if (state.winner === 'tie') {
            winnerText = 'TIE!';
        } else if (state.winner) {
            const winnerNumber = state.winner === 'p1' ? 1 : 2;
            const winnerName = state.playerNames?.[state.winner] || `Player ${winnerNumber}`;

            if (winnerNumber === playerNumber) {
                winnerText = 'YOU WIN!';
            } else {
                winnerText = `${winnerName} WINS!`;
            }

            winnerColor = LIQUID_WAR_CONFIG.colors.teams[winnerNumber - 1];
        }

        // Draw winner text
        ctx.fillStyle = winnerColor;
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(winnerText, width / 2, height / 2 - 20);

        // Draw final counts
        const counts = state.particleCounts || { p1: 0, p2: 0 };
        ctx.font = '20px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${counts.p1} - ${counts.p2}`, width / 2, height / 2 + 20);

        // Draw forfeit notice if applicable
        if (state.forfeitBy) {
            const forfeitName = state.playerNames?.[state.forfeitBy] || `Player ${state.forfeitBy === 'p1' ? 1 : 2}`;
            ctx.font = '14px monospace';
            ctx.fillStyle = '#888888';
            ctx.fillText(`${forfeitName} forfeited`, width / 2, height / 2 + 50);
        }

        ctx.textBaseline = 'alphabetic';
    }
}
