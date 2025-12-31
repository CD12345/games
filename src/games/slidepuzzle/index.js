/**
 * Slide Puzzle Battle - Game Registration
 */

import { GameRegistry } from '../GameRegistry.js';
import { SlidePuzzleGame } from './SlidePuzzleGame.js';
import { getInitialState } from './config.js';

GameRegistry.register('slidepuzzle', {
    name: 'Slide Puzzle Battle',
    description: 'Push cells from the outer ring to create 5 in a row! First to get 5 in a row (horizontal, vertical, or diagonal) wins.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🔀',
    gameClass: SlidePuzzleGame,
    getInitialState,
    settings: []
});
