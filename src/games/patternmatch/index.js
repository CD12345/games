/**
 * Pattern Match - Game Registration
 */

import { GameRegistry } from '../GameRegistry.js';
import { PatternMatchGame } from './PatternMatchGame.js';
import { getInitialState } from './config.js';

GameRegistry.register('patternmatch', {
    name: 'Pattern Match',
    description: 'Strategic board game. Place pieces your opponent selects, trying to create a row of 4 sharing any attribute!',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🎨',
    gameClass: PatternMatchGame,
    getInitialState,
    settings: []
});
