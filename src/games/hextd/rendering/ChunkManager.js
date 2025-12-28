// Chunk Manager - Efficient rendering of large hex grids using instanced meshes

import { RENDER, MAP_WIDTH, MAP_HEIGHT, TILE_TYPES } from '../config.js';
import { hexToPixel } from '../core/HexMath.js';

const CHUNK_SIZE = RENDER.CHUNK_SIZE; // 20x20 hexes per chunk

export class ChunkManager {
    constructor(THREE, scene, grid, meshFactory) {
        this.THREE = THREE;
        this.scene = scene;
        this.grid = grid;
        this.meshFactory = meshFactory;

        // Chunk dimensions
        this.chunksX = Math.ceil(MAP_WIDTH / CHUNK_SIZE);
        this.chunksZ = Math.ceil(MAP_HEIGHT / CHUNK_SIZE);

        // Chunk data
        this.chunks = new Map(); // chunkKey -> { group, meshes, visible }
        this.visibleChunks = new Set();

        // Build all chunks initially
        this.buildAllChunks();
    }

    getChunkKey(cx, cz) {
        return `${cx},${cz}`;
    }

    getChunkForHex(q, r) {
        const cx = Math.floor(q / CHUNK_SIZE);
        const cz = Math.floor(r / CHUNK_SIZE);
        return { cx, cz };
    }

    buildAllChunks() {
        for (let cz = 0; cz < this.chunksZ; cz++) {
            for (let cx = 0; cx < this.chunksX; cx++) {
                this.buildChunk(cx, cz);
            }
        }
    }

    buildChunk(cx, cz) {
        const THREE = this.THREE;
        const key = this.getChunkKey(cx, cz);

        // Calculate hex range for this chunk
        const minQ = cx * CHUNK_SIZE;
        const maxQ = Math.min(minQ + CHUNK_SIZE, MAP_WIDTH);
        const minR = cz * CHUNK_SIZE;
        const maxR = Math.min(minR + CHUNK_SIZE, MAP_HEIGHT);

        // Count tiles by type/height/owner combination
        const tileGroups = new Map();

        for (let r = minR; r < maxR; r++) {
            for (let q = minQ; q < maxQ; q++) {
                const type = this.grid.getTileType(q, r);
                const height = this.grid.getHeight(q, r);
                const owner = this.grid.getOwner(q, r);

                const groupKey = `${type}_${height}_${owner}`;
                if (!tileGroups.has(groupKey)) {
                    tileGroups.set(groupKey, []);
                }
                tileGroups.get(groupKey).push({ q, r, type, height, owner });
            }
        }

        // Create chunk group
        const chunkGroup = new THREE.Group();
        chunkGroup.name = `chunk_${cx}_${cz}`;

        const meshes = [];

        // Create instanced mesh for each group
        for (const [groupKey, tiles] of tileGroups.entries()) {
            if (tiles.length === 0) continue;

            const [typeStr, heightStr, ownerStr] = groupKey.split('_');
            const type = parseInt(typeStr);
            const height = parseInt(heightStr);
            const owner = parseInt(ownerStr);

            const material = this.meshFactory.getMaterial(type, height, owner);
            const geometry = this.meshFactory.getHexGeometry();

            const instancedMesh = new THREE.InstancedMesh(geometry, material, tiles.length);
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;

            // Set instance matrices
            const matrix = new THREE.Matrix4();
            tiles.forEach((tile, i) => {
                const pos = hexToPixel({ q: tile.q, r: tile.r });
                const y = tile.height * RENDER.HEIGHT_SCALE;
                matrix.setPosition(pos.x, y, pos.z);
                instancedMesh.setMatrixAt(i, matrix);
            });
            instancedMesh.instanceMatrix.needsUpdate = true;

            chunkGroup.add(instancedMesh);
            meshes.push(instancedMesh);
        }

        // Calculate chunk bounding box for frustum culling
        const centerQ = (minQ + maxQ) / 2;
        const centerR = (minR + maxR) / 2;
        const centerPos = hexToPixel({ q: centerQ, r: centerR });

        const chunkBounds = new THREE.Box3(
            new THREE.Vector3(
                centerPos.x - CHUNK_SIZE * RENDER.HEX_SIZE,
                -1,
                centerPos.z - CHUNK_SIZE * RENDER.HEX_SIZE
            ),
            new THREE.Vector3(
                centerPos.x + CHUNK_SIZE * RENDER.HEX_SIZE,
                2,
                centerPos.z + CHUNK_SIZE * RENDER.HEX_SIZE
            )
        );

        // Store chunk data
        this.chunks.set(key, {
            group: chunkGroup,
            meshes,
            bounds: chunkBounds,
            visible: true
        });

        this.scene.add(chunkGroup);
    }

    // Update chunk visibility based on camera frustum
    updateVisibility(camera) {
        const THREE = this.THREE;

        // Create frustum from camera
        const frustum = new THREE.Frustum();
        const projScreenMatrix = new THREE.Matrix4();
        projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreenMatrix);

        const newVisible = new Set();

        for (const [key, chunk] of this.chunks.entries()) {
            const isVisible = frustum.intersectsBox(chunk.bounds);

            if (isVisible !== chunk.visible) {
                chunk.group.visible = isVisible;
                chunk.visible = isVisible;
            }

            if (isVisible) {
                newVisible.add(key);
            }
        }

        this.visibleChunks = newVisible;
    }

    // Rebuild a specific chunk (when tiles change)
    rebuildChunk(cx, cz) {
        const key = this.getChunkKey(cx, cz);
        const chunk = this.chunks.get(key);

        if (chunk) {
            // Remove old meshes
            this.scene.remove(chunk.group);
            chunk.meshes.forEach(mesh => {
                mesh.geometry?.dispose();
            });
            this.chunks.delete(key);
        }

        // Build new chunk
        this.buildChunk(cx, cz);
    }

    // Rebuild chunk containing a specific hex
    rebuildChunkForHex(q, r) {
        const { cx, cz } = this.getChunkForHex(q, r);
        this.rebuildChunk(cx, cz);
    }

    // Get visible chunk count for debugging
    getVisibleChunkCount() {
        return this.visibleChunks.size;
    }

    getTotalChunkCount() {
        return this.chunks.size;
    }

    dispose() {
        for (const chunk of this.chunks.values()) {
            this.scene.remove(chunk.group);
            chunk.meshes.forEach(mesh => {
                mesh.geometry?.dispose();
            });
        }
        this.chunks.clear();
        this.visibleChunks.clear();
    }
}
