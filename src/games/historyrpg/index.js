// History RPG - Game Registration

import { GameRegistry } from '../GameRegistry.js';
import { HistoryRPGGame } from './HistoryRPGGame.js';
import { getInitialState } from './config.js';

GameRegistry.register('historyrpg', {
    name: 'History RPG',
    description: 'AI-generated historical open-world RPG. Pick a time and place, and the AI creates a complete adventure.',
    minPlayers: 1,
    maxPlayers: 4,
    icon: '📜',
    gameClass: HistoryRPGGame,
    getInitialState,
    supportsAI: false,  // AI-generated content, not AI players
    hasLoadingScreen: true,  // Game has its own loading screen for scenario generation
    settings: [
        {
            id: 'location',
            label: 'Historical Location',
            type: 'string',
            default: 'Stalingrad, Soviet Union',
            placeholder: 'e.g., Berlin, Rome, London'
        },
        {
            id: 'date',
            label: 'Date',
            type: 'string',
            default: 'January 1, 1943',
            placeholder: 'e.g., July 4, 1776'
        },
        {
            id: 'characterType',
            label: 'Character Type',
            type: 'enum',
            options: ['Civilian', 'Soldier', 'Medic', 'Resistance', 'Spy', 'Merchant'],
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
            label: 'API Key (required)',
            type: 'string',
            default: ''
        }
    ]
});
