// Hex Tower Defense - Main Game Class

import { GameEngine } from '../../engine/GameEngine.js';
import { NetworkSync } from '../../engine/NetworkSync.js';
import { onMessage, sendMessage, offMessage } from '../../core/peer.js';
import {
    PHASES,
    PHASE_TIMING,
    ECONOMY,
    TOWER_STATS,
    UNIT_STATS,
    MINE_STATS,
    getInitialState
} from './config.js';
import { HexGrid } from './core/HexGrid.js';
import { generateTerrain } from './core/TerrainGenerator.js';
import { hexDistance, hexToPixel } from './core/HexMath.js';
import { Pathfinder } from './core/Pathfinder.js';

export class HexTDGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber, settings = {}) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber;
        this.playerId = playerNumber === 1 ? 'p1' : 'p2';
        this.enemyId = playerNumber === 1 ? 'p2' : 'p1';
        this.settings = settings;

        // Game state
        this.state = null;
        this.grid = null;
        this.terrain = null;
        this.pathfinder = null;

        // Unit pathfinding - maps unitId -> { path: [], currentIndex: 0 }
        this.unitPaths = new Map();

        // Rendering
        this.hexRenderer = null;
        this.THREE = null;

        // Network
        this.network = null;

        // AI
        this.aiOpponent = null;

        // Input state
        this.selectedTowerType = null;
        this.selectedBuildMode = 'tower'; // 'tower', 'mine', or 'recycle'
        this.hoveredHex = null;

        // Economy accumulator for fractional ore
        this.economyAccumulator = { p1: 0, p2: 0 };

        // Callbacks
        this.onGameOver = null;
        this.onGameReset = null;

        // Override 2D context - we use Three.js
        this.ctx = null;
    }

    async initialize() {
        // Initialize state
        this.state = getInitialState(this.settings);

        // Generate terrain
        this.terrain = generateTerrain(this.state.mapSeed);
        this.grid = this.terrain.grid;

        // Initialize pathfinder
        this.pathfinder = new Pathfinder(this.grid);

        // Set up Three.js rendering
        await this.initializeRenderer();

        // Set up networking
        this.initializeNetwork();

        // Set up input handlers
        this.initializeInput();

        // Place main towers
        this.placeMainTowers();

        // Set up AI if needed
        if (this.isHost && this.state.players.p2.isAI) {
            await this.initializeAI();
        }

        // Focus camera on player's base
        this.hexRenderer?.cameraController?.focusOnPlayer(this.playerNumber);

        // Sync initial state if host
        if (this.isHost) {
            this.sendFullState();
        }
    }

    async initializeRenderer() {
        // Dynamic import Three.js
        const THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
        this.THREE = THREE;

        // Create a new canvas for WebGL (the original canvas has a 2D context from GameEngine)
        this.webglCanvas = document.createElement('canvas');
        this.webglCanvas.width = this.canvas.width;
        this.webglCanvas.height = this.canvas.height;
        this.webglCanvas.style.position = 'absolute';
        this.webglCanvas.style.top = '0';
        this.webglCanvas.style.left = '0';
        this.webglCanvas.style.width = '100%';
        this.webglCanvas.style.height = '100%';

        // Insert WebGL canvas before the original canvas
        this.canvas.parentElement?.insertBefore(this.webglCanvas, this.canvas);

        // Hide the original 2D canvas
        this.canvas.style.display = 'none';

        // Dynamic import our renderer
        const { HexTDRenderer } = await import('./rendering/HexTDRenderer.js');

        // Create renderer with the WebGL canvas
        this.hexRenderer = new HexTDRenderer(THREE, this.webglCanvas, this.grid);

        // Set up radial menu action handler
        this.hexRenderer.onTileAction = (actionData) => {
            this.handleRadialMenuAction(actionData);
        };
    }

    handleRadialMenuAction(actionData) {
        const { action, type, tile } = actionData;
        if (!tile) return;

        const { q, r } = tile;

        if (action === 'build_tower' && type) {
            if (this.isHost) {
                this.buildTower(this.playerId, q, r, type);
            } else {
                sendMessage('hextd_action', { action: 'build_tower', q, r, type });
            }
        } else if (action === 'build_mine') {
            if (this.isHost) {
                this.buildMine(this.playerId, q, r);
            } else {
                sendMessage('hextd_action', { action: 'build_mine', q, r });
            }
        } else if (action === 'recycle_tower') {
            if (this.isHost) {
                this.recycleTower(this.playerId, q, r);
            } else {
                sendMessage('hextd_action', { action: 'recycle_tower', q, r });
            }
        } else if (action === 'queue_unit' && type) {
            this.queueUnit(type);
        }
    }

    initializeNetwork() {
        this.network = new NetworkSync(this.isHost);

        if (this.isHost) {
            // Host receives input from guest
            onMessage('hextd_action', (data) => {
                this.handleGuestAction(data);
            });
        } else {
            // Guest receives state from host
            onMessage('hextd_state', (data) => {
                this.handleStateUpdate(data);
            });
        }

        onMessage('player_name', (data) => {
            if (data.playerId && data.name) {
                this.state.playerNames = this.state.playerNames || {};
                this.state.playerNames[data.playerId] = data.name;
            }
        });

        onMessage('forfeit_request', (data) => {
            if (this.isHost && data.playerId) {
                this.handleForfeit(data.playerId);
            }
        });

        onMessage('rematch_request', () => {
            if (this.isHost) {
                this.handleRematchRequest();
            }
        });
    }

    initializeInput() {
        // Use the WebGL canvas for input events
        const inputCanvas = this.webglCanvas || this.canvas;

        // Click/tap for hex selection and building
        inputCanvas.addEventListener('click', (e) => this.handleClick(e));
        inputCanvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        // Mouse move for hover
        inputCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    placeMainTowers() {
        const p1Main = this.terrain.p1Main;
        const p2Main = this.terrain.p2Main;

        // Create main tower entities
        const mainTowerP1 = {
            id: this.getNextEntityId(),
            type: 'MAIN',
            q: p1Main.q,
            r: p1Main.r,
            hp: TOWER_STATS.MAIN.maxHP,
            owner: 'p1',
            cooldown: 0
        };

        const mainTowerP2 = {
            id: this.getNextEntityId(),
            type: 'MAIN',
            q: p2Main.q,
            r: p2Main.r,
            hp: TOWER_STATS.MAIN.maxHP,
            owner: 'p2',
            cooldown: 0
        };

        this.state.towers.push(mainTowerP1, mainTowerP2);
        this.grid.placeTower(p1Main.q, p1Main.r, mainTowerP1);
        this.grid.placeTower(p2Main.q, p2Main.r, mainTowerP2);

        this.mainTowers = { p1: mainTowerP1, p2: mainTowerP2 };
    }

    async initializeAI() {
        this.aiOpponent = {
            difficulty: this.state.aiDifficulty,
            lastDecision: 0,
            reactionDelay: this.state.aiDifficulty === 'Hard' ? 500 :
                          this.state.aiDifficulty === 'Medium' ? 1000 : 2000
        };
    }

    getNextEntityId() {
        return this.state.nextEntityId++;
    }

    // === GAME LOOP ===

    update(deltaTime) {
        if (!this.state) return;

        // Update phase timer
        this.updatePhase(deltaTime);

        // Host-only updates
        if (this.isHost) {
            // Update economy
            this.updateEconomy(deltaTime);

            // Update units
            this.updateUnits(deltaTime);

            // Update combat
            this.updateCombat(deltaTime);

            // Update AI
            this.updateAI(deltaTime);

            // Check win conditions
            this.checkWinConditions();

            // Send state to guest
            this.sendStateUpdate();
        }

        // Update camera controller
        this.hexRenderer?.cameraController?.update(deltaTime);
    }

    updatePhase(deltaTime) {
        if (!this.isHost) return;

        const now = Date.now();
        const elapsed = now - this.state.phaseStartTime;
        const phaseDuration = PHASE_TIMING[this.state.phase];

        if (phaseDuration && elapsed >= phaseDuration) {
            this.transitionPhase();
        }
    }

    transitionPhase() {
        const currentPhase = this.state.phase;

        switch (currentPhase) {
            case PHASES.PRE_WAVE:
                this.state.phase = PHASES.WAVE;
                this.state.phaseStartTime = Date.now();
                this.spawnWaveUnits();
                break;

            case PHASES.WAVE:
                this.state.phase = PHASES.INTER_WAVE;
                this.state.phaseStartTime = Date.now();
                this.cleanupWave();
                break;

            case PHASES.INTER_WAVE:
                this.state.phase = PHASES.PRE_WAVE;
                this.state.phaseStartTime = Date.now();
                this.state.waveNumber++;
                this.regenerateTowers();
                break;
        }
    }

    spawnWaveUnits() {
        // Clear old unit paths
        this.unitPaths.clear();

        for (const playerId of ['p1', 'p2']) {
            const player = this.state.players[playerId];
            const main = playerId === 'p1' ? this.terrain.p1Main : this.terrain.p2Main;
            const enemyMain = playerId === 'p1' ? this.terrain.p2Main : this.terrain.p1Main;
            const spawnOffset = playerId === 'p1' ? 3 : -3;

            for (const pending of player.pendingUnits) {
                for (let i = 0; i < pending.count; i++) {
                    const spawnQ = Math.floor(main.q + spawnOffset + (Math.random() - 0.5) * 2);
                    const spawnR = Math.floor(main.r + (Math.random() - 0.5) * 8);

                    const unit = {
                        id: this.getNextEntityId(),
                        type: pending.type,
                        q: spawnQ,
                        r: spawnR,
                        hp: UNIT_STATS[pending.type].maxHP,
                        owner: playerId,
                        cooldown: 0,
                        vx: 0,
                        vz: 0,
                        targetQ: enemyMain.q,
                        targetR: enemyMain.r
                    };
                    this.state.units.push(unit);

                    // Calculate initial path to enemy main tower
                    this.calculateUnitPath(unit);
                }
            }
            player.pendingUnits = [];
        }
    }

    calculateUnitPath(unit) {
        if (!this.pathfinder) return;

        const start = { q: Math.floor(unit.q), r: Math.floor(unit.r) };
        const goal = { q: unit.targetQ, r: unit.targetR };

        const path = this.pathfinder.findPath(start, goal);
        if (path && path.length > 0) {
            this.unitPaths.set(unit.id, {
                path,
                currentIndex: 0,
                lastRecalc: Date.now()
            });
        }
    }

    cleanupWave() {
        this.state.units = [];
        this.grid.clearUnits();
        this.unitPaths.clear();
    }

    regenerateTowers() {
        for (const tower of this.state.towers) {
            if (tower.type !== 'MAIN') {
                tower.hp = TOWER_STATS[tower.type].maxHP;
            }
        }
    }

    updateEconomy(deltaTime) {
        for (const playerId of ['p1', 'p2']) {
            const player = this.state.players[playerId];

            let income = ECONOMY.BASE_INCOME_PER_SEC;
            const mines = this.state.mines.filter(m => m.owner === playerId);
            income += mines.length * MINE_STATS.INCOME_PER_SEC;

            this.economyAccumulator[playerId] += income * deltaTime;

            const wholeOre = Math.floor(this.economyAccumulator[playerId]);
            if (wholeOre > 0) {
                player.ore += wholeOre;
                this.economyAccumulator[playerId] -= wholeOre;
            }
        }
    }

    updateUnits(deltaTime) {
        const now = Date.now();

        for (const unit of this.state.units) {
            if (unit.hp <= 0) continue;

            const stats = UNIT_STATS[unit.type];
            const unitHex = { q: Math.floor(unit.q), r: Math.floor(unit.r) };

            // Check if unit is in combat range of any enemy (tower or unit)
            const inCombat = this.isUnitInCombat(unit);
            if (inCombat) {
                unit.vx = 0;
                unit.vz = 0;
                continue; // Don't move while attacking
            }

            // Get or calculate path
            let pathData = this.unitPaths.get(unit.id);

            // Recalculate path if needed (every 2 seconds or if no path)
            if (!pathData || now - pathData.lastRecalc > 2000) {
                this.calculateUnitPath(unit);
                pathData = this.unitPaths.get(unit.id);
            }

            if (!pathData || !pathData.path || pathData.path.length === 0) {
                // Fallback: move directly toward target
                const targetMain = unit.owner === 'p1' ? this.mainTowers.p2 : this.mainTowers.p1;
                this.moveUnitToward(unit, targetMain.q, targetMain.r, deltaTime);
                continue;
            }

            // Find current waypoint
            const path = pathData.path;
            let currentIndex = pathData.currentIndex;

            // Advance through waypoints we've already passed
            while (currentIndex < path.length - 1) {
                const waypoint = path[currentIndex];
                const distToWaypoint = hexDistance(unitHex, waypoint);
                if (distToWaypoint <= 1) {
                    currentIndex++;
                    pathData.currentIndex = currentIndex;
                } else {
                    break;
                }
            }

            // Move toward current waypoint
            if (currentIndex < path.length) {
                const waypoint = path[currentIndex];
                this.moveUnitToward(unit, waypoint.q, waypoint.r, deltaTime);
            }
        }
    }

    moveUnitToward(unit, targetQ, targetR, deltaTime) {
        const stats = UNIT_STATS[unit.type];
        const dx = targetQ - unit.q;
        const dr = targetR - unit.r;
        const dist = Math.sqrt(dx * dx + dr * dr);

        if (dist > 0.1) {
            const speed = stats.speed * deltaTime;
            unit.vx = (dx / dist) * stats.speed;
            unit.vz = (dr / dist) * stats.speed;
            unit.q += (dx / dist) * speed;
            unit.r += (dr / dist) * speed;
        } else {
            unit.vx = 0;
            unit.vz = 0;
        }
    }

    isUnitInCombat(unit) {
        const stats = UNIT_STATS[unit.type];
        const attackRange = stats.attackRange || 1.5;
        const unitHex = { q: Math.floor(unit.q), r: Math.floor(unit.r) };

        // Check for enemy towers in range
        for (const tower of this.state.towers) {
            if (tower.owner !== unit.owner && tower.hp > 0) {
                const dist = hexDistance(unitHex, { q: tower.q, r: tower.r });
                if (dist <= attackRange) return true;
            }
        }

        // Check for enemy units in range
        for (const other of this.state.units) {
            if (other.owner !== unit.owner && other.hp > 0 && other.id !== unit.id) {
                const otherHex = { q: Math.floor(other.q), r: Math.floor(other.r) };
                const dist = hexDistance(unitHex, otherHex);
                if (dist <= attackRange) return true;
            }
        }

        return false;
    }

    updateCombat(deltaTime) {
        const HIGH_GROUND_BONUS = 0.20; // +20% range when attacking from high ground

        // Tower attacks on units
        for (const tower of this.state.towers) {
            if (tower.hp <= 0) continue;

            tower.cooldown -= deltaTime;
            if (tower.cooldown > 0) continue;

            const stats = TOWER_STATS[tower.type];
            const towerHeight = this.grid.getHeight(tower.q, tower.r);
            const enemies = this.state.units.filter(u => u.owner !== tower.owner && u.hp > 0);

            const inRange = enemies.filter(u => {
                const unitHex = { q: Math.floor(u.q), r: Math.floor(u.r) };
                const unitHeight = this.grid.getHeight(unitHex.q, unitHex.r);
                const dist = hexDistance({ q: tower.q, r: tower.r }, unitHex);

                // Apply high ground bonus if tower is higher than target
                let effectiveRange = stats.range;
                if (towerHeight > unitHeight) {
                    effectiveRange *= (1 + HIGH_GROUND_BONUS);
                }

                return dist <= effectiveRange;
            });

            if (inRange.length > 0) {
                // Target closest enemy
                inRange.sort((a, b) => {
                    const distA = hexDistance({ q: tower.q, r: tower.r }, { q: Math.floor(a.q), r: Math.floor(a.r) });
                    const distB = hexDistance({ q: tower.q, r: tower.r }, { q: Math.floor(b.q), r: Math.floor(b.r) });
                    return distA - distB;
                });

                const target = inRange[0];
                target.hp -= stats.damage;
                tower.cooldown = stats.cooldown;
            }
        }

        // Unit attacks - units can attack both towers AND other units
        for (const unit of this.state.units) {
            if (unit.hp <= 0) continue;

            unit.cooldown -= deltaTime;
            if (unit.cooldown > 0) continue;

            const stats = UNIT_STATS[unit.type];
            const attackRange = stats.attackRange || 1.5;
            const unitHex = { q: Math.floor(unit.q), r: Math.floor(unit.r) };

            // Find all potential targets (enemy units and towers)
            const targets = [];

            // Enemy units
            for (const other of this.state.units) {
                if (other.owner !== unit.owner && other.hp > 0 && other.id !== unit.id) {
                    const otherHex = { q: Math.floor(other.q), r: Math.floor(other.r) };
                    const dist = hexDistance(unitHex, otherHex);
                    if (dist <= attackRange) {
                        targets.push({ type: 'unit', target: other, dist });
                    }
                }
            }

            // Enemy towers
            for (const tower of this.state.towers) {
                if (tower.owner !== unit.owner && tower.hp > 0) {
                    const dist = hexDistance(unitHex, { q: tower.q, r: tower.r });
                    if (dist <= attackRange) {
                        targets.push({ type: 'tower', target: tower, dist });
                    }
                }
            }

            if (targets.length > 0) {
                // Prioritize: Main Tower > other towers > units, then by distance
                targets.sort((a, b) => {
                    // Priority scoring
                    const getPriority = (t) => {
                        if (t.type === 'tower' && t.target.type === 'MAIN') return 0;
                        if (t.type === 'tower') return 1;
                        return 2;
                    };
                    const prioA = getPriority(a);
                    const prioB = getPriority(b);
                    if (prioA !== prioB) return prioA - prioB;
                    return a.dist - b.dist;
                });

                const { type, target } = targets[0];
                target.hp -= stats.damage;
                unit.cooldown = stats.cooldown;

                // Update main tower HP in player state if main tower was hit
                if (type === 'tower' && target.type === 'MAIN') {
                    this.state.players[target.owner].mainTowerHP = target.hp;
                }
            }
        }

        // Remove dead units and clean up their paths
        const deadUnitIds = this.state.units.filter(u => u.hp <= 0).map(u => u.id);
        for (const id of deadUnitIds) {
            this.unitPaths.delete(id);
        }
        this.state.units = this.state.units.filter(u => u.hp > 0);

        // Remove dead non-main towers and clear pathfinder cache
        const deadTowers = this.state.towers.filter(t => t.hp <= 0 && t.type !== 'MAIN');
        for (const tower of deadTowers) {
            this.grid.removeTower(tower.q, tower.r);
        }
        if (deadTowers.length > 0) {
            this.pathfinder?.clearCache(); // Paths may have changed
        }
        this.state.towers = this.state.towers.filter(t => t.hp > 0 || t.type === 'MAIN');
    }

    updateAI(deltaTime) {
        if (!this.aiOpponent) return;

        const now = Date.now();
        if (now - this.aiOpponent.lastDecision < this.aiOpponent.reactionDelay) return;
        this.aiOpponent.lastDecision = now;

        if (this.state.phase === PHASES.PRE_WAVE) {
            const aiPlayer = this.state.players.p2;
            const aiMineCount = this.state.mines.filter(m => m.owner === 'p2').length;

            // Prioritize building mines early (up to 2-3 mines)
            if (aiMineCount < 3 && aiPlayer.ore >= MINE_STATS.COST && Math.random() < 0.5) {
                const resourceNodes = this.grid.getResourceNodes().filter(n => {
                    if (!this.grid.isMineable(n.q, n.r)) return false;
                    const owner = this.grid.getOwner(n.q, n.r);
                    return owner === 1 || owner === -1; // p2's territory or neutral
                });
                if (resourceNodes.length > 0) {
                    const node = resourceNodes[Math.floor(Math.random() * resourceNodes.length)];
                    this.buildMine('p2', node.q, node.r);
                }
            }

            // Build towers
            if (aiPlayer.ore >= TOWER_STATS.LIGHT.cost && Math.random() < 0.4) {
                const slots = this.grid.getTowerSlots(1).filter(s => this.grid.isBuildable(s.q, s.r));
                if (slots.length > 0) {
                    const slot = slots[Math.floor(Math.random() * slots.length)];
                    const towerType = Math.random() < 0.5 ? 'LIGHT' :
                                     Math.random() < 0.5 ? 'MEDIUM' : 'HEAVY';
                    const cost = TOWER_STATS[towerType].cost;
                    if (aiPlayer.ore >= cost) {
                        this.buildTower('p2', slot.q, slot.r, towerType);
                    }
                }
            }

            // Queue units
            if (aiPlayer.ore >= UNIT_STATS.LIGHT.cost && Math.random() < 0.6) {
                const unitType = Math.random() < 0.5 ? 'LIGHT' :
                                Math.random() < 0.5 ? 'MEDIUM' : 'HEAVY';
                const cost = UNIT_STATS[unitType].cost;
                if (aiPlayer.ore >= cost) {
                    aiPlayer.pendingUnits.push({ type: unitType, count: 1 });
                    aiPlayer.ore -= cost;
                }
            }
        }
    }

    checkWinConditions() {
        if (this.state.phase === PHASES.GAME_OVER) return;

        for (const playerId of ['p1', 'p2']) {
            if (this.state.players[playerId].mainTowerHP <= 0) {
                this.state.phase = PHASES.GAME_OVER;
                const winnerId = playerId === 'p1' ? 'p2' : 'p1';

                if (this.onGameOver) {
                    this.onGameOver({
                        winnerId,
                        playerNames: this.state.playerNames
                    });
                }
                return;
            }
        }
    }

    // === RENDERING ===

    render() {
        if (!this.hexRenderer) return;
        this.hexRenderer.render(this.state, this.playerId, this.isHost);
    }

    // === INPUT ===

    handleClick(e) {
        if (!this.hexRenderer) return;

        // Get click position relative to canvas
        const rect = this.webglCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // First, check if the radial menu wants to handle this click
        if (this.hexRenderer.radialMenu?.handleClick(x, y)) {
            return; // Menu handled it
        }

        // Otherwise, pan camera to center on clicked tile
        const hex = this.hexRenderer.screenToHex(e.clientX, e.clientY);
        if (!hex) return;

        this.hexRenderer.panToHex(hex.q, hex.r);
    }

    handleTouchEnd(e) {
        if (e.changedTouches.length === 0) return;

        const touch = e.changedTouches[0];

        // Get touch position relative to canvas
        const rect = this.webglCanvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        // First, check if the radial menu wants to handle this touch
        if (this.hexRenderer?.radialMenu?.handleClick(x, y)) {
            return; // Menu handled it
        }

        // Otherwise, pan camera to center on tapped tile
        const hex = this.hexRenderer?.screenToHex(touch.clientX, touch.clientY);
        if (!hex) return;

        this.hexRenderer.panToHex(hex.q, hex.r);
    }

    handleMouseMove(e) {
        // Mouse hover is less important with radial menu - keep it simple
        if (!this.hexRenderer) return;

        const hex = this.hexRenderer.screenToHex(e.clientX, e.clientY);
        if (hex) {
            this.hoveredHex = hex;
            this.hexRenderer.showHover(hex.q, hex.r);
        } else {
            this.hoveredHex = null;
            this.hexRenderer.hideHover();
        }
    }

    handleKeyDown(e) {
        // Get the currently selected center tile from the radial menu
        const centerTile = this.hexRenderer?.centerTile;

        // Keyboard shortcuts for quick building on center tile (1, 2, 3 for towers)
        if (centerTile && (this.state.phase === PHASES.PRE_WAVE || this.state.phase === PHASES.WAVE)) {
            if (e.key === '1') {
                this.handleRadialMenuAction({ action: 'build_tower', type: 'LIGHT', tile: centerTile });
            }
            if (e.key === '2') {
                this.handleRadialMenuAction({ action: 'build_tower', type: 'MEDIUM', tile: centerTile });
            }
            if (e.key === '3') {
                this.handleRadialMenuAction({ action: 'build_tower', type: 'HEAVY', tile: centerTile });
            }
            // Mine building (4)
            if (e.key === '4') {
                this.handleRadialMenuAction({ action: 'build_mine', tile: centerTile });
            }
            // Recycle (R) - only during PRE_WAVE
            if ((e.key === 'r' || e.key === 'R') && this.state.phase === PHASES.PRE_WAVE) {
                this.handleRadialMenuAction({ action: 'recycle_tower', tile: centerTile });
            }
        }

        // Escape to close radial menu
        if (e.key === 'Escape') {
            this.hexRenderer?.radialMenu?.close();
        }

        // Space to toggle radial menu
        if (e.key === ' ') {
            e.preventDefault();
            this.hexRenderer?.radialMenu?.toggle();
        }

        // Unit queuing (Q, W, E) - only during PRE_WAVE
        if (this.state.phase === PHASES.PRE_WAVE) {
            if (e.key === 'q' || e.key === 'Q') this.queueUnit('LIGHT');
            if (e.key === 'w' || e.key === 'W') this.queueUnit('MEDIUM');
            if (e.key === 'e' || e.key === 'E') this.queueUnit('HEAVY');
        }

        // Camera controls
        if (e.key === 'Home') {
            this.hexRenderer?.cameraController?.focusOnPlayer(this.playerNumber);
        }
    }

    // === ACTIONS ===

    buildTower(playerId, q, r, type) {
        const player = this.state.players[playerId];
        const cost = TOWER_STATS[type].cost;

        if (player.ore < cost) return false;
        if (!this.grid.isBuildable(q, r)) return false;

        player.ore -= cost;

        const tower = {
            id: this.getNextEntityId(),
            type,
            q,
            r,
            hp: TOWER_STATS[type].maxHP,
            owner: playerId,
            cooldown: 0
        };

        this.state.towers.push(tower);
        this.grid.placeTower(q, r, tower);

        return true;
    }

    queueUnit(type) {
        const player = this.state.players[this.playerId];
        const cost = UNIT_STATS[type].cost;

        if (player.ore < cost) return false;
        if (this.state.phase !== PHASES.PRE_WAVE) return false;

        if (this.isHost) {
            player.ore -= cost;
            player.pendingUnits.push({ type, count: 1 });
        } else {
            sendMessage('hextd_action', {
                action: 'queue_unit',
                type
            });
        }

        return true;
    }

    buildMine(playerId, q, r) {
        const player = this.state.players[playerId];
        const cost = MINE_STATS.COST;

        if (player.ore < cost) return false;
        if (!this.grid.isMineable(q, r)) return false;

        player.ore -= cost;

        const mine = {
            id: this.getNextEntityId(),
            q,
            r,
            owner: playerId
        };

        this.state.mines.push(mine);
        this.grid.placeMine(q, r, mine);

        return true;
    }

    recycleTower(playerId, q, r) {
        // Find the tower at this position
        const towerIndex = this.state.towers.findIndex(
            t => t.q === q && t.r === r && t.owner === playerId && t.type !== 'MAIN'
        );

        if (towerIndex === -1) return false;

        // Only allow recycling during PRE_WAVE
        if (this.state.phase !== PHASES.PRE_WAVE) return false;

        const tower = this.state.towers[towerIndex];
        const player = this.state.players[playerId];

        // Refund 75% of the tower cost
        const refund = Math.floor(TOWER_STATS[tower.type].cost * ECONOMY.RECYCLE_REFUND_RATIO);
        player.ore += refund;

        // Remove the tower
        this.state.towers.splice(towerIndex, 1);
        this.grid.removeTower(q, r);

        // Clear pathfinder cache since map changed
        this.pathfinder?.clearCache();

        return true;
    }

    // === NETWORKING ===

    sendFullState() {
        sendMessage('hextd_state', {
            full: true,
            state: this.state
        });
    }

    sendStateUpdate() {
        if (!this._lastStateUpdate || Date.now() - this._lastStateUpdate > 33) {
            sendMessage('hextd_state', {
                full: false,
                state: {
                    phase: this.state.phase,
                    phaseStartTime: this.state.phaseStartTime,
                    waveNumber: this.state.waveNumber,
                    players: this.state.players,
                    units: this.state.units.map(u => ({
                        id: u.id, type: u.type, q: u.q, r: u.r, hp: u.hp, owner: u.owner, vx: u.vx, vz: u.vz
                    })),
                    towers: this.state.towers.map(t => ({
                        id: t.id, type: t.type, q: t.q, r: t.r, hp: t.hp, owner: t.owner
                    })),
                    mines: this.state.mines
                }
            });
            this._lastStateUpdate = Date.now();
        }
    }

    handleStateUpdate(data) {
        if (data.full) {
            this.state = data.state;
            // Regenerate terrain if needed
            if (!this.terrain || this.terrain.grid !== this.grid) {
                this.terrain = generateTerrain(this.state.mapSeed);
                this.grid = this.terrain.grid;
            }
        } else {
            // Merge partial update
            this.state.phase = data.state.phase;
            this.state.phaseStartTime = data.state.phaseStartTime;
            this.state.waveNumber = data.state.waveNumber;
            this.state.players = data.state.players;
            this.state.units = data.state.units;
            this.state.towers = data.state.towers;
            this.state.mines = data.state.mines;
        }
    }

    handleGuestAction(data) {
        if (data.action === 'queue_unit') {
            const player = this.state.players.p2;
            const cost = UNIT_STATS[data.type].cost;

            if (player.ore >= cost && this.state.phase === PHASES.PRE_WAVE) {
                player.ore -= cost;
                player.pendingUnits.push({ type: data.type, count: 1 });
            }
        } else if (data.action === 'build_tower') {
            this.buildTower('p2', data.q, data.r, data.type);
        } else if (data.action === 'build_mine') {
            this.buildMine('p2', data.q, data.r);
        } else if (data.action === 'recycle_tower') {
            this.recycleTower('p2', data.q, data.r);
        }
    }

    handleForfeit(playerId) {
        this.state.phase = PHASES.GAME_OVER;
        const winnerId = playerId === 'p1' ? 'p2' : 'p1';

        if (this.onGameOver) {
            this.onGameOver({
                winnerId,
                forfeitedBy: playerId,
                playerNames: this.state.playerNames
            });
        }
    }

    handleRematchRequest() {
        this.state = getInitialState(this.settings);
        this.terrain = generateTerrain(this.state.mapSeed);
        this.grid = this.terrain.grid;
        this.placeMainTowers();

        if (this.onGameReset) {
            this.onGameReset();
        }

        this.sendFullState();
    }

    // === LIFECYCLE ===

    forfeit() {
        if (this.isHost) {
            this.handleForfeit(this.playerId);
        } else {
            sendMessage('forfeit_request', { playerId: this.playerId });
        }
    }

    requestRematch() {
        if (this.isHost) {
            this.handleRematchRequest();
        } else {
            sendMessage('rematch_request', {});
        }
    }

    destroy() {
        offMessage('hextd_action');
        offMessage('hextd_state');
        offMessage('player_name');
        offMessage('forfeit_request');
        offMessage('rematch_request');

        this.hexRenderer?.dispose();
        this.hexRenderer = null;

        // Remove WebGL canvas
        if (this.webglCanvas && this.webglCanvas.parentElement) {
            this.webglCanvas.parentElement.removeChild(this.webglCanvas);
        }

        // Restore original canvas visibility
        if (this.canvas) {
            this.canvas.style.display = '';
        }

        super.destroy();
    }
}
