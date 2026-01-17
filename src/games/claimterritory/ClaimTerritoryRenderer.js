/**
 * Claim Territory - Rendering Logic
 *
 * Handles all drawing for the Claim Territory game.
 */

import { CLAIM_TERRITORY_CONFIG } from './config.js';
import { getValidMoves } from './ClaimTerritoryValidator.js';

export class ClaimTerritoryRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.layout = null;
    }

    /**
     * Calculate layout dimensions based on canvas size
     */
    calculateLayout() {
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Reserve space for UI
        const topUIHeight = 80;
        const bottomUIHeight = 100;
        const availableHeight = height - topUIHeight - bottomUIHeight;
        const availableWidth = width - 40; // 20px padding on each side

        // Grid should be square
        const maxSize = Math.min(availableWidth, availableHeight);
        const cellSize = Math.floor(maxSize / 10);
        const gridSize = cellSize * 10;

        const gridOffsetX = (width - gridSize) / 2;
        const gridOffsetY = topUIHeight;

        this.layout = {
            width,
            height,
            topUIHeight,
            bottomUIHeight,
            cellSize,
            gridSize,
            gridOffsetX,
            gridOffsetY
        };

        return this.layout;
    }

    /**
     * Convert pixel coordinates to grid cell
     * Returns { x, y } or null if outside grid
     */
    pixelToGridCell(pixelX, pixelY) {
        if (!this.layout) this.calculateLayout();

        const { gridOffsetX, gridOffsetY, cellSize } = this.layout;

        const gridX = pixelX - gridOffsetX;
        const gridY = pixelY - gridOffsetY;

        if (gridX < 0 || gridY < 0) return null;

        const x = Math.floor(gridX / cellSize);
        const y = Math.floor(gridY / cellSize);

        if (x < 0 || x >= 10 || y < 0 || y >= 10) return null;

        return { x, y };
    }

    /**
     * Main render function
     */
    render(state, hoveredCell, confirmedSelection, playerId) {
        const ctx = this.ctx;
        const layout = this.calculateLayout();

        // Clear canvas
        ctx.fillStyle = CLAIM_TERRITORY_CONFIG.colors.background;
        ctx.fillRect(0, 0, layout.width, layout.height);

        // Draw UI elements
        this.drawTopUI(state);
        this.drawGrid(state, hoveredCell, confirmedSelection, playerId);
        this.drawBottomUI(state, playerId);

        if (state.phase === 'countdown') {
            this.drawCountdown(state);
        }

        if (state.phase === 'gameover') {
            this.drawGameOver(state);
        }
    }

    /**
     * Draw top UI (turn indicator and cell counts)
     */
    drawTopUI(state) {
        const ctx = this.ctx;
        const { width } = this.layout;

        ctx.fillStyle = CLAIM_TERRITORY_CONFIG.colors.text;
        ctx.textAlign = 'center';

        // Turn indicator
        ctx.font = 'bold 20px Arial';
        const turnText = state.phase === 'playing'
            ? `${state.playerNames[state.currentTurn]}'s Turn`
            : 'Get Ready!';
        ctx.fillText(turnText, width / 2, 30);

        // Cell counts
        ctx.font = '16px Arial';
        const countsText = `${state.playerNames.p1}: ${state.cellCounts.p1} cells  |  ${state.playerNames.p2}: ${state.cellCounts.p2} cells`;
        ctx.fillText(countsText, width / 2, 55);
    }

    /**
     * Draw grid
     */
    drawGrid(state, hoveredCell, confirmedSelection, playerId) {
        const ctx = this.ctx;
        const { gridOffsetX, gridOffsetY, cellSize } = this.layout;

        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 10; x++) {
                const px = gridOffsetX + x * cellSize;
                const py = gridOffsetY + y * cellSize;

                // Determine cell color based on ownership
                let fillColor;
                const owner = state.grid[y][x];
                if (owner === 'p1') {
                    fillColor = CLAIM_TERRITORY_CONFIG.colors.p1;
                } else if (owner === 'p2') {
                    fillColor = CLAIM_TERRITORY_CONFIG.colors.p2;
                } else {
                    fillColor = CLAIM_TERRITORY_CONFIG.colors.neutral;
                }

                ctx.fillStyle = fillColor;
                ctx.fillRect(px, py, cellSize, cellSize);

                // Cell border
                ctx.strokeStyle = CLAIM_TERRITORY_CONFIG.colors.gridLine;
                ctx.lineWidth = 1;
                ctx.strokeRect(px, py, cellSize, cellSize);

                // Highlight hovered valid move (only on current player's turn)
                if (state.phase === 'playing' &&
                    state.currentTurn === playerId &&
                    hoveredCell && hoveredCell.x === x && hoveredCell.y === y &&
                    state.grid[y][x] === null) {
                    ctx.fillStyle = CLAIM_TERRITORY_CONFIG.colors.validMove;
                    ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
                }

                // Highlight confirmed selection
                if (confirmedSelection && confirmedSelection.x === x && confirmedSelection.y === y) {
                    const color = confirmedSelection.valid
                        ? CLAIM_TERRITORY_CONFIG.colors.preview
                        : CLAIM_TERRITORY_CONFIG.colors.previewInvalid;
                    ctx.fillStyle = color;
                    ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
                }
            }
        }
    }

    /**
     * Draw bottom UI (action hints)
     */
    drawBottomUI(state, playerId) {
        const ctx = this.ctx;
        const { width, height } = this.layout;

        if (state.phase !== 'playing') return;

        ctx.fillStyle = CLAIM_TERRITORY_CONFIG.colors.text;
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';

        if (state.currentTurn === playerId) {
            ctx.fillText('Tap to claim • Tap again to confirm', width / 2, height - 60);
            ctx.fillText('Tap elsewhere to change selection', width / 2, height - 40);
        } else {
            ctx.fillText('Waiting for opponent...', width / 2, height - 50);
        }
    }

    /**
     * Draw countdown overlay
     */
    drawCountdown(state) {
        if (!state.countdownStartTime) return;

        const ctx = this.ctx;
        const { width, height } = this.layout;
        const elapsed = Date.now() - state.countdownStartTime;
        const remaining = Math.max(0, CLAIM_TERRITORY_CONFIG.countdownDuration - elapsed);
        const seconds = Math.ceil(remaining / 1000);

        if (seconds === 0) return;

        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Countdown number
        ctx.fillStyle = CLAIM_TERRITORY_CONFIG.colors.text;
        ctx.font = 'bold 72px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(seconds.toString(), width / 2, height / 2);

        ctx.textBaseline = 'alphabetic';
    }

    /**
     * Draw game over overlay
     */
    drawGameOver(state) {
        const ctx = this.ctx;
        const { width, height } = this.layout;

        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, width, height);

        ctx.textAlign = 'center';
        ctx.fillStyle = CLAIM_TERRITORY_CONFIG.colors.text;

        // Winner message
        if (state.forfeitBy) {
            const winner = state.forfeitBy === 'p1' ? state.playerNames.p2 : state.playerNames.p1;
            ctx.font = 'bold 36px Arial';
            ctx.fillText(`${winner} wins!`, width / 2, height / 2 - 40);
            ctx.font = '20px Arial';
            ctx.fillText('Opponent forfeited', width / 2, height / 2);
        } else if (state.winner) {
            const winnerName = state.playerNames[state.winner];
            ctx.font = 'bold 36px Arial';
            ctx.fillText(`${winnerName} wins!`, width / 2, height / 2 - 60);

            // Show final scores
            ctx.font = '20px Arial';
            const margin = Math.abs(state.cellCounts.p1 - state.cellCounts.p2);
            ctx.fillText(
                `${state.playerNames.p1}: ${state.cellCounts.p1} cells  |  ${state.playerNames.p2}: ${state.cellCounts.p2} cells`,
                width / 2,
                height / 2 - 10
            );
            ctx.fillText(`Margin of victory: ${margin} cells`, width / 2, height / 2 + 20);
        } else {
            // Draw
            ctx.font = 'bold 36px Arial';
            ctx.fillText("It's a draw!", width / 2, height / 2 - 40);
            ctx.font = '20px Arial';
            ctx.fillText(
                `Both players: ${state.cellCounts.p1} cells`,
                width / 2,
                height / 2
            );
        }

        // Rematch instruction
        ctx.font = '18px Arial';
        ctx.fillText('Click "Return to Menu" or wait for rematch', width / 2, height / 2 + 70);
    }
}
