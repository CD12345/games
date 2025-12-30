/**
 * Stack Race - Game Registration
 */

import { GameRegistry } from '../GameRegistry.js';
import { StackRaceGame } from './StackRaceGame.js';
import { getInitialState } from './config.js';

GameRegistry.register('stackrace', {
    name: 'Stack Race',
    description: '3D pyramid building game. Stack pieces, create 2x2 patterns to retrieve them, and race to reach the top!',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🔺',
    gameClass: StackRaceGame,
    getInitialState,
    settings: []
});
