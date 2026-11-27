// js/games/noteCraft/network.js
import { ncState } from './state.js';

let roomUnsubscribe = null;
let lastPosSyncAt = 0;

function getWorldBasePath(worldId) {
    return `pianopad_tournaments/notecraft_worlds_${worldId || 'school_campus_main'}`;
}

export async function connectNoteCraftNetwork(worldId, localPlayerInfo) {
    disconnectNoteCraftNetwork();
    if (!window.firebaseDb || !window.firebaseRef) return;

    try {
        const { onValue, set, update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const basePath = getWorldBasePath(worldId);

        // 1. Load & listen to persistent campus blocks
        const blocksRef = window.firebaseRef(window.firebaseDb, `${basePath}/blocks`);
        const unsubBlocks = onValue(blocksRef, (snapshot) => {
            if (!ncState.active) return;
            const data = snapshot.val() || {};
            ncState.world.deltas = data;
            ncState.world.dirty = true;
        });

        // 2. Load & listen to creation locks
        const locksRef = window.firebaseRef(window.firebaseDb, `${basePath}/locks`);
        const unsubLocks = onValue(locksRef, (snapshot) => {
            if (!ncState.active) return;
            ncState.world.locks = snapshot.val() || {};
            ncState.world.dirty = true;
        });

        // 3. Register local builder presence (auto-removed on tab close)
        const myPlayerRef = window.firebaseRef(window.firebaseDb, `${basePath}/players/${localPlayerInfo.id}`);
        await set(myPlayerRef, {
            id: localPlayerInfo.id,
            name: localPlayerInfo.name,
            avatar: localPlayerInfo.avatar,
            x: Number(ncState.localPlayer.x.toFixed(2)),
            y: Number(ncState.localPlayer.y.toFixed(2)),
            z: Number(ncState.localPlayer.z.toFixed(2)),
            yaw: Number(ncState.localPlayer.yaw.toFixed(3)),
            updatedAt: Date.now()
        });
        if (window.firebaseOnDisconnect) {
            window.firebaseOnDisconnect(myPlayerRef).remove();
        }

        // 4. Listen to classmate avatars (ignore stale/orphaned records older than 25s)
        const playersRef = window.firebaseRef(window.firebaseDb, `${basePath}/players`);
        const unsubPlayers = onValue(playersRef, (snapshot) => {
            if (!ncState.active) return;
            const allPlayers = snapshot.val() || {};
            const now = Date.now();
            const filtered = {};
            for (const [pid, pObj] of Object.entries(allPlayers)) {
                if (pid === localPlayerInfo.id || !pObj) continue;
                if (pObj.updatedAt && (now - pObj.updatedAt) > 25000) continue;
                filtered[pid] = pObj;
            }
            ncState.remotePlayers = filtered;
        });

        // 5. Periodic position broadcast (8 Hz)
        ncState.syncIntervalId = setInterval(() => {
            if (!ncState.active || !window.firebaseDb) return;
            const now = performance.now();
            if (now - lastPosSyncAt < 110) return;
            lastPosSyncAt = now;

            const lp = ncState.localPlayer;
            update(myPlayerRef, {
                x: Number(lp.x.toFixed(2)),
                y: Number(lp.y.toFixed(2)),
                z: Number(lp.z.toFixed(2)),
                yaw: Number(lp.yaw.toFixed(3)),
                updatedAt: Date.now()
            }).catch(() => {});
        }, 125);

        roomUnsubscribe = () => {
            unsubBlocks();
            unsubLocks();
            unsubPlayers();
            if (window.firebaseDb && window.firebaseRef) {
                set(myPlayerRef, null).catch(() => {});
            }
        };
    } catch (err) {
        console.warn('NoteCraft Firebase sync unavailable, running in local offline sandbox:', err);
    }
}

export async function clearRemoteBuilders() {
    ncState.remotePlayers = {};
    if (!window.firebaseDb || !window.firebaseRef) return;
    try {
        const { set } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const basePath = getWorldBasePath(ncState.worldId);
        const playersRef = window.firebaseRef(window.firebaseDb, `${basePath}/players`);
        const lp = ncState.localPlayer;
        await set(playersRef, {
            [lp.id]: {
                id: lp.id,
                name: lp.name,
                avatar: lp.avatar,
                x: Number(lp.x.toFixed(2)),
                y: Number(lp.y.toFixed(2)),
                z: Number(lp.z.toFixed(2)),
                yaw: Number(lp.yaw.toFixed(3)),
                updatedAt: Date.now()
            }
        });
    } catch (err) {
        console.warn('Could not purge remote builders:', err);
    }
}

export async function syncBlockChange(change) {
    if (!change || !window.firebaseDb || !window.firebaseRef) return;
    try {
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const basePath = getWorldBasePath(ncState.worldId);
        const blocksRef = window.firebaseRef(window.firebaseDb, `${basePath}/blocks`);
        await update(blocksRef, { [change.key]: change.blockId });
    } catch (err) {
        console.warn('Block sync error:', err);
    }
}

export async function syncLockUpdates(updatedLocks) {
    if (!Array.isArray(updatedLocks) || updatedLocks.length === 0) return;
    if (!window.firebaseDb || !window.firebaseRef) return;
    try {
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const basePath = getWorldBasePath(ncState.worldId);
        const locksRef = window.firebaseRef(window.firebaseDb, `${basePath}/locks`);
        const payload = {};
        for (const item of updatedLocks) {
            payload[item.key] = item.lockData;
        }
        await update(locksRef, payload);
    } catch (err) {
        console.warn('Lock sync error:', err);
    }
}

export async function saveStudentWallet(studentName) {
    if (!studentName || !window.firebaseDb || !window.firebaseRef) return;
    try {
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const safeKey = String(studentName).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        const walletRef = window.firebaseRef(window.firebaseDb, `pianopad_notecraft_wallets/${safeKey}`);
        await update(walletRef, {
            noteCoins: ncState.localPlayer.noteCoins,
            masteredSongs: ncState.localPlayer.masteredSongs,
            unlockedCreatures: ncState.localPlayer.unlockedCreatures || [],
            updatedAt: Date.now()
        });
    } catch (err) {}
}

export function disconnectNoteCraftNetwork() {
    if (ncState.syncIntervalId !== null) {
        clearInterval(ncState.syncIntervalId);
        ncState.syncIntervalId = null;
    }
    if (typeof roomUnsubscribe === 'function') {
        roomUnsubscribe();
        roomUnsubscribe = null;
    }
    ncState.remotePlayers = {};
}
