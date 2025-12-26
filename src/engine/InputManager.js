// Input Manager - Handle touch, mouse, and keyboard input

export class InputManager {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.mode = options.mode || 'paddle';  // 'paddle' or 'cursor'
        this.paddleY = 0.5;         // Normalized position (0-1)
        this.touching = false;

        // Cursor mode state (for 2D games like Liquid War)
        this.cursorX = 0.5;
        this.cursorY = 0.5;
        this.touchPosition = null;  // { x, y } or null

        // Bind event handlers
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
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
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mouseleave', this.handleMouseUp);

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
        this.touchPosition = null;
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        if (this.mode === 'paddle') {
            this.paddleY = Math.max(0, Math.min(1, x));
        } else if (this.mode === 'cursor') {
            // In cursor mode, only update touchPosition if mouse is down
            if (this.touching) {
                this.touchPosition = {
                    x: Math.max(0, Math.min(1, x)),
                    y: Math.max(0, Math.min(1, y)),
                };
            }
        }
    }

    handleMouseDown(e) {
        if (this.mode === 'cursor') {
            this.touching = true;
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            this.touchPosition = {
                x: Math.max(0, Math.min(1, x)),
                y: Math.max(0, Math.min(1, y)),
            };
        }
    }

    handleMouseUp() {
        if (this.mode === 'cursor') {
            this.touching = false;
            this.touchPosition = null;
        }
    }

    handleKeyDown(e) {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            this.keysPressed.add('up');
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            this.keysPressed.add('down');
        }
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            this.keysPressed.add('left');
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            this.keysPressed.add('right');
        }
    }

    handleKeyUp(e) {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            this.keysPressed.delete('up');
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            this.keysPressed.delete('down');
        }
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            this.keysPressed.delete('left');
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            this.keysPressed.delete('right');
        }
    }

    updatePositionFromTouch(touch) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;

        if (this.mode === 'paddle') {
            this.paddleY = Math.max(0, Math.min(1, x));
        } else if (this.mode === 'cursor') {
            this.touchPosition = {
                x: Math.max(0, Math.min(1, x)),
                y: Math.max(0, Math.min(1, y)),
            };
        }
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

    // Get touch/click position (for cursor mode)
    getTouchPosition() {
        return this.touchPosition;
    }

    // Get keyboard state (for cursor mode)
    getKeys() {
        return {
            up: this.keysPressed.has('up'),
            down: this.keysPressed.has('down'),
            left: this.keysPressed.has('left'),
            right: this.keysPressed.has('right'),
        };
    }

    // Cleanup
    destroy() {
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseUp);
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
    }
}
