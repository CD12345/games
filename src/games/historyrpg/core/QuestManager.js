// History RPG - Quest Manager
// Tracks quests, objectives, and progression

import { debugLog } from '../../../ui/DebugOverlay.js';

// Quest states
export const QUEST_STATES = {
    HIDDEN: 'hidden',       // Not yet discovered
    AVAILABLE: 'available', // Can be started
    ACTIVE: 'active',       // Currently tracking
    COMPLETED: 'completed', // Successfully finished
    FAILED: 'failed'        // Cannot be completed
};

// Objective types
export const OBJECTIVE_TYPES = {
    LOCATION: 'location',   // Visit a location
    TALK: 'talk',           // Talk to an NPC
    ITEM: 'item',           // Collect/deliver an item
    COMBAT: 'combat',       // Defeat enemies
    STEALTH: 'stealth',     // Avoid detection
    CHOICE: 'choice',       // Make a decision
    TIME: 'time'            // Complete before deadline
};

// Quest class
export class Quest {
    constructor(data) {
        this.id = data.id;
        this.title = data.title || 'Unknown Quest';
        this.description = data.description || '';
        this.type = data.type || 'main'; // main, optional, hidden
        this.state = QUEST_STATES.HIDDEN;

        // Objectives
        this.objectives = (data.objectives || []).map(obj => ({
            id: obj.id || `obj_${Math.random().toString(36).substr(2, 9)}`,
            description: obj.description || obj.objective || '',
            type: obj.type || OBJECTIVE_TYPES.LOCATION,
            target: obj.target || null, // locationId, npcId, itemId, etc.
            current: 0,
            required: obj.required || 1,
            completed: false,
            optional: obj.optional || false,
            hints: obj.hints || []
        }));

        // Rewards
        this.rewards = data.rewards || {};

        // Prerequisites
        this.prerequisiteQuests = data.prerequisiteQuests || [];
        this.prerequisiteItems = data.prerequisiteItems || [];
        this.prerequisiteLocations = data.prerequisiteLocations || [];

        // Triggers
        this.triggerNPC = data.triggerNPC || null;
        this.triggerLocation = data.triggerLocation || null;
        this.triggerItem = data.triggerItem || null;

        // Timestamps
        this.startedAt = null;
        this.completedAt = null;
        this.deadline = data.deadline || null; // Game time deadline

        // Related entities
        this.relatedNPCs = data.relatedNPCs || [];
        this.relatedLocations = data.relatedLocations || [];
    }

    // Start the quest
    start() {
        if (this.state !== QUEST_STATES.AVAILABLE) {
            return false;
        }

        this.state = QUEST_STATES.ACTIVE;
        this.startedAt = Date.now();
        debugLog(`[Quest] Started: ${this.title}`);
        return true;
    }

    // Check if all required objectives are complete
    checkCompletion() {
        const requiredObjectives = this.objectives.filter(obj => !obj.optional);
        return requiredObjectives.every(obj => obj.completed);
    }

    // Complete the quest
    complete() {
        this.state = QUEST_STATES.COMPLETED;
        this.completedAt = Date.now();
        debugLog(`[Quest] Completed: ${this.title}`);
    }

    // Fail the quest
    fail(reason = 'unknown') {
        this.state = QUEST_STATES.FAILED;
        debugLog(`[Quest] Failed: ${this.title} (${reason})`);
    }

    // Update objective progress
    updateObjective(objectiveId, progress = 1) {
        const objective = this.objectives.find(obj => obj.id === objectiveId);
        if (!objective || objective.completed) return false;

        objective.current += progress;
        if (objective.current >= objective.required) {
            objective.current = objective.required;
            objective.completed = true;
            debugLog(`[Quest] Objective complete: ${objective.description}`);
        }

        return true;
    }

    // Complete an objective directly
    completeObjective(objectiveId) {
        const objective = this.objectives.find(obj => obj.id === objectiveId);
        if (!objective) return false;

        objective.current = objective.required;
        objective.completed = true;
        debugLog(`[Quest] Objective complete: ${objective.description}`);
        return true;
    }

    // Get progress percentage
    getProgress() {
        const requiredObjectives = this.objectives.filter(obj => !obj.optional);
        if (requiredObjectives.length === 0) return 100;

        const completed = requiredObjectives.filter(obj => obj.completed).length;
        return Math.round((completed / requiredObjectives.length) * 100);
    }

    // Serialize for saving
    serialize() {
        return {
            id: this.id,
            state: this.state,
            objectives: this.objectives.map(obj => ({
                id: obj.id,
                current: obj.current,
                completed: obj.completed
            })),
            startedAt: this.startedAt,
            completedAt: this.completedAt
        };
    }
}

// Quest Manager
export class QuestManager {
    constructor(scenarioManager = null) {
        this.scenarioManager = scenarioManager;
        this.quests = new Map();
        this.activeQuest = null; // Currently tracked quest

        // Quest log (chronological entries)
        this.questLog = [];

        // Callbacks
        this.onQuestStarted = null;
        this.onQuestCompleted = null;
        this.onQuestFailed = null;
        this.onObjectiveComplete = null;
        this.onQuestDiscovered = null;
    }

    // Load quests from scenario
    loadFromScenario(scenario) {
        if (!scenario) return;

        // Create main quest from goal path
        if (scenario.mainGoal) {
            const mainQuest = new Quest({
                id: scenario.mainGoal.id || 'main_quest',
                title: scenario.mainGoal.title || scenario.mainGoal.description,
                description: scenario.mainGoal.description || '',
                type: 'main',
                objectives: scenario.goalPath || []
            });

            mainQuest.state = QUEST_STATES.ACTIVE;
            this.addQuest(mainQuest);
            this.activeQuest = mainQuest.id;
        }

        // Create optional quests
        if (scenario.optionalGoals) {
            for (const goal of scenario.optionalGoals) {
                const quest = new Quest({
                    ...goal,
                    type: 'optional'
                });
                quest.state = QUEST_STATES.AVAILABLE;
                this.addQuest(quest);
            }
        }

        debugLog(`[QuestManager] Loaded ${this.quests.size} quests from scenario`);
    }

    // Add a quest
    addQuest(quest) {
        this.quests.set(quest.id, quest);

        // Log entry
        this.questLog.push({
            type: 'discovered',
            questId: quest.id,
            timestamp: Date.now()
        });
    }

    // Get a quest by ID
    getQuest(questId) {
        return this.quests.get(questId);
    }

    // Get all quests by state
    getQuestsByState(state) {
        return Array.from(this.quests.values()).filter(q => q.state === state);
    }

    // Get active quests
    getActiveQuests() {
        return this.getQuestsByState(QUEST_STATES.ACTIVE);
    }

    // Get currently tracked quest
    getTrackedQuest() {
        if (!this.activeQuest) return null;
        return this.quests.get(this.activeQuest);
    }

    // Start a quest
    startQuest(questId) {
        const quest = this.quests.get(questId);
        if (!quest) return false;

        // Check prerequisites
        if (!this.checkPrerequisites(quest)) {
            debugLog(`[QuestManager] Prerequisites not met for: ${quest.title}`);
            return false;
        }

        if (quest.start()) {
            this.questLog.push({
                type: 'started',
                questId: quest.id,
                timestamp: Date.now()
            });

            if (this.onQuestStarted) {
                this.onQuestStarted(quest);
            }
            return true;
        }
        return false;
    }

    // Check prerequisites for a quest
    checkPrerequisites(quest) {
        // Check required quests
        for (const prereqId of quest.prerequisiteQuests) {
            const prereq = this.quests.get(prereqId);
            if (!prereq || prereq.state !== QUEST_STATES.COMPLETED) {
                return false;
            }
        }

        // Check required locations (via scenario manager)
        if (this.scenarioManager && quest.prerequisiteLocations.length > 0) {
            for (const locId of quest.prerequisiteLocations) {
                if (!this.scenarioManager.discoveredLocations.has(locId)) {
                    return false;
                }
            }
        }

        return true;
    }

    // Track a quest (set as active for UI)
    trackQuest(questId) {
        const quest = this.quests.get(questId);
        if (quest && quest.state === QUEST_STATES.ACTIVE) {
            this.activeQuest = questId;
            debugLog(`[QuestManager] Now tracking: ${quest.title}`);
            return true;
        }
        return false;
    }

    // Update progress based on game events
    onPlayerAction(actionType, targetId) {
        let updated = false;

        for (const quest of this.getActiveQuests()) {
            for (const objective of quest.objectives) {
                if (objective.completed) continue;

                // Check if this action completes an objective
                if (this.matchesObjective(objective, actionType, targetId)) {
                    quest.updateObjective(objective.id, 1);
                    updated = true;

                    if (objective.completed && this.onObjectiveComplete) {
                        this.onObjectiveComplete(quest, objective);
                    }

                    // Check if quest is now complete
                    if (quest.checkCompletion()) {
                        this.completeQuest(quest.id);
                    }
                }
            }
        }

        return updated;
    }

    // Check if an action matches an objective
    matchesObjective(objective, actionType, targetId) {
        switch (objective.type) {
            case OBJECTIVE_TYPES.LOCATION:
                return actionType === 'visit' && objective.target === targetId;

            case OBJECTIVE_TYPES.TALK:
                return actionType === 'talk' && objective.target === targetId;

            case OBJECTIVE_TYPES.ITEM:
                return actionType === 'pickup' && objective.target === targetId;

            case OBJECTIVE_TYPES.CHOICE:
                return actionType === 'choice' && objective.target === targetId;

            default:
                return false;
        }
    }

    // Complete a quest
    completeQuest(questId) {
        const quest = this.quests.get(questId);
        if (!quest || quest.state !== QUEST_STATES.ACTIVE) return false;

        quest.complete();

        this.questLog.push({
            type: 'completed',
            questId: quest.id,
            timestamp: Date.now()
        });

        // Apply rewards
        if (quest.rewards) {
            this.applyRewards(quest.rewards);
        }

        // Update scenario manager
        if (this.scenarioManager && quest.type === 'main') {
            this.scenarioManager.completeObjective(questId);
        }

        if (this.onQuestCompleted) {
            this.onQuestCompleted(quest);
        }

        // Check for next quest
        this.checkNewQuestsAvailable();

        return true;
    }

    // Fail a quest
    failQuest(questId, reason = 'unknown') {
        const quest = this.quests.get(questId);
        if (!quest || quest.state !== QUEST_STATES.ACTIVE) return false;

        quest.fail(reason);

        this.questLog.push({
            type: 'failed',
            questId: quest.id,
            reason: reason,
            timestamp: Date.now()
        });

        if (this.onQuestFailed) {
            this.onQuestFailed(quest, reason);
        }

        return true;
    }

    // Apply quest rewards
    applyRewards(rewards) {
        // This would connect to player/inventory system
        if (rewards.items) {
            debugLog(`[QuestManager] Reward: ${rewards.items.length} items`);
        }
        if (rewards.reputation) {
            debugLog(`[QuestManager] Reward: reputation changes`);
        }
        if (rewards.knowledge) {
            debugLog(`[QuestManager] Reward: ${rewards.knowledge.length} knowledge`);
        }
    }

    // Check if new quests are available after completing one
    checkNewQuestsAvailable() {
        for (const quest of this.quests.values()) {
            if (quest.state === QUEST_STATES.HIDDEN) {
                if (this.checkPrerequisites(quest)) {
                    quest.state = QUEST_STATES.AVAILABLE;

                    this.questLog.push({
                        type: 'discovered',
                        questId: quest.id,
                        timestamp: Date.now()
                    });

                    if (this.onQuestDiscovered) {
                        this.onQuestDiscovered(quest);
                    }
                }
            }
        }
    }

    // Check time-based objectives
    updateTime(gameTime) {
        for (const quest of this.getActiveQuests()) {
            // Check deadline
            if (quest.deadline && gameTime > quest.deadline) {
                this.failQuest(quest.id, 'deadline');
            }

            // Check time-based objectives
            for (const objective of quest.objectives) {
                if (objective.type === OBJECTIVE_TYPES.TIME && !objective.completed) {
                    // Time objective logic would go here
                }
            }
        }
    }

    // Get journal entries (formatted for UI)
    getJournalEntries() {
        const entries = [];

        // Active quests first
        for (const quest of this.getActiveQuests()) {
            entries.push({
                type: 'active',
                quest: quest,
                progress: quest.getProgress(),
                objectives: quest.objectives
            });
        }

        // Then completed
        for (const quest of this.getQuestsByState(QUEST_STATES.COMPLETED)) {
            entries.push({
                type: 'completed',
                quest: quest,
                completedAt: quest.completedAt
            });
        }

        // Then failed
        for (const quest of this.getQuestsByState(QUEST_STATES.FAILED)) {
            entries.push({
                type: 'failed',
                quest: quest
            });
        }

        return entries;
    }

    // Serialize for save/load
    serialize() {
        const data = {
            activeQuest: this.activeQuest,
            quests: {},
            questLog: this.questLog
        };

        for (const [id, quest] of this.quests) {
            data.quests[id] = quest.serialize();
        }

        return data;
    }

    // Deserialize from save data
    deserialize(data) {
        if (!data) return;

        this.activeQuest = data.activeQuest;
        this.questLog = data.questLog || [];

        // Restore quest states
        for (const [id, questData] of Object.entries(data.quests || {})) {
            const quest = this.quests.get(id);
            if (quest) {
                quest.state = questData.state;
                quest.startedAt = questData.startedAt;
                quest.completedAt = questData.completedAt;

                // Restore objective progress
                for (const objData of questData.objectives || []) {
                    const obj = quest.objectives.find(o => o.id === objData.id);
                    if (obj) {
                        obj.current = objData.current;
                        obj.completed = objData.completed;
                    }
                }
            }
        }
    }
}
