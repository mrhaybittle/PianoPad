// js/games/noteCraft/constants.js
export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 24;

export const GRAVITY = -22.0;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_RADIUS = 0.32;

export const BLOCKS = {
    AIR: 0,
    DIRT: 1,
    GRASS: 2,
    STONE: 3,
    BRICK: 4,
    WOOD: 5,
    LEAVES: 6,
    GLASS: 7,
    NOTE_BLOCK: 8,
    PATH: 9,      // Edits Floor
    WATER: 10,    // Edits Floor
    TREE: 11,     // Voxel Prefab
    ROCK: 12,     // Voxel Prefab
    DRAGON: 13,   // Voxel Prefab
    TNT: 14       // 5s Fuse Exploding Block (Available to all students)
};

export const BLOCK_COSTS = {
    [BLOCKS.DIRT]: 0,
    [BLOCKS.GRASS]: 0,
    [BLOCKS.STONE]: 5,
    [BLOCKS.BRICK]: 10,
    [BLOCKS.WOOD]: 10,
    [BLOCKS.LEAVES]: 5,
    [BLOCKS.GLASS]: 15,
    [BLOCKS.NOTE_BLOCK]: 25,
    [BLOCKS.PATH]: 5,
    [BLOCKS.WATER]: 5,
    [BLOCKS.TREE]: 25,
    [BLOCKS.ROCK]: 20,
    [BLOCKS.DRAGON]: 50,
    [BLOCKS.TNT]: 15
};

export const COIN_REWARDS = {
    easy: 25,
    medium: 50,
    hard: 100,
    firstTimeBonus: 50
};

export const UNLOCK_THRESHOLDS = {
    [BLOCKS.DIRT]: 0,
    [BLOCKS.GRASS]: 0,
    [BLOCKS.STONE]: 0,
    [BLOCKS.LEAVES]: 1,
    [BLOCKS.WOOD]: 2,
    [BLOCKS.BRICK]: 3,
    [BLOCKS.GLASS]: 5,
    [BLOCKS.NOTE_BLOCK]: 8,
    [BLOCKS.PATH]: 9,
    [BLOCKS.WATER]: 10,
    [BLOCKS.TREE]: 11,
    [BLOCKS.ROCK]: 12,
    [BLOCKS.DRAGON]: 13,
    [BLOCKS.TNT]: 0
};
