import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let syncIntervalId = null;
let roomUnsubscribe = null;
let lastFrameTime = 0;
let gamePhase = 'lobby'; // 'lobby' | 'playing' | 'spectating' | 'podium'

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

// 4-Note Major 7th Overcharge Chords (Wide-cone shockwave ignoring target pitch, 15s cooldown)
const OVERCHARGE_CHORDS = [
    { id: 'Cmaj7', notes: ['C', 'E', 'G', 'B'], label: 'C MAJ7 OVERCHARGE' },
    { id: 'Fmaj7', notes: ['F', 'A', 'C', 'E'], label: 'F MAJ7 OVERCHARGE' }
];

const DEFAULT_GEAR = CHORD_GEARS[3]; // F Major (1.0x Normal Speed)

// Distinct Color & Shape Themes for each Arena Sector
const WALL_THEMES = {
    1: { name: 'CYAN PERIMETER',   shape: 'box',      r: 14,  g: 116, b: 144, trim: [56, 189, 248],  mapHex: '#38bdf8' },
    2: { name: 'GOLD CURVED NW',   shape: 'curved',   r: 161, g: 118, b: 16,  trim: [250, 204, 21],  mapHex: '#facc15' },
    3: { name: 'MAGENTA TRI NE',   shape: 'triangle', r: 134, g: 25,  b: 143, trim: [232, 121, 249], mapHex: '#e879f9' },
    4: { name: 'CORAL BLOCKS SW',  shape: 'box',      r: 175, g: 56,  b: 20,  trim: [251, 146, 60],  mapHex: '#fb923c' },
    5: { name: 'COBALT DIAMOND SE',shape: 'diamond',  r: 30,  g: 64,  b: 175, trim: [96, 165, 250],  mapHex: '#60a5fa' },
    6: { name: 'EMERALD HUB',      shape: 'curved',   r: 6,   g: 110, b: 82,  trim: [52, 211, 153],  mapHex: '#34d399' }
};

// Local First-Person Player State
const localPlayer = {
    x: 0,
    y: 0,
    angle: 0,
    turnDir: 0,
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
};

// Arena Interactive Entities
let arenaPortals = [];    // 2 Random Quantum Portals
let speedBoostPads = [];  // 4 Avenue Speed Boost Pads
let medKitNodes = [];     // 3 Outer Courtyard Heart Pickups

// Kill Feed & Podium Tracking
let killFeedEntries = []; // [{ id, text, color, expiresAt }]
let seenFeedIds = new Set();
let maxPeakPlayers = 1;

// Spectator Drone Interactive Alert State
let spectatorSelectedTarget = null;
let incomingAlertBanner = null;
let processedAlertIds = new Set();
let spectatorClickListenerAttached = false;

// Hit Event Deduplication, Chord/Anti-Spam Buffer & "TEST" Typing Buffer
let processedHitIds = new Set();
let recentNoteBuffer = [];
let pendingActionTimer = null;
let lastChordTriggerTime = 0;
let lastTriggeredChordId = '';
let typedCheatBuffer = '';

// Remote Players, Beams, Explosions & Combat Bots
let remotePlayers = {};
let activeBeams = [];
let worldExplosions = [];
let activeRoomCode = null;
let localId = null;
let zBuffer = [];

let simulatedBots = {};
let globalKeyListenerAttached = false;

// 50 Contemporary 2026 Australian Teenage Male Names
const AUSSIE_2026_TEEN_BOYS = [
    "Lachlan", "Jack", "Oliver", "Noah", "William", "Leo", "Lucas", "Henry", "Charlie", "Liam",
    "Thomas", "Ethan", "Cooper", "Harrison", "Archer", "Oscar", "Hudson", "Harvey", "Darcy", "Riley",
    "Hunter", "Levi", "Flynn", "Jaxon", "Sebastian", "Isaac", "Xavier", "Beau", "Max", "Mason",
    "Bodhi", "Sonny", "Koa", "Lenny", "Archie", "Huxley", "Banjo", "Taj", "Cruz", "Angus",
    "Hamish", "Callum", "Declan", "Brodie", "Jett", "Ryder", "Kai", "Fletcher", "Ashton", "Toby"
];

const BOT_AVATARS = ['🏃', '🏄', '🚴', '🦊', '🐯', '🤖', '🛸', '🦄', '🎹', '🎧', '👨‍🎤', '😎', '🐱', '🐲', '🚀', '🥷'];

// Fast-Paced 46x46 Open Arena with Distinct Geometric Sectors
const TILE_SIZE = 64;
const MAP_COLS = 46;
const MAP_ROWS = 46;

function buildFastPacedArenaMap() {
    const grid = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(0));

    // 1. Outer Cyan Perimeter Wall (type 1)
    for (let i = 0; i < MAP_COLS; i++) {
        grid[0][i] = 1;
        grid[MAP_ROWS - 1][i] = 1;
        grid[i][0] = 1;
        grid[i][MAP_COLS - 1] = 1;
    }

    // 2. GOLD NW SECTOR: Double Concentric Curved Rotundas (type 2)
    const nwCenterR = 10, nwCenterC = 10;
    for (let r = 2; r <= 18; r++) {
        for (let c = 2; c <= 18; c++) {
            const dist = Math.hypot(r - nwCenterR, c - nwCenterC);
            const isCardinalGap = Math.abs(r - nwCenterR) <= 1 || Math.abs(c - nwCenterC) <= 1;
            const isDiagGap = Math.abs(Math.abs(r - nwCenterR) - Math.abs(c - nwCenterC)) <= 1;

            if (dist >= 6.8 && dist <= 8.1 && !isDiagGap) grid[r][c] = 2;
            if (dist >= 3.2 && dist <= 4.3 && !isCardinalGap) grid[r][c] = 2;
        }
    }
    grid[10][10] = 2;

    // 3. MAGENTA NE SECTOR: Staggered Triangular Prism Field (type 3)
    const placeTriangle = (topR, topC, flipDown = false) => {
        if (!flipDown) {
            grid[topR][topC] = 3;
            grid[topR + 1][topC - 1] = 3;
            grid[topR + 1][topC] = 3;
            grid[topR + 1][topC + 1] = 3;
            grid[topR + 2][topC - 2] = 3;
            grid[topR + 2][topC + 2] = 3;
        } else {
            grid[topR][topC - 2] = 3;
            grid[topR][topC + 2] = 3;
            grid[topR + 1][topC - 1] = 3;
            grid[topR + 1][topC] = 3;
            grid[topR + 1][topC + 1] = 3;
            grid[topR + 2][topC] = 3;
        }
    };
    placeTriangle(3, 30, false);
    placeTriangle(3, 36, true);
    placeTriangle(3, 41, false);
    placeTriangle(8, 32, true);
    placeTriangle(8, 39, false);
    placeTriangle(13, 30, false);
    placeTriangle(13, 36, true);
    placeTriangle(13, 41, false);

    // 4. CORAL SW SECTOR: Structured 2-Tile Wide Chicane Lanes (type 4)
    const swWalls = [
        [29, 3], [29, 4], [29, 5], [29, 6], [30, 6], [31, 6],
        [29, 10], [30, 10], [31, 10], [31, 11], [31, 12],
        [29, 15], [29, 16], [29, 17], [30, 15], [31, 15],
        [34, 3], [34, 4], [35, 4], [36, 4], [36, 5],
        [34, 8], [34, 9], [35, 8], [36, 8],
        [34, 13], [35, 13], [35, 14], [35, 15], [34, 17], [35, 17],
        [39, 3], [40, 3], [41, 3], [41, 4], [41, 5],
        [39, 8], [39, 9], [39, 10], [40, 10], [41, 10],
        [39, 13], [40, 13], [41, 13], [41, 14], [41, 15], [39, 17], [40, 17]
    ];
    for (const [r, c] of swWalls) grid[r][c] = 4;

    // 5. COBALT SE SECTOR: Diamond & Cross Pillar Grid (type 5)
    const placeDiamond = (cr, cc) => {
        grid[cr - 1][cc] = 5;
        grid[cr][cc - 1] = 5;
        grid[cr][cc] = 5;
        grid[cr][cc + 1] = 5;
        grid[cr + 1][cc] = 5;
    };
    placeDiamond(29, 30);
    placeDiamond(29, 35);
    placeDiamond(29, 41);
    placeDiamond(34, 32);
    placeDiamond(34, 38);
    placeDiamond(38, 29);
    placeDiamond(39, 35);
    placeDiamond(39, 41);

    // 6. MAIN BOULEVARD COVER & EMERALD CENTRAL HUB (type 6)
    const avenuePillars = [
        [4, 21], [4, 24], [9, 20], [9, 25], [14, 21], [14, 24],
        [31, 21], [31, 24], [36, 20], [36, 25], [41, 21], [41, 24],
        [21, 4], [24, 4], [20, 9], [25, 9], [21, 14], [24, 14],
        [21, 31], [24, 31], [20, 36], [25, 36], [21, 41], [24, 41]
    ];
    for (const [r, c] of avenuePillars) grid[r][c] = 1;

    grid[18][19] = 6; grid[18][20] = 6; grid[18][25] = 6; grid[18][26] = 6;
    grid[27][19] = 6; grid[27][20] = 6; grid[27][25] = 6; grid[27][26] = 6;
    grid[19][18] = 6; grid[20][18] = 6; grid[25][18] = 6; grid[26][18] = 6;
    grid[19][27] = 6; grid[20][27] = 6; grid[25][27] = 6; grid[26][27] = 6;

    grid[21][21] = 6;
    grid[21][24] = 6;
    grid[24][21] = 6;
    grid[24][24] = 6;

    return grid;
}

let ARENA_MAP = buildFastPacedArenaMap();

function setupArenaFeatures() {
    // 1. Two Randomly Generated Linked Quantum Portals
    const p1 = getSafeSpawnPoint();
    const p2 = getSafeSpawnPoint(p1.x, p1.y);
    arenaPortals = [
        { id: 'portal_alpha', name: 'ALPHA PORTAL', x: p1.x, y: p1.y, color: '#06b6d4', secondaryColor: '#a5f3fc' },
        { id: 'portal_omega', name: 'OMEGA PORTAL', x: p2.x, y: p2.y, color: '#d946ef', secondaryColor: '#f5d0fe' }
    ];

    // 2. Four Avenue Speed Boost Pads (North, South, West, East highways)
    speedBoostPads = [
        { id: 'boost_n', x: 22.5 * TILE_SIZE, y: 11.5 * TILE_SIZE, angle: Math.PI * 0.5 },
        { id: 'boost_s', x: 22.5 * TILE_SIZE, y: 33.5 * TILE_SIZE, angle: -Math.PI * 0.5 },
        { id: 'boost_w', x: 11.5 * TILE_SIZE, y: 22.5 * TILE_SIZE, angle: 0 },
        { id: 'boost_e', x: 33.5 * TILE_SIZE, y: 22.5 * TILE_SIZE, angle: Math.PI }
    ];

    // 3. Three Floating Med-Kit / Shield Recharge Nodes in Outer Zones
    const medCoords = [
        { r: 6, c: 10 },  // Gold NW outer ring
        { r: 10, c: 35 }, // Magenta NE center
        { r: 35, c: 10 }  // Coral SW center
    ];
    medKitNodes = medCoords.map((pt, idx) => ({
        id: `med_${idx}`,
        x: (pt.c + 0.5) * TILE_SIZE,
        y: (pt.r + 0.5) * TILE_SIZE,
        respawnAt: 0
    }));
}

function generateSeededArena(roomCode) {
    ARENA_MAP = buildFastPacedArenaMap();
    setupArenaFeatures();
}

function getZoneInfoForCoords(wx, wy) {
    const col = Math.floor(wx / TILE_SIZE);
    const row = Math.floor(wy / TILE_SIZE);
    if (row >= 18 && row <= 27 && col >= 18 && col <= 27) {
        return { label: 'EMERALD HUB', color: '#34d399' };
    }
    const midR = Math.floor(MAP_ROWS / 2);
    const midC = Math.floor(MAP_COLS / 2);
    if (row < midR && col < midC) return { label: 'GOLD CURVED NW', color: '#facc15' };
    if (row < midR && col >= midC) return { label: 'MAGENTA TRIANGLE NE', color: '#e879f9' };
    if (row >= midR && col < midC) return { label: 'CORAL CHICANE SW', color: '#fb923c' };
    return { label: 'COBALT DIAMOND SE', color: '#60a5fa' };
}

function addKillFeedEntry(id, text, color = '#facc15') {
    if (!id || seenFeedIds.has(id)) return;
    seenFeedIds.add(id);
    killFeedEntries.unshift({
        id,
        text,
        color,
        expiresAt: performance.now() + 6500
    });
    if (killFeedEntries.length > 4) killFeedEntries.pop();
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

function matchOverchargeChord(pitchSet) {
    if (pitchSet.size !== 4) return null;
    for (const oc of OVERCHARGE_CHORDS) {
        if (oc.notes.every(n => pitchSet.has(n))) {
            return oc;
        }
    }
    return null;
}

function isPlayerActiveInRoom(p) {
    if (!p || p.isAlive === false) return false;
    return typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y);
}

// ==========================================
// WEB AUDIO SYNTH EFFECTS
// ==========================================
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

function playOverchargeBlastSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(1600, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(65, now + 0.42);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
    } catch (e) {}
}

function playHitMarkerTick() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1950, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
    } catch (e) {}
}

function playSpeedBoostSweep() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(1180, now + 0.25);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.28);
    } catch (e) {}
}

function playMedKitHealChime() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.07);
        osc.frequency.setValueAtTime(1046.50, now + 0.14);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.31);
    } catch (e) {}
}

function playPortalWarpSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(1280, now + 0.22);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.38);
        gain.gain.setValueAtTime(0.20, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.42);
    } catch (e) {}
}

function playRadioAlertChime() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(740, now);
        osc.frequency.setValueAtTime(987.77, now + 0.09);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
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
    let best = { x: TILE_SIZE * 22.5, y: TILE_SIZE * 22.5 };
    let bestDist = -1;

    for (let attempt = 0; attempt < 180; attempt++) {
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
            if (d > TILE_SIZE * 16) return best;
        }
    }
    return best;
}

async function spawn50CombatBots() {
    if (!activeRoomCode || !window.firebaseDb) return;

    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    const basePath = `pianopad_tournaments/${activeRoomCode}/lasertag`;
    const updates = {};

    const batchStamp = Date.now() % 10000;
    const shuffledNames = [...AUSSIE_2026_TEEN_BOYS].sort(() => Math.random() - 0.5);

    for (let i = 0; i < 50; i++) {
        const botId = `bot_2026_${batchStamp}_${i + 1}`;
        const name = shuffledNames[i % shuffledNames.length];
        const avatar = BOT_AVATARS[i % BOT_AVATARS.length];
        const pos = getSafeSpawnPoint();
        const pitch = ASSIGNABLE_PITCHES[i % ASSIGNABLE_PITCHES.length];
        const suitColor = getSuitColorForAvatar(avatar, botId);

        const botData = {
            id: botId,
            name: name,
            avatar: avatar,
            x: Number(pos.x.toFixed(1)),
            y: Number(pos.y.toFixed(1)),
            angle: Math.random() * Math.PI * 2,
            lives: 3,
            hitsTaken: 0,
            eliminations: 0,
            isAlive: true,
            isStealth: false,
            isInvulnerable: false,
            suitColor: suitColor,
            noteTag: pitch,
            score: 0,
            isBot: true,
            turnTimer: Math.random() * 2.0,
            fireCooldown: 1.5 + Math.random() * 3.0
        };

        simulatedBots[botId] = botData;
        updates[botId] = botData;
    }

    await update(window.firebaseRef(window.firebaseDb, basePath), updates);

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🤖 TEST MODE ACTIVATED: 50 Aussie Teen Combat Bots spawned and fighting in the arena!`;
    }
}

function updateSimulatedBots(dt) {
    const botList = Object.values(simulatedBots);
    if (botList.length === 0) return;

    const speed = 160;
    const pad = 12;
    const now = performance.now();

    for (const bot of botList) {
        const serverBot = remotePlayers[bot.id];
        if (serverBot && serverBot.lastHitEvent && serverBot.lastHitEvent.id !== bot.lastProcessedHit) {
            bot.lastProcessedHit = serverBot.lastHitEvent.id;
            bot.hitsTaken += 1;
            bot.lives = Math.max(0, 3 - bot.hitsTaken);
            if (bot.lives <= 0) {
                bot.isAlive = false;
                spawn3DExplosion(bot.x, bot.y, '#ef4444', 24);
            } else {
                const respawn = getSafeSpawnPoint(bot.x, bot.y);
                bot.x = respawn.x;
                bot.y = respawn.y;
                bot.invulnerableUntil = now + 3500;
            }
        }

        if (!bot.isAlive) continue;
        bot.isInvulnerable = now < (bot.invulnerableUntil || 0);

        if (arenaPortals.length === 2 && now >= (bot.portalCooldown || 0)) {
            for (let pIdx = 0; pIdx < 2; pIdx++) {
                const p = arenaPortals[pIdx];
                if (Math.hypot(bot.x - p.x, bot.y - p.y) < 34) {
                    const dest = arenaPortals[pIdx === 0 ? 1 : 0];
                    bot.x = dest.x;
                    bot.y = dest.y;
                    bot.portalCooldown = now + 3000;
                    break;
                }
            }
        }

        bot.turnTimer -= dt;
        if (bot.turnTimer <= 0) {
            bot.angle += (Math.random() - 0.5) * Math.PI * 0.9;
            bot.turnTimer = 1.4 + Math.random() * 2.4;
        }

        const dx = Math.cos(bot.angle) * speed * dt;
        const dy = Math.sin(bot.angle) * speed * dt;
        const colX = Math.floor((bot.x + dx + (dx > 0 ? pad : -pad)) / TILE_SIZE);
        const curRow = Math.floor(bot.y / TILE_SIZE);
        const rowY = Math.floor((bot.y + dy + (dy > 0 ? pad : -pad)) / TILE_SIZE);
        const curCol = Math.floor(bot.x / TILE_SIZE);

        let blocked = true;
        if (ARENA_MAP[curRow] && ARENA_MAP[curRow][colX] === 0) {
            bot.x += dx;
            blocked = false;
        }
        if (ARENA_MAP[rowY] && ARENA_MAP[rowY][curCol] === 0) {
            bot.y += dy;
            blocked = false;
        }
        if (blocked) {
            bot.angle += (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2);
        }

        bot.fireCooldown = (bot.fireCooldown || 2.0) - dt;
        if (bot.fireCooldown <= 0) {
            bot.fireCooldown = 2.2 + Math.random() * 3.5;

            for (const otherBot of botList) {
                if (otherBot.id === bot.id || !otherBot.isAlive || otherBot.isInvulnerable) continue;
                const d = Math.hypot(otherBot.x - bot.x, otherBot.y - bot.y);
                if (d < 420 && hasLineOfSight(bot.x, bot.y, otherBot.x, otherBot.y)) {
                    otherBot.hitsTaken += 1;
                    otherBot.lives = Math.max(0, 3 - otherBot.hitsTaken);
                    bot.score += 50;
                    const feedId = `bot_hit_${bot.id}_${otherBot.id}_${Math.floor(now / 500)}`;
                    if (otherBot.lives <= 0) {
                        otherBot.isAlive = false;
                        bot.score += 100;
                        bot.eliminations = (bot.eliminations || 0) + 1;
                        spawn3DExplosion(otherBot.x, otherBot.y, '#ef4444', 20);
                        addKillFeedEntry(feedId, `💥 ${bot.name} [${otherBot.noteTag}] eliminated ${otherBot.name}`, '#ef4444');
                    } else {
                        const rp = getSafeSpawnPoint(otherBot.x, otherBot.y);
                        otherBot.x = rp.x;
                        otherBot.y = rp.y;
                        otherBot.invulnerableUntil = now + 3500;
                        spawn3DExplosion(otherBot.x, otherBot.y, '#f97316', 12);
                        addKillFeedEntry(feedId, `🔥 ${bot.name} [${otherBot.noteTag}] tagged ${otherBot.name}`, '#fb923c');
                    }
                    break;
                }
            }
        }
    }
}

async function sendSpectatorDroneAlert(targetPlayerId, targetName, messageText) {
    if (!activeRoomCode || !window.firebaseDb || !targetPlayerId) return;

    playRadioAlertChime();
    const state = window._laserTagBridge && window._laserTagBridge.getState ? window._laserTagBridge.getState() : {};
    const senderName = state.sessionStudentName || 'Spectator';

    try {
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const basePath = `pianopad_tournaments/${activeRoomCode}/lasertag`;
        await update(window.firebaseRef(window.firebaseDb, `${basePath}/${targetPlayerId}`), {
            spectatorAlert: {
                id: `${localId}_${Date.now()}_${Math.floor(Math.random() * 999)}`,
                text: messageText,
                fromName: senderName,
                timestamp: Date.now()
            }
        });
    } catch (e) {}

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `📡 SENT ALERT TO ${targetName.toUpperCase()}: "${messageText}"`;
    }
    spectatorSelectedTarget = null;
}

function handleSpectatorCanvasClick(e) {
    if (gamePhase !== 'spectating' || localPlayer.isAlive) return;

    const canvas = document.getElementById('waterfall-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleCanvasX = canvas.width / rect.width;
    const scaleCanvasY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleCanvasX;
    const clickY = (e.clientY - rect.top) * scaleCanvasY;

    if (spectatorSelectedTarget && spectatorSelectedTarget.buttons) {
        for (const btn of spectatorSelectedTarget.buttons) {
            if (clickX >= btn.x && clickX <= btn.x + btn.w && clickY >= btn.y && clickY <= btn.y + btn.h) {
                sendSpectatorDroneAlert(spectatorSelectedTarget.id, spectatorSelectedTarget.name, btn.msg);
                return;
            }
        }
    }

    const W = canvas.width;
    const H = canvas.height;
    const mapScale = Math.min(W / (MAP_COLS * TILE_SIZE), H / (MAP_ROWS * TILE_SIZE)) * 0.92;
    const offsetX = (W - MAP_COLS * TILE_SIZE * mapScale) / 2;
    const offsetY = (H - MAP_ROWS * TILE_SIZE * mapScale) / 2;

    let closestPlayer = null;
    let closestDist = 36;

    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (!isPlayerActiveInRoom(opp)) continue;
        const px = offsetX + opp.x * mapScale;
        const py = offsetY + opp.y * mapScale;
        const d = Math.hypot(clickX - px, clickY - py);
        if (d < closestDist) {
            closestDist = d;
            closestPlayer = { id, name: opp.name || 'Player', screenX: px, screenY: py };
        }
    }

    spectatorSelectedTarget = closestPlayer;
    if (closestPlayer) playRadioAlertChime();
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
    typedCheatBuffer = '';
    processedHitIds.clear();
    processedAlertIds.clear();
    seenFeedIds.clear();
    killFeedEntries = [];
    simulatedBots = {};
    spectatorSelectedTarget = null;
    incomingAlertBanner = null;
    maxPeakPlayers = 1;
    gamePhase = 'lobby';
}

export async function startLaserTag(bridge, autoRoomCode = null, isHost = false) {
    initAudio();
    stopLaserTag();

    window._laserTagBridge = bridge;

    if (!globalKeyListenerAttached) {
        globalKeyListenerAttached = true;
        window.addEventListener('keydown', (e) => {
            if (gamePhase !== 'playing' && gamePhase !== 'spectating') return;
            if (e.key && e.key.length === 1) {
                typedCheatBuffer = (typedCheatBuffer + e.key).slice(-8);
                if (typedCheatBuffer.toLowerCase().endsWith('test')) {
                    typedCheatBuffer = '';
                    spawn50CombatBots();
                }
            }
        });
    }

    if (!spectatorClickListenerAttached) {
        const canvasEl = document.getElementById('waterfall-canvas');
        if (canvasEl) {
            spectatorClickListenerAttached = true;
            canvasEl.addEventListener('click', handleSpectatorCanvasClick);
        }
    }

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
    localPlayer.eliminations = 0;
    localPlayer.isAlive = true;
    localPlayer.currentGear = DEFAULT_GEAR;
    localPlayer.invulnerableUntil = 0;
    localPlayer.portalCooldownUntil = 0;
    localPlayer.boostUntil = 0;
    localPlayer.overchargeReadyAt = 0;
    localPlayer.hitMarkerUntil = 0;
    localPlayer.hitMarkerElim = false;
    localPlayer.suitColor = getSuitColorForAvatar(avatar, localId);
    localPlayer.score = 0;
    localPlayer.noteTag = ASSIGNABLE_PITCHES[Math.floor(Math.random() * ASSIGNABLE_PITCHES.length)];
    localPlayer.bobPhase = 0;
    localPlayer.recoil = 0;
    localPlayer.muzzleFlash = 0;
    localPlayer.damageFlash = 0;
    localPlayer.damageFlashColor = '#f97316';
    localPlayer.portalFlash = 0;
    localPlayer.jamFlash = 0;
    localPlayer.gearBannerFlash = 1.0;

    activeBeams = [];
    worldExplosions = [];
    remotePlayers = {};
    recentNoteBuffer = [];
    processedHitIds.clear();
    processedAlertIds.clear();
    seenFeedIds.clear();
    killFeedEntries = [];
    maxPeakPlayers = 1;
    gamePhase = 'playing';
    lastFrameTime = performance.now();

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🛸 3D LASER TAG! Shield: [${localPlayer.noteTag}] | Hold C#: Forward • C/D: Turn • Triads: Speed • Cmaj7/Fmaj7: Shockwave!`;
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
            eliminations: 0,
            isAlive: true,
            gearId: localPlayer.currentGear.id,
            isStealth: localPlayer.currentGear.stealth,
            isInvulnerable: false,
            suitColor: localPlayer.suitColor,
            noteTag: localPlayer.noteTag,
            score: 0,
            name: state.sessionStudentName || 'Player',
            avatar: avatar,
            lastHitEvent: null,
            spectatorAlert: null
        });
        if (window.firebaseOnDisconnect) {
            window.firebaseOnDisconnect(myPlayerRef).remove();
        }

        const roomRef = window.firebaseRef(window.firebaseDb, basePath);
        roomUnsubscribe = onValue(roomRef, (snapshot) => {
            const data = snapshot.val() || {};
            remotePlayers = data;

            // Populate Kill Feed from all players' latest hit events
            for (const [pid, pObj] of Object.entries(remotePlayers)) {
                if (pObj && pObj.lastHitEvent && pObj.lastHitEvent.id) {
                    const ev = pObj.lastHitEvent;
                    const verb = ev.eliminated ? '💥 eliminated' : '🔥 tagged';
                    addKillFeedEntry(
                        ev.id,
                        `${ev.byName || 'Player'} [${ev.pitch || '?'}] ${verb} ${pObj.name || 'Opponent'}`,
                        ev.eliminated ? '#ef4444' : '#fb923c'
                    );
                }
            }

            const myServerRecord = remotePlayers[localId];
            if (!myServerRecord || !localPlayer.isAlive) return;

            const alertEvt = myServerRecord.spectatorAlert;
            if (alertEvt && alertEvt.id && !processedAlertIds.has(alertEvt.id)) {
                processedAlertIds.add(alertEvt.id);
                incomingAlertBanner = {
                    text: alertEvt.text,
                    fromName: alertEvt.fromName || 'Teammate',
                    until: performance.now() + 3400
                };
                playRadioAlertChime();
            }

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
                        statusEl.textContent = `💥 ELIMINATED! Click any player on the Spectator Map to send "Watch Out", "Turn Left", or "Turn Right"!`;
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
            if (bridge.getActiveMiniGame() !== 'laserTag') return;

            if (localPlayer.isAlive) {
                const isInvuln = performance.now() < localPlayer.invulnerableUntil;
                update(myPlayerRef, {
                    x: Number(localPlayer.x.toFixed(1)),
                    y: Number(localPlayer.y.toFixed(1)),
                    angle: Number(localPlayer.angle.toFixed(3)),
                    lives: localPlayer.lives,
                    hitsTaken: localPlayer.hitsTaken,
                    eliminations: localPlayer.eliminations,
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
            }

            if (Object.keys(simulatedBots).length > 0) {
                const botBatch = {};
                for (const bot of Object.values(simulatedBots)) {
                    botBatch[`${bot.id}/x`] = Number(bot.x.toFixed(1));
                    botBatch[`${bot.id}/y`] = Number(bot.y.toFixed(1));
                    botBatch[`${bot.id}/angle`] = Number(bot.angle.toFixed(3));
                    botBatch[`${bot.id}/lives`] = bot.lives;
                    botBatch[`${bot.id}/hitsTaken`] = bot.hitsTaken;
                    botBatch[`${bot.id}/eliminations`] = bot.eliminations || 0;
                    botBatch[`${bot.id}/isAlive`] = bot.isAlive;
                    botBatch[`${bot.id}/isInvulnerable`] = Boolean(bot.isInvulnerable);
                    botBatch[`${bot.id}/score`] = bot.score;
                }
                update(window.firebaseRef(window.firebaseDb, basePath), botBatch).catch(() => {});
            }
        }, 120);
    } catch (err) {
        console.error("Laser Tag Firebase sync error:", err);
    }
}

async function fireLaserAttack(pitchClass, bridge, isOvercharge = false) {
    if (gamePhase !== 'playing' || !localPlayer.isAlive) return;

    if (isOvercharge) {
        playOverchargeBlastSound();
    } else {
        playLaserPew();
    }
    localPlayer.recoil = isOvercharge ? 1.6 : 1.0;
    localPlayer.muzzleFlash = 1.0;

    const FOV = Math.PI / 3;
    const maxCone = isOvercharge ? FOV * 0.85 : FOV * 0.62;
    let bestTarget = null;
    let bestDist = 1400;

    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !isPlayerActiveInRoom(opp) || opp.isInvulnerable) continue;
        if (!isOvercharge && normalizePitchClass(opp.noteTag) !== pitchClass) continue;

        const dx = opp.x - localPlayer.x;
        const dy = opp.y - localPlayer.y;
        const dist = Math.hypot(dx, dy);
        if (dist > bestDist) continue;

        let relAngle = Math.atan2(dy, dx) - localPlayer.angle;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;

        if (Math.abs(relAngle) <= maxCone && hasLineOfSight(localPlayer.x, localPlayer.y, opp.x, opp.y)) {
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

        // Feature #4: Crisp Hit-Marker Crosshair Snap & High Tick
        localPlayer.hitMarkerUntil = performance.now() + 260;
        localPlayer.hitMarkerElim = eliminated;
        playHitMarkerTick();

        activeBeams.push({
            endX: targetScreenX,
            endY: targetScreenY,
            color: isOvercharge ? '#facc15' : (eliminated ? '#ef4444' : '#f97316'),
            glow: isOvercharge ? '#fef08a' : (eliminated ? '#dc2626' : '#fb923c'),
            widthMult: isOvercharge ? 2.2 : 1.0,
            life: 1.0
        });

        if (eliminated) {
            playExplosionSound();
            spawn3DExplosion(bestTarget.opp.x, bestTarget.opp.y, '#ef4444', 36);
            localPlayer.score += 150;
            localPlayer.eliminations += 1;
        } else {
            playShieldHitSound();
            spawn3DExplosion(bestTarget.opp.x, bestTarget.opp.y, '#f97316', 20);
            localPlayer.score += 50;
        }

        const state = bridge && bridge.getState ? bridge.getState() : {};
        const hitEventId = `${localId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const tagLabel = isOvercharge ? 'MAJ7⚡' : pitchClass;

        addKillFeedEntry(
            hitEventId,
            `${state.sessionStudentName || 'You'} [${tagLabel}] ${eliminated ? '💥 eliminated' : '🔥 tagged'} ${bestTarget.opp.name || 'Opponent'}`,
            eliminated ? '#ef4444' : '#fb923c'
        );

        try {
            const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
            const basePath = `pianopad_tournaments/${activeRoomCode}/lasertag`;
            await update(window.firebaseRef(window.firebaseDb, `${basePath}/${bestTarget.id}`), {
                lastHitEvent: {
                    id: hitEventId,
                    byId: localId,
                    byName: state.sessionStudentName || 'Opponent',
                    pitch: tagLabel,
                    eliminated: eliminated,
                    timestamp: Date.now()
                }
            });
        } catch (e) {}

        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = eliminated
                ? `💥 ELIMINATED ${bestTarget.opp.name || 'Opponent'} with [${tagLabel}]! (+150 pts • Score: ${localPlayer.score})`
                : `🔥 HIT ${bestTarget.opp.name || 'Opponent'} (${predictedRemaining} ${predictedRemaining === 1 ? 'life' : 'lives'} left) — they respawned! (+50 pts)`;
        }
    } else {
        // Feature #9: 3D Laser Wall Ricochet Sparks at exact wall impact point
        const wallHit = castRay(localPlayer.angle);
        const impactDist = Math.max(16, wallHit.dist - 8);
        const impactX = localPlayer.x + Math.cos(localPlayer.angle) * impactDist;
        const impactY = localPlayer.y + Math.sin(localPlayer.angle) * impactDist;
        const sparkColor = isOvercharge ? '#facc15' : (localPlayer.suitColor || '#38bdf8');
        spawn3DExplosion(impactX, impactY, sparkColor, isOvercharge ? 16 : 7);

        activeBeams.push({
            endX: W * 0.5,
            endY: H * 0.5,
            color: sparkColor,
            glow: isOvercharge ? '#f59e0b' : '#0284c7',
            widthMult: isOvercharge ? 2.2 : 1.0,
            life: 1.0
        });
    }
}

async function executeSingleNoteAction(pitchClass, bridge) {
    if (gamePhase !== 'playing' || !localPlayer.isAlive) return;

    if (pitchClass === 'C') {
        localPlayer.turnDir = -1;
        setTimeout(() => { if (localPlayer.turnDir === -1) localPlayer.turnDir = 0; }, 220);
        return;
    }

    if (pitchClass === 'D') {
        localPlayer.turnDir = 1;
        setTimeout(() => { if (localPlayer.turnDir === 1) localPlayer.turnDir = 0; }, 220);
        return;
    }

    if (pitchClass === 'C#') {
        localPlayer.moveUntil = performance.now() + 220;
        return;
    }

    await fireLaserAttack(pitchClass, bridge, false);
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
    recentNoteBuffer = recentNoteBuffer.filter(item => (now - item.time) <= 115);

    const distinctPitches = new Set(recentNoteBuffer.map(item => item.pitchClass));

    // Feature #6: 4-Note Overcharge Shockwave (Cmaj7 or Fmaj7)
    const matchedOvercharge = matchOverchargeChord(distinctPitches);
    if (matchedOvercharge) {
        if (pendingActionTimer !== null) {
            clearTimeout(pendingActionTimer);
            pendingActionTimer = null;
        }
        recentNoteBuffer = [];

        if (now >= localPlayer.overchargeReadyAt) {
            localPlayer.overchargeReadyAt = now + 15000; // 15s cooldown
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.textContent = `⚡ ${matchedOvercharge.label} FIRED! Wide-cone shockwave hits ANY target pitch! (15s recharge)`;
            }
            await fireLaserAttack('OVERCHARGE', bridge, true);
        } else {
            const secsLeft = Math.ceil((localPlayer.overchargeReadyAt - now) / 1000);
            playJamBuzzSound();
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.textContent = `⏳ OVERCHARGE RECHARGING (${secsLeft}s remaining)...`;
            }
        }
        return;
    }

    // Check 3-note White-Key Diatonic Triads for Speed Gears
    const matchedGear = matchDiatonicTriad(distinctPitches);
    if (matchedGear) {
        if (pendingActionTimer !== null) {
            clearTimeout(pendingActionTimer);
            pendingActionTimer = null;
        }
        // Keep buffer alive briefly in case a 4th note (B or E) arrives within 45ms to complete Cmaj7/Fmaj7
        if (pendingActionTimer !== null) clearTimeout(pendingActionTimer);
        pendingActionTimer = setTimeout(() => {
            pendingActionTimer = null;
            recentNoteBuffer = [];
            if ((performance.now() - lastChordTriggerTime) > 350 || lastTriggeredChordId !== matchedGear.id) {
                lastChordTriggerTime = performance.now();
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
        }, 50);
        return;
    }

    // Anti-Spam Protection (allows 2-3 white keys briefly while building a triad or Major 7th chord)
    if (distinctPitches.size >= 2) {
        const WHITE_KEYS = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
        const allWhite = Array.from(distinctPitches).every(n => WHITE_KEYS.has(n));

        if (allWhite && (distinctPitches.size === 2 || distinctPitches.size === 3)) {
            if (pendingActionTimer !== null) clearTimeout(pendingActionTimer);
            pendingActionTimer = setTimeout(() => {
                pendingActionTimer = null;
                localPlayer.jamFlash = 1.0;
                playJamBuzzSound();
                recentNoteBuffer = [];
            }, 95);
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
        const activeNotes = recentNoteBuffer.filter(item => (checkNow - item.time) <= 120);
        const uniqueNow = new Set(activeNotes.map(item => item.pitchClass));
        if (uniqueNow.size === 1) {
            const singlePitch = Array.from(uniqueNow)[0];
            recentNoteBuffer = [];
            executeSingleNoteAction(singlePitch, bridge);
        }
    }, 80);
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
            break;
        }

        const cellType = ARENA_MAP[mapY][mapX];
        if (cellType > 0) {
            const theme = WALL_THEMES[cellType] || WALL_THEMES[1];

            if (theme.shape === 'curved') {
                const cx = (mapX + 0.5) * TILE_SIZE;
                const cy = (mapY + 0.5) * TILE_SIZE;
                const radius = TILE_SIZE * 0.48;
                const ocX = localPlayer.x - cx;
                const ocY = localPlayer.y - cy;
                const b = ocX * cos + ocY * sin;
                const c = ocX * ocX + ocY * ocY - radius * radius;
                const disc = b * b - c;
                if (disc >= 0) {
                    const t = -b - Math.sqrt(disc);
                    if (t > 1) {
                        const hitX = localPlayer.x + cos * t;
                        const hitY = localPlayer.y + sin * t;
                        const normAngle = Math.atan2(hitY - cy, hitX - cx);
                        const curveShade = 0.65 + 0.35 * Math.cos(normAngle - 0.8);
                        return { dist: t, side: 0, wallType: cellType, customShade: curveShade, stripeCoord: (normAngle + Math.PI) / (Math.PI * 2) };
                    }
                }
                continue;
            }

            if (theme.shape === 'triangle') {
                const boxDist = (side === 0 ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY)) * TILE_SIZE;
                const hitX = localPlayer.x + cos * boxDist;
                const hitY = localPlayer.y + sin * boxDist;
                const localU = (hitX - mapX * TILE_SIZE) / TILE_SIZE;
                const localV = (hitY - mapY * TILE_SIZE) / TILE_SIZE;
                const diagDist = boxDist + Math.abs(localU - localV) * TILE_SIZE * 0.35;
                return { dist: Math.max(1, diagDist), side, wallType: cellType, customShade: side === 0 ? 1.0 : 0.72, stripeCoord: (localU + localV) * 0.5 };
            }

            if (theme.shape === 'diamond') {
                const boxDist = (side === 0 ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY)) * TILE_SIZE;
                const hitX = localPlayer.x + cos * boxDist;
                const hitY = localPlayer.y + sin * boxDist;
                const localU = Math.abs((hitX - mapX * TILE_SIZE) / TILE_SIZE - 0.5);
                const localV = Math.abs((hitY - mapY * TILE_SIZE) / TILE_SIZE - 0.5);
                const diamondDist = boxDist + (localU + localV) * TILE_SIZE * 0.28;
                return { dist: Math.max(1, diamondDist), side, wallType: cellType, customShade: 0.92 - (localU + localV) * 0.3, stripeCoord: localU + localV };
            }

            hit = cellType;
        }
    }

    const perpWallDist = (side === 0 ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY)) * TILE_SIZE;
    const hitX = localPlayer.x + cos * perpWallDist;
    const hitY = localPlayer.y + sin * perpWallDist;
    const wallU = side === 0 ? ((hitY % TILE_SIZE) / TILE_SIZE) : ((hitX % TILE_SIZE) / TILE_SIZE);

    return {
        dist: Math.max(1, perpWallDist),
        side,
        wallType: hit,
        customShade: side === 1 ? 0.78 : 1.0,
        stripeCoord: wallU
    };
}

// Feature #7: Top-Center Compass Ribbon
function renderCompassRibbon(ctx, W) {
    const compW = 240;
    const compH = 24;
    const cx = W / 2;
    const topY = 8;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - compW / 2, topY, compW, compH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(cx - compW / 2 + 4, topY, compW - 8, compH);
    ctx.clip();

    const bearings = [
        { deg: 0,   label: 'E',  major: true },
        { deg: 45,  label: 'SE', major: false },
        { deg: 90,  label: 'S',  major: true },
        { deg: 135, label: 'SW', major: false },
        { deg: 180, label: 'W',  major: true },
        { deg: 225, label: 'NW', major: false },
        { deg: 270, label: 'N',  major: true },
        { deg: 315, label: 'NE', major: false }
    ];

    let curDeg = ((localPlayer.angle * 180) / Math.PI) % 360;
    if (curDeg < 0) curDeg += 360;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const b of bearings) {
        let diff = b.deg - curDeg;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;

        if (Math.abs(diff) <= 75) {
            const px = cx + (diff / 75) * (compW * 0.46);
            ctx.fillStyle = b.label === 'N' ? '#ef4444' : (b.major ? '#38bdf8' : '#94a3b8');
            ctx.font = b.major ? '900 11px sans-serif' : 'bold 9.5px sans-serif';
            ctx.fillText(b.label, px, topY + compH / 2 + 1);
        }
    }

    // Center pointer tick
    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx - 1, topY, 2, 5);
    ctx.restore();
}

// Feature #1: Proximity Threat Radar (Rear/Flank Edge Glow)
function renderProximityThreatRadar(ctx, W, H, now) {
    let leftThreat = 0;
    let rightThreat = 0;
    let rearThreat = 0;
    const maxRange = 270;

    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !isPlayerActiveInRoom(opp) || opp.isInvulnerable) continue;
        const dx = opp.x - localPlayer.x;
        const dy = opp.y - localPlayer.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxRange) continue;

        const intensity = 1 - dist / maxRange;
        let rel = Math.atan2(dy, dx) - localPlayer.angle;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;

        // Only warn about enemies outside our front center vision (flanks & rear)
        if (Math.abs(rel) > Math.PI * 0.28) {
            if (Math.abs(rel) > Math.PI * 0.72) {
                rearThreat = Math.max(rearThreat, intensity);
            } else if (rel < 0) {
                leftThreat = Math.max(leftThreat, intensity);
            } else {
                rightThreat = Math.max(rightThreat, intensity);
            }
        }
    }

    const pulse = 0.65 + 0.35 * Math.sin(now * 0.015);
    ctx.save();
    if (leftThreat > 0.05) {
        const gradL = ctx.createLinearGradient(0, 0, 48, 0);
        gradL.addColorStop(0, `rgba(239, 68, 68, ${leftThreat * 0.65 * pulse})`);
        gradL.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = gradL;
        ctx.fillRect(0, 0, 48, H);
    }
    if (rightThreat > 0.05) {
        const gradR = ctx.createLinearGradient(W, 0, W - 48, 0);
        gradR.addColorStop(0, `rgba(239, 68, 68, ${rightThreat * 0.65 * pulse})`);
        gradR.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = gradR;
        ctx.fillRect(W - 48, 0, 48, H);
    }
    if (rearThreat > 0.05) {
        const gradB = ctx.createLinearGradient(0, H, 0, H - 44);
        gradB.addColorStop(0, `rgba(249, 115, 22, ${rearThreat * 0.75 * pulse})`);
        gradB.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = gradB;
        ctx.fillRect(0, H - 44, W, 44);
    }
    ctx.restore();
}

function renderFirstPerson3D(ctx, W, H, dt, now) {
    const FOV = Math.PI / 3;
    const isBoosted = now < localPlayer.boostUntil;
    const gearMult = localPlayer.currentGear.mult * (isBoosted ? 1.5 : 1.0);
    const activelyMoving = localPlayer.isMovingForward && gearMult > 0;
    const bobAmp = activelyMoving ? Math.min(8, 2.5 + gearMult * 2.0) : 0;
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

    // 2. Raycast 3D Color-Coded & Geometrically Distinct Sector Walls
    const numRays = Math.min(340, Math.floor(W / 2.8));
    const stripW = W / numRays;
    zBuffer = new Array(numRays);

    for (let i = 0; i < numRays; i++) {
        const rayAngle = (localPlayer.angle - FOV / 2) + (i / numRays) * FOV;
        const hit = castRay(rayAngle);
        const correctedDist = hit.dist * Math.cos(rayAngle - localPlayer.angle);
        zBuffer[i] = correctedDist;

        const wallHeight = Math.min(H * 1.6, (TILE_SIZE * H) / Math.max(1, correctedDist));
        const wallTop = horizon - wallHeight / 2;

        const distShade = Math.max(0.18, 1 - correctedDist / 1450);
        const shade = distShade * (hit.customShade || 1.0);
        const theme = WALL_THEMES[hit.wallType] || WALL_THEMES[1];

        ctx.fillStyle = `rgb(${Math.floor(theme.r * shade)}, ${Math.floor(theme.g * shade)}, ${Math.floor(theme.b * shade)})`;
        ctx.fillRect(i * stripW, wallTop, stripW + 1, wallHeight);

        const [tr, tg, tb] = theme.trim;
        const trimAlpha = Math.min(1, distShade * 1.15);
        ctx.fillStyle = `rgba(${tr}, ${tg}, ${tb}, ${trimAlpha})`;

        const trimH = Math.max(3, wallHeight * 0.055);
        ctx.fillRect(i * stripW, wallTop, stripW + 1, trimH);
        ctx.fillRect(i * stripW, wallTop + wallHeight - trimH, stripW + 1, trimH);

        if (theme.shape === 'triangle') {
            const diagY = wallTop + wallHeight * (0.25 + 0.5 * Math.abs((hit.stripeCoord % 1) - 0.5));
            ctx.fillRect(i * stripW, diagY, stripW + 1, Math.max(2, trimH * 0.75));
        } else if (theme.shape === 'diamond') {
            const midBandY = wallTop + wallHeight * 0.48;
            ctx.fillRect(i * stripW, midBandY, stripW + 1, Math.max(2, trimH * 0.85));
        }
    }

    // 3. Depth-Sorted 3D Sprites (Opponents, Portals, Boost Pads, Med-Kits, Explosion Sparks)
    const sprites = [];

    for (const portal of arenaPortals) {
        const dx = portal.x - localPlayer.x;
        const dy = portal.y - localPlayer.y;
        sprites.push({ type: 'portal', portal, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const pad of speedBoostPads) {
        const dx = pad.x - localPlayer.x;
        const dy = pad.y - localPlayer.y;
        sprites.push({ type: 'boostpad', pad, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const med of medKitNodes) {
        if (now < med.respawnAt) continue;
        const dx = med.x - localPlayer.x;
        const dy = med.y - localPlayer.y;
        sprites.push({ type: 'medkit', med, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !isPlayerActiveInRoom(opp)) continue;
        const dx = opp.x - localPlayer.x;
        const dy = opp.y - localPlayer.y;
        sprites.push({ type: 'player', id, opp, dx, dy, dist: Math.hypot(dx, dy) });
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
        sprites.push({ type: 'particle', p, dx, dy, dist: Math.hypot(dx, dy) });
    }

    sprites.sort((a, b) => b.dist - a.dist);

    for (const sp of sprites) {
        let relAngle = Math.atan2(sp.dy, sp.dx) - localPlayer.angle;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;

        if (Math.abs(relAngle) > FOV * 0.68 || sp.dist < 10) continue;

        const screenX = (0.5 + relAngle / FOV) * W;

        if (sp.type === 'player' || sp.type === 'portal' || sp.type === 'medkit' || sp.type === 'boostpad') {
            const tx = sp.type === 'player' ? sp.opp.x : (sp.type === 'portal' ? sp.portal.x : (sp.type === 'medkit' ? sp.med.x : sp.pad.x));
            const ty = sp.type === 'player' ? sp.opp.y : (sp.type === 'portal' ? sp.portal.y : (sp.type === 'medkit' ? sp.med.y : sp.pad.y));
            const visibleByLOS = hasLineOfSight(localPlayer.x, localPlayer.y, tx, ty);
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

        // Feature #2: 3D Floor Speed Boost Chevron Pad
        if (sp.type === 'boostpad') {
            const padScale = (TILE_SIZE * H) / sp.dist;
            const floorY = horizon + padScale * 0.44;
            const padW = Math.max(24, padScale * 0.72);
            const padH = Math.max(8, padScale * 0.16);
            const pulse = 0.6 + 0.4 * Math.sin(now * 0.012);

            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#22c55e';
            ctx.strokeStyle = '#bbf7d0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(screenX, floorY, padW * 0.5, padH * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${Math.max(10, Math.floor(padScale * 0.14))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('⚡ BOOST', screenX, floorY - padH * 0.8);
            ctx.restore();
            continue;
        }

        // Feature #8: Floating Med-Kit / Shield Recharge Heart Crystal
        if (sp.type === 'medkit') {
            const medScale = (TILE_SIZE * H) / sp.dist;
            const floatY = horizon + Math.sin(now * 0.005) * (medScale * 0.08);
            const heartSize = Math.max(18, Math.min(72, Math.floor(medScale * 0.36)));

            ctx.save();
            ctx.shadowColor = '#f43f5e';
            ctx.shadowBlur = 16;
            ctx.font = `${heartSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💖', screenX, floatY);

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fda4af';
            ctx.font = `900 ${Math.max(9, Math.floor(heartSize * 0.30))}px sans-serif`;
            ctx.fillText('+1 LIFE', screenX, floatY - heartSize * 0.68);
            ctx.restore();
            continue;
        }

        if (sp.type === 'portal') {
            const portalH = Math.min(H * 1.15, Math.max(48, (TILE_SIZE * 0.95 * H) / sp.dist));
            const portalW = portalH * 0.62;
            const spin = now * 0.004;

            ctx.save();
            ctx.translate(screenX, horizon);

            ctx.shadowColor = sp.portal.color;
            ctx.shadowBlur = 22;
            ctx.strokeStyle = sp.portal.color;
            ctx.lineWidth = Math.max(3, portalW * 0.09);
            ctx.beginPath();
            ctx.ellipse(0, 0, portalW * 0.5, portalH * 0.48, 0, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = sp.portal.secondaryColor;
            ctx.lineWidth = Math.max(2, portalW * 0.05);
            ctx.beginPath();
            ctx.ellipse(0, 0, portalW * 0.34, portalH * 0.34, spin, 0, Math.PI * 1.5);
            ctx.stroke();

            ctx.beginPath();
            ctx.ellipse(0, 0, portalW * 0.20, portalH * 0.20, -spin * 1.4, 0, Math.PI * 1.5);
            ctx.stroke();

            ctx.fillStyle = sp.portal.color;
            ctx.globalAlpha = 0.28 + 0.12 * Math.sin(now * 0.008);
            ctx.beginPath();
            ctx.ellipse(0, 0, portalW * 0.44, portalH * 0.44, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;

            ctx.shadowBlur = 0;
            ctx.fillStyle = sp.portal.secondaryColor;
            ctx.font = `900 ${Math.max(11, Math.floor(portalH * 0.14))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(`🌀 ${sp.portal.name}`, 0, -portalH * 0.54);
            ctx.restore();
            continue;
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
        const isLeader = Number(sp.opp.score || 0) >= 300;
        const oppSuitColor = sp.opp.suitColor || getSuitColorForAvatar(sp.opp.avatar, sp.id);

        ctx.save();
        if (isGhostRespawning) {
            ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now * 0.015);
        } else if (isSneaky) {
            ctx.globalAlpha = 0.48;
        }

        ctx.fillStyle = isGhostRespawning ? '#f8fafc' : '#0f172a';
        ctx.strokeStyle = isGhostRespawning ? '#ffffff' : (isLeader ? '#facc15' : oppSuitColor);
        ctx.lineWidth = Math.max(2.5, spriteW * (isLeader ? 0.09 : 0.07));
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

        // Feature #5: Floating Gold Crown above 300+ pt Kill-Streak Leaders
        if (isLeader && !isGhostRespawning) {
            ctx.font = `${Math.max(16, Math.floor(badgeH * 0.85))}px sans-serif`;
            ctx.fillText('👑', screenX, badgeY - badgeH * 0.55);
        }

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
        const wm = b.widthMult || 1.0;

        ctx.save();
        ctx.globalAlpha = Math.max(0, b.life);
        ctx.strokeStyle = b.glow;
        ctx.lineWidth = 12 * wm * b.life;
        ctx.beginPath();
        ctx.moveTo(gunTipX, gunTipY);
        ctx.lineTo(b.endX, b.endY);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 * wm * b.life;
        ctx.beginPath();
        ctx.moveTo(gunTipX, gunTipY);
        ctx.lineTo(b.endX, b.endY);
        ctx.stroke();
        ctx.restore();
    }

    // 5. First-Person Space Blaster Viewmodel & HUD Overlays
    if (localPlayer.isAlive) {
        localPlayer.recoil = Math.max(0, localPlayer.recoil - dt * 5);
        localPlayer.muzzleFlash = Math.max(0, localPlayer.muzzleFlash - dt * 8);
        localPlayer.jamFlash = Math.max(0, localPlayer.jamFlash - dt * 2.5);
        localPlayer.gearBannerFlash = Math.max(0, localPlayer.gearBannerFlash - dt * 0.6);

        const localRespawning = now < localPlayer.invulnerableUntil;
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

        // Center Reticle + Feature #4: Hit-Marker Crosshair Snap
        ctx.strokeStyle = localPlayer.currentGear.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = localPlayer.suitColor;
        ctx.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);

        if (now < localPlayer.hitMarkerUntil) {
            ctx.save();
            ctx.strokeStyle = localPlayer.hitMarkerElim ? '#ef4444' : '#ffffff';
            ctx.lineWidth = 3;
            const rIn = 6, rOut = 18;
            ctx.beginPath();
            ctx.moveTo(W / 2 - rOut, H / 2 - rOut); ctx.lineTo(W / 2 - rIn, H / 2 - rIn);
            ctx.moveTo(W / 2 + rOut, H / 2 - rOut); ctx.lineTo(W / 2 + rIn, H / 2 - rIn);
            ctx.moveTo(W / 2 - rOut, H / 2 + rOut); ctx.lineTo(W / 2 - rIn, H / 2 + rIn);
            ctx.moveTo(W / 2 + rOut, H / 2 + rOut); ctx.lineTo(W / 2 + rIn, H / 2 + rIn);
            ctx.stroke();
            ctx.restore();
        }

        // Feature #7: Top-Center Compass Ribbon
        renderCompassRibbon(ctx, W);

        // Feature #1: Proximity Threat Radar Edge Glows
        renderProximityThreatRadar(ctx, W, H, now);

        // Top-Left Current Sector Badge
        const myZone = getZoneInfoForCoords(localPlayer.x, localPlayer.y);
        ctx.save();
        ctx.fillStyle = 'rgba(2, 6, 23, 0.86)';
        ctx.strokeStyle = myZone.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(12, 10, 195, 32, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = myZone.color;
        ctx.font = '900 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`📍 ${myZone.label}`, 109, 30);
        ctx.restore();

        // Feature #3: Kill Feed Ticker (Top-Left below Zone Pill)
        killFeedEntries = killFeedEntries.filter(k => now < k.expiresAt);
        if (killFeedEntries.length > 0) {
            ctx.save();
            ctx.font = 'bold 10.5px sans-serif';
            ctx.textAlign = 'left';
            killFeedEntries.forEach((entry, idx) => {
                const ky = 50 + idx * 20;
                ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
                ctx.fillRect(12, ky, 245, 17);
                ctx.fillStyle = entry.color;
                ctx.fillText(entry.text, 18, ky + 12);
            });
            ctx.restore();
        }

        // Incoming Spectator Alert Banner ("Watch Out", "Turn Left", "Turn Right")
        if (incomingAlertBanner && now < incomingAlertBanner.until) {
            const pulse = 0.75 + 0.25 * Math.sin(now * 0.02);
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 195, 42, 390, 44, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#facc15';
            ctx.font = '900 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`📡 ${incomingAlertBanner.text.toUpperCase()}!`, W / 2, 63);

            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(`Drone Callout from ${incomingAlertBanner.fromName}`, W / 2, 79);
            ctx.restore();
        }

        if (localRespawning) {
            ctx.save();
            ctx.fillStyle = 'rgba(248, 250, 252, 0.14)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 165, 40, 330, 30, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 11.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('👻 GHOST RESPAWN SHIELD ACTIVE', W / 2, 59);
            ctx.restore();
        }

        // Bottom-Center Chord Speed Gear, Boost & Overcharge HUD Pill
        const g = localPlayer.currentGear;
        const boostTag = isBoosted ? ' • ⚡ 2.5x PAD BOOST!' : '';
        const throttleText = activelyMoving ? ` • 🟢 C# THRUSTING${boostTag}` : ` • ⚪ HOLD C# TO MOVE${boostTag}`;
        const ocReady = now >= localPlayer.overchargeReadyAt;
        const ocText = ocReady ? '⚡ Cmaj7/Fmaj7: OVERCHARGE READY' : `⏳ OVERCHARGE: ${Math.ceil((localPlayer.overchargeReadyAt - now) / 1000)}s`;

        ctx.save();
        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.strokeStyle = isBoosted ? '#22c55e' : g.color;
        ctx.lineWidth = (localPlayer.gearBannerFlash > 0 || isBoosted) ? 3 : 1.8;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 220, H - 56, 440, 38, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isBoosted ? '#22c55e' : g.color;
        ctx.font = '900 11.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`GEAR: ${g.label}${throttleText}`, W / 2, H - 40);

        ctx.fillStyle = ocReady ? '#facc15' : '#94a3b8';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.fillText(`C:0x • Dm:0.35x • Em:0.65x • F:1x • G:1.35x • Am:1.68x • Bdim:2x | ${ocText}`, W / 2, H - 25);
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

    if (localPlayer.portalFlash > 0) {
        localPlayer.portalFlash = Math.max(0, localPlayer.portalFlash - dt * 1.8);
        ctx.save();
        ctx.globalAlpha = localPlayer.portalFlash * 0.55;
        ctx.fillStyle = '#22d3ee';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    if (localPlayer.damageFlash > 0) {
        localPlayer.damageFlash = Math.max(0, localPlayer.damageFlash - dt * 1.15);
        ctx.save();
        ctx.globalAlpha = localPlayer.damageFlash * 0.72;
        ctx.fillStyle = localPlayer.damageFlashColor;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }
}

function drawShapedMapTile(ctx, x, y, w, h, tileType) {
    const theme = WALL_THEMES[tileType] || WALL_THEMES[1];
    ctx.fillStyle = theme.mapHex;

    if (theme.shape === 'curved') {
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.max(1.5, w * 0.48), 0, Math.PI * 2);
        ctx.fill();
    } else if (theme.shape === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();
    } else if (theme.shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h / 2);
        ctx.lineTo(x + w / 2, y + h);
        ctx.lineTo(x, y + h / 2);
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.fillRect(x, y, w, h);
    }
}

function renderSpectatorOverheadView(ctx, W, H, dt, now) {
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
                drawShapedMapTile(ctx, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE, tile);
            }
        }
    }

    // Speed Boost Pads on Spectator Map
    for (const pad of speedBoostPads) {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, 18, 0, Math.PI * 2);
        ctx.fill();
    }

    // Med-Kits on Spectator Map
    for (const med of medKitNodes) {
        if (now < med.respawnAt) continue;
        ctx.font = '26px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💖', med.x, med.y);
    }

    // Portals on Spectator Map
    for (const portal of arenaPortals) {
        const pulse = (Math.sin(now * 0.008) + 1) * 0.5;
        ctx.save();
        ctx.strokeStyle = portal.color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(portal.x, portal.y, 26 + pulse * 14, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = portal.secondaryColor;
        ctx.beginPath();
        ctx.arc(portal.x, portal.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Active Players on Spectator Map
    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (!isPlayerActiveInRoom(opp)) continue;
        const oppColor = opp.isInvulnerable ? '#ffffff' : (opp.suitColor || getSuitColorForAvatar(opp.avatar, id));
        const isLeader = Number(opp.score || 0) >= 300;
        ctx.save();
        if (opp.isInvulnerable) ctx.globalAlpha = 0.45;
        ctx.fillStyle = oppColor;
        ctx.beginPath();
        ctx.arc(opp.x, opp.y, 24, 0, Math.PI * 2);
        ctx.fill();

        if (isLeader) {
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 5;
            ctx.stroke();
        }

        const oppLives = opp.lives !== undefined ? Number(opp.lives) : 3;
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${isLeader ? '👑 ' : ''}${opp.name} [${opp.noteTag}] ${'❤️'.repeat(oppLives)}`, opp.x, opp.y - 32);
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

    if (spectatorSelectedTarget) {
        const targetObj = remotePlayers[spectatorSelectedTarget.id];
        if (!targetObj || !isPlayerActiveInRoom(targetObj)) {
            spectatorSelectedTarget = null;
        } else {
            const px = offsetX + targetObj.x * scale;
            const py = offsetY + targetObj.y * scale;
            spectatorSelectedTarget.screenX = px;
            spectatorSelectedTarget.screenY = py;

            const options = [
                { msg: 'Watch Out', color: '#ef4444' },
                { msg: 'Turn Left', color: '#38bdf8' },
                { msg: 'Turn Right', color: '#22c55e' }
            ];
            const btnW = 94;
            const btnH = 26;
            const gap = 6;
            const totalW = options.length * btnW + (options.length - 1) * gap;
            const startX = Math.max(10, Math.min(W - totalW - 10, px - totalW / 2));
            const startY = Math.max(54, py - 48);

            ctx.save();
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(px, py, 16, 0, Math.PI * 2);
            ctx.stroke();

            spectatorSelectedTarget.buttons = [];
            options.forEach((opt, idx) => {
                const bx = startX + idx * (btnW + gap);
                const by = startY;
                spectatorSelectedTarget.buttons.push({ x: bx, y: by, w: btnW, h: btnH, msg: opt.msg });

                ctx.fillStyle = '#0f172a';
                ctx.strokeStyle = opt.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(bx, by, btnW, btnH, 6);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = opt.color;
                ctx.font = '900 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(opt.msg, bx + btnW / 2, by + btnH / 2);
            });
            ctx.restore();
        }
    }

    if (localPlayer.damageFlash > 0) {
        localPlayer.damageFlash = Math.max(0, localPlayer.damageFlash - dt * 0.85);
        ctx.save();
        ctx.globalAlpha = localPlayer.damageFlash * 0.78;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    ctx.fillStyle = 'rgba(2, 6, 23, 0.90)';
    ctx.fillRect(W / 2 - 270, 10, 540, 36);
    ctx.strokeStyle = '#facc15';
    ctx.strokeRect(W / 2 - 270, 10, 540, 36);
    ctx.fillStyle = '#facc15';
    ctx.font = '900 12.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🛰️ SPECTATOR DRONE — CLICK ANY PLAYER TO SEND "WATCH OUT", "TURN LEFT", OR "TURN RIGHT"', W / 2, 32);
}

// Feature #10: End-of-Round MVP Podium Overlay
function renderMvpPodiumOverlay(ctx, W, H) {
    const allPlayers = Object.values(remotePlayers);
    if (allPlayers.length === 0) return;

    const survivor = allPlayers.find(p => isPlayerActiveInRoom(p)) || allPlayers[0];
    const sortedByScore = [...allPlayers].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    const topScorer = sortedByScore[0] || survivor;
    const sortedByElims = [...allPlayers].sort((a, b) => Number(b.eliminations || 0) - Number(a.eliminations || 0));
    const topSlayer = sortedByElims[0] || survivor;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.86)';
    ctx.fillRect(0, 0, W, H);

    const cardW = Math.min(540, W * 0.90);
    const cardH = 260;
    const cx = W / 2;
    const cy = H / 2;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.font = '900 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 LASER TAG ARENA CHAMPIONS 🏆', cx, cy - 88);

    const cols = [
        { title: '👑 LAST SURVIVOR', p: survivor, stat: `${survivor.lives || 1} Lives Left`, color: '#22c55e', x: cx - cardW * 0.30 },
        { title: '⭐ TOP SCORER',    p: topScorer, stat: `${topScorer.score || 0} pts`,      color: '#38bdf8', x: cx },
        { title: '💥 MOST TAGS',     p: topSlayer, stat: `${topSlayer.eliminations || 0} Eliminations`, color: '#f97316', x: cx + cardW * 0.30 }
    ];

    for (const c of cols) {
        ctx.fillStyle = c.color;
        ctx.font = '900 11px sans-serif';
        ctx.fillText(c.title, c.x, cy - 42);

        ctx.font = '38px sans-serif';
        ctx.fillText(c.p.avatar || '🤖', c.x, cy + 4);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 14px sans-serif';
        ctx.fillText(c.p.name || 'Player', c.x, cy + 42);

        ctx.fillStyle = c.color;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(c.stat, c.x, cy + 62);
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Press "test" to spawn another 50-bot wave or Exit to return to menu', cx, cy + 104);
    ctx.restore();
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

    if (Object.keys(simulatedBots).length > 0) {
        updateSimulatedBots(dt);
    }

    const activePlayers = Object.values(remotePlayers).filter(isPlayerActiveInRoom);
    const totalCount = Object.keys(remotePlayers).length;
    if (totalCount > maxPeakPlayers) maxPeakPlayers = totalCount;

    if (localPlayer.isAlive) {
        localPlayer.angle += localPlayer.turnDir * 1.55 * dt;

        localPlayer.isMovingForward = now < localPlayer.moveUntil;
        const isBoosted = now < localPlayer.boostUntil;
        const speedMult = localPlayer.currentGear.mult * (isBoosted ? 1.5 : 1.0);

        if (localPlayer.isMovingForward && speedMult > 0) {
            localPlayer.bobPhase += dt * (6.5 + speedMult * 5.0);

            const baseSpeed = 180;
            const speed = baseSpeed * speedMult;
            const pad = 12;
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

        // Feature #2: Speed Boost Pads Pickup Check
        for (const pad of speedBoostPads) {
            if (Math.hypot(localPlayer.x - pad.x, localPlayer.y - pad.y) < 34 && now >= localPlayer.boostUntil - 1200) {
                localPlayer.boostUntil = now + 2200;
                playSpeedBoostSweep();
                const statusEl = document.getElementById('status');
                if (statusEl) statusEl.textContent = `⚡ SPEED BOOST PAD ACTIVATED! (2.2s Turbo Surge)`;
            }
        }

        // Feature #8: Floating Med-Kit Pickup Check
        for (const med of medKitNodes) {
            if (now >= med.respawnAt && localPlayer.lives < 3 && Math.hypot(localPlayer.x - med.x, localPlayer.y - med.y) < 34) {
                med.respawnAt = now + 18000;
                localPlayer.lives = Math.min(3, localPlayer.lives + 1);
                localPlayer.hitsTaken = Math.max(0, 3 - localPlayer.lives);
                playMedKitHealChime();
                spawn3DExplosion(med.x, med.y, '#f43f5e', 16);
                const statusEl = document.getElementById('status');
                if (statusEl) statusEl.textContent = `💖 MED-KIT COLLECTED! Shield restored to ${localPlayer.lives} Lives!`;
            }
        }

        // Quantum Portal Teleportation Check
        if (arenaPortals.length === 2 && now >= localPlayer.portalCooldownUntil) {
            for (let pIdx = 0; pIdx < 2; pIdx++) {
                const p = arenaPortals[pIdx];
                if (Math.hypot(localPlayer.x - p.x, localPlayer.y - p.y) < 36) {
                    const dest = arenaPortals[pIdx === 0 ? 1 : 0];
                    spawn3DExplosion(localPlayer.x, localPlayer.y, p.color, 20);
                    localPlayer.x = dest.x;
                    localPlayer.y = dest.y;
                    localPlayer.portalCooldownUntil = now + 2600;
                    localPlayer.portalFlash = 1.0;
                    playPortalWarpSound();
                    spawn3DExplosion(dest.x, dest.y, dest.color, 24);

                    const statusEl = document.getElementById('status');
                    if (statusEl) {
                        statusEl.textContent = `🌀 TELEPORTED via ${p.name} → ${dest.name}!`;
                    }
                    break;
                }
            }
        }
    }

    if (localPlayer.isAlive) {
        renderFirstPerson3D(ctx, W, H, dt, now);
    } else {
        renderSpectatorOverheadView(ctx, W, H, dt, now);
    }

    // Bottom-Left Color & Shape Coded Minimap Overlay
    if (localPlayer.isAlive) {
        const mmSize = 162;
        const mmX = 12;
        const mmY = H - mmSize - 12;
        ctx.fillStyle = 'rgba(2, 6, 23, 0.90)';
        ctx.fillRect(mmX, mmY, mmSize, mmSize);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mmX, mmY, mmSize, mmSize);

        const scaleX = mmSize / (MAP_COLS * TILE_SIZE);
        const scaleY = mmSize / (MAP_ROWS * TILE_SIZE);

        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                const tile = ARENA_MAP[r][c];
                if (tile > 0) {
                    drawShapedMapTile(
                        ctx,
                        mmX + c * TILE_SIZE * scaleX,
                        mmY + r * TILE_SIZE * scaleY,
                        TILE_SIZE * scaleX,
                        TILE_SIZE * scaleY,
                        tile
                    );
                }
            }
        }

        // Boost Pads & Med-Kits on Minimap
        ctx.fillStyle = '#22c55e';
        for (const pad of speedBoostPads) {
            ctx.fillRect(mmX + pad.x * scaleX - 2, mmY + pad.y * scaleY - 2, 4, 4);
        }
        ctx.fillStyle = '#f43f5e';
        for (const med of medKitNodes) {
            if (now >= med.respawnAt) {
                ctx.beginPath();
                ctx.arc(mmX + med.x * scaleX, mmY + med.y * scaleY, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Pulsing Portals on Minimap
        const pPulse = (Math.sin(now * 0.01) + 1) * 0.5;
        for (const portal of arenaPortals) {
            const px = mmX + portal.x * scaleX;
            const py = mmY + portal.y * scaleY;
            ctx.strokeStyle = portal.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, 3 + pPulse * 3, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = portal.secondaryColor;
            ctx.beginPath();
            ctx.arc(px, py, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const [id, opp] of Object.entries(remotePlayers)) {
            if (id === localId || !isPlayerActiveInRoom(opp)) continue;
            const ox = mmX + opp.x * scaleX;
            const oy = mmY + opp.y * scaleY;
            const oppColor = opp.isInvulnerable ? '#ffffff' : (opp.suitColor || getSuitColorForAvatar(opp.avatar, id));
            const isLeader = Number(opp.score || 0) >= 300;

            ctx.save();
            if (opp.isInvulnerable) ctx.globalAlpha = 0.45;
            else if (opp.isStealth) ctx.globalAlpha = 0.55;
            ctx.fillStyle = oppColor;
            ctx.beginPath();
            ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
            ctx.fill();

            if (isLeader) {
                ctx.strokeStyle = '#facc15';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            ctx.font = '10px sans-serif';
            ctx.fillText(opp.avatar || '🔴', ox, oy);

            ctx.fillStyle = '#facc15';
            ctx.font = 'bold 7.5px sans-serif';
            ctx.fillText(normalizePitchClass(opp.noteTag || ''), ox, oy - 7);
            ctx.restore();
        }

        // Pulsing Bright Yellow Radar Beacon for Local Player
        const lx = mmX + localPlayer.x * scaleX;
        const ly = mmY + localPlayer.y * scaleY;
        const pulseWave = (Math.sin(now * 0.008) + 1) * 0.5;

        ctx.save();
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.95 - pulseWave * 0.65})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(lx, ly, 5 + pulseWave * 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(250, 204, 21, ${0.35 - pulseWave * 0.2})`;
        ctx.beginPath();
        ctx.arc(lx, ly, 6 + pulseWave * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(localPlayer.angle) * 15, ly + Math.sin(localPlayer.angle) * 15);
        ctx.stroke();

        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Top-Right HUD
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

    // Feature #10: End-of-Round MVP Podium when only 1 survivor remains after a multi-player match
    if (maxPeakPlayers >= 2 && activePlayers.length === 1) {
        renderMvpPodiumOverlay(ctx, W, H);
    }

    animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
}
