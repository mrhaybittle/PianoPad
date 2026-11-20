import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let syncIntervalId = null;
let roomUnsubscribe = null;
let lastFrameTime = 0;
let gamePhase = 'lobby'; // 'lobby' | 'playing' | 'spectating'

// 7 Diatonic White-Key Triad Speed Gears (locked in until another chord is played)
const CHORD_GEARS = [
    { id: 'C',    notes: ['C', 'E', 'G'], label: 'C MAJOR • LOCKED (0x)',      short: '🔒 LOCKED (0x)', mult: 0.00, color: '#facc15', stealth: false },
    { id: 'Dm',   notes: ['D', 'F', 'A'], label: 'D MINOR • SNEAKY (0.35x)',   short: '🥷 SNEAKY',      mult: 0.35, color: '#a855f7', stealth: true  },
    { id: 'Em',   notes: ['E', 'G', 'B'], label: 'E MINOR • CAUTIOUS (0.65x)', short: '🚶 CAUTIOUS',    mult: 0.65, color: '#2dd4bf', stealth: false },
    { id: 'F',    notes: ['F', 'A', 'C'], label: 'F MAJOR • NORMAL (1.0x)',    short: '🏃 NORMAL',      mult: 1.00, color: '#22c55e', stealth: false },
    { id: 'G',    notes: ['G', 'B', 'D'], label: 'G MAJOR • BRISK (1.35x)',    short: '⚡ BRISK',       mult: 1.35, color: '#38bdf8', stealth: false },
    { id: 'Am',   notes: ['A', 'C', 'E'], label: 'A MINOR • DASH (1.68x)',     short: '🔥 DASH',        mult: 1.68, color: '#fb923c', stealth: false },
    { id: 'Bdim', notes: ['B', 'D', 'F'], label: 'B DIM • SPRINT X2 (2.0x)',   short: '🚀 SPRINT X2',   mult: 2.00, color: '#ef4444', stealth: false }
];

const DEFAULT_GEAR = CHORD_GEARS[3]; // F Major (1.0x Normal Speed)

// Distinct Color Themes for each Arena Sector (Walls + Minimap + Overhead View)
const WALL_THEMES = {
    1: { name: 'CYAN PERIMETER',  r: 14,  g: 116, b: 144, trim: [56, 189, 248],  mapHex: '#38bdf8' }, // Outer Fortress
    2: { name: 'GOLD NW MAZE',    r: 146, g: 108, b: 14,  trim: [250, 204, 21],  mapHex: '#facc15' }, // North-West Sector
    3: { name: 'MAGENTA NE MAZE', r: 112, g: 26,  b: 117, trim: [232, 121, 249], mapHex: '#e879f9' }, // North-East Sector
    4: { name: 'CORAL SW MAZE',   r: 154, g: 52,  b: 18,  trim: [251, 146, 60],  mapHex: '#fb923c' }, // South-West Sector
    5: { name: 'COBALT SE MAZE',  r: 30,  g: 64,  b: 175, trim: [96, 165, 250],  mapHex: '#60a5fa' }, // South-East Sector
    6: { name: 'EMERALD ARENA',   r: 6,   g: 95,  b: 70,  trim: [52, 211, 153],  mapHex: '#34d399' }  // Open Courtyard Pillars
};

// Local First-Person Player State
const localPlayer = {
    x: 0,
    y: 0,
    angle: 0,
    turnDir: 0, // -1 left, 1 right
    moveUntil: 0, // Timestamp while C# throttle is held
    isMovingForward: false,
    lives: 3,
    hitsTaken: 0,
    isAlive: true,
    currentGear: DEFAULT_GEAR,
    invulnerableUntil: 0,
    suitColor: '#38bdf8',
    score: 0,
    noteTag: 'F#',
    bobPhase: 0,
    recoil: 0,
    muzzleFlash: 0,
    damageFlash: 0,
    damageFlashColor: '#f97316',
    jamFlash: 0,
    gearBannerFlash: 0
};

// Hit Event Deduplication & Chord/Anti-Spam Buffer
let processedHitIds = new Set();
let recentNoteBuffer = [];
let pendingActionTimer = null;
let lastChordTriggerTime = 0;
let lastTriggeredChordId = '';

// Remote Players, Beams & Explosions
let remotePlayers = {};
let activeBeams = [];
let worldExplosions = [];
let activeRoomCode = null;
let localId = null;
let zBuffer = [];

// ~100% Larger 46x46 Procedural Sci-Fi Maze + 5 Open Courtyards
const TILE_SIZE = 64;
const MAP_COLS = 46;
const MAP_ROWS = 46;

function buildLargeArenaMap() {
    const grid = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(1));

    function carve(r, c) {
        grid[r][c] = 0;
        const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]].sort(() => Math.random() - 0.5);
        for (const [dr, dc] of dirs) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr > 0 && nr < MAP_ROWS - 1 && nc > 0 && nc < MAP_COLS - 1 && grid[nr][nc] === 1) {
                grid[r + dr / 2][c + dc / 2] = 0;
                carve(nr, nc);
            }
        }
    }
    carve(1, 1);

    // Assign quadrant-specific color wall types (2 = Gold NW, 3 = Magenta NE, 4 = Coral SW, 5 = Cobalt SE)
    const midR = Math.floor(MAP_ROWS / 2);
    const midC = Math.floor(MAP_COLS / 2);

    for (let r = 2; r < MAP_ROWS - 2; r++) {
        for (let c = 2; c < MAP_COLS - 2; c++) {
            if (grid[r][c] === 1) {
                if (Math.random() < 0.22) {
                    grid[r][c] = 0;
                } else if (r < midR && c < midC) {
                    grid[r][c] = 2; // NW Gold
                } else if (r < midR && c >= midC) {
                    grid[r][c] = 3; // NE Magenta
                } else if (r >= midR && c < midC) {
                    grid[r][c] = 4; // SW Coral
                } else {
                    grid[r][c] = 5; // SE Cobalt
                }
            }
        }
    }

    // Carve 5 Open Courtyards with Emerald Pillars (type 6)
    const rooms = [
        { r0: 7, r1: 14, c0: 7, c1: 14 },
        { r0: 7, r1: 14, c0: 31, c1: 38 },
        { r0: 31, r1: 38, c0: 7, c1: 14 },
        { r0: 31, r1: 38, c0: 31, c1: 38 },
        { r0: 19, r1: 26, c0: 19, c1: 26 }
    ];

    for (const rm of rooms) {
        for (let r = rm.r0; r <= rm.r1; r++) {
            for (let c = rm.c0; c <= rm.c1; c++) {
                grid[r][c] = 0;
            }
        }
        grid[rm.r0 + 2][rm.c0 + 2] = 6;
        grid[rm.r0 + 2][rm.c1 - 2] = 6;
        grid[rm.r1 - 2][rm.c0 + 2] = 6;
        grid[rm.r1 - 2][rm.c1 - 2] = 6;
    }

    return grid;
}

let ARENA_MAP = buildLargeArenaMap();

function generateSeededArena(roomCode) {
    let seed = 0;
    const str = String(roomCode || '123');
    for (let i = 0; i < str.length; i++) {
        seed = (seed * 31 + str.charCodeAt(i)) % 2147483647;
    }
    const origRandom = Math.random;
    Math.random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };
    ARENA_MAP = buildLargeArenaMap();
    Math.random = origRandom;
}

function getZoneInfoForCoords(wx, wy) {
    const col = Math.floor(wx / TILE_SIZE);
    const row = Math.floor(wy / TILE_SIZE);
    if (row >= 19 && row <= 26 && col >= 19 && col <= 26) {
        return { label: 'EMERALD HUB', color: '#34d399' };
    }
    const midR = Math.floor(MAP_ROWS / 2);
    const midC = Math.floor(MAP_COLS / 2);
    if (row < midR && col < midC) return { label: 'GOLD NW ZONE', color: '#facc15' };
    if (row < midR && col >= midC) return { label: 'MAGENTA NE ZONE', color: '#e879f9' };
    if (row >= midR && col < midC) return { label: 'CORAL SW ZONE', color: '#fb923c' };
    return { label: 'COBALT SE ZONE', color: '#60a5fa' };
}

// 9 assignable target pitches (C = Left, C# = Forward, D = Right)
const ASSIGNABLE_PITCHES = ['D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SUIT_PALETTE = [
    '#38bdf8', '#22c55e', '#f472b6', '#a855f7', '#fb923c',
    '#2dd4bf', '#facc15', '#818cf8', '#fb7185', '#34d399'
];

function getSuitColorForAvatar(avatarStr, idStr) {
    const src = `${avatarStr || ''}_${idStr || ''}`;
    let hash = 0;
    for (let i = 0; i < src.length; i++) {
        hash = (hash * 33 + src.charCodeAt(i)) >>> 0;
    }
    return SUIT_PALETTE[hash % SUIT_PALETTE.length];
}

function normalizePitchClass(noteStr) {
    const clean = (noteStr || '').toUpperCase().trim().replace(/[0-9]/g, '');
    const flatMap = { 'DB': 'C#', 'EB': 'D#', 'GB': 'F#', 'AB': 'G#', 'BB': 'A#' };
    return flatMap[clean] || clean;
}

function matchDiatonicTriad(pitchSet) {
    if (pitchSet.size !== 3) return null;
    for (const gear of CHORD_GEARS) {
        if (gear.notes.every(n => pitchSet.has(n))) {
            return gear;
        }
    }
    return null;
}

function isPlayerActiveInRoom(p) {
    if (!p || p.isAlive === false) return false;
    return typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y);
}

function playLaserPew() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
    } catch (e) {}
}

function playJamBuzzSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(115, now);
        osc.frequency.setValueAtTime(95, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
    } catch (e) {}
}

function playGearShiftSound(speedMult) {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        const baseFreq = 260 + speedMult * 220;
        osc.frequency.setValueAtTime(baseFreq * 0.85, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.14);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
    } catch (e) {}
}

function playShieldHitSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(85, now + 0.28);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.31);
    } catch (e) {}
}

function playExplosionSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.50);
        gain.gain.setValueAtTime(0.26, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.54);
    } catch (e) {}
}

function spawn3DExplosion(wx, wy, color, count = 28) {
    for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 190;
        worldExplosions.push({
            x: wx,
            y: wy,
            z: (Math.random() - 0.5) * 24,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            vz: (Math.random() - 0.3) * 90,
            life: 1.0,
            size: 4 + Math.random() * 6,
            color: i % 3 === 0 ? '#ffffff' : color
        });
    }
}

function hasLineOfSight(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(8, Math.ceil(dist / 14));
    for (let i = 1; i < steps; i++) {
        const tx = x1 + (x2 - x1) * (i / steps);
        const ty = y1 + (y2 - y1) * (i / steps);
        const col = Math.floor(tx / TILE_SIZE);
        const row = Math.floor(ty / TILE_SIZE);
        if (ARENA_MAP[row] && ARENA_MAP[row][col] > 0) return false;
    }
    return true;
}

function ensureCanvasSized(canvas) {
    if (!canvas) return;
    const parent = canvas.parentElement;
    const targetW = (parent && parent.clientWidth > 0) ? parent.clientWidth : window.innerWidth;
    const targetH = (parent && parent.clientHeight > 0) ? parent.clientHeight : 380;
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }
}

function getSafeSpawnPoint(avoidX = null, avoidY = null) {
    let best = { x: TILE_SIZE * 1.5, y: TILE_SIZE * 1.5 };
    let bestDist = -1;

    for (let attempt = 0; attempt < 150; attempt++) {
        const c = 2 + Math.floor(Math.random() * (MAP_COLS - 4));
        const r = 2 + Math.floor(Math.random() * (MAP_ROWS - 4));
        if (ARENA_MAP[r] && ARENA_MAP[r][c] === 0) {
            const candX = c * TILE_SIZE + TILE_SIZE / 2;
            const candY = r * TILE_SIZE + TILE_SIZE / 2;
            if (avoidX === null || avoidY === null) {
                return { x: candX, y: candY };
            }
            const d = Math.hypot(candX - avoidX, candY - avoidY);
            if (d > bestDist) {
                bestDist = d;
                best = { x: candX, y: candY };
            }
            if (d > TILE_SIZE * 14) return best;
        }
    }
    return best;
}

export function stopLaserTag() {
    if (animFrameId !== null) cancelAnimationFrame(animFrameId);
    if (syncIntervalId !== null) clearInterval(syncIntervalId);
    if (pendingActionTimer !== null) clearTimeout(pendingActionTimer);
    if (roomUnsubscribe) {
        roomUnsubscribe();
        roomUnsubscribe = null;
    }
    animFrameId = null;
    syncIntervalId = null;
    pendingActionTimer = null;
    recentNoteBuffer = [];
    processedHitIds.clear();
    gamePhase = 'lobby';
}

export async function startLaserTag(bridge, autoRoomCode = null) {
    initAudio();
    stopLaserTag();

    document.getElementById('arcade-hub')?.classList.remove('open');
    document.getElementById('knockout-modal')?.classList.remove('open');
    document.getElementById('sprint-option-modal')?.classList.remove('open');
    document.getElementById('game-results-modal')?.classList.remove('open');

    bridge.setActiveMiniGame('laserTag');

    const canvas = document.getElementById('waterfall-canvas');
    if (canvas) {
        canvas.style.display = 'block';
        ensureCanvasSized(canvas);
    }

    const state = bridge.getState ? bridge.getState() : {};
    localId = state.localStudentId || ('stu_' + Math.random().toString(36).slice(2, 9));
    activeRoomCode = String(autoRoomCode || prompt("Enter a 3-Digit Room Code for 3D Laser Tag:", "123") || '').trim();

    if (!activeRoomCode || !window.firebaseDb) {
        alert("Firebase required for Laser Tag. Returning to menu.");
        bridge.exitActiveMiniGame();
        return;
    }

    generateSeededArena(activeRoomCode);

    const avatar = state.sessionStudentAvatar || '🏃';
    const spawn = getSafeSpawnPoint();
    localPlayer.x = spawn.x;
    localPlayer.y = spawn.y;
    localPlayer.angle = Math.random() * Math.PI * 2;
    localPlayer.turnDir = 0;
    localPlayer.moveUntil = 0;
    localPlayer.isMovingForward = false;
    localPlayer.lives = 3;
    localPlayer.hitsTaken = 0;
    localPlayer.isAlive = true;
    localPlayer.currentGear = DEFAULT_GEAR;
    localPlayer.invulnerableUntil = 0;
    localPlayer.suitColor = getSuitColorForAvatar(avatar, localId);
    localPlayer.score = 0;
    localPlayer.noteTag = ASSIGNABLE_PITCHES[Math.floor(Math.random() * ASSIGNABLE_PITCHES.length)];
    localPlayer.bobPhase = 0;
    localPlayer.recoil = 0;
    localPlayer.muzzleFlash = 0;
    localPlayer.damageFlash = 0;
    localPlayer.damageFlashColor = '#f97316';
    localPlayer.jamFlash = 0;
    localPlayer.gearBannerFlash = 1.0;

    activeBeams = [];
    worldExplosions = [];
    remotePlayers = {};
    recentNoteBuffer = [];
    processedHitIds.clear();
    gamePhase = 'playing';
    lastFrameTime = performance.now();

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🛸 3D LASER TAG! Shield: [${localPlayer.noteTag}] | Hold C#: Forward • C: Left • D: Right • Chords: Lock Speed • Other Notes: Fire!`;
    }

    animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));

    try {
        const { onValue, set, update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const basePath = `pianopad_tournaments/${activeRoomCode}/lasertag`;
        const myPlayerRef = window.firebaseRef(window.firebaseDb, `${basePath}/${localId}`);

        await set(myPlayerRef, {
            id: localId,
            x: Number(localPlayer.x.toFixed(1)),
            y: Number(localPlayer.y.toFixed(1)),
            angle: Number(localPlayer.angle.toFixed(3)),
            lives: 3,
            hitsTaken: 0,
            isAlive: true,
            gearId: localPlayer.currentGear.id,
            isStealth: localPlayer.currentGear.stealth,
            isInvulnerable: false,
            suitColor: localPlayer.suitColor,
            noteTag: localPlayer.noteTag,
            score: 0,
            name: state.sessionStudentName || 'Player',
            avatar: avatar,
            lastHitEvent: null
        });
        if (window.firebaseOnDisconnect) {
            window.firebaseOnDisconnect(myPlayerRef).remove();
        }

        const roomRef = window.firebaseRef(window.firebaseDb, basePath);
        roomUnsubscribe = onValue(roomRef, (snapshot) => {
            const data = snapshot.val() || {};
            remotePlayers = data;

            const myServerRecord = remotePlayers[localId];
            if (!myServerRecord || !localPlayer.isAlive) return;

            const hitEvt = myServerRecord.lastHitEvent;
            if (hitEvt && hitEvt.id && !processedHitIds.has(hitEvt.id)) {
                processedHitIds.add(hitEvt.id);

                if (performance.now() < localPlayer.invulnerableUntil) return;

                localPlayer.hitsTaken += 1;
                localPlayer.lives = Math.max(0, 3 - localPlayer.hitsTaken);

                if (localPlayer.lives <= 0) {
                    localPlayer.lives = 0;
                    localPlayer.isAlive = false;
                    localPlayer.moveUntil = 0;
                    localPlayer.damageFlash = 1.0;
                    localPlayer.damageFlashColor = '#ef4444';
                    playExplosionSound();
                    spawn3DExplosion(localPlayer.x, localPlayer.y, '#ef4444', 42);
                    gamePhase = 'spectating';

                    update(myPlayerRef, {
                        lives: 0,
                        hitsTaken: localPlayer.hitsTaken,
                        isAlive: false,
                        isInvulnerable: false
                    }).catch(() => {});

                    if (statusEl) {
                        statusEl.textContent = `💥 ELIMINATED by ${hitEvt.byName || 'Opponent'}! Drone Cam Activated — Tap any key to send reactions!`;
                    }
                } else {
                    const oldX = localPlayer.x;
                    const oldY = localPlayer.y;
                    spawn3DExplosion(oldX, oldY, '#f97316', 24);

                    const newSpawn = getSafeSpawnPoint(oldX, oldY);
                    localPlayer.x = newSpawn.x;
                    localPlayer.y = newSpawn.y;
                    localPlayer.angle = Math.random() * Math.PI * 2;
                    localPlayer.moveUntil = 0;
                    localPlayer.invulnerableUntil = performance.now() + 3500;
                    localPlayer.damageFlash = 1.0;
                    localPlayer.damageFlashColor = '#f97316';
                    playShieldHitSound();

                    update(myPlayerRef, {
                        x: Number(localPlayer.x.toFixed(1)),
                        y: Number(localPlayer.y.toFixed(1)),
                        angle: Number(localPlayer.angle.toFixed(3)),
                        lives: localPlayer.lives,
                        hitsTaken: localPlayer.hitsTaken,
                        isAlive: true,
                        isInvulnerable: true
                    }).catch(() => {});

                    if (statusEl) {
                        statusEl.textContent = `⚠️ HIT BY ${hitEvt.byName || 'Opponent'}! Respawned (${localPlayer.lives} ${localPlayer.lives === 1 ? 'LIFE' : 'LIVES'} LEFT) — Ghost Shield active for 3.5s!`;
                    }
                }
            }
        });

        syncIntervalId = setInterval(() => {
            if (bridge.getActiveMiniGame() !== 'laserTag' || !localPlayer.isAlive) return;
            const isInvuln = performance.now() < localPlayer.invulnerableUntil;
            update(myPlayerRef, {
                x: Number(localPlayer.x.toFixed(1)),
                y: Number(localPlayer.y.toFixed(1)),
                angle: Number(localPlayer.angle.toFixed(3)),
                lives: localPlayer.lives,
                hitsTaken: localPlayer.hitsTaken,
                isAlive: localPlayer.isAlive,
                gearId: localPlayer.currentGear.id,
                isStealth: localPlayer.currentGear.stealth,
                isInvulnerable: isInvuln,
                suitColor: localPlayer.suitColor,
                noteTag: localPlayer.noteTag,
                score: localPlayer.score,
                name: state.sessionStudentName || 'Player',
                avatar: avatar
            }).catch(() => {});
        }, 100);
    } catch (err) {
        console.error("Laser Tag Firebase sync error:", err);
    }
}

async function executeSingleNoteAction(pitchClass, bridge) {
    if (gamePhase !== 'playing' || !localPlayer.isAlive) return;

    // C = Turn Left
    if (pitchClass === 'C') {
        localPlayer.turnDir = -1;
        setTimeout(() => { if (localPlayer.turnDir === -1) localPlayer.turnDir = 0; }, 220);
        return;
    }

    // D = Turn Right
    if (pitchClass === 'D') {
        localPlayer.turnDir = 1;
        setTimeout(() => { if (localPlayer.turnDir === 1) localPlayer.turnDir = 0; }, 220);
        return;
    }

    // C# = Forward Throttle (must be held/pulsed to move forward at locked chord speed)
    if (pitchClass === 'C#') {
        localPlayer.moveUntil = performance.now() + 220;
        return;
    }

    // Any of the remaining 9 pitches fires a single laser shot
    playLaserPew();
    localPlayer.recoil = 1.0;
    localPlayer.muzzleFlash = 1.0;

    const FOV = Math.PI / 3;
    let bestTarget = null;
    let bestDist = 1400;

    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !isPlayerActiveInRoom(opp) || opp.isInvulnerable) continue;
        if (normalizePitchClass(opp.noteTag) !== pitchClass) continue;

        const dx = opp.x - localPlayer.x;
        const dy = opp.y - localPlayer.y;
        const dist = Math.hypot(dx, dy);
        if (dist > bestDist) continue;

        let relAngle = Math.atan2(dy, dx) - localPlayer.angle;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;

        if (Math.abs(relAngle) <= FOV * 0.62 && hasLineOfSight(localPlayer.x, localPlayer.y, opp.x, opp.y)) {
            bestDist = dist;
            bestTarget = { id, opp, relAngle, dist };
        }
    }

    const canvas = document.getElementById('waterfall-canvas');
    const W = canvas ? canvas.width : 800;
    const H = canvas ? canvas.height : 380;

    if (bestTarget) {
        const targetScreenX = (0.5 + (bestTarget.relAngle / FOV)) * W;
        const targetScreenY = H * 0.5;

        const currentLives = bestTarget.opp.lives !== undefined ? Number(bestTarget.opp.lives) : 3;
        const predictedRemaining = Math.max(0, currentLives - 1);
        const eliminated = predictedRemaining <= 0;

        activeBeams.push({
            endX: targetScreenX,
            endY: targetScreenY,
            color: eliminated ? '#ef4444' : '#f97316',
            glow: eliminated ? '#dc2626' : '#fb923c',
            life: 1.0
        });

        if (eliminated) {
            playExplosionSound();
            spawn3DExplosion(bestTarget.opp.x, bestTarget.opp.y, '#ef4444', 36);
            localPlayer.score += 150;
        } else {
            playShieldHitSound();
            spawn3DExplosion(bestTarget.opp.x, bestTarget.opp.y, '#f97316', 20);
            localPlayer.score += 50;
        }

        const state = bridge && bridge.getState ? bridge.getState() : {};
        const hitEventId = `${localId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        try {
            const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
            const basePath = `pianopad_tournaments/${activeRoomCode}/lasertag`;
            await update(window.firebaseRef(window.firebaseDb, `${basePath}/${bestTarget.id}`), {
                lastHitEvent: {
                    id: hitEventId,
                    byId: localId,
                    byName: state.sessionStudentName || 'Opponent',
                    pitch: pitchClass,
                    timestamp: Date.now()
                }
            });
        } catch (e) {}

        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = eliminated
                ? `💥 ELIMINATED ${bestTarget.opp.name || 'Opponent'} with [${pitchClass}]! (+150 pts • Score: ${localPlayer.score})`
                : `🔥 HIT ${bestTarget.opp.name || 'Opponent'} (${predictedRemaining} ${predictedRemaining === 1 ? 'life' : 'lives'} left) — they respawned! (+50 pts)`;
        }
    } else {
        activeBeams.push({
            endX: W * 0.5,
            endY: H * 0.5,
            color: localPlayer.suitColor || '#38bdf8',
            glow: '#0284c7',
            life: 1.0
        });
    }
}

export async function handleLaserTagInput(noteStr, bridge) {
    if (gamePhase === 'spectating') {
        spawn3DExplosion(localPlayer.x, localPlayer.y, '#facc15', 14);
        return;
    }

    if (gamePhase !== 'playing' || !localPlayer.isAlive) return;

    const now = performance.now();
    const pitchClass = normalizePitchClass(noteStr);
    if (!pitchClass) return;

    if (pitchClass === 'C#' && recentNoteBuffer.length === 0) {
        localPlayer.moveUntil = now + 220;
        return;
    }

    recentNoteBuffer.push({ pitchClass, time: now });
    recentNoteBuffer = recentNoteBuffer.filter(item => (now - item.time) <= 95);

    const distinctPitches = new Set(recentNoteBuffer.map(item => item.pitchClass));

    const matchedGear = matchDiatonicTriad(distinctPitches);
    if (matchedGear) {
        if (pendingActionTimer !== null) {
            clearTimeout(pendingActionTimer);
            pendingActionTimer = null;
        }
        recentNoteBuffer = [];

        if ((now - lastChordTriggerTime) > 350 || lastTriggeredChordId !== matchedGear.id) {
            lastChordTriggerTime = now;
            lastTriggeredChordId = matchedGear.id;

            localPlayer.currentGear = matchedGear;
            localPlayer.turnDir = 0;
            localPlayer.gearBannerFlash = 1.0;
            playGearShiftSound(matchedGear.mult);

            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.textContent = `🎛️ SPEED LOCKED: ${matchedGear.label} — Hold C# to move forward!`;
            }
        }
        return;
    }

    if (distinctPitches.size >= 2) {
        const WHITE_KEYS = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
        const allWhite = Array.from(distinctPitches).every(n => WHITE_KEYS.has(n));

        if (allWhite && distinctPitches.size === 2) {
            if (pendingActionTimer !== null) clearTimeout(pendingActionTimer);
            pendingActionTimer = setTimeout(() => {
                pendingActionTimer = null;
                localPlayer.jamFlash = 1.0;
                playJamBuzzSound();
                recentNoteBuffer = [];
            }, 85);
            return;
        }

        if (pendingActionTimer !== null) {
            clearTimeout(pendingActionTimer);
            pendingActionTimer = null;
        }
        localPlayer.jamFlash = 1.0;
        playJamBuzzSound();
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = `⚠️ MULTI-NOTE SPAM BLOCKED! Play 1 note to shoot, C# to move, or a white triad for speed!`;
        }
        return;
    }

    if (pendingActionTimer !== null) {
        clearTimeout(pendingActionTimer);
    }
    pendingActionTimer = setTimeout(() => {
        pendingActionTimer = null;
        const checkNow = performance.now();
        const activeNotes = recentNoteBuffer.filter(item => (checkNow - item.time) <= 105);
        const uniqueNow = new Set(activeNotes.map(item => item.pitchClass));
        if (uniqueNow.size === 1) {
            const singlePitch = Array.from(uniqueNow)[0];
            recentNoteBuffer = [];
            executeSingleNoteAction(singlePitch, bridge);
        }
    }, 75);
}

function castRay(rayAngle) {
    const sin = Math.sin(rayAngle);
    const cos = Math.cos(rayAngle);

    let mapX = Math.floor(localPlayer.x / TILE_SIZE);
    let mapY = Math.floor(localPlayer.y / TILE_SIZE);

    const deltaDistX = Math.abs(1 / (cos || 1e-6));
    const deltaDistY = Math.abs(1 / (sin || 1e-6));

    let stepX, sideDistX;
    if (cos < 0) {
        stepX = -1;
        sideDistX = (localPlayer.x / TILE_SIZE - mapX) * deltaDistX;
    } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - localPlayer.x / TILE_SIZE) * deltaDistX;
    }

    let stepY, sideDistY;
    if (sin < 0) {
        stepY = -1;
        sideDistY = (localPlayer.y / TILE_SIZE - mapY) * deltaDistY;
    } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - localPlayer.y / TILE_SIZE) * deltaDistY;
    }

    let hit = 0;
    let side = 0;
    let safety = 0;

    while (hit === 0 && safety < 72) {
        safety++;
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            side = 0;
        } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            side = 1;
        }
        if (mapY < 0 || mapY >= MAP_ROWS || mapX < 0 || mapX >= MAP_COLS) {
            hit = 1;
        } else if (ARENA_MAP[mapY][mapX] > 0) {
            hit = ARENA_MAP[mapY][mapX];
        }
    }

    const perpWallDist = (side === 0 ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY)) * TILE_SIZE;
    return { dist: Math.max(1, perpWallDist), side, wallType: hit };
}

function renderFirstPerson3D(ctx, W, H, dt) {
    const FOV = Math.PI / 3;
    const gearMult = localPlayer.currentGear.mult;
    const activelyMoving = localPlayer.isMovingForward && gearMult > 0;
    const bobAmp = activelyMoving ? Math.min(7, 2.5 + gearMult * 2.2) : 0;
    const bobOffset = localPlayer.isAlive ? Math.sin(localPlayer.bobPhase) * bobAmp : 0;
    const horizon = H * 0.52 + bobOffset;

    // 1. Sci-Fi Ceiling & Floor
    const ceilGrad = ctx.createLinearGradient(0, 0, 0, horizon);
    ceilGrad.addColorStop(0, '#020617');
    ceilGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = ceilGrad;
    ctx.fillRect(0, 0, W, horizon);

    const floorGrad = ctx.createLinearGradient(0, horizon, 0, H);
    floorGrad.addColorStop(0, '#090d16');
    floorGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizon, W, H - horizon);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 6; i++) {
        const yLine = horizon + Math.pow(i / 6, 1.8) * (H - horizon);
        ctx.beginPath();
        ctx.moveTo(0, yLine);
        ctx.lineTo(W, yLine);
        ctx.stroke();
    }

    // 2. Raycast 3D Color-Coded Sector Walls
    const numRays = Math.min(320, Math.floor(W / 3));
    const stripW = W / numRays;
    zBuffer = new Array(numRays);

    for (let i = 0; i < numRays; i++) {
        const rayAngle = (localPlayer.angle - FOV / 2) + (i / numRays) * FOV;
        const hit = castRay(rayAngle);
        const correctedDist = hit.dist * Math.cos(rayAngle - localPlayer.angle);
        zBuffer[i] = correctedDist;

        const wallHeight = Math.min(H * 1.6, (TILE_SIZE * H) / Math.max(1, correctedDist));
        const wallTop = horizon - wallHeight / 2;

        const shade = Math.max(0.18, 1 - correctedDist / 1450) * (hit.side === 1 ? 0.78 : 1.0);
        const theme = WALL_THEMES[hit.wallType] || WALL_THEMES[1];

        ctx.fillStyle = `rgb(${Math.floor(theme.r * shade)}, ${Math.floor(theme.g * shade)}, ${Math.floor(theme.b * shade)})`;
        ctx.fillRect(i * stripW, wallTop, stripW + 1, wallHeight);

        const [tr, tg, tb] = theme.trim;
        ctx.fillStyle = `rgba(${tr}, ${tg}, ${tb}, ${Math.min(1, shade * 1.15)})`;
        const trimH = Math.max(3, wallHeight * 0.055);
        ctx.fillRect(i * stripW, wallTop, stripW + 1, trimH);
        ctx.fillRect(i * stripW, wallTop + wallHeight - trimH, stripW + 1, trimH);
    }

    // 3. Depth-Sorted 3D Opponents & Explosion Particles
    const sprites = [];

    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !isPlayerActiveInRoom(opp)) continue;
        const dx = opp.x - localPlayer.x;
        const dy = opp.y - localPlayer.y;
        const dist = Math.hypot(dx, dy);
        sprites.push({ type: 'player', id, opp, dx, dy, dist });
    }

    for (let i = worldExplosions.length - 1; i >= 0; i--) {
        const p = worldExplosions[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.life -= dt * 1.4;
        if (p.life <= 0) {
            worldExplosions.splice(i, 1);
            continue;
        }
        const dx = p.x - localPlayer.x;
        const dy = p.y - localPlayer.y;
        const dist = Math.hypot(dx, dy);
        sprites.push({ type: 'particle', p, dx, dy, dist });
    }

    sprites.sort((a, b) => b.dist - a.dist);

    for (const sp of sprites) {
        let relAngle = Math.atan2(sp.dy, sp.dx) - localPlayer.angle;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;

        if (Math.abs(relAngle) > FOV * 0.68 || sp.dist < 10) continue;

        const screenX = (0.5 + relAngle / FOV) * W;

        if (sp.type === 'player') {
            const visibleByLOS = hasLineOfSight(localPlayer.x, localPlayer.y, sp.opp.x, sp.opp.y);
            if (!visibleByLOS) {
                const centerRay = Math.floor(screenX / stripW);
                const leftRay = Math.max(0, centerRay - 5);
                const rightRay = Math.min(numRays - 1, centerRay + 5);
                let anyRayOpen = false;
                for (let rIdx = leftRay; rIdx <= rightRay; rIdx++) {
                    if (zBuffer[rIdx] >= sp.dist - 14) {
                        anyRayOpen = true;
                        break;
                    }
                }
                if (!anyRayOpen) continue;
            }
        } else {
            const rayIdx = Math.floor(screenX / stripW);
            if (rayIdx >= 0 && rayIdx < numRays && zBuffer[rayIdx] < sp.dist) continue;
        }

        if (sp.type === 'particle') {
            const pScale = (TILE_SIZE * H) / sp.dist;
            const py = horizon + (sp.p.z / TILE_SIZE) * pScale;
            const radius = Math.max(2, (sp.p.size / TILE_SIZE) * pScale);
            ctx.save();
            ctx.globalAlpha = Math.max(0, sp.p.life);
            ctx.fillStyle = sp.p.color;
            ctx.beginPath();
            ctx.arc(screenX, py, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            continue;
        }

        const spriteH = Math.min(H * 1.05, Math.max(46, (TILE_SIZE * 0.88 * H) / sp.dist));
        const spriteW = spriteH * 0.65;
        const topY = horizon - spriteH * 0.42;

        const isGhostRespawning = Boolean(sp.opp.isInvulnerable);
        const isSneaky = Boolean(sp.opp.isStealth);
        const oppSuitColor = sp.opp.suitColor || getSuitColorForAvatar(sp.opp.avatar, sp.id);

        ctx.save();
        if (isGhostRespawning) {
            ctx.globalAlpha = 0.35 + 0.15 * Math.sin(performance.now() * 0.015);
        } else if (isSneaky) {
            ctx.globalAlpha = 0.48;
        }

        ctx.fillStyle = isGhostRespawning ? '#f8fafc' : '#0f172a';
        ctx.strokeStyle = isGhostRespawning ? '#ffffff' : oppSuitColor;
        ctx.lineWidth = Math.max(2.5, spriteW * 0.07);
        ctx.beginPath();
        ctx.roundRect(screenX - spriteW / 2, topY + spriteH * 0.24, spriteW, spriteH * 0.72, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isGhostRespawning ? '#e2e8f0' : oppSuitColor;
        ctx.beginPath();
        ctx.arc(screenX, topY + spriteH * 0.54, spriteW * 0.20, 0, Math.PI * 2);
        ctx.fill();

        const avatarSize = Math.max(18, Math.floor(spriteH * 0.30));
        ctx.font = `${avatarSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sp.opp.avatar || '🤖', screenX, topY + spriteH * 0.12);

        const pitchLabel = normalizePitchClass(sp.opp.noteTag || 'F#');
        const badgeW = Math.max(68, spriteW * 1.15);
        const badgeH = Math.max(28, spriteH * 0.28);
        const badgeY = Math.max(12, topY - badgeH - 12);

        ctx.shadowColor = isGhostRespawning ? '#ffffff' : '#facc15';
        ctx.shadowBlur = 12;
        ctx.fillStyle = isGhostRespawning ? '#f1f5f9' : '#facc15';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(screenX - badgeW / 2, badgeY, badgeW, badgeH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = isGhostRespawning ? '#f1f5f9' : '#facc15';
        ctx.beginPath();
        ctx.moveTo(screenX - 6, badgeY + badgeH);
        ctx.lineTo(screenX + 6, badgeY + badgeH);
        ctx.lineTo(screenX, badgeY + badgeH + 7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.font = `900 ${Math.max(16, Math.floor(badgeH * 0.68))}px sans-serif`;
        ctx.fillText(isGhostRespawning ? `👻 ${pitchLabel}` : `🎯 ${pitchLabel}`, screenX, badgeY + badgeH * 0.54);

        const oppLives = sp.opp.lives !== undefined ? Number(sp.opp.lives) : 3;
        const oppHearts = '❤️'.repeat(Math.max(0, oppLives));
        ctx.fillStyle = isGhostRespawning ? '#e2e8f0' : '#ffffff';
        ctx.font = `800 ${Math.max(11, Math.floor(spriteH * 0.13))}px sans-serif`;
        ctx.fillText(`${sp.opp.name || 'Player'} ${oppHearts}`, screenX, topY + spriteH + 12);
        ctx.restore();
    }

    // 4. First-Person Laser Beams
    for (let i = activeBeams.length - 1; i >= 0; i--) {
        const b = activeBeams[i];
        b.life -= dt * 4.5;
        if (b.life <= 0) {
            activeBeams.splice(i, 1);
            continue;
        }
        const gunTipX = W * 0.72;
        const gunTipY = H * 0.76 + localPlayer.recoil * 14;

        ctx.save();
        ctx.globalAlpha = Math.max(0, b.life);
        ctx.strokeStyle = b.glow;
        ctx.lineWidth = 12 * b.life;
        ctx.beginPath();
        ctx.moveTo(gunTipX, gunTipY);
        ctx.lineTo(b.endX, b.endY);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 * b.life;
        ctx.beginPath();
        ctx.moveTo(gunTipX, gunTipY);
        ctx.lineTo(b.endX, b.endY);
        ctx.stroke();
        ctx.restore();
    }

    // 5. First-Person Space Blaster Viewmodel
    if (localPlayer.isAlive) {
        localPlayer.recoil = Math.max(0, localPlayer.recoil - dt * 5);
        localPlayer.muzzleFlash = Math.max(0, localPlayer.muzzleFlash - dt * 8);
        localPlayer.jamFlash = Math.max(0, localPlayer.jamFlash - dt * 2.5);
        localPlayer.gearBannerFlash = Math.max(0, localPlayer.gearBannerFlash - dt * 0.6);

        const localRespawning = performance.now() < localPlayer.invulnerableUntil;
        const gunBobX = !activelyMoving ? 0 : Math.cos(localPlayer.bobPhase * 0.5) * (4 + gearMult * 2);
        const gunBobY = (!activelyMoving ? 0 : Math.abs(Math.sin(localPlayer.bobPhase * 0.5)) * (4 + gearMult * 2)) + localPlayer.recoil * 18;
        const gx = W * 0.72 + gunBobX;
        const gy = H * 0.78 + gunBobY;

        ctx.save();
        if (localRespawning) ctx.globalAlpha = 0.45;
        else if (localPlayer.currentGear.stealth) ctx.globalAlpha = 0.55;

        ctx.fillStyle = localRespawning ? '#e2e8f0' : '#1e293b';
        ctx.strokeStyle = localRespawning ? '#ffffff' : (localPlayer.jamFlash > 0 ? '#ef4444' : localPlayer.suitColor);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(gx - 22, gy + 70);
        ctx.lineTo(gx - 10, gy - 14);
        ctx.lineTo(gx + 14, gy - 14);
        ctx.lineTo(gx + 34, gy + 70);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = localRespawning ? '#ffffff' : (localPlayer.jamFlash > 0 ? '#ef4444' : localPlayer.currentGear.color);
        ctx.fillRect(gx - 4, gy + 4, 12, 8);
        ctx.fillRect(gx - 6, gy + 20, 16, 8);

        if (localPlayer.muzzleFlash > 0) {
            ctx.globalAlpha = localPlayer.muzzleFlash;
            ctx.fillStyle = localPlayer.suitColor;
            ctx.beginPath();
            ctx.arc(gx + 2, gy - 18, 22 * localPlayer.muzzleFlash, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Center Crosshair
        ctx.strokeStyle = localPlayer.currentGear.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = localPlayer.suitColor;
        ctx.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);

        // Top-Left Current Sector Badge
        const myZone = getZoneInfoForCoords(localPlayer.x, localPlayer.y);
        ctx.save();
        ctx.fillStyle = 'rgba(2, 6, 23, 0.86)';
        ctx.strokeStyle = myZone.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(12, 10, 175, 32, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = myZone.color;
        ctx.font = '900 11.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`📍 ${myZone.label}`, 99, 30);
        ctx.restore();

        if (localRespawning) {
            ctx.save();
            ctx.fillStyle = 'rgba(248, 250, 252, 0.14)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 165, 14, 330, 32, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('👻 GHOST RESPAWN SHIELD ACTIVE', W / 2, 34);
            ctx.restore();
        }

        // Bottom-Center Chord Speed Gear & Throttle HUD Pill
        const g = localPlayer.currentGear;
        const throttleText = activelyMoving ? ' • 🟢 C# THRUSTING' : ' • ⚪ HOLD C# TO MOVE';
        ctx.save();
        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.strokeStyle = g.color;
        ctx.lineWidth = localPlayer.gearBannerFlash > 0 ? 3 : 1.8;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 210, H - 56, 420, 36, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = g.color;
        ctx.font = '900 11.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`GEAR: ${g.label}${throttleText}`, W / 2, H - 39);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.fillText('C:0x • Dm:0.35x • Em:0.65x • F:1x • G:1.35x • Am:1.68x • Bdim:2x', W / 2, H - 26);
        ctx.restore();

        if (localPlayer.jamFlash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, localPlayer.jamFlash * 1.4);
            ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 155, H - 96, 310, 30, 8);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = '900 11.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⚠️ BLASTER JAMMED! Play 1 Note or White Triad', W / 2, H - 77);
            ctx.restore();
        }
    }

    // Orange Shield Flash (Hits 1 & 2) or Red Elimination Flash (3rd Hit)
    if (localPlayer.damageFlash > 0) {
        localPlayer.damageFlash = Math.max(0, localPlayer.damageFlash - dt * 1.15);
        ctx.save();
        ctx.globalAlpha = localPlayer.damageFlash * 0.72;
        ctx.fillStyle = localPlayer.damageFlashColor;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }
}

function renderSpectatorOverheadView(ctx, W, H, dt) {
    const scale = Math.min(W / (MAP_COLS * TILE_SIZE), H / (MAP_ROWS * TILE_SIZE)) * 0.92;
    const offsetX = (W - MAP_COLS * TILE_SIZE * scale) / 2;
    const offsetY = (H - MAP_ROWS * TILE_SIZE * scale) / 2;

    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            const tile = ARENA_MAP[r][c];
            if (tile === 0) {
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#1e293b';
                ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else {
                const theme = WALL_THEMES[tile] || WALL_THEMES[1];
                ctx.fillStyle = theme.mapHex;
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (!isPlayerActiveInRoom(opp)) continue;
        const oppColor = opp.isInvulnerable ? '#ffffff' : (opp.suitColor || getSuitColorForAvatar(opp.avatar, id));
        ctx.save();
        if (opp.isInvulnerable) ctx.globalAlpha = 0.45;
        ctx.fillStyle = oppColor;
        ctx.beginPath();
        ctx.arc(opp.x, opp.y, 22, 0, Math.PI * 2);
        ctx.fill();

        const oppLives = opp.lives !== undefined ? Number(opp.lives) : 3;
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${opp.name} [${opp.noteTag}] ${'❤️'.repeat(oppLives)}`, opp.x, opp.y - 30);
        ctx.restore();
    }

    for (let i = worldExplosions.length - 1; i >= 0; i--) {
        const p = worldExplosions[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.4;
        if (p.life <= 0) {
            worldExplosions.splice(i, 1);
            continue;
        }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    ctx.restore();

    if (localPlayer.damageFlash > 0) {
        localPlayer.damageFlash = Math.max(0, localPlayer.damageFlash - dt * 0.85);
        ctx.save();
        ctx.globalAlpha = localPlayer.damageFlash * 0.78;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
    ctx.fillRect(W / 2 - 220, 12, 440, 36);
    ctx.strokeStyle = '#ef4444';
    ctx.strokeRect(W / 2 - 220, 12, 440, 36);
    ctx.fillStyle = '#ef4444';
    ctx.font = '900 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💥 ELIMINATED — SPECTATOR DRONE VIEW (FULL ARENA)', W / 2, 35);
}

function gameLoop(now, bridge) {
    if (bridge.getActiveMiniGame() !== 'laserTag') {
        stopLaserTag();
        return;
    }

    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    const canvas = document.getElementById('waterfall-canvas');
    if (!canvas) return;
    ensureCanvasSized(canvas);

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    if (localPlayer.isAlive) {
        localPlayer.angle += localPlayer.turnDir * 3.1 * dt;

        localPlayer.isMovingForward = now < localPlayer.moveUntil;
        const speedMult = localPlayer.currentGear.mult;

        if (localPlayer.isMovingForward && speedMult > 0) {
            localPlayer.bobPhase += dt * (6.5 + speedMult * 5.0);

            const baseSpeed = 165;
            const speed = baseSpeed * speedMult;
            const pad = 16;
            const dx = Math.cos(localPlayer.angle) * speed * dt;
            const dy = Math.sin(localPlayer.angle) * speed * dt;

            const checkX = localPlayer.x + dx + (dx > 0 ? pad : -pad);
            const colX = Math.floor(checkX / TILE_SIZE);
            const curRow = Math.floor(localPlayer.y / TILE_SIZE);
            if (ARENA_MAP[curRow] && ARENA_MAP[curRow][colX] === 0) {
                localPlayer.x += dx;
            }

            const checkY = localPlayer.y + dy + (dy > 0 ? pad : -pad);
            const curCol = Math.floor(localPlayer.x / TILE_SIZE);
            const rowY = Math.floor(checkY / TILE_SIZE);
            if (ARENA_MAP[rowY] && ARENA_MAP[rowY][curCol] === 0) {
                localPlayer.y += dy;
            }
        }
    }

    if (localPlayer.isAlive) {
        renderFirstPerson3D(ctx, W, H, dt);
    } else {
        renderSpectatorOverheadView(ctx, W, H, dt);
    }

    // Bottom-Left Color-Coded Minimap Overlay (46x46 Arena)
    if (localPlayer.isAlive) {
        const mmSize = 156;
        const mmX = 12;
        const mmY = H - mmSize - 12;
        ctx.fillStyle = 'rgba(2, 6, 23, 0.90)';
        ctx.fillRect(mmX, mmY, mmSize, mmSize);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mmX, mmY, mmSize, mmSize);

        const scaleX = mmSize / (MAP_COLS * TILE_SIZE);
        const scaleY = mmSize / (MAP_ROWS * TILE_SIZE);

        // Render each sector's walls in its matching 3D wall color
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                const tile = ARENA_MAP[r][c];
                if (tile > 0) {
                    const theme = WALL_THEMES[tile] || WALL_THEMES[1];
                    ctx.fillStyle = theme.mapHex;
                    ctx.fillRect(mmX + c * TILE_SIZE * scaleX, mmY + r * TILE_SIZE * scaleY, TILE_SIZE * scaleX, TILE_SIZE * scaleY);
                }
            }
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const [id, opp] of Object.entries(remotePlayers)) {
            if (id === localId || !isPlayerActiveInRoom(opp)) continue;
            const ox = mmX + opp.x * scaleX;
            const oy = mmY + opp.y * scaleY;
            const oppColor = opp.isInvulnerable ? '#ffffff' : (opp.suitColor || getSuitColorForAvatar(opp.avatar, id));

            ctx.save();
            if (opp.isInvulnerable) ctx.globalAlpha = 0.45;
            else if (opp.isStealth) ctx.globalAlpha = 0.55;
            ctx.fillStyle = oppColor;
            ctx.beginPath();
            ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.font = '10px sans-serif';
            ctx.fillText(opp.avatar || '🔴', ox, oy);

            ctx.fillStyle = '#facc15';
            ctx.font = 'bold 7.5px sans-serif';
            ctx.fillText(normalizePitchClass(opp.noteTag || ''), ox, oy - 7);
            ctx.restore();
        }

        const lx = mmX + localPlayer.x * scaleX;
        const ly = mmY + localPlayer.y * scaleY;
        const myColor = (now < localPlayer.invulnerableUntil) ? '#ffffff' : localPlayer.suitColor;
        ctx.strokeStyle = localPlayer.currentGear.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(localPlayer.angle) * 14, ly + Math.sin(localPlayer.angle) * 14);
        ctx.stroke();

        ctx.fillStyle = myColor;
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Top-Right HUD
    const activePlayers = Object.values(remotePlayers).filter(isPlayerActiveInRoom);
    const aliveCount = Math.max(1, activePlayers.length);
    const heartsDisplay = '❤️'.repeat(localPlayer.lives) + '🖤'.repeat(Math.max(0, 3 - localPlayer.lives));

    ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
    ctx.fillRect(W - 355, 10, 345, 56);
    ctx.strokeStyle = localPlayer.currentGear.color;
    ctx.strokeRect(W - 355, 10, 345, 56);

    ctx.fillStyle = localPlayer.currentGear.color;
    ctx.font = '900 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${heartsDisplay} | SCORE: ${localPlayer.score} | ALIVE: ${aliveCount} | TAG: ${localPlayer.noteTag}`, W - 18, 30);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`C: Left • D: Right • Hold C#: Forward • Chords: Speed`, W - 18, 50);

    animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
}
