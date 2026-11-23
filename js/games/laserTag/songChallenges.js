// js/games/laserTag/songChallenges.js

// Uses Google's visualization endpoint to fetch the sheet as a clean CSV
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1euEFrGRf_fRAJ_U1SLgXdERRWL_DDd3iPbm16G--MSM/gviz/tq?tqx=out:csv&gid=1630208958';

// Fallback just in case the user is offline or the fetch fails
const FALLBACK_CHALLENGES = [
    { name: "Wipeout", sequence: ['G', 'A#', 'B'] },
    { name: "Eye of the Tiger", sequence: ['C', 'C', 'A#'] },
    { name: "Mary Had A Little Lamb", sequence: ['E', 'D', 'C'] },
    { name: "Shape of You", sequence: ['C', 'D#', 'C'] },
    { name: "Top Gun Theme", sequence: ['C', 'G', 'G'] }
];

export let MUSICAL_CHALLENGES = [...FALLBACK_CHALLENGES];

function extractPitchClass(noteStr) {
    if (!noteStr) return '';
    // Strips out octaves/spaces/garbage, leaving only A-G and # (e.g., "C#2" -> "C#")
    return noteStr.toUpperCase().replace(/[^A-G#]/g, '');
}

export async function loadSongChallenges() {
    try {
        const response = await fetch(SHEET_CSV_URL);
        if (!response.ok) throw new Error('Failed to fetch spreadsheet');
        
        const csvText = await response.text();
        const rows = csvText.split('\n');
        const loadedChallenges = [];
        
        const validNotes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

        for (let i = 0; i < rows.length; i++) {
            // Safely split by commas that aren't trapped inside quotes
            const row = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(val => val.replace(/^"|"$/g, '').trim());
            
            if (row.length < 4) continue; 
            
            const title = row[0];
            // Skip empty rows or the header row if present
            if (!title || title.toUpperCase() === "PIANOPAD") continue;
            
            const note1 = extractPitchClass(row[1]);
            const note2 = extractPitchClass(row[2]);
            const note3 = extractPitchClass(row[3]);
            
            // Only add songs that successfully provided 3 valid musical notes
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
}

export function getRandomChallenge() {
    return MUSICAL_CHALLENGES[Math.floor(Math.random() * MUSICAL_CHALLENGES.length)];
}
