/**
 * Claim Territory - Game Registration
 */

import { GameRegistry } from '../GameRegistry.js';
import { ClaimTerritoryGame } from './ClaimTerritoryGame.js';
import { getInitialState } from './config.js';

GameRegistry.register('claimterritory', {
    name: 'Claim Territory',
    description: 'Strategic territory control. Claim adjacent cells and expand your domain. Most cells wins!',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🗺️',
    gameClass: ClaimTerritoryGame,
    getInitialState,
    settings: []
});
