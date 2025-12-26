// Liquid Wars Renderer - Efficient grid drawing

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function indexFor(x, y, width) {
    return y * width + x;
}

export class LiquidWarsRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.offscreen = document.createElement('canvas');
        this.offscreenCtx = this.offscreen.getContext('2d');
        this.imageData = null;

        this.colors = {
            background: '#101523',
            wall: [28, 32, 48, 255],
            p1: [80, 160, 255],
            p2: [255, 96, 96],
            baseP1: [47, 126, 251, 255],
            baseP2: [242, 84, 84, 255],
            cursorP1: '#99c5ff',
            cursorP2: '#ffb3b3'
        };
    }

    ensureBuffer(width, height) {
        if (this.offscreen.width !== width || this.offscreen.height !== height) {
            this.offscreen.width = width;
            this.offscreen.height = height;
            this.offscreenCtx = this.offscreen.getContext('2d');
            this.imageData = this.offscreenCtx.createImageData(width, height);
        }
    }

    render(state, config) {
        if (!state || !state.grid) {
            return;
        }

        const { width, height, walkable } = state.grid;
        this.ensureBuffer(width, height);

        const data = this.imageData.data;
        const p1Densities = state.densities?.p1 || [];
        const p2Densities = state.densities?.p2 || [];
        const maxDensity = config?.maxDensityForColor ?? 30;
        const wallColor = this.colors.wall;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = indexFor(x, y, width);
                const offset = index * 4;

                if (walkable && walkable[index] === false) {
                    data[offset] = wallColor[0];
                    data[offset + 1] = wallColor[1];
                    data[offset + 2] = wallColor[2];
                    data[offset + 3] = wallColor[3];
                    continue;
                }

                const p1Density = p1Densities[index] || 0;
                const p2Density = p2Densities[index] || 0;

                if (p1Density <= 0 && p2Density <= 0) {
                    data[offset] = 0;
                    data[offset + 1] = 0;
                    data[offset + 2] = 0;
                    data[offset + 3] = 0;
                    continue;
                }

                const useP1 = p1Density >= p2Density;
                const density = useP1 ? p1Density : p2Density;
                const color = useP1 ? this.colors.p1 : this.colors.p2;
                const alpha = Math.round(clamp(density / maxDensity, 0.1, 1) * 255);

                data[offset] = color[0];
                data[offset + 1] = color[1];
                data[offset + 2] = color[2];
                data[offset + 3] = alpha;
            }
        }

        if (state.bases) {
            for (const base of state.bases) {
                const index = indexFor(base.x, base.y, width);
                const offset = index * 4;
                const baseColor = base.owner === 'p1' ? this.colors.baseP1 : this.colors.baseP2;
                data[offset] = baseColor[0];
                data[offset + 1] = baseColor[1];
                data[offset + 2] = baseColor[2];
                data[offset + 3] = baseColor[3];
            }
        }

        this.offscreenCtx.putImageData(this.imageData, 0, 0);

        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);

        this.drawCursor(state.cursors?.p1, this.colors.cursorP1, width, height);
        this.drawCursor(state.cursors?.p2, this.colors.cursorP2, width, height);
    }

    drawCursor(cursor, color, gridWidth, gridHeight) {
        if (!cursor) {
            return;
        }

        const x = cursor.x * this.canvas.width;
        const y = cursor.y * this.canvas.height;
        const cellSize = Math.min(this.canvas.width / gridWidth, this.canvas.height / gridHeight);
        const radius = Math.max(2, cellSize * 0.45);

        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = Math.max(1, radius * 0.2);
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(x - radius, y);
        this.ctx.lineTo(x + radius, y);
        this.ctx.moveTo(x, y - radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.stroke();
        this.ctx.restore();
    }
}
