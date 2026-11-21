// js/games/noteCraft/network.js
import { ncState } from './state.js';
import { updateInventory } from './economy.js';

let worldBlocksUnsub = null;
let worldPlayersUnsub = null;
let activeWorldPath = null;
let activeWalletPath = null;

function sanitizeFirebaseKey(str) {
    return String(str || 'Student')
        .trim()
        .replace(/[.#$\[\]\/]/g, '_')
        .replace(/\s+/g, '_')
        .toLowerCase();
}

export async function connectNoteCraftNetwork(worldId, playerMeta) {
    disconnectNoteCraftNetwork();

    if (!window.firebaseDb || !window.firebaseRef) {
        if (ncState.localPlayer.noteCoins <= 0) ncState.localPlayer.noteCoins = 150;
        updateInventory();
        return;
    }

    const { onValue, update, get } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");

    const cleanWorldId = sanitizeFirebaseKey(worldId || 'school_campus_main');
    const studentKey = sanitizeFirebaseKey(playerMeta.name || playerMeta.id);

    // Stored inside pianopad_tournaments so existing Firebase security rules allow read/write
    activeWorldPath = `pianopad_tournaments/notecraft_worlds_${cleanWorldId}`;
    activeWalletPath = `pianopad_tournaments/notecraft_wallets/${studentKey}`;

    // 1. Load persistent student wallet (NoteCoins + Mastered Songs)
    try {
        const walletRef = window.firebaseRef(window.firebaseDb, activeWalletPath);
        const snap = await get(walletRef);
        const walletData = snap.val();

        if (walletData) {
            ncState.localPlayer.noteCoins = Number(walletData.noteCoins || 0);
            ncState.localPlayer.masteredSongs = Array.isArray(walletData.masteredSongs)
                ? walletData.masteredSongs
                : Object.values(walletData.masteredSongs || {});
        } else {
            ncState.localPlayer.noteCoins = 150;
            ncState.localPlayer.masteredSongs = [];
            await window.firebaseSet(walletRef, {
                name: playerMeta.name || 'Student',
                noteCoins: 150,
                masteredSongs: [],
                updatedAt: Date.now()
            });
        }
    } catch (e) {
        console.warn("Wallet sync fallback:", e);
        if (ncState.localPlayer.noteCoins <= 0) ncState.localPlayer.noteCoins = 150;
    }
    updateInventory();

    // 2. Subscribe to persistent shared school world blocks
    try {
        const blocksRef = window.firebaseRef(window.firebaseDb, `${activeWorldPath}/blocks`);
        worldBlocksUnsub = onValue(blocksRef, (snapshot) => {
            const serverBlocks = snapshot.val() || {};
            ncState.world.deltas = serverBlocks;
            ncState.world.dirty = true;
        });

        // 3. Register local player presence & auto-cleanup on disconnect
        const myPlayerRef = window.firebaseRef(window.firebaseDb, `${activeWorldPath}/players/${playerMeta.id}`);
        await window.firebaseSet(myPlayerRef, {
            id: playerMeta.id,
            name: playerMeta.name || 'Builder',
            avatar: playerMeta.avatar || '🏃',
            x: Number(ncState.localPlayer.x.toFixed(2)),
            y: Number(ncState.localPlayer.y.toFixed(2)),
            z: Number(ncState.localPlayer.z.toFixed(2)),
            yaw: Number(ncState.localPlayer.yaw.toFixed(3)),
            isFlying: false,
            lastSeen: Date.now()
        });
        if (window.firebaseOnDisconnect) {
            window.firebaseOnDisconnect(myPlayerRef).remove();
        }

        // 4. Listen for classmates moving around the school campus
        const playersRef = window.firebaseRef(window.firebaseDb, `${activeWorldPath}/players`);
        worldPlayersUnsub = onValue(playersRef, (snapshot) => {
            const allPlayers = snapshot.val() || {};
            const now = Date.now();
            const filtered = {};
            for (const [pid, pData] of Object.entries(allPlayers)) {
                if (pid === playerMeta.id || !pData) continue;
                if (pData.lastSeen && (now - pData.lastSeen) > 45000) continue;
                filtered[pid] = pData;
            }
            ncState.remotePlayers = filtered;
        });

        // 5. Periodic position broadcast
        ncState.syncIntervalId = setInterval(() => {
            if (!window.firebaseDb || !activeWorldPath) return;
            const lp = ncState.localPlayer;
            update(myPlayerRef, {
                x: Number(lp.x.toFixed(2)),
                y: Number(lp.y.toFixed(2)),
                z: Number(lp.z.toFixed(2)),
                yaw: Number(lp.yaw.toFixed(3)),
                isFlying: Boolean(lp.isFlying),
                lastSeen: Date.now()
            }).catch(() => {});
        }, 150);
    } catch (e) {
        console.warn("NoteCraft multiplayer sync notice:", e);
    }
}

export async function syncBlockChange(change) {
    if (!change || !window.firebaseDb || !activeWorldPath) return;
    try {
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const blocksRef = window.firebaseRef(window.firebaseDb, `${activeWorldPath}/blocks`);
        await update(blocksRef, {
            [change.key]: change.blockId
        });
    } catch (e) {
        console.warn("Block sync error:", e);
    }
}

export async function saveStudentWallet(studentName) {
    if (!window.firebaseDb) return;
    const path = activeWalletPath || `pianopad_tournaments/notecraft_wallets/${sanitizeFirebaseKey(studentName)}`;
    try {
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const walletRef = window.firebaseRef(window.firebaseDb, path);
        await update(walletRef, {
            name: studentName || 'Student',
            noteCoins: ncState.localPlayer.noteCoins,
            masteredSongs: ncState.localPlayer.masteredSongs,
            updatedAt: Date.now()
        });
    } catch (e) {
        console.warn("Wallet save error:", e);
    }
}

export function disconnectNoteCraftNetwork() {
    if (ncState.syncIntervalId !== null) {
        clearInterval(ncState.syncIntervalId);
        ncState.syncIntervalId = null;
    }
    if (worldBlocksUnsub) {
        worldBlocksUnsub();
        worldBlocksUnsub = null;
    }
    if (worldPlayersUnsub) {
        worldPlayersUnsub();
        worldPlayersUnsub = null;
    }
    ncState.remotePlayers = {};
    activeWorldPath = null;
}
