// js/games/noteCraft/economy.js
import { BLOCKS, COIN_REWARDS, UNLOCK_THRESHOLDS } from './constants.js';
import { ncState } from './state.js';

export const CREATURE_CHALLENGES = {
    [BLOCKS.DRAGON]: {
        id: 'dragon',
        name: 'Campus Dragon',
        songTitle: 'Star Wars - Cantina Theme (Simplified)',
        difficulty: 'Hard',
        first8Notes: ['A2', 'D3', 'A2', 'D3', 'A2', 'D3', 'A2', 'G#2']
    }
};

export function normalizeNoteToken(noteStr) {
    const raw = String(noteStr || '').trim().toUpperCase();
    if (!raw) return '';
    const enharmonicMap = {
        'DB': 'C#',
        'EB': 'D#',
        'GB': 'F#',
        'AB': 'G#',
        'BB': 'A#'
    };
    const match = raw.match(/^([A-G][#B]?)(-?\d+)$/);
    if (!match) return raw;
    let pitch = match[1];
    const octave = match[2];
    if (enharmonicMap[pitch]) pitch = enharmonicMap[pitch];
    return `${pitch}${octave}`;
}

export function isCreatureChallengeCompleted(blockId) {
    const challenge = CREATURE_CHALLENGES[blockId];
    if (!challenge) return true;
    const unlocked = Array.isArray(ncState.localPlayer.unlockedCreatures)
        ? ncState.localPlayer.unlockedCreatures
        : [];
    return unlocked.includes(challenge.id);
}

export function recordChallengeNote(noteStr) {
    const token = normalizeNoteToken(noteStr);
    if (!token) return null;

    if (!Array.isArray(ncState.localPlayer.recentNotes)) {
        ncState.localPlayer.recentNotes = [];
    }
    ncState.localPlayer.recentNotes.push(token);
    if (ncState.localPlayer.recentNotes.length > 16) {
        ncState.localPlayer.recentNotes.shift();
    }

    if (!Array.isArray(ncState.localPlayer.unlockedCreatures)) {
        ncState.localPlayer.unlockedCreatures = [];
    }

    for (const [blockIdStr, challenge] of Object.entries(CREATURE_CHALLENGES)) {
        const blockId = Number(blockIdStr);
        if (ncState.localPlayer.unlockedCreatures.includes(challenge.id)) continue;

        const targetSeq = challenge.first8Notes.map(normalizeNoteToken);
        const len = targetSeq.length;
        const recent = ncState.localPlayer.recentNotes;
        if (recent.length >= len) {
            const slice = recent.slice(recent.length - len);
            const matched = slice.every((n, idx) => n === targetSeq[idx]);
            if (matched) {
                ncState.localPlayer.unlockedCreatures.push(challenge.id);
                updateInventory();
                return { blockId, challenge };
            }
        }
    }

    return null;
}

export function isTeacherBuilder() {
    return Boolean(
        ncState.isTeacher ||
        localStorage.getItem('pianopad_is_teacher') === 'true' ||
        localStorage.getItem('isHost') === 'true'
    );
}

export function calculateRoundReward(songTitle, difficulty = 'medium', accuracy = 0, tempoPercent = 100, isFirstTime = false) {
    if (isTeacherBuilder()) return 0;
    if (accuracy < 75) return 0;

    const base = COIN_REWARDS[difficulty] || COIN_REWARDS.medium || 50;
    const accMultiplier = Math.max(0.5, accuracy / 100);
    const tempoMultiplier = tempoPercent >= 100 ? 1.0 : 0.75;
    let total = Math.round(base * accMultiplier * tempoMultiplier);

    if (isFirstTime) {
        total += (COIN_REWARDS.firstTimeBonus || 50);
    }

    return total;
}

export function updateInventory() {
    const teacher = isTeacherBuilder();
    if (teacher) {
        ncState.localPlayer.noteCoins = 999999;
    }

    const masteredCount = Array.isArray(ncState.localPlayer.masteredSongs)
        ? ncState.localPlayer.masteredSongs.length
        : 0;

   // Inside updateInventory() in js/games/noteCraft/economy.js
    const allBlocks = [
        BLOCKS.DIRT, BLOCKS.GRASS, BLOCKS.STONE, BLOCKS.LEAVES,
        BLOCKS.WOOD, BLOCKS.BRICK, BLOCKS.GLASS, BLOCKS.NOTE_BLOCK,
        BLOCKS.PATH, BLOCKS.WATER, BLOCKS.TREE, BLOCKS.ROCK, BLOCKS.DRAGON,
        BLOCKS.TNT, BLOCKS.JUMP_PAD, BLOCKS.BOUNCE_BLOCK, BLOCKS.SPEED_STRIP,
        BLOCKS.SLIDE_BLOCK, BLOCKS.FIRE
    ];

    ncState.localPlayer.inventory = allBlocks.map(blockId => {
        if (teacher) return blockId;
        const req = UNLOCK_THRESHOLDS[blockId] ?? 0;
        if (masteredCount < req) return null;
        if (CREATURE_CHALLENGES[blockId] && !isCreatureChallengeCompleted(blockId)) {
            return null;
        }
        return blockId;
    });

    if (!ncState.localPlayer.inventory[ncState.localPlayer.selectedSlot]) {
        const firstUnlocked = ncState.localPlayer.inventory.findIndex(b => b !== null);
        if (firstUnlocked >= 0) {
            ncState.localPlayer.selectedSlot = firstUnlocked;
        }
    }
}
