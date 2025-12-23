// Pong Game - Main game logic (P2P version)

import { GameEngine } from '../../engine/GameEngine.js';
import { InputManager } from '../../engine/InputManager.js';
import { NetworkSync } from '../../engine/NetworkSync.js';
import { onMessage, offMessage, sendMessage } from '../../core/peer.js';
import { PongRenderer } from './PongRenderer.js';
import { PONG_CONFIG, getInitialState } from './config.js';

export class PongGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber; // 1 or 2
        this.playerId = playerNumber === 1 ? 'p1' : 'p2';
        this.opponentId = playerNumber === 1 ? 'p2' : 'p1';

        // Game state
        this.state = getInitialState();

        // Components
        this.input = new InputManager(canvas);
        this.network = new NetworkSync(gameCode, isHost);
        this.renderer = new PongRenderer(canvas);

        // Timing
        this.lastInputSync = 0;
        this.inputSyncInterval = 1000 / 60; // 60 updates per second

        // Game over handling
        this.onGameOver = null;
        this.onGameReset = null;
        this.gameOverNotified = false;
    }

    async initialize() {
        // Set up network callbacks
        if (this.isHost) {
            // Host receives guest input
            this.network.onInputUpdate = (input) => {
                if (input && input.paddleY !== undefined) {
                    this.state.paddles[this.opponentId] = input.paddleY;
                }
            };
        } else {
            // Guest receives authoritative state from host
            this.network.onStateUpdate = (state) => {
                if (state) {
                    this.state = { ...this.state, ...state };
                }
            };
        }

        // Start network sync
        this.network.start();

        // If host, initialize the game state
        if (this.isHost) {
            this.resetBall(this.playerId);
            this.network.sendState(this.state);
        }

        if (this.isHost) {
            onMessage('rematch_request', () => {
                if (this.state.round.phase === 'gameover') {
                    this.resetMatch();
                    if (this.onGameReset) {
                        this.onGameReset();
                    }
                }
            });

            onMessage('forfeit_request', (data) => {
                if (this.state.round.phase === 'gameover') {
                    return;
                }
                const forfeiting = data?.by === 'p2' ? 'p2' : 'p1';
                this.applyForfeit(forfeiting);
            });
        }
    }

    update(deltaTime) {
        // Update input from keyboard
        this.input.update(deltaTime);

        // Update local paddle position
        this.state.paddles[this.playerId] = this.input.getPaddleY();

        // Send input to peer
        this.syncInput();

        if (this.isHost) {
            // Host runs the simulation
            this.updateGameLogic(deltaTime);
            this.network.sendState(this.state);
        } else {
            // Guest interpolates
            this.network.updateInterpolation(deltaTime);
        }

        this.checkGameOver();
    }

    updateGameLogic(deltaTime) {
        const { ball, paddles, scores, round } = this.state;
        const config = PONG_CONFIG;

        // Handle round phases
        if (round.phase === 'countdown') {
            const elapsed = Date.now() - round.startTime;
            if (elapsed >= config.game.launchDelay) {
                // Launch the ball
                this.launchBall();
                round.phase = 'playing';
            } else {
                // Ball follows the paddle during countdown
                if (ball.onPaddle === 'p1') {
                    ball.y = config.paddle.offset + config.paddle.height / 2;
                    ball.x = paddles.p1;
                } else {
                    ball.y = 1 - config.paddle.offset - config.paddle.height / 2;
                    ball.x = paddles.p2;
                }
            }
            return;
        }

        if (round.phase === 'scored') {
            const elapsed = Date.now() - round.startTime;
            if (elapsed >= 1500) {
                // Start new round
                this.resetBall(round.lastScorer === 'p1' ? 'p2' : 'p1');
            }
            return;
        }

        if (round.phase === 'gameover') {
            return;
        }

        // Playing phase - update ball physics
        const speed = 60; // Target 60fps physics
        ball.x += ball.vx * speed * deltaTime;
        ball.y += ball.vy * speed * deltaTime;

        // Bounce off left/right walls
        if (ball.x - config.ball.radius <= 0) {
            ball.x = config.ball.radius;
            ball.vx = Math.abs(ball.vx);
        }
        if (ball.x + config.ball.radius >= 1) {
            ball.x = 1 - config.ball.radius;
            ball.vx = -Math.abs(ball.vx);
        }

        // Check paddle collisions
        this.checkPaddleCollision('p1', paddles.p1, config.paddle.offset);
        this.checkPaddleCollision('p2', paddles.p2, 1 - config.paddle.offset - config.paddle.height);

        // Check scoring (ball passes top or bottom)
        if (ball.y - config.ball.radius <= 0) {
            // Player 2 scores (ball went past player 1's side)
            this.score('p2');
        } else if (ball.y + config.ball.radius >= 1) {
            // Player 1 scores (ball went past player 2's side)
            this.score('p1');
        }
    }

    checkPaddleCollision(playerId, paddleX, paddleY) {
        const { ball } = this.state;
        const config = PONG_CONFIG;

        const paddleLeft = paddleX - config.paddle.width / 2;
        const paddleRight = paddleX + config.paddle.width / 2;
        const paddleTop = paddleY;
        const paddleBottom = paddleY + config.paddle.height;

        // Check if ball is in paddle zone
        const ballBottom = ball.y + config.ball.radius;
        const ballTop = ball.y - config.ball.radius;

        let collision = false;

        if (playerId === 'p1') {
            // Top paddle - ball moving up
            if (ball.vy < 0 && ballTop <= paddleBottom && ballBottom >= paddleTop) {
                if (ball.x >= paddleLeft && ball.x <= paddleRight) {
                    collision = true;
                    ball.y = paddleBottom + config.ball.radius;
                }
            }
        } else {
            // Bottom paddle - ball moving down
            if (ball.vy > 0 && ballBottom >= paddleTop && ballTop <= paddleBottom) {
                if (ball.x >= paddleLeft && ball.x <= paddleRight) {
                    collision = true;
                    ball.y = paddleTop - config.ball.radius;
                }
            }
        }

        if (collision) {
            // Reverse vertical direction
            ball.vy = -ball.vy;

            // Add horizontal velocity based on where ball hit paddle
            const hitPos = (ball.x - paddleX) / (config.paddle.width / 2);
            ball.vx += hitPos * 0.005;

            // Speed up slightly
            const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
            const newSpeed = Math.min(speed * config.ball.speedIncrease, config.ball.maxSpeed);
            const angle = Math.atan2(ball.vy, ball.vx);
            ball.vx = Math.cos(angle) * newSpeed;
            ball.vy = Math.sin(angle) * newSpeed;
        }
    }

    score(playerId) {
        const { scores, round } = this.state;
        scores[playerId]++;

        round.phase = 'scored';
        round.startTime = Date.now();
        round.lastScorer = playerId;

        // Check for game over
        if (scores[playerId] >= PONG_CONFIG.game.pointsToWin) {
            round.phase = 'gameover';
            round.winner = playerId;
        }
    }

    resetBall(servingPlayer) {
        const config = PONG_CONFIG;
        const { ball, round } = this.state;

        ball.onPaddle = servingPlayer;
        ball.vx = 0;
        ball.vy = 0;

        if (servingPlayer === 'p1') {
            const paddleY = config.paddle.offset;
            ball.y = paddleY + config.paddle.height + 2*config.ball.radius;
            ball.x = this.state.paddles.p1;
        } else {
            const paddleY = 1 - config.paddle.offset - config.paddle.height;
            ball.y = paddleY - config.ball.radius;
            ball.x = this.state.paddles.p2;
        }

        round.phase = 'countdown';
        round.startTime = Date.now();
    }

    resetMatch() {
        this.state = getInitialState();
        this.resetBall('p1');
        this.gameOverNotified = false;
        this.state.round.forfeitBy = null;

        if (this.isHost) {
            this.network.sendState(this.state);
        }
    }

    applyForfeit(forfeitingPlayer) {
        const winner = forfeitingPlayer === 'p1' ? 'p2' : 'p1';
        this.state.round.phase = 'gameover';
        this.state.round.winner = winner;
        this.state.round.forfeitBy = forfeitingPlayer;

        if (this.isHost) {
            this.network.sendState(this.state);
        }

        this.checkGameOver();
    }

    forfeit() {
        if (this.state.round.phase === 'gameover') {
            return;
        }

        if (this.isHost) {
            this.applyForfeit(this.playerId);
            return;
        }

        sendMessage('forfeit_request', { by: this.playerId });
    }

    requestRematch() {
        if (this.isHost) {
            this.resetMatch();
            if (this.onGameReset) {
                this.onGameReset();
            }
            return;
        }

        sendMessage('rematch_request', {});
    }

    checkGameOver() {
        if (this.state.round.phase === 'gameover') {
            if (!this.gameOverNotified) {
                this.gameOverNotified = true;
                if (this.onGameOver) {
                    this.onGameOver({
                        winnerId: this.state.round.winner,
                        forfeitedBy: this.state.round.forfeitBy || null
                    });
                }
            }
            return;
        }

        if (this.gameOverNotified) {
            this.gameOverNotified = false;
            if (this.onGameReset) {
                this.onGameReset();
            }
        }
    }

    launchBall() {
        const { ball } = this.state;
        const config = PONG_CONFIG;

        // Random horizontal direction
        const angle = (Math.random() - 0.5) * Math.PI / 3; // -30 to 30 degrees from vertical

        // Direction based on who's serving
        const direction = ball.onPaddle === 'p1' ? 1 : -1;

        ball.vx = Math.sin(angle) * config.ball.initialSpeed;
        ball.vy = Math.cos(angle) * config.ball.initialSpeed * direction;
        ball.onPaddle = null;
    }

    syncInput() {
        const now = Date.now();
        if (now - this.lastInputSync >= this.inputSyncInterval) {
            this.network.sendInput({
                paddleY: this.state.paddles[this.playerId]
            });
            this.lastInputSync = now;
        }
    }

    render() {
        // Get state to render (interpolated for guest)
        let renderState = this.state;

        if (!this.isHost && this.network.remoteState) {
            // Interpolate ball position for smoother visuals
            renderState = {
                ...this.state,
                ball: {
                    ...this.state.ball,
                    x: this.network.interpolate('ball', 'x') ?? this.state.ball.x,
                    y: this.network.interpolate('ball', 'y') ?? this.state.ball.y
                }
            };
        }

        this.renderer.render(renderState, this.playerNumber);
    }

    destroy() {
        super.destroy();
        this.input.destroy();
        this.network.stop();

        if (this.isHost) {
            offMessage('rematch_request');
            offMessage('forfeit_request');
        }
    }
}
