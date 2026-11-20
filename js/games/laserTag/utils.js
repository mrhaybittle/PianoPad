// js/games/laserTag/utils.js
import { SUIT_PALETTE } from './constants.js';

export function getSuitColorForAvatar(avatarStr, idStr) {
    const src = `${avatarStr || ''}_${idStr || ''}`;
    let hash = 0;
    for (let i = 0; i < src.length; i++) {
        hash = (hash * 33 + src.charCodeAt(i)) >>> 0;
    }
    return SUIT_PALETTE[hash % SUIT_PALETTE.length];
}

export function parseNoteDetails(noteStr) {
    const clean = (noteStr || '').toUpperCase().trim();
    const match = clean.match(/^([A-G][#B]?)([0-9]*)$/);
    const rawPitch = match ? match[1] : clean.replace(/[0-9]/g, '');
    const octave = (match && match[2]) ? parseInt(match[2], 10) : 4;
    const flatMap = { 'DB': 'C#', 'EB': 'D#', 'GB': 'F#', 'AB': 'G#', 'BB': 'A#' };
    return {
        pitchClass: flatMap[rawPitch] || rawPitch,
        octave
    };
}

export function normalizePitchClass(noteStr) {
    return parseNoteDetails(noteStr).pitchClass;
}

export function isPlayerActiveInRoom(p) {
    if (!p || p.isAlive === false) return false;
    return typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y);
}
