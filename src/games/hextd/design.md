# Hex Tower Defense - Design Document

## Overview

A 1v1 online wave-based tower defense game on a 100x400 hex grid with Three.js 3D rendering.

**Key Features:**
- Pointy-topped hex grid with two height levels (low/high) and ramps
- 3 tower types (Light/Medium/Heavy) + Main Tower objective
- 3 unit types (Light/Medium/Heavy) - autonomous melee attackers
- Wave-based phases: Pre-Wave (20s) → Wave (40s) → Inter-Wave (5s)
- Ore economy with base income + mines on resource nodes
- AI opponent for single-player mode
- Host-authoritative P2P networking

---

## Game Rules

### Victory Condition
A player loses when their **Main Tower** HP reaches 0.

### Game Phases

| Phase | Duration | Actions Allowed |
|-------|----------|-----------------|
| Pre-Wave | 20s | Build towers, queue units, build mines, recycle towers |
| Wave | 40s | Build towers/mines only (no recycling), units fight |
| Inter-Wave | 5s | Cleanup, tower regeneration (except Main Tower) |

### Economy

- **Starting Ore**: 150
- **Base Income**: 2 ore/sec
- **Mine Income**: 3 ore/sec per mine
- **Mine Cost**: 80 ore
- **Recycle Refund**: 75% (Pre-Wave only)

---

## Units & Towers

### Tower Stats

| Type | Cost | HP | Damage | Cooldown | Range (hexes) |
|------|------|-----|--------|----------|---------------|
| Light | 60 | 200 | 15 | 0.7s | 4 |
| Medium | 100 | 280 | 28 | 1.0s | 4 |
| Heavy | 160 | 360 | 60 | 1.6s | 5 |
| Main | - | 1000 | 40 | 1.2s | 6 |

### Unit Stats

| Type | Cost | HP | Speed | Damage | Cooldown | Radius |
|------|------|-----|-------|--------|----------|--------|
| Light | 30 | 80 | 3.0 | 8 | 0.7s | 0.3 |
| Medium | 70 | 180 | 2.2 | 16 | 0.9s | 0.4 |
| Heavy | 140 | 380 | 1.6 | 34 | 1.2s | 0.5 |

### Combat Modifiers
- **High Ground Bonus**: +20% range when attacking targets on lower ground

---

## Map & Terrain

### Grid Specifications
- **Size**: 100 × 400 hexes (40,000 tiles)
- **Coordinate System**: Pointy-topped axial (q, r)
- **Height Levels**: 0 (low) and 1 (high)

### Tile Types

| Type | Description |
|------|-------------|
| EMPTY | Walkable ground |
| BLOCKED | Impassable terrain |
| RAMP | Connects height levels |
| RESOURCE_NODE | Can build mines here |
| TOWER_SLOT | Can build towers here |
| MAIN_TOWER_SLOT | Main tower location |

### Terrain Generation (Seeded)

1. Generate height map using multi-octave noise
2. Place main towers at opposite ends (q=5 and q=94)
3. Carve 3 primary lanes using Bezier curves
4. Add connecting paths between lanes
5. Place ramps at height transitions
6. Distribute tower slots along lanes (~80 per player)
7. Place resource nodes (3 safe per player, 5 contested in center)

---

## Architecture

### File Structure

```
src/games/hextd/
├── index.js                    # GameRegistry registration
├── config.js                   # Constants, stats, tile types
├── HexTDGame.js                # Main game class (extends GameEngine)
├── DESIGN.md                   # This file
│
├── core/
│   ├── HexGrid.js              # Axial coordinate system, tile storage
│   ├── HexMath.js              # Hex utilities (distance, neighbors, pixel conversion)
│   ├── TerrainGenerator.js     # Seeded procedural terrain with lanes
│   └── Pathfinder.js           # A* on hex grid with height/ramp support
│
├── entities/                   # (Future: separate entity classes)
│   ├── Tower.js
│   ├── Unit.js
│   └── Mine.js
│
├── systems/                    # (Future: separate system classes)
│   ├── EconomySystem.js
│   ├── WaveSystem.js
│   ├── CombatSystem.js
│   └── CollisionSystem.js
│
├── ai/                         # (Future: sophisticated AI)
│   ├── AIOpponent.js
│   ├── AIPlanner.js
│   ├── AIBuilder.js
│   └── AICommander.js
│
├── rendering/
│   ├── HexTDRenderer.js        # Main Three.js renderer
│   ├── CameraController.js     # Isometric camera with pan/zoom
│   ├── ChunkManager.js         # Frustum culling for 40k hexes
│   ├── HexMeshFactory.js       # Hex geometry/materials
│   ├── UnitRenderer.js         # Unit sphere/stick models
│   ├── TowerRenderer.js        # Tower models
│   └── UIOverlay.js            # 2D HUD canvas overlay
│
└── network/                    # (Future: optimized networking)
    └── StateEncoder.js
```

---

## Rendering

### Three.js Setup

- **Renderer**: WebGLRenderer with antialiasing
- **Camera**: PerspectiveCamera at 45° isometric angle
- **Lighting**: Ambient + Hemisphere + Directional (sun) + Fill

### Performance Optimizations

1. **Chunking**: 20×20 hex chunks (100 total chunks)
2. **Instanced Meshes**: One draw call per tile type per chunk
3. **Frustum Culling**: Only render visible chunks
4. **Typed Arrays**: Uint8Array for tiles, Float32Array for positions

### Camera Controls

- **Pan**: Drag with mouse/touch
- **Zoom**: Scroll wheel or pinch gesture
- **Bounds**: Constrained to map area
- **Focus**: Home key returns to player's base

---

## Networking

### Host-Authoritative Model

- Host runs all game simulation
- Guest sends actions, receives state updates
- State sync at 30Hz (every ~33ms)

### Message Types

| Message | Direction | Content |
|---------|-----------|---------|
| `hextd_state` | Host → Guest | Full or partial game state |
| `hextd_action` | Guest → Host | Build tower, queue unit |
| `forfeit_request` | Guest → Host | Player forfeits |
| `rematch_request` | Guest → Host | Request new game |

### State Structure

```javascript
{
    phase: 'PRE_WAVE' | 'WAVE' | 'INTER_WAVE' | 'GAME_OVER',
    waveNumber: 1,
    phaseStartTime: Date.now(),

    players: {
        p1: { ore: 150, mainTowerHP: 1000, pendingUnits: [], isAI: false },
        p2: { ore: 150, mainTowerHP: 1000, pendingUnits: [], isAI: true }
    },

    towers: [{ id, type, q, r, hp, owner, cooldown }],
    units: [{ id, type, q, r, hp, owner, cooldown, vx, vz }],
    mines: [{ id, q, r, owner }],

    mapSeed: 'abc123',
    nextEntityId: 1
}
```

---

## AI Opponent

### Difficulty Levels

| Level | Reaction Delay | Description |
|-------|----------------|-------------|
| Easy | 2000ms | Simple random choices |
| Medium | 1000ms | Basic lane analysis |
| Hard | 500ms | Counter-building strategy |

### AI Decision Making

During Pre-Wave phase:
1. Evaluate economic state
2. Decide tower placement (prioritize lane coverage)
3. Choose unit composition (counter enemy defenses)

---

## Controls

### Radial Menu (Primary - Touch/Mouse Friendly)

The game uses a radial menu system for building and actions:

1. **Center Button** (bottom center of screen): Opens/closes the radial menu
2. **Selection**: The tile at the center of the screen is always the selected tile
3. **Tap/Click on tile**: Pans camera to center on that tile (making it selected)
4. **Ring Buttons**: When menu is open, tap a button to navigate or execute action
5. **Back**: Tap center button when in a submenu to go back
6. **Close**: Tap game area outside menu to close

Menu hierarchy:
- **Build** (🏗️): Light Tower, Medium Tower, Heavy Tower, Mine, Recycle
- **Units** (⚔️): Light Unit, Medium Unit, Heavy Unit (Pre-Wave only)

### Keyboard Shortcuts (Secondary)

| Key | Action |
|-----|--------|
| Space | Toggle radial menu |
| 1 | Quick-build Light tower on center tile |
| 2 | Quick-build Medium tower on center tile |
| 3 | Quick-build Heavy tower on center tile |
| 4 | Quick-build Mine on center tile |
| R | Quick-recycle tower on center tile (Pre-Wave) |
| Q | Queue Light unit (Pre-Wave) |
| W | Queue Medium unit (Pre-Wave) |
| E | Queue Heavy unit (Pre-Wave) |
| Escape | Close radial menu |
| Home | Focus camera on your base |

### Camera Controls

| Input | Action |
|-------|--------|
| Drag | Pan camera |
| Scroll/Pinch | Zoom camera |
| Tap/Click tile | Pan to center on tile |

---

## Game Settings

```javascript
GameRegistry.register('hextd', {
    name: 'Hex TD',
    description: '1v1 tower defense on a hex grid',
    minPlayers: 1,
    maxPlayers: 2,
    icon: '🏰',
    supportsAI: true,
    settings: [
        { id: 'aiDifficulty', type: 'enum', options: ['Easy', 'Medium', 'Hard'] },
        { id: 'mapSeed', type: 'string', default: '' }
    ]
});
```

---

## Future Enhancements

### Phase 1 (Current)
- [x] Hex grid with height levels
- [x] Three.js 3D rendering
- [x] Basic tower/unit combat
- [x] Wave phases
- [x] Simple AI
- [x] P2P networking
- [x] A* pathfinding for units
- [x] High ground combat bonus (+20% range)
- [x] Unit vs unit combat
- [x] Mine building on resource nodes
- [x] Tower recycling (75% refund during PRE_WAVE)

### Phase 2 (Planned)
- [ ] Unit collision/steering behaviors
- [ ] Tower range indicators
- [ ] Attack animations/particles
- [ ] Sound effects

### Phase 3 (Future)
- [ ] Sophisticated AI (lane analysis, counter-building)
- [ ] Fog of war
- [ ] Tower upgrades
- [ ] Special abilities
- [ ] Replay system

---

## Hex Math Reference

### Axial Coordinates (Pointy-Topped)

```
Neighbor directions:
    NW    NE
      \  /
   W --⬡-- E
      /  \
    SW    SE

Direction vectors:
  E:  (+1,  0)
  NE: (+1, -1)
  NW: ( 0, -1)
  W:  (-1,  0)
  SW: (-1, +1)
  SE: ( 0, +1)
```

### Coordinate Conversions

```javascript
// Hex to pixel (center point)
x = size * (√3 * q + √3/2 * r)
z = size * (3/2 * r)

// Pixel to hex (fractional)
q = (√3/3 * x - 1/3 * z) / size
r = (2/3 * z) / size

// Hex distance (Manhattan in cube coords)
distance = max(|Δq|, |Δr|, |Δq + Δr|)
```

---

## Constants Quick Reference

```javascript
// Map
MAP_WIDTH = 100
MAP_HEIGHT = 400
CHUNK_SIZE = 20

// Timing (ms)
PRE_WAVE = 20000
WAVE = 40000
INTER_WAVE = 5000

// Economy
STARTING_ORE = 150
BASE_INCOME = 2/sec
MINE_INCOME = 3/sec
MINE_COST = 80
RECYCLE_RATIO = 0.75

// Combat
HIGH_GROUND_BONUS = 20%

// Network
STATE_SYNC_RATE = 30Hz
```
