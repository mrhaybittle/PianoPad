// js/games/laserTag/songChallenges.js

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1euEFrGRf_fRAJ_U1SLgXdERRWL_DDd3iPbm16G--MSM/gviz/tq?tqx=out:csv&gid=1630208958';

const FALLBACK_CHALLENGES = [
    { name: "Wipeout", sequence: ['G', 'A#', 'B'] },
    { name: "Eye of the Tiger", sequence: ['C', 'C', 'A#'] },
    { name: "Mary Had A Little Lamb", sequence: ['E', 'D', 'C'] },
    { name: "Shape of You", sequence: ['C', 'D#', 'C'] },
    { name: "Top Gun Theme", sequence: ['C', 'G', 'G'] }
];

export let MUSICAL_CHALLENGES = [...FALLBACK_CHALLENGES];

// Tracks unplayed songs in the current cycle and songs currently active on beacons
let remainingDeck = [];
const activeArenaSongs = new Set();

function extractPitchClass(noteStr) {
    if (!noteStr) return '';
    return noteStr.toUpperCase().replace(/[^A-G#]/g, '');
}

function refillAndShuffleDeck() {
    // Exclude songs currently active on other beacons so duplicates never appear at the same time
    let pool = MUSICAL_CHALLENGES.filter(song => !activeArenaSongs.has(song.name));
    if (pool.length === 0) {
        pool = [...MUSICAL_CHALLENGES];
    }

    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    remainingDeck = pool;
}

export function resetChallengeDeck() {
    activeArenaSongs.clear();
    refillAndShuffleDeck();
}

export async function loadSongChallenges() {
    try {
        const response = await fetch(SHEET_CSV_URL);
        if (!response.ok) throw new Error('Failed to fetch spreadsheet');

        const csvText = await response.text();
        const rows = csvText.split('\n');
        const loadedChallenges = [];

        const validNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(val => val.replace(/^"|"$/g, '').trim());

            if (row.length < 4) continue;

            const title = row[0];
            if (!title || title.toUpperCase() === "PIANOPAD") continue;

            const note1 = extractPitchClass(row[1]);
            const note2 = extractPitchClass(row[2]);
            const note3 = extractPitchClass(row[3]);

            if (validNotes.includes(note1) && validNotes.includes(note2) && validNotes.includes(note3)) {
                loadedChallenges.push({
                    name: title,
                    sequence: [note1, note2, note3]
                });
            }
        }

        if (loadedChallenges.length > 0) {
            MUSICAL_CHALLENGES = loadedChallenges;
            console.log(`🎵 Loaded ${MUSICAL_CHALLENGES.length} musical challenges from Google Sheet!`);
        }
    } catch (error) {
        console.error('Error loading song challenges, using fallback:', error);
    }

    resetChallengeDeck();
}

export function getRandomChallenge(completedSongName = null) {
    if (completedSongName) {
        activeArenaSongs.delete(completedSongName);
    }

    if (remainingDeck.length === 0) {
        refillAndShuffleDeck();
    }

    const nextChallenge = remainingDeck.pop();
    activeArenaSongs.add(nextChallenge.name);
    return nextChallenge;
}
