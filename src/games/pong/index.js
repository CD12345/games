// Pong game registration

import { GameRegistry } from '../GameRegistry.js';
import { PongGame } from './PongGame.js';
import { PONG_CONFIG, getInitialState } from './config.js';

GameRegistry.register('pong', {
    name: 'Pong',
    description: 'Classic 2-player paddle game. Bounce the ball past your opponent!',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🏓',
    gameClass: PongGame,
    getInitialState,
    settings: [
        {
            id: 'proximityEnabled',
            label: 'Proximity Mode',
            type: 'checkbox',
            default: true
        }
    ]
});
