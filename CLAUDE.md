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
- **src/core/peer.js**: PeerJS wrapper - connection management, message routing
- **src/core/gameSession.js**: Session lifecycle - create/join/start/leave game, player tracking
- **src/engine/GameEngine.js**: Base class with game loop (requestAnimationFrame), delta time, canvas management
- **src/engine/NetworkSync.js**: State synchronization with interpolation for guests
- **src/engine/InputManager.js**: Touch, mouse, and keyboard input (Arrow keys/WASD)
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
