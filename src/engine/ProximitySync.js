// ProximitySync - Network coordination for proximity measurement
// Coordinates chirp timing between peers to measure distance

import { onMessage, offMessage, sendMessage } from '../core/peer.js';
import { ProximityDetector } from './ProximityDetector.js';
import { debugLog } from '../ui/DebugOverlay.js';

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

        // Network latency compensation
        this.networkLatency = 0;
        this.latencyPingTime = 0;

        // Callbacks
        this.onDistanceChange = null;
    }

    async start() {
        // Start the detector
        const available = await this.detector.start();

        // Set up detector callbacks (only host measures distance)
        if (this.isHost) {
            this.detector.onDistanceUpdate = (distance) => {
                this.localDistance = distance;
                this.updateConsensus();
                // Share our measurement with peer
                sendMessage('proximity_update', { distance });
            };
        }

        // Guest doesn't need onChirpDetected - it just emits when pinged

        // Listen for peer's proximity updates
        onMessage('proximity_update', (data) => {
            if (data && typeof data.distance === 'number') {
                this.remoteDistance = data.distance;
                this.updateConsensus();
            }
        });

        // Listen for ping requests (host initiates)
        onMessage('proximity_ping', (data) => {
            // Respond immediately for latency measurement
            sendMessage('proximity_pong', { timestamp: data?.timestamp });
            // Then emit chirp
            if (this.detector.getIsAvailable()) {
                this.detector.emitChirp();
            }
        });

        // Listen for pong responses (for latency measurement)
        onMessage('proximity_pong', (data) => {
            if (data?.timestamp && this.latencyPingTime > 0) {
                const rtt = performance.now() - this.latencyPingTime;
                this.networkLatency = rtt / 2; // One-way latency
                this.detector.setNetworkLatency(this.networkLatency);
                debugLog(`Network latency: ${this.networkLatency.toFixed(0)}ms`);
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
        offMessage('proximity_pong');

        this.detector.stop();
        console.log('ProximitySync stopped');
    }

    // Host periodically initiates distance measurement
    // Flow: Host sends message -> Guest chirps -> Host detects chirp
    // Distance = (detection_time - send_time - network_latency) * speed_of_sound
    startPinging() {
        this.pingInterval = setInterval(() => {
            if (!this.isRunning) return;

            // Record send time and set pending BEFORE sending
            this.latencyPingTime = performance.now();
            this.detector.startMeasurement(this.latencyPingTime);

            // Tell guest to chirp NOW
            sendMessage('proximity_ping', { timestamp: this.latencyPingTime });

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
