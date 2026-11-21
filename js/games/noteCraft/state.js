// js/games/noteCraft/state.js
export const ncState = {
    animFrameId: null,
    syncIntervalId: null,
    roomUnsubscribe: null,
    lastFrameTime: 0,
    
    localPlayer: {
        x: 0,
        y: CHUNK_HEIGHT,
        z: 0,
        pitch: 0,
        yaw: 0,
        velocity: { x: 0, y: 0, z: 0 },
        isGrounded: false,
        noteCoins: 0,
        masteredSongs: [],
        inventory: [],     // Array of unlocked block IDs
        selectedSlot: 0,   // Hotbar index (0-8)
        isFlying: false,
        flightTimer: 0
    },

    world: {
        chunks: {}, // Keyed by "chunkX_chunkZ"
        deltas: {}  // Player modifications, keyed by "x_y_z"
    },

    remotePlayers: {},
    
    // Engine & Input
    keysHeld: new Set(),
    activeChords: new Set(),
    pendingNoteTimer: null,
    recentNotes: []
};
