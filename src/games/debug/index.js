// Debug game registration

import { GameRegistry } from '../GameRegistry.js';
import { DebugGame } from './DebugGame.js';
import { getInitialState } from './config.js';

GameRegistry.register('debug', {
    name: 'Debug',
    description: 'Network stats, latency, device sensors, and system info',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🔧',
    gameClass: DebugGame,
    getInitialState,
    debugOnly: true
});
