// ProximityDetector - Ultrasonic proximity detection using Web Audio API
// Emits and detects ultrasonic chirps to estimate distance between devices

const ULTRASONIC_FREQ = 19000;      // 19kHz - inaudible to most adults
const CHIRP_DURATION = 0.05;        // 50ms chirp
const SAMPLE_RATE = 44100;
const SPEED_OF_SOUND_FPS = 1125;    // feet per second at room temp
const DETECTION_THRESHOLD = 0.15;   // Amplitude threshold for chirp detection
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
        this.currentDistance = 6;       // Default 6 feet (fallback)
        this.smoothedDistance = 6;

        // Chirp timing
        this.lastChirpTime = 0;
        this.pendingChirp = false;
        this.chirpSentTime = 0;

        // Callbacks
        this.onDistanceUpdate = null;
        this.onChirpDetected = null;

        // Detection buffers
        this.frequencyData = null;
        this.detectionLoop = null;
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

            console.log('ProximityDetector started');
            return true;

        } catch (error) {
            console.warn('ProximityDetector unavailable:', error.message);
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
        console.log('ProximityDetector stopped');
    }

    // Emit an ultrasonic chirp
    emitChirp() {
        if (!this.isAvailable || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(ULTRASONIC_FREQ, this.audioContext.currentTime);

        // Quick fade in/out to reduce artifacts
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, this.audioContext.currentTime + 0.005);
        gainNode.gain.linearRampToValueAtTime(0.5, this.audioContext.currentTime + CHIRP_DURATION - 0.005);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + CHIRP_DURATION);

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + CHIRP_DURATION);

        this.chirpSentTime = performance.now();
        this.pendingChirp = true;

        // Clear pending after timeout (max reasonable distance)
        setTimeout(() => {
            this.pendingChirp = false;
        }, 500);
    }

    // Start the detection loop
    startDetectionLoop() {
        const detect = () => {
            if (!this.isRunning) return;

            this.analyser.getByteFrequencyData(this.frequencyData);

            // Find the bin for our ultrasonic frequency
            const binIndex = Math.round(ULTRASONIC_FREQ / (SAMPLE_RATE / this.analyser.fftSize));

            // Check a few bins around our target frequency
            let maxAmplitude = 0;
            for (let i = binIndex - 2; i <= binIndex + 2; i++) {
                if (i >= 0 && i < this.frequencyData.length) {
                    maxAmplitude = Math.max(maxAmplitude, this.frequencyData[i] / 255);
                }
            }

            // Chirp detected
            if (maxAmplitude > DETECTION_THRESHOLD) {
                this.handleChirpDetected();
            }

            this.detectionLoop = requestAnimationFrame(detect);
        };

        detect();
    }

    // Handle detected chirp
    handleChirpDetected() {
        const now = performance.now();

        // Debounce - ignore detections within 100ms of each other
        if (now - this.lastChirpTime < 100) return;
        this.lastChirpTime = now;

        // If we sent a chirp and are waiting for response
        if (this.pendingChirp && this.chirpSentTime > 0) {
            const roundTripMs = now - this.chirpSentTime;
            // Divide by 2 for one-way distance
            const distanceFeet = (roundTripMs / 1000) * SPEED_OF_SOUND_FPS / 2;

            // Sanity check - ignore unrealistic distances
            if (distanceFeet > 0.5 && distanceFeet < 50) {
                this.updateDistance(distanceFeet);
            }

            this.pendingChirp = false;
        }

        // Notify callback (for sync coordination)
        if (this.onChirpDetected) {
            this.onChirpDetected(now);
        }
    }

    // Update distance with smoothing
    updateDistance(rawDistance) {
        this.currentDistance = rawDistance;
        this.smoothedDistance = this.smoothedDistance * (1 - SMOOTHING_FACTOR) +
                                rawDistance * SMOOTHING_FACTOR;

        if (this.onDistanceUpdate) {
            this.onDistanceUpdate(this.smoothedDistance);
        }
    }

    // Get current distance estimate (feet)
    getDistance() {
        return this.smoothedDistance;
    }

    // Check if proximity detection is available
    getIsAvailable() {
        return this.isAvailable;
    }

    // Set distance externally (from network sync)
    setDistance(distance) {
        this.updateDistance(distance);
    }
}
