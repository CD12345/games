import { GameRegistry } from '../GameRegistry.js';
import { HexTowerGame } from './HexTowerGame.js';
import { getInitialState } from './config.js';

GameRegistry.register('hextower', {
    name: 'Hex Tower Defense',
    description: 'Wave-based hex tower defense with terrain height and resource control.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🛡️',
    gameClass: HexTowerGame,
    getInitialState
});
