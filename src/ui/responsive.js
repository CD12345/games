// Responsive canvas scaling

export class ResponsiveCanvas {
    constructor(canvas, aspectRatio = 9 / 16, container = null) {
        this.canvas = canvas;
        this.aspectRatio = aspectRatio;
        this.container = container || canvas.parentElement || document.body;

        this.resize = this.resize.bind(this);
        window.addEventListener('resize', this.resize);
        this.resize();
    }

    resize() {
        const rect = this.container.getBoundingClientRect();
        const containerWidth = rect.width || window.innerWidth;
        const containerHeight = rect.height || window.innerHeight;
        const targetRatio = this.aspectRatio;

        let width, height;

        if (containerWidth / containerHeight > targetRatio) {
            // Container is wider than target ratio - fit to height
            height = containerHeight;
            width = containerHeight * targetRatio;
        } else {
            // Container is taller than target ratio - fit to width
            width = containerWidth;
            height = containerWidth / targetRatio;
        }

        this.canvas.width = width;
        this.canvas.height = height;

        // Center canvas within container
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = `${(containerWidth - width) / 2}px`;
        this.canvas.style.top = `${(containerHeight - height) / 2}px`;
    }

    // Get normalized coordinates from screen coordinates
    screenToNormalized(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (screenX - rect.left) / rect.width,
            y: (screenY - rect.top) / rect.height
        };
    }

    // Get screen coordinates from normalized coordinates
    normalizedToScreen(normX, normY) {
        return {
            x: normX * this.canvas.width,
            y: normY * this.canvas.height
        };
    }

    // Cleanup
    destroy() {
        window.removeEventListener('resize', this.resize);
    }
}
