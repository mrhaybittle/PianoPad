import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let lastFrameTime = 0;
let gamePhase = 'instructions'; // 'instructions' | 'striker_aim' | 'striker_kick' | 'goalie_wait' | 'goalie_defend' | 'round_end' | 'gameover'

// Match State
let playerScore = 0;
let aiScore = 0;
let currentRound = 1;
const MAX_ROUNDS = 5;
let isPlayerTurn = true; // true = Player is Striker, false = Player is Goalie

// Physics & Rendering
let cameraShake = 0;
let flashAlpha = 0;
let bannerText = '';
let bannerColor = '#ffffff';
let bannerTimer = 0;

// Ball State
const ball = {
    active: false,
    x: 0, // -1 (left post) to 1 (right post)
    y: 0, // 0 (ground) to 1 (crossbar)
    z: 0, // 0 (kicker) to 1 (goal line)
    vx: 0,
    vy: 0,
    vz: 0,
    curve: 0,
    spin: 0,
    scale: 1,
    result: null // 'goal', 'save', 'miss'
};

// Striker State
let activeTargetNote = null;
let powerMeter = 0;
let powerDir = 1;
let hasCurved = false;
const TARGETS = [
    { note: 'C', x: -0.85, y: 0.85 }, // Top Left
    { note: 'D', x: -0.85, y: 0.15 }, // Bottom Left
    { note: 'E', x: 0, y: 0.85 },     // Top Center
    { note: 'G', x: 0.85, y: 0.15 },  // Bottom Right
    { note: 'A', x: 0.85, y: 0.85 }   // Top Right
];

// Goalie State (AI or Player)
const goalie = {
    x: 0, // -1 to 1
    y: 0, 
    isDiving: false,
    diveTargetX: 0,
    diveTargetY: 0,
    timer: 0
};

// Audio
function playSoccerSfx(type) {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        if (type === 'whistle') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(2400, now);
            osc.frequency.setValueAtTime(2600, now + 0.1);
            osc.frequency.setValueAtTime(2400, now + 0.2);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'kick') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'curve') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'net' || type === 'save') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(type === 'net' ? 180 : 300, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'goal') {
            [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(f, now + i * 0.1);
                gain.gain.setValueAtTime(0.08, now + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + i * 0.1);
                osc.stop(now + i * 0.1 + 0.35);
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

    playerScore = 0;
    aiScore = 0;
    currentRound = 1;
    isPlayerTurn = true;
    shakeTimer = 0;
    flashAlpha = 0;

    gamePhase = 'instructions';
    showInstructionsPopup(bridge);
}

function showInstructionsPopup(bridge) {
    let popup = document.getElementById('sharp-shooter-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'sharp-shooter-popup';
        popup.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #1e3a8a, #0f172a);
            border: 4px solid #38bdf8; border-radius: 12px; padding: 24px;
            color: white; font-family: -apple-system, sans-serif; z-index: 9999;
            width: 90%; max-width: 440px; box-shadow: 0 20px 50px rgba(0,0,0,0.8);
            text-align: center;
        `;
        document.body.appendChild(popup);
    }

    popup.innerHTML = `
        <div style="margin-bottom:15px;">
            <h2 style="margin:0; font-size:32px; font-weight:900; color:#ffffff; font-style:italic;">
                SHARP <span style="color:#facc15; font-size:38px;">♯</span> SHOOTER
            </h2>
            <div style="color:#38bdf8; font-weight:800; letter-spacing:2px; font-size:12px; margin-top:4px;">PENALTY KICK SHOWDOWN</div>
        </div>
        <div style="background:rgba(0,0,0,0.4); padding:15px; border-radius:8px; text-align:left; font-size:14px; line-height:1.6; margin-bottom:15px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="color:#facc15; font-weight:bold; margin-bottom:5px;">⚽ STRIKER MODE:</div>
            <div style="margin-bottom:4px;"><b>AIM & POWER:</b> HOLD a star's Note Letter (C, D, E, G, A) to build power, then RELEASE to kick!</div>
            <div style="margin-bottom:12px;"><b>CURVE SPIN:</b> Tap ANY <b>Black Key (♯)</b> right after kicking to bend it around the keeper!</div>
            <div style="color:#38bdf8; font-weight:bold; margin-bottom:5px;">🧤 GOALIE MODE:</div>
            <div><b>DIVE:</b> Octave 1 = Dive Left • Octave 2 = Stay Center • Octave 3 = Dive Right.</div>
        </div>
        <button id="btn-start-sharp" style="background:#22c55e; color:white; border:none; padding:14px; font-size:18px; font-weight:900; border-radius:8px; cursor:pointer; width:100%; box-shadow:0 4px 0 #15803d; text-transform:uppercase;">Blow The Whistle</button>
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
    activeTargetNote = null;
    powerMeter = 0;
    powerDir = 1;
    hasCurved = false;
    ball.active = false;
    ball.x = 0; ball.y = 0; ball.z = isPlayerTurn ? 0 : 1;
    ball.result = null;
    
    goalie.x = 0; goalie.y = 0; goalie.isDiving = false; goalie.timer = 0;

    gamePhase = isPlayerTurn ? 'striker_aim' : 'goalie_wait';
    playSoccerSfx('whistle');
    triggerBanner(isPlayerTurn ? 'YOUR KICK!' : 'DEFEND THE NET!', isPlayerTurn ? '#38bdf8' : '#f97316', 1.5);
    
    if (!isPlayerTurn) {
        // AI kicks after a random delay
        setTimeout(() => {
            if (gamePhase === 'goalie_wait') executeAIKick();
        }, 1200 + Math.random() * 1000);
    }
}

function executeAIKick() {
    gamePhase = 'goalie_defend';
    ball.active = true;
    ball.x = 0; ball.y = 0; ball.z = 1;
    
    // AI picks a random target
    const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
    ball.vx = target.x * (0.8 + Math.random() * 0.4);
    ball.vy = target.y * (0.8 + Math.random() * 0.4);
    ball.vz = -1.8; // Moving towards camera
    
    // AI randomly adds curve
    if (Math.random() > 0.5) {
        ball.curve = (Math.random() > 0.5 ? 1 : -1) * 0.8;
    } else {
        ball.curve = 0;
    }
    
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
        // --- STRIKER MODE ---
        if (gamePhase === 'striker_aim' && !isSharp) {
            const target = TARGETS.find(t => t.note === letter);
            if (target) {
                activeTargetNote = letter;
                bridge.highlightKey(noteStr, 500, '#facc15');
                
                powerMeter = Math.random(); // Simulate meter catch for immediate taps
                executePlayerKick(target);
            }
        } else if (gamePhase === 'striker_kick' && isSharp && !hasCurved) {
            // Apply Banana Curve Spin mid-air
            hasCurved = true;
            ball.curve = ball.x > 0 ? -1.2 : 1.2; // Curve inwards
            playSoccerSfx('curve');
            bridge.highlightKey(noteStr, 300, '#ec4899');
            triggerBanner('CURVE SPIN!', '#ec4899', 0.8);
        }
    } else {
        // --- GOALIE MODE ---
        if (gamePhase === 'goalie_defend' && !goalie.isDiving) {
            goalie.isDiving = true;
            goalie.timer = 0;
            if (octave <= 1) {
                goalie.diveTargetX = -1; // Dive Left
                goalie.diveTargetY = 0.5;
                bridge.highlightKey(noteStr, 400, '#38bdf8');
            } else if (octave === 2) {
                goalie.diveTargetX = 0; // Stay Center
                goalie.diveTargetY = 0.8;
                bridge.highlightKey(noteStr, 400, '#22c55e');
            } else {
                goalie.diveTargetX = 1; // Dive Right
                goalie.diveTargetY = 0.5;
                bridge.highlightKey(noteStr, 400, '#f97316');
            }
        }
    }
}

function executePlayerKick(target) {
    gamePhase = 'striker_kick';
    ball.active = true;
    ball.z = 0;
    
    // Apply power meter accuracy
    const accuracy = 1 - Math.abs(powerMeter - 0.8); // 0.8 is sweet spot
    const errorX = (Math.random() - 0.5) * (1 - accuracy) * 1.5;
    const errorY = (Math.random() - 0.5) * (1 - accuracy) * 1.5;
    
    ball.vx = target.x + errorX;
    ball.vy = target.y + errorY;
    ball.vz = 1.8 + (powerMeter * 0.5); // Speed based on power
    ball.curve = 0;
    
    playSoccerSfx('kick');

    // AI Goalie Reaction
    setTimeout(() => {
        if (gamePhase === 'striker_kick') {
            goalie.isDiving = true;
            goalie.timer = 0;
            // AI tries to predict
            if (Math.random() < 0.6) {
                goalie.diveTargetX = Math.sign(ball.vx); // Dives correct way 60% of time
                goalie.diveTargetY = ball.vy > 0.5 ? 0.8 : 0.2;
            } else {
                goalie.diveTargetX = Math.random() > 0.5 ? 1 : -1;
                goalie.diveTargetY = Math.random();
            }
        }
    }, 200 + Math.random() * 200);
}

function triggerBanner(text, color, duration) {
    bannerText = text;
    bannerColor = color;
    bannerTimer = duration;
}

function resolveShot(bridge) {
    gamePhase = 'round_end';
    const isGoal = Math.abs(ball.x) < 1.0 && ball.y > 0 && ball.y < 1.0;
    const isSaved = isGoal && Math.hypot(ball.x - goalie.x, ball.y - goalie.y) < 0.35;

    if (!isGoal) {
        ball.result = 'miss';
        triggerBanner('MISSED WIDE!', '#ef4444', 1.5);
    } else if (isSaved) {
        ball.result = 'save';
        playSoccerSfx('save');
        triggerBanner('SAVED!', '#f97316', 1.5);
        if (!isPlayerTurn) playerScore += 100; // Player saved AI's shot
    } else {
        ball.result = 'goal';
        playSoccerSfx('goal');
        triggerBanner('GOAL!!!', '#22c55e', 1.5);
        cameraShake = 0.4;
        flashAlpha = 0.8;
        if (isPlayerTurn) playerScore += 500;
        else aiScore += 1;
    }

    setTimeout(() => {
        if (gamePhase !== 'round_end') return;
        
        if (!isPlayerTurn) {
            currentRound++;
        }
        
        if (currentRound > MAX_ROUNDS) {
            endMatch(bridge);
        } else {
            isPlayerTurn = !isPlayerTurn;
            setupRound();
        }
    }, 2000);
}

function endMatch(bridge) {
    gamePhase = 'gameover';
    const won = playerScore >= (aiScore * 500);
    const headline = won ? 'YOU WIN THE SHOOTOUT!' : 'AI WINS THE SHOOTOUT!';
    triggerBanner(headline, won ? '#22c55e' : '#ef4444', 2.0);
    
    setTimeout(() => {
        if (bridge) {
            bridge.finishCustomMiniGame(
                'Sharp Shooter',
                playerScore,
                `<span style="color:${won ? '#22c55e' : '#ef4444'}; font-weight:800;">${headline}</span><br>` +
                `Final Score: <span style="color:#facc15; font-size:1.45rem; font-weight:900;">${playerScore}</span>`,
                () => startSharpShooter(bridge)
            );
        }
    }, 2000);
}

function gameLoop(now, bridge) {
    if (bridge.getActiveMiniGame() !== 'sharpShooter') {
        stopSharpShooter();
        return;
    }
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (cameraShake > 0) cameraShake = Math.max(0, cameraShake - dt);
    if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 2);
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    if (gamePhase === 'striker_aim') {
        powerMeter += powerDir * dt * 1.5;
        if (powerMeter >= 1 || powerMeter <= 0) powerDir *= -1;
    }

    if (ball.active) {
        // Physics integration
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.z += ball.vz * dt;
        ball.vx += ball.curve * dt * 2.5; // Apply curve acceleration
        
        // Gravity
        ball.vy -= 0.8 * dt;
        if (ball.y < 0) {
            ball.y = 0;
            ball.vy *= -0.6; // Bounce
        }

        // Spin visual
        ball.spin += Math.hypot(ball.vx, ball.vz) * dt * 10;

        // Goalie Dive Animation
        if (goalie.isDiving) {
            goalie.timer += dt * 2;
            const t = Math.min(1, goalie.timer);
            const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
            goalie.x = goalie.diveTargetX * ease;
            goalie.y = goalie.diveTargetY * Math.sin(t * Math.PI); // Arc jump
        }

        // Check Goal Plane Intersection
        if (isPlayerTurn && ball.z >= 1.0) {
            ball.z = 1.0;
            ball.active = false;
            resolveShot(bridge);
        } else if (!isPlayerTurn && ball.z <= 0) {
            ball.z = 0;
            ball.active = false;
            resolveShot(bridge);
        }
    }

    // --- RENDER 2.5D PERSPECTIVE ---
    const canvas = document.getElementById('waterfall-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.save();
    if (cameraShake > 0) {
        const mag = cameraShake * 15;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    // Draw Sky & Pitch Background
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.4);
    skyGrad.addColorStop(0, '#1e3a8a');
    skyGrad.addColorStop(1, '#60a5fa');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H * 0.4);

    // Stadium Crowd (Pixelated)
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, H * 0.2, W, H * 0.2);
    for(let i=0; i<400; i++) {
        ctx.fillStyle = ['#ef4444', '#3b82f6', '#facc15', '#ffffff'][Math.floor(Math.random()*4)];
        ctx.fillRect(Math.random()*W, H * 0.2 + Math.random()*H*0.2, 4, 4);
    }

    // Pitch (Grass)
    const pitchGrad = ctx.createLinearGradient(0, H * 0.4, 0, H);
    pitchGrad.addColorStop(0, '#15803d');
    pitchGrad.addColorStop(1, '#22c55e');
    ctx.fillStyle = pitchGrad;
    ctx.fillRect(0, H * 0.4, W, H * 0.6);

    // Coordinate Mapping Helper
    // Maps (x, y, z) where x is -1 to 1, y is 0 (ground) to 1 (top of goal), z is 0 (near) to 1 (far)
    const project = (x, y, z) => {
        // If player turn, z=0 is near. If goalie turn, z=1 is near.
        const effectiveZ = isPlayerTurn ? z : 1 - z; 
        const scale = 1 / (1 + effectiveZ * 2.5); // Perspective division
        const screenX = W / 2 + (x * W * 0.4) * scale;
        const screenY = H * 0.85 - (y * H * 0.3) * scale - (effectiveZ * H * 0.15);
        return { x: screenX, y: screenY, scale };
    };

    if (isPlayerTurn) {
        // STRIKER PERSPECTIVE
        drawGoal(ctx, W, H, project, 1.0); // Goal is at z=1
        
        // Draw Target Stars
        if (gamePhase === 'striker_aim') {
            TARGETS.forEach(t => {
                const p = project(t.x, t.y, 1.0);
                ctx.fillStyle = activeTargetNote === t.note ? '#22c55e' : 'rgba(255,255,255,0.5)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 15 * p.scale, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.font = `900 ${18 * p.scale}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(t.note, p.x, p.y);
            });
        }

        // Draw Goalie Sprite at z=1
        drawKeeperSprite(ctx, project(goalie.x, goalie.y, 1.0));
        
        // Draw Ball
        drawBallSprite(ctx, project(ball.x, ball.y, ball.z), ball.spin);

        // Power Meter Overlay
        if (gamePhase === 'striker_aim') {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(W/2 - 100, H - 40, 200, 20);
            const meterColor = powerMeter > 0.7 && powerMeter < 0.9 ? '#22c55e' : '#facc15';
            ctx.fillStyle = meterColor;
            ctx.fillRect(W/2 - 100, H - 40, 200 * powerMeter, 20);
            ctx.strokeStyle = '#fff';
            ctx.strokeRect(W/2 - 100, H - 40, 200, 20);
        }

    } else {
        // GOALIE PERSPECTIVE
        // Goal is at z=0 (framing the screen)
        drawGoal(ctx, W, H, project, 0.0);

        // Opponent Kicker in distance at z=1
        const kickerP = project(0, 0, 1.0);
        ctx.fillStyle = '#dc2626'; // Red jersey
        ctx.fillRect(kickerP.x - 10*kickerP.scale, kickerP.y - 40*kickerP.scale, 20*kickerP.scale, 40*kickerP.scale);

        // Draw Ball
        drawBallSprite(ctx, project(ball.x, ball.y, ball.z), ball.spin);

        // Draw Player Gloves in Foreground
        drawGloves(ctx, W, H, goalie.x, goalie.y);
    }

    // Top HUD
    drawHUD(ctx, W);

    // Banner Text
    if (bannerTimer > 0 && bannerText) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, H/2 - 30, W, 60);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 32px sans-serif';
        ctx.fillStyle = bannerColor;
        ctx.fillText(bannerText, W/2, H/2);
    }

    if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
    if (gamePhase !== 'gameover') {
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}

function drawGoal(ctx, W, H, project, z) {
    const tl = project(-1.2, 1.2, z);
    const tr = project(1.2, 1.2, z);
    const bl = project(-1.2, 0, z);
    const br = project(1.2, 0, z);

    // Net Pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<=10; i++) {
        const xl = tl.x + (bl.x - tl.x) * (i/10);
        const yl = tl.y + (bl.y - tl.y) * (i/10);
        const xr = tr.x + (br.x - tr.x) * (i/10);
        const yr = tr.y + (br.y - tr.y) * (i/10);
        ctx.moveTo(xl, yl); ctx.lineTo(xr, yr);
    }
    for(let i=0; i<=20; i++) {
        const xt = tl.x + (tr.x - tl.x) * (i/20);
        const yt = tl.y + (tr.y - tl.y) * (i/20);
        const xb = bl.x + (br.x - bl.x) * (i/20);
        const yb = bl.y + (br.y - bl.y) * (i/20);
        ctx.moveTo(xt, yt); ctx.lineTo(xb, yb);
    }
    ctx.stroke();

    // Posts & Crossbar
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8 * tl.scale;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(bl.x, bl.y);
    ctx.lineTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.stroke();
}

function drawKeeperSprite(ctx, p) {
    const s = Math.max(1, 40 * p.scale);
    ctx.save();
    ctx.translate(p.x, p.y);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, 0, s*0.8, s*0.2, 0, 0, Math.PI*2); ctx.fill();
    // Body (Yellow jersey)
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-s*0.4, -s*1.2, s*0.8, s*0.8);
    // Legs
    ctx.fillStyle = '#000';
    ctx.fillRect(-s*0.3, -s*0.4, s*0.2, s*0.4);
    ctx.fillRect(s*0.1, -s*0.4, s*0.2, s*0.4);
    // Head
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath(); ctx.arc(0, -s*1.4, s*0.25, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

function drawGloves(ctx, W, H, gx, gy) {
    const baseX = W/2 + gx * W * 0.4;
    const baseY = H * 0.8 - Math.max(0, gy) * H * 0.3;
    
    ctx.save();
    ctx.fillStyle = '#9ca3af'; // Grey/Black gloves
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    
    // Left Glove
    ctx.beginPath();
    ctx.roundRect(baseX - 60, baseY - 30, 40, 60, 10);
    ctx.fill(); ctx.stroke();
    
    // Right Glove
    ctx.beginPath();
    ctx.roundRect(baseX + 20, baseY - 30, 40, 60, 10);
    ctx.fill(); ctx.stroke();
    
    ctx.restore();
}

function drawBallSprite(ctx, p, spin) {
    const r = Math.max(2, 25 * p.scale);
    ctx.save();
    ctx.translate(p.x, p.y - r);
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(0, r+2, r*0.8, r*0.2, 0, 0, Math.PI*2); ctx.fill();

    // Ball rotation
    ctx.rotate(spin);
    
    // Base white
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
    
    // Simple hex patches for soccer ball look
    ctx.fillStyle = '#111827';
    for(let i=0; i<3; i++) {
        const ang = (i * Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.arc(Math.cos(ang)*r*0.5, Math.sin(ang)*r*0.5, r*0.3, 0, Math.PI*2);
        ctx.fill();
    }
    
    ctx.restore();
}

function drawHUD(ctx, W) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`ROUND: ${currentRound}/${MAX_ROUNDS}`, 16, 12);
    
    ctx.textAlign = 'right';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`YOU: ${playerScore}   AI: ${aiScore}`, W - 16, 12);
}
