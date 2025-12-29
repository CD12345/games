// History RPG - Entity Manager
// Manages all game entities (player, NPCs, items)

import { debugLog } from '../../../ui/DebugOverlay.js';

// Entity types
export const ENTITY_TYPES = {
    PLAYER: 'player',
    NPC: 'npc',
    ITEM: 'item',
    VEHICLE: 'vehicle',
    PROJECTILE: 'projectile'
};

// NPC states for behavior
export const NPC_STATES = {
    IDLE: 'idle',
    PATROL: 'patrol',
    ALERT: 'alert',
    FLEE: 'flee',
    FOLLOW: 'follow',
    TALK: 'talk',
    DEAD: 'dead'
};

// Base entity class
class Entity {
    constructor(id, type, x, y) {
        this.id = id;
        this.type = type;
        this.position = { x, y };
        this.velocity = { x: 0, y: 0 };
        this.facing = 'south';
        this.active = true;
        this.visible = true;
        this.collidable = true;
        this.interactable = false;

        // Visual properties
        this.sprite = null;
        this.animation = null;
        this.animationFrame = 0;
    }

    update(deltaTime, worldGrid) {
        // Apply velocity
        if (this.velocity.x !== 0 || this.velocity.y !== 0) {
            const newX = this.position.x + this.velocity.x * deltaTime;
            const newY = this.position.y + this.velocity.y * deltaTime;

            // Check collision if needed
            if (!this.collidable || worldGrid.isWalkable(Math.floor(newX), Math.floor(newY))) {
                this.position.x = newX;
                this.position.y = newY;

                // Update facing direction
                if (Math.abs(this.velocity.x) > Math.abs(this.velocity.y)) {
                    this.facing = this.velocity.x > 0 ? 'east' : 'west';
                } else if (this.velocity.y !== 0) {
                    this.facing = this.velocity.y > 0 ? 'south' : 'north';
                }
            }
        }
    }

    distanceTo(other) {
        const dx = other.position.x - this.position.x;
        const dy = other.position.y - this.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    serialize() {
        return {
            id: this.id,
            type: this.type,
            position: { ...this.position },
            velocity: { ...this.velocity },
            facing: this.facing,
            active: this.active
        };
    }
}

// NPC entity with AI behavior
export class NPCEntity extends Entity {
    constructor(id, npcData, x, y) {
        super(id, ENTITY_TYPES.NPC, x, y);

        // NPC data from scenario
        this.name = npcData.name || 'Unknown';
        this.role = npcData.role || npcData.type || 'civilian';
        this.faction = npcData.faction || 'civilian';
        this.personality = npcData.personality || 'neutral';

        // Relationship
        this.disposition = npcData.disposition || 50;
        this.met = false;

        // AI state
        this.state = NPC_STATES.IDLE;
        this.previousState = null;
        this.stateTimer = 0;

        // Patrol/movement
        this.homePosition = { x, y };
        this.targetPosition = null;
        this.patrolPath = [];
        this.patrolIndex = 0;
        this.moveSpeed = 1.5;

        // Awareness
        this.alertRadius = 8;
        this.sightRange = 12;

        // Dialogue
        this.dialogueHooks = npcData.dialogueHooks || [];
        this.knowledge = npcData.knowledge || [];
        this.canProvide = npcData.canProvide || [];

        // Interactable
        this.interactable = true;
    }

    update(deltaTime, worldGrid, playerPos = null) {
        this.stateTimer += deltaTime;

        // Run state behavior
        switch (this.state) {
            case NPC_STATES.IDLE:
                this.updateIdle(deltaTime, playerPos);
                break;
            case NPC_STATES.PATROL:
                this.updatePatrol(deltaTime, worldGrid);
                break;
            case NPC_STATES.ALERT:
                this.updateAlert(deltaTime, playerPos);
                break;
            case NPC_STATES.FLEE:
                this.updateFlee(deltaTime, worldGrid, playerPos);
                break;
            case NPC_STATES.FOLLOW:
                this.updateFollow(deltaTime, worldGrid, playerPos);
                break;
            case NPC_STATES.TALK:
                // Stay still during conversation
                this.velocity.x = 0;
                this.velocity.y = 0;
                break;
        }

        super.update(deltaTime, worldGrid);
    }

    updateIdle(deltaTime, playerPos) {
        this.velocity.x = 0;
        this.velocity.y = 0;

        // Occasionally look around
        if (this.stateTimer > 3 + Math.random() * 2) {
            this.stateTimer = 0;
            const dirs = ['north', 'south', 'east', 'west'];
            this.facing = dirs[Math.floor(Math.random() * dirs.length)];
        }

        // Check if player is nearby
        if (playerPos) {
            const dist = this.distanceTo({ position: playerPos });

            // Alert if player very close
            if (dist < this.alertRadius && this.disposition < 30) {
                this.setState(NPC_STATES.ALERT);
            }
            // Start patrol if bored
            else if (this.stateTimer > 10 && this.patrolPath.length > 0) {
                this.setState(NPC_STATES.PATROL);
            }
        }
    }

    updatePatrol(deltaTime, worldGrid) {
        if (this.patrolPath.length === 0) {
            this.setState(NPC_STATES.IDLE);
            return;
        }

        const target = this.patrolPath[this.patrolIndex];
        const dx = target.x - this.position.x;
        const dy = target.y - this.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.5) {
            // Reached waypoint
            this.patrolIndex = (this.patrolIndex + 1) % this.patrolPath.length;
            this.velocity.x = 0;
            this.velocity.y = 0;

            // Pause at waypoint
            if (Math.random() > 0.7) {
                this.setState(NPC_STATES.IDLE);
            }
        } else {
            // Move toward waypoint
            this.velocity.x = (dx / dist) * this.moveSpeed;
            this.velocity.y = (dy / dist) * this.moveSpeed;
        }
    }

    updateAlert(deltaTime, playerPos) {
        // Face the player
        if (playerPos) {
            const dx = playerPos.x - this.position.x;
            const dy = playerPos.y - this.position.y;

            if (Math.abs(dx) > Math.abs(dy)) {
                this.facing = dx > 0 ? 'east' : 'west';
            } else {
                this.facing = dy > 0 ? 'south' : 'north';
            }

            const dist = this.distanceTo({ position: playerPos });

            // Calm down if player moves away
            if (dist > this.sightRange) {
                this.setState(NPC_STATES.IDLE);
            }
            // Flee if too close and hostile
            else if (dist < 3 && this.disposition < 20) {
                this.setState(NPC_STATES.FLEE);
            }
        }

        this.velocity.x = 0;
        this.velocity.y = 0;
    }

    updateFlee(deltaTime, worldGrid, playerPos) {
        if (!playerPos) {
            this.setState(NPC_STATES.IDLE);
            return;
        }

        // Move away from player
        const dx = this.position.x - playerPos.x;
        const dy = this.position.y - playerPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.sightRange) {
            this.setState(NPC_STATES.IDLE);
            return;
        }

        this.velocity.x = (dx / dist) * this.moveSpeed * 1.5;
        this.velocity.y = (dy / dist) * this.moveSpeed * 1.5;
    }

    updateFollow(deltaTime, worldGrid, playerPos) {
        if (!playerPos) {
            this.setState(NPC_STATES.IDLE);
            return;
        }

        const dx = playerPos.x - this.position.x;
        const dy = playerPos.y - this.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2) {
            // Move toward player
            this.velocity.x = (dx / dist) * this.moveSpeed;
            this.velocity.y = (dy / dist) * this.moveSpeed;
        } else {
            // Close enough, stop
            this.velocity.x = 0;
            this.velocity.y = 0;
        }
    }

    setState(newState) {
        if (newState === this.state) return;

        this.previousState = this.state;
        this.state = newState;
        this.stateTimer = 0;

        debugLog(`[NPC:${this.name}] State: ${this.previousState} -> ${newState}`);
    }

    // Set patrol path
    setPatrolPath(points) {
        this.patrolPath = points;
        this.patrolIndex = 0;
    }

    // Modify disposition
    changeDisposition(amount) {
        this.disposition = Math.max(0, Math.min(100, this.disposition + amount));
    }

    serialize() {
        return {
            ...super.serialize(),
            name: this.name,
            faction: this.faction,
            disposition: this.disposition,
            met: this.met,
            state: this.state
        };
    }
}

// Item entity (pickups, interactables)
export class ItemEntity extends Entity {
    constructor(id, itemData, x, y) {
        super(id, ENTITY_TYPES.ITEM, x, y);

        this.name = itemData.name || 'Item';
        this.description = itemData.description || '';
        this.itemType = itemData.type || 'misc';
        this.value = itemData.value || 0;
        this.quantity = itemData.quantity || 1;
        this.weight = itemData.weight || 0;

        // Can be picked up
        this.pickupable = true;
        this.interactable = true;
        this.collidable = false;
    }

    serialize() {
        return {
            ...super.serialize(),
            name: this.name,
            itemType: this.itemType,
            quantity: this.quantity
        };
    }
}

// Entity Manager
export class EntityManager {
    constructor(worldGrid = null) {
        this.worldGrid = worldGrid;
        this.entities = new Map();
        this.player = null;

        // Spatial hash for efficient queries
        this.spatialHash = new Map();
        this.cellSize = 16;

        // Entity counters for unique IDs
        this.nextEntityId = 1;
    }

    // Create entity from data
    createNPC(npcData, x, y) {
        const id = npcData.id || `npc_${this.nextEntityId++}`;
        const npc = new NPCEntity(id, npcData, x, y);
        this.addEntity(npc);
        return npc;
    }

    createItem(itemData, x, y) {
        const id = itemData.id || `item_${this.nextEntityId++}`;
        const item = new ItemEntity(id, itemData, x, y);
        this.addEntity(item);
        return item;
    }

    // Add entity to manager
    addEntity(entity) {
        this.entities.set(entity.id, entity);
        this.updateSpatialHash(entity);

        // Register with world grid if applicable
        if (this.worldGrid && entity.type === ENTITY_TYPES.NPC) {
            this.worldGrid.addNPCAt(
                Math.floor(entity.position.x),
                Math.floor(entity.position.y),
                entity.id
            );
        }

        debugLog(`[EntityManager] Added entity: ${entity.id} (${entity.type})`);
    }

    // Remove entity
    removeEntity(id) {
        const entity = this.entities.get(id);
        if (!entity) return;

        // Remove from world grid
        if (this.worldGrid && entity.type === ENTITY_TYPES.NPC) {
            this.worldGrid.removeNPCAt(
                Math.floor(entity.position.x),
                Math.floor(entity.position.y),
                entity.id
            );
        }

        this.entities.delete(id);
        this.removeFromSpatialHash(entity);
    }

    // Get entity by ID
    getEntity(id) {
        return this.entities.get(id);
    }

    // Get all entities of type
    getEntitiesByType(type) {
        return Array.from(this.entities.values()).filter(e => e.type === type);
    }

    // Update all entities
    update(deltaTime, playerPos = null) {
        for (const entity of this.entities.values()) {
            if (!entity.active) continue;

            const oldX = Math.floor(entity.position.x);
            const oldY = Math.floor(entity.position.y);

            // Update entity
            if (entity.type === ENTITY_TYPES.NPC) {
                entity.update(deltaTime, this.worldGrid, playerPos);
            } else {
                entity.update(deltaTime, this.worldGrid);
            }

            // Update spatial hash if position changed significantly
            const newX = Math.floor(entity.position.x);
            const newY = Math.floor(entity.position.y);

            if (newX !== oldX || newY !== oldY) {
                this.updateSpatialHash(entity);

                // Update world grid
                if (this.worldGrid && entity.type === ENTITY_TYPES.NPC) {
                    this.worldGrid.removeNPCAt(oldX, oldY, entity.id);
                    this.worldGrid.addNPCAt(newX, newY, entity.id);
                }
            }
        }
    }

    // Spatial hash methods
    getCellKey(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }

    updateSpatialHash(entity) {
        // Remove from old cell
        this.removeFromSpatialHash(entity);

        // Add to new cell
        const key = this.getCellKey(entity.position.x, entity.position.y);
        if (!this.spatialHash.has(key)) {
            this.spatialHash.set(key, new Set());
        }
        this.spatialHash.get(key).add(entity.id);
    }

    removeFromSpatialHash(entity) {
        for (const [key, entities] of this.spatialHash) {
            entities.delete(entity.id);
            if (entities.size === 0) {
                this.spatialHash.delete(key);
            }
        }
    }

    // Query entities near a position
    getEntitiesNear(x, y, radius) {
        const results = [];
        const minCX = Math.floor((x - radius) / this.cellSize);
        const maxCX = Math.floor((x + radius) / this.cellSize);
        const minCY = Math.floor((y - radius) / this.cellSize);
        const maxCY = Math.floor((y + radius) / this.cellSize);

        for (let cy = minCY; cy <= maxCY; cy++) {
            for (let cx = minCX; cx <= maxCX; cx++) {
                const key = `${cx},${cy}`;
                const cellEntities = this.spatialHash.get(key);
                if (!cellEntities) continue;

                for (const id of cellEntities) {
                    const entity = this.entities.get(id);
                    if (!entity) continue;

                    const dx = entity.position.x - x;
                    const dy = entity.position.y - y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= radius) {
                        results.push({ entity, distance: dist });
                    }
                }
            }
        }

        return results.sort((a, b) => a.distance - b.distance);
    }

    // Get interactable entities near position
    getInteractablesNear(x, y, radius = 2) {
        return this.getEntitiesNear(x, y, radius)
            .filter(r => r.entity.interactable)
            .map(r => r.entity);
    }

    // Load entities from scenario
    loadFromScenario(scenario, startX, startY) {
        if (!scenario) return;

        // Load NPCs
        if (scenario.keyNPCs) {
            for (let i = 0; i < scenario.keyNPCs.length; i++) {
                const npcData = scenario.keyNPCs[i];

                // Position NPCs around start area
                const offsetX = (i % 5) * 3 - 6;
                const offsetY = Math.floor(i / 5) * 3 - 3;

                this.createNPC(npcData, startX + offsetX, startY + offsetY);
            }
        }

        // Load items
        if (scenario.items) {
            for (const itemData of scenario.items) {
                // Skip items without explicit locations
                if (!itemData.position) continue;

                this.createItem(itemData, itemData.position.x, itemData.position.y);
            }
        }

        debugLog(`[EntityManager] Loaded ${this.entities.size} entities from scenario`);
    }

    // Serialize all entities
    serialize() {
        const data = [];
        for (const entity of this.entities.values()) {
            data.push(entity.serialize());
        }
        return data;
    }

    // Clear all entities
    clear() {
        this.entities.clear();
        this.spatialHash.clear();
        this.nextEntityId = 1;
    }
}
