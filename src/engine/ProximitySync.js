// ProximitySync - Network coordination for proximity measurement
// Coordinates chirp timing between peers to measure distance

import { onMessage, offMessage, sendMessage } from '../core/peer.js';
import { ProximityDetector } from './ProximityDetector.js';

const PING_INTERVAL = 500;          // Send ping every 500ms
const DEFAULT_DISTANCE = 6;         // Default distance in feet when unavailable

export class ProximitySync {
    constructor(isHost) {
        this.isHost = isHost;
        this.detector = new ProximityDetector();

        this.isRunning = false;
        this.pingInterval = null;

        // Distance state
        this.localDistance = DEFAULT_DISTANCE;
        this.remoteDistance = DEFAULT_DISTANCE;
        this.consensusDistance = DEFAULT_DISTANCE;

        // Callbacks
        this.onDistanceChange = null;
    }

    async start() {
        // Start the detector
        const available = await this.detector.start();

        // Set up detector callbacks
        this.detector.onDistanceUpdate = (distance) => {
            this.localDistance = distance;
            this.updateConsensus();
            // Share our measurement with peer
            sendMessage('proximity_update', { distance });
        };

        this.detector.onChirpDetected = () => {
            // When we detect a chirp, emit our own response chirp
            // Small delay to avoid collision
            setTimeout(() => {
                if (this.isRunning) {
                    this.detector.emitChirp();
                }
            }, 50);
        };

        // Listen for peer's proximity updates
        onMessage('proximity_update', (data) => {
            if (data && typeof data.distance === 'number') {
                this.remoteDistance = data.distance;
                this.updateConsensus();
            }
        });

        // Listen for ping requests (host initiates)
        onMessage('proximity_ping', () => {
            // Respond with a chirp
            if (this.detector.getIsAvailable()) {
                this.detector.emitChirp();
            }
        });

        this.isRunning = true;

        // Host initiates periodic pings
        if (this.isHost && available) {
            this.startPinging();
        }

        console.log('ProximitySync started, available:', available);
        return available;
    }

    stop() {
        this.isRunning = false;

        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        offMessage('proximity_update');
        offMessage('proximity_ping');

        this.detector.stop();
        console.log('ProximitySync stopped');
    }

    // Host periodically initiates ping-pong chirp sequence
    startPinging() {
        this.pingInterval = setInterval(() => {
            if (!this.isRunning) return;

            // Tell guest we're about to chirp
            sendMessage('proximity_ping', {});

            // Emit our chirp after short delay
            setTimeout(() => {
                if (this.isRunning && this.detector.getIsAvailable()) {
                    this.detector.emitChirp();
                }
            }, 10);

        }, PING_INTERVAL);
    }

    // Update consensus distance from both measurements
    updateConsensus() {
        // Average both measurements if both available
        if (this.detector.getIsAvailable()) {
            // Weight local measurement more if remote seems stale
            this.consensusDistance = (this.localDistance + this.remoteDistance) / 2;
        } else {
            // Use remote if local unavailable
            this.consensusDistance = this.remoteDistance;
        }

        // Clamp to reasonable range
        this.consensusDistance = Math.max(0.5, Math.min(50, this.consensusDistance));

        if (this.onDistanceChange) {
            this.onDistanceChange(this.consensusDistance);
        }
    }

    // Get current distance estimate
    getDistance() {
        return this.consensusDistance;
    }

    // Check if proximity detection is available
    isAvailable() {
        return this.detector.getIsAvailable();
    }
}
