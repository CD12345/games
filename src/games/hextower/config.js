export const HEX_TOWER_CONFIG = {
    id: 'hextower',
    name: 'Hex Tower Defense',
    map: {
        width: 100,
        height: 400,
        tileTypes: {
            EMPTY: 'EMPTY',
            BLOCKED: 'BLOCKED',
            RAMP: 'RAMP',
            RESOURCE_NODE: 'RESOURCE_NODE',
            TOWER_SLOT: 'TOWER_SLOT',
            MAIN_TOWER_SLOT: 'MAIN_TOWER_SLOT'
        }
    },
    timing: {
        tickSeconds: 0.1,
        preWavePhaseDuration: 20,
        wavePhaseDuration: 40,
        interWaveCleanupDuration: 5
    },
    economy: {
        baseOreIncomePerSecond: 2,
        startingOre: 200,
        recycleRefundRatio: 0.75,
        mine: {
            cost: 80,
            maxHP: 200,
            oreIncomePerSecond: 3
        }
    },
    combatModifiers: {
        highGroundRangeBonusPercent: 20
    },
    towers: {
        main: {
            id: 'TOWER_MAIN',
            maxHP: 1000,
            attackDamage: 40,
            attackCooldown: 1.2,
            attackRangeHexes: 6
        },
        light: {
            id: 'TOWER_LIGHT',
            cost: 60,
            maxHP: 200,
            attackDamage: 15,
            attackCooldown: 0.7,
            attackRangeHexes: 4
        },
        medium: {
            id: 'TOWER_MEDIUM',
            cost: 100,
            maxHP: 280,
            attackDamage: 28,
            attackCooldown: 1.0,
            attackRangeHexes: 4
        },
        heavy: {
            id: 'TOWER_HEAVY',
            cost: 160,
            maxHP: 360,
            attackDamage: 60,
            attackCooldown: 1.6,
            attackRangeHexes: 5
        }
    },
    units: {
        light: {
            id: 'UNIT_LIGHT',
            cost: 30,
            maxHP: 80,
            moveSpeed: 3.0,
            attackDamage: 8,
            attackCooldown: 0.7,
            attackRange: 0.6,
            radius: 0.3
        },
        medium: {
            id: 'UNIT_MEDIUM',
            cost: 70,
            maxHP: 180,
            moveSpeed: 2.2,
            attackDamage: 16,
            attackCooldown: 0.9,
            attackRange: 0.6,
            radius: 0.4
        },
        heavy: {
            id: 'UNIT_HEAVY',
            cost: 140,
            maxHP: 380,
            moveSpeed: 1.6,
            attackDamage: 34,
            attackCooldown: 1.2,
            attackRange: 0.6,
            radius: 0.5
        }
    }
};

export function getInitialState() {
    return {
        seed: null,
        phase: {
            name: 'pre',
            remaining: HEX_TOWER_CONFIG.timing.preWavePhaseDuration,
            wave: 1
        },
        players: {
            p1: {
                ore: HEX_TOWER_CONFIG.economy.startingOre,
                mainTowerHP: HEX_TOWER_CONFIG.towers.main.maxHP,
                towers: [],
                mines: []
            },
            p2: {
                ore: HEX_TOWER_CONFIG.economy.startingOre,
                mainTowerHP: HEX_TOWER_CONFIG.towers.main.maxHP,
                towers: [],
                mines: []
            }
        },
        units: {
            p1: [],
            p2: []
        },
        waveCompositions: {
            p1: { light: 0, medium: 0, heavy: 0 },
            p2: { light: 0, medium: 0, heavy: 0 }
        },
        towerSnapshots: {
            p1: {},
            p2: {}
        },
        gameOver: null
    };
}
