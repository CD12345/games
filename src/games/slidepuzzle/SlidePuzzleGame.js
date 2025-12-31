/**
 * Slide Puzzle Battle - Main Game Class
 */

import { GameEngine } from '../../engine/GameEngine.js';
import { onMessage, offMessage, sendMessage } from '../../core/peer.js';
import { SLIDE_PUZZLE_CONFIG, getInitialState } from './config.js';
import { SlidePuzzleRenderer } from './SlidePuzzleRenderer.js';
import {
    canSelectCell,
    getValidDirections,
    executeSlide,
    checkWinCondition
} from './SlidePuzzleValidator.js';

export class SlidePuzzleGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber, settings = {}) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber;
        this.playerId = playerNumber === 1 ? 'p1' : 'p2';
        this.opponentId = playerNumber === 1 ? 'p2' : 'p1';

        this.state = getInitialState();
        this.renderer = new SlidePuzzleRenderer(canvas);

        // Local UI state (not synced)
        this.hoveredCell = null;
        this.hoveredDirection = null;
        this.confirmedSelection = null;
        this.isDragging = false;
        this.dragStartPos = null;
        this.gameOverNotified = false;

        // Callbacks
        this.onGameOver = null;
        this.onGameReset = null;

        // Bind event handlers
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
    }

    async initialize() {
        // Set up input event listeners
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('click', this.handleClick);
        this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Network setup
        if (this.isHost) {
            onMessage('slidepuzzle_action', (data) => {
                this.handleGuestAction(data);
            });
            this.state.countdownStartTime = Date.now();
        } else {
            onMessage('slidepuzzle_state', (data) => {
                this.state = data;
            });
        }

        // Both players listen for control messages
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
        this.state.elapsed += deltaTime;

        // Handle countdown
        if (this.isHost && this.state.phase === 'countdown') {
            const elapsed = Date.now() - this.state.countdownStartTime;
            if (elapsed >= SLIDE_PUZZLE_CONFIG.countdownDuration) {
                this.state.phase = 'select_cell';
                this.broadcastState();
            }
        }

        // Notify game over
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
            this.hoveredDirection,
            this.confirmedSelection,
            this.playerId
        );
    }

    // ===== INPUT HANDLING =====

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = e.clientX - rect.left;
        const pixelY = e.clientY - rect.top;

        this.updateHover(pixelX, pixelY);
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = e.clientX - rect.left;
        const pixelY = e.clientY - rect.top;

        this.handleTapOrClick(pixelX, pixelY);
    }

    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = touch.clientX - rect.left;
        const pixelY = touch.clientY - rect.top;

        this.isDragging = false;
        this.dragStartPos = { x: pixelX, y: pixelY };

        this.updateHover(pixelX, pixelY);
    }

    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = touch.clientX - rect.left;
        const pixelY = touch.clientY - rect.top;

        // Detect drag (prevent accidental taps during scroll)
        if (this.dragStartPos) {
            const dx = pixelX - this.dragStartPos.x;
            const dy = pixelY - this.dragStartPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                this.isDragging = true;
            }
        }

        this.updateHover(pixelX, pixelY);
    }

    handleTouchEnd(e) {
        e.preventDefault();

        if (this.isDragging) {
            this.isDragging = false;
            this.dragStartPos = null;
            return;
        }

        const touch = e.changedTouches[0];
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = touch.clientX - rect.left;
        const pixelY = touch.clientY - rect.top;

        this.handleTapOrClick(pixelX, pixelY);

        this.dragStartPos = null;
    }

    updateHover(pixelX, pixelY) {
        if (this.state.phase === 'countdown' || this.state.phase === 'gameover') {
            this.hoveredCell = null;
            this.hoveredDirection = null;
            return;
        }

        if (this.state.currentTurn !== this.playerId) {
            this.hoveredCell = null;
            this.hoveredDirection = null;
            return;
        }

        if (this.state.phase === 'select_cell') {
            this.hoveredCell = this.renderer.pixelToGridCell(pixelX, pixelY);
            this.hoveredDirection = null;
        } else if (this.state.phase === 'select_direction') {
            this.hoveredCell = null;
            this.hoveredDirection = this.renderer.pixelToDirection(
                pixelX,
                pixelY,
                this.state.selectedCell
            );
        }
    }

    handleTapOrClick(pixelX, pixelY) {
        if (this.state.phase === 'countdown' || this.state.phase === 'gameover') {
            return;
        }

        if (this.state.currentTurn !== this.playerId) {
            return;
        }

        if (this.state.phase === 'select_cell') {
            this.handleCellSelection(pixelX, pixelY);
        } else if (this.state.phase === 'select_direction') {
            this.handleDirectionSelection(pixelX, pixelY);
        }
    }

    handleCellSelection(pixelX, pixelY) {
        const cell = this.renderer.pixelToGridCell(pixelX, pixelY);
        if (!cell) {
            // Clicked outside grid - clear confirmation
            this.confirmedSelection = null;
            return;
        }

        const valid = canSelectCell(this.state, this.playerId, cell.row, cell.col);

        // Double-tap confirmation
        if (this.confirmedSelection?.type === 'cell' &&
            this.confirmedSelection.row === cell.row &&
            this.confirmedSelection.col === cell.col &&
            this.confirmedSelection.valid) {
            // Second tap - confirm and execute
            this.attemptSelectCell(cell.row, cell.col);
        } else {
            // First tap - show preview
            this.confirmedSelection = {
                type: 'cell',
                row: cell.row,
                col: cell.col,
                valid
            };
        }
    }

    handleDirectionSelection(pixelX, pixelY) {
        const direction = this.renderer.pixelToDirection(
            pixelX,
            pixelY,
            this.state.selectedCell
        );

        if (!direction) {
            // Clicked outside arrows - cancel selection and return to select_cell
            this.attemptCancelSelection();
            return;
        }

        // Double-tap confirmation
        if (this.confirmedSelection?.type === 'direction' &&
            this.confirmedSelection.direction === direction) {
            // Second tap - confirm and execute
            this.attemptSlide(direction);
        } else {
            // First tap - show preview
            this.confirmedSelection = {
                type: 'direction',
                direction
            };
        }
    }

    // ===== ACTION METHODS =====

    attemptSelectCell(row, col) {
        this.confirmedSelection = null;

        if (this.isHost) {
            this.executeSelectCell(this.playerId, row, col);
        } else {
            sendMessage('slidepuzzle_action', {
                action: 'select_cell',
                row,
                col
            });
        }
    }

    attemptSlide(direction) {
        this.confirmedSelection = null;

        if (this.isHost) {
            this.executeSlide(this.playerId, direction);
        } else {
            sendMessage('slidepuzzle_action', {
                action: 'slide',
                direction
            });
        }
    }

    attemptCancelSelection() {
        this.confirmedSelection = null;

        if (this.isHost) {
            this.executeCancelSelection();
        } else {
            sendMessage('slidepuzzle_action', {
                action: 'cancel'
            });
        }
    }

    // ===== HOST-SIDE EXECUTION =====

    executeSelectCell(playerId, row, col) {
        if (this.state.phase !== 'select_cell') return;
        if (this.state.currentTurn !== playerId) return;
        if (!canSelectCell(this.state, playerId, row, col)) return;

        this.state.selectedCell = { row, col };
        this.state.phase = 'select_direction';
        this.broadcastState();
    }

    executeSlide(playerId, direction) {
        if (this.state.phase !== 'select_direction') return;
        if (this.state.currentTurn !== playerId) return;
        if (!this.state.selectedCell) return;

        const validDirections = getValidDirections(
            this.state.selectedCell.row,
            this.state.selectedCell.col
        );
        if (!validDirections.includes(direction)) return;

        // Execute the slide
        executeSlide(
            this.state.grid,
            this.state.selectedCell.row,
            this.state.selectedCell.col,
            direction,
            playerId
        );

        // Check win condition
        const winCheck = checkWinCondition(this.state.grid);
        if (winCheck.won) {
            this.state.winner = winCheck.winner;
            this.state.winningLine = winCheck.line;
            this.state.phase = 'gameover';
            this.broadcastState();
            return;
        }

        // Continue game
        this.state.selectedCell = null;
        this.state.phase = 'select_cell';
        this.switchTurn();
        this.broadcastState();
    }

    executeCancelSelection() {
        if (this.state.phase !== 'select_direction') return;

        this.state.selectedCell = null;
        this.state.phase = 'select_cell';
        this.broadcastState();
    }

    handleGuestAction(data) {
        if (!this.isHost) return;

        const guestId = this.opponentId;

        if (data.action === 'select_cell') {
            this.executeSelectCell(guestId, data.row, data.col);
        } else if (data.action === 'slide') {
            this.executeSlide(guestId, data.direction);
        } else if (data.action === 'cancel') {
            this.executeCancelSelection();
        }
    }

    switchTurn() {
        this.state.currentTurn = this.state.currentTurn === 'p1' ? 'p2' : 'p1';
        this.state.turnNumber++;
    }

    broadcastState() {
        if (!this.isHost) return;
        sendMessage('slidepuzzle_state', this.state);
    }

    // ===== GAME CONTROL =====

    applyForfeit(forfeitingPlayerId) {
        if (this.state.phase === 'gameover') return;

        this.state.forfeitBy = forfeitingPlayerId;
        this.state.winner = forfeitingPlayerId === 'p1' ? 'p2' : 'p1';
        this.state.phase = 'gameover';

        if (this.isHost) {
            this.broadcastState();
        }
    }

    resetGame() {
        this.state = getInitialState();
        this.state.countdownStartTime = Date.now();
        this.confirmedSelection = null;
        this.hoveredCell = null;
        this.hoveredDirection = null;
        this.gameOverNotified = false;

        if (this.isHost) {
            this.broadcastState();
        }

        if (this.onGameReset) {
            this.onGameReset();
        }
    }

    destroy() {
        // Remove event listeners
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('click', this.handleClick);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);

        // Remove network listeners
        offMessage('slidepuzzle_action');
        offMessage('slidepuzzle_state');
        offMessage('player_name');
        offMessage('rematch_request');
        offMessage('forfeit_request');

        // Call parent cleanup
        super.destroy();
    }
}
