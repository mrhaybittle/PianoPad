// js/games/chordBowl.js
// Main game controller for ChordBowl (10-pin MIDI bowling without character movement).

import { initAudio, playTone } from '../audio.js';
import { getNoteFrequency } from '../musicTheory.js';
import { CHORD_BOWL_THEMES, BALL_WEIGHTS, PENTATONIC_SCALES, SPARE_CALLS } from './chordBowlAssets.js';
import {
    createTenPins,
    stepBallAndPins,
    arePinsSettled,
    countStandingPins,
    getStandingPinIndices,
    computeAimXFromMidiNote
} from './chordBowlPhysics.js';
import {
    playPinHitTone,
    playChainHarmony,
    playGrooveBoostSound,
    playGutterTone,
    playStrikeOrSpareFanfare
} from './chordBowlAudio.js';

const TOTAL_FRAMES = 10;
const BPM = 108;
const BEAT_MS = 60000 / BPM;
const GROOVE_WINDOW_MS = 145; // +/- window around beat for Groove Boost

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
        rollInFrame: 1, // 1 or 2 (or up to 3 in 10th frame)
        tenthFrameRolls: [],
        frames: Array.from({ length: TOTAL_FRAMES }, (_, idx) => ({
            frameNumber: idx + 1,
            rolls: [],
            score: null,
            isStrike: false,
            isSpare: false
        })),
        totalScore: 0,

        // Phase: 'aiming' | 'rolling' | 'settling' | 'frameOver' | 'gameOver'
        phase: 'aiming',
        settleTimerMs: 0,
        frameOverTimerMs: 0,

        // Aim & MIDI controls
        aimNormalized: 0, // -1 (left gutter) to +1 (right gutter)
        targetKeyNote: 'c2',
        heldNotes: new Set(),
        primaryRollNote: null,
        pitchBendNorm: 0, // -1 to +1
        modWheelNorm: 0,  // 0 to 1
        secondNoteSpin: 0, // -1 (flat/CCW) to +1 (sharp/CW)
        pocketLocked: false,
        highlightedSparePin: null,
        bannerMessage: 'Play a MIDI note to aim & roll (Soft = Hook, Hard = Power)',

        // Rhythm / Groove meter
        beatClockMs: 0,
        groovePulse: 0,
        lastGrooveBoost: false,

        // Ball & Pins
        pins: createTenPins(scaleNotes),
        pinsAtRollStart: [],
        chainHitCounter: 0,
        ball: {
            active: false,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            radius: 14,
            spin: 0,
            hookCurve: 0,
            trail: [],
            inGutter: false
        },
        particles: []
    };
}

export function startChordBowl(bridge) {
    bridgeRef = bridge;
    if (bridgeRef?.exitActiveMiniGame) {
        // Avoid recursive stop if already clean
    }
    initAudio();
    if (bridgeRef?.resetGameStats) bridgeRef.resetGameStats();
    if (bridgeRef?.setActiveMiniGame) bridgeRef.setActiveMiniGame('chordBowl');

    game = createInitialGameState();
    game.pinsAtRollStart = snapshotPins(game.pins);

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

function snapshotPins(pins) {
    return pins.map(p => ({ ...p }));
}

function restorePins(snapshot) {
    return snapshot.map(p => ({ ...p }));
}

function getCanvasAndContext() {
    const canvas = document.getElementById('waterfall-canvas');
    if (!canvas) return { canvas: null, ctx: null };
    return { canvas, ctx: canvas.getContext('2d') };
}

function getLaneGeometry(canvas) {
    const laneWidth = Math.min(canvas.width * 0.56, 420);
    const gutterWidth = Math.max(20, laneWidth * 0.085);
    const laneLeft = (canvas.width - laneWidth) / 2;
    const laneRight = laneLeft + laneWidth;
    const foulLineY = canvas.height * 0.80;
    const pinDeckY = canvas.height * 0.22;
    return {
        laneLeft,
        laneRight,
        laneWidth,
        gutterWidth,
        playLeft: laneLeft + gutterWidth,
        playRight: laneRight - gutterWidth,
        foulLineY,
        pinDeckY
    };
}

// --- MIDI DIRECT LISTENERS (Pitch Bend, Mod Wheel, and Note Fallback) ---
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

    // Pitch Bend (0xE0): 14-bit value (0..16383, center 8192)
    if (cmd === 0xe0) {
        const bend14 = ((d2 & 0x7f) << 7) | (d1 & 0x7f);
        game.pitchBendNorm = Math.max(-1, Math.min(1, (bend14 - 8192) / 8192));
        if (game.ball.active) {
            game.ball.spin += game.pitchBendNorm * 0.045;
        } else {
            game.aimNormalized = Math.max(-1, Math.min(1, game.aimNormalized + game.pitchBendNorm * 0.06));
        }
    }

    // Control Change (0xB0): CC 1 = Mod Wheel (oil hook), CC 64 = Sustain (pocket lock)
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

// --- BRIDGE INPUT HANDLERS ---
export function handleChordBowlInput(noteStr, velocity = 84) {
    if (!game) return;
    const normNote = String(noteStr || '').toLowerCase().trim();
    if (!normNote) return;

    // Play reference tone softly if note is in musicTheory
    const freq = getNoteFrequency(normNote);
    if (freq) {
        playTone(freq, 0.22, 0.28);
    }

    const wasEmpty = game.heldNotes.size === 0;
    game.heldNotes.add(normNote);

    // Check chord triggers when 2+ notes are held
    if (game.heldNotes.size >= 2) {
        const chordResult = evaluateHeldChord(Array.from(game.heldNotes));
        if (chordResult) {
            applyChordCall(chordResult);
            return;
        }
    }

    // If ball is already rolling, holding a second note applies sharp (CW) or flat (CCW) spin
    if (game.phase === 'rolling' && game.ball.active && !wasEmpty) {
        const spinDir = getNoteSemitoneIndex(normNote) >= getNoteSemitoneIndex(game.primaryRollNote) ? 1 : -1;
        game.secondNoteSpin = spinDir;
        game.ball.spin += spinDir * 0.28;
        game.bannerMessage = spinDir > 0
            ? 'Sharp Note Held: Clockwise Hook Spin!'
            : 'Flat Note Held: Counter-Clockwise Spin!';
        updateStatusBar();
        return;
    }

    if (game.phase !== 'aiming') return;

    // Map note pitch across keyboard range to lane position (-1 to +1)
    game.targetKeyNote = normNote;
    game.primaryRollNote = normNote;
    game.aimNormalized = computeAimXFromMidiNote(normNote);
    if (game.pocketLocked) {
        game.aimNormalized *= 0.28; // Snap toward 1-3 pocket
    }

    if (bridgeRef?.highlightKey) {
        bridgeRef.highlightKey(normNote, 260, game.theme.accent);
    }

    launchRoll(velocity);
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

    // Octave jump (12 semitones) -> Cycle ball weight
    if (span === 12 || span === 24) {
        return { type: 'cycleWeight' };
    }

    // Major/minor triad shape (approx 6 to 9 semitones across 3 notes) -> Pocket Lock
    if (notes.length >= 3 && span >= 6 && span <= 9) {
        return { type: 'pocketLock' };
    }

    // Any 2-note interval during spare attempt -> Highlight spare conversion key
    if (game.rollInFrame > 1 || game.frame === TOTAL_FRAMES) {
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
            const suggestedNote = game.scaleNotes[targetPinIdx % game.scaleNotes.length] || 'c2';
            game.highlightedSparePin = targetPinIdx;
            game.aimNormalized = pin.nx * 0.85;
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

function launchRoll(rawVelocity = 84) {
    const { canvas } = getCanvasAndContext();
    if (!canvas || !game) return;

    const geom = getLaneGeometry(canvas);
    const velNorm = Math.max(0.08, Math.min(1, rawVelocity / 127));

    // Soft notes roll slower with stronger hook; hard notes roll faster with power
    const speedPxPerSec = (340 + velNorm * 520) * game.ballWeight.speedMultiplier;
    const baseHook = ((1 - velNorm) * 0.55 + game.modWheelNorm * 0.65) * game.ballWeight.hookMultiplier;

    const grooveBoost = isOnGrooveBeat();
    game.lastGrooveBoost = grooveBoost;
    if (grooveBoost) {
        playGrooveBoostSound();
        spawnBurst(canvas.width / 2, geom.foulLineY, '#facc15', 16);
    }

    const startX = geom.playLeft + ((game.aimNormalized + 1) / 2) * (geom.playRight - geom.playLeft);
    const hookSign = game.aimNormalized <= 0 ? 1 : -1;

    game.ball = {
        active: true,
        x: startX,
        y: geom.foulLineY,
        vx: -game.aimNormalized * 42,
        vy: -speedPxPerSec,
        radius: Math.max(10, Math.round(14 * game.ballWeight.radiusMultiplier)),
        spin: hookSign * baseHook * 0.45,
        hookCurve: hookSign * baseHook,
        carryBonus: grooveBoost ? 1.28 : 1.0,
        mass: game.ballWeight.mass,
        trail: [],
        inGutter: false
    };

    game.chainHitCounter = 0;
    game.phase = 'rolling';
    game.bannerMessage = grooveBoost
        ? 'GROOVE BOOST! Extra pin-carry & rich synth unlocked!'
        : `Rolling (${Math.round(velNorm * 100)}% power) — hold a 2nd note or Pitch Wheel to curve!`;
    updateStatusBar();
}

function spawnBurst(x, y, color, count = 10) {
    if (!game) return;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = 40 + Math.random() * 120;
        game.particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            color,
            size: 3 + Math.random() * 3
        });
    }
}

// --- MAIN LOOP ---
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

    const geom = getLaneGeometry(canvas);

    if (game.phase === 'rolling') {
        const events = stepBallAndPins(game.ball, game.pins, geom, dtSec);
        handlePhysicsEvents(events);

        if (!game.ball.active) {
            game.phase = 'settling';
            game.settleTimerMs = 950;
        }
    } else if (game.phase === 'settling') {
        stepBallAndPins(game.ball, game.pins, geom, dtSec);
        game.settleTimerMs -= dtMs;
        if (game.settleTimerMs <= 0 || arePinsSettled(game.pins)) {
            resolveRollOutcome();
        }
    } else if (game.phase === 'frameOver') {
        game.frameOverTimerMs -= dtMs;
        if (game.frameOverTimerMs <= 0) {
            advanceToNextTurn();
        }
    }

    updateParticles(dtSec);
    renderScene(ctx, canvas, geom);

    rafId = requestAnimationFrame(loop);
}

function handlePhysicsEvents(events) {
    if (!game || !events || events.length === 0) return;

    const chainNotes = [];
    for (const ev of events) {
        if (ev.type === 'gutter') {
            playGutterTone();
            game.bannerMessage = 'Into the gutter! Try Pitch Bend or a softer hook.';
        } else if (ev.type === 'pinHit') {
            game.chainHitCounter += 1;
            const note = ev.pin.note || game.scaleNotes[ev.pin.index % game.scaleNotes.length] || 'c2';
            playPinHitTone(note, ev.intensity, game.lastGrooveBoost);
            spawnBurst(ev.pin.x, ev.pin.y, game.theme.pinToppleGlow, 8);
            if (bridgeRef?.highlightKey) {
                bridgeRef.highlightKey(note, 220, '#38bdf8');
            }
            if (ev.isChain) {
                chainNotes.push(note);
            }
        }
    }

    if (chainNotes.length > 0 && game.chainHitCounter >= 2) {
        playChainHarmony(chainNotes, game.lastGrooveBoost);
    }
}

function updateParticles(dtSec) {
    if (!game) return;
    for (let i = game.particles.length - 1; i >= 0; i--) {
        const p = game.particles[i];
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
        p.life -= dtSec * 1.9;
        if (p.life <= 0) game.particles.splice(i, 1);
    }
}

function resolveRollOutcome() {
    if (!game) return;

    const knockedNow = game.pins.filter(p => p.down && !p.wasDownBeforeRoll).length;
    game.pins.forEach(p => {
        if (p.down) p.wasDownBeforeRoll = true;
    });

    const standingCount = countStandingPins(game.pins);
    const frameObj = game.frames[game.frame - 1];
    frameObj.rolls.push(knockedNow);

    if (bridgeRef?.getState) {
        const st = bridgeRef.getState();
        if (st?.gameStats) {
            st.gameStats.perfect += knockedNow;
        }
    }

    let isStrikeOrSpare = false;
    if (game.frame < TOTAL_FRAMES) {
        if (game.rollInFrame === 1 && standingCount === 0) {
            frameObj.isStrike = true;
            isStrikeOrSpare = true;
            game.bannerMessage = `STRIKE in Frame ${game.frame}!`;
            playStrikeOrSpareFanfare(true, game.scaleNotes);
            if (bridgeRef?.spawnConfetti) {
                const { canvas } = getCanvasAndContext();
                if (canvas) bridgeRef.spawnConfetti(canvas.width / 2, canvas.height * 0.3, '#facc15');
            }
            game.phase = 'frameOver';
            game.frameOverTimerMs = 1500;
        } else if (game.rollInFrame === 1 && standingCount > 0) {
            game.rollInFrame = 2;
            game.phase = 'aiming';
            game.bannerMessage = `${knockedNow} down! ${standingCount} left — aim for the spare.`;
        } else {
            if (standingCount === 0) {
                frameObj.isSpare = true;
                isStrikeOrSpare = true;
                game.bannerMessage = `SPARE in Frame ${game.frame}!`;
                playStrikeOrSpareFanfare(false, game.scaleNotes);
            } else {
                game.bannerMessage = `Frame ${game.frame} complete: ${knockedNow} on roll 2.`;
            }
            game.phase = 'frameOver';
            game.frameOverTimerMs = 1400;
        }
    } else {
        // 10th Frame rules
        game.tenthFrameRolls.push(knockedNow);
        if (standingCount === 0) {
            playStrikeOrSpareFanfare(true, game.scaleNotes);
            game.pins = createTenPins(game.scaleNotes);
            game.rollInFrame += 1;
            if (game.rollInFrame <= 3) {
                game.phase = 'aiming';
                game.bannerMessage = `10th Frame Bonus Roll (${game.rollInFrame}/3)! Full rack set.`;
            } else {
                finishGame();
            }
        } else if (game.rollInFrame === 1) {
            game.rollInFrame = 2;
            game.phase = 'aiming';
            game.bannerMessage = `10th Frame Roll 2/2: ${standingCount} pin(s) standing.`;
        } else {
            finishGame();
        }
    }

    recomputeScores();
    updateStatusBar();
}

function advanceToNextTurn() {
    if (!game) return;
    if (game.frame >= TOTAL_FRAMES) {
        finishGame();
        return;
    }

    game.frame += 1;
    game.rollInFrame = 1;
    game.pocketLocked = false;
    game.highlightedSparePin = null;
    game.pins = createTenPins(game.scaleNotes);
    game.pinsAtRollStart = snapshotPins(game.pins);
    game.phase = 'aiming';
    game.bannerMessage = `Frame ${game.frame} of ${TOTAL_FRAMES} — Play a MIDI note to roll!`;
    updateStatusBar();
}

function recomputeScores() {
    if (!game) return;
    const flatRolls = [];
    for (let f = 0; f < TOTAL_FRAMES - 1; f++) {
        const r = game.frames[f].rolls;
        if (r.length === 1 && r[0] === 10) {
            flatRolls.push({ value: 10, isStrike: true, frame: f });
        } else {
            r.forEach(val => flatRolls.push({ value: val, isStrike: false, frame: f }));
        }
    }
    game.tenthFrameRolls.forEach(val => {
        flatRolls.push({ value: val, isStrike: val === 10, frame: TOTAL_FRAMES - 1 });
    });

    let running = 0;
    let cursor = 0;

    for (let f = 0; f < TOTAL_FRAMES; f++) {
        const fr = game.frames[f];
        if (f < TOTAL_FRAMES - 1) {
            if (fr.rolls.length === 0) {
                fr.score = null;
                continue;
            }
            if (fr.isStrike) {
                const n1 = flatRolls[cursor + 1]?.value ?? 0;
                const n2 = flatRolls[cursor + 2]?.value ?? 0;
                running += 10 + n1 + n2;
                fr.score = running;
                cursor += 1;
            } else if (fr.rolls.length === 2) {
                const sumTwo = fr.rolls[0] + fr.rolls[1];
                if (sumTwo === 10) {
                    const bonus = flatRolls[cursor + 2]?.value ?? 0;
                    running += 10 + bonus;
                } else {
                    running += sumTwo;
                }
                fr.score = running;
                cursor += 2;
            } else {
                fr.score = null;
            }
        } else {
            if (game.tenthFrameRolls.length > 0) {
                const tenthSum = game.tenthFrameRolls.reduce((a, b) => a + b, 0);
                fr.score = running + tenthSum;
            }
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
            `Final Bowling Score: <span style="color:#22c55e; font-size:1.35rem; font-weight:900;">${finalScore}</span> / 300`,
            () => startChordBowl(bridgeRef)
        );
    }
}

function updateStatusBar() {
    const statusEl = document.getElementById('status');
    if (!statusEl || !game) return;
    statusEl.textContent = `🎳 ChordBowl | Frame ${game.frame}/${TOTAL_FRAMES} | Score: ${game.totalScore} | ${game.bannerMessage}`;
}

// --- RENDERING (Lane, Aim Marker, Groove Bar, Ball & Pins Only — No Person) ---
function renderScene(ctx, canvas, geom) {
    const { theme } = game;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background surround
    ctx.fillStyle = theme.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Gutters
    ctx.fillStyle = theme.gutter;
    ctx.fillRect(geom.laneLeft, 0, geom.gutterWidth, canvas.height);
    ctx.fillRect(geom.laneRight - geom.gutterWidth, 0, geom.gutterWidth, canvas.height);

    // Main wood/synth lane surface
    const laneGrad = ctx.createLinearGradient(0, geom.pinDeckY, 0, geom.foulLineY + 40);
    laneGrad.addColorStop(0, theme.laneTop);
    laneGrad.addColorStop(1, theme.laneBottom);
    ctx.fillStyle = laneGrad;
    ctx.fillRect(geom.playLeft, 0, geom.playRight - geom.playLeft, canvas.height);

    // Subtle lane boards & oil-pattern sheen
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    const boards = 9;
    for (let i = 1; i < boards; i++) {
        const bx = geom.playLeft + ((geom.playRight - geom.playLeft) * i) / boards;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx, canvas.height);
        ctx.stroke();
    }

    // Approach arrows
    ctx.fillStyle = theme.arrow;
    const arrowY = geom.pinDeckY + (geom.foulLineY - geom.pinDeckY) * 0.58;
    for (let a = -3; a <= 3; a++) {
        const ax = (geom.playLeft + geom.playRight) / 2 + a * 22;
        const tipOffset = (3 - Math.abs(a)) * 5;
        ctx.beginPath();
        ctx.moveTo(ax, arrowY - 12 - tipOffset);
        ctx.lineTo(ax - 5, arrowY);
        ctx.lineTo(ax + 5, arrowY);
        ctx.closePath();
        ctx.fill();
    }

    // Foul line
    ctx.strokeStyle = theme.foulLine;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(geom.laneLeft, geom.foulLineY);
    ctx.lineTo(geom.laneRight, geom.foulLineY);
    ctx.stroke();

    // Scoreboard strip at top-left
    drawScoreboard(ctx, game);

    // Rhythm-Timed Release Window (Groove Bar) on right side
    drawGrooveMeter(ctx, canvas, game);

    // Aiming guide & live target key marker (when aiming)
    if (game.phase === 'aiming') {
        const aimX = geom.playLeft + ((game.aimNormalized + 1) / 2) * (geom.playRight - geom.playLeft);
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = game.pocketLocked ? '#22c55e' : theme.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(aimX, geom.foulLineY);
        ctx.lineTo(aimX, geom.pinDeckY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Target marker at foul line
        ctx.fillStyle = game.pocketLocked ? '#22c55e' : theme.accent;
        ctx.beginPath();
        ctx.arc(aimX, geom.foulLineY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(game.targetKeyNote.toUpperCase(), aimX, geom.foulLineY + 20);
        ctx.restore();
    }

    // Pins
    drawPins(ctx, game.pins, geom, theme, game.highlightedSparePin);

    // Ball & trail
    if (game.ball.active || game.phase === 'settling') {
        drawBall(ctx, game.ball, theme);
    }

    // Particles
    for (const p of game.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawScoreboard(ctx, state) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(12, 12, 235, 76);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.strokeRect(12, 12, 235, 76);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Frame ${state.frame}/${TOTAL_FRAMES}  |  Total: ${state.totalScore}`, 22, 32);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '11px sans-serif';
    ctx.fillText(`Ball: ${state.ballWeight.label}  |  Hook: ${Math.round(state.modWheelNorm * 100)}%`, 22, 52);

    ctx.fillStyle = state.pocketLocked ? '#22c55e' : '#cbd5e1';
    ctx.fillText(
        state.pocketLocked ? 'Pocket Lock: ACTIVE' : 'Chord: Triad=Lock | Octave=Weight',
        22,
        72
    );
    ctx.restore();
}

function drawGrooveMeter(ctx, canvas, state) {
    const barW = 18;
    const barH = 150;
    const x = canvas.width - 42;
    const y = canvas.height * 0.5 - barH / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(x - 6, y - 24, barW + 12, barH + 42);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BEAT', x + barW / 2, y - 8);

    // Track
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, barW, barH);

    // Sweet spot zone at top & bottom of beat cycle
    const beatPhase = (state.beatClockMs % BEAT_MS) / BEAT_MS;
    const markerY = y + beatPhase * barH;

    ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
    ctx.fillRect(x, y, barW, 20);
    ctx.fillRect(x, y + barH - 20, barW, 20);

    // Moving pulse cursor
    ctx.fillStyle = isOnGrooveBeat() ? '#22c55e' : '#facc15';
    ctx.fillRect(x - 2, markerY - 4, barW + 4, 8);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '9px sans-serif';
    ctx.fillText('GROOVE', x + barW / 2, y + barH + 12);
    ctx.restore();
}

function drawPins(ctx, pins, geom, theme, spareHintIdx) {
    for (const pin of pins) {
        const px = geom.playLeft + ((pin.nx + 1) / 2) * (geom.playRight - geom.playLeft);
        const py = geom.pinDeckY + pin.ny * (geom.foulLineY - geom.pinDeckY) * 0.24;
        pin.x = px;
        pin.y = py;

        ctx.save();
        ctx.translate(px, py);

        if (pin.down) {
            ctx.rotate(pin.fallAngle || 0.7);
            ctx.globalAlpha = 0.45;
        } else if (spareHintIdx === pin.index) {
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Pin body
        ctx.fillStyle = pin.down ? '#64748b' : theme.pinBody;
        ctx.beginPath();
        ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
        ctx.fill();

        // Red neck stripe
        ctx.strokeStyle = theme.pinStripe;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
        ctx.stroke();

        // Pentatonic note label on pin
        ctx.fillStyle = pin.down ? '#cbd5e1' : '#0f172a';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((pin.note || '').replace(/\d+$/, '').toUpperCase(), 0, 0.5);

        ctx.restore();
    }
}

function drawBall(ctx, ball, theme) {
    // Trail
    for (let i = 0; i < ball.trail.length; i++) {
        const pt = ball.trail[i];
        const ratio = (i + 1) / ball.trail.length;
        ctx.save();
        ctx.globalAlpha = ratio * 0.28;
        ctx.fillStyle = theme.ballPrimary;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, ball.radius * ratio * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.fillStyle = ball.inGutter ? '#475569' : theme.ballPrimary;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Finger holes showing spin rotation
    const spinAngle = ball.spin * 1.4;
    ctx.fillStyle = theme.ballHole;
    ctx.beginPath();
    ctx.arc(Math.cos(spinAngle) * 4, Math.sin(spinAngle) * 4, 2.2, 0, Math.PI * 2);
    ctx.arc(Math.cos(spinAngle + 2.1) * 4, Math.sin(spinAngle + 2.1) * 4, 2.2, 0, Math.PI * 2);
    ctx.arc(Math.cos(spinAngle + 4.2) * 4, Math.sin(spinAngle + 4.2) * 4, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

export function handleChordBowlKeyDown(e) {
    if (!game || game.phase !== 'aiming') return false;
    if (e.key === 'ArrowLeft') {
        game.aimNormalized = Math.max(-1, game.aimNormalized - 0.12);
        return true;
    }
    if (e.key === 'ArrowRight') {
        game.aimNormalized = Math.min(1, game.aimNormalized + 0.12);
        return true;
    }
    if (e.code === 'Enter') {
        launchRoll(88);
        return true;
    }
    return false;
}
