import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let lastFrameTime = 0;
let gamePhase = 'instructions'; 

// Match State
let playerScore = 0;
let aiScore = 0;
let currentRound = 1;
const MAX_ROUNDS = 5;
let isPlayerTurn = true; 

// Physics & Rendering
let cameraShake = 0;
let flashAlpha = 0;
let bannerText = '';
let bannerColor = '#ffffff';
let bannerTimer = 0;

// High-Fidelity Ball State
const ball = {
    active: false,
    x: 0, 
    y: 0, 
    z: 0, 
    vx: 0,
    vy: 0,
    vz: 0,
    curve: 0,
    spin: 0,
    scale: 1,
    result: null 
};

// Striker State
let activeTargetNote = null;
let powerMeter = 0;
let powerDir = 1;
let hasCurved = false;
const TARGETS = [
    { note: 'C', x: -140, y: 85 }, // Top Left
    { note: 'D', x: -140, y: 15 }, // Bottom Left
    { note: 'E', x: 0, y: 85 },    // Top Center
    { note: 'G', x: 140, y: 15 },  // Bottom Right
    { note: 'A', x: 140, y: 85 }   // Top Right
];

// Goalie State
const goalie = {
    x: 0, 
    y: 0, 
    isDiving: false,
    diveTargetX: 0,
    diveTargetY: 0,
    timer: 0
};

// Perspective Constants
const Z_NEAR = 10;
const Z_GOAL = 500;
const CAM_HEIGHT = 60;
const FOV = 400;

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
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.4);
        } else if (type === 'kick') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.25);
        } else if (type === 'curve') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(700, now + 0.25);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'net' || type === 'save') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(type === 'net' ? 150 : 280, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'goal') {
            [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(f, now + i * 0.1);
                gain.gain.setValueAtTime(0.1, now + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.4);
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
    try {
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
        cameraShake = 0; 
        flashAlpha = 0;

        gamePhase = 'instructions';
        showInstructionsPopup(bridge);
        
        const statusEl = document.getElementById('status');
        if (statusEl) statusEl.textContent = '⚽ Sharp Shooter: Read the instructions and click Blow The Whistle!';
    } catch (error) {
        console.error("Sharp Shooter Startup Error:", error);
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
            <div style="color:#38bdf8; font-weight:800; letter-spacing:2px; font-size:12px; margin-top:4px;">PRO PENALTY SHOWDOWN</div>
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
    ball.x = 0; ball.y = 0; 
    ball.z = isPlayerTurn ? Z_NEAR : Z_GOAL;
    ball.result = null;
    
    goalie.x = 0; goalie.y = 0; goalie.isDiving = false; goalie.timer = 0;

    gamePhase = isPlayerTurn ? 'striker_aim' : 'goalie_wait';
    playSoccerSfx('whistle');
    triggerBanner(isPlayerTurn ? 'YOUR KICK!' : 'DEFEND THE NET!', isPlayerTurn ? '#38bdf8' : '#f97316', 1.5);
    
    if (!isPlayerTurn) {
        setTimeout(() => {
            if (gamePhase === 'goalie_wait') executeAIKick();
        }, 1200 + Math.random() * 1000);
    }
}

function executeAIKick() {
    gamePhase = 'goalie_defend';
    ball.active = true;
    ball.x = 0; ball.y = 0; ball.z = Z_GOAL;
    
    const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
    ball.vx = target.x * (0.9 + Math.random() * 0.2);
    ball.vy = target.y * (0.8 + Math.random() * 0.4);
    ball.vz = -550; // High speed coming towards camera
    
    if (Math.random() > 0.5) {
        ball.curve = (Math.random() > 0.5 ? 1 : -1) * 350;
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
        if (gamePhase === 'striker_aim' && !isSharp) {
            const target = TARGETS.find(t => t.note === letter);
            if (target) {
                activeTargetNote = letter;
                bridge.highlightKey(noteStr, 500, '#facc15');
                powerMeter = Math.random(); 
                executePlayerKick(target);
            }
        } else if (gamePhase === 'striker_kick' && isSharp && !hasCurved) {
            hasCurved = true;
            ball.curve = ball.x > 0 ? -450 : 450; // Severe Magnus curve inward
            playSoccerSfx('curve');
            bridge.highlightKey(noteStr, 300, '#ec4899');
            triggerBanner('CURVE SPIN!', '#ec4899', 0.8);
        }
    } else {
        if (gamePhase === 'goalie_defend' && !goalie.isDiving) {
            goalie.isDiving = true;
            goalie.timer = 0;
            if (octave <= 1) {
                goalie.diveTargetX = -120; 
                goalie.diveTargetY = 40;
                bridge.highlightKey(noteStr, 400, '#38bdf8');
            } else if (octave === 2) {
                goalie.diveTargetX = 0; 
                goalie.diveTargetY = 80;
                bridge.highlightKey(noteStr, 400, '#22c55e');
            } else {
                goalie.diveTargetX = 120; 
                goalie.diveTargetY = 40;
                bridge.highlightKey(noteStr, 400, '#f97316');
            }
        }
    }
}

function executePlayerKick(target) {
    gamePhase = 'striker_kick';
    ball.active = true;
    ball.z = Z_NEAR;
    
    const accuracy = 1 - Math.abs(powerMeter - 0.8); 
    const errorX = (Math.random() - 0.5) * (1 - accuracy) * 80;
    const errorY = (Math.random() - 0.5) * (1 - accuracy) * 80;
    
    ball.vx = target.x + errorX;
    ball.vy = target.y + errorY;
    ball.vz = 450 + (powerMeter * 200); 
    ball.curve = 0;
    
    playSoccerSfx('kick');

    setTimeout(() => {
        if (gamePhase === 'striker_kick') {
            goalie.isDiving = true;
            goalie.timer = 0;
            if (Math.random() < 0.6) {
                goalie.diveTargetX = Math.sign(ball.vx) * 120; 
                goalie.diveTargetY = ball.vy > 50 ? 80 : 20;
            } else {
                goalie.diveTargetX = (Math.random() > 0.5 ? 1 : -1) * 120;
                goalie.diveTargetY = Math.random() * 80;
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
    
    // Check intersection at the goal line plane
    const isGoal = Math.abs(ball.x) < 180 && ball.y > 0 && ball.y < 100;
    const distToGoalie = Math.hypot(ball.x - goalie.x, ball.y - goalie.y);
    const isSaved = isGoal && distToGoalie < 50;

    if (!isGoal) {
        ball.result = 'miss';
        triggerBanner('MISSED WIDE!', '#ef4444', 1.5);
    } else if (isSaved) {
        ball.result = 'save';
        playSoccerSfx('save');
        triggerBanner('SAVED!', '#f97316', 1.5);
        if (!isPlayerTurn) playerScore += 100; 
    } else {
        ball.result = 'goal';
        playSoccerSfx('goal');
        triggerBanner('GOAL!!!', '#22c55e', 1.5);
        cameraShake = 0.5;
        flashAlpha = 0.8;
        if (isPlayerTurn) playerScore += 500;
        else aiScore += 1;
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
    }, 2500);
}

function endMatch(bridge) {
    gamePhase = 'gameover';
    const won = playerScore >= (aiScore * 500);
    const headline = won ? 'YOU WIN THE SHOOTOUT!' : 'AI WINS THE SHOOTOUT!';
    triggerBanner(headline, won ? '#22c55e' : '#ef4444', 3.0);
    
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
    }, 2500);
}

function gameLoop(now, bridge) {
    try {
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
            powerMeter += powerDir * dt * 1.8;
            if (powerMeter >= 1 || powerMeter <= 0) powerDir *= -1;
        }

        if (ball.active) {
            // High-fidelity sub-step physics integration
            ball.x += ball.vx * dt;
            ball.y += ball.vy * dt;
            ball.z += ball.vz * dt;
            ball.vx += ball.curve * dt; // Magnus effect
            
            ball.vy -= 180 * dt; // Gravity
            
            if (ball.y <= 0) {
                ball.y = 0;
                ball.vy = Math.abs(ball.vy) * 0.6; // Bounce up
            }

            ball.spin += Math.hypot(ball.vx, ball.vz) * dt * 0.1;

            if (goalie.isDiving) {
                goalie.timer += dt * 1.8;
                const t = Math.min(1, goalie.timer);
                const ease = 1 - Math.pow(1 - t, 3); 
                goalie.x = goalie.diveTargetX * ease;
                goalie.y = Math.max(0, goalie.diveTargetY * Math.sin(t * Math.PI) * 1.2); 
            }

            // Goal Line Intersection
            if (isPlayerTurn && ball.z >= Z_GOAL) {
                ball.z = Z_GOAL;
                ball.active = false;
                resolveShot(bridge);
            } else if (!isPlayerTurn && ball.z <= Z_NEAR) {
                ball.z = Z_NEAR;
                ball.active = false;
                resolveShot(bridge);
            }
        }

        const canvas = document.getElementById('waterfall-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        // Clear canvas explicitly
        ctx.clearRect(0, 0, W, H);

        ctx.save();
        if (cameraShake > 0) {
            const mag = cameraShake * 18;
            ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
        }

        // Full Screen 3D Projection Function
        const project = (x, y, z) => {
            // Protect against divide by zero or negative Z
            const safeZ = Math.max(1, z);
            const scale = FOV / safeZ;
            const screenX = (W / 2) + (x * scale);
            const screenY = (H * 0.75) - ((y - CAM_HEIGHT) * scale);
            return { x: screenX, y: screenY, scale };
        };

        if (isPlayerTurn) {
            // ==========================================
            // STRIKER PERSPECTIVE[cite: 8]
            // ==========================================
            
            // Sky & Stadium Backing
            const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.4);
            skyGrad.addColorStop(0, '#1e3a8a');
            skyGrad.addColorStop(1, '#60a5fa');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, W, H * 0.4);

            // Crowd & Stands
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, H * 0.25, W, H * 0.15);
            for(let i=0; i<600; i++) {
                ctx.fillStyle = ['#ef4444', '#3b82f6', '#facc15', '#ffffff'][Math.floor(Math.random()*4)];
                ctx.fillRect(Math.random()*W, H * 0.25 + Math.random()*H*0.15, 3, 3);
            }

            // Alternating 3D Grass Stripes
            for (let z = Z_GOAL + 100; z > Z_NEAR; z -= 40) {
                const pTopLeft = project(-800, 0, z);
                const pTopRight = project(800, 0, z);
                const pBotLeft = project(-800, 0, Math.max(1, z - 40));
                const pBotRight = project(800, 0, Math.max(1, z - 40));
                
                ctx.fillStyle = (Math.floor(z / 40) % 2 === 0) ? '#15803d' : '#166534';
                ctx.beginPath();
                ctx.moveTo(pTopLeft.x, pTopLeft.y);
                ctx.lineTo(pTopRight.x, pTopRight.y);
                ctx.lineTo(pBotRight.x, pBotRight.y);
                ctx.lineTo(pBotLeft.x, pBotLeft.y);
                ctx.fill();
            }

            // White Penalty Box Lines
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            const lineZ = Z_GOAL;
            const pbL = project(-280, 0, lineZ);
            const pbR = project(280, 0, lineZ);
            const pbLF = project(-280, 0, lineZ - 200);
            const pbRF = project(280, 0, lineZ - 200);
            
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(pbL.x, pbL.y); ctx.lineTo(pbLF.x, pbLF.y);
            ctx.lineTo(pbRF.x, pbRF.y); ctx.lineTo(pbR.x, pbR.y);
            ctx.stroke();

            // Goal Line
            const glL = project(-800, 0, Z_GOAL);
            const glR = project(800, 0, Z_GOAL);
            ctx.beginPath(); ctx.moveTo(glL.x, glL.y); ctx.lineTo(glR.x, glR.y); ctx.stroke();

            // Goal Net at Z_GOAL
            drawGoal(ctx, project, Z_GOAL);
            
            // Note Targets
            if (gamePhase === 'striker_aim') {
                TARGETS.forEach(t => {
                    const p = project(t.x, t.y, Z_GOAL - 10);
                    ctx.fillStyle = activeTargetNote === t.note ? '#22c55e' : 'rgba(255,255,255,0.5)';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 22 * p.scale, 0, Math.PI*2);
                    ctx.fill();
                    ctx.fillStyle = '#000';
                    ctx.font = `900 ${28 * p.scale}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(t.note, p.x, p.y);
                });
            }

            // Goalie at Z_GOAL
            drawKeeperSprite(ctx, project(goalie.x, goalie.y, Z_GOAL - 20));
            
            // Ball
            drawBallSprite(ctx, project(ball.x, ball.y, ball.z), ball.spin);

            // Striker Character in Foreground[cite: 8]
            if (gamePhase === 'striker_aim' || gamePhase === 'striker_kick') {
                drawStrikerSprite(ctx, project(-40, 0, Z_NEAR + 20));
            }

            // Power Meter
            if (gamePhase === 'striker_aim') {
                const mw = W * 0.4;
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(W/2 - mw/2, H - 60, mw, 24);
                const meterColor = powerMeter > 0.75 && powerMeter < 0.9 ? '#22c55e' : '#facc15';
                ctx.fillStyle = meterColor;
                ctx.fillRect(W/2 - mw/2, H - 60, mw * powerMeter, 24);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.strokeRect(W/2 - mw/2, H - 60, mw, 24);
            }

        } else {
            // ==========================================
            // GOALIE PERSPECTIVE (Inside the Net)[cite: 9]
            // ==========================================
            
            // Sky
            const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.3);
            skyGrad.addColorStop(0, '#1e3a8a');
            skyGrad.addColorStop(1, '#60a5fa');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, W, H * 0.3);

            // Huge Stadium background
            ctx.fillStyle = '#991b1b'; // Red seating[cite: 9]
            ctx.beginPath();
            ctx.moveTo(0, H*0.4); ctx.lineTo(W, H*0.4);
            ctx.lineTo(W, H*0.15); ctx.lineTo(0, H*0.15);
            ctx.fill();
            
            // Pitch Lines from goalie perspective
            ctx.fillStyle = '#15803d';
            ctx.fillRect(0, H*0.4, W, H*0.6);
            
            // Grass stripes receding into distance
            for (let z = Z_NEAR; z < Z_GOAL + 200; z += 40) {
                const pTopLeft = project(-800, 0, z + 40);
                const pTopRight = project(800, 0, z + 40);
                const pBotLeft = project(-800, 0, z);
                const pBotRight = project(800, 0, z);
                
                ctx.fillStyle = (Math.floor(z / 40) % 2 === 0) ? '#15803d' : '#166534';
                ctx.beginPath();
                ctx.moveTo(pTopLeft.x, pTopLeft.y);
                ctx.lineTo(pTopRight.x, pTopRight.y);
                ctx.lineTo(pBotRight.x, pBotRight.y);
                ctx.lineTo(pBotLeft.x, pBotLeft.y);
                ctx.fill();
            }

            // Striker in the distance at Z_GOAL
            drawStrikerSprite(ctx, project(0, 0, Z_GOAL));

            // Ball flying towards camera
            drawBallSprite(ctx, project(ball.x, ball.y, ball.z), ball.spin);

            // Goalposts framing the absolute edges of the screen
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 35;
            ctx.beginPath();
            ctx.moveTo(15, H); ctx.lineTo(15, 15); // Left post
            ctx.lineTo(W-15, 15);                  // Crossbar
            ctx.lineTo(W-15, H);                   // Right post
            ctx.stroke();

            // Net Pattern over the top
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for(let i=0; i<30; i++) {
                ctx.moveTo(0, i*15); ctx.lineTo(W, i*15);
                ctx.moveTo(i*(W/30), 0); ctx.lineTo(i*(W/30), 100);
            }
            ctx.stroke();

            // High-Res Player Gloves in Foreground[cite: 9]
            drawDetailedGloves(ctx, W, H, goalie.x, goalie.y);
        }

        drawHUD(ctx, W);

        if (bannerTimer > 0 && bannerText) {
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.fillRect(0, H/2 - 40, W, 80);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 42px -apple-system, sans-serif';
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
    } catch (err) {
        console.error("GameLoop Crash:", err);
    }
}

function drawGoal(ctx, project, z) {
    const tl = project(-180, 100, z);
    const tr = project(180, 100, z);
    const bl = project(-180, 0, z);
    const br = project(180, 0, z);
    
    // Back of net
    const btl = project(-160, 80, z + 80);
    const btr = project(160, 80, z + 80);
    const bbl = project(-160, 0, z + 80);
    const bbr = project(160, 0, z + 80);

    // Net Pattern (Criss-Cross)
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Vertical lines
    for(let i=0; i<=20; i++) {
        const topX = tl.x + (tr.x - tl.x) * (i/20);
        const botX = bl.x + (br.x - bl.x) * (i/20);
        ctx.moveTo(topX, tl.y); ctx.lineTo(botX, bl.y);
    }
    // Horizontal lines
    for(let i=0; i<=10; i++) {
        const leftY = tl.y + (bl.y - tl.y) * (i/10);
        const rightY = tr.y + (br.y - tr.y) * (i/10);
        ctx.moveTo(tl.x, leftY); ctx.lineTo(tr.x, rightY);
    }
    ctx.stroke();

    // Front Posts & Crossbar
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14 * tl.scale;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(bl.x, bl.y);
    ctx.lineTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.stroke();
}

function drawKeeperSprite(ctx, p) {
    const s = Math.max(1, 45 * p.scale);
    ctx.save();
    ctx.translate(p.x, p.y);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(0, 0, s*0.9, s*0.25, 0, 0, Math.PI*2); ctx.fill();
    // Body (Yellow/Orange jersey)
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-s*0.4, -s*1.3, s*0.8, s*0.9);
    // Gloves
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath(); ctx.arc(-s*0.6, -s*1.4, s*0.25, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.6, -s*1.4, s*0.25, 0, Math.PI*2); ctx.fill();
    // Legs (Blue shorts)
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(-s*0.35, -s*0.4, s*0.25, s*0.4);
    ctx.fillRect(s*0.1, -s*0.4, s*0.25, s*0.4);
    // Head
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath(); ctx.arc(0, -s*1.6, s*0.3, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

function drawStrikerSprite(ctx, p) {
    const s = Math.max(1, 50 * p.scale);
    ctx.save();
    ctx.translate(p.x, p.y);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(0, 0, s*0.8, s*0.2, 0, 0, Math.PI*2); ctx.fill();
    
    // Red/Black Striped Jersey[cite: 8]
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-s*0.35, -s*1.4, s*0.7, s);
    ctx.fillStyle = '#000000';
    ctx.fillRect(-s*0.15, -s*1.4, s*0.15, s);
    ctx.fillRect(s*0.15, -s*1.4, s*0.15, s);
    
    // White Shorts[cite: 8]
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-s*0.35, -s*0.4, s*0.7, s*0.25);
    
    // Legs & Red Socks
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(-s*0.25, -s*0.15, s*0.15, s*0.15);
    ctx.fillRect(s*0.1, -s*0.15, s*0.15, s*0.15);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-s*0.25, -0, s*0.15, s*0.25);
    ctx.fillRect(s*0.1, -0, s*0.15, s*0.25);
    
    // Head (Blonde hair[cite: 8])
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(0, -s*1.65, s*0.28, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

function drawDetailedGloves(ctx, W, H, gx, gy) {
    // Maps goalie position (x: -120 to 120, y: 0 to 80) to screen coordinates
    const baseX = W/2 + (gx / 120) * (W * 0.4);
    const baseY = H * 0.85 - (gy / 80) * (H * 0.35);
    
    ctx.save();
    ctx.translate(baseX, baseY);
    
    const drawGlove = (offsetX, angle) => {
        ctx.save();
        ctx.translate(offsetX, 0);
        ctx.rotate(angle);
        
        // Glove Base (Grey)[cite: 9]
        ctx.fillStyle = '#9ca3af'; 
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 4;
        
        ctx.beginPath();
        ctx.roundRect(-40, -50, 80, 100, 15);
        ctx.fill(); ctx.stroke();
        
        // Black Palm Padding
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.roundRect(-25, -30, 50, 60, 8);
        ctx.fill();
        
        // Fingers
        ctx.fillStyle = '#9ca3af';
        for(let i=0; i<4; i++) {
            const fx = -30 + i*20;
            ctx.beginPath();
            ctx.roundRect(fx, -90, 16, 45, 8);
            ctx.fill(); ctx.stroke();
        }
        // Thumb
        ctx.beginPath();
        ctx.roundRect(40, -20, 30, 18, 8);
        ctx.fill(); ctx.stroke();
        
        ctx.restore();
    };

    drawGlove(-70, -0.15); // Left glove tilted
    drawGlove(70, 0.15);   // Right glove tilted
    
    ctx.restore();
}

function drawBallSprite(ctx, p, spin) {
    const r = Math.max(8, 45 * p.scale); // Larger ball size
    ctx.save();
    ctx.translate(p.x, p.y - r);
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.ellipse(0, r + 4*p.scale, r*0.8, r*0.2, 0, 0, Math.PI*2); ctx.fill();

    // Clip to circle for seamless rotation
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); 
    ctx.clip();

    ctx.rotate(spin);
    
    // Base white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r, -r, r*2, r*2);
    
    // Classic Hexagon Soccer Ball Pattern
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(0, 0, r*0.4, 0, Math.PI*2); ctx.fill(); // Center pentagon
    
    for(let i=0; i<5; i++) {
        const ang = (i * Math.PI * 2 / 5);
        ctx.beginPath();
        ctx.arc(Math.cos(ang)*r*0.9, Math.sin(ang)*r*0.9, r*0.35, 0, Math.PI*2);
        ctx.fill();
        
        // Connecting lines
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 3 * p.scale;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang)*r*0.4, Math.sin(ang)*r*0.4);
        ctx.lineTo(Math.cos(ang)*r*0.9, Math.sin(ang)*r*0.9);
        ctx.stroke();
    }
    
    ctx.restore();
}

function drawHUD(ctx, W) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, 48);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 20px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`ROUND: ${currentRound}/${MAX_ROUNDS}`, 20, 14);
    
    ctx.textAlign = 'right';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`YOU: ${playerScore}    AI: ${aiScore}`, W - 20, 14);
}
