// History RPG - Scenario Generator
// Generates complete game scripts with conversation trees, items, and objectives

import { debugLog } from '../../../ui/DebugOverlay.js';

// Prompt for generating the complete game scenario
const SCENARIO_PROMPT = `You are a historical game designer creating a complete text-adventure-style RPG scenario.

SETTING:
- Location: {{location}}
- Date: {{date}}
- Player Role: {{characterType}}

Create a historically accurate, immersive scenario with a clear main goal that requires the player to:
1. Talk to specific characters in sequence
2. Collect and use items
3. Trade with NPCs
4. Make meaningful choices

GEOGRAPHY REQUIREMENTS (CRITICAL):
- Use REAL street names that existed in {{location}} during {{date}}
- If exact historical street names are unknown, use current real street names from {{location}}
- Create a realistic city layout with main roads, side streets, and landmarks
- Streets should form a navigable grid/network connecting all locations
- Include real landmarks, districts, and geographic features (rivers, squares, etc.)
- The map area is 256x256 tiles, centered at (128,128)

SCENARIO REQUIREMENTS:
- The goal must be historically plausible for this time and place
- Main NPCs should be placed at specific locations the player must visit
- Each main NPC has a complete conversation tree (intro to conclusion)
- Items are needed to progress (keys, documents, bribes, etc.)
- The story should take 30-60 minutes to complete

Return ONLY valid JSON with this exact structure:
{
    "scenario": {
        "id": "unique_scenario_id",
        "title": "Scenario Title",
        "setting": "2-3 sentence atmospheric description",
        "historicalContext": "Brief real history context for this date/place",
        "mainGoal": {
            "id": "goal_id",
            "title": "Goal title (e.g., 'Escape the City')",
            "description": "What the player must accomplish",
            "successEnding": "Text shown when player succeeds",
            "failureEnding": "Text shown if player fails"
        },
        "geography": {
            "districts": [
                {
                    "id": "district_1",
                    "name": "Real district/neighborhood name",
                    "description": "What this area is like",
                    "centerX": 100,
                    "centerY": 100,
                    "radius": 40,
                    "type": "residential|industrial|commercial|military|ruins"
                }
            ],
            "streets": [
                {
                    "id": "street_1",
                    "name": "Real Street Name (e.g., Prospekt Lenina)",
                    "type": "main|secondary|alley",
                    "path": [
                        {"x": 50, "y": 128},
                        {"x": 200, "y": 128}
                    ],
                    "width": 3
                }
            ],
            "landmarks": [
                {
                    "id": "landmark_1",
                    "name": "Real landmark name",
                    "type": "building|monument|square|bridge|factory|church",
                    "x": 128,
                    "y": 100,
                    "radius": 5
                }
            ],
            "water": [
                {
                    "id": "river_1",
                    "name": "River/water body name",
                    "path": [
                        {"x": 220, "y": 0},
                        {"x": 230, "y": 256}
                    ],
                    "width": 15
                }
            ]
        },
        "objectives": [
            {
                "id": "obj_1",
                "order": 1,
                "title": "First objective",
                "description": "What to do",
                "type": "talk|item|trade|location",
                "target": "npc_id or item_id or location_id",
                "hint": "Subtle hint for player"
            }
        ],
        "locations": [
            {
                "id": "loc_start",
                "name": "Location Name",
                "description": "What the player sees here",
                "gridX": 128,
                "gridY": 128,
                "streetId": "street_1 (which street this is on)",
                "type": "building|street|square|underground|etc",
                "isStartLocation": true
            }
        ],
        "mainNPCs": [
            {
                "id": "npc_1",
                "name": "Character Name",
                "role": "Their role (merchant, soldier, etc)",
                "description": "Physical appearance and demeanor",
                "locationId": "loc_id where they are",
                "faction": "soviet|german|civilian|resistance",
                "hasItem": "item_id or null",
                "wantsItem": "item_id or null (for trading)",
                "isEssential": true,
                "objectiveId": "obj_id they relate to"
            }
        ],
        "items": [
            {
                "id": "item_1",
                "name": "Item Name",
                "description": "What it looks like",
                "useDescription": "What happens when used",
                "locationId": "loc_id or null if NPC has it",
                "heldByNPC": "npc_id or null",
                "usedAt": "loc_id or npc_id where this is used",
                "isKey": false
            }
        ],
        "ambientNPCs": [
            {
                "id": "ambient_1",
                "name": "Generic Name",
                "role": "civilian|soldier|etc",
                "dialogue": "Single line of atmospheric dialogue",
                "hint": "Optional hint about main quest"
            }
        ]
    },
    "conversationTrees": {
        "npc_1": {
            "intro": {
                "id": "intro",
                "npcSpeech": "What NPC says when first meeting",
                "choices": [
                    {
                        "text": "Player response option",
                        "nextNode": "node_id",
                        "type": "friendly|neutral|aggressive"
                    }
                ]
            },
            "nodes": {
                "node_id": {
                    "id": "node_id",
                    "npcSpeech": "NPC's response",
                    "choices": [
                        {
                            "text": "Player option",
                            "nextNode": "another_node_id or END",
                            "type": "friendly|neutral|aggressive",
                            "requiresItem": "item_id or null",
                            "givesItem": "item_id or null",
                            "completesObjective": "obj_id or null"
                        }
                    ]
                }
            },
            "conclusion": {
                "id": "conclusion",
                "npcSpeech": "Final thing NPC says after quest interaction",
                "afterComplete": "What NPC says if talked to again after their part is done"
            }
        }
    }
}

CONVERSATION TREE RULES:
1. Each main NPC has: intro -> nodes -> conclusion
2. Choices lead to other nodes or "END" to conclude
3. Some choices require items (requiresItem)
4. Some choices give items (givesItem)
5. Key choices complete objectives (completesObjective)
6. Include 2-4 choices per node for variety
7. Make conversations feel natural, not robotic
8. Include historical details and atmosphere in dialogue`;

// Prompt for generating ambient NPC details
const AMBIENT_NPC_PROMPT = `Generate a brief ambient NPC for {{location}} during {{date}}.

This NPC is a background character who adds atmosphere. They might give a subtle hint about {{hint}}.

Return ONLY valid JSON:
{
    "id": "ambient_{{index}}",
    "name": "Appropriate name for the setting",
    "role": "civilian|soldier|merchant|refugee|etc",
    "appearance": "Brief physical description",
    "dialogue": [
        "First thing they might say",
        "Alternative line",
        "Another possible line"
    ],
    "hint": "Optional subtle hint about the main quest or null"
}`;

export class ScenarioGenerator {
    constructor(aiGateway) {
        this.aiGateway = aiGateway;
        this.generationProgress = 0;
        this.generationStatus = '';
        this.onProgressUpdate = null;
    }

    // Update progress and notify listeners
    updateProgress(progress, status) {
        this.generationProgress = progress;
        this.generationStatus = status;
        debugLog(`[ScenarioGen] ${progress}% - ${status}`);
        if (this.onProgressUpdate) {
            this.onProgressUpdate(progress, status);
        }
    }

    // Generate complete scenario from location and date
    async generateScenario(settings) {
        const { location, date, characterType } = settings;

        debugLog(`[ScenarioGen] Starting generation for ${location} on ${date}`);
        this.updateProgress(0, 'Initializing scenario generation...');

        if (!this.aiGateway.isAvailable()) {
            throw new Error('AI is not available. Please configure an API key.');
        }

        try {
            // Step 1: Generate main scenario structure
            this.updateProgress(10, 'Generating historical scenario...');
            const prompt = this.buildScenarioPrompt(location, date, characterType);

            debugLog(`[ScenarioGen] Sending prompt (${prompt.length} chars)`);
            const response = await this.aiGateway.generate(prompt, {
                maxTokens: 8000 // Need more tokens for complete scenario
            });

            this.updateProgress(60, 'Parsing scenario data...');
            const scenarioData = this.parseScenarioResponse(response);

            if (!scenarioData || !scenarioData.scenario) {
                throw new Error('Failed to parse scenario response');
            }

            // Step 2: Validate and enhance the scenario
            this.updateProgress(70, 'Validating scenario structure...');
            this.validateScenario(scenarioData);

            // Step 3: Build the final scenario object
            this.updateProgress(80, 'Building game world...');
            const finalScenario = this.buildFinalScenario(scenarioData, settings);

            this.updateProgress(100, 'Scenario ready!');
            debugLog(`[ScenarioGen] Generation complete!`);

            return finalScenario;

        } catch (error) {
            debugLog(`[ScenarioGen] ERROR: ${error.message}`);
            this.updateProgress(0, `Error: ${error.message}`);
            throw error;
        }
    }

    // Build the scenario generation prompt
    buildScenarioPrompt(location, date, characterType) {
        return SCENARIO_PROMPT
            .replace(/\{\{location\}\}/g, location)
            .replace(/\{\{date\}\}/g, date)
            .replace(/\{\{characterType\}\}/g, characterType);
    }

    // Parse the AI response into structured data
    parseScenarioResponse(response) {
        try {
            // Try to extract JSON from the response
            let jsonStr = response;

            // Remove markdown code blocks if present
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            // Try to find JSON object boundaries
            const startIdx = jsonStr.indexOf('{');
            const endIdx = jsonStr.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
                jsonStr = jsonStr.substring(startIdx, endIdx + 1);
            }

            return JSON.parse(jsonStr);
        } catch (error) {
            debugLog(`[ScenarioGen] JSON parse error: ${error.message}`);
            debugLog(`[ScenarioGen] Response preview: ${response.substring(0, 500)}`);
            throw new Error(`Failed to parse scenario: ${error.message}`);
        }
    }

    // Validate the scenario structure
    validateScenario(data) {
        const { scenario, conversationTrees } = data;

        if (!scenario) {
            throw new Error('Missing scenario object');
        }

        if (!scenario.mainGoal) {
            throw new Error('Missing main goal');
        }

        if (!scenario.objectives || scenario.objectives.length === 0) {
            throw new Error('Missing objectives');
        }

        if (!scenario.locations || scenario.locations.length === 0) {
            throw new Error('Missing locations');
        }

        if (!scenario.mainNPCs || scenario.mainNPCs.length === 0) {
            throw new Error('Missing main NPCs');
        }

        // Validate conversation trees exist for main NPCs
        for (const npc of scenario.mainNPCs) {
            if (!conversationTrees[npc.id]) {
                debugLog(`[ScenarioGen] Warning: Missing conversation tree for ${npc.id}`);
            }
        }

        debugLog(`[ScenarioGen] Validation passed - ${scenario.mainNPCs.length} NPCs, ${scenario.objectives.length} objectives`);
    }

    // Build the final scenario with all game data
    buildFinalScenario(data, settings) {
        const { scenario, conversationTrees } = data;

        // Find start location
        const startLocation = scenario.locations.find(l => l.isStartLocation) || scenario.locations[0];

        // Process geography data
        const geography = scenario.geography || this.generateFallbackGeography();

        return {
            // Core scenario info
            id: scenario.id || `scenario_${Date.now()}`,
            title: scenario.title,
            setting: scenario.setting,
            historicalContext: scenario.historicalContext,

            // Player settings
            playerStart: {
                x: startLocation.gridX || 128,
                y: startLocation.gridY || 128,
                locationId: startLocation.id
            },
            characterType: settings.characterType,

            // Goal and objectives
            mainGoal: scenario.mainGoal,
            objectives: scenario.objectives.sort((a, b) => a.order - b.order),
            currentObjectiveIndex: 0,
            completedObjectives: [],

            // Geography data (streets, districts, landmarks)
            geography: {
                districts: geography.districts || [],
                streets: geography.streets || [],
                landmarks: geography.landmarks || [],
                water: geography.water || []
            },

            // World data
            locations: this.indexById(scenario.locations),
            mainNPCs: this.indexById(scenario.mainNPCs),
            items: this.indexById(scenario.items || []),
            ambientNPCs: scenario.ambientNPCs || [],

            // Conversation trees
            conversationTrees: conversationTrees,

            // Runtime state
            discoveredLocations: [startLocation.id],
            metNPCs: [],
            collectedItems: [],
            usedItems: [],

            // Settings used
            inputSettings: {
                location: settings.location,
                date: settings.date
            }
        };
    }

    // Generate fallback geography if AI doesn't provide it
    generateFallbackGeography() {
        return {
            districts: [
                { id: 'district_center', name: 'City Center', centerX: 128, centerY: 128, radius: 50, type: 'commercial' }
            ],
            streets: [
                { id: 'main_ns', name: 'Main Street', type: 'main', path: [{x: 128, y: 50}, {x: 128, y: 200}], width: 3 },
                { id: 'main_ew', name: 'Cross Street', type: 'main', path: [{x: 50, y: 128}, {x: 200, y: 128}], width: 3 }
            ],
            landmarks: [],
            water: []
        };
    }

    // Helper to index array by id
    indexById(array) {
        const index = {};
        for (const item of array) {
            if (item.id) {
                index[item.id] = item;
            }
        }
        return index;
    }

    // Generate additional ambient NPCs for a location
    async generateAmbientNPC(location, date, hint, index) {
        const prompt = AMBIENT_NPC_PROMPT
            .replace(/\{\{location\}\}/g, location)
            .replace(/\{\{date\}\}/g, date)
            .replace(/\{\{hint\}\}/g, hint || 'the atmosphere of the city')
            .replace(/\{\{index\}\}/g, index);

        try {
            const response = await this.aiGateway.generate(prompt, { maxTokens: 500 });
            return this.parseScenarioResponse(response);
        } catch (error) {
            debugLog(`[ScenarioGen] Failed to generate ambient NPC: ${error.message}`);
            return null;
        }
    }
}
