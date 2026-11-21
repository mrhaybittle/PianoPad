// js/games/noteCraft/engine.js
import { BLOCKS, BLOCK_COSTS, CHUNK_HEIGHT } from './constants.js';
import { ncState } from './state.js';

export const WORLD_RADIUS = 32; // 64x64 campus build area
const PLAYER_HALF_W = 0.3;
const PLAYER_HEIGHT = 1.75;
export const EYE_HEIGHT = 1.6;
const GRAVITY = 22.0;
const JUMP_VELOCITY = 8.2;
const WALK_SPEED = 5.5;
const FLY_SPEED = 8.5;

// Deterministic base school grounds & starter campus foundation
export function getBaseTerrainBlock(x, y, z) {
    if (Math.abs(x) > WORLD_RADIUS || Math.abs(z) > WORLD_RADIUS || y < 0 || y >= CHUNK_HEIGHT) {
        return BLOCKS.AIR;
    }
    if (y === 0) return BLOCKS.STONE; // Bedrock floor
    if (y === 1) {
        // Cross pathways leading to central quad
        if (Math.abs(x) <= 1 || Math.abs(z) <= 1) return BLOCKS.STONE;
        return BLOCKS.GRASS;
    }
    // Starter school perimeter footprint at y=2 with entrance gaps
    if (y === 2) {
        const onXWall = Math.abs(x) === 12 && Math.abs(z) <= 10 && Math.abs(z) > 2;
        const onZWall = Math.abs(z) === 10 && Math.abs(x) <= 12 && Math.abs(x) > 2;
        if (onXWall || onZWall) return BLOCKS.BRICK;
    }
    return BLOCKS.AIR;
}

export function getBlockAt(x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const key = `${ix}_${iy}_${iz}`;
    if (Object.prototype.hasOwnProperty.call(ncState.world.deltas, key)) {
        return ncState.world.deltas[key];
    }
    return getBaseTerrainBlock(ix, iy, iz);
}

export function setBlockAt(x, y, z, blockId) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    if (Math.abs(ix) > WORLD_RADIUS || Math.abs(iz) > WORLD_RADIUS || iy < 1 || iy >= CHUNK_HEIGHT) {
        return null;
    }
    const key = `${ix}_${iy}_${iz}`;
    ncState.world.deltas[key] = blockId;
    ncState.world.dirty = true;
    return { key, x: ix, y: iy, z: iz, blockId };
}

function isSolidBlock(x, y, z) {
    return getBlockAt(x, y, z) !== BLOCKS.AIR;
}

function collidesAABB(px, py, pz) {
    const minX = Math.floor(px - PLAYER_HALF_W);
    const maxX = Math.floor(px + PLAYER_HALF_W);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + PLAYER_HEIGHT);
    const minZ = Math.floor(pz - PLAYER_HALF_W);
    const maxZ = Math.floor(pz + PLAYER_HALF_W);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                if (isSolidBlock(x, y, z)) return true;
            }
        }
    }
    return false;
}

export function getLookDirection(yaw, pitch) {
    const cosPitch = Math.cos(pitch);
    return {
        x: -Math.sin(yaw) * cosPitch,
        y: Math.sin(pitch),
        z: -Math.cos(yaw) * cosPitch
    };
}

// Fast 3D DDA voxel traversal for block targeting
export function raycastVoxel(origin, dir, maxDist = 7) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dir.x > 0 ? 1 : (dir.x < 0 ? -1 : 0);
    const stepY = dir.y > 0 ? 1 : (dir.y < 0 ? -1 : 0);
    const stepZ = dir.z > 0 ? 1 : (dir.z < 0 ? -1 : 0);

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : (origin.x - x) * tDeltaX;
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : (origin.y - y) * tDeltaY;
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : (origin.z - z) * tDeltaZ;

    const normal = { x: 0, y: 0, z: 0 };
    let dist = 0;

    while (dist <= maxDist) {
        const blockId = getBlockAt(x, y, z);
        if (blockId !== BLOCKS.AIR) {
            return { hit: true, x, y, z, normal, blockId };
        }
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
            dist = tMaxX;
            tMaxX += tDeltaX;
            x += stepX;
            normal.x = -stepX; normal.y = 0; normal.z = 0;
        } else if (tMaxY < tMaxZ) {
            dist = tMaxY;
            tMaxY += tDeltaY;
            y += stepY;
            normal.x = 0; normal.y = -stepY; normal.z = 0;
        } else {
            dist = tMaxZ;
            tMaxZ += tDeltaZ;
            z += stepZ;
            normal.x = 0; normal.y = 0; normal.z = -stepZ;
        }
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
    if (!target || !target.hit) return { error: 'NO_TARGET' };

    const blockId = lp.inventory[lp.selectedSlot];
    if (!blockId) return { error: 'NO_BLOCK_SELECTED' };

    const cost = BLOCK_COSTS[blockId] || 0;
    if (lp.noteCoins < cost) return { error: 'INSUFFICIENT_COINS', cost };

    const px = target.x + target.normal.x;
    const py = target.y + target.normal.y;
    const pz = target.z + target.normal.z;

    // Prevent trapping player inside newly placed block
    const overlapsPlayer =
        px + 1 > lp.x - PLAYER_HALF_W && px < lp.x + PLAYER_HALF_W &&
        py + 1 > lp.y && py < lp.y + PLAYER_HEIGHT &&
        pz + 1 > lp.z - PLAYER_HALF_W && pz < lp.z + PLAYER_HALF_W;

    if (overlapsPlayer) return { error: 'BLOCKED_BY_PLAYER' };

    const change = setBlockAt(px, py, pz, blockId);
    if (change) {
        lp.noteCoins -= cost;
    }
    return { change, cost };
}

export function updatePlayerPhysics(dt) {
    const lp = ncState.localPlayer;
    const keys = ncState.keysHeld;

    // Handle timed creative flight from Architect Chords
    if (lp.flightTimer > 0) {
        lp.flightTimer = Math.max(0, lp.flightTimer - dt);
        lp.isFlying = lp.flightTimer > 0;
    }

    // Horizontal movement input
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

    const speed = lp.isFlying ? FLY_SPEED : WALK_SPEED;
    const sinYaw = Math.sin(lp.yaw);
    const cosYaw = Math.cos(lp.yaw);

    lp.velocity.x = (-sinYaw * forward + cosYaw * strafe) * speed;
    lp.velocity.z = (-cosYaw * forward - sinYaw * strafe) * speed;

    if (lp.isFlying) {
        let vertical = 0;
        if (keys.has('Space')) vertical += 1;
        if (keys.has('ShiftLeft') || keys.has('ShiftRight')) vertical -= 1;
        lp.velocity.y = vertical * FLY_SPEED;
    } else {
        if (keys.has('Space') && lp.isGrounded) {
            lp.velocity.y = JUMP_VELOCITY;
            lp.isGrounded = false;
        }
        lp.velocity.y -= GRAVITY * dt;
    }

    // Resolve X axis
    const nextX = lp.x + lp.velocity.x * dt;
    if (!collidesAABB(nextX, lp.y, lp.z)) {
        lp.x = Math.max(-WORLD_RADIUS + 1, Math.min(WORLD_RADIUS - 1, nextX));
    }

    // Resolve Z axis
    const nextZ = lp.z + lp.velocity.z * dt;
    if (!collidesAABB(lp.x, lp.y, nextZ)) {
        lp.z = Math.max(-WORLD_RADIUS + 1, Math.min(WORLD_RADIUS - 1, nextZ));
    }

    // Resolve Y axis
    const nextY = lp.y + lp.velocity.y * dt;
    if (!collidesAABB(lp.x, nextY, lp.z)) {
        lp.y = nextY;
        lp.isGrounded = false;
    } else {
        if (lp.velocity.y < 0) lp.isGrounded = true;
        lp.velocity.y = 0;
    }

    // Safety floor respawn
    if (lp.y < -5) {
        lp.x = 0; lp.y = 4; lp.z = 6;
        lp.velocity = { x: 0, y: 0, z: 0 };
    }

    // Update target block highlight
    const eyeOrigin = { x: lp.x, y: lp.y + EYE_HEIGHT, z: lp.z };
    const lookDir = getLookDirection(lp.yaw, lp.pitch);
    ncState.targetBlock = raycastVoxel(eyeOrigin, lookDir, 7);
}
