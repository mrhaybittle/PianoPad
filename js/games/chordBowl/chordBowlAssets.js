// js/games/chordBowl/chordBowlAssets.js
// Swappable visual themes, ball weights, pentatonic scales & spare call presets.

export const CHORD_BOWL_THEMES = {
    classicPro: {
        backdrop: '#090d16',
        gutter: '#111827',
        laneTop: '#b47b44',
        laneBottom: '#e2b47b',
        arrow: 'rgba(120, 53, 15, 0.55)',
        foulLine: '#ef4444',
        accent: '#38bdf8',
        pinBody: '#f8fafc',
        pinStripe: '#dc2626',
        pinToppleGlow: '#facc15',
        ballPrimary: '#2563eb',
        ballHole: '#0f172a'
    },
    neonArcade: {
        backdrop: '#070614',
        gutter: '#140c2b',
        laneTop: '#1e1b4b',
        laneBottom: '#312e81',
        arrow: 'rgba(56, 189, 248, 0.45)',
        foulLine: '#ec4899',
        accent: '#22d3ee',
        pinBody: '#f0fdf4',
        pinStripe: '#a855f7',
        pinToppleGlow: '#22d3ee',
        ballPrimary: '#ec4899',
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
