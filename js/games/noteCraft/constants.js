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
    NOTE_BLOCK: 8
};

export const BLOCK_COSTS = {
    [BLOCKS.DIRT]: 0,
    [BLOCKS.GRASS]: 0,
    [BLOCKS.STONE]: 5,
    [BLOCKS.BRICK]: 10,
    [BLOCKS.WOOD]: 10,
    [BLOCKS.LEAVES]: 5,
    [BLOCKS.GLASS]: 15,
    [BLOCKS.NOTE_BLOCK]: 25
};
