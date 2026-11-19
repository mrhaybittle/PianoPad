import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let lastFrameTime = 0;
let gamePhase = 'playing'; // 'playing' | 'dying' | 'over'
let flashAlpha = 0;
let shakeTimer = 0;

let score = 0;
let coins = 0;
let multiplier = 1;
let noteStreak = 0;
let bestScore = parseInt(localStorage.getItem('pianopad_staff_surfers_best') || '0', 10);

// Surfer state (lane: -1 = Left Track, 0 = Center Track, 1 = Right Track)
const player = {
    lane: 0,
    prevLane: 0,
    visualLane: 0,
    yHeight: 0,
    vy: 0,
    isJumping: false,
    rollTimer: 0,
    stridePhase: 0,
    hoverboardTimer: 0,
    jetpackTimer: 0,
    inspectorTimer: 4.0,
    stumbleFlash: 0
};

let obstacles = [];
let coinItems = [];
let particles = [];
let worldScroll = 0;
let spawnCooldown = 0;
let waveCounter = 0;
let activeTargetNote = 'G';
let lastPlayedLabel = 'C2';

const WHITE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Authentic Subway Surfers Style Train Liveries
const TRAIN_THEMES = [
    { body: '#1d4ed8', dark: '#1e3a8a', stripe: '#facc15', roof: '#93c5fd', tag: 'STAFF EXPRESS' },
    { body: '#dc2626', dark: '#991b1b', stripe: '#ffffff', roof: '#fca5a5', tag: 'TREBLE LINE' },
    { body: '#059669', dark: '#065f46', stripe: '#fde047', roof: '#6ee7b7', tag: 'BASS METRO' },
    { body: '#7c3aed', dark: '#5b21b6', stripe: '#38bdf8', roof: '#c4b5fd', tag: 'CHORD RAIL' }
];

// --- ARCADE SOUND EFFECTS ---
function playWhooshSound(pitchMult = 1.0) {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(250 * pitchMult, now);
        osc.frequency.exponentialRampToValueAtTime(540 * pitchMult, now + 0.085);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    } catch (e) {}
}

function playCoinChime(isTargetNote = false) {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isTargetNote ? 1174.66 : 987.77, now);
        osc.frequency.setValueAtTime(isTargetNote ? 1567.98 : 1318.51, now + 0.055);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.19);
    } catch (e) {}
}

function playPowerupFanfare() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const freqs = [523.25, 659.25, 783.99, 1046.50];
        freqs.forEach((f, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now + idx * 0.05);
            gain.gain.setValueAtTime(0.09, now + idx * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.22);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + idx * 0.05);
            osc.stop(now + idx * 0.05 + 0.24);
        });
    } catch (e) {}
}

function playWhistleAndCrash(isStumbleOnly = false) {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const whistle = audioCtx.createOscillator();
        const wGain = audioCtx.createGain();
        whistle.type = 'sine';
        whistle.frequency.setValueAtTime(2850, now);
        whistle.frequency.setValueAtTime(3180, now + 0.06);
        whistle.frequency.setValueAtTime(2800, now + 0.12);
        wGain.gain.setValueAtTime(0.07, now);
        wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        whistle.connect(wGain);
        wGain.connect(audioCtx.destination);
        whistle.start(now);
        whistle.stop(now + 0.25);

        if (!isStumbleOnly) {
            const thud = audioCtx.createOscillator();
            const tGain = audioCtx.createGain();
            thud.type = 'sawtooth';
            thud.frequency.setValueAtTime(155, now);
            thud.frequency.exponentialRampToValueAtTime(36, now + 0.32);
            tGain.gain.setValueAtTime(0.18, now);
            tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
            thud.connect(tGain);
            tGain.connect(audioCtx.destination);
            thud.start(now);
            thud.stop(now + 0.35);
        }
    } catch (e) {}
}

export function stopStaffSurfers() {
    if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    gamePhase = 'over';
}

export function startStaffSurfers(bridge) {
    initAudio();
    stopStaffSurfers();
    bridge.exitActiveMiniGame();
    document.getElementById('arcade-hub').classList.remove('open');
    bridge.setActiveMiniGame('staffSurfers');
    bridge.resetGameStats();

    score = 0;
    coins = 0;
    multiplier = 1;
    noteStreak = 0;
    obstacles = [];
    coinItems = [];
    particles = [];
    worldScroll = 0;
    spawnCooldown = 0.22;
    waveCounter = 0;
    flashAlpha = 0;
    shakeTimer = 0;
    activeTargetNote = WHITE_LETTERS[Math.floor(Math.random() * WHITE_LETTERS.length)];
    lastPlayedLabel = 'C2';

    player.lane = 0;
    player.prevLane = 0;
    player.visualLane = 0;
    player.yHeight = 0;
    player.vy = 0;
    player.isJumping = false;
    player.rollTimer = 0;
    player.stridePhase = 0;
    player.hoverboardTimer = 0;
    player.jetpackTimer = 0;
    player.inspectorTimer = 4.0;
    player.stumbleFlash = 0;

    gamePhase = 'playing';
    lastFrameTime = performance.now();

    // Seed an opening line of gold coins on the center track
    for (let i = 0; i < 5; i++) {
        coinItems.push({
            lane: 0,
            z: 0.42 + i * 0.08,
            yHeight: 8,
            noteLetter: i === 2 ? activeTargetNote : null,
            spin: i * 0.6,
            collected: false
        });
    }

    document.getElementById('status').textContent = '🚇 Staff Surfers: Oct 1 = Left | Oct 2 = Center | Oct 3 = Right | Black Key = JUMP | Same Lane = ROLL!';
    animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));
}

export function handleStaffSurfersInput(noteStr, bridge) {
    if (gamePhase !== 'playing') return;

    const match = (noteStr || '').trim().toLowerCase().match(/^([a-g])(#?)([0-9]+)$/);
    if (!match) return;

    const letter = match[1].toUpperCase();
    const isSharp = match[2] === '#';
    const octave = parseInt(match[3], 10);
    lastPlayedLabel = `${letter}${isSharp ? '#' : ''}${octave}`;

    // Map Octave 1 -> Left (-1), Octave 2 -> Center (0), Octave 3+ -> Right (+1)
    let targetLane = 0;
    if (octave <= 1) targetLane = -1;
    else if (octave === 2) targetLane = 0;
    else targetLane = 1;

    const laneChanged = targetLane !== player.lane;

    if (laneChanged) {
        player.prevLane = player.lane;
        player.lane = targetLane;
        playWhooshSound(targetLane === 1 ? 1.25 : (targetLane === -1 ? 0.85 : 1.0));
        spawnBurstParticles(player.visualLane, player.yHeight + 12, '#38bdf8', 6);
    }

    // Any Black Key triggers JUMP (works both in current lane and while switching lanes!)
    if (isSharp && player.jetpackTimer <= 0) {
        if (!player.isJumping) {
            player.isJumping = true;
            player.rollTimer = 0;
            player.vy = 152;
            playWhooshSound(1.4);
            spawnBurstParticles(player.visualLane, player.yHeight, '#facc15', 8);
        }
    } else if (!laneChanged && player.jetpackTimer <= 0) {
        // Re-tapping a White Key in the SAME lane triggers ROLL / DUCK (or fast-drop if mid-air)
        if (player.isJumping && player.yHeight > 6) {
            player.vy = -195;
        }
        player.rollTimer = 0.65;
        playWhooshSound(0.75);
    }

    // Musical Challenge: Hit the active target note letter for bonus score, Hoverboard & Jetpack!
    if (letter === activeTargetNote) {
        noteStreak++;
        coins += 2;
        score += 50 * multiplier;
        multiplier = Math.min(5, 1 + Math.floor(noteStreak / 3));
        playCoinChime(true);
        bridge.highlightKey(noteStr, 240, '#22c55e');
        spawnBurstParticles(player.lane, player.yHeight + 22, '#22c55e', 10);

        if (noteStreak % 12 === 0) {
            player.jetpackTimer = 5.5;
            player.isJumping = false;
            player.rollTimer = 0;
            playPowerupFanfare();
            spawnSkyCoinWave();
            document.getElementById('status').textContent = '🚀 MUSICAL JETPACK ACTIVATED! Soaring above the trains!';
        } else if (noteStreak % 5 === 0) {
            player.hoverboardTimer = 10.0;
            playPowerupFanfare();
            document.getElementById('status').textContent = '🛹 HOVERBOARD SHIELD EQUIPPED! Crash protection active!';
        }

        activeTargetNote = WHITE_LETTERS[(WHITE_LETTERS.indexOf(activeTargetNote) + 2 + Math.floor(Math.random() * 4)) % WHITE_LETTERS.length];
    } else {
        bridge.highlightKey(noteStr, 160, '#38bdf8');
    }
}

function spawnSkyCoinWave() {
    for (let i = 0; i < 18; i++) {
        const lane = Math.floor(i / 6) - 1;
        coinItems.push({
            lane,
            z: 0.25 + i * 0.045,
            yHeight: 68,
            noteLetter: i % 3 === 0 ? activeTargetNote : null,
            spin: i * 0.4,
            collected: false
        });
    }
}

function spawnObstacleWave() {
    waveCounter++;
    const lanes = [-1, 0, 1];
    const shuffled = [...lanes].sort(() => Math.random() - 0.5);
    const safeLane = shuffled[0];
    const secondLane = shuffled[1];
    const thirdLane = shuffled[2];

    // Lane 1: Guaranteed Fair Path (Jumpable Hurdle or Duckable High Barrier)
    if (Math.random() < 0.5) {
        obstacles.push({
            type: 'hurdle',
            lane: safeLane,
            zFront: 1.05,
            zBack: 1.09,
            height: 18,
            minClearY: 0
        });
        for (let c = 0; c < 3; c++) {
            coinItems.push({
                lane: safeLane,
                z: 0.96 + c * 0.09,
                yHeight: c === 1 ? 30 : 16,
                noteLetter: c === 1 ? activeTargetNote : null,
                spin: c * 0.5,
                collected: false
            });
        }
    } else {
        obstacles.push({
            type: 'highGate',
            lane: safeLane,
            zFront: 1.05,
            zBack: 1.09,
            height: 44,
            minClearY: 16
        });
        for (let c = 0; c < 3; c++) {
            coinItems.push({
                lane: safeLane,
                z: 0.96 + c * 0.09,
                yHeight: 6,
                noteLetter: c === 1 ? activeTargetNote : null,
                spin: c * 0.5,
                collected: false
            });
        }
    }

    // Lane 2: Full 3D Subway Train (some with yellow boarding ramps!)
    const t1 = TRAIN_THEMES[Math.floor(Math.random() * TRAIN_THEMES.length)];
    const hasRamp = Math.random() < 0.34;
    obstacles.push({
        type: 'train',
        lane: secondLane,
        zFront: 1.05,
        zBack: 1.50,
        height: 46,
        minClearY: 0,
        hasRamp,
        theme: t1
    });

    if (hasRamp) {
        for (let c = 0; c < 4; c++) {
            coinItems.push({
                lane: secondLane,
                z: 1.12 + c * 0.085,
                yHeight: 54,
                noteLetter: c === 2 ? activeTargetNote : null,
                spin: c * 0.4,
                collected: false
            });
        }
    }

    // Lane 3: Second Train or Hurdle from wave 2 onward
    if (waveCounter >= 2 && Math.random() < 0.72) {
        if (Math.random() < 0.55) {
            const t2 = TRAIN_THEMES[(TRAIN_THEMES.indexOf(t1) + 1) % TRAIN_THEMES.length];
            obstacles.push({
                type: 'train',
                lane: thirdLane,
                zFront: 1.15,
                zBack: 1.58,
                height: 46,
                minClearY: 0,
                hasRamp: false,
                theme: t2
            });
        } else {
            obstacles.push({
                type: 'hurdle',
                lane: thirdLane,
                zFront: 1.08,
                zBack: 1.12,
                height: 18,
                minClearY: 0
            });
        }
    }
}

function spawnBurstParticles(lane, yHeight, color, count = 8) {
    for (let i = 0; i < count; i++) {
        particles.push({
            lane: lane + (Math.random() - 0.5) * 0.35,
            z: 0.04 + Math.random() * 0.04,
            yHeight: yHeight + (Math.random() - 0.5) * 10,
            vy: 25 + Math.random() * 55,
            vLane: (Math.random() - 0.5) * 1.4,
            size: 3 + Math.random() * 3,
            color,
            life: 1.0
        });
    }
}

function triggerCrash(bridge) {
    if (gamePhase !== 'playing') return;

    // Hoverboard absorbs the hit and clears nearby trains!
    if (player.hoverboardTimer > 0) {
        player.hoverboardTimer = 0;
        flashAlpha = 0.75;
        shakeTimer = 0.25;
        playPowerupFanfare();
        spawnBurstParticles(player.lane, player.yHeight + 16, '#ec4899', 18);
        obstacles = obstacles.filter(o => o.zFront > 0.35);
        document.getElementById('status').textContent = '💥 HOVERBOARD SHIELD SAVED YOU! Keep surfing!';
        return;
    }

    gamePhase = 'dying';
    flashAlpha = 0.9;
    shakeTimer = 0.45;
    playWhistleAndCrash(false);

    const finalScore = Math.floor(score);
    if (finalScore > bestScore) {
        bestScore = finalScore;
        localStorage.setItem('pianopad_staff_surfers_best', String(bestScore));
    }

    setTimeout(() => {
        if (bridge.getActiveMiniGame() !== 'staffSurfers') return;
        stopStaffSurfers();
        bridge.finishCustomMiniGame(
            'Staff Surfers',
            finalScore,
            `Distance Score: <span style="color:#22c55e; font-size:1.45rem; font-weight:900;">${finalScore}</span><br>` +
            `<span style="font-size:0.85rem; color:#facc15;">🪙 Coins: ${coins}  •  🏆 Best: ${bestScore}</span>`
        );
    }, 850);
}

// 3D Vanishing-Point Perspective Projection
function projectPoint(lane, z, yHeight, W, H) {
    const horizonY = H * 0.26;
    const groundBottomY = H * 0.93;
    const vpX = W * 0.5;
    const laneSpreadBottom = Math.min(W * 0.22, 235);

    const clampedZ = Math.max(-0.15, z);
    const scale = 1 / (1 + clampedZ * 3.6);
    const groundY = horizonY + (groundBottomY - horizonY) * scale;
    const x = vpX + lane * laneSpreadBottom * scale;
    const y = groundY - yHeight * scale * (H / 215);

    return { x, y, groundY, scale };
}

function gameLoop(now, bridge) {
    if (bridge.getActiveMiniGame() !== 'staffSurfers') {
        stopStaffSurfers();
        return;
    }

    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    const canvas = document.getElementById('waterfall-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    const speedZ = gamePhase === 'playing' ? (0.48 + Math.min(0.42, score * 0.00008)) : 0;

    if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 2.5);
    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
    if (player.stumbleFlash > 0) player.stumbleFlash = Math.max(0, player.stumbleFlash - dt);

    if (gamePhase === 'playing') {
        worldScroll = (worldScroll + speedZ * dt * 12) % 1;
        score += speedZ * dt * 260 * multiplier;
        player.stridePhase += dt * (14 + speedZ * 10);

        if (player.hoverboardTimer > 0) player.hoverboardTimer = Math.max(0, player.hoverboardTimer - dt);
        if (player.inspectorTimer > 0) player.inspectorTimer = Math.max(0, player.inspectorTimer - dt);
        if (player.rollTimer > 0) player.rollTimer = Math.max(0, player.rollTimer - dt);

        player.visualLane += (player.lane - player.visualLane) * Math.min(1, dt * 16);

        // Check if surfer is running along a train roof
        let supportRoofY = 0;
        for (const obs of obstacles) {
            if (obs.type === 'train' && obs.lane === player.lane && obs.zFront <= 0.09 && obs.zBack >= -0.02) {
                if (player.yHeight >= obs.height - 6 || obs.hasRamp) {
                    supportRoofY = obs.height;
                }
            }
        }

        // Jump / Jetpack / Gravity Physics
        if (player.jetpackTimer > 0) {
            player.jetpackTimer = Math.max(0, player.jetpackTimer - dt);
            player.yHeight += (68 - player.yHeight) * Math.min(1, dt * 8);
            player.vy = 0;
            if (Math.random() < 0.65) {
                spawnBurstParticles(player.visualLane, player.yHeight + 6, Math.random() > 0.5 ? '#facc15' : '#ef4444', 1);
            }
        } else if (player.isJumping || player.yHeight > supportRoofY) {
            player.yHeight += player.vy * dt;
            player.vy -= 415 * dt;
            if (player.yHeight <= supportRoofY) {
                player.yHeight = supportRoofY;
                player.vy = 0;
                player.isJumping = false;
            }
        } else {
            player.yHeight = supportRoofY;
        }

        // Spawn obstacle waves
        spawnCooldown -= speedZ * dt;
        if (spawnCooldown <= 0) {
            spawnObstacleWave();
            spawnCooldown = Math.max(0.56, 0.78 - score * 0.00004);
        }

        // Move & collect coins
        for (let i = coinItems.length - 1; i >= 0; i--) {
            const c = coinItems[i];
            c.z -= speedZ * dt;
            c.spin += dt * 7;

            if (!c.collected && Math.abs(c.lane - player.visualLane) < 0.42 && c.z <= 0.08 && c.z >= -0.04) {
                if (Math.abs(c.yHeight - (player.yHeight + 12)) < 24) {
                    c.collected = true;
                    coins++;
                    score += 25 * multiplier;
                    playCoinChime(Boolean(c.noteLetter));
                    spawnBurstParticles(c.lane, c.yHeight, '#facc15', 6);
                }
            }

            if (c.collected || c.z < -0.15) {
                coinItems.splice(i, 1);
            }
        }

        // Move & check obstacle collisions
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            obs.zFront -= speedZ * dt;
            obs.zBack -= speedZ * dt;

            const overlapsZ = obs.zFront <= 0.06 && obs.zBack >= -0.01;
            const sameLane = Math.abs(obs.lane - player.visualLane) < 0.38;

            if (overlapsZ && sameLane && player.jetpackTimer <= 0) {
                if (obs.type === 'train') {
                    const onRoof = player.yHeight >= obs.height - 6;
                    const onRamp = obs.hasRamp && obs.zFront >= -0.02 && player.yHeight >= 4;

                    if (onRoof || onRamp) {
                        player.yHeight = Math.max(player.yHeight, obs.height);
                        player.isJumping = false;
                    } else if (Math.abs(player.lane - player.prevLane) > 0 && obs.zFront < 0.01) {
                        // Side-swiped into train side -> Stumble & Guard Chase!
                        player.lane = player.prevLane;
                        player.inspectorTimer = 4.2;
                        player.stumbleFlash = 0.5;
                        shakeTimer = 0.22;
                        playWhistleAndCrash(true);
                        spawnBurstParticles(obs.lane, 22, '#f97316', 10);
                    } else {
                        triggerCrash(bridge);
                        break;
                    }
                } else if (obs.type === 'hurdle') {
                    if (player.yHeight < obs.height - 4) {
                        triggerCrash(bridge);
                        break;
                    }
                } else if (obs.type === 'highGate') {
                    const isRolling = player.rollTimer > 0 && player.yHeight <= 4;
                    const jumpedOver = player.yHeight >= obs.height - 4;
                    if (!isRolling && !jumpedOver) {
                        triggerCrash(bridge);
                        break;
                    }
                }
            }

            if (obs.zBack < -0.16) {
                obstacles.splice(i, 1);
            }
        }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.yHeight += pt.vy * dt;
        pt.lane += pt.vLane * dt;
        pt.life -= dt * 2.2;
        if (pt.life <= 0) particles.splice(i, 1);
    }

    // ==========================================
    // RENDER 3D SUBWAY SURFERS GRAPHICS
    // ==========================================
    ctx.save();
    if (shakeTimer > 0) {
        const mag = shakeTimer * 14;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    drawSubwayBackdropAndTracks(ctx, W, H);

    // Painter's Algorithm depth sort
    const renderQueue = [];
    obstacles.forEach(o => renderQueue.push({ kind: 'obs', z: o.zFront, data: o }));
    coinItems.forEach(c => renderQueue.push({ kind: 'coin', z: c.z, data: c }));
    renderQueue.sort((a, b) => b.z - a.z);

    renderQueue.forEach(item => {
        if (item.kind === 'obs') {
            const o = item.data;
            if (o.type === 'train') draw3DSubwayTrain(ctx, o, W, H);
            else if (o.type === 'hurdle') draw3DHurdleBarrier(ctx, o, W, H);
            else if (o.type === 'highGate') draw3DHighDuckGate(ctx, o, W, H);
        } else {
            draw3DGoldCoin(ctx, item.data, W, H);
        }
    });

    // Particles
    particles.forEach(pt => {
        const p = projectPoint(pt.lane, pt.z, pt.yHeight, W, H);
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pt.size * p.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // Surfer Character
    drawStaffSurferRunner(ctx, W, H, now);

    // Grumpy Inspector & Guard Dog
    if (player.inspectorTimer > 0 || gamePhase === 'dying') {
        drawInspectorAndDog(ctx, W, H, now);
    }

    // Subway Surfers HUD
    drawStaffSurfersHUD(ctx, W, H);

    if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();

    if (gamePhase !== 'over') {
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}

function drawSubwayBackdropAndTracks(ctx, W, H) {
    const horizonY = H * 0.26;

    // 1. Vibrant Sunny Subway Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#0284c7');
    skyGrad.addColorStop(0.65, '#38bdf8');
    skyGrad.addColorStop(1, '#bae6fd');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, horizonY + 2);

    // Fluffy Horizon Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    [0.16, 0.42, 0.72, 0.88].forEach((cxRatio, idx) => {
        const cx = W * cxRatio;
        const cy = horizonY * (idx % 2 === 0 ? 0.34 : 0.46);
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.arc(cx + 12, cy - 3, 14, 0, Math.PI * 2);
        ctx.arc(cx + 25, cy, 11, 0, Math.PI * 2);
        ctx.fill();
    });

    // Downtown Skyscrapers along the horizon
    const skylineBuildings = [
        { x: 0.03, w: 0.06, h: 0.17, col: '#0369a1' },
        { x: 0.11, w: 0.05, h: 0.22, col: '#075985' },
        { x: 0.19, w: 0.07, h: 0.15, col: '#0284c7' },
        { x: 0.29, w: 0.05, h: 0.20, col: '#0369a1' },
        { x: 0.66, w: 0.06, h: 0.21, col: '#075985' },
        { x: 0.74, w: 0.07, h: 0.16, col: '#0369a1' },
        { x: 0.84, w: 0.05, h: 0.23, col: '#0284c7' },
        { x: 0.91, w: 0.06, h: 0.18, col: '#075985' }
    ];
    skylineBuildings.forEach(b => {
        ctx.fillStyle = b.col;
        ctx.fillRect(W * b.x, horizonY - H * b.h, W * b.w, H * b.h);
    });

    // 2. Gravel Railway Yard Bed
    const bedGrad = ctx.createLinearGradient(0, horizonY, 0, H);
    bedGrad.addColorStop(0, '#64748b');
    bedGrad.addColorStop(0.35, '#475569');
    bedGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bedGrad;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // 3. Perspective Brick Retaining Walls with Graffiti Street Art
    const outerLeftFar = projectPoint(-1.75, 1.4, 0, W, H);
    const outerLeftNear = projectPoint(-1.75, -0.05, 0, W, H);
    const outerRightFar = projectPoint(1.75, 1.4, 0, W, H);
    const outerRightNear = projectPoint(1.75, -0.05, 0, W, H);

    ctx.fillStyle = '#9a3412';
    ctx.beginPath();
    ctx.moveTo(0, horizonY - 12);
    ctx.lineTo(outerLeftFar.x, outerLeftFar.groundY);
    ctx.lineTo(outerLeftNear.x, outerLeftNear.groundY);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(W, horizonY - 12);
    ctx.lineTo(outerRightFar.x, outerRightFar.groundY);
    ctx.lineTo(outerRightNear.x, outerRightNear.groundY);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Wall Top Concrete Trim
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, horizonY - 12);
    ctx.lineTo(outerLeftFar.x, outerLeftFar.groundY);
    ctx.moveTo(W, horizonY - 12);
    ctx.lineTo(outerRightFar.x, outerRightFar.groundY);
    ctx.stroke();

    // Scrolling Neon Graffiti Murals
    const graffitiColors = ['#ec4899', '#22c55e', '#facc15', '#06b6d4', '#a855f7'];
    for (let step = 0; step < 8; step++) {
        const zA = (step - worldScroll * 0.25) * 0.22;
        const zB = zA + 0.14;
        if (zB < 0 || zA > 1.4) continue;

        const col = graffitiColors[(step + waveCounter) % graffitiColors.length];
        const lA = projectPoint(-1.76, Math.max(0, zA), 0, W, H);
        const lB = projectPoint(-1.76, zB, 0, W, H);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(lA.x - 16 * lA.scale, lA.groundY - 6 * lA.scale);
        ctx.lineTo(lB.x - 16 * lB.scale, lB.groundY - 6 * lB.scale);
        ctx.lineTo(lB.x - 46 * lB.scale, lB.groundY - 26 * lB.scale);
        ctx.lineTo(lA.x - 46 * lA.scale, lA.groundY - 26 * lA.scale);
        ctx.closePath();
        ctx.fill();

        const rA = projectPoint(1.76, Math.max(0, zA), 0, W, H);
        const rB = projectPoint(1.76, zB, 0, W, H);
        ctx.beginPath();
        ctx.moveTo(rA.x + 16 * rA.scale, rA.groundY - 6 * rA.scale);
        ctx.lineTo(rB.x + 16 * rB.scale, rB.groundY - 6 * rB.scale);
        ctx.lineTo(rB.x + 46 * rB.scale, rB.groundY - 26 * rB.scale);
        ctx.lineTo(rA.x + 46 * rA.scale, rA.groundY - 26 * rA.scale);
        ctx.closePath();
        ctx.fill();
    }

    // 4. Three Railway Tracks: Wooden Sleepers & Twin Steel Rails
    const lanes = [-1, 0, 1];
    const tieSteps = 16;
    for (let t = 0; t < tieSteps; t++) {
        const z = ((t - worldScroll) / tieSteps) * 1.45;
        if (z < -0.05) continue;

        lanes.forEach(lane => {
            const p = projectPoint(lane, z, 0, W, H);
            const tieW = 78 * p.scale;
            const tieH = Math.max(2, 6 * p.scale);
            ctx.fillStyle = '#451a03';
            ctx.fillRect(p.x - tieW / 2, p.groundY - tieH / 2, tieW, tieH);
        });
    }

    lanes.forEach(lane => {
        [-26, 26].forEach(railOffset => {
            const nearP = projectPoint(lane, -0.06, 0, W, H);
            const farP = projectPoint(lane, 1.45, 0, W, H);

            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.moveTo(nearP.x + railOffset * nearP.scale, nearP.groundY);
            ctx.lineTo(farP.x + railOffset * farP.scale, farP.groundY);
            ctx.stroke();
        });
    });

    // Bottom Track Control Strip
    const guideItems = [
        { lane: -1, text: 'OCT 1 (Z–M) • LEFT TRACK', active: player.lane === -1 },
        { lane: 0, text: 'OCT 2 (,–T) • CENTER TRACK', active: player.lane === 0 },
        { lane: 1, text: 'OCT 3 (Y–P) • RIGHT TRACK', active: player.lane === 1 }
    ];
    guideItems.forEach(g => {
        const gp = projectPoint(g.lane, -0.02, 0, W, H);
        ctx.save();
        ctx.font = '900 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = g.active ? '#facc15' : 'rgba(241, 245, 249, 0.78)';
        ctx.fillText(g.text, gp.x, H - 5);
        ctx.restore();
    });
}

function draw3DSubwayTrain(ctx, obs, W, H) {
    const fGround = projectPoint(obs.lane, obs.zFront, 0, W, H);
    const fTop = projectPoint(obs.lane, obs.zFront, obs.height, W, H);
    const bGround = projectPoint(obs.lane, obs.zBack, 0, W, H);
    const bTop = projectPoint(obs.lane, obs.zBack, obs.height, W, H);

    const halfWF = 38 * fGround.scale;
    const halfWB = 38 * bGround.scale;
    const theme = obs.theme;

    ctx.save();

    // 1. Perspective Side Wall (for Left or Right lane trains)
    if (obs.lane !== 0) {
        const innerSign = obs.lane < 0 ? 1 : -1;
        const sideXF = fGround.x + innerSign * halfWF;
        const sideXB = bGround.x + innerSign * halfWB;

        ctx.fillStyle = theme.dark;
        ctx.beginPath();
        ctx.moveTo(sideXF, fGround.groundY);
        ctx.lineTo(sideXB, bGround.groundY);
        ctx.lineTo(sideXB, bTop.y);
        ctx.lineTo(sideXF, fTop.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Side Racing Stripe
        const midYF = (fGround.groundY + fTop.y) * 0.54;
        const midYB = (bGround.groundY + bTop.y) * 0.54;
        ctx.strokeStyle = theme.stripe;
        ctx.lineWidth = Math.max(2, 6 * fGround.scale);
        ctx.beginPath();
        ctx.moveTo(sideXF, midYF);
        ctx.lineTo(sideXB, midYB);
        ctx.stroke();
    }

    // 2. Train Roof Deck (Runners can jump on top!)
    ctx.fillStyle = theme.roof;
    ctx.beginPath();
    ctx.moveTo(fTop.x - halfWF, fTop.y);
    ctx.lineTo(fTop.x + halfWF, fTop.y);
    ctx.lineTo(bTop.x + halfWB, bTop.y);
    ctx.lineTo(bTop.x - halfWB, bTop.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 3. Yellow/Black Striped Front Boarding Ramp OR Front Train Cab
    if (obs.hasRamp) {
        const rampFront = projectPoint(obs.lane, obs.zFront - 0.08, 0, W, H);
        const rHalf = 34 * rampFront.scale;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(rampFront.x - rHalf, rampFront.groundY);
        ctx.lineTo(rampFront.x + rHalf, rampFront.groundY);
        ctx.lineTo(fTop.x + halfWF * 0.92, fTop.y);
        ctx.lineTo(fTop.x - halfWF * 0.92, fTop.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.8;
        ctx.stroke();
    } else {
        const cabX = fGround.x - halfWF;
        const cabY = fTop.y;
        const cabW = halfWF * 2;
        const cabH = fGround.groundY - fTop.y;

        ctx.fillStyle = theme.body;
        ctx.beginPath();
        ctx.roundRect(cabX, cabY, cabW, cabH, 5 * fGround.scale);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Destination Header Sign
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(cabX + cabW * 0.18, cabY + cabH * 0.06, cabW * 0.64, cabH * 0.11);

        // Dark Tinted Windshield + Glass Glare
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(cabX + cabW * 0.13, cabY + cabH * 0.21, cabW * 0.74, cabH * 0.30, 3 * fGround.scale);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = Math.max(1, 2 * fGround.scale);
        ctx.beginPath();
        ctx.moveTo(cabX + cabW * 0.24, cabY + cabH * 0.45);
        ctx.lineTo(cabX + cabW * 0.42, cabY + cabH * 0.25);
        ctx.stroke();

        // Bright Color Stripe
        ctx.fillStyle = theme.stripe;
        ctx.fillRect(cabX + 2, cabY + cabH * 0.57, cabW - 4, cabH * 0.14);

        // Dual Glowing Headlights
        const lightR = Math.max(2, 4.4 * fGround.scale);
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(cabX + cabW * 0.24, cabY + cabH * 0.81, lightR, 0, Math.PI * 2);
        ctx.arc(cabX + cabW * 0.76, cabY + cabH * 0.81, lightR, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function draw3DHurdleBarrier(ctx, obs, W, H) {
    const base = projectPoint(obs.lane, obs.zFront, 0, W, H);
    const top = projectPoint(obs.lane, obs.zFront, obs.height, W, H);
    const halfW = 34 * base.scale;
    const barH = Math.max(4, (base.groundY - top.y) * 0.46);

    ctx.save();
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(base.x - halfW + 4 * base.scale, top.y, 4 * base.scale, base.groundY - top.y);
    ctx.fillRect(base.x + halfW - 8 * base.scale, top.y, 4 * base.scale, base.groundY - top.y);

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(base.x - halfW, top.y, halfW * 2, barH);
    ctx.fillStyle = '#ffffff';
    for (let sx = -halfW + 6 * base.scale; sx < halfW - 8 * base.scale; sx += 16 * base.scale) {
        ctx.fillRect(base.x + sx, top.y, 8 * base.scale, barH);
    }
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(base.x - halfW, top.y, halfW * 2, barH);

    if (obs.zFront < 0.65 && halfW > 18) {
        ctx.fillStyle = '#facc15';
        ctx.font = `900 ${Math.max(8, Math.round(10 * base.scale))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('▲ JUMP', base.x, top.y - 3 * base.scale);
    }
    ctx.restore();
}

function draw3DHighDuckGate(ctx, obs, W, H) {
    const base = projectPoint(obs.lane, obs.zFront, 0, W, H);
    const top = projectPoint(obs.lane, obs.zFront, obs.height, W, H);
    const bottomBeam = projectPoint(obs.lane, obs.zFront, obs.minClearY + 4, W, H);
    const halfW = 35 * base.scale;
    const beamH = Math.max(5, bottomBeam.y - top.y);

    ctx.save();
    ctx.fillStyle = '#64748b';
    ctx.fillRect(base.x - halfW, top.y, 5 * base.scale, base.groundY - top.y);
    ctx.fillRect(base.x + halfW - 5 * base.scale, top.y, 5 * base.scale, base.groundY - top.y);

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(base.x - halfW, top.y, halfW * 2, beamH);
    ctx.fillStyle = '#ffffff';
    for (let sx = -halfW + 6 * base.scale; sx < halfW - 8 * base.scale; sx += 16 * base.scale) {
        ctx.fillRect(base.x + sx, top.y, 8 * base.scale, beamH);
    }
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(base.x - halfW, top.y, halfW * 2, beamH);

    if (obs.zFront < 0.65 && halfW > 18) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = `900 ${Math.max(8, Math.round(10 * base.scale))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('▼ ROLL', base.x, bottomBeam.y + 10 * base.scale);
    }
    ctx.restore();
}

function draw3DGoldCoin(ctx, coin, W, H) {
    const bob = Math.sin(coin.spin) * 2.5;
    const p = projectPoint(coin.lane, coin.z, coin.yHeight + bob, W, H);
    const r = Math.max(3, 10.5 * p.scale);

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = coin.noteLetter ? '#22c55e' : '#facc15';
    ctx.fill();
    ctx.lineWidth = Math.max(1, 1.8 * p.scale);
    ctx.strokeStyle = coin.noteLetter ? '#14532d' : '#92400e';
    ctx.stroke();

    if (r >= 6) {
        ctx.fillStyle = coin.noteLetter ? '#ffffff' : '#78350f';
        ctx.font = `900 ${Math.round(r * 1.15)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(coin.noteLetter || '♪', p.x, p.y + 0.5);
    }
    ctx.restore();
}

function drawStaffSurferRunner(ctx, W, H, now) {
    const groundP = projectPoint(player.visualLane, 0.03, 0, W, H);
    const charP = projectPoint(player.visualLane, 0.03, player.yHeight, W, H);
    const s = charP.scale * (H / 215);

    // Ground Shadow
    ctx.save();
    const shadowScale = Math.max(0.35, 1 - player.yHeight / 85);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(groundP.x, groundP.groundY, 16 * shadowScale, 5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(charP.x, charP.y);
    ctx.rotate((player.lane - player.visualLane) * 0.42);

    if (player.stumbleFlash > 0 && Math.floor(now / 60) % 2 === 0) {
        ctx.globalAlpha = 0.55;
    }

    // Neon Hoverboard Shield under feet
    if (player.hoverboardTimer > 0) {
        ctx.save();
        ctx.fillStyle = '#ec4899';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-18 * s, -4 * s, 36 * s, 7 * s, 4 * s);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Tuck & Roll animation
    if (player.rollTimer > 0 && player.yHeight <= 6) {
        ctx.translate(0, -11 * s);
        ctx.rotate(now / 55);
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(0, 0, 11 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, 6 * s, 0, Math.PI);
        ctx.fill();
        ctx.restore();
        return;
    }

    // Pumping Legs & Red High-Top Sneakers
    const legSwing = player.isJumping ? 5 * s : Math.sin(player.stridePhase) * 6 * s;
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(-7 * s, -17 * s + legSwing * 0.3, 5.5 * s, 12 * s);
    ctx.fillRect(1.5 * s, -17 * s - legSwing * 0.3, 5.5 * s, 12 * s);

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-8 * s, -6 * s + legSwing * 0.4, 6.5 * s, 5 * s);
    ctx.fillRect(1.5 * s, -6 * s - legSwing * 0.4, 6.5 * s, 5 * s);

    // Denim Vest over White Hoodie
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(-9 * s, -32 * s, 18 * s, 16 * s, 3 * s);
    ctx.fill();
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(-8 * s, -31 * s, 4 * s, 14 * s);
    ctx.fillRect(4 * s, -31 * s, 4 * s, 14 * s);

    // Dual Jetpack Canisters when flying
    if (player.jetpackTimer > 0) {
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-8 * s, -33 * s, 6 * s, 15 * s);
        ctx.fillRect(2 * s, -33 * s, 6 * s, 15 * s);
    }

    // Head & Iconic Red/White Trucker Cap
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, -38 * s, 7.5 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, -40 * s, 7.8 * s, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-5 * s, -41 * s, 10 * s, 3 * s);

    ctx.restore();
}

function drawInspectorAndDog(ctx, W, H, now) {
    const chaseZ = gamePhase === 'dying' ? 0.01 : -0.05;
    const p = projectPoint(player.visualLane, chaseZ, 0, W, H);
    const bob = Math.abs(Math.sin(now / 80)) * 3;

    ctx.save();
    // Uniformed Transit Inspector
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(p.x - 22, p.groundY - 24 - bob, 13, 20);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(p.x - 23, p.groundY - 28 - bob, 15, 4);

    // Guard Dog
    ctx.fillStyle = '#92400e';
    ctx.beginPath();
    ctx.ellipse(p.x + 18, p.groundY - 8 - bob, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawStaffSurfersHUD(ctx, W, H) {
    ctx.save();

    // Top-Right Score, Multiplier & Coins Counter
    const boxW = 215;
    const boxX = W - boxW - 10;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.80)';
    ctx.beginPath();
    ctx.roundRect(boxX, 8, boxW, 38, 8);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 15px monospace';
    ctx.fillText(String(Math.floor(score)).padStart(6, '0'), W - 18, 23);

    ctx.fillStyle = '#facc15';
    ctx.font = '800 11px -apple-system, sans-serif';
    ctx.fillText(`x${multiplier}  •  🪙 ${coins}  •  BEST ${bestScore}`, W - 18, 39);

    // Top-Left Musical Challenge Pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.beginPath();
    ctx.roundRect(10, 8, 225, 38, 8);
    ctx.fill();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '800 9.5px -apple-system, sans-serif';
    ctx.fillText('STAFF SURFERS CHALLENGE (ANY OCTAVE):', 18, 20);

    ctx.fillStyle = '#22c55e';
    ctx.font = '900 14px -apple-system, sans-serif';
    ctx.fillText(`🎯 PLAY "${activeTargetNote}"`, 18, 38);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 10.5px -apple-system, sans-serif';
    ctx.fillText(`Streak: ${noteStreak}/5 🛹`, 148, 37);

    // Active Power-Up Timer Banner
    if (player.jetpackTimer > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f97316';
        ctx.font = '900 13px -apple-system, sans-serif';
        ctx.fillText(`🚀 JETPACK FLIGHT: ${player.jetpackTimer.toFixed(1)}s`, W / 2, 24);
    } else if (player.hoverboardTimer > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ec4899';
        ctx.font = '900 13px -apple-system, sans-serif';
        ctx.fillText(`🛹 HOVERBOARD SHIELD: ${player.hoverboardTimer.toFixed(1)}s`, W / 2, 24);
    }

    // "BUSTED!" banner on crash
    if (gamePhase === 'dying') {
        ctx.textAlign = 'center';
        ctx.font = '900 28px -apple-system, sans-serif';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#0f172a';
        ctx.strokeText('BUSTED!', W / 2, H * 0.48);
        ctx.fillStyle = '#ef4444';
        ctx.fillText('BUSTED!', W / 2, H * 0.48);
    }

    ctx.restore();
}
