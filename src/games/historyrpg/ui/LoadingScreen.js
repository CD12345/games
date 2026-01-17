// History RPG - Loading Screen
// Shows progress during scenario generation

import { debugLog } from '../../../ui/DebugOverlay.js';

export class LoadingScreen {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Progress state
        this.progress = 0;
        this.status = 'Initializing...';
        this.isVisible = false;

        // Animation
        this.animationFrame = 0;
        this.dots = '';

        // Styling
        this.backgroundColor = '#0a0a12';
        this.primaryColor = '#c9a227';
        this.textColor = '#ffffff';
        this.subtextColor = '#888888';
    }

    // Show the loading screen
    show() {
        this.isVisible = true;
        this.progress = 0;
        this.status = 'Initializing...';
        debugLog('[LoadingScreen] Shown');
    }

    // Hide the loading screen
    hide() {
        this.isVisible = false;
        debugLog('[LoadingScreen] Hidden');
    }

    // Update progress
    setProgress(progress, status) {
        this.progress = Math.max(0, Math.min(100, progress));
        this.status = status || this.status;
    }

    // Update animation
    update(deltaTime) {
        if (!this.isVisible) return;

        this.animationFrame += deltaTime * 3;

        // Animate dots
        const dotCount = Math.floor(this.animationFrame) % 4;
        this.dots = '.'.repeat(dotCount);
    }

    // Render the loading screen
    render() {
        if (!this.isVisible) return;

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Check for valid canvas dimensions
        if (width === 0 || height === 0) {
            console.warn('[LoadingScreen] Canvas has zero dimensions:', width, height);
            return;
        }

        const centerX = width / 2;
        const centerY = height / 2;

        // Background
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, width, height);

        // Title
        ctx.fillStyle = this.primaryColor;
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('HISTORY RPG', centerX, centerY - 100);

        // Subtitle
        ctx.fillStyle = this.textColor;
        ctx.font = '18px monospace';
        ctx.fillText('Generating Your Adventure', centerX, centerY - 60);

        // Progress bar background
        const barWidth = 400;
        const barHeight = 20;
        const barX = centerX - barWidth / 2;
        const barY = centerY - 10;

        ctx.fillStyle = '#222';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Progress bar fill
        const fillWidth = (this.progress / 100) * barWidth;
        ctx.fillStyle = this.primaryColor;
        ctx.fillRect(barX, barY, fillWidth, barHeight);

        // Progress bar border
        ctx.strokeStyle = this.primaryColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // Progress percentage
        ctx.fillStyle = this.textColor;
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`${Math.round(this.progress)}%`, centerX, barY + 15);

        // Status text
        ctx.fillStyle = this.subtextColor;
        ctx.font = '14px monospace';
        ctx.fillText(this.status + this.dots, centerX, centerY + 40);

        // Tips at the bottom
        this.renderTips(centerY + 100);
    }

    // Render rotating tips
    renderTips(y) {
        const tips = [
            'The AI is creating a unique historical adventure just for you.',
            'NPCs will remember your choices and react accordingly.',
            'Explore carefully - items can be found in unexpected places.',
            'Trade with merchants to get what you need.',
            'Your decisions can change the course of history.',
            'Talk to everyone - even minor characters may have useful information.'
        ];

        const tipIndex = Math.floor(this.animationFrame / 4) % tips.length;
        const tip = tips[tipIndex];

        const ctx = this.ctx;
        ctx.fillStyle = this.subtextColor;
        ctx.font = 'italic 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(tip, this.canvas.width / 2, y);
    }

    // Render error state
    renderError(message) {
        if (!this.isVisible) return;

        const ctx = this.ctx;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        // Background
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Error title
        ctx.fillStyle = '#e74c3c';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Generation Failed', centerX, centerY - 40);

        // Error message
        ctx.fillStyle = this.textColor;
        ctx.font = '16px monospace';

        // Word wrap the message
        const maxWidth = 500;
        const words = message.split(' ');
        let line = '';
        let lineY = centerY;

        for (const word of words) {
            const testLine = line + word + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && line !== '') {
                ctx.fillText(line, centerX, lineY);
                line = word + ' ';
                lineY += 24;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, centerX, lineY);

        // Retry hint
        ctx.fillStyle = this.subtextColor;
        ctx.font = '14px monospace';
        ctx.fillText('Press SPACE or click to return to menu', centerX, centerY + 80);
    }
}
