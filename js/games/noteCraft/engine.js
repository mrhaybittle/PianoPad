// js/games/noteCraft/engine.js
import { BLOCKS, BLOCK_COSTS, GRAVITY, PLAYER_EYE_HEIGHT, PLAYER_RADIUS } from './constants.js';
import { ncState } from './state.js';
import { isTeacherBuilder } from './economy.js';
import campusPreset from './campusPreset.js';

export const WORLD_HALF_X = 128; 
export const WORLD_HALF_Z = 96;  

export const CAMPUS_ZONES = [
    { name: 'Centenary Innovation Centre', minX: 4,   maxX: 44,  minZ: 12,  maxZ: 40,  color: '#facc15' },
    { name: 'Indoor Sports Centre',        minX: -48, maxX: -8,  minZ: -16, maxZ: 28,  color: '#ef4444' },
    { name: 'Basketball Courts',           minX: -40, maxX: 0,   minZ: 24,  maxZ: 56,  color: '#f97316' },
    { name: 'Western Sports Field',        minX: -108,maxX: -44, minZ: -52, maxZ: 8,   color: '#4ade80' },
    { name: 'Main Quad & Solar Roofs',     minX: 8,   maxX: 60,  minZ: -52, maxZ: -8,  color: '#38bdf8' },
    { name: 'E4 & Music Wing (G1–G3)',     minX: 60,  maxX: 96,  minZ: -56, maxZ: -20, color: '#c084fc' },
    { name: 'Southern Oval',               minX: 0,   maxX: 68,  minZ: 40,  maxZ: 88,  color: '#22c55e' }
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
    if (x < -WORLD_HALF_X || x >= WORLD_HALF_X || z < -WORLD_HALF_Z || z >= WORLD_HALF_Z) {
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
    if (bx < -WORLD_HALF_X || bx >= WORLD_HALF_X || bz < -WORLD_HALF_Z || bz >= WORLD_HALF_Z) return null;
    if (by < 1 || by >= 23) return null;

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
            return { hit: true, x: bx, y: by, z: bz, blockId, normal: { x: prevBx - bx, y: prevBy - by, z: prevBz - bz } };
        }

        prevBx = bx;
        prevBy = by;
        prevBz = bz;
    }
    return { hit: false };
}

export function pushUndoEntry(changesArray) {
    if (!Array.isArray(ncState.world.undoStack)) ncState.world.undoStack = [];
    ncState.world.undoStack.push(changesArray);
    if (ncState.world.undoStack.length > 50) ncState.world.undoStack.shift();
}

export function breakTargetBlock() {
    const target = ncState.targetBlock;
    if (!target || !target.hit || target.y <= 1) return null; // Protect y=1 floor
    const prevBlockId = getBlockAt(target.x, target.y, target.z);
    const change = setBlockAt(target.x, target.y, target.z, BLOCKS.AIR);
    if (change) {
        pushUndoEntry([{ x: target.x, y: target.y, z: target.z, prevBlockId, refundedCost: 0, change }]);
    }
    return { changes: [change], cost: 0 };
}

// Resolve logical block ID to renderable material ID (Path -> Dirt, Water -> Glass)
function resolveTerrainBlockId(blockId) {
    if (blockId === BLOCKS.PATH) return BLOCKS.DIRT;
    if (blockId === BLOCKS.WATER) return BLOCKS.GLASS;
    return blockId;
}

export function placeSelectedBlock() {
    const target = ncState.targetBlock;
    const lp = ncState.localPlayer;
    if (!target || !target.hit) return null;

    const blockId = lp.inventory[lp.selectedSlot];
    if (!blockId) return null;

    const teacher = isTeacherBuilder();
    const cost = teacher ? 0 : (BLOCK_COSTS[blockId] || 0);
    if (!teacher && lp.noteCoins < cost) return { error: 'INSUFFICIENT_COINS', cost };

    let px = target.x + target.normal.x;
    let py = target.y + target.normal.y;
    let pz = target.z + target.normal.z;
    
    let generatedChanges = [];
    let recordedUndo = [];

    const addBlock = (bx, by, bz, id) => {
        const prev = getBlockAt(bx, by, bz);
        if (prev === id) return; // Skip no-op overwrite
        const c = setBlockAt(bx, by, bz, id);
        if (c) {
            generatedChanges.push(c);
            recordedUndo.push({ x: bx, y: by, z: bz, prevBlockId: prev, refundedCost: 0, change: c });
        }
    };

    const isPrefab = (blockId === BLOCKS.TREE || blockId === BLOCKS.ROCK || blockId === BLOCKS.DRAGON);

    // 1. VOXEL PREFABS (Tree, Rock, Dragon)
    if (isPrefab) {
        if (py < 2) py = 2;
        
        if (blockId === BLOCKS.TREE) {
            for(let i=0; i<4; i++) addBlock(px, py+i, pz, BLOCKS.WOOD);
            for(let x=-2; x<=2; x++) {
                for(let z=-2; z<=2; z++) {
                    if (Math.abs(x)===2 && Math.abs(z)===2) continue;
                    addBlock(px+x, py+3, pz+z, BLOCKS.LEAVES);
                    addBlock(px+x, py+4, pz+z, BLOCKS.LEAVES);
                }
            }
            for(let x=-1; x<=1; x++)
                for(let z=-1; z<=1; z++)
                    if (Math.abs(x)!==1 || Math.abs(z)!==1) addBlock(px+x, py+5, pz+z, BLOCKS.LEAVES);
            addBlock(px, py+6, pz, BLOCKS.LEAVES);
        } 
        else if (blockId === BLOCKS.ROCK) {
            addBlock(px, py, pz, BLOCKS.STONE);
            addBlock(px+1, py, pz, BLOCKS.STONE);
            addBlock(px, py, pz+1, BLOCKS.STONE);
            addBlock(px, py+1, pz, BLOCKS.STONE);
        } 
        else if (blockId === BLOCKS.DRAGON) {
            addBlock(px, py, pz, BLOCKS.WOOD);
            addBlock(px+1, py, pz, BLOCKS.WOOD);
            addBlock(px-1, py, pz, BLOCKS.WOOD);
            addBlock(px-2, py, pz, BLOCKS.DIRT);
            addBlock(px-3, py, pz, BLOCKS.DIRT);
            addBlock(px+2, py, pz, BLOCKS.DIRT);
            addBlock(px+2, py+1, pz, BLOCKS.LEAVES);
            addBlock(px+1, py, pz+1, BLOCKS.DIRT); 
            addBlock(px+1, py, pz-1, BLOCKS.DIRT);
            addBlock(px-1, py, pz+1, BLOCKS.DIRT);
            addBlock(px-1, py, pz-1, BLOCKS.DIRT);
        }
    } 
    // 2. FLAT FLOOR MODE (Applies to EVERY terrain type when ncState.flatMode is ON)
    else if (ncState.flatMode) {
        const renderId = resolveTerrainBlockId(blockId);
        // Replace the targeted block in-place (flush with floor if y===1, or replaces existing surface block)
        addBlock(target.x, target.y, target.z, renderId);
    }
    // 3. STANDARD 3D BLOCK MODE (Applies to EVERY terrain type when ncState.flatMode is OFF)
    else {
        const playerMinY = Math.floor(lp.y);
        const playerMaxY = Math.floor(lp.y + PLAYER_EYE_HEIGHT);
        if (px === Math.floor(lp.x) && pz === Math.floor(lp.z) && py >= playerMinY && py <= playerMaxY) return null;
        
        const renderId = resolveTerrainBlockId(blockId);
        addBlock(px, py, pz, renderId);
    }

    if (generatedChanges.length > 0) {
        if (!teacher) lp.noteCoins -= cost;
        if (recordedUndo.length > 0) {
            recordedUndo[0].refundedCost = cost;
            pushUndoEntry(recordedUndo);
        }
        return { changes: generatedChanges, cost };
    }
    return null;
}

export function undoLastAction() {
    const stack = ncState.world.undoStack;
    if (!Array.isArray(stack) || stack.length === 0) return null;

    const actionSet = stack.pop();
    let syncedChanges = [];
    let totalRefund = 0;

    for (const action of actionSet) {
        const c = setBlockAt(action.x, action.y, action.z, action.prevBlockId);
        if (c) syncedChanges.push(c);
        if (action.refundedCost > 0) totalRefund += action.refundedCost;
    }

    if (totalRefund > 0 && !isTeacherBuilder()) {
        ncState.localPlayer.noteCoins += totalRefund;
    }
    return { changes: syncedChanges, refundedCost: totalRefund, remaining: stack.length };
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
    if (len > 0) { forward /= len; strafe /= len; }

    const speed = lp.isFlying ? 9.5 : 6.0;
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

    const nextX = lp.x + moveX * dt;
    if (!collidesAt(nextX, lp.y + 0.05, lp.z)) {
        lp.x = Math.max(-WORLD_HALF_X + 1, Math.min(WORLD_HALF_X - 1, nextX));
    }

    const nextZ = lp.z + moveZ * dt;
    if (!collidesAt(lp.x, lp.y + 0.05, nextZ)) {
        lp.z = Math.max(-WORLD_HALF_Z + 1, Math.min(WORLD_HALF_Z - 1, nextZ));
    }

    const nextY = lp.y + lp.velocity.y * dt;
    if (collidesAt(lp.x, nextY, lp.z)) {
        if (lp.velocity.y < 0) lp.isGrounded = true;
        lp.velocity.y = 0;
    } else {
        lp.y = nextY;
        lp.isGrounded = false;
    }

    if (lp.y < -5) { lp.x = 12; lp.y = 3; lp.z = 2; lp.velocity.y = 0; }

    ncState.targetBlock = raycastVoxel(8.0);
}
