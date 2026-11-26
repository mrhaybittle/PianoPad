// js/games/chordBowl.js
// 3D perspective 10-pin MIDI bowling game following conventional 10-frame bowling rules.
// Extra modules live in js/games/chordBowl/.

import { initAudio, playTone } from '../audio.js';
import { getNoteFrequency } from '../musicTheory.js';
import { CHORD_BOWL_THEMES, BALL_WEIGHTS, PENTATONIC_SCALES, SPARE_CALLS } from './chordBowl/chordBowlAssets.js';
import {
    createTenPins,
    stepBallAndPins,
    arePinsSettled,
    countStandingPins,
    getStandingPinIndices,
    computeAimXFromMidiNote
} from './chordBowl/chordBowlPhysics.js';
import {
    playPinHitTone,
    playChainHarmony,
    playGrooveBoostSound,
    playGutterTone,
    playStrikeOrSpareFanfare
} from './chordBowl/chordBowlAudio.js';

const TOTAL_FRAMES = 10;
const BPM = 108;
const BEAT_MS = 60000 / BPM;
const GROOVE_WINDOW_MS = 145;

let bridgeRef = null;
let rafId = null;
let lastFrameMs = 0;
let midiListenerAttached = false;
let activeMidiInputs = [];

let game = null;

function createInitialGameState() {
    const theme = CHORD_BOWL_THEMES.classicPro;
    const scaleNotes = PENTATONIC_SCALES.cMajorPentatonic;
    return {
        themeKey: 'classicPro',
        theme,
        scaleKey: 'cMajorPentatonic',
        scaleNotes,
        ballWeightKey: 'standard',
        ballWeight: BALL_WEIGHTS.standard,

        frame: 1,
        ballInFrame: 1,     // Ball 1 or Ball 2 (up to Ball 3 in Frame 10)
        tenthFrameBalls: [],
        frames: Array.from({ length: TOTAL_FRAMES }, (_, idx) => ({
            frameNumber: idx + 1,
            balls: [],
            score: null,
            isStrike: false,
            isSpare: false
        })),
        totalScore: 0,

        // 'aiming' | 'rolling' | 'settling' | 'betweenBalls' | 'frameComplete' | 'gameOver'
        phase: 'aiming',
        phaseTimerMs: 0,

        aimNormalized: 0,
        targetKeyNote: 'c2',
        heldNotes: new Set(),
        primaryRollNote: null,
        pitchBendNorm: 0,
        modWheelNorm: 0,
        secondNoteSpin: 0,
        pocketLocked: false,
        highlightedSparePin: null,
        bannerMessage: 'Ball 1 of 2 — Play a MIDI note to aim & bowl',

        beatClockMs: 0,
        groovePulse: 0,
        lastGrooveBoost: false,

        pins: createTenPins(scaleNotes),
        ball: {
            active: false,
            x: 0,
            z: 0,
            vx: 0,
            vz: 0,
            radius: 0.062,
            rollRotation: 0,
            spin: 0,
            hookCurve: 0,
            carryBonus: 1.0,
            mass: 1.0,
            trail: [],
            inGutter: false
        },
        particles3D: []
    };
}

export function startChordBowl(bridge) {
    bridgeRef = bridge;
    initAudio();

    // Close the mini-games hub so the 3D lane has full focus
    const arcadeHub = document.getElementById('arcade-hub');
    if (arcadeHub) arcadeHub.classList.remove('open');

    if (bridgeRef?.resetGameStats) bridgeRef.resetGameStats();
    if (bridgeRef?.setActiveMiniGame) bridgeRef.setActiveMiniGame('chordBowl');

    game = createInitialGameState();
    attachDirectMidiListeners();
    updateStatusBar();

    lastFrameMs = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
}

export function stopChordBowl() {
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    detachDirectMidiListeners();
    game = null;
}

function getCanvasAndContext() {
    const canvas = document.getElementById('waterfall-canvas');
    if (!canvas) return { canvas: null, ctx: null };
    return { canvas, ctx: canvas.getContext('2d') };
}

// 3D Perspective Camera & Projection (z: 0 = foul line near camera, z: 1 = pin deck far)
function getCamera3D(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    return {
        w,
        h,
        horizonY: h * 0.16,
        foulY: h * 0.90,
        nearHalfWidth: w * 0.36,
        farHalfWidth: w * 0.125,
        centerX: w * 0.5
    };
}

function project3D(xNorm, zNorm, yHeightNorm, cam) {
    // Perspective factor t: 0 at foul line (z=0), 1 at deck end (z=1)
    const t = Math.max(0, Math.min(1.12, zNorm));
    const persp = Math.pow(0.36, t); // shrinks smoothly into depth
    const halfW = cam.nearHalfWidth + (cam.farHalfWidth - cam.nearHalfWidth) * t;
    const baseY = cam.foulY + (cam.horizonY - cam.foulY) * t;
    const screenX = cam.centerX + xNorm * halfW;
    const screenY = baseY - yHeightNorm * (cam.foulY - cam.horizonY) * 0.42 * persp;
    return { x: screenX, y: screenY, scale: persp };
}

function attachDirectMidiListeners() {
    if (midiListenerAttached || !navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess().then((access) => {
        activeMidiInputs = Array.from(access.inputs.values());
        activeMidiInputs.forEach((input) => {
            input.addEventListener('midimessage', onRawMidiMessage);
        });
        midiListenerAttached = true;
    }).catch(() => {});
}

function detachDirectMidiListeners() {
    activeMidiInputs.forEach((input) => {
        input.removeEventListener('midimessage', onRawMidiMessage);
    });
    activeMidiInputs = [];
    midiListenerAttached = false;
}

function onRawMidiMessage(event) {
    if (!game || bridgeRef?.getActiveMiniGame?.() !== 'chordBowl') return;
    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0];
    const cmd = status & 0xf0;
    const d1 = data[1];
    const d2 = data.length > 2 ? data[2] : 0;

    if (cmd === 0xe0) {
        const bend14 = ((d2 & 0x7f) << 7) | (d1 & 0x7f);
        game.pitchBendNorm = Math.max(-1, Math.min(1, (bend14 - 8192) / 8192));
        if (game.ball.active) {
            game.ball.spin += game.pitchBendNorm * 0.06;
        } else {
            game.aimNormalized = Math.max(-0.88, Math.min(0.88, game.aimNormalized + game.pitchBendNorm * 0.06));
        }
    }

    if (cmd === 0xb0) {
        if (d1 === 1) {
            game.modWheelNorm = Math.max(0, Math.min(1, d2 / 127));
            game.bannerMessage = `Oil Hook Dialed: ${Math.round(game.modWheelNorm * 100)}%`;
        } else if (d1 === 64 && d2 >= 64) {
            game.pocketLocked = true;
            game.bannerMessage = 'Sustain Pocket Lock Armed!';
        }
    }
}

export function handleChordBowlInput(noteStr, velocity = 84) {
    if (!game) return;
    const normNote = String(noteStr || '').toLowerCase().trim();
    if (!normNote) return;

    const freq = getNoteFrequency(normNote);
    if (freq) {
        playTone(freq, 0.22, 0.28);
    }

    const wasEmpty = game.heldNotes.size === 0;
    game.heldNotes.add(normNote);

    if (game.heldNotes.size >= 2) {
        const chordResult = evaluateHeldChord(Array.from(game.heldNotes));
        if (chordResult) {
            applyChordCall(chordResult);
            return;
        }
    }

    if (game.phase === 'rolling' && game.ball.active && !wasEmpty) {
        const spinDir = getNoteSemitoneIndex(normNote) >= getNoteSemitoneIndex(game.primaryRollNote) ? 1 : -1;
        game.secondNoteSpin = spinDir;
        game.ball.spin += spinDir * 0.32;
        game.bannerMessage = spinDir > 0
            ? 'Sharp Note Held: Clockwise Hook!'
            : 'Flat Note Held: Counter-Clockwise Spin!';
        updateStatusBar();
        return;
    }

    if (game.phase !== 'aiming') return;

    game.targetKeyNote = normNote;
    game.primaryRollNote = normNote;
    game.aimNormalized = computeAimXFromMidiNote(normNote);
    if (game.pocketLocked) {
        game.aimNormalized *= 0.25;
    }

    if (bridgeRef?.highlightKey) {
        bridgeRef.highlightKey(normNote, 260, game.theme.accent);
    }

    launchBall(velocity);
}

export function handleChordBowlRelease(noteStr) {
    if (!game) return;
    const normNote = String(noteStr || '').toLowerCase().trim();
    game.heldNotes.delete(normNote);
    if (game.heldNotes.size === 0) {
        game.secondNoteSpin = 0;
    }
}

function getNoteSemitoneIndex(noteStr) {
    const m = String(noteStr).toLowerCase().match(/^([a-g])(#|b)?(\d+)$/);
    if (!m) return 60;
    const baseMap = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
    let semi = baseMap[m[1]];
    if (m[2] === '#') semi += 1;
    if (m[2] === 'b') semi -= 1;
    return (parseInt(m[3], 10) + 1) * 12 + semi;
}

function evaluateHeldChord(notes) {
    if (notes.length < 2) return null;
    const semis = notes.map(getNoteSemitoneIndex).sort((a, b) => a - b);
    const span = semis[semis.length - 1] - semis[0];

    if (span === 12 || span === 24) {
        return { type: 'cycleWeight' };
    }
    if (notes.length >= 3 && span >= 6 && span <= 9) {
        return { type: 'pocketLock' };
    }
    if (game.ballInFrame > 1 || game.frame === TOTAL_FRAMES) {
        return { type: 'spareHint' };
    }
    return null;
}

function applyChordCall(result) {
    if (!game) return;

    if (result.type === 'cycleWeight') {
        const keys = Object.keys(BALL_WEIGHTS);
        const nextIdx = (keys.indexOf(game.ballWeightKey) + 1) % keys.length;
        game.ballWeightKey = keys[nextIdx];
        game.ballWeight = BALL_WEIGHTS[game.ballWeightKey];
        game.bannerMessage = `Octave Chord: Ball Weight -> ${game.ballWeight.label}`;
    } else if (result.type === 'pocketLock') {
        game.pocketLocked = !game.pocketLocked;
        game.bannerMessage = game.pocketLocked
            ? 'Triad Chord: 1-3 Pocket Lock ON!'
            : 'Triad Chord: Pocket Lock OFF';
    } else if (result.type === 'spareHint') {
        const standing = getStandingPinIndices(game.pins);
        if (standing.length > 0) {
            const targetPinIdx = standing[0];
            const pin = game.pins[targetPinIdx];
            const sparePreset = SPARE_CALLS[`${targetPinIdx + 1}-pin`];
            const suggestedNote = sparePreset?.keyNote || game.scaleNotes[targetPinIdx % game.scaleNotes.length] || 'c2';
            game.highlightedSparePin = targetPinIdx;
            game.aimNormalized = Math.max(-0.82, Math.min(0.82, pin.x * 0.95));
            game.bannerMessage = `Spare Pick: Aim for Pin #${targetPinIdx + 1} (${suggestedNote.toUpperCase()})`;
            if (bridgeRef?.highlightKey) {
                bridgeRef.highlightKey(suggestedNote, 600, '#facc15');
            }
        }
    }
    updateStatusBar();
}

function isOnGrooveBeat() {
    if (!game) return false;
    const phaseInBeat = game.beatClockMs % BEAT_MS;
    const distFromBeat = Math.min(phaseInBeat, BEAT_MS - phaseInBeat);
    return distFromBeat <= GROOVE_WINDOW_MS;
}

function launchBall(rawVelocity = 84) {
    if (!game) return;
    const velNorm = Math.max(0.08, Math.min(1, rawVelocity / 127));

    // z speed (0 -> 1 down the 3D lane)
    const zSpeed = (0.58 + velNorm * 0.78) * game.ballWeight.speedMultiplier;
    const baseHook = ((1 - velNorm) * 0.55 + game.modWheelNorm * 0.65) * game.ballWeight.hookMultiplier;
    const grooveBoost = isOnGrooveBeat();

    game.lastGrooveBoost = grooveBoost;
    if (grooveBoost) {
        playGrooveBoostSound();
        spawnBurst3D(game.aimNormalized, 0.04, '#facc15', 16);
    }

    const hookSign = game.aimNormalized <= 0 ? 1 : -1;

    game.ball = {
        active: true,
        x: game.aimNormalized,
        z: 0.02,
        vx: -game.aimNormalized * 0.08,
        vz: zSpeed,
        radius: 0.062 * game.ballWeight.radiusMultiplier,
        rollRotation: 0,
        spin: hookSign * baseHook * 0.45,
        hookCurve: hookSign * baseHook,
        carryBonus: grooveBoost ? 1.28 : 1.0,
        mass: game.ballWeight.mass,
        trail: [],
        inGutter: false
    };

    game.phase = 'rolling';
    game.bannerMessage = grooveBoost
        ? 'GROOVE BOOST! Extra pin-carry & rich synth!'
        : `Ball ${game.ballInFrame} rolling (${Math.round(velNorm * 100)}% power)`;
    updateStatusBar();
}

function spawnBurst3D(xNorm, zNorm, color, count = 10) {
    if (!game) return;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = 0.25 + Math.random() * 0.65;
        game.particles3D.push({
            x: xNorm,
            z: zNorm,
            y: 0.04 + Math.random() * 0.06,
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed,
            vy: 0.25 + Math.random() * 0.35,
            life: 1,
            color
        });
    }
}

function loop(nowMs) {
    if (!game) return;
    const dtSec = Math.min(0.05, Math.max(0.001, (nowMs - lastFrameMs) / 1000));
    const dtMs = dtSec * 1000;
    lastFrameMs = nowMs;

    game.beatClockMs += dtMs;
    const beatPhase = (game.beatClockMs % BEAT_MS) / BEAT_MS;
    game.groovePulse = beatPhase < 0.25 ? 1 - beatPhase * 4 : 0;

    const { canvas, ctx } = getCanvasAndContext();
    if (!canvas || !ctx) {
        rafId = requestAnimationFrame(loop);
        return;
    }

    const cam = getCamera3D(canvas);

    if (game.phase === 'rolling') {
        const events = stepBallAndPins(game.ball, game.pins, dtSec);
        handlePhysicsEvents(events);
        if (!game.ball.active) {
            game.phase = 'settling';
            game.phaseTimerMs = 900;
        }
    } else if (game.phase === 'settling') {
        const events = stepBallAndPins(game.ball, game.pins, dtSec);
        handlePhysicsEvents(events);
        game.phaseTimerMs -= dtMs;
        if (game.phaseTimerMs <= 0 || arePinsSettled(game.pins)) {
            resolveConventionalBallOutcome();
        }
    } else if (game.phase === 'betweenBalls' || game.phase === 'frameComplete') {
        stepBallAndPins(game.ball, game.pins, dtSec);
        game.phaseTimerMs -= dtMs;
        if (game.phaseTimerMs <= 0) {
            if (game.phase === 'betweenBalls') {
                prepareBall2();
            } else {
                advanceToNextFrame();
            }
        }
    }

    updateParticles3D(dtSec);
    render3DScene(ctx, canvas, cam);

    rafId = requestAnimationFrame(loop);
}

function handlePhysicsEvents(events) {
    if (!game || !events || events.length === 0) return;
    const chainNotes = [];

    for (const ev of events) {
        if (ev.type === 'gutter') {
            playGutterTone();
            game.bannerMessage = 'Gutter ball! Try Pitch Bend or softer hook.';
        } else if (ev.type === 'pinHit') {
            const note = ev.pin.note || game.scaleNotes[ev.pin.index % game.scaleNotes.length] || 'c2';
            playPinHitTone(note, ev.intensity, game.lastGrooveBoost);
            spawnBurst3D(ev.pin.x, ev.pin.z, game.theme.pinToppleGlow, 7);
            if (bridgeRef?.highlightKey) {
                bridgeRef.highlightKey(note, 220, '#38bdf8');
            }
            if (ev.isChain) {
                chainNotes.push(note);
            }
        }
    }

    if (chainNotes.length > 0) {
        playChainHarmony(chainNotes, game.lastGrooveBoost);
    }
}

function updateParticles3D(dtSec) {
    if (!game) return;
    for (let i = game.particles3D.length - 1; i >= 0; i--) {
        const p = game.particles3D[i];
        p.x += p.vx * dtSec;
        p.z += p.vz * dtSec;
        p.y += p.vy * dtSec;
        p.vy -= 1.1 * dtSec;
        p.life -= dtSec * 1.9;
        if (p.life <= 0) game.particles3D.splice(i, 1);
    }
}

// Conventional 10-pin bowling rules:
// - Frames 1..9: Up to 2 balls per frame; strike on ball 1 ends frame; after ball 2 (or strike), pins refresh for next frame.
// - Frame 10: Up to 3 balls; pins refresh if all 10 are knocked down on ball 1 or ball 2.
function resolveConventionalBallOutcome() {
    if (!game) return;

    const knockedNow = game.pins.filter(p => p.down && !p.wasDownBeforeRoll).length;
    game.pins.forEach(p => {
        if (p.down) p.wasDownBeforeRoll = true;
    });

    const standingCount = countStandingPins(game.pins);
    const frameObj = game.frames[game.frame - 1];

    if (bridgeRef?.getState) {
        const st = bridgeRef.getState();
        if (st?.gameStats) {
            st.gameStats.perfect += knockedNow;
        }
    }

    if (game.frame < TOTAL_FRAMES) {
        frameObj.balls.push(knockedNow);

        if (game.ballInFrame === 1 && standingCount === 0) {
            frameObj.isStrike = true;
            game.bannerMessage = `STRIKE! Frame ${game.frame} complete — refreshing pins...`;
            playStrikeOrSpareFanfare(true, game.scaleNotes);
            if (bridgeRef?.spawnConfetti) {
                const { canvas } = getCanvasAndContext();
                if (canvas) bridgeRef.spawnConfetti(canvas.width / 2, canvas.height * 0.35, '#facc15');
            }
            game.phase = 'frameComplete';
            game.phaseTimerMs = 1450;
        } else if (game.ballInFrame === 1 && standingCount > 0) {
            game.bannerMessage = `Ball 1 knocked ${knockedNow} (${standingCount} standing). Ball 2 coming up...`;
            game.phase = 'betweenBalls';
            game.phaseTimerMs = 1100;
        } else {
            // Ball 2 finished: refresh pins for next frame regardless
            if (standingCount === 0) {
                frameObj.isSpare = true;
                game.bannerMessage = `SPARE! Frame ${game.frame} complete — refreshing pins...`;
                playStrikeOrSpareFanfare(false, game.scaleNotes);
            } else {
                game.bannerMessage = `Frame ${game.frame} finished (${knockedNow} on Ball 2) — refreshing pins...`;
            }
            game.phase = 'frameComplete';
            game.phaseTimerMs = 1350;
        }
    } else {
        // 10th Frame
        frameObj.balls.push(knockedNow);
        game.tenthFrameBalls.push(knockedNow);

        const totalBallsThrown = game.tenthFrameBalls.length;
        const firstBall = game.tenthFrameBalls[0] ?? 0;
        const secondBall = game.tenthFrameBalls[1] ?? 0;

        if (standingCount === 0) {
            playStrikeOrSpareFanfare(true, game.scaleNotes);
            if (totalBallsThrown < 3) {
                game.pins = createTenPins(game.scaleNotes);
                game.ballInFrame = totalBallsThrown + 1;
                game.phase = 'aiming';
                game.bannerMessage = `10th Frame: Pins refreshed! Ball ${game.ballInFrame} of 3.`;
            } else {
                finishGame();
            }
        } else if (totalBallsThrown === 1) {
            game.ballInFrame = 2;
            game.phase = 'aiming';
            game.bannerMessage = `10th Frame Ball 2 of 2 (${standingCount} pin(s) standing).`;
        } else if (totalBallsThrown === 2 && (firstBall === 10 || firstBall + secondBall === 10)) {
            game.ballInFrame = 3;
            game.phase = 'aiming';
            game.bannerMessage = `10th Frame Bonus Ball 3 of 3 (${standingCount} pin(s) standing).`;
        } else {
            finishGame();
        }
    }

    recomputeScores();
    updateStatusBar();
}

function prepareBall2() {
    if (!game) return;
    game.ballInFrame = 2;
    game.ball.active = false;
    game.ball.trail = [];
    game.phase = 'aiming';
    game.bannerMessage = `Ball 2 of 2 — ${countStandingPins(game.pins)} pin(s) left. Pick your spare!`;
    updateStatusBar();
}

function advanceToNextFrame() {
    if (!game) return;
    if (game.frame >= TOTAL_FRAMES) {
        finishGame();
        return;
    }

    // Refresh full 10-pin rack for the new frame
    game.frame += 1;
    game.ballInFrame = 1;
    game.pocketLocked = false;
    game.highlightedSparePin = null;
    game.ball.active = false;
    game.ball.trail = [];
    game.pins = createTenPins(game.scaleNotes);
    game.phase = 'aiming';
    game.bannerMessage = `Frame ${game.frame}/${TOTAL_FRAMES} — Pins refreshed! Ball 1 of 2.`;
    updateStatusBar();
}

function recomputeScores() {
    if (!game) return;
    const flatRolls = [];

    for (let f = 0; f < TOTAL_FRAMES - 1; f++) {
        const b = game.frames[f].balls;
        if (b.length === 1 && b[0] === 10) {
            flatRolls.push(10);
        } else {
            b.forEach(v => flatRolls.push(v));
        }
    }
    game.tenthFrameBalls.forEach(v => flatRolls.push(v));

    let running = 0;
    let cursor = 0;

    for (let f = 0; f < TOTAL_FRAMES; f++) {
        const fr = game.frames[f];
        if (f < TOTAL_FRAMES - 1) {
            if (fr.balls.length === 0) {
                fr.score = null;
                continue;
            }
            if (fr.isStrike) {
                const n1 = flatRolls[cursor + 1] ?? 0;
                const n2 = flatRolls[cursor + 2] ?? 0;
                running += 10 + n1 + n2;
                fr.score = running;
                cursor += 1;
            } else if (fr.balls.length === 2) {
                const sumTwo = fr.balls[0] + fr.balls[1];
                if (sumTwo === 10) {
                    const bonus = flatRolls[cursor + 2] ?? 0;
                    running += 10 + bonus;
                } else {
                    running += sumTwo;
                }
                fr.score = running;
                cursor += 2;
            } else {
                fr.score = null;
            }
        } else if (game.tenthFrameBalls.length > 0) {
            fr.score = running + game.tenthFrameBalls.reduce((a, b) => a + b, 0);
        }
    }

    const lastScored = [...game.frames].reverse().find(f => f.score !== null);
    game.totalScore = lastScored ? lastScored.score : 0;
}

function finishGame() {
    if (!game) return;
    recomputeScores();
    game.phase = 'gameOver';
    const finalScore = game.totalScore;

    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    detachDirectMidiListeners();

    if (bridgeRef?.finishCustomMiniGame) {
        bridgeRef.finishCustomMiniGame(
            'ChordBowl',
            finalScore,
            `Final 10-Frame Score: <span style="color:#22c55e; font-size:1.35rem; font-weight:900;">${finalScore}</span> / 300`,
            () => startChordBowl(bridgeRef)
        );
    }
}

function updateStatusBar() {
    const statusEl = document.getElementById('status');
    if (!statusEl || !game) return;
    statusEl.textContent = `🎳 ChordBowl 3D | Frame ${game.frame}/${TOTAL_FRAMES} (Ball ${game.ballInFrame}) | Score: ${game.totalScore} | ${game.bannerMessage}`;
}

// --- 3D RENDERING (No Bowler/Person; Perspective Lane, Gutters, 3D Pins & 3D Ball) ---
function render3DScene(ctx, canvas, cam) {
    const { theme } = game;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sky / Alley backdrop
    const skyGrad = ctx.createLinearGradient(0, 0, 0, cam.horizonY + 20);
    skyGrad.addColorStop(0, theme.skyTop);
    skyGrad.addColorStop(1, theme.skyHorizon);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Alley side walls
    ctx.fillStyle = theme.sideWall;
    ctx.fillRect(0, cam.horizonY, canvas.width, canvas.height - cam.horizonY);

    // Trapezoid gutters (outer edges)
    const nearLeft = cam.centerX - cam.nearHalfWidth;
    const nearRight = cam.centerX + cam.nearHalfWidth;
    const farLeft = cam.centerX - cam.farHalfWidth;
    const farRight = cam.centerX + cam.farHalfWidth;

    const gutterFrac = 0.11;
    const nearPlayL = nearLeft + (nearRight - nearLeft) * gutterFrac;
    const nearPlayR = nearRight - (nearRight - nearLeft) * gutterFrac;
    const farPlayL = farLeft + (farRight - farLeft) * gutterFrac;
    const farPlayR = farRight - (farRight - farLeft) * gutterFrac;

    // Left & right gutters
    ctx.fillStyle = theme.gutter;
    ctx.beginPath();
    ctx.moveTo(nearLeft, cam.foulY);
    ctx.lineTo(nearPlayL, cam.foulY);
    ctx.lineTo(farPlayL, cam.horizonY);
    ctx.lineTo(farLeft, cam.horizonY);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(nearPlayR, cam.foulY);
    ctx.lineTo(nearRight, cam.foulY);
    ctx.lineTo(farRight, cam.horizonY);
    ctx.lineTo(farPlayR, cam.horizonY);
    ctx.closePath();
    ctx.fill();

    // 3D Lane surface trapezoid with perspective planks
    const laneGrad = ctx.createLinearGradient(0, cam.horizonY, 0, cam.foulY);
    laneGrad.addColorStop(0, theme.laneWoodDark);
    laneGrad.addColorStop(1, theme.laneWoodLight);
    ctx.fillStyle = laneGrad;
    ctx.beginPath();
    ctx.moveTo(nearPlayL, cam.foulY);
    ctx.lineTo(nearPlayR, cam.foulY);
    ctx.lineTo(farPlayR, cam.horizonY);
    ctx.lineTo(farPlayL, cam.horizonY);
    ctx.closePath();
    ctx.fill();

    // Perspective wood boards
    const planks = 10;
    for (let i = 1; i < planks; i++) {
        const f = i / planks;
        const xBottom = nearPlayL + (nearPlayR - nearPlayL) * f;
        const xTop = farPlayL + (farPlayR - farPlayL) * f;
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.14)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(xBottom, cam.foulY);
        ctx.lineTo(xTop, cam.horizonY);
        ctx.stroke();
    }

    // Approach range arrows in 3D perspective
    ctx.fillStyle = theme.arrow;
    for (let a = -3; a <= 3; a++) {
        const xNorm = a * 0.16;
        const zArrow = 0.42;
        const p1 = project3D(xNorm, zArrow + 0.045, 0, cam);
        const p2 = project3D(xNorm - 0.03, zArrow, 0, cam);
        const p3 = project3D(xNorm + 0.03, zArrow, 0, cam);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();
    }

    // Foul line
    ctx.strokeStyle = theme.foulLine;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nearLeft, cam.foulY);
    ctx.lineTo(nearRight, cam.foulY);
    ctx.stroke();

    // Aiming laser/guide in 3D
    if (game.phase === 'aiming') {
        const startPt = project3D(game.aimNormalized, 0.02, 0.01, cam);
        const endPt = project3D(game.aimNormalized * 0.72, 0.88, 0.01, cam);
        ctx.save();
        ctx.setLineDash([7, 7]);
        ctx.strokeStyle = game.pocketLocked ? '#22c55e' : theme.accent;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(startPt.x, startPt.y);
        ctx.lineTo(endPt.x, endPt.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = game.pocketLocked ? '#22c55e' : theme.accent;
        ctx.beginPath();
        ctx.arc(startPt.x, startPt.y, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(game.targetKeyNote.toUpperCase(), startPt.x, startPt.y + 18);
        ctx.restore();
    }

    // Depth-sort 3D objects (pins + ball) from farthest (largest z) to nearest (smallest z)
    const renderables = [];
    for (const pin of game.pins) {
        renderables.push({ kind: 'pin', z: pin.z, pin });
    }
    if (game.ball.active || game.phase === 'settling' || game.phase === 'aiming') {
        const b = game.ball.active || game.phase === 'settling'
            ? game.ball
            : { ...game.ball, x: game.aimNormalized, z: 0.03, radius: 0.062 * game.ballWeight.radiusMultiplier };
        renderables.push({ kind: 'ball', z: b.z, ball: b });
    }
    renderables.sort((a, b) => b.z - a.z);

    for (const item of renderables) {
        if (item.kind === 'pin') {
            draw3DPin(ctx, item.pin, cam, theme, game.highlightedSparePin);
        } else {
            draw3DBall(ctx, item.ball, cam, theme);
        }
    }

    // 3D particles
    for (const p of game.particles3D) {
        const pt = project3D(p.x, p.z, p.y, cam);
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(2, 5 * pt.scale), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    draw3DHUD(ctx, canvas, game);
}

function draw3DPin(ctx, pin, cam, theme, spareHintIdx) {
    const base = project3D(pin.x, pin.z, 0, cam);
    const pinHeight = 46 * base.scale;
    const pinHalfW = 11.5 * base.scale;

    // Ground shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, pinHalfW * 1.15, Math.max(2, 4.2 * base.scale), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(base.x, base.y);

    if (spareHintIdx === pin.index && !pin.down) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, pinHalfW * 1.65, Math.max(4, 6.5 * base.scale), 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Topple lean in 3D screen space
    const leanX = pin.tiltDirX * Math.sin(pin.tilt) * pinHeight * 0.9;
    const uprightFactor = Math.cos(pin.tilt);
    const tipY = -Math.max(4, pinHeight * Math.max(0.12, uprightFactor)) + Math.sin(pin.tilt) * (pin.tiltDirZ < 0 ? -6 : 6) * base.scale;

    // Pin silhouette (3D shaded bottle profile)
    const bodyGrad = ctx.createLinearGradient(-pinHalfW, 0, pinHalfW, 0);
    bodyGrad.addColorStop(0, pin.down ? '#64748b' : theme.pinShadow);
    bodyGrad.addColorStop(0.45, pin.down ? '#94a3b8' : theme.pinBody);
    bodyGrad.addColorStop(1, pin.down ? '#475569' : '#cbd5e1');

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-pinHalfW * 0.72, 0);
    ctx.quadraticCurveTo(-pinHalfW * 1.15, tipY * 0.45, -pinHalfW * 0.42 + leanX * 0.65, tipY * 0.72);
    ctx.lineTo(-pinHalfW * 0.58 + leanX, tipY);
    ctx.quadraticCurveTo(leanX, tipY - 5 * base.scale, pinHalfW * 0.58 + leanX, tipY);
    ctx.lineTo(pinHalfW * 0.42 + leanX * 0.65, tipY * 0.72);
    ctx.quadraticCurveTo(pinHalfW * 1.15, tipY * 0.45, pinHalfW * 0.72, 0);
    ctx.closePath();
    ctx.fill();

    // Red neck stripe
    ctx.strokeStyle = theme.pinStripe;
    ctx.lineWidth = Math.max(1.5, 3 * base.scale);
    ctx.beginPath();
    ctx.moveTo(-pinHalfW * 0.55 + leanX * 0.68, tipY * 0.74);
    ctx.lineTo(pinHalfW * 0.55 + leanX * 0.68, tipY * 0.74);
    ctx.stroke();

    // Pentatonic note label on pin
    if (base.scale > 0.42) {
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.max(8, Math.round(9 * base.scale))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((pin.note || '').replace(/\d+$/, '').toUpperCase(), leanX * 0.35, tipY * 0.42);
    }

    ctx.restore();
}

function draw3DBall(ctx, ball, cam, theme) {
    // Trail along 3D lane
    for (let i = 0; i < ball.trail.length; i++) {
        const pt = project3D(ball.trail[i].x, ball.trail[i].z, 0.02, cam);
        const ratio = (i + 1) / ball.trail.length;
        ctx.save();
        ctx.globalAlpha = ratio * 0.25;
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(2, 16 * pt.scale * ratio), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    const rNorm = ball.radius * 0.85;
    const center = project3D(ball.x, ball.z, rNorm, cam);
    const ground = project3D(ball.x, ball.z, 0, cam);
    const radiusPx = Math.max(5, 22 * center.scale);

    // Shadow on lane
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, radiusPx * 1.05, radiusPx * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Shaded 3D sphere
    ctx.save();
    const grad = ctx.createRadialGradient(
        center.x - radiusPx * 0.32,
        center.y - radiusPx * 0.32,
        radiusPx * 0.12,
        center.x,
        center.y,
        radiusPx
    );
    grad.addColorStop(0, '#93c5fd');
    grad.addColorStop(0.35, ball.inGutter ? '#475569' : theme.ballPrimary);
    grad.addColorStop(1, ball.inGutter ? '#1e293b' : theme.ballSecondary);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();

    // Rotating finger holes
    const rot = ball.rollRotation;
    ctx.fillStyle = theme.ballHole;
    for (let h = 0; h < 3; h++) {
        const a = rot + h * 2.09;
        const hx = center.x + Math.cos(a) * radiusPx * 0.34;
        const hy = center.y + Math.sin(a) * radiusPx * 0.28;
        ctx.beginPath();
        ctx.arc(hx, hy, Math.max(1.3, radiusPx * 0.13), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}


// --- CONVENTIONAL 10-FRAME BOWLING SCOREBOARD RENDERER ---
function formatFrameMarks(frameObj, isTenthFrame, tenthBalls) {
    if (isTenthFrame) {
        if (!tenthBalls || tenthBalls.length === 0) return ['', '', ''];
        const marks = [];
        let rack = 10;
        let frameRollInRack = 0;

        for (let i = 0; i < tenthBalls.length; i++) {
            const pins = tenthBalls[i];
            frameRollInRack += 1;

            if (pins === 10 && frameRollInRack === 1) {
                marks.push('X');
                rack = 10;
                frameRollInRack = 0;
            } else if (pins === rack && frameRollInRack === 2) {
                marks.push('/');
                rack = 10;
                frameRollInRack = 0;
            } else if (pins === 0) {
                marks.push('-');
                rack = Math.max(1, rack - pins);
            } else {
                marks.push(String(pins));
                rack = Math.max(1, rack - pins);
            }
        }
        while (marks.length < 3) marks.push('');
        return marks.slice(0, 3);
    }

    const balls = frameObj?.balls || [];
    if (balls.length === 0) return ['', ''];
    if (frameObj.isStrike) return ['', 'X'];
    if (balls.length === 1) {
        return [balls[0] === 0 ? '-' : String(balls[0]), ''];
    }
    if (frameObj.isSpare) {
        const b1 = balls[0] === 0 ? '-' : String(balls[0]);
        return [b1, '/'];
    }
    return [
        balls[0] === 0 ? '-' : String(balls[0]),
        balls[1] === 0 ? '-' : String(balls[1])
    ];
}

function drawConventionalScoreboard(ctx, canvas, state) {
    const marginX = 12;
    const topY = 8;
    const hudReserveRight = 64;
    const boardWidth = Math.max(420, canvas.width - marginX * 2 - hudReserveRight);
    const boardHeight = 62;
    const headerHeight = 16;
    const boxWidth = boardWidth / TOTAL_FRAMES;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.fillRect(marginX, topY, boardWidth, boardHeight);

    for (let i = 0; i < TOTAL_FRAMES; i++) {
        const fx = marginX + i * boxWidth;
        const fr = state.frames[i];
        const isCurrent = state.frame === i + 1 && state.phase !== 'gameOver';

        if (isCurrent) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
            ctx.fillRect(fx, topY, boxWidth, boardHeight);
        }

        // Frame border
        ctx.strokeStyle = isCurrent ? '#38bdf8' : 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = isCurrent ? 1.8 : 1;
        ctx.strokeRect(fx, topY, boxWidth, boardHeight);

        // Header row (Frame 1..10)
        ctx.fillStyle = isCurrent ? '#38bdf8' : '#cbd5e1';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), fx + boxWidth / 2, topY + headerHeight / 2);

        // Divider under header
        ctx.beginPath();
        ctx.moveTo(fx, topY + headerHeight);
        ctx.lineTo(fx + boxWidth, topY + headerHeight);
        ctx.stroke();

        // Roll mark boxes (upper right sub-cells)
        const isTenth = i === TOTAL_FRAMES - 1;
        const subCount = isTenth ? 3 : 2;
        const markBoxW = Math.min(18 * subCount, boxWidth * (isTenth ? 0.72 : 0.56));
        const markBoxH = 18;
        const markStartX = fx + boxWidth - markBoxW;
        const subW = markBoxW / subCount;

        for (let s = 0; s < subCount; s++) {
            const sx = markStartX + s * subW;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
            ctx.lineWidth = 0.9;
            ctx.strokeRect(sx, topY + headerHeight, subW, markBoxH);
        }

        ctx.beginPath();
        ctx.moveTo(markStartX, topY + headerHeight + markBoxH);
        ctx.lineTo(fx + boxWidth, topY + headerHeight + markBoxH);
        ctx.stroke();

        const marks = formatFrameMarks(fr, isTenth, state.tenthFrameBalls);
        for (let s = 0; s < subCount; s++) {
            const mark = marks[s];
            if (!mark) continue;
            const cx = markStartX + s * subW + subW / 2;
            const cy = topY + headerHeight + markBoxH / 2;
            ctx.fillStyle = mark === 'X' ? '#facc15' : mark === '/' ? '#22c55e' : '#f8fafc';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(mark, cx, cy + 0.5);
        }

        // Cumulative frame score in lower area
        if (fr && fr.score !== null && fr.score !== undefined) {
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(
                String(fr.score),
                fx + boxWidth / 2,
                topY + headerHeight + markBoxH + (boardHeight - headerHeight - markBoxH) / 2
            );
        }
    }

    ctx.restore();
}

function draw3DHUD(ctx, canvas, state) {
    // Full conventional 10-frame bowling scorecard along top
    drawConventionalScoreboard(ctx, canvas, state);

    // Compact ball/hook/chord info badge below scorecard
    const badgeTop = 78;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(12, badgeTop, 285, 42);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.strokeRect(12, badgeTop, 285, 42);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
        `Ball ${state.ballInFrame} • ${state.ballWeight.label} • Hook ${Math.round(state.modWheelNorm * 100)}%`,
        20,
        badgeTop + 16
    );

    ctx.fillStyle = state.pocketLocked ? '#22c55e' : '#cbd5e1';
    ctx.fillText(
        state.pocketLocked ? 'Pocket Lock: ACTIVE' : 'Chord: Triad = Pocket Lock | Octave = Ball Weight',
        20,
        badgeTop + 32
    );
    ctx.restore();

    // Groove meter right side
    const barW = 18;
    const barH = 140;
    const x = canvas.width - 42;
    const y = canvas.height * 0.5 - barH / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(x - 6, y - 24, barW + 12, barH + 42);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BEAT', x + barW / 2, y - 8);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, barW, barH);

    const beatPhase = (state.beatClockMs % BEAT_MS) / BEAT_MS;
    const markerY = y + beatPhase * barH;

    ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
    ctx.fillRect(x, y, barW, 18);
    ctx.fillRect(x, y + barH - 18, barW, 18);

    ctx.fillStyle = isOnGrooveBeat() ? '#22c55e' : '#facc15';
    ctx.fillRect(x - 2, markerY - 4, barW + 4, 8);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '9px sans-serif';
    ctx.fillText('GROOVE', x + barW / 2, y + barH + 12);
    ctx.restore();
}

export function handleChordBowlKeyDown(e) {
    if (!game || game.phase !== 'aiming') return false;
    if (e.key === 'ArrowLeft') {
        game.aimNormalized = Math.max(-0.88, game.aimNormalized - 0.1);
        return true;
    }
    if (e.key === 'ArrowRight') {
        game.aimNormalized = Math.min(0.88, game.aimNormalized + 0.1);
        return true;
    }
    if (e.code === 'Enter') {
        launchBall(88);
        return true;
    }
    return false;
}
