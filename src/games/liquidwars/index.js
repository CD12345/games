// Liquid Wars game registration

import { GameRegistry } from '../GameRegistry.js';
import { LiquidWarsGame, getInitialState } from './LiquidWarsGame.js';
import { DEFAULT_LIQUIDWARS_MAP_ID, LIQUIDWARS_MAPS } from './maps.js';

const MAP_OPTIONS = Object.keys(LIQUIDWARS_MAPS);
const GRID_WIDTH_OPTIONS = ['36', '42', '48'];
const GRID_HEIGHT_OPTIONS = ['24', '28', '32'];
const SPAWN_RATE_OPTIONS = ['3', '6', '9'];

GameRegistry.register('liquidwars', {
    name: 'Liquid Wars',
    description: 'Flow-field strategy tug of war. Swarm your opponent by guiding the tide.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '💧',
    gameClass: LiquidWarsGame,
    getInitialState,
    settings: [
        {
            id: 'mapId',
            label: 'Map',
            type: 'enum',
            options: MAP_OPTIONS,
            default: DEFAULT_LIQUIDWARS_MAP_ID
        },
        {
            id: 'gridWidth',
            label: 'Grid Width',
            type: 'enum',
            options: GRID_WIDTH_OPTIONS,
            default: GRID_WIDTH_OPTIONS[1]
        },
        {
            id: 'gridHeight',
            label: 'Grid Height',
            type: 'enum',
            options: GRID_HEIGHT_OPTIONS,
            default: GRID_HEIGHT_OPTIONS[1]
        },
        {
            id: 'spawnRate',
            label: 'Spawn Rate',
            type: 'enum',
            options: SPAWN_RATE_OPTIONS,
            default: SPAWN_RATE_OPTIONS[1]
        }
    ]
});
