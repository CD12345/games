// History RPG - Inventory Panel
// Canvas-based UI for item management

import { debugLog } from '../../../ui/DebugOverlay.js';

// Item categories
const ITEM_CATEGORIES = {
    ALL: 'all',
    SUPPLIES: 'supply',
    DOCUMENTS: 'document',
    WEAPONS: 'weapon',
    TOOLS: 'tool',
    QUEST: 'quest'
};

// Panel styles
const STYLES = {
    panel: {
        backgroundColor: 'rgba(20, 20, 30, 0.95)',
        borderColor: '#c9a227',
        borderWidth: 3,
        padding: 20,
        cornerRadius: 8
    },
    header: {
        color: '#c9a227',
        font: 'bold 20px monospace'
    },
    slot: {
        size: 64,
        backgroundColor: 'rgba(40, 40, 50, 0.8)',
        selectedColor: 'rgba(201, 162, 39, 0.3)',
        hoverColor: 'rgba(60, 60, 70, 0.8)',
        borderColor: '#555555',
        emptyColor: '#333333'
    },
    itemName: {
        color: '#ffffff',
        font: 'bold 14px monospace'
    },
    itemDesc: {
        color: '#aaaaaa',
        font: '12px monospace'
    },
    category: {
        backgroundColor: 'rgba(40, 40, 50, 0.9)',
        activeColor: 'rgba(201, 162, 39, 0.3)',
        textColor: '#ffffff',
        font: '12px monospace'
    }
};

// Item type colors
const ITEM_COLORS = {
    supply: '#27ae60',    // Green
    document: '#3498db',  // Blue
    weapon: '#e74c3c',    // Red
    tool: '#f39c12',      // Orange
    quest: '#9b59b6',     // Purple
    misc: '#7f8c8d'       // Gray
};

export class InventoryPanel {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Panel state
        this.isOpen = false;
        this.activeCategory = ITEM_CATEGORIES.ALL;

        // Inventory data (set externally)
        this.inventory = [];
        this.maxSlots = 20;

        // Selection
        this.selectedSlot = -1;
        this.hoveredSlot = -1;

        // Grid layout
        this.slotsPerRow = 5;
        this.slotSpacing = 8;

        // Panel dimensions
        this.calculateDimensions();

        // Input handlers
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);

        // Callbacks
        this.onItemUse = null;
        this.onItemDrop = null;
        this.onItemSelect = null;
    }

    // Calculate panel dimensions
    calculateDimensions() {
        const slotSize = STYLES.slot.size + this.slotSpacing;
        this.gridWidth = this.slotsPerRow * slotSize;
        this.gridHeight = Math.ceil(this.maxSlots / this.slotsPerRow) * slotSize;

        this.panelWidth = Math.min(450, this.canvas.width - 40);
        this.panelHeight = Math.min(500, this.canvas.height - 80);
        this.panelX = (this.canvas.width - this.panelWidth) / 2;
        this.panelY = (this.canvas.height - this.panelHeight) / 2;
    }

    // Open the inventory
    open() {
        if (this.isOpen) return;

        this.isOpen = true;
        this.calculateDimensions();
        this.attachInputHandlers();
        debugLog('[InventoryPanel] Opened');
    }

    // Close the inventory
    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.removeInputHandlers();
        debugLog('[InventoryPanel] Closed');
    }

    // Toggle open/close
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    // Set inventory data
    setInventory(items) {
        this.inventory = items || [];
    }

    // Get filtered items
    getFilteredItems() {
        if (this.activeCategory === ITEM_CATEGORIES.ALL) {
            return this.inventory;
        }
        return this.inventory.filter(item =>
            item.itemType === this.activeCategory || item.type === this.activeCategory
        );
    }

    // Attach input handlers
    attachInputHandlers() {
        document.addEventListener('keydown', this.handleKeyDown);
        this.canvas.addEventListener('click', this.handleClick);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
    }

    // Remove input handlers
    removeInputHandlers() {
        document.removeEventListener('keydown', this.handleKeyDown);
        this.canvas.removeEventListener('click', this.handleClick);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    }

    // Handle keyboard input
    handleKeyDown(e) {
        if (!this.isOpen) return;

        switch (e.key) {
            case 'Escape':
            case 'i':
            case 'I':
                this.close();
                e.preventDefault();
                break;

            case 'ArrowLeft':
                if (this.selectedSlot > 0) {
                    this.selectedSlot--;
                }
                e.preventDefault();
                break;

            case 'ArrowRight':
                if (this.selectedSlot < this.inventory.length - 1) {
                    this.selectedSlot++;
                }
                e.preventDefault();
                break;

            case 'ArrowUp':
                if (this.selectedSlot >= this.slotsPerRow) {
                    this.selectedSlot -= this.slotsPerRow;
                }
                e.preventDefault();
                break;

            case 'ArrowDown':
                if (this.selectedSlot + this.slotsPerRow < this.inventory.length) {
                    this.selectedSlot += this.slotsPerRow;
                }
                e.preventDefault();
                break;

            case 'Enter':
            case 'e':
                // Use selected item
                if (this.selectedSlot >= 0 && this.selectedSlot < this.inventory.length) {
                    this.useItem(this.inventory[this.selectedSlot]);
                }
                e.preventDefault();
                break;

            case 'q':
                // Drop selected item
                if (this.selectedSlot >= 0 && this.selectedSlot < this.inventory.length) {
                    this.dropItem(this.inventory[this.selectedSlot]);
                }
                e.preventDefault();
                break;

            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
                // Quick category select
                const categories = Object.values(ITEM_CATEGORIES);
                const index = parseInt(e.key) - 1;
                if (index < categories.length) {
                    this.activeCategory = categories[index];
                }
                break;
        }
    }

    // Handle mouse click
    handleClick(e) {
        if (!this.isOpen) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if clicking outside panel
        if (x < this.panelX || x > this.panelX + this.panelWidth ||
            y < this.panelY || y > this.panelY + this.panelHeight) {
            this.close();
            return;
        }

        // Check category clicks
        const categoryY = this.panelY + 55;
        if (y >= categoryY && y <= categoryY + 25) {
            const categories = Object.values(ITEM_CATEGORIES);
            const categoryWidth = (this.panelWidth - 40) / categories.length;
            const categoryIndex = Math.floor((x - this.panelX - 20) / categoryWidth);

            if (categoryIndex >= 0 && categoryIndex < categories.length) {
                this.activeCategory = categories[categoryIndex];
                this.selectedSlot = -1;
            }
            return;
        }

        // Check slot clicks
        const slot = this.getSlotAtPosition(x, y);
        if (slot >= 0) {
            const items = this.getFilteredItems();
            if (slot < items.length) {
                this.selectedSlot = slot;

                if (this.onItemSelect) {
                    this.onItemSelect(items[slot]);
                }
            }
        }
    }

    // Handle mouse move
    handleMouseMove(e) {
        if (!this.isOpen) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.hoveredSlot = this.getSlotAtPosition(x, y);
    }

    // Get slot index at screen position
    getSlotAtPosition(x, y) {
        const gridX = this.panelX + (this.panelWidth - this.gridWidth) / 2;
        const gridY = this.panelY + 100;
        const slotSize = STYLES.slot.size + this.slotSpacing;

        const relX = x - gridX;
        const relY = y - gridY;

        if (relX < 0 || relY < 0) return -1;

        const col = Math.floor(relX / slotSize);
        const row = Math.floor(relY / slotSize);

        if (col >= this.slotsPerRow) return -1;

        const slot = row * this.slotsPerRow + col;
        return slot < this.maxSlots ? slot : -1;
    }

    // Use an item
    useItem(item) {
        if (!item) return;

        debugLog(`[InventoryPanel] Using item: ${item.name}`);

        if (this.onItemUse) {
            this.onItemUse(item);
        }
    }

    // Drop an item
    dropItem(item) {
        if (!item) return;

        debugLog(`[InventoryPanel] Dropping item: ${item.name}`);

        if (this.onItemDrop) {
            this.onItemDrop(item);
        }
    }

    // Render the inventory
    render() {
        if (!this.isOpen) return;

        this.calculateDimensions();
        const ctx = this.ctx;

        // Dim background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw panel background
        this.drawPanelBackground();

        // Draw header
        this.drawHeader();

        // Draw categories
        this.drawCategories();

        // Draw inventory grid
        this.drawInventoryGrid();

        // Draw selected item details
        this.drawItemDetails();

        // Draw close hint
        ctx.fillStyle = '#666';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Press I or ESC to close | E: Use | Q: Drop',
            this.canvas.width / 2, this.panelY + this.panelHeight - 10);
    }

    // Draw panel background
    drawPanelBackground() {
        const ctx = this.ctx;
        const s = STYLES.panel;

        ctx.fillStyle = s.backgroundColor;
        ctx.beginPath();
        ctx.roundRect(this.panelX, this.panelY, this.panelWidth, this.panelHeight, s.cornerRadius);
        ctx.fill();

        ctx.strokeStyle = s.borderColor;
        ctx.lineWidth = s.borderWidth;
        ctx.stroke();
    }

    // Draw header
    drawHeader() {
        const ctx = this.ctx;
        const x = this.panelX + this.panelWidth / 2;
        const y = this.panelY + 35;

        ctx.fillStyle = STYLES.header.color;
        ctx.font = STYLES.header.font;
        ctx.textAlign = 'center';
        ctx.fillText('INVENTORY', x, y);

        // Item count
        ctx.fillStyle = '#888';
        ctx.font = '14px monospace';
        ctx.fillText(`${this.inventory.length}/${this.maxSlots}`, x, y + 18);
    }

    // Draw category tabs
    drawCategories() {
        const ctx = this.ctx;
        const categories = [
            { id: ITEM_CATEGORIES.ALL, label: 'All' },
            { id: ITEM_CATEGORIES.SUPPLIES, label: 'Supplies' },
            { id: ITEM_CATEGORIES.DOCUMENTS, label: 'Docs' },
            { id: ITEM_CATEGORIES.WEAPONS, label: 'Weapons' },
            { id: ITEM_CATEGORIES.QUEST, label: 'Quest' }
        ];

        const categoryWidth = (this.panelWidth - 40) / categories.length;
        const categoryY = this.panelY + 55;
        const categoryHeight = 22;

        for (let i = 0; i < categories.length; i++) {
            const cat = categories[i];
            const catX = this.panelX + 20 + i * categoryWidth;

            // Background
            ctx.fillStyle = cat.id === this.activeCategory ?
                STYLES.category.activeColor : STYLES.category.backgroundColor;
            ctx.fillRect(catX, categoryY, categoryWidth - 4, categoryHeight);

            // Border
            ctx.strokeStyle = cat.id === this.activeCategory ? '#c9a227' : '#444';
            ctx.lineWidth = 1;
            ctx.strokeRect(catX, categoryY, categoryWidth - 4, categoryHeight);

            // Text
            ctx.fillStyle = STYLES.category.textColor;
            ctx.font = STYLES.category.font;
            ctx.textAlign = 'center';
            ctx.fillText(cat.label, catX + (categoryWidth - 4) / 2, categoryY + 15);
        }
    }

    // Draw inventory grid
    drawInventoryGrid() {
        const ctx = this.ctx;
        const s = STYLES.slot;
        const slotSize = s.size + this.slotSpacing;
        const gridX = this.panelX + (this.panelWidth - this.gridWidth) / 2;
        const gridY = this.panelY + 100;

        const filteredItems = this.getFilteredItems();

        for (let i = 0; i < this.maxSlots; i++) {
            const col = i % this.slotsPerRow;
            const row = Math.floor(i / this.slotsPerRow);
            const x = gridX + col * slotSize;
            const y = gridY + row * slotSize;

            // Slot background
            let bgColor = s.backgroundColor;
            if (i === this.selectedSlot && i < filteredItems.length) {
                bgColor = s.selectedColor;
            } else if (i === this.hoveredSlot) {
                bgColor = s.hoverColor;
            } else if (i >= filteredItems.length) {
                bgColor = s.emptyColor;
            }

            ctx.fillStyle = bgColor;
            ctx.fillRect(x, y, s.size, s.size);

            // Slot border
            ctx.strokeStyle = i === this.selectedSlot ? '#c9a227' : s.borderColor;
            ctx.lineWidth = i === this.selectedSlot ? 2 : 1;
            ctx.strokeRect(x, y, s.size, s.size);

            // Item if present
            if (i < filteredItems.length) {
                this.drawItem(filteredItems[i], x, y, s.size);
            }
        }
    }

    // Draw a single item in a slot
    drawItem(item, x, y, size) {
        const ctx = this.ctx;

        // Item type color indicator
        const typeColor = ITEM_COLORS[item.itemType || item.type] || ITEM_COLORS.misc;
        ctx.fillStyle = typeColor;
        ctx.fillRect(x + 2, y + 2, 4, size - 4);

        // Item icon (simple shape for now)
        ctx.fillStyle = typeColor;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(x + 10, y + 10, size - 20, size - 20);
        ctx.globalAlpha = 1;

        // Item symbol
        ctx.fillStyle = typeColor;
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.getItemSymbol(item), x + size / 2, y + size / 2 + 8);

        // Quantity (if stackable)
        if (item.quantity && item.quantity > 1) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`${item.quantity}`, x + size - 5, y + size - 5);
        }

        // Quest indicator
        if (item.questItem || item.itemType === 'quest') {
            ctx.fillStyle = '#9b59b6';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('!', x + 5, y + 12);
        }
    }

    // Get symbol for item type
    getItemSymbol(item) {
        const type = item.itemType || item.type;
        switch (type) {
            case 'supply': return '+';
            case 'document': return 'D';
            case 'weapon': return 'W';
            case 'tool': return 'T';
            case 'quest': return '!';
            default: return '?';
        }
    }

    // Draw selected item details
    drawItemDetails() {
        const ctx = this.ctx;
        const items = this.getFilteredItems();

        if (this.selectedSlot < 0 || this.selectedSlot >= items.length) {
            return;
        }

        const item = items[this.selectedSlot];
        const detailsY = this.panelY + this.panelHeight - 100;
        const detailsX = this.panelX + 20;

        // Background
        ctx.fillStyle = 'rgba(40, 40, 50, 0.8)';
        ctx.fillRect(detailsX, detailsY, this.panelWidth - 40, 60);

        // Item name
        ctx.fillStyle = STYLES.itemName.color;
        ctx.font = STYLES.itemName.font;
        ctx.textAlign = 'left';
        ctx.fillText(item.name, detailsX + 10, detailsY + 20);

        // Item type
        const typeColor = ITEM_COLORS[item.itemType || item.type] || ITEM_COLORS.misc;
        ctx.fillStyle = typeColor;
        ctx.font = '12px monospace';
        ctx.fillText(`[${(item.itemType || item.type || 'misc').toUpperCase()}]`, detailsX + 10, detailsY + 38);

        // Description
        if (item.description) {
            ctx.fillStyle = STYLES.itemDesc.color;
            ctx.font = STYLES.itemDesc.font;
            ctx.fillText(item.description.substring(0, 50), detailsX + 100, detailsY + 38);
        }

        // Value/weight if applicable
        if (item.value || item.weight) {
            ctx.fillStyle = '#888';
            ctx.font = '11px monospace';
            ctx.textAlign = 'right';
            const info = [];
            if (item.value) info.push(`Value: ${item.value}`);
            if (item.weight) info.push(`Weight: ${item.weight}`);
            ctx.fillText(info.join(' | '), detailsX + this.panelWidth - 50, detailsY + 52);
        }
    }
}
