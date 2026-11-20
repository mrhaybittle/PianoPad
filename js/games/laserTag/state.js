// js/games/laserTag/state.js
import { DEFAULT_GEAR } from './constants.js';

export const gameState = {
    animFrameId: null,
    syncIntervalId: null,
    roomUnsubscribe: null,
    lastFrameTime: 0,
    matchStartTime: 0,
    gamePhase: 'lobby', // 'lobby' | 'playing' | 'spectating'

    localPlayer: {
        x: 0,
        y: 0,
        angle: 0,
        turnDir: 0,
        turnUntil: 0,
        turnHoldStart: 0,
        moveUntil: 0,
        isMovingForward: false,
        lives: 3,
        hitsTaken: 0,
        eliminations: 0,
        isAlive: true,
        currentGear: DEFAULT_GEAR,
        invulnerableUntil: 0,
        portalCooldownUntil: 0,
        boostUntil: 0,
        overchargeReadyAt: 0,
        empReadyAt: 0,
        decoyReadyAt: 0,
        sniperUntil: 0,
        sniperReadyAt: 0,
        sniperActivatedAt: 0,
        empScrambledUntil: 0,
        hubScoreTimer: 0,
        stormTickTimer: 0,
        comboCount: 0,
        comboExpiresAt: 0,
        lastComboTargetId: null,
        revengeTargetId: null,
        hitMarkerUntil: 0,
        hitMarkerElim: false,
        suitColor: '#38bdf8',
        score: 0,
        noteTag: 'F#',
        bobPhase: 0,
        recoil: 0,
        muzzleFlash: 0,
        damageFlash: 0,
        damageFlashColor: '#f97316',
        portalFlash: 0,
        jamFlash: 0,
        gearBannerFlash: 0
    },

    // Arena Interactive Entities
    arenaPortals: [],
    speedBoostPads: [],
    medKitNodes: [],
    activeDecoys: [],
    empWaveRings: [],

    // Kill Feed & Podium Tracking
    killFeedEntries: [],
    seenFeedIds: new Set(),
    maxPeakPlayers: 1,

    // Spectator Drone Interactive Alert State
    spectatorSelectedTarget: null,
    incomingAlertBanner: null,
    processedAlertIds: new Set(),
    spectatorClickListenerAttached: false,

    // Hit/EMP Deduplication & Input Buffers
    processedHitIds: new Set(),
    processedEmpIds: new Set(),
    recentNoteBuffer: [],
    heldMoveKeys: new Set(),
    releaseHookActive: false,
    pendingActionTimer: null,
    lastChordTriggerTime: 0,
    lastTriggeredChordId: '',
    lastOctaveFlipTime: 0,
    typedCheatBuffer: '',

    // Remote Players, Beams, Explosions & Bots
    remotePlayers: {},
    activeBeams: [],
    worldExplosions: [],
    activeRoomCode: null,
    localId: null,
    zBuffer: [],
    simulatedBots: {},
    globalKeyListenerAttached: false,
    blurListenerAttached: false
};
