// js/games/noteCraft/state.js
import { CHUNK_HEIGHT } from './constants.js';
import campusPreset from './campusPreset.js';

export const ncState = {
    active: false,
    worldId: 'school_campus_main',
    animFrameId: null,
    syncIntervalId: null,
    lastFrameTime: 0,
    isPointerLocked: false,
    isTeacher: false,
    mapZoom: 1.0,
    flatMode: false,
    brushMode: 'single',
    brushAnchor: null,
    quitButtonRect: null,

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
        speedBoostTimer: 0,
        slideMomentum: { x: 0, z: 0 },
        noteCoins: 150,
        masteredSongs: [],
        unlockedCreatures: [],
        recentNotes: [],
        selectedSlot: 0,
        inventory: [1, 2, 3, null, null, null, null, null, null, null, null, null, null, null, 15, 16, 17, 18, 19]
    },

    grapple: {
        active: false,
        anchor: null, // { x, y, z }
        ropeLength: 0,
        ziplineSpeed: 14.0
    },

    remotePlayers: {},
    creatures: [],

    world: {
        preset: campusPreset,
        deltas: {},
        locks: {},
        undoStack: [],
        dirty: true,
        height: CHUNK_HEIGHT
    },

    activeExplosions: [],
    targetBlock: { hit: false },
    keysHeld: new Set(),
    toastMessage: null,
    bridge: null
};
