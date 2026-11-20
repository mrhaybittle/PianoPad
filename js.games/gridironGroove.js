import { initAudio, audioCtx } from '../audio.js';

let animFrameId = null;
let lastFrameTime = 0;
let gamePhase = 'instructions'; // 'instructions' | 'presnap' | 'passing' | 'airborne' | 'running' | 'pat' | 'playover' | 'gameover'

let score = 0;
let touchdowns = 0;
let fieldGoals = 0;
let driveNumber = 1;
let multiplier = 1;
let bestScore = parseInt(localStorage.getItem('pianopad_gridiron_groove_best') || '0', 10);

// Football drive state (Field is 0 to 100 yards; 100 = Opponent Endzone)
let down = 1;
let lineOfScrimmage = 40; // Start on own 40-yd line (60 yds to TD)
let firstDownLine = 50;
let cameraYard = 36;

let pocketTimer = 0;
let maxPocketTime = 5.2;
let playBannerText = '';
let playBannerColor = '#facc15';
let playBannerTimer = 0;
let shakeTimer = 0;

// Players & Ball
const qb = {
    yard: 35,
    laneY: 0.5, // 0.0 (top sideline) to 1.0 (bottom sideline)
    animPhase: 0
};

let receivers = [];
let defenders = [];
let particles = [];

const ball = {
    active: false,
    startYard: 0,
    startLaneY: 0.5,
    targetYard: 0,
    targetLaneY: 0.5,
    targetReceiverIdx: -1,
    progress: 0,
    duration: 0.55,
    yard: 0,
    laneY: 0.5,
    height: 0
};

let carrier = {
    active: false,
    yard: 40,
    laneY: 0.5,
    targetLaneY: 0.5,
    speed: 13.5,
    jukeTimer: 0,
    jukeCooldown: 0,
    boostTimer: 0,
    animPhase: 0,
    boostNote: 'G'
};

// Extra Point (PAT) Kick Meter
const patState = {
    cursor: 0.5, // 0..1 oscillating across uprights
    dir: 1,
    speed: 1.45,
    kickNote: 'C',
    kicked: false,
    ballProgress: 0,
    kickGood: false
};

const SCALE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function preventSpaceBar(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
    }
}

// --- 8-BIT RETRO BOWL CHIPTUNE SOUND EFFECTS ---
function playRetroSound(type) {
    try {
        initAudio();
        const now = audioCtx.currentTime;

        if (type === 'snap') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(190, now);
            osc.frequency.exponentialRampToValueAtTime(360, now + 0.07);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.09);
        } else if (type === 'throw') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(760, now + 0.14);
            gain.gain.setValueAtTime(0.09, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.16);
        } else if (type === 'catch') {
            [523.25, 783.99].forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, now + idx * 0.05);
                gain.gain.setValueAtTime(0.08, now + idx * 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.12);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.05);
                osc.stop(now + idx * 0.05 + 0.13);
            });
        } else if (type === 'juke') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
            gain.gain.setValueAtTime(0.07, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'tackle') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(38, now + 0.25);
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.28);
        } else if (type === 'touchdown') {
            const fanfare = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50];
            fanfare.forEach((f, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(f, now + idx * 0.09);
                gain.gain.setValueAtTime(0.09, now + idx * 0.09);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.2);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.09);
                osc.stop(now + idx * 0.09 + 0.22);
            });
        } else if (type === 'kick') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(620, now + 0.18);
            gain.gain.setValueAtTime(0.13, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.21);
        }
    } catch (e) {}
}

export function stopGridironGroove() {
    if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    gamePhase = 'gameover';
    window.removeEventListener('keydown', preventSpaceBar, { capture: true });
    const popup = document.getElementById('gridiron-groove-popup');
    if (popup) popup.style.display = 'none';
}

export function startGridironGroove(bridge) {
    initAudio();
    stopGridironGroove();
    bridge.exitActiveMiniGame();
    document.getElementById('game-results-modal')?.classList.remove('open');
    document.getElementById('arcade-hub')?.classList.remove('open');
    bridge.setActiveMiniGame('gridironGroove');
    bridge.resetGameStats();

    window.addEventListener('keydown', preventSpaceBar, { capture: true });

    score = 0;
    touchdowns = 0;
    fieldGoals = 0;
    driveNumber = 1;
    multiplier = 1;
    down = 1;
    lineOfScrimmage = 40;
    firstDownLine = 50;
    cameraYard = 36;
    particles = [];
    shakeTimer = 0;
    playBannerTimer = 0;

    setupNextPlay();

    document.getElementById('status').textContent =
        '🏈 Gridiron Groove: Play Receiver Note to PASS • Oct 1/2/3 = Top/Mid/Bot Lane • Black Key = JUKE!';

    gamePhase = 'instructions';
    showInstructionsPopup(bridge);
}

function showInstructionsPopup(bridge) {
    let popup = document.getElementById('gridiron-groove-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'gridiron-groove-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #0f172a;
            border: 4px solid #facc15;
            box-shadow: 0 0 0 4px #1e3a8a, 0 18px 40px rgba(0,0,0,0.85);
            padding: 22px;
            color: #f8fafc;
            font-family: 'Courier New', Courier, monospace;
            z-index: 9999;
            width: 88%;
            max-width: 440px;
            text-align: center;
        `;
        document.body.appendChild(popup);
    }

    popup.innerHTML = `
        <div style="background:#1e3a8a; border:2px solid #facc15; padding:10px; margin-bottom:14px;">
            <div style="font-size:12px; color:#93c5fd; font-weight:bold; letter-spacing:2px;">16-BIT RETRO BOWL EDITION</div>
            <h2 style="margin:4px 0 0 0; font-size:28px; color:#facc15; text-shadow: 3px 3px 0 #991b1b; letter-spacing:1px;">
                🏈 GRIDIRON GROOVE
            </h2>
        </div>

        <div style="background:#1e293b; border:2px solid #475569; padding:12px; text-align:left; font-size:13.5px; line-height:1.55; margin-bottom:14px;">
            <div style="margin-bottom:6px;"><span style="color:#facc15; font-weight:bold;">1. SNAP & PASS:</span> Play the <b>Note Letter</b> above an open Receiver (any octave) to throw!</div>
            <div style="margin-bottom:6px;"><span style="color:#38bdf8; font-weight:bold;">2. RUN LANES:</span> <b>Oct 1</b> = Top • <b>Oct 2</b> = Mid • <b>Oct 3</b> = Bottom</div>
            <div style="margin-bottom:6px;"><span style="color:#ec4899; font-weight:bold;">3. JUKE MOVE:</span> Tap <b>ANY Black Key</b> to dodge tackles!</div>
            <div><span style="color:#22c55e; font-weight:bold;">4. EXTRA POINT:</span> Play the <b>Kick Note</b> when the meter hits green!</div>
        </div>

        <button id="btn-start-gridiron" style="
            background: #22c55e; color: #052e16; border: 3px solid #facc15; padding: 12px 20px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 18px; font-weight: 900; cursor: pointer;
            box-shadow: 0 4px 0 #14532d; width: 100%; letter-spacing: 1px;
        ">▶ KICKOFF!</button>
    `;

    popup.style.display = 'block';

    const btn = document.getElementById('btn-start-gridiron');
    btn.onclick = () => {
        popup.style.display = 'none';
        gamePhase = 'presnap';
        lastFrameTime = performance.now();
        if (animFrameId === null) {
            animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));
        }
    };
}

function pickUniqueNotes(count) {
    const shuffled = [...SCALE_LETTERS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function setupNextPlay() {
    const notes = pickUniqueNotes(4);
    qb.yard = Math.max(4, lineOfScrimmage - 4.5);
    qb.laneY = 0.5;
    qb.animPhase = 0;

    ball.active = false;
    carrier.active = false;
    carrier.jukeTimer = 0;
    carrier.jukeCooldown = 0;
    carrier.boostTimer = 0;
    carrier.boostNote = notes[3];

    pocketTimer = 0;
    maxPocketTime = Math.max(3.4, 5.4 - (driveNumber - 1) * 0.35);

    // 3 Retro Bowl Receivers running distinct routes
    const routeConfigs = [
        { label: 'WR1', startY: 0.20, targetY: 0.16, speed: 12.2 + driveNumber * 0.4, breakYard: lineOfScrimmage + 6 },
        { label: 'TE',  startY: 0.50, targetY: 0.36, speed: 10.8 + driveNumber * 0.35, breakYard: lineOfScrimmage + 4 },
        { label: 'WR2', startY: 0.80, targetY: 0.72, speed: 12.5 + driveNumber * 0.4, breakYard: lineOfScrimmage + 7 }
    ];

    receivers = routeConfigs.map((cfg, i) => ({
        id: i,
        label: cfg.label,
        note: notes[i],
        yard: lineOfScrimmage - 0.5,
        laneY: cfg.startY,
        startY: cfg.startY,
        targetY: cfg.targetY,
        breakYard: cfg.breakYard,
        speed: cfg.speed,
        animPhase: i * 1.3
    }));

    // Defenders: 2 pass rushers + 3 secondary coverage defenders
    const rushSpeed = 2.1 + driveNumber * 0.25;
    const dbSpeed = 8.4 + driveNumber * 0.45;
    defenders = [
        { role: 'rush', yard: lineOfScrimmage + 1.5, laneY: 0.38, speed: rushSpeed, animPhase: 0.2 },
        { role: 'rush', yard: lineOfScrimmage + 1.5, laneY: 0.62, speed: rushSpeed * 0.95, animPhase: 1.7 },
        { role: 'db',   yard: lineOfScrimmage + 9,   laneY: 0.20, speed: dbSpeed, animPhase: 0.8, stunned: 0 },
        { role: 'db',   yard: lineOfScrimmage + 11,  laneY: 0.50, speed: dbSpeed * 0.95, animPhase: 2.1, stunned: 0 },
        { role: 'db',   yard: lineOfScrimmage + 10,  laneY: 0.80, speed: dbSpeed, animPhase: 1.4, stunned: 0 }
    ];

    cameraYard = Math.max(12, lineOfScrimmage - 4);
}

function triggerBanner(text, color = '#facc15', duration = 1.35) {
    playBannerText = text;
    playBannerColor = color;
    playBannerTimer = duration;
}

function spawnPixelBurst(yard, laneY, color, count = 10) {
    for (let i = 0; i < count; i++) {
        particles.push({
            yard,
            laneY,
            vYard: (Math.random() - 0.5) * 16,
            vLaneY: (Math.random() - 0.5) * 0.9,
            color,
            life: 1.0
        });
    }
}

export function handleGridironGrooveInput(noteStr, bridge) {
    if (gamePhase === 'instructions' || gamePhase === 'playover' || gamePhase === 'gameover') return;

    const match = (noteStr || '').trim().toLowerCase().match(/^([a-g])(#?)([0-9]+)$/);
    if (!match) return;

    const letter = match[1].toUpperCase();
    const isSharp = match[2] === '#';
    const octave = parseInt(match[3], 10);

    // 1. PRE-SNAP: Any key snaps the ball (and if it matches a receiver right away, snaps cleanly!)
    if (gamePhase === 'presnap') {
        gamePhase = 'passing';
        playRetroSound('snap');
        bridge.highlightKey(noteStr, 180, '#facc15');
        triggerBanner('HIKE! HIT AN OPEN RECEIVER!', '#facc15', 1.1);
        return;
    }

    // 2. IN THE POCKET (PASSING): Match a Receiver's Note Letter to throw a spiral!
    if (gamePhase === 'passing') {
        const targetIdx = receivers.findIndex(r => r.note === letter);
        if (targetIdx !== -1) {
            const rec = receivers[targetIdx];
            // Lead the receiver like Retro Bowl!
            const flightTime = 0.48;
            const leadYard = Math.min(104, rec.yard + rec.speed * flightTime);
            const leadLaneY = rec.laneY + (rec.targetY - rec.laneY) * 0.35;

            ball.active = true;
            ball.startYard = qb.yard;
            ball.startLaneY = qb.laneY;
            ball.targetYard = leadYard;
            ball.targetLaneY = Math.max(0.08, Math.min(0.92, leadLaneY));
            ball.targetReceiverIdx = targetIdx;
            ball.progress = 0;
            ball.duration = flightTime;
            ball.yard = qb.yard;
            ball.laneY = qb.laneY;
            ball.height = 0;

            gamePhase = 'airborne';
            playRetroSound('throw');
            bridge.highlightKey(noteStr, 250, '#22c55e');
            spawnPixelBurst(qb.yard, qb.laneY, '#facc15', 6);
        } else if (isSharp) {
            // Black key in pocket dodges pass rush slightly!
            qb.yard = Math.max(1, qb.yard - 1.5);
            pocketTimer = Math.max(0, pocketTimer - 0.65);
            playRetroSound('juke');
            bridge.highlightKey(noteStr, 180, '#ec4899');
            triggerBanner('POCKET STEP!', '#ec4899', 0.7);
        } else {
            // Wrong note letter -> visual feedback only
            bridge.highlightKey(noteStr, 140, '#ef4444');
        }
        return;
    }

    // 3. RUNNING AFTER CATCH: Octave 1/2/3 switches lanes, Black Key = Juke, Boost Note = Turbo!
    if (gamePhase === 'running' && carrier.active) {
        if (octave <= 1) carrier.targetLaneY = 0.20;
        else if (octave === 2) carrier.targetLaneY = 0.50;
        else carrier.targetLaneY = 0.80;

        if (isSharp && carrier.jukeCooldown <= 0) {
            carrier.jukeTimer = 0.45;
            carrier.jukeCooldown = 1.05;
            playRetroSound('juke');
            bridge.highlightKey(noteStr, 220, '#ec4899');
            spawnPixelBurst(carrier.yard, carrier.laneY, '#ec4899', 8);
            triggerBanner('JUKE MOVE!', '#ec4899', 0.65);
        } else if (!isSharp && letter === carrier.boostNote) {
            carrier.boostTimer = 1.1;
            score += 40 * multiplier;
            carrier.boostNote = SCALE_LETTERS[(SCALE_LETTERS.indexOf(letter) + 2 + Math.floor(Math.random() * 4)) % SCALE_LETTERS.length];
            playRetroSound('catch');
            bridge.highlightKey(noteStr, 220, '#22c55e');
            spawnPixelBurst(carrier.yard, carrier.laneY, '#22c55e', 8);
            triggerBanner('GROOVE TURBO +40!', '#22c55e', 0.7);
        } else {
            bridge.highlightKey(noteStr, 150, '#38bdf8');
        }
        return;
    }

    // 4. EXTRA POINT KICK (PAT): Any key kicks when meter is sweeping!
    if (gamePhase === 'pat' && !patState.kicked) {
        patState.kicked = true;
        patState.ballProgress = 0;
        // Center green zone is 0.36 to 0.64 (wider if playing the target kick note!)
        const tolerance = letter === patState.kickNote ? 0.19 : 0.12;
        patState.kickGood = Math.abs(patState.cursor - 0.5) <= tolerance;
        playRetroSound('kick');
        bridge.highlightKey(noteStr, 240, patState.kickGood ? '#22c55e' : '#ef4444');
    }
}

function resolveDownEnded(endYard, reasonText, reasonColor, bridge) {
    gamePhase = 'playover';
    carrier.active = false;
    ball.active = false;

    const clampedYard = Math.max(1, Math.min(99, Math.round(endYard)));
    const yardsGained = clampedYard - lineOfScrimmage;
    if (yardsGained > 0) {
        score += yardsGained * 10 * multiplier;
    }

    lineOfScrimmage = clampedYard;

    if (lineOfScrimmage >= firstDownLine) {
        down = 1;
        firstDownLine = Math.min(100, lineOfScrimmage + 10);
        triggerBanner(`FIRST DOWN! (+${Math.max(0, yardsGained)} YDS)`, '#22c55e', 1.3);
        setTimeout(() => {
            if (bridge.getActiveMiniGame() !== 'gridironGroove') return;
            setupNextPlay();
            gamePhase = 'presnap';
        }, 1250);
    } else if (down < 4) {
        down++;
        triggerBanner(`${reasonText} (${down}${getOrdinal(down)} & ${firstDownLine - lineOfScrimmage})`, reasonColor, 1.3);
        setTimeout(() => {
            if (bridge.getActiveMiniGame() !== 'gridironGroove') return;
            setupNextPlay();
            gamePhase = 'presnap';
        }, 1250);
    } else {
        // Turnover on Downs -> End Game!
        triggerEndGame('TURNOVER ON DOWNS!', bridge);
    }
}

function triggerTouchdown(bridge) {
    gamePhase = 'pat';
    carrier.active = false;
    touchdowns++;
    score += 500 * multiplier;
    multiplier = Math.min(5, multiplier + 1);
    playRetroSound('touchdown');
    spawnPixelBurst(103, carrier.laneY, '#facc15', 24);
    triggerBanner(`TOUCHDOWN!! +${500 * (multiplier - 1)} PTS`, '#facc15', 1.6);

    patState.cursor = 0.2;
    patState.dir = 1;
    patState.speed = 1.35 + driveNumber * 0.15;
    patState.kickNote = SCALE_LETTERS[Math.floor(Math.random() * SCALE_LETTERS.length)];
    patState.kicked = false;
    patState.ballProgress = 0;
    patState.kickGood = false;
    cameraYard = 88;
}

function triggerEndGame(headline, bridge) {
    gamePhase = 'gameover';
    playRetroSound('tackle');
    triggerBanner(headline, '#ef4444', 1.5);

    const finalScore = Math.floor(score);
    if (finalScore > bestScore) {
        bestScore = finalScore;
        localStorage.setItem('pianopad_gridiron_groove_best', String(bestScore));
    }

    setTimeout(() => {
        if (bridge.getActiveMiniGame() !== 'gridironGroove') return;
        stopGridironGroove();
        bridge.finishCustomMiniGame(
            'Gridiron Groove',
            finalScore,
            `<span style="color:#facc15; font-weight:800;">${headline}</span><br>` +
            `Groove Score: <span style="color:#22c55e; font-size:1.45rem; font-weight:900;">${finalScore}</span><br>` +
            `<span style="font-size:0.85rem; color:#93c5fd;">🏈 TDs: ${touchdowns}  •  🥅 FGs: ${fieldGoals}  •  🏆 Best: ${bestScore}</span>`,
            () => startGridironGroove(bridge)
        );
    }, 1150);
}

function getOrdinal(n) {
    if (n === 1) return 'ST';
    if (n === 2) return 'ND';
    if (n === 3) return 'RD';
    return 'TH';
}

function gameLoop(now, bridge) {
    if (bridge.getActiveMiniGame() !== 'gridironGroove') {
        stopGridironGroove();
        return;
    }

    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (playBannerTimer > 0) playBannerTimer = Math.max(0, playBannerTimer - dt);
    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);

    // --- UPDATE SIMULATION ---
    if (gamePhase === 'passing') {
        pocketTimer += dt;
        qb.animPhase += dt * 10;

        // Move receivers along their Retro Bowl routes
        receivers.forEach(r => {
            r.animPhase += dt * 14;
            r.yard = Math.min(106, r.yard + r.speed * dt);
            if (r.yard >= r.breakYard) {
                r.laneY += (r.targetY - r.laneY) * Math.min(1, dt * 3.2);
            }
        });

        // Rushers close in on QB; DBs shadow receivers
        defenders.forEach((d, idx) => {
            d.animPhase += dt * 13;
            if (d.role === 'rush') {
                const dx = qb.yard - d.yard;
                const dy = qb.laneY - d.laneY;
                const dist = Math.hypot(dx, dy) || 1;
                d.yard += (dx / dist) * d.speed * dt;
                d.laneY += (dy / dist) * d.speed * 0.08 * dt;
                if (dist < 1.15 || pocketTimer >= maxPocketTime) {
                    shakeTimer = 0.3;
                    playRetroSound('tackle');
                    resolveDownEnded(qb.yard, 'SACKED!', '#ef4444', bridge);
                }
            } else {
                const targetRec = receivers[idx % receivers.length];
                if (targetRec) {
                    const desiredYard = targetRec.yard + 1.2;
                    d.yard += (desiredYard - d.yard) * Math.min(1, dt * 3.8);
                    d.laneY += (targetRec.laneY - d.laneY) * Math.min(1, dt * 2.6);
                }
            }
        });

        cameraYard += ((lineOfScrimmage + 4) - cameraYard) * Math.min(1, dt * 4);
    } else if (gamePhase === 'airborne') {
        ball.progress += dt / ball.duration;
        receivers.forEach(r => {
            r.animPhase += dt * 14;
            r.yard = Math.min(106, r.yard + r.speed * dt);
            if (r.yard >= r.breakYard) {
                r.laneY += (r.targetY - r.laneY) * Math.min(1, dt * 3.2);
            }
        });
        defenders.forEach((d, idx) => {
            d.animPhase += dt * 13;
            if (d.role === 'db') {
                const targetRec = receivers[idx % receivers.length];
                if (targetRec) {
                    d.yard += (targetRec.yard - d.yard) * Math.min(1, dt * 3.4);
                    d.laneY += (targetRec.laneY - d.laneY) * Math.min(1, dt * 3.0);
                }
            }
        });

        const t = Math.min(1, ball.progress);
        ball.yard = ball.startYard + (ball.targetYard - ball.startYard) * t;
        ball.laneY = ball.startLaneY + (ball.targetLaneY - ball.startLaneY) * t;
        ball.height = Math.sin(t * Math.PI) * 28;
        cameraYard += ((ball.yard + 3) - cameraYard) * Math.min(1, dt * 7);

        if (ball.progress >= 1) {
            ball.active = false;
            const rec = receivers[ball.targetReceiverIdx];
            // Check if a defender is sitting right on the catch spot (Interception!)
            const interceptingDb = defenders.find(d => d.role === 'db' && Math.hypot(d.yard - ball.yard, (d.laneY - ball.laneY) * 18) < 1.55);

            if (interceptingDb && Math.random() < 0.45) {
                shakeTimer = 0.35;
                spawnPixelBurst(ball.yard, ball.laneY, '#ef4444', 18);
                triggerEndGame('INTERCEPTED!', bridge);
            } else if (rec && Math.hypot(rec.yard - ball.yard, (rec.laneY - ball.laneY) * 18) < 4.5) {
                // CAUGHT! Transition into Retro Bowl YAC (Run After Catch)!
                carrier.active = true;
                carrier.yard = rec.yard;
                carrier.laneY = rec.laneY;
                carrier.targetLaneY = rec.laneY;
                carrier.speed = 13.8 + driveNumber * 0.35;
                carrier.jukeTimer = 0;
                carrier.jukeCooldown = 0;
                carrier.boostTimer = 0;
                carrier.animPhase = 0;

                const openBonus = interceptingDb ? 50 : 125;
                score += openBonus * multiplier;
                playRetroSound('catch');
                spawnPixelBurst(carrier.yard, carrier.laneY, '#22c55e', 12);
                triggerBanner(interceptingDb ? 'CONTESTED CATCH!' : `WIDE OPEN CATCH! +${openBonus * multiplier}`, '#22c55e', 0.9);
                gamePhase = 'running';
            } else {
                resolveDownEnded(lineOfScrimmage, 'INCOMPLETE PASS!', '#f97316', bridge);
            }
        }
    } else if (gamePhase === 'running' && carrier.active) {
        carrier.animPhase += dt * 18;
        if (carrier.jukeTimer > 0) carrier.jukeTimer = Math.max(0, carrier.jukeTimer - dt);
        if (carrier.jukeCooldown > 0) carrier.jukeCooldown = Math.max(0, carrier.jukeCooldown - dt);
        if (carrier.boostTimer > 0) carrier.boostTimer = Math.max(0, carrier.boostTimer - dt);

        const moveSpeed = carrier.speed * (carrier.boostTimer > 0 ? 1.38 : 1.0);
        carrier.yard += moveSpeed * dt;
        carrier.laneY += (carrier.targetLaneY - carrier.laneY) * Math.min(1, dt * 8.5);
        cameraYard += ((carrier.yard + 6) - cameraYard) * Math.min(1, dt * 8);

        // Touchdown check!
        if (carrier.yard >= 100) {
            triggerTouchdown(bridge);
        } else {
            // Defenders pursue ball carrier
            for (const d of defenders) {
                if (d.stunned > 0) {
                    d.stunned = Math.max(0, d.stunned - dt);
                    continue;
                }
                d.animPhase += dt * 15;
                const pursueSpeed = (9.6 + driveNumber * 0.45);
                const dx = carrier.yard - d.yard;
                const dy = (carrier.laneY - d.laneY) * 18;
                const dist = Math.hypot(dx, dy) || 1;
                d.yard += (dx / dist) * pursueSpeed * dt;
                d.laneY += ((carrier.laneY - d.laneY) / Math.max(0.15, Math.abs(carrier.laneY - d.laneY))) * 0.36 * dt;

                if (dist < 1.35) {
                    if (carrier.jukeTimer > 0) {
                        // Broken tackle!
                        d.stunned = 1.4;
                        score += 75 * multiplier;
                        playRetroSound('juke');
                        spawnPixelBurst(d.yard, d.laneY, '#facc15', 10);
                        triggerBanner('BROKEN TACKLE! +75', '#facc15', 0.7);
                    } else {
                        shakeTimer = 0.28;
                        playRetroSound('tackle');
                        spawnPixelBurst(carrier.yard, carrier.laneY, '#ef4444', 12);
                        resolveDownEnded(carrier.yard, `TACKLED AT ${Math.round(carrier.yard)} YD LINE!`, '#38bdf8', bridge);
                        break;
                    }
                }
            }
        }
    } else if (gamePhase === 'pat') {
        if (!patState.kicked) {
            patState.cursor += patState.dir * patState.speed * dt;
            if (patState.cursor >= 0.92) { patState.cursor = 0.92; patState.dir = -1; }
            if (patState.cursor <= 0.08) { patState.cursor = 0.08; patState.dir = 1; }
        } else {
            patState.ballProgress += dt * 1.45;
            if (patState.ballProgress >= 1) {
                if (patState.kickGood) {
                    fieldGoals++;
                    score += 250 * multiplier;
                    playRetroSound('touchdown');
                    triggerBanner(`EXTRA POINT IS GOOD!! +${250 * multiplier}`, '#22c55e', 1.35);
                } else {
                    playRetroSound('tackle');
                    triggerBanner('KICK WIDE!', '#ef4444', 1.25);
                }
                gamePhase = 'playover';
                setTimeout(() => {
                    if (bridge.getActiveMiniGame() !== 'gridironGroove') return;
                    driveNumber++;
                    down = 1;
                    lineOfScrimmage = 35;
                    firstDownLine = 45;
                    setupNextPlay();
                    gamePhase = 'presnap';
                }, 1350);
            }
        }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.yard += pt.vYard * dt;
        pt.laneY += pt.vLaneY * dt;
        pt.life -= dt * 2.4;
        if (pt.life <= 0) particles.splice(i, 1);
    }

    // --- RENDER RETRO BOWL 16-BIT PIXEL GRAPHICS ---
    const canvas = document.getElementById('waterfall-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (shakeTimer > 0) {
        const mag = shakeTimer * 12;
        ctx.translate(Math.round((Math.random() - 0.5) * mag), Math.round((Math.random() - 0.5) * mag));
    }

    drawRetroBowlField(ctx, W, H, now);

    if (gamePhase === 'pat') {
        drawPatKickScene(ctx, W, H);
    } else {
        drawPassTrajectories(ctx, W, H);

        // Depth-sort all players by laneY (painter's algorithm)
        const sprites = [];
        if (!carrier.active) {
            sprites.push({ kind: 'qb', yard: qb.yard, laneY: qb.laneY, anim: qb.animPhase });
            receivers.forEach(r => sprites.push({ kind: 'wr', data: r, yard: r.yard, laneY: r.laneY, anim: r.animPhase }));
        } else {
            sprites.push({ kind: 'carrier', yard: carrier.yard, laneY: carrier.laneY, anim: carrier.animPhase });
        }
        defenders.forEach(d => sprites.push({ kind: 'def', data: d, yard: d.yard, laneY: d.laneY, anim: d.animPhase }));
        sprites.sort((a, b) => a.laneY - b.laneY);

        sprites.forEach(sp => {
            if (sp.kind === 'qb') {
                drawRetroPlayer(ctx, W, H, sp.yard, sp.laneY, '#2563eb', '#facc15', sp.anim, null, false);
            } else if (sp.kind === 'wr') {
                drawRetroPlayer(ctx, W, H, sp.yard, sp.laneY, '#2563eb', '#facc15', sp.anim, sp.data.note, false);
            } else if (sp.kind === 'carrier') {
                drawRetroPlayer(
                    ctx, W, H, sp.yard, sp.laneY,
                    carrier.boostTimer > 0 ? '#22c55e' : '#2563eb',
                    '#facc15', sp.anim, null, true, carrier.jukeTimer > 0
                );
            } else if (sp.kind === 'def') {
                drawRetroPlayer(
                    ctx, W, H, sp.yard, sp.laneY,
                    sp.data.stunned > 0 ? '#64748b' : '#dc2626',
                    '#e2e8f0', sp.anim, null, false
                );
            }
        });

        if (ball.active) {
            drawRetroFootball(ctx, W, H, ball.yard, ball.laneY, ball.height);
        }
    }

    // Pixel Particles
    particles.forEach(pt => {
        const pos = yardToScreen(pt.yard, pt.laneY, W, H);
        ctx.fillStyle = pt.color;
        ctx.fillRect(Math.round(pos.x), Math.round(pos.y), 4, 4);
    });

    drawRetroScoreboardHUD(ctx, W, H);

    ctx.restore();

    if (gamePhase !== 'gameover') {
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}

function yardToScreen(yard, laneY, W, H) {
    const pxPerYard = Math.max(14, W / 28);
    const topY = H * 0.19;
    const bottomY = H * 0.91;
    const x = W * 0.24 + (yard - cameraYard) * pxPerYard;
    const y = topY + laneY * (bottomY - topY);
    return { x, y, topY, bottomY, pxPerYard };
}

function drawRetroBowlField(ctx, W, H, now) {
    const topY = Math.round(H * 0.19);
    const bottomY = Math.round(H * 0.91);
    const fieldH = bottomY - topY;
    const pxPerYard = Math.max(14, W / 28);

    // 1. Retro Stadium Wall & Pixel Crowd (Top Strip)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, W, topY);

    // Pixel crowd dots cheering
    const crowdColors = ['#facc15', '#38bdf8', '#f87171', '#4ade80', '#ffffff'];
    for (let cx = 6; cx < W; cx += 10) {
        const bounce = Math.floor(Math.sin(now / 180 + cx) * 1.5);
        ctx.fillStyle = crowdColors[(cx / 10) % crowdColors.length];
        ctx.fillRect(cx, Math.max(4, topY - 18 + bounce), 6, 6);
        ctx.fillStyle = crowdColors[((cx / 10) + 2) % crowdColors.length];
        ctx.fillRect(cx + 3, Math.max(2, topY - 26 - bounce), 5, 5);
    }

    // Stadium Retaining Wall & Retro Ribbon Board
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, topY - 10, W, 10);
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    for (let bx = 20; bx < W; bx += 220) {
        ctx.fillText('★ RETRO GROOVE STADIUM ★', bx, topY - 2);
    }

    // 2. Alternating Two-Tone Green Retro Turf Strips (Every 5 yards)
    const startYard = Math.floor((cameraYard - 10) / 5) * 5;
    const endYard = Math.ceil((cameraYard + 32) / 5) * 5;

    for (let y = startYard; y <= endYard; y += 5) {
        const leftX = Math.round(W * 0.24 + (y - cameraYard) * pxPerYard);
        const stripW = Math.ceil(5 * pxPerYard);

        if (y < 0) {
            ctx.fillStyle = '#1e3a8a'; // Home Endzone
        } else if (y >= 100) {
            ctx.fillStyle = '#991b1b'; // Opponent Endzone
        } else {
            ctx.fillStyle = (Math.floor(y / 5) % 2 === 0) ? '#2e8b3c' : '#359c44';
        }
        ctx.fillRect(leftX, topY, stripW, fieldH);

        // Crisp White Yard Lines every 5 yards
        if (y >= 0 && y <= 100) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
            ctx.fillRect(leftX, topY, 2, fieldH);

            // Retro Hash Marks
            for (let hy = topY + 12; hy < bottomY - 8; hy += 16) {
                ctx.fillRect(leftX - 2, hy, 6, 2);
            }

            // Bold Pixel Yard Numbers every 10 yards
            if (y > 0 && y < 100 && y % 10 === 0) {
                const displayNum = y <= 50 ? y : 100 - y;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
                ctx.font = `900 ${Math.max(11, Math.round(H * 0.065))}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText(String(displayNum), leftX, topY + 18);
                ctx.fillText(String(displayNum), leftX, bottomY - 6);
            }
        }
    }

    // Painted Endzone Text & Yellow Pixel Goalpost at 105 yds
    const ezX = Math.round(W * 0.24 + (104 - cameraYard) * pxPerYard);
    if (ezX < W + 40) {
        ctx.save();
        ctx.translate(ezX, topY + fieldH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.55)';
        ctx.font = `900 ${Math.max(14, Math.round(H * 0.09))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('GROOVE', 0, 0);
        ctx.restore();

        // Retro Yellow Goalpost
        const gpX = Math.round(W * 0.24 + (108 - cameraYard) * pxPerYard);
        const gpMidY = Math.round(topY + fieldH * 0.5);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(gpX, gpMidY - 26, 4, 52); // Crossbar
        ctx.fillRect(gpX - 14, gpMidY - 26, 16, 3); // Left Upright
        ctx.fillRect(gpX - 14, gpMidY + 23, 16, 3); // Right Upright
        ctx.fillRect(gpX + 4, gpMidY - 2, 10, 4); // Base post
    }

    // 3. White Sidelines & Dark Border Track
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, topY, W, 3);
    ctx.fillRect(0, bottomY, W, 3);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, bottomY + 3, W, H - bottomY);

    // Bottom Lane Control Legend
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText('OCT 1 = TOP LANE   •   OCT 2 = MID LANE   •   OCT 3 = BOT LANE   •   BLACK KEY = JUKE', W / 2, H - 5);

    // 4. Blue Line of Scrimmage & Yellow First Down Line
    const losX = Math.round(W * 0.24 + (lineOfScrimmage - cameraYard) * pxPerYard);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(losX - 1, topY + 3, 3, fieldH - 3);

    if (firstDownLine <= 100) {
        const fdX = Math.round(W * 0.24 + (firstDownLine - cameraYard) * pxPerYard);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(fdX - 1, topY + 3, 3, fieldH - 3);
    }
}

function drawPassTrajectories(ctx, W, H) {
    if (gamePhase !== 'presnap' && gamePhase !== 'passing') return;

    const qbPos = yardToScreen(qb.yard, qb.laneY, W, H);
    receivers.forEach(r => {
        const flightTime = 0.48;
        const leadYard = Math.min(104, r.yard + r.speed * flightTime);
        const leadLaneY = Math.max(0.08, Math.min(0.92, r.laneY + (r.targetY - r.laneY) * 0.35));
        const targetPos = yardToScreen(leadYard, leadLaneY, W, H);

        // Dotted Retro Bowl trajectory dots
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        const steps = 8;
        for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const dx = qbPos.x + (targetPos.x - qbPos.x) * t;
            const dy = qbPos.y + (targetPos.y - qbPos.y) * t - Math.sin(t * Math.PI) * 14;
            ctx.fillRect(Math.round(dx), Math.round(dy), 3, 3);
        }

        // Target reticle box at catch point
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.round(targetPos.x - 6), Math.round(targetPos.y - 6), 12, 12);
    });
}

function drawRetroPlayer(ctx, W, H, yard, laneY, jerseyColor, helmetColor, animPhase, noteBadge, hasBall, isJuking = false) {
    const pos = yardToScreen(yard, laneY, W, H);
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    const s = Math.max(2, Math.round(H / 95)); // Pixel block unit

    // 1. Dark Oval Ground Shadow (Classic Retro Bowl look)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(x - 4 * s, y - s, 8 * s, 2 * s);

    const bob = Math.abs(Math.sin(animPhase)) * s;
    const legStride = Math.round(Math.sin(animPhase) * 2 * s);

    if (isJuking) {
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(x - 6 * s, y - 9 * s, 12 * s, 9 * s);
    }

    // 2. Pumping Pixel Legs & Cleats
    ctx.fillStyle = '#ffffff'; // Football pants
    ctx.fillRect(x - 3 * s + legStride, y - 4 * s, 2 * s, 3 * s);
    ctx.fillRect(x + 1 * s - legStride, y - 4 * s, 2 * s, 3 * s);
    ctx.fillStyle = '#0f172a'; // Cleats
    ctx.fillRect(x - 3 * s + legStride, y - 1 * s, 2 * s, 1 * s);
    ctx.fillRect(x + 1 * s - legStride, y - 1 * s, 2 * s, 1 * s);

    // 3. Blocky Shoulder Pads & Jersey
    ctx.fillStyle = jerseyColor;
    ctx.fillRect(x - 4 * s, y - 8 * s - bob, 8 * s, 4 * s);
    // White Jersey Number Stripe
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1 * s, y - 7 * s - bob, 2 * s, 2 * s);

    // Football tucked under arm if ball carrier
    if (hasBall) {
        ctx.fillStyle = '#92400e';
        ctx.fillRect(x + 2 * s, y - 7 * s - bob, 3 * s, 2 * s);
    }

    // 4. Retro Blocky Helmet & Facemask
    ctx.fillStyle = helmetColor;
    ctx.fillRect(x - 3 * s, y - 12 * s - bob, 6 * s, 4 * s);
    // Grey Facemask
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + 2 * s, y - 11 * s - bob, 2 * s, 2 * s);

    // 5. High-Contrast Note Badge above Receiver
    if (noteBadge) {
        const bw = 22;
        const bh = 18;
        const bx = x - Math.round(bw / 2);
        const by = y - 12 * s - bob - bh - 4;

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(bx, by, bw, bh);

        ctx.fillStyle = '#0f172a';
        ctx.font = '900 13px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(noteBadge, x, by + bh / 2 + 1);
    }
}

function drawRetroFootball(ctx, W, H, yard, laneY, height) {
    const pos = yardToScreen(yard, laneY, W, H);
    const x = Math.round(pos.x);
    const groundY = Math.round(pos.y);
    const ballY = Math.round(groundY - height);

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(x - 4, groundY - 2, 8, 3);

    // Pixel Leather Football + White Laces
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x - 5, ballY - 3, 10, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 2, ballY - 2, 4, 2);
}

function drawPatKickScene(ctx, W, H) {
    const boxW = Math.min(340, W * 0.68);
    const boxH = Math.min(115, H * 0.56);
    const bx = Math.round((W - boxW) / 2);
    const by = Math.round(H * 0.25);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, boxW, boxH);

    ctx.fillStyle = '#facc15';
    ctx.font = '900 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`EXTRA POINT KICK! PLAY "${patState.kickNote}" IN THE GREEN ZONE!`, W / 2, by + 18);

    // Kick Accuracy Meter Bar
    const barW = boxW - 40;
    const barH = 22;
    const barX = bx + 20;
    const barY = by + 34;

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(barX, barY, barW, barH);

    // Green Upright Sweet Spot
    const greenW = Math.round(barW * 0.34);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(Math.round(barX + (barW - greenW) / 2), barY, greenW, barH);

    // Sweeping White Cursor
    const cursorX = Math.round(barX + patState.cursor * barW);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cursorX - 3, barY - 4, 6, barH + 8);

    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`TARGET KICK NOTE: [ ${patState.kickNote} ] (ANY OCTAVE)`, W / 2, barY + barH + 20);
}

function drawRetroScoreboardHUD(ctx, W, H) {
    // Classic Retro Bowl Top Scoreboard Bar
    const hudH = 28;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, hudH);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, hudH, W, 2);

    ctx.font = '900 12px monospace';
    ctx.textBaseline = 'middle';

    // Left: Down & Distance + Yard Line
    ctx.textAlign = 'left';
    ctx.fillStyle = '#38bdf8';
    const toGo = Math.max(1, firstDownLine - lineOfScrimmage);
    const downStr = `${down}${getOrdinal(down)} & ${firstDownLine >= 100 ? 'GOAL' : toGo}`;
    ctx.fillText(`🏈 ${downStr}  |  BALL ON ${Math.round(lineOfScrimmage)}`, 10, hudH / 2);

    // Center: Action Prompt
    ctx.textAlign = 'center';
    if (gamePhase === 'presnap') {
        ctx.fillStyle = '#facc15';
        ctx.fillText('▶ PLAY ANY KEY TO SNAP!', W / 2, hudH / 2);
    } else if (gamePhase === 'passing') {
        const secsLeft = Math.max(0, maxPocketTime - pocketTimer).toFixed(1);
        ctx.fillStyle = secsLeft < 1.5 ? '#ef4444' : '#4ade80';
        ctx.fillText(`PASS! POCKET: ${secsLeft}s`, W / 2, hudH / 2);
    } else if (gamePhase === 'running') {
        ctx.fillStyle = '#22c55e';
        ctx.fillText(`RUN! TURBO NOTE: "${carrier.boostNote}"`, W / 2, hudH / 2);
    }

    // Right: Score & Multiplier
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`PTS: ${String(Math.floor(score)).padStart(5, '0')}  x${multiplier}  TD:${touchdowns}`, W - 10, hudH / 2);

    // Big Retro Play Callout Banner
    if (playBannerTimer > 0 && playBannerText) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '900 20px monospace';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(playBannerText, W / 2 + 2, H * 0.52 + 2);
        ctx.fillStyle = playBannerColor;
        ctx.fillText(playBannerText, W / 2, H * 0.52);
        ctx.restore();
    }
}
