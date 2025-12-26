// Liquid Wars - Host-authoritative flow field strategy game

import { GameEngine } from '../../engine/GameEngine.js';
import { NetworkSync } from '../../engine/NetworkSync.js';

const DEFAULT_CONFIG = {
    gridWidth: 42,
    gridHeight: 28,
    flowRate: 2.6,
    spawnRate: 6,
    baseDensity: 20,
    winDensityThreshold: 1,
    maxDensityForColor: 30
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function indexFor(x, y, width) {
    return y * width + x;
}

function getInitialState(config) {
    const { gridWidth, gridHeight } = config;
    const totalCells = gridWidth * gridHeight;
    const densities = {
        p1: Array(totalCells).fill(0),
        p2: Array(totalCells).fill(0)
    };
    const walkable = Array(totalCells).fill(true);
    const bases = [
        { x: 3, y: Math.floor(gridHeight / 2), owner: 'p1' },
        { x: gridWidth - 4, y: Math.floor(gridHeight / 2), owner: 'p2' }
    ];

    for (const base of bases) {
        const idx = indexFor(base.x, base.y, gridWidth);
        densities[base.owner][idx] = config.baseDensity;
    }

    return {
        grid: {
            width: gridWidth,
            height: gridHeight,
            walkable
        },
        densities,
        bases,
        cursors: {
            p1: {
                x: (bases[0].x + 0.5) / gridWidth,
                y: (bases[0].y + 0.5) / gridHeight
            },
            p2: {
                x: (bases[1].x + 0.5) / gridWidth,
                y: (bases[1].y + 0.5) / gridHeight
            }
        },
        totals: {
            p1: 0,
            p2: 0
        },
        round: {
            phase: 'playing',
            winner: null,
            winReason: null
        }
    };
}

function computeDistanceField(grid, cursor) {
    const { width, height, walkable } = grid;
    const totalCells = width * height;
    const distances = Array(totalCells).fill(Infinity);

    const startX = clamp(Math.floor(cursor.x * width), 0, width - 1);
    const startY = clamp(Math.floor(cursor.y * height), 0, height - 1);
    const startIndex = indexFor(startX, startY, width);
    distances[startIndex] = 0;

    const queue = [startIndex];
    let head = 0;

    while (head < queue.length) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        const nextDistance = distances[index] + 1;

        const neighbors = [
            { x: x - 1, y },
            { x: x + 1, y },
            { x, y: y - 1 },
            { x, y: y + 1 }
        ];

        for (const neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.x >= width || neighbor.y < 0 || neighbor.y >= height) {
                continue;
            }
            const neighborIndex = indexFor(neighbor.x, neighbor.y, width);
            if (!walkable[neighborIndex] || nextDistance >= distances[neighborIndex]) {
                continue;
            }
            distances[neighborIndex] = nextDistance;
            queue.push(neighborIndex);
        }
    }

    return distances;
}

function applyFlow(densities, distances, grid, flowFraction) {
    const { width, height } = grid;
    const next = densities.slice();

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = indexFor(x, y, width);
            const density = densities[index];
            if (density <= 0) {
                continue;
            }

            let bestIndex = index;
            let bestDistance = distances[index];

            const neighbors = [
                { x: x - 1, y },
                { x: x + 1, y },
                { x, y: y - 1 },
                { x, y: y + 1 }
            ];

            for (const neighbor of neighbors) {
                if (neighbor.x < 0 || neighbor.x >= width || neighbor.y < 0 || neighbor.y >= height) {
                    continue;
                }
                const neighborIndex = indexFor(neighbor.x, neighbor.y, width);
                const neighborDistance = distances[neighborIndex];
                if (neighborDistance < bestDistance) {
                    bestDistance = neighborDistance;
                    bestIndex = neighborIndex;
                }
            }

            if (bestIndex === index) {
                continue;
            }

            const moved = density * flowFraction;
            next[index] -= moved;
            next[bestIndex] += moved;
        }
    }

    return next;
}

function resolveCollisions(p1Next, p2Next) {
    const length = p1Next.length;
    const resolvedP1 = Array(length).fill(0);
    const resolvedP2 = Array(length).fill(0);
    let totalP1 = 0;
    let totalP2 = 0;

    for (let i = 0; i < length; i++) {
        const net = p1Next[i] - p2Next[i];
        if (net > 0) {
            resolvedP1[i] = net;
            totalP1 += net;
        } else if (net < 0) {
            const value = -net;
            resolvedP2[i] = value;
            totalP2 += value;
        }
    }

    return {
        p1: resolvedP1,
        p2: resolvedP2,
        totals: {
            p1: totalP1,
            p2: totalP2
        }
    };
}

function interpolateArrays(previous, current, alpha) {
    const length = current.length;
    const blended = Array(length);
    for (let i = 0; i < length; i++) {
        const prevValue = previous[i] ?? 0;
        blended[i] = prevValue + (current[i] - prevValue) * alpha;
    }
    return blended;
}

export class LiquidWarsGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber, settings = {}) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber;
        this.playerId = playerNumber === 1 ? 'p1' : 'p2';
        this.opponentId = playerNumber === 1 ? 'p2' : 'p1';
        this.settings = settings;

        this.config = { ...DEFAULT_CONFIG, ...settings };
        this.state = getInitialState(this.config);

        this.network = new NetworkSync(gameCode, isHost);

        this.pointer = {
            x: this.state.cursors[this.playerId].x,
            y: this.state.cursors[this.playerId].y
        };

        this.lastInputSync = 0;
        this.inputSyncInterval = 1000 / 60;

        this.gameOverNotified = false;
        this.onGameOver = null;
        this.onGameReset = null;

        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);

        this.setupInputListeners();
    }

    setupInputListeners() {
        this.canvas.addEventListener('mousemove', this.handlePointerMove);
        this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd);
    }

    handlePointerMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        this.pointer.y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    }

    handleTouchStart(event) {
        event.preventDefault();
        if (event.touches.length > 0) {
            this.handleTouchPosition(event.touches[0]);
        }
    }

    handleTouchMove(event) {
        event.preventDefault();
        if (event.touches.length > 0) {
            this.handleTouchPosition(event.touches[0]);
        }
    }

    handleTouchEnd() {
        // noop
    }

    handleTouchPosition(touch) {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = clamp((touch.clientX - rect.left) / rect.width, 0, 1);
        this.pointer.y = clamp((touch.clientY - rect.top) / rect.height, 0, 1);
    }

    async initialize() {
        if (this.isHost) {
            this.network.onInputUpdate = (input) => {
                if (!input) {
                    return;
                }
                if (typeof input.cursorX === 'number' && typeof input.cursorY === 'number') {
                    this.state.cursors[this.opponentId] = {
                        x: clamp(input.cursorX, 0, 1),
                        y: clamp(input.cursorY, 0, 1)
                    };
                }
            };
        } else {
            this.network.onStateUpdate = (state) => {
                if (state) {
                    this.state = state;
                }
            };
        }

        this.network.start();

        if (this.isHost) {
            this.network.sendState(this.state);
        }
    }

    update(deltaTime) {
        this.state.cursors[this.playerId] = {
            x: this.pointer.x,
            y: this.pointer.y
        };

        this.syncInput();

        if (this.isHost) {
            this.updateGameLogic(deltaTime);
            this.network.sendState(this.state);
        } else {
            this.network.updateInterpolation(deltaTime);
        }

        this.checkGameOver();
    }

    updateGameLogic(deltaTime) {
        if (this.state.round.phase === 'gameover') {
            return;
        }

        const flowFraction = clamp(this.config.flowRate * deltaTime, 0, 0.45);
        const distanceP1 = computeDistanceField(this.state.grid, this.state.cursors.p1);
        const distanceP2 = computeDistanceField(this.state.grid, this.state.cursors.p2);

        const p1Flow = applyFlow(this.state.densities.p1, distanceP1, this.state.grid, flowFraction);
        const p2Flow = applyFlow(this.state.densities.p2, distanceP2, this.state.grid, flowFraction);

        const spawnAmount = this.config.spawnRate * deltaTime;
        for (const base of this.state.bases) {
            const baseIndex = indexFor(base.x, base.y, this.state.grid.width);
            if (base.owner === 'p1') {
                p1Flow[baseIndex] += spawnAmount;
            } else {
                p2Flow[baseIndex] += spawnAmount;
            }
        }

        const resolved = resolveCollisions(p1Flow, p2Flow);
        this.state.densities = {
            p1: resolved.p1,
            p2: resolved.p2
        };
        this.state.totals = resolved.totals;

        for (const base of this.state.bases) {
            const baseIndex = indexFor(base.x, base.y, this.state.grid.width);
            const owner = resolved.p1[baseIndex] > 0 ? 'p1' : resolved.p2[baseIndex] > 0 ? 'p2' : null;
            if (owner && owner !== base.owner) {
                this.setGameOver(owner, 'base captured');
                return;
            }
        }

        if (resolved.totals.p1 <= this.config.winDensityThreshold) {
            this.setGameOver('p2', 'density depleted');
        } else if (resolved.totals.p2 <= this.config.winDensityThreshold) {
            this.setGameOver('p1', 'density depleted');
        }
    }

    setGameOver(winner, reason) {
        this.state.round.phase = 'gameover';
        this.state.round.winner = winner;
        this.state.round.winReason = reason;
    }

    checkGameOver() {
        if (this.state.round.phase === 'gameover') {
            if (!this.gameOverNotified) {
                this.gameOverNotified = true;
                if (this.onGameOver) {
                    this.onGameOver({
                        winnerId: this.state.round.winner,
                        reason: this.state.round.winReason
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

    syncInput() {
        if (this.isHost) {
            return;
        }
        const now = Date.now();
        if (now - this.lastInputSync >= this.inputSyncInterval) {
            this.network.sendInput({
                cursorX: this.pointer.x,
                cursorY: this.pointer.y
            });
            this.lastInputSync = now;
        }
    }

    getInterpolatedState() {
        if (this.isHost || !this.network.remoteState) {
            return this.state;
        }

        if (!this.network.previousState) {
            return this.network.remoteState;
        }

        const alpha = this.network.interpolationAlpha;
        const previous = this.network.previousState;
        const current = this.network.remoteState;

        const blended = {
            ...current,
            cursors: {
                p1: {
                    x: (previous.cursors?.p1?.x ?? current.cursors?.p1?.x ?? 0.5)
                        + ((current.cursors?.p1?.x ?? 0.5) - (previous.cursors?.p1?.x ?? 0.5)) * alpha,
                    y: (previous.cursors?.p1?.y ?? current.cursors?.p1?.y ?? 0.5)
                        + ((current.cursors?.p1?.y ?? 0.5) - (previous.cursors?.p1?.y ?? 0.5)) * alpha
                },
                p2: {
                    x: (previous.cursors?.p2?.x ?? current.cursors?.p2?.x ?? 0.5)
                        + ((current.cursors?.p2?.x ?? 0.5) - (previous.cursors?.p2?.x ?? 0.5)) * alpha,
                    y: (previous.cursors?.p2?.y ?? current.cursors?.p2?.y ?? 0.5)
                        + ((current.cursors?.p2?.y ?? 0.5) - (previous.cursors?.p2?.y ?? 0.5)) * alpha
                }
            }
        };

        if (previous.densities && current.densities) {
            blended.densities = {
                p1: interpolateArrays(previous.densities.p1 || [], current.densities.p1 || [], alpha),
                p2: interpolateArrays(previous.densities.p2 || [], current.densities.p2 || [], alpha)
            };
        }

        return blended;
    }

    render() {
        const renderState = this.getInterpolatedState();
        const { width, height } = renderState.grid;
        const cellWidth = this.canvas.width / width;
        const cellHeight = this.canvas.height / height;

        this.clear('#101523');

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = indexFor(x, y, width);
                const p1Density = renderState.densities.p1[index];
                const p2Density = renderState.densities.p2[index];
                if (p1Density <= 0 && p2Density <= 0) {
                    continue;
                }

                let fill = null;
                if (p1Density > p2Density) {
                    const alpha = clamp(p1Density / this.config.maxDensityForColor, 0.1, 1);
                    fill = `rgba(80, 160, 255, ${alpha})`;
                } else {
                    const alpha = clamp(p2Density / this.config.maxDensityForColor, 0.1, 1);
                    fill = `rgba(255, 96, 96, ${alpha})`;
                }

                this.ctx.fillStyle = fill;
                this.ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
            }
        }

        for (const base of renderState.bases) {
            const centerX = (base.x + 0.5) * cellWidth;
            const centerY = (base.y + 0.5) * cellHeight;
            this.ctx.beginPath();
            this.ctx.fillStyle = base.owner === 'p1' ? '#2f7efb' : '#f25454';
            this.ctx.arc(centerX, centerY, Math.max(cellWidth, cellHeight) * 0.6, 0, Math.PI * 2);
            this.ctx.fill();
        }

        const cursorRadius = Math.max(cellWidth, cellHeight) * 0.5;
        this.drawCursor(renderState.cursors.p1, '#99c5ff', cursorRadius);
        this.drawCursor(renderState.cursors.p2, '#ffb3b3', cursorRadius);
    }

    drawCursor(cursor, color, radius) {
        if (!cursor) {
            return;
        }
        const x = cursor.x * this.canvas.width;
        const y = cursor.y * this.canvas.height;
        this.ctx.beginPath();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    destroy() {
        super.destroy();
        this.network.stop();
        this.canvas.removeEventListener('mousemove', this.handlePointerMove);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    }
}
