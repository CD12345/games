/**
 * Claim Territory Game
 *
 * Strategic territory control game where players claim adjacent cells
 * to expand their domain. Most cells wins!
 */

import { GameEngine } from '../../engine/GameEngine.js';
import { sendMessage, onMessage, offMessage } from '../../core/peer.js';
import { ClaimTerritoryRenderer } from './ClaimTerritoryRenderer.js';
import { CLAIM_TERRITORY_CONFIG, getInitialState } from './config.js';
import {
    isValidClaim,
    checkWinCondition
} from './ClaimTerritoryValidator.js';

export class ClaimTerritoryGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber, settings = {}) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber; // 1 or 2
        this.playerId = playerNumber === 1 ? 'p1' : 'p2';
        this.opponentId = playerNumber === 1 ? 'p2' : 'p1';

        this.state = getInitialState();

        // Initialize starting positions
        this.state.grid[0][0] = 'p1';
        this.state.grid[9][9] = 'p2';

        this.renderer = new ClaimTerritoryRenderer(canvas);

        // Local UI state (not synced)
        this.hoveredCell = null;
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
            onMessage('claimterritory_action', (data) => {
                this.handleGuestAction(data);
            });

            // Start countdown
            this.state.countdownStartTime = Date.now();
        } else {
            // Guest listens for state updates
            onMessage('claimterritory_state', (data) => {
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
            if (elapsed >= CLAIM_TERRITORY_CONFIG.countdownDuration) {
                this.state.phase = 'playing';
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
            this.confirmedSelection,
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
        const cell = this.renderer.pixelToGridCell(pixelX, pixelY);
        this.hoveredCell = cell;
    }

    handleTapOrClick(pixelX, pixelY) {
        if (this.state.phase === 'gameover' || this.state.phase === 'countdown') return;
        if (this.state.currentTurn !== this.playerId) return;

        const cell = this.renderer.pixelToGridCell(pixelX, pixelY);
        if (!cell) return;

        const valid = isValidClaim(this.state, this.playerId, cell.x, cell.y);

        if (this.confirmedSelection?.x === cell.x &&
            this.confirmedSelection?.y === cell.y &&
            valid) {
            // Second tap - confirm claim
            this.attemptClaim(cell.x, cell.y);
            this.confirmedSelection = null;
            this.hoveredCell = null;
        } else {
            // First tap - show preview
            this.confirmedSelection = { x: cell.x, y: cell.y, valid };
        }
    }

    // ===== Game Actions =====

    attemptClaim(x, y) {
        if (this.isHost) {
            this.executeClaim(this.playerId, x, y);
        } else {
            sendMessage('claimterritory_action', {
                action: 'claim',
                x,
                y
            });
        }
    }

    // ===== Host-side Action Execution =====

    handleGuestAction(data) {
        if (!this.isHost) return;
        if (this.state.currentTurn !== this.opponentId) return;

        if (data.action === 'claim') {
            this.executeClaim(this.opponentId, data.x, data.y);
        }
    }

    executeClaim(playerId, x, y) {
        if (this.state.phase !== 'playing') return;
        if (!isValidClaim(this.state, playerId, x, y)) return;

        // Claim cell
        this.state.grid[y][x] = playerId;
        this.state.cellCounts[playerId]++;

        // Check win condition
        const winCheck = checkWinCondition(this.state);

        if (winCheck.gameOver) {
            this.state.winner = winCheck.winner;
            this.state.phase = 'gameover';
            this.broadcastState();
            return;
        }

        if (winCheck.skipTurn) {
            // Current player stuck but opponent has moves - auto-skip turn
            this.switchTurn();

            // Check if next player also stuck
            const nextCheck = checkWinCondition(this.state);
            if (nextCheck.gameOver) {
                this.state.winner = nextCheck.winner;
                this.state.phase = 'gameover';
                this.broadcastState();
                return;
            }
        }

        // Normal turn switch
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
            sendMessage('claimterritory_state', this.state);
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

        // Initialize starting positions
        this.state.grid[0][0] = 'p1';
        this.state.grid[9][9] = 'p2';

        this.hoveredCell = null;
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
        offMessage('claimterritory_action');
        offMessage('claimterritory_state');
        offMessage('player_name');
        offMessage('rematch_request');
        offMessage('forfeit_request');

        super.destroy();
    }
}
