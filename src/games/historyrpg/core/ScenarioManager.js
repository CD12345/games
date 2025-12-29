// History RPG - Scenario Manager
// Manages scenario state, objectives, and progression

import { debugLog } from '../../../ui/DebugOverlay.js';

export class ScenarioManager {
    constructor(generationQueue = null) {
        this.generationQueue = generationQueue;

        // Current scenario data
        this.scenario = null;

        // Progress tracking
        this.completedObjectives = new Set();
        this.discoveredLocations = new Set();
        this.metNPCs = new Set();
        this.triggeredEvents = new Set();
        this.collectedItems = new Set();

        // Player knowledge (things learned through dialogue/exploration)
        this.knowledge = new Set();

        // Reputation with factions
        this.reputation = {
            german: 0,
            soviet: 0,
            civilian: 50,
            resistance: 0
        };

        // Historical deviation tracking
        this.deviationScore = 0;  // 0 = following history, 100 = completely changed

        // Event callbacks
        this.onObjectiveComplete = null;
        this.onEventTriggered = null;
        this.onLocationDiscovered = null;
        this.onGameComplete = null;
    }

    // Load a scenario (either generated or pre-built)
    loadScenario(scenarioData) {
        debugLog(`[ScenarioManager] Loading scenario: ${scenarioData.title}`);

        this.scenario = scenarioData;

        // Reset progress
        this.completedObjectives.clear();
        this.discoveredLocations.clear();
        this.metNPCs.clear();
        this.triggeredEvents.clear();
        this.collectedItems.clear();
        this.knowledge.clear();
        this.deviationScore = 0;

        // Mark starting location as discovered
        if (scenarioData.playerStart?.locationId) {
            this.discoveredLocations.add(scenarioData.playerStart.locationId);
        }

        debugLog(`[ScenarioManager] Scenario loaded with ${scenarioData.keyLocations?.length || 0} locations, ${scenarioData.keyNPCs?.length || 0} NPCs`);

        return this.scenario;
    }

    // Load scenario from JSON file
    async loadFromFile(path) {
        debugLog(`[ScenarioManager] Loading scenario from file: ${path}`);

        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load scenario: ${response.status}`);
            }

            const data = await response.json();
            return this.loadScenario(data.scenario || data);
        } catch (error) {
            debugLog(`[ScenarioManager] Error loading scenario file: ${error.message}`);
            throw error;
        }
    }

    // Get current scenario
    getScenario() {
        return this.scenario;
    }

    // Get main goal
    getMainGoal() {
        return this.scenario?.mainGoal || null;
    }

    // Get current objective (next uncompleted step in goal path)
    getCurrentObjective() {
        if (!this.scenario?.goalPath) return null;

        for (const step of this.scenario.goalPath) {
            if (!this.completedObjectives.has(step.step)) {
                return step;
            }
        }

        return null;  // All objectives complete
    }

    // Get all objectives with completion status
    getObjectives() {
        if (!this.scenario?.goalPath) return [];

        return this.scenario.goalPath.map(step => ({
            ...step,
            completed: this.completedObjectives.has(step.step)
        }));
    }

    // Complete an objective
    completeObjective(stepNumber) {
        if (this.completedObjectives.has(stepNumber)) return false;

        this.completedObjectives.add(stepNumber);
        debugLog(`[ScenarioManager] Objective ${stepNumber} completed`);

        if (this.onObjectiveComplete) {
            const objective = this.scenario.goalPath.find(s => s.step === stepNumber);
            this.onObjectiveComplete(objective);
        }

        // Check if main goal is complete
        this.checkGameComplete();

        return true;
    }

    // Check if game is complete
    checkGameComplete() {
        if (!this.scenario?.goalPath) return false;

        const allComplete = this.scenario.goalPath.every(
            step => this.completedObjectives.has(step.step)
        );

        if (allComplete && this.onGameComplete) {
            debugLog(`[ScenarioManager] All objectives complete - game finished!`);
            this.onGameComplete({
                mainGoalComplete: true,
                deviationScore: this.deviationScore,
                optionalGoalsComplete: this.getCompletedOptionalGoals()
            });
        }

        return allComplete;
    }

    // Get optional goals
    getOptionalGoals() {
        if (!this.scenario?.optionalGoals) return [];

        return this.scenario.optionalGoals.map(goal => ({
            ...goal,
            completed: this.completedObjectives.has(goal.id)
        }));
    }

    // Get completed optional goals
    getCompletedOptionalGoals() {
        return this.scenario?.optionalGoals?.filter(
            g => this.completedObjectives.has(g.id)
        ) || [];
    }

    // Complete optional goal
    completeOptionalGoal(goalId) {
        this.completedObjectives.add(goalId);
        debugLog(`[ScenarioManager] Optional goal completed: ${goalId}`);
    }

    // Discover a location
    discoverLocation(locationId) {
        if (this.discoveredLocations.has(locationId)) return false;

        this.discoveredLocations.add(locationId);
        debugLog(`[ScenarioManager] Location discovered: ${locationId}`);

        if (this.onLocationDiscovered) {
            const location = this.getLocation(locationId);
            this.onLocationDiscovered(location);
        }

        return true;
    }

    // Get location by ID
    getLocation(locationId) {
        return this.scenario?.keyLocations?.find(l => l.id === locationId) || null;
    }

    // Get all discovered locations
    getDiscoveredLocations() {
        if (!this.scenario?.keyLocations) return [];

        return this.scenario.keyLocations.filter(
            loc => this.discoveredLocations.has(loc.id)
        );
    }

    // Meet an NPC
    meetNPC(npcId) {
        if (this.metNPCs.has(npcId)) return false;

        this.metNPCs.add(npcId);
        debugLog(`[ScenarioManager] NPC met: ${npcId}`);

        return true;
    }

    // Get NPC by ID
    getNPC(npcId) {
        return this.scenario?.keyNPCs?.find(n => n.id === npcId) || null;
    }

    // Learn something (add to knowledge)
    learnKnowledge(topic) {
        if (this.knowledge.has(topic)) return false;

        this.knowledge.add(topic);
        debugLog(`[ScenarioManager] Knowledge learned: ${topic}`);

        return true;
    }

    // Check if player knows something
    hasKnowledge(topic) {
        return this.knowledge.has(topic);
    }

    // Collect an item
    collectItem(itemId) {
        if (this.collectedItems.has(itemId)) return false;

        this.collectedItems.add(itemId);
        debugLog(`[ScenarioManager] Item collected: ${itemId}`);

        // Check if this completes any objectives
        this.checkItemObjectives(itemId);

        return true;
    }

    // Check if collecting an item completes objectives
    checkItemObjectives(itemId) {
        // Implementation depends on objective requirements
        // Could check for "collect X" type objectives
    }

    // Get item by ID
    getItem(itemId) {
        return this.scenario?.items?.find(i => i.id === itemId) || null;
    }

    // Trigger a historical event
    triggerEvent(eventId) {
        if (this.triggeredEvents.has(eventId)) return false;

        this.triggeredEvents.add(eventId);
        debugLog(`[ScenarioManager] Event triggered: ${eventId}`);

        if (this.onEventTriggered) {
            const event = this.getEvent(eventId);
            this.onEventTriggered(event);
        }

        return true;
    }

    // Get event by ID
    getEvent(eventId) {
        return this.scenario?.historicalEvents?.find(e => e.id === eventId) || null;
    }

    // Check for events that should trigger based on game time
    checkTimeBasedEvents(currentDate) {
        if (!this.scenario?.historicalEvents) return [];

        const triggered = [];

        for (const event of this.scenario.historicalEvents) {
            if (this.triggeredEvents.has(event.id)) continue;

            if (event.date && new Date(event.date) <= currentDate) {
                this.triggerEvent(event.id);
                triggered.push(event);
            }
        }

        return triggered;
    }

    // Modify reputation with a faction
    modifyReputation(faction, amount) {
        if (!(faction in this.reputation)) {
            this.reputation[faction] = 0;
        }

        this.reputation[faction] = Math.max(-100, Math.min(100,
            this.reputation[faction] + amount
        ));

        debugLog(`[ScenarioManager] Reputation with ${faction}: ${this.reputation[faction]}`);
    }

    // Get reputation with faction
    getReputation(faction) {
        return this.reputation[faction] || 0;
    }

    // Increase historical deviation
    addDeviation(amount, reason) {
        this.deviationScore = Math.min(100, this.deviationScore + amount);
        debugLog(`[ScenarioManager] Historical deviation +${amount} (${reason}): now ${this.deviationScore}`);
    }

    // Get progress summary
    getProgressSummary() {
        const totalObjectives = this.scenario?.goalPath?.length || 0;
        const completedCount = this.completedObjectives.size;

        return {
            objectivesTotal: totalObjectives,
            objectivesCompleted: completedCount,
            objectivesPercent: totalObjectives > 0 ? (completedCount / totalObjectives) * 100 : 0,
            locationsDiscovered: this.discoveredLocations.size,
            locationsTotal: this.scenario?.keyLocations?.length || 0,
            npcsmet: this.metNPCs.size,
            npcsTotal: this.scenario?.keyNPCs?.length || 0,
            itemsCollected: this.collectedItems.size,
            itemsTotal: this.scenario?.items?.length || 0,
            deviationScore: this.deviationScore
        };
    }

    // Serialize state for saving
    serialize() {
        return {
            scenarioId: this.scenario?.id,
            completedObjectives: Array.from(this.completedObjectives),
            discoveredLocations: Array.from(this.discoveredLocations),
            metNPCs: Array.from(this.metNPCs),
            triggeredEvents: Array.from(this.triggeredEvents),
            collectedItems: Array.from(this.collectedItems),
            knowledge: Array.from(this.knowledge),
            reputation: { ...this.reputation },
            deviationScore: this.deviationScore
        };
    }

    // Deserialize state from save
    deserialize(data) {
        this.completedObjectives = new Set(data.completedObjectives || []);
        this.discoveredLocations = new Set(data.discoveredLocations || []);
        this.metNPCs = new Set(data.metNPCs || []);
        this.triggeredEvents = new Set(data.triggeredEvents || []);
        this.collectedItems = new Set(data.collectedItems || []);
        this.knowledge = new Set(data.knowledge || []);
        this.reputation = data.reputation || { ...this.reputation };
        this.deviationScore = data.deviationScore || 0;

        debugLog(`[ScenarioManager] State deserialized`);
    }
}
