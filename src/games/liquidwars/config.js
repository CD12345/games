// Liquid Wars game configuration and constants

export const LIQUIDWARS_CONFIG = {
    grid: {
        width: 64,
        height: 64
    },
    cell: {
        maxDensity: 8
    },
    spawnRate: 1,
    flowUpdateRate: 30,
    maps: {
        default: {
            walls: [
                { x: 0.0, y: 0.0, width: 1.0, height: 0.05 },
                { x: 0.0, y: 0.95, width: 1.0, height: 0.05 },
                { x: 0.0, y: 0.0, width: 0.05, height: 1.0 },
                { x: 0.95, y: 0.0, width: 0.05, height: 1.0 }
            ],
            bases: [
                { id: 'p1', x: 0.2, y: 0.5, radius: 0.08 },
                { id: 'p2', x: 0.8, y: 0.5, radius: 0.08 }
            ]
        }
    }
};

export function getInitialState(mapId = 'default') {
    const { width, height } = LIQUIDWARS_CONFIG.grid;
    const map = LIQUIDWARS_CONFIG.maps[mapId] ?? LIQUIDWARS_CONFIG.maps.default;
    const ownerGrid = Array.from({ length: height }, () => Array(width).fill(null));
    const densityGrid = Array.from({ length: height }, () => Array(width).fill(0));

    const baseLocations = map.bases.map((base) => ({
        id: base.id,
        x: base.x,
        y: base.y,
        radius: base.radius
    }));

    const playerCursors = baseLocations.reduce((acc, base) => {
        acc[base.id] = { x: base.x, y: base.y };
        return acc;
    }, {});

    return {
        mapId,
        grid: {
            owner: ownerGrid,
            density: densityGrid
        },
        playerCursors,
        baseLocations,
        match: {
            phase: 'playing',
            winner: null
        }
    };
}
