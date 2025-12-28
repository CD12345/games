// Camera Controller - Isometric view with pan and zoom controls

import { MAP_WIDTH, MAP_HEIGHT, RENDER } from '../config.js';
import { hexToPixel } from '../core/HexMath.js';

export class CameraController {
    constructor(THREE, camera, domElement) {
        this.THREE = THREE;
        this.camera = camera;
        this.domElement = domElement;

        // Camera target (look-at point)
        this.target = new THREE.Vector3();

        // Camera parameters
        this.distance = 80;
        this.azimuth = Math.PI / 4;     // 45 degrees - isometric angle
        this.elevation = Math.PI / 4;    // 45 degrees - looking down

        // Limits
        this.minDistance = 20;
        this.maxDistance = 200;
        this.minElevation = Math.PI / 6;  // 30 degrees
        this.maxElevation = Math.PI / 2.5; // ~72 degrees

        // Pan bounds (based on map size in world coordinates)
        const mapCenter = hexToPixel({ q: MAP_WIDTH / 2, r: MAP_HEIGHT / 2 });
        this.panBounds = {
            minX: 0,
            maxX: mapCenter.x * 2,
            minZ: 0,
            maxZ: mapCenter.z * 2
        };

        // Initialize target to map center
        this.target.set(mapCenter.x, 0, mapCenter.z);

        // Input state
        this.isDragging = false;
        this.isPinching = false;
        this.lastPointer = { x: 0, y: 0 };
        this.lastPinchDistance = 0;
        this.pointers = new Map();

        // Track if current touch was a drag (moved more than tap threshold)
        this.wasDragged = false;
        this.touchStartPos = { x: 0, y: 0 };
        this.TAP_THRESHOLD = 15; // pixels

        // Smoothing
        this.targetSmooth = this.target.clone();
        this.distanceSmooth = this.distance;

        this.setupEventListeners();
        this.update();
    }

    setupEventListeners() {
        const el = this.domElement;

        // Mouse events
        el.addEventListener('mousedown', (e) => this.onMouseDown(e));
        el.addEventListener('mousemove', (e) => this.onMouseMove(e));
        el.addEventListener('mouseup', () => this.onMouseUp());
        el.addEventListener('mouseleave', () => this.onMouseUp());
        el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // Touch events
        el.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        el.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        el.addEventListener('touchend', (e) => this.onTouchEnd(e));
        el.addEventListener('touchcancel', (e) => this.onTouchEnd(e));

        // Prevent context menu on right-click
        el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    onMouseDown(e) {
        if (e.button === 0 || e.button === 2) { // Left or right click
            this.isDragging = true;
            this.lastPointer = { x: e.clientX, y: e.clientY };
        }
    }

    onMouseMove(e) {
        if (!this.isDragging) return;

        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        this.lastPointer = { x: e.clientX, y: e.clientY };

        this.pan(dx, dy);
    }

    onMouseUp() {
        this.isDragging = false;
    }

    onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 1.1 : 0.9;
        this.zoom(delta);
    }

    onTouchStart(e) {
        e.preventDefault();

        for (const touch of e.changedTouches) {
            this.pointers.set(touch.identifier, {
                x: touch.clientX,
                y: touch.clientY
            });
        }

        if (this.pointers.size === 1) {
            this.isDragging = true;
            this.wasDragged = false; // Reset drag detection
            const touch = e.touches[0];
            this.lastPointer = { x: touch.clientX, y: touch.clientY };
            this.touchStartPos = { x: touch.clientX, y: touch.clientY };
        } else if (this.pointers.size === 2) {
            this.isDragging = false;
            this.wasDragged = true; // Multi-touch counts as drag
            this.isPinching = true;
            this.lastPinchDistance = this.getPinchDistance(e.touches);
        }
    }

    onTouchMove(e) {
        e.preventDefault();

        // Update pointer positions
        for (const touch of e.changedTouches) {
            if (this.pointers.has(touch.identifier)) {
                this.pointers.set(touch.identifier, {
                    x: touch.clientX,
                    y: touch.clientY
                });
            }
        }

        if (this.isPinching && e.touches.length >= 2) {
            // Pinch zoom
            const pinchDistance = this.getPinchDistance(e.touches);
            const delta = this.lastPinchDistance / pinchDistance;
            this.zoom(delta);
            this.lastPinchDistance = pinchDistance;
        } else if (this.isDragging && e.touches.length === 1) {
            // Single finger pan
            const touch = e.touches[0];
            const dx = touch.clientX - this.lastPointer.x;
            const dy = touch.clientY - this.lastPointer.y;
            this.lastPointer = { x: touch.clientX, y: touch.clientY };
            this.pan(dx, dy);

            // Check if we've exceeded tap threshold
            if (!this.wasDragged) {
                const totalDx = touch.clientX - this.touchStartPos.x;
                const totalDy = touch.clientY - this.touchStartPos.y;
                const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
                if (totalDist > this.TAP_THRESHOLD) {
                    this.wasDragged = true;
                }
            }
        }
    }

    onTouchEnd(e) {
        for (const touch of e.changedTouches) {
            this.pointers.delete(touch.identifier);
        }

        if (this.pointers.size < 2) {
            this.isPinching = false;
        }
        if (this.pointers.size === 0) {
            this.isDragging = false;
        } else if (this.pointers.size === 1) {
            // Continue with single finger pan
            this.isDragging = true;
            const remaining = Array.from(this.pointers.values())[0];
            this.lastPointer = { x: remaining.x, y: remaining.y };
        }
    }

    getPinchDistance(touches) {
        if (touches.length < 2) return 0;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    pan(dx, dy) {
        // Calculate pan speed based on distance (further = faster pan)
        const panSpeed = this.distance * 0.003;

        // Convert screen delta to world space delta
        // Account for camera azimuth angle
        const cosAz = Math.cos(this.azimuth);
        const sinAz = Math.sin(this.azimuth);

        const worldDx = (-dx * cosAz - dy * sinAz) * panSpeed;
        const worldDz = (dx * sinAz - dy * cosAz) * panSpeed;

        this.target.x = this.clamp(this.target.x + worldDx, this.panBounds.minX, this.panBounds.maxX);
        this.target.z = this.clamp(this.target.z + worldDz, this.panBounds.minZ, this.panBounds.maxZ);
    }

    zoom(delta) {
        this.distance = this.clamp(
            this.distance * delta,
            this.minDistance,
            this.maxDistance
        );
    }

    // Move camera to focus on a specific hex
    focusOnHex(q, r, animate = true) {
        const pos = hexToPixel({ q, r });

        // Set the target position - targetSmooth will lerp toward it
        this.target.set(pos.x, 0, pos.z);

        if (!animate) {
            // Snap immediately
            this.targetSmooth.copy(this.target);
        }
    }

    // Move camera to show player's base
    focusOnPlayer(playerNumber) {
        const q = playerNumber === 1 ? MAP_WIDTH * 0.15 : MAP_WIDTH * 0.85;
        const r = MAP_HEIGHT / 2;
        this.focusOnHex(q, r);
    }

    update(deltaTime = 0.016) {
        // Smooth interpolation
        const smoothFactor = 1 - Math.pow(0.01, deltaTime);
        this.targetSmooth.lerp(this.target, smoothFactor);
        this.distanceSmooth += (this.distance - this.distanceSmooth) * smoothFactor;

        // Calculate camera position from spherical coordinates
        const x = this.targetSmooth.x + this.distanceSmooth * Math.cos(this.elevation) * Math.sin(this.azimuth);
        const y = this.targetSmooth.y + this.distanceSmooth * Math.sin(this.elevation);
        const z = this.targetSmooth.z + this.distanceSmooth * Math.cos(this.elevation) * Math.cos(this.azimuth);

        this.camera.position.set(x, y, z);
        this.camera.lookAt(this.targetSmooth);
    }

    // Get the current look-at target
    getTarget() {
        return this.target.clone();
    }

    // Check if the last touch interaction was a tap (not a drag)
    wasTap() {
        return !this.wasDragged;
    }

    // Set distance directly
    setDistance(distance) {
        this.distance = this.clamp(distance, this.minDistance, this.maxDistance);
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    dispose() {
        // Event listeners are on the DOM element, they'll be cleaned up when element is removed
        this.pointers.clear();
    }
}
