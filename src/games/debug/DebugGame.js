// Debug Game - Display network stats, device sensors, and system info

import { GameEngine } from '../../engine/GameEngine.js';
import { ProximitySync } from '../../engine/ProximitySync.js';
import { onMessage, offMessage, sendMessage } from '../../core/peer.js';
import { DEBUG_CONFIG, getInitialState } from './config.js';

export class DebugGame extends GameEngine {
    constructor(canvas, gameCode, isHost, playerNumber) {
        super(canvas);

        this.gameCode = gameCode;
        this.isHost = isHost;
        this.playerNumber = playerNumber;

        // State
        this.state = getInitialState();

        // Network stats
        this.packetsSent = 0;
        this.packetsReceived = 0;
        this.latency = 0;
        this.lastPingTime = 0;
        this.pingInterval = null;

        // Sensor data
        this.accelerometer = { x: null, y: null, z: null };
        this.gyroscope = { alpha: null, beta: null, gamma: null };
        this.proximityDistance = null;
        this.proximityAvailable = null; // null = pending, true/false = result

        // Proximity sync
        this.proximity = new ProximitySync(isHost);

        // Input tracking
        this.mousePos = { x: null, y: null };
        this.touchPos = { x: null, y: null };
        this.touchActive = false;

        // Device info
        this.deviceInfo = this.parseDeviceInfo();
        this.browserInfo = this.parseBrowserInfo();

        // Sync timing
        this.lastSyncTime = 0;
        this.syncInterval = 1000 / DEBUG_CONFIG.syncRate;

        // Bind handlers
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleMotion = this.handleMotion.bind(this);
        this.handleOrientation = this.handleOrientation.bind(this);
    }

    async initialize() {
        // Set up message handlers for packet counting
        onMessage('debug_state', (data) => {
            this.packetsReceived++;
            if (data) {
                this.state = { ...this.state, ...data };
            }
        });

        onMessage('debug_ping', (data) => {
            this.packetsReceived++;
            sendMessage('debug_pong', { timestamp: data.timestamp });
            this.packetsSent++;
        });

        onMessage('debug_pong', (data) => {
            this.packetsReceived++;
            if (data && data.timestamp) {
                this.latency = Date.now() - data.timestamp;
            }
        });

        // Start ping interval for latency measurement
        this.pingInterval = setInterval(() => {
            this.lastPingTime = Date.now();
            sendMessage('debug_ping', { timestamp: this.lastPingTime });
            this.packetsSent++;
        }, 1000);

        // Set up proximity sync
        this.proximity.onDistanceChange = (distance) => {
            this.proximityDistance = distance;
        };

        // Start proximity (requests mic permission)
        const proximityPromise = this.proximity.start().catch((error) => {
            console.log('Proximity error:', error?.message || error);
            return false;
        });

        proximityPromise.then((available) => {
            this.proximityAvailable = available;
            console.log('Proximity available:', available);
        });

        // Set up sensor and input listeners
        this.setupSensors();
        this.setupInputTracking();
    }

    setupInputTracking() {
        // Mouse tracking
        this.canvas.addEventListener('mousemove', this.handleMouseMove);

        // Touch tracking
        this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: true });
        this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: true });
        this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: true });
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd, { passive: true });
    }

    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mousePos = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    handleTouchStart(event) {
        this.touchActive = true;
        if (event.touches.length > 0) {
            const rect = this.canvas.getBoundingClientRect();
            const touch = event.touches[0];
            this.touchPos = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
        }
    }

    handleTouchMove(event) {
        if (event.touches.length > 0) {
            const rect = this.canvas.getBoundingClientRect();
            const touch = event.touches[0];
            this.touchPos = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
        }
    }

    handleTouchEnd() {
        this.touchActive = false;
    }

    setupSensors() {
        // Accelerometer via DeviceMotionEvent
        if (window.DeviceMotionEvent) {
            // Request permission on iOS 13+
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                DeviceMotionEvent.requestPermission()
                    .then(permission => {
                        if (permission === 'granted') {
                            window.addEventListener('devicemotion', this.handleMotion);
                        }
                    })
                    .catch(() => {});
            } else {
                window.addEventListener('devicemotion', this.handleMotion);
            }
        }

        // Gyroscope via DeviceOrientationEvent
        if (window.DeviceOrientationEvent) {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(permission => {
                        if (permission === 'granted') {
                            window.addEventListener('deviceorientation', this.handleOrientation);
                        }
                    })
                    .catch(() => {});
            } else {
                window.addEventListener('deviceorientation', this.handleOrientation);
            }
        }
    }

    handleMotion(event) {
        const accel = event.accelerationIncludingGravity || event.acceleration;
        if (accel) {
            this.accelerometer = {
                x: accel.x,
                y: accel.y,
                z: accel.z
            };
        }
    }

    handleOrientation(event) {
        this.gyroscope = {
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma
        };
    }

    parseDeviceInfo() {
        const ua = navigator.userAgent;
        let device = 'Unknown';
        let os = 'Unknown';

        // iOS detection
        if (/iPad/.test(ua)) {
            device = 'iPad';
            const match = ua.match(/OS (\d+[_\.]\d+)/);
            os = match ? 'iOS ' + match[1].replace('_', '.') : 'iOS';
        } else if (/iPhone/.test(ua)) {
            device = 'iPhone';
            const match = ua.match(/OS (\d+[_\.]\d+)/);
            os = match ? 'iOS ' + match[1].replace('_', '.') : 'iOS';
        } else if (/Android/.test(ua)) {
            device = 'Android Device';
            const match = ua.match(/Android (\d+\.?\d*)/);
            os = match ? 'Android ' + match[1] : 'Android';
            // Try to get device model
            const modelMatch = ua.match(/;\s*([^;]+)\s+Build\//);
            if (modelMatch) {
                device = modelMatch[1].trim();
            }
        } else if (/Windows/.test(ua)) {
            device = 'Windows PC';
            if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
            else if (/Windows NT 6.3/.test(ua)) os = 'Windows 8.1';
            else if (/Windows NT 6.2/.test(ua)) os = 'Windows 8';
            else if (/Windows NT 6.1/.test(ua)) os = 'Windows 7';
            else os = 'Windows';
        } else if (/Mac OS X/.test(ua)) {
            device = 'Mac';
            const match = ua.match(/Mac OS X (\d+[_\.]\d+)/);
            os = match ? 'macOS ' + match[1].replace('_', '.') : 'macOS';
        } else if (/Linux/.test(ua)) {
            device = 'Linux PC';
            os = 'Linux';
        }

        return { device, os };
    }

    parseBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        let version = '';

        if (/Edg\//.test(ua)) {
            browser = 'Edge';
            const match = ua.match(/Edg\/(\d+)/);
            version = match ? match[1] : '';
        } else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) {
            browser = 'Chrome';
            const match = ua.match(/Chrome\/(\d+)/);
            version = match ? match[1] : '';
        } else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
            browser = 'Safari';
            const match = ua.match(/Version\/(\d+\.?\d*)/);
            version = match ? match[1] : '';
        } else if (/Firefox\//.test(ua)) {
            browser = 'Firefox';
            const match = ua.match(/Firefox\/(\d+)/);
            version = match ? match[1] : '';
        }

        return { browser, version };
    }

    update(deltaTime) {
        // Send state updates periodically
        const now = Date.now();
        if (now - this.lastSyncTime >= this.syncInterval) {
            this.lastSyncTime = now;
            sendMessage('debug_state', {
                stats: {
                    packetsSent: this.packetsSent,
                    packetsReceived: this.packetsReceived,
                    latency: this.latency
                }
            });
            this.packetsSent++;
        }
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Dark background
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, 0, w, h);

        // Text styling
        const fontSize = Math.floor(w * 0.04);
        const smallFontSize = Math.floor(w * 0.032);
        const lineHeight = fontSize * 1.6;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        let y = w * 0.06;
        const x = w * 0.06;

        // Title
        ctx.fillStyle = '#00ff88';
        ctx.font = `bold ${fontSize * 1.2}px monospace`;
        ctx.fillText('Debug Stats', x, y);
        y += lineHeight * 1.5;

        // Role
        ctx.fillStyle = '#888';
        ctx.font = `${smallFontSize}px monospace`;
        ctx.fillText(`Role: ${this.isHost ? 'Host' : 'Guest'} (P${this.playerNumber})`, x, y);
        y += lineHeight;
        ctx.fillText(`Code: ${this.gameCode}`, x, y);
        y += lineHeight * 1.3;

        // Section: Network
        this.renderSection(ctx, x, y, 'NETWORK', fontSize);
        y += lineHeight;

        ctx.fillStyle = '#ccc';
        ctx.font = `${smallFontSize}px monospace`;
        ctx.fillText(`Packets Sent: ${this.packetsSent}`, x, y);
        y += lineHeight * 0.9;
        ctx.fillText(`Packets Recv: ${this.packetsReceived}`, x, y);
        y += lineHeight * 0.9;
        ctx.fillText(`Latency: ${this.latency}ms`, x, y);
        y += lineHeight * 1.3;

        // Section: Proximity
        this.renderSection(ctx, x, y, 'PROXIMITY', fontSize);
        y += lineHeight;

        ctx.font = `${smallFontSize}px monospace`;
        if (this.proximityAvailable === null) {
            ctx.fillStyle = '#aa8800';
            ctx.fillText('Distance: initializing...', x, y);
        } else if (this.proximityAvailable && this.proximityDistance !== null) {
            ctx.fillStyle = '#ccc';
            ctx.fillText(`Distance: ${this.proximityDistance.toFixed(1)} ft`, x, y);
        } else {
            ctx.fillStyle = '#666';
            ctx.fillText('Distance: unavailable', x, y);
        }
        y += lineHeight * 1.3;

        // Section: Input
        this.renderSection(ctx, x, y, 'INPUT', fontSize);
        y += lineHeight;

        ctx.font = `${smallFontSize}px monospace`;
        ctx.fillStyle = '#ccc';
        if (this.mousePos.x !== null) {
            ctx.fillText(`Mouse: ${Math.round(this.mousePos.x)}, ${Math.round(this.mousePos.y)}`, x, y);
        } else {
            ctx.fillStyle = '#666';
            ctx.fillText('Mouse: n/a', x, y);
        }
        y += lineHeight * 0.9;

        if (this.touchActive && this.touchPos.x !== null) {
            ctx.fillStyle = '#ccc';
            ctx.fillText(`Touch: ${Math.round(this.touchPos.x)}, ${Math.round(this.touchPos.y)}`, x, y);
        } else if (this.touchPos.x !== null) {
            ctx.fillStyle = '#666';
            ctx.fillText(`Touch: ${Math.round(this.touchPos.x)}, ${Math.round(this.touchPos.y)} (up)`, x, y);
        } else {
            ctx.fillStyle = '#666';
            ctx.fillText('Touch: n/a', x, y);
        }
        y += lineHeight * 1.3;

        // Section: Accelerometer
        this.renderSection(ctx, x, y, 'ACCELEROMETER', fontSize);
        y += lineHeight;

        ctx.font = `${smallFontSize}px monospace`;
        if (this.accelerometer.x !== null) {
            ctx.fillStyle = '#ccc';
            ctx.fillText(`X: ${this.formatNum(this.accelerometer.x)}`, x, y);
            y += lineHeight * 0.9;
            ctx.fillText(`Y: ${this.formatNum(this.accelerometer.y)}`, x, y);
            y += lineHeight * 0.9;
            ctx.fillText(`Z: ${this.formatNum(this.accelerometer.z)}`, x, y);
        } else {
            ctx.fillStyle = '#666';
            ctx.fillText('unavailable', x, y);
        }
        y += lineHeight * 1.3;

        // Section: Gyroscope
        this.renderSection(ctx, x, y, 'GYROSCOPE', fontSize);
        y += lineHeight;

        ctx.font = `${smallFontSize}px monospace`;
        if (this.gyroscope.alpha !== null) {
            ctx.fillStyle = '#ccc';
            ctx.fillText(`Alpha: ${this.formatNum(this.gyroscope.alpha)}`, x, y);
            y += lineHeight * 0.9;
            ctx.fillText(`Beta:  ${this.formatNum(this.gyroscope.beta)}`, x, y);
            y += lineHeight * 0.9;
            ctx.fillText(`Gamma: ${this.formatNum(this.gyroscope.gamma)}`, x, y);
        } else {
            ctx.fillStyle = '#666';
            ctx.fillText('unavailable', x, y);
        }
        y += lineHeight * 1.3;

        // Section: Device
        this.renderSection(ctx, x, y, 'DEVICE', fontSize);
        y += lineHeight;

        ctx.fillStyle = '#ccc';
        ctx.font = `${smallFontSize}px monospace`;
        ctx.fillText(`${this.deviceInfo.device}`, x, y);
        y += lineHeight * 0.9;
        ctx.fillText(`${this.deviceInfo.os}`, x, y);
        y += lineHeight * 1.3;

        // Section: Browser
        this.renderSection(ctx, x, y, 'BROWSER', fontSize);
        y += lineHeight;

        ctx.fillStyle = '#ccc';
        ctx.font = `${smallFontSize}px monospace`;
        const browserStr = this.browserInfo.version
            ? `${this.browserInfo.browser} ${this.browserInfo.version}`
            : this.browserInfo.browser;
        ctx.fillText(browserStr, x, y);
    }

    renderSection(ctx, x, y, title, fontSize) {
        ctx.fillStyle = '#00aaff';
        ctx.font = `bold ${fontSize * 0.85}px monospace`;
        ctx.fillText(title, x, y);
    }

    formatNum(num) {
        if (num === null || num === undefined) return 'n/a';
        return num.toFixed(2).padStart(8, ' ');
    }

    destroy() {
        super.destroy();

        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        // Stop proximity
        this.proximity.stop();

        // Remove input listeners
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);

        // Remove sensor listeners
        window.removeEventListener('devicemotion', this.handleMotion);
        window.removeEventListener('deviceorientation', this.handleOrientation);

        offMessage('debug_state');
        offMessage('debug_ping');
        offMessage('debug_pong');
    }
}
