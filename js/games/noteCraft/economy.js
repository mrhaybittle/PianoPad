// js/games/noteCraft/economy.js
import { ncState } from './state.js';
import { COIN_REWARDS, NEW_SONG_MULTIPLIER, UNLOCK_THRESHOLDS, BLOCKS } from './constants.js';

export function calculateRoundReward(songTitle, difficulty, accuracy, tempoPercent, isFirstTime) {
    if (accuracy < 75) return 0;
    
    let base = COIN_REWARDS[difficulty.toLowerCase()] || COIN_REWARDS['medium'];
    let tempoMultiplier = tempoPercent / 100.0;
    let reward = Math.round(base * tempoMultiplier * (accuracy / 100.0));
    
    if (isFirstTime) {
        reward *= NEW_SONG_MULTIPLIER;
    }
    
    return reward;
}

export function updateInventory() {
    const masteredCount = ncState.localPlayer.masteredSongs.length;
    const newInventory = [];
    
    for (const [threshold, blocks] of Object.entries(UNLOCK_THRESHOLDS)) {
        if (masteredCount >= parseInt(threshold)) {
            newInventory.push(...blocks);
        }
    }
    
    ncState.localPlayer.inventory = newInventory;
}
