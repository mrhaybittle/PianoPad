import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let lastFrameTime = 0;
let gamePhase = 'instructions'; // 'instructions' | 'striker_aim' | 'striker_runup' | 'striker_kick' | 'goalie_wait' | 'goalie_defend' | 'round_end' | 'gameover'

// Match State
let playerScore = 0;
let aiScore = 0;
let currentRound = 1;
const MAX_ROUNDS = 5;
let isPlayerTurn = true;
let playerHistory = [];
let aiHistory = [];

// Visual Effects
let cameraShake = 0;
let flashAlpha = 0;
let bannerText = '';
let bannerColor = '#ffffff';
let bannerTimer = 0;
let particles = [];

// Normalized Ball Coordinates:
// nx: -1 (left post) .. 0 (center) .. +1 (right post)
// ny:  0 (ground)    .. 1 (crossbar)
// t:   0 (penalty spot) .. 1 (goal line)
const ball = {
    active: false,
    nx: 0,
    ny: 0,
    t: 0,
    startNx: 0,
    startNy: 0,
    targetNx: 0,
    targetNy: 0,
    arcHeight: 0.25,
    curve: 0,
    spin: 0,
    duration: 0.72,
    elapsed: 0
};

// Striker State
let heldTargetNote = null;
let lockedTarget = null;
let powerMeter = 0;
let powerDir = 1;
let hasCurved = false;
let strikerRunProgress = 0; // 0 (ready) -> 1 (striking ball)

const TARGETS = [
    { note: 'C', label: 'TOP LEFT',     nx: -0.82, ny: 0.80 },
    { note: 'D', label: 'BOT LEFT',     nx: -0.82, ny: 0.18 },
    { note: 'E', label: 'TOP CENTER',   nx:  0.00, ny: 0.84 },
    { note: 'G', label: 'BOT RIGHT',    nx:  0.82, ny: 0.18 },
    { note: 'A', label: 'TOP RIGHT',    nx:  0.82, ny: 0.80 }
];

// Goalie State
const goalie = {
    nx: 0,
    ny: 0,
    isDiving: false,
    diveTargetNx: 0,
    diveTargetNy: 0,
    timer: 0
};

// --- KEYBOARD / POINTER RELEASE & SPACEBAR INTERCEPTORS ---
function preventSpaceBar(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
    }
}

function onGlobalKeyUp() {
    if (gamePhase !== 'striker_aim' || !heldTargetNote) return;
    if (!document.querySelector('#keyboard .key.active')) {
        releaseStrikerShot();
    }
}

function onGlobalPointerUp() {
    if (gamePhase !== 'striker_aim' || !heldTargetNote) return;
    setTimeout(() => {
        if (gamePhase === 'striker_aim' && heldTargetNote && !document.querySelector('#keyboard .key.active')) {
            releaseStrikerShot();
        }
    }, 15);
}

// --- SOUND EFFECTS ---
function playSoccerSfx(type) {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        if (type === 'whistle') {
            [2450, 2650, 2450].forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, now + idx * 0.08);
                gain.gain.setValueAtTime(0.06, now + idx * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.09);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.08);
                osc.stop(now + idx * 0.08 + 0.1);
            });
        } else if (type === 'kick') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.21);
        } else if (type === 'curve') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(340, now);
            osc.frequency.exponentialRampToValueAtTime(840, now + 0.22);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'save') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(75, now + 0.2);
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.23);
        } else if (type === 'goal') {
            [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(f, now + i * 0.09);
                gain.gain.setValueAtTime(0.09, now + i * 0.09);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.28);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + i * 0.09);
                osc.stop(now + i * 0.09 + 0.3);
            });
        }
    } catch (e) {}
}

export function stopSharpShooter() {
    if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    gamePhase = 'gameover';
    heldTargetNote = null;

    window.removeEventListener('keydown', preventSpaceBar, { capture: true });
    window.removeEventListener('keyup', onGlobalKeyUp, { capture: true });
    window.removeEventListener('mouseup', onGlobalPointerUp, { capture: true });
    window.removeEventListener('touchend', onGlobalPointerUp, { capture: true });

    const popup = document.getElementById('sharp-shooter-popup');
    if (popup) popup.style.display = 'none';
}

export function startSharpShooter(bridge) {
    initAudio();
    stopSharpShooter();
    bridge.exitActiveMiniGame();

    document.getElementById('game-results-modal')?.classList.remove('open');
    document.getElementById('arcade-hub')?.classList.remove('open');

    bridge.setActiveMiniGame('sharpShooter');
    bridge.resetGameStats();

    window.addEventListener('keydown', preventSpaceBar, { capture: true });
    window.addEventListener('keyup', onGlobalKeyUp, { capture: true });
    window.addEventListener('mouseup', onGlobalPointerUp, { capture: true });
    window.addEventListener('touchend', onGlobalPointerUp, { capture: true });

    playerScore = 0;
    aiScore = 0;
    currentRound = 1;
    isPlayerTurn = true;
    playerHistory = [];
    aiHistory = [];
    particles = [];
    cameraShake = 0;
    flashAlpha = 0;
    bannerTimer = 0;

    gamePhase = 'instructions';
    showInstructionsPopup(bridge);

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = '⚽ Sharp ♯ Shooter: HOLD C/D/E/G/A to charge power, RELEASE to kick, tap Black Key (♯) to curve!';
    }
}

function showInstructionsPopup(bridge) {
    let popup = document.getElementById('sharp-shooter-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'sharp-shooter-popup';
        popup.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #1e3a8a, #0f172a);
            border: 4px solid #38bdf8; border-radius: 14px; padding: 24px;
            color: white; font-family: -apple-system, sans-serif; z-index: 9999;
            width: 90%; max-width: 440px; box-shadow: 0 20px 50px rgba(0,0,0,0.85);
            text-align: center;
        `;
        document.body.appendChild(popup);
    }

    popup.innerHTML = `
        <div style="margin-bottom:14px;">
            <h2 style="margin:0; font-size:32px; font-weight:900; color:#ffffff; font-style:italic; letter-spacing:0.5px;">
                SHARP <span style="color:#facc15; font-size:38px;">♯</span> SHOOTER
            </h2>
            <div style="color:#38bdf8; font-weight:800; letter-spacing:2px; font-size:12px; margin-top:4px;">WORLD CUP PENALTY SHOOTOUT</div>
        </div>
        <div style="background:rgba(0,0,0,0.45); padding:15px; border-radius:10px; text-align:left; font-size:14px; line-height:1.6; margin-bottom:16px; border: 1px solid rgba(255,255,255,0.12);">
            <div style="color:#facc15; font-weight:800; margin-bottom:4px;">⚽ STRIKER TURN:</div>
            <div style="margin-bottom:4px;"><b>1. AIM & POWER:</b> HOLD a target's Note Letter (<b>C, D, E, G, A</b>) to charge power, then <b>RELEASE</b> to shoot!</div>
            <div style="margin-bottom:12px;"><b>2. BANANA CURVE:</b> Tap ANY <b>Black Key (♯)</b> right after kicking to bend the shot around the keeper!</div>
            <div style="color:#38bdf8; font-weight:800; margin-bottom:4px;">🧤 GOALIE TURN:</div>
            <div><b>DIVE:</b> <b>Octave 1</b> = Dive Left • <b>Octave 2</b> = Center Jump • <b>Octave 3</b> = Dive Right.</div>
        </div>
        <button id="btn-start-sharp" style="background:#22c55e; color:white; border:none; padding:14px; font-size:18px; font-weight:900; border-radius:8px; cursor:pointer; width:100%; box-shadow:0 4px 0 #15803d; text-transform:uppercase;">▶ Blow The Whistle</button>
    `;
    popup.style.display = 'block';

    document.getElementById('btn-start-sharp').onclick = () => {
        popup.style.display = 'none';
        setupRound();
        lastFrameTime = performance.now();
        if (animFrameId === null) {
            animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));
        }
    };
}

function setupRound() {
    heldTargetNote = null;
    lockedTarget = null;
    powerMeter = 0.15;
    powerDir = 1;
    hasCurved = false;
    strikerRunProgress = 0;

    ball.active = false;
    ball.nx = 0;
    ball.ny = 0;
    ball.t = isPlayerTurn ? 0 : 1;
    ball.curve = 0;
    ball.spin = 0;
    ball.elapsed = 0;

    goalie.nx = 0;
    goalie.ny = 0;
    goalie.isDiving = false;
    goalie.timer = 0;

    gamePhase = isPlayerTurn ? 'striker_aim' : 'goalie_wait';
    playSoccerSfx('whistle');
    triggerBanner(
        isPlayerTurn ? `ROUND ${currentRound}: YOUR KICK!` : `ROUND ${currentRound}: DEFEND THE NET!`,
        isPlayerTurn ? '#38bdf8' : '#f97316',
        1.35
    );

    if (!isPlayerTurn) {
        setTimeout(() => {
            if (gamePhase === 'goalie_wait') executeAIKick();
        }, 1250 + Math.random() * 800);
    }
}

function releaseStrikerShot() {
    if (gamePhase !== 'striker_aim' || !lockedTarget) return;
    heldTargetNote = null;
    gamePhase = 'striker_runup';
    strikerRunProgress = 0;
}

function launchPlayerBall() {
    gamePhase = 'striker_kick';
    ball.active = true;
    ball.t = 0;
    ball.elapsed = 0;
    ball.duration = 0.72 - powerMeter * 0.16;
    ball.startNx = 0;
    ball.startNy = 0;

    // Sweet spot is 0.70..0.90; overcharging past 0.94 risks sailing slightly high/wide
    const overcharge = Math.max(0, powerMeter - 0.92) * 2.8;
    const jitterX = (Math.random() - 0.5) * (0.12 + overcharge * 0.5);
    const jitterY = overcharge * 0.35 + (Math.random() - 0.5) * 0.08;

    ball.targetNx = lockedTarget.nx + jitterX;
    ball.targetNy = Math.max(0.08, lockedTarget.ny + jitterY);
    ball.arcHeight = 0.16 + powerMeter * 0.18;
    ball.curve = 0;

    playSoccerSfx('kick');

    // AI Goalkeeper reaction
    setTimeout(() => {
        if (gamePhase === 'striker_kick') {
            goalie.isDiving = true;
            goalie.timer = 0;
            const guessesRight = Math.random() < (0.45 + currentRound * 0.05);
            if (guessesRight) {
                goalie.diveTargetNx = Math.max(-0.85, Math.min(0.85, ball.targetNx));
                goalie.diveTargetNy = ball.targetNy > 0.5 ? 0.65 : 0.18;
            } else {
                const wrongDir = ball.targetNx >= 0 ? -0.78 : 0.78;
                goalie.diveTargetNx = wrongDir;
                goalie.diveTargetNy = Math.random() * 0.55;
            }
        }
    }, 180 + Math.random() * 140);
}

function executeAIKick() {
    gamePhase = 'goalie_defend';
    ball.active = true;
    ball.t = 1;
    ball.elapsed = 0;
    ball.duration = Math.max(0.62, 0.84 - currentRound * 0.03);
    ball.startNx = 0;
    ball.startNy = 0;

    const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
    ball.targetNx = target.nx * (0.85 + Math.random() * 0.2);
    ball.targetNy = target.ny * (0.85 + Math.random() * 0.2);
    ball.arcHeight = 0.22;
    ball.curve = Math.random() > 0.5 ? (Math.random() > 0.5 ? 0.35 : -0.35) : 0;

    playSoccerSfx('kick');
}

export function handleSharpShooterInput(noteStr, bridge) {
    if (gamePhase === 'instructions' || gamePhase === 'gameover' || gamePhase === 'round_end') return;

    const match = (noteStr || '').trim().toLowerCase().match(/^([a-g])(#?)([0-9]+)$/);
    if (!match) return;

    const letter = match[1].toUpperCase();
    const isSharp = match[2] === '#';
    const octave = parseInt(match[3], 10);

    if (isPlayerTurn) {
        if (gamePhase === 'striker_aim' && !isSharp) {
            const target = TARGETS.find(t => t.note === letter);
            if (target) {
                heldTargetNote = letter;
                lockedTarget = target;
                window.__sharpShooterUsedDomKey = Boolean(document.querySelector('#keyboard .key.active'));
                bridge.highlightKey(noteStr, 450, '#facc15');
            } else {
                bridge.highlightKey(noteStr, 150, '#ef4444');
            }
        } else if ((gamePhase === 'striker_kick' || gamePhase === 'striker_runup') && isSharp && !hasCurved) {
            hasCurved = true;
            // Bend inward toward the inside post
            ball.curve = (lockedTarget && lockedTarget.nx > 0) ? -0.52 : 0.52;
            playSoccerSfx('curve');
            bridge.highlightKey(noteStr, 300, '#ec4899');
            triggerBanner('♯ BANANA CURVE!', '#ec4899', 0.85);
        }
    } else {
        if (gamePhase === 'goalie_defend' && !goalie.isDiving) {
            goalie.isDiving = true;
            goalie.timer = 0;
            if (octave <= 1) {
                goalie.diveTargetNx = -0.82;
                goalie.diveTargetNy = 0.45;
                bridge.highlightKey(noteStr, 400, '#38bdf8');
            } else if (octave === 2) {
                goalie.diveTargetNx = 0.0;
                goalie.diveTargetNy = 0.65;
                bridge.highlightKey(noteStr, 400, '#22c55e');
            } else {
                goalie.diveTargetNx = 0.82;
                goalie.diveTargetNy = 0.45;
                bridge.highlightKey(noteStr, 400, '#f97316');
            }
        }
    }
}

function triggerBanner(text, color, duration) {
    bannerText = text;
    bannerColor = color;
    bannerTimer = duration;
}

function spawnConfettiBurst(x, y, color, count = 18) {
    for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const spd = 80 + Math.random() * 180;
        particles.push({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 60,
            color,
            size: 4 + Math.random() * 4,
            life: 1.0
        });
    }
}

function resolveShot(bridge) {
    gamePhase = 'round_end';

    const inGoalFrame = Math.abs(ball.nx) <= 0.98 && ball.ny >= 0 && ball.ny <= 0.98;
    const keeperReach = isPlayerTurn ? 0.34 : 0.44;
    const distToGoalie = Math.hypot((ball.nx - goalie.nx) * 0.9, (ball.ny - goalie.ny) * 1.15);
    const isSaved = inGoalFrame && distToGoalie <= keeperReach;

    const canvas = document.getElementById('waterfall-canvas');
    const W = canvas ? canvas.width : 900;
    const H = canvas ? canvas.height : 380;

    if (!inGoalFrame) {
        triggerBanner('MISSED WIDE!', '#ef4444', 1.5);
        if (isPlayerTurn) playerHistory.push('miss');
        else aiHistory.push('miss');
    } else if (isSaved) {
        playSoccerSfx('save');
        triggerBanner('WHAT A SAVE!', '#f97316', 1.5);
        spawnConfettiBurst(W / 2 + goalie.nx * 140, H * 0.42, '#f97316', 14);
        if (isPlayerTurn) {
            playerHistory.push('miss');
        } else {
            aiHistory.push('miss');
            playerScore += 250;
        }
    } else {
        playSoccerSfx('goal');
        cameraShake = 0.45;
        flashAlpha = 0.65;
        if (isPlayerTurn) {
            const curveBonus = hasCurved ? 150 : 0;
            playerScore += 500 + curveBonus;
            playerHistory.push('goal');
            triggerBanner(hasCurved ? '♯ TOP CORNER GOLAZO! +650' : 'GOAL!!! +500', '#22c55e', 1.6);
            spawnConfettiBurst(W / 2 + ball.nx * 150, H * 0.35, '#22c55e', 24);
        } else {
            aiScore += 1;
            aiHistory.push('goal');
            triggerBanner('CPU SCORES!', '#ef4444', 1.5);
        }
    }

    setTimeout(() => {
        if (gamePhase !== 'round_end') return;
        if (!isPlayerTurn) currentRound++;

        if (currentRound > MAX_ROUNDS) {
            endMatch(bridge);
        } else {
            isPlayerTurn = !isPlayerTurn;
            setupRound();
        }
    }, 1850);
}

function endMatch(bridge) {
    gamePhase = 'gameover';
    const playerGoals = playerHistory.filter(r => r === 'goal').length;
    const won = playerGoals >= aiScore;
    const headline = won ? `YOU WIN (${playerGoals} - ${aiScore})!` : `CPU WINS (${aiScore} - ${playerGoals})!`;
    triggerBanner(headline, won ? '#22c55e' : '#ef4444', 2.2);

    setTimeout(() => {
        if (bridge && bridge.getActiveMiniGame() === 'sharpShooter') {
            stopSharpShooter();
            bridge.finishCustomMiniGame(
                'Sharp Shooter',
                playerScore,
                `<span style="color:${won ? '#22c55e' : '#ef4444'}; font-weight:800;">${headline}</span><br>` +
                `Match Score: <span style="color:#facc15; font-size:1.45rem; font-weight:900;">${playerScore}</span>`,
                () => startSharpShooter(bridge)
            );
        }
    }, 1900);
}

function gameLoop(now, bridge) {
    if (bridge.getActiveMiniGame() !== 'sharpShooter') {
        stopSharpShooter();
        return;
    }

    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (cameraShake > 0) cameraShake = Math.max(0, cameraShake - dt);
    if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 2.2);
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    // Charge power while holding a note key; auto-fire if released on DOM key
    if (gamePhase === 'striker_aim' && heldTargetNote) {
        powerMeter += powerDir * dt * 1.45;
        if (powerMeter >= 1) { powerMeter = 1; powerDir = -1; }
        if (powerMeter <= 0.1) { powerMeter = 0.1; powerDir = 1; }

        if (window.__sharpShooterUsedDomKey && !document.querySelector('#keyboard .key.active')) {
            window.__sharpShooterUsedDomKey = false;
            releaseStrikerShot();
        }
    }

    // Striker short run-up animation
    if (gamePhase === 'striker_runup') {
        strikerRunProgress += dt * 4.2;
        if (strikerRunProgress >= 1) {
            strikerRunProgress = 1;
            launchPlayerBall();
        }
    }

    // Ball Flight & Goalie Dive Physics
    if (ball.active) {
        ball.elapsed += dt;
        const rawProgress = Math.min(1, ball.elapsed / ball.duration);

        if (isPlayerTurn) {
            ball.t = rawProgress;
        } else {
            ball.t = 1 - rawProgress;
        }

        // Smooth interpolation from penalty spot (0) to goal plane (1)
        const flightFrac = isPlayerTurn ? ball.t : (1 - ball.t);
        const curveOffset = Math.sin(flightFrac * Math.PI) * ball.curve;
        ball.nx = ball.startNx + (ball.targetNx - ball.startNx) * flightFrac + curveOffset;
        ball.ny = ball.startNy + (ball.targetNy - ball.startNy) * flightFrac + Math.sin(flightFrac * Math.PI) * ball.arcHeight;
        ball.spin += dt * 16;

        if (goalie.isDiving) {
            goalie.timer += dt * 2.1;
            const gt = Math.min(1, goalie.timer);
            const ease = 1 - Math.pow(1 - gt, 3);
            goalie.nx = goalie.diveTargetNx * ease;
            goalie.ny = goalie.diveTargetNy * Math.sin(gt * Math.PI * 0.85);
        }

        if (rawProgress >= 1) {
            ball.active = false;
            resolveShot(bridge);
        }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 320 * dt;
        pt.life -= dt * 1.9;
        if (pt.life <= 0) particles.splice(i, 1);
    }

    // =========================================================================
    // RENDER FULL-WINDOW STADIUM & PERSPECTIVE
    // =========================================================================
    const canvas = document.getElementById('waterfall-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.save();
    if (cameraShake > 0) {
        const mag = cameraShake * 14;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    if (isPlayerTurn) {
        renderStrikerPerspective(ctx, W, H, now);
    } else {
        renderGoaliePerspective(ctx, W, H, now);
    }

    // Confetti Particles
    particles.forEach(pt => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
        ctx.restore();
    });

    renderWorldCupScoreboardHUD(ctx, W, H);

    // Center Callout Banner
    if (bannerTimer > 0 && bannerText) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fillRect(0, H * 0.44 - 24, W, 48);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 28px -apple-system, sans-serif';
        ctx.fillStyle = bannerColor;
        ctx.fillText(bannerText, W / 2, H * 0.44);
    }

    if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();

    if (gamePhase !== 'gameover') {
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}

// =========================================================================
// 1. STRIKER PERSPECTIVE (Behind the Penalty Spot looking at the Goal)
// =========================================================================
function renderStrikerPerspective(ctx, W, H, now) {
    const horizonY = Math.round(H * 0.30);
    const goalLineY = Math.round(H * 0.36);
    const spotY = Math.round(H * 0.82);

    // 1. Stadium Stands & Cheering Crowd
    const standGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    standGrad.addColorStop(0, '#1e293b');
    standGrad.addColorStop(1, '#475569');
    ctx.fillStyle = standGrad;
    ctx.fillRect(0, 0, W, horizonY);

    const crowdColors = ['#ef4444', '#ffffff', '#3b82f6', '#facc15', '#22c55e'];
    for (let row = 0; row < 5; row++) {
        const cy = 26 + row * Math.max(10, (horizonY - 34) / 5);
        for (let cx = (row % 2) * 5; cx < W; cx += 10) {
            const wave = Math.sin(now / 180 + cx * 0.05 + row) * 2;
            ctx.fillStyle = crowdColors[(cx + row * 7) % crowdColors.length];
            ctx.fillRect(cx, cy + wave, 6, 6);
        }
    }

    // 2. Perimeter LED Advertising Boards
    const adH = goalLineY - horizonY;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, horizonY, W, adH);
    const adColors = ['#e11d48', '#2563eb', '#f59e0b', '#10b981'];
    const segW = W / 6;
    for (let i = 0; i < 6; i++) {
        ctx.fillStyle = adColors[i % adColors.length];
        ctx.fillRect(i * segW + 2, horizonY + 2, segW - 4, Math.max(4, adH - 4));
    }

    // 3. Alternating Green Pitch Stripes (Perspective Mowed Turf)
    const pitchH = H - goalLineY;
    const stripeCount = 8;
    for (let s = 0; s < stripeCount; s++) {
        const y0 = goalLineY + (pitchH * s) / stripeCount;
        const y1 = goalLineY + (pitchH * (s + 1)) / stripeCount;
        ctx.fillStyle = s % 2 === 0 ? '#16a34a' : '#22c55e';
        ctx.fillRect(0, y0, W, y1 - y0 + 1);
    }

    // 4. Crisp White 18-Yard Penalty Box & Penalty Arc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.lineWidth = 3;

    // Goal line
    ctx.beginPath();
    ctx.moveTo(0, goalLineY);
    ctx.lineTo(W, goalLineY);
    ctx.stroke();

    // Penalty box trapezoid
    const boxTopHalfW = W * 0.28;
    const boxBotHalfW = W * 0.44;
    const boxBotY = Math.round(H * 0.66);
    ctx.beginPath();
    ctx.moveTo(W / 2 - boxTopHalfW, goalLineY);
    ctx.lineTo(W / 2 - boxBotHalfW, boxBotY);
    ctx.lineTo(W / 2 + boxBotHalfW, boxBotY);
    ctx.lineTo(W / 2 + boxTopHalfW, goalLineY);
    ctx.stroke();

    // 6-yard box
    const sixTopW = W * 0.17;
    const sixBotW = W * 0.22;
    const sixBotY = Math.round(H * 0.45);
    ctx.beginPath();
    ctx.moveTo(W / 2 - sixTopW, goalLineY);
    ctx.lineTo(W / 2 - sixBotW, sixBotY);
    ctx.lineTo(W / 2 + sixBotW, sixBotY);
    ctx.lineTo(W / 2 + sixTopW, goalLineY);
    ctx.stroke();

    // Penalty spot & arc
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(W / 2, spotY, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 5. Goal Frame & Net at Goal Line
    const goalHalfW = Math.min(W * 0.21, 210);
    const goalH = Math.min(H * 0.24, 105);
    const goalTopY = goalLineY - goalH;
    const goalLeftX = W / 2 - goalHalfW;
    const goalRightX = W / 2 + goalHalfW;

    // Back net shading
    ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
    ctx.fillRect(goalLeftX, goalTopY, goalHalfW * 2, goalH);

    // Net mesh
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = goalLeftX; gx <= goalRightX; gx += 12) {
        ctx.moveTo(gx, goalTopY);
        ctx.lineTo(gx, goalLineY);
    }
    for (let gy = goalTopY; gy <= goalLineY; gy += 10) {
        ctx.moveTo(goalLeftX, gy);
        ctx.lineTo(goalRightX, gy);
    }
    ctx.stroke();

    // White Posts & Crossbar
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(goalLeftX, goalLineY);
    ctx.lineTo(goalLeftX, goalTopY);
    ctx.lineTo(goalRightX, goalTopY);
    ctx.lineTo(goalRightX, goalLineY);
    ctx.stroke();

    // 6. Glowing Note Targets Inside the Net (C, D, E, G, A)
    if (gamePhase === 'striker_aim' || gamePhase === 'striker_runup') {
        TARGETS.forEach(t => {
            const tx = W / 2 + t.nx * (goalHalfW - 18);
            const ty = goalLineY - t.ny * (goalH - 14);
            const isSelected = heldTargetNote === t.note;

            ctx.save();
            ctx.beginPath();
            ctx.arc(tx, ty, isSelected ? 17 : 14, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#22c55e' : 'rgba(250, 204, 21, 0.92)';
            ctx.shadowColor = isSelected ? '#22c55e' : '#000000';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#0f172a';
            ctx.stroke();

            ctx.fillStyle = isSelected ? '#ffffff' : '#0f172a';
            ctx.font = '900 14px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(t.note, tx, ty + 1);
            ctx.restore();
        });
    }

    // 7. Goalkeeper on the Goal Line
    const keeperX = W / 2 + goalie.nx * (goalHalfW - 18);
    const keeperY = goalLineY - goalie.ny * (goalH * 0.55);
    drawGoalkeeperFigure(ctx, keeperX, keeperY, 1.0, goalie.isDiving ? goalie.diveTargetNx : 0);

    // 8. Foreground Striker (Left of ball, runs up on kick!)
    const strikerX = W / 2 - 72 + strikerRunProgress * 52;
    const strikerY = spotY + 12 - strikerRunProgress * 10;
    drawStrikerFigure(ctx, strikerX, strikerY, 1.15, strikerRunProgress);

    // 9. Soccer Ball (Scales smoothly from penalty spot to goal line)
    const ballScreenX = W / 2 + ball.nx * (goalHalfW - 12) * Math.max(0.15, ball.t);
    const groundY = spotY + (goalLineY - spotY) * ball.t;
    const ballScreenY = groundY - ball.ny * (goalH * 0.92) * Math.max(0.25, ball.t);
    const ballRadius = 18 * (1 - ball.t * 0.52);
    drawSoccerBall(ctx, ballScreenX, ballScreenY, groundY, ballRadius, ball.spin);

    // 10. Power Meter Bar (Bottom right of penalty spot)
    if (gamePhase === 'striker_aim') {
        const barW = 190;
        const barH = 16;
        const barX = W / 2 - barW / 2;
        const barY = H - 26;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, '#facc15');
        grad.addColorStop(0.75, '#22c55e');
        grad.addColorStop(1, '#ef4444');
        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY, barW * powerMeter, barH);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
            heldTargetNote ? `TARGET "${heldTargetNote}" LOCKED — RELEASE TO KICK!` : 'HOLD C, D, E, G, OR A TO AIM & CHARGE',
            W / 2,
            barY - 7
        );
    }
}

// =========================================================================
// 2. GOALIE PERSPECTIVE (Inside the Net looking out at the Kicker)
// =========================================================================
function renderGoaliePerspective(ctx, W, H, now) {
    const horizonY = Math.round(H * 0.36);

    // 1. Stadium Stands across the pitch (Red & Royal Blue tiers)
    const standGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    standGrad.addColorStop(0, '#1e3a8a');
    standGrad.addColorStop(0.55, '#dc2626');
    standGrad.addColorStop(1, '#334155');
    ctx.fillStyle = standGrad;
    ctx.fillRect(0, 0, W, horizonY);

    // Stadium Roof Netting Pattern at top
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 28) {
        ctx.moveTo(W / 2 + (x - W / 2) * 0.65, 0);
        ctx.lineTo(x, horizonY * 0.45);
    }
    for (let y = 10; y <= horizonY * 0.45; y += 14) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
    }
    ctx.stroke();

    // 2. Lush Green Pitch from Goal Line out to Penalty Spot
    const pitchH = H - horizonY;
    for (let s = 0; s < 7; s++) {
        const y0 = horizonY + (pitchH * s) / 7;
        const y1 = horizonY + (pitchH * (s + 1)) / 7;
        ctx.fillStyle = s % 2 === 0 ? '#15803d' : '#22c55e';
        ctx.fillRect(0, y0, W, y1 - y0 + 1);
    }

    // Crisp White Goal Line across the foreground
    const fgGoalLineY = Math.round(H * 0.86);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, fgGoalLineY);
    ctx.lineTo(W, fgGoalLineY);
    ctx.stroke();

    // 3. Distant Opponent Striker at Penalty Spot
    const spotY = Math.round(H * 0.44);
    drawStrikerFigure(ctx, W / 2 - 22, spotY, 0.58, gamePhase === 'goalie_defend' ? 1 : 0);

    // 4. Soccer Ball Flying Toward the Camera (ball.t goes 1 -> 0)
    const approach = 1 - ball.t; // 0 at spot -> 1 at goal line
    const goalFrameHalfW = W * 0.40;
    const ballScreenX = W / 2 + ball.nx * goalFrameHalfW * Math.max(0.15, approach);
    const groundY = spotY + (fgGoalLineY - spotY) * approach;
    const ballScreenY = groundY - ball.ny * (H * 0.52) * Math.max(0.25, approach);
    const ballRadius = 8 + approach * 16;
    drawSoccerBall(ctx, ballScreenX, ballScreenY, groundY, ballRadius, ball.spin);

    // 5. Foreground White Goalposts Framing the Screen Edges
    const postMarginX = Math.round(W * 0.08);
    const crossbarY = Math.round(H * 0.20);

    // Side net mesh
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let ny = crossbarY; ny <= fgGoalLineY; ny += 14) {
        ctx.moveTo(0, ny);
        ctx.lineTo(postMarginX, ny);
        ctx.moveTo(W - postMarginX, ny);
        ctx.lineTo(W, ny);
    }
    ctx.stroke();

    // Thick white frame
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(postMarginX, fgGoalLineY + 6);
    ctx.lineTo(postMarginX, crossbarY);
    ctx.lineTo(W - postMarginX, crossbarY);
    ctx.lineTo(W - postMarginX, fgGoalLineY + 6);
    ctx.stroke();

    // 6. Detailed Goalkeeper Gloves in Foreground
    const gloveX = W / 2 + goalie.nx * (goalFrameHalfW * 0.88);
    const gloveY = H * 0.72 - goalie.ny * (H * 0.42);
    drawGoalkeeperGloves(ctx, gloveX, gloveY, goalie.nx);

    // Control prompt
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(W / 2 - 210, H - 24, 420, 20);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '800 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OCTAVE 1 = DIVE LEFT   •   OCTAVE 2 = CENTER JUMP   •   OCTAVE 3 = DIVE RIGHT', W / 2, H - 10);
}

// =========================================================================
// CHARACTER, BALL & GLOVE SPRITE HELPERS
// =========================================================================
function drawStrikerFigure(ctx, x, y, scale, runPhase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    const kickSwing = runPhase > 0.7 ? -10 : Math.sin(runPhase * 12) * 4;

    // Legs & Red Socks
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(-7, -22, 5, 10);
    ctx.fillRect(2, -22 + kickSwing * 0.4, 5, 10);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-7, -12, 5, 10);
    ctx.fillRect(2, -12 + kickSwing * 0.4, 5, 10);
    // Cleats
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-7, -3, 7, 3);
    ctx.fillRect(2, -3 + kickSwing * 0.4, 7, 3);

    // White Shorts
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-9, -31, 18, 10);

    // Red & Black Striped Jersey (AC Milan style)
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-10, -52, 20, 22);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-6, -52, 4, 22);
    ctx.fillRect(2, -52, 4, 22);

    // Arms
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(-14, -50, 4, 16);
    ctx.fillRect(10, -50, 4, 16);

    // Head & Blonde Hair
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, -60, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(0, -62, 7.5, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawGoalkeeperFigure(ctx, x, y, scale, diveTilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.rotate(diveTilt * 0.65);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs & Socks
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(-9, -24, 18, 9);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-8, -15, 5, 13);
    ctx.fillRect(3, -15, 5, 13);

    // Orange Keeper Jersey
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-11, -44, 22, 21);

    // Outstretched Arms & Gloves
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-22, -46, 11, 5);
    ctx.fillRect(11, -46, 11, 5);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-24, -44, 4, 0, Math.PI * 2);
    ctx.arc(24, -44, 4, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, -51, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(0, -53, 6.8, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawGoalkeeperGloves(ctx, cx, cy, diveDir) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(diveDir * 0.25);

    const drawSingleGlove = (offsetX, flip) => {
        ctx.save();
        ctx.translate(offsetX, 0);
        ctx.scale(flip, 1);

        // Wrist strap
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-14, 14, 28, 12);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(-12, 17, 24, 5);

        // Palm
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-18, -14, 36, 30, 8);
        ctx.fill();
        ctx.stroke();

        // Dark grip zone
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.roundRect(-12, -8, 24, 18, 5);
        ctx.fill();

        // 4 Fingers
        ctx.fillStyle = '#f8fafc';
        for (let f = 0; f < 4; f++) {
            const fx = -16 + f * 8.5;
            ctx.beginPath();
            ctx.roundRect(fx, -32, 7, 20, 3.5);
            ctx.fill();
            ctx.stroke();
        }

        // Thumb
        ctx.beginPath();
        ctx.roundRect(16, -6, 12, 7, 3.5);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    };

    drawSingleGlove(-26, 1);
    drawSingleGlove(26, -1);
    ctx.restore();
}

function drawSoccerBall(ctx, x, y, groundY, radius, spin) {
    const r = Math.max(5, radius);

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(x, groundY + 2, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y - r);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    // White leather base
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r, -r, r * 2, r * 2);

    ctx.rotate(spin);

    // Center & outer pentagons
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 5; i++) {
        const ang = (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * r * 0.86, Math.sin(ang) * r * 0.86, r * 0.32, 0, Math.PI * 2);
        ctx.fill();
    }

    // Subtle spherical shading
    const shade = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    shade.addColorStop(0, 'rgba(255, 255, 255, 0)');
    shade.addColorStop(1, 'rgba(15, 23, 42, 0.35)');
    ctx.fillStyle = shade;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    ctx.restore();
}

// =========================================================================
// 3. WORLD CUP SHOOTOUT SCOREBOARD HUD
// =========================================================================
function renderWorldCupScoreboardHUD(ctx, W) {
    ctx.save();

    // Top-Left Shootout Scoreboard Pill (Matches your reference layout)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(12, 10, 245, 46, 8);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const playerGoals = playerHistory.filter(r => r === 'goal').length;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 12px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`YOU (${playerGoals})`, 22, 26);
    ctx.fillText(`CPU (${aiScore})`, 22, 44);

    // 5 Penalty Shot Indicator Circles per team
    for (let i = 0; i < MAX_ROUNDS; i++) {
        const cx = 112 + i * 24;

        // Player dot
        ctx.beginPath();
        ctx.arc(cx, 22, 7, 0, Math.PI * 2);
        ctx.fillStyle = playerHistory[i] === 'goal' ? '#22c55e' : (playerHistory[i] === 'miss' ? '#ef4444' : '#334155');
        ctx.fill();

        // CPU dot
        ctx.beginPath();
        ctx.arc(cx, 40, 7, 0, Math.PI * 2);
        ctx.fillStyle = aiHistory[i] === 'goal' ? '#22c55e' : (aiHistory[i] === 'miss' ? '#ef4444' : '#334155');
        ctx.fill();
    }

    // Top-Right Points & Round Pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(W - 185, 10, 173, 42, 8);
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#facc15';
    ctx.font = '900 15px monospace';
    ctx.fillText(`PTS: ${String(playerScore).padStart(4, '0')}`, W - 22, 27);

    ctx.fillStyle = '#93c5fd';
    ctx.font = '800 11px -apple-system, sans-serif';
    ctx.fillText(`ROUND ${Math.min(currentRound, MAX_ROUNDS)} / ${MAX_ROUNDS}`, W - 22, 43);

    ctx.restore();
}
