import { initAudio, playErrorClackSound, playTone, audioCtx } from '../audio.js';
import { getNoteFrequency, getDiatonicStepAndShift } from '../musicTheory.js';
import { drawSheetMusicStaff, drawStemlessNote, drawLedgerLines } from '../sheetMusic.js';

const SNIPER_POOL = ['c2', 'd2', 'e2', 'f2', 'g2', 'a2', 'b2', 'c3', 'd3', 'e3', 'f3', 'g3'];
const TOTAL_TARGETS = 10;

let currentTargetNote = 'c2';
let targetsHit = 0;
let startTimeMs = 0;
let wrongTaps = 0;

// --- NEW ANIMATION STATE ---
let animFrameId = null;
let lastFrameTime = 0;
let gameState = 'playing'; // 'playing' | 'focusing' | 'exploding' | 'over'
let currentNotePos = { x: 0, y: 0, step: 0, isSharp: false };
let crosshair = { x: 0, y: 0 };
let bulletHoles = [];
let particles = [];
let explosionTimer = 0;
let bridgeRef = null;

// --- AUDIO EFFECTS ---
function playSniperShotSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        
        // High-pitched crack/whip
        const crackOsc = audioCtx.createOscillator();
        const crackGain = audioCtx.createGain();
        crackOsc.type = 'sawtooth';
        crackOsc.frequency.setValueAtTime(900, now);
        crackOsc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        crackGain.gain.setValueAtTime(0.5, now);
        crackGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        crackOsc.connect(crackGain);
        crackGain.connect(audioCtx.destination);
        crackOsc.start(now);
        crackOsc.stop(now + 0.2);

        // Low-end boom
        const boomOsc = audioCtx.createOscillator();
        const boomGain = audioCtx.createGain();
        boomOsc.type = 'square';
        boomOsc.frequency.setValueAtTime(120, now);
        boomOsc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
        boomGain.gain.setValueAtTime(0.6, now);
        boomGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        boomOsc.connect(boomGain);
        boomGain.connect(audioCtx.destination);
        boomOsc.start(now);
        boomOsc.stop(now + 0.5);
    } catch(e) {}
}

export function stopNoteSniper() {
    if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    gameState = 'over';
}

export function startNoteSniper(bridge) {
    initAudio();
    stopNoteSniper();
    bridgeRef = bridge;
    bridge.exitActiveMiniGame();
    document.getElementById('arcade-hub').classList.remove('open');
    bridge.setActiveMiniGame('noteSniper');
    bridge.resetGameStats();

    targetsHit = 0;
    wrongTaps = 0;
    bulletHoles = [];
    particles = [];
    gameState = 'playing';
    startTimeMs = performance.now();
    lastFrameTime = startTimeMs;
    
    pickNextSniperTarget();
    
    animFrameId = requestAnimationFrame(gameLoop);
}

function pickNextSniperTarget() {
    let next = SNIPER_POOL[Math.floor(Math.random() * SNIPER_POOL.length)];
    if (next === currentTargetNote) {
        next = SNIPER_POOL[(SNIPER_POOL.indexOf(next) + 1) % SNIPER_POOL.length];
    }
    currentTargetNote = next;
    
    // Calculate new note position
    const canvas = document.getElementById('waterfall-canvas');
    const info = getDiatonicStepAndShift(currentTargetNote);
    if (info) {
        const line1_y = 56;
        const halfStep = 4;
        currentNotePos.x = canvas.width / 2;
        currentNotePos.y = line1_y - info.step * halfStep;
        currentNotePos.step = info.step;
        currentNotePos.isSharp = info.isSharp;
    }
    
    bulletHoles = []; // Clear bullet holes for the new target
    gameState = 'playing';
    
    document.getElementById('status').textContent = `🎯 Note Name Sniper (${targetsHit + 1}/${TOTAL_TARGETS}): Read the staff and hit the matching key!`;
}

function spawnExplosion(x, y) {
    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 50 + Math.random() * 150;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            color: Math.random() > 0.5 ? '#ef4444' : (Math.random() > 0.5 ? '#f97316' : '#facc15'),
            size: 2 + Math.random() * 4
        });
    }
}

export function handleNoteSniperInput(noteStr, bridge) {
    if (gameState !== 'playing') return; // Ignore input while animating a shot

    const playedPitch = noteStr.toLowerCase().trim().replace(/[0-9]+$/, '');
    const targetPitch = currentTargetNote.toLowerCase().trim().replace(/[0-9]+$/, '');

    // Match either the exact octave note or matching pitch letter
    if (noteStr.toLowerCase().trim() === currentTargetNote || playedPitch === targetPitch) {
        // Trigger the focus & shoot animation sequence
        gameState = 'focusing';
        bridge.highlightKey(noteStr, 250, '#22c55e');
    } else {
        wrongTaps++;
        playErrorClackSound();
        bridge.highlightKey(noteStr, 220, '#ef4444');
        
        // Add a bullet hole randomly offset from the correct note, but safely within the staff area
        const angle = Math.random() * Math.PI * 2;
        const dist = 35 + Math.random() * 70;
        bulletHoles.push({
            x: currentNotePos.x + Math.cos(angle) * dist,
            y: currentNotePos.y + Math.sin(angle) * dist
        });
        
        document.getElementById('status').textContent = `❌ Missed! Look closely at the line/space on the treble staff...`;
    }
}

function gameLoop(now) {
    if (gameState === 'over') return;
    
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    
    const canvas = document.getElementById('waterfall-canvas');
    const ctx = canvas.getContext('2d');
    
    // Logic Updates
    if (gameState === 'playing') {
        // Roaming crosshair around the note
        crosshair.x = currentNotePos.x + Math.sin(now / 400) * 80 + Math.cos(now / 330) * 30;
        crosshair.y = currentNotePos.y + Math.cos(now / 500) * 45 + Math.sin(now / 270) * 20;
    } else if (gameState === 'focusing') {
        // Snap to target rapidly
        crosshair.x += (currentNotePos.x - crosshair.x) * (dt * 15);
        crosshair.y += (currentNotePos.y - crosshair.y) * (dt * 15);
        
        const dist = Math.hypot(currentNotePos.x - crosshair.x, currentNotePos.y - crosshair.y);
        if (dist < 2.5) {
            gameState = 'exploding';
            explosionTimer = 0;
            playSniperShotSound();
            spawnExplosion(currentNotePos.x, currentNotePos.y);
            
            const freq = getNoteFrequency(currentTargetNote);
            if (freq) playTone(freq, 0.25, 0.8);
            bridgeRef.spawnConfetti(canvas.width / 2, 50, '#22c55e');
        }
    } else if (gameState === 'exploding') {
        explosionTimer += dt;
        if (explosionTimer > 0.6) { // Wait a moment before moving on
            targetsHit++;
            if (targetsHit >= TOTAL_TARGETS) {
                const totalTimeSec = parseFloat(((now - startTimeMs) / 1000).toFixed(2));
                bridgeRef.finishCustomMiniGame(
                    "Note Name Sniper",
                    totalTimeSec,
                    `10 Notes Sniped in: <span style="color:#22c55e; font-size:1.4rem; font-weight:800;">${totalTimeSec}s</span><br><span style="font-size:0.8rem; color:#9ca3af;">(${wrongTaps} missed shots)</span>`
                );
                stopNoteSniper();
                return;
            } else {
                pickNextSniperTarget();
            }
        }
    }
    
    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt; // Gravity
        p.life -= dt * 1.5;
        if (p.life <= 0) particles.splice(i, 1);
    }
    
    // Rendering
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw clean treble staff
    drawSheetMusicStaff(ctx, canvas.width);
    
    // Draw Bullet Holes
    bulletHoles.forEach(bh => {
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.arc(bh.x, bh.y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#4b5563';
        ctx.beginPath();
        ctx.arc(bh.x + 1, bh.y + 1, 2, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Target Note (hide if it's currently exploding)
    if (gameState !== 'exploding') {
        drawLedgerLines(ctx, currentNotePos.x, currentNotePos.step, 56, 4, '#ef4444');
        drawStemlessNote(ctx, currentNotePos.x, currentNotePos.y, currentNotePos.isSharp, '#ef4444');
    }
    
    // Draw Particles
    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw Crosshair
    ctx.save();
    ctx.translate(crosshair.x, crosshair.y);
    // Outer circle
    ctx.strokeStyle = gameState === 'focusing' ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
    // Center dot
    ctx.fillStyle = gameState === 'focusing' ? '#22c55e' : '#ef4444';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    // Cross lines
    ctx.beginPath();
    ctx.moveTo(-25, 0); ctx.lineTo(-10, 0);
    ctx.moveTo(25, 0); ctx.lineTo(10, 0);
    ctx.moveTo(0, -25); ctx.lineTo(0, -10);
    ctx.moveTo(0, 25); ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.restore();

    // HUD
    const elapsedSec = ((now - startTimeMs) / 1000).toFixed(1);
    ctx.save();
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🎯 SNIPE THE NOTE ON THE STAFF!   |   Progress: ${targetsHit}/${TOTAL_TARGETS}   |   Time: ${elapsedSec}s`, canvas.width / 2, canvas.height - 22);
    ctx.restore();
    
    animFrameId = requestAnimationFrame(gameLoop);
}
