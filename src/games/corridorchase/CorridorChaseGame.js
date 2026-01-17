// Corridor Chase Game - Main game logic (P2P version)

import { GameEngine } from '../../engine/GameEngine.js';
import { onMessage, offMessage, sendMessage } from '../../core/peer.js';
import { CorridorChaseRenderer } from './CorridorChaseRenderer.js';
import { debugLog } from '../../ui/DebugOverlay.js';
import { CORRIDOR_CONFIG, getInitialState } from './config.js';
import { getValidMoves, isValidWallPlacement } from './PathValidator.js';

function getCookie(name) {
    const prefix = `${name}=`;
    const parts = document.cookie.split(';');
    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith(prefix)) {
            return decodeURIComponent(trimmed.slice(prefix.length));
        }
    }
    return '';
}

function normalizeName(value) {
    return (value || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
}

export class CorridorChaseGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber, settings = {}) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber; // 1 or 2
        this.playerId = playerNumber === 1 ? 'p1' : 'p2';
        this.opponentId = playerNumber === 1 ? 'p2' : 'p1';
        this.settings = settings;

        // Game state
        this.state = getInitialState();
        this.localName = normalizeName(getCookie('playerName')) || `Player ${this.playerNumber}`;

        // Renderer
        this.renderer = new CorridorChaseRenderer(canvas);

        // Preview state (local only, not synced)
        this.previewData = null;
        this.confirmedPreview = false; // True when preview is locked in, waiting for confirmation tap

        // Game over handling
        this.onGameOver = null;
        this.onGameReset = null;
        this.gameOverNotified = false;

        // Countdown timer
        this.countdownStartTime = null;

        // Touch tracking for drag
        this.touchStartPos = null;
        this.isDragging = false;
    }

    async initialize() {
        debugLog(`Corridor Chase init: ${this.isHost ? 'host' : 'guest'}, player ${this.playerNumber}`);

        // Set player name
        if (!this.state.playerNames) {
            this.state.playerNames = { p1: 'Player 1', p2: 'Player 2' };
        }
        this.state.playerNames[this.playerId] = this.localName;

        // Set up network message handlers
        onMessage('player_name', (data) => {
            const playerId = data?.playerId === 'p1' ? 'p1' : 'p2';
            const name = normalizeName(data?.name);
            if (!name) {
                return;
            }
            this.state.playerNames[playerId] = name;
            if (this.isHost) {
                this.broadcastState();
            }
        });

        // Send player name
        sendMessage('player_name', { playerId: this.playerId, name: this.localName });

        // Set up game-specific message handlers
        if (this.isHost) {
            // Host receives actions from guest
            onMessage('corridorchase_action', (data) => {
                this.handleGuestAction(data);
            });

            // Host handles rematch requests
            onMessage('rematch_request', () => {
                if (this.state.phase === 'gameover') {
                    this.resetMatch();
                    if (this.onGameReset) {
                        this.onGameReset();
                    }
                }
            });

            // Host handles forfeit
            onMessage('forfeit_request', (data) => {
                if (this.state.phase === 'gameover') {
                    return;
                }
                const forfeiting = data?.by === 'p2' ? 'p2' : 'p1';
                this.applyForfeit(forfeiting);
            });

            // Initialize countdown
            this.countdownStartTime = Date.now();
            this.broadcastState();
        } else {
            // Guest receives state updates from host
            onMessage('corridorchase_state', (data) => {
                if (data) {
                    this.state = { ...this.state, ...data };

                    // Check for game over
                    if (this.state.phase === 'gameover' && !this.gameOverNotified) {
                        this.gameOverNotified = true;
                        if (this.onGameOver) {
                            this.onGameOver(this.state.winner);
                        }
                    }
                }
            });
        }

        // Set up input handlers
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => {
            if (!this.confirmedPreview) {
                this.previewData = null;
            }
        });

        // Touch handlers for mobile
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

        debugLog('Corridor Chase initialized');
    }

    /**
     * Handle action from guest player (host only)
     */
    handleGuestAction(data) {
        if (!this.isHost) return;
        if (!data || !data.action) return;

        // Verify it's the guest's turn
        if (this.state.currentTurn !== this.opponentId) {
            debugLog('Ignoring action: not guest turn');
            return;
        }

        if (data.action === 'move') {
            this.executeMove(this.opponentId, data.x, data.y);
        } else if (data.action === 'place_wall') {
            this.executePlaceWall(this.opponentId, data.wallX, data.wallY, data.orientation);
        }
    }

    /**
     * Execute a move action (host only)
     */
    executeMove(playerId, x, y) {
        if (!this.isHost) return;
        if (this.state.phase !== 'playing') return;
        if (this.state.currentTurn !== playerId) return;

        // Validate move
        const validMoves = getValidMoves(this.state, playerId);
        const isValid = validMoves.some(m => m.x === x && m.y === y);

        if (!isValid) {
            debugLog(`Invalid move: ${x}, ${y}`);
            return;
        }

        // Execute move
        this.state.pawns[playerId].x = x;
        this.state.pawns[playerId].y = y;

        // Check win condition
        const winner = this.checkWinCondition();
        if (winner) {
            this.state.winner = winner;
            this.state.phase = 'gameover';
            this.gameOverNotified = true;
            if (this.onGameOver) {
                this.onGameOver(winner);
            }
        } else {
            // Switch turn
            this.switchTurn();
        }

        this.broadcastState();
    }

    /**
     * Execute a wall placement action (host only)
     */
    executePlaceWall(playerId, x, y, orientation) {
        if (!this.isHost) return;
        if (this.state.phase !== 'playing') return;
        if (this.state.currentTurn !== playerId) return;

        // Check if player has walls remaining
        if (this.state.wallsRemaining[playerId] <= 0) {
            debugLog('No walls remaining');
            return;
        }

        // Validate wall placement
        if (!isValidWallPlacement(this.state, x, y, orientation)) {
            debugLog(`Invalid wall placement: ${x}, ${y}, ${orientation}`);
            return;
        }

        // Place wall
        this.state.walls.push({ x, y, orientation, owner: playerId });
        this.state.wallsRemaining[playerId]--;

        // Switch turn
        this.switchTurn();

        this.broadcastState();
    }

    /**
     * Switch to the other player's turn
     */
    switchTurn() {
        this.state.currentTurn = this.state.currentTurn === 'p1' ? 'p2' : 'p1';
        this.state.turnNumber++;
    }

    /**
     * Check win condition
     */
    checkWinCondition() {
        if (this.state.pawns.p1.y === CORRIDOR_CONFIG.goalRows.p1) {
            return 'p1';
        }
        if (this.state.pawns.p2.y === CORRIDOR_CONFIG.goalRows.p2) {
            return 'p2';
        }
        return null;
    }

    /**
     * Broadcast state to guest (host only)
     */
    broadcastState() {
        if (!this.isHost) return;
        sendMessage('corridorchase_state', this.state);
    }

    /**
     * Handle click on canvas
     */
    handleClick(e) {
        if (this.state.phase !== 'playing') return;
        if (this.state.currentTurn !== this.playerId) return;

        const rect = this.canvas.getBoundingClientRect();
        const pixelX = e.clientX - rect.left;
        const pixelY = e.clientY - rect.top;

        this.handleTapOrClick(pixelX, pixelY);
    }

    /**
     * Handle tap or click at pixel coordinates
     * First tap: Show preview
     * Second tap on same position: Confirm action
     * Tap elsewhere: Change preview
     */
    handleTapOrClick(pixelX, pixelY) {
        // Try wall detection first (if near edge)
        const wallData = this.renderer.pixelToWall(pixelX, pixelY);

        let newPreview = null;

        if (wallData && this.state.wallsRemaining[this.playerId] > 0) {
            // Wall preview
            newPreview = {
                type: 'wall',
                x: wallData.x,
                y: wallData.y,
                orientation: wallData.orientation,
                valid: isValidWallPlacement(this.state, wallData.x, wallData.y, wallData.orientation)
            };
        } else {
            // Move preview
            const gridPos = this.renderer.pixelToGrid(pixelX, pixelY);
            if (gridPos) {
                const validMoves = getValidMoves(this.state, this.playerId);
                const isValid = validMoves.some(m => m.x === gridPos.x && m.y === gridPos.y);

                newPreview = {
                    type: 'move',
                    x: gridPos.x,
                    y: gridPos.y,
                    valid: isValid
                };
            }
        }

        // Check if tapping on the same preview (confirmation tap)
        if (this.confirmedPreview && this.previewData && newPreview &&
            this.previewData.type === newPreview.type &&
            this.previewData.x === newPreview.x &&
            this.previewData.y === newPreview.y &&
            (this.previewData.type === 'move' || this.previewData.orientation === newPreview.orientation)) {

            // Second tap on same position - confirm action
            if (newPreview.valid) {
                if (newPreview.type === 'move') {
                    this.attemptMove(newPreview.x, newPreview.y);
                } else if (newPreview.type === 'wall') {
                    this.attemptPlaceWall(newPreview.x, newPreview.y, newPreview.orientation);
                }
                this.previewData = null;
                this.confirmedPreview = false;
            }
        } else {
            // First tap or different position - show preview
            this.previewData = newPreview;
            this.confirmedPreview = true;
        }
    }

    /**
     * Handle mouse move on canvas (desktop hover)
     */
    handleMouseMove(e) {
        if (this.state.phase !== 'playing') return;
        if (this.state.currentTurn !== this.playerId) return;
        if (this.confirmedPreview) return; // Don't update preview if user has confirmed one

        const rect = this.canvas.getBoundingClientRect();
        const pixelX = e.clientX - rect.left;
        const pixelY = e.clientY - rect.top;

        this.updatePreviewAtPosition(pixelX, pixelY);
    }

    /**
     * Update preview based on position
     */
    updatePreviewAtPosition(pixelX, pixelY) {
        // Try wall detection first
        const wallData = this.renderer.pixelToWall(pixelX, pixelY);

        if (wallData && this.state.wallsRemaining[this.playerId] > 0) {
            // Show wall preview
            this.previewData = {
                type: 'wall',
                x: wallData.x,
                y: wallData.y,
                orientation: wallData.orientation,
                valid: isValidWallPlacement(this.state, wallData.x, wallData.y, wallData.orientation)
            };
        } else {
            // Show move preview
            const gridPos = this.renderer.pixelToGrid(pixelX, pixelY);
            if (gridPos) {
                const validMoves = getValidMoves(this.state, this.playerId);
                const isValid = validMoves.some(m => m.x === gridPos.x && m.y === gridPos.y);

                this.previewData = {
                    type: 'move',
                    x: gridPos.x,
                    y: gridPos.y,
                    valid: isValid
                };
            } else {
                this.previewData = null;
            }
        }
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
        if (this.state.phase !== 'playing') return;
        if (this.state.currentTurn !== this.playerId) return;

        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = touch.clientX - rect.left;
        const pixelY = touch.clientY - rect.top;

        this.touchStartPos = { x: pixelX, y: pixelY };
        this.isDragging = false;
    }

    /**
     * Handle touch move (drag to adjust preview)
     */
    handleTouchMove(e) {
        if (this.state.phase !== 'playing') return;
        if (this.state.currentTurn !== this.playerId) return;
        if (!this.touchStartPos) return;

        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = touch.clientX - rect.left;
        const pixelY = touch.clientY - rect.top;

        // Check if moved enough to count as drag
        const dx = pixelX - this.touchStartPos.x;
        const dy = pixelY - this.touchStartPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 5) {
            this.isDragging = true;
            this.confirmedPreview = true; // Lock in preview mode
            this.updatePreviewAtPosition(pixelX, pixelY);
        }
    }

    /**
     * Handle touch end (tap to confirm or start new preview)
     */
    handleTouchEnd(e) {
        if (this.state.phase !== 'playing') return;
        if (this.state.currentTurn !== this.playerId) return;
        if (!this.touchStartPos) return;

        e.preventDefault();

        const touch = e.changedTouches[0];
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = touch.clientX - rect.left;
        const pixelY = touch.clientY - rect.top;

        if (!this.isDragging) {
            // Was a tap, not a drag
            this.handleTapOrClick(pixelX, pixelY);
        }

        this.touchStartPos = null;
        this.isDragging = false;
    }

    /**
     * Attempt to move pawn
     */
    attemptMove(x, y) {
        const validMoves = getValidMoves(this.state, this.playerId);
        const isValid = validMoves.some(m => m.x === x && m.y === y);

        if (!isValid) {
            return;
        }

        if (this.isHost) {
            // Host executes directly
            this.executeMove(this.playerId, x, y);
        } else {
            // Guest sends action to host
            sendMessage('corridorchase_action', {
                action: 'move',
                x: x,
                y: y
            });
        }
    }

    /**
     * Attempt to place wall
     */
    attemptPlaceWall(x, y, orientation) {
        if (!isValidWallPlacement(this.state, x, y, orientation)) {
            return;
        }

        if (this.isHost) {
            // Host executes directly
            this.executePlaceWall(this.playerId, x, y, orientation);
        } else {
            // Guest sends action to host
            sendMessage('corridorchase_action', {
                action: 'place_wall',
                wallX: x,
                wallY: y,
                orientation: orientation
            });
        }
    }

    /**
     * Handle forfeit
     */
    applyForfeit(playerId) {
        if (this.state.phase === 'gameover') return;

        this.state.forfeitBy = playerId;
        this.state.winner = playerId === 'p1' ? 'p2' : 'p1';
        this.state.phase = 'gameover';

        if (this.isHost) {
            this.broadcastState();
        }

        this.gameOverNotified = true;
        if (this.onGameOver) {
            this.onGameOver(this.state.winner);
        }
    }

    /**
     * Request forfeit
     */
    forfeit() {
        if (this.state.phase === 'gameover') return;

        if (this.isHost) {
            this.applyForfeit(this.playerId);
        } else {
            sendMessage('forfeit_request', { by: this.playerId });
            this.applyForfeit(this.playerId);
        }
    }

    /**
     * Reset match for rematch
     */
    resetMatch() {
        this.state = getInitialState();
        this.state.playerNames[this.playerId] = this.localName;
        this.gameOverNotified = false;
        this.previewData = null;
        this.confirmedPreview = false;
        this.countdownStartTime = Date.now();

        if (this.isHost) {
            this.broadcastState();
        }
    }

    /**
     * Request rematch
     */
    requestRematch() {
        if (this.state.phase !== 'gameover') return;

        if (this.isHost) {
            this.resetMatch();
            if (this.onGameReset) {
                this.onGameReset();
            }
        } else {
            sendMessage('rematch_request', {});
        }
    }

    /**
     * Update game loop
     */
    update(deltaTime) {
        // Update elapsed time
        this.state.elapsed += deltaTime * 1000;

        // Handle countdown phase
        if (this.state.phase === 'countdown' && this.isHost) {
            if (this.countdownStartTime && Date.now() - this.countdownStartTime >= CORRIDOR_CONFIG.countdownDuration) {
                this.state.phase = 'playing';
                this.countdownStartTime = null;
                this.broadcastState();
            }
        }
    }

    /**
     * Render game
     */
    render() {
        const ctx = this.ctx;
        this.renderer.render(ctx, this.state, this.playerNumber, this.previewData, this.confirmedPreview);
    }

    /**
     * Clean up
     */
    destroy() {
        offMessage('player_name');
        offMessage('corridorchase_action');
        offMessage('corridorchase_state');
        offMessage('rematch_request');
        offMessage('forfeit_request');
    }
}
