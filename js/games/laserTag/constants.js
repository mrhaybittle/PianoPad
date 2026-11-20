// js/games/laserTag/constants.js

// 7 Diatonic White-Key Triad Speed Gears (locked in until another chord is played)
export const CHORD_GEARS = [
    { id: 'C',    notes: ['C', 'E', 'G'], label: 'C MAJOR • LOCKED (0x)',      short: '🔒 LOCKED (0x)', mult: 0.00, color: '#facc15', stealth: false },
    { id: 'Dm',   notes: ['D', 'F', 'A'], label: 'D MINOR • SNEAKY (0.35x)',   short: '🥷 SNEAKY',      mult: 0.35, color: '#a855f7', stealth: true  },
    { id: 'Em',   notes: ['E', 'G', 'B'], label: 'E MINOR • CAUTIOUS (0.65x)', short: '🚶 CAUTIOUS',    mult: 0.65, color: '#2dd4bf', stealth: false },
    { id: 'F',    notes: ['F', 'A', 'C'], label: 'F MAJOR • NORMAL (1.0x)',    short: '🏃 NORMAL',      mult: 1.00, color: '#22c55e', stealth: false },
    { id: 'G',    notes: ['G', 'B', 'D'], label: 'G MAJOR • BRISK (1.35x)',    short: '⚡ BRISK',       mult: 1.35, color: '#38bdf8', stealth: false },
    { id: 'Am',   notes: ['A', 'C', 'E'], label: 'A MINOR • DASH (1.68x)',     short: '🔥 DASH',        mult: 1.68, color: '#fb923c', stealth: false },
    { id: 'Bdim', notes: ['B', 'D', 'F'], label: 'B DIM • SPRINT X2 (2.0x)',   short: '🚀 SPRINT X2',   mult: 2.00, color: '#ef4444', stealth: false }
];

export const DEFAULT_GEAR = CHORD_GEARS[3]; // F Major (1.0x Normal Speed)

// 4-Note Overcharge Chords (Wide-cone shockwave ignoring target pitch, 15s cooldown)
export const OVERCHARGE_CHORDS = [
    { id: 'Cmaj7', notes: ['C', 'E', 'G', 'B'], label: 'C MAJ7 OVERCHARGE' },
    { id: 'Fmaj7', notes: ['F', 'A', 'C', 'E'], label: 'F MAJ7 OVERCHARGE' }
];

// Feature #2: Diminished 7th EMP Chord (B + D + F + G#)
export const EMP_CHORD_NOTES = ['B', 'D', 'F', 'G#'];

// Feature #3: Minor 7th Decoy Chords (Dm7 or Em7)
export const DECOY_CHORDS = [
    { id: 'Dm7', notes: ['D', 'F', 'A', 'C'], label: 'Dm7 HOLO-DECOY' },
    { id: 'Em7', notes: ['E', 'G', 'B', 'D'], label: 'Em7 HOLO-DECOY' }
];

// Distinct Color & Shape Themes for each Arena Sector
export const WALL_THEMES = {
    1: { name: 'CYAN PERIMETER',   shape: 'box',      r: 14,  g: 116, b: 144, trim: [56, 189, 248],  mapHex: '#38bdf8' },
    2: { name: 'GOLD CURVED NW',   shape: 'curved',   r: 161, g: 118, b: 16,  trim: [250, 204, 21],  mapHex: '#facc15' },
    3: { name: 'MAGENTA TRI NE',   shape: 'triangle', r: 134, g: 25,  b: 143, trim: [232, 121, 249], mapHex: '#e879f9' },
    4: { name: 'CORAL BLOCKS SW',  shape: 'box',      r: 175, g: 56,  b: 20,  trim: [251, 146, 60],  mapHex: '#fb923c' },
    5: { name: 'COBALT DIAMOND SE',shape: 'diamond',  r: 30,  g: 64,  b: 175, trim: [96, 165, 250],  mapHex: '#60a5fa' },
    6: { name: 'EMERALD HUB',      shape: 'curved',   r: 6,   g: 110, b: 82,  trim: [52, 211, 153],  mapHex: '#34d399' }
};

// Arena Dimensions
export const TILE_SIZE = 64;
export const MAP_COLS = 46;
export const MAP_ROWS = 46;
export const ARENA_CENTER_X = (MAP_COLS * TILE_SIZE) / 2;
export const ARENA_CENTER_Y = (MAP_ROWS * TILE_SIZE) / 2;

// 9 assignable target pitches (C = Left, C# = Forward, D = Right)
export const ASSIGNABLE_PITCHES = ['D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SUIT_PALETTE = [
    '#38bdf8', '#22c55e', '#f472b6', '#a855f7', '#fb923c',
    '#2dd4bf', '#facc15', '#818cf8', '#fb7185', '#34d399'
];

// 50 Contemporary 2026 Australian Teenage Male Names
export const AUSSIE_2026_TEEN_BOYS = [
    "Lachlan", "Jack", "Oliver", "Noah", "William", "Leo", "Lucas", "Henry", "Charlie", "Liam",
    "Thomas", "Ethan", "Cooper", "Harrison", "Archer", "Oscar", "Hudson", "Harvey", "Darcy", "Riley",
    "Hunter", "Levi", "Flynn", "Jaxon", "Sebastian", "Isaac", "Xavier", "Beau", "Max", "Mason",
    "Bodhi", "Sonny", "Koa", "Lenny", "Archie", "Huxley", "Banjo", "Taj", "Cruz", "Angus",
    "Hamish", "Callum", "Declan", "Brodie", "Jett", "Ryder", "Kai", "Fletcher", "Ashton", "Toby"
];

export const BOT_AVATARS = ['🏃', '🏄', '🚴', '🦊', '🐯', '🤖', '🛸', '🦄', '🎹', '🎧', '👨‍🎤', '😎', '🐱', '🐲', '🚀', '🥷'];
