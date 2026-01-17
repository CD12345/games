/**
 * Slide Puzzle Battle - Rendering Logic
 */

import { SLIDE_PUZZLE_CONFIG } from './config.js';
import { isOuterRingCell, getValidDirections } from './SlidePuzzleValidator.js';

export class SlidePuzzleRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.layout = null;
    }

    /**
     * Calculate layout based on canvas size
     */
    calculateLayout() {
        const width = this.canvas.width;
        const height = this.canvas.height;

        const topUIHeight = 80;
        const bottomUIHeight = 120;
        const padding = 20;

        const availableHeight = height - topUIHeight - bottomUIHeight;
        const availableWidth = width - (padding * 2);

        const maxSize = Math.min(availableWidth, availableHeight);
        const cellSize = Math.floor(maxSize / SLIDE_PUZZLE_CONFIG.gridSize);
        const gridSize = cellSize * SLIDE_PUZZLE_CONFIG.gridSize;

        const gridOffsetX = (width - gridSize) / 2;
        const gridOffsetY = topUIHeight;

        return {
            width,
            height,
            topUIHeight,
            bottomUIHeight,
            cellSize,
            gridSize,
            gridOffsetX,
            gridOffsetY,
            arrowOffset: cellSize * 0.7,
            arrowSize: cellSize * 0.3
        };
    }

    /**
     * Convert pixel coordinates to grid cell
     */
    pixelToGridCell(pixelX, pixelY) {
        if (!this.layout) {
            this.layout = this.calculateLayout();
        }

        const { gridOffsetX, gridOffsetY, cellSize } = this.layout;

        const gridX = pixelX - gridOffsetX;
        const gridY = pixelY - gridOffsetY;

        if (gridX < 0 || gridY < 0) {
            return null;
        }

        const col = Math.floor(gridX / cellSize);
        const row = Math.floor(gridY / cellSize);

        if (row < 0 || row >= 5 || col < 0 || col >= 5) {
            return null;
        }

        return { row, col };
    }

    /**
     * Convert pixel coordinates to direction (when a cell is selected)
     */
    pixelToDirection(pixelX, pixelY, selectedCell) {
        if (!this.layout || !selectedCell) {
            return null;
        }

        const { gridOffsetX, gridOffsetY, cellSize, arrowOffset, arrowSize } = this.layout;

        const centerX = gridOffsetX + selectedCell.col * cellSize + cellSize / 2;
        const centerY = gridOffsetY + selectedCell.row * cellSize + cellSize / 2;

        const validDirections = getValidDirections(selectedCell.row, selectedCell.col);

        // Check each direction arrow
        const arrows = [
            { dir: 'up', x: centerX, y: centerY - arrowOffset },
            { dir: 'down', x: centerX, y: centerY + arrowOffset },
            { dir: 'left', x: centerX - arrowOffset, y: centerY },
            { dir: 'right', x: centerX + arrowOffset, y: centerY }
        ];

        for (const arrow of arrows) {
            if (!validDirections.includes(arrow.dir)) {
                continue;
            }

            const dx = pixelX - arrow.x;
            const dy = pixelY - arrow.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < arrowSize * 1.2) {
                return arrow.dir;
            }
        }

        return null;
    }

    /**
     * Main render function
     */
    render(state, hoveredCell, hoveredDirection, confirmedSelection, playerId) {
        this.layout = this.calculateLayout();
        const { width, height, topUIHeight } = this.layout;
        const colors = SLIDE_PUZZLE_CONFIG.colors;

        // Clear canvas
        this.ctx.fillStyle = colors.background;
        this.ctx.fillRect(0, 0, width, height);

        // Render grid
        this.renderGrid(state, hoveredCell, confirmedSelection);

        // Render direction arrows if in select_direction phase
        if (state.phase === 'select_direction' && state.selectedCell) {
            this.renderDirectionArrows(
                state.selectedCell,
                hoveredDirection,
                confirmedSelection
            );
        }

        // Render winning line if game over
        if (state.winningLine) {
            this.renderWinningLine(state.winningLine);
        }

        // Render top UI
        this.renderTopUI(state, playerId);

        // Render bottom UI
        this.renderBottomUI(state, playerId);

        // Render countdown/gameover overlays
        if (state.phase === 'countdown') {
            this.renderCountdown(state);
        } else if (state.phase === 'gameover') {
            this.renderGameOver(state, playerId);
        }
    }

    /**
     * Render the grid
     */
    renderGrid(state, hoveredCell, confirmedSelection) {
        const { gridOffsetX, gridOffsetY, cellSize } = this.layout;
        const colors = SLIDE_PUZZLE_CONFIG.colors;

        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const x = gridOffsetX + col * cellSize;
                const y = gridOffsetY + row * cellSize;

                const cell = state.grid[row][col];

                // Cell background
                if (cell === null) {
                    this.ctx.fillStyle = colors.neutral;
                } else if (cell.owner === 'p1') {
                    this.ctx.fillStyle = colors.p1;
                } else {
                    this.ctx.fillStyle = colors.p2;
                }
                this.ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

                // Outer ring border
                if (isOuterRingCell(row, col)) {
                    this.ctx.strokeStyle = colors.outerRingBorder;
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
                }

                // Hover overlay
                if (hoveredCell && hoveredCell.row === row && hoveredCell.col === col) {
                    this.ctx.fillStyle = colors.validMove;
                    this.ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                }

                // Confirmed selection overlay
                if (confirmedSelection?.type === 'cell' &&
                    confirmedSelection.row === row &&
                    confirmedSelection.col === col &&
                    confirmedSelection.valid) {
                    this.ctx.fillStyle = colors.confirm;
                    this.ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                }

                // Selected cell highlight (in select_direction phase)
                if (state.phase === 'select_direction' &&
                    state.selectedCell &&
                    state.selectedCell.row === row &&
                    state.selectedCell.col === col) {
                    this.ctx.strokeStyle = colors.p1Light;
                    this.ctx.lineWidth = 4;
                    this.ctx.strokeRect(x + 4, y + 4, cellSize - 8, cellSize - 8);
                }

                // Grid lines
                this.ctx.strokeStyle = colors.gridLine;
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(x, y, cellSize, cellSize);
            }
        }
    }

    /**
     * Render direction arrows around selected cell
     */
    renderDirectionArrows(selectedCell, hoveredDirection, confirmedSelection) {
        const { gridOffsetX, gridOffsetY, cellSize, arrowOffset, arrowSize } = this.layout;
        const colors = SLIDE_PUZZLE_CONFIG.colors;

        const centerX = gridOffsetX + selectedCell.col * cellSize + cellSize / 2;
        const centerY = gridOffsetY + selectedCell.row * cellSize + cellSize / 2;

        const validDirections = getValidDirections(selectedCell.row, selectedCell.col);

        const arrows = [
            { dir: 'up', x: centerX, y: centerY - arrowOffset, rotation: -Math.PI / 2 },
            { dir: 'down', x: centerX, y: centerY + arrowOffset, rotation: Math.PI / 2 },
            { dir: 'left', x: centerX - arrowOffset, y: centerY, rotation: Math.PI },
            { dir: 'right', x: centerX + arrowOffset, y: centerY, rotation: 0 }
        ];

        arrows.forEach(arrow => {
            if (!validDirections.includes(arrow.dir)) {
                return;
            }

            const isHovered = hoveredDirection === arrow.dir;
            const isConfirmed = confirmedSelection?.type === 'direction' &&
                               confirmedSelection.direction === arrow.dir;

            // Determine color
            let color = colors.arrowNormal;
            if (isConfirmed) {
                color = colors.arrowConfirmed;
            } else if (isHovered) {
                color = colors.arrowHover;
            }

            this.drawArrow(arrow.x, arrow.y, arrow.rotation, color, arrowSize, isConfirmed || isHovered);
        });
    }

    /**
     * Draw an arrow
     */
    drawArrow(x, y, rotation, color, size, filled) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(rotation);

        this.ctx.beginPath();
        this.ctx.moveTo(size, 0);
        this.ctx.lineTo(-size / 2, -size / 2);
        this.ctx.lineTo(-size / 2, size / 2);
        this.ctx.closePath();

        if (filled) {
            this.ctx.fillStyle = color;
            this.ctx.fill();
        } else {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    /**
     * Render winning line
     */
    renderWinningLine(winningLine) {
        const { gridOffsetX, gridOffsetY, cellSize } = this.layout;
        const colors = SLIDE_PUZZLE_CONFIG.colors;

        this.ctx.strokeStyle = colors.winLine;
        this.ctx.lineWidth = 6;
        this.ctx.lineCap = 'round';

        let x1, y1, x2, y2;

        if (winningLine.type === 'row') {
            const row = winningLine.index;
            x1 = gridOffsetX;
            y1 = gridOffsetY + row * cellSize + cellSize / 2;
            x2 = gridOffsetX + cellSize * 5;
            y2 = y1;
        } else if (winningLine.type === 'col') {
            const col = winningLine.index;
            x1 = gridOffsetX + col * cellSize + cellSize / 2;
            y1 = gridOffsetY;
            x2 = x1;
            y2 = gridOffsetY + cellSize * 5;
        } else if (winningLine.type === 'diag' && winningLine.index === 0) {
            x1 = gridOffsetX;
            y1 = gridOffsetY;
            x2 = gridOffsetX + cellSize * 5;
            y2 = gridOffsetY + cellSize * 5;
        } else if (winningLine.type === 'diag' && winningLine.index === 1) {
            x1 = gridOffsetX + cellSize * 5;
            y1 = gridOffsetY;
            x2 = gridOffsetX;
            y2 = gridOffsetY + cellSize * 5;
        }

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }

    /**
     * Render top UI (turn indicator and phase instructions)
     */
    renderTopUI(state, playerId) {
        const { width, topUIHeight } = this.layout;
        const colors = SLIDE_PUZZLE_CONFIG.colors;

        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';

        // Turn indicator
        const isMyTurn = state.currentTurn === playerId;
        const turnText = isMyTurn ? 'Your Turn' : `${state.playerNames[state.currentTurn]}'s Turn`;

        this.ctx.fillStyle = colors.textShadow;
        this.ctx.fillText(turnText, width / 2 + 2, 15 + 2);
        this.ctx.fillStyle = colors.text;
        this.ctx.fillText(turnText, width / 2, 15);

        // Phase instruction
        let phaseText = '';
        if (state.phase === 'select_cell') {
            phaseText = 'Select a cell from the outer ring';
        } else if (state.phase === 'select_direction') {
            phaseText = 'Choose direction to push';
        }

        if (phaseText && state.phase !== 'gameover') {
            this.ctx.font = '16px Arial';
            this.ctx.fillStyle = colors.textShadow;
            this.ctx.fillText(phaseText, width / 2 + 1, 45 + 1);
            this.ctx.fillStyle = colors.text;
            this.ctx.fillText(phaseText, width / 2, 45);
        }
    }

    /**
     * Render bottom UI (instructions)
     */
    renderBottomUI(state, playerId) {
        const { width, height, bottomUIHeight } = this.layout;
        const colors = SLIDE_PUZZLE_CONFIG.colors;

        const y = height - bottomUIHeight + 20;

        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';

        let instructions = '';
        if (state.phase === 'select_cell' || state.phase === 'select_direction') {
            instructions = 'Tap to select • Tap again to confirm';
        }

        if (instructions) {
            this.ctx.fillStyle = colors.textShadow;
            this.ctx.fillText(instructions, width / 2 + 1, y + 1);
            this.ctx.fillStyle = colors.text;
            this.ctx.fillText(instructions, width / 2, y);
        }

        // Cancel instruction during direction selection
        if (state.phase === 'select_direction') {
            const cancelText = 'Tap elsewhere to cancel';
            this.ctx.fillStyle = colors.textShadow;
            this.ctx.fillText(cancelText, width / 2 + 1, y + 25 + 1);
            this.ctx.fillStyle = colors.text;
            this.ctx.fillText(cancelText, width / 2, y + 25);
        }
    }

    /**
     * Render countdown overlay
     */
    renderCountdown(state) {
        const { width, height } = this.layout;
        const colors = SLIDE_PUZZLE_CONFIG.colors;

        if (!state.countdownStartTime) return;

        const elapsed = Date.now() - state.countdownStartTime;
        const remaining = Math.max(0, SLIDE_PUZZLE_CONFIG.countdownDuration - elapsed);
        const seconds = Math.ceil(remaining / 1000);

        if (seconds === 0) return;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, width, height);

        this.ctx.font = 'bold 72px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = colors.textShadow;
        this.ctx.fillText(seconds.toString(), width / 2 + 3, height / 2 + 3);
        this.ctx.fillStyle = colors.text;
        this.ctx.fillText(seconds.toString(), width / 2, height / 2);
    }

    /**
     * Render game over overlay
     */
    renderGameOver(state, playerId) {
        const { width, height } = this.layout;
        const colors = SLIDE_PUZZLE_CONFIG.colors;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, width, height);

        let title = 'Game Over';
        let message = '';

        if (state.forfeitBy) {
            const forfeiter = state.playerNames[state.forfeitBy];
            title = `${forfeiter} Forfeited`;
            message = state.winner === playerId ? 'You Win!' : 'You Lose';
        } else if (state.winner) {
            if (state.winner === playerId) {
                title = 'You Win!';
                message = 'Five in a row!';
            } else {
                title = 'You Lose';
                message = `${state.playerNames[state.winner]} wins!`;
            }
        }

        // Title
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = colors.textShadow;
        this.ctx.fillText(title, width / 2 + 3, height / 2 - 30 + 3);
        this.ctx.fillStyle = colors.text;
        this.ctx.fillText(title, width / 2, height / 2 - 30);

        // Message
        if (message) {
            this.ctx.font = '24px Arial';
            this.ctx.fillStyle = colors.textShadow;
            this.ctx.fillText(message, width / 2 + 2, height / 2 + 30 + 2);
            this.ctx.fillStyle = colors.text;
            this.ctx.fillText(message, width / 2, height / 2 + 30);
        }
    }
}
