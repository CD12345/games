// History RPG - Journal Panel
// Canvas-based UI for quest/objective tracking

import { debugLog } from '../../../ui/DebugOverlay.js';
import { QUEST_STATES } from '../core/QuestManager.js';

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
    questTitle: {
        color: '#ffffff',
        font: 'bold 16px monospace'
    },
    questType: {
        main: '#f39c12',
        optional: '#3498db',
        hidden: '#9b59b6'
    },
    objective: {
        color: '#cccccc',
        completedColor: '#27ae60',
        font: '14px monospace'
    },
    tab: {
        backgroundColor: 'rgba(40, 40, 50, 0.9)',
        activeColor: 'rgba(201, 162, 39, 0.3)',
        textColor: '#ffffff',
        font: '14px monospace'
    }
};

export class JournalPanel {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Panel state
        this.isOpen = false;
        this.activeTab = 'quests'; // 'quests', 'log', 'notes'

        // Quest data (set externally)
        this.questManager = null;

        // Scroll state
        this.scrollOffset = 0;
        this.maxScroll = 0;

        // Selected quest
        this.selectedQuestIndex = 0;
        this.questList = [];

        // Panel dimensions
        this.calculateDimensions();

        // Input handlers
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
    }

    // Calculate panel dimensions
    calculateDimensions() {
        this.panelWidth = Math.min(600, this.canvas.width - 40);
        this.panelHeight = Math.min(500, this.canvas.height - 80);
        this.panelX = (this.canvas.width - this.panelWidth) / 2;
        this.panelY = (this.canvas.height - this.panelHeight) / 2;
    }

    // Open the journal
    open() {
        if (this.isOpen) return;

        this.isOpen = true;
        this.calculateDimensions();
        this.refreshQuestList();
        this.attachInputHandlers();
        debugLog('[JournalPanel] Opened');
    }

    // Close the journal
    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.removeInputHandlers();
        debugLog('[JournalPanel] Closed');
    }

    // Toggle open/close
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    // Set quest manager reference
    setQuestManager(questManager) {
        this.questManager = questManager;
    }

    // Refresh the quest list
    refreshQuestList() {
        if (!this.questManager) {
            this.questList = [];
            return;
        }

        // Get quests grouped by state
        const active = this.questManager.getQuestsByState(QUEST_STATES.ACTIVE);
        const available = this.questManager.getQuestsByState(QUEST_STATES.AVAILABLE);
        const completed = this.questManager.getQuestsByState(QUEST_STATES.COMPLETED);

        this.questList = [...active, ...available, ...completed];

        // Update max scroll
        const contentHeight = this.questList.length * 120;
        this.maxScroll = Math.max(0, contentHeight - (this.panelHeight - 120));
    }

    // Attach input handlers
    attachInputHandlers() {
        document.addEventListener('keydown', this.handleKeyDown);
        this.canvas.addEventListener('click', this.handleClick);
        this.canvas.addEventListener('wheel', this.handleWheel);
    }

    // Remove input handlers
    removeInputHandlers() {
        document.removeEventListener('keydown', this.handleKeyDown);
        this.canvas.removeEventListener('click', this.handleClick);
        this.canvas.removeEventListener('wheel', this.handleWheel);
    }

    // Handle keyboard input
    handleKeyDown(e) {
        if (!this.isOpen) return;

        switch (e.key) {
            case 'Escape':
            case 'j':
            case 'J':
                this.close();
                e.preventDefault();
                break;
            case 'ArrowUp':
                this.selectedQuestIndex = Math.max(0, this.selectedQuestIndex - 1);
                e.preventDefault();
                break;
            case 'ArrowDown':
                this.selectedQuestIndex = Math.min(this.questList.length - 1, this.selectedQuestIndex + 1);
                e.preventDefault();
                break;
            case 'Tab':
                // Cycle tabs
                const tabs = ['quests', 'log', 'notes'];
                const currentIndex = tabs.indexOf(this.activeTab);
                this.activeTab = tabs[(currentIndex + 1) % tabs.length];
                e.preventDefault();
                break;
            case 'Enter':
                // Track selected quest
                if (this.questList[this.selectedQuestIndex] && this.questManager) {
                    this.questManager.trackQuest(this.questList[this.selectedQuestIndex].id);
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

        // Check tab clicks
        const tabY = this.panelY + STYLES.panel.padding;
        const tabHeight = 30;
        if (y >= tabY && y <= tabY + tabHeight) {
            const tabWidth = this.panelWidth / 3;
            const tabs = ['quests', 'log', 'notes'];
            const tabIndex = Math.floor((x - this.panelX) / tabWidth);
            if (tabIndex >= 0 && tabIndex < tabs.length) {
                this.activeTab = tabs[tabIndex];
            }
        }

        // Check quest clicks
        const contentY = this.panelY + 80;
        const relativeY = y - contentY + this.scrollOffset;
        const questIndex = Math.floor(relativeY / 100);

        if (questIndex >= 0 && questIndex < this.questList.length) {
            this.selectedQuestIndex = questIndex;
        }
    }

    // Handle scroll wheel
    handleWheel(e) {
        if (!this.isOpen) return;

        this.scrollOffset = Math.max(0, Math.min(this.maxScroll,
            this.scrollOffset + e.deltaY * 0.5
        ));
        e.preventDefault();
    }

    // Render the journal
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

        // Draw tabs
        this.drawTabs();

        // Draw content based on active tab
        switch (this.activeTab) {
            case 'quests':
                this.drawQuests();
                break;
            case 'log':
                this.drawLog();
                break;
            case 'notes':
                this.drawNotes();
                break;
        }

        // Draw close hint
        ctx.fillStyle = '#666';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Press J or ESC to close', this.canvas.width / 2, this.panelY + this.panelHeight - 10);
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
        ctx.fillText('JOURNAL', x, y);
    }

    // Draw tabs
    drawTabs() {
        const ctx = this.ctx;
        const tabWidth = (this.panelWidth - 40) / 3;
        const tabY = this.panelY + 55;
        const tabHeight = 25;
        const tabs = [
            { id: 'quests', label: 'Quests' },
            { id: 'log', label: 'Log' },
            { id: 'notes', label: 'Notes' }
        ];

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const tabX = this.panelX + 20 + i * tabWidth;

            // Background
            ctx.fillStyle = tab.id === this.activeTab ?
                STYLES.tab.activeColor : STYLES.tab.backgroundColor;
            ctx.fillRect(tabX, tabY, tabWidth - 5, tabHeight);

            // Border
            ctx.strokeStyle = tab.id === this.activeTab ? '#c9a227' : '#555';
            ctx.lineWidth = 1;
            ctx.strokeRect(tabX, tabY, tabWidth - 5, tabHeight);

            // Text
            ctx.fillStyle = STYLES.tab.textColor;
            ctx.font = STYLES.tab.font;
            ctx.textAlign = 'center';
            ctx.fillText(tab.label, tabX + (tabWidth - 5) / 2, tabY + 17);
        }
    }

    // Draw quests content
    drawQuests() {
        const ctx = this.ctx;
        const contentX = this.panelX + 20;
        const contentY = this.panelY + 100;
        const contentWidth = this.panelWidth - 40;
        const contentHeight = this.panelHeight - 140;

        // Create clipping region
        ctx.save();
        ctx.beginPath();
        ctx.rect(contentX, contentY, contentWidth, contentHeight);
        ctx.clip();

        if (this.questList.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('No quests yet...', this.panelX + this.panelWidth / 2, contentY + 50);
            ctx.restore();
            return;
        }

        let y = contentY - this.scrollOffset;

        for (let i = 0; i < this.questList.length; i++) {
            const quest = this.questList[i];

            // Skip if outside visible area
            if (y + 100 < contentY || y > contentY + contentHeight) {
                y += 100;
                continue;
            }

            // Quest card background
            const isSelected = i === this.selectedQuestIndex;
            const isTracked = this.questManager?.activeQuest === quest.id;

            ctx.fillStyle = isSelected ?
                'rgba(201, 162, 39, 0.2)' : 'rgba(40, 40, 50, 0.5)';
            ctx.fillRect(contentX, y, contentWidth, 90);

            if (isTracked) {
                ctx.strokeStyle = '#c9a227';
                ctx.lineWidth = 2;
                ctx.strokeRect(contentX, y, contentWidth, 90);
            }

            // Quest type indicator
            const typeColor = STYLES.questType[quest.type] || STYLES.questType.optional;
            ctx.fillStyle = typeColor;
            ctx.fillRect(contentX, y, 4, 90);

            // Quest title
            ctx.fillStyle = STYLES.questTitle.color;
            ctx.font = STYLES.questTitle.font;
            ctx.textAlign = 'left';
            ctx.fillText(quest.title, contentX + 15, y + 22);

            // Quest state
            let stateText = quest.state.toUpperCase();
            let stateColor = '#666';
            if (quest.state === QUEST_STATES.ACTIVE) {
                stateText = 'ACTIVE';
                stateColor = '#27ae60';
            } else if (quest.state === QUEST_STATES.COMPLETED) {
                stateText = 'COMPLETED';
                stateColor = '#3498db';
            } else if (quest.state === QUEST_STATES.FAILED) {
                stateText = 'FAILED';
                stateColor = '#e74c3c';
            }

            ctx.fillStyle = stateColor;
            ctx.font = '12px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(stateText, contentX + contentWidth - 10, y + 22);

            // Progress bar for active quests
            if (quest.state === QUEST_STATES.ACTIVE) {
                const progress = quest.getProgress();
                const barWidth = 100;
                const barX = contentX + contentWidth - barWidth - 10;
                const barY = y + 30;

                ctx.fillStyle = '#333';
                ctx.fillRect(barX, barY, barWidth, 8);
                ctx.fillStyle = '#27ae60';
                ctx.fillRect(barX, barY, barWidth * (progress / 100), 8);
            }

            // First few objectives
            ctx.textAlign = 'left';
            ctx.font = STYLES.objective.font;

            let objY = y + 45;
            const visibleObjectives = quest.objectives.slice(0, 3);

            for (const obj of visibleObjectives) {
                const checkbox = obj.completed ? '✓' : '○';
                ctx.fillStyle = obj.completed ?
                    STYLES.objective.completedColor : STYLES.objective.color;
                ctx.fillText(`${checkbox} ${obj.description.substring(0, 50)}`, contentX + 15, objY);
                objY += 16;
            }

            if (quest.objectives.length > 3) {
                ctx.fillStyle = '#666';
                ctx.fillText(`  +${quest.objectives.length - 3} more...`, contentX + 15, objY);
            }

            y += 100;
        }

        ctx.restore();

        // Scroll indicator
        if (this.maxScroll > 0) {
            const scrollBarHeight = contentHeight * (contentHeight / (contentHeight + this.maxScroll));
            const scrollBarY = contentY + (this.scrollOffset / this.maxScroll) * (contentHeight - scrollBarHeight);

            ctx.fillStyle = 'rgba(201, 162, 39, 0.3)';
            ctx.fillRect(contentX + contentWidth - 6, scrollBarY, 4, scrollBarHeight);
        }
    }

    // Draw log content
    drawLog() {
        const ctx = this.ctx;
        const contentX = this.panelX + 20;
        const contentY = this.panelY + 100;

        if (!this.questManager?.questLog?.length) {
            ctx.fillStyle = '#666';
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('No log entries yet...', this.panelX + this.panelWidth / 2, contentY + 50);
            return;
        }

        ctx.textAlign = 'left';
        ctx.font = '14px monospace';

        let y = contentY;
        const recentLogs = this.questManager.questLog.slice(-10).reverse();

        for (const entry of recentLogs) {
            const quest = this.questManager.getQuest(entry.questId);
            const questName = quest?.title || entry.questId;
            const time = new Date(entry.timestamp).toLocaleTimeString();

            let text = '';
            let color = '#888';

            switch (entry.type) {
                case 'started':
                    text = `Started: ${questName}`;
                    color = '#27ae60';
                    break;
                case 'completed':
                    text = `Completed: ${questName}`;
                    color = '#3498db';
                    break;
                case 'failed':
                    text = `Failed: ${questName}`;
                    color = '#e74c3c';
                    break;
                case 'discovered':
                    text = `Discovered: ${questName}`;
                    color = '#f39c12';
                    break;
                default:
                    text = `${entry.type}: ${questName}`;
            }

            ctx.fillStyle = '#555';
            ctx.fillText(time, contentX, y);

            ctx.fillStyle = color;
            ctx.fillText(text, contentX + 80, y);

            y += 22;
        }
    }

    // Draw notes content (player notes - future feature)
    drawNotes() {
        const ctx = this.ctx;
        const contentY = this.panelY + 100;

        ctx.fillStyle = '#666';
        ctx.font = '16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Notes coming soon...', this.panelX + this.panelWidth / 2, contentY + 50);
        ctx.font = '14px monospace';
        ctx.fillText('Keep track of your discoveries!', this.panelX + this.panelWidth / 2, contentY + 80);
    }
}
