// UI Overlay - 2D HUD elements rendered over the 3D scene

import { PHASES, PHASE_TIMING, TOWER_STATS, UNIT_STATS, MINE_STATS, ECONOMY } from '../config.js';

export class UIOverlay {
    constructor(parentElement, width, height) {
        this.parentElement = parentElement;
        this.width = width;
        this.height = height;

        // Create overlay canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '10';

        this.ctx = this.canvas.getContext('2d');

        // Add to parent
        if (parentElement) {
            parentElement.appendChild(this.canvas);
        }

        // UI state
        this.selectedTowerType = null;
        this.buildMode = 'tower'; // 'tower', 'mine', 'recycle'
        this.showBuildMenu = false;
        this.notifications = [];
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
    }

    render(state, playerId, isHost) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        if (!state) return;

        // Set default font
        ctx.font = 'bold 16px monospace';
        ctx.textBaseline = 'top';

        // Render different UI sections
        this.renderTopBar(ctx, state, playerId);
        this.renderResourcePanel(ctx, state, playerId);
        this.renderPhaseTimer(ctx, state);
        this.renderWaveInfo(ctx, state);
        this.renderUnitQueue(ctx, state, playerId);
        this.renderNotifications(ctx);
        this.renderKeyboardHints(ctx, state);

        // Debug info
        if (window.location.search.includes('debug=1')) {
            this.renderDebugInfo(ctx, state);
        }
    }

    renderTopBar(ctx, state, playerId) {
        const w = this.width;
        const enemyId = playerId === 'p1' ? 'p2' : 'p1';

        // Background bar
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, w, 50);

        // Player's main tower HP (left side)
        const myHP = state.players[playerId].mainTowerHP;
        const myMaxHP = TOWER_STATS.MAIN.maxHP;
        this.renderHealthBar(ctx, 10, 10, 200, 20, myHP, myMaxHP, '#4488ff', 'Your Base');

        // Enemy's main tower HP (right side)
        const enemyHP = state.players[enemyId].mainTowerHP;
        this.renderHealthBar(ctx, w - 210, 10, 200, 20, enemyHP, myMaxHP, '#ff4444', 'Enemy Base');

        // Wave number (center)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Wave ${state.waveNumber}`, w / 2, 15);
    }

    renderHealthBar(ctx, x, y, width, height, current, max, color, label) {
        // Background
        ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
        ctx.fillRect(x, y, width, height);

        // Health fill
        const pct = Math.max(0, current / max);
        ctx.fillStyle = color;
        ctx.fillRect(x + 2, y + 2, (width - 4) * pct, height - 4);

        // Border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${label}: ${Math.floor(current)}/${max}`, x, y + height + 4);
    }

    renderResourcePanel(ctx, state, playerId) {
        const player = state.players[playerId];
        const y = 60;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(5, y, 150, 35);

        // Ore icon and amount
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`💎 ${Math.floor(player.ore)}`, 15, y + 8);
    }

    renderPhaseTimer(ctx, state) {
        const w = this.width;
        const y = 55;

        const phaseDuration = PHASE_TIMING[state.phase] || 0;
        const elapsed = Date.now() - state.phaseStartTime;
        const remaining = Math.max(0, phaseDuration - elapsed);
        const seconds = Math.ceil(remaining / 1000);

        // Phase name
        let phaseName = state.phase.replace('_', ' ');
        let phaseColor = '#ffffff';

        switch (state.phase) {
            case PHASES.PRE_WAVE:
                phaseName = 'PLANNING';
                phaseColor = '#44ff44';
                break;
            case PHASES.WAVE:
                phaseName = 'COMBAT';
                phaseColor = '#ff4444';
                break;
            case PHASES.INTER_WAVE:
                phaseName = 'CLEANUP';
                phaseColor = '#ffff44';
                break;
            case PHASES.GAME_OVER:
                phaseName = 'GAME OVER';
                phaseColor = '#ff44ff';
                break;
        }

        // Timer display
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = phaseColor;
        ctx.fillText(`${phaseName} ${seconds}s`, w / 2, y);
    }

    renderWaveInfo(ctx, state) {
        // Show wave info near top
        const unitCount = state.units.length;
        const towerCount = state.towers.length;

        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(`Units: ${unitCount} | Towers: ${towerCount}`, this.width / 2, 80);
    }

    renderBuildMenu(ctx, state, playerId) {
        if (state.phase !== PHASES.PRE_WAVE && state.phase !== PHASES.WAVE) return;

        const player = state.players[playerId];
        const x = 5;
        const y = this.height - 220;
        const itemHeight = 32;

        // Background panel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, 200, 210);

        // Title with current mode
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        const modeLabel = this.buildMode === 'mine' ? 'MINE' :
                          this.buildMode === 'recycle' ? 'RECYCLE' : 'BUILD';
        ctx.fillText(`${modeLabel} MODE`, x + 10, y + 12);

        // Tower options
        const towers = [
            { type: 'LIGHT', key: '1', stats: TOWER_STATS.LIGHT },
            { type: 'MEDIUM', key: '2', stats: TOWER_STATS.MEDIUM },
            { type: 'HEAVY', key: '3', stats: TOWER_STATS.HEAVY }
        ];

        towers.forEach((tower, i) => {
            const ty = y + 28 + i * itemHeight;
            const canAfford = player.ore >= tower.stats.cost;
            const isSelected = this.buildMode === 'tower' && this.selectedTowerType === tower.type;

            // Highlight if selected
            if (isSelected) {
                ctx.fillStyle = 'rgba(100, 100, 255, 0.3)';
                ctx.fillRect(x + 5, ty, 190, itemHeight - 4);
            }

            // Tower name and cost
            ctx.fillStyle = canAfford ? '#ffffff' : '#666666';
            ctx.font = '13px monospace';
            ctx.fillText(`[${tower.key}] ${tower.type}`, x + 10, ty + 5);

            ctx.fillStyle = canAfford ? '#ffd700' : '#666666';
            ctx.font = '11px monospace';
            ctx.fillText(`💎${tower.stats.cost} ❤️${tower.stats.maxHP} ⚔️${tower.stats.damage}`, x + 10, ty + 18);
        });

        // Mine option
        const mineY = y + 28 + 3 * itemHeight;
        const canAffordMine = player.ore >= MINE_STATS.COST;
        const isMineSelected = this.buildMode === 'mine';

        if (isMineSelected) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
            ctx.fillRect(x + 5, mineY, 190, itemHeight - 4);
        }

        ctx.fillStyle = canAffordMine ? '#ffffff' : '#666666';
        ctx.font = '13px monospace';
        ctx.fillText('[4] MINE', x + 10, mineY + 5);

        ctx.fillStyle = canAffordMine ? '#ffd700' : '#666666';
        ctx.font = '11px monospace';
        ctx.fillText(`💎${MINE_STATS.COST} +${MINE_STATS.INCOME_PER_SEC}/sec`, x + 10, mineY + 18);

        // Recycle option (only during PRE_WAVE)
        if (state.phase === PHASES.PRE_WAVE) {
            const recycleY = y + 28 + 4 * itemHeight;
            const isRecycleSelected = this.buildMode === 'recycle';

            if (isRecycleSelected) {
                ctx.fillStyle = 'rgba(255, 100, 100, 0.3)';
                ctx.fillRect(x + 5, recycleY, 190, itemHeight - 4);
            }

            ctx.fillStyle = '#ffffff';
            ctx.font = '13px monospace';
            ctx.fillText('[R] RECYCLE', x + 10, recycleY + 5);

            ctx.fillStyle = '#88ff88';
            ctx.font = '11px monospace';
            ctx.fillText(`Get ${Math.floor(ECONOMY.RECYCLE_REFUND_RATIO * 100)}% ore back`, x + 10, recycleY + 18);
        }
    }

    renderUnitQueue(ctx, state, playerId) {
        if (state.phase !== PHASES.PRE_WAVE) return;

        const player = state.players[playerId];
        const x = this.width - 185;
        const y = this.height - 160;
        const itemHeight = 30;

        // Background panel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, 180, 170);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('QUEUE UNITS', x + 10, y + 10);

        // Unit options
        const units = [
            { type: 'LIGHT', key: 'Q', stats: UNIT_STATS.LIGHT },
            { type: 'MEDIUM', key: 'W', stats: UNIT_STATS.MEDIUM },
            { type: 'HEAVY', key: 'E', stats: UNIT_STATS.HEAVY }
        ];

        units.forEach((unit, i) => {
            const uy = y + 30 + i * itemHeight;
            const canAfford = player.ore >= unit.stats.cost;

            ctx.fillStyle = canAfford ? '#ffffff' : '#666666';
            ctx.font = '14px monospace';
            ctx.fillText(`[${unit.key}] ${unit.type}`, x + 10, uy + 5);

            ctx.fillStyle = canAfford ? '#ffd700' : '#666666';
            ctx.font = '12px monospace';
            ctx.fillText(`💎${unit.stats.cost}  ❤️${unit.stats.maxHP}  🏃${unit.stats.speed}`, x + 10, uy + 18);
        });

        // Show queued units
        if (player.pendingUnits && player.pendingUnits.length > 0) {
            const queueY = y + 140;
            ctx.fillStyle = '#44ff44';
            ctx.font = '12px monospace';

            let queueText = 'Queue: ';
            const counts = {};
            player.pendingUnits.forEach(u => {
                counts[u.type] = (counts[u.type] || 0) + u.count;
            });
            queueText += Object.entries(counts).map(([t, c]) => `${t[0]}×${c}`).join(' ');

            ctx.fillText(queueText, x + 10, queueY);
        }
    }

    renderNotifications(ctx) {
        const now = Date.now();
        const activeNotifications = this.notifications.filter(n => now - n.time < 3000);
        this.notifications = activeNotifications;

        const x = this.width / 2;
        let y = 120;

        activeNotifications.forEach(notification => {
            const age = now - notification.time;
            const alpha = Math.max(0, 1 - age / 3000);

            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(notification.text, x, y);
            y += 25;
        });
    }

    renderKeyboardHints(ctx, state) {
        // Small keyboard hints in bottom-left corner
        const x = 5;
        const y = this.height - 80;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x, y, 130, 75);

        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#888888';
        ctx.fillText('Keyboard Shortcuts:', x + 5, y + 12);

        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('[Space] Menu', x + 5, y + 25);
        ctx.fillText('[1-4] Build', x + 5, y + 37);
        if (state.phase === PHASES.PRE_WAVE) {
            ctx.fillText('[Q/W/E] Units', x + 5, y + 49);
            ctx.fillText('[R] Recycle', x + 5, y + 61);
        } else {
            ctx.fillText('[Home] Your Base', x + 5, y + 49);
        }
    }

    renderDebugInfo(ctx, state) {
        const x = 5;
        const y = 100;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, 200, 80);

        ctx.fillStyle = '#00ff00';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';

        ctx.fillText(`Units: ${state.units.length}`, x + 5, y + 15);
        ctx.fillText(`Towers: ${state.towers.length}`, x + 5, y + 30);
        ctx.fillText(`Mines: ${state.mines.length}`, x + 5, y + 45);
        ctx.fillText(`Phase: ${state.phase}`, x + 5, y + 60);
    }

    addNotification(text) {
        this.notifications.push({
            text,
            time: Date.now()
        });
    }

    setSelectedTower(type) {
        this.selectedTowerType = type;
    }

    setBuildMode(mode) {
        this.buildMode = mode;
    }

    dispose() {
        if (this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
    }
}
