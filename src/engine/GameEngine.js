// Base GameEngine class - Game loop and lifecycle management

export class GameEngine {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = options;

        this.running = false;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.frameId = null;

        // Callbacks
        this.onUpdate = null;
        this.onRender = null;

        // Bind the game loop
        this.gameLoop = this.gameLoop.bind(this);
    }

    // Initialize the game (override in subclass)
    async initialize() {
        // Setup code here
    }

    // Start the game loop
    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.frameId = requestAnimationFrame(this.gameLoop);
    }

    // Pause the game loop
    pause() {
        this.running = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    // Stop and cleanup
    destroy() {
        this.pause();
        // Override in subclass for cleanup
    }

    // Main game loop
    gameLoop(currentTime) {
        if (!this.running) return;

        // Calculate delta time in seconds
        this.deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Cap delta time to prevent large jumps
        if (this.deltaTime > 0.1) {
            this.deltaTime = 0.1;
        }

        // Update game state
        this.update(this.deltaTime);

        // Render
        this.render();

        // Continue loop
        this.frameId = requestAnimationFrame(this.gameLoop);
    }

    // Update game state (override in subclass)
    update(deltaTime) {
        if (this.onUpdate) {
            this.onUpdate(deltaTime);
        }
    }

    // Render the game (override in subclass)
    render() {
        if (this.onRender) {
            this.onRender(this.ctx);
        }
    }

    // Clear the canvas
    clear(color = '#1a1a2e') {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Get canvas dimensions
    getWidth() {
        return this.canvas.width;
    }

    getHeight() {
        return this.canvas.height;
    }
}
