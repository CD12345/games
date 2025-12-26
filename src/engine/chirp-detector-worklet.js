// AudioWorklet processor for continuous matched filter chirp detection
// Runs correlation on every audio block and detects peaks above noise floor

class ChirpDetectorProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        const opts = options.processorOptions || {};
        this.sampleRate = opts.sampleRate || 44100;
        this.chirpSamples = opts.chirpSamples || 1323; // 30ms at 44.1kHz
        this.freqStart = opts.freqStart || 14000;
        this.freqEnd = opts.freqEnd || 16000;
        this.chirpDuration = opts.chirpDuration || 0.030;

        // Generate chirp template for correlation
        this.chirpTemplate = this.generateChirpTemplate();
        this.templateEnergy = this.computeEnergy(this.chirpTemplate);

        // Circular buffer for incoming audio (need enough for correlation)
        // Buffer size = chirp length + some margin for sliding
        this.bufferSize = this.chirpSamples * 3;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferWriteIndex = 0;
        this.totalSamplesReceived = 0;

        // Noise estimation
        this.noiseFloor = 0;
        this.noiseFloorInitialized = false;
        this.calibrationSamples = Math.floor(this.sampleRate * 1.0); // 1 second calibration
        this.calibrationCorrelations = [];
        this.noiseUpdateAlpha = 0.01; // Slow update for noise floor

        // Detection state
        this.lastPeakFrame = 0;
        this.minPeakInterval = Math.floor(this.sampleRate * 0.08); // 80ms between detections
        this.snrThresholdDb = 12; // Detect when 12dB above noise (was 3dB - too sensitive)
        this.snrThresholdLinear = Math.pow(10, this.snrThresholdDb / 20); // ~4.0
        this.minCorrelation = 0.15; // Minimum absolute correlation to detect (real chirps are 0.5+)

        // Periods to exclude from noise estimation (during known transmissions)
        this.excludeUntilFrame = 0;
        this.excludeRanges = []; // Array of {start, end} frame ranges

        // Listen for control messages
        this.port.onmessage = (event) => {
            if (event.data.type === 'excludeRange') {
                // Exclude a range of frames from noise estimation
                this.excludeRanges.push({
                    start: event.data.startFrame,
                    end: event.data.endFrame
                });
                // Keep only recent ranges
                const now = currentFrame;
                this.excludeRanges = this.excludeRanges.filter(r => r.end > now - this.sampleRate);
            } else if (event.data.type === 'reset') {
                this.noiseFloorInitialized = false;
                this.calibrationCorrelations = [];
                this.excludeRanges = [];
            }
        };
    }

    generateChirpTemplate() {
        const template = new Float32Array(this.chirpSamples);
        const freqSlope = (this.freqEnd - this.freqStart) / this.chirpDuration;

        for (let i = 0; i < this.chirpSamples; i++) {
            const t = i / this.sampleRate;
            // Linear frequency chirp phase
            const phase = 2 * Math.PI * (this.freqStart * t + 0.5 * freqSlope * t * t);

            // Raised cosine envelope
            const fadeTime = 0.003;
            let envelope = 1;
            if (t < fadeTime) {
                envelope = 0.5 * (1 - Math.cos(Math.PI * t / fadeTime));
            } else if (t > this.chirpDuration - fadeTime) {
                envelope = 0.5 * (1 + Math.cos(Math.PI * (t - this.chirpDuration + fadeTime) / fadeTime));
            }

            template[i] = Math.sin(phase) * envelope;
        }

        return template;
    }

    computeEnergy(arr) {
        let sum = 0;
        for (let i = 0; i < arr.length; i++) {
            sum += arr[i] * arr[i];
        }
        return sum;
    }

    // Check if a frame is in an excluded range (during known transmissions)
    isExcludedFrame(frame) {
        for (const range of this.excludeRanges) {
            if (frame >= range.start && frame <= range.end) {
                return true;
            }
        }
        return false;
    }

    // Compute normalized correlation at a specific lag
    correlateAt(lag) {
        let sum = 0;
        let signalEnergy = 0;

        for (let i = 0; i < this.chirpSamples; i++) {
            const bufIdx = (lag + i) % this.bufferSize;
            const sample = this.buffer[bufIdx];
            sum += sample * this.chirpTemplate[i];
            signalEnergy += sample * sample;
        }

        // Normalized correlation coefficient
        const denom = Math.sqrt(signalEnergy * this.templateEnergy);
        return denom > 0.0001 ? sum / denom : 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const samples = input[0];
        const blockSize = samples.length;
        const blockStartFrame = currentFrame;

        // Write samples to circular buffer
        for (let i = 0; i < blockSize; i++) {
            this.buffer[this.bufferWriteIndex] = samples[i];
            this.bufferWriteIndex = (this.bufferWriteIndex + 1) % this.bufferSize;
        }
        this.totalSamplesReceived += blockSize;

        // Need enough samples for correlation
        if (this.totalSamplesReceived < this.chirpSamples + blockSize) {
            return true;
        }

        // Compute correlation at the position where new samples just arrived
        // The correlation looks at the last chirpSamples samples before current write position
        const correlationLag = (this.bufferWriteIndex - this.chirpSamples - blockSize + this.bufferSize) % this.bufferSize;
        const correlation = Math.abs(this.correlateAt(correlationLag));

        // Frame number where this correlation peak would represent chirp start
        const peakFrame = blockStartFrame - this.chirpSamples;

        // Check if this frame is excluded (during our own transmission)
        const isExcluded = this.isExcludedFrame(peakFrame) || this.isExcludedFrame(blockStartFrame);

        // During calibration, collect correlation values from non-excluded periods
        if (!this.noiseFloorInitialized) {
            if (!isExcluded && this.totalSamplesReceived <= this.calibrationSamples + this.chirpSamples) {
                this.calibrationCorrelations.push(correlation);
            }

            // End of calibration
            if (this.totalSamplesReceived >= this.calibrationSamples + this.chirpSamples) {
                if (this.calibrationCorrelations.length > 0) {
                    // Use 90th percentile as noise floor estimate
                    this.calibrationCorrelations.sort((a, b) => a - b);
                    const p90Index = Math.floor(this.calibrationCorrelations.length * 0.9);
                    this.noiseFloor = this.calibrationCorrelations[p90Index];
                } else {
                    this.noiseFloor = 0.1; // Default if no calibration data
                }
                this.noiseFloorInitialized = true;

                this.port.postMessage({
                    type: 'calibrated',
                    noiseFloor: this.noiseFloor,
                    samples: this.calibrationCorrelations.length
                });
            }
            return true;
        }

        // Update noise floor with non-excluded, non-peak samples
        if (!isExcluded && correlation < this.noiseFloor * this.snrThresholdLinear) {
            // This is likely noise, update the floor slowly
            this.noiseFloor = this.noiseFloor * (1 - this.noiseUpdateAlpha) + correlation * this.noiseUpdateAlpha;
        }

        // Detection: correlation > noise floor * threshold, above minimum, and not in cooldown
        const threshold = this.noiseFloor * this.snrThresholdLinear;
        const timeSinceLastPeak = peakFrame - this.lastPeakFrame;

        // Require both SNR threshold AND minimum absolute correlation
        // This prevents detecting noise even when noise floor is very low
        if (!isExcluded && correlation > threshold && correlation >= this.minCorrelation && timeSinceLastPeak > this.minPeakInterval) {
            this.lastPeakFrame = peakFrame;

            // Send detection to main thread
            this.port.postMessage({
                type: 'chirpDetected',
                peakFrame: peakFrame,
                correlation: correlation,
                noiseFloor: this.noiseFloor,
                snr: 20 * Math.log10(correlation / this.noiseFloor)
            });
        }

        return true;
    }
}

registerProcessor('chirp-detector-processor', ChirpDetectorProcessor);
