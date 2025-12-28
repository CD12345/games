// Hex Tower Defense - Game Registration

import { GameRegistry } from '../GameRegistry.js';
import { HexTDGame } from './HexTDGame.js';
import { getInitialState } from './config.js';

GameRegistry.register('hextd', {
    name: 'Hex TD',
    description: '1v1 tower defense on a hex grid. Build towers, spawn units, destroy the enemy base!',
    minPlayers: 1,
    maxPlayers: 2,
    icon: '🏰',
    gameClass: HexTDGame,
    getInitialState,
    supportsAI: true,
    settings: [
        {
            id: 'aiDifficulty',
            label: 'AI Difficulty',
            type: 'enum',
            options: ['Easy', 'Medium', 'Hard'],
            default: 'Medium'
        },
        {
            id: 'mapSeed',
            label: 'Map Seed (optional)',
            type: 'string',
            default: ''
        }
    ]
});
