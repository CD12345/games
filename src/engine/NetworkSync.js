// Network Sync - Handle real-time state synchronization via PeerJS

import {
    subscribeToState,
    subscribeToInputs,
    sendStateUpdate,
    sendInputUpdate,
    isUserHost
} from '../core/gameSession.js';

export class NetworkSync {
    constructor(gameCode, isHost) {
        this.gameCode = gameCode;
        this.isHost = isHost;

        // State
        this.localState = null;
        this.remoteState = null;
        this.remoteInput = null;

        // Interpolation
        this.previousState = null;
        this.stateTimestamp = 0;
        this.interpolationAlpha = 0;

        // Sync timing
        this.lastSyncTime = 0;
        this.syncInterval = 1000 / 30;  // 30 syncs per second

        // Callbacks
        this.onStateUpdate = null;
        this.onInputUpdate = null;

        // Subscriptions
        this.stateUnsubscribe = null;
        this.inputsUnsubscribe = null;
    }

    // Start listening to remote updates
    start() {
        if (!this.isHost) {
            // Guest: Subscribe to state updates from host
            this.stateUnsubscribe = subscribeToState(this.gameCode, (state) => {
                if (state) {
                    this.previousState = this.remoteState;
                    this.remoteState = state;
                    this.stateTimestamp = Date.now();
                    this.interpolationAlpha = 0;

                    if (this.onStateUpdate) {
                        this.onStateUpdate(state);
                    }
                }
            });
        } else {
            // Host: Subscribe to input updates from guest
            this.inputsUnsubscribe = subscribeToInputs(this.gameCode, (input) => {
                if (input) {
                    this.remoteInput = input;
                    if (this.onInputUpdate) {
                        this.onInputUpdate(input);
                    }
                }
            });
        }
    }

    // Stop listening
    stop() {
        if (this.stateUnsubscribe) {
            this.stateUnsubscribe();
            this.stateUnsubscribe = null;
        }
        if (this.inputsUnsubscribe) {
            this.inputsUnsubscribe();
            this.inputsUnsubscribe = null;
        }
    }

    // Send local input (guest -> host)
    sendInput(input) {
        if (!this.isHost) {
            sendInputUpdate({
                ...input,
                timestamp: Date.now()
            });
        }
    }

    // Send game state (host -> guest)
    sendState(state) {
        if (!this.isHost) return;

        const now = Date.now();
        if (now - this.lastSyncTime < this.syncInterval) {
            return; // Throttle updates
        }
        this.lastSyncTime = now;

        sendStateUpdate({
            ...state,
            timestamp: now
        });
    }

    // Get remote input (for host)
    getRemoteInput() {
        return this.remoteInput;
    }

    // Update interpolation (call each frame)
    updateInterpolation(deltaTime) {
        // Move towards 1 over the sync interval
        const rate = deltaTime / (this.syncInterval / 1000);
        this.interpolationAlpha = Math.min(1, this.interpolationAlpha + rate);
    }

    // Interpolate between previous and current state
    interpolate(key, subkey = null) {
        if (!this.previousState || !this.remoteState) {
            return subkey
                ? this.remoteState?.[key]?.[subkey]
                : this.remoteState?.[key];
        }

        const prev = subkey
            ? this.previousState[key]?.[subkey]
            : this.previousState[key];
        const curr = subkey
            ? this.remoteState[key]?.[subkey]
            : this.remoteState[key];

        if (typeof prev !== 'number' || typeof curr !== 'number') {
            return curr;
        }

        return prev + (curr - prev) * this.interpolationAlpha;
    }
}
