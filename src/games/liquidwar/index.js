// Liquid War game registration

import { GameRegistry } from '../GameRegistry.js';
import { LiquidWarGame } from './LiquidWarGame.js';
import { MAPS, getInitialState } from './config.js';

// Build map options for settings (use map names)
const mapOptions = Object.values(MAPS).map(map => map.name);

GameRegistry.register('liquidwar', {
    name: 'Liquid War',
    description: 'Control your cursor to lead your army! Particles follow the shortest path to your cursor.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '💧',
    gameClass: LiquidWarGame,
    getInitialState,
    settings: [
        {
            id: 'mapId',
            label: 'Map',
            type: 'enum',
            options: mapOptions,
            default: 'Arena',
        },
    ],
});
