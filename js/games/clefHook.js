import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let lastFrameTime = 0;
let gamePhase = 'instructions'; // 'instructions' | 'playing' | 'stageclear' | 'dying' | 'gameover'

let score = 0;
let stage = 1;
let hooksUsed = 0;
let flipsCount = 0;
let multiplier = 1;
let bestScore = parseInt(localStorage.getItem('pianopad_clef_hook_best') || '0', 10);

let cameraX = 0;
let shakeTimer = 0;
let flashAlpha = 0;
let bannerText = '';
let bannerColor = '#ffffff';
let bannerTimer = 0;

// Currently held note tracking (supports keyboard, mouse/touch on piano keys, and MIDI)
let heldNoteLetter = null;
let heldFullNote = null;

// Articulated Stickman Character
const player = {
    x: 110,
    y: 150,
    vx: 240,
    vy: -60,
    radius: 13,
    hookedNode: null,
    ropeLength: 140,
    latchTimer: 0,
    isTucked: false,
    spinAngle: 0,
    spinVelocity: 0,
    flipAccumulator: 0,
    limbPhase: 0,
    dancePhase: 0,
    trail: []
};

let nodes = [];
let lasers = [];
let bumpers = [];
let particles = [];
let finishX = 2200;

const SCALE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Vibrant Madbox Stickman Hook Stage Palettes
const STAGE_THEMES = [
    { bgTop: '#ff6b6b', bgBot: '#ee5253', accent: '#ffeaa7', pillar: 'rgba(255,255,255,0.10)', name: 'CORAL CANYON' },
    { bgTop: '#0abde3', bgBot: '#2e86de', accent: '#feca57', pillar: 'rgba(255,255,255,0.11)', name: 'SKYLINE SKY' },
    { bgTop: '#10ac84', bgBot: '#01a3a4', accent: '#ffdd59', pillar: 'rgba(255,255,255,0.10)', name: 'MINT GORGE' },
    { bgTop: '#8854d0', bgBot: '#5f27cd', accent: '#48dbfb', pillar: 'rgba(255,255,255,0.10)', name: 'ULTRAVIOLET' },
    { bgTop: '#ff9f43', bgBot: '#e55039', accent: '#ffffff', pillar: 'rgba(255,255,255,0.12)', name: 'SUNSET RIDGE' }
];

// --- KEYBOARD / POINTER RELEASE & SPACEBAR INTERCEPTORS ---
function preventSpaceBar(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
    }
}

function onGlobalKeyUp(e) {
    if (gamePhase !== 'playing' || !heldNoteLetter) return;
    // Check if any on-screen piano key is still actively held down
    const stillActive = document.querySelector('#keyboard .key.active');
    if (!stillActive) {
        releaseGrappleHook();
    }
}

function onGlobalPointerUp() {
    if (gamePhase !== 'playing' || !heldNoteLetter) return;
    // Defer 1 tick so PianoPad's own mouseup/touchend removes .active first
    setTimeout(() => {
        if (gamePhase === 'playing' && heldNoteLetter && !document.querySelector('#keyboard .key.active')) {
            releaseGrappleHook();
        }
    }, 10);
}

// --- STICKMAN HOOK ARCADE SOUND EFFECTS ---
function playHookSfx(type) {
    try {
        initAudio();
        const now = audioCtx.currentTime;

        if (type === 'latch') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(340, now);
            osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
            gain.gain.setValueAtTime(0.09, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.095);
        } else if (type === 'release') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(480, now);
            osc.frequency.exponentialRampToValueAtTime(920, now + 0.11);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.13);
        } else if (type === 'spin') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.exponentialRampToValueAtTime(1040, now + 0.12);
            gain.gain.setValueAtTime(0.07, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.14);
        } else if (type === 'bumper') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(680, now + 0.16);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.19);
        } else if (type === 'clear') {
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((f, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, now + idx * 0.06);
                gain.gain.setValueAtTime(0.09, now + idx * 0.06);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.22);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.06);
                osc.stop(now + idx * 0.06 + 0.24);
            });
        } else if (type === 'crash') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(190, now);
            osc.frequency.exponentialRampToValueAtTime(42, now + 0.28);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.31);
        }
    } catch (e) {}
}

export function stopClefHook() {
    if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    gamePhase = 'gameover';
    heldNoteLetter = null;
    heldFullNote = null;

    window.removeEventListener('keydown', preventSpaceBar, { capture: true });
    window.removeEventListener('keyup', onGlobalKeyUp, { capture: true });
    window.removeEventListener('mouseup', onGlobalPointerUp, { capture: true });
    window.removeEventListener('touchend', onGlobalPointerUp, { capture: true });

    const popup = document.getElementById('clef-hook-popup');
    if (popup) popup.style.display = 'none';
}

export function startClefHook(bridge) {
    initAudio();
    stopClefHook();
    bridge.exitActiveMiniGame();
    document.getElementById('game-results-modal')?.classList.remove('open');
    document.getElementById('arcade-hub')?.classList.remove('open');
    bridge.setActiveMiniGame('clefHook');
    bridge.resetGameStats();

    window.addEventListener('keydown', preventSpaceBar, { capture: true });
    window.addEventListener('keyup', onGlobalKeyUp, { capture: true });
    window.addEventListener('mouseup', onGlobalPointerUp, { capture: true });
    window.addEventListener('touchend', onGlobalPointerUp, { capture: true });

    score = 0;
    stage = 1;
    hooksUsed = 0;
    flipsCount = 0;
    multiplier = 1;
    particles = [];
    shakeTimer = 0;
    flashAlpha = 0;
    bannerTimer = 0;

    buildStage(1);

    document.getElementById('status').textContent =
        '🕷️ Clef Hook: HOLD a Grapple Node’s Note Letter to swing • RELEASE to launch • Tap ANY Black Key for a High-Speed Spin!';

    gamePhase = 'instructions';
    showInstructionsPopup(bridge);
}

function showInstructionsPopup(bridge) {
    let popup = document.getElementById('clef-hook-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'clef-hook-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(15, 23, 42, 0.96);
            border: 4px solid #ff6b6b;
            border-radius: 16px;
            padding: 24px;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            z-index: 9999;
            width: 88%;
            max-width: 430px;
            box-shadow: 0 18px 45px rgba(0, 0, 0, 0.75);
            text-align: center;
        `;
        document.body.appendChild(popup);
    }

    popup.innerHTML = `
        <div style="margin-bottom: 14px;">
            <div style="font-size: 38px; line-height: 1; margin-bottom: 6px;">🕷️🎵</div>
            <h2 style="
                margin: 0;
                font-size: 30px;
                font-weight: 900;
                letter-spacing: 1px;
                color: #ffeaa7;
                text-shadow: 0 3px 0 #d63031;
                text-transform: uppercase;
            ">Clef Hook</h2>
            <div style="font-size: 12px; color: #ff7675; font-weight: 800; letter-spacing: 1.5px; margin-top: 2px;">
                STICKMAN SWING EDITION
            </div>
        </div>

        <div style="background: rgba(255,255,255,0.07); border-radius: 10px; padding: 14px; text-align: left; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
            <div style="margin-bottom: 7px;"><b>🪝 HOLD NODE NOTE:</b> Latch your grapple rope onto the matching overhead node & swing!</div>
            <div style="margin-bottom: 7px;"><b>🚀 RELEASE KEY:</b> Let go at the peak of your arc to launch across the chasm!</div>
            <div style="margin-bottom: 7px;"><b>🌀 BLACK KEY (#):</b> Tuck into a high-speed spin flip (or launch-spin off a rope)!</div>
            <div><b>🚨 DODGE LASERS:</b> Avoid red laser beams & use bouncy bumpers to reach the checkered finish!</div>
        </div>

        <button id="btn-start-clef-hook" style="
            background: #22c55e; color: #ffffff; border: none; padding: 14px 24px;
            font-size: 17px; font-weight: 900; border-radius: 10px; cursor: pointer;
            box-shadow: 0 5px 0 #15803d; width: 100%; text-transform: uppercase; letter-spacing: 0.5px;
        ">▶ Start Swinging!</button>
    `;

    popup.style.display = 'block';

    const btn = document.getElementById('btn-start-clef-hook');
    btn.onclick = () => {
        popup.style.display = 'none';
        gamePhase = 'playing';
        lastFrameTime = performance.now();
        if (animFrameId === null) {
            animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));
        }
    };
}

function buildStage(stageNum) {
    nodes = [];
    lasers = [];
    bumpers = [];
    heldNoteLetter = null;
    heldFullNote = null;

    const canvas = document.getElementById('waterfall-canvas');
    const H = canvas ? canvas.height : 380;

    // Reset stickman on the opening spring launch pad
    player.x = 110;
    player.y = 145;
    player.vx = 255 + Math.min(85, (stageNum - 1) * 14);
    player.vy = -125;
    player.hookedNode = null;
    player.ropeLength = 145;
    player.latchTimer = 0;
    player.isTucked = false;
    player.spinAngle = 0;
    player.spinVelocity = 0;
    player.flipAccumulator = 0;
    player.trail = [];
    cameraX = 0;

    // Place a bouncy starter trampoline right under spawn so beginners never drop immediately
    bumpers.push({
        x: 135,
        y: H - 54,
        radius: 26,
        squash: 0,
        bounceVy: -430,
        bounceVx: 245
    });

    const nodeCount = 7 + Math.min(6, stageNum);
    let cursorX = 275;
    let lastLetter = '';

    for (let i = 0; i < nodeCount; i++) {
        // Pick a note letter distinct from the previous node so students read and switch keys
        const candidates = SCALE_LETTERS.filter(l => l !== lastLetter);
        const letter = candidates[Math.floor(Math.random() * candidates.length)];
        lastLetter = letter;

        const nodeY = 66 + ((i % 2 === 0) ? 0 : 28) + Math.floor(Math.random() * 26);
        nodes.push({
            id: i,
            x: cursorX,
            y: nodeY,
            note: letter,
            range: 255,
            pulse: i * 0.7,
            used: false
        });

        // Add iconic Stickman Hook Bouncy Bumper Pads beneath gaps
        if (i % 2 === 1 && i < nodeCount - 1) {
            bumpers.push({
                x: cursorX + 125,
                y: H - 58 - (i % 3) * 14,
                radius: 24,
                squash: 0,
                bounceVy: -445,
                bounceVx: 275
            });
        }

        // Add Red Laser Barriers between nodes (starting from node 1, escalating with stage)
        if (i >= 1 && i < nodeCount - 1) {
            const laserX = cursorX + 128;
            const pattern = (i + stageNum) % 3;

            if (pattern === 0) {
                // High ceiling laser forcing a low swing arc
                lasers.push({
                    x1: laserX,
                    y1: 24,
                    x2: laserX,
                    y2: 148 + Math.min(28, stageNum * 4),
                    phase: i * 1.1,
                    moveAmp: stageNum >= 2 ? 18 : 0
                });
            } else if (pattern === 1) {
                // Low chasm laser forcing a high release arc
                lasers.push({
                    x1: laserX,
                    y1: H - 155 - Math.min(25, stageNum * 4),
                    x2: laserX,
                    y2: H - 22,
                    phase: i * 1.5,
                    moveAmp: stageNum >= 3 ? 16 : 0
                });
            } else if (stageNum >= 2) {
                // Angled floating laser gate in the middle
                lasers.push({
                    x1: laserX - 18,
                    y1: 145,
                    x2: laserX + 18,
                    y2: 225,
                    phase: i * 0.9,
                    moveAmp: 22
                });
            }
        }

        cursorX += 255 + Math.floor(Math.random() * 40);
    }

    finishX = cursorX + 90;
    const theme = STAGE_THEMES[(stageNum - 1) % STAGE_THEMES.length];
    triggerBanner(`STAGE ${stageNum}: ${theme.name}`, theme.accent, 1.35);
}

function triggerBanner(text, color = '#ffeaa7', duration = 1.25) {
    bannerText = text;
    bannerColor = color;
    bannerTimer = duration;
}

function spawnVectorParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const spd = 70 + Math.random() * 190;
        particles.push({
            x,
            y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            radius: 3 + Math.random() * 3.5,
            color,
            life: 1.0
        });
    }
}

function releaseGrappleHook(withSpinBoost = false) {
    if (!player.hookedNode) {
        heldNoteLetter = null;
        heldFullNote = null;
        return;
    }

    const node = player.hookedNode;
    player.hookedNode = null;
    heldNoteLetter = null;
    heldFullNote = null;

    // Tangential launch boost like Stickman Hook
    player.vx = Math.max(210, player.vx * 1.14);
    player.vy = Math.min(player.vy - 55, Math.max(-390, player.vy * 1.12));

    if (withSpinBoost) {
        player.isTucked = true;
        player.vx += 65;
        player.vy -= 45;
        player.spinVelocity = 15.5;
        playHookSfx('spin');
        spawnVectorParticles(player.x, player.y, '#facc15', 10);
    } else {
        playHookSfx('release');
        spawnVectorParticles(node.x, node.y, '#ffffff', 6);
    }
}

export function handleClefHookInput(noteStr, bridge) {
    if (gamePhase !== 'playing') return;

    const match = (noteStr || '').trim().toLowerCase().match(/^([a-g])(#?)([0-9]+)$/);
    if (!match) return;

    const letter = match[1].toUpperCase();
    const isSharp = match[2] === '#';

    // 1. BLACK KEY (#): Tuck into a high-speed Stickman Hook spin!
    if (isSharp) {
        if (player.hookedNode) {
            // Release rope directly into a turbo spin!
            releaseGrappleHook(true);
            bridge.highlightKey(noteStr, 220, '#facc15');
        } else {
            player.isTucked = true;
            player.spinVelocity = Math.max(player.spinVelocity, 16.0);
            // Subtle mid-air spin hop/glide control
            player.vx = Math.max(player.vx, 245);
            if (player.vy > 80) player.vy *= 0.78;
            playHookSfx('spin');
            bridge.highlightKey(noteStr, 220, '#ec4899');
            spawnVectorParticles(player.x, player.y, '#ec4899', 8);
        }
        return;
    }

    // 2. WHITE KEY (A-G): Find the nearest reachable Grapple Node matching this Note Letter!
    let bestNode = null;
    let bestScore = Infinity;

    for (const node of nodes) {
        if (node.note !== letter) continue;
        const dx = node.x - player.x;
        const dy = node.y - player.y;
        const dist = Math.hypot(dx, dy);

        // Generous grapple range, prioritizing forward nodes in front of the stickman
        if (dist <= node.range * 1.22 && dx > -160) {
            const forwardBias = dx >= -20 ? 0 : 180;
            const candidateCost = dist + forwardBias;
            if (candidateCost < bestScore) {
                bestScore = candidateCost;
                bestNode = node;
            }
        }
    }

    if (bestNode) {
        player.hookedNode = bestNode;
        player.isTucked = false;
        player.spinVelocity = 0;
        heldNoteLetter = letter;
        heldFullNote = noteStr;

        const dist = Math.hypot(player.x - bestNode.x, player.y - bestNode.y);
        player.ropeLength = Math.max(68, Math.min(210, dist * 0.92));
        player.latchTimer = 0.14;

        // Ensure forward swing momentum if player latched while falling straight down
        if (player.vx < 190) player.vx = 215;

        if (!bestNode.used) {
            bestNode.used = true;
            hooksUsed++;
            score += 50 * multiplier;
        }

        playHookSfx('latch');
        bridge.highlightKey(noteStr, 300, '#22c55e');
        spawnVectorParticles(bestNode.x, bestNode.y, '#22c55e', 10);
    } else {
        // Missed note (no matching node in range)
        bridge.highlightKey(noteStr, 150, '#ef4444');
    }
}

function triggerStageClear(bridge) {
    if (gamePhase !== 'playing') return;
    gamePhase = 'stageclear';
    player.hookedNode = null;
    heldNoteLetter = null;
    heldFullNote = null;
    player.isTucked = false;
    player.vx = 90;
    player.vy = -160;

    const stageBonus = 300 * multiplier;
    score += stageBonus;
    multiplier = Math.min(5, multiplier + 1);
    playHookSfx('clear');
    spawnVectorParticles(finishX, 180, '#facc15', 26);
    triggerBanner(`STAGE ${stage} CLEAR! +${stageBonus}`, '#22c55e', 1.4);

    setTimeout(() => {
        if (bridge.getActiveMiniGame() !== 'clefHook') return;
        stage++;
        buildStage(stage);
        gamePhase = 'playing';
    }, 1450);
}

function triggerCrash(reasonText, bridge) {
    if (gamePhase !== 'playing') return;
    gamePhase = 'dying';
    player.hookedNode = null;
    heldNoteLetter = null;
    heldFullNote = null;
    shakeTimer = 0.38;
    flashAlpha = 0.75;
    playHookSfx('crash');
    spawnVectorParticles(player.x, player.y, '#ffffff', 22);
    triggerBanner(reasonText, '#ef4444', 1.2);

    const finalScore = Math.floor(score);
    if (finalScore > bestScore) {
        bestScore = finalScore;
        localStorage.setItem('pianopad_clef_hook_best', String(bestScore));
    }

    setTimeout(() => {
        if (bridge.getActiveMiniGame() !== 'clefHook') return;
        stopClefHook();
        bridge.finishCustomMiniGame(
            'Clef Hook',
            finalScore,
            `<span style="color:#ff7675; font-weight:800;">${reasonText}</span><br>` +
            `Swing Score: <span style="color:#22c55e; font-size:1.45rem; font-weight:900;">${finalScore}</span><br>` +
            `<span style="font-size:0.85rem; color:#facc15;">🏁 Stage ${stage}  •  🪝 Hooks: ${hooksUsed}  •  🌀 Flips: ${flipsCount}  •  🏆 Best: ${bestScore}</span>`,
            () => startClefHook(bridge)
        );
    }, 950);
}

function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
}

function gameLoop(now, bridge) {
    if (bridge.getActiveMiniGame() !== 'clefHook') {
        stopClefHook();
        return;
    }

    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    const canvas = document.getElementById('waterfall-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
    if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 2.4);
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    // Check if held piano key was released on screen (fallback safety for touch/mouse)
    if (gamePhase === 'playing' && player.hookedNode && heldNoteLetter) {
        const anyActiveKey = document.querySelector('#keyboard .key.active');
        if (!anyActiveKey && player.latchTimer <= 0) {
            // Only auto-release if a DOM key was used and is no longer active
            if (window.__clefHookUsedDomKey) {
                window.__clefHookUsedDomKey = false;
                releaseGrappleHook();
            }
        }
    }

    // --- UPDATE STICKMAN HOOK PHYSICS ---
    if (gamePhase === 'playing') {
        const gravity = 740;
        if (player.latchTimer > 0) player.latchTimer = Math.max(0, player.latchTimer - dt);

        if (player.hookedNode) {
            const node = player.hookedNode;
            // Apply gravity
            player.vy += gravity * dt;

            // Integrate candidate position
            player.x += player.vx * dt;
            player.y += player.vy * dt;

            // Constrain to circular pendulum rope around node
            const dx = player.x - node.x;
            const dy = player.y - node.y;
            const dist = Math.hypot(dx, dy) || 1;
            const ux = dx / dist;
            const uy = dy / dist;

            // Reel in slightly on initial snap for crisp upward Spider-Man swing
            if (dist > player.ropeLength) {
                player.x = node.x + ux * player.ropeLength;
                player.y = node.y + uy * player.ropeLength;

                // Remove outward radial velocity component
                const radialVel = player.vx * ux + player.vy * uy;
                if (radialVel > 0) {
                    player.vx -= radialVel * ux;
                    player.vy -= radialVel * uy;
                }
            }

            // Forward pendulum drive assist so holding a hook smoothly propels you forward
            const tangentX = -uy;
            const tangentY = ux;
            if (tangentX > 0) {
                player.vx += tangentX * 260 * dt;
                player.vy += tangentY * 260 * dt;
            }

            // Align character body angle with rope
            player.spinAngle = Math.atan2(dy, dx) - Math.PI / 2;
            player.limbPhase += dt * 10;
        } else {
            // Free-flight projectile physics
            player.vy += gravity * dt;
            const drag = player.isTucked ? 0.994 : 0.988;
            player.vx *= Math.pow(drag, dt * 60);

            player.x += player.vx * dt;
            player.y += player.vy * dt;

            if (player.isTucked) {
                const deltaSpin = player.spinVelocity * dt;
                player.spinAngle += deltaSpin;
                player.flipAccumulator += Math.abs(deltaSpin);

                // Award full 360-degree flip bonus!
                if (player.flipAccumulator >= Math.PI * 2) {
                    player.flipAccumulator -= Math.PI * 2;
                    flipsCount++;
                    const flipPts = 50 * multiplier;
                    score += flipPts;
                    triggerBanner(`360° SPIN FLIP! +${flipPts}`, '#facc15', 0.75);
                }
            } else {
                player.spinAngle = Math.atan2(player.vy, player.vx) * 0.45;
                player.limbPhase += dt * 14;
            }
        }

        // Ceiling soft bounce so stickman stays visible in frame
        if (player.y < 22) {
            player.y = 22;
            if (player.vy < 0) player.vy *= -0.45;
        }

        // Bouncy Trampoline Bumpers collision
        for (const bmp of bumpers) {
            if (bmp.squash > 0) bmp.squash = Math.max(0, bmp.squash - dt * 4);
            const dist = Math.hypot(player.x - bmp.x, player.y - bmp.y);
            if (dist < player.radius + bmp.radius) {
                player.hookedNode = null;
                heldNoteLetter = null;
                heldFullNote = null;
                player.isTucked = true;
                player.spinVelocity = 14.0;
                player.y = bmp.y - (player.radius + bmp.radius + 2);
                player.vy = bmp.bounceVy;
                player.vx = Math.max(player.vx, bmp.bounceVx);
                bmp.squash = 1.0;
                score += 25 * multiplier;
                playHookSfx('bumper');
                spawnVectorParticles(bmp.x, bmp.y - bmp.radius, '#facc15', 10);
            }
        }

        // Red Laser Barriers collision
        for (const lsr of lasers) {
            const offsetY = lsr.moveAmp ? Math.sin(now / 360 + lsr.phase) * lsr.moveAmp : 0;
            const d = distToSegment(player.x, player.y, lsr.x1, lsr.y1 + offsetY, lsr.x2, lsr.y2 + offsetY);
            if (d < player.radius + 5) {
                triggerCrash('ZAPPED BY LASER!', bridge);
                break;
            }
        }

        // Chasm fall check
        if (gamePhase === 'playing' && player.y > H + 12) {
            triggerCrash('FELL INTO THE CHASM!', bridge);
        }

        // Checkered Finish Line check
        if (gamePhase === 'playing' && player.x >= finishX) {
            triggerStageClear(bridge);
        }

        // Distance score ticker
        score += Math.max(0, player.vx * dt * 0.08 * multiplier);

        // Motion trail
        player.trail.push({ x: player.x, y: player.y, tucked: player.isTucked });
        if (player.trail.length > 14) player.trail.shift();

        // Smooth forward camera tracking
        const targetCamX = Math.max(0, player.x - W * 0.28);
        cameraX += (targetCamX - cameraX) * Math.min(1, dt * 8);
    } else if (gamePhase === 'stageclear') {
        // Victory bounce & dance past the finish line!
        player.vy += 650 * dt;
        player.x += player.vx * dt;
        player.y = Math.min(H - 55, player.y + player.vy * dt);
        if (player.y >= H - 55) {
            player.vy = -210;
        }
        player.dancePhase += dt * 16;
    }

    // Update nodes & particles
    nodes.forEach(n => { n.pulse += dt * 3.5; });
    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 320 * dt;
        pt.life -= dt * 2.1;
        if (pt.life <= 0) particles.splice(i, 1);
    }

    // =========================================================================
    // RENDER MINIMALIST STICKMAN HOOK VECTOR GRAPHICS
    // =========================================================================
    ctx.save();
    if (shakeTimer > 0) {
        const mag = shakeTimer * 14;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    const theme = STAGE_THEMES[(stage - 1) % STAGE_THEMES.length];

    // 1. Vibrant Stickman Hook Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, theme.bgTop);
    bgGrad.addColorStop(1, theme.bgBot);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Parallax Geometric Background Pillars (depth & speed cue)
    ctx.fillStyle = theme.pillar;
    const parallaxOffset = (cameraX * 0.35) % 240;
    for (let px = -parallaxOffset; px < W + 240; px += 240) {
        ctx.beginPath();
        ctx.roundRect(px + 30, 55, 75, H - 55, [38, 38, 0, 0]);
        ctx.fill();
    }

    // Glowing Red Chasm Hazard Strip along bottom edge
    const chasmGrad = ctx.createLinearGradient(0, H - 24, 0, H);
    chasmGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
    chasmGrad.addColorStop(1, 'rgba(185, 28, 28, 0.78)');
    ctx.fillStyle = chasmGrad;
    ctx.fillRect(0, H - 24, W, 24);

    ctx.save();
    ctx.translate(-cameraX, 0);

    // 3. Checkered Finish Tape Line
    drawCheckeredFinishLine(ctx, finishX, H);

    // 4. Bouncy Trampoline Bumper Pads
    bumpers.forEach(bmp => drawBouncyBumper(ctx, bmp));

    // 5. Red Laser Barriers
    lasers.forEach(lsr => drawRedLaserBarrier(ctx, lsr, now));

    // 6. Overhead Grapple Nodes with Note Letters & Range Rings
    nodes.forEach(node => {
        const dist = Math.hypot(player.x - node.x, player.y - node.y);
        const inRange = dist <= node.range * 1.22 && (node.x - player.x) > -160;
        const isHooked = player.hookedNode && player.hookedNode.id === node.id;
        drawGrappleNode(ctx, node, inRange, isHooked);
    });

    // 7. Elastic Grapple Rope
    if (player.hookedNode && gamePhase === 'playing') {
        drawGrappleRope(ctx, player.x, player.y, player.hookedNode.x, player.hookedNode.y, player.latchTimer);
    }

    // 8. Stickman Motion Trail & Articulated Stickman Character
    if (gamePhase !== 'dying') {
        drawStickmanTrail(ctx, player.trail);
        drawStickmanHero(ctx, player, theme);
    }

    // 9. Vector Spark Particles
    particles.forEach(pt => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    ctx.restore();

    // 10. Clean Stickman Hook HUD
    drawClefHookHUD(ctx, W, H, theme);

    if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();

    if (gamePhase !== 'gameover') {
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}

function drawGrappleNode(ctx, node, inRange, isHooked) {
    ctx.save();

    // Dashed circular grapple range indicator (classic Stickman Hook style)
    const ringRadius = isHooked ? 34 : (inRange ? 30 + Math.sin(node.pulse) * 3 : 24);
    ctx.beginPath();
    ctx.setLineDash([5, 5]);
    ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
    ctx.lineWidth = isHooked ? 3 : 2;
    ctx.strokeStyle = isHooked ? '#22c55e' : (inRange ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.35)');
    ctx.stroke();
    ctx.setLineDash([]);

    // Outer white circle pin
    ctx.beginPath();
    ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = isHooked ? '#22c55e' : (inRange ? '#ffffff' : 'rgba(255, 255, 255, 0.85)');
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 8;
    ctx.fill();

    // Inner dark ring
    ctx.beginPath();
    ctx.arc(node.x, node.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = isHooked ? '#14532d' : (inRange ? '#0f172a' : '#334155');
    ctx.fill();

    // Bold Note Letter inside node
    ctx.fillStyle = isHooked ? '#4ade80' : (inRange ? '#facc15' : '#ffffff');
    ctx.font = '900 17px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.note, node.x, node.y + 1);

    ctx.restore();
}

function drawGrappleRope(ctx, x1, y1, x2, y2, latchTimer) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    if (latchTimer > 0) {
        // Subtle elastic wave right as the grapple latches
        const midX = (x1 + x2) / 2 + Math.sin(latchTimer * 90) * 10;
        const midY = (y1 + y2) / 2 + Math.cos(latchTimer * 90) * 10;
        ctx.quadraticCurveTo(midX, midY, x2, y2);
    } else {
        ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.restore();
}

function drawBouncyBumper(ctx, bmp) {
    ctx.save();
    const scaleX = 1 + bmp.squash * 0.28;
    const scaleY = 1 - bmp.squash * 0.25;
    ctx.translate(bmp.x, bmp.y);
    ctx.scale(scaleX, scaleY);

    // Outer bounce halo
    ctx.beginPath();
    ctx.arc(0, 0, bmp.radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fill();

    // Bright yellow/orange bouncy pad
    ctx.beginPath();
    ctx.arc(0, 0, bmp.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Upward chevron icon
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, 3);
    ctx.lineTo(0, -5);
    ctx.lineTo(7, 3);
    ctx.stroke();

    ctx.restore();
}

function drawRedLaserBarrier(ctx, lsr, now) {
    const offsetY = lsr.moveAmp ? Math.sin(now / 360 + lsr.phase) * lsr.moveAmp : 0;
    const y1 = lsr.y1 + offsetY;
    const y2 = lsr.y2 + offsetY;

    ctx.save();
    // Outer red laser glow
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lsr.x1, y1);
    ctx.lineTo(lsr.x2, y2);
    ctx.stroke();

    // Core hot white-red beam
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(lsr.x1, y1);
    ctx.lineTo(lsr.x2, y2);
    ctx.stroke();

    // Dark emitter caps on ends
    [
        { x: lsr.x1, y: y1 },
        { x: lsr.x2, y: y2 }
    ].forEach(pt => {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();
}

function drawCheckeredFinishLine(ctx, fx, H) {
    ctx.save();
    const sqSize = 12;
    const cols = 2;
    const rows = Math.ceil(H / sqSize);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#0f172a';
            ctx.fillRect(fx + c * sqSize, r * sqSize, sqSize, sqSize);
        }
    }

    // "FINISH" vertical banner pill
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(fx - 26, 16, 76, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.font = '900 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH 🏁', fx + 12, 31);

    ctx.restore();
}

function drawStickmanTrail(ctx, trail) {
    for (let i = 0; i < trail.length; i++) {
        const pt = trail[i];
        const ratio = (i + 1) / trail.length;
        ctx.save();
        ctx.globalAlpha = ratio * 0.32;
        ctx.fillStyle = pt.tucked ? '#facc15' : '#ffffff';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, ratio * (pt.tucked ? 10 : 6), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawStickmanHero(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spinAngle);

    if (p.isTucked) {
        // Iconic Stickman Hook curled-up spinning ball with motion ring!
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 1.4);
        ctx.stroke();

        // Curled white stickman body
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
        ctx.fill();

        // Red headband stripe spinning inside ball
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-9, -3, 18, 4);

        // Dark eye dot
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(4, -5, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        return;
    }

    // Articulated Stickman Figure (Swinging / Flying / Victory Dancing)
    const swing = gamePhase === 'stageclear'
        ? Math.sin(p.dancePhase) * 0.75
        : Math.sin(p.limbPhase) * 0.35;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Torso
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 8);
    ctx.stroke();

    // Arms (Reaching up toward rope when hooked, or outstretched when flying!)
    ctx.beginPath();
    if (p.hookedNode) {
        ctx.moveTo(0, -4);
        ctx.lineTo(4, -18);
        ctx.moveTo(0, -4);
        ctx.lineTo(-7, -15);
    } else {
        ctx.moveTo(0, -3);
        ctx.lineTo(11, -9 + swing * 10);
        ctx.moveTo(0, -3);
        ctx.lineTo(-11, -6 - swing * 10);
    }
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(8 + swing * 8, 19);
    ctx.moveTo(0, 8);
    ctx.lineTo(-8 - swing * 8, 18);
    ctx.stroke();

    // Head
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -13, 6.5, 0, Math.PI * 2);
    ctx.fill();

    // Red Spider-Headband & Flowing Tail
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-6, -15, 12, 3);
    ctx.beginPath();
    ctx.moveTo(-6, -14);
    ctx.lineTo(-14, -16 + swing * 4);
    ctx.lineTo(-13, -12 + swing * 4);
    ctx.closePath();
    ctx.fill();

    // Expressive Eye
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(3, -13, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawClefHookHUD(ctx, W, H, theme) {
    ctx.save();

    // Top-Left Stage Progress Bar (Classic Stickman Hook progress pill)
    const barW = 210;
    const barH = 12;
    const barX = 16;
    const barY = 14;
    const progress = Math.max(0, Math.min(1, (player.x - 110) / Math.max(1, finishX - 110)));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 6);
    ctx.fill();

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(12, barW * progress), barH, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`STAGE ${stage} • ${Math.round(progress * 100)}%`, barX, barY + 25);

    // Top-Right Score & Multiplier Pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.beginPath();
    ctx.roundRect(W - 195, 10, 180, 36, 10);
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 16px monospace';
    ctx.fillText(String(Math.floor(score)).padStart(6, '0'), W - 24, 26);

    ctx.fillStyle = '#facc15';
    ctx.font = '800 10.5px -apple-system, sans-serif';
    ctx.fillText(`x${multiplier}  •  FLIPS: ${flipsCount}  •  BEST: ${bestScore}`, W - 24, 40);

    // Bottom Minimal Control Reminder
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '800 11px -apple-system, sans-serif';
    ctx.fillText('HOLD NODE NOTE LETTER = GRAPPLE & SWING   •   RELEASE = LAUNCH   •   BLACK KEY (#) = SPIN FLIP', W / 2, H - 8);

    // Center Callout Banner
    if (bannerTimer > 0 && bannerText) {
        ctx.textAlign = 'center';
        ctx.font = '900 24px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.fillText(bannerText, W / 2 + 2, H * 0.45 + 2);
        ctx.fillStyle = bannerColor;
        ctx.fillText(bannerText, W / 2, H * 0.45);
    }

    ctx.restore();
}
