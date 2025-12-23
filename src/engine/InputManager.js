// Input Manager - Handle touch, mouse, and keyboard input

export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.paddleY = 0.5;         // Normalized position (0-1)
        this.touching = false;

        // Bind event handlers
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);

        // Keyboard state
        this.keysPressed = new Set();
        this.keyboardSpeed = 0.02;   // Movement per frame

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd);

        // Mouse events
        this.canvas.addEventListener('mousemove', this.handleMouseMove);

        // Keyboard events
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    handleTouchStart(e) {
        e.preventDefault();
        this.touching = true;
        this.updatePositionFromTouch(e.touches[0]);
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length > 0) {
            this.updatePositionFromTouch(e.touches[0]);
        }
    }

    handleTouchEnd() {
        this.touching = false;
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.paddleY = (e.clientY - rect.top) / rect.height;
        this.paddleY = Math.max(0, Math.min(1, this.paddleY));
    }

    handleKeyDown(e) {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            this.keysPressed.add('up');
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            this.keysPressed.add('down');
        }
    }

    handleKeyUp(e) {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            this.keysPressed.delete('up');
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            this.keysPressed.delete('down');
        }
    }

    updatePositionFromTouch(touch) {
        const rect = this.canvas.getBoundingClientRect();
        this.paddleY = (touch.clientY - rect.top) / rect.height;
        this.paddleY = Math.max(0, Math.min(1, this.paddleY));
    }

    // Called each frame to update from keyboard
    update(deltaTime) {
        if (this.keysPressed.has('up')) {
            this.paddleY -= this.keyboardSpeed;
        }
        if (this.keysPressed.has('down')) {
            this.paddleY += this.keyboardSpeed;
        }
        this.paddleY = Math.max(0, Math.min(1, this.paddleY));
    }

    // Get the current paddle position
    getPaddleY() {
        return this.paddleY;
    }

    // Set paddle position (for syncing opponent)
    setPaddleY(y) {
        this.paddleY = y;
    }

    // Cleanup
    destroy() {
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
    }
}
