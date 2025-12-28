// Corridor Chase - Game registration

import { GameRegistry } from '../GameRegistry.js';
import { CorridorChaseGame } from './CorridorChaseGame.js';
import { getInitialState } from './config.js';

GameRegistry.register('corridorchase', {
    name: 'Corridor Chase',
    description: 'Strategic board game. Move your pawn to the opposite side while blocking your opponent with walls!',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🏁',
    gameClass: CorridorChaseGame,
    getInitialState,
    settings: []
});
