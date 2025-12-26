// ProximitySync - Network coordination for proximity measurement using DS-TWR
// Uses Double-Sided Two-Way Ranging for accurate distance measurement

import { onMessage, offMessage, sendMessage } from '../core/peer.js';
import { ProximityDetector } from './ProximityDetector.js';
import { debugLog } from '../ui/DebugOverlay.js';

const RANGING_INTERVAL = 1000;      // Start ranging every 1 second
const DEFAULT_DISTANCE = 6;         // Default distance in feet when unavailable

export class ProximitySync {
    constructor(isHost) {
        this.isHost = isHost;
        this.detector = new ProximityDetector();

        this.isRunning = false;
        this.rangingInterval = null;

        // Distance state
        this.consensusDistance = DEFAULT_DISTANCE;

        // Callbacks
        this.onDistanceChange = null;
    }

    async start() {
        // Start the detector
        const available = await this.detector.start();

        // Set up detector callbacks
        this.detector.onDistanceUpdate = (distance) => {
            this.consensusDistance = distance;
            if (this.onDistanceChange) {
                this.onDistanceChange(distance);
            }
        };

        // Wait for noise floor calibration, then run loopback calibration
        this.detector.onCalibrated = async (noiseFloor) => {
            debugLog(`ProximitySync: Noise floor calibration complete = ${noiseFloor.toFixed(4)}`);

            // Run loopback calibration to measure device latency
            debugLog('ProximitySync: Starting loopback calibration...');
            await this.detector.runLoopbackCalibration(5);

            // Now start ranging (host only)
            if (this.isHost && this.isRunning && !this.rangingInterval) {
                this.startRanging();
            }
        };

        // Guest: Handle chirp detection to respond in DS-TWR sequence
        // Note: This handler is saved during loopback calibration and restored after
        if (!this.isHost) {
            this.detector.onChirpDetected = (rxTime, amplitude) => {
                // Guest detected a chirp from host
                debugLog(`Guest chirp handler: state=${this.detector.rangingState}, rx=${rxTime.toFixed(0)}ms`);

                if (this.detector.rangingState === 'idle') {
                    // First chirp from initiator - start responding
                    this.detector.handleInitiatorChirp1(rxTime);
                } else if (this.detector.rangingState === 'wait_rx2') {
                    // Second chirp from initiator - complete and send timing
                    const timingData = this.detector.handleInitiatorChirp2(rxTime);
                    if (timingData) {
                        sendMessage('proximity_timing', timingData);
                        debugLog(`DS-TWR: Sent timing data to host (latency=${timingData.latency}ms)`);
                    }
                } else {
                    debugLog(`Guest: Unexpected chirp in state ${this.detector.rangingState}`);
                }
            };
        }

        // Host: Listen for timing data from guest to complete ranging
        onMessage('proximity_timing', (data) => {
            if (this.isHost && data) {
                this.detector.completeRanging(data);
            }
        });

        this.isRunning = true;

        // Host: Start ranging after calibration (or immediately if already calibrated/fallback)
        // Note: loopback calibration is triggered by onCalibrated callback
        if (this.isHost && available && this.detector.getIsCalibrated() && this.detector.getSelfLatency() > 0) {
            this.startRanging();
        }

        console.log('ProximitySync started with DS-TWR, available:', available);
        return available;
    }

    stop() {
        this.isRunning = false;

        if (this.rangingInterval) {
            clearInterval(this.rangingInterval);
            this.rangingInterval = null;
        }

        offMessage('proximity_timing');

        this.detector.stop();
        console.log('ProximitySync stopped');
    }

    // Host periodically initiates DS-TWR ranging sequence
    // Flow:
    //   1. Host emits chirp 1, records T_tx1
    //   2. Guest detects chirp 1 (T_rx1), immediately responds with chirp (T_tx1)
    //   3. Host detects response (T_rx1), emits chirp 2 (T_tx2)
    //   4. Guest detects chirp 2 (T_rx2), sends timing data via network
    //   5. Host calculates distance using DS-TWR formula
    startRanging() {
        this.rangingInterval = setInterval(() => {
            if (!this.isRunning) return;
            if (this.detector.rangingState !== 'idle') {
                debugLog('DS-TWR: Previous ranging still in progress');
                return;
            }

            // Start DS-TWR sequence as initiator
            this.detector.startRanging();

        }, RANGING_INTERVAL);
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
