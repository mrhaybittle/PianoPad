// js/games/noteCraft/engine.js
import { BLOCKS, BLOCK_COSTS, GRAVITY, PLAYER_EYE_HEIGHT, PLAYER_RADIUS } from './constants.js';
import { ncState } from './state.js';
import { isTeacherBuilder, isCreatureChallengeCompleted, CREATURE_CHALLENGES } from './economy.js';
import campusPreset from './campusPreset.js';

export const WORLD_HALF_X = 128;
export const WORLD_HALF_Z = 96;
export const MAX_BRUSH_SPAN = 512;

const EXPLOSION_RADIUS = 3;
const EXPLOSION_FUSE_MS = 5000;

export const CAMPUS_ZONES = [
    { name: 'Centenary Innovation Centre', minX: 4,   maxX: 44,  minZ: 12,  maxZ: 40,  color: '#facc15' },
    { name: 'Indoor Sports Centre',        minX: -48, maxX: -8,  minZ: -16, maxZ: 28,  color: '#ef4444' },
    { name: 'Basketball Courts',           minX: -40, maxX: 0,   minZ: 24,  maxZ: 56,  color: '#f97316' },
    { name: 'Western Sports Field',        minX: -108,maxX: -44, minZ: -52, maxZ: 8,   color: '#4ade80' },
    { name: 'Main Quad & Solar Roofs',     minX: 8,   maxX: 60,  minZ: -52, maxZ: -8,  color: '#38bdf8' },
    { name: 'E4 & Music Wing (G1–G3)',     minX: 60,  maxX: 96,  minZ: -56, maxZ: -20, color: '#c084fc' },
    { name: 'Southern Oval',               minX: 0,   maxX: 68,  minZ: 40,  maxZ: 88,  color: '#22c55e' }
];

export function getCoordKey(x, y, z) {
    return `${Math.floor(x)}_${Math.floor(y)}_${Math.floor(z)}`;
}

export function isBlockLocked(x, y, z) {
    const locks = ncState.world && ncState.world.locks ? ncState.world.locks : {};
    return Boolean(locks[getCoordKey(x, y, z)]);
}

export function toggleLockOnTargetOrLastBuild() {
    if (!ncState.world.locks) ncState.world.locks = {};
    const lp = ncState.localPlayer;
    const teacher = isTeacherBuilder();
    const target = ncState.targetBlock;
    const updatedLocks = [];

    if (target && target.hit && target.y > 1) {
        const key = getCoordKey(target.x, target.y, target.z);
        const existing = ncState.world.locks[key];
        if (existing && existing.ownerId && existing.ownerId !== lp.id && !teacher) {
            return { error: 'NOT_OWNER', ownerName: existing.ownerName || 'another builder' };
        }
        if (existing) {
            delete ncState.world.locks[key];
            updatedLocks.push({ key, lockData: null });
            return { locked: false, count: 1, updatedLocks };
        } else {
            const lockData = {
                ownerId: lp.id,
                ownerName: lp.name || 'Builder',
                lockedAt: Date.now()
            };
            ncState.world.locks[key] = lockData;
            updatedLocks.push({ key, lockData });
            return { locked: true, count: 1, updatedLocks };
        }
    }

    const stack = ncState.world.undoStack || [];
    const lastBatch = stack[stack.length - 1];
    if (!Array.isArray(lastBatch) || lastBatch.length === 0) {
        return { error: 'NO_TARGET_OR_BUILD' };
    }

    let anyUnlocked = false;
    for (const item of lastBatch) {
        if (item.y <= 1) continue;
        const k = getCoordKey(item.x, item.y, item.z);
        const ex = ncState.world.locks[k];
        if (!ex) {
            anyUnlocked = true;
            break;
        }
    }

    for (const item of lastBatch) {
        if (item.y <= 1) continue;
        const k = getCoordKey(item.x, item.y, item.z);
        const ex = ncState.world.locks[k];
        if (anyUnlocked) {
            if (!ex) {
                const lockData = {
                    ownerId: lp.id,
                    ownerName: lp.name || 'Builder',
                    lockedAt: Date.now()
                };
                ncState.world.locks[k] = lockData;
                updatedLocks.push({ key: k, lockData });
            }
        } else if (ex && (ex.ownerId === lp.id || teacher)) {
            delete ncState.world.locks[k];
            updatedLocks.push({ key: k, lockData: null });
        }
    }

    return { locked: anyUnlocked, count: updatedLocks.length, updatedLocks };
}

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
    const presetBlock = campusPreset.getCampusBlockAt(x, y, z);
    if (presetBlock !== undefined) return presetBlock;

    if (y === 0) return BLOCKS.DIRT;
    if (y === 1) return BLOCKS.GRASS;
    return BLOCKS.AIR;
}

export function getBlockAt(x, y, z) {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (by < 0 || by >= 24) return BLOCKS.AIR;

    const key = getCoordKey(bx, by, bz);
    if (Object.prototype.hasOwnProperty.call(ncState.world.deltas, key)) {
        return ncState.world.deltas[key];
    }
    return getBaseTerrainBlock(bx, by, bz);
}

export function setBlockAt(x, y, z, blockId, options = {}) {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (bx < -WORLD_HALF_X || bx >= WORLD_HALF_X || bz < -WORLD_HALF_Z || bz >= WORLD_HALF_Z) return null;
    if (by < 1 || by >= 23) return null;

    const key = getCoordKey(bx, by, bz);
    if (!options.ignoreLocks && isBlockLocked(bx, by, bz) && !isTeacherBuilder()) {
        return null;
    }

    ncState.world.deltas[key] = blockId;
    if (!options.ignoreLocks && blockId === BLOCKS.AIR && ncState.world.locks && ncState.world.locks[key]) {
        delete ncState.world.locks[key];
    }
    ncState.world.dirty = true;
    return { key, x: bx, y: by, z: bz, blockId };
}

export function isBlockSolid(blockId) {
    return blockId !== BLOCKS.AIR &&
           blockId !== BLOCKS.FIRE &&
           blockId !== undefined &&
           blockId !== null;
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
    const teacher = isTeacherBuilder();
    const lockInfo = ncState.world.locks ? ncState.world.locks[getCoordKey(target.x, target.y, target.z)] : null;
    if (lockInfo && !teacher) {
        return { error: 'LOCKED_BLOCK', ownerName: lockInfo.ownerName || 'a builder' };
    }
    const prevBlockId = getBlockAt(target.x, target.y, target.z);
    const change = setBlockAt(target.x, target.y, target.z, BLOCKS.AIR);
    if (!change) return null;
    pushUndoEntry([{ x: target.x, y: target.y, z: target.z, prevBlockId, refundedCost: 0, change }]);
    return { changes: [change], cost: 0 };
}

function resolveTerrainBlockId(blockId) {
    if (blockId === BLOCKS.PATH) return BLOCKS.DIRT;
    if (blockId === BLOCKS.WATER) return BLOCKS.GLASS;
    if (blockId === BLOCKS.TNT) return BLOCKS.BRICK;
    return blockId;
}

function scheduleTntFuse(x, y, z) {
    if (!Array.isArray(ncState.activeExplosions)) ncState.activeExplosions = [];
    const now = performance.now();
    ncState.activeExplosions.push({
        id: `tnt_${x}_${y}_${z}_${now}_${Math.random().toString(36).slice(2, 6)}`,
        x,
        y,
        z,
        placedAt: now,
        explodeAt: now + EXPLOSION_FUSE_MS
    });
}

function detonateExplosion(exp) {
    const changes = [];
    const radiusSq = EXPLOSION_RADIUS * EXPLOSION_RADIUS;

    if (exp.y > 1 && getBlockAt(exp.x, exp.y, exp.z) !== BLOCKS.AIR) {
        const selfClear = setBlockAt(exp.x, exp.y, exp.z, BLOCKS.AIR);
        if (selfClear) changes.push(selfClear);
    }

    for (let dx = -EXPLOSION_RADIUS; dx <= EXPLOSION_RADIUS; dx++) {
        for (let dy = -EXPLOSION_RADIUS; dy <= EXPLOSION_RADIUS; dy++) {
            for (let dz = -EXPLOSION_RADIUS; dz <= EXPLOSION_RADIUS; dz++) {
                if (dx * dx + dy * dy + dz * dz > radiusSq) continue;

                const bx = exp.x + dx;
                const by = exp.y + dy;
                const bz = exp.z + dz;

                if (by <= 1) continue;
                if (isBlockLocked(bx, by, bz) && !isTeacherBuilder()) continue;
                if (getBlockAt(bx, by, bz) === BLOCKS.AIR) continue;

                const cleared = setBlockAt(bx, by, bz, BLOCKS.AIR);
                if (cleared) changes.push(cleared);
            }
        }
    }

    return changes;
}

export function updateExplosions(now, onBlockChanged) {
    if (!Array.isArray(ncState.activeExplosions) || ncState.activeExplosions.length === 0) return;

    const remaining = [];
    for (const exp of ncState.activeExplosions) {
        if (now >= exp.explodeAt) {
            const changes = detonateExplosion(exp);
            if (typeof onBlockChanged === 'function') {
                changes.forEach(c => { if (c) onBlockChanged(c); });
            }
        } else {
            remaining.push(exp);
        }
    }
    ncState.activeExplosions = remaining;
}

function computeLinePoints(a, b) {
    const points = [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz), 1);
    const seen = new Set();
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(a.x + dx * t);
        const y = Math.round(a.y + dy * t);
        const z = Math.round(a.z + dz * t);
        const k = `${x}_${y}_${z}`;
        if (!seen.has(k)) {
            seen.add(k);
            points.push({ x, y, z });
        }
    }
    return points;
}

function computeSpanCoords(mode, anchor, endPt, yaw, flatMode) {
    const minX = Math.min(anchor.x, endPt.x);
    const maxX = Math.max(anchor.x, endPt.x);
    const minY = Math.max(2, Math.min(anchor.y, endPt.y));
    const maxY = Math.max(minY, Math.max(anchor.y, endPt.y));
    const minZ = Math.min(anchor.z, endPt.z);
    const maxZ = Math.max(anchor.z, endPt.z);

    if (mode === 'line') {
        return computeLinePoints(
            { x: anchor.x, y: Math.max(2, anchor.y), z: anchor.z },
            { x: endPt.x, y: Math.max(2, endPt.y), z: endPt.z }
        );
    }

    if (mode === 'wall') {
        const coords = [];
        const spanX = maxX - minX;
        const spanZ = maxZ - minZ;
        const alongX = spanX === spanZ ? Math.abs(Math.cos(yaw)) >= Math.abs(Math.sin(yaw)) : spanX >= spanZ;
        for (let y = minY; y <= maxY; y++) {
            if (alongX) {
                for (let x = minX; x <= maxX; x++) coords.push({ x, y, z: anchor.z });
            } else {
                for (let z = minZ; z <= maxZ; z++) coords.push({ x: anchor.x, y, z });
            }
        }
        return coords;
    }

    if (mode === 'fill') {
        const coords = [];
        const yStart = flatMode ? Math.max(2, endPt.y) : minY;
        const yEnd = flatMode ? yStart : maxY;
        for (let x = minX; x <= maxX; x++) {
            for (let y = yStart; y <= yEnd; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    coords.push({ x, y, z });
                }
            }
        }
        return coords;
    }

    return [endPt];
}

function spawnCreatureEntity(blockId, x, y, z) {
    if (!Array.isArray(ncState.creatures)) ncState.creatures = [];
    const challenge = CREATURE_CHALLENGES[blockId];
    ncState.creatures.push({
        id: `creature_${blockId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        blockId,
        name: challenge ? challenge.name : 'Creature',
        baseX: x + 0.5,
        baseY: y + 1.2,
        baseZ: z + 0.5,
        x: x + 0.5,
        y: y + 1.2,
        z: z + 0.5,
        yaw: 0,
        phase: Math.random() * Math.PI * 2
    });
}

export function updateCreatures(dt, now = performance.now()) {
    if (!Array.isArray(ncState.creatures) || ncState.creatures.length === 0) return;
    for (const c of ncState.creatures) {
        c.phase += dt * 2.2;
        const radius = 2.2;
        c.x = c.baseX + Math.cos(c.phase * 0.65) * radius;
        c.z = c.baseZ + Math.sin(c.phase * 0.65) * radius;
        c.y = c.baseY + Math.sin(c.phase * 1.8) * 0.35;
        c.yaw = -c.phase * 0.65 + Math.PI / 2;
    }
    void now;
}

export function fireGrappleGun(maxRange = 32.0) {
    if (ncState.grapple && ncState.grapple.active) {
        ncState.grapple.active = false;
        ncState.grapple.anchor = null;
        return { detached: true };
    }

    const hit = raycastVoxel(maxRange);
    if (!hit || !hit.hit) {
        return { error: 'NO_TARGET' };
    }

    const lp = ncState.localPlayer;
    const anchor = {
        x: hit.x + 0.5 + hit.normal.x * 0.45,
        y: hit.y + 0.5 + hit.normal.y * 0.45,
        z: hit.z + 0.5 + hit.normal.z * 0.45
    };
    const dist = Math.hypot(anchor.x - lp.x, anchor.y - (lp.y + PLAYER_EYE_HEIGHT), anchor.z - lp.z);
    if (dist < 1.8) return { error: 'TOO_CLOSE' };

    ncState.grapple = {
        active: true,
        anchor,
        ropeLength: dist,
        ziplineSpeed: 14.5
    };
    lp.isGrounded = false;
    return { attached: true, anchor, dist };
}

export function detachGrappleGun(jumpBoost = false) {
    if (!ncState.grapple || !ncState.grapple.active) return;
    ncState.grapple.active = false;
    ncState.grapple.anchor = null;
    if (jumpBoost) {
        ncState.localPlayer.velocity.y = 8.2;
    }
}

export function placeSelectedBlock() {
    const target = ncState.targetBlock;
    const lp = ncState.localPlayer;
    if (!target || !target.hit) return null;

    const blockId = lp.inventory[lp.selectedSlot];
    if (!blockId) return null;

    if (CREATURE_CHALLENGES[blockId] && !isCreatureChallengeCompleted(blockId) && !isTeacherBuilder()) {
        return { error: 'CHALLENGE_LOCKED', challenge: CREATURE_CHALLENGES[blockId] };
    }

    const teacher = isTeacherBuilder();
    const unitCost = teacher ? 0 : (BLOCK_COSTS[blockId] || 0);

    let px = target.x + target.normal.x;
    let py = target.y + target.normal.y;
    let pz = target.z + target.normal.z;

    const brushMode = ncState.brushMode || 'single';
    const isPrefab = (blockId === BLOCKS.TREE || blockId === BLOCKS.ROCK || blockId === BLOCKS.DRAGON);

    if (!isPrefab && brushMode !== 'single') {
        const endPt = ncState.flatMode ? { x: target.x, y: Math.max(2, target.y), z: target.z } : { x: px, y: Math.max(2, py), z: pz };
        if (!ncState.brushAnchor) {
            ncState.brushAnchor = endPt;
            return { anchorSet: true, mode: brushMode, anchor: endPt };
        }

        const anchorPt = ncState.brushAnchor;
        ncState.brushAnchor = null;
        const spanCoords = computeSpanCoords(brushMode, anchorPt, endPt, lp.yaw, ncState.flatMode);
        if (spanCoords.length > MAX_BRUSH_SPAN) {
            return { error: 'BRUSH_TOO_LARGE', count: spanCoords.length, max: MAX_BRUSH_SPAN };
        }

        const renderId = resolveTerrainBlockId(blockId);
        const candidates = [];
        for (const pt of spanCoords) {
            const prev = getBlockAt(pt.x, pt.y, pt.z);
            if (prev === renderId) continue;
            if (isBlockLocked(pt.x, pt.y, pt.z) && !teacher) continue;
            candidates.push({ x: pt.x, y: pt.y, z: pt.z, prev });
        }

        const totalCost = teacher ? 0 : unitCost * candidates.length;
        if (!teacher && lp.noteCoins < totalCost) {
            return { error: 'INSUFFICIENT_COINS', cost: totalCost };
        }

        const generatedChanges = [];
        const recordedUndo = [];
        for (const item of candidates) {
            const c = setBlockAt(item.x, item.y, item.z, renderId);
            if (c) {
                generatedChanges.push(c);
                recordedUndo.push({ x: item.x, y: item.y, z: item.z, prevBlockId: item.prev, refundedCost: 0, change: c });
                if (blockId === BLOCKS.TNT) scheduleTntFuse(item.x, item.y, item.z);
            }
        }

        if (generatedChanges.length > 0) {
            if (!teacher) lp.noteCoins -= totalCost;
            if (recordedUndo.length > 0) {
                recordedUndo[0].refundedCost = totalCost;
                pushUndoEntry(recordedUndo);
            }
            return { changes: generatedChanges, cost: totalCost, brushMode };
        }
        return null;
    }

    if (!teacher && lp.noteCoins < unitCost) return { error: 'INSUFFICIENT_COINS', cost: unitCost };

    let generatedChanges = [];
    let recordedUndo = [];

    const addBlock = (bx, by, bz, id) => {
        const prev = getBlockAt(bx, by, bz);
        if (prev === id) return;
        const c = setBlockAt(bx, by, bz, id);
        if (c) {
            generatedChanges.push(c);
            recordedUndo.push({ x: bx, y: by, z: bz, prevBlockId: prev, refundedCost: 0, change: c });
        }
    };

    if (isPrefab) {
        if (py < 2) py = 2;

        if (blockId === BLOCKS.TREE) {
            for (let i = 0; i < 4; i++) addBlock(px, py + i, pz, BLOCKS.WOOD);
            for (let x = -2; x <= 2; x++) {
                for (let z = -2; z <= 2; z++) {
                    if (Math.abs(x) === 2 && Math.abs(z) === 2) continue;
                    addBlock(px + x, py + 3, pz + z, BLOCKS.LEAVES);
                    addBlock(px + x, py + 4, pz + z, BLOCKS.LEAVES);
                }
            }
            for (let x = -1; x <= 1; x++)
                for (let z = -1; z <= 1; z++)
                    if (Math.abs(x) !== 1 || Math.abs(z) !== 1) addBlock(px + x, py + 5, pz + z, BLOCKS.LEAVES);
            addBlock(px, py + 6, pz, BLOCKS.LEAVES);
        }
        else if (blockId === BLOCKS.ROCK) {
            addBlock(px, py, pz, BLOCKS.STONE);
            addBlock(px + 1, py, pz, BLOCKS.STONE);
            addBlock(px, py, pz + 1, BLOCKS.STONE);
            addBlock(px, py + 1, pz, BLOCKS.STONE);
        }
        else if (blockId === BLOCKS.DRAGON) {
            addBlock(px, py, pz, BLOCKS.WOOD);
            addBlock(px + 1, py, pz, BLOCKS.WOOD);
            addBlock(px - 1, py, pz, BLOCKS.WOOD);
            addBlock(px - 2, py, pz, BLOCKS.DIRT);
            addBlock(px - 3, py, pz, BLOCKS.DIRT);
            addBlock(px + 2, py, pz, BLOCKS.DIRT);
            addBlock(px + 2, py + 1, pz, BLOCKS.LEAVES);
            addBlock(px + 1, py, pz + 1, BLOCKS.DIRT);
            addBlock(px + 1, py, pz - 1, BLOCKS.DIRT);
            addBlock(px - 1, py, pz + 1, BLOCKS.DIRT);
            addBlock(px - 1, py, pz - 1, BLOCKS.DIRT);
            spawnCreatureEntity(BLOCKS.DRAGON, px, py, pz);
        }
    }
    else if (ncState.flatMode) {
        const renderId = resolveTerrainBlockId(blockId);
        addBlock(target.x, target.y, target.z, renderId);
        if (blockId === BLOCKS.TNT) scheduleTntFuse(target.x, target.y, target.z);
    }
    else {
        const playerMinY = Math.floor(lp.y);
        const playerMaxY = Math.floor(lp.y + PLAYER_EYE_HEIGHT);
        if (px === Math.floor(lp.x) && pz === Math.floor(lp.z) && py >= playerMinY && py <= playerMaxY) return null;

        const renderId = resolveTerrainBlockId(blockId);
        addBlock(px, py, pz, renderId);
        if (blockId === BLOCKS.TNT) scheduleTntFuse(px, py, pz);
    }

    if (generatedChanges.length > 0) {
        if (!teacher) lp.noteCoins -= unitCost;
        if (recordedUndo.length > 0) {
            recordedUndo[0].refundedCost = unitCost;
            pushUndoEntry(recordedUndo);
        }
        return { changes: generatedChanges, cost: unitCost };
    }
    return null;
}

export function undoLastAction() {
    const stack = ncState.world.undoStack;
    if (!Array.isArray(stack) || stack.length === 0) return null;

    const actionSet = stack.pop();
    const teacher = isTeacherBuilder();
    let syncedChanges = [];
    let totalRefund = 0;

    for (const action of actionSet) {
        if (isBlockLocked(action.x, action.y, action.z) && !teacher) continue;
        const c = setBlockAt(action.x, action.y, action.z, action.prevBlockId);
        if (c) syncedChanges.push(c);
        if (action.refundedCost > 0) totalRefund += action.refundedCost;
    }

    if (totalRefund > 0 && !teacher && syncedChanges.length > 0) {
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
    if (lp.speedBoostTimer > 0) {
        lp.speedBoostTimer = Math.max(0, lp.speedBoostTimer - dt);
    }

    // 1. Grapple Gun / Flying Fox Zipline Movement
    if (ncState.grapple && ncState.grapple.active && ncState.grapple.anchor) {
        const a = ncState.grapple.anchor;
        const dx = a.x - lp.x;
        const dy = (a.y - 1.1) - lp.y;
        const dz = a.z - lp.z;
        const dist = Math.hypot(dx, dy, dz);

        if (keys.has('Space')) {
            detachGrappleGun(true);
        } else if (dist <= 1.45) {
            detachGrappleGun(false);
            lp.velocity.y = 3.0;
        } else {
            const speed = ncState.grapple.ziplineSpeed || 14.5;
            const stepX = (dx / dist) * speed * dt;
            const stepY = (dy / dist) * speed * dt;
            const stepZ = (dz / dist) * speed * dt;

            if (!collidesAt(lp.x + stepX, lp.y + 0.05, lp.z)) {
                lp.x = Math.max(-WORLD_HALF_X + 1, Math.min(WORLD_HALF_X - 1, lp.x + stepX));
            }
            if (!collidesAt(lp.x, lp.y + 0.05, lp.z + stepZ)) {
                lp.z = Math.max(-WORLD_HALF_Z + 1, Math.min(WORLD_HALF_Z - 1, lp.z + stepZ));
            }
            if (!collidesAt(lp.x, lp.y + stepY, lp.z)) {
                lp.y += stepY;
            } else {
                detachGrappleGun(false);
            }
            lp.velocity.y = 0;
            ncState.targetBlock = raycastVoxel(8.0);
            return;
        }
    }

    // 2. Check block directly beneath player's feet
    const footBlock = getBlockAt(Math.floor(lp.x), Math.floor(lp.y - 0.12), Math.floor(lp.z));
    if (footBlock === BLOCKS.SPEED_STRIP) {
        lp.speedBoostTimer = 1.5;
    }

    let forward = 0;
    let strafe = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;

    const len = Math.hypot(forward, strafe);
    if (len > 0) { forward /= len; strafe /= len; }

    let speed = lp.isFlying ? 9.5 : 6.0;
    if (lp.speedBoostTimer > 0) speed *= 2.15;

    const sinY = Math.sin(lp.yaw);
    const cosY = Math.cos(lp.yaw);

    let moveX = (-sinY * forward + cosY * strafe) * speed;
    let moveZ = (-cosY * forward - sinY * strafe) * speed;

    // 3. Sliding Ramp Block Mechanics (ice momentum + downhill slope acceleration)
    if (!lp.slideMomentum) lp.slideMomentum = { x: 0, z: 0 };
    if (footBlock === BLOCKS.SLIDE_BLOCK && lp.isGrounded) {
        lp.slideMomentum.x = lp.slideMomentum.x * 0.92 + moveX * 0.14;
        lp.slideMomentum.z = lp.slideMomentum.z * 0.92 + moveZ * 0.14;

        const bx = Math.floor(lp.x);
        const by = Math.floor(lp.y - 0.12);
        const bz = Math.floor(lp.z);
        const slopeAccel = 18.0 * dt;
        if (getBlockAt(bx + 1, by - 1, bz) === BLOCKS.SLIDE_BLOCK) lp.slideMomentum.x += slopeAccel;
        if (getBlockAt(bx - 1, by - 1, bz) === BLOCKS.SLIDE_BLOCK) lp.slideMomentum.x -= slopeAccel;
        if (getBlockAt(bx, by - 1, bz + 1) === BLOCKS.SLIDE_BLOCK) lp.slideMomentum.z += slopeAccel;
        if (getBlockAt(bx, by - 1, bz - 1) === BLOCKS.SLIDE_BLOCK) lp.slideMomentum.z -= slopeAccel;

        moveX = lp.slideMomentum.x;
        moveZ = lp.slideMomentum.z;
    } else {
        lp.slideMomentum.x *= 0.75;
        lp.slideMomentum.z *= 0.75;
    }

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
    } else {
        lp.slideMomentum.x = 0;
    }

    const nextZ = lp.z + moveZ * dt;
    if (!collidesAt(lp.x, lp.y + 0.05, nextZ)) {
        lp.z = Math.max(-WORLD_HALF_Z + 1, Math.min(WORLD_HALF_Z - 1, nextZ));
    } else {
        lp.slideMomentum.z = 0;
    }

    const preImpactVy = lp.velocity.y;
    const nextY = lp.y + lp.velocity.y * dt;
    if (collidesAt(lp.x, nextY, lp.z)) {
        if (preImpactVy < 0) {
            const landedBlock = getBlockAt(Math.floor(lp.x), Math.floor(nextY), Math.floor(lp.z));
            if (landedBlock === BLOCKS.JUMP_PAD) {
                lp.velocity.y = 16.5;
                lp.isGrounded = false;
            } else if (landedBlock === BLOCKS.BOUNCE_BLOCK) {
                const rebound = Math.min(18.0, Math.max(9.5, Math.abs(preImpactVy) * 0.92));
                lp.velocity.y = rebound;
                lp.isGrounded = false;
            } else {
                lp.isGrounded = true;
                lp.velocity.y = 0;
            }
        } else {
            lp.velocity.y = 0;
        }
    } else {
        lp.y = nextY;
        lp.isGrounded = false;
    }

    if (lp.y < -5) {
        lp.x = 12; lp.y = 3; lp.z = 2;
        lp.velocity.y = 0;
        detachGrappleGun(false);
    }

    ncState.targetBlock = raycastVoxel(8.0);
}
