// js/games/rockBall.js
import { initAudio, audioCtx, playErrorClackSound } from '../audio.js';
import { noteToPitch, pitchToNote, getNoteFrequency } from '../musicTheory.js';

let animFrameId = null;
let lastFrameTime = 0;
let bridgeRef = null;
let gamePhase = 'calibration'; // 'calibration' | 'ready' | 'playing' | 'gameover'

// Calibration State (Lowest & Highest White Keyboard Keys)
let calibStep = 1;
let lowPitchNum = 12;  // Default C1
let highPitchNum = 35; // Default B2
let lowOuterNote = 'c1';
let lowInnerNote = 'd1';
let highInnerNote = 'a2';
let highOuterNote = 'b2';

// Flipper States
const flippers = {
    outerLeft:  { active: false, angle: 0.42, restAngle: 0.42, activeAngle: -0.46, angVel: 0, x: 0, y: 0, len: 70, side: 1 },
    outerRight: { active: false, angle: Math.PI - 0.42, restAngle: Math.PI - 0.42, activeAngle: Math.PI + 0.46, angVel: 0, x: 0, y: 0, len: 70, side: -1 },
    innerLeft:  { active: false, angle: 0.38, restAngle: 0.38, activeAngle: -0.42, angVel: 0, x: 0, y: 0, len: 52, side: 1 },
    innerRight: { active: false, angle: Math.PI - 0.38, restAngle: Math.PI - 0.38, activeAngle: Math.PI + 0.42, angVel: 0, x: 0, y: 0, len: 52, side: -1 }
};

// Plunger State
const plunger = {
    pulling: false,
    charge: 0,
    lastTickStep: 0,
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
let beatPulse = 0;
let eqHeights = [0.3, 0.5, 0.7, 0.4, 0.8, 0.6, 0.9, 0.5, 0.7, 0.4, 0.6, 0.3];

let balls = [];
let bumpers = [];
let slingshots = [];
let dropTargets = [];
let walls = [];
let particles = [];
let floatingPopups = [];

const SCALE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NEON_COLORS = ['#ec4899', '#38bdf8', '#facc15', '#22c55e', '#a855f7'];
const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]); // C, D, E, F, G, A, B

function isWhiteKeyNote(noteStr) {
    const clean = (noteStr || '').trim().toLowerCase();
    return /^[a-g][0-9]+$/.test(clean);
}

function isWhitePitchNum(pNum) {
    return WHITE_PITCH_CLASSES.has(((pNum % 12) + 12) % 12);
}

// ============================================================================
// PROCEDURAL 96 BPM ROCK / HIP-HOP BACKGROUND MUSIC ENGINE
// ============================================================================
class RockHipHopGrooveEngine {
    constructor() {
        this.isRunning = false;
        this.step = 0;
        this.nextTime = 0;
        this.bpm = 96;
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
            const swing = (this.step % 2 === 0) ? sixteenth * 1.14 : sixteenth * 0.86;
            this.nextTime += swing;
            this.step = (this.step + 1) % 32;
        }
    }

    scheduleStep(step, t) {
        const barStep = step % 16;

        // 808 Boom-Bap Kick
        if (barStep === 0 || barStep === 3 || barStep === 7 || barStep === 10 || step === 27) {
            this.play808Kick(t);
            beatPulse = 1.0;
        }

        // Heavy Snare + Rim Clap on 2 & 4
        if (barStep === 4 || barStep === 12) {
            this.playSnare(t);
            beatPulse = Math.max(beatPulse, 0.85);
        }

        // Swung Hi-Hat + Open Hat
        if (barStep % 2 === 0 || barStep === 15) {
            const isOpen = barStep === 14;
            this.playHiHat(t, isOpen ? 0.15 : 0.04, isOpen ? 0.065 : 0.028);
        }

        // Funky Sub-Bass Riff (C Minor / Blues)
        const bassNotes = {
            0: 65.41,   // C2
            3: 65.41,   // C2
            6: 77.78,   // Eb2
            8: 87.31,   // F2
            10: 98.00,  // G2
            14: 116.54, // Bb2
            16: 65.41,  // C2
            19: 77.78,  // Eb2
            22: 87.31,  // F2
            24: 92.50,  // F#2
            26: 98.00,  // G2
            30: 58.27   // Bb1
        };
        if (bassNotes[step]) {
            this.playSubBass(t, bassNotes[step], 0.25);
        }

        // Electric Rock Guitar Power-Chord Stabs
        if (step === 0 || step === 10 || step === 16 || step === 26) {
            const root = (step === 0 || step === 16) ? 130.81 : 196.00;
            this.playRockGuitarChord(t, root, 0.28);
        }
    }

    play808Kick(t) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(145, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
    }

    playSnare(t) {
        const bufLen = Math.floor(audioCtx.sampleRate * 0.15);
        const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.4);

        const noise = audioCtx.createBufferSource();
        noise.buffer = buf;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1900;
        const nGain = audioCtx.createGain();
        nGain.gain.setValueAtTime(0.21, t);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(audioCtx.destination);
        noise.start(t);

        const bodyOsc = audioCtx.createOscillator();
        const bGain = audioCtx.createGain();
        bodyOsc.type = 'triangle';
        bodyOsc.frequency.setValueAtTime(200, t);
        bodyOsc.frequency.exponentialRampToValueAtTime(82, t + 0.08);
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
        hp.frequency.value = 7400;
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

    playRockGuitarChord(t, rootFreq, dur) {
        [rootFreq, rootFreq * 1.498].forEach(freq => {
            const osc = audioCtx.createOscillator();
            const filter = audioCtx.createBiquadFilter();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, t);
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1450, t);
            filter.frequency.exponentialRampToValueAtTime(420, t + dur);
            gain.gain.setValueAtTime(0.045, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + dur + 0.02);
        });
    }
}

const hipHopMusic = new RockHipHopGrooveEngine();

// ============================================================================
// MECHANICAL PINBALL SOUND EFFECTS
// ============================================================================
function playRockBallSfx(type, param = null) {
    try {
        initAudio();
        if (!audioCtx) return;
        const now = audioCtx.currentTime;

        if (type === 'flipperUp' || type === 'flipperDown') {
            const bufLen = Math.floor(audioCtx.sampleRate * 0.028);
            const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2.2);

            const clickSrc = audioCtx.createBufferSource();
            clickSrc.buffer = buf;
            const bp = audioCtx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = type === 'flipperUp' ? 2800 : 1900;
            const cGain = audioCtx.createGain();
            cGain.gain.setValueAtTime(0.28, now);
            cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
            clickSrc.connect(bp);
            bp.connect(cGain);
            cGain.connect(audioCtx.destination);
            clickSrc.start(now);

            const thud = audioCtx.createOscillator();
            const tGain = audioCtx.createGain();
            thud.type = 'triangle';
            thud.frequency.setValueAtTime(type === 'flipperUp' ? 240 : 165, now);
            thud.frequency.exponentialRampToValueAtTime(55, now + 0.045);
            tGain.gain.setValueAtTime(0.18, now);
            tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
            thud.connect(tGain);
            tGain.connect(audioCtx.destination);
            thud.start(now);
            thud.stop(now + 0.05);

        } else if (type === 'springPull') {
            const charge = typeof param === 'number' ? param : 0.5;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(320 + charge * 420, now);
            osc.frequency.exponentialRampToValueAtTime(480 + charge * 520, now + 0.035);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.04);

        } else if (type === 'springLaunch') {
            const power = typeof param === 'number' ? param : 0.8;
            const springOsc = audioCtx.createOscillator();
            const lfo = audioCtx.createOscillator();
            const lfoGain = audioCtx.createGain();
            const mainGain = audioCtx.createGain();

            springOsc.type = 'sawtooth';
            springOsc.frequency.setValueAtTime(160 + power * 90, now);
            springOsc.frequency.exponentialRampToValueAtTime(640 + power * 360, now + 0.28);

            lfo.type = 'sine';
            lfo.frequency.setValueAtTime(34, now);
            lfoGain.gain.setValueAtTime(65, now);
            lfoGain.gain.exponentialRampToValueAtTime(4, now + 0.28);

            lfo.connect(lfoGain);
            lfoGain.connect(springOsc.frequency);

            mainGain.gain.setValueAtTime(0.24, now);
            mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

            springOsc.connect(mainGain);
            mainGain.connect(audioCtx.destination);
            springOsc.start(now);
            lfo.start(now);
            springOsc.stop(now + 0.31);
            lfo.stop(now + 0.31);

        } else if (type === 'bumper') {
            const freq = (typeof param === 'string' && getNoteFrequency(param)) || 523.25;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.12);
            gain.gain.setValueAtTime(0.24, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.16);

        } else if (type === 'slingshot') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(290, now);
            osc.frequency.exponentialRampToValueAtTime(780, now + 0.09);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.11);

        } else if (type === 'target') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(660, now);
            osc.frequency.setValueAtTime(880, now + 0.04);
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.12);

        } else if (type === 'wallTick') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1150, now);
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.03);

        } else if (type === 'drain') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(340, now);
            osc.frequency.exponentialRampToValueAtTime(65, now + 0.35);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.4);

        } else if (type === 'jackpot') {
            [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(f, now + idx * 0.06);
                gain.gain.setValueAtTime(0.13, now + idx * 0.06);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.24);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.06);
                osc.stop(now + idx * 0.06 + 0.25);
            });
        }
    } catch (e) {}
}

// ============================================================================
// CALIBRATION MODAL (White Keys Only for Flipper Paddles)
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
        <div class="modal" style="max-width: 540px; text-align: center; border: 2px solid #ec4899; box-shadow: 0 0 35px rgba(236,72,153,0.55); background: linear-gradient(145deg, #0f172a, #1e1b4b);">
            <h2 style="color: #facc15; margin-bottom: 6px; font-size: 1.5rem;">🎸 RockBall Keyboard Calibration</h2>
            <p id="rockball-calib-instructions" style="font-size: 0.98rem; color: #38bdf8; font-weight: 800; margin-bottom: 12px;">
                Step 1: Press the LOWEST WHITE key on your keyboard...
            </p>
            <div style="background: rgba(15,23,42,0.9); border: 1px solid #4f46e5; border-radius: 10px; padding: 14px; font-size: 0.84rem; color: #e2e8f0; text-align: left; margin-bottom: 14px; line-height: 1.65;">
                <div>• <b style="color:#ec4899;">Lowest &amp; Highest White Keys:</b> Control the <b>Outer Lower Flippers</b></div>
                <div>• <b style="color:#38bdf8;">2nd-Lowest &amp; 2nd-Highest White Keys:</b> Control the <b>Inner Mid-Field Flippers</b></div>
                <div>• <b style="color:#facc15;">Middle Scale Keys (C–B):</b> Light up Bumpers for <b>Multiball &amp; Jackpots</b> + Pull Spring Plunger!</div>
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
            applyCalibratedRange(12, 35); // C1 to B2
            modal.classList.remove('open');
            beginRockBallSession(bridge);
        };
    }
}

function applyCalibratedRange(lowP, highP) {
    const startP = Math.min(lowP, highP);
    const endP = Math.max(lowP, highP);

    const whitePitches = [];
    for (let p = startP; p <= endP; p++) {
        if (isWhitePitchNum(p)) whitePitches.push(p);
    }

    if (whitePitches.length >= 4) {
        lowPitchNum = whitePitches[0];
        highPitchNum = whitePitches[whitePitches.length - 1];
        lowOuterNote = (pitchToNote(whitePitches[0]) || 'c1').toLowerCase();
        lowInnerNote = (pitchToNote(whitePitches[1]) || 'd1').toLowerCase();
        highInnerNote = (pitchToNote(whitePitches[whitePitches.length - 2]) || 'a2').toLowerCase();
        highOuterNote = (pitchToNote(whitePitches[whitePitches.length - 1]) || 'b2').toLowerCase();
    } else {
        lowPitchNum = 12;
        highPitchNum = 35;
        lowOuterNote = 'c1';
        lowInnerNote = 'd1';
        highInnerNote = 'a2';
        highOuterNote = 'b2';
    }
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
        releaseAllFlippers();
        if (plunger.pulling && e.code !== 'Space') {
            releasePlunger();
        }
    }
}

function handlePointerUp() {
    setTimeout(() => {
        if (!document.querySelector('#keyboard .key.active')) {
            releaseAllFlippers();
            if (plunger.pulling) releasePlunger();
        }
    }, 10);
}

function releaseAllFlippers() {
    Object.values(flippers).forEach(f => {
        if (f.active) {
            f.active = false;
            playRockBallSfx('flipperDown');
        }
    });
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
        statusEl.textContent = '🎸 RockBall Calibration: Press your LOWEST WHITE key, then your HIGHEST WHITE key!';
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
    floatingPopups = [];
    shakeTimer = 0;
    bannerTimer = 0;

    buildRockBallTable();
    spawnBallInPlungerLane();
    hipHopMusic.start();

    gamePhase = 'ready';
    lastFrameTime = performance.now();

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🎤 RockBall Ready! White-Key Flippers: ${lowOuterNote.toUpperCase()} / ${highOuterNote.toUpperCase()} (Outer) & ${lowInnerNote.toUpperCase()} / ${highInnerNote.toUpperCase()} (Inner) | Hold middle key to pull spring plunger!`;
    }

    if (animFrameId === null) {
        animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));
    }
}

export function handleRockBallInput(noteStr, bridge) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (!clean) return;

    // 1. White-Key Only Calibration
    if (gamePhase === 'calibration') {
        const instrEl = document.getElementById('rockball-calib-instructions');
        if (!isWhiteKeyNote(clean)) {
            playErrorClackSound();
            bridge.highlightKey(noteStr, 250, '#ef4444');
            if (instrEl) {
                instrEl.innerHTML = `<span style="color:#ef4444;">Black key ignored!</span> Please press a <b>WHITE</b> key for Step ${calibStep}...`;
            }
            return;
        }

        const pNum = noteToPitch(clean);
        if (pNum === null) return;

        if (calibStep === 1) {
            lowPitchNum = pNum;
            calibStep = 2;
            playRockBallSfx('bumper', clean);
            bridge.highlightKey(noteStr, 300, '#22c55e');
            if (instrEl) {
                instrEl.innerHTML = `Lowest white key set to <span style="color:#22c55e;">${clean.toUpperCase()}</span>! Now Step 2: Press the <b>HIGHEST WHITE</b> key on your keyboard...`;
            }
        } else if (calibStep === 2) {
            if (Math.abs(pNum - lowPitchNum) < 5) {
                playErrorClackSound();
                if (instrEl) {
                    instrEl.innerHTML = `<span style="color:#ef4444;">Range too narrow!</span> Pick a higher <b>WHITE</b> key at least 5 notes away...`;
                }
                return;
            }
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

    // 2. White-Key Only Outer & Inner Flipper Triggers
    if (isWhiteKeyNote(clean)) {
        if (clean === lowOuterNote) {
            if (!flippers.outerLeft.active) playRockBallSfx('flipperUp');
            flippers.outerLeft.active = true;
            bridge.highlightKey(noteStr, 180, '#ec4899');
            return;
        }
        if (clean === highOuterNote) {
            if (!flippers.outerRight.active) playRockBallSfx('flipperUp');
            flippers.outerRight.active = true;
            bridge.highlightKey(noteStr, 180, '#ec4899');
            return;
        }
        if (clean === lowInnerNote) {
            if (!flippers.innerLeft.active) playRockBallSfx('flipperUp');
            flippers.innerLeft.active = true;
            bridge.highlightKey(noteStr, 180, '#38bdf8');
            return;
        }
        if (clean === highInnerNote) {
            if (!flippers.innerRight.active) playRockBallSfx('flipperUp');
            flippers.innerRight.active = true;
            bridge.highlightKey(noteStr, 180, '#38bdf8');
            return;
        }
    }

    // 3. Plunger Pull-Back if Ball is in the Launch Lane
    const ballInShooter = balls.some(b => b.inShooterLane);
    if (ballInShooter) {
        plunger.pulling = true;
        bridge.highlightKey(noteStr, 220, '#facc15');
        return;
    }

    // 4. Musical Bumper Note Matching (Triggers Jackpot Ramps & Multiball)
    const letter = clean.replace(/[0-9#b]+$/g, '').toUpperCase();
    let matchedAnyBumper = false;

    bumpers.forEach(bmp => {
        if (bmp.litNote === letter) {
            matchedAnyBumper = true;
            bmp.pulse = 1.0;
            bmp.charged = true;
            const pts = 250 * multiplier;
            score += pts;
            playRockBallSfx('bumper', noteStr);
            spawnSparkBurst(bmp.x, bmp.y, bmp.color, 16);
            spawnFloatingScore(bmp.x, bmp.y - 20, `+${pts}`, '#22c55e');
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
    if (isWhiteKeyNote(clean)) {
        if (clean === lowOuterNote) {
            if (flippers.outerLeft.active) playRockBallSfx('flipperDown');
            flippers.outerLeft.active = false;
            return;
        }
        if (clean === highOuterNote) {
            if (flippers.outerRight.active) playRockBallSfx('flipperDown');
            flippers.outerRight.active = false;
            return;
        }
        if (clean === lowInnerNote) {
            if (flippers.innerLeft.active) playRockBallSfx('flipperDown');
            flippers.innerLeft.active = false;
            return;
        }
        if (clean === highInnerNote) {
            if (flippers.innerRight.active) playRockBallSfx('flipperDown');
            flippers.innerRight.active = false;
            return;
        }
    }
    if (plunger.pulling) {
        releasePlunger();
    }
}

function releasePlunger() {
    if (!plunger.pulling) return;
    plunger.pulling = false;
    const launchPower = Math.max(0.35, plunger.charge);
    plunger.charge = 0;
    plunger.lastTickStep = 0;

    balls.forEach(b => {
        if (b.inShooterLane) {
            b.vy = -(820 + launchPower * 540);
            b.vx = -38;
            gamePhase = 'playing';
            ballSaveTimer = 14.0;
            playRockBallSfx('springLaunch', launchPower);
            spawnSparkBurst(plunger.x + plunger.w / 2, plunger.y, '#facc15', 14);
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
    flippers.outerLeft.x = centerX - 80;
    flippers.outerLeft.y = H - 36;
    flippers.outerRight.x = centerX + 80;
    flippers.outerRight.y = H - 36;

    flippers.innerLeft.x = centerX - 64;
    flippers.innerLeft.y = H * 0.54;
    flippers.innerRight.x = centerX + 64;
    flippers.innerRight.y = H * 0.54;

    plunger.x = shooterLaneX + 5;
    plunger.y = H - 56;
    plunger.w = 24;
    plunger.h = 50;

    bumpers = [
        { x: centerX - 48, y: H * 0.25, r: 23, litNote: 'C', color: '#ec4899', pulse: 0, charged: false },
        { x: centerX + 48, y: H * 0.25, r: 23, litNote: 'E', color: '#38bdf8', pulse: 0, charged: false },
        { x: centerX,      y: H * 0.36, r: 25, litNote: 'G', color: '#facc15', pulse: 0, charged: false }
    ];

    slingshots = [
        {
            p1: { x: tableLeft + 46, y: H - 118 },
            p2: { x: tableLeft + 46, y: H - 62 },
            p3: { x: flippers.outerLeft.x - 10, y: H - 52 },
            kickVx: 370, kickVy: -390, flash: 0
        },
        {
            p1: { x: playRight - 46, y: H - 118 },
            p2: { x: playRight - 46, y: H - 62 },
            p3: { x: flippers.outerRight.x + 10, y: H - 52 },
            kickVx: -370, kickVy: -390, flash: 0
        }
    ];

    const letters = ['R', 'O', 'C', 'K'];
    dropTargets = letters.map((ch, idx) => ({
        x: tableLeft + 26 + idx * 14,
        y: H * 0.27 + idx * 25,
        r: 10.5,
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
        { x1: tableLeft + 28, y1: H - 124, x2: tableLeft + 28, y2: H - 58 },
        { x1: tableLeft + 28, y1: H - 58, x2: flippers.outerLeft.x - 4, y2: flippers.outerLeft.y - 2 },
        { x1: tableLeft, y1: H - 60, x2: tableLeft + 24, y2: H - 15 },
        { x1: playRight - 28, y1: H - 124, x2: playRight - 28, y2: H - 58 },
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
        r: 9.5,
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
                r: 9.5,
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

function spawnFloatingScore(x, y, text, color = '#facc15') {
    floatingPopups.push({ x, y, text, color, life: 1.0 });
}

function spawnSparkBurst(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const spd = 70 + Math.random() * 190;
        particles.push({
            x, y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 2.5 + Math.random() * 2.5,
            color,
            life: 1.0
        });
    }
}

// ============================================================================
// PHYSICS & HIGH-DETAIL RENDER LOOP
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
    vinylAngle += dt * 3.8;
    if (beatPulse > 0) beatPulse = Math.max(0, beatPulse - dt * 4.5);

    for (let i = 0; i < eqHeights.length; i++) {
        const target = 0.2 + beatPulse * (0.4 + 0.5 * Math.abs(Math.sin(now * 0.008 + i * 0.9)));
        eqHeights[i] += (target - eqHeights[i]) * Math.min(1, dt * 16);
    }

    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (ballSaveTimer > 0) ballSaveTimer = Math.max(0, ballSaveTimer - dt);

    if (plunger.pulling) {
        plunger.charge = Math.min(1, plunger.charge + dt * 1.45);
        const tickStep = Math.floor(plunger.charge * 8);
        if (tickStep > plunger.lastTickStep) {
            plunger.lastTickStep = tickStep;
            playRockBallSfx('springPull', plunger.charge);
        }
    }

    Object.values(flippers).forEach(f => {
        const target = f.active ? f.activeAngle : f.restAngle;
        const prev = f.angle;
        f.angle += (target - f.angle) * Math.min(1, dt * 30);
        f.angVel = (f.angle - prev) / Math.max(0.001, dt);
    });

    bumpers.forEach(b => { if (b.pulse > 0) b.pulse = Math.max(0, b.pulse - dt * 3.5); });
    slingshots.forEach(s => { if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 4.5); });

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
                if (resolveSegmentCollision(b, w.x1, w.y1, w.x2, w.y2, 0.72) && spd > 220) {
                    playRockBallSfx('wallTick');
                }
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
                    const kickSpeed = Math.max(470, spd * 1.15);
                    b.vx = nx * kickSpeed;
                    b.vy = ny * kickSpeed;
                    bmp.pulse = 1.0;
                    const pts = 100 * multiplier;
                    score += pts;
                    playRockBallSfx('bumper');
                    spawnSparkBurst(bmp.x + nx * bmp.r, bmp.y + ny * bmp.r, bmp.color, 8);
                    spawnFloatingScore(bmp.x, bmp.y - 16, `+${pts}`, bmp.color);
                }
            }

            for (const sl of slingshots) {
                const hitHypotenuse = resolveSegmentCollision(b, sl.p1.x, sl.p1.y, sl.p3.x, sl.p3.y, 1.35);
                if (hitHypotenuse) {
                    b.vx = sl.kickVx;
                    b.vy = sl.kickVy;
                    sl.flash = 1.0;
                    const pts = 75 * multiplier;
                    score += pts;
                    playRockBallSfx('slingshot');
                    spawnSparkBurst(b.x, b.y, '#ec4899', 9);
                    spawnFloatingScore(b.x, b.y - 10, `+${pts}`, '#ec4899');
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
                    const pts = 200 * multiplier;
                    score += pts;
                    playRockBallSfx('target');
                    spawnSparkBurst(dtg.x, dtg.y, dtg.color, 12);
                    spawnFloatingScore(dtg.x + 14, dtg.y, `+${pts}`, dtg.color);

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
                b.vy = -530;
                playRockBallSfx('jackpot');
                spawnSparkBurst(centerX, H * 0.16, '#facc15', 16);
                spawnFloatingScore(centerX, H * 0.16, `RAMP +${rampPts}`, '#facc15');
                triggerBanner(`🚀 RAMP COMBO SHOT! +${rampPts}`, '#facc15', 1.0);
            }

            Object.values(flippers).forEach(f => {
                const tipX = f.x + Math.cos(f.angle) * f.len;
                const tipY = f.y + Math.sin(f.angle) * f.len;
                const hit = resolveSegmentCollision(b, f.x, f.y, tipX, tipY, 0.65);
                if (hit && Math.abs(f.angVel) > 1.5) {
                    const distRatio = Math.min(1, Math.hypot(b.x - f.x, b.y - f.y) / f.len);
                    b.vy = Math.min(b.vy, -(490 + distRatio * 340));
                    b.vx += f.side * (125 + distRatio * 180);
                    spawnSparkBurst(b.x, b.y, '#38bdf8', 5);
                }
            });

            if (s === 0) {
                b.trail.push({ x: b.x, y: b.y });
                if (b.trail.length > 10) b.trail.shift();
            }

            if (b.y > H + 14) {
                balls.splice(i, 1);
            }
        }
    }

    if (balls.length === 0 && gamePhase === 'playing') {
        multiballTriggered = false;
        if (ballSaveTimer > 0) {
            playRockBallSfx('jackpot');
            triggerBanner('🛡️ BALL SAVED! SHOOT AGAIN!', '#22c55e', 1.2);
            spawnBallInPlungerLane();
            gamePhase = 'ready';
        } else {
            ballsLeft--;
            playRockBallSfx('drain');
            if (ballsLeft > 0) {
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
    for (let i = floatingPopups.length - 1; i >= 0; i--) {
        const fp = floatingPopups[i];
        fp.y -= 32 * dt;
        fp.life -= dt * 1.35;
        if (fp.life <= 0) floatingPopups.splice(i, 1);
    }

    // ========================================================================
    // RENDER 3D-STYLED ROCK & HIP-HOP ARCADE PINBALL CABINET
    // ========================================================================
    const ctx = canvas.getContext('2d');
    ctx.save();
    if (shakeTimer > 0) {
        ctx.translate((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    }

    const bgGrad = ctx.createRadialGradient(W / 2, H * 0.2, 40, W / 2, H * 0.5, W * 0.65);
    bgGrad.addColorStop(0, '#1e1b4b');
    bgGrad.addColorStop(0.55, '#090d16');
    bgGrad.addColorStop(1, '#030712');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.08 + beatPulse * 0.05;
    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.moveTo(tableLeft - 40, 0);
    ctx.lineTo(tableLeft - 180, H);
    ctx.lineTo(tableLeft + 40, H);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(tableRight + 40, 0);
    ctx.lineTo(tableRight + 180, H);
    ctx.lineTo(tableRight - 40, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#1f2937';
    drawRoundedBox(ctx, tableLeft - 8, 6, tableW + 16, H - 6, 18);
    ctx.fill();
    ctx.restore();

    const deckGrad = ctx.createLinearGradient(tableLeft, 0, tableRight, H);
    deckGrad.addColorStop(0, '#1e1b4b');
    deckGrad.addColorStop(0.45, '#111827');
    deckGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = deckGrad;
    drawRoundedBox(ctx, tableLeft, 12, tableW, H - 12, 14);
    ctx.fill();

    ctx.save();
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
    ctx.lineWidth = 1;
    for (let gx = tableLeft + 36; gx < tableRight; gx += 36) {
        ctx.beginPath();
        ctx.moveTo(gx, 14);
        ctx.lineTo(gx, H);
        ctx.stroke();
    }
    for (let gy = 36; gy < H; gy += 36) {
        ctx.beginPath();
        ctx.moveTo(tableLeft, gy);
        ctx.lineTo(tableRight, gy);
        ctx.stroke();
    }
    ctx.restore();

    drawPlayfieldEqualizer(ctx, centerX, H * 0.56, 170, 54);
    drawTurntableFloorDecal(ctx, centerX, H * 0.45, 66, vinylAngle, beatPulse);
    drawElevatedJackpotRamp(ctx, centerX, H * 0.11, 42, H * 0.28, rampLit, now);
    drawLaneArrows(ctx, tableLeft, shooterLaneX, H);

    walls.forEach(w => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(w.x1 + 2, w.y1 + 3);
        ctx.lineTo(w.x2 + 2, w.y2 + 3);
        ctx.stroke();

        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
        ctx.stroke();

        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(w.x1 - 0.5, w.y1 - 0.5);
        ctx.lineTo(w.x2 - 0.5, w.y2 - 0.5);
        ctx.stroke();
        ctx.restore();
    });

    dropTargets.forEach(dtg => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(dtg.x, dtg.y, dtg.r + 3, 0, Math.PI * 2);
        ctx.fillStyle = '#090d16';
        ctx.fill();

        if (dtg.down) {
            ctx.beginPath();
            ctx.arc(dtg.x, dtg.y, dtg.r - 2, 0, Math.PI * 2);
            ctx.fillStyle = '#1e293b';
            ctx.fill();
        } else {
            const tGrad = ctx.createRadialGradient(dtg.x - 3, dtg.y - 3, 1, dtg.x, dtg.y, dtg.r);
            tGrad.addColorStop(0, '#ffffff');
            tGrad.addColorStop(0.45, dtg.color);
            tGrad.addColorStop(1, '#0f172a');
            ctx.beginPath();
            ctx.arc(dtg.x, dtg.y, dtg.r, 0, Math.PI * 2);
            ctx.fillStyle = tGrad;
            ctx.fill();
            ctx.lineWidth = 1.8;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            ctx.fillStyle = '#0f172a';
            ctx.font = '900 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(dtg.label, dtg.x, dtg.y + 0.5);
        }
        ctx.restore();
    });

    slingshots.forEach(sl => {
        ctx.save();
        ctx.shadowColor = sl.flash > 0 ? '#ffffff' : '#ec4899';
        ctx.shadowBlur = sl.flash > 0 ? 18 : 8;

        ctx.beginPath();
        ctx.moveTo(sl.p1.x, sl.p1.y);
        ctx.lineTo(sl.p2.x, sl.p2.y);
        ctx.lineTo(sl.p3.x, sl.p3.y);
        ctx.closePath();

        const slGrad = ctx.createLinearGradient(sl.p1.x, sl.p1.y, sl.p3.x, sl.p3.y);
        slGrad.addColorStop(0, sl.flash > 0 ? '#ffffff' : '#be185d');
        slGrad.addColorStop(1, sl.flash > 0 ? '#facc15' : '#4c1d95');
        ctx.fillStyle = slGrad;
        ctx.fill();

        ctx.lineWidth = 3.5;
        ctx.strokeStyle = sl.flash > 0 ? '#ffffff' : '#f472b6';
        ctx.stroke();

        [sl.p1, sl.p2, sl.p3].forEach(pt => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#f8fafc';
            ctx.fill();
        });
        ctx.restore();
    });

    bumpers.forEach(bmp => {
        const scaleR = bmp.r + bmp.pulse * 6;
        ctx.save();

        ctx.beginPath();
        ctx.arc(bmp.x, bmp.y, scaleR + 7, 0, Math.PI * 2);
        ctx.fillStyle = bmp.charged ? 'rgba(34, 197, 94, 0.32)' : 'rgba(255, 255, 255, 0.10)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(bmp.x + 2, bmp.y + 4, scaleR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fill();

        const activeColor = bmp.charged ? '#22c55e' : bmp.color;
        const bGrad = ctx.createRadialGradient(bmp.x - scaleR * 0.3, bmp.y - scaleR * 0.3, 2, bmp.x, bmp.y, scaleR);
        bGrad.addColorStop(0, '#ffffff');
        bGrad.addColorStop(0.42, activeColor);
        bGrad.addColorStop(1, '#0f172a');

        ctx.beginPath();
        ctx.arc(bmp.x, bmp.y, scaleR, 0, Math.PI * 2);
        ctx.fillStyle = bGrad;
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(bmp.x, bmp.y, scaleR * 0.68, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = '900 16px sans-serif';
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
            const ratio = (idx + 1) / b.trail.length;
            ctx.fillStyle = `rgba(56, 189, 248, ${ratio * 0.32})`;
            ctx.beginPath();
            ctx.arc(t.x, t.y, b.r * (0.4 + ratio * 0.45), 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.arc(b.x + 2, b.y + 3, b.r, 0, Math.PI * 2);
        ctx.fill();

        const ballGrad = ctx.createRadialGradient(b.x - 3.5, b.y - 3.5, 1, b.x, b.y, b.r);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.35, '#e2e8f0');
        ballGrad.addColorStop(0.75, '#64748b');
        ballGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
    });

    particles.forEach(pt => {
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    floatingPopups.forEach(fp => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, fp.life);
        ctx.font = '900 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(fp.text, fp.x + 1, fp.y + 1);
        ctx.fillStyle = fp.color;
        ctx.fillText(fp.text, fp.x, fp.y);
        ctx.restore();
    });

    drawRockHipHopSidePanels(ctx, W, H, tableLeft, tableRight);

    if (bannerTimer > 0 && bannerText) {
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        drawRoundedBox(ctx, tableLeft + 14, H * 0.44 - 18, tableW - 28, 36, 8);
        ctx.fill();
        ctx.strokeStyle = bannerColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = bannerColor;
        ctx.font = '900 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bannerText, centerX, H * 0.44);
        ctx.restore();
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

function drawPlayfieldEqualizer(ctx, cx, baseY, width, maxH) {
    ctx.save();
    const barCount = eqHeights.length;
    const gap = 4;
    const barW = (width - gap * (barCount - 1)) / barCount;
    const startX = cx - width / 2;

    for (let i = 0; i < barCount; i++) {
        const h = eqHeights[i] * maxH;
        const x = startX + i * (barW + gap);
        const grad = ctx.createLinearGradient(0, baseY - h, 0, baseY);
        grad.addColorStop(0, '#ec4899');
        grad.addColorStop(0.5, '#a855f7');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0.15)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, baseY - h, barW, h);
    }
    ctx.restore();
}

function drawTurntableFloorDecal(ctx, cx, cy, radius, angle, pulse) {
    ctx.save();
    const r = radius + pulse * 4;
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = 1;
    [0.82, 0.68, 0.54].forEach(scale => {
        ctx.beginPath();
        ctx.arc(0, 0, r * scale, 0, Math.PI * 2);
        ctx.stroke();
    });

    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-16, -2.5, 32, 5);
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawElevatedJackpotRamp(ctx, cx, topY, w, h, isLit, now) {
    ctx.save();
    const x = cx - w / 2;
    const grad = ctx.createLinearGradient(0, topY, 0, topY + h);
    grad.addColorStop(0, isLit ? 'rgba(250, 204, 21, 0.42)' : 'rgba(56, 189, 248, 0.22)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.05)');
    ctx.fillStyle = grad;
    drawRoundedBox(ctx, x, topY, w, h, 8);
    ctx.fill();

    ctx.strokeStyle = isLit ? '#facc15' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const offset = (now / 40) % 24;
    ctx.strokeStyle = isLit ? '#fef08a' : 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 2;
    for (let cy = topY + h - 14 - offset; cy > topY + 24; cy -= 24) {
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy + 5);
        ctx.lineTo(cx, cy - 2);
        ctx.lineTo(cx + 8, cy + 5);
        ctx.stroke();
    }

    ctx.fillStyle = isLit ? '#facc15' : '#e2e8f0';
    ctx.font = '900 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isLit ? '★ JACKPOT ★' : 'RAMP', cx, topY + 14);
    ctx.restore();
}

function drawLaneArrows(ctx, tableLeft, shooterLaneX, H) {
    ctx.save();
    ctx.font = '900 9px monospace';
    ctx.textAlign = 'center';

    ctx.fillStyle = '#22c55e';
    ctx.fillText('▼ IN', tableLeft + 42, H - 72);
    ctx.fillText('IN ▼', shooterLaneX - 52, H - 72);

    ctx.fillStyle = '#ef4444';
    ctx.fillText('OUT', tableLeft + 14, H - 40);
    ctx.fillText('OUT', shooterLaneX - 24, H - 40);
    ctx.restore();
}

function drawSpringPlunger(ctx, p) {
    const compressOffset = p.charge * 26;
    const topY = p.y + compressOffset;
    const botY = p.y + p.h;

    ctx.save();
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(p.x + p.w / 2 - 2.5, topY, 5, botY - topY);

    ctx.strokeStyle = p.pulling ? '#facc15' : '#cbd5e1';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    const coils = 6;
    for (let i = 0; i <= coils; i++) {
        const cy = topY + ((botY - topY) * i) / coils;
        const cx = p.x + (i % 2 === 0 ? 3 : p.w - 3);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    const tipGrad = ctx.createLinearGradient(p.x, topY - 7, p.x + p.w, topY + 2);
    tipGrad.addColorStop(0, '#f87171');
    tipGrad.addColorStop(1, '#b91c1c');
    ctx.fillStyle = tipGrad;
    drawRoundedBox(ctx, p.x + 2, topY - 7, p.w - 4, 9, 3);
    ctx.fill();
    ctx.restore();
}

function drawRockBallFlipper(ctx, f, color, label) {
    const tipX = f.x + Math.cos(f.angle) * f.len;
    const tipY = f.y + Math.sin(f.angle) * f.len;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(f.x + 2, f.y + 4);
    ctx.lineTo(tipX + 2, tipY + 4);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.font = '900 8.5px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, f.x, f.y + 0.5);
    ctx.restore();
}

function drawRockHipHopSidePanels(ctx, W, H, tableLeft, tableRight) {
    if (tableLeft > 110) {
        const panelW = Math.min(205, tableLeft - 24);
        const px = tableLeft - panelW - 12;

        const pGrad = ctx.createLinearGradient(px, 16, px, H - 16);
        pGrad.addColorStop(0, '#1e1b4b');
        pGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = pGrad;
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2.5;
        drawRoundedBox(ctx, px, 16, panelW, H - 32, 12);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#facc15';
        ctx.font = '900 16px monospace';
        ctx.fillText('🎤 ROCKBALL 🎸', px + panelW / 2, 44);

        ctx.fillStyle = '#050811';
        drawRoundedBox(ctx, px + 14, 58, panelW - 28, 48, 8);
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 9.5px monospace';
        ctx.fillText('LED SCOREBOARD', px + panelW / 2, 71);
        ctx.fillStyle = '#facc15';
        ctx.font = '900 22px monospace';
        ctx.fillText(String(Math.floor(score)).padStart(6, '0'), px + panelW / 2, 94);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '800 12px monospace';
        ctx.fillText(`BALLS: ${ballsLeft}  •  ${multiplier}X`, px + panelW / 2, 128);

        if (ballSaveTimer > 0) {
            ctx.fillStyle = '#22c55e';
            ctx.fillText(`🛡️ SAVE: ${ballSaveTimer.toFixed(1)}s`, px + panelW / 2, 152);
        }
    }

    const rightSpace = W - tableRight;
    if (rightSpace > 110) {
        const panelW = Math.min(215, rightSpace - 24);
        const px = tableRight + 12;

        const rGrad = ctx.createLinearGradient(px, 16, px, H - 16);
        rGrad.addColorStop(0, '#1e1b4b');
        rGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = rGrad;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        drawRoundedBox(ctx, px, 16, panelW, H - 32, 12);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = '#38bdf8';
        ctx.font = '900 12px monospace';
        ctx.fillText('🎛️ WHITE-KEY FLIPPERS', px + 12, 42);

        ctx.font = '800 11px monospace';
        ctx.fillStyle = '#f472b6';
        ctx.fillText(`OUTER L: ${lowOuterNote.toUpperCase()}`, px + 12, 70);
        ctx.fillText(`OUTER R: ${highOuterNote.toUpperCase()}`, px + 12, 90);

        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`INNER L: ${lowInnerNote.toUpperCase()}`, px + 12, 118);
        ctx.fillText(`INNER R: ${highInnerNote.toUpperCase()}`, px + 12, 138);

        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('SPRING: Hold Mid Key', px + 12, 168);
        ctx.fillText('MULTIBALL: Match Notes', px + 12, 186);
    }
}
