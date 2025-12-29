// History RPG - Cutscene Manager
// Manages story cutscenes and trigger conditions

import { debugLog } from '../../../ui/DebugOverlay.js';

// Cutscene trigger types
export const CUTSCENE_TRIGGERS = {
    GAME_START: 'game_start',
    QUEST_START: 'quest_start',
    QUEST_COMPLETE: 'quest_complete',
    LOCATION: 'location',
    NPC_MEET: 'npc_meet',
    ITEM_PICKUP: 'item_pickup',
    TIME: 'time',
    CHOICE: 'choice',
    CUSTOM: 'custom'
};

// Pre-built cutscene templates for Stalingrad
const STALINGRAD_CUTSCENES = {
    intro: {
        id: 'intro',
        title: 'The Siege',
        autoAdvance: false,
        frames: [
            {
                environment: 'exterior_day',
                title: 'Stalingrad',
                subtitle: 'November 1942',
                text: 'The city lies in ruins. For months, the battle has raged through every street, every building. The German 6th Army pushes relentlessly, but the Soviet defenders hold.'
            },
            {
                environment: 'interior_ruined',
                text: 'You are a civilian caught in the crossfire. Survival is your only goal now. Food is scarce. Trust is scarcer. The winter grows colder with each passing day.'
            },
            {
                environment: 'interior_ruined',
                text: 'The distant sound of artillery echoes through the empty streets. Somewhere, a child cries. This is your reality now. This is Stalingrad.'
            }
        ],
        trigger: CUTSCENE_TRIGGERS.GAME_START
    },

    npc_yuri_intro: {
        id: 'npc_yuri_intro',
        title: 'A Familiar Face',
        autoAdvance: false,
        frames: [
            {
                environment: 'interior_ruined',
                character: { name: 'Yuri Volkov', faction: 'civilian' },
                text: 'A figure emerges from the shadows. His clothes are torn, his face gaunt, but his eyes still hold a spark of determination.'
            },
            {
                environment: 'interior_ruined',
                character: { name: 'Yuri Volkov', faction: 'civilian' },
                text: '"Another survivor," he says, studying you carefully. "These days, that means either an ally or a threat. Which are you?"'
            }
        ],
        trigger: CUTSCENE_TRIGGERS.NPC_MEET,
        triggerTarget: 'npc_yuri'
    },

    npc_commissar_intro: {
        id: 'npc_commissar_intro',
        title: 'The Commissar',
        autoAdvance: false,
        frames: [
            {
                environment: 'interior_bunker',
                character: { name: 'Commissar Petrov', faction: 'soviet' },
                text: 'The Soviet officer regards you with cold suspicion. His uniform is pristine despite the chaos around him.'
            },
            {
                environment: 'interior_bunker',
                character: { name: 'Commissar Petrov', faction: 'soviet' },
                text: '"Every pair of hands is needed for the defense of the Motherland. You will serve the cause, or you will be considered a deserter. The penalty for desertion is death."'
            }
        ],
        trigger: CUTSCENE_TRIGGERS.NPC_MEET,
        triggerTarget: 'npc_commissar'
    },

    tunnel_discovery: {
        id: 'tunnel_discovery',
        title: 'The Hidden Path',
        autoAdvance: false,
        frames: [
            {
                environment: 'cellar',
                text: 'Behind a pile of rubble, you discover a narrow passage. The air is damp and cold. This tunnel was not here before the war.'
            },
            {
                environment: 'cellar',
                text: 'The passage stretches into darkness. Who made it? Where does it lead? It could be a way out... or a trap.'
            }
        ],
        trigger: CUTSCENE_TRIGGERS.LOCATION,
        triggerTarget: 'loc_tunnel'
    },

    escape_ending: {
        id: 'escape_ending',
        title: 'Freedom',
        autoAdvance: false,
        frames: [
            {
                environment: 'exterior_day',
                text: 'The river stretches before you. Beyond it, the sounds of battle grow distant. You have survived the siege of Stalingrad.'
            },
            {
                environment: 'exterior_day',
                text: 'History will remember this battle as a turning point. But for you, it was simply about survival. About keeping your humanity in the face of unimaginable horror.'
            },
            {
                environment: 'exterior_day',
                title: 'THE END',
                text: 'Your choices mattered. Your story continues beyond these walls.'
            }
        ],
        trigger: CUTSCENE_TRIGGERS.QUEST_COMPLETE,
        triggerTarget: 'escape_city'
    },

    historical_uranus: {
        id: 'historical_uranus',
        title: 'Operation Uranus',
        autoAdvance: false,
        frames: [
            {
                environment: 'exterior_night',
                text: 'The ground shakes with the thunder of artillery. Soviet forces have launched a massive counter-offensive to the north and south.'
            },
            {
                environment: 'exterior_night',
                text: 'The German 6th Army is about to be surrounded. The hunters have become the hunted. Everything is about to change.'
            }
        ],
        trigger: CUTSCENE_TRIGGERS.TIME,
        triggerTime: { month: 11, day: 19 }
    }
};

export class CutsceneManager {
    constructor(cutsceneRenderer) {
        this.renderer = cutsceneRenderer;

        // Available cutscenes
        this.cutscenes = new Map();

        // Triggered cutscenes (won't trigger again)
        this.triggeredCutscenes = new Set();

        // Pending cutscene queue
        this.pendingQueue = [];

        // Callbacks
        this.onCutsceneStart = null;
        this.onCutsceneEnd = null;

        // Load pre-built cutscenes
        this.loadPrebuiltCutscenes();

        // Set up renderer callback
        if (this.renderer) {
            this.renderer.onCutsceneEnd = (cutscene) => {
                this.handleCutsceneEnd(cutscene);
            };
        }
    }

    // Load pre-built cutscenes
    loadPrebuiltCutscenes() {
        for (const [id, cutscene] of Object.entries(STALINGRAD_CUTSCENES)) {
            this.cutscenes.set(id, cutscene);
        }
        debugLog(`[CutsceneManager] Loaded ${this.cutscenes.size} pre-built cutscenes`);
    }

    // Add a custom cutscene
    addCutscene(cutscene) {
        if (!cutscene.id) {
            cutscene.id = `cutscene_${Date.now()}`;
        }
        this.cutscenes.set(cutscene.id, cutscene);
    }

    // Get a cutscene by ID
    getCutscene(id) {
        return this.cutscenes.get(id);
    }

    // Check and trigger cutscenes based on game events
    checkTrigger(triggerType, targetId = null, context = {}) {
        for (const cutscene of this.cutscenes.values()) {
            // Skip already triggered
            if (this.triggeredCutscenes.has(cutscene.id)) continue;

            // Check trigger match
            if (cutscene.trigger !== triggerType) continue;

            // Check target match (if applicable)
            if (cutscene.triggerTarget && cutscene.triggerTarget !== targetId) continue;

            // Check time trigger (if applicable)
            if (triggerType === CUTSCENE_TRIGGERS.TIME && cutscene.triggerTime) {
                if (context.month !== cutscene.triggerTime.month ||
                    context.day !== cutscene.triggerTime.day) {
                    continue;
                }
            }

            // Trigger the cutscene
            this.queueCutscene(cutscene.id);
        }
    }

    // Queue a cutscene to play
    queueCutscene(cutsceneId) {
        const cutscene = this.cutscenes.get(cutsceneId);
        if (!cutscene) {
            debugLog(`[CutsceneManager] Cutscene not found: ${cutsceneId}`);
            return;
        }

        // Mark as triggered
        this.triggeredCutscenes.add(cutsceneId);

        // Add to queue
        this.pendingQueue.push(cutscene);
        debugLog(`[CutsceneManager] Queued cutscene: ${cutsceneId}`);

        // Start if nothing playing
        if (!this.renderer.isActive()) {
            this.playNext();
        }
    }

    // Play next cutscene in queue
    playNext() {
        if (this.pendingQueue.length === 0) return false;

        const cutscene = this.pendingQueue.shift();
        this.playCutscene(cutscene);
        return true;
    }

    // Play a specific cutscene
    playCutscene(cutscene) {
        if (!this.renderer) {
            debugLog('[CutsceneManager] No renderer available');
            return;
        }

        this.renderer.startCutscene(cutscene);

        if (this.onCutsceneStart) {
            this.onCutsceneStart(cutscene);
        }
    }

    // Handle cutscene end
    handleCutsceneEnd(cutscene) {
        debugLog(`[CutsceneManager] Cutscene complete: ${cutscene?.id}`);

        if (this.onCutsceneEnd) {
            this.onCutsceneEnd(cutscene);
        }

        // Play next in queue
        this.playNext();
    }

    // Update (call every frame)
    update(deltaTime) {
        if (this.renderer?.isActive()) {
            return this.renderer.update(deltaTime);
        }
        return false;
    }

    // Render current cutscene
    render() {
        if (this.renderer?.isActive()) {
            this.renderer.render();
        }
    }

    // Handle input
    handleInput(key) {
        if (this.renderer?.isActive()) {
            return this.renderer.handleInput(key);
        }
        return false;
    }

    // Check if cutscene is playing
    isPlaying() {
        return this.renderer?.isActive() || false;
    }

    // Skip current cutscene
    skip() {
        if (this.renderer?.isActive()) {
            this.renderer.skip();
        }
    }

    // Reset triggered state (for new game)
    reset() {
        this.triggeredCutscenes.clear();
        this.pendingQueue = [];
    }

    // Serialize for save/load
    serialize() {
        return {
            triggered: Array.from(this.triggeredCutscenes)
        };
    }

    // Deserialize from save data
    deserialize(data) {
        if (data?.triggered) {
            this.triggeredCutscenes = new Set(data.triggered);
        }
    }

    // Create a simple cutscene on the fly
    createSimpleCutscene(title, text, environment = 'interior_ruined', character = null) {
        const cutscene = {
            id: `simple_${Date.now()}`,
            title: title,
            autoAdvance: false,
            frames: [
                {
                    environment: environment,
                    title: title,
                    text: text,
                    character: character
                }
            ]
        };

        return cutscene;
    }

    // Play intro cutscene if not already played
    playIntroIfNeeded() {
        if (!this.triggeredCutscenes.has('intro')) {
            this.queueCutscene('intro');
            return true;
        }
        return false;
    }
}
