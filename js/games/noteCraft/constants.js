// js/games/noteCraft/constants.js
export const TILE_SIZE = 16;
export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;

// Musical / Resource Economy Constants
export const COIN_REWARDS = {
    'easy': 50,
    'medium': 120,
    'hard': 250
};
export const NEW_SONG_MULTIPLIER = 3;

// Block Dictionary
export const BLOCKS = {
    AIR: 0,
    DIRT: 1,
    GRASS: 2,
    STONE: 3,
    BRICK: 4,
    WOOD: 5,
    LEAVES: 6,
    GLASS: 7,
    NOTE_BLOCK: 8
};

// Block Requirements (Songs mastered to unlock)
export const UNLOCK_THRESHOLDS = {
    0: [BLOCKS.DIRT, BLOCKS.GRASS, BLOCKS.STONE],
    1: [BLOCKS.BRICK],
    3: [BLOCKS.WOOD, BLOCKS.GLASS],
    5: [BLOCKS.LEAVES],
    8: [BLOCKS.NOTE_BLOCK]
};

// Costs per block in NoteCoins
export const BLOCK_COSTS = {
    [BLOCKS.DIRT]: 0,
    [BLOCKS.GRASS]: 0,
    [BLOCKS.STONE]: 0,
    [BLOCKS.BRICK]: 10,
    [BLOCKS.WOOD]: 15,
    [BLOCKS.GLASS]: 25,
    [BLOCKS.LEAVES]: 5,
    [BLOCKS.NOTE_BLOCK]: 100
};
