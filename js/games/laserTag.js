import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let syncIntervalId = null;
let roomUnsubscribe = null;
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
const MAP_ROWS = 15;
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
    } catch (e) {}
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
    } catch (e) {}
}

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 400,
            vy: (Math.random() - 0.5) * 400,
            life: 1.0,
            color
        });
    }
}

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

function ensureCanvasSized(canvas) {
    if (!canvas) return;
    const parent = canvas.parentElement;
    const targetW = (parent && parent.clientWidth > 0) ? parent.clientWidth : window.innerWidth;
    const targetH = (parent && parent.clientHeight > 0) ? parent.clientHeight : 340;
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }
}

export function stopLaserTag() {
    if (animFrameId !== null) cancelAnimationFrame(animFrameId);
    if (syncIntervalId !== null) clearInterval(syncIntervalId);
    if (roomUnsubscribe) {
        roomUnsubscribe();
        roomUnsubscribe = null;
    }
    animFrameId = null;
    syncIntervalId = null;
    gamePhase = 'lobby';
}

export async function startLaserTag(bridge, autoRoomCode = null) {
    initAudio();
    stopLaserTag();

    // Ensure all overlays/modals are hidden so the arena canvas is visible
    document.getElementById('arcade-hub')?.classList.remove('open');
    document.getElementById('knockout-modal')?.classList.remove('open');
    document.getElementById('sprint-option-modal')?.classList.remove('open');
    document.getElementById('game-results-modal')?.classList.remove('open');

    bridge.setActiveMiniGame('laserTag');

    const canvas = document.getElementById('waterfall-canvas');
    if (canvas) {
        canvas.style.display = 'block';
        ensureCanvasSized(canvas);
    }

    const state = bridge.getState ? bridge.getState() : {};
    localId = state.localStudentId || ('stu_' + Math.random().toString(36).slice(2, 9));
    activeRoomCode = autoRoomCode || prompt("Enter a 3-Digit Room Code for Laser Tag Arena:", "123");

    if (!activeRoomCode || !window.firebaseDb) {
        alert("Firebase required for Laser Tag. Returning to menu.");
        bridge.exitActiveMiniGame();
        return;
    }

    // Assign a random safe spawn location
    let spawned = false;
    let safety = 0;
    while (!spawned && safety < 500) {
        safety++;
        const c = Math.floor(Math.random() * MAP_COLS);
        const r = Math.floor(Math.random() * MAP_ROWS);
        if (ARENA_MAP[r] && ARENA_MAP[r][c] === 0) {
            localPlayer.x = c * TILE_SIZE + TILE_SIZE / 2;
            localPlayer.y = r * TILE_SIZE + TILE_SIZE / 2;
            spawned = true;
        }
    }
    if (!spawned) {
        localPlayer.x = TILE_SIZE * 1.5;
        localPlayer.y = TILE_SIZE * 1.5;
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

    // Start render loop immediately so graphics appear with zero delay
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🛸 NEON LASER TAG! Your Target Tag: [${localPlayer.noteTag}] | Low C = Left, High C = Right, Play enemy note to SHOOT!`;
    }
    animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));

    // Attach Firebase Listener & Sync Loop
    try {
        const { onValue, update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const roomRef = window.firebaseRef(window.firebaseDb, `pianopad_lasertag/${activeRoomCode}`);

        roomUnsubscribe = onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                remotePlayers = data;

                if (remotePlayers[localId] && remotePlayers[localId].isAlive === false && localPlayer.isAlive) {
                    localPlayer.isAlive = false;
                    gamePhase = 'spectating';
                    playExplosion();
                    spawnParticles(localPlayer.x, localPlayer.y, '#ef4444', 30);
                    if (statusEl) {
                        statusEl.textContent = '💥 DEFEATED! Spectator Ghost Mode active (full map vision). Tap any key to drop reactions!';
                    }
                }
            }
        });

        syncIntervalId = setInterval(() => {
            if (bridge.getActiveMiniGame() !== 'laserTag') return;
            update(window.firebaseRef(window.firebaseDb, `pianopad_lasertag/${activeRoomCode}/${localId}`), {
                x: localPlayer.x,
                y: localPlayer.y,
                angle: localPlayer.angle,
                isAlive: localPlayer.isAlive,
                noteTag: localPlayer.noteTag,
                name: state.sessionStudentName || 'Player',
                avatar: state.sessionStudentAvatar || '🏃'
            }).catch(() => {});
        }, 100);
    } catch (err) {
        console.error("Laser Tag Firebase sync error:", err);
    }
}

export async function handleLaserTagInput(noteStr, bridge) {
    if (gamePhase === 'spectating') {
        spawnParticles(localPlayer.x, localPlayer.y, '#facc15', 8);
        return;
    }

    if (gamePhase !== 'playing' || !localPlayer.isAlive) return;

    const n = noteStr.toUpperCase().trim();

    // Steering Logic (Low C turns Left, High C turns Right)
    if (n === 'C1' || n === 'C2') {
        localPlayer.turnDir = -1;
        setTimeout(() => { if (localPlayer.turnDir === -1) localPlayer.turnDir = 0; }, 180);
        return;
    }
    if (n === 'C5' || n === 'C4') {
        localPlayer.turnDir = 1;
        setTimeout(() => { if (localPlayer.turnDir === 1) localPlayer.turnDir = 0; }, 180);
        return;
    }

    // Shooting Logic: Check line of sight for players matching this note
    let targetHit = null;
    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !opp.isAlive) continue;

        if (opp.noteTag === n) {
            const dist = Math.hypot(opp.x - localPlayer.x, opp.y - localPlayer.y);
            if (dist < 650 && hasLineOfSight(localPlayer.x, localPlayer.y, opp.x, opp.y)) {
                targetHit = { id, x: opp.x, y: opp.y, name: opp.name };
                break;
            }
        }
    }

    playLaserPew();

    if (targetHit) {
        activeLasers.push({
            x1: localPlayer.x, y1: localPlayer.y,
            x2: targetHit.x, y2: targetHit.y,
            color: '#22c55e',
            life: 1.0
        });

        try {
            const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
            await update(window.firebaseRef(window.firebaseDb, `pianopad_lasertag/${activeRoomCode}/${targetHit.id}`), {
                isAlive: false,
                killedBy: localId
            });
        } catch (e) {}

        spawnParticles(targetHit.x, targetHit.y, '#f97316', 25);
        localPlayer.score += 100;
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = `🎯 BULLSEYE! You sniped ${targetHit.name}! (Score: ${localPlayer.score})`;
        }
    } else {
        const rad = localPlayer.angle;
        activeLasers.push({
            x1: localPlayer.x, y1: localPlayer.y,
            x2: localPlayer.x + Math.cos(rad) * 240,
            y2: localPlayer.y + Math.sin(rad) * 240,
            color: '#ef4444',
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
    if (!canvas) return;
    ensureCanvasSized(canvas);

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // Movement Physics with wall sliding
    if (localPlayer.isAlive) {
        localPlayer.angle += localPlayer.turnDir * 3.2 * dt;

        const speed = 155;
        const dx = Math.cos(localPlayer.angle) * speed * dt;
        const dy = Math.sin(localPlayer.angle) * speed * dt;

        const nextColX = Math.floor((localPlayer.x + dx) / TILE_SIZE);
        const curRow = Math.floor(localPlayer.y / TILE_SIZE);
        if (ARENA_MAP[curRow] && ARENA_MAP[curRow][nextColX] === 0) {
            localPlayer.x += dx;
        }

        const curCol = Math.floor(localPlayer.x / TILE_SIZE);
        const nextRowY = Math.floor((localPlayer.y + dy) / TILE_SIZE);
        if (ARENA_MAP[nextRowY] && ARENA_MAP[nextRowY][curCol] === 0) {
            localPlayer.y += dy;
        }
    }

    const scale = localPlayer.isAlive ? 1.0 : 0.45;
    const camX = localPlayer.x - (W / 2) / scale;
    const camY = localPlayer.y - (H / 2) / scale;

    ctx.save();
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    ctx.scale(scale, scale);
    ctx.translate(-camX, -camY);

    // 1. Floor Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            if (ARENA_MAP[r][c] === 0) {
                ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    // 2. Neon Maze Walls
    ctx.fillStyle = '#020617';
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            if (ARENA_MAP[r][c] === 1) {
                const wx = c * TILE_SIZE;
                const wy = r * TILE_SIZE;
                ctx.fillRect(wx, wy, TILE_SIZE, TILE_SIZE);

                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 2;
                ctx.strokeRect(wx, wy, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    // 3. Laser Beams
    for (let i = activeLasers.length - 1; i >= 0; i--) {
        const l = activeLasers[i];
        l.life -= dt * 4;
        if (l.life <= 0) {
            activeLasers.splice(i, 1);
        } else {
            ctx.strokeStyle = l.color || `rgba(239, 68, 68, ${l.life})`;
            ctx.globalAlpha = Math.max(0, l.life);
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(l.x1, l.y1);
            ctx.lineTo(l.x2, l.y2);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }

    // 4. Remote Players
    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !opp.isAlive) continue;

        ctx.save();
        ctx.translate(opp.x, opp.y);
        ctx.rotate(opp.angle || 0);

        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#facc15';
        ctx.fillRect(14, -4, 14, 8);
        ctx.restore();

        // Hovering Note Target Badge
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(opp.x - 22, opp.y - 44, 44, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(opp.noteTag || 'C4', opp.x, opp.y - 29);

        // Player Name
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(opp.name || 'Player', opp.x, opp.y + 30);
    }

    // 5. Local Player
    if (localPlayer.isAlive) {
        ctx.save();
        ctx.translate(localPlayer.x, localPlayer.y);
        ctx.rotate(localPlayer.angle);

        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#052e16';
        ctx.fill();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        ctx.fillRect(14, -4, 14, 8);
        ctx.restore();

        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`YOU (${localPlayer.noteTag})`, localPlayer.x, localPlayer.y - 24);
    }

    // 6. Explosion Particles
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

    ctx.restore();

    // 7. Bottom-Left Radar Minimap
    const mmW = 140;
    const mmH = 105;
    const mmX = 12;
    const mmY = H - mmH - 12;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    const scaleX = mmW / (MAP_COLS * TILE_SIZE);
    const scaleY = mmH / (MAP_ROWS * TILE_SIZE);

    // Draw Walls on Minimap
    ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            if (ARENA_MAP[r][c] === 1) {
                ctx.fillRect(mmX + c * TILE_SIZE * scaleX, mmY + r * TILE_SIZE * scaleY, TILE_SIZE * scaleX, TILE_SIZE * scaleY);
            }
        }
    }

    // Draw Remote Players on Minimap
    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !opp.isAlive) continue;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(mmX + opp.x * scaleX, mmY + opp.y * scaleY, 3.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw Local Player on Minimap
    if (localPlayer.isAlive) {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(mmX + localPlayer.x * scaleX, mmY + localPlayer.y * scaleY, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Top-Right Score & Controls HUD
    ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
    ctx.fillRect(W - 230, 10, 220, 48);
    ctx.strokeStyle = '#22c55e';
    ctx.strokeRect(W - 230, 10, 220, 48);
    ctx.fillStyle = '#22c55e';
    ctx.font = '900 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE: ${localPlayer.score} | YOUR TAG: ${localPlayer.noteTag}`, W - 18, 30);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`C1/C2: Left • C4/C5: Right • Enemy Note: Shoot`, W - 18, 48);

    animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
}
