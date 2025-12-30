/**
 * Stack Race Game
 *
 * 3D pyramid stacking game inspired by Pylos.
 * Build a pyramid, create 2x2 patterns to retrieve pieces,
 * and race to place the first piece on the top.
 */

import { GameEngine } from '../../engine/GameEngine.js';
import { sendMessage, onMessage, offMessage } from '../../core/peer.js';
import { StackRaceRenderer } from './StackRaceRenderer.js';
import { STACK_RACE_CONFIG, getInitialState } from './config.js';
import {
    canPlaceOnLevel,
    find2x2Patterns,
    canRetrievePiece,
    getRetrievablePositions,
    checkWinCondition
} from './StackRaceValidator.js';

export class StackRaceGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber, settings = {}) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber; // 1 or 2
        this.playerId = playerNumber === 1 ? 'p1' : 'p2';
        this.opponentId = playerNumber === 1 ? 'p2' : 'p1';

        this.state = getInitialState();
        this.renderer = new StackRaceRenderer(canvas);

        // Local UI state (not synced)
        this.hoveredPosition = null;        // { level, row, col }
        this.confirmedSelection = null;     // { level, row, col }
        this.selectedForRetrieval = [];     // [{ level, row, col }, ...]
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
            onMessage('stackrace_action', (data) => {
                this.handleGuestAction(data);
            });

            // Start countdown
            this.state.countdownStartTime = Date.now();
        } else {
            // Guest listens for state updates
            onMessage('stackrace_state', (data) => {
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
            if (elapsed >= STACK_RACE_CONFIG.countdownDuration) {
                this.state.phase = 'placement';
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
            this.hoveredPosition,
            this.confirmedSelection,
            this.selectedForRetrieval,
            this.playerId
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
        const position = this.renderer.screenToGridPosition(pixelX, pixelY);
        this.hoveredPosition = position;
    }

    handleTapOrClick(pixelX, pixelY) {
        if (this.state.phase === 'gameover' || this.state.phase === 'countdown') return;
        if (this.state.currentTurn !== this.playerId) return;

        const position = this.renderer.screenToGridPosition(pixelX, pixelY);
        if (!position) return;

        if (this.state.phase === 'placement') {
            this.handlePlacementClick(position);
        } else if (this.state.phase === 'select_retrieval') {
            this.handleRetrievalClick(position);
        }
    }

    handlePlacementClick(position) {
        const { level, row, col } = position;

        // Check if valid placement
        const valid = canPlaceOnLevel(this.state, level, row, col);

        if (this.confirmedSelection &&
            this.confirmedSelection.level === level &&
            this.confirmedSelection.row === row &&
            this.confirmedSelection.col === col &&
            valid) {
            // Second tap - confirm placement
            this.attemptPlacePiece(level, row, col);
            this.confirmedSelection = null;
            this.hoveredPosition = null;
        } else {
            // First tap - show preview
            this.confirmedSelection = valid ? { level, row, col } : null;
        }
    }

    handleRetrievalClick(position) {
        const { level, row, col } = position;

        // Check if this piece can be retrieved
        if (!canRetrievePiece(this.state, level, row, col, this.playerId)) {
            return;
        }

        // Toggle selection
        const index = this.selectedForRetrieval.findIndex(
            s => s.level === level && s.row === row && s.col === col
        );

        if (index >= 0) {
            // Deselect
            this.selectedForRetrieval.splice(index, 1);
        } else {
            // Select (max 2)
            if (this.selectedForRetrieval.length < 2) {
                this.selectedForRetrieval.push({ level, row, col });
            }
        }
    }

    // ===== Game Actions =====

    attemptPlacePiece(level, row, col) {
        if (this.isHost) {
            this.executePlacePiece(this.playerId, level, row, col);
        } else {
            sendMessage('stackrace_action', {
                action: 'place_piece',
                level,
                row,
                col
            });
        }
    }

    attemptFinishRetrieval() {
        if (this.isHost) {
            this.executeRetrieval(this.playerId, this.selectedForRetrieval);
        } else {
            sendMessage('stackrace_action', {
                action: 'select_retrieval',
                positions: this.selectedForRetrieval
            });
        }
        this.selectedForRetrieval = [];
    }

    // ===== Host-side Action Execution =====

    handleGuestAction(data) {
        if (!this.isHost) return;
        if (this.state.currentTurn !== this.opponentId) return;

        if (data.action === 'place_piece') {
            this.executePlacePiece(this.opponentId, data.level, data.row, data.col);
        } else if (data.action === 'select_retrieval') {
            this.executeRetrieval(this.opponentId, data.positions);
        }
    }

    executePlacePiece(playerId, level, row, col) {
        if (this.state.phase !== 'placement') return;
        if (this.state.pieceCounts[playerId] <= 0) return;
        if (!canPlaceOnLevel(this.state, level, row, col)) return;

        // Place piece
        this.state.grid[level][row][col] = { owner: playerId };
        this.state.pieceCounts[playerId]--;

        // Check for 2x2 patterns on this level
        const patterns = find2x2Patterns(this.state, level, playerId);

        if (patterns.length > 0) {
            // Transition to retrieval phase
            this.state.retrievalOptions = getRetrievablePositions(this.state, playerId);

            if (this.state.retrievalOptions.length > 0) {
                this.state.phase = 'select_retrieval';
                this.state.selectedForRetrieval = [];
                this.broadcastState();
                return;
            }
            // If no retrievable pieces, skip retrieval and continue
        }

        // No 2x2 or no retrievable pieces - check win and switch turn
        const winCheck = checkWinCondition(this.state);
        if (winCheck.gameOver) {
            this.state.winner = winCheck.winner;
            this.state.phase = 'gameover';
            this.broadcastState();
            return;
        }

        this.switchTurn();
        this.broadcastState();
    }

    executeRetrieval(playerId, positions) {
        if (this.state.phase !== 'select_retrieval') return;
        if (positions.length > 2) return; // Max 2 pieces

        // Validate all positions
        for (const pos of positions) {
            if (!canRetrievePiece(this.state, pos.level, pos.row, pos.col, playerId)) {
                return; // Invalid retrieval
            }
        }

        // Remove pieces and return to player
        for (const pos of positions) {
            this.state.grid[pos.level][pos.row][pos.col] = null;
            this.state.pieceCounts[playerId]++;
        }

        // Clear retrieval state
        this.state.retrievalOptions = [];
        this.state.selectedForRetrieval = [];
        this.state.phase = 'placement';

        // Check win condition
        const winCheck = checkWinCondition(this.state);
        if (winCheck.gameOver) {
            this.state.winner = winCheck.winner;
            this.state.phase = 'gameover';
            this.broadcastState();
            return;
        }

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
            sendMessage('stackrace_state', this.state);
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
        this.hoveredPosition = null;
        this.confirmedSelection = null;
        this.selectedForRetrieval = [];
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

    forfeit() {
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
        offMessage('stackrace_action');
        offMessage('stackrace_state');
        offMessage('player_name');
        offMessage('rematch_request');
        offMessage('forfeit_request');

        super.destroy();
    }
}
