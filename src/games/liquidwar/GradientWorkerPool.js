// Gradient Worker Pool - Computes gradients in parallel using Web Workers
// Compatible with Edge/Chrome/Safari on PC/iPhone/Android

// Inline worker code as a string (avoids separate file and CORS issues)
const WORKER_CODE = `
// Direction offsets: dx, dy, cost*1000
const DIRS = [
    0, -1, 1000,   // N
    1, -1, 1414,   // NE
    1, 0, 1000,    // E
    1, 1, 1414,    // SE
    0, 1, 1000,    // S
    -1, 1, 1414,   // SW
    -1, 0, 1000,   // W
    -1, -1, 1414   // NW
];

let walls = null;
let gridWidth = 0;
let gridHeight = 0;
let visitedBuffer = null;
let queueBuffer = null;

self.onmessage = function(e) {
    const msg = e.data;

    if (msg.type === 'init') {
        // Initialize with wall data
        gridWidth = msg.width;
        gridHeight = msg.height;
        walls = new Uint8Array(msg.walls);

        // Pre-allocate buffers
        const gridSize = gridWidth * gridHeight;
        visitedBuffer = new Uint8Array(gridSize);
        queueBuffer = new Uint32Array(gridSize * 2);

        self.postMessage({ type: 'ready' });
        return;
    }

    if (msg.type === 'compute') {
        // Compute gradient for given cursor position
        const gradient = computeGradient(msg.cursorX, msg.cursorY, msg.gradientBuffer);

        // Transfer buffer back (zero-copy)
        self.postMessage(
            { type: 'result', requestId: msg.requestId, gradient: gradient },
            [gradient.buffer]
        );
    }
};

function computeGradient(cursorNormX, cursorNormY, existingBuffer) {
    const w = gridWidth;
    const h = gridHeight;
    const gridSize = w * h;

    // Clamp cursor to grid bounds
    const clampedX = Math.max(0, Math.min(0.999, cursorNormX));
    const clampedY = Math.max(0, Math.min(0.999, cursorNormY));
    let cursorX = Math.max(0, Math.min(w - 1, Math.floor(clampedX * w)));
    let cursorY = Math.max(0, Math.min(h - 1, Math.floor(clampedY * h)));

    // Reuse or create gradient array
    const gradient = existingBuffer
        ? new Float32Array(existingBuffer)
        : new Float32Array(gridSize);

    // Reset arrays
    gradient.fill(65535);
    visitedBuffer.fill(0);

    let qHead = 0;
    let qTail = 0;

    // Find starting cell (if cursor is in wall, find nearest walkable)
    let startX = cursorX;
    let startY = cursorY;

    if (walls[cursorY * w + cursorX] === 1) {
        let found = false;
        for (let r = 1; r < Math.max(w, h) && !found; r++) {
            for (let dy = -r; dy <= r && !found; dy++) {
                for (let dx = -r; dx <= r && !found; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const nx = cursorX + dx;
                    const ny = cursorY + dy;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h && walls[ny * w + nx] === 0) {
                        startX = nx;
                        startY = ny;
                        found = true;
                    }
                }
            }
        }
    }

    // Initialize BFS
    const startIdx = startY * w + startX;
    gradient[startIdx] = 0;
    visitedBuffer[startIdx] = 1;
    queueBuffer[qTail++] = startX;
    queueBuffer[qTail++] = startY;

    // BFS flood fill
    while (qHead < qTail) {
        const x = queueBuffer[qHead++];
        const y = queueBuffer[qHead++];
        const idx = y * w + x;
        const dist = gradient[idx];

        for (let d = 0; d < 24; d += 3) {
            const nx = x + DIRS[d];
            const ny = y + DIRS[d + 1];

            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

            const nIdx = ny * w + nx;
            if (visitedBuffer[nIdx] || walls[nIdx] === 1) continue;

            visitedBuffer[nIdx] = 1;
            gradient[nIdx] = dist + DIRS[d + 2] / 1000;
            queueBuffer[qTail++] = nx;
            queueBuffer[qTail++] = ny;
        }
    }

    return gradient;
}
`;

export class GradientWorkerPool {
    constructor(poolSize = 2) {
        this.workers = [];
        this.poolSize = poolSize;
        this.initialized = false;
        this.pendingRequests = new Map();
        this.requestId = 0;
        this.availableWorkers = [];
        this.taskQueue = [];

        // Reusable gradient buffers (one per player)
        this.gradientBuffers = {};
    }

    async initialize(walls, gridWidth, gridHeight) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;

        // Convert 2D walls array to flat Uint8Array for transfer
        const wallsFlat = new Uint8Array(gridWidth * gridHeight);
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                wallsFlat[y * gridWidth + x] = walls[y][x];
            }
        }
        this.wallsFlat = wallsFlat;

        // Create workers
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);

        const initPromises = [];

        for (let i = 0; i < this.poolSize; i++) {
            const worker = new Worker(workerUrl);
            this.workers.push(worker);

            // Set up message handler
            worker.onmessage = (e) => this.handleWorkerMessage(i, e);
            worker.onerror = (e) => console.error('Worker error:', e);

            // Initialize worker with wall data
            const initPromise = new Promise((resolve) => {
                const handler = (e) => {
                    if (e.data.type === 'ready') {
                        worker.removeEventListener('message', handler);
                        this.availableWorkers.push(i);
                        resolve();
                    }
                };
                worker.addEventListener('message', handler);
            });
            initPromises.push(initPromise);

            // Send init message with walls (copy, not transfer, so all workers get it)
            worker.postMessage({
                type: 'init',
                width: gridWidth,
                height: gridHeight,
                walls: wallsFlat.buffer.slice(0)  // Copy for each worker
            });
        }

        await Promise.all(initPromises);
        URL.revokeObjectURL(workerUrl);
        this.initialized = true;
    }

    handleWorkerMessage(workerId, e) {
        const msg = e.data;

        if (msg.type === 'result') {
            const pending = this.pendingRequests.get(msg.requestId);
            if (pending) {
                // Store the returned buffer for reuse
                this.gradientBuffers[pending.team] = msg.gradient;
                pending.resolve(msg.gradient);
                this.pendingRequests.delete(msg.requestId);
            }

            // Mark worker as available
            this.availableWorkers.push(workerId);

            // Process next task in queue
            this.processQueue();
        }
    }

    processQueue() {
        while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
            const task = this.taskQueue.shift();
            const workerId = this.availableWorkers.shift();
            this.sendToWorker(workerId, task);
        }
    }

    sendToWorker(workerId, task) {
        const worker = this.workers[workerId];
        const msg = {
            type: 'compute',
            requestId: task.requestId,
            cursorX: task.cursorX,
            cursorY: task.cursorY
        };

        // Transfer existing buffer back to worker for reuse (if available)
        const existingBuffer = this.gradientBuffers[task.team];
        if (existingBuffer && existingBuffer.buffer.byteLength > 0) {
            msg.gradientBuffer = existingBuffer.buffer;
            worker.postMessage(msg, [existingBuffer.buffer]);
            delete this.gradientBuffers[task.team];
        } else {
            worker.postMessage(msg);
        }
    }

    // Compute gradient for a team - returns Promise<Float32Array>
    computeGradient(team, cursorX, cursorY) {
        if (!this.initialized) {
            return Promise.reject(new Error('Worker pool not initialized'));
        }

        return new Promise((resolve, reject) => {
            const requestId = this.requestId++;

            this.pendingRequests.set(requestId, { resolve, reject, team });

            const task = { requestId, team, cursorX, cursorY };

            if (this.availableWorkers.length > 0) {
                const workerId = this.availableWorkers.shift();
                this.sendToWorker(workerId, task);
            } else {
                this.taskQueue.push(task);
            }
        });
    }

    // Compute all gradients in parallel
    async computeAllGradients(cursors) {
        const promises = [];
        const teams = Object.keys(cursors);

        for (const team of teams) {
            const cursor = cursors[team];
            if (cursor) {
                promises.push(
                    this.computeGradient(team, cursor.x, cursor.y)
                        .then(gradient => ({ team, gradient }))
                );
            }
        }

        const results = await Promise.all(promises);

        const gradients = {};
        for (const { team, gradient } of results) {
            gradients[team] = gradient;
        }

        return gradients;
    }

    destroy() {
        for (const worker of this.workers) {
            worker.terminate();
        }
        this.workers = [];
        this.availableWorkers = [];
        this.pendingRequests.clear();
        this.taskQueue = [];
        this.initialized = false;
    }
}

// Feature detection - check if Workers are supported
export function supportsWorkers() {
    return typeof Worker !== 'undefined';
}
