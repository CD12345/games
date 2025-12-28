// History RPG - Game Registration

import { GameRegistry } from '../GameRegistry.js';
import { HistoryRPGGame } from './HistoryRPGGame.js';
import { getInitialState, SCENARIOS } from './config.js';

GameRegistry.register('historyrpg', {
    name: 'History RPG',
    description: 'AI-generated historical open-world RPG. Explore Stalingrad, make choices, and try to change history.',
    minPlayers: 1,
    maxPlayers: 4,
    icon: '📜',
    gameClass: HistoryRPGGame,
    getInitialState,
    supportsAI: false,  // AI-generated content, not AI players
    settings: [
        {
            id: 'scenarioId',
            label: 'Scenario',
            type: 'enum',
            options: Object.values(SCENARIOS).map(s => s.name),
            default: 'Battle of Stalingrad'
        },
        {
            id: 'characterType',
            label: 'Character Type',
            type: 'enum',
            options: ['Civilian', 'Soldier', 'Medic', 'Resistance'],
            default: 'Civilian'
        },
        {
            id: 'apiProvider',
            label: 'AI Provider',
            type: 'enum',
            options: ['Claude', 'OpenAI'],
            default: 'Claude'
        },
        {
            id: 'apiKey',
            label: 'API Key (optional)',
            type: 'string',
            default: ''
        }
    ]
});
