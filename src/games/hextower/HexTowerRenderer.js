import { HEX_TOWER_CONFIG } from './config.js';

const SQRT3 = Math.sqrt(3);

export class HexTowerRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.mapLayer = null;
        this.mapLayerSize = { width: 0, height: 0 };
        this.transform = null;
        this.hexSize = 1;
    }

    updateTransform() {
        const { width, height } = this.canvas;
        const mapWidth = HEX_TOWER_CONFIG.map.width;
        const mapHeight = HEX_TOWER_CONFIG.map.height;

        const mapWorldWidth = SQRT3 * (mapWidth + mapHeight / 2);
        const mapWorldHeight = 1.5 * mapHeight;
        const padding = 20;

        const scaleX = (width - padding * 2) / mapWorldWidth;
        const scaleY = (height - padding * 2) / mapWorldHeight;
        const scale = Math.min(scaleX, scaleY);

        const offsetX = (width - mapWorldWidth * scale) / 2;
        const offsetY = (height - mapWorldHeight * scale) / 2;

        this.transform = {
            scale,
            offsetX,
            offsetY
        };

        this.hexSize = scale;
    }

    worldToScreen(point) {
        if (!this.transform) {
            this.updateTransform();
        }
        return {
            x: point.x * this.transform.scale + this.transform.offsetX,
            y: point.y * this.transform.scale + this.transform.offsetY
        };
    }

    screenToWorld(point) {
        if (!this.transform) {
            this.updateTransform();
        }
        return {
            x: (point.x - this.transform.offsetX) / this.transform.scale,
            y: (point.y - this.transform.offsetY) / this.transform.scale
        };
    }

    clear() {
        this.ctx.fillStyle = '#0c1020';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    ensureMapLayer(tiles) {
        if (
            !this.mapLayer ||
            this.mapLayerSize.width !== this.canvas.width ||
            this.mapLayerSize.height !== this.canvas.height
        ) {
            this.mapLayer = document.createElement('canvas');
            this.mapLayer.width = this.canvas.width;
            this.mapLayer.height = this.canvas.height;
            this.mapLayerSize = {
                width: this.canvas.width,
                height: this.canvas.height
            };
            this.updateTransform();
            this.renderMapLayer(tiles);
        }
    }

    renderMapLayer(tiles) {
        const ctx = this.mapLayer.getContext('2d');
        ctx.clearRect(0, 0, this.mapLayer.width, this.mapLayer.height);

        const hexRadius = Math.max(this.hexSize * 0.45, 0.6);
        const corners = this.getHexCorners(hexRadius);

        for (const tile of tiles) {
            const center = this.worldToScreen(tile.world);
            const baseColor = tile.heightLevel === 1 ? '#2f3d3a' : '#1d2c2f';
            let color = baseColor;

            switch (tile.tileType) {
                case HEX_TOWER_CONFIG.map.tileTypes.BLOCKED:
                    color = '#182028';
                    break;
                case HEX_TOWER_CONFIG.map.tileTypes.RAMP:
                    color = '#4a5a50';
                    break;
                case HEX_TOWER_CONFIG.map.tileTypes.RESOURCE_NODE:
                    color = '#244b7b';
                    break;
                case HEX_TOWER_CONFIG.map.tileTypes.TOWER_SLOT:
                    color = '#38435f';
                    break;
                case HEX_TOWER_CONFIG.map.tileTypes.MAIN_TOWER_SLOT:
                    color = '#3f2a2a';
                    break;
                default:
                    break;
            }

            ctx.beginPath();
            ctx.moveTo(center.x + corners[0].x, center.y + corners[0].y);
            for (let i = 1; i < corners.length; i++) {
                ctx.lineTo(center.x + corners[i].x, center.y + corners[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        }
    }

    getHexCorners(radius) {
        const corners = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
            corners.push({
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle)
            });
        }
        return corners;
    }

    render(tiles, state, uiState, visuals) {
        this.ensureMapLayer(tiles);
        this.clear();

        this.ctx.drawImage(this.mapLayer, 0, 0);

        this.renderMines(tiles, state);
        this.renderTowers(tiles, state);
        this.renderUnits(state, visuals);
        this.renderMainTowers(tiles, state);
        this.renderHud(state, uiState);
    }

    renderMines(tiles, state) {
        const mines = [...state.players.p1.mines, ...state.players.p2.mines];
        for (const mine of mines) {
            const tile = tiles[mine.tileIndex];
            if (!tile) continue;
            const center = this.worldToScreen(tile.world);
            this.ctx.fillStyle = mine.owner === 'p1' ? '#3aa2ff' : '#ff9b3a';
            this.ctx.beginPath();
            this.ctx.arc(center.x, center.y, this.hexSize * 0.45, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    renderTowers(tiles, state) {
        const towers = [...state.players.p1.towers, ...state.players.p2.towers];
        for (const tower of towers) {
            const tile = tiles[tower.tileIndex];
            if (!tile) continue;
            const center = this.worldToScreen(tile.world);
            const colors = {
                TOWER_LIGHT: '#7b9dff',
                TOWER_MEDIUM: '#9bd35d',
                TOWER_HEAVY: '#d35d5d'
            };
            this.ctx.fillStyle = colors[tower.type] || '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(center.x, center.y, this.hexSize * 0.55, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    renderMainTowers(tiles, state) {
        for (const playerId of ['p1', 'p2']) {
            const tileIndex = state.mainTowerTiles?.[playerId];
            const tile = tiles[tileIndex];
            if (!tile) continue;
            const center = this.worldToScreen(tile.world);
            this.ctx.fillStyle = playerId === 'p1' ? '#5bb9ff' : '#ffb35b';
            this.ctx.beginPath();
            this.ctx.arc(center.x, center.y, this.hexSize * 0.8, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    renderUnits(state, visuals) {
        const allUnits = [...state.units.p1, ...state.units.p2];
        for (const unit of allUnits) {
            const pos = visuals?.unitPositions?.[unit.id] || unit.position;
            if (!pos) continue;
            const screen = this.worldToScreen(pos);
            const headRadius = this.hexSize * unit.radius;
            this.ctx.fillStyle = unit.owner === 'p1' ? '#8fd2ff' : '#ffc88f';
            this.ctx.beginPath();
            this.ctx.arc(screen.x, screen.y, headRadius, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.strokeStyle = this.ctx.fillStyle;
            this.ctx.lineWidth = Math.max(1, this.hexSize * 0.15);
            this.ctx.beginPath();
            this.ctx.moveTo(screen.x, screen.y + headRadius);
            this.ctx.lineTo(screen.x, screen.y + headRadius * 2.2);
            this.ctx.stroke();
        }
    }

    renderHud(state, uiState) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(10, 15, 24, 0.65)';
        ctx.fillRect(10, 10, this.canvas.width - 20, 80);

        ctx.fillStyle = '#ffffff';
        ctx.font = '14px sans-serif';
        ctx.fillText(`Wave ${state.phase.wave} · ${state.phase.name.toUpperCase()} · ${state.phase.remaining.toFixed(1)}s`, 20, 32);
        ctx.fillText(`Ore: ${uiState.ore}`, 20, 54);
        ctx.fillText(`Planned: L${uiState.planned.light} M${uiState.planned.medium} H${uiState.planned.heavy}`, 20, 74);

        this.renderButtons(uiState);
    }

    renderButtons(uiState) {
        const ctx = this.ctx;
        for (const button of uiState.buttons) {
            ctx.fillStyle = button.active ? '#4c6ef5' : 'rgba(255,255,255,0.12)';
            ctx.fillRect(button.x, button.y, button.width, button.height);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.strokeRect(button.x, button.y, button.width, button.height);
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px sans-serif';
            ctx.fillText(button.label, button.x + 6, button.y + 18);
        }
    }
}
