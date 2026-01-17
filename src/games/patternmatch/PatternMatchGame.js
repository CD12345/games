/**
 * Pattern Match Game
 *
 * Turn-based strategy game inspired by Quarto.
 * Players take turns placing pieces their opponent selected,
 * trying to create a row of 4 pieces sharing any common attribute.
 */

import { GameEngine } from '../../engine/GameEngine.js';
import { sendMessage, onMessage, offMessage } from '../../core/peer.js';
import { PatternMatchRenderer } from './PatternMatchRenderer.js';
import { PATTERN_MATCH_CONFIG, getInitialState } from './config.js';
import {
    checkWinCondition,
    isValidPlacement,
    canSelectPiece,
    isGridFull
} from './PatternMatchValidator.js';

export class PatternMatchGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber, settings = {}) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber; // 1 or 2
        this.playerId = playerNumber === 1 ? 'p1' : 'p2';
        this.opponentId = playerNumber === 1 ? 'p2' : 'p1';

        this.state = getInitialState();
        this.renderer = new PatternMatchRenderer(canvas);

        // Local UI state (not synced)
        this.hoveredCell = null;
        this.hoveredPiece = null;
        this.confirmedSelection = null;
        this.isDragging = false;
        this.dragStartPos = null;

        // Game over notification flag
        this.gameOverNotified = false;

        // Callbacks
        this.onGameOver = null;
        this.onGameReset = null;

        // Input handlers
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
    }

    async initialize() {
        // Set up input listeners
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('click', this.handleClick);
        this.canvas.addEventListener('touchstart', this.handleTouchStart);
        this.canvas.addEventListener('touchmove', this.handleTouchMove);
        this.canvas.addEventListener('touchend', this.handleTouchEnd);

        // Prevent context menu on long press
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Set up network message handlers
        if (this.isHost) {
            // Host listens for guest actions
            onMessage('patternmatch_action', (data) => {
                this.handleGuestAction(data);
            });

            // Start countdown
            this.state.countdownStartTime = Date.now();
        } else {
            // Guest listens for state updates
            onMessage('patternmatch_state', (data) => {
                this.state = data;
            });
        }

        // Both listen for player names and control messages
        onMessage('player_name', (data) => {
            if (data.playerNumber === 1) {
                this.state.playerNames.p1 = data.name;
            } else if (data.playerNumber === 2) {
                this.state.playerNames.p2 = data.name;
            }
        });

        onMessage('rematch_request', () => {
            this.resetGame();
        });

        onMessage('forfeit_request', (data) => {
            this.applyForfeit(data.by);
        });
    }

    update(deltaTime) {
        // Update elapsed time
        this.state.elapsed += deltaTime;

        // Handle countdown
        if (this.isHost && this.state.phase === 'countdown') {
            const elapsed = Date.now() - this.state.countdownStartTime;
            if (elapsed >= PATTERN_MATCH_CONFIG.countdownDuration) {
                this.state.phase = 'select_next_piece';
                this.broadcastState();
            }
        }

        // Check for game over notification
        if (this.state.phase === 'gameover' && !this.gameOverNotified) {
            this.gameOverNotified = true;
            if (this.onGameOver) {
                this.onGameOver(this.state.winner);
            }
        }
    }

    render() {
        this.renderer.render(
            this.state,
            this.hoveredCell,
            this.hoveredPiece,
            this.confirmedSelection
        );
    }

    // ===== Input Handling =====

    handleMouseMove(event) {
        if (this.isDragging) return;
        if (this.state.phase === 'gameover' || this.state.phase === 'countdown') return;
        if (this.state.currentTurn !== this.playerId) return;
        if (this.confirmedSelection) return; // Don't update hover when confirmed

        const rect = this.canvas.getBoundingClientRect();
        const pixelX = event.clientX - rect.left;
        const pixelY = event.clientY - rect.top;

        this.updateHover(pixelX, pixelY);
    }

    handleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = event.clientX - rect.left;
        const pixelY = event.clientY - rect.top;

        this.handleTapOrClick(pixelX, pixelY);
    }

    handleTouchStart(event) {
        event.preventDefault();
        const touch = event.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = touch.clientX - rect.left;
        const pixelY = touch.clientY - rect.top;

        this.dragStartPos = { x: pixelX, y: pixelY };
        this.isDragging = false;
    }

    handleTouchMove(event) {
        event.preventDefault();
        if (!this.dragStartPos) return;

        const touch = event.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = touch.clientX - rect.left;
        const pixelY = touch.clientY - rect.top;

        const dx = pixelX - this.dragStartPos.x;
        const dy = pixelY - this.dragStartPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 5) {
            this.isDragging = true;
        }

        // Update hover during drag if not confirmed
        if (this.isDragging && !this.confirmedSelection) {
            this.updateHover(pixelX, pixelY);
        }
    }

    handleTouchEnd(event) {
        event.preventDefault();

        if (!this.isDragging && this.dragStartPos) {
            // This was a tap, not a drag
            this.handleTapOrClick(this.dragStartPos.x, this.dragStartPos.y);
        }

        this.dragStartPos = null;
        this.isDragging = false;
    }

    updateHover(pixelX, pixelY) {
        if (this.state.phase === 'select_placement') {
            const cell = this.renderer.pixelToGridCell(pixelX, pixelY);
            this.hoveredCell = cell;
            this.hoveredPiece = null;
        } else if (this.state.phase === 'select_next_piece') {
            const pieceId = this.renderer.pixelToPiece(pixelX, pixelY);
            this.hoveredPiece = pieceId;
            this.hoveredCell = null;
        }
    }

    handleTapOrClick(pixelX, pixelY) {
        if (this.state.phase === 'gameover' || this.state.phase === 'countdown') return;
        if (this.state.currentTurn !== this.playerId) return;

        if (this.state.phase === 'select_placement') {
            // Click on grid to place piece
            const cell = this.renderer.pixelToGridCell(pixelX, pixelY);
            if (cell && isValidPlacement(this.state.grid, cell.row, cell.col)) {
                if (this.confirmedSelection?.type === 'cell' &&
                    this.confirmedSelection.row === cell.row &&
                    this.confirmedSelection.col === cell.col) {
                    // Second tap - confirm placement
                    this.attemptPlacePiece(cell.row, cell.col);
                    this.confirmedSelection = null;
                    this.hoveredCell = null;
                } else {
                    // First tap - show preview
                    this.confirmedSelection = { type: 'cell', row: cell.row, col: cell.col };
                }
            }
        } else if (this.state.phase === 'select_next_piece') {
            // Click on piece to select
            const pieceId = this.renderer.pixelToPiece(pixelX, pixelY);
            if (pieceId !== null && canSelectPiece(this.state.pieces, pieceId)) {
                if (this.confirmedSelection?.type === 'piece' &&
                    this.confirmedSelection.pieceId === pieceId) {
                    // Second tap - confirm selection
                    this.attemptSelectPiece(pieceId);
                    this.confirmedSelection = null;
                    this.hoveredPiece = null;
                } else {
                    // First tap - show preview
                    this.confirmedSelection = { type: 'piece', pieceId };
                }
            }
        }
    }

    // ===== Game Actions =====

    attemptPlacePiece(row, col) {
        if (this.isHost) {
            this.executePlacePiece(this.playerId, row, col);
        } else {
            sendMessage('patternmatch_action', {
                action: 'place_piece',
                row,
                col
            });
        }
    }

    attemptSelectPiece(pieceId) {
        if (this.isHost) {
            this.executeSelectPiece(this.playerId, pieceId);
        } else {
            sendMessage('patternmatch_action', {
                action: 'select_piece',
                pieceId
            });
        }
    }

    // ===== Host-side Action Execution =====

    handleGuestAction(data) {
        if (!this.isHost) return;
        if (this.state.currentTurn !== this.opponentId) return;

        if (data.action === 'place_piece') {
            this.executePlacePiece(this.opponentId, data.row, data.col);
        } else if (data.action === 'select_piece') {
            this.executeSelectPiece(this.opponentId, data.pieceId);
        }
    }

    executePlacePiece(playerId, row, col) {
        if (this.state.phase !== 'select_placement') return;
        if (!isValidPlacement(this.state.grid, row, col)) return;
        if (this.state.selectedPiece === null) return;

        // Place piece on grid
        const piece = this.state.pieces[this.state.selectedPiece];
        this.state.grid[row][col] = { ...piece };
        piece.placed = true;
        this.state.selectedPiece = null;

        // Check win condition
        const result = checkWinCondition(this.state.grid);
        if (result.won) {
            this.state.winner = playerId;
            this.state.winningLine = result.line;
            this.state.phase = 'gameover';
            this.broadcastState();
            return;
        }

        // Check for draw (grid full)
        if (isGridFull(this.state.grid)) {
            this.state.winner = null;
            this.state.phase = 'gameover';
            this.broadcastState();
            return;
        }

        // Continue: same player now selects next piece
        this.state.phase = 'select_next_piece';
        this.broadcastState();
    }

    executeSelectPiece(playerId, pieceId) {
        if (this.state.phase !== 'select_next_piece') return;
        if (!canSelectPiece(this.state.pieces, pieceId)) return;

        // Set selected piece
        this.state.selectedPiece = pieceId;

        // Switch to placement phase and change turn
        this.state.phase = 'select_placement';
        this.switchTurn();
        this.broadcastState();
    }

    switchTurn() {
        this.state.currentTurn = this.state.currentTurn === 'p1' ? 'p2' : 'p1';
        this.state.turnNumber++;
    }

    // ===== Network =====

    broadcastState() {
        if (this.isHost) {
            sendMessage('patternmatch_state', this.state);
        }
    }

    // ===== Game Control =====

    applyForfeit(playerId) {
        this.state.forfeitBy = playerId;
        this.state.winner = playerId === 'p1' ? 'p2' : 'p1';
        this.state.phase = 'gameover';
        this.broadcastState();
    }

    resetGame() {
        this.state = getInitialState();
        this.hoveredCell = null;
        this.hoveredPiece = null;
        this.confirmedSelection = null;
        this.gameOverNotified = false;

        if (this.isHost) {
            this.state.countdownStartTime = Date.now();
            this.broadcastState();
        }

        if (this.onGameReset) {
            this.onGameReset();
        }
    }

    requestRematch() {
        sendMessage('rematch_request', {});
    }

    requestForfeit() {
        sendMessage('forfeit_request', { by: this.playerId });
        this.applyForfeit(this.playerId);
    }

    // ===== Cleanup =====

    destroy() {
        // Remove input listeners
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('click', this.handleClick);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);

        // Remove message handlers
        offMessage('patternmatch_action');
        offMessage('patternmatch_state');
        offMessage('player_name');
        offMessage('rematch_request');
        offMessage('forfeit_request');

        super.destroy();
    }
}
