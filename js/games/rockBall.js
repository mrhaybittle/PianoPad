// js/games/rockBall.js
import { initAudio, audioCtx, playErrorClackSound } from '../audio.js';
import { noteToPitch, pitchToNote, getNoteFrequency } from '../musicTheory.js';

let animFrameId = null;
let lastFrameTime = 0;
let bridgeRef = null;
let gamePhase = 'calibration'; // 'calibration' | 'ready' | 'playing' | 'gameover'

// Calibration State (Lowest & Highest Keyboard Keys)
let calibStep = 1; // 1 = Lowest Key, 2 = Highest Key
let lowPitchNum = 12;  // Default C1
let highPitchNum = 35; // Default B2
let lowOuterNote = 'c1';
let lowInnerNote = 'd1';
let highInnerNote = 'a2';
let highOuterNote = 'b2';

// Flipper States
const flippers = {
    outerLeft:  { active: false, angle: 0.42, restAngle: 0.42, activeAngle: -0.45, angVel: 0, x: 0, y: 0, len: 68, side: 1 },
    outerRight: { active: false, angle: Math.PI - 0.42, restAngle: Math.PI - 0.42, activeAngle: Math.PI + 0.45, angVel: 0, x: 0, y: 0, len: 68, side: -1 },
    innerLeft:  { active: false, angle: 0.38, restAngle: 0.38, activeAngle: -0.42, angVel: 0, x: 0, y: 0, len: 50, side: 1 },
    innerRight: { active: false, angle: Math.PI - 0.38, restAngle: Math.PI - 0.38, activeAngle: Math.PI + 0.42, angVel: 0, x: 0, y: 0, len: 50, side: -1 }
};

// Plunger State
const plunger = {
    pulling: false,
    charge: 0,
    x: 0,
    y: 0,
    w: 28,
    h: 54
};

// Game & Table State
let score = 0;
let ballsLeft = 3;
let multiplier = 1;
let ballSaveTimer = 0;
let rampLit = false;
let multiballTriggered = false;
let shakeTimer = 0;
let bannerText = '';
let bannerColor = '#facc15';
let bannerTimer = 0;
let vinylAngle = 0;

let balls = [];
let bumpers = [];
let slingshots = [];
let dropTargets = [];
let walls = [];
let particles = [];

const SCALE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NEON_COLORS = ['#ec4899', '#38bdf8', '#facc15', '#22c55e', '#a855f7'];

// ============================================================================
// PROCEDURAL 94 BPM HIP-HOP BACKGROUND BEAT ENGINE (Web Audio API)
// ============================================================================
class HipHopBeatEngine {
    constructor() {
        this.isRunning = false;
        this.step = 0;
        this.nextTime = 0;
        this.bpm = 94;
    }

    start() {
        initAudio();
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        this.isRunning = true;
        this.step = 0;
        this.nextTime = audioCtx.currentTime + 0.05;
    }

    stop() {
        this.isRunning = false;
    }

    update() {
        if (!this.isRunning || !audioCtx) return;
        const sixteenth = (60 / this.bpm) / 4;
        while (this.nextTime < audioCtx.currentTime + 0.12) {
            this.scheduleStep(this.step, this.nextTime);
            const swingOffset = (this.step % 2 === 0) ? sixteenth * 1.12 : sixteenth * 0.88;
            this.nextTime += swingOffset;
            this.step = (this.step + 1) % 16;
        }
    }

    scheduleStep(step, t) {
        if (step === 0 || step === 3 || step === 7 || step === 10 || step === 11) {
            this.play808Kick(t);
        }
        if (step === 4 || step === 12) {
            this.playSnare(t);
        }
        if (step % 2 === 0 || step === 15) {
            this.playHiHat(t, step === 14 ? 0.14 : 0.045, step === 14 ? 0.06 : 0.025);
        }
        const bassMap = {
            0: 65.41,
            3: 65.41,
            6: 77.78,
            8: 87.31,
            10: 98.00,
            14: 116.54
        };
        if (bassMap[step]) {
            this.playSubBass(t, bassMap[step], 0.24);
        }
    }

    play808Kick(t) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(135, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.23);
    }

    playSnare(t) {
        const bufLen = Math.floor(audioCtx.sampleRate * 0.14);
        const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.5);

        const noise = audioCtx.createBufferSource();
        noise.buffer = buf;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1850;
        const nGain = audioCtx.createGain();
        nGain.gain.setValueAtTime(0.2, t);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(audioCtx.destination);
        noise.start(t);

        const bodyOsc = audioCtx.createOscillator();
        const bGain = audioCtx.createGain();
        bodyOsc.type = 'triangle';
        bodyOsc.frequency.setValueAtTime(195, t);
        bodyOsc.frequency.exponentialRampToValueAtTime(85, t + 0.08);
        bGain.gain.setValueAtTime(0.16, t);
        bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        bodyOsc.connect(bGain);
        bGain.connect(audioCtx.destination);
        bodyOsc.start(t);
        bodyOsc.stop(t + 0.1);
    }

    playHiHat(t, dur, vol) {
        const bufLen = Math.floor(audioCtx.sampleRate * dur);
        const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7200;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(hp);
        hp.connect(gain);
        gain.connect(audioCtx.destination);
        src.start(t);
    }

    playSubBass(t, freq, dur) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.14, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.01);
    }
}

const hipHopMusic = new HipHopBeatEngine();

function playRockBallSfx(type, noteStr = null) {
    try {
        initAudio();
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        if (type === 'bumper') {
            const freq = (noteStr && getNoteFrequency(noteStr)) || 523.25;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.11);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'slingshot') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.exponentialRampToValueAtTime(740, now + 0.09);
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.11);
        } else if (type === 'flipper') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(160, now);
            osc.frequency.exponentialRampToValueAtTime(65, now + 0.05);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.06);
        } else if (type === 'launch') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(980, now + 0.24);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.27);
        } else if (type === 'jackpot') {
            [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(f, now + idx * 0.06);
                gain.gain.setValueAtTime(0.12, now + idx * 0.06);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.22);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.06);
                osc.stop(now + idx * 0.06 + 0.24);
            });
        }
    } catch (e) {}
}

// ============================================================================
// CALIBRATION MODAL
// ============================================================================
function showRockBallCalibrationModal(bridge) {
    let modal = document.getElementById('rockball-calib-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'rockball-calib-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '9999';
        document.body.appendChild(modal);
    }

    calibStep = 1;
    modal.innerHTML = `
        <div class="modal" style="max-width: 540px; text-align: center; border: 2px solid #ec4899; box-shadow: 0 0 30px rgba(236,72,153,0.45);">
            <h2 style="color: #facc15; margin-bottom: 6px;">🎸 RockBall Keyboard Calibration</h2>
            <p id="rockball-calib-instructions" style="font-size: 0.95rem; color: #38bdf8; font-weight: 700; margin-bottom: 12px;">
                Step 1: Press the LOWEST key on your keyboard...
            </p>
            <div style="background: rgba(15,23,42,0.85); border: 1px solid #374151; border-radius: 8px; padding: 12px; font-size: 0.82rem; color: #cbd5e1; text-align: left; margin-bottom: 14px; line-height: 1.55;">
                <div>• <b>Lowest &amp; Highest Keys:</b> Control the <b>Outer Lower Flippers</b></div>
                <div>• <b>2nd-Lowest &amp; 2nd-Highest Keys:</b> Control the <b>Inner Mid-Field Flippers</b></div>
                <div>• <b>Middle Scale Keys (C–B):</b> Light up Bumpers for <b>Multiball &amp; Jackpots</b> + Pull Plunger!</div>
            </div>
            <div class="modal-footer" style="justify-content: center; gap: 10px;">
                <button type="button" class="btn-secondary" id="btn-rockball-calib-skip">Skip Calibration (Use C1–B2)</button>
            </div>
        </div>
    `;
    modal.classList.add('open');

    const skipBtn = document.getElementById('btn-rockball-calib-skip');
    if (skipBtn) {
        skipBtn.onclick = () => {
            applyCalibratedRange(12, 35);
            modal.classList.remove('open');
            beginRockBallSession(bridge);
        };
    }
}

function applyCalibratedRange(lowP, highP) {
    lowPitchNum = Math.min(lowP, highP - 4);
    highPitchNum = Math.max(highP, lowPitchNum + 4);

    lowOuterNote = pitchToNote(lowPitchNum) || 'c1';
    lowInnerNote = pitchToNote(lowPitchNum + 1) || 'd1';
    highInnerNote = pitchToNote(highPitchNum - 1) || 'a2';
    highOuterNote = pitchToNote(highPitchNum) || 'b2';
}

// ============================================================================
// LIFECYCLE & INPUT HANDLERS
// ============================================================================
function preventSpaceBar(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        if (gamePhase === 'ready' || gamePhase === 'playing') {
            plunger.pulling = true;
        }
    }
}

function handleKeyUp(e) {
    if (e.code === 'Space' && plunger.pulling) {
        releasePlunger();
    }
    if (!document.querySelector('#keyboard .key.active')) {
        flippers.outerLeft.active = false;
        flippers.outerRight.active = false;
        flippers.innerLeft.active = false;
        flippers.innerRight.active = false;
        if (plunger.pulling && e.code !== 'Space') {
            releasePlunger();
        }
    }
}

function handlePointerUp() {
    setTimeout(() => {
        if (!document.querySelector('#keyboard .key.active')) {
            flippers.outerLeft.active = false;
            flippers.outerRight.active = false;
            flippers.innerLeft.active = false;
            flippers.innerRight.active = false;
            if (plunger.pulling) releasePlunger();
        }
    }, 10);
}

export function stopRockBall() {
    if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    hipHopMusic.stop();
    gamePhase = 'gameover';

    window.removeEventListener('keydown', preventSpaceBar, { capture: true });
    window.removeEventListener('keyup', handleKeyUp, { capture: true });
    window.removeEventListener('mouseup', handlePointerUp, { capture: true });
    window.removeEventListener('touchend', handlePointerUp, { capture: true });

    const modal = document.getElementById('rockball-calib-modal');
    if (modal) modal.classList.remove('open');
}

export function startRockBall(bridge) {
    initAudio();
    stopRockBall();
    bridgeRef = bridge;

    bridge.exitActiveMiniGame();
    document.getElementById('game-results-modal')?.classList.remove('open');
    document.getElementById('arcade-hub')?.classList.remove('open');

    bridge.setActiveMiniGame('rockBall');
    bridge.resetGameStats();

    gamePhase = 'calibration';
    showRockBallCalibrationModal(bridge);

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = '🎸 RockBall Calibration: Press your LOWEST key, then your HIGHEST key!';
    }
}

function beginRockBallSession(bridge) {
    window.addEventListener('keydown', preventSpaceBar, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('mouseup', handlePointerUp, { capture: true });
    window.addEventListener('touchend', handlePointerUp, { capture: true });

    score = 0;
    ballsLeft = 3;
    multiplier = 1;
    rampLit = false;
    multiballTriggered = false;
    particles = [];
    shakeTimer = 0;
    bannerTimer = 0;

    buildRockBallTable();
    spawnBallInPlungerLane();
    hipHopMusic.start();

    gamePhase = 'ready';
    lastFrameTime = performance.now();

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🎤 RockBall Ready! Outer Flippers: ${lowOuterNote.toUpperCase()} / ${highOuterNote.toUpperCase()} | Inner: ${lowInnerNote.toUpperCase()} / ${highInnerNote.toUpperCase()} | Hold middle key to pull plunger!`;
    }

    if (animFrameId === null) {
        animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));
    }
}

export function handleRockBallInput(noteStr, bridge) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (!clean) return;

    if (gamePhase === 'calibration') {
        const pNum = noteToPitch(clean);
        if (pNum === null) return;
        const instrEl = document.getElementById('rockball-calib-instructions');

        if (calibStep === 1) {
            lowPitchNum = pNum;
            calibStep = 2;
            playRockBallSfx('bumper', clean);
            bridge.highlightKey(noteStr, 300, '#22c55e');
            if (instrEl) {
                instrEl.innerHTML = `Lowest key set to <span style="color:#22c55e;">${clean.toUpperCase()}</span>! Now Step 2: Press the <b>HIGHEST</b> key on your keyboard...`;
            }
        } else if (calibStep === 2) {
            applyCalibratedRange(lowPitchNum, pNum);
            playRockBallSfx('jackpot');
            bridge.highlightKey(noteStr, 300, '#22c55e');
            const modal = document.getElementById('rockball-calib-modal');
            if (modal) modal.classList.remove('open');
            beginRockBallSession(bridge);
        }
        return;
    }

    if (gamePhase !== 'ready' && gamePhase !== 'playing') return;

    if (clean === lowOuterNote) {
        if (!flippers.outerLeft.active) playRockBallSfx('flipper');
        flippers.outerLeft.active = true;
        bridge.highlightKey(noteStr, 180, '#ec4899');
        return;
    }
    if (clean === highOuterNote) {
        if (!flippers.outerRight.active) playRockBallSfx('flipper');
        flippers.outerRight.active = true;
        bridge.highlightKey(noteStr, 180, '#ec4899');
        return;
    }
    if (clean === lowInnerNote) {
        if (!flippers.innerLeft.active) playRockBallSfx('flipper');
        flippers.innerLeft.active = true;
        bridge.highlightKey(noteStr, 180, '#38bdf8');
        return;
    }
    if (clean === highInnerNote) {
        if (!flippers.innerRight.active) playRockBallSfx('flipper');
        flippers.innerRight.active = true;
        bridge.highlightKey(noteStr, 180, '#38bdf8');
        return;
    }

    const ballInShooter = balls.some(b => b.inShooterLane);
    if (ballInShooter) {
        plunger.pulling = true;
        bridge.highlightKey(noteStr, 220, '#facc15');
        return;
    }

    const letter = clean.replace(/[0-9#b]+$/g, '').toUpperCase();
    let matchedAnyBumper = false;

    bumpers.forEach(bmp => {
        if (bmp.litNote === letter) {
            matchedAnyBumper = true;
            bmp.pulse = 1.0;
            bmp.charged = true;
            score += 250 * multiplier;
            playRockBallSfx('bumper', noteStr);
            spawnSparkBurst(bmp.x, bmp.y, bmp.color, 14);
            bmp.litNote = SCALE_NOTES[(SCALE_NOTES.indexOf(letter) + 2 + Math.floor(Math.random() * 4)) % SCALE_NOTES.length];
        }
    });

    if (matchedAnyBumper) {
        bridge.highlightKey(noteStr, 250, '#22c55e');
        const chargedCount = bumpers.filter(b => b.charged).length;
        if (chargedCount >= bumpers.length && !multiballTriggered) {
            triggerMultiballAndJackpot();
        } else {
            triggerBanner(`🎵 NOTE MATCH! BUMPER CHARGED (${chargedCount}/${bumpers.length})`, '#22c55e', 0.9);
        }
    } else {
        bridge.highlightKey(noteStr, 140, '#a855f7');
    }
}

export function handleRockBallRelease(noteStr) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (clean === lowOuterNote) flippers.outerLeft.active = false;
    else if (clean === highOuterNote) flippers.outerRight.active = false;
    else if (clean === lowInnerNote) flippers.innerLeft.active = false;
    else if (clean === highInnerNote) flippers.innerRight.active = false;
    else if (plunger.pulling) releasePlunger();
}

function releasePlunger() {
    if (!plunger.pulling) return;
    plunger.pulling = false;
    const launchPower = Math.max(0.35, plunger.charge);
    plunger.charge = 0;

    balls.forEach(b => {
        if (b.inShooterLane) {
            b.vy = -(780 + launchPower * 540);
            b.vx = -35;
            gamePhase = 'playing';
            ballSaveTimer = 14.0;
            playRockBallSfx('launch');
            triggerBanner('🚀 BALL LAUNCHED! BALL SAVER ACTIVE (14s)', '#38bdf8', 1.2);
        }
    });
}

// ============================================================================
// ROCKBALL PLAYFIELD GEOMETRY & TABLE ELEMENTS
// ============================================================================
function buildRockBallTable() {
    const canvas = document.getElementById('waterfall-canvas');
    const W = (canvas && canvas.width) || 1232;
    const H = (canvas && canvas.height) || 380;

    const tableW = Math.min(540, W * 0.56);
    const tableLeft = (W - tableW) / 2;
    const tableRight = tableLeft + tableW;
    const shooterLaneX = tableRight - 36;
    const playRight = shooterLaneX - 10;

    const centerX = (tableLeft + playRight) / 2;
    flippers.outerLeft.x = centerX - 78;
    flippers.outerLeft.y = H - 36;
    flippers.outerRight.x = centerX + 78;
    flippers.outerRight.y = H - 36;

    flippers.innerLeft.x = centerX - 62;
    flippers.innerLeft.y = H * 0.54;
    flippers.innerRight.x = centerX + 62;
    flippers.innerRight.y = H * 0.54;

    plunger.x = shooterLaneX + 5;
    plunger.y = H - 56;
    plunger.w = 24;
    plunger.h = 50;

    bumpers = [
        { x: centerX - 46, y: H * 0.25, r: 22, litNote: 'C', color: '#ec4899', pulse: 0, charged: false },
        { x: centerX + 46, y: H * 0.25, r: 22, litNote: 'E', color: '#38bdf8', pulse: 0, charged: false },
        { x: centerX,      y: H * 0.36, r: 24, litNote: 'G', color: '#facc15', pulse: 0, charged: false }
    ];

    slingshots = [
        {
            p1: { x: tableLeft + 46, y: H - 115 },
            p2: { x: tableLeft + 46, y: H - 62 },
            p3: { x: flippers.outerLeft.x - 10, y: H - 52 },
            kickVx: 360, kickVy: -380, flash: 0
        },
        {
            p1: { x: playRight - 46, y: H - 115 },
            p2: { x: playRight - 46, y: H - 62 },
            p3: { x: flippers.outerRight.x + 10, y: H - 52 },
            kickVx: -360, kickVy: -380, flash: 0
        }
    ];

    const letters = ['R', 'O', 'C', 'K'];
    dropTargets = letters.map((ch, idx) => ({
        x: tableLeft + 26 + idx * 14,
        y: H * 0.28 + idx * 24,
        r: 10,
        label: ch,
        down: false,
        color: NEON_COLORS[idx % NEON_COLORS.length]
    }));

    walls = [
        { x1: tableLeft, y1: 36, x2: tableLeft, y2: H },
        { x1: tableRight, y1: 36, x2: tableRight, y2: H },
        { x1: tableRight, y1: 42, x2: tableRight - 35, y2: 14 },
        { x1: tableRight - 35, y1: 14, x2: tableLeft + 45, y2: 14 },
        { x1: tableLeft + 45, y1: 14, x2: tableLeft, y2: 42 },
        { x1: shooterLaneX, y1: 68, x2: shooterLaneX, y2: H },
        { x1: tableLeft + 28, y1: H - 122, x2: tableLeft + 28, y2: H - 58 },
        { x1: tableLeft + 28, y1: H - 58, x2: flippers.outerLeft.x - 4, y2: flippers.outerLeft.y - 2 },
        { x1: tableLeft, y1: H - 60, x2: tableLeft + 24, y2: H - 15 },
        { x1: playRight - 28, y1: H - 122, x2: playRight - 28, y2: H - 58 },
        { x1: playRight - 28, y1: H - 58, x2: flippers.outerRight.x + 4, y2: flippers.outerRight.y - 2 },
        { x1: playRight, y1: H - 60, x2: playRight - 24, y2: H - 15 }
    ];
}

function spawnBallInPlungerLane() {
    const canvas = document.getElementById('waterfall-canvas');
    const W = (canvas && canvas.width) || 1232;
    const H = (canvas && canvas.height) || 380;
    const tableW = Math.min(540, W * 0.56);
    const tableRight = (W + tableW) / 2;

    balls = [{
        x: tableRight - 18,
        y: H - 72,
        vx: 0,
        vy: 0,
        r: 9,
        inShooterLane: true,
        trail: []
    }];
}

function triggerMultiballAndJackpot() {
    multiballTriggered = true;
    rampLit = true;
    multiplier = Math.min(5, multiplier + 1);
    score += 1500;
    playRockBallSfx('jackpot');
    shakeTimer = 0.35;
    triggerBanner('🔥 MULTIBALL & JACKPOT RAMP LIT! +1500 🔥', '#facc15', 1.8);

    if (balls.length > 0) {
        for (let i = 0; i < 2; i++) {
            balls.push({
                x: flippers.innerLeft.x + 40 + i * 35,
                y: 45,
                vx: (i === 0 ? -160 : 160),
                vy: 140,
                r: 9,
                inShooterLane: false,
                trail: []
            });
        }
    }
    bumpers.forEach(b => { b.charged = false; });
}

function triggerBanner(text, color = '#facc15', dur = 1.2) {
    bannerText = text;
    bannerColor = color;
    bannerTimer = dur;
}

function spawnSparkBurst(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const spd = 60 + Math.random() * 170;
        particles.push({
            x, y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            color,
            life: 1.0
        });
    }
}

// ============================================================================
// PHYSICS & RENDER LOOP
// ============================================================================
function gameLoop(now, bridge) {
    if (!bridge || bridge.getActiveMiniGame() !== 'rockBall') {
        stopRockBall();
        return;
    }

    const canvas = document.getElementById('waterfall-canvas');
    if (!canvas) {
        stopRockBall();
        return;
    }

    const dt = Math.min(0.033, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    hipHopMusic.update();
    vinylAngle += dt * 3.5;

    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (ballSaveTimer > 0) ballSaveTimer = Math.max(0, ballSaveTimer - dt);

    if (plunger.pulling) {
        plunger.charge = Math.min(1, plunger.charge + dt * 1.45);
    }

    Object.values(flippers).forEach(f => {
        const target = f.active ? f.activeAngle : f.restAngle;
        const prev = f.angle;
        f.angle += (target - f.angle) * Math.min(1, dt * 28);
        f.angVel = (f.angle - prev) / Math.max(0.001, dt);
    });

    bumpers.forEach(b => { if (b.pulse > 0) b.pulse = Math.max(0, b.pulse - dt * 3.5); });
    slingshots.forEach(s => { if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 4); });

    const W = canvas.width;
    const H = canvas.height;
    const tableW = Math.min(540, W * 0.56);
    const tableLeft = (W - tableW) / 2;
    const tableRight = tableLeft + tableW;
    const shooterLaneX = tableRight - 36;
    const centerX = (tableLeft + shooterLaneX - 10) / 2;

    const subSteps = 2;
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
        for (let i = balls.length - 1; i >= 0; i--) {
            const b = balls[i];

            if (b.inShooterLane && b.x > shooterLaneX) {
                if (b.y < 68) {
                    b.inShooterLane = false;
                } else if (b.vy === 0 && b.y >= H - 72) {
                    b.y = (H - 72) + plunger.charge * 26;
                    continue;
                }
            }

            b.vy += 560 * subDt;
            b.vx *= 0.998;
            b.vy *= 0.998;
            b.x += b.vx * subDt;
            b.y += b.vy * subDt;

            const spd = Math.hypot(b.vx, b.vy);
            if (spd > 1150) {
                b.vx = (b.vx / spd) * 1150;
                b.vy = (b.vy / spd) * 1150;
            }

            for (const w of walls) {
                resolveSegmentCollision(b, w.x1, w.y1, w.x2, w.y2, 0.72);
            }

            for (const bmp of bumpers) {
                const dx = b.x - bmp.x;
                const dy = b.y - bmp.y;
                const dist = Math.hypot(dx, dy);
                const minDist = b.r + bmp.r;
                if (dist < minDist && dist > 0.001) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    b.x = bmp.x + nx * (minDist + 1);
                    b.y = bmp.y + ny * (minDist + 1);
                    const kickSpeed = Math.max(460, spd * 1.15);
                    b.vx = nx * kickSpeed;
                    b.vy = ny * kickSpeed;
                    bmp.pulse = 1.0;
                    score += 100 * multiplier;
                    playRockBallSfx('bumper');
                    spawnSparkBurst(bmp.x + nx * bmp.r, bmp.y + ny * bmp.r, bmp.color, 6);
                }
            }

            for (const sl of slingshots) {
                const hitHypotenuse = resolveSegmentCollision(b, sl.p1.x, sl.p1.y, sl.p3.x, sl.p3.y, 1.35);
                if (hitHypotenuse) {
                    b.vx = sl.kickVx;
                    b.vy = sl.kickVy;
                    sl.flash = 1.0;
                    score += 75 * multiplier;
                    playRockBallSfx('slingshot');
                    spawnSparkBurst(b.x, b.y, '#ec4899', 7);
                }
                resolveSegmentCollision(b, sl.p1.x, sl.p1.y, sl.p2.x, sl.p2.y, 0.7);
                resolveSegmentCollision(b, sl.p2.x, sl.p2.y, sl.p3.x, sl.p3.y, 0.7);
            }

            for (const dtg of dropTargets) {
                if (dtg.down) continue;
                const dx = b.x - dtg.x;
                const dy = b.y - dtg.y;
                const dist = Math.hypot(dx, dy);
                if (dist < b.r + dtg.r) {
                    dtg.down = true;
                    b.vx = Math.abs(b.vx) * 0.85 + 140;
                    score += 200 * multiplier;
                    playRockBallSfx('bumper', 'g2');
                    spawnSparkBurst(dtg.x, dtg.y, dtg.color, 10);

                    if (dropTargets.every(t => t.down)) {
                        rampLit = true;
                        score += 1000 * multiplier;
                        playRockBallSfx('jackpot');
                        triggerBanner('🎸 R-O-C-K BANK CLEARED! JACKPOT RAMP LIT!', '#ec4899', 1.4);
                        setTimeout(() => dropTargets.forEach(t => { t.down = false; }), 2500);
                    }
                }
            }

            if (Math.abs(b.x - centerX) < 22 && Math.abs(b.y - H * 0.16) < 18 && b.vy < -150) {
                const rampPts = (rampLit ? 1000 : 300) * multiplier;
                score += rampPts;
                rampLit = false;
                b.vy = -520;
                playRockBallSfx('jackpot');
                spawnSparkBurst(centerX, H * 0.16, '#facc15', 14);
                triggerBanner(`🚀 RAMP COMBO SHOT! +${rampPts}`, '#facc15', 1.0);
            }

            Object.values(flippers).forEach(f => {
                const tipX = f.x + Math.cos(f.angle) * f.len;
                const tipY = f.y + Math.sin(f.angle) * f.len;
                const hit = resolveSegmentCollision(b, f.x, f.y, tipX, tipY, 0.65);
                if (hit && Math.abs(f.angVel) > 1.5) {
                    const distRatio = Math.min(1, Math.hypot(b.x - f.x, b.y - f.y) / f.len);
                    b.vy = Math.min(b.vy, -(480 + distRatio * 340));
                    b.vx += f.side * (120 + distRatio * 180);
                }
            });

            if (s === 0) {
                b.trail.push({ x: b.x, y: b.y });
                if (b.trail.length > 8) b.trail.shift();
            }

            if (b.y > H + 14) {
                balls.splice(i, 1);
            }
        }
    }

    if (balls.length === 0 && gamePhase === 'playing') {
        multiballTriggered = false;
        if (ballSaveTimer > 0) {
            triggerBanner('🛡️ BALL SAVED! SHOOT AGAIN!', '#22c55e', 1.2);
            spawnBallInPlungerLane();
            gamePhase = 'ready';
        } else {
            ballsLeft--;
            if (ballsLeft > 0) {
                playErrorClackSound();
                triggerBanner(`BALL DRAINED! ${ballsLeft} ${ballsLeft === 1 ? 'BALL' : 'BALLS'} LEFT`, '#ef4444', 1.3);
                spawnBallInPlungerLane();
                gamePhase = 'ready';
            } else {
                gamePhase = 'gameover';
                stopRockBall();
                const finalScore = Math.floor(score);
                bridge.finishCustomMiniGame(
                    'RockBall',
                    finalScore,
                    `Final RockBall Score: <span style="color:#facc15; font-size:1.45rem; font-weight:900;">${finalScore.toLocaleString()}</span><br>` +
                    `<span style="font-size:0.82rem; color:#ec4899;">🎸 Rock &amp; Hip-Hop Table • Multiplier: ${multiplier}x</span>`,
                    () => startRockBall(bridge)
                );
                return;
            }
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt * 2.5;
        if (pt.life <= 0) particles.splice(i, 1);
    }

    // ========================================================================
    // RENDER ROCK & HIP-HOP ARCADE ROCKBALL MACHINE
    // ========================================================================
    const ctx = canvas.getContext('2d');
    ctx.save();
    if (shakeTimer > 0) {
        ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    }

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    const deckGrad = ctx.createLinearGradient(0, 0, 0, H);
    deckGrad.addColorStop(0, '#1e1b4b');
    deckGrad.addColorStop(0.55, '#111827');
    deckGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = deckGrad;
    ctx.fillRect(tableLeft, 12, tableW, H - 12);

    drawTurntableFloorDecal(ctx, centerX, H * 0.48, 68, vinylAngle);

    ctx.fillStyle = rampLit ? 'rgba(250, 204, 21, 0.28)' : 'rgba(56, 189, 248, 0.14)';
    ctx.fillRect(centerX - 20, H * 0.12, 40, H * 0.28);
    ctx.strokeStyle = rampLit ? '#facc15' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(centerX - 20, H * 0.12, 40, H * 0.28);
    ctx.fillStyle = rampLit ? '#facc15' : '#94a3b8';
    ctx.font = '900 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(rampLit ? '★ JACKPOT ★' : 'RAMP', centerX, H * 0.15);

    ctx.font = '800 9px monospace';
    ctx.fillStyle = '#22c55e';
    ctx.fillText('IN', tableLeft + 38, H - 72);
    ctx.fillText('IN', shooterLaneX - 48, H - 72);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('OUT', tableLeft + 14, H - 42);
    ctx.fillText('OUT', shooterLaneX - 24, H - 42);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    walls.forEach(w => {
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
        ctx.stroke();
    });

    dropTargets.forEach(dtg => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(dtg.x, dtg.y, dtg.r, 0, Math.PI * 2);
        ctx.fillStyle = dtg.down ? '#1e293b' : dtg.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        if (!dtg.down) {
            ctx.fillStyle = '#0f172a';
            ctx.font = '900 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(dtg.label, dtg.x, dtg.y + 1);
        }
        ctx.restore();
    });

    slingshots.forEach(sl => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sl.p1.x, sl.p1.y);
        ctx.lineTo(sl.p2.x, sl.p2.y);
        ctx.lineTo(sl.p3.x, sl.p3.y);
        ctx.closePath();
        ctx.fillStyle = sl.flash > 0 ? '#ffffff' : 'rgba(236, 72, 153, 0.35)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ec4899';
        ctx.stroke();
        ctx.restore();
    });

    bumpers.forEach(bmp => {
        const scaleR = bmp.r + bmp.pulse * 6;
        ctx.save();
        ctx.beginPath();
        ctx.arc(bmp.x, bmp.y, scaleR + 4, 0, Math.PI * 2);
        ctx.fillStyle = bmp.charged ? 'rgba(34, 197, 94, 0.35)' : 'rgba(255, 255, 255, 0.14)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(bmp.x, bmp.y, scaleR, 0, Math.PI * 2);
        ctx.fillStyle = bmp.charged ? '#22c55e' : bmp.color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = '900 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bmp.litNote, bmp.x, bmp.y + 1);
        ctx.restore();
    });

    drawSpringPlunger(ctx, plunger);

    drawRockBallFlipper(ctx, flippers.outerLeft, '#ec4899', lowOuterNote.toUpperCase());
    drawRockBallFlipper(ctx, flippers.outerRight, '#ec4899', highOuterNote.toUpperCase());
    drawRockBallFlipper(ctx, flippers.innerLeft, '#38bdf8', lowInnerNote.toUpperCase());
    drawRockBallFlipper(ctx, flippers.innerRight, '#38bdf8', highInnerNote.toUpperCase());

    balls.forEach(b => {
        b.trail.forEach((t, idx) => {
            ctx.fillStyle = `rgba(56, 189, 248, ${(idx + 1) / b.trail.length * 0.28})`;
            ctx.beginPath();
            ctx.arc(t.x, t.y, b.r * 0.75, 0, Math.PI * 2);
            ctx.fill();
        });

        const ballGrad = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, b.r);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.55, '#cbd5e1');
        ballGrad.addColorStop(1, '#475569');
        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
    });

    particles.forEach(pt => {
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    });
    ctx.globalAlpha = 1.0;

    drawRockHipHopSidePanels(ctx, W, H, tableLeft, tableRight);

    if (bannerTimer > 0 && bannerText) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(tableLeft + 10, H * 0.44 - 16, tableW - 20, 32);
        ctx.fillStyle = bannerColor;
        ctx.font = '900 15px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bannerText, centerX, H * 0.44);
    }

    ctx.restore();

    if (gamePhase === 'ready' || gamePhase === 'playing') {
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}

function resolveSegmentCollision(ball, x1, y1, x2, y2, restitution) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((ball.x - x1) * dx + (ball.y - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    const distX = ball.x - closestX;
    const distY = ball.y - closestY;
    const dist = Math.hypot(distX, distY);

    if (dist < ball.r + 2 && dist > 0.0001) {
        const nx = distX / dist;
        const ny = distY / dist;
        ball.x = closestX + nx * (ball.r + 2.5);
        ball.y = closestY + ny * (ball.r + 2.5);
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
            ball.vx -= (1 + restitution) * dot * nx;
            ball.vy -= (1 + restitution) * dot * ny;
            return true;
        }
    }
    return false;
}

function drawRoundedBox(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function drawTurntableFloorDecal(ctx, cx, cy, radius, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-16, -2, 32, 4);
    ctx.restore();
}

function drawSpringPlunger(ctx, p) {
    const compressOffset = p.charge * 26;
    const topY = p.y + compressOffset;
    const botY = p.y + p.h;

    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const coils = 5;
    for (let i = 0; i <= coils; i++) {
        const cy = topY + ((botY - topY) * i) / coils;
        const cx = p.x + (i % 2 === 0 ? 3 : p.w - 3);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(p.x + 2, topY - 6, p.w - 4, 8);
    ctx.restore();
}

function drawRockBallFlipper(ctx, f, color, label) {
    const tipX = f.x + Math.cos(f.angle) * f.len;
    const tipY = f.y + Math.sin(f.angle) * f.len;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.font = '900 8.5px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, f.x, f.y + 0.5);
    ctx.restore();
}

function drawRockHipHopSidePanels(ctx, W, H, tableLeft, tableRight) {
    if (tableLeft > 110) {
        const panelW = Math.min(200, tableLeft - 24);
        const px = tableLeft - panelW - 12;
        ctx.fillStyle = '#111827';
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2;
        drawRoundedBox(ctx, px, 16, panelW, H - 32, 10);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#ec4899';
        ctx.font = '900 15px monospace';
        ctx.fillText('🎤 ROCKBALL 🎸', px + panelW / 2, 42);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('SCORE', px + panelW / 2, 68);
        ctx.fillStyle = '#facc15';
        ctx.font = '900 22px monospace';
        ctx.fillText(String(Math.floor(score)).padStart(6, '0'), px + panelW / 2, 92);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '800 12px monospace';
        ctx.fillText(`BALLS: ${ballsLeft}  |  ${multiplier}X`, px + panelW / 2, 122);

        if (ballSaveTimer > 0) {
            ctx.fillStyle = '#22c55e';
            ctx.fillText(`BALL SAVE: ${ballSaveTimer.toFixed(1)}s`, px + panelW / 2, 146);
        }
    }

    const rightSpace = W - tableRight;
    if (rightSpace > 110) {
        const panelW = Math.min(210, rightSpace - 24);
        const px = tableRight + 12;
        ctx.fillStyle = '#111827';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        drawRoundedBox(ctx, px, 16, panelW, H - 32, 10);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = '#38bdf8';
        ctx.font = '900 12px monospace';
        ctx.fillText('CALIBRATED KEYS', px + 12, 40);

        ctx.font = '800 11px monospace';
        ctx.fillStyle = '#ec4899';
        ctx.fillText(`OUTER L: ${lowOuterNote.toUpperCase()}`, px + 12, 66);
        ctx.fillText(`OUTER R: ${highOuterNote.toUpperCase()}`, px + 12, 86);

        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`INNER L: ${lowInnerNote.toUpperCase()}`, px + 12, 112);
        ctx.fillText(`INNER R: ${highInnerNote.toUpperCase()}`, px + 12, 132);

        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('PLUNGER: Hold Mid Key', px + 12, 162);
        ctx.fillText('JACKPOT: Match Bumpers', px + 12, 180);
    }
}
