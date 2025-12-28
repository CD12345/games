// Hex Mesh Factory - Creates hex geometry and materials for Three.js

import { TILE_TYPES, RENDER } from '../config.js';

export class HexMeshFactory {
    constructor(THREE) {
        this.THREE = THREE;
        this.hexGeometry = null;
        this.materials = {};

        this.createGeometry();
        this.createMaterials();
    }

    createGeometry() {
        const THREE = this.THREE;
        const size = RENDER.HEX_SIZE;

        // Create hex shape for pointy-topped hex
        const hexShape = new THREE.Shape();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
            const x = size * Math.cos(angle);
            const y = size * Math.sin(angle);
            if (i === 0) {
                hexShape.moveTo(x, y);
            } else {
                hexShape.lineTo(x, y);
            }
        }
        hexShape.closePath();

        // Extrude to create 3D hex
        this.hexGeometry = new THREE.ExtrudeGeometry(hexShape, {
            depth: 0.15,
            bevelEnabled: false
        });

        // Rotate to lay flat (XZ plane)
        this.hexGeometry.rotateX(-Math.PI / 2);

        // Create edge geometry for outlines
        const edgesGeometry = new THREE.EdgesGeometry(this.hexGeometry);
        this.edgesGeometry = edgesGeometry;
    }

    createMaterials() {
        const THREE = this.THREE;

        // Tile materials by type
        this.materials = {
            // Low ground
            [TILE_TYPES.EMPTY]: {
                low: new THREE.MeshLambertMaterial({ color: 0x3a5a40 }),
                high: new THREE.MeshLambertMaterial({ color: 0x4a7a50 })
            },
            [TILE_TYPES.BLOCKED]: {
                low: new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
                high: new THREE.MeshLambertMaterial({ color: 0x3a3a3a })
            },
            [TILE_TYPES.RAMP]: {
                low: new THREE.MeshLambertMaterial({ color: 0x8b7355 }),
                high: new THREE.MeshLambertMaterial({ color: 0x9b8365 })
            },
            [TILE_TYPES.RESOURCE_NODE]: {
                low: new THREE.MeshLambertMaterial({ color: 0xffd700 }),
                high: new THREE.MeshLambertMaterial({ color: 0xffe740 })
            },
            [TILE_TYPES.TOWER_SLOT]: {
                low: new THREE.MeshLambertMaterial({ color: 0x555577 }),
                high: new THREE.MeshLambertMaterial({ color: 0x666688 })
            },
            [TILE_TYPES.MAIN_TOWER_SLOT]: {
                low: new THREE.MeshLambertMaterial({ color: 0x8844aa }),
                high: new THREE.MeshLambertMaterial({ color: 0x9955bb })
            }
        };

        // Player-colored tower slot materials
        this.playerMaterials = {
            p1: {
                towerSlot: new THREE.MeshLambertMaterial({ color: 0x4466cc }),
                mainTower: new THREE.MeshLambertMaterial({ color: 0x2244aa })
            },
            p2: {
                towerSlot: new THREE.MeshLambertMaterial({ color: 0xcc6644 }),
                mainTower: new THREE.MeshLambertMaterial({ color: 0xaa4422 })
            }
        };

        // Edge material
        this.edgeMaterial = new THREE.LineBasicMaterial({
            color: 0x000000,
            opacity: 0.3,
            transparent: true
        });

        // Hover highlight material
        this.hoverMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            opacity: 0.3,
            transparent: true
        });
    }

    getMaterial(tileType, height, owner = -1) {
        // Special handling for owned tower slots
        if (tileType === TILE_TYPES.TOWER_SLOT && owner >= 0) {
            const playerId = owner === 0 ? 'p1' : 'p2';
            return this.playerMaterials[playerId].towerSlot;
        }

        if (tileType === TILE_TYPES.MAIN_TOWER_SLOT && owner >= 0) {
            const playerId = owner === 0 ? 'p1' : 'p2';
            return this.playerMaterials[playerId].mainTower;
        }

        const typeMaterials = this.materials[tileType] || this.materials[TILE_TYPES.EMPTY];
        return height === 1 ? typeMaterials.high : typeMaterials.low;
    }

    getHexGeometry() {
        return this.hexGeometry;
    }

    getEdgesGeometry() {
        return this.edgesGeometry;
    }

    getEdgeMaterial() {
        return this.edgeMaterial;
    }

    getHoverMaterial() {
        return this.hoverMaterial;
    }

    dispose() {
        this.hexGeometry?.dispose();
        this.edgesGeometry?.dispose();

        for (const typeMats of Object.values(this.materials)) {
            typeMats.low?.dispose();
            typeMats.high?.dispose();
        }

        for (const playerMats of Object.values(this.playerMaterials)) {
            playerMats.towerSlot?.dispose();
            playerMats.mainTower?.dispose();
        }

        this.edgeMaterial?.dispose();
        this.hoverMaterial?.dispose();
    }
}
