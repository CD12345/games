// AudioWorklet processor for sample-accurate chirp detection
// This runs in a separate audio thread for precise timing

class ChirpDetectorProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        const opts = options.processorOptions || {};
        this.sampleRate = opts.sampleRate || 44100;
        this.bufferSize = opts.bufferSize || 4096;
        this.freqStart = opts.freqStart || 14000;
        this.freqEnd = opts.freqEnd || 16000;
        this.threshold = opts.threshold || 0.015;

        // Circular buffer for recent samples
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferWriteIndex = 0;
        this.samplesWritten = 0;

        // Detection state
        this.detecting = false;
        this.cooldownSamples = 0;
        this.cooldownDuration = Math.floor(this.sampleRate * 0.08); // 80ms cooldown

        // Goertzel parameters for band energy detection
        // We'll check energy at multiple frequencies across the chirp band
        this.goertzelParams = this.initGoertzel();

        // Tracking for when we're told to ignore (during emit)
        this.ignoreUntilFrame = 0;

        // Listen for control messages
        this.port.onmessage = (event) => {
            if (event.data.type === 'setThreshold') {
                this.threshold = event.data.value;
            } else if (event.data.type === 'ignoreUntil') {
                this.ignoreUntilFrame = event.data.frame;
            }
        };
    }

    initGoertzel() {
        // Set up Goertzel detectors at start, middle, and end of chirp band
        const blockSize = 128; // Process in 128-sample blocks for Goertzel
        const frequencies = [
            this.freqStart,
            (this.freqStart + this.freqEnd) / 2,
            this.freqEnd
        ];

        return frequencies.map(freq => {
            const k = Math.round(freq * blockSize / this.sampleRate);
            const w = 2 * Math.PI * k / blockSize;
            return {
                freq,
                k,
                w,
                coeff: 2 * Math.cos(w),
                blockSize
            };
        });
    }

    // Goertzel algorithm for efficient single-frequency magnitude
    goertzelMagnitude(samples, params) {
        let s0 = 0, s1 = 0, s2 = 0;
        const len = Math.min(samples.length, params.blockSize);

        for (let i = 0; i < len; i++) {
            s0 = samples[i] + params.coeff * s1 - s2;
            s2 = s1;
            s1 = s0;
        }

        const real = s1 - s2 * Math.cos(params.w);
        const imag = s2 * Math.sin(params.w);
        return Math.sqrt(real * real + imag * imag) / len;
    }

    // Check if chirp-band energy exceeds threshold
    detectChirpEnergy(samples) {
        let totalEnergy = 0;
        for (const params of this.goertzelParams) {
            totalEnergy += this.goertzelMagnitude(samples, params);
        }
        return totalEnergy / this.goertzelParams.length;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const samples = input[0];
        const blockSize = samples.length;

        // Write samples to circular buffer
        for (let i = 0; i < blockSize; i++) {
            this.buffer[this.bufferWriteIndex] = samples[i];
            this.bufferWriteIndex = (this.bufferWriteIndex + 1) % this.bufferSize;
        }
        this.samplesWritten += blockSize;

        // Update cooldown
        if (this.cooldownSamples > 0) {
            this.cooldownSamples = Math.max(0, this.cooldownSamples - blockSize);
        }

        // Check if we should ignore (during our own emission)
        if (currentFrame < this.ignoreUntilFrame) {
            return true;
        }

        // Detect chirp energy
        if (this.cooldownSamples === 0) {
            const energy = this.detectChirpEnergy(samples);

            if (energy > this.threshold && !this.detecting) {
                this.detecting = true;

                // Linearize the circular buffer (oldest to newest)
                const linearBuffer = new Float32Array(this.bufferSize);
                for (let i = 0; i < this.bufferSize; i++) {
                    linearBuffer[i] = this.buffer[(this.bufferWriteIndex + i) % this.bufferSize];
                }

                // Calculate the frame number at the start of the buffer
                const bufferStartFrame = currentFrame - this.bufferSize;

                // Send detection event to main thread
                this.port.postMessage({
                    type: 'chirpDetected',
                    buffer: linearBuffer,
                    bufferStartFrame: bufferStartFrame,
                    triggerFrame: currentFrame,
                    energy: energy
                });

                this.cooldownSamples = this.cooldownDuration;

            } else if (energy < this.threshold * 0.3) {
                this.detecting = false;
            }
        }

        return true;
    }
}

registerProcessor('chirp-detector-processor', ChirpDetectorProcessor);
