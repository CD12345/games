// A* Pathfinder for Hex Grid

import { hexNeighbors, hexDistance, hexKey, parseHexKey } from './HexMath.js';

// Min-heap for priority queue
class MinHeap {
    constructor() {
        this.heap = [];
    }

    insert(item) {
        this.heap.push(item);
        this.bubbleUp(this.heap.length - 1);
    }

    extractMin() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) return this.heap.pop();

        const min = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.bubbleDown(0);
        return min;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.heap[parent].f <= this.heap[index].f) break;
            [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
            index = parent;
        }
    }

    bubbleDown(index) {
        const length = this.heap.length;
        while (true) {
            const left = 2 * index + 1;
            const right = 2 * index + 2;
            let smallest = index;

            if (left < length && this.heap[left].f < this.heap[smallest].f) {
                smallest = left;
            }
            if (right < length && this.heap[right].f < this.heap[smallest].f) {
                smallest = right;
            }
            if (smallest === index) break;

            [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
            index = smallest;
        }
    }
}

export class Pathfinder {
    constructor(grid) {
        this.grid = grid;
        this.pathCache = new Map();
        this.maxCacheSize = 1000;
    }

    // Find path from start to goal hex
    findPath(start, goal) {
        // Check cache
        const cacheKey = `${hexKey(start)}->${hexKey(goal)}`;
        if (this.pathCache.has(cacheKey)) {
            return this.pathCache.get(cacheKey).slice(); // Return copy
        }

        // A* algorithm
        const openSet = new MinHeap();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        const visited = new Set();

        const startKey = hexKey(start);
        const goalKey = hexKey(goal);

        gScore.set(startKey, 0);
        fScore.set(startKey, hexDistance(start, goal));
        openSet.insert({ hex: start, f: fScore.get(startKey) });

        let iterations = 0;
        const maxIterations = 10000; // Safety limit

        while (!openSet.isEmpty() && iterations < maxIterations) {
            iterations++;

            const current = openSet.extractMin();
            const currentKey = hexKey(current.hex);

            if (visited.has(currentKey)) continue;
            visited.add(currentKey);

            // Reached goal
            if (currentKey === goalKey) {
                const path = this.reconstructPath(cameFrom, current.hex);
                this.cachePath(cacheKey, path);
                return path;
            }

            // Explore neighbors
            const neighbors = this.grid.getWalkableNeighbors(current.hex.q, current.hex.r);

            for (const neighbor of neighbors) {
                const neighborKey = hexKey(neighbor);
                if (visited.has(neighborKey)) continue;

                const tentativeG = gScore.get(currentKey) + this.moveCost(current.hex, neighbor);

                if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
                    cameFrom.set(neighborKey, current.hex);
                    gScore.set(neighborKey, tentativeG);
                    const f = tentativeG + hexDistance(neighbor, goal);
                    fScore.set(neighborKey, f);
                    openSet.insert({ hex: neighbor, f });
                }
            }
        }

        // No path found
        return null;
    }

    // Calculate movement cost between adjacent hexes
    moveCost(from, to) {
        let cost = 1.0;

        // Moving to higher ground is slightly more expensive
        const fromHeight = this.grid.getHeight(from.q, from.r);
        const toHeight = this.grid.getHeight(to.q, to.r);

        if (toHeight > fromHeight) {
            cost += 0.2;
        }

        return cost;
    }

    // Reconstruct path from cameFrom map
    reconstructPath(cameFrom, current) {
        const path = [current];
        let currentKey = hexKey(current);

        while (cameFrom.has(currentKey)) {
            current = cameFrom.get(currentKey);
            currentKey = hexKey(current);
            path.unshift(current);
        }

        return path;
    }

    // Cache path for reuse
    cachePath(key, path) {
        // Evict oldest entries if cache is full
        if (this.pathCache.size >= this.maxCacheSize) {
            const firstKey = this.pathCache.keys().next().value;
            this.pathCache.delete(firstKey);
        }

        this.pathCache.set(key, path);
    }

    // Clear path cache (call when map changes)
    clearCache() {
        this.pathCache.clear();
    }

    // Find path to nearest target from a set of goals
    findPathToNearest(start, goals) {
        if (goals.length === 0) return null;
        if (goals.length === 1) return this.findPath(start, goals[0]);

        // Sort goals by distance heuristic
        const sortedGoals = goals
            .map(g => ({ goal: g, dist: hexDistance(start, g) }))
            .sort((a, b) => a.dist - b.dist);

        // Try to find path to nearest goal first
        for (const { goal } of sortedGoals.slice(0, 3)) {
            const path = this.findPath(start, goal);
            if (path) return path;
        }

        // If nearby goals are blocked, try all goals
        for (const { goal } of sortedGoals) {
            const path = this.findPath(start, goal);
            if (path) return path;
        }

        return null;
    }

    // Check if there's a valid path between two points
    hasPath(start, goal) {
        const path = this.findPath(start, goal);
        return path !== null && path.length > 0;
    }

    // Get next waypoint along a path
    getNextWaypoint(path, currentIndex) {
        if (!path || currentIndex >= path.length - 1) return null;
        return path[currentIndex + 1];
    }

    // Calculate path length
    getPathLength(path) {
        if (!path || path.length < 2) return 0;

        let length = 0;
        for (let i = 1; i < path.length; i++) {
            length += this.moveCost(path[i - 1], path[i]);
        }
        return length;
    }
}
