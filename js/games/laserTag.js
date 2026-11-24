// js/games/laserTag.js
import { initAudio, audioCtx } from '../audio.js';
import {
    CHORD_GEARS,
    OVERCHARGE_CHORDS,
    EMP_CHORD_NOTES,
    DECOY_CHORDS,
    SUS4_CHORDS,
    DEFAULT_GEAR,
    TILE_SIZE,
    MAP_COLS,
    MAP_ROWS,
    ASSIGNABLE_PITCHES,
    AUSSIE_2026_TEEN_BOYS,
    BOT_AVATARS
} from './laserTag/constants.js';
import { gameState } from './laserTag/state.js';
import {
    getSuitColorForAvatar,
    parseNoteDetails,
    normalizePitchClass,
    isPlayerActiveInRoom
} from './laserTag/utils.js';
import {
    ARENA_MAP,
    generateSeededArena,
    getSafeSpawnPoint,
    isInsideEmeraldHub,
    hasLineOfSight,
    castRay,
    castRayFromPoint
} from './laserTag/arena.js';
import { renderFirstPerson3D } from './laserTag/render3d.js';
import { renderSpectatorOverheadView, renderMinimapAndTopHud } from './laserTag/hud.js';
import { loadSongChallenges, getRandomChallenge } from './laserTag/songChallenges.js';

const MIDI_PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const activeComputerKeys = new Set();

// Smooth velocity state for fluid turning & movement
let currentTurnVel = 0;
let currentMoveSpeed = 0;

function clearAllHeldMovement() {
    if (gameState.physicallyHeldNotes && typeof gameState.physicallyHeldNotes.clear === 'function') {
        gameState.physicallyHeldNotes.clear();
    } else {
        gameState.physicallyHeldNotes = new Map();
    }
    activeComputerKeys.clear();
    gameState.heldMoveKeys.clear();
    gameState.localPlayer.turnDir = 0;
    gameState.localPlayer.turnHoldStart = 0;
    gameState.localPlayer.isMovingForward = false;
}

function markPitchHeld(pitchClass) {
    if (!(gameState.physicallyHeldNotes instanceof Map)) {
        gameState.physicallyHeldNotes = new Map();
    }
    gameState.physicallyHeldNotes.set(pitchClass, performance.now());
}

function unmarkPitchHeld(pitchClass) {
    if (gameState.physicallyHeldNotes instanceof Map) {
        gameState.physicallyHeldNotes.delete(pitchClass);
    }
    gameState.heldMoveKeys.delete(pitchClass);
}

function isPitchStillPhysicallyHeld(pitchClass) {
    if (!(gameState.physicallyHeldNotes instanceof Map)) return false;
    const pressedAt = gameState.physicallyHeldNotes.get(pitchClass);
    if (!pressedAt) return false;

    const domKeyActive = Boolean(document.querySelector('#keyboard .key.active'));
    if (domKeyActive || activeComputerKeys.size > 0) {
        gameState.physicallyHeldNotes.set(pitchClass, performance.now());
        return true;
    }

    // Auto-expire after 450ms if no Note-Off arrived (prevents stuck spinning from Mic Input or dropped MIDI Note-Off)
    if (performance.now() - pressedAt > 450) {
        unmarkPitchHeld(pitchClass);
        return false;
    }
    return true;
}

function attachUniversalReleaseListeners() {
    if (gameState.autoReleaseListenersAttached) return;
    gameState.autoReleaseListenersAttached = true;

    // 1. Computer Keyboard Release (stops movement immediately when key is lifted)
    window.addEventListener('keydown', (e) => {
        if (gameState.gamePhase !== 'playing' && gameState.gamePhase !== 'spectating') return;
        if (!e.repeat && e.code) {
            activeComputerKeys.add(e.code);
        }
        if (e.key && e.key.length === 1) {
            gameState.typedCheatBuffer = (gameState.typedCheatBuffer + e.key).slice(-8);
            if (gameState.typedCheatBuffer.toLowerCase().endsWith('test')) {
                gameState.typedCheatBuffer = '';
                spawn50CombatBots();
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code) activeComputerKeys.delete(e.code);
        const k = (e.key || '').toLowerCase();

        // Directly release C, C#, or D when its mapped computer key is lifted, even if another key is still held
        if (k === 'z' || k === 'q' || k === ',') handleLaserTagRelease('C4');
        if (k === 's' || k === '2' || k === 'l') handleLaserTagRelease('C#4');
        if (k === 'x' || k === 'w' || k === '.') handleLaserTagRelease('D4');

        if (activeComputerKeys.size === 0) {
            clearAllHeldMovement();
        }
    });

    // 2. Mouse / Touchscreen Piano Key Release
    window.addEventListener('pointerup', () => clearAllHeldMovement());
    window.addEventListener('pointercancel', () => clearAllHeldMovement());
    window.addEventListener('mouseup', () => clearAllHeldMovement());
    window.addEventListener('touchend', (e) => {
        if (!e.touches || e.touches.length === 0) clearAllHeldMovement();
    });

    // 3. Window Focus Lost Safety Net
    window.addEventListener('blur', () => {
        clearAllHeldMovement();
    });

    // 4. Physical MIDI Piano Note-Off Listener
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then((midiAccess) => {
            const bindMidiInput = (input) => {
                input.addEventListener('midimessage', (msg) => {
                    if (gameState.gamePhase !== 'playing' || !msg.data || msg.data.length < 2) return;
                    const status = msg.data[0] & 0xf0;
                    const noteNum = msg.data[1];
                    const velocity = msg.data.length > 2 ? msg.data[2] : 0;

                    // MIDI Note Off (0x80) OR Note On with velocity 0
                    if (status === 0x80 || (status === 0x90 && velocity === 0)) {
                        const pitch = MIDI_PITCH_NAMES[noteNum % 12];
                        const octave = Math.floor(noteNum / 12) - 1;
                        handleLaserTagRelease(`${pitch}${octave}`);
                    }
                });
            };

            for (const input of midiAccess.inputs.values()) {
                bindMidiInput(input);
            }
            midiAccess.addEventListener('statechange', (e) => {
                if (e.port && e.port.type === 'input' && e.port.state === 'connected') {
                    bindMidiInput(e.port);
                }
            });
        }).catch(() => {});
    }
}

function addKillFeedEntry(id, text, color = '#facc15') {
    if (!id || gameState.seenFeedIds.has(id)) return;
    gameState.seenFeedIds.add(id);
    gameState.killFeedEntries.unshift({
        id,
        text,
        color,
        expiresAt: performance.now() + 6500
    });
    if (gameState.killFeedEntries.length > 4) gameState.killFeedEntries.pop();
}

function matchDiatonicTriad(pitchSet) {
    if (pitchSet.size !== 3) return null;
    for (const gear of CHORD_GEARS) {
        if (gear.notes.every(n => pitchSet.has(n))) return gear;
    }
    return null;
}

function matchOverchargeChord(pitchSet) {
    if (pitchSet.size !== 4) return null;
    for (const oc of OVERCHARGE_CHORDS) {
        if (oc.notes.every(n => pitchSet.has(n))) return oc;
    }
    return null;
}

function matchEmpChord(pitchSet) {
    if (pitchSet.size !== 4) return false;
    return EMP_CHORD_NOTES.every(n => pitchSet.has(n));
}

function matchDecoyChord(pitchSet) {
    if (pitchSet.size !== 4) return null;
    for (const dc of DECOY_CHORDS) {
        if (dc.notes.every(n => pitchSet.has(n))) return dc;
    }
    return null;
}

function matchSus4Chord(pitchSet) {
    if (pitchSet.size !== 3) return null;
    for (const sc of SUS4_CHORDS) {
        if (sc.notes.every(n => pitchSet.has(n))) return sc;
    }
    return null;
}

// ==========================================
// WEB AUDIO SYNTH EFFECTS
// ==========================================
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

function playEmpPulseSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(680, now);
        osc.frequency.exponentialRampToValueAtTime(48, now + 0.45);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.49);
    } catch (e) {}
}

function playDecoySpawnSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.08);
        osc.frequency.setValueAtTime(880, now + 0.16);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.29);
    } catch (e) {}
}

function playSniperZoomSound(zoomingIn = true) {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(zoomingIn ? 480 : 880, now);
        osc.frequency.exponentialRampToValueAtTime(zoomingIn ? 960 : 420, now + 0.14);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
    } catch (e) {}
}

function playOctaveSnapSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(360, now);
        osc.frequency.exponentialRampToValueAtTime(720, now + 0.11);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
    } catch (e) {}
}

function playOverchargeBlastSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(1600, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(65, now + 0.42);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
    } catch (e) {}
}

function playHitMarkerTick() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1950, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
    } catch (e) {}
}

function playSpeedBoostSweep() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(1180, now + 0.25);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.28);
    } catch (e) {}
}

function playMedKitHealChime() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.07);
        osc.frequency.setValueAtTime(1046.50, now + 0.14);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.31);
    } catch (e) {}
}

function playPortalWarpSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(1280, now + 0.22);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.38);
        gain.gain.setValueAtTime(0.20, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.42);
    } catch (e) {}
}

function playRadioAlertChime() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(740, now);
        osc.frequency.setValueAtTime(987.77, now + 0.09);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    } catch (e) {}
}

function playJamBuzzSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(115, now);
        osc.frequency.setValueAtTime(95, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
    } catch (e) {}
}

function playGearShiftSound(speedMult) {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        const baseFreq = 260 + speedMult * 220;
        osc.frequency.setValueAtTime(baseFreq * 0.85, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.14);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
    } catch (e) {}
}

function playShieldHitSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(85, now + 0.28);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.31);
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
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.50);
        gain.gain.setValueAtTime(0.26, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.54);
    } catch (e) {}
}

function spawn3DExplosion(wx, wy, color, count = 28) {
    for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 190;
        gameState.worldExplosions.push({
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

async function spawn50CombatBots() {
    if (!gameState.activeRoomCode || !window.firebaseDb) return;

    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    const basePath = `pianopad_tournaments/${gameState.activeRoomCode}/lasertag`;
    const updates = {};

    const batchStamp = Date.now() % 10000;
    const shuffledNames = [...AUSSIE_2026_TEEN_BOYS].sort(() => Math.random() - 0.5);

    for (let i = 0; i < 50; i++) {
        const botId = `bot_2026_${batchStamp}_${i + 1}`;
        const name = shuffledNames[i % shuffledNames.length];
        const avatar = BOT_AVATARS[i % BOT_AVATARS.length];
        const pos = getSafeSpawnPoint();
        const pitch = ASSIGNABLE_PITCHES[i % ASSIGNABLE_PITCHES.length];
        const suitColor = getSuitColorForAvatar(avatar, botId);

        const botData = {
            id: botId,
            name: name,
            avatar: avatar,
            x: Number(pos.x.toFixed(1)),
            y: Number(pos.y.toFixed(1)),
            angle: Math.random() * Math.PI * 2,
            lives: 3,
            hitsTaken: 0,
            eliminations: 0,
            isAlive: true,
            isStealth: false,
            isInvulnerable: false,
            suitColor: suitColor,
            noteTag: pitch,
            score: 0,
            isBot: true,
            turnTimer: Math.random() * 2.0,
            fireCooldown: 1.5 + Math.random() * 3.0
        };

        gameState.simulatedBots[botId] = botData;
        updates[botId] = botData;
    }

    await update(window.firebaseRef(window.firebaseDb, basePath), updates);

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🤖 TEST MODE ACTIVATED: 50 Aussie Teen Combat Bots spawned and fighting in the arena!`;
    }
}

function updateSimulatedBots(dt) {
    const botList = Object.values(gameState.simulatedBots);
    if (botList.length === 0) return;

    const speed = 160;
    const pad = 12;
    const now = performance.now();

    for (const bot of botList) {
        const serverBot = gameState.remotePlayers[bot.id];
        if (serverBot && serverBot.lastHitEvent && serverBot.lastHitEvent.id !== bot.lastProcessedHit) {
            bot.lastProcessedHit = serverBot.lastHitEvent.id;
            bot.hitsTaken += 1;
            bot.lives = Math.max(0, 3 - bot.hitsTaken);
            if (bot.lives <= 0) {
                bot.isAlive = false;
                spawn3DExplosion(bot.x, bot.y, '#ef4444', 32);
            } else {
                spawn3DExplosion(bot.x, bot.y, '#f97316', 22);
                const respawn = getSafeSpawnPoint(bot.x, bot.y);
                bot.x = respawn.x;
                bot.y = respawn.y;
                bot.invulnerableUntil = now + 800;
            }
        }

        if (!bot.isAlive) continue;
        bot.isInvulnerable = now < (bot.invulnerableUntil || 0);

        if (gameState.arenaPortals.length === 2 && now >= (bot.portalCooldown || 0)) {
            for (let pIdx = 0; pIdx < 2; pIdx++) {
                const p = gameState.arenaPortals[pIdx];
                if (Math.hypot(bot.x - p.x, bot.y - p.y) < 34) {
                    const dest = gameState.arenaPortals[pIdx === 0 ? 1 : 0];
                    bot.x = dest.x;
                    bot.y = dest.y;
                    bot.portalCooldown = now + 3000;
                    break;
                }
            }
        }

        bot.turnTimer -= dt;
        if (bot.turnTimer <= 0) {
            bot.angle += (Math.random() - 0.5) * Math.PI * 0.9;
            bot.turnTimer = 1.4 + Math.random() * 2.4;
        }

        const dx = Math.cos(bot.angle) * speed * dt;
        const dy = Math.sin(bot.angle) * speed * dt;
        const colX = Math.floor((bot.x + dx + (dx > 0 ? pad : -pad)) / TILE_SIZE);
        const curRow = Math.floor(bot.y / TILE_SIZE);
        const rowY = Math.floor((bot.y + dy + (dy > 0 ? pad : -pad)) / TILE_SIZE);
        const curCol = Math.floor(bot.x / TILE_SIZE);

        let blocked = true;
        if (ARENA_MAP[curRow] && ARENA_MAP[curRow][colX] === 0) {
            bot.x += dx;
            blocked = false;
        }
        if (ARENA_MAP[rowY] && ARENA_MAP[rowY][curCol] === 0) {
            bot.y += dy;
            blocked = false;
        }
        if (blocked) {
            bot.angle += (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2);
        }

        bot.fireCooldown = (bot.fireCooldown || 2.0) - dt;
        if (bot.fireCooldown <= 0) {
            bot.fireCooldown = 2.2 + Math.random() * 3.5;

            for (const otherBot of botList) {
                if (otherBot.id === bot.id || !otherBot.isAlive || otherBot.isInvulnerable) continue;
                const d = Math.hypot(otherBot.x - bot.x, otherBot.y - bot.y);
                if (d < 420 && hasLineOfSight(bot.x, bot.y, otherBot.x, otherBot.y)) {
                    otherBot.hitsTaken += 1;
                    otherBot.lives = Math.max(0, 3 - otherBot.hitsTaken);
                    bot.score += 50;
                    const feedId = `bot_hit_${bot.id}_${otherBot.id}_${Math.floor(now / 500)}`;
                    if (otherBot.lives <= 0) {
                        otherBot.isAlive = false;
                        bot.score += 100;
                        bot.eliminations = (bot.eliminations || 0) + 1;
                        spawn3DExplosion(otherBot.x, otherBot.y, '#ef4444', 20);
                        addKillFeedEntry(feedId, `💥 ${bot.name} [${otherBot.noteTag}] eliminated ${otherBot.name}`, '#ef4444');
                    } else {
                        const rp = getSafeSpawnPoint(otherBot.x, otherBot.y);
                        otherBot.x = rp.x;
                        otherBot.y = rp.y;
                        otherBot.invulnerableUntil = now + 3500;
                        spawn3DExplosion(otherBot.x, otherBot.y, '#f97316', 12);
                        addKillFeedEntry(feedId, `🔥 ${bot.name} [${otherBot.noteTag}] tagged ${otherBot.name}`, '#fb923c');
                    }
                    break;
                }
            }
        }
    }
}

async function sendSpectatorDroneAlert(targetPlayerId, targetName, messageText) {
    if (!gameState.activeRoomCode || !window.firebaseDb || !targetPlayerId) return;

    playRadioAlertChime();
    const state = window._laserTagBridge && window._laserTagBridge.getState ? window._laserTagBridge.getState() : {};
    const senderName = state.sessionStudentName || 'Spectator';

    try {
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const basePath = `pianopad_tournaments/${gameState.activeRoomCode}/lasertag`;
        const targetUpdates = {
            spectatorAlert: {
                id: `${gameState.localId}_${Date.now()}`,
                text: messageText,
                fromName: senderName,
                timestamp: Date.now()
            }
        };
        await update(window.firebaseRef(window.firebaseDb, `${basePath}/${targetPlayerId}`), targetUpdates);
    } catch (e) {}

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `📡 SENT ALERT TO ${targetName.toUpperCase()}: "${messageText}"`;
    }
    gameState.spectatorSelectedTarget = null;
}

function handleSpectatorCanvasClick(e) {
    if (gameState.gamePhase !== 'spectating' || gameState.localPlayer.isAlive) return;

    const canvas = document.getElementById('waterfall-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleCanvasX = canvas.width / rect.width;
    const scaleCanvasY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleCanvasX;
    const clickY = (e.clientY - rect.top) * scaleCanvasY;

    const sel = gameState.spectatorSelectedTarget;
    if (sel && sel.buttons) {
        for (const btn of sel.buttons) {
            if (clickX >= btn.x && clickX <= btn.x + btn.w && clickY >= btn.y && clickY <= btn.y + btn.h) {
                sendSpectatorDroneAlert(sel.id, sel.name, btn.msg);
                return;
            }
        }
    }

    const W = canvas.width;
    const H = canvas.height;
    const mapScale = Math.min(W / (MAP_COLS * TILE_SIZE), H / (MAP_ROWS * TILE_SIZE)) * 0.92;
    const offsetX = (W - MAP_COLS * TILE_SIZE * mapScale) / 2;
    const offsetY = (H - MAP_ROWS * TILE_SIZE * mapScale) / 2;

    let closestPlayer = null;
    let closestDist = 36;

    for (const [id, opp] of Object.entries(gameState.remotePlayers)) {
        if (!isPlayerActiveInRoom(opp)) continue;
        const px = offsetX + opp.x * mapScale;
        const py = offsetY + opp.y * mapScale;
        const d = Math.hypot(clickX - px, clickY - py);
        if (d < closestDist) {
            closestDist = d;
            closestPlayer = { id, name: opp.name || 'Player', screenX: px, screenY: py };
        }
    }

    gameState.spectatorSelectedTarget = closestPlayer;
    if (closestPlayer) playRadioAlertChime();
}

export function stopLaserTag() {
    if (gameState.animFrameId !== null) cancelAnimationFrame(gameState.animFrameId);
    if (gameState.syncIntervalId !== null) clearInterval(gameState.syncIntervalId);
    if (gameState.pendingActionTimer !== null) clearTimeout(gameState.pendingActionTimer);
    if (gameState.roomUnsubscribe) {
        gameState.roomUnsubscribe();
        gameState.roomUnsubscribe = null;
    }
    gameState.animFrameId = null;
    gameState.syncIntervalId = null;
    gameState.pendingActionTimer = null;
    gameState.recentNoteBuffer = [];
    currentTurnVel = 0;
    currentMoveSpeed = 0;
    clearAllHeldMovement();
    gameState.typedCheatBuffer = '';
    gameState.processedHitIds.clear();
    gameState.processedEmpIds.clear();
    gameState.processedAlertIds.clear();
    gameState.seenFeedIds.clear();
    gameState.killFeedEntries = [];
    gameState.activeDecoys = [];
    gameState.empWaveRings = [];
    gameState.simulatedBots = {};
    gameState.challengeNodes = [];
    gameState.spectatorSelectedTarget = null;
    gameState.incomingAlertBanner = null;
    gameState.maxPeakPlayers = 1;
    gameState.gamePhase = 'lobby';
}

export async function startLaserTag(bridge, autoRoomCode = null, isHost = false) {
    try {
        await loadSongChallenges();
    } catch (e) {
        console.warn("Song challenges failed to load, continuing with defaults:", e);
    }
    initAudio();
    stopLaserTag();

    window._laserTagBridge = bridge;
    attachUniversalReleaseListeners();

    if (!gameState.spectatorClickListenerAttached) {
        const canvasEl = document.getElementById('waterfall-canvas');
        if (canvasEl) {
            gameState.spectatorClickListenerAttached = true;
            canvasEl.addEventListener('click', handleSpectatorCanvasClick);
        }
    }

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
    gameState.localId = state.localStudentId || ('stu_' + Math.random().toString(36).slice(2, 9));
    gameState.activeRoomCode = String(autoRoomCode || prompt("Enter a 3-Digit Room Code for 3D Laser Tag:", "123") || '').trim();

    if (!gameState.activeRoomCode || !window.firebaseDb) {
        alert("Firebase required for Laser Tag. Returning to menu.");
        bridge.exitActiveMiniGame();
        return;
    }

    generateSeededArena(gameState.activeRoomCode);

    const lp = gameState.localPlayer;
    const avatar = state.sessionStudentAvatar || '🏃';
    const spawn = getSafeSpawnPoint();
    lp.x = spawn.x;
    lp.y = spawn.y;
    lp.angle = Math.random() * Math.PI * 2;
    lp.turnDir = 0;
    lp.turnHoldStart = 0;
    lp.isMovingForward = false;
    lp.lives = 3;
    lp.hitsTaken = 0;
    lp.eliminations = 0;
    lp.isAlive = true;
    lp.currentGear = DEFAULT_GEAR;
    lp.invulnerableUntil = 0;
    lp.portalCooldownUntil = 0;
    lp.boostUntil = 0;
    lp.overchargeReadyAt = 0;
    lp.empReadyAt = 0;
    lp.decoyReadyAt = 0;
    lp.sniperUntil = 0;
    lp.sniperReadyAt = 0;
    lp.sniperActivatedAt = 0;
    lp.empScrambledUntil = 0;
    lp.hubScoreTimer = 0;
    lp.comboCount = 0;
    lp.comboExpiresAt = 0;
    lp.lastComboTargetId = null;
    lp.revengeTargetId = null;
    lp.hitMarkerUntil = 0;
    lp.hitMarkerElim = false;
    lp.suitColor = getSuitColorForAvatar(avatar, gameState.localId);
    lp.score = 0;
    lp.noteTag = ASSIGNABLE_PITCHES[Math.floor(Math.random() * ASSIGNABLE_PITCHES.length)];
    lp.bobPhase = 0;
    lp.recoil = 0;
    lp.muzzleFlash = 0;
    lp.damageFlash = 0;
    lp.damageFlashColor = '#f97316';
    lp.portalFlash = 0;
    lp.jamFlash = 0;
    lp.gearBannerFlash = 1.0;

    currentTurnVel = 0;
    currentMoveSpeed = 0;

    gameState.activeBeams = [];

    // Spawn 3 random musical challenge nodes around the arena
    gameState.challengeNodes = [];
    for (let i = 0; i < 3; i++) {
        const cSpawn = getSafeSpawnPoint();
        const chal = getRandomChallenge();
        gameState.challengeNodes.push({
            x: cSpawn.x,
            y: cSpawn.y,
            sequence: chal.sequence,
            name: chal.name,
            currentStep: 0,
            active: true,
            respawnAt: 0
        });
    }

    gameState.worldExplosions = [];
    gameState.activeDecoys = [];
    gameState.empWaveRings = [];
    gameState.remotePlayers = {};
    gameState.recentNoteBuffer = [];
    clearAllHeldMovement();
    gameState.processedHitIds.clear();
    gameState.processedEmpIds.clear();
    gameState.processedAlertIds.clear();
    gameState.seenFeedIds.clear();
    gameState.killFeedEntries = [];
    gameState.maxPeakPlayers = 1;
    gameState.gamePhase = 'playing';
    gameState.lastFrameTime = performance.now();
    gameState.matchStartTime = gameState.lastFrameTime;

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🛸 3D LASER TAG! Shield: [${lp.noteTag}] | Hold C#: Move • Hold C/D: Turn • sus4: Sniper 2x • Bdim7: EMP • Dm7/Em7: Decoy!`;
    }

    gameState.animFrameId = requestAnimationFrame((now) => gameLoop(now, bridge));

    try {
        const { onValue, set, update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const basePath = `pianopad_tournaments/${gameState.activeRoomCode}/lasertag`;
        const myPlayerRef = window.firebaseRef(window.firebaseDb, `${basePath}/${gameState.localId}`);

        await set(myPlayerRef, {
            id: gameState.localId,
            x: Number(lp.x.toFixed(1)),
            y: Number(lp.y.toFixed(1)),
            angle: Number(lp.angle.toFixed(3)),
            lives: 3,
            hitsTaken: 0,
            eliminations: 0,
            isAlive: true,
            gearId: lp.currentGear.id,
            isStealth: lp.currentGear.stealth,
            isInvulnerable: false,
            suitColor: lp.suitColor,
            noteTag: lp.noteTag,
            score: 0,
            name: state.sessionStudentName || 'Player',
            avatar: avatar,
            lastHitEvent: null,
            lastEmpEvent: null,
            spectatorAlert: null
        });
        if (window.firebaseOnDisconnect) {
            window.firebaseOnDisconnect(myPlayerRef).remove();
        }

        const roomRef = window.firebaseRef(window.firebaseDb, basePath);
        gameState.roomUnsubscribe = onValue(roomRef, (snapshot) => {
            const data = snapshot.val() || {};
            gameState.remotePlayers = data;

            for (const [pid, pObj] of Object.entries(gameState.remotePlayers)) {
                if (pObj && pObj.lastHitEvent && pObj.lastHitEvent.id) {
                    const ev = pObj.lastHitEvent;
                    const verb = ev.eliminated ? '💥 eliminated' : '🔥 tagged';
                    addKillFeedEntry(
                        ev.id,
                        `${ev.byName || 'Player'} [${ev.pitch || '?'}] ${verb} ${pObj.name || 'Opponent'}`,
                        ev.eliminated ? '#ef4444' : '#fb923c'
                    );
                }
            }

            const myServerRecord = gameState.remotePlayers[gameState.localId];
            if (!myServerRecord || !lp.isAlive) return;

            // Check for incoming Bdim7 EMP Pulse
            const empEvt = myServerRecord.lastEmpEvent;
            if (empEvt && empEvt.id && !gameState.processedEmpIds.has(empEvt.id)) {
                gameState.processedEmpIds.add(empEvt.id);
                lp.empScrambledUntil = performance.now() + 3500;
                lp.currentGear = CHORD_GEARS[1];
                playEmpPulseSound();
                if (statusEl) {
                    statusEl.textContent = `⚡ EMP SCRAMBLED by ${empEvt.byName || 'Opponent'}! Slowed to 0.35x for 3.5s!`;
                }
            }

            // Spectator Callout Alert
            const alertEvt = myServerRecord.spectatorAlert;
            if (alertEvt && alertEvt.id && !gameState.processedAlertIds.has(alertEvt.id)) {
                gameState.processedAlertIds.add(alertEvt.id);
                gameState.incomingAlertBanner = {
                    text: alertEvt.text,
                    fromName: alertEvt.fromName || 'Teammate',
                    until: performance.now() + 3400
                };
                playRadioAlertChime();
            }

            // Incoming Laser Hit Event
            const hitEvt = myServerRecord.lastHitEvent;
            if (hitEvt && hitEvt.id && !gameState.processedHitIds.has(hitEvt.id)) {
                gameState.processedHitIds.add(hitEvt.id);

                if (performance.now() < lp.invulnerableUntil) return;

                if (hitEvt.byId) {
                    lp.revengeTargetId = hitEvt.byId;
                }

                lp.hitsTaken += 1;
                lp.lives = Math.max(0, 3 - lp.hitsTaken);

                if (lp.lives <= 0) {
                    lp.lives = 0;
                    lp.isAlive = false;
                    clearAllHeldMovement();
                    lp.damageFlash = 1.0;
                    lp.damageFlashColor = '#ef4444';
                    playExplosionSound();
                    spawn3DExplosion(lp.x, lp.y, '#ef4444', 42);
                    gameState.gamePhase = 'spectating';

                    update(myPlayerRef, {
                        lives: 0,
                        hitsTaken: lp.hitsTaken,
                        isAlive: false,
                        isInvulnerable: false
                    }).catch(() => {});

                    if (statusEl) {
                        statusEl.textContent = `💥 ELIMINATED! Click any player on the Spectator Map to send "Watch Out", "Turn Left", or "Turn Right"!`;
                    }
                } else {
                    const oldX = lp.x;
                    const oldY = lp.y;
                    spawn3DExplosion(oldX, oldY, '#f97316', 24);

                    const newSpawn = getSafeSpawnPoint(oldX, oldY);
                    lp.x = newSpawn.x;
                    lp.y = newSpawn.y;
                    lp.angle = Math.random() * Math.PI * 2;
                    clearAllHeldMovement();
                    lp.invulnerableUntil = performance.now() + 3500;
                    lp.damageFlash = 1.0;
                    lp.damageFlashColor = '#f97316';
                    playShieldHitSound();

                    update(myPlayerRef, {
                        x: Number(lp.x.toFixed(1)),
                        y: Number(lp.y.toFixed(1)),
                        angle: Number(lp.angle.toFixed(3)),
                        lives: lp.lives,
                        hitsTaken: lp.hitsTaken,
                        isAlive: true,
                        isInvulnerable: true
                    }).catch(() => {});

                    if (statusEl) {
                        statusEl.textContent = `⚠️ HIT BY ${hitEvt.byName || 'Opponent'}! Respawned (${lp.lives} ${lp.lives === 1 ? 'LIFE' : 'LIVES'} LEFT) — Revenge Target marked!`;
                    }
                }
            }
        });

        gameState.syncIntervalId = setInterval(() => {
            if (bridge.getActiveMiniGame() !== 'laserTag') return;

            if (lp.isAlive) {
                const isInvuln = performance.now() < lp.invulnerableUntil;
                update(myPlayerRef, {
                    x: Number(lp.x.toFixed(1)),
                    y: Number(lp.y.toFixed(1)),
                    angle: Number(lp.angle.toFixed(3)),
                    lives: lp.lives,
                    hitsTaken: lp.hitsTaken,
                    eliminations: lp.eliminations,
                    isAlive: lp.isAlive,
                    gearId: lp.currentGear.id,
                    isStealth: lp.currentGear.stealth,
                    isInvulnerable: isInvuln,
                    suitColor: lp.suitColor,
                    noteTag: lp.noteTag,
                    score: lp.score,
                    name: state.sessionStudentName || 'Player',
                    avatar: avatar
                }).catch(() => {});
            }

            if (Object.keys(gameState.simulatedBots).length > 0) {
                const botBatch = {};
                for (const bot of Object.values(gameState.simulatedBots)) {
                    botBatch[`${bot.id}/x`] = Number(bot.x.toFixed(1));
                    botBatch[`${bot.id}/y`] = Number(bot.y.toFixed(1));
                    botBatch[`${bot.id}/angle`] = Number(bot.angle.toFixed(3));
                    botBatch[`${bot.id}/lives`] = bot.lives;
                    botBatch[`${bot.id}/hitsTaken`] = bot.hitsTaken;
                    botBatch[`${bot.id}/eliminations`] = bot.eliminations || 0;
                    botBatch[`${bot.id}/isAlive`] = bot.isAlive;
                    botBatch[`${bot.id}/isInvulnerable`] = Boolean(bot.isInvulnerable);
                    botBatch[`${bot.id}/score`] = bot.score;
                }
                update(window.firebaseRef(window.firebaseDb, basePath), botBatch).catch(() => {});
            }
        }, 120);
    } catch (err) {
        console.error("Laser Tag Firebase sync error:", err);
    }
}

// Diminished 7th EMP Shockwave (B + D + F + G#)
async function triggerEmpShockwave(bridge) {
    const lp = gameState.localPlayer;
    const now = performance.now();
    playEmpPulseSound();
    lp.empReadyAt = now + 18000;
    gameState.empWaveRings.push({ x: lp.x, y: lp.y, radius: 10, maxRadius: 260, life: 1.0 });

    const state = bridge && bridge.getState ? bridge.getState() : {};
    const empId = `emp_${gameState.localId}_${Date.now()}`;
    let hitCount = 0;

    try {
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const basePath = `pianopad_tournaments/${gameState.activeRoomCode}/lasertag`;
        const updates = {};

        for (const [id, opp] of Object.entries(gameState.remotePlayers)) {
            if (id === gameState.localId || !isPlayerActiveInRoom(opp)) continue;
            if (Math.hypot(opp.x - lp.x, opp.y - lp.y) <= 260) {
                hitCount++;
                updates[`${id}/lastEmpEvent`] = {
                    id: empId,
                    byId: gameState.localId,
                    byName: state.sessionStudentName || 'Opponent',
                    timestamp: Date.now()
                };
            }
        }
        if (hitCount > 0) {
            await update(window.firebaseRef(window.firebaseDb, basePath), updates);
        }
    } catch (e) {}

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🌀 Bdim7 EMP PULSE FIRED! Scrambled ${hitCount} nearby ${hitCount === 1 ? 'opponent' : 'opponents'}! (18s recharge)`;
    }
}

// Musical Echo Holo-Decoy (Dm7 or Em7)
function spawnHoloDecoy(chordLabel, bridge) {
    const lp = gameState.localPlayer;
    const now = performance.now();
    playDecoySpawnSound();
    lp.decoyReadyAt = now + 14000;

    const state = bridge && bridge.getState ? bridge.getState() : {};
    gameState.activeDecoys.push({
        id: `decoy_${Date.now()}`,
        x: lp.x + Math.cos(lp.angle) * 28,
        y: lp.y + Math.sin(lp.angle) * 28,
        angle: lp.angle,
        avatar: state.sessionStudentAvatar || '🏃',
        name: state.sessionStudentName || 'Player',
        noteTag: lp.noteTag,
        suitColor: lp.suitColor,
        expiresAt: now + 5500
    });

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `👥 ${chordLabel} DEPLOYED! Holographic decoy running forward for 5.5s!`;
    }
}

async function fireLaserAttack(pitchClass, bridge, isOvercharge = false) {
    const lp = gameState.localPlayer;
    if (gameState.gamePhase !== 'playing' || !lp.isAlive) return;

    const now = performance.now();
    if (isOvercharge) {
        playOverchargeBlastSound();
    } else {
        playLaserPew();
    }
    lp.recoil = isOvercharge ? 1.6 : 1.0;
    lp.muzzleFlash = 1.0;

    const isSniper = now < (lp.sniperUntil || 0);
    const FOV = isSniper ? (Math.PI / 6) : (Math.PI / 3);
    const maxCone = isOvercharge ? FOV * 0.85 : FOV * 0.62;
    let bestTarget = null;
    let bestDist = isSniper ? 2600 : 1400;

    for (const [id, opp] of Object.entries(gameState.remotePlayers)) {
        if (id === gameState.localId || !isPlayerActiveInRoom(opp) || opp.isInvulnerable) continue;
        if (!isOvercharge && normalizePitchClass(opp.noteTag) !== pitchClass) continue;

        const dx = opp.x - lp.x;
        const dy = opp.y - lp.y;
        const dist = Math.hypot(dx, dy);
        if (dist > bestDist) continue;

        let relAngle = Math.atan2(dy, dx) - lp.angle;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;

        if (Math.abs(relAngle) <= maxCone && hasLineOfSight(lp.x, lp.y, opp.x, opp.y)) {
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

        const currentLives = bestTarget.opp.lives !== undefined ? Number(bestTarget.opp.lives) : 3;
        const predictedRemaining = Math.max(0, currentLives - 1);
        const eliminated = predictedRemaining <= 0;

        if (now < lp.comboExpiresAt && lp.lastComboTargetId !== bestTarget.id) {
            lp.comboCount = 2;
        } else {
            lp.comboCount = 1;
        }
        lp.lastComboTargetId = bestTarget.id;
        lp.comboExpiresAt = now + 8000;
        const isCombo2x = lp.comboCount >= 2;

        const isRevenge = lp.revengeTargetId === bestTarget.id;
        if (isRevenge) {
            lp.revengeTargetId = null;
        }

        lp.hitMarkerUntil = now + 260;
        lp.hitMarkerElim = eliminated;
        playHitMarkerTick();

        gameState.activeBeams.push({
            endX: targetScreenX,
            endY: targetScreenY,
            color: isCombo2x ? 'rainbow' : (isOvercharge ? '#facc15' : (eliminated ? '#ef4444' : '#f97316')),
            glow: isOvercharge ? '#fef08a' : (eliminated ? '#dc2626' : '#fb923c'),
            widthMult: (isOvercharge || isCombo2x) ? 2.2 : 1.0,
            life: 1.0
        });

        let basePts = eliminated ? 150 : 50;
        if (isCombo2x) basePts *= 2;
        if (isRevenge) basePts += 100;
        lp.score += basePts;

        if (eliminated) {
            playExplosionSound();
            spawn3DExplosion(bestTarget.opp.x, bestTarget.opp.y, '#ef4444', 36);
            lp.eliminations += 1;
        } else {
            playShieldHitSound();
            spawn3DExplosion(bestTarget.opp.x, bestTarget.opp.y, '#f97316', 20);
        }

        const state = bridge && bridge.getState ? bridge.getState() : {};
        const hitEventId = `${gameState.localId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const tagLabel = isOvercharge ? 'MAJ7⚡' : pitchClass;

        addKillFeedEntry(
            hitEventId,
            `${state.sessionStudentName || 'You'} [${tagLabel}] ${eliminated ? '💥 eliminated' : '🔥 tagged'} ${bestTarget.opp.name || 'Opponent'}${isRevenge ? ' 🎯REVENGE!' : ''}`,
            eliminated ? '#ef4444' : '#fb923c'
        );

        try {
            const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
            const basePath = `pianopad_tournaments/${gameState.activeRoomCode}/lasertag`;
            await update(window.firebaseRef(window.firebaseDb, `${basePath}/${bestTarget.id}`), {
                lastHitEvent: {
                    id: hitEventId,
                    byId: gameState.localId,
                    byName: state.sessionStudentName || 'Opponent',
                    pitch: tagLabel,
                    eliminated: eliminated,
                    timestamp: Date.now()
                }
            });
        } catch (e) {}

        const statusEl = document.getElementById('status');
        if (statusEl) {
            const tags = [
                isCombo2x ? '🌈 2x COMBO!' : '',
                isRevenge ? '🎯 +100 REVENGE!' : ''
            ].filter(Boolean).join(' ');
            statusEl.textContent = eliminated
                ? `💥 ELIMINATED ${bestTarget.opp.name || 'Opponent'}! (+${basePts} pts ${tags})`
                : `🔥 HIT ${bestTarget.opp.name || 'Opponent'} (${predictedRemaining} lives left)! (+${basePts} pts ${tags})`;
        }
    } else {
        lp.comboCount = 0;

        // Ricochet Mirror Walls in the Cobalt SE Zone (wallType === 5 reflects once at 90°)
        const wallHit = castRay(lp.angle);
        const impactDist = Math.max(16, wallHit.dist - 8);
        const impactX = lp.x + Math.cos(lp.angle) * impactDist;
        const impactY = lp.y + Math.sin(lp.angle) * impactDist;
        const sparkColor = isOvercharge ? '#facc15' : (lp.suitColor || '#38bdf8');
        spawn3DExplosion(impactX, impactY, sparkColor, isOvercharge ? 16 : 8);

        if (wallHit.wallType === 5) {
            const reflectAngle = lp.angle + Math.PI / 2;
            const bankRay = castRayFromPoint(impactX, impactY, reflectAngle);
            const bankEndX = impactX + Math.cos(reflectAngle) * Math.max(12, bankRay.dist - 8);
            const bankEndY = impactY + Math.sin(reflectAngle) * Math.max(12, bankRay.dist - 8);
            spawn3DExplosion(bankEndX, bankEndY, '#60a5fa', 12);

            for (const [id, opp] of Object.entries(gameState.remotePlayers)) {
                if (id === gameState.localId || !isPlayerActiveInRoom(opp) || opp.isInvulnerable) continue;
                if (!isOvercharge && normalizePitchClass(opp.noteTag) !== pitchClass) continue;
                const dToOpp = Math.hypot(opp.x - impactX, opp.y - impactY);
                if (dToOpp < bankRay.dist && hasLineOfSight(impactX, impactY, opp.x, opp.y)) {
                    let angDiff = Math.atan2(opp.y - impactY, opp.x - impactX) - reflectAngle;
                    while (angDiff > Math.PI) angDiff -= Math.PI * 2;
                    while (angDiff < -Math.PI) angDiff += Math.PI * 2;
                    if (Math.abs(angDiff) < 0.35) {
                        lp.score += 125;
                        lp.hitMarkerUntil = now + 260;
                        playHitMarkerTick();
                        spawn3DExplosion(opp.x, opp.y, '#60a5fa', 28);
                        const statusEl = document.getElementById('status');
                        if (statusEl) statusEl.textContent = `💎 COBALT MIRROR BANK SHOT! Reflected laser tagged ${opp.name}! (+125 pts)`;
                        break;
                    }
                }
            }
        }

        gameState.activeBeams.push({
            endX: W * 0.5,
            endY: H * 0.5,
            color: sparkColor,
            glow: isOvercharge ? '#f59e0b' : '#0284c7',
            widthMult: isOvercharge ? 2.2 : 1.0,
            life: 1.0
        });
    }
}

async function executeSingleNoteAction(pitchClass, bridge) {
    const lp = gameState.localPlayer;
    if (gameState.gamePhase !== 'playing' || !lp.isAlive) return;

    if (lp.nearChallengeNode && lp.nearChallengeNode.active) {
        const node = lp.nearChallengeNode;
        if (pitchClass === node.sequence[node.currentStep]) {
            node.currentStep++;
            playHitMarkerTick();

            if (node.currentStep >= node.sequence.length) {
                node.active = false;
                node.respawnAt = performance.now() + 30000;

                lp.score += 250;
                lp.lives = 3;
                lp.hitsTaken = 0;
                lp.boostUntil = performance.now() + 15000;

                playMedKitHealChime();
                spawn3DExplosion(node.x, node.y, '#a855f7', 42);
                const statusEl = document.getElementById('status');
                if (statusEl) {
                    statusEl.textContent = `🔥 ${node.name} COMPLETE! +250 PTS, FULL SHIELD & 15s TURBO BOOST!`;
                }
            } else {
                const statusEl = document.getElementById('status');
                if (statusEl) {
                    statusEl.textContent = `🎵 Hit ${node.currentStep}/${node.sequence.length} for ${node.name}! Keep going...`;
                }
            }
            return;

        } else if (node.currentStep > 0 && pitchClass !== 'C' && pitchClass !== 'D' && pitchClass !== 'C#') {
            node.currentStep = 0;
            playJamBuzzSound();
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.textContent = `❌ Wrong note! ${node.name} starts with: ${node.sequence[0]}`;
            }
            return;
        }
    }

    // C, D, and C# already engage immediately in handleLaserTagInput for zero-latency fluid movement
    if (pitchClass === 'C' || pitchClass === 'D' || pitchClass === 'C#') {
        return;
    }

    await fireLaserAttack(pitchClass, bridge, false);
}

export function handleLaserTagRelease(noteStr) {
    const { pitchClass } = parseNoteDetails(noteStr);
    if (!pitchClass) return;

    unmarkPitchHeld(pitchClass);

    if (pitchClass === 'C' || pitchClass === 'D') {
        const leftHeld = gameState.heldMoveKeys.has('C');
        const rightHeld = gameState.heldMoveKeys.has('D');
        gameState.localPlayer.turnDir = (leftHeld && !rightHeld) ? -1 : (rightHeld && !leftHeld) ? 1 : 0;
        if (gameState.localPlayer.turnDir === 0) {
            gameState.localPlayer.turnHoldStart = 0;
        }
    }

    if (pitchClass === 'C#') {
        gameState.localPlayer.isMovingForward = false;
    }
}

export async function handleLaserTagInput(noteStr, bridge) {
    const lp = gameState.localPlayer;
    if (gameState.gamePhase === 'spectating') {
        spawn3DExplosion(lp.x, lp.y, '#facc15', 14);
        return;
    }

    if (gameState.gamePhase !== 'playing' || !lp.isAlive) return;

    const now = performance.now();
    const { pitchClass, octave } = parseNoteDetails(noteStr);
    if (!pitchClass) return;

    const alreadyHeld = gameState.heldMoveKeys.has(pitchClass);

    // Refresh timestamped physical hold immediately
    markPitchHeld(pitchClass);

    // Instant, zero-lag movement engagement for C (Turn Left), D (Turn Right), and C# (Move Forward)
    if (pitchClass === 'C#') {
        gameState.heldMoveKeys.add('C#');
        lp.isMovingForward = true;
        return;
    }
    if (pitchClass === 'C') {
        gameState.heldMoveKeys.add('C');
        if (!gameState.heldMoveKeys.has('D')) {
            lp.turnDir = -1;
            if (!lp.turnHoldStart) lp.turnHoldStart = now;
        }
    } else if (pitchClass === 'D') {
        gameState.heldMoveKeys.add('D');
        if (!gameState.heldMoveKeys.has('C')) {
            lp.turnDir = 1;
            if (!lp.turnHoldStart) lp.turnHoldStart = now;
        }
    }

    // Ignore OS keyboard auto-repeat pulses once movement is already engaged so timers don't reset
    if (alreadyHeld && (pitchClass === 'C' || pitchClass === 'D')) {
        return;
    }

    gameState.recentNoteBuffer.push({ pitchClass, octave, time: now });
    gameState.recentNoteBuffer = gameState.recentNoteBuffer.filter(item => (now - item.time) <= 125);

    const distinctPitches = new Set(gameState.recentNoteBuffer.map(item => item.pitchClass));

    // Quick-Turn 180° Snap (Octave C Jump: e.g. C2 + C4 played together)
    if (distinctPitches.size === 1 && distinctPitches.has('C') && gameState.recentNoteBuffer.length >= 2) {
        const distinctOctaves = new Set(gameState.recentNoteBuffer.map(item => item.octave));
        if (distinctOctaves.size >= 2) {
            if (gameState.pendingActionTimer !== null) {
                clearTimeout(gameState.pendingActionTimer);
                gameState.pendingActionTimer = null;
            }
            gameState.recentNoteBuffer = [];
            unmarkPitchHeld('C');
            if ((now - gameState.lastOctaveFlipTime) > 400) {
                gameState.lastOctaveFlipTime = now;
                lp.angle += Math.PI;
                lp.turnDir = 0;
                lp.turnHoldStart = 0;
                currentTurnVel = 0;
                playOctaveSnapSound();
                const statusEl = document.getElementById('status');
                if (statusEl) {
                    statusEl.textContent = `🔄 OCTAVE C SNAP! Flipped 180° to check your rear flank!`;
                }
            }
            return;
        }
    }

    // Diminished 7th EMP Pulse (B + D + F + G#)
    if (matchEmpChord(distinctPitches)) {
        if (gameState.pendingActionTimer !== null) {
            clearTimeout(gameState.pendingActionTimer);
            gameState.pendingActionTimer = null;
        }
        gameState.recentNoteBuffer = [];
        unmarkPitchHeld('D');
        lp.turnDir = 0;
        currentTurnVel = 0;
        if (now >= lp.empReadyAt) {
            await triggerEmpShockwave(bridge);
        } else {
            const secsLeft = Math.ceil((lp.empReadyAt - now) / 1000);
            playJamBuzzSound();
            const statusEl = document.getElementById('status');
            if (statusEl) statusEl.textContent = `⏳ Bdim7 EMP RECHARGING (${secsLeft}s)...`;
        }
        return;
    }

    // Musical Echo Holo-Decoys (Dm7 or Em7)
    const matchedDecoy = matchDecoyChord(distinctPitches);
    if (matchedDecoy) {
        if (gameState.pendingActionTimer !== null) {
            clearTimeout(gameState.pendingActionTimer);
            gameState.pendingActionTimer = null;
        }
        gameState.recentNoteBuffer = [];
        unmarkPitchHeld('C');
        unmarkPitchHeld('D');
        lp.turnDir = 0;
        currentTurnVel = 0;
        if (now >= lp.decoyReadyAt) {
            spawnHoloDecoy(matchedDecoy.label, bridge);
        } else {
            const secsLeft = Math.ceil((lp.decoyReadyAt - now) / 1000);
            playJamBuzzSound();
            const statusEl = document.getElementById('status');
            if (statusEl) statusEl.textContent = `⏳ HOLO-DECOY RECHARGING (${secsLeft}s)...`;
        }
        return;
    }

    // 4-Note Overcharge Shockwave (Cmaj7 or Fmaj7)
    const matchedOvercharge = matchOverchargeChord(distinctPitches);
    if (matchedOvercharge) {
        if (gameState.pendingActionTimer !== null) {
            clearTimeout(gameState.pendingActionTimer);
            gameState.pendingActionTimer = null;
        }
        gameState.recentNoteBuffer = [];
        unmarkPitchHeld('C');
        lp.turnDir = 0;
        currentTurnVel = 0;

        if (now >= lp.overchargeReadyAt) {
            lp.overchargeReadyAt = now + 15000;
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.textContent = `⚡ ${matchedOvercharge.label} FIRED! Wide-cone shockwave hits ANY target pitch! (15s recharge)`;
            }
            await fireLaserAttack('OVERCHARGE', bridge, true);
        } else {
            const secsLeft = Math.ceil((lp.overchargeReadyAt - now) / 1000);
            playJamBuzzSound();
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.textContent = `⏳ OVERCHARGE RECHARGING (${secsLeft}s remaining)...`;
            }
        }
        return;
    }

    // Suspended 4th Chords -> Temporary 2x Sniper Scope (8s active, 14s cooldown)
    const matchedSus4 = matchSus4Chord(distinctPitches);
    if (matchedSus4) {
        if (gameState.pendingActionTimer !== null) clearTimeout(gameState.pendingActionTimer);
        gameState.pendingActionTimer = setTimeout(() => {
            gameState.pendingActionTimer = null;
            gameState.recentNoteBuffer = [];
            unmarkPitchHeld('C');
            unmarkPitchHeld('D');
            lp.turnDir = 0;
            currentTurnVel = 0;
            const tNow = performance.now();

            if (tNow < (lp.sniperUntil || 0)) {
                if ((tNow - (lp.sniperActivatedAt || 0)) > 550) {
                    lp.sniperUntil = 0;
                    playSniperZoomSound(false);
                    const statusEl = document.getElementById('status');
                    if (statusEl) statusEl.textContent = `🔭 SNIPER OPTIC DISENGAGED.`;
                }
                return;
            }

            if (tNow >= (lp.sniperReadyAt || 0)) {
                lp.sniperUntil = tNow + 8000;
                lp.sniperReadyAt = tNow + 14000;
                lp.sniperActivatedAt = tNow;
                playSniperZoomSound(true);
                const statusEl = document.getElementById('status');
                if (statusEl) {
                    statusEl.textContent = `🔭 ${matchedSus4.label} ACTIVE! 2x Zoom & 2600px Range for 8s!`;
                }
            } else {
                const secsLeft = Math.ceil((lp.sniperReadyAt - tNow) / 1000);
                playJamBuzzSound();
                const statusEl = document.getElementById('status');
                if (statusEl) statusEl.textContent = `⏳ SNIPER OPTIC RECHARGING (${secsLeft}s)...`;
            }
        }, 55);
        return;
    }

    // Check 3-note White-Key Diatonic Triads for Speed Gears
    const matchedGear = matchDiatonicTriad(distinctPitches);
    if (matchedGear) {
        if (gameState.pendingActionTimer !== null) clearTimeout(gameState.pendingActionTimer);
        gameState.pendingActionTimer = setTimeout(() => {
            gameState.pendingActionTimer = null;
            gameState.recentNoteBuffer = [];
            unmarkPitchHeld('C');
            unmarkPitchHeld('D');
            if ((performance.now() - gameState.lastChordTriggerTime) > 350 || gameState.lastTriggeredChordId !== matchedGear.id) {
                gameState.lastChordTriggerTime = performance.now();
                gameState.lastTriggeredChordId = matchedGear.id;

                lp.currentGear = matchedGear;
                lp.turnDir = 0;
                lp.turnHoldStart = 0;
                currentTurnVel = 0;
                lp.gearBannerFlash = 1.0;
                playGearShiftSound(matchedGear.mult);

                const statusEl = document.getElementById('status');
                if (statusEl) {
                    statusEl.textContent = `🎛️ SPEED LOCKED: ${matchedGear.label} — Hold C# to move forward!`;
                }
            }
        }, 55);
        return;
    }

    // Anti-Spam Protection
    if (distinctPitches.size >= 2) {
        const CHORD_CANDIDATE_KEYS = new Set(['C', 'D', 'E', 'F', 'G', 'G#', 'A', 'B']);
        const allValid = Array.from(distinctPitches).every(n => CHORD_CANDIDATE_KEYS.has(n));

        if (allValid && (distinctPitches.size === 2 || distinctPitches.size === 3)) {
            if (gameState.pendingActionTimer !== null) clearTimeout(gameState.pendingActionTimer);
            gameState.pendingActionTimer = setTimeout(() => {
                gameState.pendingActionTimer = null;
                lp.jamFlash = 1.0;
                playJamBuzzSound();
                gameState.recentNoteBuffer = [];
            }, 105);
            return;
        }

        if (gameState.pendingActionTimer !== null) {
            clearTimeout(gameState.pendingActionTimer);
            gameState.pendingActionTimer = null;
        }
        lp.jamFlash = 1.0;
        playJamBuzzSound();
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = `⚠️ MULTI-NOTE SPAM BLOCKED! Play 1 note to shoot, C# to move, or a valid chord!`;
        }
        return;
    }

    // If C or D was pressed alone, movement is already active — no need to schedule a delayed shot
    if (pitchClass === 'C' || pitchClass === 'D') {
        return;
    }

    if (gameState.pendingActionTimer !== null) {
        clearTimeout(gameState.pendingActionTimer);
    }
    gameState.pendingActionTimer = setTimeout(() => {
        gameState.pendingActionTimer = null;
        const checkNow = performance.now();
        const activeNotes = gameState.recentNoteBuffer.filter(item => (checkNow - item.time) <= 130);
        const uniqueNow = new Set(activeNotes.map(item => item.pitchClass));
        if (uniqueNow.size === 1) {
            const singlePitch = Array.from(uniqueNow)[0];
            gameState.recentNoteBuffer = [];
            executeSingleNoteAction(singlePitch, bridge);
        }
    }, 85);
}

function gameLoop(now, bridge) {
    if (bridge.getActiveMiniGame() !== 'laserTag') {
        stopLaserTag();
        return;
    }

    const dt = Math.min(0.05, (now - gameState.lastFrameTime) / 1000);
    gameState.lastFrameTime = now;

    const canvas = document.getElementById('waterfall-canvas');
    if (!canvas) return;
    ensureCanvasSized(canvas);

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    if (Object.keys(gameState.simulatedBots).length > 0) {
        updateSimulatedBots(dt);
    }

    // Update running Holo-Decoys
    for (let i = gameState.activeDecoys.length - 1; i >= 0; i--) {
        const dec = gameState.activeDecoys[i];
        if (now >= dec.expiresAt) {
            gameState.activeDecoys.splice(i, 1);
            continue;
        }
        const dSpeed = 195;
        const nx = dec.x + Math.cos(dec.angle) * dSpeed * dt;
        const ny = dec.y + Math.sin(dec.angle) * dSpeed * dt;
        const col = Math.floor(nx / TILE_SIZE);
        const row = Math.floor(ny / TILE_SIZE);
        if (ARENA_MAP[row] && ARENA_MAP[row][col] === 0) {
            dec.x = nx;
            dec.y = ny;
        } else {
            dec.angle += Math.PI / 2;
        }
    }

    const activePlayers = Object.values(gameState.remotePlayers).filter(isPlayerActiveInRoom);
    const totalCount = Object.keys(gameState.remotePlayers).length;
    if (totalCount > gameState.maxPeakPlayers) gameState.maxPeakPlayers = totalCount;

    const lp = gameState.localPlayer;
    if (lp.isAlive) {
        // Fluid Hold-to-Turn with smooth angular acceleration & damping
        const leftHeld = gameState.heldMoveKeys.has('C') && isPitchStillPhysicallyHeld('C');
        const rightHeld = gameState.heldMoveKeys.has('D') && isPitchStillPhysicallyHeld('D');
        if (!leftHeld) gameState.heldMoveKeys.delete('C');
        if (!rightHeld) gameState.heldMoveKeys.delete('D');

        lp.turnDir = (leftHeld && !rightHeld) ? -1 : (rightHeld && !leftHeld) ? 1 : 0;

        const targetTurnVel = lp.turnDir * 1.95;
        currentTurnVel += (targetTurnVel - currentTurnVel) * Math.min(1, dt * 18);
        if (Math.abs(currentTurnVel) > 0.005) {
            lp.angle += currentTurnVel * dt;
        } else {
            currentTurnVel = 0;
        }

        // King of the Emerald Hub (+5 points per second inside central hub)
        if (isInsideEmeraldHub(lp.x, lp.y)) {
            lp.hubScoreTimer += dt;
            if (lp.hubScoreTimer >= 1.0) {
                lp.hubScoreTimer -= 1.0;
                lp.score += 5;
            }
        } else {
            lp.hubScoreTimer = 0;
        }

        // Fluid Hold-to-Move with smooth acceleration & deceleration
        const forwardHeld = gameState.heldMoveKeys.has('C#') && isPitchStillPhysicallyHeld('C#');
        if (!forwardHeld) gameState.heldMoveKeys.delete('C#');
        lp.isMovingForward = forwardHeld;

        const isBoosted = now < lp.boostUntil;
        const speedMult = lp.currentGear.mult * (isBoosted ? 1.5 : 1.0);
        const targetSpeed = (lp.isMovingForward && speedMult > 0) ? (190 * speedMult) : 0;
        currentMoveSpeed += (targetSpeed - currentMoveSpeed) * Math.min(1, dt * 16);

        if (currentMoveSpeed > 2) {
            lp.bobPhase += dt * (6.5 + speedMult * 5.0);

            const pad = 12;
            const dx = Math.cos(lp.angle) * currentMoveSpeed * dt;
            const dy = Math.sin(lp.angle) * currentMoveSpeed * dt;

            const checkX = lp.x + dx + (dx > 0 ? pad : -pad);
            const colX = Math.floor(checkX / TILE_SIZE);
            const curRow = Math.floor(lp.y / TILE_SIZE);
            if (ARENA_MAP[curRow] && ARENA_MAP[curRow][colX] === 0) {
                lp.x += dx;
            }

            const checkY = lp.y + dy + (dy > 0 ? pad : -pad);
            const curCol = Math.floor(lp.x / TILE_SIZE);
            const rowY = Math.floor(checkY / TILE_SIZE);
            if (ARENA_MAP[rowY] && ARENA_MAP[rowY][curCol] === 0) {
                lp.y += dy;
            }
        } else {
            currentMoveSpeed = 0;
        }

        // Speed Boost Pads Pickup
        for (const pad of gameState.speedBoostPads) {
            if (Math.hypot(lp.x - pad.x, lp.y - pad.y) < 34 && now >= lp.boostUntil - 1200) {
                lp.boostUntil = now + 2200;
                playSpeedBoostSweep();
                const statusEl = document.getElementById('status');
                if (statusEl) statusEl.textContent = `⚡ SPEED BOOST PAD ACTIVATED! (2.2s Turbo Surge)`;
            }
        }

        // Floating Med-Kit Pickup
        for (const med of gameState.medKitNodes) {
            if (now >= med.respawnAt && lp.lives < 3 && Math.hypot(lp.x - med.x, lp.y - med.y) < 34) {
                med.respawnAt = now + 18000;
                lp.lives = Math.min(3, lp.lives + 1);
                lp.hitsTaken = Math.max(0, 3 - lp.lives);
                playMedKitHealChime();
                spawn3DExplosion(med.x, med.y, '#f43f5e', 16);
                const statusEl = document.getElementById('status');
                if (statusEl) statusEl.textContent = `💖 MED-KIT COLLECTED! Shield restored to ${lp.lives} Lives!`;
            }
        }

        // Musical Challenge Beacons & Proximity
        lp.nearChallengeNode = null;
        if (gameState.challengeNodes) {
            for (const node of gameState.challengeNodes) {
                if (node.active) {
                    if (Math.random() < 0.35) spawn3DExplosion(node.x, node.y, '#a855f7', 4);
                    if (Math.random() < 0.15) spawn3DExplosion(node.x, node.y, '#facc15', 2);

                    if (Math.hypot(lp.x - node.x, lp.y - node.y) < 45) {
                        lp.nearChallengeNode = node;

                        const statusEl = document.getElementById('status');
                        if (statusEl && node.currentStep === 0) {
                            statusEl.textContent = `🎸 CHALLENGE: Play the first 3 notes of ${node.name}!`;
                        }
                    }
                } else if (!node.active && now >= node.respawnAt) {
                    node.active = true;
                    node.currentStep = 0;

                    const newChal = getRandomChallenge();
                    node.name = newChal.name;
                    node.sequence = newChal.sequence;
                }
            }
        }

        // Quantum Portal Teleportation
        if (gameState.arenaPortals.length === 2 && now >= lp.portalCooldownUntil) {
            for (let pIdx = 0; pIdx < 2; pIdx++) {
                const p = gameState.arenaPortals[pIdx];
                if (Math.hypot(lp.x - p.x, lp.y - p.y) < 36) {
                    const dest = gameState.arenaPortals[pIdx === 0 ? 1 : 0];
                    spawn3DExplosion(lp.x, lp.y, p.color, 20);
                    lp.x = dest.x;
                    lp.y = dest.y;
                    lp.portalCooldownUntil = now + 2600;
                    lp.portalFlash = 1.0;
                    playPortalWarpSound();
                    spawn3DExplosion(dest.x, dest.y, dest.color, 24);

                    const statusEl = document.getElementById('status');
                    if (statusEl) {
                        statusEl.textContent = `🌀 TELEPORTED via ${p.name} → ${dest.name}!`;
                    }
                    break;
                }
            }
        }
    }

    if (lp.isAlive) {
        renderFirstPerson3D(ctx, W, H, dt, now);
    } else {
        renderSpectatorOverheadView(ctx, W, H, dt, now);
    }

    renderMinimapAndTopHud(ctx, W, H, now, activePlayers);

    gameState.animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
}
