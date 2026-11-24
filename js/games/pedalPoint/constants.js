// js/games/pedalPoint/constants.js

export const TRAIL_LENGTH = 2600;
export const BPM = 122;
export const BEAT_DURATION = 60 / BPM;

export const BIKE_PRESETS = {
  enduro: {
    name: 'Kembla Trail 140',
    pedalForce: 21,
    maxPedalSpeed: 26,
    maxDownhillSpeed: 43,
    turnSpeed: 2.22,
    hopImpulse: 13.2,
    gravityMult: 1.0,
    suspensionStiffness: 18,
    forkTravel: 0.38,
    landingForgiveness: 1.0
  },
  downhill: {
    name: 'Escarpment DH 200',
    pedalForce: 16,
    maxPedalSpeed: 24,
    maxDownhillSpeed: 52,
    turnSpeed: 1.78,
    hopImpulse: 11.4,
    gravityMult: 1.14,
    suspensionStiffness: 11,
    forkTravel: 0.54,
    landingForgiveness: 1.38
  },
  ebike: {
    name: 'Illawarra Volt E-MTB',
    pedalForce: 36,
    maxPedalSpeed: 34,
    maxDownhillSpeed: 46,
    turnSpeed: 2.04,
    hopImpulse: 11.8,
    gravityMult: 1.04,
    suspensionStiffness: 16,
    forkTravel: 0.42,
    landingForgiveness: 1.12
  }
};

export const NOTE_PALETTE = {
  c: { label: 'C', freq: 261.63, color: 0xef4444, hex: '#ef4444' }, // Red
  d: { label: 'D', freq: 293.66, color: 0xf97316, hex: '#f97316' }, // Orange
  e: { label: 'E', freq: 329.63, color: 0xeab308, hex: '#eab308' }, // Yellow
  f: { label: 'F', freq: 349.23, color: 0x22c55e, hex: '#22c55e' }, // Green
  g: { label: 'G', freq: 392.00, color: 0x3b82f6, hex: '#3b82f6' }, // Blue
  a: { label: 'A', freq: 440.00, color: 0xa855f7, hex: '#a855f7' }, // Purple
  b: { label: 'B', freq: 493.88, color: 0xec4899, hex: '#ec4899' }  // Pink
};

export const SCALE_NOTES = [
  { name: 'C4', pitchClass: 'c', freq: 261.63, color: 0xef4444, hex: '#ef4444' },
  { name: 'D4', pitchClass: 'd', freq: 293.66, color: 0xf97316, hex: '#f97316' },
  { name: 'E4', pitchClass: 'e', freq: 329.63, color: 0xeab308, hex: '#eab308' },
  { name: 'F4', pitchClass: 'f', freq: 349.23, color: 0x22c55e, hex: '#22c55e' },
  { name: 'G4', pitchClass: 'g', freq: 392.00, color: 0x3b82f6, hex: '#3b82f6' },
  { name: 'A4', pitchClass: 'a', freq: 440.00, color: 0xa855f7, hex: '#a855f7' },
  { name: 'B4', pitchClass: 'b', freq: 493.88, color: 0xec4899, hex: '#ec4899' }
];

export const SEMITONE_MAP = {
  'c': 0, 'c#': 1, 'db': 1,
  'd': 2, 'd#': 3, 'eb': 3,
  'e': 4, 'fb': 4, 'e#': 5,
  'f': 5, 'f#': 6, 'gb': 6,
  'g': 7, 'g#': 8, 'ab': 8,
  'a': 9, 'a#': 10, 'bb': 10,
  'b': 11, 'cb': 11, 'b#': 0
};

export const SEMITONE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const TRAIL_ZONES = [
  { z: -15,   name: 'MT KEMBLA LOOKOUT RIDGE',   sub: 'Open Pacific Ocean & Port Kembla Horizon' },
  { z: -520,  name: 'DEEP RAINFOREST GULLY',     sub: 'Enclosed Mountain Valley • Trees Both Sides' },
  { z: -1280, name: 'LAKE ILLAWARRA VISTA',      sub: 'Coastal Escarpment Shelf & Cargo Ship Views' },
  { z: -1820, name: 'SUBLIME POINT CANOPY',      sub: 'Subtropical Rainforest Tunnel & Final Bridges' }
];

export const LOOKOUT_WINDOWS = [
  { zMax: 45,    zMin: -480 },
  { zMax: -1260, zMin: -1780 }
];

export const DEFAULT_BINDINGS = {
  left:  { type: 'key', code: 'KeyA', label: 'A / ←' },
  right: { type: 'key', code: 'KeyD', label: 'D / →' },
  jump:  { type: 'key', code: 'Space', label: 'Space' },
  view:  { type: 'key', code: 'KeyV', label: 'V' }
};
