// js/games/chordBowl.js
// 3D perspective 10-pin MIDI bowling game with classic golf-style two-stage meter,
// compact top scoreboard, giant animated STRIKE/SPARE callouts + screen shake,
// and clean return to mini-game menu when not replaying.

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
        ballInFrame: 1,
        tenthFrameBalls: [],
        frames: Array.from({ length: TOTAL_FRAMES }, (_, idx) => ({
            frameNumber: idx + 1,
            balls: [],
            score: null,
            isStrike: false,
            isSpare: false
        })),
        totalScore: 0,

        // Phases:
        // 'aiming' -> hold a key to charge & swing the golf-style meter ('charging')
        // 'charging' -> meter sweeps up to power peak, then sweeps back down to accuracy zone;
        //               press the key again (or release/re-press) to lock accuracy & launch!
        // 'rolling' -> ball is travelling down the 3D lane
        // 'settling' -> pins toppling/settling
        // 'betweenBalls' | 'frameComplete' | 'gameOver'
        phase: 'aiming',
        phaseTimerMs: 0,

        // Classic golf-style meter state (0.0 = bottom/accuracy target, 1.0 = top/max power)
        meter: {
            active: false,
            direction: 1,       // +1 rising toward power, -1 falling toward bottom accuracy zone
            value: 0.0,         // 0.0 .. 1.0
            lockedPower: 0.72,  // set when peak/trigger fires
            lockedAccuracy: 0.0 // 0.0 = dead-on bottom target, larger = error
        },

        aimNormalized: 0,
        targetKeyNote: 'c2',
        chargingKeyNote: null,
        heldNotes: new Set(),
        primaryRollNote: null,
        pitchBendNorm: 0,
        modWheelNorm: 0,
        secondNoteSpin: 0,
        pocketLocked: false,
        highlightedSparePin: null,
        bannerMessage: 'Hold a key to charge Power, press again near bottom for Accuracy!',

        // Big animated callout & strike camera/screen shake
        callout: {
            text: '',
            color: '#facc15',
            timerMs: 0,
            durationMs: 1700
        },
        screenShakeMs: 0,
        screenShakeIntensity: 0,

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

    const arcadeHub = document.getElementById('arcade-hub');
    if (arcadeHub) arcadeHub.classList.remove('open');

    if (bridgeRef?.resetGameStats) bridgeRef.resetGameStats();
    if (bridgeRef?.setActiveMiniGame) bridgeRef.setActiveMiniGame('chordBowl');

    game = createInitialGameState();
    attachDirectMidiListeners();
    installResultsCloseMenuHook();
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

    const canvas = document.getElementById('waterfall-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    game = null;
}

function returnToMiniGameMenuCleanly() {
    stopChordBowl();
    if (bridgeRef?.setActiveMiniGame) {
        bridgeRef.setActiveMiniGame(null);
    }
    if (typeof window.openArcadeHub === 'function') {
        window.openArcadeHub();
    } else {
        const hub = document.getElementById('arcade-hub');
        if (hub) hub.classList.add('open');
    }
}

function installResultsCloseMenuHook() {
    const closeBtn = document.getElementById('btn-game-results-close');
    if (!closeBtn || closeBtn.dataset.chordBowlHooked === '1') return;
    closeBtn.dataset.chordBowlHooked = '1';
    closeBtn.addEventListener('click', () => {
        if (bridgeRef?.getActiveMiniGame?.() === 'chordBowl' || game) {
            setTimeout(() => {
                const modal = document.getElementById('game-results-modal');
                const isOpen = modal && modal.classList.contains('open');
                if (!isOpen && bridgeRef?.getActiveMiniGame?.() !== 'chordBowl') {
                    returnToMiniGameMenuCleanly();
                }
            }, 30);
        }
    });
}

function getCanvasAndContext() {
    const canvas = document.getElementById('waterfall-canvas');
    if (!canvas) return { canvas: null, ctx: null };
    return { canvas, ctx: canvas.getContext('2d') };
}

function getCamera3D(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    return {
        w,
        h,
        horizonY: h * 0.20,
        foulY: h * 0.92,
        nearHalfWidth: w * 0.36,
        farHalfWidth: w * 0.125,
        centerX: w * 0.5
    };
}

function project3D(xNorm, zNorm, yHeightNorm, cam) {
    const t = Math.max(0, Math.min(1.12, zNorm));
    const persp = Math.pow(0.36, t);
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

    // Stage 1: Hold a note while aiming to aim and start charging the golf power meter
    if (game.phase === 'aiming') {
        game.targetKeyNote = normNote;
        game.primaryRollNote = normNote;
        game.chargingKeyNote = normNote;
        game.aimNormalized = computeAimXFromMidiNote(normNote);
        if (game.pocketLocked) {
            game.aimNormalized *= 0.25;
        }

        game.meter.active = true;
        game.meter.direction = 1;
        game.meter.value = 0.04;
        game.meter.lockedPower = 0.75;
        game.phase = 'charging';
        game.bannerMessage = 'HOLDING: Meter rising to Power — press again as it drops to the bottom target!';

        if (bridgeRef?.highlightKey) {
            bridgeRef.highlightKey(normNote, 320, game.theme.accent);
        }
        updateStatusBar();
        return;
    }

    // Stage 2: Press a key again while meter is sweeping to lock accuracy at the bottom and launch
    if (game.phase === 'charging') {
        lockMeterAndLaunch(velocity);
    }
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

function stepGolfMeter(dtSec) {
    if (!game || game.phase !== 'charging' || !game.meter.active) return;

    const sweepSpeed = 1.18; // full cycle speed
    game.meter.value += game.meter.direction * sweepSpeed * dtSec;

    if (game.meter.value >= 1.0) {
        game.meter.value = 1.0;
        game.meter.lockedPower = 1.0;
        game.meter.direction = -1; // now sweeping back down toward bottom accuracy zone
        game.bannerMessage = 'MAX POWER! Press key again right on the BOTTOM target line!';
        updateStatusBar();
    } else if (game.meter.value <= 0.0) {
        // Missed bottom sweet spot on downswing; wrap back up
        game.meter.value = 0.0;
        game.meter.direction = 1;
    }
}

function lockMeterAndLaunch(rawVelocity = 84) {
    if (!game) return;
    const powerLevel = game.meter.direction === 1
        ? Math.max(0.2, game.meter.value)
        : Math.max(0.25, game.meter.lockedPower);

    // Distance from bottom target (0.0) determines accuracy deviation
    const bottomError = Math.min(1.0, game.meter.value / 0.24);
    const accuracyQuality = Math.max(0, 1 - bottomError);

    game.meter.lockedPower = powerLevel;
    game.meter.lockedAccuracy = bottomError;
    game.meter.active = false;

    const velNorm = Math.max(0.15, Math.min(1, (powerLevel * 0.78 + (rawVelocity / 127) * 0.22)));
    const zSpeed = (0.56 + velNorm * 0.82) * game.ballWeight.speedMultiplier;
    const baseHook = ((1 - velNorm) * 0.55 + game.modWheelNorm * 0.65) * game.ballWeight.hookMultiplier;
    const grooveBoost = isOnGrooveBeat();

    // Accuracy deviation nudges initial lateral trajectory if pressed off the bottom target
    const accuracySpread = (1 - accuracyQuality) * 0.24 * (Math.random() < 0.5 ? -1 : 1);
    const hookSign = game.aimNormalized <= 0 ? 1 : -1;

    game.lastGrooveBoost = grooveBoost;
    if (grooveBoost) {
        playGrooveBoostSound();
        spawnBurst3D(game.aimNormalized, 0.04, '#facc15', 16);
    }

    game.ball = {
        active: true,
        x: game.aimNormalized,
        z: 0.02,
        vx: -game.aimNormalized * 0.08 + accuracySpread,
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
    const accPct = Math.round(accuracyQuality * 100);
    const pwrPct = Math.round(powerLevel * 100);
    game.bannerMessage = grooveBoost
        ? `GROOVE BOOST! Power ${pwrPct}% • Accuracy ${accPct}%`
        : `Power ${pwrPct}% • Accuracy ${accPct}% — Ball ${game.ballInFrame} rolling!`;
    updateStatusBar();
}

function triggerBigCallout(text, color = '#facc15', shakeMs = 0, shakeIntensity = 0) {
    if (!game) return;
    game.callout = {
        text,
        color,
        timerMs: 1750,
        durationMs: 1750
    };
    if (shakeMs > 0) {
        game.screenShakeMs = shakeMs;
        game.screenShakeIntensity = shakeIntensity;
    }
}

function isOnGrooveBeat() {
    if (!game) return false;
    const phaseInBeat = game.beatClockMs % BEAT_MS;
    const distFromBeat = Math.min(phaseInBeat, BEAT_MS - phaseInBeat);
    return distFromBeat <= GROOVE_WINDOW_MS;
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

    if (game.callout.timerMs > 0) {
        game.callout.timerMs = Math.max(0, game.callout.timerMs - dtMs);
    }
    if (game.screenShakeMs > 0) {
        game.screenShakeMs = Math.max(0, game.screenShakeMs - dtMs);
    }

    const { canvas, ctx } = getCanvasAndContext();
    if (!canvas || !ctx) {
        rafId = requestAnimationFrame(loop);
        return;
    }

    const cam = getCamera3D(canvas);

    if (game.phase === 'charging') {
        stepGolfMeter(dtSec);
    } else if (game.phase === 'rolling') {
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
            triggerBigCallout('STRIKE!', '#facc15', 850, 14);
            playStrikeOrSpareFanfare(true, game.scaleNotes);
            if (bridgeRef?.spawnConfetti) {
                const { canvas } = getCanvasAndContext();
                if (canvas) bridgeRef.spawnConfetti(canvas.width / 2, canvas.height * 0.45, '#facc15');
            }
            game.phase = 'frameComplete';
            game.phaseTimerMs = 1550;
        } else if (game.ballInFrame === 1 && standingCount > 0) {
            game.bannerMessage = `Ball 1 knocked ${knockedNow} (${standingCount} standing). Ball 2 coming up...`;
            game.phase = 'betweenBalls';
            game.phaseTimerMs = 1050;
        } else {
            if (standingCount === 0) {
                frameObj.isSpare = true;
                game.bannerMessage = `SPARE! Frame ${game.frame} complete — refreshing pins...`;
                triggerBigCallout('SPARE!', '#22c55e', 0, 0);
                playStrikeOrSpareFanfare(false, game.scaleNotes);
            } else {
                game.bannerMessage = `Frame ${game.frame} finished (${knockedNow} on Ball 2) — refreshing pins...`;
            }
            game.phase = 'frameComplete';
            game.phaseTimerMs = 1550;
        }
    } else {
        frameObj.balls.push(knockedNow);
        game.tenthFrameBalls.push(knockedNow);

        const totalBallsThrown = game.tenthFrameBalls.length;
        const firstBall = game.tenthFrameBalls[0] ?? 0;
        const secondBall = game.tenthFrameBalls[1] ?? 0;

        if (standingCount === 0) {
            const isTenthSpare = totalBallsThrown === 2 && firstBall < 10;
            triggerBigCallout(
                isTenthSpare ? 'SPARE!' : 'STRIKE!',
                isTenthSpare ? '#22c55e' : '#facc15',
                isTenthSpare ? 0 : 850,
                isTenthSpare ? 0 : 14
            );
            playStrikeOrSpareFanfare(!isTenthSpare, game.scaleNotes);
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
    game.meter.active = false;
    game.meter.value = 0;
    game.phase = 'aiming';
    game.bannerMessage = `Ball 2 of 2 — ${countStandingPins(game.pins)} pin(s) left. Hold key & hit bottom target!`;
    updateStatusBar();
}

function advanceToNextFrame() {
    if (!game) return;
    if (game.frame >= TOTAL_FRAMES) {
        finishGame();
        return;
    }

    game.frame += 1;
    game.ballInFrame = 1;
    game.pocketLocked = false;
    game.highlightedSparePin = null;
    game.ball.active = false;
    game.ball.trail = [];
    game.meter.active = false;
    game.meter.value = 0;
    game.pins = createTenPins(game.scaleNotes);
    game.phase = 'aiming';
    game.bannerMessage = `Frame ${game.frame}/${TOTAL_FRAMES} — Pins refreshed! Hold key to charge.`;
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
    const bridgeCopy = bridgeRef;

    stopChordBowl();

    if (bridgeCopy?.finishCustomMiniGame) {
        bridgeCopy.finishCustomMiniGame(
            'ChordBowl',
            finalScore,
            `Final 10-Frame Score: <span style="color:#22c55e; font-size:1.35rem; font-weight:900;">${finalScore}</span> / 300`,
            () => startChordBowl(bridgeCopy)
        );
    }
}

function updateStatusBar() {
    const statusEl = document.getElementById('status');
    if (!statusEl || !game) return;
    statusEl.textContent = `🎳 ChordBowl 3D | Frame ${game.frame}/${TOTAL_FRAMES} (Ball ${game.ballInFrame}) | Score: ${game.totalScore} | ${game.bannerMessage}`;
}

// --- 3D SCENE RENDERER ---
function render3DScene(ctx, canvas, cam) {
    const { theme } = game;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (game.screenShakeMs > 0) {
        const mag = game.screenShakeIntensity * (game.screenShakeMs / 850);
        const sx = (Math.random() - 0.5) * 2 * mag;
        const sy = (Math.random() - 0.5) * 2 * mag;
        ctx.translate(sx, sy);
    }

    const skyGrad = ctx.createLinearGradient(0, 0, 0, cam.horizonY + 16);
    skyGrad.addColorStop(0, theme.skyTop);
    skyGrad.addColorStop(1, theme.skyHorizon);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = theme.sideWall;
    ctx.fillRect(0, cam.horizonY, canvas.width, canvas.height - cam.horizonY);

    const nearLeft = cam.centerX - cam.nearHalfWidth;
    const nearRight = cam.centerX + cam.nearHalfWidth;
    const farLeft = cam.centerX - cam.farHalfWidth;
    const farRight = cam.centerX + cam.farHalfWidth;

    const gutterFrac = 0.11;
    const nearPlayL = nearLeft + (nearRight - nearLeft) * gutterFrac;
    const nearPlayR = nearRight - (nearRight - nearLeft) * gutterFrac;
    const farPlayL = farLeft + (farRight - farLeft) * gutterFrac;
    const farPlayR = farRight - (farRight - farLeft) * gutterFrac;

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

    ctx.fillStyle = theme.arrow;
    for (let a = -3; a <= 3; a++) {
        const xNorm = a * 0.16;
        const zArrow = 0.44;
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

    ctx.strokeStyle = theme.foulLine;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nearLeft, cam.foulY);
    ctx.lineTo(nearRight, cam.foulY);
    ctx.stroke();

    if (game.phase === 'aiming' || game.phase === 'charging') {
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
        ctx.arc(startPt.x, startPt.y, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(game.targetKeyNote.toUpperCase(), startPt.x, startPt.y + 16);
        ctx.restore();
    }

    const renderables = [];
    for (const pin of game.pins) {
        renderables.push({ kind: 'pin', z: pin.z, pin });
    }
    if (game.ball.active || game.phase === 'settling' || game.phase === 'aiming' || game.phase === 'charging') {
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

    drawCompactScoreboard(ctx, canvas, game);
    drawGolfPowerMeter(ctx, canvas, game);
    drawGrooveMeter(ctx, canvas, game);
    drawGiantCallout(ctx, canvas, game.callout);

    ctx.restore();
}

function draw3DPin(ctx, pin, cam, theme, spareHintIdx) {
    const base = project3D(pin.x, pin.z, 0, cam);
    const pinHeight = 46 * base.scale;
    const pinHalfW = 11.5 * base.scale;

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

    const leanX = pin.tiltDirX * Math.sin(pin.tilt) * pinHeight * 0.9;
    const uprightFactor = Math.cos(pin.tilt);
    const tipY = -Math.max(4, pinHeight * Math.max(0.12, uprightFactor)) + Math.sin(pin.tilt) * (pin.tiltDirZ < 0 ? -6 : 6) * base.scale;

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

    ctx.strokeStyle = theme.pinStripe;
    ctx.lineWidth = Math.max(1.5, 3 * base.scale);
    ctx.beginPath();
    ctx.moveTo(-pinHalfW * 0.55 + leanX * 0.68, tipY * 0.74);
    ctx.lineTo(pinHalfW * 0.55 + leanX * 0.68, tipY * 0.74);
    ctx.stroke();

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

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, radiusPx * 1.05, radiusPx * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

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

// Low-profile conventional 10-frame scoreboard (minimal height so gameplay stays clear)
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
    if (balls.length === 1) return [balls[0] === 0 ? '-' : String(balls[0]), ''];
    if (frameObj.isSpare) return [balls[0] === 0 ? '-' : String(balls[0]), '/'];
    return [
        balls[0] === 0 ? '-' : String(balls[0]),
        balls[1] === 0 ? '-' : String(balls[1])
    ];
}

function drawCompactScoreboard(ctx, canvas, state) {
    const marginX = 12;
    const topY = 4;
    const hudReserveRight = 64;
    const boardWidth = Math.max(420, canvas.width - marginX * 2 - hudReserveRight);
    const boardHeight = 40;
    const headerHeight = 11;
    const markHeight = 12;
    const boxWidth = boardWidth / TOTAL_FRAMES;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.fillRect(marginX, topY, boardWidth, boardHeight);

    for (let i = 0; i < TOTAL_FRAMES; i++) {
        const fx = marginX + i * boxWidth;
        const fr = state.frames[i];
        const isCurrent = state.frame === i + 1 && state.phase !== 'gameOver';

        if (isCurrent) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
            ctx.fillRect(fx, topY, boxWidth, boardHeight);
        }

        ctx.strokeStyle = isCurrent ? '#38bdf8' : 'rgba(148, 163, 184, 0.32)';
        ctx.lineWidth = isCurrent ? 1.5 : 1;
        ctx.strokeRect(fx, topY, boxWidth, boardHeight);

        ctx.fillStyle = isCurrent ? '#38bdf8' : '#cbd5e1';
        ctx.font = 'bold 8.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), fx + boxWidth / 2, topY + headerHeight / 2);

        const isTenth = i === TOTAL_FRAMES - 1;
        const subCount = isTenth ? 3 : 2;
        const markBoxW = Math.min(12 * subCount, boxWidth * (isTenth ? 0.7 : 0.52));
        const markStartX = fx + boxWidth - markBoxW;
        const subW = markBoxW / subCount;

        for (let s = 0; s < subCount; s++) {
            const sx = markStartX + s * subW;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(sx, topY + headerHeight, subW, markHeight);
        }

        const marks = formatFrameMarks(fr, isTenth, state.tenthFrameBalls);
        for (let s = 0; s < subCount; s++) {
            const mark = marks[s];
            if (!mark) continue;
            const cx = markStartX + s * subW + subW / 2;
            const cy = topY + headerHeight + markHeight / 2;
            ctx.fillStyle = mark === 'X' ? '#facc15' : mark === '/' ? '#22c55e' : '#f8fafc';
            ctx.font = 'bold 8.5px sans-serif';
            ctx.fillText(mark, cx, cy);
        }

        if (fr && fr.score !== null && fr.score !== undefined) {
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 10.5px sans-serif';
            ctx.fillText(
                String(fr.score),
                fx + boxWidth / 2,
                topY + headerHeight + markHeight + (boardHeight - headerHeight - markHeight) / 2 + 0.5
            );
        }
    }

    ctx.restore();
}

// Classic golf-style Power & Bottom Accuracy meter on left side
function drawGolfPowerMeter(ctx, canvas, state) {
    const x = 22;
    const y = Math.max(58, canvas.height * 0.24);
    const w = 22;
    const h = Math.min(185, canvas.height * 0.46);
    const targetZoneH = Math.max(18, h * 0.16);

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(x - 6, y - 20, w + 12, h + 38);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.strokeRect(x - 6, y - 20, w + 12, h + 38);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PWR', x + w / 2, y - 7);

    // Gradient fill from bottom (accuracy) to top (max power)
    const grad = ctx.createLinearGradient(0, y + h, 0, y);
    grad.addColorStop(0, '#22c55e');
    grad.addColorStop(0.55, '#eab308');
    grad.addColorStop(1, '#ef4444');
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, w, h);

    const fillH = Math.max(0, Math.min(1, state.meter.value)) * h;
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + h - fillH, w, fillH);

    // Bottom accuracy target zone
    ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
    ctx.fillRect(x, y + h - targetZoneH, w, targetZoneH);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y + h - targetZoneH, w, targetZoneH);

    // Locked power indicator line
    if (state.meter.direction === -1) {
        const pwrY = y + h - state.meter.lockedPower * h;
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 3, pwrY);
        ctx.lineTo(x + w + 3, pwrY);
        ctx.stroke();
    }

    // Moving cursor needle
    const cursorY = y + h - Math.max(0, Math.min(1, state.meter.value)) * h;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 4, cursorY - 2.5, w + 8, 5);

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 8.5px sans-serif';
    ctx.fillText('AIM', x + w / 2, y + h + 11);
    ctx.restore();
}

function drawGrooveMeter(ctx, canvas, state) {
    const barW = 18;
    const barH = 130;
    const x = canvas.width - 42;
    const y = canvas.height * 0.52 - barH / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(x - 6, y - 22, barW + 12, barH + 38);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 9.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BEAT', x + barW / 2, y - 8);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, barW, barH);

    const beatPhase = (state.beatClockMs % BEAT_MS) / BEAT_MS;
    const markerY = y + beatPhase * barH;

    ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
    ctx.fillRect(x, y, barW, 16);
    ctx.fillRect(x, y + barH - 16, barW, 16);

    ctx.fillStyle = isOnGrooveBeat() ? '#22c55e' : '#facc15';
    ctx.fillRect(x - 2, markerY - 4, barW + 4, 8);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '8.5px sans-serif';
    ctx.fillText('GROOVE', x + barW / 2, y + barH + 11);
    ctx.restore();
}

function drawGiantCallout(ctx, canvas, callout) {
    if (!callout || callout.timerMs <= 0 || !callout.text) return;

    const progress = 1 - callout.timerMs / callout.durationMs;
    const popScale = progress < 0.22
        ? 0.45 + (progress / 0.22) * 0.72
        : 1.17 - Math.min(0.17, ((progress - 0.22) / 0.78) * 0.17);
    const alpha = progress > 0.72
        ? Math.max(0, (1 - progress) / 0.28)
        : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(canvas.width / 2, canvas.height * 0.44);
    ctx.scale(popScale, popScale);

    const fontSize = Math.max(54, Math.min(96, Math.round(canvas.width * 0.082)));
    ctx.font = `900 ${fontSize}px Impact, 'Arial Black', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.12));
    ctx.strokeStyle = 'rgba(9, 13, 22, 0.92)';
    ctx.strokeText(callout.text, 0, 0);

    ctx.fillStyle = callout.color;
    ctx.fillText(callout.text, 0, 0);
    ctx.restore();
}

export function handleChordBowlKeyDown(e) {
    if (!game) return false;
    if (game.phase === 'aiming') {
        if (e.key === 'ArrowLeft') {
            game.aimNormalized = Math.max(-0.88, game.aimNormalized - 0.1);
            return true;
        }
        if (e.key === 'ArrowRight') {
            game.aimNormalized = Math.min(0.88, game.aimNormalized + 0.1);
            return true;
        }
        if (e.code === 'Enter') {
            game.meter.active = true;
            game.meter.direction = 1;
            game.meter.value = 0.05;
            game.phase = 'charging';
            return true;
        }
    } else if (game.phase === 'charging' && e.code === 'Enter') {
        lockMeterAndLaunch(88);
        return true;
    }
    return false;
}
