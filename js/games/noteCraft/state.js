// js/games/noteCraft/state.js
import { CHUNK_HEIGHT } from './constants.js';

export const ncState = {
    active: false,
    worldId: 'school_campus_main',
    animFrameId: null,
    syncIntervalId: null,
    lastFrameTime: 0,
    isPointerLocked: false,
    isTeacher: false,
    mapZoom: 1.0,
    flatMode: false, // Toggle between 3D Block (false) and Flat Floor Paint (true)

    localPlayer: {
        id: 'local',
        name: 'Builder',
        avatar: '🏃',
        x: 12,
        y: 3,
        z: 2,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: -0.15,
        velocity: { x: 0, y: 0, z: 0 },
        isGrounded: false,
        isFlying: false,
        flightTimer: 0,
        noteCoins: 150,
        masteredSongs: [],
        selectedSlot: 0,
        inventory: [1, 2, 3, null, null, null, null, null, null, null, null, null, null]
    },

    remotePlayers: {},

    world: {
        deltas: {},
        undoStack: [],
        dirty: true,
        height: CHUNK_HEIGHT
    },

    targetBlock: { hit: false },
    keysHeld: new Set(),
    toastMessage: null,
    bridge: null
};
