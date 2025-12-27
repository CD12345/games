// Liquid War game registration

import { GameRegistry } from '../GameRegistry.js';
import { LiquidWarGame } from './LiquidWarGame.js';
import { MAPS, getInitialState, parseMap, scaleMap, getMapIdFromSetting, LIQUID_WAR_CONFIG } from './config.js';

// Build map options for settings (use map names)
const mapOptions = Object.values(MAPS).map(map => map.name);

// Generate a preview canvas for a map
function generateMapPreview(mapName, size = 128) {
    const mapId = getMapIdFromSetting(mapName);
    const mapDef = MAPS[mapId];
    if (!mapDef) return null;

    const parsed = parseMap(mapDef.data);
    const walls = scaleMap(parsed.grid, size, size);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.className = 'map-preview-canvas';
    const ctx = canvas.getContext('2d');

    // Draw walls and floor
    const wallColor = LIQUID_WAR_CONFIG.colors.wall;
    const floorColor = LIQUID_WAR_CONFIG.colors.floor;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            ctx.fillStyle = walls[y][x] === 1 ? wallColor : floorColor;
            ctx.fillRect(x, y, 1, 1);
        }
    }

    return canvas;
}

GameRegistry.register('liquidwar', {
    name: 'Liquid War',
    description: 'Control your cursor to lead your army! Particles follow the shortest path to your cursor.',
    minPlayers: 1,  // Can start with just host, AI fills remaining slots
    maxPlayers: 6,
    icon: '💧',
    gameClass: LiquidWarGame,
    getInitialState: (settings) => {
        const playerCount = parseInt(settings?.playerCount) || 2;
        return getInitialState(playerCount);
    },
    supportsAI: true,  // Flag indicating this game can fill empty slots with AI
    getPreview: (settingId, currentSettings) => {
        if (settingId === 'mapPreview') {
            const mapName = currentSettings.mapId || 'Arena';
            return generateMapPreview(mapName);
        }
        return null;
    },
    settings: [
        {
            id: 'playerCount',
            label: 'Players',
            type: 'enum',
            options: ['2', '3', '4', '5', '6'],
            default: '2',
        },
        {
            id: 'aiDifficulty',
            label: 'AI Difficulty',
            type: 'enum',
            options: ['Easy', 'Medium', 'Hard'],
            default: 'Medium',
        },
        {
            id: 'mapId',
            label: 'Map',
            type: 'enum',
            options: mapOptions,
            default: 'Arena',
        },
        {
            id: 'mapPreview',
            label: 'Preview',
            type: 'preview',
            dependsOn: 'mapId',
        },
    ],
});
