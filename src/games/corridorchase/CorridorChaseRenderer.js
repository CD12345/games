// Corridor Chase Renderer - Drawing logic

import { CORRIDOR_CONFIG } from './config.js';
import { getValidMoves } from './PathValidator.js';

export class CorridorChaseRenderer {
    constructor(canvas) {
        this.canvas = canvas;

        // Colors
        this.colors = {
            background: '#1a1a2e',
            gridBorder: '#444466',
            cellBg: '#2a2a3e',

            p1: '#4a9eff',        // Blue for player 1
            p2: '#ff4a6e',        // Red for player 2

            wall: '#6b6b8b',
            wallBorder: '#4a4a6a',

            preview: 'rgba(255, 255, 255, 0.3)',
            previewValid: 'rgba(74, 222, 128, 0.4)',
            previewInvalid: 'rgba(255, 74, 110, 0.4)',

            validMove: 'rgba(74, 222, 128, 0.2)',

            text: '#ffffff',
            textShadow: 'rgba(0, 0, 0, 0.5)'
        };

        // Layout calculations (updated in render)
        this.cellSize = 0;
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;
    }

    /**
     * Main render function
     */
    render(ctx, state, playerNumber, previewData, confirmedPreview = false) {
        // Calculate layout
        this.calculateLayout(ctx);

        // Clear canvas
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw grid
        this.drawGrid(ctx, state);

        // Draw walls
        this.drawWalls(ctx, state);

        // Draw valid moves (if player's turn)
        const playerId = playerNumber === 1 ? 'p1' : 'p2';
        if (state.phase === 'playing' && state.currentTurn === playerId) {
            this.drawValidMoves(ctx, state, playerId);
        }

        // Draw preview
        if (previewData) {
            this.drawPreview(ctx, previewData, confirmedPreview);
        }

        // Draw pawns
        this.drawPawn(ctx, state.pawns.p1, 'p1', state.playerNames.p1);
        this.drawPawn(ctx, state.pawns.p2, 'p2', state.playerNames.p2);

        // Draw UI
        this.drawUI(ctx, state, playerNumber, confirmedPreview);

        // Draw game over overlay
        if (state.phase === 'gameover') {
            this.drawGameOver(ctx, state, playerNumber);
        }

        // Draw countdown
        if (state.phase === 'countdown') {
            this.drawCountdown(ctx);
        }
    }

    /**
     * Calculate layout based on canvas size
     */
    calculateLayout(ctx) {
        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;
        const gridSize = CORRIDOR_CONFIG.gridSize;

        // Calculate cell size (with padding)
        const padding = 40;
        const availableWidth = canvasWidth - padding * 2;
        const availableHeight = canvasHeight - padding * 2 - 80; // Extra space for UI

        this.cellSize = Math.min(
            availableWidth / gridSize,
            availableHeight / gridSize
        );

        // Center the grid
        const gridWidth = this.cellSize * gridSize;
        const gridHeight = this.cellSize * gridSize;
        this.gridOffsetX = (canvasWidth - gridWidth) / 2;
        this.gridOffsetY = (canvasHeight - gridHeight) / 2 + 40; // Offset down for turn indicator
    }

    /**
     * Draw the grid
     */
    drawGrid(ctx, state) {
        const gridSize = CORRIDOR_CONFIG.gridSize;

        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const px = this.gridOffsetX + x * this.cellSize;
                const py = this.gridOffsetY + y * this.cellSize;

                // Cell background
                ctx.fillStyle = this.colors.cellBg;

                // Highlight goal rows
                if (y === CORRIDOR_CONFIG.goalRows.p1) {
                    ctx.fillStyle = this.colors.p1 + '33'; // p1 goal row with alpha
                } else if (y === CORRIDOR_CONFIG.goalRows.p2) {
                    ctx.fillStyle = this.colors.p2 + '33'; // p2 goal row with alpha
                }

                ctx.fillRect(px, py, this.cellSize, this.cellSize);

                // Cell border
                ctx.strokeStyle = this.colors.gridBorder;
                ctx.lineWidth = 1;
                ctx.strokeRect(px, py, this.cellSize, this.cellSize);
            }
        }
    }

    /**
     * Draw walls
     */
    drawWalls(ctx, state) {
        const wallThickness = this.cellSize * 0.2;

        for (const wall of state.walls) {
            const px = this.gridOffsetX + wall.x * this.cellSize;
            const py = this.gridOffsetY + wall.y * this.cellSize;

            ctx.fillStyle = this.colors.wall;
            ctx.strokeStyle = this.colors.wallBorder;
            ctx.lineWidth = 2;

            if (wall.orientation === 'h') {
                // Horizontal wall (blocks vertical movement)
                // Spans 2 columns, positioned between rows
                const wallX = px;
                const wallY = py + this.cellSize - wallThickness / 2;
                const wallWidth = this.cellSize * 2;

                ctx.fillRect(wallX, wallY, wallWidth, wallThickness);
                ctx.strokeRect(wallX, wallY, wallWidth, wallThickness);
            } else {
                // Vertical wall (blocks horizontal movement)
                // Spans 2 rows, positioned between columns
                const wallX = px + this.cellSize - wallThickness / 2;
                const wallY = py;
                const wallHeight = this.cellSize * 2;

                ctx.fillRect(wallX, wallY, wallThickness, wallHeight);
                ctx.strokeRect(wallX, wallY, wallThickness, wallHeight);
            }
        }
    }

    /**
     * Draw valid moves
     */
    drawValidMoves(ctx, state, playerId) {
        const validMoves = getValidMoves(state, playerId);

        ctx.fillStyle = this.colors.validMove;

        for (const move of validMoves) {
            const px = this.gridOffsetX + move.x * this.cellSize;
            const py = this.gridOffsetY + move.y * this.cellSize;
            ctx.fillRect(px, py, this.cellSize, this.cellSize);
        }
    }

    /**
     * Draw preview
     */
    drawPreview(ctx, previewData, confirmedPreview) {
        if (previewData.type === 'move') {
            // Draw move preview
            const px = this.gridOffsetX + previewData.x * this.cellSize;
            const py = this.gridOffsetY + previewData.y * this.cellSize;

            // More opaque if confirmed
            const alpha = confirmedPreview ? 0.6 : 0.4;
            const color = previewData.valid ? `rgba(74, 222, 128, ${alpha})` : `rgba(255, 74, 110, ${alpha})`;
            ctx.fillStyle = color;
            ctx.fillRect(px, py, this.cellSize, this.cellSize);

            // Draw border if confirmed
            if (confirmedPreview) {
                ctx.strokeStyle = previewData.valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(255, 74, 110, 0.9)';
                ctx.lineWidth = 3;
                ctx.strokeRect(px + 1.5, py + 1.5, this.cellSize - 3, this.cellSize - 3);
            }
        } else if (previewData.type === 'wall') {
            // Draw wall preview
            const wallThickness = this.cellSize * 0.2;
            const px = this.gridOffsetX + previewData.x * this.cellSize;
            const py = this.gridOffsetY + previewData.y * this.cellSize;

            // More opaque if confirmed
            const alpha = confirmedPreview ? 0.7 : 0.4;
            const color = previewData.valid ? `rgba(74, 222, 128, ${alpha})` : `rgba(255, 74, 110, ${alpha})`;
            ctx.fillStyle = color;

            if (previewData.orientation === 'h') {
                const wallX = px;
                const wallY = py + this.cellSize - wallThickness / 2;
                const wallWidth = this.cellSize * 2;
                ctx.fillRect(wallX, wallY, wallWidth, wallThickness);

                // Draw border if confirmed
                if (confirmedPreview) {
                    ctx.strokeStyle = previewData.valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(255, 74, 110, 0.9)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(wallX, wallY, wallWidth, wallThickness);
                }
            } else {
                const wallX = px + this.cellSize - wallThickness / 2;
                const wallY = py;
                const wallHeight = this.cellSize * 2;
                ctx.fillRect(wallX, wallY, wallThickness, wallHeight);

                // Draw border if confirmed
                if (confirmedPreview) {
                    ctx.strokeStyle = previewData.valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(255, 74, 110, 0.9)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(wallX, wallY, wallThickness, wallHeight);
                }
            }
        }
    }

    /**
     * Draw pawn
     */
    drawPawn(ctx, position, playerId, playerName) {
        const px = this.gridOffsetX + position.x * this.cellSize + this.cellSize / 2;
        const py = this.gridOffsetY + position.y * this.cellSize + this.cellSize / 2;
        const radius = this.cellSize * 0.3;

        // Pawn circle
        ctx.fillStyle = this.colors[playerId];
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();

        // Pawn border
        ctx.strokeStyle = this.colors.background;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Player name (inside circle)
        ctx.fillStyle = this.colors.text;
        ctx.font = `bold ${Math.floor(this.cellSize * 0.15)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Text shadow
        ctx.shadowColor = this.colors.textShadow;
        ctx.shadowBlur = 4;
        ctx.fillText(playerName, px, py);
        ctx.shadowBlur = 0;
    }

    /**
     * Draw UI elements
     */
    drawUI(ctx, state, playerNumber, confirmedPreview) {
        const playerId = playerNumber === 1 ? 'p1' : 'p2';

        // Turn indicator at top
        ctx.fillStyle = this.colors.text;
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const turnText = state.phase === 'playing'
            ? (state.currentTurn === playerId
                ? "Your Turn"
                : `${state.playerNames[state.currentTurn]}'s Turn`)
            : '';

        if (turnText) {
            ctx.shadowColor = this.colors.textShadow;
            ctx.shadowBlur = 4;
            ctx.fillText(turnText, ctx.canvas.width / 2, 10);
            ctx.shadowBlur = 0;
        }

        // Wall counts
        const wallInfoY = this.gridOffsetY + CORRIDOR_CONFIG.gridSize * this.cellSize + 20;

        ctx.font = '18px sans-serif';
        ctx.textAlign = 'left';

        // P1 walls
        ctx.fillStyle = this.colors.p1;
        const p1WallText = `${state.playerNames.p1}: ${state.wallsRemaining.p1} walls`;
        ctx.fillText(p1WallText, 20, wallInfoY);

        // P2 walls
        ctx.fillStyle = this.colors.p2;
        const p2WallText = `${state.playerNames.p2}: ${state.wallsRemaining.p2} walls`;
        ctx.textAlign = 'right';
        ctx.fillText(p2WallText, ctx.canvas.width - 20, wallInfoY);

        // Action hint (if player's turn)
        if (state.phase === 'playing' && state.currentTurn === playerId) {
            ctx.fillStyle = this.colors.text;
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';

            let hintText;
            if (confirmedPreview) {
                hintText = 'Tap again to confirm • Tap elsewhere to change';
            } else {
                hintText = state.wallsRemaining[playerId] > 0
                    ? 'Tap cell to move • Tap edge for wall • Drag to adjust'
                    : 'Tap cell to move • Drag to adjust';
            }
            ctx.fillText(hintText, ctx.canvas.width / 2, wallInfoY + 30);
        }
    }

    /**
     * Draw game over overlay
     */
    drawGameOver(ctx, state, playerNumber) {
        const playerId = playerNumber === 1 ? 'p1' : 'p2';

        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Winner text
        ctx.fillStyle = this.colors.text;
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const centerY = ctx.canvas.height / 2;

        if (state.forfeitBy) {
            ctx.fillText('Game Over', ctx.canvas.width / 2, centerY - 40);
            ctx.font = '24px sans-serif';
            ctx.fillText(`${state.playerNames[state.forfeitBy]} forfeited`, ctx.canvas.width / 2, centerY + 10);
        } else {
            const winnerName = state.playerNames[state.winner];
            const isYouWinner = state.winner === playerId;

            ctx.fillStyle = this.colors[state.winner];
            ctx.fillText(isYouWinner ? 'You Win!' : `${winnerName} Wins!`, ctx.canvas.width / 2, centerY - 20);
        }

        // Rematch hint
        ctx.fillStyle = this.colors.text;
        ctx.font = '18px sans-serif';
        ctx.fillText('Click "Rematch" button to play again', ctx.canvas.width / 2, centerY + 60);
    }

    /**
     * Draw countdown
     */
    drawCountdown(ctx) {
        ctx.fillStyle = this.colors.text;
        ctx.font = 'bold 72px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor = this.colors.textShadow;
        ctx.shadowBlur = 8;
        ctx.fillText('Get Ready!', ctx.canvas.width / 2, ctx.canvas.height / 2);
        ctx.shadowBlur = 0;
    }

    /**
     * Convert pixel coordinates to grid coordinates
     */
    pixelToGrid(pixelX, pixelY) {
        const gridX = Math.floor((pixelX - this.gridOffsetX) / this.cellSize);
        const gridY = Math.floor((pixelY - this.gridOffsetY) / this.cellSize);

        const gridSize = CORRIDOR_CONFIG.gridSize;
        if (gridX < 0 || gridX >= gridSize || gridY < 0 || gridY >= gridSize) {
            return null;
        }

        return { x: gridX, y: gridY };
    }

    /**
     * Convert pixel coordinates to wall placement
     * Returns wall data if click is near a cell edge, null otherwise
     */
    pixelToWall(pixelX, pixelY) {
        const relX = (pixelX - this.gridOffsetX) % this.cellSize;
        const relY = (pixelY - this.gridOffsetY) % this.cellSize;
        const threshold = this.cellSize * 0.3; // 30% of cell size

        const gridX = Math.floor((pixelX - this.gridOffsetX) / this.cellSize);
        const gridY = Math.floor((pixelY - this.gridOffsetY) / this.cellSize);

        const gridSize = CORRIDOR_CONFIG.gridSize;

        // Check if click is near a cell edge
        if (relX < threshold && gridX > 0) {
            // Near left edge - vertical wall
            return { x: gridX - 1, y: gridY, orientation: 'v' };
        } else if (relX > this.cellSize - threshold && gridX < gridSize - 1) {
            // Near right edge - vertical wall
            return { x: gridX, y: gridY, orientation: 'v' };
        } else if (relY < threshold && gridY > 0) {
            // Near top edge - horizontal wall
            return { x: gridX, y: gridY - 1, orientation: 'h' };
        } else if (relY > this.cellSize - threshold && gridY < gridSize - 1) {
            // Near bottom edge - horizontal wall
            return { x: gridX, y: gridY, orientation: 'h' };
        }

        return null; // Click in center - not wall placement
    }
}
