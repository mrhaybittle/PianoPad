import { initAudio, playErrorClackSound, playTone } from '../audio.js';
import { getNoteFrequency, getDiatonicStepAndShift } from '../musicTheory.js';
import { drawSheetMusicStaff, drawStemlessNote, drawLedgerLines } from '../sheetMusic.js';

const SNIPER_POOL = ['c2', 'd2', 'e2', 'f2', 'g2', 'a2', 'b2', 'c3', 'd3', 'e3', 'f3', 'g3'];
const TOTAL_TARGETS = 10;

let currentTargetNote = 'c2';
let targetsHit = 0;
let startTimeMs = 0;
let wrongTaps = 0;

export function startNoteSniper(bridge) {
    initAudio();
    bridge.exitActiveMiniGame();
    document.getElementById('arcade-hub').classList.remove('open');
    bridge.setActiveMiniGame('noteSniper');
    bridge.resetGameStats();

    targetsHit = 0;
    wrongTaps = 0;
    startTimeMs = performance.now();
    pickNextSniperTarget();
}

function pickNextSniperTarget() {
    let next = SNIPER_POOL[Math.floor(Math.random() * SNIPER_POOL.length)];
    if (next === currentTargetNote) {
        next = SNIPER_POOL[(SNIPER_POOL.indexOf(next) + 1) % SNIPER_POOL.length];
    }
    currentTargetNote = next;
    drawSniperStaff();
    document.getElementById('status').textContent = `🎯 Note Name Sniper (${targetsHit + 1}/${TOTAL_TARGETS}): Read the staff and hit the matching key!`;
}

function drawSniperStaff() {
    const canvas = document.getElementById('waterfall-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw clean treble staff without falling waterfall blocks
    drawSheetMusicStaff(ctx, canvas.width);

    const line1_y = 56;
    const halfStep = 4;
    const noteX = canvas.width / 2;
    const info = getDiatonicStepAndShift(currentTargetNote);

    if (info) {
        const noteY = line1_y - info.step * halfStep;
        drawLedgerLines(ctx, noteX, info.step, line1_y, halfStep, '#ef4444');
        drawStemlessNote(ctx, noteX, noteY, info.isSharp, '#ef4444');
    }

    const elapsedSec = ((performance.now() - startTimeMs) / 1000).toFixed(1);
    ctx.save();
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🎯 SNIPE THE NOTE ON THE STAFF!   |   Progress: ${targetsHit}/${TOTAL_TARGETS}   |   Time: ${elapsedSec}s`, canvas.width / 2, canvas.height - 22);
    ctx.restore();
}

export function handleNoteSniperInput(noteStr, bridge) {
    const playedPitch = noteStr.toLowerCase().trim().replace(/[0-9]+$/, '');
    const targetPitch = currentTargetNote.toLowerCase().trim().replace(/[0-9]+$/, '');

    // Match either the exact octave note or matching pitch letter
    if (noteStr.toLowerCase().trim() === currentTargetNote || playedPitch === targetPitch) {
        targetsHit++;
        bridge.highlightKey(noteStr, 250, '#22c55e');
        const freq = getNoteFrequency(currentTargetNote);
        if (freq) playTone(freq, 0.25, 0.8);

        const canvas = document.getElementById('waterfall-canvas');
        bridge.spawnConfetti(canvas.width / 2, 50, '#22c55e');

        if (targetsHit >= TOTAL_TARGETS) {
            const totalTimeSec = parseFloat(((performance.now() - startTimeMs) / 1000).toFixed(2));
            bridge.finishCustomMiniGame(
                "Note Name Sniper",
                totalTimeSec,
                `10 Notes Sniped in: <span style="color:#22c55e; font-size:1.4rem; font-weight:800;">${totalTimeSec}s</span><br><span style="font-size:0.8rem; color:#9ca3af;">(${wrongTaps} missed shots)</span>`
            );
        } else {
            pickNextSniperTarget();
        }
    } else {
        wrongTaps++;
        playErrorClackSound();
        bridge.highlightKey(noteStr, 220, '#ef4444');
        drawSniperStaff();
        document.getElementById('status').textContent = `❌ Missed! Look closely at the line/space on the treble staff...`;
    }
}
