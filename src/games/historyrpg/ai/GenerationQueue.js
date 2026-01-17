// History RPG - Generation Queue
// Prioritized queue for AI generation requests

import { AI_PRIORITY } from '../config.js';
import { debugLog } from '../../../ui/DebugOverlay.js';

export class GenerationQueue {
    constructor(aiGateway, promptBuilder, responseParser) {
        this.gateway = aiGateway;
        this.promptBuilder = promptBuilder;
        this.parser = responseParser;

        // Queue of pending requests
        this.queue = [];

        // Currently processing
        this.processing = false;
        this.currentRequest = null;

        // Event callbacks
        this.onRequestStart = null;
        this.onRequestComplete = null;
        this.onRequestError = null;
        this.onQueueEmpty = null;

        // Configuration
        this.maxRetries = 2;
        this.retryDelay = 1000;
    }

    // Add a request to the queue
    enqueue(request) {
        debugLog(`[GenQueue] Enqueueing request: ${request.type} (priority: ${request.priority})`);
        return new Promise((resolve, reject) => {
            const queueItem = {
                ...request,
                id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                priority: request.priority ?? AI_PRIORITY.FAR_TERRAIN,
                retries: 0,
                resolve,
                reject,
                timestamp: Date.now()
            };

            this.queue.push(queueItem);
            this.sortQueue();
            debugLog(`[GenQueue] Queue size: ${this.queue.length}, processing: ${this.processing}`);

            // Start processing if not already
            if (!this.processing) {
                this.processNext();
            }
        });
    }

    // Sort queue by priority (lower number = higher priority)
    sortQueue() {
        this.queue.sort((a, b) => {
            // First by priority
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            // Then by timestamp (older first)
            return a.timestamp - b.timestamp;
        });
    }

    // Process the next item in the queue
    async processNext() {
        debugLog(`[GenQueue] processNext() - queue: ${this.queue.length}, processing: ${this.processing}`);
        if (this.processing || this.queue.length === 0) {
            if (this.queue.length === 0 && this.onQueueEmpty) {
                debugLog(`[GenQueue] Queue empty, calling onQueueEmpty`);
                this.onQueueEmpty();
            }
            return;
        }

        this.processing = true;
        this.currentRequest = this.queue.shift();
        debugLog(`[GenQueue] Processing request: ${this.currentRequest.type} (id: ${this.currentRequest.id})`);

        if (this.onRequestStart) {
            this.onRequestStart(this.currentRequest);
        }

        try {
            const result = await this.processRequest(this.currentRequest);
            debugLog(`[GenQueue] Request completed successfully: ${this.currentRequest.type}`);
            this.currentRequest.resolve(result);

            if (this.onRequestComplete) {
                this.onRequestComplete(this.currentRequest, result);
            }
        } catch (error) {
            debugLog(`[GenQueue] Request error: ${error.message}`);
            // Handle retries
            if (this.currentRequest.retries < this.maxRetries) {
                this.currentRequest.retries++;
                debugLog(`[GenQueue] Retrying request (attempt ${this.currentRequest.retries})`);

                // Re-add to queue with slight delay
                setTimeout(() => {
                    this.queue.unshift(this.currentRequest);
                    this.processing = false;
                    this.currentRequest = null;
                    this.processNext();
                }, this.retryDelay);
                return;
            }

            // Max retries reached
            debugLog(`[GenQueue] Max retries reached, rejecting request`);
            this.currentRequest.reject(error);

            if (this.onRequestError) {
                this.onRequestError(this.currentRequest, error);
            }
        }

        this.processing = false;
        this.currentRequest = null;

        // Small delay between requests
        setTimeout(() => this.processNext(), 100);
    }

    // Process a single request
    async processRequest(request) {
        const { type, data } = request;
        debugLog(`[GenQueue] processRequest() - type: ${type}`);

        let prompt;
        let parseMethod;

        switch (type) {
            case 'scenario':
                prompt = this.promptBuilder.buildScenarioPrompt(data);
                parseMethod = 'parseScenario';
                break;

            case 'dialogue':
                prompt = this.promptBuilder.buildDialoguePrompt(data.npc, data.playerInput, data.context);
                parseMethod = 'parseDialogue';
                break;

            case 'location':
                prompt = this.promptBuilder.buildLocationPrompt(data.location, data.context);
                parseMethod = 'parseLocation';
                break;

            case 'terrain':
                prompt = this.promptBuilder.buildTerrainPrompt(data.chunkX, data.chunkY, data.context);
                parseMethod = 'parseTerrain';
                break;

            case 'event':
                prompt = this.promptBuilder.buildEventPrompt(data.event, data.playerAction, data.context);
                parseMethod = 'parseEvent';
                break;

            default:
                debugLog(`[GenQueue] ERROR: Unknown request type: ${type}`);
                throw new Error(`Unknown request type: ${type}`);
        }

        debugLog(`[GenQueue] Built prompt (${prompt.length} chars), calling AI...`);

        // Call AI
        const response = await this.gateway.generate(prompt, request.options || {});

        debugLog(`[GenQueue] AI response received, parsing with ${parseMethod}...`);

        // Parse response
        const parsed = this.parser[parseMethod](response);

        debugLog(`[GenQueue] Parsed response successfully`);

        return parsed;
    }

    // Convenience methods for common request types

    async generateScenario(settings) {
        return this.enqueue({
            type: 'scenario',
            priority: AI_PRIORITY.SCENARIO_SKELETON,
            data: settings
        });
    }

    async generateDialogue(npc, playerInput, context) {
        return this.enqueue({
            type: 'dialogue',
            priority: AI_PRIORITY.NPC_DIALOGUE,
            data: { npc, playerInput, context }
        });
    }

    async generateLocation(location, context) {
        return this.enqueue({
            type: 'location',
            priority: AI_PRIORITY.LOCATION_DETAILS,
            data: { location, context }
        });
    }

    async generateTerrain(chunkX, chunkY, context, priority = AI_PRIORITY.FAR_TERRAIN) {
        return this.enqueue({
            type: 'terrain',
            priority,
            data: { chunkX, chunkY, context }
        });
    }

    async generateEventOutcome(event, playerAction, context) {
        return this.enqueue({
            type: 'event',
            priority: AI_PRIORITY.NPC_DIALOGUE, // Same as dialogue - high priority
            data: { event, playerAction, context }
        });
    }

    // Cancel requests that are no longer relevant
    cancelByFilter(filterFn) {
        const cancelled = [];
        this.queue = this.queue.filter(item => {
            if (filterFn(item)) {
                item.reject(new Error('Request cancelled'));
                cancelled.push(item);
                return false;
            }
            return true;
        });
        return cancelled;
    }

    // Cancel all terrain requests outside a given range
    cancelDistantTerrain(playerX, playerY, maxDistance) {
        return this.cancelByFilter(item => {
            if (item.type !== 'terrain') return false;

            const dx = item.data.chunkX * 16 - playerX;
            const dy = item.data.chunkY * 16 - playerY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            return dist > maxDistance;
        });
    }

    // Get queue status
    getStatus() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            currentRequest: this.currentRequest ? {
                id: this.currentRequest.id,
                type: this.currentRequest.type,
                priority: this.currentRequest.priority
            } : null,
            pendingByType: this.queue.reduce((acc, item) => {
                acc[item.type] = (acc[item.type] || 0) + 1;
                return acc;
            }, {})
        };
    }

    // Clear the queue
    clear() {
        for (const item of this.queue) {
            item.reject(new Error('Queue cleared'));
        }
        this.queue = [];
    }

    // Check if queue has pending items of a type
    hasPending(type) {
        return this.queue.some(item => item.type === type);
    }

    // Get estimated wait time (rough)
    getEstimatedWaitTime() {
        // Assume ~3 seconds per request
        const baseTime = 3000;
        return this.queue.length * baseTime;
    }
}
