// History RPG - Response Parser
// Extract and validate JSON from AI responses

export class ResponseParser {
    constructor() {
        // Validation schemas for different response types
        this.schemas = {
            scenario: {
                required: ['scenario'],
                nested: {
                    scenario: {
                        required: ['id', 'title', 'setting', 'playerStart', 'mainGoal', 'goalPath', 'keyLocations', 'keyNPCs']
                    }
                }
            },
            dialogue: {
                required: ['speech', 'emotion', 'suggestedChoices']
            },
            location: {
                required: ['description', 'features', 'exits']
            },
            terrain: {
                required: ['tiles']
            },
            event: {
                required: ['success', 'outcome', 'consequences']
            }
        };
    }

    // Main parse method - extracts JSON from response text
    parse(responseText, type = null) {
        // Try to extract JSON from the response
        const json = this.extractJSON(responseText);

        if (!json) {
            throw new Error('No valid JSON found in response');
        }

        // Validate against schema if type is provided
        if (type && this.schemas[type]) {
            this.validate(json, this.schemas[type]);
        }

        return json;
    }

    // Extract JSON from text (handles markdown code blocks, etc.)
    extractJSON(text) {
        if (!text || typeof text !== 'string') {
            return null;
        }

        // Try parsing as-is first (clean JSON response)
        try {
            return JSON.parse(text.trim());
        } catch (e) {
            // Continue to extraction methods
        }

        // Try to find JSON in markdown code block
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
            try {
                return JSON.parse(codeBlockMatch[1].trim());
            } catch (e) {
                // Continue to other methods
            }
        }

        // Try to find JSON object or array in text
        const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch (e) {
                // Try to fix common JSON issues
                const fixed = this.fixCommonJSONErrors(jsonMatch[1]);
                try {
                    return JSON.parse(fixed);
                } catch (e2) {
                    // Give up
                }
            }
        }

        return null;
    }

    // Attempt to fix common JSON errors from LLMs
    fixCommonJSONErrors(text) {
        let fixed = text;

        // Remove trailing commas before } or ]
        fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

        // Fix unquoted property names (simple cases)
        fixed = fixed.replace(/(\{|\,)\s*(\w+)\s*:/g, '$1"$2":');

        // Fix single quotes to double quotes (careful with apostrophes)
        // Only replace single quotes that look like string delimiters
        fixed = fixed.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');

        // Remove comments
        fixed = fixed.replace(/\/\/[^\n]*/g, '');
        fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

        return fixed;
    }

    // Validate parsed JSON against a schema
    validate(data, schema, path = '') {
        if (!schema) return;

        // Check required fields
        if (schema.required) {
            for (const field of schema.required) {
                if (!(field in data)) {
                    throw new Error(`Missing required field: ${path}${field}`);
                }
            }
        }

        // Check nested schemas
        if (schema.nested) {
            for (const [field, nestedSchema] of Object.entries(schema.nested)) {
                if (field in data && data[field]) {
                    this.validate(data[field], nestedSchema, `${path}${field}.`);
                }
            }
        }
    }

    // Parse scenario skeleton response
    parseScenario(responseText) {
        const data = this.parse(responseText, 'scenario');
        return this.normalizeScenario(data.scenario);
    }

    // Normalize scenario data (fill in defaults, etc.)
    normalizeScenario(scenario) {
        return {
            id: scenario.id || `scenario_${Date.now()}`,
            title: scenario.title || 'Untitled Scenario',
            setting: scenario.setting || '',
            playerStart: {
                x: scenario.playerStart?.x || 128,
                y: scenario.playerStart?.y || 128,
                locationId: scenario.playerStart?.locationId || null,
                description: scenario.playerStart?.description || ''
            },
            mainGoal: {
                id: scenario.mainGoal?.id || 'main_goal',
                title: scenario.mainGoal?.title || scenario.mainGoal?.description?.substring(0, 50) || 'Complete the mission',
                description: scenario.mainGoal?.description || '',
                historicalOutcome: scenario.mainGoal?.historicalOutcome || '',
                completed: false
            },
            optionalGoals: (scenario.optionalGoals || []).map(g => ({
                id: g.id || `goal_${Math.random().toString(36).substr(2, 9)}`,
                title: g.title || g.description?.substring(0, 50) || 'Optional objective',
                description: g.description || '',
                completed: false
            })),
            goalPath: (scenario.goalPath || []).map((step, i) => ({
                step: step.step || i + 1,
                objective: step.objective || '',
                hints: step.hints || [],
                detailLevel: step.detailLevel || 'medium',
                completed: false
            })),
            keyLocations: (scenario.keyLocations || []).map(loc => ({
                id: loc.id || `loc_${Math.random().toString(36).substr(2, 9)}`,
                name: loc.name || 'Unknown Location',
                type: loc.type || 'building',
                x: loc.x || 128,
                y: loc.y || 128,
                description: loc.description || '',
                importance: loc.importance || 'medium',
                generated: false
            })),
            keyNPCs: (scenario.keyNPCs || []).map(npc => ({
                id: npc.id || `npc_${Math.random().toString(36).substr(2, 9)}`,
                name: npc.name || 'Unknown',
                role: npc.role || 'civilian',
                faction: npc.faction || 'civilian',
                locationId: npc.locationId || null,
                personality: npc.personality || 'neutral',
                knowledge: npc.knowledge || [],
                disposition: npc.disposition ?? 50,
                met: false
            })),
            historicalEvents: (scenario.historicalEvents || []).map(evt => ({
                id: evt.id || `evt_${Math.random().toString(36).substr(2, 9)}`,
                name: evt.name || 'Event',
                date: evt.date || null,
                description: evt.description || '',
                effects: evt.effects || [],
                canPrevent: evt.canPrevent ?? false,
                triggered: false,
                prevented: false
            })),
            items: (scenario.items || []).map(item => ({
                id: item.id || `item_${Math.random().toString(36).substr(2, 9)}`,
                name: item.name || 'Item',
                description: item.description || '',
                locationId: item.locationId || null,
                hidden: item.hidden ?? false,
                collected: false
            }))
        };
    }

    // Parse dialogue response
    parseDialogue(responseText) {
        const data = this.parse(responseText, 'dialogue');
        return this.normalizeDialogue(data);
    }

    // Normalize dialogue data
    normalizeDialogue(dialogue) {
        return {
            speech: dialogue.speech || "...",
            emotion: dialogue.emotion || 'neutral',
            internalThought: dialogue.internalThought || null,
            dispositionChange: dialogue.dispositionChange || 0,
            informationRevealed: dialogue.informationRevealed || [],
            itemsOffered: dialogue.itemsOffered || [],
            itemsRequested: dialogue.itemsRequested || [],
            suggestedChoices: (dialogue.suggestedChoices || []).map(choice => ({
                text: choice.text || 'Continue',
                type: choice.type || 'neutral',
                consequence: choice.consequence || null
            })),
            questUpdate: dialogue.questUpdate || null
        };
    }

    // Parse location detail response
    parseLocation(responseText) {
        const data = this.parse(responseText, 'location');
        return this.normalizeLocation(data);
    }

    // Normalize location data
    normalizeLocation(location) {
        const desc = location.description || {};
        return {
            description: {
                short: desc.short || desc || 'A location',
                long: desc.long || '',
                atmosphere: desc.atmosphere || ''
            },
            features: (location.features || []).map(f => ({
                id: f.id || `feat_${Math.random().toString(36).substr(2, 9)}`,
                name: f.name || 'Feature',
                description: f.description || '',
                position: f.position || { dx: 0, dy: 0 },
                interactable: f.interactable ?? true,
                action: f.action || 'examine',
                hiddenItem: f.hiddenItem || null
            })),
            exits: (location.exits || []).map(e => ({
                direction: e.direction || 'north',
                destination: e.destination || 'unknown',
                description: e.description || '',
                blocked: e.blocked ?? false,
                blockedReason: e.blockedReason || null
            })),
            npcsPresent: location.npcsPresent || [],
            items: (location.items || []).map(item => ({
                id: item.id || `item_${Math.random().toString(36).substr(2, 9)}`,
                name: item.name || 'Item',
                position: item.position || { dx: 0, dy: 0 },
                hidden: item.hidden ?? false,
                description: item.description || ''
            })),
            ambientSounds: location.ambientSounds || [],
            dangers: location.dangers || []
        };
    }

    // Parse terrain chunk response
    parseTerrain(responseText) {
        const data = this.parse(responseText, 'terrain');
        return this.normalizeTerrain(data);
    }

    // Normalize terrain data
    normalizeTerrain(terrain) {
        const tileTypeMap = {
            'ground': 1,
            'rubble': 2,
            'wall': 3,
            'floor': 4,
            'snow': 5,
            'water': 6,
            'road': 7,
            'building': 8
        };

        return {
            tiles: (terrain.tiles || []).map(t => ({
                dx: t.dx || 0,
                dy: t.dy || 0,
                type: tileTypeMap[t.type] || tileTypeMap['ground'],
                height: t.height || 0
            })),
            structures: (terrain.structures || []).map(s => ({
                type: s.type || 'building',
                x: s.x || 0,
                y: s.y || 0,
                width: s.width || 1,
                height: s.height || 1,
                description: s.description || ''
            }))
        };
    }

    // Parse event outcome response
    parseEvent(responseText) {
        const data = this.parse(responseText, 'event');
        return this.normalizeEvent(data);
    }

    // Normalize event data
    normalizeEvent(event) {
        return {
            success: event.success ?? true,
            outcome: event.outcome || 'The action has an effect.',
            historicalDeviation: event.historicalDeviation || 'low',
            consequences: (event.consequences || []).map(c => ({
                type: c.type || 'immediate',
                description: c.description || ''
            })),
            newGoal: event.newGoal || null,
            reputationChanges: event.reputationChanges || {}
        };
    }
}
