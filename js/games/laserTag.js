import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let syncIntervalId = null;
let lastFrameTime = 0;
let gamePhase = 'lobby'; // 'lobby' | 'playing' | 'spectating'

// Local Player State
const localPlayer = {
    x: 0, y: 0,
    angle: 0,
    turnDir: 0, // -1 left, 1 right
    isAlive: true,
    score: 0,
    noteTag: 'C4',
    team: 'solo'
};

// Remote Players & Game State
let remotePlayers = {};
let activeLasers = [];
let particles = [];
let activeRoomCode = null;
let localId = null;

// Map Setup (0 = Floor, 1 = Wall)
const TILE_SIZE = 64;
const MAP_COLS = 20;
const MAP_ROWS = 16;
const ARENA_MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1],
    [1,0,1,1,0,0,1,0,1,1,1,1,0,1,0,0,1,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,0,1,1,1,0,1,1,1,1,0,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,0,1,0,1,1,0,0,0,0,1,1,0,1,0,1,1,1],
    [1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
    [1,0,1,1,1,0,1,1,1,0,0,1,1,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,1,0,1,1,1,0,1,1,1,1,0,1,1,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,1,0,0,1,0,1,1,1,1,0,1,0,0,1,1,0,1],
    [1,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// Target Notes for players to be assigned
const ASSIGNABLE_NOTES = ['C3','D3','E3','F3','G3','A3','B3','C4','D4','E4','F4','G4','A4','B4'];

function playLaserPew() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
    } catch(e){}
}

function playExplosion() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
    } catch(e){}
}

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 400,
            vy: (Math.random() - 0.5) * 400,
            life: 1.0,
            color: color
        });
    }
}

// Check if a line between two points hits a wall
function hasLineOfSight(x1, y1, x2, y2) {
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
        const tx = x1 + (x2 - x1) * (i / steps);
        const ty = y1 + (y2 - y1) * (i / steps);
        const col = Math.floor(tx / TILE_SIZE);
        const row = Math.floor(ty / TILE_SIZE);
        if (ARENA_MAP[row] && ARENA_MAP[row][col] === 1) return false;
    }
    return true;
}

export function stopLaserTag() {
    if (animFrameId !== null) cancelAnimationFrame(animFrameId);
    if (syncIntervalId !== null) clearInterval(syncIntervalId);
    animFrameId = null;
    syncIntervalId = null;
    gamePhase = 'lobby';
}

export async function startLaserTag(bridge) {
    initAudio();
    stopLaserTag();
    bridge.exitActiveMiniGame();
    document.getElementById('arcade-hub').classList.remove('open');
    bridge.setActiveMiniGame('laserTag');

    const state = bridge.getState();
    localId = state.localStudentId;
    activeRoomCode = prompt("Enter a 3-Digit Room Code for Laser Tag Arena:", "123");
    if (!activeRoomCode || !window.firebaseDb) {
        alert("Firebase required for Laser Tag. Returning to menu.");
        bridge.exitActiveMiniGame();
        return;
    }

    // Assign a random safe spawn location
    let spawned = false;
    while (!spawned) {
        const c = Math.floor(Math.random() * MAP_COLS);
        const r = Math.floor(Math.random() * MAP_ROWS);
        if (ARENA_MAP[r][c] === 0) {
            localPlayer.x = c * TILE_SIZE + TILE_SIZE / 2;
            localPlayer.y = r * TILE_SIZE + TILE_SIZE / 2;
            spawned = true;
        }
    }
    
    localPlayer.angle = 0;
    localPlayer.turnDir = 0;
    localPlayer.isAlive = true;
    localPlayer.score = 0;
    localPlayer.noteTag = ASSIGNABLE_NOTES[Math.floor(Math.random() * ASSIGNABLE_NOTES.length)];
    
    activeLasers = [];
    particles = [];
    remotePlayers = {};
    gamePhase = 'playing';
    lastFrameTime = performance.now();

    // Firebase Listener
    const { onValue } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    const roomRef = window.firebaseRef(window.firebaseDb, `pianopad_lasertag/${activeRoomCode}`);
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            remotePlayers = data;
            
            // Check if I was killed!
            if (remotePlayers[localId] && remotePlayers[localId].isAlive === false && localPlayer.isAlive) {
                localPlayer.isAlive = false;
                gamePhase = 'spectating';
                playExplosion();
                spawnParticles(localPlayer.x, localPlayer.y, '#ef4444', 30);
                document.getElementById('status').textContent = '💥 DEFEATED! You are now spectating. Tap keys to cheer/emote!';
            }
        }
    });

    // Firebase Sync Loop (Client Prediction)
    syncIntervalId = setInterval(async () => {
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        await update(window.firebaseRef(window.firebaseDb, `pianopad_lasertag/${activeRoomCode}/${localId}`), {
            x: localPlayer.x,
            y: localPlayer.y,
            angle: localPlayer.angle,
            isAlive: localPlayer.isAlive,
            noteTag: localPlayer.noteTag,
            name: state.sessionStudentName || 'Surfer',
            avatar: state.sessionStudentAvatar || '🏃'
        });
    }, 100);

    document.getElementById('status').textContent = '🛸 NEON LASER TAG! Low C steers LEFT. High C steers RIGHT. Play opponents notes to SHOOT!';
    animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));
}

export async function handleLaserTagInput(noteStr, bridge) {
    if (gamePhase === 'spectating') {
        // Drop an emote on the map where the player died
        spawnParticles(localPlayer.x, localPlayer.y, '#facc15', 5);
        return;
    }

    if (gamePhase !== 'playing' || !localPlayer.isAlive) return;

    const n = noteStr.toUpperCase().trim();
    
    // Steering Logic
    if (n === 'C1' || n === 'C2') {
        localPlayer.turnDir = -1; 
        setTimeout(() => localPlayer.turnDir = 0, 150); // Stop turning after short duration
        return;
    }
    if (n === 'C5' || n === 'C4') {
        localPlayer.turnDir = 1;
        setTimeout(() => localPlayer.turnDir = 0, 150);
        return;
    }

    // Shooting Logic: Check line of sight for players matching this note
    let targetHit = null;
    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !opp.isAlive) continue;
        
        // Is this the note hovering over them?
        if (opp.noteTag === n) {
            // Are they on our screen and in line of sight?
            const dist = Math.hypot(opp.x - localPlayer.x, opp.y - localPlayer.y);
            if (dist < 600 && hasLineOfSight(localPlayer.x, localPlayer.y, opp.x, opp.y)) {
                targetHit = { id, x: opp.x, y: opp.y };
                break;
            }
        }
    }

    if (targetHit) {
        playLaserPew();
        activeLasers.push({
            x1: localPlayer.x, y1: localPlayer.y,
            x2: targetHit.x, y2: targetHit.y,
            life: 1.0
        });

        // Register the kill in Firebase!
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        await update(window.firebaseRef(window.firebaseDb, `pianopad_lasertag/${activeRoomCode}/${targetHit.id}`), {
            isAlive: false,
            killedBy: localId
        });

        spawnParticles(targetHit.x, targetHit.y, '#f97316', 20);
        localPlayer.score += 100;
        document.getElementById('status').textContent = `🎯 BULLSEYE! You sniped ${remotePlayers[targetHit.id].name}! (Score: ${localPlayer.score})`;
    } else {
        // Misfire visuals
        const rad = localPlayer.angle;
        activeLasers.push({
            x1: localPlayer.x, y1: localPlayer.y,
            x2: localPlayer.x + Math.cos(rad) * 200, 
            y2: localPlayer.y + Math.sin(rad) * 200,
            life: 1.0
        });
    }
}

function gameLoop(now, bridge) {
    if (bridge.getActiveMiniGame() !== 'laserTag') {
        stopLaserTag();
        return;
    }

    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    const canvas = document.getElementById('waterfall-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // Movement Physics
    if (localPlayer.isAlive) {
        localPlayer.angle += localPlayer.turnDir * 3.0 * dt;
        
        // Auto-run forward
        const speed = 160;
        const nextX = localPlayer.x + Math.cos(localPlayer.angle) * speed * dt;
        const nextY = localPlayer.y + Math.sin(localPlayer.angle) * speed * dt;

        // Collision Check
        const col = Math.floor(nextX / TILE_SIZE);
        const row = Math.floor(nextY / TILE_SIZE);
        if (ARENA_MAP[row] && ARENA_MAP[row][col] === 0) {
            localPlayer.x = nextX;
            localPlayer.y = nextY;
        }
    }

    // Camera Math (Zoom out if spectating)
    const scale = localPlayer.isAlive ? 1.0 : 0.45;
    const camX = localPlayer.x - (W / 2) / scale;
    const camY = localPlayer.y - (H / 2) / scale;

    ctx.save();
    ctx.fillStyle = '#0f172a'; // Deep space background
    ctx.fillRect(0, 0, W, H);

    ctx.scale(scale, scale);
    ctx.translate(-camX, -camY);

    // 1. Draw Grid / Floor
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            if (ARENA_MAP[r][c] === 0) {
                ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    // 2. Draw Walls (Neon Cyberpunk style)
    ctx.fillStyle = '#020617';
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            if (ARENA_MAP[r][c] === 1) {
                const wx = c * TILE_SIZE;
                const wy = r * TILE_SIZE;
                ctx.fillRect(wx, wy, TILE_SIZE, TILE_SIZE);
                
                // Neon borders
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 2;
                ctx.shadowColor = '#38bdf8';
                ctx.shadowBlur = 10;
                ctx.strokeRect(wx, wy, TILE_SIZE, TILE_SIZE);
                ctx.shadowBlur = 0;
            }
        }
    }

    // 3. Draw Lasers
    for (let i = activeLasers.length - 1; i >= 0; i--) {
        const l = activeLasers[i];
        l.life -= dt * 4;
        if (l.life <= 0) {
            activeLasers.splice(i, 1);
        } else {
            ctx.strokeStyle = `rgba(239, 68, 68, ${l.life})`;
            ctx.lineWidth = 4;
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(l.x1, l.y1);
            ctx.lineTo(l.x2, l.y2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    // 4. Draw Remote Players
    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !opp.isAlive) continue;
        
        ctx.save();
        ctx.translate(opp.x, opp.y);
        ctx.rotate(opp.angle);
        
        // Avatar Ring
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.strokeStyle = '#facc15'; // Opponent color
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Gun barrel
        ctx.fillStyle = '#facc15';
        ctx.fillRect(16, -4, 12, 8);
        ctx.restore();

        // Note Floating Above Head (Sight-Reading Target!)
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(opp.noteTag, opp.x, opp.y - 25);
        
        // Player Name
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(opp.name, opp.x, opp.y + 30);
    }

    // 5. Draw Local Player
    if (localPlayer.isAlive) {
        ctx.save();
        ctx.translate(localPlayer.x, localPlayer.y);
        ctx.rotate(localPlayer.angle);
        
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.strokeStyle = '#22c55e'; // My Color
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Gun barrel
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(16, -4, 12, 8);
        ctx.restore();
    }

    // 6. Draw Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.5;
        if (p.life <= 0) {
            particles.splice(i, 1);
        } else {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }

    ctx.restore(); // Restore Camera

    // 7. Minimap (Bottom Left UI overlay)
    const mmSize = 120;
    const mmX = 10;
    const mmY = H - mmSize - 10;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(mmX, mmY, mmSize, mmSize);
    ctx.strokeStyle = '#38bdf8';
    ctx.strokeRect(mmX, mmY, mmSize, mmSize);

    const mapScale = mmSize / (MAP_COLS * TILE_SIZE);
    
    // Minimap - Remote Players
    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (!opp.isAlive) continue;
        ctx.fillStyle = id === localId ? '#22c55e' : '#ef4444';
        ctx.beginPath();
        ctx.arc(mmX + opp.x * mapScale, mmY + opp.y * mapScale, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    if (gamePhase !== 'over') {
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}
