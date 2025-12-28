// Hex TD Renderer - Main Three.js rendering coordinator

import { HexMeshFactory } from './HexMeshFactory.js';
import { ChunkManager } from './ChunkManager.js';
import { CameraController } from './CameraController.js';
import { UIOverlay } from './UIOverlay.js';
import { RadialMenu } from './RadialMenu.js';
import { RENDER, TOWER_STATS, UNIT_STATS, TILE_TYPES } from '../config.js';
import { hexToPixel, pixelToHex } from '../core/HexMath.js';

export class HexTDRenderer {
    constructor(THREE, canvas, grid) {
        this.THREE = THREE;
        this.canvas = canvas;
        this.grid = grid;

        // Three.js core
        this.renderer = null;
        this.scene = null;
        this.camera = null;

        // Sub-systems
        this.meshFactory = null;
        this.chunkManager = null;
        this.cameraController = null;
        this.uiOverlay = null;
        this.radialMenu = null;

        // Center tile tracking
        this.centerTile = null;
        this.centerTileInfo = null;

        // Callbacks
        this.onTileAction = null;
        this.onTileTap = null;

        // Entity meshes
        this.towerMeshes = new Map();  // towerId -> mesh
        this.unitMeshes = new Map();   // unitId -> mesh
        this.mineMeshes = new Map();   // mineId -> mesh

        // Object pools
        this.unitPool = [];
        this.towerPool = [];

        // Selection/hover
        this.hoverMesh = null;
        this.selectionMesh = null;
        this.centerSelectionMesh = null;

        this.initialize();
    }

    initialize() {
        const THREE = this.THREE;

        // Get actual display dimensions
        const rect = this.canvas.getBoundingClientRect();
        const displayWidth = rect.width || this.canvas.width;
        const displayHeight = rect.height || this.canvas.height;

        // Create WebGL renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(displayWidth, displayHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x1a1a2e);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x1a1a2e, 100, 300);

        // Create camera - use display dimensions for aspect ratio
        const aspect = displayWidth / displayHeight;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);

        // Create sub-systems
        this.meshFactory = new HexMeshFactory(THREE);
        this.chunkManager = new ChunkManager(THREE, this.scene, this.grid, this.meshFactory);
        this.cameraController = new CameraController(THREE, this.camera, this.canvas);
        this.uiOverlay = new UIOverlay(this.canvas.parentElement, displayWidth, displayHeight);
        this.radialMenu = new RadialMenu(this.canvas.parentElement, displayWidth, displayHeight);

        // Set up radial menu action callback
        this.radialMenu.onAction = (actionData) => {
            if (this.onTileAction) {
                this.onTileAction(actionData);
            }
        };

        // Setup lighting
        this.setupLighting();

        // Create hover/selection indicators
        this.createIndicators();
    }

    setupLighting() {
        const THREE = this.THREE;

        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404050, 0.5);
        this.scene.add(ambientLight);

        // Hemisphere light (sky/ground)
        const hemiLight = new THREE.HemisphereLight(0x8888aa, 0x444422, 0.4);
        this.scene.add(hemiLight);

        // Main directional light (sun)
        const sunLight = new THREE.DirectionalLight(0xffffee, 0.8);
        sunLight.position.set(100, 150, 100);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 10;
        sunLight.shadow.camera.far = 400;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        this.scene.add(sunLight);

        // Secondary fill light
        const fillLight = new THREE.DirectionalLight(0x4466aa, 0.3);
        fillLight.position.set(-50, 80, -50);
        this.scene.add(fillLight);
    }

    createIndicators() {
        const THREE = this.THREE;

        // Hover indicator
        const hoverGeom = this.meshFactory.getHexGeometry().clone();
        hoverGeom.scale(1.05, 1.1, 1.05);
        const hoverMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            opacity: 0.3,
            transparent: true,
            depthTest: false
        });
        this.hoverMesh = new THREE.Mesh(hoverGeom, hoverMat);
        this.hoverMesh.visible = false;
        this.scene.add(this.hoverMesh);

        // Selection indicator
        const selectGeom = this.meshFactory.getHexGeometry().clone();
        selectGeom.scale(1.1, 1.2, 1.1);
        const selectMat = new THREE.MeshBasicMaterial({
            color: 0x44ff44,
            opacity: 0.4,
            transparent: true,
            depthTest: false
        });
        this.selectionMesh = new THREE.Mesh(selectGeom, selectMat);
        this.selectionMesh.visible = false;
        this.scene.add(this.selectionMesh);

        // Center tile selection indicator (white outline hex)
        this.createCenterSelectionIndicator();
    }

    createCenterSelectionIndicator() {
        const THREE = this.THREE;
        const size = RENDER.HEX_SIZE;

        // Create hex outline using LineLoop
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
            points.push(new THREE.Vector3(
                size * 1.05 * Math.cos(angle),
                0.2,
                size * 1.05 * Math.sin(angle)
            ));
        }
        points.push(points[0].clone()); // Close the loop

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: 2,
            transparent: true,
            opacity: 0.9
        });

        this.centerSelectionMesh = new THREE.Line(geometry, material);
        this.centerSelectionMesh.visible = true;
        this.scene.add(this.centerSelectionMesh);
    }

    // Update entity meshes based on game state
    updateEntities(state) {
        this.updateTowers(state.towers);
        this.updateUnits(state.units);
        this.updateMines(state.mines);
    }

    updateTowers(towers) {
        const THREE = this.THREE;
        const activeTowerIds = new Set();

        for (const tower of towers) {
            activeTowerIds.add(tower.id);

            let mesh = this.towerMeshes.get(tower.id);
            if (!mesh) {
                mesh = this.createTowerMesh(tower);
                this.towerMeshes.set(tower.id, mesh);
                this.scene.add(mesh);
            }

            // Update position
            const pos = hexToPixel({ q: tower.q, r: tower.r });
            const height = this.grid.getHeight(tower.q, tower.r) * RENDER.HEIGHT_SCALE;
            mesh.position.set(pos.x, height + 0.3, pos.z);

            // Update health indicator (scale Y based on HP)
            const hpRatio = tower.hp / TOWER_STATS[tower.type].maxHP;
            mesh.children[0]?.scale.setY(hpRatio); // Health bar
        }

        // Remove destroyed towers
        for (const [id, mesh] of this.towerMeshes.entries()) {
            if (!activeTowerIds.has(id)) {
                this.scene.remove(mesh);
                this.towerMeshes.delete(id);
            }
        }
    }

    createTowerMesh(tower) {
        const THREE = this.THREE;
        const stats = TOWER_STATS[tower.type];

        const group = new THREE.Group();

        // Tower body (cylinder)
        const radius = tower.type === 'MAIN' ? 1.2 : tower.type === 'HEAVY' ? 0.8 : tower.type === 'MEDIUM' ? 0.6 : 0.4;
        const towerHeight = tower.type === 'MAIN' ? 2.5 : tower.type === 'HEAVY' ? 2.0 : tower.type === 'MEDIUM' ? 1.5 : 1.0;

        const bodyGeom = new THREE.CylinderGeometry(radius * 0.8, radius, towerHeight, 6);
        const bodyColor = tower.owner === 'p1' ? 0x4466cc : 0xcc6644;
        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = towerHeight / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Tower top (cone for weapon)
        const topGeom = new THREE.ConeGeometry(radius * 0.5, 0.5, 6);
        const topMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const top = new THREE.Mesh(topGeom, topMat);
        top.position.y = towerHeight + 0.25;
        group.add(top);

        // Health bar background
        const hbBgGeom = new THREE.PlaneGeometry(1.5, 0.15);
        const hbBgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
        const hbBg = new THREE.Mesh(hbBgGeom, hbBgMat);
        hbBg.position.set(0, towerHeight + 0.8, 0);
        hbBg.rotation.x = -Math.PI / 6;
        group.add(hbBg);

        // Health bar fill
        const hbFillGeom = new THREE.PlaneGeometry(1.4, 0.1);
        const hbFillMat = new THREE.MeshBasicMaterial({ color: 0x44ff44, side: THREE.DoubleSide });
        const hbFill = new THREE.Mesh(hbFillGeom, hbFillMat);
        hbFill.position.set(0, towerHeight + 0.8, 0.01);
        hbFill.rotation.x = -Math.PI / 6;
        group.add(hbFill);

        return group;
    }

    updateUnits(units) {
        const THREE = this.THREE;
        const activeUnitIds = new Set();

        for (const unit of units) {
            activeUnitIds.add(unit.id);

            let mesh = this.unitMeshes.get(unit.id);
            if (!mesh) {
                mesh = this.createUnitMesh(unit);
                this.unitMeshes.set(unit.id, mesh);
                this.scene.add(mesh);
            }

            // Update position (smooth interpolation)
            const pos = hexToPixel({ q: unit.q, r: unit.r });
            const height = 0.3; // Units on ground level
            mesh.position.lerp(new THREE.Vector3(pos.x, height, pos.z), 0.2);

            // Update rotation to face movement direction
            if (unit.vx !== undefined && unit.vz !== undefined) {
                const angle = Math.atan2(unit.vx, unit.vz);
                mesh.rotation.y = angle;
            }
        }

        // Remove dead units
        for (const [id, mesh] of this.unitMeshes.entries()) {
            if (!activeUnitIds.has(id)) {
                this.scene.remove(mesh);
                this.unitMeshes.delete(id);
            }
        }
    }

    createUnitMesh(unit) {
        const THREE = this.THREE;
        const stats = UNIT_STATS[unit.type];

        const group = new THREE.Group();

        // Unit body (sphere)
        const size = stats.radius;
        const bodyGeom = new THREE.SphereGeometry(size, 8, 6);
        const bodyColor = unit.owner === 'p1' ? 0x4488ff : 0xff4444;
        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = size;
        body.castShadow = true;
        group.add(body);

        // Weapon stick
        const stickGeom = new THREE.CylinderGeometry(0.05, 0.05, size * 2, 4);
        const stickMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
        const stick = new THREE.Mesh(stickGeom, stickMat);
        stick.rotation.z = Math.PI / 2;
        stick.position.set(size * 0.8, size, 0);
        group.add(stick);

        // Small legs for character feel
        const legGeom = new THREE.CylinderGeometry(0.03, 0.03, size * 0.6, 4);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });

        const leg1 = new THREE.Mesh(legGeom, legMat);
        leg1.position.set(size * 0.3, size * 0.3, 0);
        group.add(leg1);

        const leg2 = new THREE.Mesh(legGeom, legMat);
        leg2.position.set(-size * 0.3, size * 0.3, 0);
        group.add(leg2);

        return group;
    }

    updateMines(mines) {
        const THREE = this.THREE;
        const activeMineIds = new Set();

        for (const mine of mines) {
            activeMineIds.add(mine.id);

            let mesh = this.mineMeshes.get(mine.id);
            if (!mesh) {
                mesh = this.createMineMesh(mine);
                this.mineMeshes.set(mine.id, mesh);
                this.scene.add(mesh);
            }

            // Position update
            const pos = hexToPixel({ q: mine.q, r: mine.r });
            const height = this.grid.getHeight(mine.q, mine.r) * RENDER.HEIGHT_SCALE;
            mesh.position.set(pos.x, height + 0.2, pos.z);
        }

        // Remove destroyed mines
        for (const [id, mesh] of this.mineMeshes.entries()) {
            if (!activeMineIds.has(id)) {
                this.scene.remove(mesh);
                this.mineMeshes.delete(id);
            }
        }
    }

    createMineMesh(mine) {
        const THREE = this.THREE;

        const group = new THREE.Group();

        // Mine structure (box)
        const boxGeom = new THREE.BoxGeometry(0.8, 0.4, 0.8);
        const boxMat = new THREE.MeshLambertMaterial({ color: 0x886644 });
        const box = new THREE.Mesh(boxGeom, boxMat);
        box.position.y = 0.2;
        box.castShadow = true;
        group.add(box);

        // Resource crystal on top
        const crystalGeom = new THREE.OctahedronGeometry(0.2, 0);
        const crystalMat = new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x664400 });
        const crystal = new THREE.Mesh(crystalGeom, crystalMat);
        crystal.position.y = 0.5;
        crystal.rotation.y = Math.PI / 4;
        group.add(crystal);

        return group;
    }

    // Show hover indicator at hex position
    showHover(q, r) {
        if (!this.hoverMesh) return;

        const pos = hexToPixel({ q, r });
        const height = this.grid.getHeight(q, r) * RENDER.HEIGHT_SCALE;
        this.hoverMesh.position.set(pos.x, height + 0.1, pos.z);
        this.hoverMesh.visible = true;
    }

    hideHover() {
        if (this.hoverMesh) {
            this.hoverMesh.visible = false;
        }
    }

    // Show selection indicator at hex position
    showSelection(q, r) {
        if (!this.selectionMesh) return;

        const pos = hexToPixel({ q, r });
        const height = this.grid.getHeight(q, r) * RENDER.HEIGHT_SCALE;
        this.selectionMesh.position.set(pos.x, height + 0.1, pos.z);
        this.selectionMesh.visible = true;
    }

    hideSelection() {
        if (this.selectionMesh) {
            this.selectionMesh.visible = false;
        }
    }

    // Raycast from screen position to hex grid
    screenToHex(screenX, screenY) {
        const THREE = this.THREE;

        // Normalize screen coordinates
        const rect = this.canvas.getBoundingClientRect();
        const x = ((screenX - rect.left) / rect.width) * 2 - 1;
        const y = -((screenY - rect.top) / rect.height) * 2 + 1;

        // Create raycaster
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

        // Intersect with ground plane
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(groundPlane, intersection);

        if (intersection) {
            // Convert world position to hex
            return pixelToHex(intersection.x, intersection.z);
        }

        return null;
    }

    // Update center tile based on camera position
    updateCenterTile(state, playerId) {
        // Get the world position at screen center
        const target = this.cameraController.getTarget();
        const centerHex = pixelToHex(target.x, target.z);

        // Clamp to valid grid coordinates
        const q = Math.max(0, Math.min(this.grid.width - 1, centerHex.q));
        const r = Math.max(0, Math.min(this.grid.height - 1, centerHex.r));

        this.centerTile = { q, r };

        // Get tile info
        const tileType = this.grid.getTileType(q, r);
        const height = this.grid.getHeight(q, r);
        const owner = this.grid.getOwner(q, r);

        // Check for tower or mine at this location
        const tower = this.grid.getTower(q, r);
        const mine = this.grid.getMine(q, r);

        const playerOwner = playerId === 'p1' ? 0 : 1;

        this.centerTileInfo = {
            type: this.getTileTypeName(tileType),
            height,
            owner,
            hasTower: !!tower,
            towerType: tower?.type,
            isOwnTower: tower?.owner === playerId,
            hasMine: !!mine,
            isOwnMine: mine?.owner === playerId,
            canBuild: tileType === TILE_TYPES.TOWER_SLOT && !tower && (owner === -1 || owner === playerOwner),
            canMine: tileType === TILE_TYPES.RESOURCE_NODE && !mine && (owner === -1 || owner === playerOwner)
        };

        // Update center selection mesh position
        if (this.centerSelectionMesh) {
            const pos = hexToPixel({ q, r });
            const tileHeight = height * RENDER.HEIGHT_SCALE;
            this.centerSelectionMesh.position.set(pos.x, tileHeight + 0.15, pos.z);
        }

        // Update radial menu with tile info
        this.radialMenu.setSelectedTile(this.centerTile, this.centerTileInfo);
        this.radialMenu.setGameState(state, playerId);
    }

    getTileTypeName(tileType) {
        switch (tileType) {
            case TILE_TYPES.EMPTY: return 'EMPTY';
            case TILE_TYPES.BLOCKED: return 'BLOCKED';
            case TILE_TYPES.RAMP: return 'RAMP';
            case TILE_TYPES.RESOURCE_NODE: return 'RESOURCE_NODE';
            case TILE_TYPES.TOWER_SLOT: return 'TOWER_SLOT';
            case TILE_TYPES.MAIN_TOWER_SLOT: return 'MAIN_TOWER_SLOT';
            default: return 'UNKNOWN';
        }
    }

    // Pan camera to center on a specific hex
    panToHex(q, r) {
        this.cameraController.focusOnHex(q, r, true);
    }

    // Main render function
    render(state, playerId, isHost) {
        // Update camera
        this.cameraController.update();

        // Update center tile selection
        if (state && playerId) {
            this.updateCenterTile(state, playerId);
        }

        // Update chunk visibility
        this.chunkManager.updateVisibility(this.camera);

        // Update entity meshes
        if (state) {
            this.updateEntities(state);
        }

        // Render 3D scene
        this.renderer.render(this.scene, this.camera);

        // Update and render radial menu
        this.radialMenu.update(1/60); // Approximate delta time
        this.radialMenu.render();

        // Render UI overlay
        this.uiOverlay.render(state, playerId, isHost);
    }

    resize(width, height) {
        // Three.js renderer handles pixel ratio internally when using setSize
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.uiOverlay.resize(width, height);
        this.radialMenu.resize(width, height);
    }

    dispose() {
        // Clean up meshes
        for (const mesh of this.towerMeshes.values()) {
            this.scene.remove(mesh);
        }
        for (const mesh of this.unitMeshes.values()) {
            this.scene.remove(mesh);
        }
        for (const mesh of this.mineMeshes.values()) {
            this.scene.remove(mesh);
        }

        this.towerMeshes.clear();
        this.unitMeshes.clear();
        this.mineMeshes.clear();

        // Clean up sub-systems
        this.chunkManager?.dispose();
        this.meshFactory?.dispose();
        this.cameraController?.dispose();
        this.uiOverlay?.dispose();
        this.radialMenu?.dispose();

        // Clean up Three.js
        this.renderer?.dispose();
    }
}
