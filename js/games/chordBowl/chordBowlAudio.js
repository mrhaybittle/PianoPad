// js/games/chordBowl/chordBowlAudio.js
// Pentatonic pin tones, chain arpeggios, groove boost harmonic layer & fanfare.

import { audioCtx, initAudio, playTone } from '../../audio.js';
import { getNoteFrequency } from '../../musicTheory.js';

export function playPinHitTone(noteStr, intensity = 0.6, grooveBoost = false) {
    initAudio();
    const freq = getNoteFrequency(noteStr);
    if (!freq) return;

    const gain = Math.min(0.95, 0.25 + intensity * 0.65);
    playTone(freq, 0.34, gain);

    if (grooveBoost) {
        // Fifth shimmer on Groove Boost
        playTone(freq * 1.5, 0.28, gain * 0.45);
    }
}

export function playChainHarmony(notes, grooveBoost = false) {
    initAudio();
    if (!audioCtx || !Array.isArray(notes) || notes.length === 0) return;

    const uniqueNotes = [...new Set(notes)].slice(0, 4);
    uniqueNotes.forEach((n, idx) => {
        const freq = getNoteFrequency(n);
        if (!freq) return;
        const startTime = audioCtx.currentTime + idx * 0.055;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = grooveBoost ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gainNode.gain.setValueAtTime(0.001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(grooveBoost ? 0.28 : 0.18, startTime + 0.015);
        gainNode.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.38);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.4);
    });
}

export function playGrooveBoostSound() {
    initAudio();
    const chord = ['c2', 'g2', 'c3'];
    chord.forEach((n, i) => {
        const freq = getNoteFrequency(n);
        if (freq && audioCtx) {
            const t = audioCtx.currentTime + i * 0.03;
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.14, t);
            g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
            osc.connect(g);
            g.connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.24);
        }
    });
}

export function playGutterTone() {
    initAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(125, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.35);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.36);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.38);
}

export function playStrikeOrSpareFanfare(isStrike, scaleNotes = []) {
    initAudio();
    const notes = isStrike
        ? ['c2', 'e2', 'g2', 'c3']
        : ['g1', 'c2', 'e2', 'g2'];
    const fallback = scaleNotes.length >= 4 ? scaleNotes.slice(0, 4) : notes;
    const seq = isStrike ? notes : fallback;

    seq.forEach((n, idx) => {
        const freq = getNoteFrequency(n);
        if (freq && audioCtx) {
            const t = audioCtx.currentTime + idx * 0.08;
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.24, t);
            g.gain.exponentialRampToValueAtTime(0.0008, t + 0.45);
            osc.connect(g);
            g.connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.48);
        }
    });
}
