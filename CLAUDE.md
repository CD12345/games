# CLAUDE.md

> **Sync Notice:** This file is mirrored as `AGENTS.MD`. If you edit either file, copy your changes to the other to keep them in sync.

This file provides guidance to Claude Code (claude.ai/code) or Codex when working with code in this repository.

## Project Overview

A browser-based multiplayer party games platform using peer-to-peer (P2P) WebRTC connections via PeerJS. Currently implements Pong with support for adding more games through a plugin registry system.

## Development

This is a vanilla JavaScript project with no build step. Serve the files with any static HTTP server:
```bash
npx serve .
# or
python -m http.server 8000
```

Open `index.html` for the lobby/menu or `game.html?code=XXXX&host=true&game=pong` directly for testing.

## Architecture

### Two-Page Structure
- **index.html + src/main.js**: Lobby system - game creation, joining via 4-letter codes, player waiting room
- **game.html + src/game.js**: Active gameplay - canvas rendering, game loop, real-time sync

### Networking Model (Host-Authoritative)
- Host creates a game and gets a 4-letter code (used as PeerJS peer ID)
- Guest joins by connecting to that peer ID
- Host runs game simulation and sends state updates at 30Hz
- Guest sends input to host and interpolates received state for smooth visuals
- All P2P messaging uses `sendMessage(type, payload)` / `onMessage(type, handler)` pattern

### Key Modules
- **src/core/peer.js**: PeerJS wrapper - connection management, message routing, TURN server credentials
- **src/core/gameSession.js**: Session lifecycle - create/join/start/leave game, player tracking
- **src/engine/GameEngine.js**: Base class with game loop (requestAnimationFrame), delta time, canvas management
- **src/engine/NetworkSync.js**: State synchronization with interpolation for guests
- **src/engine/InputManager.js**: Touch, mouse, and keyboard input (Arrow keys/WASD)
- **src/engine/ProximityDetector.js**: Audio-based distance measurement using DS-TWR algorithm
- **src/engine/ProximitySync.js**: Network coordination for proximity ranging between devices
- **src/ui/DebugOverlay.js**: Debug logging overlay (enable with `?debug=1` URL parameter)
- **src/games/GameRegistry.js**: Plugin system for registering games

### Adding a New Game

1. Create folder `src/games/[gamename]/` with:
   - `config.js` - game constants and `getInitialState()` function
   - `[GameName]Game.js` - extends `GameEngine`, implements `update()` and `render()`
   - `[GameName]Renderer.js` - drawing logic (optional, can be in game class)
   - `index.js` - registers game with `GameRegistry.register()`

2. Import the game in both entry points:
   - `src/main.js` (for lobby game list)
   - `src/game.js` (for gameplay)

3. Game class constructor receives: `(canvas, gameCode, isHost, playerNumber)`

### Coordinate System
All game coordinates are normalized (0-1 range) and scaled during rendering. This ensures consistent behavior across different screen sizes.

### Proximity Detection (DS-TWR)
Uses Double-Sided Two-Way Ranging to measure distance between devices via ultrasonic audio chirps.

**Signal Design:**
- Linear frequency chirp sweeping 14kHz → 16kHz over 30ms
- Raised cosine envelope for smooth start/end (reduces spectral leakage)
- Chirp template pre-generated for matched filter correlation

**Detection Pipeline:**
1. **AudioWorklet** (`chirp-detector-worklet.js`) processes audio in real-time
2. **Goertzel algorithm** detects energy in chirp band (fast single-frequency detection)
3. When energy exceeds threshold, buffer is sent to main thread
4. **Matched filter correlation** slides chirp template across buffer to find precise arrival
5. **Parabolic interpolation** refines peak location for sub-sample accuracy
6. Frame number converted to `performance.now()` timebase with latency compensation

**Timing Accuracy:**
- AudioWorklet provides sample-accurate frame numbers
- Matched filter correlation finds chirp start within the buffer
- Parabolic interpolation: `offset = (y0 - y2) / (2 * (y0 - 2*y1 + y2))` gives sub-sample precision
- Latency compensation accounts for audio output/input pipeline delays

**Half-duplex protocol** - never emit and listen simultaneously:
- When emitting, worklet ignores detections until chirp ends
- After detecting, wait 50ms before responding (ensures sender's chirp has ended)
- 30ms deaf period after emission to avoid self-echo

**DS-TWR Algorithm flow:**
1. Host emits chirp (30ms), records T_tx1, enters wait_rx1 state
2. Guest detects chirp (T_rx1), waits 50ms, then emits response (T_tx1)
3. Host detects response (T_rx1), waits 50ms, emits chirp 2 (T_tx2)
4. Guest detects chirp 2 (T_rx2), sends timing data via network
5. Host calculates: `ToF = [(Tround1 × Tround2) − (Treply1 × Treply2)] / (Tround1 + Tround2 + Treply1 + Treply2)`
6. Distance = ToF × speed of sound (1125 ft/s)

DS-TWR cancels clock drift errors by using timing measurements from both devices.

**Fallback Mode:**
If AudioWorklet is unavailable, falls back to AnalyserNode with threshold-based detection (less accurate but more compatible).

### TURN Server Configuration
P2P connections use Metered.ca TURN servers for NAT traversal. Credentials are fetched dynamically in `src/core/peer.js`. Required for cross-network connections (e.g., phone to PC on different networks).

### Debug Mode
Add `?debug=1` to any URL to enable the debug overlay:
- Bottom-left: scrolling log messages
- Bottom-center: real-time value display (e.g., audio amplitude)
- Tap log to open full log overlay
- Use `debugLog(msg)` and `debugSetValue(val)` from `src/ui/DebugOverlay.js`
