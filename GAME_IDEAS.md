# Game Ideas for Multiplayer Platform

This document contains brainstormed game concepts for the P2P multiplayer platform. The design philosophy follows Gigamic-style board games: **simple rules (1-2 minutes to learn) that lead to deep strategic gameplay**.

## Design Philosophy

Inspired by Gigamic's modern classics like Qoridor, Quarto, and Pylos, these games share common traits:

- **Minimalist Rules**: Players can understand the full rule set in under 2 minutes
- **Strategic Depth**: Simple mechanics create complex decision trees
- **No Hidden Information**: Perfect information games where skill determines outcomes
- **Quick Play**: Games complete in 5-15 minutes
- **Elegant Components**: Clean visual design with few game pieces
- **Emergent Complexity**: Strategy emerges from interactions, not from rule complexity

## Implementation Status

- ✅ **Corridor Chase** - Implemented
- ⏳ **Pattern Match** - Not yet implemented
- ⏳ **Claim Territory** - Not yet implemented
- ⏳ **Stack Race** - Not yet implemented
- ⏳ **Slide Puzzle Battle** - Not yet implemented
- ⏳ **Connection** - Not yet implemented
- ⏳ **Tug of War Line** - Not yet implemented
- ⏳ **Laser Reflect** - Not yet implemented

---

## 1. Corridor Chase ✅

**Status**: Implemented

**Inspiration**: Qoridor

**Rules**:
- 9x9 grid, two players
- Player 1 starts at bottom center, tries to reach top row
- Player 2 starts at top center, tries to reach bottom row
- Each turn: Move pawn one space (up/down/left/right) OR place a wall
- Walls are 2 cells long, block movement between cells
- Each player has 10 walls
- Walls must always leave a valid path for both players to their goal

**Strategic Depth**:
- **Offensive vs Defensive Balance**: Push forward vs block opponent
- **Wall Efficiency**: When to use limited walls for maximum impact
- **Path Planning**: Mentally calculating shortest paths after wall placement
- **Tempo**: Balancing wall placement with movement speed
- **Zugzwang Potential**: Creating positions where opponent's choices are all bad

**P2P Implementation**:
- Turn-based: Guest sends action, host validates
- Small state: 2 positions + wall array (~20-30 objects max)
- BFS pathfinding validates wall placement (ensures valid paths exist)
- No timing complexity, no interpolation needed

**Estimated State Size**: ~1-2 KB per sync

---

## 2. Pattern Match

**Inspiration**: Quarto

**Rules**:
- 4x4 grid, initially empty
- 16 pieces, each with 4 binary attributes (e.g., Color: Red/Blue, Shape: Circle/Square, Size: Big/Small, Fill: Solid/Hollow)
- On your turn: Place the piece your opponent selected on any empty cell
- After placing, choose which piece opponent must play next
- Win by creating a row of 4 pieces sharing ANY attribute (horizontal, vertical, or diagonal)

**Strategic Depth**:
- **Dual Threats**: Create setups forcing opponent into impossible choices
- **Piece Denial**: Give opponent pieces that can't create winning setups
- **Multi-Attribute Awareness**: Track patterns across 4 dimensions simultaneously
- **Endgame Calculation**: Perfect information allows complete analysis near end

**P2P Implementation**:
- Turn-based with piece selection phase
- State: 16-cell grid + 16 pieces (placed/available) + selected piece
- Validation: Check win condition after each placement
- Settings: Could vary attributes (3 or 4), grid size (3x3 or 4x4)

**Estimated State Size**: ~500 bytes

---

## 3. Claim Territory

**Rules**:
- Shared 10x10 grid, both players start at opposite corners
- Turn-based: Claim one adjacent (orthogonal) empty cell
- Claimed cells must connect to your existing territory
- When grid fills or no moves possible, player with most cells wins

**Variant**: **Cut-throat Mode** - You can claim any adjacent cell, even if it splits opponent's territory

**Strategic Depth**:
- **Expansion Patterns**: Spread wide vs focused growth
- **Choke Points**: Control strategic narrow passages
- **Area Counting**: Mental calculation of accessible regions
- **Sacrificial Territory**: Give up areas to secure larger regions
- **Edge Control**: Perimeter cells are more defensible

**P2P Implementation**:
- Turn-based, single action per turn (claim cell)
- State: 100-cell grid with ownership markers
- Flood fill algorithm to validate connectivity
- Optional: Fog of war mode (each player sees only their territory + 1 cell radius)

**Estimated State Size**: ~200-400 bytes

---

## 4. Stack Race

**Inspiration**: Pylos (vertical stacking strategy)

**Rules**:
- Shared 5x5 grid, each player has 15 pieces
- Place a piece on the board OR stack on top of 4 adjacent pieces (forming a pyramid)
- Special rule: Creating a 2x2 of your color lets you retrieve 1-2 pieces back
- First player to place a piece on the 4th level (top of pyramid) wins
- If you run out of pieces before completing pyramid, you lose

**Strategic Depth**:
- **Resource Management**: Efficient piece usage via retrieval
- **Blocking**: Prevent opponent from creating 2x2 patterns
- **Height Strategy**: Build supporting structures early or rush top?
- **Sacrifice Plays**: Give opponent retrievals to control board position

**P2P Implementation**:
- Turn-based, simple state
- State: 5x5 grid with up to 4 levels, piece counts
- Validation: Check structural integrity (can't stack without 4 support pieces)
- 3D visualization challenge (could use 2.5D isometric view)

**Estimated State Size**: ~400 bytes

---

## 5. Slide Puzzle Battle

**Inspiration**: Quixo

**Rules**:
- 5x5 grid, all cells start neutral (blank)
- On your turn: Select a neutral or your-colored cell from the outer ring (not center 3x3)
- Push that cell into the grid from any direction, sliding its row/column
- The pushed cell becomes your color
- First to get 5 in a row (orthogonal or diagonal) wins

**Strategic Depth**:
- **Board Control**: Maintain flexible positions while preventing opponent lines
- **Setup Chains**: Create positions where any push helps you
- **Forced Moves**: Push pieces to create moves opponent must respond to
- **Pattern Recognition**: Seeing diagonal and orthogonal threats simultaneously

**P2P Implementation**:
- Turn-based
- State: 5x5 grid with ownership (neutral/p1/p2)
- Action: Cell selection + push direction
- Win detection: Check all 5-in-a-row combinations

**Estimated State Size**: ~100 bytes

---

## 6. Connection

**Inspiration**: Classic game "Hex"

**Rules**:
- Hexagonal grid (11x11 hex cells)
- Player 1 tries to connect top edge to bottom edge
- Player 2 tries to connect left edge to right edge
- Turn-based: Place one piece on any empty hex
- First to complete their connection wins
- Mathematical property: One player MUST win (no draws possible)

**Strategic Depth**:
- **Bridge Patterns**: Create connected structures opponent can't cut
- **Ladder Formations**: Force opponent into defensive responses
- **Edge Control**: Secure connection to starting edges early
- **Dual Paths**: Maintain multiple potential connection routes
- **Proven Deep**: Hex is studied in game theory, simple rules hide immense depth

**P2P Implementation**:
- Turn-based, single placement per turn
- State: Hex grid (121 cells for 11x11)
- Win detection: Pathfinding from edge to opposite edge
- Hex rendering: CSS grid or canvas with isometric coordinates

**Estimated State Size**: ~200 bytes

---

## 7. Tug of War Line

**Rules**:
- Single line of 11 spaces, marker starts in center (space 6)
- Each turn, players **secretly** allocate 1-3 energy points
- Both reveal simultaneously
- Higher energy pushes marker toward opponent's side
- Each player has 20 total energy for the whole game
- First to push marker off opponent's edge wins

**Strategic Depth**:
- **Resource Management**: When to go all-in vs conserve energy
- **Bluffing**: Allocate high on critical turns, low when opponent expects high
- **Endgame Math**: Perfect calculation when energy is low
- **Momentum**: Winning streak psychology vs resource depletion
- **Risk Assessment**: Is it worth spending 3 to counter opponent's potential 2?

**P2P Implementation**:
- Turn-based with simultaneous reveal
- State: Marker position (0-11), energy remaining for each player
- Message sequence: Both submit energy → host reveals → calculate result
- Simple but requires simultaneous action handling

**Estimated State Size**: ~50 bytes

---

## 8. Laser Reflect

**Rules**:
- 8x8 grid, players take turns placing mirrors (/ or \)
- After each placement, optionally fire laser from any edge space
- Laser reflects off mirrors (/ reflects: up→right, right→up, down→left, left→down; \ is opposite)
- If laser hits opponent's edge, you score a point
- First to 3 points OR most points when grid fills wins

**Strategic Depth**:
- **Trap Building**: Create mirror mazes leading to opponent's edge
- **Defensive Placement**: Block potential laser paths to your edge
- **Path Calculation**: Mentally trace laser bounces multiple reflections ahead
- **Timing**: When to fire laser vs when to place more mirrors

**P2P Implementation**:
- Turn-based: Place mirror OR fire laser
- State: 8x8 grid with mirror orientations (empty/left-diag/right-diag)
- Ray tracing algorithm for laser path calculation
- Could add mirror types (double-sided, one-way, etc.) as variants

**Estimated State Size**: ~100-200 bytes

---

## Comparison Table

| Game | Grid Size | Turn Style | State Complexity | Visual Complexity | Strategic Depth |
|------|-----------|------------|------------------|-------------------|-----------------|
| **Corridor Chase** | 9x9 | Alternating | Medium | Medium | Very High |
| **Pattern Match** | 4x4 | Alternating | Low | Low | High |
| **Claim Territory** | 10x10 | Alternating | Low | Low | Medium-High |
| **Stack Race** | 5x5x4 | Alternating | Medium | High (3D) | High |
| **Slide Puzzle Battle** | 5x5 | Alternating | Low | Low | Medium |
| **Connection** | 11x11 hex | Alternating | Low | Medium (hex) | Very High |
| **Tug of War Line** | 1x11 | Simultaneous | Very Low | Very Low | Medium |
| **Laser Reflect** | 8x8 | Alternating | Low | Medium | Medium-High |

---

## Implementation Priority Recommendations

Based on **strategic depth**, **implementation complexity**, and **gameplay variety**:

### Tier 1 (Highest Priority)
1. **Connection** - Proven deep strategy, medium implementation complexity
2. **Pattern Match** - Unique mechanic (opponent chooses your piece), low complexity
3. **Claim Territory** - Very simple rules, good intro to territory control

### Tier 2 (Good Additions)
4. **Tug of War Line** - Simplest to implement, teaches resource management
5. **Stack Race** - Introduces vertical dimension, moderate complexity
6. **Slide Puzzle Battle** - Dynamic board state, medium complexity

### Tier 3 (Advanced/Experimental)
7. **Laser Reflect** - Ray tracing adds computational complexity
8. (More complex variants or games with special rules)

---

## Design Notes

### Why These Games Work for P2P
- **Low Bandwidth**: All games have small state (<2 KB)
- **Turn-based**: No timing sync issues, works on any latency
- **Deterministic**: Perfect information, no randomness to sync
- **Short Matches**: 5-15 minute games keep engagement high
- **Visual Clarity**: All game states easily renderable on canvas
- **Mobile-Friendly**: Touch-first design for grid-based games

### Potential Enhancements
- **AI Opponents**: All games support single-player with bot
- **Replay System**: Small state makes recording/playback trivial
- **Tournaments**: Bracket system for multiple games
- **Elo Ratings**: Track skill levels across games
- **Variants**: Each game can have rule modifications (grid size, piece count, etc.)

### Future Expansion Ideas
- **Combination Games**: Hybrid mechanics from multiple games
- **Asymmetric Games**: Different rules/goals for each player
- **Team Games**: 2v2 cooperative variants
- **Time Pressure Modes**: Add turn timers for blitz-style play
