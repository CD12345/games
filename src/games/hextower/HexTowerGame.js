import { GameEngine } from '../../engine/GameEngine.js';
import { NetworkSync } from '../../engine/NetworkSync.js';
import { onMessage, offMessage } from '../../core/peer.js';
import { HexTowerRenderer } from './HexTowerRenderer.js';
import { HEX_TOWER_CONFIG, getInitialState } from './config.js';

const SQRT3 = Math.sqrt(3);
const TILE_TYPES = HEX_TOWER_CONFIG.map.tileTypes;

const UNIT_STATS = {
    UNIT_LIGHT: HEX_TOWER_CONFIG.units.light,
    UNIT_MEDIUM: HEX_TOWER_CONFIG.units.medium,
    UNIT_HEAVY: HEX_TOWER_CONFIG.units.heavy
};

const TOWER_STATS = {
    TOWER_LIGHT: HEX_TOWER_CONFIG.towers.light,
    TOWER_MEDIUM: HEX_TOWER_CONFIG.towers.medium,
    TOWER_HEAVY: HEX_TOWER_CONFIG.towers.heavy
};

function mulberry32(seed) {
    let t = seed;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), t | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function axialToWorld(q, r, size = 1) {
    return {
        x: size * SQRT3 * (q + r / 2),
        y: size * 1.5 * r
    };
}

function worldToAxial(x, y, size = 1) {
    const q = (SQRT3 / 3 * x - 1 / 3 * y) / size;
    const r = (2 / 3 * y) / size;
    return hexRound(q, r);
}

function hexRound(q, r) {
    const x = q;
    const z = r;
    const y = -x - z;

    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);

    const xDiff = Math.abs(rx - x);
    const yDiff = Math.abs(ry - y);
    const zDiff = Math.abs(rz - z);

    if (xDiff > yDiff && xDiff > zDiff) {
        rx = -ry - rz;
    } else if (yDiff > zDiff) {
        ry = -rx - rz;
    } else {
        rz = -rx - ry;
    }

    return { q: rx, r: rz };
}

function axialDistance(a, b) {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export class HexTowerGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber;
        this.playerId = playerNumber === 1 ? 'p1' : 'p2';
        this.opponentId = playerNumber === 1 ? 'p2' : 'p1';

        this.state = getInitialState();
        this.network = new NetworkSync(gameCode, isHost);
        this.renderer = new HexTowerRenderer(canvas);

        this.map = null;
        this.distanceFields = { p1: null, p2: null };
        this.tileIndexByCoord = new Map();

        this.accumulator = 0;
        this.unitIdCounter = 0;

        this.localUi = {
            selectedBuild: 'TOWER_LIGHT',
            buttons: [],
            planned: { light: 0, medium: 0, heavy: 0 }
        };

        this.lastCanvasSize = { width: 0, height: 0 };

        this.onGameOver = null;
        this.gameOverNotified = false;

        this.handlePointer = this.handlePointer.bind(this);
    }

    async initialize() {
        this.canvas.addEventListener('pointerdown', this.handlePointer);

        if (this.isHost) {
            if (!this.state.seed) {
                const baseSeed = Array.from(this.gameCode || 'HEX').reduce(
                    (sum, char) => sum + char.charCodeAt(0),
                    0
                );
                this.state.seed = baseSeed + Date.now();
            }
            this.generateMap();
            this.network.onInputUpdate = (input) => {
                if (input?.action) {
                    this.applyAction(input.action, this.opponentId);
                }
            };
        } else {
            this.network.onStateUpdate = (state) => {
                if (state) {
                    this.state = { ...this.state, ...state };
                    this.syncLocalPlan();
                    if (this.state.seed && !this.map) {
                        this.generateMap();
                    }
                }
            };
        }

        this.network.start();

        onMessage('return_to_menu', () => {
            this.destroy();
        });
    }

    destroy() {
        super.destroy();
        this.canvas.removeEventListener('pointerdown', this.handlePointer);
        this.network.stop();
        offMessage('return_to_menu');
    }

    update(deltaTime) {
        if (!this.map) {
            return;
        }

        this.accumulator += deltaTime;
        while (this.accumulator >= HEX_TOWER_CONFIG.timing.tickSeconds) {
            if (this.isHost) {
                this.updateHostLogic(HEX_TOWER_CONFIG.timing.tickSeconds);
                this.network.sendState(this.state);
            } else {
                this.network.updateInterpolation(HEX_TOWER_CONFIG.timing.tickSeconds);
            }
            this.accumulator -= HEX_TOWER_CONFIG.timing.tickSeconds;
        }

        if (this.state.gameOver && !this.gameOverNotified && this.onGameOver) {
            this.gameOverNotified = true;
            this.onGameOver(this.state.gameOver);
        }
    }

    render() {
        if (!this.map) {
            this.clear();
            return;
        }
        if (
            this.canvas.width !== this.lastCanvasSize.width ||
            this.canvas.height !== this.lastCanvasSize.height
        ) {
            this.lastCanvasSize = { width: this.canvas.width, height: this.canvas.height };
            this.refreshButtons();
        }
        const player = this.state.players[this.playerId];
        const uiState = {
            ore: player?.ore ?? 0,
            planned: this.localUi.planned,
            buttons: this.localUi.buttons
        };
        this.renderer.render(this.map.tiles, this.state, uiState, {});
    }

    generateMap() {
        const seed = this.state.seed || Date.now();
        const rng = mulberry32(seed);
        const width = HEX_TOWER_CONFIG.map.width;
        const height = HEX_TOWER_CONFIG.map.height;

        const tiles = [];
        const tileIndexByCoord = new Map();

        for (let r = 0; r < height; r++) {
            for (let q = 0; q < width; q++) {
                const heightLevel = rng() < 0.5 ? 0 : 1;
                const tile = {
                    q,
                    r,
                    heightLevel,
                    tileType: TILE_TYPES.EMPTY,
                    owner: null,
                    world: axialToWorld(q, r)
                };
                const index = q + r * width;
                tiles[index] = tile;
                tileIndexByCoord.set(`${q},${r}`, index);
            }
        }

        const laneRows = [Math.floor(height / 3), Math.floor((2 * height) / 3)];
        for (const laneR of laneRows) {
            for (let q = 0; q < width; q++) {
                const index = q + laneR * width;
                const tile = tiles[index];
                tile.tileType = TILE_TYPES.EMPTY;
                if (q > 0) {
                    const prev = tiles[q - 1 + laneR * width];
                    if (prev.heightLevel !== tile.heightLevel) {
                        tile.tileType = TILE_TYPES.RAMP;
                        prev.tileType = TILE_TYPES.RAMP;
                    }
                }
            }
        }

        for (const tile of tiles) {
            if (laneRows.includes(tile.r)) {
                continue;
            }
            if (rng() < 0.05) {
                tile.tileType = TILE_TYPES.BLOCKED;
            }
        }

        const towerSlotCandidates = new Map();
        for (const laneR of laneRows) {
            for (let q = 0; q < width; q++) {
                const neighbors = this.getNeighbors(q, laneR, width, height);
                for (const neighbor of neighbors) {
                    const key = `${neighbor.q},${neighbor.r}`;
                    towerSlotCandidates.set(key, neighbor);
                }
            }
        }

        const candidates = Array.from(towerSlotCandidates.values()).filter((coord) => {
            const tile = tiles[coord.q + coord.r * width];
            return tile.tileType === TILE_TYPES.EMPTY || tile.tileType === TILE_TYPES.RAMP;
        });

        const targetPerSide = 80;
        let p1Count = 0;
        let p2Count = 0;
        while (candidates.length && (p1Count < targetPerSide || p2Count < targetPerSide)) {
            const idx = Math.floor(rng() * candidates.length);
            const coord = candidates.splice(idx, 1)[0];
            const tile = tiles[coord.q + coord.r * width];
            if (tile.tileType !== TILE_TYPES.EMPTY && tile.tileType !== TILE_TYPES.RAMP) {
                continue;
            }
            tile.tileType = TILE_TYPES.TOWER_SLOT;
            tile.owner = coord.q < width / 2 ? 'p1' : 'p2';
            if (tile.owner === 'p1' && p1Count < targetPerSide) {
                p1Count++;
            } else if (tile.owner === 'p2' && p2Count < targetPerSide) {
                p2Count++;
            } else {
                tile.tileType = TILE_TYPES.EMPTY;
                tile.owner = null;
            }
        }

        const placeResourceNodes = (count, qMin, qMax) => {
            let placed = 0;
            while (placed < count) {
                const q = Math.floor(rng() * (qMax - qMin + 1)) + qMin;
                const r = Math.floor(rng() * height);
                const tile = tiles[q + r * width];
                if (tile.tileType === TILE_TYPES.EMPTY) {
                    tile.tileType = TILE_TYPES.RESOURCE_NODE;
                    placed++;
                }
            }
        };

        placeResourceNodes(3, 2, 18);
        placeResourceNodes(3, width - 19, width - 3);
        placeResourceNodes(6, Math.floor(width * 0.4), Math.floor(width * 0.6));

        const mainTowerPositions = {
            p1: { q: 5, r: Math.floor(height / 2) },
            p2: { q: width - 6, r: Math.floor(height / 2) }
        };

        const mainTowerTiles = {};
        for (const playerId of Object.keys(mainTowerPositions)) {
            const pos = mainTowerPositions[playerId];
            const index = pos.q + pos.r * width;
            const tile = tiles[index];
            tile.tileType = TILE_TYPES.MAIN_TOWER_SLOT;
            tile.heightLevel = 1;
            tile.owner = playerId;
            mainTowerTiles[playerId] = index;
        }

        this.map = {
            width,
            height,
            tiles
        };
        this.tileIndexByCoord = tileIndexByCoord;
        this.state.mainTowerTiles = mainTowerTiles;

        this.distanceFields.p1 = this.computeDistanceField(mainTowerTiles.p2);
        this.distanceFields.p2 = this.computeDistanceField(mainTowerTiles.p1);

        this.syncLocalPlan();
        this.refreshButtons();
    }

    computeDistanceField(targetIndex) {
        const { width, height, tiles } = this.map;
        const distance = new Array(tiles.length).fill(Infinity);
        const queue = [];
        distance[targetIndex] = 0;
        queue.push(targetIndex);

        while (queue.length) {
            const current = queue.shift();
            const tile = tiles[current];
            const neighbors = this.getNeighbors(tile.q, tile.r, width, height);
            for (const neighbor of neighbors) {
                const neighborIndex = neighbor.q + neighbor.r * width;
                if (!this.canMove(current, neighborIndex)) {
                    continue;
                }
                if (distance[neighborIndex] > distance[current] + 1) {
                    distance[neighborIndex] = distance[current] + 1;
                    queue.push(neighborIndex);
                }
            }
        }

        return distance;
    }

    canMove(fromIndex, toIndex) {
        const { tiles } = this.map;
        const from = tiles[fromIndex];
        const to = tiles[toIndex];
        if (!from || !to) return false;
        if (to.tileType === TILE_TYPES.BLOCKED) return false;

        if (from.heightLevel === to.heightLevel) {
            return true;
        }
        return from.tileType === TILE_TYPES.RAMP || to.tileType === TILE_TYPES.RAMP;
    }

    getNeighbors(q, r, width, height) {
        const directions = [
            { q: 1, r: 0 },
            { q: -1, r: 0 },
            { q: 0, r: 1 },
            { q: 0, r: -1 },
            { q: 1, r: -1 },
            { q: -1, r: 1 }
        ];
        const neighbors = [];
        for (const dir of directions) {
            const nq = q + dir.q;
            const nr = r + dir.r;
            if (nq >= 0 && nq < width && nr >= 0 && nr < height) {
                neighbors.push({ q: nq, r: nr });
            }
        }
        return neighbors;
    }

    updateHostLogic(deltaTime) {
        this.updatePhase(deltaTime);
        this.updateEconomy(deltaTime);
        this.updateTowers(deltaTime);
        this.updateUnits(deltaTime);
        this.cleanupDestroyed();
        this.checkGameOver();
    }

    updatePhase(deltaTime) {
        const phase = this.state.phase;
        phase.remaining -= deltaTime;
        if (phase.remaining > 0) {
            return;
        }

        if (phase.name === 'pre') {
            this.startWavePhase();
        } else if (phase.name === 'wave') {
            this.startCleanupPhase();
        } else {
            this.startPreWavePhase();
        }
    }

    startPreWavePhase() {
        const phase = this.state.phase;
        phase.name = 'pre';
        phase.remaining = HEX_TOWER_CONFIG.timing.preWavePhaseDuration;
        phase.wave += 1;
    }

    startWavePhase() {
        const phase = this.state.phase;
        phase.name = 'wave';
        phase.remaining = HEX_TOWER_CONFIG.timing.wavePhaseDuration;

        for (const playerId of ['p1', 'p2']) {
            this.state.towerSnapshots[playerId] = this.snapshotTowers(playerId);
        }

        this.spawnWaveUnits('p1');
        this.spawnWaveUnits('p2');
    }

    startCleanupPhase() {
        const phase = this.state.phase;
        phase.name = 'cleanup';
        phase.remaining = HEX_TOWER_CONFIG.timing.interWaveCleanupDuration;

        this.applyTowerRegeneration();
        this.state.units.p1 = [];
        this.state.units.p2 = [];
    }

    snapshotTowers(playerId) {
        const snapshot = {};
        for (const tower of this.state.players[playerId].towers) {
            snapshot[tower.tileIndex] = tower.type;
        }
        return snapshot;
    }

    applyTowerRegeneration() {
        for (const playerId of ['p1', 'p2']) {
            const snapshot = this.state.towerSnapshots[playerId] || {};
            const towers = this.state.players[playerId].towers;
            const bySlot = new Map();

            for (const tower of towers) {
                bySlot.set(tower.tileIndex, tower);
            }

            const restored = [];
            for (const [slotIndex, towerType] of Object.entries(snapshot)) {
                const existing = bySlot.get(Number(slotIndex));
                if (existing) {
                    existing.hp = existing.maxHP;
                    restored.push(existing);
                    bySlot.delete(Number(slotIndex));
                } else {
                    const stats = TOWER_STATS[towerType];
                    if (stats) {
                        restored.push({
                            owner: playerId,
                            type: towerType,
                            tileIndex: Number(slotIndex),
                            hp: stats.maxHP,
                            maxHP: stats.maxHP,
                            attackDamage: stats.attackDamage,
                            attackCooldown: stats.attackCooldown,
                            attackRange: stats.attackRangeHexes,
                            cooldown: 0
                        });
                    }
                }
            }

            for (const tower of bySlot.values()) {
                tower.hp = tower.maxHP;
                restored.push(tower);
            }

            this.state.players[playerId].towers = restored;
        }
    }

    updateEconomy(deltaTime) {
        for (const playerId of ['p1', 'p2']) {
            const player = this.state.players[playerId];
            const mines = player.mines.length;
            const income = HEX_TOWER_CONFIG.economy.baseOreIncomePerSecond +
                mines * HEX_TOWER_CONFIG.economy.mine.oreIncomePerSecond;
            player.ore += income * deltaTime;
        }
    }

    spawnWaveUnits(playerId) {
        const composition = this.state.waveCompositions[playerId];
        const player = this.state.players[playerId];
        const totalCost =
            composition.light * HEX_TOWER_CONFIG.units.light.cost +
            composition.medium * HEX_TOWER_CONFIG.units.medium.cost +
            composition.heavy * HEX_TOWER_CONFIG.units.heavy.cost;
        if (totalCost > player.ore) {
            return;
        }
        player.ore -= totalCost;

        const spawnList = [
            { type: 'UNIT_LIGHT', count: composition.light },
            { type: 'UNIT_MEDIUM', count: composition.medium },
            { type: 'UNIT_HEAVY', count: composition.heavy }
        ];

        const spawnHexes = this.getSpawnHexes(playerId);
        for (const entry of spawnList) {
            for (let i = 0; i < entry.count; i++) {
                const spawnHex = spawnHexes[Math.floor(Math.random() * spawnHexes.length)];
                const stats = UNIT_STATS[entry.type];
                const basePos = axialToWorld(spawnHex.q, spawnHex.r);
                const jitter = (Math.random() - 0.5) * 0.6;
                const jitterY = (Math.random() - 0.5) * 0.6;
                const unit = {
                    id: `u${this.unitIdCounter++}`,
                    owner: playerId,
                    type: entry.type,
                    maxHP: stats.maxHP,
                    hp: stats.maxHP,
                    moveSpeed: stats.moveSpeed,
                    attackDamage: stats.attackDamage,
                    attackCooldown: stats.attackCooldown,
                    attackRange: stats.attackRange,
                    radius: stats.radius,
                    position: {
                        x: basePos.x + jitter,
                        y: basePos.y + jitterY
                    },
                    cooldown: 0
                };
                this.state.units[playerId].push(unit);
            }
        }
    }

    getSpawnHexes(playerId) {
        const { width, height } = this.map;
        const spawnHexes = [];
        const qStart = playerId === 'p1' ? 0 : width - 3;
        const qEnd = playerId === 'p1' ? 3 : width;
        for (let q = qStart; q < qEnd; q++) {
            for (let r = 0; r < height; r += 5) {
                spawnHexes.push({ q, r });
            }
        }
        return spawnHexes;
    }

    updateTowers(deltaTime) {
        for (const playerId of ['p1', 'p2']) {
            const towers = this.state.players[playerId].towers;
            for (const tower of towers) {
                tower.cooldown -= deltaTime;
                if (tower.cooldown > 0) continue;
                const target = this.findTowerTarget(tower, playerId);
                if (target) {
                    target.hp -= tower.attackDamage;
                    tower.cooldown = tower.attackCooldown;
                }
            }
        }
    }

    findTowerTarget(tower, owner) {
        const enemyUnits = this.state.units[owner === 'p1' ? 'p2' : 'p1'];
        const tile = this.map.tiles[tower.tileIndex];
        if (!tile) return null;
        const towerHex = { q: tile.q, r: tile.r };
        const towerHeight = tile.heightLevel;
        let nearest = null;
        let nearestDistance = Infinity;
        for (const unit of enemyUnits) {
            const unitHex = worldToAxial(unit.position.x, unit.position.y);
            const unitTile = this.map.tiles[unitHex.q + unitHex.r * this.map.width];
            const unitHeight = unitTile?.heightLevel ?? 0;
            let range = tower.attackRange;
            if (towerHeight === 1 && unitHeight === 0) {
                range *= 1 + HEX_TOWER_CONFIG.combatModifiers.highGroundRangeBonusPercent / 100;
            }
            const distance = axialDistance(towerHex, unitHex);
            if (distance <= range && distance < nearestDistance) {
                nearest = unit;
                nearestDistance = distance;
            }
        }
        return nearest;
    }

    updateUnits(deltaTime) {
        for (const playerId of ['p1', 'p2']) {
            const units = this.state.units[playerId];
            const enemyId = playerId === 'p1' ? 'p2' : 'p1';
            for (const unit of units) {
                unit.cooldown -= deltaTime;
                const target = this.findUnitTarget(unit, enemyId);
                if (target) {
                    const distance = this.distance(unit.position, target.position);
                    if (distance <= unit.attackRange) {
                        if (unit.cooldown <= 0) {
                            if (target.type === 'main') {
                                this.state.players[target.owner].mainTowerHP -= unit.attackDamage;
                            } else {
                                target.ref.hp -= unit.attackDamage;
                            }
                            unit.cooldown = unit.attackCooldown;
                        }
                        continue;
                    }
                }

                this.moveUnit(unit, units, playerId, deltaTime);
            }
        }
    }

    findUnitTarget(unit, enemyId) {
        const enemyTowers = this.state.players[enemyId].towers;
        const enemyMines = this.state.players[enemyId].mines;
        const towerTargets = enemyTowers.map((tower) => ({
            type: 'tower',
            position: this.map.tiles[tower.tileIndex].world,
            ref: tower
        }));
        const mineTargets = enemyMines.map((mine) => ({
            type: 'mine',
            position: this.map.tiles[mine.tileIndex].world,
            ref: mine
        }));
        const mainTowerIndex = this.state.mainTowerTiles?.[enemyId];
        const mainTowerPos = mainTowerIndex !== undefined
            ? this.map.tiles[mainTowerIndex].world
            : null;

        const chooseNearest = (targets) => {
            let nearest = null;
            let nearestDistance = Infinity;
            for (const target of targets) {
                const distance = this.distance(unit.position, target.position);
                if (distance <= unit.attackRange && distance < nearestDistance) {
                    nearest = target;
                    nearestDistance = distance;
                }
            }
            return nearest;
        };

        const towerTarget = chooseNearest(towerTargets);
        if (towerTarget) return towerTarget;
        const mineTarget = chooseNearest(mineTargets);
        if (mineTarget) return mineTarget;
        if (mainTowerPos) {
            const distance = this.distance(unit.position, mainTowerPos);
            if (distance <= unit.attackRange) {
                return {
                    type: 'main',
                    position: mainTowerPos,
                    owner: enemyId
                };
            }
        }
        return null;
    }

    moveUnit(unit, units, playerId, deltaTime) {
        const distanceField = this.distanceFields[playerId];
        const currentHex = worldToAxial(unit.position.x, unit.position.y);
        const nextHex = this.chooseNextHex(currentHex, distanceField);
        if (!nextHex) {
            return;
        }
        const nextPos = axialToWorld(nextHex.q, nextHex.r);
        const desired = this.normalize({
            x: nextPos.x - unit.position.x,
            y: nextPos.y - unit.position.y
        });
        const vDesired = {
            x: desired.x * unit.moveSpeed,
            y: desired.y * unit.moveSpeed
        };

        const separation = this.calculateSeparation(unit, units);
        const separationWeight = 1.2;
        const v = {
            x: vDesired.x + separation.x * separationWeight,
            y: vDesired.y + separation.y * separationWeight
        };
        const vMag = Math.hypot(v.x, v.y);
        if (vMag > unit.moveSpeed) {
            v.x = (v.x / vMag) * unit.moveSpeed;
            v.y = (v.y / vMag) * unit.moveSpeed;
        }
        unit.position.x += v.x * deltaTime;
        unit.position.y += v.y * deltaTime;
    }

    chooseNextHex(currentHex, distanceField) {
        if (!distanceField) {
            return null;
        }
        const { width, height } = this.map;
        if (
            currentHex.q < 0 ||
            currentHex.q >= width ||
            currentHex.r < 0 ||
            currentHex.r >= height
        ) {
            return null;
        }
        const currentIndex = currentHex.q + currentHex.r * width;
        const currentDist = distanceField[currentIndex];
        let best = null;
        let bestDist = currentDist;
        const neighbors = this.getNeighbors(currentHex.q, currentHex.r, width, height);
        for (const neighbor of neighbors) {
            const neighborIndex = neighbor.q + neighbor.r * width;
            if (!this.canMove(currentIndex, neighborIndex)) {
                continue;
            }
            const neighborDist = distanceField[neighborIndex];
            if (neighborDist < bestDist) {
                best = neighbor;
                bestDist = neighborDist;
            }
        }
        return best;
    }

    calculateSeparation(unit, units) {
        const interactionRadius = 1.5;
        const separation = { x: 0, y: 0 };
        for (const other of units) {
            if (other.id === unit.id) continue;
            const dx = unit.position.x - other.position.x;
            const dy = unit.position.y - other.position.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0 && dist < interactionRadius) {
                const weight = (interactionRadius - dist) / interactionRadius;
                separation.x += (dx / dist) * weight;
                separation.y += (dy / dist) * weight;
            }
        }
        return separation;
    }

    cleanupDestroyed() {
        for (const playerId of ['p1', 'p2']) {
            const player = this.state.players[playerId];
            player.towers = player.towers.filter((tower) => tower.hp > 0);
            player.mines = player.mines.filter((mine) => mine.hp > 0);
        }

        for (const playerId of ['p1', 'p2']) {
            this.state.units[playerId] = this.state.units[playerId].filter((unit) => unit.hp > 0);
        }
    }

    checkGameOver() {
        if (this.state.gameOver) return;
        if (this.state.players.p1.mainTowerHP <= 0) {
            this.state.gameOver = { winner: 'p2', reason: 'Main tower destroyed.' };
        } else if (this.state.players.p2.mainTowerHP <= 0) {
            this.state.gameOver = { winner: 'p1', reason: 'Main tower destroyed.' };
        }
    }

    handlePointer(event) {
        if (!this.map) return;
        const rect = this.canvas.getBoundingClientRect();
        const screen = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };

        if (this.handleButtonClick(screen)) {
            return;
        }

        const world = this.renderer.screenToWorld(screen);
        const hex = worldToAxial(world.x, world.y);
        const index = hex.q + hex.r * this.map.width;
        const tile = this.map.tiles[index];
        if (!tile) return;

        const action = this.buildActionForTile(tile, index);
        if (action) {
            this.applyOrSendAction(action);
        }
    }

    handleButtonClick(screen) {
        for (const button of this.localUi.buttons) {
            if (
                screen.x >= button.x &&
                screen.x <= button.x + button.width &&
                screen.y >= button.y &&
                screen.y <= button.y + button.height
            ) {
                if (button.onClick) {
                    button.onClick();
                }
                return true;
            }
        }
        return false;
    }

    refreshButtons() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const buttonWidth = 90;
        const buttonHeight = 30;
        const startX = width - buttonWidth - 20;
        const startY = height - 5 * (buttonHeight + 8) - 20;

        const makeButton = (label, index, onClick, active = false) => ({
            label,
            x: startX,
            y: startY + index * (buttonHeight + 8),
            width: buttonWidth,
            height: buttonHeight,
            onClick,
            active
        });

        const buildTypes = [
            { id: 'TOWER_LIGHT', label: 'Light', cost: HEX_TOWER_CONFIG.towers.light.cost },
            { id: 'TOWER_MEDIUM', label: 'Medium', cost: HEX_TOWER_CONFIG.towers.medium.cost },
            { id: 'TOWER_HEAVY', label: 'Heavy', cost: HEX_TOWER_CONFIG.towers.heavy.cost },
            { id: 'MINE', label: 'Mine', cost: HEX_TOWER_CONFIG.economy.mine.cost },
            { id: 'RECYCLE', label: 'Recycle', cost: 0 }
        ];

        this.localUi.buttons = buildTypes.map((type, index) =>
            makeButton(
                `${type.label}${type.cost ? ` (${type.cost})` : ''}`,
                index,
                () => {
                    this.localUi.selectedBuild = type.id;
                    this.refreshButtons();
                },
                this.localUi.selectedBuild === type.id
            )
        );

        const addCompositionButtons = (label, unitKey, offset) => {
            const plusButton = makeButton(`${label} +`, 5 + offset, () => {
                this.adjustComposition(unitKey, 1);
            });
            const minusButton = makeButton(`${label} -`, 6 + offset, () => {
                this.adjustComposition(unitKey, -1);
            });
            this.localUi.buttons.push(plusButton, minusButton);
        };

        addCompositionButtons('L', 'light', 0);
        addCompositionButtons('M', 'medium', 2);
        addCompositionButtons('H', 'heavy', 4);
    }

    adjustComposition(unitKey, delta) {
        if (this.state.phase.name !== 'pre') return;
        const planned = this.localUi.planned;
        const unitCost = HEX_TOWER_CONFIG.units[unitKey].cost;
        const player = this.state.players[this.playerId];
        if (delta > 0) {
            const totalCost =
                planned.light * HEX_TOWER_CONFIG.units.light.cost +
                planned.medium * HEX_TOWER_CONFIG.units.medium.cost +
                planned.heavy * HEX_TOWER_CONFIG.units.heavy.cost +
                unitCost;
            if (totalCost > player.ore) {
                return;
            }
        }
        planned[unitKey] = Math.max(0, planned[unitKey] + delta);
        this.applyOrSendAction({
            type: 'composition',
            payload: { playerId: this.playerId, composition: { ...planned } }
        });
    }

    buildActionForTile(tile, index) {
        const phase = this.state.phase.name;
        if (tile.tileType === TILE_TYPES.TOWER_SLOT) {
            if (tile.owner !== this.playerId) return null;
            const tower = this.state.players[this.playerId].towers.find(
                (item) => item.tileIndex === index
            );
            if (this.localUi.selectedBuild === 'RECYCLE') {
                if (phase !== 'pre' || !tower) return null;
                return { type: 'recycle', payload: { playerId: this.playerId, tileIndex: index } };
            }
            if (tower) return null;
            if (!TOWER_STATS[this.localUi.selectedBuild]) return null;
            return {
                type: 'buildTower',
                payload: {
                    playerId: this.playerId,
                    tileIndex: index,
                    towerType: this.localUi.selectedBuild
                }
            };
        }

        if (tile.tileType === TILE_TYPES.RESOURCE_NODE && this.localUi.selectedBuild === 'MINE') {
            const mineExists = this.state.players[this.playerId].mines.some(
                (mine) => mine.tileIndex === index
            );
            if (mineExists) return null;
            return {
                type: 'buildMine',
                payload: { playerId: this.playerId, tileIndex: index }
            };
        }

        return null;
    }

    applyOrSendAction(action) {
        if (this.isHost) {
            this.applyAction(action, this.playerId);
        } else {
            this.applyAction(action, this.playerId);
            this.network.sendInput({ action });
        }
    }

    applyAction(action, fallbackPlayerId) {
        if (!action) return;
        const playerId = action.payload?.playerId || fallbackPlayerId;
        const player = this.state.players[playerId];
        if (!player) return;

        if (action.type === 'buildTower') {
            const stats = TOWER_STATS[action.payload.towerType];
            if (!stats) return;
            const tile = this.map.tiles[action.payload.tileIndex];
            if (!tile || tile.tileType !== TILE_TYPES.TOWER_SLOT) return;
            if (tile.owner !== playerId) return;
            if (player.towers.some((tower) => tower.tileIndex === action.payload.tileIndex)) return;
            if (player.ore < stats.cost) return;
            player.ore -= stats.cost;
            player.towers.push({
                owner: playerId,
                type: action.payload.towerType,
                tileIndex: action.payload.tileIndex,
                hp: stats.maxHP,
                maxHP: stats.maxHP,
                attackDamage: stats.attackDamage,
                attackCooldown: stats.attackCooldown,
                attackRange: stats.attackRangeHexes,
                cooldown: 0
            });
        }

        if (action.type === 'buildMine') {
            const stats = HEX_TOWER_CONFIG.economy.mine;
            const tile = this.map.tiles[action.payload.tileIndex];
            if (!tile || tile.tileType !== TILE_TYPES.RESOURCE_NODE) return;
            if (player.mines.some((mine) => mine.tileIndex === action.payload.tileIndex)) return;
            if (player.ore < stats.cost) return;
            player.ore -= stats.cost;
            player.mines.push({
                owner: playerId,
                tileIndex: action.payload.tileIndex,
                hp: stats.maxHP,
                maxHP: stats.maxHP
            });
        }

        if (action.type === 'recycle') {
            if (this.state.phase.name !== 'pre') return;
            const index = action.payload.tileIndex;
            const towerIndex = player.towers.findIndex((tower) => tower.tileIndex === index);
            if (towerIndex === -1) return;
            const tower = player.towers[towerIndex];
            const stats = TOWER_STATS[tower.type];
            if (!stats) return;
            const refund = stats.cost * HEX_TOWER_CONFIG.economy.recycleRefundRatio;
            player.ore += refund;
            player.towers.splice(towerIndex, 1);
        }

        if (action.type === 'composition') {
            if (this.state.phase.name !== 'pre') return;
            this.state.waveCompositions[playerId] = action.payload.composition;
            if (playerId === this.playerId) {
                this.localUi.planned = { ...action.payload.composition };
            }
        }
    }

    syncLocalPlan() {
        const composition = this.state.waveCompositions?.[this.playerId];
        if (composition) {
            this.localUi.planned = { ...composition };
        }
    }

    distance(a, b) {
        if (!a || !b) return Infinity;
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    normalize(vector) {
        const length = Math.hypot(vector.x, vector.y);
        if (length === 0) return { x: 0, y: 0 };
        return { x: vector.x / length, y: vector.y / length };
    }
}
