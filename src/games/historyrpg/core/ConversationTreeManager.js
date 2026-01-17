// History RPG - Conversation Tree Manager
// Manages pre-generated conversation trees for NPCs

import { debugLog } from '../../../ui/DebugOverlay.js';

export class ConversationTreeManager {
    constructor() {
        // Conversation trees indexed by NPC id
        this.trees = {};

        // Active conversation state
        this.activeNpcId = null;
        this.currentNodeId = null;

        // Conversation history per NPC
        this.npcStates = {};

        // Callbacks
        this.onNodeChange = null;
        this.onConversationEnd = null;
        this.onObjectiveComplete = null;
        this.onItemReceived = null;
        this.onItemRequired = null;
    }

    // Load conversation trees from scenario data
    loadTrees(conversationTrees) {
        this.trees = conversationTrees || {};
        debugLog(`[ConversationTree] Loaded ${Object.keys(this.trees).length} conversation trees`);
    }

    // Check if an NPC has a conversation tree
    hasTree(npcId) {
        return !!this.trees[npcId];
    }

    // Get NPC's current state
    getNpcState(npcId) {
        if (!this.npcStates[npcId]) {
            this.npcStates[npcId] = {
                hasMetPlayer: false,
                isComplete: false,
                currentNode: null,
                visitedNodes: [],
                itemsGiven: [],
                itemsReceived: []
            };
        }
        return this.npcStates[npcId];
    }

    // Start a conversation with an NPC
    startConversation(npcId, playerInventory = []) {
        const tree = this.trees[npcId];
        if (!tree) {
            debugLog(`[ConversationTree] No tree found for ${npcId}`);
            return null;
        }

        const state = this.getNpcState(npcId);
        this.activeNpcId = npcId;

        // Determine starting node
        let startNode;
        if (state.isComplete && tree.conclusion?.afterComplete) {
            // NPC has completed their part - show post-completion dialogue
            startNode = {
                id: 'afterComplete',
                npcSpeech: tree.conclusion.afterComplete,
                choices: [{ text: "Goodbye.", nextNode: "END", type: "neutral" }]
            };
        } else if (state.isComplete && tree.conclusion) {
            // Show conclusion
            startNode = tree.conclusion;
        } else if (state.hasMetPlayer && state.currentNode && tree.nodes[state.currentNode]) {
            // Resume from where we left off
            startNode = tree.nodes[state.currentNode];
        } else {
            // First meeting - show intro
            startNode = tree.intro;
            state.hasMetPlayer = true;
        }

        this.currentNodeId = startNode.id;
        state.visitedNodes.push(startNode.id);

        debugLog(`[ConversationTree] Started conversation with ${npcId} at node: ${startNode.id}`);

        // Filter choices based on requirements
        const availableChoices = this.filterChoices(startNode.choices, playerInventory);

        return {
            npcId: npcId,
            nodeId: startNode.id,
            speech: startNode.npcSpeech,
            choices: availableChoices,
            isConclusion: startNode.id === 'conclusion' || startNode.id === 'afterComplete'
        };
    }

    // Process player's choice and advance conversation
    processChoice(choiceIndex, playerInventory = []) {
        if (!this.activeNpcId) {
            debugLog(`[ConversationTree] No active conversation`);
            return null;
        }

        const tree = this.trees[this.activeNpcId];
        const state = this.getNpcState(this.activeNpcId);

        // Get current node
        let currentNode;
        if (this.currentNodeId === 'intro') {
            currentNode = tree.intro;
        } else if (this.currentNodeId === 'conclusion') {
            currentNode = tree.conclusion;
        } else {
            currentNode = tree.nodes[this.currentNodeId];
        }

        if (!currentNode || !currentNode.choices) {
            debugLog(`[ConversationTree] Invalid current node: ${this.currentNodeId}`);
            return null;
        }

        // Get available choices (filtered)
        const availableChoices = this.filterChoices(currentNode.choices, playerInventory);
        const selectedChoice = availableChoices[choiceIndex];

        if (!selectedChoice) {
            debugLog(`[ConversationTree] Invalid choice index: ${choiceIndex}`);
            return null;
        }

        debugLog(`[ConversationTree] Player chose: "${selectedChoice.text}" -> ${selectedChoice.nextNode}`);

        // Handle item requirements/rewards
        let result = {
            choiceText: selectedChoice.text,
            itemReceived: null,
            itemRequired: null,
            objectiveCompleted: null
        };

        // Check if choice gives an item
        if (selectedChoice.givesItem) {
            result.itemReceived = selectedChoice.givesItem;
            state.itemsGiven.push(selectedChoice.givesItem);
            if (this.onItemReceived) {
                this.onItemReceived(selectedChoice.givesItem);
            }
        }

        // Check if choice completes an objective
        if (selectedChoice.completesObjective) {
            result.objectiveCompleted = selectedChoice.completesObjective;
            if (this.onObjectiveComplete) {
                this.onObjectiveComplete(selectedChoice.completesObjective);
            }
        }

        // Handle conversation end
        if (selectedChoice.nextNode === 'END') {
            debugLog(`[ConversationTree] Conversation ended`);
            this.endConversation();
            return {
                ...result,
                ended: true,
                speech: null,
                choices: []
            };
        }

        // Move to next node
        let nextNode;
        if (selectedChoice.nextNode === 'conclusion') {
            nextNode = tree.conclusion;
            state.isComplete = true;
        } else {
            nextNode = tree.nodes[selectedChoice.nextNode];
        }

        if (!nextNode) {
            debugLog(`[ConversationTree] Node not found: ${selectedChoice.nextNode}`);
            this.endConversation();
            return { ...result, ended: true, speech: null, choices: [] };
        }

        // Update state
        this.currentNodeId = nextNode.id;
        state.currentNode = nextNode.id;
        state.visitedNodes.push(nextNode.id);

        // Filter choices for next node
        const nextChoices = this.filterChoices(nextNode.choices, playerInventory);

        if (this.onNodeChange) {
            this.onNodeChange(this.activeNpcId, nextNode.id);
        }

        return {
            ...result,
            ended: false,
            nodeId: nextNode.id,
            speech: nextNode.npcSpeech,
            choices: nextChoices,
            isConclusion: nextNode.id === 'conclusion'
        };
    }

    // Filter choices based on item requirements
    filterChoices(choices, playerInventory = []) {
        if (!choices) return [];

        return choices.map((choice, index) => {
            const hasRequiredItem = !choice.requiresItem ||
                playerInventory.includes(choice.requiresItem);

            return {
                ...choice,
                originalIndex: index,
                available: hasRequiredItem,
                requirementMet: hasRequiredItem
            };
        }).filter(choice => {
            // If choice requires an item and player doesn't have it, hide it
            // unless it's the only non-leaving choice
            if (!choice.available && choice.requiresItem) {
                return false;
            }
            return true;
        });
    }

    // End the current conversation
    endConversation() {
        const npcId = this.activeNpcId;
        this.activeNpcId = null;
        this.currentNodeId = null;

        if (this.onConversationEnd && npcId) {
            this.onConversationEnd(npcId);
        }
    }

    // Check if NPC's conversation is complete
    isNpcComplete(npcId) {
        return this.getNpcState(npcId).isComplete;
    }

    // Mark NPC's conversation as complete
    markComplete(npcId) {
        this.getNpcState(npcId).isComplete = true;
    }

    // Get all NPCs the player has met
    getMetNpcs() {
        return Object.entries(this.npcStates)
            .filter(([id, state]) => state.hasMetPlayer)
            .map(([id]) => id);
    }

    // Reset all conversation states (for new game)
    reset() {
        this.npcStates = {};
        this.activeNpcId = null;
        this.currentNodeId = null;
    }

    // Serialize for save/load
    serialize() {
        return {
            npcStates: this.npcStates,
            activeNpcId: this.activeNpcId,
            currentNodeId: this.currentNodeId
        };
    }

    // Deserialize from save data
    deserialize(data) {
        if (data) {
            this.npcStates = data.npcStates || {};
            this.activeNpcId = data.activeNpcId || null;
            this.currentNodeId = data.currentNodeId || null;
        }
    }
}
