import { initAudio, audioCtx, playTone, playErrorClackSound } from './audio.js';
import { autoTransposeSong, parsePianoPad, getNoteFrequency } from './musicTheory.js';

export const ER_HOUSES = {
    Crown:     { name: 'Crown',     icon: '👑', color: '#facc15', textColor: '#000000' },
    Ignatius:  { name: 'Ignatius',  icon: '🔥', color: '#ef4444', textColor: '#ffffff' },
    Keira:     { name: 'Keira',     icon: '⛰️', color: '#22c55e', textColor: '#000000' },
    McMahon:   { name: 'McMahon',   icon: '🛡️', color: '#a855f7', textColor: '#ffffff' },
    Rice:      { name: 'Rice',      icon: '🕊️', color: '#f8fafc', textColor: '#0f172a' },
    Waterford: { name: 'Waterford', icon: '🌊', color: '#38bdf8', textColor: '#000000' }
};

export const ROOM_SIDES = {
    North: { name: 'North', label: 'North Side', icon: '⬆️', color: '#38bdf8', textColor: '#000000' },
    South: { name: 'South', label: 'South Side', icon: '⬇️', color: '#f97316', textColor: '#ffffff' }
};

export const CLASS_ROOMS = {
    G1: { name: 'G1', label: 'Room G1', icon: '🎹', color: '#38bdf8', textColor: '#000000' },
    G2: { name: 'G2', label: 'Room G2', icon: '🎧', color: '#facc15', textColor: '#000000' },
    G3: { name: 'G3', label: 'Room G3', icon: '🎼', color: '#22c55e', textColor: '#000000' }
};

export const koState = {
    isClassKnockout: false,
    isKnockoutHost: false,
    knockoutRoomCode: "",
    activeSabotageType: null,
    activeSabotageUntil: 0,
    smokeParticles: []
};

let knockoutUnsubscribe = null;
let knockoutLastRoundStarted = 0;
let knockoutLastRoundFinished = 0;
let knockoutFinaleShown = false;
let knockoutDataCache = null;
let knockoutLiveSyncTimer = null;

let koAutoNextInterval = null;
let koAutoNextSecondsLeft = 15;
let koAutoNextTargetRound = 0;

let knockoutSabotageCount = 0;
let lastProcessedSabotageId = null;
let koOpponentId = null;
let koOpponentName = "Opponent";
let koOpponentAvatar = "🤖";
let koMyHouse = "";
let koOppHouse = "";
let koMySide = "";
let koOppSide = "";
let koMyRoom = "";
let koOppRoom = "";
let lastProcessedOppEmoteId = null;
let koSelfEmoteHideTimer = null;
let koOppEmoteHideTimer = null;

// --- NAME THAT TUNE STATE ---
let nttSnippetTimers = [];
let nttRoundStartTimeMs = 0;
let nttHasAnsweredRound = false;
let nttReplaysRemaining = 2;

const NTT_FALLBACK_DISTRACTORS = [
    "Twinkle Twinkle Little Star",
    "Ode to Joy",
    "Für Elise",
    "Star Wars Main Theme",
    "Hedwig's Theme (Harry Potter)",
    "Super Mario Bros Theme",
    "Happy Birthday",
    "Baby Shark",
    "Jingle Bells",
    "Pirates of the Caribbean"
];

const NTT_CHOICE_COLORS = [
    { bg: '#dc2626', border: '#f87171', badge: '1' },
    { bg: '#2563eb', border: '#60a5fa', badge: '2' },
    { bg: '#d97706', border: '#fbbf24', badge: '3' },
    { bg: '#059669', border: '#34d399', badge: '4' },
    { bg: '#7c3aed', border: '#a78bfa', badge: '5' },
    { bg: '#db2777', border: '#f472b6', badge: '6' },
    { bg: '#0891b2', border: '#22d3ee', badge: '7' },
    { bg: '#4f46e5', border: '#818cf8', badge: '8' }
];

let bridge = null;

const KO_HYPE_EMOTES = [
    "😤 LOCKED IN", "🔥 TOO EASY", "😎 WATCH THIS", "⚡ LIGHT WORK", "👑 BOW DOWN",
    "🚀 BUILT DIFFERENT", "🎯 100% INCOMING", "🧊 ICE COLD", "💪 NO SWEAT", "🧠 BIG BRAIN",
    "🎹 PIANO GOD", "🦖 BEAST MODE", "🏆 ALREADY WON", "🌟 MAIN CHARACTER", "🔋 FULL POWER",
    "💀 RIP BRO", "🪦 GG EZ", "🧹 GET SWEPT", "🧂 PASS THE SALT", "📉 YOUR ACCURACY",
    "🐢 TOO SLOW", "🤡 NICE TRY", "🧯 CALL THE FIRE DEPT", "🎒 PACK YOUR BAGS", "💤 WAKE ME UP",
    "🧀 SKILL ISSUE", "🚧 WRONG KEY BRO", "🗑️ OUTTA MY WAY", "👀 DON'T BLINK", "📉 CHOKING INCOMING",
    "🙏 PRAY FOR ME", "💦 SWEATING BULLETS", "🫠 MY FINGERS HURT", "🐌 LAG!", "😬 OH NO...",
    "🎲 PURE LUCK", "🆘 SEND HELP", "🫣 I FORGOT THE NOTES", "🍌 SLIPPERY KEYS", "🎲 YOLO",
    "🐢 PRACTICE SPEED PLS", "😅 MERCY PLS", "🤝 GG", "🫡 RESPECT", "⚔️ BRING IT ON",
    "🍿 POPCORN READY", "🚨 UPSET ALERT", "🌪️ CHAOS TIME", "💣 SABOTAGE INCOMING", "🎉 LET'S GOOO!",
    "😏 RIZZ", "🤫🧏‍♂️ MEWING", "🍳 YOU'RE COOKED", "🧢 NO CAP", "🗿 SIGMA",
    "🌽 ONLY IN OHIO", "🚽 SKIBIDI"
];

export function initKnockoutBridge(deps) {
    bridge = deps;
}

// ==========================================
// NAME THAT TUNE AUDIO & QUIZ ENGINE
// ==========================================
function stopNameThatTuneAudio() {
    nttSnippetTimers.forEach(id => clearTimeout(id));
    nttSnippetTimers = [];
    const wave = document.getElementById('ntt-soundwave');
    if (wave) wave.classList.remove('playing');
}

function hideNameThatTuneModal() {
    stopNameThatTuneAudio();
    const modal = document.getElementById('ntt-quiz-modal');
    if (modal) modal.classList.remove('open');
}

function generateNameThatTuneChoices(correctTitle, songList) {
    const cleanCorrect = (correctTitle || '').trim();
    const pool = new Set();

    (songList || []).forEach(s => {
        const t = (s.title || '').trim();
        if (t && t.toLowerCase() !== cleanCorrect.toLowerCase()) {
            pool.add(t);
        }
    });

    for (const fallback of NTT_FALLBACK_DISTRACTORS) {
        if (pool.size >= 12) break;
        if (fallback.toLowerCase() !== cleanCorrect.toLowerCase()) {
            pool.add(fallback);
        }
    }

    const distractors = Array.from(pool)
        .sort(() => Math.random() - 0.5)
        .slice(0, 7);

    return [cleanCorrect, ...distractors].sort(() => Math.random() - 0.5);
}

function playSongSnippet(songCode, noteCount = 5) {
    stopNameThatTuneAudio();
    initAudio();

    const parsed = parsePianoPad(songCode || '');
    if (!parsed || parsed.length === 0) return;

    const transposed = autoTransposeSong(parsed);
    const slice = transposed.slice(0, Math.max(2, noteCount));

    const wave = document.getElementById('ntt-soundwave');
    if (wave) wave.classList.add('playing');

    let cumulativeMs = 150;
    slice.forEach((step, idx) => {
        if (idx > 0) {
            cumulativeMs += Math.max(180, Math.min(900, step.rest || 320));
        }
        const durSec = Math.max(0.22, Math.min(0.85, ((step.rest || 320) * 0.85) / 1000));

        const tId = setTimeout(() => {
            (step.notes || []).forEach(noteStr => {
                const freq = getNoteFrequency(noteStr);
                if (freq) playTone(freq, durSec, 1.0);
            });
        }, cumulativeMs);
        nttSnippetTimers.push(tId);
    });

    const endId = setTimeout(() => {
        if (wave) wave.classList.remove('playing');
    }, cumulativeMs + 550);
    nttSnippetTimers.push(endId);
}

function playNttCorrectChime() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880.00, now + 0.08);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    } catch (e) {}
}

function ensureNameThatTuneModal() {
    if (document.getElementById('ntt-quiz-modal')) return;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes nttBarBounce {
            0%, 100% { transform: scaleY(0.3); }
            50% { transform: scaleY(1.0); }
        }
        #ntt-soundwave.playing .ntt-bar {
            animation: nttBarBounce 0.45s infinite ease-in-out;
        }
        .ntt-bar {
            width: 5px;
            height: 22px;
            background: #38bdf8;
            border-radius: 3px;
            transform: scaleY(0.3);
            transition: transform 0.2s;
        }
        .ntt-choice-btn {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 13px 14px;
            border-radius: 10px;
            border: 2px solid rgba(255,255,255,0.25);
            color: #ffffff;
            font-weight: 800;
            font-size: 0.92rem;
            text-align: left;
            cursor: pointer;
            transition: transform 0.1s, filter 0.15s, opacity 0.2s;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        }
        .ntt-choice-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            filter: brightness(1.12);
        }
        .ntt-choice-btn:disabled {
            cursor: default;
        }
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'ntt-quiz-modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '360';
    modal.innerHTML = `
        <div class="modal" style="max-width: 760px; width: 95%; background: #090d16; border: 2px solid #38bdf8; box-shadow: 0 0 40px rgba(56,189,248,0.35);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:10px;">
                <div>
                    <span id="ntt-round-badge" style="background:#38bdf8; color:#0f172a; font-weight:900; font-size:0.75rem; padding:3px 9px; border-radius:6px; text-transform:uppercase;">ROUND 1 • NAME THAT TUNE</span>
                    <span id="ntt-house-pill" style="margin-left:6px; font-size:0.78rem; font-weight:800;"></span>
                </div>
                <button type="button" id="btn-ntt-replay" style="background:#1e293b; color:#facc15; border:1px solid #facc15; border-radius:8px; padding:6px 12px; font-weight:800; font-size:0.8rem; cursor:pointer;">
                    🔊 Replay Notes (2 left)
                </button>
            </div>

            <div style="text-align:center; margin:12px 0 8px 0;">
                <div style="display:inline-flex; align-items:center; gap:5px; height:26px; margin-bottom:6px;" id="ntt-soundwave">
                    <div class="ntt-bar" style="animation-delay:0.0s;"></div>
                    <div class="ntt-bar" style="animation-delay:0.1s;"></div>
                    <div class="ntt-bar" style="animation-delay:0.2s;"></div>
                    <div class="ntt-bar" style="animation-delay:0.15s;"></div>
                    <div class="ntt-bar" style="animation-delay:0.05s;"></div>
                    <div class="ntt-bar" style="animation-delay:0.25s;"></div>
                    <div class="ntt-bar" style="animation-delay:0.12s;"></div>
                </div>
                <h2 id="ntt-prompt-title" style="margin:0; color:#ffffff; font-size:1.25rem;">🎧 Listen to the first 5 notes & pick the song!</h2>
                <div id="ntt-feedback-banner" style="margin-top:6px; font-size:0.92rem; font-weight:800; color:#94a3b8;">
                    Faster correct answers earn up to 100% score! (Press keys 1–8 or tap below)
                </div>
            </div>

            <div id="ntt-choices-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:10px; margin:12px 0;"></div>

            <div id="ntt-live-progress" style="background:#0f172a; border:1px solid #1e293b; border-radius:8px; padding:8px 12px; font-size:0.78rem; color:#cbd5e1; display:flex; justify-content:space-between; align-items:center;">
                <span id="ntt-answered-count">Waiting for your answer...</span>
                <button type="button" class="btn-danger" style="padding:4px 10px; font-size:0.74rem;" onclick="leaveClassKnockout()">Leave</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    window.addEventListener('keydown', (e) => {
        const m = document.getElementById('ntt-quiz-modal');
        if (!m || !m.classList.contains('open') || nttHasAnsweredRound) return;
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 8) {
            const btn = document.querySelector(`.ntt-choice-btn[data-choice-idx="${num - 1}"]`);
            if (btn && !btn.disabled) btn.click();
        }
    });
}

function launchStudentNameThatTuneRound(data, houseBadgeHtml, onAnswerSubmit) {
    ensureNameThatTuneModal();

    const ntt = data.nttData || {};
    const choices = Array.isArray(ntt.choices) ? ntt.choices : Object.values(ntt.choices || {});
    const noteCount = Number(ntt.noteCount || 5);
    const correctTitle = data.songTitle || '';

    nttHasAnsweredRound = false;
    nttReplaysRemaining = 2;
    nttRoundStartTimeMs = performance.now();

    document.getElementById('ntt-round-badge').textContent = `ROUND ${data.round || 1} • NAME THAT TUNE`;
    document.getElementById('ntt-house-pill').innerHTML = houseBadgeHtml || '';
    document.getElementById('ntt-prompt-title').textContent = `🎧 Listen to the first ${noteCount} notes — Which song is it?`;
    document.getElementById('ntt-feedback-banner').innerHTML = `<span style="color:#38bdf8;">Answer fast for up to 100% score! (Tap a title or press 1–8)</span>`;
    document.getElementById('ntt-answered-count').textContent = 'Select 1 of the 8 songs above...';

    const replayBtn = document.getElementById('btn-ntt-replay');
    replayBtn.disabled = false;
    replayBtn.style.opacity = '1';
    replayBtn.textContent = `🔊 Replay Notes (${nttReplaysRemaining} left)`;
    replayBtn.onclick = () => {
        if (nttReplaysRemaining <= 0) return;
        nttReplaysRemaining--;
        replayBtn.textContent = nttReplaysRemaining > 0 ? `🔊 Replay Notes (${nttReplaysRemaining} left)` : '🔇 No Replays Left';
        if (nttReplaysRemaining <= 0) {
            replayBtn.disabled = true;
            replayBtn.style.opacity = '0.5';
        }
        playSongSnippet(data.songCode, noteCount);
    };

    const grid = document.getElementById('ntt-choices-grid');
    grid.innerHTML = choices.map((title, idx) => {
        const theme = NTT_CHOICE_COLORS[idx % NTT_CHOICE_COLORS.length];
        return `
            <button type="button" class="ntt-choice-btn" data-choice-idx="${idx}" data-song-title="${title.replace(/"/g, '&quot;')}"
                style="background:${theme.bg}; border-color:${theme.border};">
                <span style="background:rgba(0,0,0,0.35); width:26px; height:26px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; font-weight:900; flex-shrink:0;">
                    ${theme.badge}
                </span>
                <span style="line-height:1.25;">${title}</span>
            </button>
        `;
    }).join('');

    grid.querySelectorAll('.ntt-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (nttHasAnsweredRound) return;
            nttHasAnsweredRound = true;
            stopNameThatTuneAudio();

            const chosenTitle = btn.getAttribute('data-song-title');
            const isCorrect = chosenTitle.trim().toLowerCase() === correctTitle.trim().toLowerCase();
            const responseSec = Math.max(0.2, (performance.now() - nttRoundStartTimeMs) / 1000);

            let roundScore = 0;
            if (isCorrect) {
                roundScore = Math.max(55, Math.min(100, 100 - Math.max(0, responseSec - 1.2) * 3.0));
                playNttCorrectChime();
                document.getElementById('ntt-feedback-banner').innerHTML =
                    `<span style="color:#22c55e; font-size:1.05rem;">✅ CORRECT! "${correctTitle}" — Earned ${roundScore.toFixed(1)}% (${responseSec.toFixed(1)}s)</span>`;
            } else {
                playErrorClackSound();
                document.getElementById('ntt-feedback-banner').innerHTML =
                    `<span style="color:#ef4444; font-size:1.05rem;">❌ WRONG! The song was "${correctTitle}" (0.0%)</span>`;
            }

            grid.querySelectorAll('.ntt-choice-btn').forEach(b => {
                b.disabled = true;
                const bTitle = b.getAttribute('data-song-title');
                if (bTitle.trim().toLowerCase() === correctTitle.trim().toLowerCase()) {
                    b.style.background = '#16a34a';
                    b.style.borderColor = '#bbf7d0';
                    b.style.boxShadow = '0 0 18px rgba(34,197,94,0.85)';
                    b.style.opacity = '1';
                } else if (b === btn && !isCorrect) {
                    b.style.background = '#991b1b';
                    b.style.borderColor = '#fca5a5';
                    b.style.opacity = '1';
                } else {
                    b.style.opacity = '0.32';
                }
            });

            document.getElementById('ntt-answered-count').textContent = 'Answer locked! Waiting for classmates to finish...';

            if (onAnswerSubmit) {
                onAnswerSubmit({
                    score: Number(roundScore.toFixed(1)),
                    isCorrect,
                    responseSec: Number(responseSec.toFixed(2)),
                    chosenTitle
                });
            }
        });
    });

    document.getElementById('ntt-quiz-modal').classList.add('open');
    playSongSnippet(data.songCode, noteCount);
}

function updateNameThatTuneProgressText(answeredCount, totalCount) {
    const el = document.getElementById('ntt-answered-count');
    if (el && nttHasAnsweredRound) {
        el.textContent = `⏳ ${answeredCount} of ${totalCount} students have answered...`;
    }
}

// ==========================================
// TOURNAMENT & AUTO-NEXT ENGINE
// ==========================================

export async function kickKnockoutPlayer(playerId, playerName) {
    if (!koState.isKnockoutHost || !koState.knockoutRoomCode || !window.firebaseDb) return;
    if (!confirm(`Are you sure you want to remove ${playerName} from the tournament?`)) return;

    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    const updates = {};
    updates[`players/${playerId}`] = null;
    await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}`), updates);
}

function clearKnockoutAutoNextTimer() {
    if (koAutoNextInterval) {
        clearInterval(koAutoNextInterval);
        koAutoNextInterval = null;
    }
    koAutoNextTargetRound = 0;
}

function advanceToNextKnockoutSong() {
    const koSongSel = document.getElementById('ko-song-select');
    if (!koSongSel || koSongSel.options.length <= 1) return;
    const nextIdx = (koSongSel.selectedIndex + 1) % koSongSel.options.length;
    koSongSel.selectedIndex = nextIdx;
}

function startKnockoutAutoNextTimer(completedRound) {
    if (koAutoNextInterval && koAutoNextTargetRound === completedRound) return;
    clearKnockoutAutoNextTimer();

    koAutoNextTargetRound = completedRound;
    koAutoNextSecondsLeft = 15;

    const updateBanner = () => {
        const statusBanner = document.getElementById('ko-status-banner');
        if (statusBanner) {
            statusBanner.innerHTML = `Round ${completedRound} Complete! <span style="color:#facc15;">⏱️ Auto-starting Round ${completedRound + 1} with next song in ${koAutoNextSecondsLeft}s...</span>`;
        }
    };

    updateBanner();

    koAutoNextInterval = setInterval(() => {
        const toggle = document.getElementById('ko-auto-next-toggle');
        if (!toggle || !toggle.checked || !koState.isKnockoutHost || !knockoutDataCache || knockoutDataCache.status !== 'round_results') {
            clearKnockoutAutoNextTimer();
            return;
        }

        koAutoNextSecondsLeft--;
        if (koAutoNextSecondsLeft > 0) {
            updateBanner();
        } else {
            clearKnockoutAutoNextTimer();
            advanceToNextKnockoutSong();
            startNextKnockoutRound();
        }
    }, 1000);
}

function updateTeacherNttControlsVisibility(modeVal) {
    const nttBar = document.getElementById('ko-ntt-settings-bar');
    const footer = document.getElementById('ko-footer-caption');
    if (nttBar) {
        nttBar.style.display = modeVal === 'namethattune' ? 'flex' : 'none';
    }
    if (footer) {
        footer.textContent = modeVal === 'namethattune'
            ? '🎵 Name That Tune • 8-Choice Audio Quiz • No Piano Keyboard Needed • Individual or House Scoring'
            : 'Swiss Placement Ladder • Zero Elimination • Everyone plays every round';
    }
}

export function initSwissTournamentUI() {
    const menuBtns = document.getElementById('sprint-menu-buttons');
    if (menuBtns && !document.getElementById('btn-host-knockout-opt')) {
        const btnKo = document.createElement('button');
        btnKo.type = 'button';
        btnKo.id = 'btn-host-knockout-opt';
        btnKo.className = 'btn-teacher';
        btnKo.style.background = '#ef4444';
        btnKo.style.justifyContent = 'center';
        btnKo.innerHTML = '🏆 Host Class Knockout (Teacher)';
        btnKo.onclick = openTeacherKnockoutSetup;
        menuBtns.appendChild(btnKo);
    }

    if (!document.getElementById('knockout-modal')) {
        const koModal = document.createElement('div');
        koModal.id = 'knockout-modal';
        koModal.className = 'modal-overlay';
        koModal.style.zIndex = '350';
        koModal.innerHTML = `
            <div class="modal" style="max-width: 840px; width: 95%; max-height: 90vh; overflow-y: auto; border: 2px solid #ef4444; background: #0a0a0a;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #374151; padding-bottom:10px;">
                    <h2 id="ko-modal-title" style="color:#ffffff; margin:0;">🏆 Class Tournament & Battle Arena</h2>
                    <span id="ko-room-badge" style="background:#ef4444; color:#fff; padding:4px 12px; border-radius:6px; font-weight:800; font-size:0.95rem;">Code: ---</span>
                </div>

                <div id="ko-teacher-panel" style="display:none; flex-direction:column; gap:12px;">
                    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; background:#111; padding:10px; border-radius:8px; border:1px solid #374151;">
                        <div style="min-width:235px;">
                            <label style="font-size:0.72rem; color:#9ca3af; font-weight:700; display:block; margin-bottom:4px;">BATTLE MODE:</label>
                            <select id="ko-mode-select" style="width:100%; background:#000; color:#fff; border:1px solid #4b5563; border-radius:6px; padding:6px 8px; font-weight:700;">
                                <option value="solo" selected>⚔️ Individual Swiss (Default)</option>
                                <option value="house">🏰 House Relay Mode (6 Houses)</option>
                                <option value="sides">🧭 North Side vs. South Side</option>
                                <option value="rooms">🏫 Room Battle (G1 vs. G2 vs. G3)</option>
                                <option value="namethattune">🎵 Name That Tune (8-Choice Quiz)</option>
                                <option value="lasertag">🛸 Neon Laser Tag (Free-For-All Arena)</option>
                            </select>
                        </div>
                        <div style="flex:1; min-width:200px;">
                            <label style="font-size:0.72rem; color:#9ca3af; font-weight:700; display:block; margin-bottom:4px;">SELECT SONG FOR NEXT ROUND:</label>
                            <select id="ko-song-select" style="width:100%; max-width:100%; background:#000; color:#fff;"></select>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                            <label id="ko-auto-next-label" title="Automatically advance to the next song and start the next round 15 seconds after a round ends" style="display:inline-flex; align-items:center; gap:6px; background:#1f2937; border:1px solid #4b5563; color:#facc15; padding:7px 10px; border-radius:6px; font-size:0.8rem; font-weight:800; cursor:pointer; user-select:none;">
                                <input type="checkbox" id="ko-auto-next-toggle" style="accent-color:#22c55e; width:15px; height:15px; cursor:pointer; margin:0;">
                                <span>⏱️ Auto-Next (15s)</span>
                            </label>
                            <button type="button" id="btn-ko-start-round" class="btn-success" style="padding:8px 14px; font-size:0.85rem; background:#ef4444;">▶ Start Round 1</button>
                            <button type="button" id="btn-ko-force-end" class="btn-warning" style="display:none; padding:8px 12px; font-size:0.82rem;">⚡ Force End Round</button>
                            <button type="button" id="btn-ko-finish-tourney" class="btn-arcade" style="display:none; padding:8px 12px; font-size:0.82rem; background:#facc15; color:#000; font-weight:900;">🏅 End & Podium</button>
                        </div>
                    </div>

                    <!-- Name That Tune Specific Teacher Controls -->
                    <div id="ko-ntt-settings-bar" style="display:none; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; background:#0f172a; padding:10px 12px; border-radius:8px; border:1px solid #38bdf8;">
                        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                            <label style="font-size:0.78rem; color:#38bdf8; font-weight:800;">🎵 NOTES TO PLAY:</label>
                            <select id="ko-ntt-note-count" style="background:#000; color:#fff; border:1px solid #38bdf8; border-radius:6px; padding:5px 8px; font-weight:800;">
                                <option value="3">First 3 Notes (Expert)</option>
                                <option value="4">First 4 Notes (Hard)</option>
                                <option value="5" selected>First 5 Notes (Standard)</option>
                                <option value="6">First 6 Notes (Medium)</option>
                                <option value="8">First 8 Notes (Easy)</option>
                                <option value="10">First 10 Notes (Beginner)</option>
                            </select>

                            <label style="display:inline-flex; align-items:center; gap:6px; background:#1e293b; border:1px solid #475569; color:#facc15; padding:5px 10px; border-radius:6px; font-size:0.78rem; font-weight:800; cursor:pointer; user-select:none;">
                                <input type="checkbox" id="ko-ntt-house-toggle" checked style="accent-color:#facc15; width:15px; height:15px; cursor:pointer; margin:0;">
                                <span>🏰 Group in Houses</span>
                            </label>
                        </div>

                        <button type="button" id="btn-ko-ntt-teacher-play" style="background:#38bdf8; color:#0f172a; border:none; border-radius:6px; padding:6px 12px; font-weight:900; font-size:0.8rem; cursor:pointer;">
                            🔊 Preview Snippet Here
                        </button>
                    </div>

                    <div id="ko-status-banner" style="font-size:0.85rem; color:#ffffff; font-weight:700; text-align:center;">
                        Waiting for students to join using Room Code above...
                    </div>

                    <div id="ko-bracket-container" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:10px; max-height:320px; overflow-y:auto;"></div>

                    <div id="ko-standings-container" style="background:#111; border:1px solid #374151; border-radius:8px; padding:10px; max-height:220px; overflow-y:auto;"></div>
                </div>

                <div id="ko-student-panel" style="display:none; flex-direction:column; gap:12px; text-align:center;">
                    <div id="ko-student-status" style="font-size:1rem; color:#ffffff; font-weight:800;">
                        Connected to Class Battle! Waiting for Teacher to start Round 1...
                    </div>

                    <div id="ko-team-picker-box" style="display:none; background:#111; border:1px solid #4b5563; border-radius:10px; padding:12px;">
                        <div id="ko-team-picker-title" style="font-size:0.8rem; font-weight:800; color:#facc15; margin-bottom:8px; letter-spacing:0.04em;">
                            CHOOSE YOUR TEAM:
                        </div>
                        <div id="ko-team-buttons" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;"></div>
                    </div>

                    <div id="ko-student-pairing-box" style="background:#111; border:1px solid #374151; border-radius:8px; padding:12px; font-size:0.9rem; color:#fff;"></div>
                    <div id="ko-student-standings" style="background:#111; border:1px solid #374151; border-radius:8px; padding:10px; max-height:240px; overflow-y:auto; text-align:left;"></div>
                </div>

                <div class="modal-footer" style="justify-content:space-between; border-top:1px solid #374151; padding-top:10px;">
                    <span id="ko-footer-caption" style="font-size:0.75rem; color:#9ca3af;">Swiss Placement Ladder • Zero Elimination • Everyone plays every round</span>
                    <button type="button" class="btn-danger" style="background:#ef4444;" onclick="leaveClassKnockout()">Exit Tournament</button>
                </div>
            </div>
        `;
        document.body.appendChild(koModal);

        document.getElementById('ko-mode-select').addEventListener('change', async (e) => {
            const modeVal = e.target.value;
            updateTeacherNttControlsVisibility(modeVal);
            if (!koState.isKnockoutHost || !koState.knockoutRoomCode || !window.firebaseDb) return;
            const houseEnabled = document.getElementById('ko-ntt-house-toggle')?.checked ?? true;
            const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
            await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}`), {
                tournamentMode: modeVal,
                nttGroupHouses: houseEnabled
            });
        });

        document.getElementById('ko-ntt-house-toggle').addEventListener('change', async (e) => {
            if (!koState.isKnockoutHost || !koState.knockoutRoomCode || !window.firebaseDb) return;
            const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
            await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}`), {
                nttGroupHouses: e.target.checked
            });
        });

        document.getElementById('btn-ko-ntt-teacher-play').addEventListener('click', () => {
            const koSongSel = document.getElementById('ko-song-select');
            const noteCountSel = document.getElementById('ko-ntt-note-count');
            const code = koSongSel ? koSongSel.value : '';
            const count = noteCountSel ? parseInt(noteCountSel.value, 10) : 5;
            if (code) playSongSnippet(code, count);
        });

        document.getElementById('ko-auto-next-toggle').addEventListener('change', (e) => {
            const label = document.getElementById('ko-auto-next-label');
            if (label) {
                label.style.borderColor = e.target.checked ? '#22c55e' : '#4b5563';
                label.style.background = e.target.checked ? '#052e16' : '#1f2937';
            }

            if (!e.target.checked) {
                clearKnockoutAutoNextTimer();
                if (knockoutDataCache && knockoutDataCache.status === 'round_results') {
                    const statusBanner = document.getElementById('ko-status-banner');
                    if (statusBanner) {
                        statusBanner.textContent = `Round ${knockoutDataCache.round} Complete! Ready for Round ${knockoutDataCache.round + 1}.`;
                    }
                }
            } else if (koState.isKnockoutHost && knockoutDataCache && knockoutDataCache.status === 'round_results') {
                startKnockoutAutoNextTimer(knockoutDataCache.round);
            }
        });

        document.getElementById('btn-ko-start-round').addEventListener('click', startNextKnockoutRound);
        document.getElementById('btn-ko-force-end').addEventListener('click', forceEndKnockoutRound);
        document.getElementById('btn-ko-finish-tourney').addEventListener('click', finalizeClassKnockout);
    }

    if (!document.getElementById('ko-vs-overlay')) {
        const vsOverlay = document.createElement('div');
        vsOverlay.id = 'ko-vs-overlay';
        vsOverlay.className = 'countdown-overlay';
        vsOverlay.style.zIndex = '250';
        vsOverlay.innerHTML = `
            <div style="background:#0a0a0a; border:3px solid #ffffff; border-radius:16px; padding:24px 32px; text-align:center; max-width:600px; width:92%; box-shadow:0 0 40px rgba(239,68,68,0.5);">
                <div id="ko-vs-round-label" style="color:#ef4444; font-weight:900; font-size:1.1rem; letter-spacing:0.08em; text-transform:uppercase;">ROUND 1 MATCHUP</div>
                <div style="display:flex; align-items:center; justify-content:space-around; gap:16px; margin:16px 0;">
                    <div style="flex:1;">
                        <div id="ko-vs-p1-avatar" style="font-size:3.2rem;">🏃</div>
                        <div id="ko-vs-p1-name" style="font-size:1.15rem; font-weight:800; color:#fff; margin-top:4px;">You</div>
                        <div id="ko-vs-p1-rank" style="font-size:0.8rem; color:#ffffff; font-weight:700;">Rank #1</div>
                        <div id="ko-vs-p1-emote" class="ko-emote-bubble">😤 LOCKED IN</div>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:center; gap:6px;">
                        <div style="font-size:2.4rem; font-weight:900; color:#ef4444; text-shadow:0 0 15px #ef4444;">VS</div>
                        <div id="ko-vs-rivalry-badge" style="display:none; background:linear-gradient(90deg, #f97316, #ef4444); color:#ffffff; font-size:0.68rem; font-weight:900; padding:3px 9px; border-radius:999px; letter-spacing:0.05em; box-shadow:0 0 14px rgba(239,68,68,0.85); white-space:nowrap;">🔥 REMATCH RIVALRY</div>
                    </div>
                    <div style="flex:1;">
                        <div id="ko-vs-p2-avatar" style="font-size:3.2rem;">🤖</div>
                        <div id="ko-vs-p2-name" style="font-size:1.15rem; font-weight:800; color:#fff; margin-top:4px;">Opponent</div>
                        <div id="ko-vs-p2-rank" style="font-size:0.8rem; color:#ffffff; font-weight:700;">Rank #2</div>
                        <div id="ko-vs-p2-emote" class="ko-emote-bubble">💀 RIP BRO</div>
                    </div>
                </div>
                <div id="ko-vs-song-label" style="font-size:0.9rem; color:#9ca3af; font-weight:700;">Song: Wipeout</div>
                <div class="ko-emote-deck" id="ko-emote-deck"></div>
            </div>
        `;
        document.body.appendChild(vsOverlay);
    }
}

function getTeamBadgeHTML(player, mode, nttGroupHouses = true) {
    if (mode === 'house' || (mode === 'namethattune' && nttGroupHouses)) {
        const h = ER_HOUSES[player.house];
        if (!h) return '';
        return `<span style="display:inline-flex; align-items:center; gap:3px; background:${h.color}; color:${h.textColor}; font-size:0.68rem; font-weight:900; padding:1px 6px; border-radius:4px; margin-left:5px; border:1px solid rgba(255,255,255,0.25);">${h.icon} ${h.name}</span>`;
    }
    if (mode === 'sides') {
        const s = ROOM_SIDES[player.side];
        if (!s) return '';
        return `<span style="display:inline-flex; align-items:center; gap:3px; background:${s.color}; color:${s.textColor}; font-size:0.68rem; font-weight:900; padding:1px 6px; border-radius:4px; margin-left:5px;">${s.icon} ${s.label}</span>`;
    }
    if (mode === 'rooms') {
        const r = CLASS_ROOMS[player.roomTeam];
        if (!r) return '';
        return `<span style="display:inline-flex; align-items:center; gap:3px; background:${r.color}; color:${r.textColor}; font-size:0.68rem; font-weight:900; padding:1px 6px; border-radius:4px; margin-left:5px;">${r.icon} ${r.name}</span>`;
    }
    return '';
}

function renderStudentTeamPicker(mode, selectedVal) {
    const box = document.getElementById('ko-team-picker-box');
    const title = document.getElementById('ko-team-picker-title');
    const grid = document.getElementById('ko-team-buttons');
    if (!box || !grid) return;

    box.style.display = 'block';

    if (mode === 'rooms') {
        title.textContent = '🏫 ROOM BATTLE ACTIVE — CONFIRM YOUR MUSIC ROOM:';
        grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
        grid.innerHTML = Object.values(CLASS_ROOMS).map(r => {
            const isSelected = selectedVal === r.name;
            return `
                <button type="button" onclick="selectKnockoutTeam('rooms', '${r.name}')" style="
                    background: ${isSelected ? r.color : '#1f2937'};
                    color: ${isSelected ? r.textColor : '#ffffff'};
                    border: 2px solid ${r.color};
                    border-radius: 8px;
                    padding: 12px 8px;
                    font-weight: 900;
                    font-size: 0.95rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    box-shadow: ${isSelected ? `0 0 14px ${r.color}` : 'none'};
                ">
                    <span style="font-size:1.25rem;">${r.icon}</span>
                    <span>${r.label}</span>
                </button>
            `;
        }).join('');
        return;
    }

    if (mode === 'sides') {
        title.textContent = '🧭 NORTH VS. SOUTH ACTIVE — WHICH SIDE OF THE ROOM ARE YOU ON?';
        grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        grid.innerHTML = Object.values(ROOM_SIDES).map(s => {
            const isSelected = selectedVal === s.name;
            return `
                <button type="button" onclick="selectKnockoutTeam('sides', '${s.name}')" style="
                    background: ${isSelected ? s.color : '#1f2937'};
                    color: ${isSelected ? s.textColor : '#ffffff'};
                    border: 2px solid ${s.color};
                    border-radius: 8px;
                    padding: 12px 8px;
                    font-weight: 900;
                    font-size: 0.95rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    box-shadow: ${isSelected ? `0 0 14px ${s.color}` : 'none'};
                ">
                    <span style="font-size:1.3rem;">${s.icon}</span>
                    <span>${s.label}</span>
                </button>
            `;
        }).join('');
        return;
    }

    title.textContent = mode === 'namethattune'
        ? '🎵 NAME THAT TUNE (HOUSE CUP) — CHOOSE YOUR HOUSE:'
        : '🏰 HOUSE RELAY MODE ACTIVE — CHOOSE YOUR HOUSE:';
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    grid.innerHTML = Object.values(ER_HOUSES).map(h => {
        const isSelected = selectedVal === h.name;
        return `
            <button type="button" onclick="selectKnockoutTeam('house', '${h.name}')" style="
                background: ${isSelected ? h.color : '#1f2937'};
                color: ${isSelected ? h.textColor : '#ffffff'};
                border: 2px solid ${h.color};
                border-radius: 8px;
                padding: 8px 6px;
                font-weight: 800;
                font-size: 0.82rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                box-shadow: ${isSelected ? `0 0 12px ${h.color}` : 'none'};
            ">
                <span style="font-size:1.1rem;">${h.icon}</span>
                <span>${h.name}</span>
            </button>
        `;
    }).join('');
}

export async function selectKnockoutTeam(mode, value) {
    if (!koState.knockoutRoomCode || !window.firebaseDb) return;
    const { localStudentId } = bridge.getState();
    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");

    if (mode === 'rooms' && CLASS_ROOMS[value]) {
        koMyRoom = value;
        localStorage.setItem('pianopad_room', value);
        renderStudentTeamPicker('rooms', value);
        await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}/players/${localStudentId}`), {
            roomTeam: value
        });
    } else if (mode === 'sides' && ROOM_SIDES[value]) {
        koMySide = value;
        localStorage.setItem('pianopad_side', value);
        renderStudentTeamPicker('sides', value);
        await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}/players/${localStudentId}`), {
            side: value
        });
    } else if (mode === 'house' && ER_HOUSES[value]) {
        koMyHouse = value;
        localStorage.setItem('pianopad_house', value);
        renderStudentTeamPicker(knockoutDataCache?.tournamentMode || 'house', value);
        await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}/players/${localStudentId}`), {
            house: value
        });
    }
}

function getTeamConfig(mode) {
    if (mode === 'rooms') return { dictionary: CLASS_ROOMS, fieldName: 'roomTeam' };
    if (mode === 'sides') return { dictionary: ROOM_SIDES, fieldName: 'side' };
    return { dictionary: ER_HOUSES, fieldName: 'house' };
}

function computeLiveTeamAverages(playersObj, mode) {
    const { dictionary, fieldName } = getTeamConfig(mode);
    const groups = {};

    Object.values(playersObj || {}).forEach(p => {
        const key = p[fieldName];
        if (!key || !dictionary[key]) return;
        if (!groups[key]) {
            groups[key] = { key, meta: dictionary[key], liveSum: 0, count: 0, tourneyAccSum: 0, tourneyRounds: 0, wins: 0 };
        }
        const liveAcc = p.currentScore !== undefined ? Number(p.currentScore) : 100;
        groups[key].liveSum += liveAcc;
        groups[key].count += 1;
        groups[key].tourneyAccSum += Number(p.totalAcc || 0);
        groups[key].tourneyRounds += Number(p.roundsPlayed || 0);
        groups[key].wins += Number(p.wins || 0);
    });

    Object.values(groups).forEach(g => {
        g.liveAvg = g.count > 0 ? g.liveSum / g.count : 0;
        g.tourneyAvg = g.tourneyRounds > 0 ? g.tourneyAccSum / g.tourneyRounds : 0;
    });
    return groups;
}

export function dealKnockoutEmoteDeck() {
    const deckEl = document.getElementById('ko-emote-deck');
    if (!deckEl) return;

    const shuffled = [...KO_HYPE_EMOTES].sort(() => Math.random() - 0.5);
    const hand = shuffled.slice(0, 10);

    deckEl.style.display = 'grid';
    deckEl.style.gridTemplateColumns = 'repeat(auto-fit, minmax(115px, 1fr))';
    deckEl.style.gap = '6px';
    deckEl.style.marginTop = '12px';

    deckEl.innerHTML = hand.map(emote => `
        <button type="button" class="ko-emote-btn" style="font-size:0.74rem; padding:5px 6px;" onclick="sendKnockoutQuickEmote('${emote.replace(/'/g, "\\'")}')">${emote}</button>
    `).join('') + `<button type="button" class="ko-shuffle-btn" style="font-size:0.78rem; padding:5px 8px; font-weight:800;" title="Deal 10 new reactions" onclick="dealKnockoutEmoteDeck()">🎲 Shuffle</button>`;
}

function playEmotePopSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(980, now + 0.08);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
    } catch (e) {}
}

export async function sendKnockoutQuickEmote(emoteText) {
    if (!koState.isClassKnockout || !koState.knockoutRoomCode || !window.firebaseDb) return;
    const { localStudentId } = bridge.getState();

    playEmotePopSound();

    const selfBubble = document.getElementById('ko-vs-p1-emote');
    if (selfBubble) {
        selfBubble.textContent = emoteText;
        selfBubble.classList.add('visible');
        clearTimeout(koSelfEmoteHideTimer);
        koSelfEmoteHideTimer = setTimeout(() => {
            selfBubble.classList.remove('visible');
        }, 2600);
    }

    const postFeedback = document.getElementById('ko-post-emote-feedback');
    if (postFeedback) {
        postFeedback.innerHTML = `You sent: <span style="color:#facc15; font-weight:900;">${emoteText}</span>`;
    }

    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}/players/${localStudentId}`), {
        activeEmote: {
            id: `${localStudentId}_${Date.now()}`,
            text: emoteText,
            timestamp: Date.now()
        }
    });
}

function showOpponentQuickEmote(emoteObj) {
    if (!emoteObj || !emoteObj.id || emoteObj.id === lastProcessedOppEmoteId) return;
    lastProcessedOppEmoteId = emoteObj.id;

    const ageMs = Date.now() - (emoteObj.timestamp || Date.now());
    if (ageMs > 5000) return;

    playEmotePopSound();

    const oppBubble = document.getElementById('ko-vs-p2-emote');
    if (oppBubble) {
        oppBubble.textContent = emoteObj.text;
        oppBubble.classList.add('visible');
        clearTimeout(koOppEmoteHideTimer);
        koOppEmoteHideTimer = setTimeout(() => {
            oppBubble.classList.remove('visible');
        }, 2600);
    }

    const postIncoming = document.getElementById('ko-post-opp-emote');
    if (postIncoming) {
        postIncoming.innerHTML = `${koOpponentAvatar} ${koOpponentName} says: <span style="background:#ef4444; color:#fff; padding:2px 8px; border-radius:6px; font-weight:900;">${emoteObj.text}</span>`;
        postIncoming.style.display = 'block';
    }
}

export function updateTugOfWarHUD(myAcc, oppAcc) {
    const hud = document.getElementById('tug-of-war-hud');
    if (!hud) return;

    const mode = knockoutDataCache ? knockoutDataCache.tournamentMode : 'solo';
    if (!koState.isClassKnockout || mode === 'namethattune' || mode === 'lasertag') {
        hud.style.display = 'none';
        return;
    }

    const { sessionStudentName, sessionStudentAvatar } = bridge.getState();
    const isTeamMode = (mode === 'house' || mode === 'sides' || mode === 'rooms');
    hud.style.display = 'flex';

    let leftLabel = sessionStudentName || 'You';
    let leftAvatar = sessionStudentAvatar || '🏃';
    let leftScore = myAcc;
    let leftColor = '#22c55e';

    let rightLabel = koOpponentName || 'Opponent';
    let rightAvatar = koOpponentAvatar || '🤖';
    let rightScore = oppAcc;

    if (isTeamMode && knockoutDataCache && knockoutDataCache.players) {
        const teamAvgs = computeLiveTeamAverages(knockoutDataCache.players, mode);
        const myTeamKey = mode === 'rooms' ? koMyRoom : (mode === 'sides' ? koMySide : koMyHouse);
        let oppTeamKey = mode === 'rooms' ? koOppRoom : (mode === 'sides' ? (koMySide === 'North' ? 'South' : 'North') : koOppHouse);

        if (!oppTeamKey || !teamAvgs[oppTeamKey]) {
            const rivalEntry = Object.values(teamAvgs).find(g => g.key !== myTeamKey);
            if (rivalEntry) oppTeamKey = rivalEntry.key;
        }

        if (myTeamKey && teamAvgs[myTeamKey]) {
            const m = teamAvgs[myTeamKey].meta;
            leftAvatar = m.icon;
            leftLabel = `${m.label || m.name} Avg`;
            leftScore = teamAvgs[myTeamKey].liveAvg;
            leftColor = m.color;
        }
        if (oppTeamKey && teamAvgs[oppTeamKey]) {
            const m = teamAvgs[oppTeamKey].meta;
            rightAvatar = m.icon;
            rightLabel = `${m.label || m.name} Avg`;
            rightScore = teamAvgs[oppTeamKey].liveAvg;
        } else if (koOpponentId === 'BENCHMARK_80') {
            rightAvatar = '🎯';
            rightLabel = '80% Target';
            rightScore = 80.0;
        }
    }

    document.getElementById('tug-p1-avatar').textContent = leftAvatar;
    document.getElementById('tug-p1-name').textContent = leftLabel;
    document.getElementById('tug-p1-acc').textContent = `${leftScore.toFixed(1)}%`;

    document.getElementById('tug-p2-avatar').textContent = rightAvatar;
    document.getElementById('tug-p2-name').textContent = rightLabel;
    document.getElementById('tug-p2-acc').textContent = `${rightScore.toFixed(1)}%`;

    const diff = leftScore - rightScore;
    const ratio = Math.max(8, Math.min(92, 50 + (diff * 2.0)));
    const fillLeft = document.getElementById('tug-fill-left');
    const marker = document.getElementById('tug-marker');

    if (fillLeft) {
        fillLeft.style.width = `${ratio}%`;
        if (isTeamMode) {
            fillLeft.style.background = `linear-gradient(90deg, ${leftColor}, #ffffff)`;
        } else if (diff > 0.5) {
            fillLeft.style.background = 'linear-gradient(90deg, #0284c7, #22c55e)';
        } else if (diff < -0.5) {
            fillLeft.style.background = 'linear-gradient(90deg, #ef4444, #f97316)';
        } else {
            fillLeft.style.background = 'linear-gradient(90deg, #38bdf8, #facc15)';
        }
    }
    if (marker) marker.style.left = `${ratio}%`;
}

export async function triggerStreakSabotage(streakVal) {
    if (!koState.isClassKnockout || !koState.knockoutRoomCode || !window.firebaseDb || !koOpponentId || koOpponentId === 'BENCHMARK_80') return;
    const { localStudentId, sessionStudentName } = bridge.getState();

    knockoutSabotageCount++;
    const sabTypes = [
        { type: 'freeze', label: '❄️ FREEZE FRAME' },
        { type: 'smoke', label: '🌫️ SMOKE SCREEN' },
        { type: 'shake', label: '🫨 SCREEN SHAKE' }
    ];
    const chosen = sabTypes[Math.floor(Math.random() * sabTypes.length)];
    const sabId = `${localStudentId}_${Date.now()}`;

    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}/players/${koOpponentId}`), {
        incomingSabotage: {
            id: sabId,
            type: chosen.type,
            fromName: sessionStudentName || 'Opponent',
            timestamp: Date.now()
        }
    });

    bridge.showFlashingStatus(`🔥 ${streakVal}-NOTE STREAK! Fired ${chosen.label} at ${koOpponentName}!`, 3500);
}

function applyIncomingSabotage(sabObj) {
    if (!sabObj || !sabObj.id || sabObj.id === lastProcessedSabotageId) return;
    lastProcessedSabotageId = sabObj.id;

    const ageMs = Date.now() - (sabObj.timestamp || Date.now());
    if (ageMs > 6000) return;

    koState.activeSabotageType = sabObj.type;
    koState.activeSabotageUntil = performance.now() + 3000;
    koState.smokeParticles = [];

    const canvas = document.getElementById('waterfall-canvas');
    if (sabObj.type === 'shake' && canvas) {
        canvas.classList.add('canvas-shake-active');
        setTimeout(() => {
            canvas.classList.remove('canvas-shake-active');
        }, 1000);
    }

    const labelMap = {
        freeze: '❄️ FREEZE FRAME',
        smoke: '🌫️ SMOKE SCREEN',
        shake: '🫨 SCREEN SHAKE'
    };
    bridge.showFlashingStatus(`⚠️ SABOTAGED BY ${sabObj.fromName.toUpperCase()}: ${labelMap[sabObj.type] || 'DISTRACTION'}!`, 3200);
}

export function resetKnockoutRoundEffects() {
    knockoutSabotageCount = 0;
    koState.activeSabotageType = null;
    koState.activeSabotageUntil = 0;
    koState.smokeParticles = [];
    const canvas = document.getElementById('waterfall-canvas');
    if (canvas) canvas.classList.remove('canvas-shake-active');
}

export async function openTeacherKnockoutSetup() {
    const pass = prompt("Enter Teacher Password to Host Class Knockout:");
    if (pass !== "ERC") {
        if (pass !== null) alert("Incorrect Teacher Password!");
        return;
    }

    if (!window.firebaseDb) {
        alert("Firebase Realtime Database is not connected yet. Please wait a moment and try again.");
        return;
    }

    const { songList, currentSongTitle } = bridge.getState();
    const songSelect = document.getElementById('song-select');

    bridge.closeSprintOptionModal();
    initSwissTournamentUI();
    clearKnockoutAutoNextTimer();

    koState.isClassKnockout = true;
    koState.isKnockoutHost = true;
    bridge.setIsSongBattle(false);
    knockoutLastRoundStarted = 0;
    knockoutLastRoundFinished = 0;
    knockoutFinaleShown = false;
    koState.knockoutRoomCode = '' + Math.floor(100 + Math.random() * 900);

    const modeSelect = document.getElementById('ko-mode-select');
    if (modeSelect) modeSelect.value = 'solo';
    updateTeacherNttControlsVisibility('solo');

    const autoNextToggle = document.getElementById('ko-auto-next-toggle');
    const autoNextLabel = document.getElementById('ko-auto-next-label');
    if (autoNextToggle) autoNextToggle.checked = false;
    if (autoNextLabel) {
        autoNextLabel.style.borderColor = '#4b5563';
        autoNextLabel.style.background = '#1f2937';
    }

    const koSongSel = document.getElementById('ko-song-select');
    koSongSel.innerHTML = '';
    songList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.code;
        opt.textContent = s.title;
        if (s.title === currentSongTitle) opt.selected = true;
        koSongSel.appendChild(opt);
    });

    document.getElementById('ko-room-badge').textContent = `Join Code: ${koState.knockoutRoomCode}`;
    document.getElementById('ko-teacher-panel').style.display = 'flex';
    document.getElementById('ko-student-panel').style.display = 'none';
    document.getElementById('btn-ko-start-round').style.display = 'inline-flex';
    document.getElementById('btn-ko-start-round').textContent = '▶ Start Round 1 (Random Draw)';
    document.getElementById('btn-ko-force-end').style.display = 'none';
    document.getElementById('btn-ko-finish-tourney').style.display = 'none';
    document.getElementById('knockout-modal').classList.add('open');

    const tourneyRef = window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}`);
    await window.firebaseSet(tourneyRef, {
        roomCode: koState.knockoutRoomCode,
        tournamentMode: 'solo',
        nttGroupHouses: true,
        status: 'lobby',
        round: 0,
        songTitle: currentSongTitle,
        songCode: songSelect.value || (songList[0] ? songList[0].code : ''),
        createdAt: Date.now(),
        players: {},
        pairings: {},
        nttData: null
    });
    window.firebaseOnDisconnect(tourneyRef).remove();

    attachKnockoutListener(koState.knockoutRoomCode);
}

export async function joinClassKnockoutStudent(studentName, roomCode) {
    initSwissTournamentUI();
    koState.isClassKnockout = true;
    koState.isKnockoutHost = false;
    bridge.setIsSongBattle(false);
    koState.knockoutRoomCode = roomCode;
    knockoutLastRoundStarted = 0;
    knockoutLastRoundFinished = 0;
    knockoutFinaleShown = false;
    bridge.setStudentName(studentName);

    const { localStudentId, sessionStudentAvatar, currentStudentClass, currentRoom } = bridge.getState();
    const avatar = sessionStudentAvatar || localStorage.getItem('pianopad_avatar') || '🏃';
    const studentClass = currentStudentClass || localStorage.getItem('pianopad_class') || '';
    const savedHouse = localStorage.getItem('pianopad_house') || 'Crown';
    const savedSide = localStorage.getItem('pianopad_side') || 'North';
    const rawRoom = currentRoom || localStorage.getItem('pianopad_room') || 'G1';
    const defaultRoom = CLASS_ROOMS[rawRoom] ? rawRoom : 'G1';

    koMyHouse = savedHouse;
    koMySide = savedSide;
    koMyRoom = defaultRoom;

    const playerRef = window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${roomCode}/players/${localStudentId}`);
    await window.firebaseSet(playerRef, {
        id: localStudentId,
        name: studentName,
        avatar: avatar,
        studentClass: studentClass,
        house: savedHouse,
        side: savedSide,
        roomTeam: defaultRoom,
        wins: 0,
        losses: 0,
        winStreak: 0,
        totalAcc: 0,
        roundsPlayed: 0,
        opponents: [],
        currentScore: 0,
        finishedRound: 0,
        nttCorrect: null,
        nttTimeSec: 0,
        lastStats: { perfect: 0, earlyLate: 0, miss: 0 },
        incomingSabotage: null,
        activeEmote: null
    });
    window.firebaseOnDisconnect(playerRef).remove();

    document.getElementById('ko-room-badge').textContent = `Room: ${roomCode}`;
    document.getElementById('ko-teacher-panel').style.display = 'none';
    document.getElementById('ko-student-panel').style.display = 'flex';
    document.getElementById('knockout-modal').classList.add('open');

    attachKnockoutListener(roomCode);
}

async function attachKnockoutListener(roomCode) {
    if (knockoutUnsubscribe) {
        knockoutUnsubscribe();
        knockoutUnsubscribe = null;
    }
    const { onValue } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    const tourneyRef = window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${roomCode}`);

    knockoutUnsubscribe = onValue(tourneyRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            if (koState.isClassKnockout) {
                alert("The teacher has closed the Class Tournament.");
                leaveClassKnockout();
            }
            return;
        }
        knockoutDataCache = data;
        if (koState.isKnockoutHost) {
            handleKnockoutHostUpdate(data);
        } else {
            handleKnockoutStudentUpdate(data);
        }
    });
}

function getRankedKnockoutPlayers(playersObj) {
    const arr = Object.values(playersObj || {});
    arr.sort((a, b) => {
        if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
        return (b.totalAcc || 0) - (a.totalAcc || 0);
    });
    return arr;
}

function getRankedTeams(playersObj, mode) {
    const effectiveMode = mode === 'namethattune' ? 'house' : mode;
    const groups = computeLiveTeamAverages(playersObj, effectiveMode);
    return Object.values(groups).sort((a, b) => {
        if (Math.abs(b.tourneyAvg - a.tourneyAvg) > 0.05) return b.tourneyAvg - a.tourneyAvg;
        return b.liveAvg - a.liveAvg;
    });
}

function buildTeamStandingsHTML(playersObj, mode) {
    const effectiveMode = mode === 'namethattune' ? 'house' : mode;
    const rankedTeams = getRankedTeams(playersObj, effectiveMode);
    if (rankedTeams.length === 0) return '';

    const myTeamKey = effectiveMode === 'rooms' ? koMyRoom : (effectiveMode === 'sides' ? koMySide : koMyHouse);
    const headerTitle = effectiveMode === 'rooms'
        ? '🏫 Room Battle Ladder (G1 vs. G2 vs. G3)'
        : (effectiveMode === 'sides'
            ? '🧭 North vs. South Standings'
            : (mode === 'namethattune' ? '🏰 Name That Tune — House Standings' : '🏰 House Relay Ladder'));
    const colLabel = effectiveMode === 'rooms' ? 'Room' : (effectiveMode === 'sides' ? 'Side' : 'House');

    const rows = rankedTeams.map((g, idx) => {
        const m = g.meta;
        const rankBadge = idx === 0 ? '🥇 1st' : idx === 1 ? '🥈 2nd' : idx === 2 ? '🥉 3rd' : `#${idx + 1}`;
        const displayScore = g.tourneyRounds > 0 ? g.tourneyAvg.toFixed(1) : g.liveAvg.toFixed(1);
        return `
            <tr style="${g.key === myTeamKey ? 'background:rgba(250,204,21,0.14);' : ''}">
                <td style="font-weight:800; color:#facc15;">${rankBadge}</td>
                <td style="font-weight:800;">
                    <span style="display:inline-flex; align-items:center; gap:5px; background:${m.color}; color:${m.textColor}; padding:2px 8px; border-radius:5px;">
                        ${m.icon} ${m.label || m.name}
                    </span>
                    <span style="font-size:0.72rem; color:#9ca3af; margin-left:6px;">(${g.count} players)</span>
                </td>
                <td style="color:#22c55e; font-weight:800;">${g.wins}W</td>
                <td style="color:#38bdf8; font-weight:800;">${displayScore}% avg</td>
            </tr>
        `;
    }).join('');

    return `
        <div style="margin-bottom:10px;">
            <div style="font-size:0.75rem; font-weight:800; color:#facc15; margin-bottom:6px; text-transform:uppercase;">${headerTitle}</div>
            <table class="race-results-table" style="margin-top:0;">
                <thead>
                    <tr><th>Place</th><th>${colLabel}</th><th>Correct / Wins</th><th>House Avg</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function buildStandingsHTML(rankedPlayers, mode = 'solo', playersObj = {}, nttGroupHouses = true) {
    if (rankedPlayers.length === 0) {
        return `<div style="color:#9ca3af; font-size:0.8rem; text-align:center; padding:8px;">No students joined yet...</div>`;
    }
    const { localStudentId } = bridge.getState();
    const isTeamMode = (mode === 'house' || mode === 'sides' || mode === 'rooms' || (mode === 'namethattune' && nttGroupHouses));
    const teamTable = isTeamMode ? buildTeamStandingsHTML(playersObj, mode) : '';
    const isHost = koState.isKnockoutHost;

    let rows = rankedPlayers.map((p, idx) => {
        const rankBadge = idx === 0 ? '🥇 1st' : idx === 1 ? '🥈 2nd' : idx === 2 ? '🥉 3rd' : `#${idx + 1}`;
        const avgAcc = p.roundsPlayed > 0 ? (p.totalAcc / p.roundsPlayed).toFixed(1) : '0.0';
        const teamBadge = isTeamMode ? getTeamBadgeHTML(p, mode, nttGroupHouses) : '';
        const bountyTag = (idx === 0 && (p.roundsPlayed || 0) > 0)
            ? ` <span style="background:#ef4444; color:#fff; font-size:0.65rem; padding:1px 5px; border-radius:4px; font-weight:900; margin-left:4px;">🎯 LEADER</span>`
            : '';
        const streak = p.winStreak || 0;
        const streakTag = streak >= 2
            ? ` <span style="background:#f97316; color:#000; font-size:0.65rem; padding:1px 5px; border-radius:4px; font-weight:900; margin-left:4px;">🔥 ${streak}</span>`
            : '';

        const kickBtn = isHost && p.id !== localStudentId
            ? `<button type="button" onclick="kickKnockoutPlayer('${p.id}', '${p.name.replace(/'/g, "\\'")}')" style="margin-left:8px; background:#ef4444; color:#fff; border:none; border-radius:4px; padding:2px 6px; font-size:0.65rem; cursor:pointer;" title="Remove Student">❌ Kick</button>`
            : '';

        return `
            <tr style="${p.id === localStudentId ? 'background:rgba(56,189,248,0.15);' : ''}">
                <td style="font-weight:800; color:#facc15;">${rankBadge}</td>
                <td style="font-weight:700;">${p.avatar || '🏃'} ${p.name}${teamBadge}${bountyTag}${streakTag}${kickBtn}</td>
                <td style="color:#22c55e; font-weight:800;">${p.wins || 0}W - ${p.losses || 0}L</td>
                <td style="color:#38bdf8; font-weight:700;">${avgAcc}% avg</td>
            </tr>
        `;
    }).join('');

    return `
        ${teamTable}
        <div style="font-size:0.75rem; font-weight:800; color:#facc15; margin-bottom:6px; text-transform:uppercase;">Live Individual Standings (${rankedPlayers.length} Players)</div>
        <table class="race-results-table" style="margin-top:0;">
            <thead>
                <tr><th>Place</th><th>Student</th><th>Record</th><th>Avg Score</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function generateSwissPairings(playersObj, roundNum, mode = 'solo') {
    if (mode === 'namethattune' || mode === 'lasertag') return {}; 

    const players = Object.values(playersObj || {});
    const isTeamMode = (mode === 'house' || mode === 'sides' || mode === 'rooms');
    const { fieldName: teamField } = getTeamConfig(mode);
    let ordered = [];

    if (roundNum === 1) {
        ordered = [...players].sort(() => Math.random() - 0.5);
    } else {
        ordered = getRankedKnockoutPlayers(playersObj);
    }

    for (let i = 0; i < ordered.length - 1; i += 2) {
        const p1 = ordered[i];
        const p2 = ordered[i + 1];
        const p1History = Array.isArray(p1.opponents) ? p1.opponents : Object.values(p1.opponents || {});
        const sameTeam = isTeamMode && p1[teamField] && p2[teamField] && p1[teamField] === p2[teamField];

        if ((p1History.includes(p2.id) || sameTeam) && i + 2 < ordered.length) {
            let swapIdx = -1;
            for (let j = i + 2; j < ordered.length; j++) {
                const candidate = ordered[j];
                const diffTeam = !isTeamMode || (candidate[teamField] !== p1[teamField]);
                if (!p1History.includes(candidate.id) && diffTeam) {
                    swapIdx = j;
                    break;
                }
            }
            if (swapIdx === -1 && sameTeam) {
                for (let j = i + 2; j < ordered.length; j++) {
                    if (ordered[j][teamField] !== p1[teamField]) {
                        swapIdx = j;
                        break;
                    }
                }
            }
            if (swapIdx !== -1) {
                const temp = ordered[i + 1];
                ordered[i + 1] = ordered[swapIdx];
                ordered[swapIdx] = temp;
            }
        }
    }

    const pairings = {};
    let matchIdx = 1;
    for (let i = 0; i < ordered.length; i += 2) {
        if (i + 1 < ordered.length) {
            pairings[`m${matchIdx}`] = {
                matchId: `m${matchIdx}`,
                p1: ordered[i].id,
                p2: ordered[i + 1].id,
                isGhostMatch: false,
                targetScore: 0
            };
        } else {
            pairings[`m${matchIdx}`] = {
                matchId: `m${matchIdx}`,
                p1: ordered[i].id,
                p2: 'BENCHMARK_80',
                isGhostMatch: true,
                targetScore: 80
            };
        }
        matchIdx++;
    }
    return pairings;
}

async function startNextKnockoutRound() {
    if (!koState.isKnockoutHost || !knockoutDataCache) return;
    clearKnockoutAutoNextTimer();

    const playersObj = knockoutDataCache.players || {};
    const playerIds = Object.keys(playersObj);
    const modeSel = document.getElementById('ko-mode-select');
    const modeVal = modeSel ? modeSel.value : 'solo';

    const minPlayers = (modeVal === 'namethattune' || modeVal === 'lasertag') ? 1 : 2;
    if (playerIds.length < minPlayers) {
        alert(`At least ${minPlayers} student(s) must join the room before starting Round 1!`);
        return;
    }

    const { songList, currentSongTitle } = bridge.getState();
    const nextRound = (knockoutDataCache.round || 0) + 1;
    const koSongSel = document.getElementById('ko-song-select');
    const selectedCode = koSongSel.value;
    const selectedTitle = koSongSel.selectedOptions[0] ? koSongSel.selectedOptions[0].text.replace(/^[🟢🟠🔴]\s*/, '') : currentSongTitle;

    const pairings = generateSwissPairings(playersObj, nextRound, modeVal);
    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");

    let nttPayload = null;
    const nttGroupHouses = document.getElementById('ko-ntt-house-toggle')?.checked ?? true;
    if (modeVal === 'namethattune') {
        const noteCount = parseInt(document.getElementById('ko-ntt-note-count')?.value || '5', 10);
        const choices = generateNameThatTuneChoices(selectedTitle, songList);
        nttPayload = {
            noteCount,
            choices
        };
    }

    const updates = {
        tournamentMode: modeVal,
        nttGroupHouses,
        status: 'playing',
        round: nextRound,
        songTitle: selectedTitle,
        songCode: selectedCode,
        pairings: pairings,
        nttData: nttPayload
    };

    playerIds.forEach(pid => {
        updates[`players/${pid}/currentScore`] = 0;
        updates[`players/${pid}/finishedRound`] = 0;
        updates[`players/${pid}/nttCorrect`] = null;
        updates[`players/${pid}/nttTimeSec`] = 0;
        updates[`players/${pid}/lastStats`] = { perfect: 0, earlyLate: 0, miss: 0 };
        updates[`players/${pid}/incomingSabotage`] = null;
        updates[`players/${pid}/activeEmote`] = null;
    });

    await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}`), updates);
}

function formatBracketEmoteBadge(playerObj) {
    if (!playerObj || !playerObj.activeEmote || !playerObj.activeEmote.text) return '';
    const age = Date.now() - (playerObj.activeEmote.timestamp || 0);
    if (age > 4500) return '';
    return `<span class="ko-bracket-emote-tag">${playerObj.activeEmote.text}</span>`;
}

function handleKnockoutHostUpdate(data) {
    const playersObj = data.players || {};
    const mode = data.tournamentMode || 'solo';
    const nttGroupHouses = data.nttGroupHouses !== false;
    const isTeamMode = (mode === 'house' || mode === 'sides' || mode === 'rooms' || (mode === 'namethattune' && nttGroupHouses));
    const ranked = getRankedKnockoutPlayers(playersObj);
    document.getElementById('ko-standings-container').innerHTML = buildStandingsHTML(ranked, mode, playersObj, nttGroupHouses);

    const bracketDiv = document.getElementById('ko-bracket-container');
    const statusBanner = document.getElementById('ko-status-banner');
    const btnStart = document.getElementById('btn-ko-start-round');
    const btnForce = document.getElementById('btn-ko-force-end');
    const btnFinish = document.getElementById('btn-ko-finish-tourney');

    if (data.status !== 'round_results') {
        clearKnockoutAutoNextTimer();
    }

    if (data.status === 'lobby') {
        btnStart.style.display = 'inline-flex';
        btnForce.style.display = 'none';
        btnFinish.style.display = 'none';

        if (mode === 'namethattune') {
            statusBanner.textContent = `🎵 Name That Tune Lobby (${ranked.length} students connected). Pick a song & note count, then click Start!`;
        } else if (mode === 'rooms') {
            statusBanner.textContent = `🏫 Room Battle Lobby Open (${ranked.length} students connected). G1 vs. G2 vs. G3 ready!`;
        } else if (mode === 'sides') {
            statusBanner.textContent = `🧭 North vs. South Lobby Open (${ranked.length} students connected). Students are choosing North or South!`;
        } else if (mode === 'house') {
            statusBanner.textContent = `🏰 House Relay Lobby Open (${ranked.length} students connected). Students are choosing their Houses!`;
        } else {
            statusBanner.textContent = `Lobby Open (${ranked.length} students connected). Select Round 1 song & click Start!`;
        }
        
        bracketDiv.innerHTML = ranked.map(p => `
            <div class="lobby-player-card" style="position:relative;">
                <span>${p.avatar || '🏃'}</span>
                <span>${p.name} (${p.studentClass || 'Class'})${isTeamMode ? getTeamBadgeHTML(p, mode, nttGroupHouses) : ''}</span>
                <button type="button" onclick="kickKnockoutPlayer('${p.id}', '${p.name.replace(/'/g, "\\'")}')" style="position:absolute; top:4px; right:4px; background:#ef4444; color:#fff; border:none; border-radius:4px; width:20px; height:20px; font-size:0.7rem; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="Remove Student">✖</button>
            </div>
        `).join('');
        return;
    }

    if (data.status === 'playing') {
        btnStart.style.display = 'none';
        btnForce.style.display = 'inline-flex';
        btnFinish.style.display = (data.round || 0) >= 1 ? 'inline-flex' : 'none';

        if (mode === 'namethattune') {
            const allPlayers = Object.values(playersObj);
            let allDone = allPlayers.length > 0;
            let answeredCount = 0;

            bracketDiv.innerHTML = allPlayers.map(p => {
                const done = p.finishedRound === data.round;
                if (done) answeredCount++;
                else allDone = false;

                const teamBadge = nttGroupHouses ? getTeamBadgeHTML(p, 'namethattune', true) : '';
                let badgeHtml = `<span style="color:#facc15; font-weight:800;">🎧 Listening...</span>`;
                if (done) {
                    if (p.nttCorrect) {
                        badgeHtml = `<span style="color:#22c55e; font-weight:900;">✅ ${Number(p.currentScore || 0).toFixed(1)}% (${Number(p.nttTimeSec || 0).toFixed(1)}s)</span>`;
                    } else {
                        badgeHtml = `<span style="color:#ef4444; font-weight:900;">❌ 0.0% (${Number(p.nttTimeSec || 0).toFixed(1)}s)</span>`;
                    }
                }

                return `
                    <div style="background:#141824; border:1px solid ${done ? (p.nttCorrect ? '#22c55e' : '#ef4444') : '#334155'}; border-radius:8px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.85rem; font-weight:700; color:#fff;">${p.avatar || '🏃'} ${p.name}${teamBadge}</span>
                        <span style="font-size:0.8rem;">${badgeHtml}</span>
                    </div>
                `;
            }).join('');

            const noteCnt = data.nttData?.noteCount || 5;
            statusBanner.textContent = `🎵 Round ${data.round}: "${data.songTitle}" (${noteCnt} notes) — ${answeredCount}/${allPlayers.length} students answered...`;

            if (allDone && knockoutLastRoundFinished !== data.round) {
                knockoutLastRoundFinished = data.round;
                scoreAndConcludeKnockoutRound(data);
            }
            return;
        }
        
        if (mode === 'lasertag') {
            bracketDiv.innerHTML = `<div style="padding:20px; font-size:1.1rem; color:#38bdf8; font-weight:900; text-align:center;">🛸 Laser Tag Arena is Live! (Monitoring matches...)</div>`;
            return;
        }

        const pairings = Object.values(data.pairings || {});
        let allDone = true;

        bracketDiv.innerHTML = pairings.map((m, idx) => {
            const p1 = playersObj[m.p1];
            if (!p1) return '';
            const p1Done = p1.finishedRound === data.round;
            const s1 = Number(p1.currentScore || 0);
            const p1Status = p1Done ? `✅ ${s1.toFixed(1)}%` : `🎹 ${s1.toFixed(1)}%...`;
            const p1Emote = formatBracketEmoteBadge(p1);
            const p1Team = isTeamMode ? getTeamBadgeHTML(p1, mode, nttGroupHouses) : '';

            if (m.isGhostMatch) {
                if (!p1Done) allDone = false;
                const isClose = Math.abs(s1 - 80) <= 0.5;
                return `
                    <div style="background:#141824; border:1px solid #8b5cf6; border-radius:8px; padding:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.72rem; color:#c084fc; font-weight:800;">MATCH ${idx + 1} • BENCHMARK CHALLENGE</span>
                            ${isClose ? '<span class="photo-finish-badge">PHOTO FINISH 🔥</span>' : ''}
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:0.85rem; font-weight:700;">
                            <span>${p1.avatar} ${p1.name}${p1Team}${p1Emote}</span>
                            <span style="color:${p1Done ? '#22c55e' : '#facc15'};">${p1Status}</span>
                        </div>
                        <div style="font-size:0.75rem; color:#9ca3af; margin-top:4px;">Target to Win: ≥ 80.0% Accuracy</div>
                    </div>
                `;
            }

            const p2 = playersObj[m.p2];
            const p2Done = p2 ? (p2.finishedRound === data.round) : true;
            if (!p1Done || !p2Done) allDone = false;
            const s2 = p2 ? Number(p2.currentScore || 0) : 0;
            const p2Status = p2 ? (p2Done ? `✅ ${s2.toFixed(1)}%` : `🎹 ${s2.toFixed(1)}%...`) : 'Disconnected';
            const p2Emote = formatBracketEmoteBadge(p2);
            const p2Team = (isTeamMode && p2) ? getTeamBadgeHTML(p2, mode, nttGroupHouses) : '';
            const isPhotoFinish = p2 && Math.abs(s1 - s2) <= 0.5;
            const p1PastOpps = (p1 && p1.opponents)
                ? (Array.isArray(p1.opponents) ? p1.opponents : Object.values(p1.opponents))
                : [];
            const isTableRematch = Boolean(p2 && p1PastOpps.includes(p2.id));

            return `
                <div style="background:#141824; border:1px solid ${isPhotoFinish ? '#ef4444' : '#374151'}; border-radius:8px; padding:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                        <span style="font-size:0.72rem; color:#38bdf8; font-weight:800;">TABLE ${idx + 1} • ROUND ${data.round}</span>
                        <div style="display:flex; gap:4px; align-items:center;">
                            ${isTableRematch ? '<span style="background:#f97316; color:#000; font-size:0.65rem; font-weight:900; padding:1px 6px; border-radius:4px;">🔥 REMATCH</span>' : ''}
                            ${isPhotoFinish ? '<span class="photo-finish-badge">PHOTO FINISH 🔥</span>' : ''}
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:0.85rem; font-weight:700;">
                        <span>${p1.avatar} ${p1.name}${p1Team}${p1Emote}</span>
                        <span style="color:${p1Done ? '#22c55e' : '#facc15'};">${p1Status}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.85rem; font-weight:700;">
                        <span>${p2 ? p2.avatar + ' ' + p2.name + p2Team + p2Emote : '---'}</span>
                        <span style="color:${p2Done ? '#22c55e' : '#facc15'};">${p2Status}</span>
                    </div>
                </div>
            `;
        }).join('');

        statusBanner.textContent = `Round ${data.round} in progress (${data.songTitle}) — Waiting for all matches to finish...`;

        if (allDone && pairings.length > 0 && knockoutLastRoundFinished !== data.round) {
            knockoutLastRoundFinished = data.round;
            scoreAndConcludeKnockoutRound(data);
        }
    } else if (data.status === 'round_results') {
        btnForce.style.display = 'none';
        btnStart.style.display = 'inline-flex';
        btnStart.textContent = mode === 'namethattune'
            ? `▶ Start Round ${data.round + 1} (Next Tune)`
            : (mode === 'rooms'
                ? `▶ Start Round ${data.round + 1} (Room Battle)`
                : (mode === 'sides'
                    ? `▶ Start Round ${data.round + 1} (North vs South)`
                    : (mode === 'house'
                        ? `▶ Start Round ${data.round + 1} (House Relay)`
                        : `▶ Start Round ${data.round + 1} (Swiss Matched)`)));
        btnFinish.style.display = 'inline-flex';

        const autoToggle = document.getElementById('ko-auto-next-toggle');
        if (autoToggle && autoToggle.checked) {
            startKnockoutAutoNextTimer(data.round);
        } else {
            statusBanner.textContent = `Round ${data.round} Complete! Ready for Round ${data.round + 1}.`;
        }
    } else if (data.status === 'finished') {
        btnStart.style.display = 'none';
        btnForce.style.display = 'none';
        btnFinish.style.display = 'none';
        statusBanner.textContent = `🏆 Tournament Complete! Final Placings Logged to Leaderboard.`;

        if (!knockoutFinaleShown) {
            knockoutFinaleShown = true;
            document.getElementById('knockout-modal')?.classList.remove('open');

            let standings = data.finalStandings || [];
            if (standings.length === 0) {
                const ranked = getRankedKnockoutPlayers(data.players || {});
                standings = ranked.map(p => ({
                    name: p.name, score: p.roundsPlayed > 0 ? (p.totalAcc / p.roundsPlayed).toFixed(1) : '0.0', avatar: p.avatar, id: p.id
                }));
            }
            const finaleTitle = mode === 'namethattune'
                ? `🎵 Name That Tune Championship Complete!`
                : (mode === 'rooms'
                    ? `🏫 Room Battle (G1 vs. G2 vs. G3) Complete!`
                    : (mode === 'sides'
                        ? `🧭 North vs. South Showdown Complete!`
                        : (mode === 'house' ? `🏰 House Relay Championship Complete!` : `🏆 Class Knockout Complete!`)));
            bridge.showGrandFinale(standings, true, finaleTitle);
        }
    }
}

async function forceEndKnockoutRound() {
    if (!koState.isKnockoutHost || !knockoutDataCache) return;
    if (knockoutLastRoundFinished === knockoutDataCache.round) return;
    knockoutLastRoundFinished = knockoutDataCache.round;
    await scoreAndConcludeKnockoutRound(knockoutDataCache);
}

function buildRoundScoreUpdates(data) {
    const playersObj = data.players || {};
    const mode = data.tournamentMode || 'solo';
    const updates = { status: 'round_results' };

    if (mode === 'namethattune') {
        Object.values(playersObj).forEach(p => {
            const answeredThisRound = p.finishedRound === data.round;
            const won = answeredThisRound && Boolean(p.nttCorrect);
            const roundScore = won ? Number(p.currentScore || 0) : 0;
            const newStreak = won ? ((p.winStreak || 0) + 1) : 0;

            updates[`players/${p.id}/wins`] = (p.wins || 0) + (won ? 1 : 0);
            updates[`players/${p.id}/losses`] = (p.losses || 0) + (won ? 0 : 1);
            updates[`players/${p.id}/winStreak`] = newStreak;
            updates[`players/${p.id}/totalAcc`] = (p.totalAcc || 0) + roundScore;
            updates[`players/${p.id}/roundsPlayed`] = (p.roundsPlayed || 0) + 1;
            updates[`players/${p.id}/lastMatchResult`] = {
                round: data.round,
                isNameThatTune: true,
                won,
                myScore: roundScore,
                songTitle: data.songTitle || 'Mystery Tune',
                responseSec: Number(p.nttTimeSec || 0),
                winStreak: newStreak
            };
        });
        return updates;
    }
    
    if (mode === 'lasertag') {
        return updates;
    }

    const pairings = Object.values(data.pairings || {});
    const rankedBefore = getRankedKnockoutPlayers(playersObj);
    const currentLeaderId = (rankedBefore.length > 0 && (rankedBefore[0].roundsPlayed || 0) > 0) ? rankedBefore[0].id : null;

    pairings.forEach(m => {
        const p1 = playersObj[m.p1];
        if (!p1) return;
        const s1 = Number(p1.currentScore || 0);

        if (m.isGhostMatch) {
            const won = s1 >= (m.targetScore || 80);
            const isPhotoFinish = Math.abs(s1 - (m.targetScore || 80)) <= 0.5;
            const newStreak = won ? ((p1.winStreak || 0) + 1) : 0;
            updates[`players/${p1.id}/wins`] = (p1.wins || 0) + (won ? 1 : 0);
            updates[`players/${p1.id}/losses`] = (p1.losses || 0) + (won ? 0 : 1);
            updates[`players/${p1.id}/winStreak`] = newStreak;
            updates[`players/${p1.id}/totalAcc`] = (p1.totalAcc || 0) + s1;
            updates[`players/${p1.id}/roundsPlayed`] = (p1.roundsPlayed || 0) + 1;
            updates[`players/${p1.id}/lastMatchResult`] = {
                round: data.round,
                won: won,
                photoFinish: isPhotoFinish,
                tiebreakerUsed: false,
                giantKiller: false,
                winStreak: newStreak,
                myScore: s1,
                oppName: '80% Benchmark',
                oppAvatar: '🎯',
                oppScore: 80,
                oppStats: { perfect: 8, earlyLate: 0, miss: 2 }
            };
        } else {
            const p2 = playersObj[m.p2];
            if (!p2) return;
            const s2 = Number(p2.currentScore || 0);

            const isPhotoFinish = Math.abs(s1 - s2) <= 0.5;
            const p1Perfect = (p1.lastStats && p1.lastStats.perfect) ? Number(p1.lastStats.perfect) : 0;
            const p2Perfect = (p2.lastStats && p2.lastStats.perfect) ? Number(p2.lastStats.perfect) : 0;
            let p1Won = s1 > s2;
            let tiebreakerUsed = false;

            if (isPhotoFinish) {
                tiebreakerUsed = true;
                if (p1Perfect !== p2Perfect) {
                    p1Won = p1Perfect > p2Perfect;
                } else {
                    p1Won = s1 >= s2;
                }
            }

            const p1GiantKiller = p1Won && currentLeaderId === p2.id;
            const p2GiantKiller = !p1Won && currentLeaderId === p1.id;
            const p1Streak = p1Won ? ((p1.winStreak || 0) + 1) : 0;
            const p2Streak = !p1Won ? ((p2.winStreak || 0) + 1) : 0;

            const p1Opps = Array.isArray(p1.opponents) ? [...p1.opponents] : Object.values(p1.opponents || {});
            const p2Opps = Array.isArray(p2.opponents) ? [...p2.opponents] : Object.values(p2.opponents || {});
            if (!p1Opps.includes(p2.id)) p1Opps.push(p2.id);
            if (!p2Opps.includes(p1.id)) p2Opps.push(p1.id);

            updates[`players/${p1.id}/wins`] = (p1.wins || 0) + (p1Won ? 1 : 0);
            updates[`players/${p1.id}/losses`] = (p1.losses || 0) + (p1Won ? 0 : 1);
            updates[`players/${p1.id}/winStreak`] = p1Streak;
            updates[`players/${p1.id}/totalAcc`] = (p1.totalAcc || 0) + s1;
            updates[`players/${p1.id}/roundsPlayed`] = (p1.roundsPlayed || 0) + 1;
            updates[`players/${p1.id}/opponents`] = p1Opps;
            updates[`players/${p1.id}/lastMatchResult`] = {
                round: data.round,
                won: p1Won,
                photoFinish: isPhotoFinish,
                tiebreakerUsed: tiebreakerUsed,
                myPerfect: p1Perfect,
                oppPerfect: p2Perfect,
                giantKiller: p1GiantKiller,
                winStreak: p1Streak,
                myScore: s1,
                oppName: p2.name,
                oppAvatar: p2.avatar || '🏃',
                oppHouse: p2.house || '',
                oppSide: p2.side || '',
                oppRoom: p2.roomTeam || '',
                oppScore: s2,
                oppStats: p2.lastStats || { perfect: 0, earlyLate: 0, miss: 0 }
            };

            updates[`players/${p2.id}/wins`] = (p2.wins || 0) + (!p1Won ? 1 : 0);
            updates[`players/${p2.id}/losses`] = (p2.losses || 0) + (!p1Won ? 0 : 1);
            updates[`players/${p2.id}/winStreak`] = p2Streak;
            updates[`players/${p2.id}/totalAcc`] = (p2.totalAcc || 0) + s2;
            updates[`players/${p2.id}/roundsPlayed`] = (p2.roundsPlayed || 0) + 1;
            updates[`players/${p2.id}/opponents`] = p2Opps;
            updates[`players/${p2.id}/lastMatchResult`] = {
                round: data.round,
                won: !p1Won,
                photoFinish: isPhotoFinish,
                tiebreakerUsed: tiebreakerUsed,
                myPerfect: p2Perfect,
                oppPerfect: p1Perfect,
                giantKiller: p2GiantKiller,
                winStreak: p2Streak,
                myScore: s2,
                oppName: p1.name,
                oppAvatar: p1.avatar || '🏃',
                oppHouse: p1.house || '',
                oppSide: p1.side || '',
                oppRoom: p1.roomTeam || '',
                oppScore: s1,
                oppStats: p1.lastStats || { perfect: 0, earlyLate: 0, miss: 0 }
            };
        }
    });

    return updates;
}

async function scoreAndConcludeKnockoutRound(data) {
    const updates = buildRoundScoreUpdates(data);
    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}`), updates);
}

async function finalizeClassKnockout() {
    if (!koState.isKnockoutHost || !knockoutDataCache) return;
    clearKnockoutAutoNextTimer();

    let workingPlayers = JSON.parse(JSON.stringify(knockoutDataCache.players || {}));
    const roundUpdates = {};
    if (knockoutDataCache.status === 'playing' && knockoutLastRoundFinished !== knockoutDataCache.round) {
        knockoutLastRoundFinished = knockoutDataCache.round;
        const computed = buildRoundScoreUpdates(knockoutDataCache);
        Object.entries(computed).forEach(([key, val]) => {
            if (key.startsWith('players/')) {
                roundUpdates[key] = val;
                const [, pid, field] = key.split('/');
                if (workingPlayers[pid]) workingPlayers[pid][field] = val;
            }
        });
    }

    const mode = knockoutDataCache.tournamentMode || 'solo';
    const nttGroupHouses = knockoutDataCache.nttGroupHouses !== false;
    const isTeamMode = (mode === 'house' || mode === 'sides' || mode === 'rooms' || (mode === 'namethattune' && nttGroupHouses));
    const ranked = getRankedKnockoutPlayers(workingPlayers);

    const individualPayload = ranked.map(p => {
        const tag = mode === 'rooms'
            ? (p.roomTeam ? ` (${p.roomTeam})` : '')
            : (mode === 'sides'
                ? (p.side ? ` (${p.side})` : '')
                : ((mode === 'house' || (mode === 'namethattune' && nttGroupHouses)) && p.house ? ` (${p.house})` : ''));
        const avgAcc = p.roundsPlayed > 0
            ? (p.totalAcc / p.roundsPlayed).toFixed(1)
            : Number(p.currentScore || 0).toFixed(1);
        return {
            name: `${p.name}${tag}`,
            score: avgAcc,
            avatar: p.avatar || '🏃',
            id: p.id
        };
    });

    let podiumStandings = individualPayload;
    if (isTeamMode) {
        const rankedTeams = getRankedTeams(workingPlayers, mode);
        if (rankedTeams.length > 0) {
            podiumStandings = rankedTeams.map(g => {
                const m = g.meta;
                const avg = g.tourneyRounds > 0 ? g.tourneyAvg.toFixed(1) : g.liveAvg.toFixed(1);
                return {
                    name: `${m.label || m.name} (${g.count})`,
                    score: avg,
                    avatar: m.icon,
                    id: `team_${g.key}`
                };
            });
        }
    }

    if (podiumStandings.length === 0) {
        podiumStandings = [{ name: 'No Players', score: '0.0', avatar: '🏆', id: 'none' }];
    }

    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}`), {
        ...roundUpdates,
        status: 'finished',
        finalStandings: podiumStandings
    });

    bridge.setCurrentSongTitle(
        mode === 'namethattune'
            ? `Name That Tune (${knockoutDataCache.songTitle || 'Quiz'})`
            : (mode === 'rooms'
                ? `Room Battle (${knockoutDataCache.songTitle || 'Tournament'})`
                : (mode === 'sides'
                    ? `North vs South (${knockoutDataCache.songTitle || 'Tournament'})`
                    : (mode === 'house'
                        ? `House Relay (${knockoutDataCache.songTitle || 'Tournament'})`
                        : `Class Knockout (${knockoutDataCache.songTitle || 'Tournament'})`)))
    );
    if (individualPayload.length > 0) {
        bridge.postBattleToSpreadsheet(individualPayload);
    }
}

function handleKnockoutStudentUpdate(data) {
    const { localStudentId, sessionStudentName, sessionStudentAvatar } = bridge.getState();
    const playersObj = data.players || {};
    
    // NEW: Kick Handler for Students
    if (!playersObj[localStudentId]) {
        alert("You have been removed from the tournament by the teacher.");
        leaveClassKnockout();
        return;
    }

    const mode = data.tournamentMode || 'solo';
    const nttGroupHouses = data.nttGroupHouses !== false;
    const me = playersObj[localStudentId];
    const ranked = getRankedKnockoutPlayers(playersObj);
    const myRankIdx = ranked.findIndex(p => p.id === localStudentId);
    const myPlaceText = myRankIdx >= 0 ? `Rank #${myRankIdx + 1} of ${ranked.length}` : 'Unranked';

    if (me && me.house) koMyHouse = me.house;
    if (me && me.side) koMySide = me.side;
    if (me && me.roomTeam) koMyRoom = me.roomTeam;

    const teamBox = document.getElementById('ko-team-picker-box');
    if (teamBox) {
        if (mode === 'rooms') {
            renderStudentTeamPicker('rooms', koMyRoom || 'G1');
        } else if (mode === 'sides') {
            renderStudentTeamPicker('sides', koMySide || 'North');
        } else if (mode === 'house' || (mode === 'namethattune' && nttGroupHouses)) {
            renderStudentTeamPicker(mode, koMyHouse || 'Crown');
        } else {
            teamBox.style.display = 'none';
        }
    }

    document.getElementById('ko-student-standings').innerHTML = buildStandingsHTML(ranked, mode, playersObj, nttGroupHouses);

    if (data.status === 'playing' && mode === 'namethattune') {
        const allArr = Object.values(playersObj);
        const ansCnt = allArr.filter(p => p.finishedRound === data.round).length;
        updateNameThatTuneProgressText(ansCnt, allArr.length);
    }

    if (koOpponentId && koOpponentId !== 'BENCHMARK_80' && playersObj[koOpponentId] && playersObj[koOpponentId].activeEmote) {
        showOpponentQuickEmote(playersObj[koOpponentId].activeEmote);
    }

    if (data.status === 'playing' && mode !== 'namethattune' && me && me.incomingSabotage) {
        applyIncomingSabotage(me.incomingSabotage);
    }

    if (data.status === 'playing' && mode !== 'namethattune' && mode !== 'lasertag' && me) {
        const myLiveAcc = Number(me.currentScore !== undefined ? me.currentScore : 100);
        let oppLiveAcc = 80.0;
        if (koOpponentId && koOpponentId !== 'BENCHMARK_80' && playersObj[koOpponentId]) {
            oppLiveAcc = Number(playersObj[koOpponentId].currentScore !== undefined ? playersObj[koOpponentId].currentScore : 100);
        }
        updateTugOfWarHUD(myLiveAcc, oppLiveAcc);
    }

    if (data.status === 'playing' && knockoutLastRoundStarted !== data.round) {
        knockoutLastRoundStarted = data.round;

        if (mode === 'lasertag') {
            document.getElementById('knockout-modal').classList.remove('open');
            document.getElementById('game-results-modal').classList.remove('open');
            document.getElementById('arcade-hub').classList.remove('open');
            const tugHud = document.getElementById('tug-of-war-hud');
            if (tugHud) tugHud.style.display = 'none';

            if (window.launchLaserTag) window.launchLaserTag(koState.knockoutRoomCode);
            return;
        }

        if (mode === 'namethattune') {
            document.getElementById('knockout-modal').classList.remove('open');
            document.getElementById('game-results-modal').classList.remove('open');
            document.getElementById('arcade-hub').classList.remove('open');
            const tugHud = document.getElementById('tug-of-war-hud');
            if (tugHud) tugHud.style.display = 'none';

            const houseBadgeHtml = (nttGroupHouses && me) ? getTeamBadgeHTML(me, 'namethattune', true) : '';

            launchStudentNameThatTuneRound(data, houseBadgeHtml, async (result) => {
                const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
                await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}/players/${localStudentId}`), {
                    currentScore: result.score,
                    finishedRound: data.round,
                    nttCorrect: result.isCorrect,
                    nttTimeSec: result.responseSec
                });
            });
            return;
        }

        if (data.songCode) {
            bridge.setCurrentSongTitle(data.songTitle);
            const songSelect = document.getElementById('song-select');
            if (songSelect) songSelect.value = data.songCode;
            const parsed = parsePianoPad(data.songCode);
            if (parsed.length > 0) bridge.setCurrentSong(autoTransposeSong(parsed));
        }

        const pairings = Object.values(data.pairings || {});
        const myMatch = pairings.find(m => m.p1 === localStudentId || m.p2 === localStudentId);
        let oppName = 'Class Opponent';
        let oppAvatar = '🤖';
        let oppRankText = 'Challenger';
        koOpponentId = null;
        koOppHouse = '';
        koOppSide = '';
        koOppRoom = '';

        if (myMatch) {
            if (myMatch.isGhostMatch) {
                koOpponentId = 'BENCHMARK_80';
                oppName = '80% Benchmark';
                oppAvatar = '🎯';
                oppRankText = 'Target Score';
            } else {
                const oppId = myMatch.p1 === localStudentId ? myMatch.p2 : myMatch.p1;
                koOpponentId = oppId;
                const oppObj = playersObj[oppId];
                if (oppObj) {
                    oppName = oppObj.name;
                    oppAvatar = oppObj.avatar || '🏃';
                    koOppHouse = oppObj.house || '';
                    koOppSide = oppObj.side || '';
                    koOppRoom = oppObj.roomTeam || '';
                    const oppIdx = ranked.findIndex(p => p.id === oppId);
                    const isBounty = oppIdx === 0 && (oppObj.roundsPlayed || 0) > 0;

                    if (mode === 'rooms' && CLASS_ROOMS[koOppRoom]) {
                        const or = CLASS_ROOMS[koOppRoom];
                        oppRankText = `${or.icon} ${or.label}`;
                    } else if (mode === 'sides' && ROOM_SIDES[koOppSide]) {
                        const os = ROOM_SIDES[koOppSide];
                        oppRankText = `${os.icon} ${os.label}`;
                    } else if (mode === 'house' && ER_HOUSES[koOppHouse]) {
                        const oh = ER_HOUSES[koOppHouse];
                        oppRankText = `${oh.icon} ${oh.name} House`;
                    } else {
                        oppRankText = isBounty
                            ? `🎯 #1 BOUNTY TARGET`
                            : (oppIdx >= 0 ? `Rank #${oppIdx + 1}` : 'Challenger');
                    }
                }
            }
        }

        koOpponentName = oppName;
        koOpponentAvatar = oppAvatar;

        document.getElementById('knockout-modal').classList.remove('open');
        document.getElementById('game-results-modal').classList.remove('open');
        document.getElementById('arcade-hub').classList.remove('open');

        const myIsBounty = myRankIdx === 0 && (playersObj[localStudentId]?.roundsPlayed || 0) > 0;
        const myTeamMeta = mode === 'rooms'
            ? CLASS_ROOMS[koMyRoom]
            : (mode === 'sides' ? ROOM_SIDES[koMySide] : (mode === 'house' ? ER_HOUSES[koMyHouse] : null));

        document.getElementById('ko-vs-round-label').textContent = mode === 'rooms'
            ? `🏫 ROOM BATTLE • ROUND ${data.round}`
            : (mode === 'sides'
                ? `🧭 NORTH VS. SOUTH • ROUND ${data.round}`
                : (mode === 'house' ? `🏰 HOUSE RELAY • ROUND ${data.round}` : `ROUND ${data.round} MATCHUP`));
        document.getElementById('ko-vs-p1-avatar').textContent = sessionStudentAvatar || '🏃';
        document.getElementById('ko-vs-p1-name').textContent = sessionStudentName || 'You';
        document.getElementById('ko-vs-p1-rank').textContent = myTeamMeta
            ? `${myTeamMeta.icon} ${myTeamMeta.label || myTeamMeta.name}`
            : (myIsBounty ? `👑 #1 DEFENDING BOUNTY` : myPlaceText);
        document.getElementById('ko-vs-p2-avatar').textContent = oppAvatar;
        document.getElementById('ko-vs-p2-name').textContent = oppName;
        document.getElementById('ko-vs-p2-rank').textContent = oppRankText;
        document.getElementById('ko-vs-song-label').textContent = `Song: ${data.songTitle}`;

        const myPastOpps = (me && me.opponents)
            ? (Array.isArray(me.opponents) ? me.opponents : Object.values(me.opponents))
            : [];
        const isRematch = Boolean(koOpponentId && koOpponentId !== 'BENCHMARK_80' && myPastOpps.includes(koOpponentId));
        const rivalryBadge = document.getElementById('ko-vs-rivalry-badge');
        if (rivalryBadge) {
            rivalryBadge.style.display = isRematch ? 'inline-block' : 'none';
        }

        const p1Bubble = document.getElementById('ko-vs-p1-emote');
        const p2Bubble = document.getElementById('ko-vs-p2-emote');
        if (p1Bubble) p1Bubble.classList.remove('visible');
        if (p2Bubble) p2Bubble.classList.remove('visible');
        dealKnockoutEmoteDeck();

        const vsOverlay = document.getElementById('ko-vs-overlay');
        vsOverlay.style.display = 'flex';

        setTimeout(() => {
            vsOverlay.style.display = 'none';
            bridge.prepareMatchStart();
            updateTugOfWarHUD(100.0, koOpponentId === 'BENCHMARK_80' ? 80.0 : 100.0);
            bridge.startCountdown(() => { bridge.playSong(); });
        }, 3200);

    } else if (data.status === 'round_results') {
        const tugHud = document.getElementById('tug-of-war-hud');
        if (tugHud) tugHud.style.display = 'none';
        
        hideNameThatTuneModal();
        if (window.exitActiveMiniGame) window.exitActiveMiniGame();
        
        resetKnockoutRoundEffects();

        if (me && me.lastMatchResult && me.lastMatchResult.round === data.round && knockoutLastRoundFinished !== data.round) {
            knockoutLastRoundFinished = data.round;

            if (me.lastMatchResult.isNameThatTune) {
                const res = me.lastMatchResult;
                document.getElementById('ko-student-status').innerHTML = res.won
                    ? `🎉 Round ${data.round} Correct! "${res.songTitle}" (+${Number(res.myScore).toFixed(1)}% in ${res.responseSec.toFixed(1)}s)`
                    : `❌ Round ${data.round} Complete — The song was "${res.songTitle}"`;
                document.getElementById('ko-student-pairing-box').textContent = `Waiting for Teacher to start Round ${data.round + 1}...`;
                document.getElementById('knockout-modal').classList.add('open');
            } else {
                renderKnockoutPostRoundComparison(me, me.lastMatchResult, myPlaceText);
            }
        }
    } else if (data.status === 'finished') {
        const tugHud = document.getElementById('tug-of-war-hud');
        if (tugHud) tugHud.style.display = 'none';
        
        hideNameThatTuneModal();
        if (window.exitActiveMiniGame) window.exitActiveMiniGame();

        if (!knockoutFinaleShown) {
            knockoutFinaleShown = true;
            document.getElementById('knockout-modal')?.classList.remove('open');

            let standings = data.finalStandings || [];
            if (standings.length === 0) {
                const ranked = getRankedKnockoutPlayers(data.players || {});
                standings = ranked.map(p => ({
                    name: p.name, score: p.roundsPlayed > 0 ? (p.totalAcc / p.roundsPlayed).toFixed(1) : '0.0', avatar: p.avatar, id: p.id
                }));
            }
            const finaleTitle = mode === 'namethattune'
                ? `🎵 Name That Tune Championship Complete!`
                : (mode === 'rooms'
                    ? `🏫 Room Battle (G1 vs. G2 vs. G3) Complete!`
                    : (mode === 'sides'
                        ? `🧭 North vs. South Showdown Complete!`
                        : (mode === 'house' ? `🏰 House Relay Championship Complete!` : `🏆 Class Knockout Complete!`)));
            bridge.showGrandFinale(standings, false, finaleTitle);
        }
    }
}

export function syncKnockoutLiveScore() {
    if (!koState.isClassKnockout || !koState.knockoutRoomCode || !window.firebaseDb) return;
    if (knockoutDataCache && knockoutDataCache.tournamentMode === 'namethattune') return;

    const { gameStats, localStudentId } = bridge.getState();
    const total = gameStats.perfect + gameStats.earlyLate + gameStats.miss;
    const acc = total > 0 ? (((gameStats.perfect * 1.0 + gameStats.earlyLate * 0.5) / total) * 100) : 100;

    let oppLiveAcc = 80.0;
    if (knockoutDataCache && knockoutDataCache.players && koOpponentId && koOpponentId !== 'BENCHMARK_80') {
        const oppObj = knockoutDataCache.players[koOpponentId];
        if (oppObj && oppObj.currentScore !== undefined) oppLiveAcc = Number(oppObj.currentScore);
    }
    updateTugOfWarHUD(acc, oppLiveAcc);

    clearTimeout(knockoutLiveSyncTimer);
    knockoutLiveSyncTimer = setTimeout(async () => {
        const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}/players/${localStudentId}`), {
            currentScore: Number(acc.toFixed(1)),
            lastStats: { ...gameStats }
        });
    }, 350);
}

export async function submitKnockoutRoundFinish() {
    if (!koState.isClassKnockout || !koState.knockoutRoomCode || !window.firebaseDb) return;
    if (knockoutDataCache && knockoutDataCache.tournamentMode === 'namethattune') return;

    const { gameStats, localStudentId } = bridge.getState();
    const total = gameStats.perfect + gameStats.earlyLate + gameStats.miss;
    const acc = total > 0 ? (((gameStats.perfect * 1.0 + gameStats.earlyLate * 0.5) / total) * 100) : 0;
    const roundNum = knockoutDataCache ? knockoutDataCache.round : 1;

    const tugHud = document.getElementById('tug-of-war-hud');
    if (tugHud) tugHud.style.display = 'none';
    resetKnockoutRoundEffects();

    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}/players/${localStudentId}`), {
        currentScore: Number(acc.toFixed(1)),
        finishedRound: roundNum,
        lastStats: { ...gameStats }
    });

    document.getElementById('ko-student-status').textContent = `✅ Round ${roundNum} Finished (${acc.toFixed(1)}%)! Waiting for remaining classmates...`;
    document.getElementById('ko-student-pairing-box').textContent = `Pairings for the next round will generate automatically once all matches complete.`;
    document.getElementById('knockout-modal').classList.add('open');
}

function renderKnockoutPostRoundComparison(me, res, myPlaceText) {
    document.getElementById('knockout-modal').classList.remove('open');

    const multiGraph = document.getElementById('multi-bar-graph');
    multiGraph.innerHTML = '';
    multiGraph.style.display = 'flex';
    document.getElementById('single-bar-graph').style.display = 'none';
    document.getElementById('btn-battle-again').style.display = 'none';

    const myStats = me.lastStats || { perfect: 0, earlyLate: 0, miss: 0 };
    const myTot = Math.max(1, myStats.perfect + myStats.earlyLate + myStats.miss);
    const oppStats = res.oppStats || { perfect: 0, earlyLate: 0, miss: 0 };
    const oppTot = Math.max(1, oppStats.perfect + oppStats.earlyLate + oppStats.miss);

    const contenders = [
        {
            label: `${me.avatar || '🏃'} ${me.name} (You)`,
            score: Number(res.myScore || 0).toFixed(1),
            g: (myStats.perfect / myTot) * 100,
            o: (myStats.earlyLate / myTot) * 100,
            r: (myStats.miss / myTot) * 100,
            winner: res.won
        },
        {
            label: `${res.oppAvatar || '🏃'} ${res.oppName}`,
            score: Number(res.oppScore || 0).toFixed(1),
            g: (oppStats.perfect / oppTot) * 100,
            o: (oppStats.earlyLate / oppTot) * 100,
            r: (oppStats.miss / oppTot) * 100,
            winner: !res.won
        }
    ];

    contenders.forEach(c => {
        const col = document.createElement('div');
        col.className = 'multi-bar-column';
        col.style.minWidth = '110px';
        col.innerHTML = `
            <div class="rank-medal-badge" style="color:${c.winner ? '#22c55e' : '#f97316'};">
                ${c.winner ? '🏆 WINNER' : 'RUNNER-UP'} (${c.score}%)
            </div>
            <div class="stacked-bar" style="width:48px;">
                <div class="bar-part-red" style="height:${c.r}%;"></div>
                <div class="bar-part-orange" style="height:${c.o}%;"></div>
                <div class="bar-part-green" style="height:${c.g}%;"></div>
            </div>
            <span style="font-size:0.8rem; font-weight:700; color:#fff;">${c.label}</span>
        `;
        multiGraph.appendChild(col);
    });

    const photoFinishHtml = res.photoFinish
        ? `<div style="margin-top:6px;"><span class="photo-finish-badge">PHOTO FINISH 🔥</span> <span style="font-size:0.78rem; color:#facc15; font-weight:700;">Tiebreaker by Perfect Hits (${res.myPerfect ?? myStats.perfect} vs ${res.oppPerfect ?? oppStats.perfect})</span></div>`
        : '';

    const all50Buttons = KO_HYPE_EMOTES.map(emote => `
        <button type="button" class="ko-emote-btn" style="font-size:0.72rem; padding:4px 6px;" onclick="sendKnockoutQuickEmote('${emote.replace(/'/g, "\\'")}')">${emote}</button>
    `).join('');

    document.getElementById('game-summary-text').innerHTML = `
        <div style="font-size:1.25rem; font-weight:900; color:${res.won ? '#22c55e' : '#38bdf8'};">
            ${res.won ? '🎉 Round Victory!' : '👏 Great Effort!'}
        </div>
        ${photoFinishHtml}
        <div id="ko-post-opp-emote" style="display:none; margin-top:6px; font-size:0.85rem; color:#fff;"></div>
        <div style="margin-top:10px; background:#111827; border:1px solid #374151; border-radius:8px; padding:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:0.72rem; font-weight:800; color:#9ca3af; text-transform:uppercase;">Post-Match Reactions (All ${KO_HYPE_EMOTES.length}):</span>
                <span id="ko-post-emote-feedback" style="font-size:0.75rem; color:#cbd5e1;">Tap to react!</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(115px, 1fr)); gap:5px; max-height:135px; overflow-y:auto; padding-right:4px;">
                ${all50Buttons}
            </div>
        </div>
    `;
    document.getElementById('badge-container').innerHTML = '';
    document.getElementById('game-rank-text').textContent = `Current Class Placing: ${myPlaceText}`;
    document.getElementById('game-results-modal').classList.add('open');
}

export function leaveClassKnockout() {
    clearKnockoutAutoNextTimer();
    hideNameThatTuneModal();
    if (window.exitActiveMiniGame) window.exitActiveMiniGame();
    if (knockoutUnsubscribe) {
        knockoutUnsubscribe();
        knockoutUnsubscribe = null;
    }
    koState.isClassKnockout = false;
    koState.isKnockoutHost = false;
    bridge.setIsSongBattle(false);
    koState.knockoutRoomCode = "";
    knockoutDataCache = null;
    knockoutFinaleShown = false;
    resetKnockoutRoundEffects();
    const tugHud = document.getElementById('tug-of-war-hud');
    if (tugHud) tugHud.style.display = 'none';
    const koModal = document.getElementById('knockout-modal');
    if (koModal) koModal.classList.remove('open');
    const vsOverlay = document.getElementById('ko-vs-overlay');
    if (vsOverlay) vsOverlay.style.display = 'none';
    bridge.stopSong();
}

window.kickKnockoutPlayer = kickKnockoutPlayer;
window.selectKnockoutTeam = selectKnockoutTeam;
window.dealKnockoutEmoteDeck = dealKnockoutEmoteDeck;
window.sendKnockoutQuickEmote = sendKnockoutQuickEmote;
window.leaveClassKnockout = leaveClassKnockout;
