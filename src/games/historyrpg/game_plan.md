# History RPG - Implementation Plan

## Overview

An AI-generated historical open-world RPG where players pick a time period, location, and character type. AI generates a scenario "skeleton" with goals and narrative, with details generated on-demand as players explore. Uses 2.5D isometric view with FPV cutscenes for interactions.

**MVP Target**: WW2 Stalingrad, November 1942

## Core Concepts

- **Open-world RPG** with conversations, choices, consequences
- **AI-generated narrative** via Claude or ChatGPT API
- **Historical accuracy** with ability to "change history"
- **All player modes**: Single-player, co-op, competitive
- **Generation strategy**: Upfront skeleton + detailed path to goal, less detail off-path, on-demand generation

## Architecture

```
src/games/historyrpg/
    index.js                    # GameRegistry registration
    config.js                   # Constants, initial state, settings
    HistoryRPGGame.js           # Main game class (extends GameEngine)

    core/
        ScenarioManager.js      # Scenario state, generation requests
        WorldGrid.js            # Tile-based world (typed arrays like HexGrid)
        EntityManager.js        # NPCs, player, items
        EventSystem.js          # Historical events, triggers
        QuestManager.js         # Goals, objectives tracking

    ai/
        AIGateway.js            # API key management, request routing
        PromptBuilder.js        # Prompt templates for different needs
        ResponseParser.js       # Parse AI responses to game structures
        GenerationQueue.js      # Prioritized generation queue

    rendering/
        IsometricRenderer.js    # 2.5D world rendering
        TileFactory.js          # Blocky sprite generation
        CharacterRenderer.js    # NPC/player sprites
        CutsceneRenderer.js     # FPV static scene rendering

    ui/
        DialoguePanel.js        # NPC conversation interface
        ChoiceSelector.js       # Decision UI
        JournalPanel.js         # Quest log
        InventoryPanel.js       # Items

    data/stalingrad/            # Pre-built MVP scenario data
```

## AI Integration

### API Key Handling (No Server Required)

Three modes:
1. **Local**: User provides their own API key (stored in localStorage)
2. **Gateway**: One player acts as "AI host" - their browser holds the key, others route requests through them via P2P
3. **Shared**: Each player uses their own key

Gateway player concept fits the existing P2P architecture:
```javascript
// Guest sends AI request to host
{ type: 'ai_request', payload: { requestId, promptType, context } }

// Host makes API call, sends response back
{ type: 'ai_response', payload: { requestId, success, data } }
```

### Prompt Templates

Structured prompts that return parseable JSON:
- `SCENARIO_SKELETON` - Generate initial scenario with locations, NPCs, events, goal path
- `NPC_DIALOGUE` - In-character responses with choices
- `LOCATION_DETAIL` - Features, exits, atmosphere, items

### Generation Priority Queue

| Priority | Content Type | When Generated |
|----------|--------------|----------------|
| 0 (Critical) | Scenario skeleton | Game start |
| 1 (Critical) | Player start area | After skeleton |
| 2 (High) | NPC dialogue | When player talks |
| 3 (High) | Adjacent chunks | Player near edge |
| 4 (Medium) | Location details | Player enters |
| 5 (Low) | Far terrain | Background |

## Scenario Format

```json
{
    "scenario": {
        "title": "The Siege of Stalingrad",
        "timePeriod": "World War 2",
        "date": "November 1942",
        "mainGoal": { "id": "escape_city", "description": "..." },
        "goalPath": [
            { "step": 1, "objective": "Find supplies", "detail_level": "high" },
            { "step": 2, "objective": "Obtain documents", "detail_level": "medium" }
        ],
        "keyLocations": [...],
        "keyNPCs": [...],
        "historicalEvents": [...]
    }
}
```

## Rendering

### Isometric View (2.5D)
- Canvas 2D with isometric projection (2:1 ratio)
- Blocky Minecraft-style sprites (pre-generated)
- Back-to-front rendering for occlusion
- Camera follows player, zoom support

### Level of Detail (LOD)
- HIGH: 16x16 chunks, full detail (near player)
- MEDIUM: 8x8 chunks, reduced features
- LOW: 4x4 chunks, silhouettes
- MINIMAL: Single color blocks (distant)

### FPV Cutscenes
- Static scenes for NPC interactions, room details
- Procedurally generated blocky backgrounds
- NPC portrait + dialogue box overlay
- Choice buttons for player decisions

## Map System

### WorldGrid (based on HexGrid patterns)
```javascript
this.tiles = new Uint8Array(width * height);      // Tile type
this.heights = new Uint8Array(width * height);    // 0-15 levels
this.visibility = new Uint8Array(width * height); // Fog of war
```

### Geography
- Try real elevation data (OpenTopoData API - free, no key)
- Fallback: AI-generated terrain based on location description
- Seeded procedural generation for consistency

## Implementation Phases

### Phase 1: Core Infrastructure ✅
- Create folder structure and register game
- Basic WorldGrid and IsometricRenderer
- Camera panning, tile rendering
- **Deliverable**: Empty isometric world loads

### Phase 2: AI Integration ✅
- AIGateway with local API key support
- PromptBuilder templates
- ResponseParser with JSON extraction
- GenerationQueue for request management
- API key settings in lobby UI
- **Deliverable**: Can send prompts, receive parsed responses

### Phase 3: Scenario System
- ScenarioManager for state
- Pre-built stalingrad/scenario.json
- EventSystem for historical triggers
- Time progression
- **Deliverable**: Stalingrad scenario loads

### Phase 4: World Generation
- Complete IsometricRenderer with occlusion
- TileFactory for blocky sprites
- Chunk loading/unloading with LOD
- Fog of war
- TerrainGenerator with seeded noise
- **Deliverable**: Navigable procedural world

### Phase 5: Entity System
- EntityManager for NPCs/player
- CharacterRenderer for sprites
- Pathfinding (adapt HexTD Pathfinder)
- NPC behavior state machine
- Player movement and collision
- **Deliverable**: Player walks, NPCs exist

### Phase 6: Dialogue System
- DialoguePanel UI
- ChoiceSelector for player responses
- Conversation state tracking
- AI dialogue generation
- Disposition/relationship tracking
- **Deliverable**: Talk to NPCs, AI responds

### Phase 7: Quest and Inventory
- QuestManager and JournalPanel
- InventoryPanel UI
- Item pickup/use mechanics
- Quest progression triggers
- **Deliverable**: Pick up items, complete objectives

### Phase 8: Cutscenes
- CutsceneRenderer for FPV scenes
- Transition animations
- Key story moments as cutscenes
- **Deliverable**: FPV interaction scenes

### Phase 9: Multiplayer
- Extend NetworkSync for RPG state
- Full "AI gateway" mode
- Player synchronization
- Competitive "change history" mode
- **Deliverable**: Two players can play together

### Phase 10: MVP Polish
- Complete Stalingrad pre-built content
- 3-5 key NPCs with dialogue
- Main quest line end-to-end
- 2-3 optional objectives
- Performance optimization
- **Deliverable**: Playable 1-2 hour experience

## Key Files to Reference

| File | Pattern to Reuse |
|------|------------------|
| `src/games/hextd/HexTDGame.js` | Full game implementation with networking, AI, state |
| `src/games/hextd/core/HexGrid.js` | Efficient grid storage with typed arrays |
| `src/games/hextd/core/TerrainGenerator.js` | Seeded procedural generation |
| `src/games/hextd/core/Pathfinder.js` | A* pathfinding on grid |
| `src/engine/GameEngine.js` | Base class to extend |
| `src/games/GameRegistry.js` | Registration with settings |

## Technical Notes

- **Rate limits**: Cache aggressively, pre-generate where possible, show loading indicators
- **Performance**: Typed arrays for grids, chunk culling, sprite caching
- **Error handling**: Fallback to generic responses if AI fails
- **Mobile**: Tap-to-move, responsive UI, reduced chunk distance
