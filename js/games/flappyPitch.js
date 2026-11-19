import { initAudio, audioCtx, playTone } from '../audio.js';
import { getNoteFrequency } from '../musicTheory.js';

let animFrameId = null;
let lastFrameTime = 0;
let gamePhase = 'ready'; // 'ready' | 'playing' | 'dying' | 'over'
let flashAlpha = 0;

let score = 0;
let bestScore = parseInt(localStorage.getItem('pianopad_flappy_best') || '0', 10);
let lastPlayedNoteLabel = 'C2';
let lastPlayedNoteY = null;
let guideFadeAlpha = 0;

// Bird state
const bird = {
    x: 130,
    y: 90,
    vy: 0,
    targetY: 90,
    rotation: 0,
    wingPhase: 0,
    flapTimer: 0
};

// World & scrolling scenery state
let pipes = [];
let particles = [];
let scrollGroundX = 0;
let scrollBushX = 0;
let scrollCityX = 0;
let scrollCloudX = 0;
let pipeSpawnTimer = 0;

// Semitone mapping: C1 (0) -> G3 (31)
const NOTE_INDEX_MAP = {
    'c': 0, 'c#': 1, 'db': 1,
    'd': 2, 'd#': 3, 'eb': 3,
    'e': 4,
    'f': 5, 'f#': 6, 'gb': 6,
    'g': 7, 'g#': 8, 'ab': 8,
    'a': 9, 'a#': 10, 'bb': 10,
    'b': 11
};

const TARGET_NOTES = [
    'C1', 'D1', 'E1', 'F1', 'G1', 'A1', 'B1',
    'C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2',
    'C3', 'D3', 'E3', 'F3', 'G3'
];

const GROUND_HEIGHT = 28;
const PIPE_WIDTH = 46;
const PIPE_CAP_HEIGHT = 15;
const PIPE_CAP_OVERHANG = 3;

function noteToSemitone(noteStr) {
    const match = (noteStr || '').trim().toLowerCase().match(/^([a-g][#b]?)([0-9]+)$/);
    if (!match) return 12; // default C2
    const semi = NOTE_INDEX_MAP[match[1]] ?? 0;
    const oct = parseInt(match[2], 10);
    return (oct - 1) * 12 + semi; // C1 = 0, C2 = 12, C3 = 24, G3 = 31
}

function semitoneToY(semi, skyHeight) {
    const clamped = Math.max(0, Math.min(31, semi));
    const ratio = clamped / 31; // 0 = bottom (C1), 1 = top (G3)
    const topMargin = 24;
    const bottomMargin = 22;
    const usableHeight = Math.max(40, skyHeight - topMargin - bottomMargin);
    return (skyHeight - bottomMargin) - ratio * usableHeight;
}

function playScoreCoinSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(987.77, now);        // B5
        osc.frequency.setValueAtTime(1318.51, now + 0.07); // E6
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    } catch (e) {}
}

function playBonkCrashSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(190, now);
        osc.frequency.exponentialRampToValueAtTime(48, now + 0.28);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    } catch (e) {}
}

export function stopFlappyPitch() {
    if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    gamePhase = 'over';
}

export function startFlappyPitch(bridge) {
    initAudio();
    stopFlappyPitch();
    bridge.exitActiveMiniGame();
    document.getElementById('arcade-hub').classList.remove('open');
    bridge.setActiveMiniGame('flappyPitch');
    bridge.resetGameStats();

    const canvas = document.getElementById('waterfall-canvas');
    const skyHeight = Math.max(120, canvas.height - GROUND_HEIGHT);

    score = 0;
    pipes = [];
    particles = [];
    flashAlpha = 0;
    pipeSpawnTimer = 0;
    lastPlayedNoteLabel = 'C2';
    lastPlayedNoteY = skyHeight * 0.52;
    guideFadeAlpha = 0;

    bird.x = Math.min(140, canvas.width * 0.16);
    bird.y = skyHeight * 0.5;
    bird.vy = 0;
    bird.targetY = bird.y;
    bird.rotation = 0;
    bird.wingPhase = 0;
    bird.flapTimer = 0;

    gamePhase = 'ready';
    lastFrameTime = performance.now();

    document.getElementById('status').textContent = '🐦 Flappy Pitch Ready! Press ANY key to launch — High notes fly UP, Low notes dive DOWN!';
    animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));
}

export function handleFlappyPitchInput(noteStr, bridge) {
    if (gamePhase === 'dying' || gamePhase === 'over') return;

    const canvas = document.getElementById('waterfall-canvas');
    const skyHeight = Math.max(120, canvas.height - GROUND_HEIGHT);

    if (gamePhase === 'ready') {
        gamePhase = 'playing';
        spawnPipe(canvas.width + 40, skyHeight);
    }

    const semi = noteToSemitone(noteStr);
    const desiredY = semitoneToY(semi, skyHeight);

    lastPlayedNoteLabel = noteStr.trim().toUpperCase();
    lastPlayedNoteY = desiredY;
    guideFadeAlpha = 1.0;

    // Smoothly steer target altitude toward the played note + energetic wing flap
    bird.targetY = desiredY;
    bird.flapTimer = 0.26;

    // Spawn musical note particles behind the bird
    const noteSymbols = ['♪', '♫', '♩'];
    for (let i = 0; i < 4; i++) {
        particles.push({
            x: bird.x - 10,
            y: bird.y + (Math.random() - 0.5) * 10,
            vx: -65 - Math.random() * 45,
            vy: (Math.random() - 0.5) * 55,
            symbol: noteSymbols[i % noteSymbols.length],
            color: i % 2 === 0 ? '#facc15' : '#ffffff',
            life: 1.0
        });
    }

    bridge.highlightKey(noteStr, 180, '#38bdf8');
    document.getElementById('status').textContent = `🐦 Flappy Pitch | Score: ${score} | Best: ${bestScore} | Pitch: ${lastPlayedNoteLabel}`;
}

function spawnPipe(spawnX, skyHeight) {
    // Gap tightens gently as score rises, remaining fair for classroom play
    const gapHeight = Math.max(66, 82 - Math.floor(score / 3) * 2);
    const minCenter = 26 + gapHeight / 2;
    const maxCenter = skyHeight - 22 - gapHeight / 2;

    // Pick a target note from TARGET_NOTES and align the pipe gap to its exact altitude
    const chosenNote = TARGET_NOTES[Math.floor(Math.random() * TARGET_NOTES.length)];
    const rawNoteY = semitoneToY(noteToSemitone(chosenNote), skyHeight);
    const gapCenterY = Math.max(minCenter, Math.min(maxCenter, rawNoteY));

    pipes.push({
        x: spawnX,
        gapCenterY,
        gapHeight,
        targetNote: chosenNote,
        scored: false,
        coinCollected: false,
        coinSpin: 0
    });
}

function triggerCrash(bridge) {
    if (gamePhase === 'dying' || gamePhase === 'over') return;
    gamePhase = 'dying';
    flashAlpha = 0.85;
    bird.vy = -160;
    playBonkCrashSound();

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('pianopad_flappy_best', String(bestScore));
    }

    setTimeout(() => {
        if (bridge.getActiveMiniGame() !== 'flappyPitch') return;
        stopFlappyPitch();
        bridge.finishCustomMiniGame(
            'Flappy Pitch',
            score,
            `Pipes Cleared: <span style="color:#22c55e; font-size:1.45rem; font-weight:900;">${score}</span><br><span style="font-size:0.82rem; color:#facc15;">Personal Best: ${bestScore}</span>`
        );
    }, 650);
}

function gameLoop(now, bridge) {
    if (bridge.getActiveMiniGame() !== 'flappyPitch') {
        stopFlappyPitch();
        return;
    }

    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    const canvas = document.getElementById('waterfall-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const skyHeight = Math.max(120, H - GROUND_HEIGHT);

    // Speed scales gently with score
    const scrollSpeed = gamePhase === 'playing' ? (135 + Math.min(95, score * 4)) : (gamePhase === 'ready' ? 75 : 0);

    // Parallax scrolling updates
    if (gamePhase === 'ready' || gamePhase === 'playing') {
        scrollGroundX = (scrollGroundX + scrollSpeed * dt) % 24;
        scrollBushX = (scrollBushX + scrollSpeed * 0.35 * dt) % 180;
        scrollCityX = (scrollCityX + scrollSpeed * 0.16 * dt) % 240;
        scrollCloudX = (scrollCloudX + scrollSpeed * 0.08 * dt) % 260;
    }

    if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 2.8);
    if (guideFadeAlpha > 0) guideFadeAlpha = Math.max(0, guideFadeAlpha - dt * 0.9);

    // Bird physics
    if (gamePhase === 'ready') {
        bird.y = skyHeight * 0.5 + Math.sin(now / 180) * 6;
        bird.rotation = 0;
        bird.wingPhase += dt * 10;
    } else if (gamePhase === 'playing') {
        // Gentle gravity pulls targetY slowly down so player actively taps notes
        bird.targetY = Math.min(skyHeight - 10, bird.targetY + 42 * dt);

        // Spring-glide toward targetY
        const prevY = bird.y;
        const diffY = bird.targetY - bird.y;
        bird.y += diffY * Math.min(1, dt * 11.5);
        bird.vy = (bird.y - prevY) / Math.max(0.001, dt);

        // Tilt nose up when climbing, nose down when descending
        const desiredRot = Math.max(-0.48, Math.min(0.75, bird.vy * 0.0024));
        bird.rotation += (desiredRot - bird.rotation) * Math.min(1, dt * 14);

        if (bird.flapTimer > 0) {
            bird.flapTimer -= dt;
            bird.wingPhase += dt * 24;
        } else {
            bird.wingPhase += dt * 9;
        }

        // Ceiling & ground collision
        if (bird.y < 11) {
            bird.y = 11;
        }
        if (bird.y + 10 >= skyHeight) {
            bird.y = skyHeight - 10;
            triggerCrash(bridge);
        }

        // Spawn pipes evenly
        pipeSpawnTimer += scrollSpeed * dt;
        const pipeSpacing = Math.max(210, 265 - score * 2);
        if (pipeSpawnTimer >= pipeSpacing) {
            pipeSpawnTimer = 0;
            spawnPipe(W + 30, skyHeight);
        }

        // Update pipes & check collisions
        const birdHitRadius = 9.5;
        for (let i = pipes.length - 1; i >= 0; i--) {
            const p = pipes[i];
            p.x -= scrollSpeed * dt;
            p.coinSpin += dt * 6;

            const topPipeBottom = p.gapCenterY - p.gapHeight / 2;
            const bottomPipeTop = p.gapCenterY + p.gapHeight / 2;

            // Check horizontal overlap with pipe
            if (bird.x + birdHitRadius > p.x && bird.x - birdHitRadius < p.x + PIPE_WIDTH) {
                if (bird.y - birdHitRadius < topPipeBottom || bird.y + birdHitRadius > bottomPipeTop) {
                    triggerCrash(bridge);
                    break;
                }
            }

            // Score when passing center of pipe
            if (!p.scored && p.x + PIPE_WIDTH / 2 < bird.x) {
                p.scored = true;
                p.coinCollected = true;
                score++;
                if (score > bestScore) {
                    bestScore = score;
                    localStorage.setItem('pianopad_flappy_best', String(bestScore));
                }
                playScoreCoinSound();
                bridge.spawnConfetti(bird.x + 14, p.gapCenterY, '#facc15');
                document.getElementById('status').textContent = `🐦 Flappy Pitch | Score: ${score} | Best: ${bestScore} | Last Note: ${lastPlayedNoteLabel}`;
            }

            if (p.x + PIPE_WIDTH + 20 < 0) {
                pipes.splice(i, 1);
            }
        }
    } else if (gamePhase === 'dying') {
        bird.vy += 680 * dt;
        bird.y = Math.min(skyHeight - 10, bird.y + bird.vy * dt);
        bird.rotation = Math.min(Math.PI / 2, bird.rotation + dt * 5);
    }

    // Update musical note particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt * 1.4;
        if (pt.life <= 0) particles.splice(i, 1);
    }

    // ==========================================
    // RENDER CLASSIC FLAPPY BIRD SCENE
    // ==========================================
    drawFlappySkyAndBackdrop(ctx, W, skyHeight, now);

    // Subtle pitch-altitude guide line when a key is pressed
    if (guideFadeAlpha > 0 && lastPlayedNoteY !== null) {
        ctx.save();
        ctx.globalAlpha = guideFadeAlpha * 0.45;
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(42, lastPlayedNoteY);
        ctx.lineTo(bird.x - 16, lastPlayedNoteY);
        ctx.stroke();
        ctx.restore();
    }

    // Draw Pipes & Target Note Coins
    pipes.forEach(p => {
        drawGlossyFlappyPipe(ctx, p.x, p.gapCenterY, p.gapHeight, skyHeight);
        if (!p.coinCollected) {
            drawPitchCoin(ctx, p.x + PIPE_WIDTH / 2, p.gapCenterY, p.targetNote, p.coinSpin);
        }
    });

    // Draw Scrolling Ground Strip
    drawFlappyGround(ctx, W, H, skyHeight);

    // Draw Left-Edge Pitch Altimeter Strip
    drawPitchAltimeter(ctx, skyHeight);

    // Draw Musical Note Particles
    particles.forEach(pt => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.fillStyle = pt.color;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(pt.symbol, pt.x, pt.y);
        ctx.restore();
    });

    // Draw Iconic Flappy Bird Character
    drawFlappyBirdSprite(ctx, bird);

    // Draw Classic Outlined Score & Ready Prompt
    drawFlappyHUD(ctx, W, skyHeight);

    // White impact flash
    if (flashAlpha > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    if (gamePhase !== 'over') {
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}

function drawFlappySkyAndBackdrop(ctx, W, skyHeight, now) {
    // Cycle sky theme every 10 points (0-9 Day, 10-19 Sunset, 20-29 Night)
    const themeCycle = Math.floor(score / 10) % 3;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, skyHeight);
    if (themeCycle === 0) {
        // Classic Flappy Day Cyan
        skyGrad.addColorStop(0, '#4ec0ca');
        skyGrad.addColorStop(1, '#7ad7df');
    } else if (themeCycle === 1) {
        // Golden Sunset
        skyGrad.addColorStop(0, '#3b5998');
        skyGrad.addColorStop(0.55, '#e87a54');
        skyGrad.addColorStop(1, '#f8b55f');
    } else {
        // Starry Night
        skyGrad.addColorStop(0, '#0f172a');
        skyGrad.addColorStop(1, '#1e3a5f');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, skyHeight);

    // Twinkling stars in Night mode
    if (themeCycle === 2) {
        ctx.fillStyle = '#fef08a';
        for (let sx = 30; sx < W; sx += 75) {
            const sy = 16 + ((sx * 17) % Math.max(30, skyHeight - 65));
            const pulse = 1.2 + Math.sin(now / 260 + sx) * 0.7;
            ctx.fillRect(sx, sy, pulse, pulse);
        }
    }

    // 1. Fluffy Horizon Clouds
    const cloudFill = themeCycle === 0 ? '#ffffff' : (themeCycle === 1 ? '#fde68a' : '#334155');
    const cloudShadow = themeCycle === 0 ? '#d2f2f5' : (themeCycle === 1 ? '#fca5a5' : '#1e293b');
    for (let cx = -scrollCloudX; cx < W + 260; cx += 260) {
        const baseY = skyHeight - 36;
        ctx.fillStyle = cloudShadow;
        drawCloudCluster(ctx, cx, baseY + 3);
        ctx.fillStyle = cloudFill;
        drawCloudCluster(ctx, cx, baseY);
    }

    // 2. Distant City Skyline Silhouettes (Iconic Flappy Bird city blocks)
    const cityMain = themeCycle === 0 ? '#9ce2c8' : (themeCycle === 1 ? '#9a5b6e' : '#1e293b');
    const cityWin = themeCycle === 0 ? '#c7f2e3' : (themeCycle === 1 ? '#fcd34d' : '#facc15');
    const buildings = [
        { dx: 10, w: 34, h: 58 },
        { dx: 48, w: 28, h: 42 },
        { dx: 82, w: 40, h: 72 },
        { dx: 128, w: 30, h: 48 },
        { dx: 164, w: 36, h: 64 },
        { dx: 204, w: 26, h: 38 }
    ];
    for (let bx = -scrollCityX; bx < W + 240; bx += 240) {
        buildings.forEach(b => {
            const x = bx + b.dx;
            const y = skyHeight - b.h;
            ctx.fillStyle = cityMain;
            ctx.fillRect(x, y, b.w, b.h);
            // Tiny pixel windows
            ctx.fillStyle = cityWin;
            for (let wy = y + 6; wy < skyHeight - 18; wy += 9) {
                for (let wx = x + 5; wx < x + b.w - 6; wx += 8) {
                    ctx.fillRect(wx, wy, 4, 5);
                }
            }
        });
    }

    // 3. Lush Green Bushes along the ground edge
    const bushDark = themeCycle === 2 ? '#14532d' : '#57b846';
    const bushLight = themeCycle === 2 ? '#166534' : '#83e05c';
    for (let gx = -scrollBushX; gx < W + 180; gx += 180) {
        ctx.fillStyle = bushDark;
        drawBushCluster(ctx, gx, skyHeight);
        ctx.fillStyle = bushLight;
        drawBushCluster(ctx, gx, skyHeight + 3);
    }
}

function drawCloudCluster(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x + 25, y, 18, 0, Math.PI * 2);
    ctx.arc(x + 48, y - 6, 22, 0, Math.PI * 2);
    ctx.arc(x + 74, y - 2, 19, 0, Math.PI * 2);
    ctx.arc(x + 96, y + 4, 15, 0, Math.PI * 2);
    ctx.arc(x + 118, y, 20, 0, Math.PI * 2);
    ctx.arc(x + 145, y + 3, 17, 0, Math.PI * 2);
    ctx.fillRect(x + 15, y, 140, 38);
    ctx.fill();
}

function drawBushCluster(ctx, x, groundY) {
    ctx.beginPath();
    ctx.arc(x + 20, groundY - 6, 16, 0, Math.PI * 2);
    ctx.arc(x + 42, groundY - 11, 20, 0, Math.PI * 2);
    ctx.arc(x + 68, groundY - 7, 17, 0, Math.PI * 2);
    ctx.arc(x + 92, groundY - 4, 14, 0, Math.PI * 2);
    ctx.arc(x + 135, groundY - 8, 18, 0, Math.PI * 2);
    ctx.arc(x + 158, groundY - 5, 15, 0, Math.PI * 2);
    ctx.fill();
}

function drawGlossyFlappyPipe(ctx, x, gapCenterY, gapHeight, skyHeight) {
    const topPipeBottom = gapCenterY - gapHeight / 2;
    const bottomPipeTop = gapCenterY + gapHeight / 2;

    // Top pipe shaft + lip
    if (topPipeBottom > 0) {
        const shaftH = Math.max(0, topPipeBottom - PIPE_CAP_HEIGHT);
        if (shaftH > 0) drawPipeSegment(ctx, x, 0, PIPE_WIDTH, shaftH);
        drawPipeSegment(ctx, x - PIPE_CAP_OVERHANG, topPipeBottom - PIPE_CAP_HEIGHT, PIPE_WIDTH + PIPE_CAP_OVERHANG * 2, PIPE_CAP_HEIGHT);
    }

    // Bottom pipe lip + shaft
    if (bottomPipeTop < skyHeight) {
        const totalBottomH = skyHeight - bottomPipeTop;
        const capH = Math.min(PIPE_CAP_HEIGHT, totalBottomH);
        drawPipeSegment(ctx, x - PIPE_CAP_OVERHANG, bottomPipeTop, PIPE_WIDTH + PIPE_CAP_OVERHANG * 2, capH);
        const shaftH = totalBottomH - capH;
        if (shaftH > 0) {
            drawPipeSegment(ctx, x, bottomPipeTop + capH, PIPE_WIDTH, shaftH);
        }
    }
}

function drawPipeSegment(ctx, x, y, w, h) {
    ctx.save();
    // Base green fill
    ctx.fillStyle = '#73bf2e';
    ctx.fillRect(x, y, w, h);

    // Left specular highlights
    ctx.fillStyle = '#9ce659';
    ctx.fillRect(x + 4, y, 7, h);
    ctx.fillStyle = '#c8f782';
    ctx.fillRect(x + 6, y, 2, h);

    // Right shading bands
    ctx.fillStyle = '#558c22';
    ctx.fillRect(x + w - 10, y, 6, h);
    ctx.fillStyle = '#437018';
    ctx.fillRect(x + w - 4, y, 4, h);

    // Crisp dark outline
    ctx.strokeStyle = '#2e3b1f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}

function drawPitchCoin(ctx, cx, cy, noteLabel, spinPhase) {
    ctx.save();
    const bobY = cy + Math.sin(spinPhase) * 2.5;
    const radius = 14;

    // Outer gold coin
    ctx.beginPath();
    ctx.arc(cx, bobY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#92400e';
    ctx.stroke();

    // Inner bright ring
    ctx.beginPath();
    ctx.arc(cx, bobY, radius - 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Target note text
    ctx.fillStyle = '#451a03';
    ctx.font = '900 10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(noteLabel, cx, bobY + 0.5);
    ctx.restore();
}

function drawFlappyGround(ctx, W, H, skyHeight) {
    const grassH = 10;
    const dirtH = H - skyHeight - grassH;

    // Top dark border
    ctx.fillStyle = '#543847';
    ctx.fillRect(0, skyHeight, W, 2);

    // Lime grass strip
    ctx.fillStyle = '#73bf2e';
    ctx.fillRect(0, skyHeight + 2, W, grassH - 3);

    // Scrolling diagonal lighter grass chevrons
    ctx.fillStyle = '#9ce659';
    for (let gx = -scrollGroundX - 24; gx < W + 24; gx += 24) {
        ctx.beginPath();
        ctx.moveTo(gx, skyHeight + grassH - 1);
        ctx.lineTo(gx + 7, skyHeight + 2);
        ctx.lineTo(gx + 17, skyHeight + 2);
        ctx.lineTo(gx + 10, skyHeight + grassH - 1);
        ctx.closePath();
        ctx.fill();
    }

    // Grass bottom divider line
    ctx.fillStyle = '#543847';
    ctx.fillRect(0, skyHeight + grassH - 1, W, 2);

    // Tan dirt base
    ctx.fillStyle = '#ded895';
    ctx.fillRect(0, skyHeight + grassH + 1, W, dirtH);

    // Subtle pixel earth blocks
    ctx.fillStyle = '#d0c874';
    for (let dx = -scrollGroundX; dx < W + 24; dx += 24) {
        ctx.fillRect(dx + 3, skyHeight + grassH + 5, 10, 4);
        ctx.fillRect(dx + 14, skyHeight + grassH + 11, 8, 4);
    }
}

function drawPitchAltimeter(ctx, skyHeight) {
    const markers = [
        { label: 'G3', semi: 31 },
        { label: 'C3', semi: 24 },
        { label: 'G2', semi: 19 },
        { label: 'C2', semi: 12 },
        { label: 'C1', semi: 0 }
    ];

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(4, 8, 32, skyHeight - 16);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 8, 32, skyHeight - 16);

    ctx.font = 'bold 9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    markers.forEach(m => {
        const y = semitoneToY(m.semi, skyHeight);
        ctx.fillStyle = lastPlayedNoteLabel === m.label ? '#facc15' : '#e2e8f0';
        ctx.fillText(m.label, 20, y);
    });
    ctx.restore();
}

function drawFlappyBirdSprite(ctx, b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rotation);

    // 1. Plump Yellow-Gold Body
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 10.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f8d830';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#382818';
    ctx.stroke();

    // Warm orange belly shading
    ctx.beginPath();
    ctx.ellipse(-1, 4.5, 10.5, 4.5, 0, 0, Math.PI);
    ctx.fillStyle = '#e89820';
    ctx.fill();

    // Top crown highlight
    ctx.beginPath();
    ctx.ellipse(-2, -6, 7, 2.2, -0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#fef08a';
    ctx.fill();

    // 2. Expressive White Eye & Pupil
    ctx.beginPath();
    ctx.arc(6.5, -3, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#382818';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(8.2, -3, 1.9, 0, Math.PI * 2);
    ctx.fillStyle = '#1e1b18';
    ctx.fill();

    // 3. Classic Two-Part Plump Orange-Red Beak
    // Upper beak
    ctx.beginPath();
    ctx.roundRect(8, -0.5, 9, 4.2, 2);
    ctx.fillStyle = '#f05828';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#382818';
    ctx.stroke();

    // Lower beak
    ctx.beginPath();
    ctx.roundRect(8, 3.2, 7.8, 3.6, 2);
    ctx.fillStyle = '#d83818';
    ctx.fill();
    ctx.stroke();

    // 4. Animated Flapping Wing
    const wingOffsetY = Math.sin(b.wingPhase) * 3.2;
    ctx.beginPath();
    ctx.ellipse(-4.5, 1.5 + wingOffsetY, 6.8, 4.2, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#382818';
    ctx.stroke();

    ctx.restore();
}

function drawFlappyHUD(ctx, W, skyHeight) {
    ctx.save();

    // Large classic Flappy Bird centered score counter
    ctx.font = '900 30px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = '#2e3b1f';
    ctx.strokeText(String(score), W / 2, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(score), W / 2, 10);

    // Top-right Best & Current Pitch pill
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.beginPath();
    ctx.roundRect(W - 152, 8, 142, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.fillText(`BEST: ${bestScore}  |  🎹 ${lastPlayedNoteLabel}`, W - 18, 14);

    // "GET READY!" floating banner before first tap
    if (gamePhase === 'ready') {
        const boxW = Math.min(360, W - 90);
        const boxX = (W - boxW) / 2;
        const boxY = skyHeight * 0.66;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, 38, 8);
        ctx.fill();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#facc15';
        ctx.font = '900 12px -apple-system, sans-serif';
        ctx.fillText('GET READY! TAP ANY KEY TO FLAP', W / 2, boxY + 7);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10.5px -apple-system, sans-serif';
        ctx.fillText('High Notes (C3–G3) = Fly UP   •   Low Notes (C1–G1) = Dive DOWN', W / 2, boxY + 22);
    }

    ctx.restore();
}
