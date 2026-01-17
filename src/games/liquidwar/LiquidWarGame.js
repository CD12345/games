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
        this.playerId = `p${playerNumber}`;
        this.settings = settings;

        // Player count and AI settings
        this.totalPlayers = parseInt(settings.playerCount) || 2;
        this.aiDifficulty = settings.aiDifficulty || 'Medium';
        this.humanPlayers = new Set([this.playerId]); // Will be updated as players join
        this.aiPlayers = new Set(); // Players controlled by AI

        // Game state
        this.state = getInitialState(this.totalPlayers);
        this.localName = normalizeName(getCookie('playerName')) || `Player ${this.playerNumber}`;

        // Grid and particles (only fully maintained on host)
        this.gridWidth = LIQUID_WAR_CONFIG.grid.width;
        this.gridHeight = LIQUID_WAR_CONFIG.grid.height;
        this.walls = null;           // 2D array: 1 = wall, 0 = floor
        this.particles = [];         // Array of { x, y, team, health }
        this.particleGrid = null;    // 2D array for quick lookup
        this.gradients = {};         // Gradient for each player

        // Components
        this.input = new InputManager(canvas, { mode: 'cursor' });
        this.network = new NetworkSync(gameCode, isHost);
        this.renderer = new LiquidWarRenderer(canvas);

        // Timing
        this.tickAccumulator = 0;
        this.tickInterval = 1000 / LIQUID_WAR_CONFIG.game.tickRate;
        this.lastInputSync = 0;
        this.lastAIUpdate = 0;

        // AI state for each AI player
        this.aiState = {};

        // Pre-allocated buffers for performance
        this.visitedBuffer = null;
        this.queueBuffer = null;
        this.gradientArrays = {};

        // Game over handling
        this.onGameOver = null;
        this.onGameReset = null;
        this.gameOverNotified = false;
    }

    async initialize() {
        debugLog(`LiquidWar init: ${this.isHost ? 'host' : 'guest'}, player ${this.playerNumber}, ${this.totalPlayers} total`);

        // Initialize the map
        const mapSetting = this.settings.mapId || 'Arena';
        const mapId = getMapIdFromSetting(mapSetting);
        this.state.mapId = mapId;
        this.state.playerCount = this.totalPlayers;
        this.initializeMap(mapId);

        // Determine which players are human vs AI based on actual connected humans
        // p1 = host (always human), p2 = guest (human only if connected), rest are AI
        const connectedHumans = parseInt(this.settings.connectedHumans) || 1;
        this.humanPlayers = new Set(['p1']);
        if (connectedHumans >= 2 && this.totalPlayers >= 2) {
            this.humanPlayers.add('p2'); // Guest player is connected
        }

        debugLog(`Connected humans: ${connectedHumans}, total players: ${this.totalPlayers}`);

        // All non-human players are AI
        this.aiPlayers = new Set();
        for (let i = 1; i <= this.totalPlayers; i++) {
            const pid = `p${i}`;
            if (!this.humanPlayers.has(pid)) {
                this.aiPlayers.add(pid);
                this.state.aiPlayers[pid] = true;
                this.state.playerNames[pid] = `AI ${i} (${this.aiDifficulty})`;
                // Initialize AI state
                this.aiState[pid] = {
                    targetX: this.state.cursors[pid].x,
                    targetY: this.state.cursors[pid].y,
                    lastDecision: 0,
                    mode: 'attack', // 'attack', 'defend', 'expand'
                };
            }
        }

        debugLog(`Human players: ${[...this.humanPlayers].join(', ')}`);
        debugLog(`AI players: ${[...this.aiPlayers].join(', ')}`);

        // Set up network callbacks
        if (this.isHost) {
            this.network.onInputUpdate = (input) => {
                // Guest sends their cursor position (p2)
                if (input?.cursorX !== undefined && input?.cursorY !== undefined) {
                    this.state.cursors.p2 = {
                        x: input.cursorX,
                        y: input.cursorY,
                    };
                }
            };
        } else {
            this.network.onStateUpdate = (state) => {
                if (state) {
                    // Preserve guest's own cursor position to prevent jitter
                    const myCursor = this.state.cursors[this.playerId];
                    this.state = { ...this.state, ...state };
                    // Restore guest's cursor - don't let host's delayed sync overwrite it
                    if (myCursor) {
                        this.state.cursors[this.playerId] = myCursor;
                    }
                    // Guest receives particle grid data for rendering
                    if (state.particleGridCompressed) {
                        this.decompressParticleGrid(state.particleGridCompressed);
                    }
                }
            };
        }

        // Name exchange
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

        // Pre-allocate buffers for BFS (huge performance gain)
        const gridSize = this.gridWidth * this.gridHeight;
        this.visitedBuffer = new Uint8Array(gridSize);
        this.queueBuffer = new Uint32Array(gridSize * 2); // x,y pairs

        // Pre-allocate gradient arrays for each player (reused each tick)
        this.gradientArrays = {};
        for (let i = 1; i <= 6; i++) {
            this.gradientArrays[`p${i}`] = new Float32Array(gridSize);
        }
    }

    initializeParticles() {
        const config = LIQUID_WAR_CONFIG.particle;
        const startPositions = getStartPositions(this.gridWidth, this.gridHeight, this.totalPlayers);

        // Adjust particle count per player based on total players
        // More players = fewer particles each to keep total reasonable
        const particlesPerPlayer = Math.floor(config.initialCount / Math.max(1, this.totalPlayers / 2));

        this.particles = [];

        // Place particles for each team
        for (let i = 0; i < this.totalPlayers; i++) {
            const team = `p${i + 1}`;
            const start = startPositions[i];
            const placed = this.placeParticlesNear(
                start.x,
                start.y,
                team,
                particlesPerPlayer
            );
            debugLog(`Team ${team}: placed ${placed} particles near (${start.x}, ${start.y})`);
        }

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

    // Optimized gradient calculation using typed arrays
    // Returns a flat Float32Array (access as gradient[y * width + x])
    calculateGradient(team) {
        const cursor = this.state.cursors[team];
        const w = this.gridWidth;
        const h = this.gridHeight;

        // Clamp cursor to grid bounds
        const clampedX = Math.max(0, Math.min(0.999, cursor.x));
        const clampedY = Math.max(0, Math.min(0.999, cursor.y));
        const cursorX = Math.max(0, Math.min(w - 1, Math.floor(clampedX * w)));
        const cursorY = Math.max(0, Math.min(h - 1, Math.floor(clampedY * h)));

        // Reuse pre-allocated arrays
        const gradient = this.gradientArrays[team];
        const visited = this.visitedBuffer;
        const queue = this.queueBuffer;

        // Reset arrays (faster than creating new ones)
        gradient.fill(65535); // Use large number instead of Infinity for typed array
        visited.fill(0);

        let qHead = 0;  // Queue read position
        let qTail = 0;  // Queue write position

        // Find starting cell
        let startX = cursorX;
        let startY = cursorY;

        if (this.walls[cursorY][cursorX] === 1) {
            // Cursor is in wall, find nearest walkable cell using simple spiral
            let found = false;
            for (let r = 1; r < Math.max(w, h) && !found; r++) {
                for (let dy = -r; dy <= r && !found; dy++) {
                    for (let dx = -r; dx <= r && !found; dx++) {
                        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                        const nx = cursorX + dx;
                        const ny = cursorY + dy;
                        if (nx >= 0 && nx < w && ny >= 0 && ny < h && this.walls[ny][nx] === 0) {
                            startX = nx;
                            startY = ny;
                            found = true;
                        }
                    }
                }
            }
        }

        // Initialize BFS from start
        const startIdx = startY * w + startX;
        gradient[startIdx] = 0;
        visited[startIdx] = 1;
        queue[qTail++] = startX;
        queue[qTail++] = startY;

        // Pre-computed direction offsets (dx, dy, cost*1000 for integer math)
        const dirs = [
            0, -1, 1000,   // N
            1, -1, 1414,   // NE
            1, 0, 1000,    // E
            1, 1, 1414,    // SE
            0, 1, 1000,    // S
            -1, 1, 1414,   // SW
            -1, 0, 1000,   // W
            -1, -1, 1414   // NW
        ];

        // BFS flood fill
        while (qHead < qTail) {
            const x = queue[qHead++];
            const y = queue[qHead++];
            const idx = y * w + x;
            const dist = gradient[idx];

            for (let d = 0; d < 24; d += 3) {
                const nx = x + dirs[d];
                const ny = y + dirs[d + 1];

                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

                const nIdx = ny * w + nx;
                if (visited[nIdx] || this.walls[ny][nx] === 1) continue;

                visited[nIdx] = 1;
                gradient[nIdx] = dist + dirs[d + 2] / 1000;
                queue[qTail++] = nx;
                queue[qTail++] = ny;
            }
        }

        return gradient;
    }

    // Helper to get gradient value (handles flat array)
    getGradientValue(gradient, x, y) {
        return gradient[y * this.gridWidth + x];
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
                // Allow cursor to go slightly into margin area for "pulling" effect
                const margin = LIQUID_WAR_CONFIG.display?.mapMargin || 0.1;
                cursor.x = Math.max(-margin, Math.min(1 + margin, cursor.x + moveX));
                cursor.y = Math.max(-margin, Math.min(1 + margin, cursor.y + moveY));
            }
        } else {
            // Clear smoothed touch when not touching
            this.smoothedTouch = null;

            // Keyboard input - allow cursor into margin area
            const margin = LIQUID_WAR_CONFIG.display?.mapMargin || 0.1;
            const keys = this.input.getKeys();
            if (keys.up) cursor.y = Math.max(-margin, cursor.y - speed);
            if (keys.down) cursor.y = Math.min(1 + margin, cursor.y + speed);
            if (keys.left) cursor.x = Math.max(-margin, cursor.x - speed);
            if (keys.right) cursor.x = Math.min(1 + margin, cursor.x + speed);
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

    // AI cursor control - runs on host for all AI players
    updateAICursors() {
        if (!this.isHost) return;

        const now = Date.now();

        // AI update frequency based on difficulty
        const updateIntervals = {
            'Easy': 500,    // Update every 500ms
            'Medium': 200,  // Update every 200ms
            'Hard': 80,     // Update every 80ms
        };
        const interval = updateIntervals[this.aiDifficulty] || 200;

        if (now - this.lastAIUpdate < interval) return;
        this.lastAIUpdate = now;

        for (const aiId of this.aiPlayers) {
            this.updateSingleAI(aiId);
        }
    }

    updateSingleAI(aiId) {
        const cursor = this.state.cursors[aiId];
        const aiState = this.aiState[aiId];
        if (!cursor || !aiState) return;

        const now = Date.now();

        // Decision-making frequency based on difficulty
        const decisionIntervals = {
            'Easy': 2000,   // New decision every 2s
            'Medium': 800,  // New decision every 800ms
            'Hard': 300,    // New decision every 300ms
        };
        const decisionInterval = decisionIntervals[this.aiDifficulty] || 800;

        // Make new strategic decision periodically
        if (now - aiState.lastDecision > decisionInterval) {
            aiState.lastDecision = now;
            this.makeAIDecision(aiId, aiState);
        }

        // Move cursor toward target
        const speed = this.getAICursorSpeed();
        const dx = aiState.targetX - cursor.x;
        const dy = aiState.targetY - cursor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.01) {
            const moveSpeed = Math.min(speed, dist);
            cursor.x += (dx / dist) * moveSpeed;
            cursor.y += (dy / dist) * moveSpeed;

            // Clamp to valid range
            const margin = LIQUID_WAR_CONFIG.display?.mapMargin || 0.1;
            cursor.x = Math.max(-margin, Math.min(1 + margin, cursor.x));
            cursor.y = Math.max(-margin, Math.min(1 + margin, cursor.y));
        }
    }

    getAICursorSpeed() {
        const speeds = {
            'Easy': 0.015,
            'Medium': 0.025,
            'Hard': 0.04,
        };
        return speeds[this.aiDifficulty] || 0.025;
    }

    makeAIDecision(aiId, aiState) {
        // Calculate centers of mass for all teams
        const teamCenters = this.calculateTeamCenters();
        const myCenter = teamCenters[aiId];
        const myCount = this.state.particleCounts[aiId] || 0;

        if (!myCenter || myCount === 0) {
            // No particles left, wander randomly
            aiState.targetX = 0.2 + Math.random() * 0.6;
            aiState.targetY = 0.2 + Math.random() * 0.6;
            return;
        }

        // Find enemies and their strengths
        const enemies = [];
        for (let i = 1; i <= this.totalPlayers; i++) {
            const pid = `p${i}`;
            if (pid !== aiId && teamCenters[pid]) {
                enemies.push({
                    id: pid,
                    center: teamCenters[pid],
                    count: this.state.particleCounts[pid] || 0,
                });
            }
        }

        if (enemies.length === 0) {
            // No enemies, just hold position
            aiState.targetX = myCenter.x;
            aiState.targetY = myCenter.y;
            return;
        }

        // AI Strategy based on difficulty
        let targetX, targetY;

        if (this.aiDifficulty === 'Easy') {
            // Easy: Random wandering with occasional targeting
            if (Math.random() < 0.3) {
                // 30% chance to target an enemy
                const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                targetX = randomEnemy.center.x;
                targetY = randomEnemy.center.y;
            } else {
                // Wander near own particles
                targetX = myCenter.x + (Math.random() - 0.5) * 0.4;
                targetY = myCenter.y + (Math.random() - 0.5) * 0.4;
            }
        } else if (this.aiDifficulty === 'Medium') {
            // Medium: Target weakest enemy or expand
            const weakestEnemy = enemies.reduce((a, b) => a.count < b.count ? a : b);

            if (myCount > weakestEnemy.count * 1.2) {
                // We're stronger, attack!
                targetX = weakestEnemy.center.x;
                targetY = weakestEnemy.center.y;
            } else {
                // Defend/expand - stay between own center and nearest enemy
                const nearestEnemy = this.findNearestEnemy(myCenter, enemies);
                targetX = (myCenter.x + nearestEnemy.center.x) / 2;
                targetY = (myCenter.y + nearestEnemy.center.y) / 2;
            }
        } else {
            // Hard: Optimal targeting with flanking
            const weakestEnemy = enemies.reduce((a, b) => a.count < b.count ? a : b);
            const nearestEnemy = this.findNearestEnemy(myCenter, enemies);

            // Calculate flank position (attack from the side)
            const enemyToMe = {
                x: myCenter.x - nearestEnemy.center.x,
                y: myCenter.y - nearestEnemy.center.y,
            };
            const dist = Math.sqrt(enemyToMe.x * enemyToMe.x + enemyToMe.y * enemyToMe.y);

            if (dist > 0) {
                // Normalize and rotate 45 degrees for flanking
                const nx = enemyToMe.x / dist;
                const ny = enemyToMe.y / dist;

                // Rotate direction for flanking maneuver
                const angle = Math.PI / 4 * (Math.random() < 0.5 ? 1 : -1);
                const rx = nx * Math.cos(angle) - ny * Math.sin(angle);
                const ry = nx * Math.sin(angle) + ny * Math.cos(angle);

                // Target behind/beside the enemy
                if (myCount > weakestEnemy.count) {
                    // Attack with flanking
                    targetX = weakestEnemy.center.x - rx * 0.1;
                    targetY = weakestEnemy.center.y - ry * 0.1;
                } else {
                    // Defensive positioning
                    targetX = myCenter.x + rx * 0.15;
                    targetY = myCenter.y + ry * 0.15;
                }
            } else {
                targetX = nearestEnemy.center.x;
                targetY = nearestEnemy.center.y;
            }

            // Hard AI also considers unclaimed territory
            if (Math.random() < 0.2) {
                const emptySpot = this.findEmptyTerritory();
                if (emptySpot && myCount > 500) {
                    targetX = emptySpot.x;
                    targetY = emptySpot.y;
                }
            }
        }

        // Clamp target to valid range
        aiState.targetX = Math.max(0.05, Math.min(0.95, targetX));
        aiState.targetY = Math.max(0.05, Math.min(0.95, targetY));
    }

    calculateTeamCenters() {
        const sums = {};
        const counts = {};

        for (let i = 1; i <= this.totalPlayers; i++) {
            const pid = `p${i}`;
            sums[pid] = { x: 0, y: 0 };
            counts[pid] = 0;
        }

        for (const particle of this.particles) {
            if (sums[particle.team]) {
                sums[particle.team].x += particle.x;
                sums[particle.team].y += particle.y;
                counts[particle.team]++;
            }
        }

        const centers = {};
        for (let i = 1; i <= this.totalPlayers; i++) {
            const pid = `p${i}`;
            if (counts[pid] > 0) {
                centers[pid] = {
                    x: (sums[pid].x / counts[pid]) / this.gridWidth,
                    y: (sums[pid].y / counts[pid]) / this.gridHeight,
                };
            }
        }

        return centers;
    }

    findNearestEnemy(myCenter, enemies) {
        let nearest = enemies[0];
        let minDist = Infinity;

        for (const enemy of enemies) {
            const dx = enemy.center.x - myCenter.x;
            const dy = enemy.center.y - myCenter.y;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }

        return nearest;
    }

    findEmptyTerritory() {
        // Optimized: sample random positions and use grid-based check
        // instead of iterating all particles
        const w = this.gridWidth;
        const h = this.gridHeight;
        let bestSpot = null;
        let bestMinDist = 0;

        for (let i = 0; i < 5; i++) {
            const x = 0.1 + Math.random() * 0.8;
            const y = 0.1 + Math.random() * 0.8;
            const gx = Math.floor(x * w);
            const gy = Math.floor(y * h);

            if (this.walls[gy][gx] === 1) continue;

            // Check a small neighborhood instead of all particles
            let minDist = 100; // Large default
            const checkRadius = 15;

            for (let dy = -checkRadius; dy <= checkRadius; dy += 3) {
                for (let dx = -checkRadius; dx <= checkRadius; dx += 3) {
                    const nx = gx + dx;
                    const ny = gy + dy;
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                    if (this.particleGrid[ny][nx]) {
                        const dist = dx * dx + dy * dy;
                        if (dist < minDist) minDist = dist;
                    }
                }
            }

            if (minDist > bestMinDist) {
                bestMinDist = minDist;
                bestSpot = { x, y };
            }
        }

        return bestSpot;
    }

    // Main game logic tick (host only)
    tick() {
        // Update elapsed time for sync across all clients
        this.state.elapsed = Date.now() - this.state.startTime;

        if (this.state.phase === 'countdown') {
            if (this.state.elapsed >= LIQUID_WAR_CONFIG.game.countdownTime) {
                this.state.phase = 'playing';
                this.state.startTime = Date.now();
                this.state.elapsed = 0;
                debugLog('Phase changed to playing');
            }
            return;
        }

        if (this.state.phase !== 'playing') return;

        // Check time limit
        if (this.state.elapsed >= LIQUID_WAR_CONFIG.game.maxTime) {
            this.endGame();
            return;
        }

        // Update AI cursors
        this.updateAICursors();

        // Compute gradients for all players
        this.computeGradients();

        // Move particles and handle combat
        this.moveParticles();
        this.handleCombat();

        // Update particle counts
        this.updateParticleCounts();

        // Check for winner - game ends when only one team has particles
        const teamsWithParticles = this.getTeamsWithParticles();
        if (teamsWithParticles.length <= 1) {
            this.endGame();
        }
    }

    // Compute gradients for all players (optimized with typed arrays)
    computeGradients() {
        for (let i = 1; i <= this.totalPlayers; i++) {
            const pid = `p${i}`;
            this.gradients[pid] = this.calculateGradient(pid);
        }
    }

    getTeamsWithParticles() {
        const teams = new Set();
        for (const particle of this.particles) {
            teams.add(particle.team);
        }
        return [...teams];
    }

    moveParticles() {
        // Instead of shuffling (expensive), iterate with random start and prime stride
        // This gives fair distribution without the O(n) shuffle cost
        const particles = this.particles;
        const len = particles.length;
        if (len === 0) return;

        const start = (Math.random() * len) | 0;
        // Use a prime stride to hit all elements in different order each tick
        const primes = [7, 11, 13, 17, 19, 23, 29, 31];
        const stride = primes[(Math.random() * primes.length) | 0];

        for (let i = 0; i < len; i++) {
            const idx = (start + i * stride) % len;
            this.moveParticle(particles[idx]);
        }
    }

    moveParticle(particle) {
        const gradient = this.gradients[particle.team];
        if (!gradient) return;

        const w = this.gridWidth;
        const currentGrad = gradient[particle.y * w + particle.x];
        if (currentGrad >= 65535) return;  // Unreachable

        // Find best adjacent cell (lowest gradient value)
        let bestDx = 0, bestDy = 0;
        let bestGrad = currentGrad;
        let hasBest = false;

        // Random starting direction for fairness
        const startDir = (Math.random() * 8) | 0;

        for (let i = 0; i < 8; i++) {
            const d = (startDir + i) % 8;
            const dir = DIRECTIONS[d];
            const nx = particle.x + dir.dx;
            const ny = particle.y + dir.dy;

            // Inline bounds and walkable check
            if (nx < 0 || nx >= w || ny < 0 || ny >= this.gridHeight) continue;
            if (this.walls[ny][nx] === 1) continue;

            const neighborGrad = gradient[ny * w + nx];

            // Only move if it gets us closer
            if (neighborGrad < bestGrad) {
                const occupant = this.particleGrid[ny][nx];
                // Can move if cell is empty or occupied by enemy (will attack)
                if (!occupant || occupant.team !== particle.team) {
                    bestDx = dir.dx;
                    bestDy = dir.dy;
                    bestGrad = neighborGrad;
                    hasBest = true;
                }
            }
        }

        // Move if we found a better cell
        if (hasBest) {
            const newX = particle.x + bestDx;
            const newY = particle.y + bestDy;
            const occupant = this.particleGrid[newY][newX];

            if (!occupant) {
                // Move to empty cell
                this.particleGrid[particle.y][particle.x] = null;
                particle.x = newX;
                particle.y = newY;
                this.particleGrid[newY][newX] = particle;
            }
            // If occupied by enemy, combat will be handled in handleCombat()
        }
    }

    handleCombat() {
        const config = LIQUID_WAR_CONFIG.particle;
        const w = this.gridWidth;
        const h = this.gridHeight;
        const attackDamage = config.attackDamage;
        const healAmount = config.healAmount;
        const maxHealth = config.maxHealth;

        // Use a simple array for dead particles (avoid array methods)
        let deadCount = 0;
        const deadParticles = this.deadParticlesBuffer || (this.deadParticlesBuffer = []);

        const particles = this.particles;
        const particleGrid = this.particleGrid;
        const len = particles.length;

        for (let i = 0; i < len; i++) {
            const particle = particles[i];
            const px = particle.x;
            const py = particle.y;
            const myTeam = particle.team;
            const myGrad = this.gradients[myTeam];

            if (!myGrad) continue;

            const myCurrentDist = myGrad[py * w + px];

            // Check all 8 neighbors
            for (let d = 0; d < 8; d++) {
                const dir = DIRECTIONS[d];
                const nx = px + dir.dx;
                const ny = py + dir.dy;

                // Bounds check
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

                const neighbor = particleGrid[ny][nx];
                if (!neighbor) continue;

                if (neighbor.team !== myTeam) {
                    // Enemy - check if blocking my path
                    const enemyPosOnMyGrad = myGrad[ny * w + nx];
                    if (enemyPosOnMyGrad < myCurrentDist) {
                        neighbor.health -= attackDamage;
                    }
                } else if (neighbor.health < maxHealth) {
                    // Ally - heal them
                    neighbor.health += healAmount;
                    if (neighbor.health > maxHealth) neighbor.health = maxHealth;
                }
            }

            // Check for death
            if (particle.health <= 0) {
                deadParticles[deadCount++] = particle;
            }
        }

        // Convert dead particles to the killer's team
        for (let i = 0; i < deadCount; i++) {
            const dead = deadParticles[i];
            const dx = dead.x;
            const dy = dead.y;

            // Find the killer (adjacent enemy)
            let killerTeam = null;
            for (let d = 0; d < 8; d++) {
                const dir = DIRECTIONS[d];
                const nx = dx + dir.dx;
                const ny = dy + dir.dy;

                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

                const neighbor = particleGrid[ny][nx];
                if (neighbor && neighbor.team !== dead.team) {
                    killerTeam = neighbor.team;
                    break;
                }
            }

            if (killerTeam) {
                dead.team = killerTeam;
            }
            dead.health = maxHealth * 0.5;
        }
    }

    updateParticleCounts() {
        const counts = {};
        for (let i = 1; i <= this.totalPlayers; i++) {
            counts[`p${i}`] = 0;
        }
        for (const p of this.particles) {
            if (counts[p.team] !== undefined) {
                counts[p.team]++;
            }
        }
        this.state.particleCounts = counts;
    }

    endGame() {
        this.state.phase = 'gameover';

        // Find the winner (player with most particles)
        let maxCount = 0;
        let winners = [];

        for (let i = 1; i <= this.totalPlayers; i++) {
            const pid = `p${i}`;
            const count = this.state.particleCounts[pid] || 0;
            if (count > maxCount) {
                maxCount = count;
                winners = [pid];
            } else if (count === maxCount && count > 0) {
                winners.push(pid);
            }
        }

        if (winners.length === 1) {
            this.state.winner = winners[0];
        } else if (winners.length > 1) {
            this.state.winner = 'tie';
        } else {
            // All eliminated somehow
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
        const aiPlayers = this.state.aiPlayers;
        const mapId = this.state.mapId;
        this.state = getInitialState(this.totalPlayers);
        this.state.mapId = mapId;
        if (playerNames) {
            this.state.playerNames = playerNames;
        }
        if (aiPlayers) {
            this.state.aiPlayers = aiPlayers;
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
