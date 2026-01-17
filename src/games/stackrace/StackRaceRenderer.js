/**
 * Stack Race - Rendering Logic
 *
 * Handles isometric 3D rendering for the pyramid stacking game.
 */

import { STACK_RACE_CONFIG } from './config.js';

export class StackRaceRenderer {
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
        const topUIHeight = 100;
        const bottomUIHeight = 140;
        const availableHeight = height - topUIHeight - bottomUIHeight;

        // Isometric cell sizing (scaled to fit)
        const baseSize = Math.min(width / 10, availableHeight / 10);
        const cellWidth = baseSize;
        const cellHeight = baseSize / 2;  // 2:1 ratio
        const stackHeight = baseSize * 0.6;

        // Center the pyramid
        const gridCenterX = width / 2;
        const gridCenterY = topUIHeight + availableHeight / 2 + (2.5 * stackHeight);

        this.layout = {
            width,
            height,
            topUIHeight,
            bottomUIHeight,
            cellWidth,
            cellHeight,
            stackHeight,
            gridCenterX,
            gridCenterY
        };

        return this.layout;
    }

    /**
     * Convert 3D grid position to 2D screen coordinates (isometric projection)
     */
    calculateIsometricPosition(level, row, col) {
        if (!this.layout) this.calculateLayout();

        const { cellWidth, cellHeight, stackHeight, gridCenterX, gridCenterY } = this.layout;

        // Isometric projection formulas
        const isoX = (col - row) * (cellWidth / 2);
        const isoY = (col + row) * (cellHeight / 4);

        const screenX = gridCenterX + isoX;
        const screenY = gridCenterY + isoY - (level * stackHeight);

        return { x: screenX, y: screenY };
    }

    /**
     * Convert screen coordinates to approximate grid position
     * Note: This is approximate due to isometric projection complexity
     */
    screenToGridPosition(pixelX, pixelY) {
        if (!this.layout) this.calculateLayout();

        const { gridCenterX, gridCenterY, cellWidth, cellHeight, stackHeight } = this.layout;

        // Start from level 4 (top) and work down to find best match
        let bestMatch = null;
        let minDistance = Infinity;

        for (let level = 4; level >= 0; level--) {
            const gridSize = STACK_RACE_CONFIG.levelSizes[level];

            for (let row = 0; row < gridSize; row++) {
                for (let col = 0; col < gridSize; col++) {
                    const pos = this.calculateIsometricPosition(level, row, col);

                    // Check if click is within the isometric cell bounds
                    const dx = pixelX - pos.x;
                    const dy = pixelY - pos.y;

                    // Isometric cell is a diamond shape
                    // Simplified: check if within rectangular bounds
                    if (Math.abs(dx) < cellWidth / 2 && Math.abs(dy) < cellHeight) {
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance < minDistance) {
                            minDistance = distance;
                            bestMatch = { level, row, col };
                        }
                    }
                }
            }
        }

        return bestMatch;
    }

    /**
     * Draw an isometric piece (diamond shape)
     */
    drawIsometricPiece(x, y, width, height, color, selected = false) {
        const ctx = this.ctx;

        // Diamond points
        const top = [x, y];
        const right = [x + width / 2, y + height / 2];
        const bottom = [x, y + height];
        const left = [x - width / 2, y + height / 2];

        // Fill
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(top[0], top[1]);
        ctx.lineTo(right[0], right[1]);
        ctx.lineTo(bottom[0], bottom[1]);
        ctx.lineTo(left[0], left[1]);
        ctx.closePath();
        ctx.fill();

        // Border
        ctx.strokeStyle = selected ? '#fff' : 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = selected ? 3 : 2;
        ctx.stroke();

        // Add 3D effect with top face
        ctx.fillStyle = selected ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(top[0], top[1]);
        ctx.lineTo(right[0], right[1]);
        ctx.lineTo(x, y + height / 4);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Main render function
     */
    render(state, hoveredPosition, confirmedSelection, selectedForRetrieval, playerId) {
        const ctx = this.ctx;
        const layout = this.calculateLayout();

        // Clear canvas
        ctx.fillStyle = STACK_RACE_CONFIG.colors.background;
        ctx.fillRect(0, 0, layout.width, layout.height);

        // Draw UI
        this.drawTopUI(state);
        this.drawBottomUI(state, playerId);

        // Draw pyramid (back to front, bottom to top)
        this.drawPyramid(state, hoveredPosition, confirmedSelection, selectedForRetrieval, playerId);

        // Draw countdown overlay
        if (state.phase === 'countdown') {
            this.drawCountdown(state);
        }

        // Draw game over overlay
        if (state.phase === 'gameover') {
            this.drawGameOver(state);
        }
    }

    /**
     * Draw the pyramid with proper occlusion (back-to-front, bottom-to-top)
     */
    drawPyramid(state, hoveredPosition, confirmedSelection, selectedForRetrieval, playerId) {
        const { cellWidth, cellHeight } = this.layout;

        // Draw each level from bottom to top
        for (let level = 0; level < 5; level++) {
            const grid = state.grid[level];
            const gridSize = grid.length;

            // Draw diagonal rows (sum of row + col) for proper z-ordering
            for (let sum = 0; sum < gridSize * 2 - 1; sum++) {
                for (let row = 0; row < gridSize; row++) {
                    const col = sum - row;
                    if (col >= 0 && col < gridSize) {
                        const piece = grid[row][col];
                        const pos = this.calculateIsometricPosition(level, row, col);

                        // Determine color
                        let color = STACK_RACE_CONFIG.colors.neutral;
                        let isHovered = false;
                        let isConfirmed = false;
                        let isRetrievalOption = false;

                        if (piece) {
                            color = piece.owner === 'p1'
                                ? STACK_RACE_CONFIG.colors.p1
                                : STACK_RACE_CONFIG.colors.p2;

                            // Check if selected for retrieval
                            if (selectedForRetrieval && selectedForRetrieval.some(
                                s => s.level === level && s.row === row && s.col === col
                            )) {
                                isRetrievalOption = true;
                            }
                        }

                        // Check hover
                        if (hoveredPosition && hoveredPosition.level === level &&
                            hoveredPosition.row === row && hoveredPosition.col === col) {
                            isHovered = true;
                        }

                        // Check confirmed
                        if (confirmedSelection && confirmedSelection.level === level &&
                            confirmedSelection.row === row && confirmedSelection.col === col) {
                            isConfirmed = true;
                        }

                        // Draw piece or empty slot
                        if (piece || isHovered || isConfirmed) {
                            let drawColor = color;

                            if (isRetrievalOption) {
                                drawColor = STACK_RACE_CONFIG.colors.retrieval;
                            } else if (isHovered && state.phase === 'placement' &&
                                      state.currentTurn === playerId && !piece) {
                                drawColor = STACK_RACE_CONFIG.colors.validMove;
                            } else if (isConfirmed) {
                                drawColor = STACK_RACE_CONFIG.colors.preview;
                            }

                            this.drawIsometricPiece(
                                pos.x,
                                pos.y,
                                cellWidth,
                                cellHeight,
                                drawColor,
                                isConfirmed || isRetrievalOption
                            );
                        }
                    }
                }
            }
        }
    }

    /**
     * Draw top UI (turn indicator and piece counts)
     */
    drawTopUI(state) {
        const ctx = this.ctx;
        const { width } = this.layout;

        ctx.fillStyle = STACK_RACE_CONFIG.colors.text;
        ctx.textAlign = 'center';

        // Turn indicator
        ctx.font = 'bold 20px Arial';
        let turnText = 'Get Ready!';
        if (state.phase === 'placement') {
            turnText = `${state.playerNames[state.currentTurn]}'s Turn - Place Piece`;
        } else if (state.phase === 'select_retrieval') {
            turnText = `${state.playerNames[state.currentTurn]}'s Turn - Retrieve Pieces`;
        }
        ctx.fillText(turnText, width / 2, 30);

        // Piece counts
        ctx.font = '16px Arial';
        const countsText = `${state.playerNames.p1}: ${state.pieceCounts.p1} pieces  |  ${state.playerNames.p2}: ${state.pieceCounts.p2} pieces`;
        ctx.fillText(countsText, width / 2, 55);

        // Turn number
        ctx.font = '14px Arial';
        ctx.fillText(`Turn ${state.turnNumber}`, width / 2, 75);
    }

    /**
     * Draw bottom UI (instructions)
     */
    drawBottomUI(state, playerId) {
        const ctx = this.ctx;
        const { width, height } = this.layout;

        if (state.phase !== 'placement' && state.phase !== 'select_retrieval') return;

        ctx.fillStyle = STACK_RACE_CONFIG.colors.text;
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';

        const baseY = height - 100;

        if (state.currentTurn === playerId) {
            if (state.phase === 'placement') {
                ctx.fillText('Tap a position to place your piece', width / 2, baseY);
                ctx.fillText('Tap again to confirm', width / 2, baseY + 20);
                ctx.fillText('Stack on 2x2 support areas to build up', width / 2, baseY + 40);
            } else if (state.phase === 'select_retrieval') {
                ctx.fillText('You created a 2x2 pattern!', width / 2, baseY);
                ctx.fillText('Tap pieces to retrieve (0-2 pieces)', width / 2, baseY + 20);
                ctx.fillText('Tap "Done" when ready', width / 2, baseY + 40);
            }
        } else {
            ctx.fillText('Waiting for opponent...', width / 2, baseY + 20);
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
        const remaining = Math.max(0, STACK_RACE_CONFIG.countdownDuration - elapsed);
        const seconds = Math.ceil(remaining / 1000);

        if (seconds === 0) return;

        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Countdown number
        ctx.fillStyle = STACK_RACE_CONFIG.colors.text;
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
        ctx.fillStyle = STACK_RACE_CONFIG.colors.text;

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

            // Show piece counts
            ctx.font = '20px Arial';
            ctx.fillText(
                `${state.playerNames.p1}: ${state.pieceCounts.p1} pieces left`,
                width / 2,
                height / 2 - 10
            );
            ctx.fillText(
                `${state.playerNames.p2}: ${state.pieceCounts.p2} pieces left`,
                width / 2,
                height / 2 + 20
            );
        }

        // Rematch instruction
        ctx.font = '18px Arial';
        ctx.fillText('Click "Return to Menu" or wait for rematch', width / 2, height / 2 + 70);
    }
}
