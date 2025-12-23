// Responsive canvas scaling

export class ResponsiveCanvas {
    constructor(canvas, aspectRatio = 9 / 16) {
        this.canvas = canvas;
        this.aspectRatio = aspectRatio;

        this.resize = this.resize.bind(this);
        window.addEventListener('resize', this.resize);
        this.resize();
    }

    resize() {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const targetRatio = this.aspectRatio;

        let width, height;

        if (vw / vh > targetRatio) {
            // Window is wider than target ratio - fit to height
            height = vh;
            width = vh * targetRatio;
        } else {
            // Window is taller than target ratio - fit to width
            width = vw;
            height = vw / targetRatio;
        }

        this.canvas.width = width;
        this.canvas.height = height;

        // Center canvas
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = `${(vw - width) / 2}px`;
        this.canvas.style.top = `${(vh - height) / 2}px`;
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
