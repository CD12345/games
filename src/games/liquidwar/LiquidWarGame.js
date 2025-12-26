// Liquid War Game - Main game logic

import { GameEngine } from '../../engine/GameEngine.js';
import { InputManager } from '../../engine/InputManager.js';
import { NetworkSync } from '../../engine/NetworkSync.js';
import { onMessage, offMessage, sendMessage } from '../../core/peer.js';
import { LiquidWarRenderer } from './LiquidWarRenderer.js';
import { debugLog, debugSetValue } from '../../ui/DebugOverlay.js';
import {
    LIQUID_WAR_CONFIG,
    MAPS,
    parseMap,
    scaleMap,
    getStartPositions,
    getInitialState,
    getMapIdFromSetting,
} from './config.js';

// Direction offsets for 8-directional movement
const DIRECTIONS = [
    { dx: 0, dy: -1 },   // N
    { dx: 1, dy: -1 },   // NE
    { dx: 1, dy: 0 },    // E
    { dx: 1, dy: 1 },    // SE
    { dx: 0, dy: 1 },    // S
    { dx: -1, dy: 1 },   // SW
    { dx: -1, dy: 0 },   // W
    { dx: -1, dy: -1 },  // NW
];

function getCookie(name) {
    const prefix = `${name}=`;
    const parts = document.cookie.split(';');
    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith(prefix)) {
            return decodeURIComponent(trimmed.slice(prefix.length));
        }
    }
    return '';
}

function normalizeName(value) {
    return (value || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
}

export class LiquidWarGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber, settings = {}) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber;
        this.playerId = playerNumber === 1 ? 'p1' : 'p2';
        this.opponentId = playerNumber === 1 ? 'p2' : 'p1';
        this.settings = settings;

        // Game state
        this.state = getInitialState();
        this.localName = normalizeName(getCookie('playerName')) || `Player ${this.playerNumber}`;

        // Grid and particles (only fully maintained on host)
        this.gridWidth = LIQUID_WAR_CONFIG.grid.width;
        this.gridHeight = LIQUID_WAR_CONFIG.grid.height;
        this.walls = null;           // 2D array: 1 = wall, 0 = floor
        this.particles = [];         // Array of { x, y, team, health }
        this.particleGrid = null;    // 2D array for quick lookup
        this.gradients = {};         // { p1: 2D array, p2: 2D array }

        // Components
        this.input = new InputManager(canvas, { mode: 'cursor' });
        this.network = new NetworkSync(gameCode, isHost);
        this.renderer = new LiquidWarRenderer(canvas);

        // Timing
        this.tickAccumulator = 0;
        this.tickInterval = 1000 / LIQUID_WAR_CONFIG.game.tickRate;
        this.lastInputSync = 0;

        // Game over handling
        this.onGameOver = null;
        this.onGameReset = null;
        this.gameOverNotified = false;
    }

    async initialize() {
        debugLog(`LiquidWar init: ${this.isHost ? 'host' : 'guest'}, player ${this.playerNumber}`);

        // Initialize the map
        const mapSetting = this.settings.mapId || 'Arena';
        const mapId = getMapIdFromSetting(mapSetting);
        this.state.mapId = mapId;
        this.initializeMap(mapId);

        // Set up network callbacks
        if (this.isHost) {
            this.network.onInputUpdate = (input) => {
                if (input?.cursorX !== undefined && input?.cursorY !== undefined) {
                    this.state.cursors[this.opponentId] = {
                        x: input.cursorX,
                        y: input.cursorY,
                    };
                }
            };
        } else {
            this.network.onStateUpdate = (state) => {
                if (state) {
                    this.state = { ...this.state, ...state };
                    // Guest receives particle grid data for rendering
                    if (state.particleGridCompressed) {
                        this.decompressParticleGrid(state.particleGridCompressed);
                    }
                }
            };
        }

        // Name exchange
        if (!this.state.playerNames) {
            this.state.playerNames = { p1: 'Player 1', p2: 'Player 2' };
        }
        this.state.playerNames[this.playerId] = this.localName;

        onMessage('player_name', (data) => {
            const playerId = data?.playerId === 'p1' ? 'p1' : 'p2';
            const name = normalizeName(data?.name);
            if (!name) return;
            this.state.playerNames[playerId] = name;
            if (this.isHost) {
                this.network.sendState(this.state);
            }
        });

        sendMessage('player_name', { playerId: this.playerId, name: this.localName });

        // Rematch and forfeit handlers
        if (this.isHost) {
            onMessage('rematch_request', () => {
                if (this.state.phase === 'gameover') {
                    this.resetMatch();
                    if (this.onGameReset) {
                        this.onGameReset();
                    }
                }
            });

            onMessage('forfeit_request', (data) => {
                if (this.state.phase === 'gameover') return;
                const forfeiting = data?.by === 'p2' ? 'p2' : 'p1';
                this.applyForfeit(forfeiting);
            });
        }

        // Start network sync
        this.network.start();
        debugLog('Network sync started');

        // Set up renderer with map
        this.renderer.setMap(this.walls, this.gridWidth, this.gridHeight);

        // Initialize particles (host only)
        if (this.isHost) {
            this.initializeParticles();
            this.updateParticleCounts();
            this.network.sendState(this.buildNetworkState());
            debugLog(`Initialized ${this.particles.length} particles`);
        }
    }

    initializeMap(mapId) {
        const mapDef = MAPS[mapId] || MAPS.arena;
        const parsed = parseMap(mapDef.data);
        this.walls = scaleMap(parsed.grid, this.gridWidth, this.gridHeight);

        // Initialize particle grid
        this.particleGrid = [];
        for (let y = 0; y < this.gridHeight; y++) {
            const row = [];
            for (let x = 0; x < this.gridWidth; x++) {
                row.push(null);
            }
            this.particleGrid.push(row);
        }
    }

    initializeParticles() {
        const config = LIQUID_WAR_CONFIG.particle;
        const startPositions = getStartPositions(this.gridWidth, this.gridHeight, 2);

        this.particles = [];

        // Place particles for each team
        ['p1', 'p2'].forEach((team, teamIndex) => {
            const start = startPositions[teamIndex];
            const placed = this.placeParticlesNear(
                start.x,
                start.y,
                team,
                config.initialCount
            );
            debugLog(`Team ${team}: placed ${placed} particles near (${start.x}, ${start.y})`);
        });

        // Update particle grid
        this.rebuildParticleGrid();
    }

    placeParticlesNear(centerX, centerY, team, count) {
        const config = LIQUID_WAR_CONFIG.particle;
        let placed = 0;

        // Spiral outward from center to place particles
        const maxRadius = Math.max(this.gridWidth, this.gridHeight);
        const visited = new Set();

        const queue = [{ x: centerX, y: centerY, dist: 0 }];
        visited.add(`${centerX},${centerY}`);

        while (queue.length > 0 && placed < count) {
            const { x, y } = queue.shift();

            // Check if this cell is valid for placement
            if (this.isWalkable(x, y) && !this.getParticleAt(x, y)) {
                const particle = {
                    x,
                    y,
                    team,
                    health: config.maxHealth,
                };
                this.particles.push(particle);
                this.setParticleAt(x, y, particle);
                placed++;
            }

            // Add neighbors
            for (const dir of DIRECTIONS) {
                const nx = x + dir.dx;
                const ny = y + dir.dy;
                const key = `${nx},${ny}`;

                if (!visited.has(key) && this.inBounds(nx, ny)) {
                    visited.add(key);
                    queue.push({ x: nx, y: ny });
                }
            }
        }

        return placed;
    }

    isWalkable(x, y) {
        if (!this.inBounds(x, y)) return false;
        return this.walls[y][x] === 0;
    }

    inBounds(x, y) {
        return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }

    getParticleAt(x, y) {
        if (!this.inBounds(x, y)) return null;
        return this.particleGrid[y][x];
    }

    setParticleAt(x, y, particle) {
        if (this.inBounds(x, y)) {
            this.particleGrid[y][x] = particle;
        }
    }

    rebuildParticleGrid() {
        // Clear grid
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                this.particleGrid[y][x] = null;
            }
        }

        // Place all particles
        for (const p of this.particles) {
            this.particleGrid[p.y][p.x] = p;
        }
    }

    // Calculate gradient (distance field) from cursor to all walkable cells
    calculateGradient(team) {
        const cursor = this.state.cursors[team];
        const cursorX = Math.floor(cursor.x * this.gridWidth);
        const cursorY = Math.floor(cursor.y * this.gridHeight);

        // Initialize gradient with Infinity
        const gradient = [];
        for (let y = 0; y < this.gridHeight; y++) {
            const row = [];
            for (let x = 0; x < this.gridWidth; x++) {
                row.push(Infinity);
            }
            gradient.push(row);
        }

        // BFS from cursor position
        const queue = [];

        // Find nearest walkable cell to cursor
        if (this.isWalkable(cursorX, cursorY)) {
            gradient[cursorY][cursorX] = 0;
            queue.push({ x: cursorX, y: cursorY, dist: 0 });
        } else {
            // Search for nearest walkable cell
            const searched = new Set();
            const searchQueue = [{ x: cursorX, y: cursorY }];
            searched.add(`${cursorX},${cursorY}`);

            let found = false;
            while (searchQueue.length > 0 && !found) {
                const pos = searchQueue.shift();

                for (const dir of DIRECTIONS) {
                    const nx = pos.x + dir.dx;
                    const ny = pos.y + dir.dy;
                    const key = `${nx},${ny}`;

                    if (!searched.has(key) && this.inBounds(nx, ny)) {
                        searched.add(key);
                        if (this.isWalkable(nx, ny)) {
                            gradient[ny][nx] = 0;
                            queue.push({ x: nx, y: ny, dist: 0 });
                            found = true;
                            break;
                        }
                        searchQueue.push({ x: nx, y: ny });
                    }
                }
            }
        }

        // Flood fill to calculate distances
        const visited = new Set();
        for (const q of queue) {
            visited.add(`${q.x},${q.y}`);
        }

        while (queue.length > 0) {
            const { x, y, dist } = queue.shift();

            for (const dir of DIRECTIONS) {
                const nx = x + dir.dx;
                const ny = y + dir.dy;
                const key = `${nx},${ny}`;

                if (!visited.has(key) && this.isWalkable(nx, ny)) {
                    visited.add(key);
                    // Diagonal moves cost sqrt(2), cardinal moves cost 1
                    const moveCost = (dir.dx !== 0 && dir.dy !== 0) ? 1.414 : 1;
                    const newDist = dist + moveCost;
                    gradient[ny][nx] = newDist;
                    queue.push({ x: nx, y: ny, dist: newDist });
                }
            }
        }

        return gradient;
    }

    update(deltaTime) {
        // Update input
        this.input.update(deltaTime);

        // Update local cursor
        this.updateCursor(deltaTime);

        // Send input to peer
        this.syncInput();

        if (this.isHost) {
            // Accumulate time for fixed timestep simulation
            this.tickAccumulator += deltaTime * 1000;

            while (this.tickAccumulator >= this.tickInterval) {
                this.tickAccumulator -= this.tickInterval;
                this.tick();
            }

            // Send state to guest
            this.network.sendState(this.buildNetworkState());
        } else {
            this.network.updateInterpolation(deltaTime);
        }

        this.checkGameOver();

        // Update debug display
        const { p1, p2 } = this.state.particleCounts;
        debugSetValue(`${this.state.phase} | P1: ${p1} | P2: ${p2}`);
    }

    updateCursor(deltaTime) {
        const cursor = this.state.cursors[this.playerId];
        const speed = LIQUID_WAR_CONFIG.cursor.speed;

        // Get input direction
        const touchPos = this.input.getTouchPosition();

        if (touchPos) {
            // Smooth the touch position to reduce jerkiness
            if (!this.smoothedTouch) {
                this.smoothedTouch = { x: touchPos.x, y: touchPos.y };
            } else {
                // Exponential smoothing - faster response but still smooth
                const smoothing = 0.3;
                this.smoothedTouch.x += (touchPos.x - this.smoothedTouch.x) * smoothing;
                this.smoothedTouch.y += (touchPos.y - this.smoothedTouch.y) * smoothing;
            }

            // Move cursor toward smoothed touch position
            const targetX = this.smoothedTouch.x;
            const targetY = this.smoothedTouch.y;

            const dx = targetX - cursor.x;
            const dy = targetY - cursor.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0.005) {
                // Use proportional speed - faster when far, slower when close
                const moveSpeed = Math.min(speed * 3, dist * 0.15);
                const moveX = (dx / dist) * moveSpeed;
                const moveY = (dy / dist) * moveSpeed;
                cursor.x = Math.max(0, Math.min(1, cursor.x + moveX));
                cursor.y = Math.max(0, Math.min(1, cursor.y + moveY));
            }
        } else {
            // Clear smoothed touch when not touching
            this.smoothedTouch = null;

            // Keyboard input
            const keys = this.input.getKeys();
            if (keys.up) cursor.y = Math.max(0, cursor.y - speed);
            if (keys.down) cursor.y = Math.min(1, cursor.y + speed);
            if (keys.left) cursor.x = Math.max(0, cursor.x - speed);
            if (keys.right) cursor.x = Math.min(1, cursor.x + speed);
        }
    }

    syncInput() {
        const now = Date.now();
        if (now - this.lastInputSync < 50) return;  // 20 Hz input sync
        this.lastInputSync = now;

        const cursor = this.state.cursors[this.playerId];
        this.network.sendInput({
            cursorX: cursor.x,
            cursorY: cursor.y,
        });
    }

    // Main game logic tick (host only)
    tick() {
        if (this.state.phase === 'countdown') {
            const elapsed = Date.now() - this.state.startTime;
            if (elapsed >= LIQUID_WAR_CONFIG.game.countdownTime) {
                this.state.phase = 'playing';
                this.state.startTime = Date.now();
                debugLog('Phase changed to playing');
            }
            return;
        }

        if (this.state.phase !== 'playing') return;

        // Check time limit
        const elapsed = Date.now() - this.state.startTime;
        if (elapsed >= LIQUID_WAR_CONFIG.game.maxTime) {
            this.endGame();
            return;
        }

        // Recalculate gradients
        this.gradients.p1 = this.calculateGradient('p1');
        this.gradients.p2 = this.calculateGradient('p2');

        // Move particles and handle combat
        this.moveParticles();
        this.handleCombat();

        // Update particle counts
        this.updateParticleCounts();

        // Check for winner
        if (this.state.particleCounts.p1 === 0 || this.state.particleCounts.p2 === 0) {
            this.endGame();
        }
    }

    moveParticles() {
        // Shuffle particles to prevent bias
        const shuffled = [...this.particles];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        for (const particle of shuffled) {
            this.moveParticle(particle);
        }
    }

    moveParticle(particle) {
        const gradient = this.gradients[particle.team];
        if (!gradient) return;

        const currentGrad = gradient[particle.y][particle.x];
        if (currentGrad === Infinity) return;  // Unreachable

        // Find best adjacent cell (lowest gradient value)
        let bestDir = null;
        let bestGrad = currentGrad;

        // Shuffle directions for randomness when equal
        const dirs = [...DIRECTIONS];
        for (let i = dirs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }

        for (const dir of dirs) {
            const nx = particle.x + dir.dx;
            const ny = particle.y + dir.dy;

            if (!this.isWalkable(nx, ny)) continue;

            const neighborGrad = gradient[ny][nx];

            // Only move if it gets us closer
            if (neighborGrad < bestGrad) {
                const occupant = this.getParticleAt(nx, ny);
                // Can move if cell is empty or occupied by enemy (will attack)
                if (!occupant || occupant.team !== particle.team) {
                    bestDir = dir;
                    bestGrad = neighborGrad;
                }
            }
        }

        // Move if we found a better cell
        if (bestDir) {
            const newX = particle.x + bestDir.dx;
            const newY = particle.y + bestDir.dy;

            const occupant = this.getParticleAt(newX, newY);

            if (!occupant) {
                // Move to empty cell
                this.setParticleAt(particle.x, particle.y, null);
                particle.x = newX;
                particle.y = newY;
                this.setParticleAt(newX, newY, particle);
            }
            // If occupied by enemy, combat will be handled in handleCombat()
        }
    }

    handleCombat() {
        const config = LIQUID_WAR_CONFIG.particle;
        const deadParticles = [];

        for (const particle of this.particles) {
            // Check all neighbors for enemies
            for (const dir of DIRECTIONS) {
                const nx = particle.x + dir.dx;
                const ny = particle.y + dir.dy;

                const neighbor = this.getParticleAt(nx, ny);
                if (neighbor && neighbor.team !== particle.team) {
                    const myGrad = this.gradients[particle.team];
                    const theirGrad = this.gradients[neighbor.team];

                    if (!myGrad || !theirGrad) continue;

                    const myDist = myGrad[particle.y]?.[particle.x];
                    const theirDist = theirGrad[neighbor.y]?.[neighbor.x];

                    if (myDist === undefined || theirDist === undefined) continue;

                    // Particle FAR from its cursor is "pushing" harder
                    // The one with higher distance to their own cursor is attacking
                    if (myDist >= theirDist) {
                        neighbor.health -= config.attackDamage;
                    }
                }
            }

            // Check for allies to heal
            for (const dir of DIRECTIONS) {
                const nx = particle.x + dir.dx;
                const ny = particle.y + dir.dy;

                const neighbor = this.getParticleAt(nx, ny);
                if (neighbor && neighbor.team === particle.team && neighbor.health < config.maxHealth) {
                    neighbor.health = Math.min(config.maxHealth, neighbor.health + config.healAmount);
                }
            }

            // Check for death
            if (particle.health <= 0) {
                deadParticles.push(particle);
            }
        }

        // Convert dead particles to the killer's team
        for (const dead of deadParticles) {
            // Find the killer (adjacent enemy)
            let killer = null;
            for (const dir of DIRECTIONS) {
                const nx = dead.x + dir.dx;
                const ny = dead.y + dir.dy;
                const neighbor = this.getParticleAt(nx, ny);
                if (neighbor && neighbor.team !== dead.team) {
                    killer = neighbor;
                    break;
                }
            }

            if (killer) {
                // Convert to killer's team
                dead.team = killer.team;
                dead.health = config.maxHealth * 0.5;  // Respawn with half health
            } else {
                // No killer found, just restore health
                dead.health = config.maxHealth * 0.5;
            }
        }
    }

    updateParticleCounts() {
        const counts = { p1: 0, p2: 0 };
        for (const p of this.particles) {
            counts[p.team]++;
        }
        this.state.particleCounts = counts;
    }

    endGame() {
        const { p1, p2 } = this.state.particleCounts;
        this.state.phase = 'gameover';

        if (p1 > p2) {
            this.state.winner = 'p1';
        } else if (p2 > p1) {
            this.state.winner = 'p2';
        } else {
            this.state.winner = 'tie';
        }
    }

    applyForfeit(forfeitingPlayer) {
        const winner = forfeitingPlayer === 'p1' ? 'p2' : 'p1';
        this.state.phase = 'gameover';
        this.state.winner = winner;
        this.state.forfeitBy = forfeitingPlayer;

        if (this.isHost) {
            this.network.sendState(this.buildNetworkState());
        }

        this.checkGameOver();
    }

    forfeit() {
        if (this.state.phase === 'gameover') return;

        if (this.isHost) {
            this.applyForfeit(this.playerId);
            return;
        }

        sendMessage('forfeit_request', { by: this.playerId });
    }

    requestRematch() {
        if (this.isHost) {
            this.resetMatch();
            if (this.onGameReset) {
                this.onGameReset();
            }
            return;
        }

        sendMessage('rematch_request', {});
    }

    resetMatch() {
        const playerNames = this.state.playerNames;
        this.state = getInitialState();
        if (playerNames) {
            this.state.playerNames = playerNames;
        }
        this.gameOverNotified = false;

        // Reinitialize
        this.initializeMap(this.state.mapId);
        if (this.isHost) {
            this.initializeParticles();
            this.updateParticleCounts();
            this.network.sendState(this.buildNetworkState());
        }
    }

    checkGameOver() {
        if (this.state.phase === 'gameover') {
            if (!this.gameOverNotified) {
                this.gameOverNotified = true;
                if (this.onGameOver) {
                    this.onGameOver({
                        winnerId: this.state.winner,
                        forfeitedBy: this.state.forfeitBy || null,
                        playerNames: this.state.playerNames,
                        particleCounts: this.state.particleCounts,
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

    // Build network state for transmission
    buildNetworkState() {
        return {
            ...this.state,
            particleGridCompressed: this.compressParticleGrid(),
        };
    }

    // Compress particle grid for network transmission
    // Format: run-length encoding of team values (-1 for empty, 0 for p1, 1 for p2)
    compressParticleGrid() {
        const data = [];
        let lastValue = null;
        let count = 0;

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const particle = this.particleGrid[y][x];
                const value = particle ? (particle.team === 'p1' ? 0 : 1) : -1;

                if (value === lastValue) {
                    count++;
                } else {
                    if (lastValue !== null) {
                        data.push(count, lastValue);
                    }
                    lastValue = value;
                    count = 1;
                }
            }
        }

        if (lastValue !== null) {
            data.push(count, lastValue);
        }

        return data;
    }

    // Decompress particle grid from network data
    decompressParticleGrid(compressed) {
        if (!compressed || compressed.length === 0) {
            return;
        }

        if (!this.particleGrid) {
            this.particleGrid = [];
            for (let y = 0; y < this.gridHeight; y++) {
                const row = [];
                for (let x = 0; x < this.gridWidth; x++) {
                    row.push(null);
                }
                this.particleGrid.push(row);
            }
        }

        let x = 0;
        let y = 0;

        for (let i = 0; i < compressed.length; i += 2) {
            const count = compressed[i];
            const value = compressed[i + 1];

            for (let j = 0; j < count; j++) {
                // Bounds check
                if (y >= this.gridHeight) {
                    return;
                }

                if (value === -1) {
                    this.particleGrid[y][x] = null;
                } else {
                    this.particleGrid[y][x] = {
                        team: value === 0 ? 'p1' : 'p2',
                    };
                }

                x++;
                if (x >= this.gridWidth) {
                    x = 0;
                    y++;
                }
            }
        }
    }

    render() {
        this.renderer.render(
            this.state,
            this.particleGrid,
            this.walls,
            this.gridWidth,
            this.gridHeight,
            this.playerNumber
        );
    }

    destroy() {
        super.destroy();
        this.input.destroy();
        this.network.stop();

        if (this.isHost) {
            offMessage('rematch_request');
            offMessage('forfeit_request');
        }
        offMessage('player_name');
    }
}
