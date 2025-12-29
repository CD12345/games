// History RPG - Dialogue Panel
// Canvas-based dialogue UI for NPC conversations

import { debugLog } from '../../../ui/DebugOverlay.js';

// Dialogue panel styles
const STYLES = {
    panel: {
        backgroundColor: 'rgba(20, 20, 30, 0.95)',
        borderColor: '#c9a227',
        borderWidth: 3,
        padding: 20,
        cornerRadius: 8
    },
    portrait: {
        size: 80,
        borderColor: '#c9a227',
        borderWidth: 2
    },
    text: {
        color: '#ffffff',
        font: '16px monospace',
        lineHeight: 24
    },
    name: {
        color: '#c9a227',
        font: 'bold 18px monospace'
    },
    emotion: {
        color: '#888888',
        font: 'italic 14px monospace'
    },
    choice: {
        backgroundColor: 'rgba(40, 40, 50, 0.9)',
        hoverColor: 'rgba(60, 60, 70, 0.9)',
        selectedColor: 'rgba(201, 162, 39, 0.3)',
        textColor: '#ffffff',
        borderColor: '#555555',
        padding: 12,
        font: '14px monospace'
    }
};

// Faction colors for portraits
const FACTION_COLORS = {
    soviet: '#8b4513',
    german: '#556b2f',
    civilian: '#7f8c8d',
    resistance: '#34495e',
    default: '#555555'
};

export class DialoguePanel {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Panel dimensions (calculated based on canvas size)
        this.panelHeight = 0;
        this.panelY = 0;
        this.calculateDimensions();

        // Current dialogue state
        this.npc = null;
        this.dialogue = null;
        this.choices = [];
        this.selectedChoice = 0;
        this.history = [];

        // Animation state
        this.textRevealIndex = 0;
        this.textRevealSpeed = 30; // characters per second
        this.isRevealing = false;

        // Input state
        this.hoveredChoice = -1;

        // Callbacks
        this.onChoiceSelected = null;
        this.onDialogueEnd = null;

        // Bind methods
        this.handleClick = this.handleClick.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    // Calculate panel dimensions based on canvas size
    calculateDimensions() {
        this.panelHeight = Math.min(300, this.canvas.height * 0.4);
        this.panelY = this.canvas.height - this.panelHeight;
        this.panelWidth = this.canvas.width - 40;
        this.panelX = 20;
    }

    // Start dialogue with an NPC
    startDialogue(npc, initialResponse) {
        debugLog(`[DialoguePanel] Starting dialogue with ${npc.name}`);

        this.npc = npc;
        this.dialogue = initialResponse;
        this.history = [];
        this.selectedChoice = 0;

        // Extract choices from response
        this.choices = initialResponse.suggestedChoices || [
            { text: "Continue...", type: "continue" },
            { text: "Goodbye.", type: "leave" }
        ];

        // Start text reveal animation
        this.textRevealIndex = 0;
        this.isRevealing = true;

        // Set up input handlers
        this.attachInputHandlers();
    }

    // Update dialogue with new response
    updateDialogue(response) {
        // Add previous exchange to history
        if (this.dialogue) {
            this.history.push({
                speaker: this.npc.name,
                text: this.dialogue.speech,
                emotion: this.dialogue.emotion
            });
        }

        this.dialogue = response;
        this.choices = response.suggestedChoices || [
            { text: "Continue...", type: "continue" },
            { text: "Goodbye.", type: "leave" }
        ];
        this.selectedChoice = 0;

        // Restart text reveal
        this.textRevealIndex = 0;
        this.isRevealing = true;
    }

    // End dialogue
    endDialogue() {
        debugLog(`[DialoguePanel] Ending dialogue`);

        this.removeInputHandlers();
        this.npc = null;
        this.dialogue = null;
        this.choices = [];
        this.history = [];

        if (this.onDialogueEnd) {
            this.onDialogueEnd();
        }
    }

    // Attach input handlers
    attachInputHandlers() {
        this.canvas.addEventListener('click', this.handleClick);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('keydown', this.handleKeyDown);
    }

    // Remove input handlers
    removeInputHandlers() {
        this.canvas.removeEventListener('click', this.handleClick);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    // Handle mouse click
    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if clicking on a choice
        if (this.hoveredChoice >= 0 && !this.isRevealing) {
            this.selectChoice(this.hoveredChoice);
        } else if (this.isRevealing) {
            // Skip text reveal
            this.textRevealIndex = this.dialogue?.speech?.length || 0;
            this.isRevealing = false;
        }
    }

    // Handle mouse move
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check which choice is hovered
        this.hoveredChoice = this.getChoiceAtPosition(x, y);
    }

    // Handle keyboard input
    handleKeyDown(e) {
        if (this.isRevealing) {
            // Skip reveal on any key
            this.textRevealIndex = this.dialogue?.speech?.length || 0;
            this.isRevealing = false;
            return;
        }

        switch (e.key) {
            case 'ArrowUp':
            case 'w':
                this.selectedChoice = Math.max(0, this.selectedChoice - 1);
                break;
            case 'ArrowDown':
            case 's':
                this.selectedChoice = Math.min(this.choices.length - 1, this.selectedChoice + 1);
                break;
            case 'Enter':
            case ' ':
                this.selectChoice(this.selectedChoice);
                break;
            case 'Escape':
                this.selectChoice(this.choices.length - 1); // Usually "leave"
                break;
        }
    }

    // Get choice index at screen position
    getChoiceAtPosition(x, y) {
        const choiceStartY = this.panelY + this.panelHeight - 20 - this.choices.length * 40;

        for (let i = 0; i < this.choices.length; i++) {
            const choiceY = choiceStartY + i * 40;
            const choiceX = this.panelX + STYLES.portrait.size + 40;
            const choiceWidth = this.panelWidth - STYLES.portrait.size - 60;

            if (x >= choiceX && x <= choiceX + choiceWidth &&
                y >= choiceY && y <= choiceY + 35) {
                return i;
            }
        }

        return -1;
    }

    // Select a choice
    selectChoice(index) {
        if (index < 0 || index >= this.choices.length) return;

        const choice = this.choices[index];
        debugLog(`[DialoguePanel] Selected choice: ${choice.text}`);

        // Add player response to history
        this.history.push({
            speaker: 'You',
            text: choice.text,
            isPlayer: true
        });

        if (choice.type === 'leave' || choice.type === 'leaving') {
            this.endDialogue();
        } else if (this.onChoiceSelected) {
            this.onChoiceSelected(choice);
        }
    }

    // Update animation (call every frame)
    update(deltaTime) {
        if (this.isRevealing && this.dialogue?.speech) {
            this.textRevealIndex += this.textRevealSpeed * deltaTime;

            if (this.textRevealIndex >= this.dialogue.speech.length) {
                this.textRevealIndex = this.dialogue.speech.length;
                this.isRevealing = false;
            }
        }
    }

    // Render the dialogue panel
    render() {
        if (!this.npc || !this.dialogue) return;

        this.calculateDimensions();
        const ctx = this.ctx;

        // Draw panel background
        this.drawPanelBackground();

        // Draw NPC portrait
        this.drawPortrait();

        // Draw NPC name and emotion
        this.drawNameAndEmotion();

        // Draw dialogue text
        this.drawDialogueText();

        // Draw choices (if text is fully revealed)
        if (!this.isRevealing) {
            this.drawChoices();
        } else {
            // Draw "continue" hint
            this.drawContinueHint();
        }
    }

    // Draw panel background
    drawPanelBackground() {
        const ctx = this.ctx;
        const s = STYLES.panel;

        // Main panel
        ctx.fillStyle = s.backgroundColor;
        ctx.beginPath();
        ctx.roundRect(this.panelX, this.panelY, this.panelWidth, this.panelHeight, s.cornerRadius);
        ctx.fill();

        // Border
        ctx.strokeStyle = s.borderColor;
        ctx.lineWidth = s.borderWidth;
        ctx.stroke();
    }

    // Draw NPC portrait
    drawPortrait() {
        const ctx = this.ctx;
        const s = STYLES.portrait;
        const x = this.panelX + STYLES.panel.padding;
        const y = this.panelY + STYLES.panel.padding;

        // Portrait background
        const factionColor = FACTION_COLORS[this.npc.faction] || FACTION_COLORS.default;
        ctx.fillStyle = factionColor;
        ctx.fillRect(x, y, s.size, s.size);

        // Simple face
        ctx.fillStyle = '#e8d5b7';
        ctx.fillRect(x + s.size * 0.2, y + s.size * 0.15, s.size * 0.6, s.size * 0.5);

        // Eyes based on emotion
        ctx.fillStyle = '#333';
        const eyeY = y + s.size * 0.35;
        const eyeSize = 4;

        if (this.dialogue.emotion === 'suspicious' || this.dialogue.emotion === 'angry') {
            // Narrowed eyes
            ctx.fillRect(x + s.size * 0.3, eyeY, eyeSize * 1.5, eyeSize * 0.5);
            ctx.fillRect(x + s.size * 0.55, eyeY, eyeSize * 1.5, eyeSize * 0.5);
        } else {
            // Normal eyes
            ctx.fillRect(x + s.size * 0.3, eyeY, eyeSize, eyeSize);
            ctx.fillRect(x + s.size * 0.55, eyeY, eyeSize, eyeSize);
        }

        // Border
        ctx.strokeStyle = s.borderColor;
        ctx.lineWidth = s.borderWidth;
        ctx.strokeRect(x, y, s.size, s.size);

        // Disposition indicator
        this.drawDispositionIndicator(x, y + s.size + 5, s.size);
    }

    // Draw disposition bar
    drawDispositionIndicator(x, y, width) {
        const ctx = this.ctx;
        const disposition = this.npc.disposition || 50;
        const barHeight = 6;

        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, width, barHeight);

        // Fill based on disposition
        let fillColor;
        if (disposition >= 60) {
            fillColor = '#27ae60';
        } else if (disposition >= 40) {
            fillColor = '#f39c12';
        } else {
            fillColor = '#e74c3c';
        }

        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, width * (disposition / 100), barHeight);

        // Border
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, barHeight);
    }

    // Draw NPC name and emotion
    drawNameAndEmotion() {
        const ctx = this.ctx;
        const textX = this.panelX + STYLES.portrait.size + 40;
        const textY = this.panelY + STYLES.panel.padding + 20;

        // Name
        ctx.fillStyle = STYLES.name.color;
        ctx.font = STYLES.name.font;
        ctx.textAlign = 'left';
        ctx.fillText(this.npc.name, textX, textY);

        // Role/faction
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText(`${this.npc.role || this.npc.type || 'Unknown'}`, textX + ctx.measureText(this.npc.name).width + 10, textY);

        // Emotion
        if (this.dialogue.emotion) {
            ctx.fillStyle = STYLES.emotion.color;
            ctx.font = STYLES.emotion.font;
            ctx.fillText(`(${this.dialogue.emotion})`, textX, textY + 20);
        }
    }

    // Draw dialogue text with word wrap
    drawDialogueText() {
        const ctx = this.ctx;
        const textX = this.panelX + STYLES.portrait.size + 40;
        const textY = this.panelY + STYLES.panel.padding + 60;
        const maxWidth = this.panelWidth - STYLES.portrait.size - 80;

        ctx.fillStyle = STYLES.text.color;
        ctx.font = STYLES.text.font;
        ctx.textAlign = 'left';

        // Get visible text (for reveal animation)
        const fullText = this.dialogue.speech || '';
        const visibleText = fullText.substring(0, Math.floor(this.textRevealIndex));

        // Word wrap
        const words = visibleText.split(' ');
        let line = '';
        let y = textY;
        const lineHeight = STYLES.text.lineHeight;

        for (const word of words) {
            const testLine = line + (line ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth && line) {
                ctx.fillText(line, textX, y);
                line = word;
                y += lineHeight;
            } else {
                line = testLine;
            }
        }

        if (line) {
            ctx.fillText(line, textX, y);
        }

        // Blinking cursor during reveal
        if (this.isRevealing) {
            const cursorX = textX + ctx.measureText(line).width + 2;
            if (Math.floor(Date.now() / 300) % 2 === 0) {
                ctx.fillRect(cursorX, y - 14, 8, 16);
            }
        }
    }

    // Draw choice buttons
    drawChoices() {
        const ctx = this.ctx;
        const s = STYLES.choice;
        const startX = this.panelX + STYLES.portrait.size + 40;
        const startY = this.panelY + this.panelHeight - 20 - this.choices.length * 40;
        const choiceWidth = this.panelWidth - STYLES.portrait.size - 60;

        for (let i = 0; i < this.choices.length; i++) {
            const choice = this.choices[i];
            const y = startY + i * 40;

            // Background
            let bgColor = s.backgroundColor;
            if (i === this.selectedChoice) {
                bgColor = s.selectedColor;
            } else if (i === this.hoveredChoice) {
                bgColor = s.hoverColor;
            }

            ctx.fillStyle = bgColor;
            ctx.beginPath();
            ctx.roundRect(startX, y, choiceWidth, 35, 4);
            ctx.fill();

            // Border
            ctx.strokeStyle = i === this.selectedChoice ? '#c9a227' : s.borderColor;
            ctx.lineWidth = i === this.selectedChoice ? 2 : 1;
            ctx.stroke();

            // Choice number
            ctx.fillStyle = '#c9a227';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${i + 1}.`, startX + s.padding, y + 22);

            // Choice text
            ctx.fillStyle = s.textColor;
            ctx.font = s.font;
            ctx.fillText(choice.text, startX + s.padding + 25, y + 22);

            // Choice type indicator
            if (choice.type === 'friendly') {
                ctx.fillStyle = '#27ae60';
                ctx.fillText('●', startX + choiceWidth - 20, y + 22);
            } else if (choice.type === 'aggressive') {
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('●', startX + choiceWidth - 20, y + 22);
            }
        }
    }

    // Draw continue hint
    drawContinueHint() {
        const ctx = this.ctx;
        const x = this.panelX + this.panelWidth - 120;
        const y = this.panelY + this.panelHeight - 30;

        ctx.fillStyle = '#666';
        ctx.font = '12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('Click to continue...', x, y);
    }

    // Check if dialogue is active
    isActive() {
        return this.npc !== null && this.dialogue !== null;
    }
}
