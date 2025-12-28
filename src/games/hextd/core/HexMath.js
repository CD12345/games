// Hex Math Utilities - Pointy-topped axial coordinate system

import { RENDER } from '../config.js';

// Hex directions for pointy-topped hexes (6 neighbors)
export const HEX_DIRECTIONS = [
    { q: 1, r: 0 },    // E
    { q: 1, r: -1 },   // NE
    { q: 0, r: -1 },   // NW
    { q: -1, r: 0 },   // W
    { q: -1, r: 1 },   // SW
    { q: 0, r: 1 }     // SE
];

// Create a hex coordinate
export function hex(q, r) {
    return { q, r };
}

// Get string key for hex (for Map/Set usage)
export function hexKey(h) {
    return `${h.q},${h.r}`;
}

// Parse hex key back to coordinates
export function parseHexKey(key) {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
}

// Check if two hexes are equal
export function hexEquals(a, b) {
    return a.q === b.q && a.r === b.r;
}

// Get all 6 neighbor hexes
export function hexNeighbors(h) {
    return HEX_DIRECTIONS.map(d => ({
        q: h.q + d.q,
        r: h.r + d.r
    }));
}

// Get neighbor in a specific direction (0-5)
export function hexNeighbor(h, direction) {
    const d = HEX_DIRECTIONS[direction];
    return {
        q: h.q + d.q,
        r: h.r + d.r
    };
}

// Calculate hex distance (Manhattan distance in cube coordinates)
export function hexDistance(a, b) {
    // Convert axial to cube coordinates
    const ax = a.q;
    const az = a.r;
    const ay = -ax - az;

    const bx = b.q;
    const bz = b.r;
    const by = -bx - bz;

    return Math.max(
        Math.abs(ax - bx),
        Math.abs(ay - by),
        Math.abs(az - bz)
    );
}

// Convert hex to pixel coordinates (center point)
// For pointy-topped hexes
export function hexToPixel(h, size = RENDER.HEX_SIZE) {
    const x = size * (Math.sqrt(3) * h.q + Math.sqrt(3) / 2 * h.r);
    const z = size * (3 / 2 * h.r);
    return { x, z };
}

// Convert pixel coordinates to hex (fractional)
export function pixelToHexFractional(x, z, size = RENDER.HEX_SIZE) {
    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * z) / size;
    const r = (2 / 3 * z) / size;
    return { q, r };
}

// Round fractional hex to nearest hex
export function hexRound(h) {
    // Convert to cube coordinates
    const x = h.q;
    const z = h.r;
    const y = -x - z;

    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);

    const xDiff = Math.abs(rx - x);
    const yDiff = Math.abs(ry - y);
    const zDiff = Math.abs(rz - z);

    // Fix the coordinate with largest rounding error
    if (xDiff > yDiff && xDiff > zDiff) {
        rx = -ry - rz;
    } else if (yDiff > zDiff) {
        ry = -rx - rz;
    } else {
        rz = -rx - ry;
    }

    return { q: rx, r: rz };
}

// Convert pixel to nearest hex
export function pixelToHex(x, z, size = RENDER.HEX_SIZE) {
    return hexRound(pixelToHexFractional(x, z, size));
}

// Get all hexes within a radius
export function hexesInRange(center, radius) {
    const results = [];
    for (let q = -radius; q <= radius; q++) {
        for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
            results.push({
                q: center.q + q,
                r: center.r + r
            });
        }
    }
    return results;
}

// Get hexes in a ring at a specific distance
export function hexRing(center, radius) {
    if (radius === 0) return [center];

    const results = [];
    let h = {
        q: center.q + HEX_DIRECTIONS[4].q * radius,
        r: center.r + HEX_DIRECTIONS[4].r * radius
    };

    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < radius; j++) {
            results.push({ ...h });
            h = hexNeighbor(h, i);
        }
    }

    return results;
}

// Linear interpolation between two hexes
export function hexLerp(a, b, t) {
    return {
        q: a.q + (b.q - a.q) * t,
        r: a.r + (b.r - a.r) * t
    };
}

// Get all hexes along a line between two hexes
export function hexLine(a, b) {
    const n = hexDistance(a, b);
    if (n === 0) return [a];

    const results = [];
    for (let i = 0; i <= n; i++) {
        results.push(hexRound(hexLerp(a, b, i / n)));
    }
    return results;
}

// Check if a hex is within map bounds
export function hexInBounds(h, width, height) {
    return h.q >= 0 && h.q < width && h.r >= 0 && h.r < height;
}

// Get the corner vertices of a hex (for rendering)
export function hexCorners(h, size = RENDER.HEX_SIZE) {
    const center = hexToPixel(h, size);
    const corners = [];

    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i - 30); // Pointy-topped
        corners.push({
            x: center.x + size * Math.cos(angle),
            z: center.z + size * Math.sin(angle)
        });
    }

    return corners;
}

// Calculate direction from one hex to another (returns 0-5 or -1 if not adjacent)
export function hexDirection(from, to) {
    const dq = to.q - from.q;
    const dr = to.r - from.r;

    for (let i = 0; i < 6; i++) {
        if (HEX_DIRECTIONS[i].q === dq && HEX_DIRECTIONS[i].r === dr) {
            return i;
        }
    }
    return -1;
}

// Get opposite direction
export function oppositeDirection(dir) {
    return (dir + 3) % 6;
}

// Rotate a hex around the origin by 60 degrees * times
export function hexRotate(h, times) {
    // Convert to cube
    let x = h.q;
    let z = h.r;
    let y = -x - z;

    for (let i = 0; i < times; i++) {
        [x, y, z] = [-z, -x, -y];
    }

    return { q: x, r: z };
}

// Reflect a hex across the q axis
export function hexReflectQ(h) {
    return { q: h.q, r: -h.r - h.q };
}

// Reflect a hex across the r axis
export function hexReflectR(h) {
    return { q: -h.q - h.r, r: h.r };
}
