// History RPG - Event System
// Manages historical events, triggers, and time progression

import { debugLog } from '../../../ui/DebugOverlay.js';

export class EventSystem {
    constructor(scenarioManager = null) {
        this.scenarioManager = scenarioManager;

        // Game time (separate from real time)
        this.gameTime = {
            date: null,           // Current game date
            hour: 6,              // 0-23
            minute: 0,            // 0-59
            timeScale: 60         // Game seconds per real second (1 minute = 1 second real time)
        };

        // Time tracking
        this.lastUpdateTime = 0;
        this.isPaused = false;

        // Event state
        this.activeEvents = new Set();
        this.completedEvents = new Set();
        this.eventQueue = [];  // Events scheduled to trigger

        // Condition-based triggers
        this.triggers = [];

        // Event callbacks
        this.onEventStart = null;
        this.onEventEnd = null;
        this.onTimeChange = null;
        this.onDayChange = null;
    }

    // Initialize with scenario
    initialize(scenario) {
        if (!scenario) return;

        // Set starting date from scenario
        if (scenario.date) {
            this.gameTime.date = new Date(scenario.date);
            debugLog(`[EventSystem] Starting date: ${this.gameTime.date.toDateString()}`);
        }

        // Set up time-based events from scenario
        this.setupHistoricalEvents(scenario.historicalEvents || []);

        debugLog(`[EventSystem] Initialized with ${this.eventQueue.length} scheduled events`);
    }

    // Set up historical events from scenario
    setupHistoricalEvents(events) {
        this.eventQueue = [];

        for (const event of events) {
            if (event.date) {
                this.eventQueue.push({
                    ...event,
                    triggerDate: new Date(event.date),
                    triggered: false
                });
            }
        }

        // Sort by date
        this.eventQueue.sort((a, b) => a.triggerDate - b.triggerDate);
    }

    // Update game time (call every frame)
    update(deltaTime) {
        if (this.isPaused || !this.gameTime.date) return;

        // Advance game time
        const gameSeconds = deltaTime * this.gameTime.timeScale;
        this.advanceTime(gameSeconds);

        // Check for triggered events
        this.checkTimeBasedEvents();

        // Check condition-based triggers
        this.checkConditionTriggers();
    }

    // Advance game time by seconds
    advanceTime(seconds) {
        const previousHour = this.gameTime.hour;
        const previousDate = new Date(this.gameTime.date);

        // Add seconds
        this.gameTime.minute += seconds / 60;

        // Handle minute overflow
        while (this.gameTime.minute >= 60) {
            this.gameTime.minute -= 60;
            this.gameTime.hour++;
        }

        // Handle hour overflow
        while (this.gameTime.hour >= 24) {
            this.gameTime.hour -= 24;
            this.gameTime.date.setDate(this.gameTime.date.getDate() + 1);

            if (this.onDayChange) {
                this.onDayChange(this.gameTime.date);
            }
            debugLog(`[EventSystem] New day: ${this.gameTime.date.toDateString()}`);
        }

        // Notify on hour change
        if (Math.floor(previousHour) !== Math.floor(this.gameTime.hour)) {
            if (this.onTimeChange) {
                this.onTimeChange(this.getTimeInfo());
            }
        }
    }

    // Check for time-based historical events
    checkTimeBasedEvents() {
        const currentTime = this.gameTime.date.getTime() +
            (this.gameTime.hour * 3600000) +
            (this.gameTime.minute * 60000);

        for (const event of this.eventQueue) {
            if (event.triggered) continue;

            const eventTime = event.triggerDate.getTime();

            if (currentTime >= eventTime) {
                this.triggerEvent(event);
                event.triggered = true;
            }
        }
    }

    // Trigger an event
    triggerEvent(event) {
        if (this.activeEvents.has(event.id)) return;
        if (this.completedEvents.has(event.id)) return;

        debugLog(`[EventSystem] Event triggered: ${event.name}`);

        this.activeEvents.add(event.id);

        // Notify scenario manager
        if (this.scenarioManager) {
            this.scenarioManager.triggerEvent(event.id);
        }

        // Apply event effects
        this.applyEventEffects(event);

        // Callback
        if (this.onEventStart) {
            this.onEventStart(event);
        }

        // Auto-complete events without duration
        if (!event.duration) {
            this.completeEvent(event);
        }
    }

    // Apply event effects
    applyEventEffects(event) {
        if (!event.triggers) return;

        for (const trigger of event.triggers) {
            this.processTrigger(trigger, event);
        }
    }

    // Process a trigger effect
    processTrigger(triggerId, event) {
        debugLog(`[EventSystem] Processing trigger: ${triggerId}`);

        // Handle common trigger types
        switch (triggerId) {
            case 'soviet_reputation_boost':
                if (this.scenarioManager) {
                    this.scenarioManager.modifyReputation('soviet', 10);
                    this.scenarioManager.modifyReputation('civilian', 5);
                }
                break;

            case 'german_morale_drop':
                // Could affect NPC behaviors
                break;

            case 'weather_change':
                // Trigger weather effects
                break;

            case 'evacuation_routes_change':
                // Modify available paths
                break;

            case 'german_patrols_reduced':
                // Reduce danger in certain areas
                break;

            case 'escape_window_closes':
                // Make escape much harder after encirclement
                if (this.scenarioManager) {
                    this.scenarioManager.addDeviation(20, 'Escape window closing');
                }
                break;

            default:
                // Custom trigger handling could be added here
                debugLog(`[EventSystem] Unknown trigger: ${triggerId}`);
        }
    }

    // Complete an event
    completeEvent(event) {
        this.activeEvents.delete(event.id);
        this.completedEvents.add(event.id);

        debugLog(`[EventSystem] Event completed: ${event.name}`);

        if (this.onEventEnd) {
            this.onEventEnd(event);
        }
    }

    // Add a condition-based trigger
    addTrigger(id, condition, callback) {
        this.triggers.push({
            id,
            condition,
            callback,
            triggered: false
        });
    }

    // Remove a trigger
    removeTrigger(id) {
        this.triggers = this.triggers.filter(t => t.id !== id);
    }

    // Check all condition triggers
    checkConditionTriggers() {
        for (const trigger of this.triggers) {
            if (trigger.triggered) continue;

            try {
                if (trigger.condition()) {
                    trigger.triggered = true;
                    trigger.callback();
                    debugLog(`[EventSystem] Condition trigger fired: ${trigger.id}`);
                }
            } catch (error) {
                debugLog(`[EventSystem] Trigger error (${trigger.id}): ${error.message}`);
            }
        }
    }

    // Reset a trigger so it can fire again
    resetTrigger(id) {
        const trigger = this.triggers.find(t => t.id === id);
        if (trigger) {
            trigger.triggered = false;
        }
    }

    // Get current time info
    getTimeInfo() {
        return {
            date: this.gameTime.date,
            hour: Math.floor(this.gameTime.hour),
            minute: Math.floor(this.gameTime.minute),
            timeOfDay: this.getTimeOfDay(),
            dateString: this.formatDate(),
            timeString: this.formatTime()
        };
    }

    // Get time of day (dawn, day, dusk, night)
    getTimeOfDay() {
        const hour = this.gameTime.hour;

        if (hour >= 5 && hour < 7) return 'dawn';
        if (hour >= 7 && hour < 18) return 'day';
        if (hour >= 18 && hour < 20) return 'dusk';
        return 'night';
    }

    // Check if it's dark
    isDark() {
        const tod = this.getTimeOfDay();
        return tod === 'night' || tod === 'dusk';
    }

    // Format date for display
    formatDate() {
        if (!this.gameTime.date) return 'Unknown';

        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return this.gameTime.date.toLocaleDateString('en-US', options);
    }

    // Format time for display
    formatTime() {
        const hour = Math.floor(this.gameTime.hour);
        const minute = Math.floor(this.gameTime.minute);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        const displayMinute = minute.toString().padStart(2, '0');

        return `${displayHour}:${displayMinute} ${ampm}`;
    }

    // Set specific time
    setTime(hour, minute = 0) {
        this.gameTime.hour = hour;
        this.gameTime.minute = minute;

        if (this.onTimeChange) {
            this.onTimeChange(this.getTimeInfo());
        }
    }

    // Set specific date
    setDate(dateString) {
        this.gameTime.date = new Date(dateString);

        if (this.onDayChange) {
            this.onDayChange(this.gameTime.date);
        }
    }

    // Skip to next time of day
    skipToTimeOfDay(targetTimeOfDay) {
        const targets = {
            'dawn': 5,
            'day': 7,
            'dusk': 18,
            'night': 20
        };

        let targetHour = targets[targetTimeOfDay];
        if (targetHour === undefined) return;

        // If target is earlier in the day, advance to next day
        if (targetHour <= this.gameTime.hour) {
            this.gameTime.date.setDate(this.gameTime.date.getDate() + 1);
            if (this.onDayChange) {
                this.onDayChange(this.gameTime.date);
            }
        }

        this.gameTime.hour = targetHour;
        this.gameTime.minute = 0;

        // Check events we might have skipped past
        this.checkTimeBasedEvents();

        if (this.onTimeChange) {
            this.onTimeChange(this.getTimeInfo());
        }

        debugLog(`[EventSystem] Skipped to ${targetTimeOfDay}: ${this.formatTime()}`);
    }

    // Pause time
    pause() {
        this.isPaused = true;
    }

    // Resume time
    resume() {
        this.isPaused = false;
    }

    // Set time scale (how fast time passes)
    setTimeScale(scale) {
        this.gameTime.timeScale = scale;
        debugLog(`[EventSystem] Time scale set to ${scale}x`);
    }

    // Get upcoming events (for UI)
    getUpcomingEvents(count = 5) {
        return this.eventQueue
            .filter(e => !e.triggered)
            .slice(0, count)
            .map(e => ({
                id: e.id,
                name: e.name,
                date: e.triggerDate,
                description: e.description
            }));
    }

    // Get active events (for UI)
    getActiveEvents() {
        return this.eventQueue.filter(e => this.activeEvents.has(e.id));
    }

    // Check if specific event has occurred
    hasEventOccurred(eventId) {
        return this.completedEvents.has(eventId) || this.activeEvents.has(eventId);
    }

    // Serialize state for saving
    serialize() {
        return {
            gameTime: {
                date: this.gameTime.date?.toISOString(),
                hour: this.gameTime.hour,
                minute: this.gameTime.minute,
                timeScale: this.gameTime.timeScale
            },
            activeEvents: Array.from(this.activeEvents),
            completedEvents: Array.from(this.completedEvents),
            triggeredQueueEvents: this.eventQueue
                .filter(e => e.triggered)
                .map(e => e.id)
        };
    }

    // Deserialize state from save
    deserialize(data) {
        if (data.gameTime) {
            this.gameTime.date = data.gameTime.date ? new Date(data.gameTime.date) : null;
            this.gameTime.hour = data.gameTime.hour || 6;
            this.gameTime.minute = data.gameTime.minute || 0;
            this.gameTime.timeScale = data.gameTime.timeScale || 60;
        }

        this.activeEvents = new Set(data.activeEvents || []);
        this.completedEvents = new Set(data.completedEvents || []);

        // Restore triggered state for queue events
        if (data.triggeredQueueEvents) {
            for (const event of this.eventQueue) {
                event.triggered = data.triggeredQueueEvents.includes(event.id);
            }
        }

        debugLog(`[EventSystem] State deserialized`);
    }
}
