export const noteNames = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];

export function midiNoteToName(midi) {
    const octave = Math.floor(midi / 12) - 2;
    const offset = ((midi % 12) + 12) % 12;
    return noteNames[offset] + octave;
}

export function noteToPitch(noteStr) {
    noteStr = noteStr.trim().toLowerCase();
    const match = noteStr.match(/^([a-g]#?)([0-9]+)$/);
    if (!match) return null;
    const name = match[1];
    const octave = parseInt(match[2], 10);
    const offset = noteNames.indexOf(name);
    if (offset === -1) return null;
    return octave * 12 + offset;
}

export function pitchToNote(pitch) {
    if (pitch < 0) pitch = 0;
    const octave = Math.floor(pitch / 12);
    const offset = pitch % 12;
    return noteNames[offset] + octave;
}

export function autoTransposeSong(song) {
    if (!song || song.length === 0) return song;

    let pitches = [];
    song.forEach(item => {
        item.notes.forEach(n => {
            const p = noteToPitch(n);
            if (p !== null) pitches.push(p);
        });
    });
    if (pitches.length === 0) return song;

    let minP = Math.min(...pitches);
    let maxP = Math.max(...pitches);

    const MIN_PITCH = 12;
    const MAX_PITCH = 59;
    let octaveShift = 0;

    while (minP + octaveShift * 12 < MIN_PITCH) octaveShift++;
    while (maxP + octaveShift * 12 > MAX_PITCH && minP + octaveShift * 12 > MIN_PITCH) octaveShift--;

    return song.map(item => ({
        ...item,
        notes: item.notes.map(noteStr => {
            const p = noteToPitch(noteStr);
            if (p === null) return noteStr;
            let shiftedP = p + octaveShift * 12;
            while (shiftedP < MIN_PITCH) shiftedP += 12;
            while (shiftedP > MAX_PITCH) shiftedP -= 12;
            return pitchToNote(shiftedP);
        })
    }));
}

export function getNoteFrequency(noteStr) {
    noteStr = noteStr.trim().toLowerCase();
    const match = noteStr.match(/^([a-g]#?)([0-9]+)$/);
    if (!match) return null;

    const name = match[1];
    const octave = parseInt(match[2], 10);
    const realOctave = octave + 3;
    const noteOffsets = { 'c': 0, 'c#': 1, 'd': 2, 'd#': 3, 'e': 4, 'f': 5, 'f#': 6, 'g': 7, 'g#': 8, 'a': 9, 'a#': 10, 'b': 11 };

    if (noteOffsets[name] === undefined) return null;
    const midiNumber = (realOctave + 1) * 12 + noteOffsets[name];
    return 440 * Math.pow(2, (midiNumber - 69) / 12);
}

export function parsePianoPad(code) {
    if (!code || !code.trim()) return [];
    const cleanCode = code.replace(/[\r\n\s]+/g, '');
    const parts = cleanCode.split(/,Rests,/i);
    if (parts.length < 2) return [];

    const rawNotes = parts[0].split(',').filter(Boolean);
    const rests = parts[1].split(',').filter(Boolean);

    const song = [];
    for (let i = 0; i < rawNotes.length; i++) {
        song.push({
            notes: rawNotes[i].split('+').filter(Boolean),
            rest: parseInt(rests[i] || '250', 10)
        });
    }
    return song;
}

export function getDiatonicStepAndShift(noteStr) {
    noteStr = noteStr.trim().toLowerCase();
    const match = noteStr.match(/^([a-g])(#?)([0-9]+)$/);
    if (!match) return null;

    const letter = match[1].toUpperCase();
    const isSharp = match[2] === '#';
    let octave = parseInt(match[3], 10);

    const baseSteps = { 'C': 0, 'D': 1, 'E': 2, 'F': 3, 'G': 4, 'A': 5, 'B': 6 };
    let baseStep = baseSteps[letter];
    if (baseStep === undefined) return null;

    let totalDiatonicStep = (octave - 1) * 7 + baseStep;
    let octaveShift = 0;
    if (totalDiatonicStep > 14 && totalDiatonicStep <= 21) {
        octaveShift = 1;
        totalDiatonicStep -= 7;
    } else if (totalDiatonicStep > 21) {
        octaveShift = 2;
        totalDiatonicStep -= 14;
    }

    return {
        letter,
        isSharp,
        step: totalDiatonicStep - 2,
        octaveShift
    };
}
