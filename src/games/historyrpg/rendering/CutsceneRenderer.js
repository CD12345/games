// History RPG - Cutscene Renderer
// First-person view (FPV) static scenes with procedural backgrounds

import { debugLog } from '../../../ui/DebugOverlay.js';

// Cutscene styles
const STYLES = {
    letterbox: {
        height: 60,
        color: 'rgba(0, 0, 0, 0.95)'
    },
    text: {
        color: '#ffffff',
        font: '16px monospace',
        lineHeight: 24
    },
    title: {
        color: '#c9a227',
        font: 'bold 24px monospace'
    },
    subtitle: {
        color: '#888888',
        font: 'italic 14px monospace'
    }
};

// Environment color palettes
const ENVIRONMENT_PALETTES = {
    interior_ruined: {
        walls: ['#4a4a4a', '#3d3d3d', '#555555'],
        floor: ['#3a3a3a', '#2d2d2d'],
        ceiling: ['#2a2a2a', '#1f1f1f'],
        accent: '#8b4513',
        lighting: 'dim'
    },
    interior_bunker: {
        walls: ['#5a5a5a', '#4d4d4d', '#656565'],
        floor: ['#3f3f3f', '#333333'],
        ceiling: ['#2f2f2f', '#252525'],
        accent: '#556b2f',
        lighting: 'harsh'
    },
    exterior_day: {
        sky: ['#87ceeb', '#b0e0e6'],
        ground: ['#5a4a3a', '#4a3a2a'],
        buildings: ['#6b5b4a', '#7a6a5a', '#5a4a3a'],
        accent: '#f0f0f0',
        lighting: 'bright'
    },
    exterior_night: {
        sky: ['#1a1a2e', '#0f0f1a'],
        ground: ['#2a2a2a', '#1f1f1f'],
        buildings: ['#3a3a3a', '#2d2d2d', '#1f1f1f'],
        accent: '#4a4a6a',
        lighting: 'dark'
    },
    cellar: {
        walls: ['#3a3a3a', '#2d2d2d', '#454545'],
        floor: ['#2a2a2a', '#1f1f1f'],
        ceiling: ['#1f1f1f', '#151515'],
        accent: '#8b7355',
        lighting: 'very_dim'
    }
};

// Character portrait styles by faction
const PORTRAIT_STYLES = {
    soviet: {
        uniform: '#8b4513',
        accent: '#cc0000',
        hat: '#4a4a4a'
    },
    german: {
        uniform: '#556b2f',
        accent: '#808080',
        hat: '#3a3a3a'
    },
    civilian: {
        clothes: '#7f8c8d',
        accent: '#5d6d7e',
        hat: null
    },
    resistance: {
        clothes: '#34495e',
        accent: '#2c3e50',
        hat: null
    }
};

export class CutsceneRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Current cutscene state
        this.currentCutscene = null;
        this.currentFrame = 0;
        this.frameTimer = 0;
        this.frameDuration = 5; // seconds per frame

        // Animation state
        this.fadeAlpha = 0;
        this.fadeDirection = 0; // -1: fading out, 1: fading in, 0: stable
        this.fadeSpeed = 2; // alpha per second

        // Text animation
        this.textRevealIndex = 0;
        this.textRevealSpeed = 30;

        // Seed for procedural generation
        this.seed = 0;

        // Callbacks
        this.onCutsceneEnd = null;
        this.onFrameChange = null;
    }

    // Start a cutscene
    startCutscene(cutscene) {
        this.currentCutscene = cutscene;
        this.currentFrame = 0;
        this.frameTimer = 0;
        this.textRevealIndex = 0;
        this.seed = cutscene.id ? this.hashString(cutscene.id) : Date.now();

        // Start fade in
        this.fadeAlpha = 1;
        this.fadeDirection = -1;

        debugLog(`[CutsceneRenderer] Starting cutscene: ${cutscene.title || 'Untitled'}`);
    }

    // Hash string to number for seeded randomness
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    // Seeded random
    seededRandom(offset = 0) {
        const x = Math.sin(this.seed + offset) * 10000;
        return x - Math.floor(x);
    }

    // Update cutscene (call every frame)
    update(deltaTime) {
        if (!this.currentCutscene) return false;

        // Update fade
        if (this.fadeDirection !== 0) {
            this.fadeAlpha += this.fadeDirection * this.fadeSpeed * deltaTime;

            if (this.fadeDirection === -1 && this.fadeAlpha <= 0) {
                this.fadeAlpha = 0;
                this.fadeDirection = 0;
            } else if (this.fadeDirection === 1 && this.fadeAlpha >= 1) {
                this.fadeAlpha = 1;
                this.fadeDirection = 0;

                // Check if ending
                if (this.currentFrame >= this.currentCutscene.frames.length) {
                    this.endCutscene();
                    return false;
                }
            }
        }

        // Update text reveal
        const frame = this.getCurrentFrame();
        if (frame?.text) {
            this.textRevealIndex += this.textRevealSpeed * deltaTime;
            if (this.textRevealIndex > frame.text.length) {
                this.textRevealIndex = frame.text.length;
            }
        }

        // Update frame timer
        this.frameTimer += deltaTime;
        if (this.frameTimer >= this.frameDuration && this.fadeDirection === 0) {
            // Auto-advance (or wait for user input)
            if (this.currentCutscene.autoAdvance !== false) {
                this.nextFrame();
            }
        }

        return true;
    }

    // Get current frame
    getCurrentFrame() {
        if (!this.currentCutscene?.frames) return null;
        return this.currentCutscene.frames[this.currentFrame];
    }

    // Advance to next frame
    nextFrame() {
        if (!this.currentCutscene) return;

        // Start fade out
        this.fadeDirection = 1;

        // Wait for fade, then advance
        setTimeout(() => {
            this.currentFrame++;
            this.frameTimer = 0;
            this.textRevealIndex = 0;

            if (this.currentFrame < this.currentCutscene.frames.length) {
                this.fadeDirection = -1;

                if (this.onFrameChange) {
                    this.onFrameChange(this.currentFrame);
                }
            }
        }, 500);
    }

    // Skip current cutscene
    skip() {
        if (!this.currentCutscene) return;

        this.fadeDirection = 1;
        this.currentFrame = this.currentCutscene.frames.length;
    }

    // End cutscene
    endCutscene() {
        const cutscene = this.currentCutscene;
        this.currentCutscene = null;

        debugLog(`[CutsceneRenderer] Cutscene ended`);

        if (this.onCutsceneEnd) {
            this.onCutsceneEnd(cutscene);
        }
    }

    // Render the cutscene
    render() {
        if (!this.currentCutscene) return;

        const frame = this.getCurrentFrame();
        if (!frame) return;

        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Render environment background
        this.renderEnvironment(frame.environment || 'interior_ruined');

        // Render character if present
        if (frame.character) {
            this.renderCharacter(frame.character);
        }

        // Render letterbox bars
        this.renderLetterbox();

        // Render title/subtitle
        if (frame.title) {
            this.renderTitle(frame.title, frame.subtitle);
        }

        // Render text
        if (frame.text) {
            this.renderText(frame.text);
        }

        // Render controls hint
        this.renderControlsHint();

        // Render fade overlay
        if (this.fadeAlpha > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    // Render procedural environment
    renderEnvironment(envType) {
        const ctx = this.ctx;
        const palette = ENVIRONMENT_PALETTES[envType] || ENVIRONMENT_PALETTES.interior_ruined;
        const width = this.canvas.width;
        const height = this.canvas.height;

        if (envType.startsWith('exterior')) {
            this.renderExteriorEnvironment(palette);
        } else {
            this.renderInteriorEnvironment(palette);
        }
    }

    // Render interior environment (FPV room)
    renderInteriorEnvironment(palette) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Ceiling
        ctx.fillStyle = palette.ceiling[0];
        ctx.fillRect(0, 0, width, height * 0.3);

        // Back wall
        ctx.fillStyle = palette.walls[0];
        ctx.fillRect(0, height * 0.3, width, height * 0.5);

        // Floor
        ctx.fillStyle = palette.floor[0];
        ctx.fillRect(0, height * 0.8, width, height * 0.2);

        // Add perspective lines
        const vanishX = width / 2;
        const vanishY = height * 0.45;

        // Left wall
        ctx.fillStyle = palette.walls[1];
        ctx.beginPath();
        ctx.moveTo(0, height * 0.3);
        ctx.lineTo(0, height * 0.8);
        ctx.lineTo(width * 0.15, vanishY + height * 0.2);
        ctx.lineTo(width * 0.15, vanishY - height * 0.1);
        ctx.closePath();
        ctx.fill();

        // Right wall
        ctx.fillStyle = palette.walls[2] || palette.walls[1];
        ctx.beginPath();
        ctx.moveTo(width, height * 0.3);
        ctx.lineTo(width, height * 0.8);
        ctx.lineTo(width * 0.85, vanishY + height * 0.2);
        ctx.lineTo(width * 0.85, vanishY - height * 0.1);
        ctx.closePath();
        ctx.fill();

        // Floor perspective
        ctx.fillStyle = palette.floor[1] || palette.floor[0];
        ctx.beginPath();
        ctx.moveTo(0, height * 0.8);
        ctx.lineTo(width, height * 0.8);
        ctx.lineTo(width * 0.85, vanishY + height * 0.2);
        ctx.lineTo(width * 0.15, vanishY + height * 0.2);
        ctx.closePath();
        ctx.fill();

        // Add some debris/details
        this.renderInteriorDetails(palette, vanishX, vanishY);

        // Lighting effect
        this.renderLighting(palette.lighting);
    }

    // Render exterior environment
    renderExteriorEnvironment(palette) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Sky gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, height * 0.6);
        gradient.addColorStop(0, palette.sky[0]);
        gradient.addColorStop(1, palette.sky[1] || palette.sky[0]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height * 0.6);

        // Ground
        ctx.fillStyle = palette.ground[0];
        ctx.fillRect(0, height * 0.6, width, height * 0.4);

        // Buildings silhouettes
        for (let i = 0; i < 5; i++) {
            const buildingWidth = 80 + this.seededRandom(i) * 100;
            const buildingHeight = 100 + this.seededRandom(i + 5) * 150;
            const buildingX = i * (width / 4) - 50 + this.seededRandom(i + 10) * 80;
            const buildingY = height * 0.6 - buildingHeight;

            ctx.fillStyle = palette.buildings[i % palette.buildings.length];
            ctx.fillRect(buildingX, buildingY, buildingWidth, buildingHeight);

            // Windows
            if (palette.lighting !== 'dark') {
                ctx.fillStyle = 'rgba(100, 100, 80, 0.3)';
                for (let wy = buildingY + 20; wy < buildingY + buildingHeight - 20; wy += 30) {
                    for (let wx = buildingX + 15; wx < buildingX + buildingWidth - 15; wx += 25) {
                        if (this.seededRandom(wx + wy) > 0.5) {
                            ctx.fillRect(wx, wy, 15, 20);
                        }
                    }
                }
            }
        }

        // Rubble/debris on ground
        ctx.fillStyle = palette.ground[1] || palette.ground[0];
        for (let i = 0; i < 20; i++) {
            const x = this.seededRandom(i * 3) * width;
            const y = height * 0.65 + this.seededRandom(i * 3 + 1) * (height * 0.3);
            const size = 5 + this.seededRandom(i * 3 + 2) * 20;
            ctx.fillRect(x, y, size, size * 0.5);
        }

        // Lighting
        this.renderLighting(palette.lighting);
    }

    // Render interior details (debris, furniture, etc.)
    renderInteriorDetails(palette, vanishX, vanishY) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Random debris
        ctx.fillStyle = palette.accent;
        for (let i = 0; i < 8; i++) {
            const x = width * 0.2 + this.seededRandom(i * 4) * width * 0.6;
            const y = height * 0.7 + this.seededRandom(i * 4 + 1) * height * 0.15;
            const size = 5 + this.seededRandom(i * 4 + 2) * 15;
            ctx.fillRect(x, y, size, size * 0.6);
        }

        // Simple table/desk shape
        if (this.seededRandom(100) > 0.4) {
            ctx.fillStyle = palette.walls[1];
            const tableX = width * 0.3;
            const tableY = height * 0.55;
            ctx.fillRect(tableX, tableY, width * 0.4, height * 0.08);
            ctx.fillRect(tableX + 20, tableY, 10, height * 0.15);
            ctx.fillRect(tableX + width * 0.4 - 30, tableY, 10, height * 0.15);
        }
    }

    // Render lighting overlay
    renderLighting(type) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        switch (type) {
            case 'dim':
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillRect(0, 0, width, height);
                break;

            case 'very_dim':
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(0, 0, width, height);
                break;

            case 'dark':
                ctx.fillStyle = 'rgba(0, 0, 20, 0.4)';
                ctx.fillRect(0, 0, width, height);
                break;

            case 'harsh':
                // Add harsh light from one side
                const gradient = ctx.createLinearGradient(0, 0, width, 0);
                gradient.addColorStop(0, 'rgba(255, 255, 200, 0.1)');
                gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, width, height);
                break;

            case 'bright':
            default:
                // No additional overlay for bright scenes
                break;
        }
    }

    // Render character portrait
    renderCharacter(character) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        const style = PORTRAIT_STYLES[character.faction] || PORTRAIT_STYLES.civilian;

        // Character position (right side)
        const charX = width * 0.65;
        const charY = height * 0.3;
        const charScale = 1.5;

        // Body/torso
        ctx.fillStyle = style.uniform || style.clothes;
        ctx.beginPath();
        ctx.moveTo(charX, charY + 100 * charScale);
        ctx.lineTo(charX - 60 * charScale, charY + 250 * charScale);
        ctx.lineTo(charX + 100 * charScale, charY + 250 * charScale);
        ctx.closePath();
        ctx.fill();

        // Head
        ctx.fillStyle = '#e8d5b7';
        ctx.beginPath();
        ctx.ellipse(charX + 20 * charScale, charY + 60 * charScale, 35 * charScale, 45 * charScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hat (if any)
        if (style.hat) {
            ctx.fillStyle = style.hat;
            ctx.beginPath();
            ctx.ellipse(charX + 20 * charScale, charY + 25 * charScale, 40 * charScale, 20 * charScale, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(charX - 30 * charScale, charY + 15 * charScale, 80 * charScale, 25 * charScale);
        }

        // Simple face features
        ctx.fillStyle = '#2c3e50';

        // Eyes
        ctx.fillRect(charX, charY + 50 * charScale, 8 * charScale, 8 * charScale);
        ctx.fillRect(charX + 25 * charScale, charY + 50 * charScale, 8 * charScale, 8 * charScale);

        // Name tag
        if (character.name) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(charX - 30 * charScale, charY + 270 * charScale, 120 * charScale, 30);

            ctx.fillStyle = '#c9a227';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(character.name, charX + 30 * charScale, charY + 290 * charScale);
        }
    }

    // Render letterbox bars
    renderLetterbox() {
        const ctx = this.ctx;
        const s = STYLES.letterbox;

        ctx.fillStyle = s.color;
        ctx.fillRect(0, 0, this.canvas.width, s.height);
        ctx.fillRect(0, this.canvas.height - s.height, this.canvas.width, s.height);
    }

    // Render title and subtitle
    renderTitle(title, subtitle = '') {
        const ctx = this.ctx;
        const y = STYLES.letterbox.height + 40;

        ctx.fillStyle = STYLES.title.color;
        ctx.font = STYLES.title.font;
        ctx.textAlign = 'center';
        ctx.fillText(title, this.canvas.width / 2, y);

        if (subtitle) {
            ctx.fillStyle = STYLES.subtitle.color;
            ctx.font = STYLES.subtitle.font;
            ctx.fillText(subtitle, this.canvas.width / 2, y + 25);
        }
    }

    // Render frame text
    renderText(text) {
        const ctx = this.ctx;
        const y = this.canvas.height - STYLES.letterbox.height - 80;
        const maxWidth = this.canvas.width - 100;

        // Background box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(40, y - 30, this.canvas.width - 80, 100);

        // Border
        ctx.strokeStyle = '#c9a227';
        ctx.lineWidth = 2;
        ctx.strokeRect(40, y - 30, this.canvas.width - 80, 100);

        // Text with reveal
        const visibleText = text.substring(0, Math.floor(this.textRevealIndex));

        ctx.fillStyle = STYLES.text.color;
        ctx.font = STYLES.text.font;
        ctx.textAlign = 'left';

        // Word wrap
        const words = visibleText.split(' ');
        let line = '';
        let lineY = y;

        for (const word of words) {
            const testLine = line + (line ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth && line) {
                ctx.fillText(line, 60, lineY);
                line = word;
                lineY += STYLES.text.lineHeight;
            } else {
                line = testLine;
            }
        }

        if (line) {
            ctx.fillText(line, 60, lineY);
        }

        // Blinking cursor during reveal
        if (this.textRevealIndex < text.length) {
            const cursorX = 60 + ctx.measureText(line).width + 2;
            if (Math.floor(Date.now() / 300) % 2 === 0) {
                ctx.fillRect(cursorX, lineY - 12, 10, 14);
            }
        }
    }

    // Render controls hint
    renderControlsHint() {
        const ctx = this.ctx;
        const y = this.canvas.height - 25;

        ctx.fillStyle = '#666';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Press SPACE to continue • ESC to skip', this.canvas.width / 2, y);
    }

    // Check if cutscene is active
    isActive() {
        return this.currentCutscene !== null;
    }

    // Handle user input
    handleInput(key) {
        if (!this.currentCutscene) return false;

        if (key === ' ' || key === 'Enter') {
            // If text still revealing, complete it
            const frame = this.getCurrentFrame();
            if (frame?.text && this.textRevealIndex < frame.text.length) {
                this.textRevealIndex = frame.text.length;
            } else {
                this.nextFrame();
            }
            return true;
        }

        if (key === 'Escape') {
            this.skip();
            return true;
        }

        return false;
    }
}
