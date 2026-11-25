import { initAudio, playErrorClackSound, playTone } from './audio.js';
import { getNoteFrequency, noteToPitch, pitchToNote, parsePianoPad, autoTransposeSong } from './musicTheory.js';
import { APPS_SCRIPT_URL } from './config.js';
import { startRhythmEcho, handleRhythmEchoInput } from './games/rhythmEcho.js';
import { startNoteSniper, handleNoteSniperInput } from './games/noteSniper.js';
import { startFlappyPitch, handleFlappyPitchInput, stopFlappyPitch } from './games/flappyPitch.js';
import { startStaffSurfers, handleStaffSurfersInput, stopStaffSurfers } from './games/staffSurfers.js';
import { startLaserTag, handleLaserTagInput, handleLaserTagRelease, stopLaserTag } from './games/laserTag.js';
import { startGridironGroove, handleGridironGrooveInput, stopGridironGroove } from './games/GridironGroove.js';
import { startClefHook, handleClefHookInput, stopClefHook } from './games/clefHook.js';
import { startSharpShooter, handleSharpShooterInput, handleSharpShooterRelease, stopSharpShooter } from './games/sharpShooter.js';
import { startSkiSlalom, handleSkiSlalomInput, handleSkiSlalomRelease, stopSkiSlalom } from './games/skiSlalom.js';
import { startPedalPoint, handlePedalPointInput, handlePedalPointRelease, stopPedalPoint } from './games/pedalPoint.js';
import { startRockBall, handleRockBallInput, handleRockBallRelease, stopRockBall } from './games/rockBall.js';
import { startErcRugby, handleErcRugbyInput, stopErcRugby } from './games/ercRugby.js';

export const arcadeState = {
    activeMiniGame: null,
    miniGameFallSpeedMs: 3800,
    isSongBattle: false,
    raceActive: false
};

let simonSequence = [];
let simonPlayerIndex = 0;
let simonIsPrompting = false;

let mysteryTargetPitch = null;
let mysteryGuessCount = 0;

let dodgeLives = 5;
let dodgeDodgedCount = 0;

let httpPollTimer = null;
let isSprintHost = false;
let localPlayerIdRoom = 'p1';
let sprintSequence = ['c1', 'd1'];
let sprintIndex = 0;
let sprintKeystrokeCount = 0;
let sprintStartTime = 0;
let activeBattleRoomCode = "";
let hasBattleStarted = false;
let battleResultsShown = false;
let playersList = [];

let lastCustomMiniGameReplay = null;

const cMajorScaleNotes = ['c1', 'd1', 'e1', 'f1', 'g1', 'a1', 'b1', 'c2'];
const AVATARS = ['🏃', '🏃‍♀️', '🚴', '🦊', '🐯', '🤖', '🛸', '🦄', '🎹', '🎧', '👨‍🎤', '😎', '🐱', '🐲', '🚀', '🥷'];

let bridge = null;

export function initMiniGamesBridge(deps) {
    bridge = deps;
    injectNewArcadeButtons();
}

function injectNewArcadeButtons() {
    const hub = document.getElementById('arcade-hub');
    if (!hub) return;

    const btnContainer = hub.querySelector('.arcade-grid') || hub;

    if (!document.getElementById('btn-arcade-flappy-pitch')) {
        const flappyBtn = document.createElement('button');
        flappyBtn.type = 'button';
        flappyBtn.id = 'btn-arcade-flappy-pitch';
        flappyBtn.className = 'arcade-card-btn';
        flappyBtn.onclick = () => launchFlappyPitch();
        flappyBtn.innerHTML = `<span style="font-size:1.5rem;">🐦</span><strong>Flappy Pitch</strong><small>Steer with high & low notes</small>`;
        btnContainer.appendChild(flappyBtn);
    }

    if (!document.getElementById('btn-arcade-rhythm-echo')) {
        const rhythmBtn = document.createElement('button');
        rhythmBtn.type = 'button';
        rhythmBtn.id = 'btn-arcade-rhythm-echo';
        rhythmBtn.className = 'arcade-card-btn';
        rhythmBtn.onclick = () => launchRhythmEcho();
        rhythmBtn.innerHTML = `<span style="font-size:1.5rem;">🥁</span><strong>Rhythm Echo</strong><small>Tap back the beat</small>`;
        btnContainer.appendChild(rhythmBtn);
    }

    if (!document.getElementById('btn-arcade-note-sniper')) {
        const sniperBtn = document.createElement('button');
        sniperBtn.type = 'button';
        sniperBtn.id = 'btn-arcade-note-sniper';
        sniperBtn.className = 'arcade-card-btn';
        sniperBtn.onclick = () => launchNoteSniper();
        sniperBtn.innerHTML = `<span style="font-size:1.5rem;">🎯</span><strong>Note Sniper</strong><small>Sight-reading speed</small>`;
        btnContainer.appendChild(sniperBtn);
    }

    if (!document.getElementById('btn-arcade-staff-surfers') && !document.getElementById('btn-arcade-scale-surfers')) {
        const surfersBtn = document.createElement('button');
        surfersBtn.type = 'button';
        surfersBtn.id = 'btn-arcade-staff-surfers';
        surfersBtn.className = 'arcade-card-btn';
        surfersBtn.onclick = () => launchScaleSurfers();
        surfersBtn.innerHTML = `<span style="font-size:1.5rem;">🚇</span><strong>Scale Surfers</strong><small>Dodge trains & hit notes</small>`;
        btnContainer.appendChild(surfersBtn);
    }

    if (!document.getElementById('btn-arcade-gridiron-groove')) {
        const gridironBtn = document.createElement('button');
        gridironBtn.type = 'button';
        gridironBtn.id = 'btn-arcade-gridiron-groove';
        gridironBtn.className = 'arcade-card-btn';
        gridironBtn.onclick = () => launchGridironGroove();
        gridironBtn.innerHTML = `<span style="font-size:1.5rem;">🏈</span><strong>Gridiron Groove</strong><small>Retro Bowl note passing</small>`;
        btnContainer.appendChild(gridironBtn);
    }

    if (!document.getElementById('btn-arcade-erc-rugby')) {
        const rugbyBtn = document.createElement('button');
        rugbyBtn.type = 'button';
        rugbyBtn.id = 'btn-arcade-erc-rugby';
        rugbyBtn.className = 'arcade-card-btn';
        rugbyBtn.onclick = () => launchErcRugby();
        rugbyBtn.innerHTML = `<span style="font-size:1.5rem;">🏉</span><strong>ERC Rugby</strong><small>C–G lanes, tries &amp; kicks</small>`;
        btnContainer.appendChild(rugbyBtn);
    }

    if (!document.getElementById('btn-arcade-clef-hook')) {
        const clefHookBtn = document.createElement('button');
        clefHookBtn.type = 'button';
        clefHookBtn.id = 'btn-arcade-clef-hook';
        clefHookBtn.className = 'arcade-card-btn';
        clefHookBtn.onclick = () => launchClefHook();
        clefHookBtn.innerHTML = `<span style="font-size:1.5rem;">🕷️</span><strong>Clef Hook</strong><small>Swing & flip across grapple nodes</small>`;
        btnContainer.appendChild(clefHookBtn);
    }

    if (!document.getElementById('btn-arcade-sharp-shooter')) {
        const sharpBtn = document.createElement('button');
        sharpBtn.type = 'button';
        sharpBtn.id = 'btn-arcade-sharp-shooter';
        sharpBtn.className = 'arcade-card-btn';
        sharpBtn.onclick = () => launchSharpShooter();
        sharpBtn.innerHTML = `<span style="font-size:1.5rem;">⚽</span><strong>Sharp <span style="color:#facc15;">♯</span> Shooter</strong><small>Penalty kick shootout</small>`;
        btnContainer.appendChild(sharpBtn);
    }

    if (!document.getElementById('btn-arcade-ski-slalom')) {
        const skiBtn = document.createElement('button');
        skiBtn.type = 'button';
        skiBtn.id = 'btn-arcade-ski-slalom';
        skiBtn.className = 'arcade-card-btn';
        skiBtn.onclick = () => launchSkiSlalom();
        skiBtn.innerHTML = `<span style="font-size:1.5rem;">⛷️</span><strong>3D Ski Slalom</strong><small>Carve gates & grind rails</small>`;
        btnContainer.appendChild(skiBtn);
    }

    if (!document.getElementById('btn-arcade-rockball')) {
        const rockBallBtn = document.createElement('button');
        rockBallBtn.type = 'button';
        rockBallBtn.id = 'btn-arcade-rockball';
        rockBallBtn.className = 'arcade-card-btn';
        rockBallBtn.onclick = () => launchRockBall();
        rockBallBtn.innerHTML = `<span style="font-size:1.5rem;">🎸</span><strong>RockBall</strong><small>Rock &amp; Hip-Hop arcade pinball</small>`;
        btnContainer.appendChild(rockBallBtn);
    }

    if (!document.getElementById('btn-arcade-pedal-point')) {
        const mtbBtn = document.createElement('button');
        mtbBtn.type = 'button';
        mtbBtn.id = 'btn-arcade-pedal-point';
        mtbBtn.className = 'arcade-card-btn';
        mtbBtn.onclick = () => launchPedalPoint();
        mtbBtn.innerHTML = `<span style="font-size:1.5rem;">🚵‍♂️</span><strong>Pedal Point</strong><small>3D downhill MTB & melody trails</small>`;
        btnContainer.appendChild(mtbBtn);
    }
}

function resolveReplayHandler(title, explicitReplayFn) {
    if (typeof explicitReplayFn === 'function') return explicitReplayFn;

    const normalized = (title || '').trim().toLowerCase();
    if (normalized === 'gridiron groove') return () => launchGridironGroove();
    if (normalized === 'scale surfers' || normalized === 'staff surfers') return () => launchScaleSurfers();
    if (normalized === 'flappy pitch') return () => launchFlappyPitch();
    if (normalized === 'rhythm echo') return () => launchRhythmEcho();
    if (normalized === 'note sniper') return () => launchNoteSniper();
    if (normalized === 'simon taps') return () => startSimonTaps();
    if (normalized === 'mystery note') return () => startMysteryNote();
    if (normalized === 'drop dodge') return () => startDropDodge();
    if (normalized === 'combo strike') return () => startComboStrike();
    if (normalized === 'clef hook') return () => launchClefHook();
    if (normalized === 'sharp shooter') return () => launchSharpShooter();
    if (normalized === '3d ski slalom' || normalized === 'ski slalom') return () => launchSkiSlalom();
    if (normalized === 'pedal point') return () => launchPedalPoint();
    if (normalized === 'rockball') return () => launchRockBall();
    if (normalized === 'erc sports rugby' || normalized === 'erc rugby') return () => launchErcRugby();
    return null;
}

const gameBridgeHelper = {
    getState: () => bridge.getState(),
    getActiveMiniGame: () => arcadeState.activeMiniGame,
    setActiveMiniGame: (val) => { arcadeState.activeMiniGame = val; },
    exitActiveMiniGame,
    resetGameStats: () => bridge.resetGameStats(),
    highlightKey: (n, d, c) => bridge.highlightKey(n, d, c),
    spawnConfetti: (x, y, c) => bridge.spawnConfetti(x, y, c),
    finishCustomMiniGame: (title, scoreVal, summaryHtml, replayFn = null) => {
        const displayTitle = /^staff surfers$/i.test((title || '').trim()) ? 'Scale Surfers' : title;
        const resolvedReplay = resolveReplayHandler(displayTitle, replayFn);
        lastCustomMiniGameReplay = resolvedReplay;

        bridge.setCurrentSongTitle(displayTitle);
        const studentName = bridge.ensureStudentName();
        document.getElementById('game-summary-text').innerHTML =
            `Student: <span style="color:#38bdf8;">${studentName}</span><br>${summaryHtml}`;
        document.getElementById('single-bar-graph').style.display = 'flex';
        document.getElementById('multi-bar-graph').style.display = 'none';

        const battleAgainBtn = document.getElementById('btn-battle-again');
        if (battleAgainBtn) {
            if (typeof resolvedReplay === 'function') {
                battleAgainBtn.textContent = '🔄 Play Again';
                battleAgainBtn.style.display = 'inline-flex';
                battleAgainBtn.onclick = () => {
                    document.getElementById('game-results-modal')?.classList.remove('open');
                    resolvedReplay();
                };
            } else {
                battleAgainBtn.style.display = 'none';
            }
        }

        document.getElementById('bar-green').style.height = '100%';
        document.getElementById('bar-orange').style.height = '0%';
        document.getElementById('bar-red').style.height = '0%';
        document.getElementById('game-rank-text').textContent = `${displayTitle} Score Logged!`;
        document.getElementById('game-results-modal').classList.add('open');

        const arcadeControls = document.getElementById('arcade-controls-bar');
        if (arcadeControls && arcadeControls.style.display !== 'none') {
            document.getElementById('arcade-hub')?.classList.add('open');
        }

        bridge.postScoreToLeaderboard(scoreVal);
        arcadeState.activeMiniGame = null;
    }
};

export function stopBattlePolling() {
    arcadeState.isSongBattle = false;
    activeBattleRoomCode = "";
    battleResultsShown = false;
    if (httpPollTimer) {
        clearInterval(httpPollTimer);
        httpPollTimer = null;
    }
}

export function openArcadeHub() {
    initAudio();
    bridge.stopSong();
    document.getElementById('main-controls-bar').style.display = 'none';
    document.getElementById('timeline-box').style.display = 'none';
    document.getElementById('arcade-controls-bar').style.display = 'flex';
    document.getElementById('arcade-hub').classList.add('open');
    document.getElementById('status').textContent = ' PianoPad Arcade Active! Choose a Mini-Game above.';
}

export function returnToPlayerHome() {
    exitActiveMiniGame();
    document.getElementById('arcade-hub').classList.remove('open');
    document.getElementById('arcade-controls-bar').style.display = 'none';
    document.getElementById('runner-track').style.display = 'none';
    document.getElementById('main-controls-bar').style.display = 'flex';
    document.getElementById('timeline-box').style.display = 'inline-flex';
    document.getElementById('status').textContent = 'Returned to PianoPad Player view.';
}

export function exitActiveMiniGame() {
    stopFlappyPitch();
    stopStaffSurfers();
    stopLaserTag();
    stopGridironGroove();
    stopClefHook();
    stopSharpShooter();
    stopSkiSlalom();
    stopPedalPoint();
    stopRockBall();
    stopErcRugby();

    const gridironPopup = document.getElementById('gridiron-groove-popup');
    if (gridironPopup) gridironPopup.style.display = 'none';

    const surfersPopup = document.getElementById('scale-surfers-popup');
    if (surfersPopup) surfersPopup.style.display = 'none';

    const clefHookPopup = document.getElementById('clef-hook-popup');
    if (clefHookPopup) clefHookPopup.style.display = 'none';

    const sharpPopup = document.getElementById('sharp-shooter-popup');
    if (sharpPopup) sharpPopup.style.display = 'none';

    const skiPopup = document.getElementById('ski-slalom-calib-popup');
    if (skiPopup) skiPopup.style.display = 'none';

    arcadeState.activeMiniGame = null;
    bridge.setIsPlaying(false);
    arcadeState.raceActive = false;
    stopBattlePolling();

    const runnerTrack = document.getElementById('runner-track');
    if (runnerTrack) {
        runnerTrack.style.display = 'none';
        runnerTrack.innerHTML = '';
    }

    const canvas = document.getElementById('waterfall-canvas');
    if (canvas) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    document.querySelectorAll('.key').forEach(k => {
        k.classList.remove('active');
        k.style.backgroundColor = '';
        k.style.boxShadow = '';
    });

    document.getElementById('status').textContent = 'Arcade Mini-Game stopped. Select another game or return Home.';
}

export function handleMiniGameNoteInput(noteStr) {
    const mode = arcadeState.activeMiniGame;
    if (!mode) return false;

    if (mode === 'skiSlalom') {
        handleSkiSlalomInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'pedalPoint') {
        handlePedalPointInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'clefHook') {
        window.__clefHookUsedDomKey = Boolean(document.querySelector('#keyboard .key.active'));
        handleClefHookInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'sharpShooter') {
        handleSharpShooterInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'laserTag') {
        handleLaserTagInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'gridironGroove') {
        handleGridironGrooveInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'staffSurfers' || mode === 'scaleSurfers') {
        handleStaffSurfersInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'flappyPitch') {
        handleFlappyPitchInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'rhythmEcho') {
        handleRhythmEchoInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'noteSniper') {
        handleNoteSniperInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'rockBall') {
        handleRockBallInput(noteStr, gameBridgeHelper);
        return true;
    }
    if (mode === 'ercRugby') {
        handleErcRugbyInput(noteStr, gameBridgeHelper);
        return true;
    }

    if (mode === 'drop') {
        const { noteTimeline, playbackStartTime, accumulatedPauseMs, gameStats, keyPosMap } = bridge.getState();
        const canvas = document.getElementById('waterfall-canvas');
        const effectiveElapsed = (performance.now() - playbackStartTime) - accumulatedPauseMs;
        const activeWall = noteTimeline.find(item => item.gameStatus === 'pending' && Math.abs(effectiveElapsed - item.hitTime) <= 600);

        if (activeWall && activeWall.safeKey) {
            if (noteStr.toLowerCase().trim() === activeWall.safeKey.toLowerCase().trim()) {
                activeWall.gameStatus = 'perfect';
                dodgeDodgedCount++;
                gameStats.perfect++;
                bridge.highlightKey(noteStr, 220, '#22c55e');
                document.getElementById('status').textContent = ` Safe Dodge! Total Dodges: ${dodgeDodgedCount} | Lives: ❤️ ${dodgeLives}`;
                const safePos = keyPosMap[noteStr.toLowerCase().trim()];
                if (safePos) bridge.spawnConfetti(safePos.left + safePos.width / 2, canvas.height, '#22c55e');
            } else {
                activeWall.gameStatus = 'miss';
                dodgeLives--;
                gameStats.miss++;
                playErrorClackSound();
                bridge.highlightKey(noteStr, 220, '#ef4444');
                document.getElementById('status').textContent = ` Wall Impact! Lives left: ❤️ ${dodgeLives} | Dodges: ${dodgeDodgedCount}`;
                if (dodgeLives <= 0) {
                    bridge.setIsPlaying(false);
                    bridge.setCurrentSongTitle("Drop Dodge");
                    bridge.showGameResultsPopUp();
                    arcadeState.activeMiniGame = null;
                }
            }
        } else {
            bridge.highlightKey(noteStr, 200, '#ef4444');
        }
        return true;
    }
    if (mode === 'simon') {
        handleSimonInput(noteStr);
        bridge.highlightKey(noteStr);
        return true;
    }
    if (mode === 'mystery') {
        handleMysteryInput(noteStr);
        return true;
    }
    if (mode === 'sprint') {
        handleSprintInput(noteStr);
        return true;
    }
    return false;
}

export function handleMiniGameNoteRelease(noteStr) {
    if (arcadeState.activeMiniGame === 'laserTag') {
        handleLaserTagRelease(noteStr);
        return true;
    }
    if (arcadeState.activeMiniGame === 'skiSlalom') {
        handleSkiSlalomRelease(noteStr);
        return true;
    }
    if (arcadeState.activeMiniGame === 'pedalPoint') {
        handlePedalPointRelease(noteStr);
        return true;
    }
    if (arcadeState.activeMiniGame === 'sharpShooter') {
        handleSharpShooterRelease(noteStr);
        return true;
    }
    if (arcadeState.activeMiniGame === 'rockBall') {
        handleRockBallRelease(noteStr);
        return true;
    }
    return false;
}

// --- SIMON TAPS ---
export function startSimonTaps() {
    initAudio();
    exitActiveMiniGame();
    document.getElementById('game-results-modal')?.classList.remove('open');
    document.getElementById('arcade-hub').classList.remove('open');
    arcadeState.activeMiniGame = 'simon';
    simonSequence = [];
    bridge.resetGameStats();
    document.getElementById('status').textContent = ' Simon Taps: Watch and listen to the pattern...';
    nextSimonRound();
}

export function drawSimonStaircase() {
    const level = simonSequence.length;
    const canvas = document.getElementById('waterfall-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (level <= 0) return;

    const startX = 60;
    const startY = canvas.height - 25;
    const stepWidth = Math.min(32, (canvas.width - 120) / Math.max(level, 10));
    const stepHeight = Math.min(18, (canvas.height - 40) / Math.max(level, 10));
    const colorPalettes = [['#22c55e', '#16a34a'], ['#ec4899', '#db2777'], ['#06b6d4', '#0891b2'], ['#f59e0b', '#d97706']];

    for (let i = 0; i < level; i++) {
        const colors = colorPalettes[Math.min(colorPalettes.length - 1, Math.floor(i / 5))];
        const px = startX + i * stepWidth;
        const py = startY - i * stepHeight;
        ctx.save();
        ctx.fillStyle = colors[0];
        ctx.shadowColor = colors[0];
        ctx.shadowBlur = 8;
        ctx.fillRect(px, py, stepWidth - 2, stepHeight - 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, px + stepWidth / 2 - 1, py + stepHeight / 2 - 1);
        ctx.restore();
    }
}

function nextSimonRound() {
    simonPlayerIndex = 0;
    simonIsPrompting = true;

    if (simonSequence.length === 0) {
        simonSequence.push('c1', 'd1');
    } else {
        const lastIdx = cMajorScaleNotes.indexOf(simonSequence[simonSequence.length - 1]);
        const nextIdx = Math.max(0, Math.min(cMajorScaleNotes.length - 1, lastIdx + (Math.random() > 0.5 ? 1 : -1)));
        simonSequence.push(cMajorScaleNotes[nextIdx]);
    }

    drawSimonStaircase();
    document.getElementById('status').textContent = ` Simon Taps (Level ${simonSequence.length}): Memorize pattern...`;

    let step = 0;
    const interval = setInterval(() => {
        if (step < simonSequence.length) {
            const note = simonSequence[step];
            const freq = getNoteFrequency(note);
            if (freq) playTone(freq, 0.35, 1.0);
            bridge.highlightKey(note, 350, '#8b5cf6');
            step++;
        } else {
            clearInterval(interval);
            simonIsPrompting = false;
            document.getElementById('status').textContent = ` Your Turn! Play back Level ${simonSequence.length}...`;
        }
    }, 600);
}

function handleSimonInput(noteStr) {
    if (simonIsPrompting) return;
    const expected = simonSequence[simonPlayerIndex];
    if (noteStr.toLowerCase().trim() === expected.toLowerCase().trim()) {
        simonPlayerIndex++;
        if (simonPlayerIndex >= simonSequence.length) {
            const canvas = document.getElementById('waterfall-canvas');
            bridge.spawnConfetti(canvas.width / 2, canvas.height / 2, '#8b5cf6');
            document.getElementById('status').textContent = ` Level ${simonSequence.length} Complete! Escalating to Level ${simonSequence.length + 1}...`;
            setTimeout(nextSimonRound, 1200);
        }
    } else {
        playErrorClackSound();
        const maxLevelRemembered = Math.max(1, simonSequence.length - 1);
        gameBridgeHelper.finishCustomMiniGame(
            "Simon Taps",
            maxLevelRemembered,
            `Max Level Remembered: <span style="color:#22c55e; font-size:1.3rem;">Level ${maxLevelRemembered}</span>`,
            () => startSimonTaps()
        );
    }
}

// --- MYSTERY NOTE ---
export function startMysteryNote() {
    initAudio();
    exitActiveMiniGame();
    document.getElementById('game-results-modal')?.classList.remove('open');
    document.getElementById('arcade-hub').classList.remove('open');
    arcadeState.activeMiniGame = 'mystery';
    mysteryGuessCount = 0;
    bridge.resetGameStats();

    const randomPitch = Math.floor(Math.random() * 48) + 12;
    mysteryTargetPitch = pitchToNote(randomPitch);
    const freq = getNoteFrequency(mysteryTargetPitch);
    if (freq) playTone(freq, 0.6, 1.0);
    document.getElementById('status').textContent = ' Mystery Note chosen! Tap keys to guess...';
}

function handleMysteryInput(noteStr) {
    mysteryGuessCount++;
    const guessedPitchNum = noteToPitch(noteStr);
    const targetPitchNum = noteToPitch(mysteryTargetPitch);
    if (guessedPitchNum === null || targetPitchNum === null) return;

    const diff = Math.abs(guessedPitchNum - targetPitchNum);
    if (diff === 0) {
        bridge.highlightKey(noteStr, 500, '#22c55e');
        const { keyPosMap } = bridge.getState();
        const canvas = document.getElementById('waterfall-canvas');
        const mPos = keyPosMap[noteStr.toLowerCase().trim()];
        if (mPos) bridge.spawnConfetti(mPos.left + mPos.width / 2, canvas.height, '#22c55e');
        gameBridgeHelper.finishCustomMiniGame(
            "Mystery Note",
            mysteryGuessCount,
            `Guesses Taken: <span style="color:#22c55e; font-size:1.4rem; font-weight:800;">${mysteryGuessCount}</span>`,
            () => startMysteryNote()
        );
    } else if (diff <= 2) {
        bridge.highlightKey(noteStr, 250, '#ef4444');
        document.getElementById('status').textContent = ` Sizzle HOT! You are right next to it! (Guesses: ${mysteryGuessCount})`;
    } else if (diff <= 6) {
        bridge.highlightKey(noteStr, 250, '#f97316');
        document.getElementById('status').textContent = ` Warm... Getting closer! (Guesses: ${mysteryGuessCount})`;
    } else {
        bridge.highlightKey(noteStr, 250, '#38bdf8');
        document.getElementById('status').textContent = ` Ice COLD! Far away... (Guesses: ${mysteryGuessCount})`;
    }
}

// --- DROP DODGE ---
export function startDropDodge() {
    initAudio();
    exitActiveMiniGame();
    document.getElementById('game-results-modal')?.classList.remove('open');
    document.getElementById('arcade-hub').classList.remove('open');
    arcadeState.activeMiniGame = 'drop';
    dodgeLives = 5;
    dodgeDodgedCount = 0;
    bridge.resetGameStats();
    arcadeState.miniGameFallSpeedMs = 3800;

    const { keyLayout } = bridge.getState();
    const whiteKeys = keyLayout.filter(k => k.type === 'white').map(k => k.note);
    const generatedSong = [];
    for (let i = 0; i < 20; i++) {
        const safeKey = whiteKeys[Math.floor(Math.random() * whiteKeys.length)];
        generatedSong.push({ notes: whiteKeys.filter(k => k !== safeKey), safeKey, rest: 2200 });
    }
    bridge.startGeneratedTimelineSong(generatedSong, ` DROP DODGE ACTIVE! Lives: ❤️ ${dodgeLives} | Dodges: 0`);
}

// --- COMBO STRIKE ---
export function startComboStrike() {
    initAudio();
    exitActiveMiniGame();
    document.getElementById('game-results-modal')?.classList.remove('open');
    document.getElementById('arcade-hub').classList.remove('open');
    arcadeState.activeMiniGame = 'combo';
    bridge.resetGameStats();
    arcadeState.miniGameFallSpeedMs = 2400;

    const comboPairs = [['c1', 'g1'], ['c1', 'e1'], ['f1', 'a1'], ['g1', 'b1'], ['c2', 'e2'], ['d1', 'f1']];
    const generatedSong = [];
    for (let i = 0; i < 12; i++) {
        generatedSong.push({ notes: comboPairs[Math.floor(Math.random() * comboPairs.length)], rest: 1800 });
    }
    bridge.startGeneratedTimelineSong(generatedSong, ' TWO-NOTE COMBO STRIKE! Strike falling note intervals simultaneously!');
}

// --- FINGER SPRINT & SONG BATTLE MULTIPLAYER ---
export function openSprintModeSelector() {
    initAudio();
    bridge.initSwissTournamentUI();
    arcadeState.isSongBattle = false;
    const btnKo = document.getElementById('btn-host-knockout-opt');
    if (btnKo) btnKo.style.display = 'none';
    document.getElementById('battle-modal-title').textContent = " Finger Sprint Setup";
    document.getElementById('battle-modal-subtitle').textContent = "Select your race mode:";
    document.getElementById('btn-sprint-bot-opt').style.display = 'inline-flex';
    document.getElementById('host-song-selector-group').style.display = 'none';
    document.getElementById('sprint-menu-buttons').style.display = 'flex';
    document.getElementById('sprint-form-container').style.display = 'none';
    document.getElementById('inline-name-error').style.display = 'none';
    document.getElementById('sprint-option-modal').classList.add('open');
}

export function openSongBattleSelector() {
    initAudio();
    bridge.initSwissTournamentUI();
    arcadeState.isSongBattle = true;
    battleResultsShown = false;
    bridge.disableStepModeIfActive();

    const btnKo = document.getElementById('btn-host-knockout-opt');
    if (btnKo) btnKo.style.display = 'inline-flex';
    document.getElementById('battle-modal-title').textContent = ` Song Battle Setup`;
    document.getElementById('battle-modal-subtitle').textContent = "Host or join a live song battle:";
    document.getElementById('btn-sprint-bot-opt').style.display = 'none';
    document.getElementById('sprint-menu-buttons').style.display = 'flex';
    document.getElementById('sprint-form-container').style.display = 'none';
    document.getElementById('inline-name-error').style.display = 'none';
    document.getElementById('sprint-option-modal').classList.add('open');
}

export function closeSprintOptionModal() {
    document.getElementById('sprint-option-modal').classList.remove('open');
}

export function openHostNamePrompt() {
    document.getElementById('sprint-menu-buttons').style.display = 'none';
    document.getElementById('sprint-form-container').style.display = 'flex';
    document.getElementById('code-input-group').style.display = 'none';
    document.getElementById('host-lobby-group').style.display = 'none';
    document.getElementById('client-waiting-group').style.display = 'none';
    document.getElementById('inline-name-error').style.display = 'none';

    const confirmBtn = document.getElementById('btn-confirm-sprint-action');
    confirmBtn.style.display = 'inline-flex';
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm & Continue';

    if (arcadeState.isSongBattle) {
        const { songList, currentSongTitle } = bridge.getState();
        const hostSelect = document.getElementById('host-battle-song-select');
        hostSelect.innerHTML = '';
        songList.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.code;
            opt.textContent = s.title;
            if (s.title === currentSongTitle) opt.selected = true;
            hostSelect.appendChild(opt);
        });
        document.getElementById('host-song-selector-group').style.display = 'flex';
    } else {
        document.getElementById('host-song-selector-group').style.display = 'none';
    }

    confirmBtn.onclick = () => {
        if (confirmBtn.disabled) return;
        const rawName = document.getElementById('sprint-player-name').value;
        if (!rawName.trim()) {
            document.getElementById('inline-name-error').style.display = 'block';
            document.getElementById('sprint-player-name').focus();
            return;
        }
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Starting...';
        const nameInput = bridge.sanitizeName(rawName);
        document.getElementById('sprint-player-name').value = nameInput;

        if (arcadeState.isSongBattle) {
            const sel = document.getElementById('host-battle-song-select');
            const selectedCode = sel.value;
            const opt = sel.selectedOptions[0];
            if (opt) bridge.setCurrentSongTitle(opt.text);
            document.getElementById('song-select').value = selectedCode;
            const parsed = parsePianoPad(selectedCode);
            if (parsed.length > 0) bridge.setCurrentSong(autoTransposeSong(parsed));
        }
        showHostSetup(nameInput);
    };
}

export function openJoinNamePrompt() {
    document.getElementById('sprint-menu-buttons').style.display = 'none';
    document.getElementById('sprint-form-container').style.display = 'flex';
    document.getElementById('code-input-group').style.display = 'flex';
    document.getElementById('host-song-selector-group').style.display = 'none';
    document.getElementById('host-lobby-group').style.display = 'none';
    document.getElementById('client-waiting-group').style.display = 'none';
    document.getElementById('inline-name-error').style.display = 'none';

    const confirmBtn = document.getElementById('btn-confirm-sprint-action');
    confirmBtn.style.display = 'inline-flex';
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm & Continue';

    confirmBtn.onclick = () => {
        if (confirmBtn.disabled) return;
        const rawName = document.getElementById('sprint-player-name').value;
        const roomCode = document.getElementById('sprint-room-code').value.trim().toUpperCase();
        if (!rawName.trim()) {
            document.getElementById('inline-name-error').style.display = 'block';
            document.getElementById('sprint-player-name').focus();
            return;
        }
        if (!roomCode) {
            alert("Please enter a valid Host Join Code!");
            document.getElementById('sprint-room-code').focus();
            return;
        }
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Joining...';
        const nameInput = bridge.sanitizeName(rawName);
        document.getElementById('sprint-player-name').value = nameInput;
        showJoinSetup(nameInput, roomCode);
    };
}

export function initSinglePlayerSprint() {
    closeSprintOptionModal();
    exitActiveMiniGame();
    document.getElementById('game-results-modal')?.classList.remove('open');
    document.getElementById('arcade-hub').classList.remove('open');
    arcadeState.activeMiniGame = 'sprint';
    bridge.resetGameStats();

    const { sessionStudentAvatar } = bridge.getState();
    playersList = [
        { id: 'p1', name: 'YOU', avatar: sessionStudentAvatar || '🏃', pxProgress: 0, finishTime: null, finished: false, isLocal: true, clearedHurdles: [] },
        { id: 'bot', name: 'ROBO-OPPONENT', avatar: '🤖', pxProgress: 0, finishTime: null, finished: false, isBot: true, clearedHurdles: [] }
    ];
    localPlayerIdRoom = 'p1';

    renderSprintLanes();
    bridge.startCountdown(() => {
        arcadeState.raceActive = true;
        sprintStartTime = performance.now();
        sprintKeystrokeCount = 0;
        sprintIndex = 0;
        bridge.highlightKey(sprintSequence[0], 500, '#eab308');
        document.getElementById('status').textContent = '🏃 SPRINT! Alternate C1 (Z) and D1 (X) fast! Play HIGH notes (Octave 2+) on hurdles for a boost!';

        const botInt = setInterval(() => {
            if (!arcadeState.raceActive) { clearInterval(botInt); return; }
            const bot = playersList.find(p => p.id === 'bot');
            if (bot && !bot.finished) {
                bot.pxProgress += 42.0 + Math.random() * 6.0;
                updateMultiplayerLanesUI();
                if (bot.pxProgress >= 3600) {
                    bot.pxProgress = 3600;
                    bot.finishTime = ((performance.now() - sprintStartTime) / 1000).toFixed(2);
                    bot.finished = true;
                    checkAllFinished();
                }
            }
        }, 100);
    });
}

function renderLobbyGrid(gridElementId) {
    const grid = document.getElementById(gridElementId);
    if (!grid) return;
    grid.innerHTML = '';
    playersList.forEach((player) => {
        const card = document.createElement('div');
        card.className = 'lobby-player-card';
        card.innerHTML = `<span>${player.avatar}</span><span>${player.name}</span>`;
        grid.appendChild(card);
    });
}

async function showHostSetup(hostName) {
    bridge.setStudentName(hostName);
    document.getElementById('btn-confirm-sprint-action').style.display = 'none';
    document.getElementById('host-lobby-group').style.display = 'flex';
    document.getElementById('host-song-selector-group').style.display = 'none';

    activeBattleRoomCode = '' + Math.floor(100 + Math.random() * 900);
    document.getElementById('generated-room-code-display').textContent = `Join Code: ${activeBattleRoomCode}`;

    const { sessionStudentAvatar, currentSongTitle } = bridge.getState();
    isSprintHost = true;
    localPlayerIdRoom = 'p1';
    playersList = [{ id: 'p1', name: hostName, avatar: sessionStudentAvatar || AVATARS[0], pxProgress: 0, finishTime: null, stats: { perfect: 0, earlyLate: 0, miss: 0 }, finished: false, isLocal: true, clearedHurdles: [] }];
    renderLobbyGrid('lobby-players-grid');

    const url = `${APPS_SCRIPT_URL}?action=CREATE_ROOM&roomCode=${activeBattleRoomCode}&hostName=${encodeURIComponent(hostName)}&songTitle=${encodeURIComponent(currentSongTitle)}&songCode=${encodeURIComponent(document.getElementById('song-select').value)}&t=${Date.now()}`;
    await bridge.sendJSONP(url);
    startGoogleAppsScriptPolling(activeBattleRoomCode, true);
}

async function showJoinSetup(racerName, roomCode) {
    bridge.setStudentName(racerName);

    if (arcadeState.isSongBattle && window.firebaseDb) {
        try {
            const { get, child } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
            const snap = await get(child(window.firebaseRef(window.firebaseDb), `pianopad_tournaments/${roomCode}`));
            if (snap.exists()) {
                closeSprintOptionModal();
                bridge.joinClassKnockoutStudent(racerName, roomCode);
                return;
            }
        } catch (e) {
            console.warn("Tournament room check fallback to standard battle:", e);
        }
    }

    activeBattleRoomCode = roomCode;
    localPlayerIdRoom = 'p' + (Date.now() % 10000);
    const { sessionStudentAvatar } = bridge.getState();
    const playerAvatar = sessionStudentAvatar || AVATARS[Math.floor(Math.random() * AVATARS.length)];
    document.getElementById('status').textContent = `Connecting to room ${roomCode}...`;

    let res = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const url = `${APPS_SCRIPT_URL}?action=JOIN_ROOM&roomCode=${roomCode}&playerId=${localPlayerIdRoom}&playerName=${encodeURIComponent(racerName)}&avatar=${encodeURIComponent(playerAvatar)}&t=${Date.now()}`;
        res = await bridge.sendJSONP(url);
        if (res && !res.error) break;
        await new Promise(r => setTimeout(r, 1000));
    }

    if (res && res.error) {
        alert("Room not found! Check code and try again.");
        const confirmBtn = document.getElementById('btn-confirm-sprint-action');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm & Continue';
        }
        return;
    }

    document.getElementById('code-input-group').style.display = 'none';
    document.getElementById('btn-confirm-sprint-action').style.display = 'none';
    document.getElementById('client-waiting-group').style.display = 'flex';
    document.getElementById('status').textContent = `Connected to Host Code (${roomCode})! Waiting for start...`;
    startGoogleAppsScriptPolling(roomCode, false);
}

function startGoogleAppsScriptPolling(roomCode, isHost) {
    if (httpPollTimer) clearInterval(httpPollTimer);
    hasBattleStarted = false;

    httpPollTimer = setInterval(async () => {
        if (!activeBattleRoomCode) return;
        const res = await bridge.sendJSONP(`${APPS_SCRIPT_URL}?action=GET_ROOM&roomCode=${roomCode}&t=${Date.now()}`);
        if (!res || !res.players) return;

        playersList = res.players.map(remotePlayer => {
            const localMatch = playersList.find(p => p.id === remotePlayer.id);
            const isLocal = remotePlayer.id === localPlayerIdRoom;
            const hasValidTime = remotePlayer.finishTime !== null && remotePlayer.finishTime !== "" && !isNaN(parseFloat(remotePlayer.finishTime));
            const finished = isLocal
                ? Boolean((localMatch && localMatch.finished) || remotePlayer.finished === true || remotePlayer.finished === "true" || hasValidTime)
                : Boolean(remotePlayer.finished === true || remotePlayer.finished === "true" || hasValidTime || Number(remotePlayer.pxProgress) >= 3600);

            return {
                ...remotePlayer,
                pxProgress: isLocal && localMatch ? Math.max(Number(localMatch.pxProgress || 0), Number(remotePlayer.pxProgress || 0)) : Number(remotePlayer.pxProgress || 0),
                finishTime: (isLocal && localMatch && localMatch.finishTime) ? localMatch.finishTime : (hasValidTime ? remotePlayer.finishTime : null),
                isLocal,
                finished,
                clearedHurdles: localMatch ? localMatch.clearedHurdles : [],
                stats: remotePlayer.stats || { perfect: 0, earlyLate: 0, miss: 0 }
            };
        });

        renderLobbyGrid(isHost ? 'lobby-players-grid' : 'client-lobby-grid');

        if (arcadeState.isSongBattle) {
            const localPlayer = playersList.find(p => p.id === localPlayerIdRoom);
            if (localPlayer && localPlayer.finished) pushPlayerState();
            renderSongBattleResults();
        } else {
            const localPlayer = playersList.find(p => p.id === localPlayerIdRoom);
            if (localPlayer && localPlayer.finished) {
                pushPlayerState();
                if (arcadeState.raceActive) {
                    document.getElementById('status').innerHTML = `🏁 Finished in ${localPlayer.finishTime}s! Waiting for other racers... ${isSprintHost ? '<button type="button" class="btn-warning" onclick="forceEndSongBattle()" style="margin-left:10px; padding:2px 8px; font-size:0.75rem; border:none; border-radius:4px; cursor:pointer;">⚡ Force End Race</button>' : ''}`;
                }
            }
            updateMultiplayerLanesUI();
            if (arcadeState.raceActive) checkAllFinished();
        }

        if (res.songCode && !isHost) {
            bridge.setCurrentSongTitle(res.songTitle);
            document.getElementById('song-select').value = res.songCode;
            const parsed = parsePianoPad(res.songCode);
            if (parsed.length > 0) bridge.setCurrentSong(autoTransposeSong(parsed));
        }

        if (res.status === "started" && !hasBattleStarted) {
            hasBattleStarted = true;
            document.getElementById('sprint-option-modal').classList.remove('open');
            document.getElementById('arcade-hub').classList.remove('open');
            bridge.resetGameStats();

            if (arcadeState.isSongBattle) {
                bridge.prepareSongBattleStart();
                bridge.startCountdown(() => { bridge.playSong(); });
            } else {
                arcadeState.activeMiniGame = 'sprint';
                renderSprintLanes();
                bridge.startCountdown(() => {
                    arcadeState.raceActive = true;
                    sprintStartTime = performance.now();
                    sprintKeystrokeCount = 0;
                    sprintIndex = 0;
                    bridge.highlightKey(sprintSequence[0], 500, '#eab308');
                    document.getElementById('status').textContent = '🏃 SPRINT! Alternate C1 (Z) and D1 (X) fast!';
                });
            }
        }

        if (res.status === "finished" && arcadeState.raceActive) {
            arcadeState.raceActive = false;
            if (arcadeState.isSongBattle) renderSongBattleResults();
            else finishSprintRace();
        }
    }, 1000);
}

async function pushPlayerState() {
    if (!activeBattleRoomCode) return;
    const localPlayer = playersList.find(p => p.id === localPlayerIdRoom);
    if (!localPlayer) return;
    const { gameStats } = bridge.getState();
    const stats = localPlayer.stats || gameStats;
    const url = `${APPS_SCRIPT_URL}?action=UPDATE_PLAYER&roomCode=${activeBattleRoomCode}&playerId=${localPlayerIdRoom}&pxProgress=${localPlayer.pxProgress}&finishTime=${localPlayer.finishTime || ''}&finished=${localPlayer.finished}&perfect=${stats.perfect}&earlyLate=${stats.earlyLate}&miss=${stats.miss}&t=${Date.now()}`;
    await bridge.sendJSONP(url);
}

export function syncSongBattlePlayerStats(gameStats) {
    if (!arcadeState.isSongBattle) return;
    const localPlayer = playersList.find(p => p.id === localPlayerIdRoom);
    if (localPlayer) {
        localPlayer.stats = { ...gameStats };
        pushPlayerState();
    }
}

export function markSongBattleLocalFinished() {
    const localPlayer = playersList.find(p => p.id === localPlayerIdRoom);
    if (localPlayer) {
        localPlayer.finished = true;
        pushPlayerState();
    }
}

export async function triggerHostStartRace() {
    if (!activeBattleRoomCode) return;
    await bridge.sendJSONP(`${APPS_SCRIPT_URL}?action=START_ROOM&roomCode=${activeBattleRoomCode}&t=${Date.now()}`);
    document.getElementById('sprint-option-modal').classList.remove('open');
    document.getElementById('arcade-hub').classList.remove('open');
    bridge.resetGameStats();

    if (arcadeState.isSongBattle) {
        bridge.prepareSongBattleStart();
        bridge.startCountdown(() => { bridge.playSong(); });
    } else {
        arcadeState.activeMiniGame = 'sprint';
        renderSprintLanes();
        bridge.startCountdown(() => {
            arcadeState.raceActive = true;
            sprintStartTime = performance.now();
            sprintKeystrokeCount = 0;
            sprintIndex = 0;
            bridge.highlightKey(sprintSequence[0], 500, '#eab308');
            document.getElementById('status').textContent = '🏃 SPRINT! Alternate C1 (Z) and D1 (X) fast!';
        });
    }
}

export async function triggerBattleAgain() {
    document.getElementById('game-results-modal').classList.remove('open');
    hasBattleStarted = false;
    battleResultsShown = false;

    if (isSprintHost) {
        const { sessionStudentName, currentSongTitle } = bridge.getState();
        const url = `${APPS_SCRIPT_URL}?action=CREATE_ROOM&roomCode=${activeBattleRoomCode}&hostName=${encodeURIComponent(sessionStudentName)}&songTitle=${encodeURIComponent(currentSongTitle)}&songCode=${encodeURIComponent(document.getElementById('song-select').value)}&t=${Date.now()}`;
        await bridge.sendJSONP(url);
        showHostSetup(sessionStudentName);
        document.getElementById('sprint-option-modal').classList.add('open');
    }
}

function renderSprintLanes() {
    const runnerTrack = document.getElementById('runner-track');
    runnerTrack.style.display = 'flex';
    runnerTrack.innerHTML = '';
    const hurdleNotes = ['G', 'E', 'C', 'F', 'A', 'D', 'B', 'C', 'E', 'G'];

    playersList.forEach((player) => {
        const laneDiv = document.createElement('div');
        laneDiv.className = `runner-lane ${player.id === localPlayerIdRoom ? 'my-lane' : ''}`;
        laneDiv.id = `lane-${player.id}`;

        const label = document.createElement('div');
        label.className = 'lane-label';
        label.textContent = `${player.name} (${player.avatar})`;

        const avatar = document.createElement('div');
        avatar.className = 'runner-avatar';
        avatar.id = `avatar-${player.id}`;
        avatar.textContent = player.avatar;

        const scrollTrack = document.createElement('div');
        scrollTrack.className = 'runner-track-scroll';
        scrollTrack.id = `scroll-${player.id}`;

        hurdleNotes.forEach((note, idx) => {
            const hurdleDiv = document.createElement('div');
            hurdleDiv.className = 'hurdle-obstacle';
            hurdleDiv.style.left = `${(idx + 1) * 320}px`;
            hurdleDiv.textContent = note;
            scrollTrack.appendChild(hurdleDiv);
        });

        const finishLine = document.createElement('div');
        finishLine.className = 'runner-finish-line';
        scrollTrack.appendChild(finishLine);

        laneDiv.appendChild(label);
        laneDiv.appendChild(avatar);
        laneDiv.appendChild(scrollTrack);
        runnerTrack.appendChild(laneDiv);
    });
}

function updateMultiplayerLanesUI() {
    playersList.forEach((player) => {
        const scrollTrack = document.getElementById(`scroll-${player.id}`);
        if (scrollTrack) scrollTrack.style.transform = `translateX(-${player.pxProgress}px)`;
    });
}

function checkAllFinished() {
    if (playersList.length === 0) return;
    const allFinished = playersList.every(p =>
        p.finished === true ||
        p.finished === "true" ||
        (p.finishTime !== null && p.finishTime !== "" && !isNaN(parseFloat(p.finishTime))) ||
        Number(p.pxProgress) >= 3600
    );
    if (allFinished) {
        if (arcadeState.raceActive) {
            arcadeState.raceActive = false;
            finishSprintRace();
        } else if (arcadeState.isSongBattle) {
            renderSongBattleResults();
        }
    }
}

function finishSprintRace() {
    arcadeState.raceActive = false;
    stopBattlePolling();
    bridge.setCurrentSongTitle("Finger Sprint");
    const { gameStats, sessionStudentName } = bridge.getState();

    const localPlayer = playersList.find(p => p.id === localPlayerIdRoom);
    const winner = [...playersList].sort((a, b) => parseFloat(a.finishTime || 999) - parseFloat(b.finishTime || 999))[0];
    const isWinner = winner && winner.id === localPlayerIdRoom;
    const popUpHeader = isWinner ? ` YOU WON! (${localPlayer ? localPlayer.finishTime : ''}s)` : ` YOU LOST! Winner: ${winner ? winner.name : 'Opponent'}`;

    const sortedResults = [...playersList].sort((a, b) => {
        if (a.finishTime && b.finishTime) return parseFloat(a.finishTime) - parseFloat(b.finishTime);
        if (a.finishTime) return -1;
        if (b.finishTime) return 1;
        return b.pxProgress - a.pxProgress;
    });

    let tableRows = sortedResults.map((p, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
        const timeLabel = p.finishTime ? `${p.finishTime}s` : 'DNF';
        return `<tr><td style="font-weight:800;">${medal}</td><td>${p.avatar} ${p.name}</td><td style="color:#22c55e; font-weight:700;">${timeLabel}</td></tr>`;
    }).join('');

    document.getElementById('game-summary-text').innerHTML = `
        <div style="margin-bottom:8px; font-weight:900; font-size:1.3rem; color:${isWinner ? '#22c55e' : '#ef4444'};">${popUpHeader}</div>
        <table class="race-results-table"><thead><tr><th>Rank</th><th>Racer</th><th>Time</th></tr></thead><tbody>${tableRows}</tbody></table>
    `;
    document.getElementById('badge-container').innerHTML = '';
    document.getElementById('single-bar-graph').style.display = 'flex';
    document.getElementById('multi-bar-graph').style.display = 'none';

    const battleAgainBtn = document.getElementById('btn-battle-again');
    if (battleAgainBtn) {
        battleAgainBtn.textContent = '⚔️ Battle Again';
        battleAgainBtn.onclick = () => triggerBattleAgain();
        battleAgainBtn.style.display = isSprintHost ? 'inline-flex' : 'none';
    }

    const totalHits = gameStats.perfect + gameStats.miss;
    document.getElementById('bar-green').style.height = `${totalHits > 0 ? (gameStats.perfect / totalHits) * 100 : 100}%`;
    document.getElementById('bar-orange').style.height = '0%';
    document.getElementById('bar-red').style.height = `${totalHits > 0 ? (gameStats.miss / totalHits) * 100 : 0}%`;

    document.getElementById('game-rank-text').textContent = `Finger Sprint Finish!`;
    document.getElementById('game-results-modal').classList.add('open');

    if (localPlayer && localPlayer.finishTime) {
        bridge.ensureStudentName();
        bridge.postScoreToLeaderboard(parseFloat(localPlayer.finishTime));
    }
    bridge.loadStudentTickerStats(sessionStudentName);
    arcadeState.activeMiniGame = null;
}

export async function forceEndSongBattle() {
    if (!isSprintHost) return;
    playersList.forEach(p => {
        p.finished = true;
        if (!p.finishTime && arcadeState.activeMiniGame === 'sprint') {
            p.finishTime = ((performance.now() - sprintStartTime) / 1000).toFixed(2);
        }
    });
    if (arcadeState.activeMiniGame === 'sprint') {
        finishSprintRace();
    } else {
        renderSongBattleResults();
    }
}

function renderSongBattleResults() {
    if (battleResultsShown) return;
    const allPlayersFinished = playersList.every(p => p.finished === true || p.finished === "true");
    if (!allPlayersFinished) {
        document.getElementById('status').innerHTML = ` Battle finished for you! Waiting for remaining players to complete... 
        ${isSprintHost ? '<button type="button" class="btn-warning" onclick="forceEndSongBattle()" style="margin-left:10px; padding:2px 8px; font-size:0.75rem; border:none; border-radius:4px; cursor:pointer;">⚡ Force End Battle</button>' : ''}`;
        return;
    }

    battleResultsShown = true;
    const { currentSongTitle, sessionStudentName } = bridge.getState();
    const localPlayer = playersList.find(p => p.id === localPlayerIdRoom);
    if (localPlayer && localPlayer.stats) {
        const tot = localPlayer.stats.perfect + localPlayer.stats.earlyLate + localPlayer.stats.miss;
        const acc = tot > 0 ? (((localPlayer.stats.perfect * 1.0 + localPlayer.stats.earlyLate * 0.5) / tot) * 100) : 0;
        if (acc >= 80) {
            bridge.unlockBonusSounds(`Great job! You achieved <strong>${acc.toFixed(1)}%</strong> accuracy in the Song Battle and unlocked 5 bonus instrument sound engines!`);
        }
    }

    const sortedRanked = [...playersList].sort((a, b) => {
        const aStats = a.stats || { perfect: 0, earlyLate: 0, miss: 0 };
        const bStats = b.stats || { perfect: 0, earlyLate: 0, miss: 0 };
        const aAcc = ((aStats.perfect + aStats.earlyLate * 0.5) / Math.max(1, aStats.perfect + aStats.earlyLate + aStats.miss)) * 100;
        const bAcc = ((bStats.perfect + bStats.earlyLate * 0.5) / Math.max(1, bStats.perfect + bStats.earlyLate + bStats.miss)) * 100;
        return bAcc - aAcc;
    });

    const battlePayload = sortedRanked.map(p => {
        const pStats = p.stats || { perfect: 0, earlyLate: 0, miss: 0 };
        const accuracyPct = ((pStats.perfect + pStats.earlyLate * 0.5) / Math.max(1, pStats.perfect + pStats.earlyLate + pStats.miss)) * 100;
        return { name: p.name, score: accuracyPct.toFixed(1), avatar: p.avatar || '🏃', id: p.id };
    });

    if (isSprintHost) bridge.postBattleToSpreadsheet(battlePayload);
    bridge.showGrandFinale(battlePayload, isSprintHost, `Song Battle: ${currentSongTitle}`);
    bridge.loadStudentTickerStats(sessionStudentName);
}

function handleSprintInput(noteStr) {
    if (!arcadeState.raceActive) return;
    const rawNoteName = noteStr.toLowerCase().trim();
    const localPlayer = playersList.find(p => p.id === localPlayerIdRoom);
    if (!localPlayer || localPlayer.finished) return;

    const { gameStats, sessionStudentAvatar } = bridge.getState();
    const canvas = document.getElementById('waterfall-canvas');
    const hurdleNotes = ['G', 'E', 'C', 'F', 'A', 'D', 'B', 'C', 'E', 'G'];
    let nearHurdleIndex = -1;
    let expectedHurdleNote = null;

    for (let i = 0; i < hurdleNotes.length; i++) {
        const hPx = (i + 1) * 320;
        if (localPlayer.pxProgress >= hPx - 90 && localPlayer.pxProgress <= hPx + 30) {
            nearHurdleIndex = i;
            expectedHurdleNote = hurdleNotes[i];
            break;
        }
    }

    const parsedNote = rawNoteName.match(/^([a-g]#?)([0-9]+)$/);
    if (parsedNote && expectedHurdleNote) {
        const letter = parsedNote[1].toUpperCase();
        const octave = parseInt(parsedNote[2], 10);
        localPlayer.clearedHurdles = localPlayer.clearedHurdles || [];

        if (!localPlayer.clearedHurdles.includes(nearHurdleIndex) && letter === expectedHurdleNote && octave >= 2) {
            gameStats.perfect++;
            localPlayer.clearedHurdles.push(nearHurdleIndex);
            sprintKeystrokeCount += 2;
            localPlayer.pxProgress = sprintKeystrokeCount * 36;
            updateMultiplayerLanesUI();

            const avatarEl = document.getElementById(`avatar-${localPlayer.id}`);
            if (avatarEl) {
                avatarEl.textContent = '🤸';
                avatarEl.classList.add('jumping');
                setTimeout(() => { avatarEl.classList.remove('jumping'); avatarEl.textContent = sessionStudentAvatar || '🏃'; }, 450);
            }
            document.getElementById('status').textContent = `🤸 Jumped Hurdle ${expectedHurdleNote}! Boost +2!`;
            bridge.spawnConfetti(canvas.width / 2, canvas.height / 2, '#22c55e');

            if (localPlayer.pxProgress >= 3600 && !localPlayer.finished) {
                localPlayer.pxProgress = 3600;
                localPlayer.finishTime = ((performance.now() - sprintStartTime) / 1000).toFixed(2);
                localPlayer.finished = true;
                document.getElementById('status').textContent = `🏁 YOU FINISHED in ${localPlayer.finishTime}s! Waiting for other racers...`;
            }
            pushPlayerState();
            if (localPlayer.pxProgress >= 3600) { checkAllFinished(); }
            return;
        }
    }

    const expectedNote = sprintSequence[sprintIndex % 2];
    if (rawNoteName === expectedNote.toLowerCase().trim()) {
        gameStats.perfect++;
        sprintIndex++;
        sprintKeystrokeCount++;
        const avatarEl = document.getElementById(`avatar-${localPlayer.id}`);
        if (avatarEl && !avatarEl.classList.contains('jumping')) {
            avatarEl.textContent = (sprintKeystrokeCount % 2 === 0) ? '🏃‍♂️' : (sessionStudentAvatar || '🏃');
        }
        localPlayer.pxProgress = sprintKeystrokeCount * 36;
        updateMultiplayerLanesUI();

        if (localPlayer.pxProgress >= 3600 && !localPlayer.finished) {
            localPlayer.pxProgress = 3600;
            localPlayer.finishTime = ((performance.now() - sprintStartTime) / 1000).toFixed(2);
            localPlayer.finished = true;
            document.getElementById('status').textContent = `🏁 YOU FINISHED in ${localPlayer.finishTime}s! Waiting for other racers...`;
        }
        pushPlayerState();

        if (localPlayer.pxProgress >= 3600) { checkAllFinished(); return; }
        bridge.highlightKey(sprintSequence[sprintIndex % 2], 300, '#eab308');
    } else {
        gameStats.miss++;
        playErrorClackSound();
    }
}

export function launchRhythmEcho() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startRhythmEcho(gameBridgeHelper);
}

export function launchNoteSniper() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startNoteSniper(gameBridgeHelper);
}

export function launchFlappyPitch() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startFlappyPitch(gameBridgeHelper);
}

export function launchScaleSurfers() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startStaffSurfers(gameBridgeHelper);
}

// Backward-compatible alias if any HTML/module still calls launchStaffSurfers
export function launchStaffSurfers() {
    launchScaleSurfers();
}

export function launchLaserTag(roomCode, isHost = false) {
    openArcadeHub();
    document.getElementById('arcade-hub')?.classList.remove('open');
    startLaserTag(gameBridgeHelper, roomCode, isHost);
}

export function launchGridironGroove() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startGridironGroove(gameBridgeHelper);
}

export function launchClefHook() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startClefHook(gameBridgeHelper);
}

export function launchSharpShooter() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startSharpShooter(gameBridgeHelper);
}

export function launchSkiSlalom() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startSkiSlalom(gameBridgeHelper);
}

export function launchPedalPoint() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startPedalPoint(gameBridgeHelper);
}

export function launchRockBall() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startRockBall(gameBridgeHelper);
}

export function launchErcRugby() {
    document.getElementById('game-results-modal')?.classList.remove('open');
    startErcRugby(gameBridgeHelper);
}

Object.assign(window, {
    startSimonTaps,
    startMysteryNote,
    startDropDodge,
    startComboStrike,
    openSprintModeSelector,
    initSinglePlayerSprint,
    openHostNamePrompt,
    openJoinNamePrompt,
    triggerHostStartRace,
    closeSprintOptionModal,
    triggerBattleAgain,
    forceEndSongBattle,
    launchRhythmEcho,
    launchNoteSniper,
    launchFlappyPitch,
    launchScaleSurfers,
    launchStaffSurfers,
    startScaleSurfers: (b) => {
        document.getElementById('game-results-modal')?.classList.remove('open');
        startStaffSurfers(b || gameBridgeHelper);
    },
    startStaffSurfers: (b) => {
        document.getElementById('game-results-modal')?.classList.remove('open');
        startStaffSurfers(b || gameBridgeHelper);
    },
    replayLastCustomMiniGame: () => {
        if (typeof lastCustomMiniGameReplay === 'function') {
            document.getElementById('game-results-modal')?.classList.remove('open');
            lastCustomMiniGameReplay();
        }
    },
    launchLaserTag,
    launchGridironGroove,
    startGridironGroove: (b) => {
        document.getElementById('game-results-modal')?.classList.remove('open');
        startGridironGroove(b || gameBridgeHelper);
    },
    launchClefHook,
    startClefHook: (b) => {
        document.getElementById('game-results-modal')?.classList.remove('open');
        startClefHook(b || gameBridgeHelper);
    },
    launchSharpShooter,
    startSharpShooter: (b) => {
        document.getElementById('game-results-modal')?.classList.remove('open');
        startSharpShooter(b || gameBridgeHelper);
    },
    launchSkiSlalom,
    startSkiSlalom: (b) => {
        document.getElementById('game-results-modal')?.classList.remove('open');
        startSkiSlalom(b || gameBridgeHelper);
    },
    launchPedalPoint,
    startPedalPoint: (b) => {
        document.getElementById('game-results-modal')?.classList.remove('open');
        startPedalPoint(b || gameBridgeHelper);
    },
    launchRockBall,
    startRockBall: (b) => {
        document.getElementById('game-results-modal')?.classList.remove('open');
        startRockBall(b || gameBridgeHelper);
    },
    launchErcRugby,
    startErcRugby: (b) => {
        document.getElementById('game-results-modal')?.classList.remove('open');
        startErcRugby(b || gameBridgeHelper);
    }
});
```[cite: 1]
