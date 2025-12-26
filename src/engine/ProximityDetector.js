// ProximityDetector - Audio-based proximity detection using DS-TWR
// Uses Double-Sided Two-Way Ranging with chirp signals for accurate distance measurement
//
// Detection approach:
// 1. AudioWorklet runs continuous matched filter correlation
// 2. Adaptive noise floor estimated from samples known to not contain chirps
// 3. Detection when correlation peak is >3dB above noise floor
// 4. Parabolic interpolation for sub-sample accuracy (in worklet)
//
// Half-duplex protocol: never emit and listen simultaneously

import { debugLog, debugSetValue } from '../ui/DebugOverlay.js';

// Chirp parameters
const CHIRP_FREQ_START = 14000;     // Start frequency (Hz)
const CHIRP_FREQ_END = 16000;       // End frequency (Hz)
const CHIRP_DURATION_MS = 30;       // Duration in ms
const CHIRP_DURATION = 0.030;       // Duration in seconds
const SAMPLE_RATE = 44100;
const CHIRP_SAMPLES = Math.floor(CHIRP_DURATION * SAMPLE_RATE);
const SPEED_OF_SOUND_FPS = 1125;    // feet per second at room temp

// Protocol timing
const RESPONSE_DELAY_MS = 50;       // Wait before responding to ensure chirp ended
const DEAF_PERIOD_MS = 30;          // Block self-echo (30ms chirp detected ~immediately, this blocks echo)

// Distance smoothing
const SMOOTHING_FACTOR = 0.3;

export class ProximityDetector {
    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.microphone = null;
        this.mediaStream = null;

        this.isRunning = false;
        this.isAvailable = false;
        this.isCalibrated = false;

        // Distance estimation
        this.currentDistance = 6;       // Default 6 feet
        this.smoothedDistance = 6;
        this.noiseFloor = 0;

        // DS-TWR timestamps (all in milliseconds, performance.now() timebase)
        this.T_tx1 = 0;
        this.T_rx1 = 0;
        this.T_tx2 = 0;
        this.T_rx1_remote = 0;
        this.T_tx1_remote = 0;
        this.T_rx2_remote = 0;

        // State machine for DS-TWR
        this.rangingState = 'idle';
        this.isInitiator = false;
        this.rangingTimeout = null;

        // Callbacks
        this.onDistanceUpdate = null;
        this.onChirpDetected = null;
        this.onRangingComplete = null;
        this.onCalibrated = null;

        // Half-duplex state
        this.isEmitting = false;
        this.emitEndTime = 0;

        // Latency compensation (in ms)
        this.outputLatencyMs = 0;
        this.selfLatencyMs = 0;          // Measured loopback latency (output + input)
        this.isCalibrating = false;
        this.calibrationTxTime = 0;
        this.calibrationSamples = [];

        // Time synchronization between AudioContext and performance.now()
        this.contextTimeOffset = 0;

        // Fallback detection (used if worklet fails)
        this.analyser = null;
        this.frequencyData = null;
        this.detectionLoop = null;
        this.useWorklet = true;
        this.lastFallbackDetection = 0;
    }

    async start() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: SAMPLE_RATE
            });

            // Measure output latency
            this.outputLatencyMs = ((this.audioContext.outputLatency || 0) +
                                    (this.audioContext.baseLatency || 0)) * 1000;

            debugLog(`Audio output latency: ${this.outputLatencyMs.toFixed(1)}ms`);

            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: SAMPLE_RATE
                }
            });

            this.microphone = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Try AudioWorklet first
            try {
                await this.setupWorklet();
                this.useWorklet = true;
                debugLog('Using AudioWorklet for chirp detection');
            } catch (workletError) {
                console.warn('AudioWorklet unavailable:', workletError);
                debugLog(`Worklet failed: ${workletError.message}, using fallback`);
                await this.setupFallbackDetection();
                this.useWorklet = false;
                this.isCalibrated = true; // Fallback doesn't need calibration
            }

            this.syncTimeBase();

            this.isAvailable = true;
            this.isRunning = true;

            debugLog(`ProximityDetector started, chirp: ${CHIRP_FREQ_START}-${CHIRP_FREQ_END}Hz, ${CHIRP_SAMPLES} samples`);
            debugLog('Calibrating noise floor for 1 second...');

            return true;

        } catch (error) {
            console.warn('ProximityDetector unavailable:', error.message);
            debugLog(`ProximityDetector error: ${error.message}`);
            this.isAvailable = false;
            this.isRunning = false;
            return false;
        }
    }

    async setupWorklet() {
        const workletPath = new URL('./chirp-detector-worklet.js', import.meta.url).href;
        await this.audioContext.audioWorklet.addModule(workletPath);

        this.workletNode = new AudioWorkletNode(this.audioContext, 'chirp-detector-processor', {
            processorOptions: {
                sampleRate: SAMPLE_RATE,
                chirpSamples: CHIRP_SAMPLES,
                freqStart: CHIRP_FREQ_START,
                freqEnd: CHIRP_FREQ_END,
                chirpDuration: CHIRP_DURATION
            }
        });

        this.workletNode.port.onmessage = (event) => {
            const data = event.data;

            if (data.type === 'calibrated') {
                this.noiseFloor = data.noiseFloor;
                this.isCalibrated = true;
                debugLog(`Calibration complete: noise floor = ${data.noiseFloor.toFixed(4)} (${data.samples} samples)`);
                if (this.onCalibrated) {
                    this.onCalibrated(data.noiseFloor);
                }
            } else if (data.type === 'chirpDetected') {
                this.handleWorkletDetection(data);
            }
        };

        this.microphone.connect(this.workletNode);
    }

    async setupFallbackDetection() {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.1;

        this.microphone.connect(this.analyser);
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

        this.startFallbackDetectionLoop();
    }

    syncTimeBase() {
        const perfNow = performance.now();
        const contextMs = this.audioContext.currentTime * 1000;
        this.contextTimeOffset = perfNow - contextMs;
    }

    frameToPerformanceTime(frame) {
        const contextMs = (frame / SAMPLE_RATE) * 1000;
        return contextMs + this.contextTimeOffset;
    }

    stop() {
        this.isRunning = false;

        if (this.rangingTimeout) {
            clearTimeout(this.rangingTimeout);
            this.rangingTimeout = null;
        }

        if (this.detectionLoop) {
            cancelAnimationFrame(this.detectionLoop);
            this.detectionLoop = null;
        }

        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }

        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }

        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    // === Chirp Emission ===

    emitChirp() {
        if (!this.isAvailable || !this.audioContext) return 0;

        if (this.audioContext.state === 'suspended') {
            debugLog('AudioContext suspended, resuming...');
            this.audioContext.resume();
            return 0;
        }

        this.syncTimeBase();

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        const startTime = this.audioContext.currentTime;

        // Linear frequency sweep
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(CHIRP_FREQ_START, startTime);
        oscillator.frequency.linearRampToValueAtTime(CHIRP_FREQ_END, startTime + CHIRP_DURATION);

        // Smooth envelope
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.003);
        gainNode.gain.setValueAtTime(0.3, startTime + CHIRP_DURATION - 0.003);
        gainNode.gain.linearRampToValueAtTime(0, startTime + CHIRP_DURATION);

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.start(startTime);
        oscillator.stop(startTime + CHIRP_DURATION);

        // TX time accounting for output latency
        const txTimeMs = performance.now() + this.outputLatencyMs;

        // Tell worklet to exclude this period from noise estimation and detection
        if (this.workletNode) {
            const startFrame = Math.floor(startTime * SAMPLE_RATE);
            const endFrame = Math.floor((startTime + CHIRP_DURATION + DEAF_PERIOD_MS / 1000) * SAMPLE_RATE);
            this.workletNode.port.postMessage({
                type: 'excludeRange',
                startFrame: startFrame,
                endFrame: endFrame
            });
        }

        this.isEmitting = true;
        this.emitEndTime = txTimeMs + CHIRP_DURATION_MS + DEAF_PERIOD_MS;

        setTimeout(() => {
            this.isEmitting = false;
        }, CHIRP_DURATION_MS + DEAF_PERIOD_MS);

        debugLog(`Emit chirp, tx=${txTimeMs.toFixed(0)}ms`);
        return txTimeMs;
    }

    // === Detection Handling ===

    handleWorkletDetection(data) {
        if (!this.isRunning) return;

        const { peakFrame, correlation, noiseFloor, snr } = data;

        // Sync timebase before converting to minimize drift errors
        this.syncTimeBase();

        // Convert frame to performance.now() time
        const rxTimeMs = this.frameToPerformanceTime(peakFrame);

        // During loopback calibration, we WANT to detect our own chirp
        // Otherwise, check deaf period to avoid self-detection
        if (!this.isCalibrating && rxTimeMs < this.emitEndTime) {
            debugLog(`Ignoring detection during deaf period: rx=${rxTimeMs.toFixed(0)}ms < deaf until ${this.emitEndTime.toFixed(0)}ms`);
            return;
        }

        debugLog(`Chirp detected: corr=${correlation.toFixed(3)}, noise=${noiseFloor.toFixed(4)}, SNR=${snr.toFixed(1)}dB, rx=${rxTimeMs.toFixed(0)}ms`);

        this.noiseFloor = noiseFloor;
        this.handleChirpDetected(rxTimeMs, correlation);
    }

    // === Fallback Detection ===

    startFallbackDetectionLoop() {
        const detect = () => {
            if (!this.isRunning) return;

            this.analyser.getByteFrequencyData(this.frequencyData);
            const amplitude = this.getFallbackChirpAmplitude();
            const now = performance.now();

            // Simple threshold detection for fallback
            if (!this.isEmitting && amplitude > 20) {
                if (now - this.lastFallbackDetection > CHIRP_DURATION_MS + 50) {
                    this.lastFallbackDetection = now;
                    debugLog(`Fallback detection: amp=${amplitude}`);
                    this.handleChirpDetected(now, amplitude / 255);
                }
            }

            this.detectionLoop = requestAnimationFrame(detect);
        };

        detect();
    }

    getFallbackChirpAmplitude() {
        const binStart = Math.floor(CHIRP_FREQ_START / (SAMPLE_RATE / this.analyser.fftSize));
        const binEnd = Math.ceil(CHIRP_FREQ_END / (SAMPLE_RATE / this.analyser.fftSize));

        let maxAmplitude = 0;
        for (let i = binStart; i <= binEnd && i < this.frequencyData.length; i++) {
            maxAmplitude = Math.max(maxAmplitude, this.frequencyData[i]);
        }
        return maxAmplitude;
    }

    // === DS-TWR State Machine ===

    resetRanging() {
        if (this.rangingTimeout) {
            clearTimeout(this.rangingTimeout);
            this.rangingTimeout = null;
        }
        this.rangingState = 'idle';
        this.isInitiator = false;
    }

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

    startRanging() {
        if (!this.isCalibrated) {
            debugLog('DS-TWR: Not calibrated yet, skipping');
            return;
        }

        this.resetRanging();
        this.isInitiator = true;
        this.rangingState = 'wait_rx1';
        this.T_tx1 = this.emitChirp();
        this.setRangingTimeout(500);
        debugLog(`DS-TWR: Sent chirp 1 at ${this.T_tx1.toFixed(0)}ms, waiting for response`);
    }

    completeRanging(remoteData) {
        if (!this.isInitiator || this.rangingState !== 'complete') {
            debugLog('DS-TWR: Not ready to complete ranging');
            return;
        }

        if (this.rangingTimeout) {
            clearTimeout(this.rangingTimeout);
            this.rangingTimeout = null;
        }

        this.T_rx1_remote = remoteData.T_rx1;
        this.T_tx1_remote = remoteData.T_tx1;
        this.T_rx2_remote = remoteData.T_rx2;
        const remoteLatency = remoteData.latency || 0;

        // Raw measured values
        const Tround1_raw = this.T_rx1 - this.T_tx1;
        const Treply1_raw = this.T_tx1_remote - this.T_rx1_remote;
        const Tround2_raw = this.T_rx2_remote - this.T_tx1_remote;
        const Treply2_raw = this.T_tx2 - this.T_rx1;

        // Apply latency corrections:
        // - Round trips appear longer by device latency (subtract to correct)
        // - Reply times appear shorter by device latency (add to correct)
        const Tround1 = Tround1_raw - this.selfLatencyMs;
        const Treply1 = Treply1_raw + remoteLatency;
        const Tround2 = Tround2_raw - remoteLatency;
        const Treply2 = Treply2_raw + this.selfLatencyMs;

        const numerator = (Tround1 * Tround2) - (Treply1 * Treply2);
        const denominator = Tround1 + Tround2 + Treply1 + Treply2;

        if (denominator <= 0) {
            debugLog('DS-TWR: Invalid timing data (denominator <= 0)');
            this.rangingState = 'idle';
            return;
        }

        const tofMs = numerator / denominator;
        const distanceFeet = (tofMs / 1000) * SPEED_OF_SOUND_FPS;

        debugLog(`DS-TWR: Raw Tr1=${Tround1_raw.toFixed(1)} Tp1=${Treply1_raw.toFixed(1)} Tr2=${Tround2_raw.toFixed(1)} Tp2=${Treply2_raw.toFixed(1)}`);
        debugLog(`DS-TWR: Corrected (selfL=${this.selfLatencyMs.toFixed(1)}, remoteL=${remoteLatency.toFixed(1)})`);
        debugLog(`DS-TWR: Tr1=${Tround1.toFixed(1)} Tp1=${Treply1.toFixed(1)} Tr2=${Tround2.toFixed(1)} Tp2=${Treply2.toFixed(1)}`);
        debugLog(`DS-TWR: ToF=${tofMs.toFixed(2)}ms -> ${distanceFeet.toFixed(1)}ft`);

        if (distanceFeet >= 0 && distanceFeet < 100) {
            this.updateDistance(distanceFeet);
        } else {
            debugLog(`DS-TWR: Distance ${distanceFeet.toFixed(1)}ft out of range, ignoring`);
        }

        this.rangingState = 'idle';
    }

    // === DS-TWR Responder Methods ===

    handleInitiatorChirp1(rxTime) {
        this.resetRanging();
        this.isInitiator = false;
        this.T_rx1_remote = rxTime;
        this.rangingState = 'responding';

        setTimeout(() => {
            if (this.rangingState !== 'responding') return;

            this.T_tx1_remote = this.emitChirp();
            this.rangingState = 'wait_rx2';
            this.setRangingTimeout(400);

            debugLog(`DS-TWR Responder: Rx1=${rxTime.toFixed(0)}, Tx1=${this.T_tx1_remote.toFixed(0)}`);
        }, RESPONSE_DELAY_MS);

        debugLog(`DS-TWR Responder: Detected chirp 1, responding in ${RESPONSE_DELAY_MS}ms`);
    }

    handleInitiatorChirp2(rxTime) {
        if (this.rangingState !== 'wait_rx2') return null;

        this.T_rx2_remote = rxTime;

        debugLog(`DS-TWR Responder: Rx2=${rxTime.toFixed(0)}, sending timing data`);

        const timingData = {
            T_rx1: this.T_rx1_remote,
            T_tx1: this.T_tx1_remote,
            T_rx2: this.T_rx2_remote,
            latency: this.selfLatencyMs  // Include device latency for correction
        };

        this.resetRanging();
        return timingData;
    }

    // === Detection Handler ===

    handleChirpDetected(rxTime, correlation) {
        debugLog(`Chirp handler: state=${this.rangingState}`);

        if (this.onChirpDetected) {
            this.onChirpDetected(rxTime, correlation);
        }

        if (this.isInitiator) {
            if (this.rangingState === 'wait_rx1') {
                this.T_rx1 = rxTime;
                this.rangingState = 'sending_chirp2';

                debugLog(`DS-TWR Initiator: Rx1=${rxTime.toFixed(0)}, sending chirp 2 in ${RESPONSE_DELAY_MS}ms`);

                setTimeout(() => {
                    if (this.rangingState !== 'sending_chirp2') return;

                    this.T_tx2 = this.emitChirp();
                    this.rangingState = 'complete';
                    debugLog(`DS-TWR Initiator: Tx2=${this.T_tx2.toFixed(0)}, waiting for timing data`);
                }, RESPONSE_DELAY_MS);
            }
        }
    }

    // === Distance Updates ===

    updateDistance(rawDistance) {
        this.currentDistance = rawDistance;
        this.smoothedDistance = this.smoothedDistance * (1 - SMOOTHING_FACTOR) +
                                rawDistance * SMOOTHING_FACTOR;

        debugLog(`Distance: ${rawDistance.toFixed(1)}ft -> smoothed ${this.smoothedDistance.toFixed(1)}ft`);
        debugSetValue(`${this.smoothedDistance.toFixed(1)} ft`);

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

    getIsCalibrated() {
        return this.isCalibrated;
    }

    getSelfLatency() {
        return this.selfLatencyMs;
    }

    // === Loopback Calibration ===
    // Measures device's audio pipeline latency by emitting and detecting own chirp

    async runLoopbackCalibration(numSamples = 5) {
        if (!this.isAvailable || !this.isCalibrated) {
            debugLog('Loopback: Not ready (need noise floor calibration first)');
            return false;
        }

        // Ensure AudioContext is running
        if (this.audioContext.state === 'suspended') {
            debugLog('Loopback: Resuming AudioContext...');
            await this.audioContext.resume();
            await new Promise(r => setTimeout(r, 100));
        }

        debugLog(`Loopback: Starting calibration (${numSamples} samples)...`);
        this.calibrationSamples = [];
        this.isCalibrating = true;

        for (let i = 0; i < numSamples; i++) {
            await this.runSingleLoopback();
            // Wait between samples to let echoes die
            await new Promise(r => setTimeout(r, 300));
        }

        this.isCalibrating = false;

        if (this.calibrationSamples.length >= 3) {
            // Use median to reject outliers
            this.calibrationSamples.sort((a, b) => a - b);
            const mid = Math.floor(this.calibrationSamples.length / 2);
            this.selfLatencyMs = this.calibrationSamples[mid];
            debugLog(`Loopback: Calibration complete, latency = ${this.selfLatencyMs.toFixed(1)}ms`);
            return true;
        } else {
            debugLog(`Loopback: Calibration failed (only ${this.calibrationSamples.length} samples)`);
            // Use a default estimate based on typical audio latency
            this.selfLatencyMs = 50;  // Conservative default
            debugLog('Loopback: Using default latency estimate of 50ms');
            return false;
        }
    }

    runSingleLoopback() {
        return new Promise((resolve) => {
            // Temporarily capture chirp detection for calibration
            const originalHandler = this.onChirpDetected;
            const emitTime = performance.now();

            const timeout = setTimeout(() => {
                this.onChirpDetected = originalHandler;
                debugLog('Loopback: Sample timeout (no self-detection)');
                resolve();
            }, 250);

            this.onChirpDetected = (rxTime, correlation) => {
                const latency = rxTime - this.calibrationTxTime;

                // Loopback should be fast (same device): 10-100ms typical
                // Reject if too fast (< 5ms, likely a bug) or too slow (> 120ms, probably other device)
                if (latency >= 5 && latency <= 120) {
                    clearTimeout(timeout);
                    this.onChirpDetected = originalHandler;
                    this.calibrationSamples.push(latency);
                    debugLog(`Loopback: Sample ${this.calibrationSamples.length}, latency = ${latency.toFixed(1)}ms, corr=${correlation.toFixed(2)}`);
                    resolve();
                } else {
                    // Likely detection from other device or noise, ignore and wait for our own
                    debugLog(`Loopback: Ignoring detection with latency ${latency.toFixed(1)}ms (expected 5-120ms)`);
                }
            };

            // Emit and record TX time
            this.calibrationTxTime = this.emitChirp();
            if (this.calibrationTxTime === 0) {
                debugLog('Loopback: Emit failed (AudioContext issue?)');
                clearTimeout(timeout);
                this.onChirpDetected = originalHandler;
                resolve();
            }
        });
    }
}
