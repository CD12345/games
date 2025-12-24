// ProximityDetector - Audio-based proximity detection using DS-TWR
// Uses Double-Sided Two-Way Ranging for accurate distance measurement

import { debugLog, debugSetValue } from '../ui/DebugOverlay.js';

const CHIRP_FREQ = 15000;           // 15kHz - works on most phone speakers
const CHIRP_DURATION = 0.04;        // 40ms chirp
const SAMPLE_RATE = 44100;
const SPEED_OF_SOUND_FPS = 1125;    // feet per second at room temp
const DETECTION_THRESHOLD = 0.06;   // Amplitude threshold for chirp detection
const SMOOTHING_FACTOR = 0.3;       // Exponential smoothing for distance

export class ProximityDetector {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.mediaStream = null;

        this.isRunning = false;
        this.isAvailable = false;

        // Distance estimation
        this.currentDistance = 6;       // Default 6 feet
        this.smoothedDistance = 6;

        // DS-TWR timestamps (all in performance.now() milliseconds)
        // For initiator (host):
        this.T_tx1 = 0;    // Time we sent first chirp
        this.T_rx1 = 0;    // Time we received response chirp
        this.T_tx2 = 0;    // Time we sent second chirp

        // For responder (guest):
        this.T_rx1_remote = 0;   // Time remote received our first chirp
        this.T_tx1_remote = 0;   // Time remote sent response chirp
        this.T_rx2_remote = 0;   // Time remote received our second chirp

        // State machine for DS-TWR
        this.rangingState = 'idle';  // idle, wait_rx1, wait_rx2, complete
        this.isInitiator = false;
        this.rangingTimeout = null;  // Timeout to reset stale ranging

        // Callbacks
        this.onDistanceUpdate = null;
        this.onChirpDetected = null;   // Called when any chirp is detected
        this.onRangingComplete = null; // Called with timing data for responder

        // Detection buffers
        this.frequencyData = null;
        this.detectionLoop = null;
        this.lastDetectionTime = 0;
        this.lastEmitTime = 0;        // For deaf period after emitting
    }

    async start() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: SAMPLE_RATE
            });

            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: SAMPLE_RATE
                }
            });

            // Set up analyser for frequency detection
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.1;

            this.microphone = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.microphone.connect(this.analyser);

            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

            this.isAvailable = true;
            this.isRunning = true;

            // Start detection loop
            this.startDetectionLoop();

            debugLog(`ProximityDetector started, AudioContext: ${this.audioContext.state}`);
            return true;

        } catch (error) {
            console.warn('ProximityDetector unavailable:', error.message);
            debugLog(`ProximityDetector error: ${error.message}`);
            this.isAvailable = false;
            this.isRunning = false;
            return false;
        }
    }

    stop() {
        this.isRunning = false;

        if (this.detectionLoop) {
            cancelAnimationFrame(this.detectionLoop);
            this.detectionLoop = null;
        }

        if (this.rangingTimeout) {
            clearTimeout(this.rangingTimeout);
            this.rangingTimeout = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.analyser = null;
        this.microphone = null;
    }

    // Emit a chirp and record transmission time
    emitChirp() {
        if (!this.isAvailable || !this.audioContext) return 0;

        // Ensure AudioContext is running (iOS requires user interaction)
        if (this.audioContext.state === 'suspended') {
            debugLog('AudioContext suspended, resuming...');
            this.audioContext.resume();
            return 0;
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(CHIRP_FREQ, this.audioContext.currentTime);

        // Quick fade in/out
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.005);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + CHIRP_DURATION - 0.005);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + CHIRP_DURATION);

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + CHIRP_DURATION);

        const txTime = performance.now();
        this.lastEmitTime = txTime;  // Track for deaf period
        return txTime;
    }

    // Reset ranging state and clear timeout
    resetRanging() {
        if (this.rangingTimeout) {
            clearTimeout(this.rangingTimeout);
            this.rangingTimeout = null;
        }
        this.rangingState = 'idle';
        this.isInitiator = false;
    }

    // Set timeout to auto-reset if ranging doesn't complete
    setRangingTimeout(timeoutMs = 500) {
        if (this.rangingTimeout) {
            clearTimeout(this.rangingTimeout);
        }
        this.rangingTimeout = setTimeout(() => {
            if (this.rangingState !== 'idle') {
                debugLog(`DS-TWR: Timeout in state ${this.rangingState}, resetting`);
                this.resetRanging();
            }
        }, timeoutMs);
    }

    // === DS-TWR Initiator (Host) Methods ===

    // Start a DS-TWR ranging sequence as initiator
    startRanging() {
        this.resetRanging();
        this.isInitiator = true;
        this.rangingState = 'wait_rx1';
        this.T_tx1 = this.emitChirp();
        this.setRangingTimeout(500);
        debugLog(`DS-TWR: Sent chirp 1 at ${this.T_tx1.toFixed(0)}ms, waiting for response`);
    }

    // Called when we receive timing data from responder
    completeRanging(remoteData) {
        if (!this.isInitiator || this.rangingState !== 'complete') {
            debugLog('DS-TWR: Not ready to complete ranging');
            return;
        }

        // Clear timeout since we got the data
        if (this.rangingTimeout) {
            clearTimeout(this.rangingTimeout);
            this.rangingTimeout = null;
        }

        this.T_rx1_remote = remoteData.T_rx1;
        this.T_tx1_remote = remoteData.T_tx1;
        this.T_rx2_remote = remoteData.T_rx2;

        // Calculate using DS-TWR formula
        // Tround1 = T_rx1 - T_tx1 (our first round trip)
        // Treply1 = T_tx1_remote - T_rx1_remote (their reply delay)
        // Tround2 = T_rx2_remote - T_tx1_remote (their second round trip)
        // Treply2 = T_tx2 - T_rx1 (our reply delay)

        const Tround1 = this.T_rx1 - this.T_tx1;
        const Treply1 = this.T_tx1_remote - this.T_rx1_remote;
        const Tround2 = this.T_rx2_remote - this.T_tx1_remote;
        const Treply2 = this.T_tx2 - this.T_rx1;

        // ToF = [(Tround1 × Tround2) − (Treply1 × Treply2)] / (Tround1 + Tround2 + Treply1 + Treply2)
        const numerator = (Tround1 * Tround2) - (Treply1 * Treply2);
        const denominator = Tround1 + Tround2 + Treply1 + Treply2;

        if (denominator <= 0) {
            debugLog('DS-TWR: Invalid timing data');
            this.rangingState = 'idle';
            return;
        }

        const tofMs = numerator / denominator;
        const distanceFeet = (tofMs / 1000) * SPEED_OF_SOUND_FPS;

        debugLog(`DS-TWR: Tr1=${Tround1.toFixed(0)} Tp1=${Treply1.toFixed(0)} Tr2=${Tround2.toFixed(0)} Tp2=${Treply2.toFixed(0)}`);
        debugLog(`DS-TWR: ToF=${tofMs.toFixed(1)}ms -> ${distanceFeet.toFixed(1)}ft`);

        if (distanceFeet >= 0 && distanceFeet < 50) {
            this.updateDistance(distanceFeet);
        } else {
            debugLog(`DS-TWR: Distance ${distanceFeet.toFixed(1)}ft out of range`);
        }

        this.rangingState = 'idle';
    }

    // === DS-TWR Responder (Guest) Methods ===

    // Called when responder detects initiator's first chirp
    handleInitiatorChirp1(rxTime) {
        this.resetRanging();
        this.isInitiator = false;
        this.T_rx1_remote = rxTime;

        // Immediately respond with our chirp
        this.T_tx1_remote = this.emitChirp();
        this.rangingState = 'wait_rx2';
        this.setRangingTimeout(300);  // Shorter timeout for responder

        debugLog(`DS-TWR Responder: Rx1=${rxTime.toFixed(0)}, Tx1=${this.T_tx1_remote.toFixed(0)}`);
    }

    // Called when responder detects initiator's second chirp
    handleInitiatorChirp2(rxTime) {
        if (this.rangingState !== 'wait_rx2') return null;

        this.T_rx2_remote = rxTime;

        debugLog(`DS-TWR Responder: Rx2=${rxTime.toFixed(0)}, sending timing data`);

        // Save timing data before resetting
        const timingData = {
            T_rx1: this.T_rx1_remote,
            T_tx1: this.T_tx1_remote,
            T_rx2: this.T_rx2_remote
        };

        this.resetRanging();  // Back to idle, ready for next round

        return timingData;
    }

    // === Detection Loop ===

    startDetectionLoop() {
        const detect = () => {
            if (!this.isRunning) return;

            this.analyser.getByteFrequencyData(this.frequencyData);

            // Find the bin for our chirp frequency
            const binIndex = Math.round(CHIRP_FREQ / (SAMPLE_RATE / this.analyser.fftSize));

            // Check bins around target frequency
            let maxAmplitude = 0;
            for (let i = binIndex - 2; i <= binIndex + 2; i++) {
                if (i >= 0 && i < this.frequencyData.length) {
                    maxAmplitude = Math.max(maxAmplitude, this.frequencyData[i] / 255);
                }
            }

            // Chirp detected
            const now = performance.now();
            const sinceLast = now - this.lastDetectionTime;
            const sinceEmit = now - this.lastEmitTime;

            // Ignore if: too soon since last detection, or within deaf period after emitting
            // Deaf period: 60ms after emit to avoid self-echo (chirp is 40ms + margin)
            if (maxAmplitude > DETECTION_THRESHOLD && sinceLast > 50 && sinceEmit > 60) {
                this.lastDetectionTime = now;
                this.handleChirpDetected(now, maxAmplitude);
            }

            // Show real-time amplitude in debug mode
            debugSetValue(`${(CHIRP_FREQ/1000).toFixed(0)}kHz: ${(maxAmplitude * 100).toFixed(0)}%`);

            this.detectionLoop = requestAnimationFrame(detect);
        };

        detect();
    }

    handleChirpDetected(rxTime, amplitude) {
        debugLog(`Chirp detected! amp=${amplitude.toFixed(2)} state=${this.rangingState}`);

        // Notify callback for external handling
        if (this.onChirpDetected) {
            this.onChirpDetected(rxTime, amplitude);
        }

        // Handle based on current ranging state
        if (this.isInitiator) {
            if (this.rangingState === 'wait_rx1') {
                // Received response to our first chirp
                this.T_rx1 = rxTime;
                debugLog(`DS-TWR Initiator: Rx1=${rxTime.toFixed(0)}, sending chirp 2`);

                // Send second chirp
                this.T_tx2 = this.emitChirp();
                this.rangingState = 'complete';
                debugLog(`DS-TWR Initiator: Tx2=${this.T_tx2.toFixed(0)}, waiting for timing data`);
            }
        }
        // Responder handling is done via explicit method calls from ProximitySync
    }

    // Update distance with smoothing
    updateDistance(rawDistance) {
        this.currentDistance = rawDistance;
        this.smoothedDistance = this.smoothedDistance * (1 - SMOOTHING_FACTOR) +
                                rawDistance * SMOOTHING_FACTOR;

        debugLog(`Distance: ${rawDistance.toFixed(1)}ft -> smoothed ${this.smoothedDistance.toFixed(1)}ft`);

        if (this.onDistanceUpdate) {
            this.onDistanceUpdate(this.smoothedDistance);
        }
    }

    getDistance() {
        return this.smoothedDistance;
    }

    getIsAvailable() {
        return this.isAvailable;
    }
}
