// History RPG - Prompt Builder
// Templates for AI-generated content

// Template variable pattern: {{variableName}}
const VAR_PATTERN = /\{\{(\w+)\}\}/g;

// Prompt templates
export const PROMPTS = {
    // Generate the initial scenario skeleton
    SCENARIO_SKELETON: `You are a historical narrative designer creating an interactive scenario.

Generate a scenario for:
- Time Period: {{timePeriod}}
- Location: {{location}}
- Date: {{date}}
- Player Role: {{characterType}}

Create an engaging 1-2 hour gameplay experience where the player can explore, interact with NPCs, make choices, and potentially "change history."

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
    "scenario": {
        "id": "unique_id",
        "title": "Scenario Title",
        "setting": "2-3 sentences describing the setting and atmosphere",
        "playerStart": {
            "x": 128,
            "y": 128,
            "locationId": "starting_location_id",
            "description": "Where the player begins"
        },
        "mainGoal": {
            "id": "goal_id",
            "title": "Short goal title",
            "description": "What the player must accomplish",
            "historicalOutcome": "What actually happened historically"
        },
        "optionalGoals": [
            {
                "id": "optional_goal_id",
                "title": "Optional goal title",
                "description": "Optional objective"
            }
        ],
        "goalPath": [
            {
                "step": 1,
                "objective": "First thing to do",
                "hints": ["Hint 1", "Hint 2"],
                "detailLevel": "high"
            },
            {
                "step": 2,
                "objective": "Second thing to do",
                "hints": ["Hint"],
                "detailLevel": "medium"
            }
        ],
        "keyLocations": [
            {
                "id": "location_id",
                "name": "Location Name",
                "type": "building|street|field|bunker|etc",
                "x": 130,
                "y": 125,
                "description": "Brief description",
                "importance": "high|medium|low"
            }
        ],
        "keyNPCs": [
            {
                "id": "npc_id",
                "name": "NPC Name",
                "role": "Their role (soldier, civilian, officer, etc)",
                "faction": "german|soviet|civilian|resistance",
                "locationId": "where_they_are",
                "personality": "Brief personality traits",
                "knowledge": ["topic1", "topic2"],
                "disposition": 50
            }
        ],
        "historicalEvents": [
            {
                "id": "event_id",
                "name": "Event Name",
                "date": "YYYY-MM-DD",
                "description": "What happens",
                "effects": ["effect1", "effect2"],
                "canPrevent": false
            }
        ],
        "items": [
            {
                "id": "item_id",
                "name": "Item Name",
                "description": "What it is",
                "locationId": "where_to_find",
                "hidden": true
            }
        ]
    }
}`,

    // Generate NPC dialogue response
    NPC_DIALOGUE: `You are {{npcName}}, a {{npcRole}} in {{location}} during {{timePeriod}}.

Your personality: {{personality}}
Your faction: {{faction}}
Your current mood: {{mood}}
Your disposition toward the player: {{disposition}}/100 (0=hostile, 50=neutral, 100=friendly)

Current situation: {{context}}
{{conversationHistory}}
The player (a {{playerRole}}) now says: "{{playerInput}}"

Respond in character. Consider:
- Your knowledge and what you might reveal
- Your disposition - are you helpful or guarded?
- Historical accuracy for the time period
- What you might want from the player
- The conversation history above - continue the discussion naturally

Return ONLY valid JSON:
{
    "speech": "Your spoken response (1-3 sentences, in character)",
    "emotion": "neutral|friendly|suspicious|fearful|angry|sad|hopeful",
    "internalThought": "What you're thinking but not saying",
    "dispositionChange": 0,
    "informationRevealed": ["topic1"],
    "itemsOffered": [],
    "itemsRequested": [],
    "suggestedChoices": [
        {
            "text": "Player response option",
            "type": "friendly|aggressive|neutral|deceptive|leaving",
            "consequence": "brief hint of what this might lead to"
        }
    ],
    "questUpdate": null
}`,

    // Generate location details
    LOCATION_DETAIL: `Generate detailed information for a location in {{location}} during {{timePeriod}}.

Location: {{locationName}}
Type: {{locationType}}
Time of day: {{timeOfDay}}
Weather: {{weather}}
Historical context: {{context}}

Return ONLY valid JSON:
{
    "description": {
        "short": "One sentence description",
        "long": "3-5 sentences with sensory details (sights, sounds, smells)",
        "atmosphere": "The mood and feeling of the place"
    },
    "features": [
        {
            "id": "feature_id",
            "name": "Feature Name",
            "description": "What it looks like",
            "position": {"dx": 0, "dy": 0},
            "interactable": true,
            "action": "examine|use|take|open|etc",
            "hiddenItem": null
        }
    ],
    "exits": [
        {
            "direction": "north|south|east|west|up|down",
            "destination": "Where it leads",
            "description": "What you see",
            "blocked": false,
            "blockedReason": null
        }
    ],
    "npcsPresent": [
        {
            "id": "npc_id",
            "activity": "What they're doing"
        }
    ],
    "items": [
        {
            "id": "item_id",
            "name": "Item Name",
            "position": {"dx": 2, "dy": 1},
            "hidden": false,
            "description": "Brief description"
        }
    ],
    "ambientSounds": ["sound1", "sound2"],
    "dangers": []
}`,

    // Generate terrain for a chunk
    TERRAIN_CHUNK: `Generate terrain data for a {{chunkSize}}x{{chunkSize}} tile area in {{location}} during {{timePeriod}}.

Chunk position: ({{chunkX}}, {{chunkY}})
Nearby features: {{nearbyFeatures}}
General terrain type: {{terrainType}}

Tile types available: ground, rubble, wall, floor, snow, water, road, building

Return ONLY valid JSON - an array of tiles:
{
    "tiles": [
        {"dx": 0, "dy": 0, "type": "ground", "height": 0},
        {"dx": 1, "dy": 0, "type": "road", "height": 0}
    ],
    "structures": [
        {
            "type": "ruined_building|intact_building|bunker|trench|etc",
            "x": 5,
            "y": 5,
            "width": 4,
            "height": 3,
            "description": "Brief description"
        }
    ]
}`,

    // Generate a historical event outcome
    EVENT_OUTCOME: `A historical event is occurring in {{location}} during {{timePeriod}}.

Event: {{eventName}}
Description: {{eventDescription}}
Player action: {{playerAction}}

The player is trying to: {{playerIntent}}

Determine the outcome considering:
- Historical plausibility
- The player's resources and position
- Butterfly effect potential

Return ONLY valid JSON:
{
    "success": true,
    "outcome": "What happens as a result",
    "historicalDeviation": "low|medium|high",
    "consequences": [
        {
            "type": "immediate|delayed",
            "description": "What changes"
        }
    ],
    "newGoal": null,
    "reputationChanges": {
        "faction": 0
    }
}`
};

export class PromptBuilder {
    constructor() {
        this.templates = { ...PROMPTS };
    }

    // Build a prompt from a template with variables
    build(templateName, variables = {}) {
        const template = this.templates[templateName];
        if (!template) {
            throw new Error(`Unknown prompt template: ${templateName}`);
        }

        return this.interpolate(template, variables);
    }

    // Replace {{variables}} in template
    interpolate(template, variables) {
        return template.replace(VAR_PATTERN, (match, varName) => {
            if (varName in variables) {
                const value = variables[varName];
                // Handle objects/arrays by stringifying
                if (typeof value === 'object') {
                    return JSON.stringify(value);
                }
                return String(value);
            }
            // Leave unmatched variables as-is (or empty)
            console.warn(`[PromptBuilder] Missing variable: ${varName}`);
            return '';
        });
    }

    // Add or override a template
    addTemplate(name, template) {
        this.templates[name] = template;
    }

    // Build scenario skeleton prompt
    buildScenarioPrompt(settings) {
        return this.build('SCENARIO_SKELETON', {
            timePeriod: settings.timePeriod || 'World War 2',
            location: settings.location || 'Stalingrad, Soviet Union',
            date: settings.date || 'November 1942',
            characterType: settings.characterType || 'civilian'
        });
    }

    // Build NPC dialogue prompt
    buildDialoguePrompt(npc, playerInput, context) {
        // Format conversation history if provided
        let conversationHistory = '';
        if (context.history && context.history.length > 0) {
            conversationHistory = '\nConversation so far:\n';
            for (const entry of context.history) {
                const speaker = entry.isPlayer ? 'Player' : npc.name;
                conversationHistory += `${speaker}: "${entry.text}"\n`;
            }
        }

        return this.build('NPC_DIALOGUE', {
            npcName: npc.name,
            npcRole: npc.role,
            location: context.location || 'the city',
            timePeriod: context.timePeriod || 'World War 2',
            personality: npc.personality || 'cautious',
            faction: npc.faction || 'civilian',
            mood: npc.mood || 'neutral',
            disposition: npc.disposition || 50,
            context: context.situation || 'The city is under siege.',
            playerRole: context.playerRole || 'civilian',
            playerInput: playerInput,
            conversationHistory: conversationHistory
        });
    }

    // Build location detail prompt
    buildLocationPrompt(location, context) {
        return this.build('LOCATION_DETAIL', {
            location: context.location || 'Stalingrad',
            timePeriod: context.timePeriod || 'November 1942',
            locationName: location.name,
            locationType: location.type || 'building',
            timeOfDay: context.timeOfDay || 'morning',
            weather: context.weather || 'cold and snowy',
            context: context.situation || 'The city is under siege.'
        });
    }

    // Build terrain chunk prompt
    buildTerrainPrompt(chunkX, chunkY, context) {
        return this.build('TERRAIN_CHUNK', {
            chunkSize: context.chunkSize || 16,
            location: context.location || 'Stalingrad',
            timePeriod: context.timePeriod || 'November 1942',
            chunkX: chunkX,
            chunkY: chunkY,
            nearbyFeatures: context.nearbyFeatures || 'ruined buildings',
            terrainType: context.terrainType || 'urban ruins'
        });
    }

    // Build event outcome prompt
    buildEventPrompt(event, playerAction, context) {
        return this.build('EVENT_OUTCOME', {
            location: context.location || 'Stalingrad',
            timePeriod: context.timePeriod || 'November 1942',
            eventName: event.name,
            eventDescription: event.description,
            playerAction: playerAction,
            playerIntent: context.playerIntent || 'change the outcome'
        });
    }
}
