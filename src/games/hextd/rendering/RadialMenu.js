// Radial Menu - Circular hierarchical menu for touch/mouse interaction

import { TOWER_STATS, UNIT_STATS, MINE_STATS, ECONOMY, PHASES } from '../config.js';

// Menu item definitions
const MENU_ITEMS = {
    root: {
        icon: '⚙️',
        label: 'Menu',
        children: ['build', 'units']
    },
    build: {
        icon: '🏗️',
        label: 'Build',
        children: ['tower_light', 'tower_medium', 'tower_heavy', 'mine', 'recycle']
    },
    units: {
        icon: '⚔️',
        label: 'Units',
        children: ['unit_light', 'unit_medium', 'unit_heavy'],
        phaseRequired: 'PRE_WAVE'
    },
    tower_light: {
        icon: '🗼',
        label: 'Light',
        action: 'build_tower',
        type: 'LIGHT',
        cost: TOWER_STATS.LIGHT.cost,
        color: '#66aaff'
    },
    tower_medium: {
        icon: '🏰',
        label: 'Medium',
        action: 'build_tower',
        type: 'MEDIUM',
        cost: TOWER_STATS.MEDIUM.cost,
        color: '#ffaa44'
    },
    tower_heavy: {
        icon: '🏯',
        label: 'Heavy',
        action: 'build_tower',
        type: 'HEAVY',
        cost: TOWER_STATS.HEAVY.cost,
        color: '#ff6666'
    },
    mine: {
        icon: '⛏️',
        label: 'Mine',
        action: 'build_mine',
        cost: MINE_STATS.COST,
        color: '#ffd700',
        tileRequired: 'RESOURCE_NODE'
    },
    recycle: {
        icon: '♻️',
        label: 'Recycle',
        action: 'recycle_tower',
        color: '#88ff88',
        tileRequired: 'OWN_TOWER',
        phaseRequired: 'PRE_WAVE'
    },
    unit_light: {
        icon: '🏃',
        label: 'Light',
        action: 'queue_unit',
        type: 'LIGHT',
        cost: UNIT_STATS.LIGHT.cost,
        color: '#66ffaa'
    },
    unit_medium: {
        icon: '🛡️',
        label: 'Medium',
        action: 'queue_unit',
        type: 'MEDIUM',
        cost: UNIT_STATS.MEDIUM.cost,
        color: '#ffcc44'
    },
    unit_heavy: {
        icon: '🦾',
        label: 'Heavy',
        action: 'queue_unit',
        type: 'HEAVY',
        cost: UNIT_STATS.HEAVY.cost,
        color: '#ff8888'
    }
};

export class RadialMenu {
    constructor(parentElement, width, height) {
        this.parentElement = parentElement;
        this.width = width;
        this.height = height;

        // Menu state
        this.isOpen = false;
        this.menuStack = []; // Stack of menu IDs for navigation
        this.currentMenu = 'root';

        // Animation
        this.animationProgress = 0;
        this.targetProgress = 0;
        this.lastTime = performance.now();

        // Layout
        this.centerButtonRadius = 40;
        this.ringButtonRadius = 32;
        this.ringDistance = 100;

        // Selected tile (center of viewport)
        this.selectedTile = null;
        this.selectedTileInfo = null; // { type, owner, hasTower, hasMine, etc }

        // Game state reference
        this.gameState = null;
        this.playerId = null;

        // Callbacks
        this.onAction = null;

        // Create canvas - must match viewport exactly
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '20';

        this.ctx = this.canvas.getContext('2d');

        // Button hit areas for click detection
        this.buttonHitAreas = [];

        // Add to parent
        if (parentElement) {
            parentElement.appendChild(this.canvas);
        }

        // We don't use a separate interactive canvas - the game will forward clicks to us
    }

    // Called by the game to check if a click hit the menu
    // x, y are relative to the canvas element
    // Returns true if the click was handled by the menu
    handleClick(x, y) {
        // Make sure we're using current dimensions
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            this.width = rect.width;
            this.height = rect.height;
        }
        return this.processInput(x, y);
    }

    getButtonPosition() {
        return {
            x: this.width / 2,
            y: this.height - 60 - this.centerButtonRadius
        };
    }

    processInput(x, y) {
        // Check if clicking on center button
        const pos = this.getButtonPosition();
        const centerX = pos.x;
        const centerY = pos.y;
        const distToCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

        if (distToCenter <= this.centerButtonRadius) {
            if (this.isOpen && this.menuStack.length > 0) {
                // Back out of submenu
                this.currentMenu = this.menuStack.pop();
            } else if (this.isOpen) {
                // Close menu
                this.close();
            } else {
                // Open menu
                this.open();
            }
            return true; // Click was handled
        }

        // Check ring buttons if menu is open
        if (this.isOpen) {
            for (const button of this.buttonHitAreas) {
                const dist = Math.sqrt((x - button.x) ** 2 + (y - button.y) ** 2);
                if (dist <= this.ringButtonRadius) {
                    this.selectButton(button.id);
                    return true; // Click was handled
                }
            }

            // Clicked outside menu - close it
            this.close();
            return true; // Click was handled (closed menu)
        }

        return false; // Click was not handled - let game process it
    }

    isPointInMenu(x, y) {
        const centerX = this.width / 2;
        const centerY = this.height - 70;
        const distToCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

        if (distToCenter <= this.centerButtonRadius) return true;

        if (this.isOpen) {
            for (const button of this.buttonHitAreas) {
                const dist = Math.sqrt((x - button.x) ** 2 + (y - button.y) ** 2);
                if (dist <= this.ringButtonRadius) return true;
            }
        }

        return false;
    }

    selectButton(buttonId) {
        const item = MENU_ITEMS[buttonId];
        if (!item) return;

        if (item.children) {
            // Navigate to submenu
            this.menuStack.push(this.currentMenu);
            this.currentMenu = buttonId;
        } else if (item.action) {
            // Execute action
            this.executeAction(item);
            this.close();
        }
    }

    executeAction(item) {
        if (!this.onAction) return;

        this.onAction({
            action: item.action,
            type: item.type,
            tile: this.selectedTile
        });
    }

    open() {
        this.isOpen = true;
        this.targetProgress = 1;
        this.currentMenu = 'root';
        this.menuStack = [];
    }

    close() {
        this.isOpen = false;
        this.targetProgress = 0;
        this.menuStack = [];
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    setSelectedTile(tile, tileInfo) {
        this.selectedTile = tile;
        this.selectedTileInfo = tileInfo;
    }

    setGameState(state, playerId) {
        this.gameState = state;
        this.playerId = playerId;
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
    }

    update(deltaTime) {
        // Animate menu open/close
        const animSpeed = 8;
        if (this.animationProgress < this.targetProgress) {
            this.animationProgress = Math.min(this.targetProgress, this.animationProgress + deltaTime * animSpeed);
        } else if (this.animationProgress > this.targetProgress) {
            this.animationProgress = Math.max(this.targetProgress, this.animationProgress - deltaTime * animSpeed);
        }
    }

    render() {
        // Update canvas size to match actual display size, accounting for device pixel ratio
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        if (rect.width > 0 && rect.height > 0) {
            const targetWidth = Math.round(rect.width * dpr);
            const targetHeight = Math.round(rect.height * dpr);

            if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
                this.canvas.width = targetWidth;
                this.canvas.height = targetHeight;
                // Keep logical dimensions for positioning
                this.width = rect.width;
                this.height = rect.height;
                this.dpr = dpr;
            }
        }

        const ctx = this.ctx;

        // Scale context for high-DPI displays
        ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);

        // Get button position
        const pos = this.getButtonPosition();

        // Clear button hit areas
        this.buttonHitAreas = [];

        // Draw center button
        const currentItem = MENU_ITEMS[this.currentMenu];
        this.renderCenterButton(ctx, pos.x, pos.y, currentItem);

        // Draw ring buttons if menu is open
        if (this.animationProgress > 0 && currentItem.children) {
            this.renderRingButtons(ctx, pos.x, pos.y, currentItem.children);
        }

        // Draw selected tile info at top
        this.renderTileInfo(ctx);
    }

    renderCenterButton(ctx, x, y, item) {
        // Snap to pixels for crisp rendering
        x = Math.round(x);
        y = Math.round(y);
        const r = this.centerButtonRadius;

        // Outer glow when closed (to make it more visible)
        if (!this.isOpen) {
            ctx.beginPath();
            ctx.arc(x, y, r + 8, 0, Math.PI * 2);
            const glowGradient = ctx.createRadialGradient(x, y, r, x, y, r + 12);
            glowGradient.addColorStop(0, 'rgba(100, 150, 255, 0.5)');
            glowGradient.addColorStop(1, 'rgba(100, 150, 255, 0)');
            ctx.fillStyle = glowGradient;
            ctx.fill();
        }

        // Button background
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, this.isOpen ? 'rgba(100, 120, 180, 0.95)' : 'rgba(60, 100, 180, 0.95)');
        gradient.addColorStop(1, this.isOpen ? 'rgba(50, 60, 100, 0.95)' : 'rgba(30, 50, 120, 0.95)');

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Border
        ctx.strokeStyle = this.isOpen ? '#aaccff' : '#6699ff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Icon
        ctx.font = '32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(item.icon, x, y);

        // Label below button when closed
        if (!this.isOpen) {
            ctx.font = 'bold 14px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('MENU', x, Math.round(y + r + 16));
        }

        // Back indicator if in submenu
        if (this.isOpen && this.menuStack.length > 0) {
            ctx.font = 'bold 13px sans-serif';
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText('← BACK', x, Math.round(y + r + 14));
        }
    }

    renderRingButtons(ctx, centerX, centerY, childIds) {
        const visibleChildren = childIds.filter(id => this.isButtonVisible(id));
        const count = visibleChildren.length;
        if (count === 0) return;

        // Calculate angle spread (semi-circle above center button)
        const startAngle = -Math.PI + Math.PI / 6;
        const endAngle = -Math.PI / 6;
        const angleStep = (endAngle - startAngle) / Math.max(1, count - 1);

        const animatedDistance = this.ringDistance * this.animationProgress;
        const animatedScale = this.animationProgress;

        visibleChildren.forEach((childId, i) => {
            const item = MENU_ITEMS[childId];
            if (!item) return;

            const angle = count === 1 ? -Math.PI / 2 : startAngle + angleStep * i;
            // Snap to pixels
            const bx = Math.round(centerX + Math.cos(angle) * animatedDistance);
            const by = Math.round(centerY + Math.sin(angle) * animatedDistance);

            const r = this.ringButtonRadius * animatedScale;
            const canUse = this.canUseButton(childId);

            // Store hit area
            this.buttonHitAreas.push({ id: childId, x: bx, y: by });

            // Button background
            const bgColor = item.color || '#666688';
            const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, r);
            if (canUse) {
                gradient.addColorStop(0, bgColor);
                gradient.addColorStop(1, this.darkenColor(bgColor, 0.5));
            } else {
                gradient.addColorStop(0, 'rgba(60, 60, 60, 0.8)');
                gradient.addColorStop(1, 'rgba(30, 30, 30, 0.8)');
            }

            ctx.beginPath();
            ctx.arc(bx, by, r, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Border
            ctx.strokeStyle = canUse ? '#ffffff' : '#444444';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Icon
            ctx.font = `${Math.floor(22 * animatedScale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = canUse ? '#ffffff' : '#666666';
            ctx.fillText(item.icon, bx, by - 2);

            // Label and cost
            if (animatedScale > 0.5) {
                ctx.font = `bold ${Math.floor(12 * animatedScale)}px sans-serif`;
                ctx.fillStyle = canUse ? '#ffffff' : '#666666';
                ctx.fillText(item.label, bx, Math.round(by + r + 10));

                if (item.cost !== undefined) {
                    ctx.font = `${Math.floor(11 * animatedScale)}px sans-serif`;
                    ctx.fillStyle = canUse ? '#ffd700' : '#666666';
                    ctx.fillText(`💎${item.cost}`, bx, Math.round(by + r + 22));
                }
            }
        });
    }

    renderTileInfo(ctx) {
        if (!this.selectedTileInfo) return;

        const info = this.selectedTileInfo;
        const x = Math.round(this.width / 2);
        const y = 55;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x - 90, y - 18, 180, 36);

        // Tile info text
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';

        let text = '';
        if (info.type === 'TOWER_SLOT') {
            text = info.hasTower ? `${info.towerType} Tower` : 'Tower Slot';
        } else if (info.type === 'RESOURCE_NODE') {
            text = info.hasMine ? 'Mine (Active)' : 'Resource Node';
        } else if (info.type === 'MAIN_TOWER_SLOT') {
            text = 'Main Base';
        } else if (info.type === 'EMPTY') {
            text = info.height === 1 ? 'High Ground' : 'Ground';
        } else if (info.type === 'RAMP') {
            text = 'Ramp';
        } else {
            text = 'Blocked';
        }

        ctx.fillText(text, x, y);

        // Coordinates
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#aaaaaa';
        if (this.selectedTile) {
            ctx.fillText(`(${this.selectedTile.q}, ${this.selectedTile.r})`, x, y + 14);
        }
    }

    isButtonVisible(buttonId) {
        const item = MENU_ITEMS[buttonId];
        if (!item) return false;

        // Check phase requirement
        if (item.phaseRequired && this.gameState) {
            if (this.gameState.phase !== PHASES[item.phaseRequired]) {
                return false;
            }
        }

        // Check tile requirement for visibility
        if (item.tileRequired && this.selectedTileInfo) {
            if (item.tileRequired === 'RESOURCE_NODE') {
                if (this.selectedTileInfo.type !== 'RESOURCE_NODE') return false;
            } else if (item.tileRequired === 'OWN_TOWER') {
                if (!this.selectedTileInfo.hasTower || !this.selectedTileInfo.isOwnTower) return false;
            }
        }

        return true;
    }

    canUseButton(buttonId) {
        const item = MENU_ITEMS[buttonId];
        if (!item) return false;
        if (!this.gameState || !this.playerId) return false;

        const player = this.gameState.players[this.playerId];
        if (!player) return false;

        // Check cost
        if (item.cost !== undefined && player.ore < item.cost) {
            return false;
        }

        // Check tile requirements
        if (item.tileRequired && this.selectedTileInfo) {
            if (item.tileRequired === 'RESOURCE_NODE') {
                if (this.selectedTileInfo.type !== 'RESOURCE_NODE' || this.selectedTileInfo.hasMine) {
                    return false;
                }
            } else if (item.tileRequired === 'OWN_TOWER') {
                if (!this.selectedTileInfo.hasTower || !this.selectedTileInfo.isOwnTower) {
                    return false;
                }
                if (this.selectedTileInfo.towerType === 'MAIN') {
                    return false;
                }
            }
        }

        // Check buildable for towers
        if (item.action === 'build_tower' && this.selectedTileInfo) {
            if (this.selectedTileInfo.type !== 'TOWER_SLOT' || this.selectedTileInfo.hasTower) {
                return false;
            }
            // Check ownership
            if (this.selectedTileInfo.owner !== -1) {
                const playerOwner = this.playerId === 'p1' ? 0 : 1;
                if (this.selectedTileInfo.owner !== playerOwner) {
                    return false;
                }
            }
        }

        return true;
    }

    darkenColor(hex, factor) {
        // Convert hex to RGB, darken, convert back
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        const dr = Math.floor(r * factor);
        const dg = Math.floor(g * factor);
        const db = Math.floor(b * factor);

        return `rgb(${dr}, ${dg}, ${db})`;
    }

    dispose() {
        if (this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
    }
}
