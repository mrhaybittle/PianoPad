import { initAudio, playErrorClackSound, playTone } from '../audio.js';
import { getNoteFrequency } from '../musicTheory.js';

let targetIntervals = [];
let playerTapTimes = [];
let isPrompting = false;
let roundNumber = 1;
let totalAccuracySum = 0;

export function startRhythmEcho(bridge) {
    initAudio();
    bridge.exitActiveMiniGame();
    document.getElementById('arcade-hub').classList.remove('open');
    bridge.setActiveMiniGame('rhythmEcho');
    bridge.resetGameStats();

    roundNumber = 1;
    totalAccuracySum = 0;
    nextRhythmRound(bridge);
}

function nextRhythmRound(bridge) {
    isPrompting = true;
    playerTapTimes = [];
    const beatCount = Math.min(8, 3 + roundNumber); // Rounds 1..5 -> 4..8 beats
    const stepUnits = [280, 420, 560, 700];

    targetIntervals = [];
    for (let i = 0; i < beatCount - 1; i++) {
        targetIntervals.push(stepUnits[Math.floor(Math.random() * stepUnits.length)]);
    }

    drawRhythmPulse(bridge, -1, beatCount, `Round ${roundNumber}/5: Listen closely...`);
    document.getElementById('status').textContent = `🥁 Rhythm Echo (Round ${roundNumber}/5): Listen to the ${beatCount}-beat rhythm...`;

    let cumulativeDelay = 400;
    for (let i = 0; i < beatCount; i++) {
        const beatIdx = i;
        setTimeout(() => {
            if (bridge.getActiveMiniGame() !== 'rhythmEcho') return;
            const freq = getNoteFrequency('c2');
            if (freq) playTone(freq, 0.16, 1.0);
            bridge.highlightKey('c2', 180, '#38bdf8');
            drawRhythmPulse(bridge, beatIdx, beatCount, `Listening... (${beatIdx + 1}/${beatCount})`);

            if (beatIdx === beatCount - 1) {
                setTimeout(() => {
                    isPrompting = false;
                    playerTapTimes = [];
                    drawRhythmPulse(bridge, -1, beatCount, `Your Turn! Tap ANY key ${beatCount} times in rhythm!`);
                    document.getElementById('status').textContent = `🥁 Your Turn! Tap back the ${beatCount}-beat rhythm on any key!`;
                }, 350);
            }
        }, cumulativeDelay);

        if (i < targetIntervals.length) {
            cumulativeDelay += targetIntervals[i];
        }
    }
}

export function handleRhythmEchoInput(noteStr, bridge) {
    if (isPrompting) return;

    const now = performance.now();
    playerTapTimes.push(now);
    const expectedBeats = targetIntervals.length + 1;

    bridge.highlightKey(noteStr, 160, '#facc15');
    drawRhythmPulse(bridge, playerTapTimes.length - 1, expectedBeats, `Tapped ${playerTapTimes.length} / ${expectedBeats}`);

    if (playerTapTimes.length >= expectedBeats) {
        isPrompting = true;
        let roundScoreSum = 0;

        for (let i = 0; i < targetIntervals.length; i++) {
            const actualGap = playerTapTimes[i + 1] - playerTapTimes[i];
            const targetGap = targetIntervals[i];
            const errorMs = Math.abs(actualGap - targetGap);
            const beatAcc = Math.max(0, 100 - (errorMs / targetGap) * 100);
            roundScoreSum += beatAcc;
        }

        const roundAcc = roundScoreSum / targetIntervals.length;
        totalAccuracySum += roundAcc;

        const canvas = document.getElementById('waterfall-canvas');
        if (roundAcc >= 75) {
            bridge.spawnConfetti(canvas.width / 2, canvas.height / 2, '#22c55e');
        } else {
            playErrorClackSound();
        }

        document.getElementById('status').textContent = `🥁 Round ${roundNumber} Timing Accuracy: ${roundAcc.toFixed(1)}%`;

        if (roundNumber < 5) {
            roundNumber++;
            setTimeout(() => {
                if (bridge.getActiveMiniGame() === 'rhythmEcho') nextRhythmRound(bridge);
            }, 1300);
        } else {
            const finalAvg = parseFloat((totalAccuracySum / 5).toFixed(1));
            bridge.finishCustomMiniGame("Rhythm Echo", finalAvg, `Timing Precision: <span style="color:#22c55e; font-size:1.4rem; font-weight:800;">${finalAvg}%</span>`);
        }
    }
}

function drawRhythmPulse(bridge, activeIdx, totalBeats, labelText) {
    const canvas = document.getElementById('waterfall-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const spacing = Math.min(60, (canvas.width - 120) / Math.max(1, totalBeats));
    const startX = (canvas.width - (spacing * (totalBeats - 1))) / 2;
    const centerY = canvas.height * 0.55;

    for (let i = 0; i < totalBeats; i++) {
        const x = startX + i * spacing;
        const isCurrent = i === activeIdx;
        const isDone = i < activeIdx;

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, centerY, isCurrent ? 18 : 13, 0, Math.PI * 2);
        ctx.fillStyle = isCurrent ? '#38bdf8' : (isDone ? '#22c55e' : '#1f2937');
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#9ca3af';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, x, centerY);
        ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labelText, canvas.width / 2, 24);
    ctx.restore();
}
