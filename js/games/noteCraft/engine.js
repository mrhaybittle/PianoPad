// js/games/noteCraft/engine.js
import { BLOCKS, BLOCK_COSTS, GRAVITY, PLAYER_EYE_HEIGHT, PLAYER_RADIUS } from './constants.js';
import { ncState } from './state.js';

export const WORLD_RADIUS = 48; // 96x96 block campus matching the Edmund Rice College aerial map

export const CAMPUS_ZONES = [
    { name: 'Centenary Innovation Centre', minX: -8,  maxX: 14,  minZ: 8,   maxZ: 24,  color: '#facc15' },
    { name: 'Indoor Sports Centre',        minX: -44, maxX: -20, minZ: -12, maxZ: 14,  color: '#ef4444' },
    { name: 'Basketball Courts',           minX: -38, maxX: -16, minZ: 14,  maxZ: 32,  color: '#f97316' },
    { name: 'Main Quad & Solar Roofs',     minX: -10, maxX: 22,  minZ: -24, maxZ: -2,  color: '#38bdf8' },
    { name: 'E4 & Music Wing (G1–G3)',     minX: 22,  maxX: 44,  minZ: -30, maxZ: -10, color: '#c084fc' },
    { name: 'Southern Oval',               minX: -24, maxX: 18,  minZ: 24,  maxZ: 46,  color: '#22c55e' }
];

export function getCurrentCampusZone(x, z) {
    for (const zone of CAMPUS_ZONES) {
        if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
            return zone;
        }
    }
    return { name: 'Edmund Rice College Grounds', color: '#94a3b8' };
}

export function getBaseTerrainBlock(x, y, z) {
    if (x < -WORLD_RADIUS || x >= WORLD_RADIUS || z < -WORLD_RADIUS || z >= WORLD_RADIUS) {
        return BLOCKS.AIR;
    }
    if (y === 0) return BLOCKS.DIRT;
    if (y === 1) return BLOCKS.GRASS;
    return BLOCKS.AIR;
}

export function getBlockAt(x, y, z) {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (by < 0 || by >= 24) return BLOCKS.AIR;

    const key = `${bx}_${by}_${bz}`;
    if (Object.prototype.hasOwnProperty.call(ncState.world.deltas, key)) {
        return ncState.world.deltas[key];
    }
    return getBaseTerrainBlock(bx, by, bz);
}

export function setBlockAt(x, y, z, blockId) {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (bx < -WORLD_RADIUS || bx >= WORLD_RADIUS || bz < -WORLD_RADIUS || bz >= WORLD_RADIUS) return null;
    if (by < 1 || by >= 23) return null; // Protect bedrock layer y=0

    const key = `${bx}_${by}_${bz}`;
    ncState.world.deltas[key] = blockId;
    ncState.world.dirty = true;
    return { key, x: bx, y: by, z: bz, blockId };
}

export function isBlockSolid(blockId) {
    return blockId !== BLOCKS.AIR && blockId !== undefined && blockId !== null;
}

function collidesAt(px, py, pz) {
    const minX = Math.floor(px - PLAYER_RADIUS);
    const maxX = Math.floor(px + PLAYER_RADIUS);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + PLAYER_EYE_HEIGHT + 0.15);
    const minZ = Math.floor(pz - PLAYER_RADIUS);
    const maxZ = Math.floor(pz + PLAYER_RADIUS);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                if (isBlockSolid(getBlockAt(x, y, z))) return true;
            }
        }
    }
    return false;
}

export function raycastVoxel(maxDist = 6.5) {
    const lp = ncState.localPlayer;
    const ox = lp.x;
    const oy = lp.y + PLAYER_EYE_HEIGHT;
    const oz = lp.z;

    const cosPitch = Math.cos(lp.pitch);
    const dx = -Math.sin(lp.yaw) * cosPitch;
    const dy = Math.sin(lp.pitch);
    const dz = -Math.cos(lp.yaw) * cosPitch;

    let prevBx = Math.floor(ox);
    let prevBy = Math.floor(oy);
    let prevBz = Math.floor(oz);

    const step = 0.06;
    for (let d = 0.25; d <= maxDist; d += step) {
        const rx = ox + dx * d;
        const ry = oy + dy * d;
        const rz = oz + dz * d;

        const bx = Math.floor(rx);
        const by = Math.floor(ry);
        const bz = Math.floor(rz);

        if (bx === prevBx && by === prevBy && bz === prevBz) continue;

        const blockId = getBlockAt(bx, by, bz);
        if (isBlockSolid(blockId)) {
            return {
                hit: true,
                x: bx,
                y: by,
                z: bz,
                blockId,
                normal: {
                    x: prevBx - bx,
                    y: prevBy - by,
                    z: prevBz - bz
                }
            };
        }

        prevBx = bx;
        prevBy = by;
        prevBz = bz;
    }

    return { hit: false };
}

export function breakTargetBlock() {
    const target = ncState.targetBlock;
    if (!target || !target.hit || target.y <= 0) return null;
    return setBlockAt(target.x, target.y, target.z, BLOCKS.AIR);
}

export function placeSelectedBlock() {
    const target = ncState.targetBlock;
    const lp = ncState.localPlayer;
    if (!target || !target.hit) return null;

    const blockId = lp.inventory[lp.selectedSlot];
    if (!blockId) return null;

    const cost = BLOCK_COSTS[blockId] || 0;
    if (lp.noteCoins < cost) {
        return { error: 'INSUFFICIENT_COINS', cost };
    }

    const px = target.x + target.normal.x;
    const py = target.y + target.normal.y;
    const pz = target.z + target.normal.z;

    // Prevent trapping self inside placed block
    const playerMinY = Math.floor(lp.y);
    const playerMaxY = Math.floor(lp.y + PLAYER_EYE_HEIGHT);
    if (px === Math.floor(lp.x) && pz === Math.floor(lp.z) && py >= playerMinY && py <= playerMaxY) {
        return null;
    }

    const change = setBlockAt(px, py, pz, blockId);
    if (change) {
        lp.noteCoins -= cost;
        return { change, cost };
    }
    return null;
}

export function updatePlayerPhysics(dt) {
    const lp = ncState.localPlayer;
    const keys = ncState.keysHeld;

    if (lp.isFlying) {
        lp.flightTimer = Math.max(0, lp.flightTimer - dt);
        if (lp.flightTimer <= 0) lp.isFlying = false;
    }

    let forward = 0;
    let strafe = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;

    const len = Math.hypot(forward, strafe);
    if (len > 0) {
        forward /= len;
        strafe /= len;
    }

    const speed = lp.isFlying ? 8.5 : 5.8;
    const sinY = Math.sin(lp.yaw);
    const cosY = Math.cos(lp.yaw);

    const moveX = (-sinY * forward + cosY * strafe) * speed;
    const moveZ = (-cosY * forward - sinY * strafe) * speed;

    if (lp.isFlying) {
        let vy = 0;
        if (keys.has('Space')) vy += 5.5;
        if (keys.has('ShiftLeft') || keys.has('ShiftRight')) vy -= 5.5;
        lp.velocity.y = vy;
    } else {
        lp.velocity.y += GRAVITY * dt;
        if (keys.has('Space') && lp.isGrounded) {
            lp.velocity.y = 7.4;
            lp.isGrounded = false;
        }
    }

    // Horizontal X collision
    const nextX = lp.x + moveX * dt;
    if (!collidesAt(nextX, lp.y + 0.05, lp.z)) {
        lp.x = Math.max(-WORLD_RADIUS + 1, Math.min(WORLD_RADIUS - 1, nextX));
    }

    // Horizontal Z collision
    const nextZ = lp.z + moveZ * dt;
    if (!collidesAt(lp.x, lp.y + 0.05, nextZ)) {
        lp.z = Math.max(-WORLD_RADIUS + 1, Math.min(WORLD_RADIUS - 1, nextZ));
    }

    // Vertical Y collision
    const nextY = lp.y + lp.velocity.y * dt;
    if (collidesAt(lp.x, nextY, lp.z)) {
        if (lp.velocity.y < 0) lp.isGrounded = true;
        lp.velocity.y = 0;
    } else {
        lp.y = nextY;
        lp.isGrounded = false;
    }

    // Respawn safety net on the quad walkway
    if (lp.y < -5) {
        lp.x = 0;
        lp.y = 3;
        lp.z = 4;
        lp.velocity.y = 0;
    }

    ncState.targetBlock = raycastVoxel(6.5);
}
