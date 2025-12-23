// DebugOverlay - Debug display for games
// Shows log messages, real-time values, and debug indicator

const MAX_LOG_ENTRIES = 100;

function getDebugFlag() {
    const params = new URLSearchParams(window.location.search);
    const urlFlag = params.get('debug');
    if (urlFlag === '1' || urlFlag === 'true') {
        return true;
    }
    return sessionStorage.getItem('debugMode') === 'true' ||
        localStorage.getItem('debugMode') === 'true';
}

export class DebugOverlay {
    constructor() {
        this.enabled = getDebugFlag();
        this.logs = [];
        this.realtimeValue = '';

        // DOM elements
        this.container = null;
        this.logDisplay = null;
        this.realtimeDisplay = null;
        this.modeIndicator = null;
        this.fullLogOverlay = null;
        this.fullLogContent = null;

        if (this.enabled) {
            this.createUI();
        }
    }

    createUI() {
        // Main container at bottom of screen
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            padding: 8px;
            pointer-events: none;
            z-index: 9998;
            font-family: monospace;
            font-size: 10px;
        `;

        // Log display (left)
        this.logDisplay = document.createElement('div');
        this.logDisplay.style.cssText = `
            color: rgba(255, 255, 255, 0.7);
            text-align: left;
            max-width: 40%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            pointer-events: auto;
            cursor: pointer;
        `;
        this.logDisplay.addEventListener('click', () => this.showFullLog());

        // Real-time value display (center)
        this.realtimeDisplay = document.createElement('div');
        this.realtimeDisplay.style.cssText = `
            color: rgba(255, 255, 0, 0.8);
            text-align: center;
            flex: 1;
        `;

        // Debug mode indicator (right)
        this.modeIndicator = document.createElement('div');
        this.modeIndicator.textContent = 'debug mode';
        this.modeIndicator.style.cssText = `
            color: rgba(255, 255, 255, 0.5);
            text-align: right;
        `;

        this.container.appendChild(this.logDisplay);
        this.container.appendChild(this.realtimeDisplay);
        this.container.appendChild(this.modeIndicator);
        document.body.appendChild(this.container);

        // Full log overlay (hidden by default)
        this.createFullLogOverlay();
    }

    createFullLogOverlay() {
        this.fullLogOverlay = document.createElement('div');
        this.fullLogOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10000;
            display: none;
            flex-direction: column;
            padding: 16px;
            font-family: monospace;
            font-size: 12px;
        `;

        // Header with close button
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            color: white;
        `;

        const title = document.createElement('span');
        title.textContent = 'Debug Log';
        title.style.fontWeight = 'bold';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = `
            background: #444;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        `;
        closeBtn.addEventListener('click', () => this.hideFullLog());

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Log content area
        this.fullLogContent = document.createElement('div');
        this.fullLogContent.style.cssText = `
            flex: 1;
            overflow-y: auto;
            color: rgba(255, 255, 255, 0.8);
            line-height: 1.5;
        `;

        this.fullLogOverlay.appendChild(header);
        this.fullLogOverlay.appendChild(this.fullLogContent);
        document.body.appendChild(this.fullLogOverlay);
    }

    // Log a debug message
    log(message) {
        if (!this.enabled) return;

        const timestamp = new Date().toLocaleTimeString();
        const entry = { timestamp, message };
        this.logs.push(entry);

        // Trim old entries
        if (this.logs.length > MAX_LOG_ENTRIES) {
            this.logs.shift();
        }

        // Update display with latest message
        this.logDisplay.textContent = message;
    }

    // Set the real-time value (not logged)
    setValue(value) {
        if (!this.enabled) return;
        this.realtimeValue = value;
        this.realtimeDisplay.textContent = value;
    }

    // Show full log overlay
    showFullLog() {
        if (!this.enabled || !this.fullLogOverlay) return;

        // Populate log content
        this.fullLogContent.innerHTML = '';
        this.logs.forEach(entry => {
            const line = document.createElement('div');
            line.textContent = `[${entry.timestamp}] ${entry.message}`;
            this.fullLogContent.appendChild(line);
        });

        // Scroll to bottom
        this.fullLogContent.scrollTop = this.fullLogContent.scrollHeight;

        this.fullLogOverlay.style.display = 'flex';
    }

    // Hide full log overlay
    hideFullLog() {
        if (this.fullLogOverlay) {
            this.fullLogOverlay.style.display = 'none';
        }
    }

    // Check if debug mode is enabled
    isEnabled() {
        return this.enabled;
    }

    // Cleanup
    destroy() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        if (this.fullLogOverlay) {
            this.fullLogOverlay.remove();
            this.fullLogOverlay = null;
        }
    }
}

// Global debug instance for easy access
let globalDebug = null;

export function getDebugOverlay() {
    if (!globalDebug) {
        globalDebug = new DebugOverlay();
    }
    return globalDebug;
}

// Convenience functions
export function debugLog(message) {
    getDebugOverlay().log(message);
}

export function debugSetValue(value) {
    getDebugOverlay().setValue(value);
}

export function isDebugEnabled() {
    return getDebugFlag();
}
