// js/games/chordBowl/chordBowlAssets.js
// Swappable 3D lane/pin/ball visual presets, ball weights, pentatonic scales & spare call presets.

export const CHORD_BOWL_THEMES = {
    classicPro: {
        skyTop: '#070b14',
        skyHorizon: '#162238',
        sideWall: '#0f172a',
        gutter: '#090d16',
        laneWoodLight: '#dca86b',
        laneWoodDark: '#b87d3e',
        approachWood: '#6b4423',
        arrow: 'rgba(120, 53, 15, 0.72)',
        foulLine: '#ef4444',
        accent: '#38bdf8',
        pinBody: '#f8fafc',
        pinShadow: '#cbd5e1',
        pinStripe: '#dc2626',
        pinToppleGlow: '#facc15',
        ballPrimary: '#2563eb',
        ballSecondary: '#1d4ed8',
        ballHole: '#090d16'
    },
    neonArcade: {
        skyTop: '#05040f',
        skyHorizon: '#1e1645',
        sideWall: '#0e0a24',
        gutter: '#070514',
        laneWoodLight: '#312e81',
        laneWoodDark: '#1e1b4b',
        approachWood: '#171336',
        arrow: 'rgba(34, 211, 238, 0.65)',
        foulLine: '#ec4899',
        accent: '#22d3ee',
        pinBody: '#f0fdf4',
        pinShadow: '#bbf7d0',
        pinStripe: '#a855f7',
        pinToppleGlow: '#22d3ee',
        ballPrimary: '#ec4899',
        ballSecondary: '#be185d',
        ballHole: '#090614'
    }
};

export const BALL_WEIGHTS = {
    light: {
        label: '10lb Feather (Fast)',
        speedMultiplier: 1.15,
        hookMultiplier: 0.85,
        radiusMultiplier: 0.92,
        mass: 0.88
    },
    standard: {
        label: '14lb Balanced',
        speedMultiplier: 1.0,
        hookMultiplier: 1.0,
        radiusMultiplier: 1.0,
        mass: 1.0
    },
    heavy: {
        label: '16lb Hammer (Heavy Carry)',
        speedMultiplier: 0.88,
        hookMultiplier: 1.22,
        radiusMultiplier: 1.08,
        mass: 1.24
    }
};

export const PENTATONIC_SCALES = {
    cMajorPentatonic: ['c2', 'd2', 'e2', 'g2', 'a2', 'c3', 'd3', 'e3', 'g3', 'a3'],
    gMajorPentatonic: ['g1', 'a1', 'b1', 'd2', 'e2', 'g2', 'a2', 'b2', 'd3', 'e3'],
    fMajorPentatonic: ['f1', 'g1', 'a1', 'c2', 'd2', 'f2', 'g2', 'a2', 'c3', 'd3']
};

export const SPARE_CALLS = {
    '10-pin': { label: 'Corner 10-Pin', keyNote: 'e2' },
    '7-pin': { label: 'Corner 7-Pin', keyNote: 'c2' },
    '5-pin': { label: 'Center 5-Pin', keyNote: 'g2' }
};
