// Debug game configuration

export const DEBUG_CONFIG = {
    aspectRatio: 9 / 16,
    syncRate: 10  // Lower sync rate for debug info
};

export function getInitialState() {
    return {
        stats: {
            packetsSent: 0,
            packetsReceived: 0,
            latency: 0
        }
    };
}
