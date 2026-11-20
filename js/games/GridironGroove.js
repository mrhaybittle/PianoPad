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
let lineOfScrimmage = 40;
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
let deepSafetySpawned = false;

const ball = {
    active: false,
    startYard: 0,
    startLaneY: 0.5,
    targetYard: 0,
    targetLaneY: 0.5,
    targetReceiverIdx: -1,
    progress: 0,
    duration: 0.48,
    yard: 0,
    laneY: 0.5,
    height: 0
};

let carrier = {
    active: false,
    yard: 40,
    laneY: 0.5,
    targetLaneY: 0.5,
    speed: 13.8,
    jukeTimer: 0,
    jukeCooldown: 0,
    boostTimer: 0,
    animPhase: 0,
    boostNote: 'G'
};

// Extra Point (PAT) End-of-Field Perspective Kick State
const patState = {
    cursor: 0.15,
    dir: 1,
    speed: 2.95,
    kickNote: 'C',
    kicked: false,
    ballProgress: 0,
    kickGood: false,
    kickOffset: 0, // -1 (far left) .. 0 (dead center) .. +1 (far right)
    usedTargetNote: false,
    resultShown: false
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
            osc.frequency.setValueAtTime(175, now);
            osc.frequency.exponentialRampToValueAtTime(640, now + 0.18);
            gain.gain.setValueAtTime(0.14, now);
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
            box-shadow: 0 0 0 4px #1d428a, 0 18px 40px rgba(0,0,0,0.85);
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
        <div style="background:#1d428a; border:2px solid #facc15; padding:10px; margin-bottom:14px;">
            <div style="font-size:12px; color:#93c5fd; font-weight:bold; letter-spacing:2px;">16-BIT RETRO BOWL EDITION</div>
            <h2 style="margin:4px 0 0 0; font-size:28px; color:#facc15; text-shadow: 3px 3px 0 #991b1b; letter-spacing:1px;">
                🏈 GRIDIRON GROOVE
            </h2>
        </div>

        <div style="background:#1e293b; border:2px solid #475569; padding:12px; text-align:left; font-size:13.5px; line-height:1.55; margin-bottom:14px;">
            <div style="margin-bottom:6px;"><span style="color:#facc15; font-weight:bold;">1. SNAP & PASS:</span> Play the <b>Note Letter</b> above an open Receiver (any octave) to throw!</div>
            <div style="margin-bottom:6px;"><span style="color:#38bdf8; font-weight:bold;">2. DODGE DEFENSE:</span> <b>Oct 1</b> = Top • <b>Oct 2</b> = Mid • <b>Oct 3</b> = Bottom</div>
            <div style="margin-bottom:6px;"><span style="color:#ec4899; font-weight:bold;">3. JUKE TACKLERS:</span> Tap <b>ANY Black Key</b> to juke past defenders!</div>
            <div><span style="color:#22c55e; font-weight:bold;">4. GOALPOST KICK:</span> Boot the ball between the uprights (Target Note = 2x Bonus)!</div>
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
    deepSafetySpawned = false;

    pocketTimer = 0;
    maxPocketTime = Math.max(3.4, 5.4 - (driveNumber - 1) * 0.35);

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

    // Full 8-Man Retro Bowl Defense: 2 Rushers, 2 Linebackers, 2 Cornerbacks, 2 Deep Safeties!
    const rushSpeed = 2.2 + driveNumber * 0.25;
    const lbSpeed = 12.2 + driveNumber * 0.35;
    const dbSpeed = 12.8 + driveNumber * 0.38;
    const safetySpeed = 13.4 + driveNumber * 0.38;

    defenders = [
        // Defensive Line (pass rushers)
        { role: 'rush',   yard: lineOfScrimmage + 1.5, laneY: 0.38, homeLaneY: 0.38, speed: rushSpeed,   chaseSpeed: lbSpeed * 0.94, animPhase: 0.2, stunned: 0, alertTimer: 0 },
        { role: 'rush',   yard: lineOfScrimmage + 1.5, laneY: 0.62, homeLaneY: 0.62, speed: rushSpeed,   chaseSpeed: lbSpeed * 0.94, animPhase: 1.7, stunned: 0, alertTimer: 0 },
        // Linebackers (short/mid zone patrol)
        { role: 'lb',     yard: lineOfScrimmage + 5.5, laneY: 0.32, homeLaneY: 0.32, speed: lbSpeed,     chaseSpeed: lbSpeed,        animPhase: 0.5, stunned: 0, alertTimer: 0 },
        { role: 'lb',     yard: lineOfScrimmage + 6.5, laneY: 0.68, homeLaneY: 0.68, speed: lbSpeed,     chaseSpeed: lbSpeed,        animPhase: 2.4, stunned: 0, alertTimer: 0 },
        // Cornerbacks (man/zone on outside receivers)
        { role: 'cb',     yard: lineOfScrimmage + 9.5, laneY: 0.20, homeLaneY: 0.20, speed: dbSpeed,     chaseSpeed: dbSpeed,        animPhase: 0.8, stunned: 0, alertTimer: 0, recIdx: 0 },
        { role: 'cb',     yard: lineOfScrimmage + 10.0, laneY: 0.80, homeLaneY: 0.80, speed: dbSpeed,    chaseSpeed: dbSpeed,        animPhase: 1.4, stunned: 0, alertTimer: 0, recIdx: 2 },
        // Deep Safeties (downfield secondary coverage so defense is always ahead after a catch!)
        { role: 'safety', yard: Math.min(98, lineOfScrimmage + 19), laneY: 0.30, homeLaneY: 0.30, speed: safetySpeed, chaseSpeed: safetySpeed, animPhase: 1.1, stunned: 0, alertTimer: 0 },
        { role: 'safety', yard: Math.min(99, lineOfScrimmage + 25), laneY: 0.70, homeLaneY: 0.70, speed: safetySpeed, chaseSpeed: safetySpeed, animPhase: 2.7, stunned: 0, alertTimer: 0 }
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

    // 1. PRE-SNAP: Any key snaps the ball
    if (gamePhase === 'presnap') {
        gamePhase = 'passing';
        playRetroSound('snap');
        bridge.highlightKey(noteStr, 180, '#facc15');
        triggerBanner('HIKE! HIT AN OPEN RECEIVER!', '#facc15', 1.1);
        return;
    }

    // 2. IN THE POCKET (PASSING): Match a Receiver's Note Letter to throw a spiral
    if (gamePhase === 'passing') {
        const targetIdx = receivers.findIndex(r => r.note === letter);
        if (targetIdx !== -1) {
            const rec = receivers[targetIdx];
            const flightTime = 0.46;
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
            qb.yard = Math.max(1, qb.yard - 1.5);
            pocketTimer = Math.max(0, pocketTimer - 0.65);
            playRetroSound('juke');
            bridge.highlightKey(noteStr, 180, '#ec4899');
            triggerBanner('POCKET STEP!', '#ec4899', 0.7);
        } else {
            bridge.highlightKey(noteStr, 140, '#ef4444');
        }
        return;
    }

    // 3. RUNNING AFTER CATCH: Octave 1/2/3 switches lanes, Black Key = Juke, Boost Note = Turbo
    if (gamePhase === 'running' && carrier.active) {
        if (octave <= 1) carrier.targetLaneY = 0.20;
        else if (octave === 2) carrier.targetLaneY = 0.50;
        else carrier.targetLaneY = 0.80;

        if (isSharp && carrier.jukeCooldown <= 0) {
            carrier.jukeTimer = 0.48;
            carrier.jukeCooldown = 1.0;
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

    // 4. EXTRA POINT KICK (PAT): Stop the fast-moving meter between the yellow uprights!
    if (gamePhase === 'pat' && !patState.kicked) {
        patState.kicked = true;
        patState.ballProgress = 0;
        patState.resultShown = false;
        patState.usedTargetNote = (!isSharp && letter === patState.kickNote);

        // Upright sweet spot is 0.39..0.61 (widens slightly to 0.36..0.64 when playing the target kick note!)
        const halfWindow = patState.usedTargetNote ? 0.14 : 0.11;
        patState.kickOffset = (patState.cursor - 0.5) / halfWindow; // -1..+1 inside posts, >1 or <-1 outside posts
        patState.kickGood = Math.abs(patState.kickOffset) <= 1.0;

        playRetroSound('kick');
        bridge.highlightKey(noteStr, 260, patState.kickGood ? '#22c55e' : '#ef4444');
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
        triggerEndGame('TURNOVER ON DOWNS!', bridge);
    }
}

function triggerTouchdown(bridge) {
    gamePhase = 'pat';
    carrier.active = false;
    touchdowns++;
    const earned = 500 * multiplier;
    score += earned;
    multiplier = Math.min(5, multiplier + 1);
    playRetroSound('touchdown');
    spawnPixelBurst(103, carrier.laneY, '#facc15', 24);
    triggerBanner(`TOUCHDOWN!! +${earned} PTS`, '#facc15', 1.4);

    // Fast-moving Retro Bowl PAT Kick Meter
    patState.cursor = Math.random() < 0.5 ? 0.12 : 0.88;
    patState.dir = patState.cursor < 0.5 ? 1 : -1;
    patState.speed = 2.95 + driveNumber * 0.28;
    patState.kickNote = SCALE_LETTERS[Math.floor(Math.random() * SCALE_LETTERS.length)];
    patState.kicked = false;
    patState.ballProgress = 0;
    patState.kickGood = false;
    patState.kickOffset = 0;
    patState.usedTargetNote = false;
    patState.resultShown = false;
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
            `<span style="font-size:0.85rem; color:#93c5fd;">🏈 TDs: ${touchdowns}  •  🥅 PATs: ${fieldGoals}  •  🏆 Best: ${bestScore}</span>`,
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

        receivers.forEach(r => {
            r.animPhase += dt * 14;
            r.yard = Math.min(106, r.yard + r.speed * dt);
            if (r.yard >= r.breakYard) {
                r.laneY += (r.targetY - r.laneY) * Math.min(1, dt * 3.2);
            }
        });

        defenders.forEach(d => {
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
            } else if (d.role === 'cb') {
                const targetRec = receivers[d.recIdx];
                if (targetRec) {
                    const desiredYard = targetRec.yard + 1.4;
                    d.yard += (desiredYard - d.yard) * Math.min(1, dt * 3.8);
                    d.laneY += (targetRec.laneY - d.laneY) * Math.min(1, dt * 2.8);
                }
            } else if (d.role === 'lb') {
                // Linebackers drop into mid-zone coverage
                const desiredYard = lineOfScrimmage + 7.5;
                d.yard += (desiredYard - d.yard) * Math.min(1, dt * 2.2);
                const midRec = receivers[1];
                if (midRec) {
                    d.laneY += ((d.homeLaneY * 0.6 + midRec.laneY * 0.4) - d.laneY) * Math.min(1, dt * 2.0);
                }
            } else if (d.role === 'safety') {
                // Deep safeties backpedal & read the QB's eyes
                const leadRec = receivers.reduce((best, r) => (r.yard > best.yard ? r : best), receivers[0]);
                const desiredYard = Math.min(99, Math.max(d.yard, leadRec.yard + 8.5));
                d.yard += (desiredYard - d.yard) * Math.min(1, dt * 2.4);
                d.laneY += ((d.homeLaneY * 0.65 + leadRec.laneY * 0.35) - d.laneY) * Math.min(1, dt * 1.8);
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

        // Defenders react to the ball in the air and converge on the target spot!
        defenders.forEach(d => {
            d.animPhase += dt * 14;
            if (d.role === 'cb' || d.role === 'lb' || d.role === 'safety') {
                const dx = ball.targetYard - d.yard;
                const dy = (ball.targetLaneY - d.laneY) * 18;
                const dist = Math.hypot(dx, dy) || 1;
                const reactSpeed = d.chaseSpeed * 0.72;
                d.yard += (dx / dist) * reactSpeed * dt;
                d.laneY += ((ball.targetLaneY - d.laneY) / Math.max(0.18, Math.abs(ball.targetLaneY - d.laneY))) * 0.28 * dt;
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
            const interceptingDb = defenders.find(d => d.role !== 'rush' && Math.hypot(d.yard - ball.yard, (d.laneY - ball.laneY) * 18) < 1.45);

            if (interceptingDb && Math.random() < 0.42) {
                shakeTimer = 0.35;
                spawnPixelBurst(ball.yard, ball.laneY, '#ef4444', 18);
                triggerEndGame('INTERCEPTED!', bridge);
            } else if (rec && Math.hypot(rec.yard - ball.yard, (rec.laneY - ball.laneY) * 18) < 4.5) {
                carrier.active = true;
                carrier.yard = rec.yard;
                carrier.laneY = rec.laneY;
                carrier.targetLaneY = rec.laneY;
                carrier.speed = 13.8 + driveNumber * 0.32;
                carrier.jukeTimer = 0;
                carrier.jukeCooldown = 0;
                carrier.boostTimer = 0;
                carrier.animPhase = 0;

                // Alert all defenders to pursue the ball carrier!
                defenders.forEach(d => {
                    d.alertTimer = 0.65;
                });

                // Ensure at least one downfield safety is ahead if catch was made deep
                const aheadDefenders = defenders.filter(d => d.yard > carrier.yard + 3);
                if (aheadDefenders.length === 0 && carrier.yard < 90) {
                    defenders.push({
                        role: 'safety',
                        yard: Math.min(98, carrier.yard + 15),
                        laneY: carrier.laneY > 0.5 ? 0.32 : 0.68,
                        homeLaneY: 0.5,
                        speed: 13.6 + driveNumber * 0.35,
                        chaseSpeed: 13.6 + driveNumber * 0.35,
                        animPhase: 0.4,
                        stunned: 0,
                        alertTimer: 0.7
                    });
                }

                const openBonus = interceptingDb ? 50 : 125;
                score += openBonus * multiplier;
                playRetroSound('catch');
                spawnPixelBurst(carrier.yard, carrier.laneY, '#22c55e', 12);
                triggerBanner(interceptingDb ? 'CONTESTED CATCH!' : `CAUGHT! DODGE THE DEFENSE!`, '#22c55e', 0.9);
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

        // Spawn a last-line Free Safety on long breakaways past midfield
        if (!deepSafetySpawned && carrier.yard > lineOfScrimmage + 22 && carrier.yard < 88) {
            deepSafetySpawned = true;
            defenders.push({
                role: 'safety',
                yard: Math.min(98, carrier.yard + 17),
                laneY: carrier.laneY,
                homeLaneY: 0.5,
                speed: 13.9 + driveNumber * 0.35,
                chaseSpeed: 13.9 + driveNumber * 0.35,
                animPhase: 0,
                stunned: 0,
                alertTimer: 0.75
            });
        }

        if (carrier.yard >= 100) {
            triggerTouchdown(bridge);
        } else {
            // ALL defenders pursue the ball carrier with smart pursuit angles!
            for (const d of defenders) {
                if (d.alertTimer > 0) d.alertTimer = Math.max(0, d.alertTimer - dt);
                if (d.stunned > 0) {
                    d.stunned = Math.max(0, d.stunned - dt);
                    continue;
                }
                d.animPhase += dt * 16;

                // Defenders ahead of the carrier aim slightly in front to cut off the angle
                const aimYard = d.yard > carrier.yard ? carrier.yard + 2.2 : carrier.yard;
                const dx = aimYard - d.yard;
                const dy = (carrier.laneY - d.laneY) * 18;
                const dist = Math.hypot(dx, dy) || 1;

                const speed = d.chaseSpeed || (12.8 + driveNumber * 0.35);
                d.yard += (dx / dist) * speed * dt;
                const laneDiff = carrier.laneY - d.laneY;
                if (Math.abs(laneDiff) > 0.01) {
                    d.laneY += Math.sign(laneDiff) * Math.min(Math.abs(laneDiff), 0.52 * dt);
                }

                const tackleDist = Math.hypot(carrier.yard - d.yard, (carrier.laneY - d.laneY) * 18);
                if (tackleDist < 1.38) {
                    if (carrier.jukeTimer > 0) {
                        d.stunned = 1.45;
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
            if (patState.cursor >= 0.94) { patState.cursor = 0.94; patState.dir = -1; }
            if (patState.cursor <= 0.06) { patState.cursor = 0.06; patState.dir = 1; }
        } else {
            patState.ballProgress += dt * 1.15;

            // Show GOOD / WIDE banner right as the ball reaches the uprights (progress ~0.82)
            if (patState.ballProgress >= 0.82 && !patState.resultShown) {
                patState.resultShown = true;
                if (patState.kickGood) {
                    fieldGoals++;
                    const patPts = (patState.usedTargetNote ? 300 : 150) * multiplier;
                    score += patPts;
                    playRetroSound('touchdown');
                    triggerBanner(
                        patState.usedTargetNote ? `PERFECT NOTE KICK!! +${patPts}` : `EXTRA POINT IS GOOD!! +${patPts}`,
                        '#22c55e',
                        1.35
                    );
                } else {
                    playRetroSound('tackle');
                    const wideSide = patState.kickOffset < 0 ? 'WIDE LEFT!' : 'WIDE RIGHT!';
                    triggerBanner(`NO GOOD — ${wideSide}`, '#ef4444', 1.35);
                }
            }

            if (patState.ballProgress >= 1.25) {
                gamePhase = 'playover';
                setTimeout(() => {
                    if (bridge.getActiveMiniGame() !== 'gridironGroove') return;
                    driveNumber++;
                    down = 1;
                    lineOfScrimmage = 35;
                    firstDownLine = 45;
                    setupNextPlay();
                    gamePhase = 'presnap';
                }, 900);
            }
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.yard += pt.vYard * dt;
        pt.laneY += pt.vLaneY * dt;
        pt.life -= dt * 2.4;
        if (pt.life <= 0) particles.splice(i, 1);
    }

    // --- RENDER AUTHENTIC RETRO BOWL 16-BIT PIXEL GRAPHICS ---
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

    if (gamePhase === 'pat') {
        // Dedicated End-of-Field Perspective View looking straight at the Goalposts!
        drawEndZonePatPerspective(ctx, W, H, now);
    } else {
        drawRetroBowlStadiumAndField(ctx, W, H, now);
        drawRetroPassTrajectories(ctx, W, H);

        // Depth-sort all sprites by laneY (painter's algorithm)
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
                drawRetroBowlSprite(ctx, W, H, sp.yard, sp.laneY, '#234d9e', '#facc15', '#ffffff', sp.anim, null, false);
            } else if (sp.kind === 'wr') {
                drawRetroBowlSprite(ctx, W, H, sp.yard, sp.laneY, '#234d9e', '#facc15', '#ffffff', sp.anim, sp.data.note, false);
            } else if (sp.kind === 'carrier') {
                drawRetroBowlSprite(
                    ctx, W, H, sp.yard, sp.laneY,
                    carrier.boostTimer > 0 ? '#16a34a' : '#234d9e',
                    '#facc15', '#ffffff', sp.anim, null, true, carrier.jukeTimer > 0
                );
            } else if (sp.kind === 'def') {
                const badge = sp.data.alertTimer > 0 ? '!' : null;
                drawRetroBowlSprite(
                    ctx, W, H, sp.yard, sp.laneY,
                    sp.data.stunned > 0 ? '#64748b' : '#b91c1c',
                    '#e2e8f0', '#facc15', sp.anim, badge, false, false, true
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

// =========================================================================
// END-OF-FIELD PERSPECTIVE EXTRA POINT (PAT) VIEW (Looking straight at posts)
// =========================================================================
function drawEndZonePatPerspective(ctx, W, H, now) {
    const hudH = 24;
    const standsH = Math.max(24, Math.round(H * 0.13));
    const wallY = hudH + standsH;
    const fieldTopY = wallY + 6;
    const footerH = 16;
    const fieldBottomY = H - footerH;
    const fieldH = fieldBottomY - fieldTopY;

    // 1. Stadium Stands Behind the Endzone
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, hudH, W, standsH);
    for (let row = 0; row < 3; row++) {
        const ry = hudH + Math.floor((standsH / 3) * row);
        ctx.fillStyle = row % 2 === 0 ? '#475569' : '#334155';
        ctx.fillRect(0, ry, W, Math.ceil(standsH / 3));

        const fanPalette = ['#234d9e', '#facc15', '#ffffff', '#dc2626', '#38bdf8', '#4ade80'];
        for (let fx = (row * 4) + 2; fx < W; fx += 7) {
            const cheer = Math.floor(Math.sin(now / 130 + fx * 0.3 + row) * 1.6);
            ctx.fillStyle = fanPalette[(fx + row * 3) % fanPalette.length];
            ctx.fillRect(fx, ry + 2 + cheer, 4, 4);
            ctx.fillStyle = '#fed7aa';
            ctx.fillRect(fx + 1, ry + cheer, 2, 2);
        }
    }

    // 2. Red Brick Back Wall & GGtv Signs
    ctx.fillStyle = '#8b261d';
    ctx.fillRect(0, wallY, W, 6);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, wallY, W, 1);

    for (let sx = 45; sx < W; sx += 180) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(sx, wallY - 4, 32, 8);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, wallY - 4, 32, 8);
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GGtv', sx + 16, wallY + 2);
    }

    // 3. Outer Lime-Green Sideline Apron
    ctx.fillStyle = '#659d32';
    ctx.fillRect(0, fieldTopY, W, fieldH);

    // 4. 3D Perspective Trapezoid Looking Directly at the Shorter End of the Field
    const topLeftX = Math.round(W * 0.22);
    const topRightX = Math.round(W * 0.78);
    const botLeftX = Math.round(W * 0.04);
    const botRightX = Math.round(W * 0.96);

    const lerpX = (t, side) => {
        const l = topLeftX + (botLeftX - topLeftX) * t;
        const r = topRightX + (botRightX - topRightX) * t;
        return side === 'left' ? l : r;
    };

    // Alternating Green Yard Bands (from Goal Line at t=0.24 down to Kick Spot at t=1.0)
    const bands = 6;
    for (let b = 0; b < bands; b++) {
        const t0 = 0.24 + (0.76 * b) / bands;
        const t1 = 0.24 + (0.76 * (b + 1)) / bands;
        const y0 = Math.round(fieldTopY + fieldH * t0);
        const y1 = Math.round(fieldTopY + fieldH * t1);

        ctx.fillStyle = b % 2 === 0 ? '#4e7a27' : '#57872c';
        ctx.beginPath();
        ctx.moveTo(lerpX(t0, 'left'), y0);
        ctx.lineTo(lerpX(t0, 'right'), y0);
        ctx.lineTo(lerpX(t1, 'right'), y1);
        ctx.lineTo(lerpX(t1, 'left'), y1);
        ctx.closePath();
        ctx.fill();

        // White horizontal yard stripe
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(Math.round(lerpX(t0, 'left')), y0, Math.round(lerpX(t0, 'right') - lerpX(t0, 'left')), 2);
    }

    // Royal Blue Endzone Box at the far end (t = 0.0 to t = 0.24)
    const ezTopY = fieldTopY;
    const ezBotY = Math.round(fieldTopY + fieldH * 0.24);
    ctx.fillStyle = '#214999';
    ctx.beginPath();
    ctx.moveTo(topLeftX, ezTopY);
    ctx.lineTo(topRightX, ezTopY);
    ctx.lineTo(lerpX(0.24, 'right'), ezBotY);
    ctx.lineTo(lerpX(0.24, 'left'), ezBotY);
    ctx.closePath();
    ctx.fill();

    // Painted "GROOVE" Endzone Lettering
    ctx.fillStyle = 'rgba(250, 204, 21, 0.78)';
    ctx.font = `900 ${Math.max(14, Math.round(fieldH * 0.11))}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GROOVE', W / 2, Math.round((ezTopY + ezBotY) / 2) + 2);

    // Crisp White Sidelines, Back Endline & Goal Line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(topLeftX, ezTopY);
    ctx.lineTo(botLeftX, fieldBottomY);
    ctx.moveTo(topRightX, ezTopY);
    ctx.lineTo(botRightX, fieldBottomY);
    ctx.moveTo(topLeftX, ezTopY);
    ctx.lineTo(topRightX, ezTopY);
    ctx.moveTo(lerpX(0.24, 'left'), ezBotY);
    ctx.lineTo(lerpX(0.24, 'right'), ezBotY);
    ctx.stroke();

    // Perspective Hash Marks running down the center of the field
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let hStep = 1; hStep < 14; hStep++) {
        const ht = 0.24 + (0.76 * hStep) / 14;
        const hy = Math.round(fieldTopY + fieldH * ht);
        const span = lerpX(ht, 'right') - lerpX(ht, 'left');
        ctx.fillRect(Math.round(W / 2 - span * 0.14), hy, 4, 2);
        ctx.fillRect(Math.round(W / 2 + span * 0.14 - 4), hy, 4, 2);
    }

    // 4 Orange Endzone Corner Pylons
    ctx.fillStyle = '#f97316';
    ctx.fillRect(topLeftX - 2, ezTopY - 4, 4, 6);
    ctx.fillRect(topRightX - 2, ezTopY - 4, 4, 6);
    ctx.fillRect(Math.round(lerpX(0.24, 'left')) - 2, ezBotY - 4, 5, 6);
    ctx.fillRect(Math.round(lerpX(0.24, 'right')) - 3, ezBotY - 4, 5, 6);

    // 5. TALL RETRO BOWL YELLOW H-GOALPOST ON THE BACK ENDLINE
    const postCenterX = Math.round(W / 2);
    const postHalfW = Math.round((topRightX - topLeftX) * 0.145);
    const leftPostX = postCenterX - postHalfW;
    const rightPostX = postCenterX + postHalfW;
    const crossbarY = ezTopY - 12;
    const postTopY = Math.max(hudH + 4, crossbarY - Math.round(H * 0.15));

    const drawGoalpost = () => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(postCenterX - 3, crossbarY, 6, ezTopY - crossbarY + 2);
        ctx.fillRect(leftPostX - 3, crossbarY - 1, postHalfW * 2 + 6, 5);
        ctx.fillRect(leftPostX - 3, postTopY, 5, crossbarY - postTopY + 3);
        ctx.fillRect(rightPostX - 2, postTopY, 5, crossbarY - postTopY + 3);

        ctx.fillStyle = '#facc15';
        ctx.fillRect(postCenterX - 2, crossbarY, 4, ezTopY - crossbarY + 1); // Stanchion
        ctx.fillRect(leftPostX - 2, crossbarY, postHalfW * 2 + 4, 3); // Crossbar
        ctx.fillRect(leftPostX - 2, postTopY, 3, crossbarY - postTopY + 2); // Left Upright
        ctx.fillRect(rightPostX - 1, postTopY, 3, crossbarY - postTopY + 2); // Right Upright
    };

    // 6. PIXEL HOLDER & KICKER IN FOREGROUND
    const kickSpotX = Math.round(W / 2);
    const kickSpotY = fieldBottomY - 18;

    // Holder kneeling
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(kickSpotX - 12, kickSpotY + 2, 12, 3);
    ctx.fillStyle = '#234d9e';
    ctx.fillRect(kickSpotX - 10, kickSpotY - 8, 8, 9);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(kickSpotX - 9, kickSpotY - 13, 6, 5);

    // Kicker stepping through
    const kickerOffset = patState.kicked ? 0 : Math.round(Math.sin(now / 90) * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(kickSpotX + 6 + kickerOffset, kickSpotY + 4, 12, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(kickSpotX + 8 + kickerOffset, kickSpotY - 2, 6, 6);
    ctx.fillStyle = '#234d9e';
    ctx.fillRect(kickSpotX + 7 + kickerOffset, kickSpotY - 11, 9, 9);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(kickSpotX + 8 + kickerOffset, kickSpotY - 17, 7, 6);

    // 7. KICK AIMING METER (Aligned directly with the Goalpost Uprights!)
    if (!patState.kicked) {
        const meterHalfW = Math.round(postHalfW * 3.8);
        const meterX = postCenterX - meterHalfW;
        const meterW = meterHalfW * 2;
        const meterY = Math.round(fieldTopY + fieldH * 0.56);
        const meterH = 18;

        // Backing frame
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(meterX - 3, meterY - 3, meterW + 6, meterH + 6);

        // Red outer miss zones
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(meterX, meterY, meterW, meterH);

        // Green sweet spot matching the exact width of the yellow uprights!
        const halfWindow = 0.125;
        const greenW = Math.round(meterW * halfWindow * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(postCenterX - Math.round(greenW / 2), meterY, greenW, meterH);

        // Dotted alignment guides up to the two yellow uprights
        ctx.fillStyle = 'rgba(250, 204, 21, 0.55)';
        for (let gy = crossbarY + 6; gy < meterY - 4; gy += 6) {
            ctx.fillRect(leftPostX, gy, 2, 3);
            ctx.fillRect(rightPostX, gy, 2, 3);
        }

        // Fast-moving white cursor bar
        const curX = Math.round(meterX + patState.cursor * meterW);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(curX - 3, meterY - 5, 6, meterH + 10);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(curX - 3, meterY - 5, 6, meterH + 10);

        // Target Note Prompt Pill
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(postCenterX - 155, meterY + meterH + 10, 310, 22);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(postCenterX - 155, meterY + meterH + 10, 310, 22);

        ctx.fillStyle = '#facc15';
        ctx.font = '900 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`PLAY "${patState.kickNote}" (OR ANY KEY) TO KICK!`, postCenterX, meterY + meterH + 21);

        drawGoalpost();
    } else {
        // 8. 3D PERSPECTIVE BALL FLIGHT THROUGH OR WIDE OF THE UPRIGHTS!
        const t = Math.min(1.25, patState.ballProgress);
        const destX = postCenterX + patState.kickOffset * postHalfW;
        const destY = Math.round((postTopY + crossbarY) * 0.48);

        const bx = Math.round(kickSpotX + (destX - kickSpotX) * Math.min(1.08, t));
        // High kicking arc from foreground up through the uprights
        const linearY = kickSpotY + (destY - kickSpotY) * t;
        const arcLift = Math.sin(Math.min(1, t) * Math.PI) * (fieldH * 0.34);
        const by = Math.round(linearY - arcLift);

        // Ground shadow shrinking down the turf
        const shadowY = Math.round(kickSpotY + (ezTopY - kickSpotY) * Math.min(1, t));
        const bScale = Math.max(0.42, 1.25 - t * 0.78);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(bx - Math.round(5 * bScale), shadowY - 2, Math.round(10 * bScale), 3);

        const drawKickedBall = () => {
            const bw = Math.max(5, Math.round(10 * bScale));
            const bh = Math.max(4, Math.round(7 * bScale));
            ctx.fillStyle = '#78350f';
            ctx.fillRect(bx - Math.round(bw / 2), by - Math.round(bh / 2), bw, bh);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(bx - Math.max(1, Math.round(bw * 0.2)), by - Math.round(bh / 2) + 1, Math.max(2, Math.round(bw * 0.4)), 2);
        };

        // Layer ball in front of goalpost until it passes the plane of the uprights (t >= 0.82)
        if (t < 0.82) {
            drawGoalpost();
            drawKickedBall();
        } else {
            drawKickedBall();
            drawGoalpost();
        }
    }

    // Footer bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, H - footerH, W, footerH);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(`EXTRA POINT ATTEMPT  •  TARGET NOTE "${patState.kickNote}" = 2X KICK BONUS`, W / 2, H - 4);
}

// =========================================================================
// MAIN SIDE-SCROLLING RETRO BOWL STADIUM & FIELD
// =========================================================================
function getFieldLayout(W, H) {
    const hudH = 24;
    const standsH = Math.max(22, Math.round(H * 0.12));
    const topApronH = Math.max(12, Math.round(H * 0.06));
    const botApronH = Math.max(12, Math.round(H * 0.06));
    const footerH = 14;

    const standsTop = hudH;
    const wallY = standsTop + standsH;
    const topApronY = wallY + 4;
    const fieldTopY = topApronY + topApronH;
    const fieldBottomY = H - footerH - botApronH;
    const fieldH = Math.max(60, fieldBottomY - fieldTopY);
    const pxPerYard = Math.max(15, W / 27);

    return { hudH, standsTop, standsH, wallY, topApronY, topApronH, fieldTopY, fieldBottomY, fieldH, botApronH, footerH, pxPerYard };
}

function yardToScreen(yard, laneY, W, H) {
    const L = getFieldLayout(W, H);
    const x = W * 0.24 + (yard - cameraYard) * L.pxPerYard;
    const y = L.fieldTopY + 8 + laneY * (L.fieldH - 16);
    return { x, y, ...L };
}

function drawRetroBowlStadiumAndField(ctx, W, H, now) {
    const L = getFieldLayout(W, H);
    const isSnowBowl = driveNumber >= 3 && driveNumber % 2 === 1;

    // 1. Multi-Tiered Crowd Stands
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, L.standsTop, W, L.standsH);

    for (let row = 0; row < 3; row++) {
        const ry = L.standsTop + Math.floor((L.standsH / 3) * row);
        ctx.fillStyle = row % 2 === 0 ? '#475569' : '#334155';
        ctx.fillRect(0, ry, W, Math.ceil(L.standsH / 3));

        const fanPalette = ['#234d9e', '#facc15', '#ffffff', '#dc2626', '#38bdf8', '#4ade80'];
        for (let fx = (row * 4) + 2; fx < W; fx += 7) {
            const cheer = Math.floor(Math.sin(now / 160 + fx * 0.3 + row) * 1.4);
            ctx.fillStyle = fanPalette[(fx + row * 3) % fanPalette.length];
            ctx.fillRect(fx, ry + 2 + cheer, 4, 4);
            ctx.fillStyle = '#fed7aa';
            ctx.fillRect(fx + 1, ry + cheer, 2, 2);
        }
    }

    // 2. Red Brick Wall & GGtv Broadcast Boards
    ctx.fillStyle = '#8b261d';
    ctx.fillRect(0, L.wallY, W, 5);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, L.wallY, W, 1);

    for (let sx = 35; sx < W; sx += 165) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(sx, L.wallY - 4, 30, 8);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, L.wallY - 4, 30, 8);
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GGtv', sx + 15, L.wallY + 2);
    }

    // 3. Outer Bright Grass Apron
    const apronGreen = isSnowBowl ? '#cbd5e1' : '#659d32';
    ctx.fillStyle = apronGreen;
    ctx.fillRect(0, L.topApronY, W, L.topApronH);
    ctx.fillRect(0, L.fieldBottomY, W, L.botApronH);

    for (let cx = 24; cx < W; cx += 68) {
        const pY = L.topApronY + Math.max(2, L.topApronH - 8);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(cx - 1, pY + 5, 6, 2);
        ctx.fillStyle = (cx % 136 === 24) ? '#facc15' : '#1e293b';
        ctx.fillRect(cx, pY, 4, 5);
        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(cx + 1, pY - 2, 2, 2);

        const bY = L.fieldBottomY + 3;
        ctx.fillStyle = '#334155';
        ctx.fillRect(cx + 28, bY, 4, 4);
        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(cx + 29, bY - 2, 2, 2);
    }

    // 4. Two-Tone Turf & Royal Blue Endzones
    const turfDark = isSnowBowl ? '#dce7ec' : '#4e7a27';
    const turfLight = isSnowBowl ? '#e7f0f4' : '#57872c';
    const endzoneBlue = '#214999';

    const startYard = Math.floor((cameraYard - 10) / 5) * 5;
    const endYard = Math.ceil((cameraYard + 32) / 5) * 5;

    const upperHashY = Math.round(L.fieldTopY + L.fieldH * 0.34);
    const lowerHashY = Math.round(L.fieldTopY + L.fieldH * 0.66);

    for (let y = startYard; y <= endYard; y += 5) {
        const leftX = Math.round(W * 0.24 + (y - cameraYard) * L.pxPerYard);
        const stripW = Math.ceil(5 * L.pxPerYard);

        if (y < 0 || y >= 100) {
            ctx.fillStyle = endzoneBlue;
        } else {
            ctx.fillStyle = (Math.floor(y / 5) % 2 === 0) ? turfDark : turfLight;
        }
        ctx.fillRect(leftX, L.fieldTopY, stripW, L.fieldH);

        if (y >= 0 && y <= 100) {
            ctx.fillStyle = isSnowBowl ? '#64748b' : 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(leftX, L.fieldTopY, y === 0 || y === 100 || y === 50 ? 3 : 2, L.fieldH);

            if (y < 100) {
                for (let sub = 1; sub <= 4; sub++) {
                    const tickX = Math.round(leftX + (sub * L.pxPerYard));
                    ctx.fillRect(tickX, L.fieldTopY + 3, 1, 3);
                    ctx.fillRect(tickX, upperHashY, 1, 3);
                    ctx.fillRect(tickX, lowerHashY, 1, 3);
                    ctx.fillRect(tickX, L.fieldBottomY - 6, 1, 3);
                }
            }

            if (y === 25 || y === 75) {
                ctx.fillStyle = isSnowBowl ? 'rgba(33, 73, 153, 0.45)' : 'rgba(255, 255, 255, 0.42)';
                ctx.font = '900 10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('G·G', leftX, L.fieldTopY + 14);
                ctx.fillText('G·G', leftX, L.fieldBottomY - 6);
            }

            if (y > 0 && y < 100 && y % 10 === 0) {
                const numVal = y <= 50 ? y : 100 - y;
                const arrowLeft = y < 50;
                const arrowRight = y > 50;
                const labelText = arrowLeft ? `◀${numVal}` : (arrowRight ? `${numVal}▶` : `${numVal}`);

                const fontSize = Math.max(10, Math.round(L.fieldH * 0.13));
                ctx.fillStyle = isSnowBowl ? 'rgba(30, 41, 59, 0.65)' : 'rgba(255, 255, 255, 0.78)';
                ctx.font = `900 ${fontSize}px monospace`;
                ctx.textAlign = 'center';

                ctx.fillText(labelText, leftX, lowerHashY + fontSize + 4);

                ctx.save();
                ctx.translate(leftX, upperHashY - fontSize - 2);
                ctx.rotate(Math.PI);
                ctx.fillText(labelText, 0, 0);
                ctx.restore();
            }
        }
    }

    // 5. Endzone Text, Orange Pylons & Yellow Goalposts
    const goalLineX = Math.round(W * 0.24 + (100 - cameraYard) * L.pxPerYard);
    const backEndlineX = Math.round(W * 0.24 + (110 - cameraYard) * L.pxPerYard);

    if (goalLineX < W + 60) {
        const ezCenterX = Math.round((goalLineX + backEndlineX) / 2);
        ctx.save();
        ctx.translate(ezCenterX, L.fieldTopY + L.fieldH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.72)';
        ctx.font = `900 ${Math.max(14, Math.round(L.fieldH * 0.19))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GROOVE', 0, 0);
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(backEndlineX, L.fieldTopY, 3, L.fieldH);

        ctx.fillStyle = '#f97316';
        ctx.fillRect(goalLineX - 2, L.fieldTopY - 3, 4, 5);
        ctx.fillRect(goalLineX - 2, L.fieldBottomY - 1, 4, 5);
        ctx.fillRect(backEndlineX - 1, L.fieldTopY - 3, 4, 5);
        ctx.fillRect(backEndlineX - 1, L.fieldBottomY - 1, 4, 5);

        const gpMidY = Math.round(L.fieldTopY + L.fieldH * 0.5);
        const postHalfSpan = Math.round(L.fieldH * 0.18);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(backEndlineX, gpMidY - postHalfSpan, 3, postHalfSpan * 2);
        ctx.fillRect(backEndlineX - 12, gpMidY - postHalfSpan, 14, 3);
        ctx.fillRect(backEndlineX - 12, gpMidY + postHalfSpan - 3, 14, 3);
        ctx.fillRect(backEndlineX + 3, gpMidY - 2, 8, 4);
    }

    // 6. Sideline Borders
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, L.fieldTopY, W, 3);
    ctx.fillRect(0, L.fieldBottomY - 2, W, 3);

    // 7. Line of Scrimmage & First-Down Marker
    const losX = Math.round(W * 0.24 + (lineOfScrimmage - cameraYard) * L.pxPerYard);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(losX - 1, L.fieldTopY + 3, 3, L.fieldH - 5);

    if (firstDownLine <= 100) {
        const fdX = Math.round(W * 0.24 + (firstDownLine - cameraYard) * L.pxPerYard);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(fdX - 1, L.fieldTopY + 3, 3, L.fieldH - 5);

        ctx.fillStyle = '#f97316';
        ctx.fillRect(fdX - 5, L.fieldTopY - 9, 10, 8);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(down), fdX, L.fieldTopY - 3);
    }

    // 8. Bottom Control Bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, H - L.footerH, W, L.footerH);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText('OCT 1 = TOP LANE  •  OCT 2 = MID LANE  •  OCT 3 = BOT LANE  •  BLACK KEY = JUKE', W / 2, H - 3);
}

function drawRetroPassTrajectories(ctx, W, H) {
    if (gamePhase !== 'presnap' && gamePhase !== 'passing') return;

    const qbPos = yardToScreen(qb.yard, qb.laneY, W, H);
    receivers.forEach(r => {
        const flightTime = 0.46;
        const leadYard = Math.min(104, r.yard + r.speed * flightTime);
        const leadLaneY = Math.max(0.08, Math.min(0.92, r.laneY + (r.targetY - r.laneY) * 0.35));
        const targetPos = yardToScreen(leadYard, leadLaneY, W, H);

        ctx.fillStyle = '#ffffff';
        const steps = 9;
        for (let s = 1; s < steps; s++) {
            const t = s / steps;
            const dx = qbPos.x + (targetPos.x - qbPos.x) * t;
            const dy = qbPos.y + (targetPos.y - qbPos.y) * t - Math.sin(t * Math.PI) * 14;
            ctx.fillRect(Math.round(dx) - 1, Math.round(dy) - 1, 3, 3);
        }

        const tx = Math.round(targetPos.x);
        const ty = Math.round(targetPos.y);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(tx - 6, ty - 4, 12, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(tx - 1, ty - 1, 2, 2);
    });
}

function drawRetroBowlSprite(ctx, W, H, yard, laneY, jerseyColor, helmetColor, pantsColor, animPhase, noteBadge, hasBall, isJuking = false, isAlertBadge = false) {
    const pos = yardToScreen(yard, laneY, W, H);
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    const s = Math.max(2, Math.round(H / 98));

    // 1. Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(x - 4 * s, y - s, 8 * s, 2 * s);
    ctx.fillRect(x - 3 * s, y - s - 1, 6 * s, 2 * s + 2);

    const bob = Math.abs(Math.sin(animPhase)) * s;
    const stride = Math.round(Math.sin(animPhase) * 2 * s);

    if (isJuking) {
        ctx.fillStyle = 'rgba(236, 72, 153, 0.55)';
        ctx.fillRect(x - 6 * s, y - 11 * s, 12 * s, 11 * s);
    }

    // 2. Legs, Socks & Cleats
    ctx.fillStyle = pantsColor;
    ctx.fillRect(x - 3 * s + stride, y - 5 * s, 2 * s, 3 * s);
    ctx.fillRect(x + 1 * s - stride, y - 5 * s, 2 * s, 3 * s);

    ctx.fillStyle = jerseyColor;
    ctx.fillRect(x - 3 * s + stride, y - 2 * s, 2 * s, s);
    ctx.fillRect(x + 1 * s - stride, y - 2 * s, 2 * s, s);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x - 3 * s + stride, y - s, 3 * s, s);
    ctx.fillRect(x + 1 * s - stride, y - s, 3 * s, s);

    // 3. Shoulder Pads & Jersey
    ctx.fillStyle = jerseyColor;
    ctx.fillRect(x - 4 * s, y - 9 * s - bob, 8 * s, 4 * s);
    ctx.fillStyle = helmetColor;
    ctx.fillRect(x - 4 * s, y - 9 * s - bob, 2 * s, 2 * s);
    ctx.fillRect(x + 2 * s, y - 9 * s - bob, 2 * s, 2 * s);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - s, y - 8 * s - bob, 2 * s, 2 * s);

    if (hasBall) {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(x + 2 * s, y - 8 * s - bob, 4 * s, 2 * s);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 3 * s, y - 8 * s - bob, 2 * s, s);
    }

    // 4. Helmet & Facemask
    ctx.fillStyle = helmetColor;
    ctx.fillRect(x - 3 * s, y - 13 * s - bob, 6 * s, 4 * s);
    ctx.fillRect(x - 2 * s, y - 14 * s - bob, 4 * s, s);
    ctx.fillStyle = jerseyColor;
    ctx.fillRect(x - 2 * s, y - 14 * s - bob, 3 * s, s);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + s, y - 12 * s - bob, 2 * s, 2 * s);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x + 2 * s, y - 12 * s - bob, 2 * s, 2 * s);

    // 5. Note Letter Badge (Receivers) or Pursuit Alert Badge (Defenders)
    if (noteBadge) {
        const bw = isAlertBadge ? 14 : 22;
        const bh = isAlertBadge ? 14 : 18;
        const bx = x - Math.round(bw / 2);
        const by = y - 14 * s - bob - bh - 4;

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.fillStyle = isAlertBadge ? '#ef4444' : '#facc15';
        ctx.fillRect(bx, by, bw, bh);

        ctx.fillStyle = isAlertBadge ? '#ffffff' : '#0f172a';
        ctx.font = `900 ${isAlertBadge ? 11 : 13}px monospace`;
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

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(x - 4, groundY - 2, 8, 3);

    ctx.fillStyle = '#78350f';
    ctx.fillRect(x - 5, ballY - 3, 10, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 2, ballY - 2, 4, 2);
}

function drawRetroScoreboardHUD(ctx, W, H) {
    const hudH = 22;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, hudH);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, hudH, W, 2);

    ctx.font = '900 12px monospace';
    ctx.textBaseline = 'middle';

    ctx.textAlign = 'left';
    ctx.fillStyle = '#38bdf8';
    const toGo = Math.max(1, firstDownLine - lineOfScrimmage);
    const downStr = `${down}${getOrdinal(down)} & ${firstDownLine >= 100 ? 'GOAL' : toGo}`;
    ctx.fillText(`🏈 ${downStr}  |  BALL ON ${Math.round(lineOfScrimmage)}`, 10, hudH / 2);

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
    } else if (gamePhase === 'pat') {
        ctx.fillStyle = '#facc15';
        ctx.fillText(`EXTRA POINT KICK! TARGET: "${patState.kickNote}"`, W / 2, hudH / 2);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`PTS: ${String(Math.floor(score)).padStart(5, '0')}  x${multiplier}  TD:${touchdowns}`, W - 10, hudH / 2);

    if (playBannerTimer > 0 && playBannerText) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '900 20px monospace';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(playBannerText, W / 2 + 2, H * 0.44 + 2);
        ctx.fillStyle = playBannerColor;
        ctx.fillText(playBannerText, W / 2, H * 0.44);
        ctx.restore();
    }
}
