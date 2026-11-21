// js/games/noteCraft/economy.js
import { BLOCKS, COIN_REWARDS, UNLOCK_THRESHOLDS } from './constants.js';
import { ncState } from './state.js';

export function calculateRoundReward(songTitle, difficulty = 'medium', accuracy = 0, tempoPercent = 100, isFirstTime = false) {
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
    const masteredCount = Array.isArray(ncState.localPlayer.masteredSongs)
        ? ncState.localPlayer.masteredSongs.length
        : 0;

    const allBlocks = [
        BLOCKS.DIRT,
        BLOCKS.GRASS,
        BLOCKS.STONE,
        BLOCKS.LEAVES,
        BLOCKS.WOOD,
        BLOCKS.BRICK,
        BLOCKS.GLASS,
        BLOCKS.NOTE_BLOCK
    ];

    ncState.localPlayer.inventory = allBlocks.map(blockId => {
        const req = UNLOCK_THRESHOLDS[blockId] ?? 0;
        return masteredCount >= req ? blockId : null;
    });

    // Ensure selectedSlot points to an unlocked block if possible
    if (!ncState.localPlayer.inventory[ncState.localPlayer.selectedSlot]) {
        const firstUnlocked = ncState.localPlayer.inventory.findIndex(b => b !== null);
        if (firstUnlocked >= 0) {
            ncState.localPlayer.selectedSlot = firstUnlocked;
        }
    }
}
