// Pong Renderer - Handle all drawing

import { PONG_CONFIG } from './config.js';

export class PongRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Colors
        this.colors = {
            background: '#1a1a2e',
            paddle: '#e94560',
            paddleOpponent: '#4a90d9',
            ball: '#ffffff',
            text: '#ffffff',
            textDim: '#666666',
            centerLine: '#333333'
        };
    }

    render(state, playerNumber) {
        const { ball, paddles, scores, round } = state;
        const config = PONG_CONFIG;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const flipY = playerNumber === 1;

        // Clear canvas
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, w, h);

        // Draw center line
        this.drawCenterLine();

        // Draw paddles
        // Player 1 is always at top, Player 2 at bottom
        // But colors depend on which player you are
        const p1Color = playerNumber === 1 ? this.colors.paddle : this.colors.paddleOpponent;
        const p2Color = playerNumber === 2 ? this.colors.paddle : this.colors.paddleOpponent;

        this.drawPaddle(paddles.p1, config.paddle.offset, p1Color, flipY);
        this.drawPaddle(paddles.p2, 1 - config.paddle.offset - config.paddle.height, p2Color, flipY);

        // Draw ball
        this.drawBall(ball.x, flipY ? 1 - ball.y : ball.y);

        // Draw scores
        this.drawScores(scores, playerNumber, flipY);

        // Draw countdown or game over
        if (round.phase === 'countdown') {
            const elapsed = Date.now() - round.startTime;
            const remaining = Math.ceil((config.game.launchDelay - elapsed) / 1000);
            this.drawCountdown(remaining);
        } else if (round.phase === 'scored') {
            const scorer = round.lastScorer === 'p1' ? 'Player 1' : 'Player 2';
            const isYou = (round.lastScorer === 'p1' && playerNumber === 1) ||
                          (round.lastScorer === 'p2' && playerNumber === 2);
            this.drawMessage(isYou ? 'You scored!' : `${scorer} scored!`);
        } else if (round.phase === 'gameover') {
            const isWinner = (round.winner === 'p1' && playerNumber === 1) ||
                             (round.winner === 'p2' && playerNumber === 2);
            this.drawGameOver(isWinner);
        }
    }

    drawCenterLine() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.strokeStyle = this.colors.centerLine;
        this.ctx.setLineDash([10, 10]);
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, h / 2);
        this.ctx.lineTo(w, h / 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawPaddle(x, y, color, flipY = false) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const config = PONG_CONFIG;

        const paddleW = config.paddle.width * w;
        const paddleH = config.paddle.height * h;
        const paddleX = x * w - paddleW / 2;
        const paddleY = (flipY ? 1 - y - config.paddle.height : y) * h;

        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.roundRect(paddleX, paddleY, paddleW, paddleH, 4);
        this.ctx.fill();
    }

    drawBall(x, y) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const radius = PONG_CONFIG.ball.radius * w;

        this.ctx.fillStyle = this.colors.ball;
        this.ctx.beginPath();
        this.ctx.arc(x * w, y * h, radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Add glow effect
        this.ctx.shadowColor = this.colors.ball;
        this.ctx.shadowBlur = 10;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
    }

    drawScores(scores, playerNumber, flipY = false) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.font = 'bold 48px sans-serif';
        this.ctx.textAlign = 'center';

        // Top score (Player 1's score)
        this.ctx.fillStyle = playerNumber === 1 ? this.colors.paddle : this.colors.paddleOpponent;
        const topScoreY = flipY ? h * 0.75 + 20 : h * 0.25;
        this.ctx.fillText(scores.p1.toString(), w / 2, topScoreY);

        // Bottom score (Player 2's score)
        this.ctx.fillStyle = playerNumber === 2 ? this.colors.paddle : this.colors.paddleOpponent;
        const bottomScoreY = flipY ? h * 0.25 : h * 0.75 + 20;
        this.ctx.fillText(scores.p2.toString(), w / 2, bottomScoreY);
    }

    drawCountdown(seconds) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.font = 'bold 72px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = this.colors.text;
        this.ctx.fillText(seconds.toString(), w / 2, h / 2 + 20);
    }

    drawMessage(message) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.font = 'bold 24px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = this.colors.text;
        this.ctx.fillText(message, w / 2, h / 2);
    }

    drawGameOver(isWinner) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, w, h);

        this.ctx.textAlign = 'center';

        // Main message
        this.ctx.font = 'bold 36px sans-serif';
        this.ctx.fillStyle = isWinner ? '#4ade80' : '#ef4444';
        this.ctx.fillText(isWinner ? 'You Win!' : 'You Lose!', w / 2, h / 2 - 20);

        // Sub message
        this.ctx.font = '18px sans-serif';
        this.ctx.fillStyle = this.colors.textDim;
        this.ctx.fillText('Game Over', w / 2, h / 2 + 20);
    }
}
