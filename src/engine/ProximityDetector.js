// ProximityDetector - Audio-based proximity detection using DS-TWR
// Uses Double-Sided Two-Way Ranging with chirp signals for accurate distance measurement
//
// Improvements over simple threshold detection:
// 1. Linear frequency chirp (14-16kHz sweep) instead of fixed tone
// 2. Matched filter correlation for precise arrival time detection
// 3. Parabolic interpolation for sub-sample accuracy
// 4. AudioWorklet for sample-accurate timing
// 5. Latency compensation for audio pipeline delays
//
// Half-duplex protocol: never emit and listen simultaneously

import { debugLog, debugSetValue } from '../ui/DebugOverlay.js';

// Chirp parameters
const CHIRP_FREQ_START = 14000;     // Start frequency (Hz)
const CHIRP_FREQ_END = 16000;       // End frequency (Hz)
const CHIRP_DURATION_MS = 30;       // Duration in ms
const CHIRP_DURATION = 0.030;       // Duration in seconds
const SAMPLE_RATE = 44100;
const SPEED_OF_SOUND_FPS = 1125;    // feet per second at room temp

// Detection parameters
const DETECTION_THRESHOLD = 0.015;  // Energy threshold for chirp detection
const BUFFER_SIZE = 4096;           // Samples to buffer (~93ms at 44.1kHz)
const SMOOTHING_FACTOR = 0.3;       // Exponential smoothing for distance

// Protocol timing
const RESPONSE_DELAY_MS = 50;       // Wait before responding to ensure chirp ended
const DEAF_PERIOD_MS = 30;          // Ignore detections for this long after emitting

export class ProximityDetector {
    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.microphone = null;
        this.mediaStream = null;

        this.isRunning = false;
        this.isAvailable = false;

        // Chirp template for matched filter correlation
        this.chirpTemplate = null;
        this.chirpTemplateSamples = 0;

        // Distance estimation
        this.currentDistance = 6;       // Default 6 feet
        this.smoothedDistance = 6;

        // DS-TWR timestamps (all in milliseconds, performance.now() timebase)
        // For initiator (host):
        this.T_tx1 = 0;    // Time we sent first chirp
        this.T_rx1 = 0;    // Time we received response chirp
        this.T_tx2 = 0;    // Time we sent second chirp

        // For responder (guest):
        this.T_rx1_remote = 0;   // Time remote received our first chirp
        this.T_tx1_remote = 0;   // Time remote sent response chirp
        this.T_rx2_remote = 0;   // Time remote received our second chirp

        // State machine for DS-TWR
        // States: idle, wait_rx1, responding, wait_rx2, sending_chirp2, complete
        this.rangingState = 'idle';
        this.isInitiator = false;
        this.rangingTimeout = null;

        // Callbacks
        this.onDistanceUpdate = null;
        this.onChirpDetected = null;
        this.onRangingComplete = null;

        // Half-duplex state
        this.isEmitting = false;
        this.emitEndTime = 0;

        // Latency compensation (in ms)
        this.outputLatencyMs = 0;
        this.inputLatencyMs = 0;

        // Time synchronization between AudioContext and performance.now()
        this.contextTimeOffset = 0; // performance.now() - (audioContext.currentTime * 1000)

        // Fallback detection (used if worklet fails)
        this.analyser = null;
        this.frequencyData = null;
        this.detectionLoop = null;
        this.useWorklet = true;
    }

    async start() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: SAMPLE_RATE
            });

            // Measure latency
            this.outputLatencyMs = ((this.audioContext.outputLatency || 0) +
                                    (this.audioContext.baseLatency || 0)) * 1000;
            // Input latency is harder to measure; estimate based on buffer sizes
            // AnalyserNode has ~fftSize/2 samples delay, worklet has ~128 samples
            this.inputLatencyMs = (128 / SAMPLE_RATE) * 1000; // ~3ms for worklet

            debugLog(`Audio latency - output: ${this.outputLatencyMs.toFixed(1)}ms, input: ${this.inputLatencyMs.toFixed(1)}ms`);

            // Generate chirp template for correlation
            this.generateChirpTemplate();

            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: SAMPLE_RATE
                }
            });

            // Create microphone source
            this.microphone = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Try to set up AudioWorklet for sample-accurate detection
            try {
                await this.setupWorklet();
                this.useWorklet = true;
                debugLog('Using AudioWorklet for chirp detection');
            } catch (workletError) {
                console.warn('AudioWorklet unavailable, falling back to AnalyserNode:', workletError);
                debugLog(`Worklet failed: ${workletError.message}, using fallback`);
                await this.setupFallbackDetection();
                this.useWorklet = false;
            }

            // Sync time bases
            this.syncTimeBase();

            this.isAvailable = true;
            this.isRunning = true;

            debugLog(`ProximityDetector started, chirp: ${CHIRP_FREQ_START}-${CHIRP_FREQ_END}Hz`);
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
        // Load worklet from URL
        const workletPath = new URL('./chirp-detector-worklet.js', import.meta.url).href;
        await this.audioContext.audioWorklet.addModule(workletPath);

        // Create worklet node
        this.workletNode = new AudioWorkletNode(this.audioContext, 'chirp-detector-processor', {
            processorOptions: {
                sampleRate: SAMPLE_RATE,
                bufferSize: BUFFER_SIZE,
                freqStart: CHIRP_FREQ_START,
                freqEnd: CHIRP_FREQ_END,
                threshold: DETECTION_THRESHOLD
            }
        });

        // Handle detection events from worklet
        this.workletNode.port.onmessage = (event) => {
            if (event.data.type === 'chirpDetected') {
                this.handleWorkletDetection(event.data);
            }
        };

        // Connect microphone -> worklet
        this.microphone.connect(this.workletNode);
        // Don't connect to destination (we don't want to hear the mic)
    }

    async setupFallbackDetection() {
        // Fallback using AnalyserNode (less accurate but more compatible)
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.1;

        this.microphone.connect(this.analyser);
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

        // Start detection loop
        this.startFallbackDetectionLoop();
    }

    syncTimeBase() {
        // Establish relationship between AudioContext time and performance.now()
        const perfNow = performance.now();
        const contextMs = this.audioContext.currentTime * 1000;
        this.contextTimeOffset = perfNow - contextMs;
    }

    // Convert AudioContext frame number to performance.now() milliseconds
    frameToPerformanceTime(frame) {
        const contextMs = (frame / SAMPLE_RATE) * 1000;
        return contextMs + this.contextTimeOffset;
    }

    generateChirpTemplate() {
        // Generate the chirp waveform for matched filter correlation
        this.chirpTemplateSamples = Math.floor(CHIRP_DURATION * SAMPLE_RATE);
        this.chirpTemplate = new Float32Array(this.chirpTemplateSamples);

        for (let i = 0; i < this.chirpTemplateSamples; i++) {
            const t = i / SAMPLE_RATE;

            // Linear frequency sweep from CHIRP_FREQ_START to CHIRP_FREQ_END
            // Instantaneous frequency: f(t) = f0 + (f1 - f0) * t / T
            // Phase is integral of frequency: phi(t) = 2*pi * (f0*t + (f1-f0)*t^2 / (2*T))
            const freqSlope = (CHIRP_FREQ_END - CHIRP_FREQ_START) / CHIRP_DURATION;
            const phase = 2 * Math.PI * (CHIRP_FREQ_START * t + 0.5 * freqSlope * t * t);

            // Apply raised cosine envelope for smooth start/end
            const fadeTime = 0.003; // 3ms fade
            let envelope = 1;
            if (t < fadeTime) {
                envelope = 0.5 * (1 - Math.cos(Math.PI * t / fadeTime));
            } else if (t > CHIRP_DURATION - fadeTime) {
                envelope = 0.5 * (1 + Math.cos(Math.PI * (t - CHIRP_DURATION + fadeTime) / fadeTime));
            }

            this.chirpTemplate[i] = Math.sin(phase) * envelope;
        }

        debugLog(`Chirp template: ${this.chirpTemplateSamples} samples (${CHIRP_DURATION_MS}ms)`);
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

        // Re-sync time base before emission
        this.syncTimeBase();

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        const startTime = this.audioContext.currentTime;

        // Linear frequency sweep (true chirp)
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

        // Calculate TX time: current time + output latency
        const txTimeMs = performance.now() + this.outputLatencyMs;

        this.isEmitting = true;
        this.emitEndTime = txTimeMs + CHIRP_DURATION_MS + DEAF_PERIOD_MS;

        // Tell worklet to ignore detections during emission
        if (this.workletNode) {
            const ignoreUntilFrame = Math.floor((startTime + CHIRP_DURATION + 0.05) * SAMPLE_RATE);
            this.workletNode.port.postMessage({ type: 'ignoreUntil', frame: ignoreUntilFrame });
        }

        // Clear emitting flag after chirp + deaf period
        setTimeout(() => {
            this.isEmitting = false;
        }, CHIRP_DURATION_MS + DEAF_PERIOD_MS);

        debugLog(`Emit chirp ${CHIRP_FREQ_START}-${CHIRP_FREQ_END}Hz, tx=${txTimeMs.toFixed(0)}ms`);
        return txTimeMs;
    }

    // === Detection Handling ===

    handleWorkletDetection(data) {
        if (!this.isRunning || this.isEmitting) return;

        const { buffer, bufferStartFrame, triggerFrame, energy } = data;

        // Perform matched filter correlation to find precise chirp location
        const result = this.correlateAndFindPeak(buffer);

        if (!result.found) {
            debugLog(`Detection triggered but correlation failed (energy=${energy.toFixed(3)})`);
            return;
        }

        // Calculate arrival time
        // The peak position in the buffer tells us where the chirp started
        const chirpStartFrame = bufferStartFrame + result.peakIndex;
        const rxTimeMs = this.frameToPerformanceTime(chirpStartFrame) - this.inputLatencyMs;

        debugLog(`Chirp detected: peak@${result.peakIndex.toFixed(1)}, corr=${result.peakValue.toFixed(3)}, rx=${rxTimeMs.toFixed(0)}ms`);

        this.handleChirpDetected(rxTimeMs, result.peakValue);
    }

    // Matched filter correlation with parabolic interpolation
    correlateAndFindPeak(buffer) {
        const template = this.chirpTemplate;
        const templateLen = template.length;
        const bufferLen = buffer.length;

        if (bufferLen < templateLen) {
            return { found: false };
        }

        // Cross-correlation: slide template across buffer
        const correlationLen = bufferLen - templateLen + 1;
        let maxVal = -Infinity;
        let maxIdx = 0;

        // We only need to search in a reasonable range
        // The chirp should be somewhere in the recent part of the buffer
        const searchStart = Math.max(0, correlationLen - Math.floor(SAMPLE_RATE * 0.1)); // Last 100ms
        const searchEnd = correlationLen;

        for (let lag = searchStart; lag < searchEnd; lag++) {
            let sum = 0;
            for (let i = 0; i < templateLen; i++) {
                sum += buffer[lag + i] * template[i];
            }
            if (sum > maxVal) {
                maxVal = sum;
                maxIdx = lag;
            }
        }

        // Normalize correlation value
        const normFactor = this.computeNormFactor(buffer, maxIdx, templateLen);
        const normalizedCorr = normFactor > 0 ? maxVal / normFactor : 0;

        // Check if correlation is strong enough
        if (normalizedCorr < 0.3) {
            return { found: false, peakValue: normalizedCorr };
        }

        // Parabolic interpolation for sub-sample accuracy
        let refinedIdx = maxIdx;
        if (maxIdx > searchStart && maxIdx < searchEnd - 1) {
            // Get correlation values at neighboring points
            let sumPrev = 0, sumNext = 0;
            for (let i = 0; i < templateLen; i++) {
                sumPrev += buffer[maxIdx - 1 + i] * template[i];
                sumNext += buffer[maxIdx + 1 + i] * template[i];
            }

            // Parabolic interpolation: find vertex of parabola through 3 points
            // y = ax^2 + bx + c, vertex at x = -b/(2a)
            // With points at x = -1, 0, 1: offset = (y[-1] - y[1]) / (2 * (y[-1] - 2*y[0] + y[1]))
            const y0 = sumPrev;
            const y1 = maxVal;
            const y2 = sumNext;

            const denom = 2 * (y0 - 2 * y1 + y2);
            if (Math.abs(denom) > 0.0001) {
                const offset = (y0 - y2) / denom;
                // Clamp offset to reasonable range
                if (offset > -1 && offset < 1) {
                    refinedIdx = maxIdx + offset;
                }
            }
        }

        return {
            found: true,
            peakIndex: refinedIdx,
            peakValue: normalizedCorr
        };
    }

    // Compute normalization factor for correlation
    computeNormFactor(buffer, offset, length) {
        let sumSq = 0;
        for (let i = 0; i < length; i++) {
            sumSq += buffer[offset + i] * buffer[offset + i];
        }
        // Template is already normalized, just need buffer energy
        let templateSumSq = 0;
        for (let i = 0; i < this.chirpTemplate.length; i++) {
            templateSumSq += this.chirpTemplate[i] * this.chirpTemplate[i];
        }
        return Math.sqrt(sumSq * templateSumSq);
    }

    // === Fallback Detection (AnalyserNode-based) ===

    startFallbackDetectionLoop() {
        let lastDetectionTime = 0;

        const detect = () => {
            if (!this.isRunning) return;

            this.analyser.getByteFrequencyData(this.frequencyData);
            const amplitude = this.getFallbackChirpAmplitude();
            const now = performance.now();

            // Half-duplex: don't listen while emitting
            if (!this.isEmitting && amplitude > DETECTION_THRESHOLD * 255) {
                // Debounce
                if (now - lastDetectionTime > CHIRP_DURATION_MS + 30) {
                    lastDetectionTime = now;
                    // In fallback mode, we can't do correlation, just use threshold time
                    const rxTimeMs = now - this.inputLatencyMs;
                    debugLog(`Fallback detection: amp=${(amplitude/255).toFixed(2)}, rx=${rxTimeMs.toFixed(0)}ms`);
                    this.handleChirpDetected(rxTimeMs, amplitude / 255);
                }
            }

            this.detectionLoop = requestAnimationFrame(detect);
        };

        detect();
    }

    getFallbackChirpAmplitude() {
        // Check energy across the chirp frequency band
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

    // Start DS-TWR ranging sequence as initiator (host)
    startRanging() {
        this.resetRanging();
        this.isInitiator = true;
        this.rangingState = 'wait_rx1';
        this.T_tx1 = this.emitChirp();
        this.setRangingTimeout(500);
        debugLog(`DS-TWR: Sent chirp 1 at ${this.T_tx1.toFixed(0)}ms, waiting for response`);
    }

    // Called when initiator receives timing data from responder
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

        // DS-TWR calculation
        // Tround1 = T_rx1 - T_tx1 (our measurement of round trip 1)
        // Treply1 = T_tx1_remote - T_rx1_remote (their reply delay)
        // Tround2 = T_rx2_remote - T_tx1_remote (their measurement of round trip 2)
        // Treply2 = T_tx2 - T_rx1 (our reply delay)

        const Tround1 = this.T_rx1 - this.T_tx1;
        const Treply1 = this.T_tx1_remote - this.T_rx1_remote;
        const Tround2 = this.T_rx2_remote - this.T_tx1_remote;
        const Treply2 = this.T_tx2 - this.T_rx1;

        // ToF = [(Tround1 * Tround2) - (Treply1 * Treply2)] / (Tround1 + Tround2 + Treply1 + Treply2)
        const numerator = (Tround1 * Tround2) - (Treply1 * Treply2);
        const denominator = Tround1 + Tround2 + Treply1 + Treply2;

        if (denominator <= 0) {
            debugLog('DS-TWR: Invalid timing data (denominator <= 0)');
            this.rangingState = 'idle';
            return;
        }

        const tofMs = numerator / denominator;
        const distanceFeet = (tofMs / 1000) * SPEED_OF_SOUND_FPS;

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

    // Called when responder detects initiator's first chirp
    handleInitiatorChirp1(rxTime) {
        this.resetRanging();
        this.isInitiator = false;
        this.T_rx1_remote = rxTime;
        this.rangingState = 'responding';

        // Wait for incoming chirp to fully end, then respond
        setTimeout(() => {
            if (this.rangingState !== 'responding') return;

            this.T_tx1_remote = this.emitChirp();
            this.rangingState = 'wait_rx2';
            this.setRangingTimeout(400);

            debugLog(`DS-TWR Responder: Rx1=${rxTime.toFixed(0)}, Tx1=${this.T_tx1_remote.toFixed(0)}`);
        }, RESPONSE_DELAY_MS);

        debugLog(`DS-TWR Responder: Detected chirp 1, responding in ${RESPONSE_DELAY_MS}ms`);
    }

    // Called when responder detects initiator's second chirp
    handleInitiatorChirp2(rxTime) {
        if (this.rangingState !== 'wait_rx2') return null;

        this.T_rx2_remote = rxTime;

        debugLog(`DS-TWR Responder: Rx2=${rxTime.toFixed(0)}, sending timing data`);

        const timingData = {
            T_rx1: this.T_rx1_remote,
            T_tx1: this.T_tx1_remote,
            T_rx2: this.T_rx2_remote
        };

        this.resetRanging();
        return timingData;
    }

    // === Detection Handler ===

    handleChirpDetected(rxTime, amplitude) {
        debugLog(`Chirp detected: amp=${amplitude.toFixed(2)} state=${this.rangingState}`);

        if (this.onChirpDetected) {
            this.onChirpDetected(rxTime, amplitude);
        }

        if (this.isInitiator) {
            if (this.rangingState === 'wait_rx1') {
                // Received response to our first chirp
                this.T_rx1 = rxTime;
                this.rangingState = 'sending_chirp2';

                debugLog(`DS-TWR Initiator: Rx1=${rxTime.toFixed(0)}, sending chirp 2 in ${RESPONSE_DELAY_MS}ms`);

                // Wait for response chirp to end, then send chirp 2
                setTimeout(() => {
                    if (this.rangingState !== 'sending_chirp2') return;

                    this.T_tx2 = this.emitChirp();
                    this.rangingState = 'complete';
                    debugLog(`DS-TWR Initiator: Tx2=${this.T_tx2.toFixed(0)}, waiting for timing data`);
                }, RESPONSE_DELAY_MS);
            }
        }
        // Responder handling is done via explicit method calls from ProximitySync
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
}
