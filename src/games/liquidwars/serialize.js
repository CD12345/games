const MAX_RUN_LENGTH = 255;

function clampByte(value) {
    return Math.max(0, Math.min(255, value));
}

function bytesToBase64(bytes) {
    if (typeof btoa === 'function') {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    return '';
}

function base64ToBytes(base64) {
    if (typeof atob === 'function') {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    return new Uint8Array();
}

export function serializeSnapshot(densities, grid) {
    const totalCells = grid.width * grid.height;
    const bytes = [];
    let runLength = 0;
    let lastOwner = 0;
    let lastDensity = 0;

    for (let i = 0; i < totalCells; i++) {
        const p1 = densities.p1[i] ?? 0;
        const p2 = densities.p2[i] ?? 0;
        let owner = 0;
        let density = 0;

        if (p1 > 0) {
            owner = 1;
            density = clampByte(Math.round(p1));
        } else if (p2 > 0) {
            owner = 2;
            density = clampByte(Math.round(p2));
        }

        if (runLength === 0) {
            runLength = 1;
            lastOwner = owner;
            lastDensity = density;
            continue;
        }

        if (owner === lastOwner && density === lastDensity && runLength < MAX_RUN_LENGTH) {
            runLength += 1;
            continue;
        }

        bytes.push(runLength, lastOwner, lastDensity);
        runLength = 1;
        lastOwner = owner;
        lastDensity = density;
    }

    if (runLength > 0) {
        bytes.push(runLength, lastOwner, lastDensity);
    }

    return bytesToBase64(new Uint8Array(bytes));
}

export function deserializeSnapshot(snapshot, grid) {
    const totalCells = grid.width * grid.height;
    const p1 = Array(totalCells).fill(0);
    const p2 = Array(totalCells).fill(0);
    let totalP1 = 0;
    let totalP2 = 0;

    const bytes = base64ToBytes(snapshot || '');
    let index = 0;

    for (let i = 0; i + 2 < bytes.length; i += 3) {
        const runLength = bytes[i];
        const owner = bytes[i + 1];
        const density = bytes[i + 2];

        for (let r = 0; r < runLength && index < totalCells; r++) {
            if (owner === 1) {
                p1[index] = density;
                totalP1 += density;
            } else if (owner === 2) {
                p2[index] = density;
                totalP2 += density;
            }
            index += 1;
        }
    }

    return {
        densities: { p1, p2 },
        totals: { p1: totalP1, p2: totalP2 }
    };
}
