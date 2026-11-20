import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let syncIntervalId = null;
let roomUnsubscribe = null;
let lastFrameTime = 0;
let gamePhase = 'lobby'; // 'lobby' | 'playing' | 'spectating'

// Local First-Person Player State
const localPlayer = {
    x: 0,
    y: 0,
    angle: 0,
    turnDir: 0, // -1 left, 1 right
    isAlive: true,
    score: 0,
    noteTag: 'D',
    bobPhase: 0,
    recoil: 0,
    muzzleFlash: 0,
    hitFlash: 0
};

// Remote Players, Beams & Explosions
let remotePlayers = {};
let activeBeams = [];
let worldExplosions = [];
let activeRoomCode = null;
let localId = null;
let zBuffer = [];

// Expansive 32x32 Arena (Mazes + Central Open Courtyard for 25+ Students)
const TILE_SIZE = 64;
const MAP_COLS = 32;
const MAP_ROWS = 32;
const ARENA_MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
    [1,0,2,2,0,2,0,1,0,2,2,2,0,2,0,0,0,2,0,2,2,2,0,1,0,2,0,2,2,2,0,1],
    [1,0,2,0,0,2,0,0,0,2,0,0,0,2,0,1,0,2,0,0,0,2,0,0,0,2,0,0,0,2,0,1],
    [1,0,0,0,2,2,2,1,0,2,0,2,2,2,0,1,0,2,2,2,0,2,0,1,2,2,2,0,0,0,0,1],
    [1,0,2,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,2,2,0,1],
    [1,0,2,2,2,0,2,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,0,2,0,0,0,2,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,0,0,0,1],
    [1,1,1,0,1,1,0,3,3,0,0,0,0,3,3,0,0,3,3,0,0,0,0,3,3,0,1,1,0,1,1,1],
    [1,0,0,0,0,1,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,1,0,0,0,0,1],
    [1,0,2,2,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,2,2,0,1],
    [1,0,0,2,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,2,0,0,1],
    [1,0,0,0,0,1,0,0,0,0,0,0,3,3,0,0,0,3,3,0,0,0,0,0,0,0,1,0,0,0,0,1],
    [1,1,0,1,1,1,0,3,0,0,0,0,3,0,0,0,0,0,3,0,0,0,0,3,0,0,1,1,1,0,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,2,0,2,2,0,0,0,0,3,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,2,2,0,2,0,1],
    [1,0,2,0,0,2,0,0,0,0,3,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,2,0,0,2,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,0,1,1,1,0,3,0,0,0,0,3,0,0,0,0,0,3,0,0,0,0,3,0,0,1,1,1,0,1,1],
    [1,0,0,0,0,1,0,0,0,0,0,0,3,3,0,0,0,3,3,0,0,0,0,0,0,0,1,0,0,0,0,1],
    [1,0,0,2,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,2,0,0,1],
    [1,0,2,2,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,2,2,0,1],
    [1,0,0,0,0,1,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,1,0,0,0,0,1],
    [1,1,1,0,1,1,0,3,3,0,0,0,0,3,3,0,0,3,3,0,0,0,0,3,3,0,1,1,0,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,0,0,1],
    [1,0,2,2,2,0,2,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,0,2,0,0,0,2,0,1],
    [1,0,2,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,2,2,0,1],
    [1,0,0,0,2,2,2,1,0,2,0,2,2,2,0,1,0,2,2,2,0,2,0,1,2,2,2,0,0,0,0,1],
    [1,0,2,0,0,2,0,0,0,2,0,0,0,2,0,1,0,2,0,0,0,2,0,0,0,2,0,0,0,2,0,1],
    [1,0,2,2,0,2,0,1,0,2,2,2,0,2,0,0,0,2,0,2,2,2,0,1,0,2,0,2,2,2,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// All 11 non-C chromatic pitch classes
const ASSIGNABLE_PITCHES = ['C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function normalizePitchClass(noteStr) {
    const clean = (noteStr || '').toUpperCase().trim().replace(/[0-9]/g, '');
    const flatMap = { 'DB': 'C#', 'EB': 'D#', 'GB': 'F#', 'AB': 'G#', 'BB': 'A#' };
    return flatMap[clean] || clean;
}

function isPlayerActiveInRoom(p) {
    if (!p || p.isAlive === false) return false;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return false;
    // Ignore stale ghost entries older than 12 seconds
    if (p.updatedAt && (Date.now() - p.updatedAt) > 12000) return false;
    return true;
}

function playLaserPew() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
    } catch (e) {}
}

function playExplosionSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.42);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.46);
    } catch (e) {}
}

function spawn3DExplosion(wx, wy, color, count = 28) {
    for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 190;
        worldExplosions.push({
            x: wx,
            y: wy,
            z: (Math.random() - 0.5) * 24,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            vz: (Math.random() - 0.3) * 90,
            life: 1.0,
            size: 4 + Math.random() * 6,
            color: i % 3 === 0 ? '#ffffff' : color
        });
    }
}

function hasLineOfSight(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(8, Math.ceil(dist / 14));
    for (let i = 1; i < steps; i++) {
        const tx = x1 + (x2 - x1) * (i / steps);
        const ty = y1 + (y2 - y1) * (i / steps);
        const col = Math.floor(tx / TILE_SIZE);
        const row = Math.floor(ty / TILE_SIZE);
        if (ARENA_MAP[row] && ARENA_MAP[row][col] > 0) return false;
    }
    return true;
}

function ensureCanvasSized(canvas) {
    if (!canvas) return;
    const parent = canvas.parentElement;
    const targetW = (parent && parent.clientWidth > 0) ? parent.clientWidth : window.innerWidth;
    const targetH = (parent && parent.clientHeight > 0) ? parent.clientHeight : 380;
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }
}

function getSafeSpawnPoint() {
    // Prefer central & mid-ring walkable tiles so players encounter each other quickly while still having full 32x32 corridors
    for (let attempt = 0; attempt < 600; attempt++) {
        const c = 6 + Math.floor(Math.random() * 20);
        const r = 6 + Math.floor(Math.random() * 20);
        if (ARENA_MAP[r] && ARENA_MAP[r][c] === 0) {
            return {
                x: c * TILE_SIZE + TILE_SIZE / 2,
                y: r * TILE_SIZE + TILE_SIZE / 2
            };
        }
    }
    for (let r = 1; r < MAP_ROWS - 1; r++) {
        for (let c = 1; c < MAP_COLS - 1; c++) {
            if (ARENA_MAP[r][c] === 0) {
                return { x: c * TILE_SIZE + TILE_SIZE / 2, y: r * TILE_SIZE + TILE_SIZE / 2 };
            }
        }
    }
    return { x: TILE_SIZE * 15.5, y: TILE_SIZE * 15.5 };
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
    activeRoomCode = String(autoRoomCode || prompt("Enter a 3-Digit Room Code for 3D Laser Tag:", "123") || '').trim();

    if (!activeRoomCode || !window.firebaseDb) {
        alert("Firebase required for Laser Tag. Returning to menu.");
        bridge.exitActiveMiniGame();
        return;
    }

    const spawn = getSafeSpawnPoint();
    localPlayer.x = spawn.x;
    localPlayer.y = spawn.y;
    // Face toward the center of the arena on spawn so players spot each other faster
    localPlayer.angle = Math.atan2((MAP_ROWS * TILE_SIZE) / 2 - spawn.y, (MAP_COLS * TILE_SIZE) / 2 - spawn.x);
    localPlayer.turnDir = 0;
    localPlayer.isAlive = true;
    localPlayer.score = 0;
    localPlayer.noteTag = ASSIGNABLE_PITCHES[Math.floor(Math.random() * ASSIGNABLE_PITCHES.length)];
    localPlayer.bobPhase = 0;
    localPlayer.recoil = 0;
    localPlayer.muzzleFlash = 0;
    localPlayer.hitFlash = 0;

    activeBeams = [];
    worldExplosions = [];
    remotePlayers = {};
    gamePhase = 'playing';
    lastFrameTime = performance.now();

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🛸 3D LASER TAG! Your Shield Pitch: [${localPlayer.noteTag}] | Low C = Turn Left • High C = Turn Right • Play enemy's pitch to BLAST!`;
    }

    animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));

    try {
        const { onValue, set, update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const myPlayerRef = window.firebaseRef(window.firebaseDb, `pianopad_lasertag/${activeRoomCode}/${localId}`);

        // Write fresh initial state immediately BEFORE listening so old 'isAlive: false' records are overwritten
        await set(myPlayerRef, {
            id: localId,
            x: Number(localPlayer.x.toFixed(1)),
            y: Number(localPlayer.y.toFixed(1)),
            angle: Number(localPlayer.angle.toFixed(3)),
            isAlive: true,
            noteTag: localPlayer.noteTag,
            score: 0,
            name: state.sessionStudentName || 'Player',
            avatar: state.sessionStudentAvatar || '🏃',
            updatedAt: Date.now()
        });
        if (window.firebaseOnDisconnect) {
            window.firebaseOnDisconnect(myPlayerRef).remove();
        }

        const roomRef = window.firebaseRef(window.firebaseDb, `pianopad_lasertag/${activeRoomCode}`);
        roomUnsubscribe = onValue(roomRef, (snapshot) => {
            const data = snapshot.val() || {};
            remotePlayers = data;

            // Only trigger elimination if our own record in Firebase explicitly flipped to isAlive === false
            if (remotePlayers[localId] && remotePlayers[localId].isAlive === false && localPlayer.isAlive) {
                localPlayer.isAlive = false;
                localPlayer.hitFlash = 1.0;
                gamePhase = 'spectating';
                playExplosionSound();
                spawn3DExplosion(localPlayer.x, localPlayer.y, '#ef4444', 35);
                if (statusEl) {
                    statusEl.textContent = '💥 TAGGED! Drone Cam Activated (Full Arena Vision) — Tap any key to send reactions!';
                }
            }
        });

        syncIntervalId = setInterval(() => {
            if (bridge.getActiveMiniGame() !== 'laserTag' || !localPlayer.isAlive) return;
            update(myPlayerRef, {
                x: Number(localPlayer.x.toFixed(1)),
                y: Number(localPlayer.y.toFixed(1)),
                angle: Number(localPlayer.angle.toFixed(3)),
                isAlive: localPlayer.isAlive,
                noteTag: localPlayer.noteTag,
                score: localPlayer.score,
                name: state.sessionStudentName || 'Player',
                avatar: state.sessionStudentAvatar || '🏃',
                updatedAt: Date.now()
            }).catch(() => {});
        }, 100);
    } catch (err) {
        console.error("Laser Tag Firebase sync error:", err);
    }
}

export async function handleLaserTagInput(noteStr, bridge) {
    if (gamePhase === 'spectating') {
        spawn3DExplosion(localPlayer.x, localPlayer.y, '#facc15', 14);
        return;
    }

    if (gamePhase !== 'playing' || !localPlayer.isAlive) return;

    const raw = (noteStr || '').toUpperCase().trim();
    const match = raw.match(/^([A-G]#?)([0-9]+)$/);
    const pitchClass = normalizePitchClass(raw);
    const octave = match ? parseInt(match[2], 10) : 2;

    // Any Low C (C1, C2) turns Left; any High C (C3, C4, C5...) turns Right
    if (pitchClass === 'C') {
        if (octave <= 2) {
            localPlayer.turnDir = -1;
            setTimeout(() => { if (localPlayer.turnDir === -1) localPlayer.turnDir = 0; }, 220);
        } else {
            localPlayer.turnDir = 1;
            setTimeout(() => { if (localPlayer.turnDir === 1) localPlayer.turnDir = 0; }, 220);
        }
        return;
    }

    // Any of the other 11 pitches fires the Space Laser!
    playLaserPew();
    localPlayer.recoil = 1.0;
    localPlayer.muzzleFlash = 1.0;

    // Check forward field-of-view for visible opponents matching `pitchClass`
    const FOV = Math.PI / 3;
    let bestTarget = null;
    let bestDist = 1100;

    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !isPlayerActiveInRoom(opp)) continue;
        if (normalizePitchClass(opp.noteTag) !== pitchClass) continue;

        const dx = opp.x - localPlayer.x;
        const dy = opp.y - localPlayer.y;
        const dist = Math.hypot(dx, dy);
        if (dist > bestDist) continue;

        let relAngle = Math.atan2(dy, dx) - localPlayer.angle;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;

        if (Math.abs(relAngle) <= FOV * 0.58 && hasLineOfSight(localPlayer.x, localPlayer.y, opp.x, opp.y)) {
            bestDist = dist;
            bestTarget = { id, opp, relAngle, dist };
        }
    }

    const canvas = document.getElementById('waterfall-canvas');
    const W = canvas ? canvas.width : 800;
    const H = canvas ? canvas.height : 380;

    if (bestTarget) {
        const targetScreenX = (0.5 + (bestTarget.relAngle / FOV)) * W;
        const targetScreenY = H * 0.5;

        activeBeams.push({
            endX: targetScreenX,
            endY: targetScreenY,
            color: '#22c55e',
            glow: '#4ade80',
            life: 1.0
        });

        playExplosionSound();
        spawn3DExplosion(bestTarget.opp.x, bestTarget.opp.y, '#f97316', 32);
        localPlayer.score += 100;

        try {
            const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
            await update(window.firebaseRef(window.firebaseDb, `pianopad_lasertag/${activeRoomCode}/${bestTarget.id}`), {
                isAlive: false,
                killedBy: localId,
                updatedAt: Date.now()
            });
        } catch (e) {}

        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = `🎯 DIRECT HIT! You blasted ${bestTarget.opp.name || 'Opponent'} with [${pitchClass}]! (+100 pts • Score: ${localPlayer.score})`;
        }
    } else {
        activeBeams.push({
            endX: W * 0.5,
            endY: H * 0.5,
            color: '#38bdf8',
            glow: '#0284c7',
            life: 1.0
        });
    }
}

function castRay(rayAngle) {
    const sin = Math.sin(rayAngle);
    const cos = Math.cos(rayAngle);

    let mapX = Math.floor(localPlayer.x / TILE_SIZE);
    let mapY = Math.floor(localPlayer.y / TILE_SIZE);

    const deltaDistX = Math.abs(1 / (cos || 1e-6));
    const deltaDistY = Math.abs(1 / (sin || 1e-6));

    let stepX, sideDistX;
    if (cos < 0) {
        stepX = -1;
        sideDistX = (localPlayer.x / TILE_SIZE - mapX) * deltaDistX;
    } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - localPlayer.x / TILE_SIZE) * deltaDistX;
    }

    let stepY, sideDistY;
    if (sin < 0) {
        stepY = -1;
        sideDistY = (localPlayer.y / TILE_SIZE - mapY) * deltaDistY;
    } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - localPlayer.y / TILE_SIZE) * deltaDistY;
    }

    let hit = 0;
    let side = 0;
    let safety = 0;

    while (hit === 0 && safety < 64) {
        safety++;
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            side = 0;
        } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            side = 1;
        }
        if (mapY < 0 || mapY >= MAP_ROWS || mapX < 0 || mapX >= MAP_COLS) {
            hit = 1;
        } else if (ARENA_MAP[mapY][mapX] > 0) {
            hit = ARENA_MAP[mapY][mapX];
        }
    }

    const perpWallDist = (side === 0 ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY)) * TILE_SIZE;
    return { dist: Math.max(1, perpWallDist), side, wallType: hit };
}

function renderFirstPerson3D(ctx, W, H, dt) {
    const FOV = Math.PI / 3;
    const bobOffset = localPlayer.isAlive ? Math.sin(localPlayer.bobPhase) * 4 : 0;
    const horizon = H * 0.52 + bobOffset;

    // 1. Sci-Fi Ceiling & Floor
    const ceilGrad = ctx.createLinearGradient(0, 0, 0, horizon);
    ceilGrad.addColorStop(0, '#020617');
    ceilGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = ceilGrad;
    ctx.fillRect(0, 0, W, horizon);

    const floorGrad = ctx.createLinearGradient(0, horizon, 0, H);
    floorGrad.addColorStop(0, '#090d16');
    floorGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizon, W, H - horizon);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 6; i++) {
        const yLine = horizon + Math.pow(i / 6, 1.8) * (H - horizon);
        ctx.beginPath();
        ctx.moveTo(0, yLine);
        ctx.lineTo(W, yLine);
        ctx.stroke();
    }

    // 2. Raycast 3D Neon Walls
    const numRays = Math.min(320, Math.floor(W / 3));
    const stripW = W / numRays;
    zBuffer = new Array(numRays);

    for (let i = 0; i < numRays; i++) {
        const rayAngle = (localPlayer.angle - FOV / 2) + (i / numRays) * FOV;
        const hit = castRay(rayAngle);
        const correctedDist = hit.dist * Math.cos(rayAngle - localPlayer.angle);
        zBuffer[i] = correctedDist;

        const wallHeight = Math.min(H * 1.6, (TILE_SIZE * H) / Math.max(1, correctedDist));
        const wallTop = horizon - wallHeight / 2;

        const shade = Math.max(0.15, 1 - correctedDist / 1200) * (hit.side === 1 ? 0.78 : 1.0);

        let r = 14, g = 116, b = 144;
        let edgeColor = `rgba(56, 189, 248, ${shade})`;
        if (hit.wallType === 2) {
            r = 88; g = 28; b = 135;
            edgeColor = `rgba(232, 121, 249, ${shade})`;
        } else if (hit.wallType === 3) {
            r = 6; g = 95; b = 70;
            edgeColor = `rgba(52, 211, 153, ${shade})`;
        }

        ctx.fillStyle = `rgb(${Math.floor(r * shade)}, ${Math.floor(g * shade)}, ${Math.floor(b * shade)})`;
        ctx.fillRect(i * stripW, wallTop, stripW + 1, wallHeight);

        ctx.fillStyle = edgeColor;
        const trimH = Math.max(2, wallHeight * 0.045);
        ctx.fillRect(i * stripW, wallTop, stripW + 1, trimH);
        ctx.fillRect(i * stripW, wallTop + wallHeight - trimH, stripW + 1, trimH);
    }

    // 3. Depth-Sorted 3D Opponents & Explosion Particles
    const sprites = [];

    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (id === localId || !isPlayerActiveInRoom(opp)) continue;
        const dx = opp.x - localPlayer.x;
        const dy = opp.y - localPlayer.y;
        const dist = Math.hypot(dx, dy);
        sprites.push({ type: 'player', id, opp, dx, dy, dist });
    }

    for (let i = worldExplosions.length - 1; i >= 0; i--) {
        const p = worldExplosions[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.life -= dt * 1.4;
        if (p.life <= 0) {
            worldExplosions.splice(i, 1);
            continue;
        }
        const dx = p.x - localPlayer.x;
        const dy = p.y - localPlayer.y;
        const dist = Math.hypot(dx, dy);
        sprites.push({ type: 'particle', p, dx, dy, dist });
    }

    sprites.sort((a, b) => b.dist - a.dist);

    for (const sp of sprites) {
        let relAngle = Math.atan2(sp.dy, sp.dx) - localPlayer.angle;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;

        if (Math.abs(relAngle) > FOV * 0.68 || sp.dist < 10) continue;

        const screenX = (0.5 + relAngle / FOV) * W;

        // Multi-ray occlusion check: visible if line-of-sight is clear OR any ray across body width is unoccluded
        if (sp.type === 'player') {
            const visibleByLOS = hasLineOfSight(localPlayer.x, localPlayer.y, sp.opp.x, sp.opp.y);
            if (!visibleByLOS) {
                const centerRay = Math.floor(screenX / stripW);
                const leftRay = Math.max(0, centerRay - 4);
                const rightRay = Math.min(numRays - 1, centerRay + 4);
                let anyRayOpen = false;
                for (let rIdx = leftRay; rIdx <= rightRay; rIdx++) {
                    if (zBuffer[rIdx] >= sp.dist - 12) {
                        anyRayOpen = true;
                        break;
                    }
                }
                if (!anyRayOpen) continue;
            }
        } else {
            const rayIdx = Math.floor(screenX / stripW);
            if (rayIdx >= 0 && rayIdx < numRays && zBuffer[rayIdx] < sp.dist) continue;
        }

        if (sp.type === 'particle') {
            const pScale = (TILE_SIZE * H) / sp.dist;
            const py = horizon + (sp.p.z / TILE_SIZE) * pScale;
            const radius = Math.max(2, (sp.p.size / TILE_SIZE) * pScale);
            ctx.save();
            ctx.globalAlpha = Math.max(0, sp.p.life);
            ctx.fillStyle = sp.p.color;
            ctx.beginPath();
            ctx.arc(screenX, py, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            continue;
        }

        // Render Opponent Sci-Fi Visor Suit + Large High-Contrast Target Pitch Sign
        const spriteH = Math.min(H * 1.05, Math.max(46, (TILE_SIZE * 0.88 * H) / sp.dist));
        const spriteW = spriteH * 0.65;
        const topY = horizon - spriteH * 0.42;

        ctx.save();
        // Glowing Body Armor
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = Math.max(2, spriteW * 0.06);
        ctx.beginPath();
        ctx.roundRect(screenX - spriteW / 2, topY + spriteH * 0.24, spriteW, spriteH * 0.72, 10);
        ctx.fill();
        ctx.stroke();

        // Neon Chest Core
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(screenX, topY + spriteH * 0.54, spriteW * 0.18, 0, Math.PI * 2);
        ctx.fill();

        // Student Avatar Head
        const avatarSize = Math.max(18, Math.floor(spriteH * 0.30));
        ctx.font = `${avatarSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sp.opp.avatar || '🤖', screenX, topY + spriteH * 0.12);

        // LARGE HIGH-CONTRAST TARGET NOTE SIGN ABOVE HEAD (e.g. "🎯 C#")
        const pitchLabel = normalizePitchClass(sp.opp.noteTag || 'G');
        const badgeW = Math.max(66, spriteW * 1.15);
        const badgeH = Math.max(28, spriteH * 0.28);
        const badgeY = Math.max(12, topY - badgeH - 12);

        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(screenX - badgeW / 2, badgeY, badgeW, badgeH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Pointer triangle under the sign
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(screenX - 6, badgeY + badgeH);
        ctx.lineTo(screenX + 6, badgeY + badgeH);
        ctx.lineTo(screenX, badgeY + badgeH + 7);
        ctx.closePath();
        ctx.fill();

        // Crisp black pitch text inside yellow sign
        ctx.fillStyle = '#000000';
        ctx.font = `900 ${Math.max(16, Math.floor(badgeH * 0.68))}px sans-serif`;
        ctx.fillText(`🎯 ${pitchLabel}`, screenX, badgeY + badgeH * 0.54);

        // Student Nameplate below suit
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.max(11, Math.floor(spriteH * 0.13))}px sans-serif`;
        ctx.fillText(sp.opp.name || 'Player', screenX, topY + spriteH + 12);
        ctx.restore();
    }

    // 4. First-Person Laser Beams
    for (let i = activeBeams.length - 1; i >= 0; i--) {
        const b = activeBeams[i];
        b.life -= dt * 4.5;
        if (b.life <= 0) {
            activeBeams.splice(i, 1);
            continue;
        }
        const gunTipX = W * 0.72;
        const gunTipY = H * 0.76 + localPlayer.recoil * 14;

        ctx.save();
        ctx.globalAlpha = Math.max(0, b.life);
        ctx.strokeStyle = b.glow;
        ctx.lineWidth = 12 * b.life;
        ctx.beginPath();
        ctx.moveTo(gunTipX, gunTipY);
        ctx.lineTo(b.endX, b.endY);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 * b.life;
        ctx.beginPath();
        ctx.moveTo(gunTipX, gunTipY);
        ctx.lineTo(b.endX, b.endY);
        ctx.stroke();
        ctx.restore();
    }

    // 5. First-Person Space Blaster Viewmodel
    if (localPlayer.isAlive) {
        localPlayer.recoil = Math.max(0, localPlayer.recoil - dt * 5);
        localPlayer.muzzleFlash = Math.max(0, localPlayer.muzzleFlash - dt * 8);

        const gunBobX = Math.cos(localPlayer.bobPhase * 0.5) * 6;
        const gunBobY = Math.abs(Math.sin(localPlayer.bobPhase * 0.5)) * 6 + localPlayer.recoil * 18;
        const gx = W * 0.72 + gunBobX;
        const gy = H * 0.78 + gunBobY;

        ctx.save();
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(gx - 22, gy + 70);
        ctx.lineTo(gx - 10, gy - 14);
        ctx.lineTo(gx + 14, gy - 14);
        ctx.lineTo(gx + 34, gy + 70);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        ctx.fillRect(gx - 4, gy + 4, 12, 8);
        ctx.fillRect(gx - 6, gy + 20, 16, 8);

        if (localPlayer.muzzleFlash > 0) {
            ctx.globalAlpha = localPlayer.muzzleFlash;
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(gx + 2, gy - 18, 22 * localPlayer.muzzleFlash, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Center Crosshair
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
    }

    if (localPlayer.hitFlash > 0) {
        localPlayer.hitFlash = Math.max(0, localPlayer.hitFlash - dt * 1.5);
        ctx.fillStyle = `rgba(239, 68, 68, ${localPlayer.hitFlash * 0.55})`;
        ctx.fillRect(0, 0, W, H);
    }
}

function renderSpectatorOverheadView(ctx, W, H, dt) {
    const scale = Math.min(W / (MAP_COLS * TILE_SIZE), H / (MAP_ROWS * TILE_SIZE)) * 0.92;
    const offsetX = (W - MAP_COLS * TILE_SIZE * scale) / 2;
    const offsetY = (H - MAP_ROWS * TILE_SIZE * scale) / 2;

    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            const tile = ARENA_MAP[r][c];
            if (tile === 0) {
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#1e293b';
                ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = tile === 2 ? '#4c1d95' : (tile === 3 ? '#065f46' : '#0284c7');
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    for (const [id, opp] of Object.entries(remotePlayers)) {
        if (!isPlayerActiveInRoom(opp)) continue;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(opp.x, opp.y, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${opp.name} [${opp.noteTag}]`, opp.x, opp.y - 24);
    }

    for (let i = worldExplosions.length - 1; i >= 0; i--) {
        const p = worldExplosions[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.4;
        if (p.life <= 0) {
            worldExplosions.splice(i, 1);
            continue;
        }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    ctx.restore();

    ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.fillRect(W / 2 - 210, 12, 420, 36);
    ctx.strokeStyle = '#facc15';
    ctx.strokeRect(W / 2 - 210, 12, 420, 36);
    ctx.fillStyle = '#facc15';
    ctx.font = '900 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🛰️ SPECTATOR DRONE VIEW — FULL ARENA VISION', W / 2, 35);
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

    if (localPlayer.isAlive) {
        localPlayer.angle += localPlayer.turnDir * 3.1 * dt;
        localPlayer.bobPhase += dt * 9.5;

        const speed = 150;
        const pad = 16;
        const dx = Math.cos(localPlayer.angle) * speed * dt;
        const dy = Math.sin(localPlayer.angle) * speed * dt;

        const checkX = localPlayer.x + dx + (dx > 0 ? pad : -pad);
        const colX = Math.floor(checkX / TILE_SIZE);
        const curRow = Math.floor(localPlayer.y / TILE_SIZE);
        if (ARENA_MAP[curRow] && ARENA_MAP[curRow][colX] === 0) {
            localPlayer.x += dx;
        }

        const checkY = localPlayer.y + dy + (dy > 0 ? pad : -pad);
        const curCol = Math.floor(localPlayer.x / TILE_SIZE);
        const rowY = Math.floor(checkY / TILE_SIZE);
        if (ARENA_MAP[rowY] && ARENA_MAP[rowY][curCol] === 0) {
            localPlayer.y += dy;
        }
    }

    if (localPlayer.isAlive) {
        renderFirstPerson3D(ctx, W, H, dt);
    } else {
        renderSpectatorOverheadView(ctx, W, H, dt);
    }

    // Bottom-Left Minimap Overlay
    if (localPlayer.isAlive) {
        const mmSize = 148;
        const mmX = 12;
        const mmY = H - mmSize - 12;
        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.fillRect(mmX, mmY, mmSize, mmSize);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mmX, mmY, mmSize, mmSize);

        const scaleX = mmSize / (MAP_COLS * TILE_SIZE);
        const scaleY = mmSize / (MAP_ROWS * TILE_SIZE);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.34)';
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                if (ARENA_MAP[r][c] > 0) {
                    ctx.fillRect(mmX + c * TILE_SIZE * scaleX, mmY + r * TILE_SIZE * scaleY, TILE_SIZE * scaleX, TILE_SIZE * scaleY);
                }
            }
        }

        // Draw every active opponent on the minimap with a bright red beacon + their avatar + pitch label
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const [id, opp] of Object.entries(remotePlayers)) {
            if (id === localId || !isPlayerActiveInRoom(opp)) continue;
            const ox = mmX + opp.x * scaleX;
            const oy = mmY + opp.y * scaleY;

            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(ox, oy, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.font = '11px sans-serif';
            ctx.fillText(opp.avatar || '🔴', ox, oy);

            ctx.fillStyle = '#facc15';
            ctx.font = 'bold 8px sans-serif';
            ctx.fillText(normalizePitchClass(opp.noteTag || ''), ox, oy - 8);
        }

        // Draw local player green dot + sightline
        const lx = mmX + localPlayer.x * scaleX;
        const ly = mmY + localPlayer.y * scaleY;
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(localPlayer.angle) * 14, ly + Math.sin(localPlayer.angle) * 14);
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Top-Right HUD
    const activePlayers = Object.values(remotePlayers).filter(isPlayerActiveInRoom);
    const aliveCount = Math.max(1, activePlayers.length);

    ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.fillRect(W - 280, 10, 270, 54);
    ctx.strokeStyle = '#22c55e';
    ctx.strokeRect(W - 280, 10, 270, 54);

    ctx.fillStyle = '#22c55e';
    ctx.font = '900 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE: ${localPlayer.score} | ALIVE: ${aliveCount} | YOUR TAG: ${localPlayer.noteTag}`, W - 18, 30);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`Low C: Left • High C: Right • Enemy Pitch: Fire`, W - 18, 49);

    animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
}
