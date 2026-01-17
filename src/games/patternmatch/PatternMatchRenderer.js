/**
 * Pattern Match - Rendering Logic
 *
 * Handles all drawing for the Pattern Match game.
 */

import { PATTERN_MATCH_CONFIG } from './config.js';

export class PatternMatchRenderer {
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
        const bottomUIHeight = 120;
        const availableHeight = height - topUIHeight - bottomUIHeight;
        const availableWidth = width - 40; // 20px padding on each side

        // Grid should be square
        const maxSize = Math.min(availableWidth, availableHeight);
        const cellSize = Math.floor(maxSize / 4);
        const gridSize = cellSize * 4;

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
            gridOffsetY,
            pieceSelectorY: gridOffsetY + gridSize + 20,
            pieceSelectorHeight: bottomUIHeight - 40
        };

        return this.layout;
    }

    /**
     * Convert pixel coordinates to grid cell
     * Returns { row, col } or null if outside grid
     */
    pixelToGridCell(pixelX, pixelY) {
        if (!this.layout) this.calculateLayout();

        const { gridOffsetX, gridOffsetY, cellSize } = this.layout;

        const gridX = pixelX - gridOffsetX;
        const gridY = pixelY - gridOffsetY;

        if (gridX < 0 || gridY < 0) return null;

        const col = Math.floor(gridX / cellSize);
        const row = Math.floor(gridY / cellSize);

        if (row < 0 || row >= 4 || col < 0 || col >= 4) return null;

        return { row, col };
    }

    /**
     * Convert pixel coordinates to piece ID in selector
     * Returns piece ID or null if outside selector
     */
    pixelToPiece(pixelX, pixelY, availablePieces) {
        if (!this.layout) this.calculateLayout();

        const { width, pieceSelectorY, pieceSelectorHeight } = this.layout;

        // Pieces arranged in a 4x4 grid in the selector
        const piecesPerRow = 8;
        const pieceSize = Math.min(60, (width - 40) / piecesPerRow);
        const selectorWidth = pieceSize * piecesPerRow;
        const selectorX = (width - selectorWidth) / 2;

        const relX = pixelX - selectorX;
        const relY = pixelY - pieceSelectorY;

        if (relX < 0 || relY < 0 || relY > pieceSelectorHeight) return null;

        const col = Math.floor(relX / pieceSize);
        const row = Math.floor(relY / pieceSize);

        if (col < 0 || col >= piecesPerRow || row < 0 || row >= 2) return null;

        const pieceId = row * piecesPerRow + col;

        if (pieceId < 0 || pieceId >= 16) return null;

        return pieceId;
    }

    /**
     * Draw a single piece
     */
    drawPiece(piece, x, y, size) {
        const ctx = this.ctx;
        const centerX = x + size / 2;
        const centerY = y + size / 2;

        // Determine piece size based on size attribute
        const pieceSize = piece.size === 'big' ? size * 0.7 : size * 0.5;

        // Get color
        const color = piece.color === 'red'
            ? PATTERN_MATCH_CONFIG.colors.red
            : PATTERN_MATCH_CONFIG.colors.blue;

        ctx.lineWidth = 3;

        if (piece.shape === 'circle') {
            // Draw circle
            ctx.beginPath();
            ctx.arc(centerX, centerY, pieceSize / 2, 0, Math.PI * 2);

            if (piece.fill === 'solid') {
                ctx.fillStyle = color;
                ctx.fill();
            } else {
                ctx.strokeStyle = color;
                ctx.stroke();
            }
        } else {
            // Draw square
            const half = pieceSize / 2;
            const left = centerX - half;
            const top = centerY - half;

            if (piece.fill === 'solid') {
                ctx.fillStyle = color;
                ctx.fillRect(left, top, pieceSize, pieceSize);
            } else {
                ctx.strokeStyle = color;
                ctx.strokeRect(left, top, pieceSize, pieceSize);
            }
        }
    }

    /**
     * Main render function
     */
    render(state, hoveredCell, hoveredPiece, confirmedSelection) {
        const ctx = this.ctx;
        const layout = this.calculateLayout();

        // Clear canvas
        ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.background;
        ctx.fillRect(0, 0, layout.width, layout.height);

        // Draw UI elements
        this.drawTopUI(state);
        this.drawGrid(state, hoveredCell, confirmedSelection);
        this.drawPiecesOnGrid(state);
        this.drawWinningLine(state);
        this.drawPieceSelector(state, hoveredPiece, confirmedSelection);

        if (state.phase === 'countdown') {
            this.drawCountdown(state);
        }

        if (state.phase === 'gameover') {
            this.drawGameOver(state);
        }
    }

    /**
     * Draw top UI (turn indicator and instructions)
     */
    drawTopUI(state) {
        const ctx = this.ctx;
        const { width } = this.layout;

        ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.text;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';

        let instruction = '';
        if (state.phase === 'select_placement') {
            const piece = state.pieces[state.selectedPiece];
            const desc = `${piece.color} ${piece.shape} (${piece.size}, ${piece.fill})`;
            instruction = `${state.playerNames[state.currentTurn]}: Place the ${desc}`;
        } else if (state.phase === 'select_next_piece') {
            instruction = `${state.playerNames[state.currentTurn]}: Select a piece for opponent`;
        } else if (state.phase === 'countdown') {
            instruction = 'Get Ready!';
        }

        ctx.fillText(instruction, width / 2, 30);

        // Turn number
        ctx.font = '14px Arial';
        ctx.fillText(`Turn ${state.turnNumber}`, width / 2, 55);
    }

    /**
     * Draw grid
     */
    drawGrid(state, hoveredCell, confirmedSelection) {
        const ctx = this.ctx;
        const { gridOffsetX, gridOffsetY, cellSize } = this.layout;

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const x = gridOffsetX + col * cellSize;
                const y = gridOffsetY + row * cellSize;

                // Cell background
                ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.gridLine;
                ctx.fillRect(x, y, cellSize, cellSize);

                // Cell border
                ctx.strokeStyle = PATTERN_MATCH_CONFIG.colors.background;
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, cellSize, cellSize);

                // Highlight hovered cell during placement phase
                if (state.phase === 'select_placement' && state.grid[row][col] === null) {
                    if (hoveredCell && hoveredCell.row === row && hoveredCell.col === col) {
                        ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.validMove;
                        ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
                    }

                    // Highlight confirmed selection
                    if (confirmedSelection?.type === 'cell' &&
                        confirmedSelection.row === row && confirmedSelection.col === col) {
                        ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.preview;
                        ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
                    }
                }
            }
        }
    }

    /**
     * Draw pieces on grid
     */
    drawPiecesOnGrid(state) {
        const { gridOffsetX, gridOffsetY, cellSize } = this.layout;

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const piece = state.grid[row][col];
                if (piece) {
                    const x = gridOffsetX + col * cellSize;
                    const y = gridOffsetY + row * cellSize;
                    this.drawPiece(piece, x, y, cellSize);
                }
            }
        }
    }

    /**
     * Draw winning line highlight
     */
    drawWinningLine(state) {
        if (!state.winningLine) return;

        const ctx = this.ctx;
        const { gridOffsetX, gridOffsetY, cellSize } = this.layout;
        const { type, index } = state.winningLine;

        ctx.strokeStyle = 'rgba(74, 222, 128, 0.8)';
        ctx.lineWidth = 6;

        let x1, y1, x2, y2;

        if (type === 'row') {
            x1 = gridOffsetX;
            y1 = gridOffsetY + index * cellSize + cellSize / 2;
            x2 = gridOffsetX + 4 * cellSize;
            y2 = y1;
        } else if (type === 'col') {
            x1 = gridOffsetX + index * cellSize + cellSize / 2;
            y1 = gridOffsetY;
            x2 = x1;
            y2 = gridOffsetY + 4 * cellSize;
        } else if (type === 'diag') {
            if (index === 0) {
                // Top-left to bottom-right
                x1 = gridOffsetX;
                y1 = gridOffsetY;
                x2 = gridOffsetX + 4 * cellSize;
                y2 = gridOffsetY + 4 * cellSize;
            } else {
                // Top-right to bottom-left
                x1 = gridOffsetX + 4 * cellSize;
                y1 = gridOffsetY;
                x2 = gridOffsetX;
                y2 = gridOffsetY + 4 * cellSize;
            }
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    /**
     * Draw piece selector at bottom
     */
    drawPieceSelector(state, hoveredPiece, confirmedSelection) {
        const ctx = this.ctx;
        const { width, pieceSelectorY } = this.layout;

        // Only show during select_next_piece phase
        if (state.phase !== 'select_next_piece') return;

        const piecesPerRow = 8;
        const pieceSize = Math.min(60, (width - 40) / piecesPerRow);
        const selectorWidth = pieceSize * piecesPerRow;
        const selectorX = (width - selectorWidth) / 2;

        ctx.font = '14px Arial';
        ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.text;
        ctx.textAlign = 'center';
        ctx.fillText('Select a piece for your opponent:', width / 2, pieceSelectorY - 5);

        // Draw all 16 pieces
        for (let i = 0; i < 16; i++) {
            const piece = state.pieces[i];
            const row = Math.floor(i / piecesPerRow);
            const col = i % piecesPerRow;
            const x = selectorX + col * pieceSize;
            const y = pieceSelectorY + 15 + row * pieceSize;

            // Background
            if (piece.placed) {
                ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.placed;
            } else if (hoveredPiece === i) {
                ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.validMove;
            } else if (confirmedSelection?.type === 'piece' && confirmedSelection.pieceId === i) {
                ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.preview;
            } else {
                ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.gridLine;
            }
            ctx.fillRect(x, y, pieceSize, pieceSize);

            // Border
            ctx.strokeStyle = PATTERN_MATCH_CONFIG.colors.background;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, pieceSize, pieceSize);

            // Draw piece if not placed
            if (!piece.placed) {
                this.drawPiece(piece, x, y, pieceSize);
            }
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
        const remaining = Math.max(0, PATTERN_MATCH_CONFIG.countdownDuration - elapsed);
        const seconds = Math.ceil(remaining / 1000);

        if (seconds === 0) return;

        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Countdown number
        ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.text;
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
        ctx.fillStyle = PATTERN_MATCH_CONFIG.colors.text;

        // Winner message
        if (state.forfeitBy) {
            const winner = state.forfeitBy === 'p1' ? state.playerNames.p2 : state.playerNames.p1;
            ctx.font = 'bold 36px Arial';
            ctx.fillText(`${winner} wins!`, width / 2, height / 2 - 20);
            ctx.font = '20px Arial';
            ctx.fillText('Opponent forfeited', width / 2, height / 2 + 20);
        } else if (state.winner) {
            const winnerName = state.playerNames[state.winner];
            ctx.font = 'bold 36px Arial';
            ctx.fillText(`${winnerName} wins!`, width / 2, height / 2 - 40);

            if (state.winningLine) {
                ctx.font = '20px Arial';
                const attr = state.winningLine.attribute;
                ctx.fillText(`Winning pattern: ${attr}`, width / 2, height / 2 + 10);
            }
        } else {
            ctx.font = 'bold 36px Arial';
            ctx.fillText("It's a draw!", width / 2, height / 2);
        }

        // Rematch instruction
        ctx.font = '18px Arial';
        ctx.fillText('Click "Return to Menu" or wait for rematch', width / 2, height / 2 + 60);
    }
}
