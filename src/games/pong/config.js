// Pong game configuration and constants

export const PONG_CONFIG = {
    // Canvas aspect ratio (portrait mode: 9:16)
    aspectRatio: 9 / 16,

    // Ball settings
    ball: {
        radius: 0.02,           // Relative to canvas width
        initialSpeed: 0.008,    // Initial velocity per frame
        maxSpeed: 0.02,         // Maximum velocity
        speedIncrease: 1.05     // Speed multiplier on paddle hit
    },

    // Paddle settings
    paddle: {
        width: 0.2,             // Relative to canvas width
        height: 0.025,          // Relative to canvas height
        offset: 0.03,           // Distance from edge
        speed: 0.03             // Movement speed per frame (for keyboard)
    },

    // Game settings
    game: {
        launchDelay: 2000,      // ms before ball launches
        pointsToWin: 5,         // Score needed to win
        syncRate: 30            // State syncs per second
    }
};

// Initial game state
export function getInitialState() {
    return {
        ball: {
            x: 0.5,
            y: 0.5,
            vx: 0,
            vy: 0,
            onPaddle: 'p1'      // Ball starts on player 1's paddle
        },
        paddles: {
            p1: 0.5,            // Y position (0-1)
            p2: 0.5
        },
        scores: {
            p1: 0,
            p2: 0
        },
        round: {
            phase: 'countdown', // 'countdown', 'playing', 'scored', 'gameover'
            startTime: Date.now(),
            lastScorer: null,
            winner: null,
            forfeitBy: null
        }
    };
}
