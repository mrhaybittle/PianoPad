import { audioCtx, initAudio } from './audio.js';
import { getNoteFrequency } from './musicTheory.js';

let fanfareLoopOscs = [];
let fanfareGain = null;
let isFanfareMuted = false;

let celCanvas, celCtx, celFrameId;
let fireworks = [];
let celConfetti = [];

let finaleBridge = null;

export function initFinaleBridge(deps) {
    finaleBridge = deps;
}

export function playVictoryFanfare() {
    initAudio();
    stopVictoryMusic();
    isFanfareMuted = false;
    const muteBtn = document.getElementById('btn-mute-fanfare');
    if (muteBtn) muteBtn.textContent = "🔇 Mute Music";

    fanfareGain = audioCtx.createGain();
    fanfareGain.gain.value = 0.4;
    fanfareGain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    const playBrassChord = (pitches, time, duration) => {
        pitches.forEach(p => {
            const osc = audioCtx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = getNoteFrequency(p);
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(400, time);
            filter.frequency.exponentialRampToValueAtTime(3500, time + duration / 2);

            const env = audioCtx.createGain();
            env.gain.setValueAtTime(0, time);
            env.gain.linearRampToValueAtTime(0.25, time + 0.1);
            env.gain.exponentialRampToValueAtTime(0.01, time + duration);

            osc.connect(filter).connect(env).connect(fanfareGain);
            osc.start(time);
            osc.stop(time + duration);
        });
    };

    playBrassChord(['c4', 'e4', 'g4'], now, 0.5);
    playBrassChord(['f4', 'a4', 'c5'], now + 0.5, 0.5);
    playBrassChord(['g4', 'b4', 'd5'], now + 1.0, 0.5);
    playBrassChord(['c4', 'e4', 'g4', 'c5'], now + 1.5, 2.0);

    const loopStart = now + 3.5;
    const loopNotes = ['c4', 'e4', 'g4', 'e4', 'f4', 'a4', 'c5', 'a4', 'd4', 'f4', 'a4', 'f4', 'g4', 'b4', 'd5', 'b4'];
    for (let i = 0; i < 48; i++) {
        const time = loopStart + (i * 0.25);
        const osc = audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = getNoteFrequency(loopNotes[i % loopNotes.length]);

        const env = audioCtx.createGain();
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(0.12, time + 0.03);
        env.gain.exponentialRampToValueAtTime(0.01, time + 0.22);

        osc.connect(env).connect(fanfareGain);
        osc.start(time);
        osc.stop(time + 0.25);
        fanfareLoopOscs.push(osc);
    }
}

export function toggleFanfareMute() {
    if (!fanfareGain) return;
    isFanfareMuted = !isFanfareMuted;
    fanfareGain.gain.value = isFanfareMuted ? 0 : 0.4;
    const muteBtn = document.getElementById('btn-mute-fanfare');
    if (muteBtn) muteBtn.textContent = isFanfareMuted ? "🔊 Unmute" : "🔇 Mute Music";
}

export function stopVictoryMusic() {
    fanfareLoopOscs.forEach(o => { try { o.stop(); } catch (e) {} });
    fanfareLoopOscs = [];
    if (fanfareGain) {
        fanfareGain.disconnect();
        fanfareGain = null;
    }
}

export function startCelebrationCanvas() {
    celCanvas = document.getElementById('celebration-canvas');
    if (!celCanvas) return;
    celCanvas.style.display = 'block';
    celCanvas.width = window.innerWidth;
    celCanvas.height = window.innerHeight;
    celCtx = celCanvas.getContext('2d');
    fireworks = [];
    celConfetti = [];
    celFrameId = requestAnimationFrame(renderCelebration);
}

export function stopCelebrationCanvas() {
    if (celFrameId) cancelAnimationFrame(celFrameId);
    if (celCanvas) celCanvas.style.display = 'none';
}

export function spawnFirework() {
    fireworks.push({
        x: Math.random() * (celCanvas.width - 300) + 150,
        y: celCanvas.height,
        vx: (Math.random() - 0.5) * 3,
        vy: -(Math.random() * 6 + 12),
        exploded: false,
        particles: [],
        hue: Math.random() * 360
    });
}

export function renderCelebration() {
    celCtx.clearRect(0, 0, celCanvas.width, celCanvas.height);

    if (Math.random() < 0.04) spawnFirework();
    if (Math.random() < 0.25) {
        celConfetti.push({
            x: Math.random() * celCanvas.width, y: -10,
            vx: (Math.random() - 0.5) * 3, vy: Math.random() * 4 + 2,
            size: Math.random() * 10 + 5, color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            rot: 0, rotSpeed: (Math.random() - 0.5) * 0.3
        });
    }

    for (let i = celConfetti.length - 1; i >= 0; i--) {
        let c = celConfetti[i];
        c.x += c.vx; c.y += c.vy; c.rot += c.rotSpeed;
        celCtx.save();
        celCtx.translate(c.x, c.y); celCtx.rotate(c.rot);
        celCtx.fillStyle = c.color;
        celCtx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
        celCtx.restore();
        if (c.y > celCanvas.height) celConfetti.splice(i, 1);
    }

    for (let i = fireworks.length - 1; i >= 0; i--) {
        let fw = fireworks[i];
        if (!fw.exploded) {
            fw.x += fw.vx; fw.y += fw.vy; fw.vy += 0.2;
            celCtx.fillStyle = '#fff';
            celCtx.beginPath(); celCtx.arc(fw.x, fw.y, 4, 0, Math.PI * 2); celCtx.fill();
            if (fw.vy >= 0) {
                fw.exploded = true;
                for (let j = 0; j < 60; j++) {
                    let angle = Math.random() * Math.PI * 2;
                    let speed = Math.random() * 7 + 1;
                    fw.particles.push({
                        x: fw.x, y: fw.y,
                        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                        alpha: 1, hue: fw.hue + (Math.random() - 0.5) * 40
                    });
                }
            }
        } else {
            for (let j = fw.particles.length - 1; j >= 0; j--) {
                let p = fw.particles[j];
                p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.vx *= 0.97; p.alpha -= 0.02;
                celCtx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${p.alpha})`;
                celCtx.beginPath(); celCtx.arc(p.x, p.y, 3, 0, Math.PI * 2); celCtx.fill();
                if (p.alpha <= 0) fw.particles.splice(j, 1);
            }
            if (fw.particles.length === 0) fireworks.splice(i, 1);
        }
    }
    celFrameId = requestAnimationFrame(renderCelebration);
}

export function showGrandFinale(standings, isHost, titleText) {
    const { sessionStudentName, localStudentId } = finaleBridge ? finaleBridge.getState() : {};

    document.getElementById('game-results-modal').classList.remove('open');
    const koModal = document.getElementById('knockout-modal');
    if (koModal) koModal.classList.remove('open');
    const vsOverlay = document.getElementById('ko-vs-overlay');
    if (vsOverlay) vsOverlay.style.display = 'none';
    const tugHud = document.getElementById('tug-of-war-hud');
    if (tugHud) tugHud.style.display = 'none';

    const modal = document.getElementById('finale-modal');
    modal.style.display = 'flex';
    document.getElementById('finale-title-text').textContent = titleText || "GRAND FINALE!";

    let myRank = -1;
    standings.forEach((p, idx) => {
        if (p.name === sessionStudentName || p.id === localStudentId) myRank = idx + 1;
    });

    const subText = document.getElementById('finale-subtitle-text');
    if (myRank === 1) {
        subText.innerHTML = "🏆 <span style='color:#facc15;'>CLASS CHAMPION!</span>";
    } else if (myRank > 1) {
        subText.innerHTML = `🎉 YOU FINISHED <span style='color:#38bdf8;'>#${myRank}</span> OUT OF ${standings.length}!`;
    } else {
        subText.innerHTML = `Spectator Mode`;
    }

    const podiumMap = [
        { rank: 2, class: 'pedestal-2', label: '🥈 2nd' },
        { rank: 1, class: 'pedestal-1', label: '👑 1st' },
        { rank: 3, class: 'pedestal-3', label: '🥉 3rd' }
    ];

    const podiumContainer = document.getElementById('podium-container');
    podiumContainer.innerHTML = '';

    podiumMap.forEach((spot) => {
        const p = standings[spot.rank - 1];
        if (p) {
            const delay = spot.rank === 1 ? 2800 : (spot.rank === 2 ? 1800 : 800);
            const scoreText = p.score !== undefined ? `${p.score}%` : (p.avgAcc ? `${p.avgAcc}%` : '');

            podiumContainer.innerHTML += `
                <div class="pedestal-wrap" id="ped-wrap-${spot.rank}" style="transition-delay: ${delay}ms;">
                    <div class="pedestal-avatar">${p.avatar || '🏃'}</div>
                    <div class="pedestal-name">${p.name}</div>
                    <div class="pedestal-score">${scoreText}</div>
                    <div class="pedestal ${spot.class}">${spot.label}</div>
                </div>
            `;
        }
    });

    setTimeout(() => {
        [3, 2, 1].forEach(r => {
            const el = document.getElementById(`ped-wrap-${r}`);
            if (el) el.classList.add('show');
        });
    }, 100);

    const hmContainer = document.getElementById('honorable-mentions');
    hmContainer.innerHTML = '';
    if (standings.length > 3) {
        standings.slice(3).forEach((p, idx) => {
            const scoreText = p.score !== undefined ? `${p.score}%` : (p.avgAcc ? `${p.avgAcc}%` : '');
            hmContainer.innerHTML += `
                <div class="hm-card">
                    <div class="hm-rank">#${idx + 4} Rank</div>
                    <div class="hm-name">${p.avatar || '🏃'} ${p.name}</div>
                    <div class="hm-score">${scoreText}</div>
                </div>
            `;
        });
    }

    playVictoryFanfare();
    startCelebrationCanvas();
}

export function closeGrandFinale() {
    stopVictoryMusic();
    stopCelebrationCanvas();
    document.getElementById('finale-modal').style.display = 'none';

    if (finaleBridge && finaleBridge.onClose) {
        finaleBridge.onClose();
    }

    document.getElementById('status').textContent = 'Returned to PianoPad.';
}
