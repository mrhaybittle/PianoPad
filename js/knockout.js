import { initAudio, audioCtx } from './audio.js';
import { autoTransposeSong, parsePianoPad } from './musicTheory.js';

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
let knockoutDataCache = null;
let knockoutLiveSyncTimer = null;

let knockoutSabotageCount = 0;
let lastProcessedSabotageId = null;
let koOpponentId = null;
let koOpponentName = "Opponent";
let koOpponentAvatar = "🤖";
let lastProcessedOppEmoteId = null;
let koSelfEmoteHideTimer = null;
let koOppEmoteHideTimer = null;

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
    "🍿 POPCORN READY", "🚨 UPSET ALERT", "🌪️ CHAOS TIME", "💣 SABOTAGE INCOMING", "🎉 LET'S GOOO!"
];

export function initKnockoutBridge(deps) {
    bridge = deps;
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
            <div class="modal" style="max-width: 780px; width: 95%; max-height: 90vh; overflow-y: auto; border: 2px solid #ef4444; background: #0a0a0a;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #374151; padding-bottom:10px;">
                    <h2 id="ko-modal-title" style="color:#ffffff; margin:0;">🏆 Class Swiss Knockout Tournament</h2>
                    <span id="ko-room-badge" style="background:#ef4444; color:#fff; padding:4px 12px; border-radius:6px; font-weight:800; font-size:0.95rem;">Code: ---</span>
                </div>

                <div id="ko-teacher-panel" style="display:none; flex-direction:column; gap:12px;">
                    <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; background:#111; padding:10px; border-radius:8px; border:1px solid #374151;">
                        <div style="flex:1; min-width:200px;">
                            <label style="font-size:0.72rem; color:#9ca3af; font-weight:700; display:block; margin-bottom:4px;">SELECT SONG FOR NEXT ROUND:</label>
                            <select id="ko-song-select" style="width:100%; max-width:100%; background:#000; color:#fff;"></select>
                        </div>
                        <div style="display:flex; gap:8px; align-items:flex-end;">
                            <button type="button" id="btn-ko-start-round" class="btn-success" style="padding:8px 14px; font-size:0.85rem; background:#ef4444;">▶ Start Round 1</button>
                            <button type="button" id="btn-ko-force-end" class="btn-warning" style="display:none; padding:8px 12px; font-size:0.82rem;">⚡ Force End Round</button>
                            <button type="button" id="btn-ko-finish-tourney" class="btn-arcade" style="display:none; padding:8px 12px; font-size:0.82rem; background:#fff; color:#000;">🏅 End & Podium</button>
                        </div>
                    </div>

                    <div id="ko-status-banner" style="font-size:0.85rem; color:#ffffff; font-weight:700; text-align:center;">
                        Waiting for students to join using Room Code above...
                    </div>

                    <div id="ko-bracket-container" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:10px; max-height:320px; overflow-y:auto;"></div>

                    <div id="ko-standings-container" style="background:#111; border:1px solid #374151; border-radius:8px; padding:10px; max-height:200px; overflow-y:auto;"></div>
                </div>

                <div id="ko-student-panel" style="display:none; flex-direction:column; gap:12px; text-align:center;">
                    <div id="ko-student-status" style="font-size:1rem; color:#ffffff; font-weight:800;">
                        Connected to Class Knockout! Waiting for Teacher to start Round 1...
                    </div>
                    <div id="ko-student-pairing-box" style="background:#111; border:1px solid #374151; border-radius:8px; padding:12px; font-size:0.9rem; color:#fff;"></div>
                    <div id="ko-student-standings" style="background:#111; border:1px solid #374151; border-radius:8px; padding:10px; max-height:240px; overflow-y:auto; text-align:left;"></div>
                </div>

                <div class="modal-footer" style="justify-content:space-between; border-top:1px solid #374151; padding-top:10px;">
                    <span style="font-size:0.75rem; color:#9ca3af;">Swiss Placement Ladder • Zero Elimination • Everyone plays every round</span>
                    <button type="button" class="btn-danger" style="background:#ef4444;" onclick="leaveClassKnockout()">Exit Tournament</button>
                </div>
            </div>
        `;
        document.body.appendChild(koModal);

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
                    <div style="font-size:2.4rem; font-weight:900; color:#ef4444; text-shadow:0 0 15px #ef4444;">VS</div>
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

export function dealKnockoutEmoteDeck() {
    const deckEl = document.getElementById('ko-emote-deck');
    if (!deckEl) return;

    const shuffled = [...KO_HYPE_EMOTES].sort(() => Math.random() - 0.5);
    const hand = shuffled.slice(0, 4);

    deckEl.innerHTML = hand.map(emote => `
        <button type="button" class="ko-emote-btn" onclick="sendKnockoutQuickEmote('${emote.replace(/'/g, "\\'")}')">${emote}</button>
    `).join('') + `<button type="button" class="ko-shuffle-btn" title="Deal 4 new reactions" onclick="dealKnockoutEmoteDeck()">🎲</button>`;
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
}

export function updateTugOfWarHUD(myAcc, oppAcc) {
    const hud = document.getElementById('tug-of-war-hud');
    if (!hud) return;

    if (!koState.isClassKnockout) {
        hud.style.display = 'none';
        return;
    }

    const { sessionStudentName, sessionStudentAvatar } = bridge.getState();
    hud.style.display = 'flex';
    const myName = sessionStudentName || 'You';
    const myAvatar = sessionStudentAvatar || '🏃';

    document.getElementById('tug-p1-avatar').textContent = myAvatar;
    document.getElementById('tug-p1-name').textContent = myName;
    document.getElementById('tug-p1-acc').textContent = `${myAcc.toFixed(1)}%`;

    document.getElementById('tug-p2-avatar').textContent = koOpponentAvatar || '🤖';
    document.getElementById('tug-p2-name').textContent = koOpponentName || 'Opponent';
    document.getElementById('tug-p2-acc').textContent = `${oppAcc.toFixed(1)}%`;

    const diff = myAcc - oppAcc;
    const ratio = Math.max(8, Math.min(92, 50 + (diff * 2.0)));
    const fillLeft = document.getElementById('tug-fill-left');
    const marker = document.getElementById('tug-marker');

    if (fillLeft) {
        fillLeft.style.width = `${ratio}%`;
        if (diff > 0.5) {
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

    koState.isClassKnockout = true;
    koState.isKnockoutHost = true;
    bridge.setIsSongBattle(false);
    knockoutLastRoundStarted = 0;
    knockoutLastRoundFinished = 0;
    koState.knockoutRoomCode = '' + Math.floor(100 + Math.random() * 900);

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
        status: 'lobby',
        round: 0,
        songTitle: currentSongTitle,
        songCode: songSelect.value || (songList[0] ? songList[0].code : ''),
        createdAt: Date.now(),
        players: {},
        pairings: {}
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
    bridge.setStudentName(studentName);

    const { localStudentId, sessionStudentAvatar, currentStudentClass } = bridge.getState();
    const avatar = sessionStudentAvatar || localStorage.getItem('pianopad_avatar') || '🏃';
    const studentClass = currentStudentClass || localStorage.getItem('pianopad_class') || '';

    const playerRef = window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${roomCode}/players/${localStudentId}`);
    await window.firebaseSet(playerRef, {
        id: localStudentId,
        name: studentName,
        avatar: avatar,
        studentClass: studentClass,
        wins: 0,
        losses: 0,
        winStreak: 0,
        totalAcc: 0,
        roundsPlayed: 0,
        opponents: [],
        currentScore: 0,
        finishedRound: 0,
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
                alert("The teacher has closed the Class Knockout tournament.");
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

function buildStandingsHTML(rankedPlayers) {
    if (rankedPlayers.length === 0) {
        return `<div style="color:#9ca3af; font-size:0.8rem; text-align:center; padding:8px;">No students joined yet...</div>`;
    }
    const { localStudentId } = bridge.getState();
    let rows = rankedPlayers.map((p, idx) => {
        const rankBadge = idx === 0 ? '🥇 1st' : idx === 1 ? '🥈 2nd' : idx === 2 ? '🥉 3rd' : `#${idx + 1}`;
        const avgAcc = p.roundsPlayed > 0 ? (p.totalAcc / p.roundsPlayed).toFixed(1) : '0.0';
        const bountyTag = (idx === 0 && (p.roundsPlayed || 0) > 0)
            ? ` <span style="background:#ef4444; color:#fff; font-size:0.65rem; padding:1px 5px; border-radius:4px; font-weight:900; margin-left:4px;">🎯 BOUNTY</span>`
            : '';
        const streak = p.winStreak || 0;
        const streakTag = streak >= 2
            ? ` <span style="background:#f97316; color:#000; font-size:0.65rem; padding:1px 5px; border-radius:4px; font-weight:900; margin-left:4px;">🔥 ${streak}W</span>`
            : '';

        return `
            <tr style="${p.id === localStudentId ? 'background:rgba(56,189,248,0.15);' : ''}">
                <td style="font-weight:800; color:#facc15;">${rankBadge}</td>
                <td style="font-weight:700;">${p.avatar || '🏃'} ${p.name}${bountyTag}${streakTag}</td>
                <td style="color:#22c55e; font-weight:800;">${p.wins || 0}W - ${p.losses || 0}L</td>
                <td style="color:#38bdf8; font-weight:700;">${avgAcc}% avg</td>
            </tr>
        `;
    }).join('');

    return `
        <div style="font-size:0.75rem; font-weight:800; color:#facc15; margin-bottom:6px; text-transform:uppercase;">Live Class Standings (${rankedPlayers.length} Players)</div>
        <table class="race-results-table" style="margin-top:0;">
            <thead>
                <tr><th>Place</th><th>Student</th><th>Record</th><th>Avg Acc</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function generateSwissPairings(playersObj, roundNum) {
    const players = Object.values(playersObj || {});
    let ordered = [];

    if (roundNum === 1) {
        ordered = [...players].sort(() => Math.random() - 0.5);
    } else {
        ordered = getRankedKnockoutPlayers(playersObj);
        for (let i = 0; i < ordered.length - 1; i += 2) {
            const p1 = ordered[i];
            const p2 = ordered[i + 1];
            const p1History = Array.isArray(p1.opponents) ? p1.opponents : Object.values(p1.opponents || {});
            if (p1History.includes(p2.id) && i + 2 < ordered.length) {
                const temp = ordered[i + 1];
                ordered[i + 1] = ordered[i + 2];
                ordered[i + 2] = temp;
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
    const playersObj = knockoutDataCache.players || {};
    const playerIds = Object.keys(playersObj);

    if (playerIds.length < 2) {
        alert("At least 2 students must join the room before starting Round 1!");
        return;
    }

    const { currentSongTitle } = bridge.getState();
    const nextRound = (knockoutDataCache.round || 0) + 1;
    const koSongSel = document.getElementById('ko-song-select');
    const selectedCode = koSongSel.value;
    const selectedTitle = koSongSel.selectedOptions[0] ? koSongSel.selectedOptions[0].text : currentSongTitle;

    const pairings = generateSwissPairings(playersObj, nextRound);
    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");

    const updates = {
        status: 'playing',
        round: nextRound,
        songTitle: selectedTitle,
        songCode: selectedCode,
        pairings: pairings
    };

    playerIds.forEach(pid => {
        updates[`players/${pid}/currentScore`] = 0;
        updates[`players/${pid}/finishedRound`] = 0;
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
    const ranked = getRankedKnockoutPlayers(playersObj);
    document.getElementById('ko-standings-container').innerHTML = buildStandingsHTML(ranked);

    const bracketDiv = document.getElementById('ko-bracket-container');
    const statusBanner = document.getElementById('ko-status-banner');
    const btnStart = document.getElementById('btn-ko-start-round');
    const btnForce = document.getElementById('btn-ko-force-end');
    const btnFinish = document.getElementById('btn-ko-finish-tourney');

    if (data.status === 'lobby') {
        statusBanner.textContent = `Lobby Open (${ranked.length} students connected). Select Round 1 song & click Start!`;
        bracketDiv.innerHTML = ranked.map(p => `
            <div class="lobby-player-card"><span>${p.avatar || '🏃'}</span><span>${p.name} (${p.studentClass || 'Class'})</span></div>
        `).join('');
        return;
    }

    if (data.status === 'playing') {
        btnStart.style.display = 'none';
        btnForce.style.display = 'inline-flex';
        btnFinish.style.display = 'none';

        const pairings = Object.values(data.pairings || {});
        let allDone = true;

        bracketDiv.innerHTML = pairings.map((m, idx) => {
            const p1 = playersObj[m.p1];
            if (!p1) return '';
            const p1Done = p1.finishedRound === data.round;
            const s1 = Number(p1.currentScore || 0);
            const p1Status = p1Done ? `✅ ${s1.toFixed(1)}%` : `🎹 ${s1.toFixed(1)}%...`;
            const p1Emote = formatBracketEmoteBadge(p1);

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
                            <span>${p1.avatar} ${p1.name}${p1Emote}</span>
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
            const isPhotoFinish = p2 && Math.abs(s1 - s2) <= 0.5;

            return `
                <div style="background:#141824; border:1px solid ${isPhotoFinish ? '#ef4444' : '#374151'}; border-radius:8px; padding:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.72rem; color:#38bdf8; font-weight:800;">TABLE ${idx + 1} • ROUND ${data.round}</span>
                        ${isPhotoFinish ? '<span class="photo-finish-badge">PHOTO FINISH 🔥</span>' : ''}
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:0.85rem; font-weight:700;">
                        <span>${p1.avatar} ${p1.name}${p1Emote}</span>
                        <span style="color:${p1Done ? '#22c55e' : '#facc15'};">${p1Status}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.85rem; font-weight:700;">
                        <span>${p2 ? p2.avatar + ' ' + p2.name + p2Emote : '---'}</span>
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
        btnStart.textContent = `▶ Start Round ${data.round + 1} (Swiss Matched)`;
        btnFinish.style.display = 'inline-flex';
        statusBanner.textContent = `Round ${data.round} Complete! Students paired by similar accuracy for Round ${data.round + 1}.`;
    } else if (data.status === 'finished') {
        btnStart.style.display = 'none';
        btnForce.style.display = 'none';
        btnFinish.style.display = 'none';
        statusBanner.textContent = `🏆 Tournament Complete! Final Class Placings Logged to Leaderboard.`;
        
        let standings = data.finalStandings || [];
        bridge.showGrandFinale(standings, true, `🏆 Class Knockout Complete!`);
    }
}

async function forceEndKnockoutRound() {
    if (!koState.isKnockoutHost || !knockoutDataCache) return;
    if (knockoutLastRoundFinished === knockoutDataCache.round) return;
    knockoutLastRoundFinished = knockoutDataCache.round;
    await scoreAndConcludeKnockoutRound(knockoutDataCache);
}

async function scoreAndConcludeKnockoutRound(data) {
    const playersObj = data.players || {};
    const pairings = Object.values(data.pairings || {});
    const rankedBefore = getRankedKnockoutPlayers(playersObj);
    const currentLeaderId = (rankedBefore.length > 0 && (rankedBefore[0].roundsPlayed || 0) > 0) ? rankedBefore[0].id : null;
    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");

    const updates = { status: 'round_results' };

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
                oppScore: s1,
                oppStats: p1.lastStats || { perfect: 0, earlyLate: 0, miss: 0 }
            };
        }
    });

    await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}`), updates);
}

async function finalizeClassKnockout() {
    if (!koState.isKnockoutHost || !knockoutDataCache) return;
    const ranked = getRankedKnockoutPlayers(knockoutDataCache.players || {});

    const battlePayload = ranked.map(p => {
        const avgAcc = p.roundsPlayed > 0 ? (p.totalAcc / p.roundsPlayed).toFixed(1) : '0.0';
        return {
            name: p.name,
            score: avgAcc,
            avatar: p.avatar || '🏃',
            id: p.id
        };
    });

    bridge.setCurrentSongTitle(`Class Knockout (${knockoutDataCache.songTitle || 'Tournament'})`);
    await bridge.postBattleToSpreadsheet(battlePayload);

    const { update } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
    await update(window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${koState.knockoutRoomCode}`), {
        status: 'finished',
        finalStandings: battlePayload
    });
}

function handleKnockoutStudentUpdate(data) {
    const { localStudentId, sessionStudentName, sessionStudentAvatar } = bridge.getState();
    const playersObj = data.players || {};
    const me = playersObj[localStudentId];
    const ranked = getRankedKnockoutPlayers(playersObj);
    const myRankIdx = ranked.findIndex(p => p.id === localStudentId);
    const myPlaceText = myRankIdx >= 0 ? `Rank #${myRankIdx + 1} of ${ranked.length}` : 'Unranked';

    document.getElementById('ko-student-standings').innerHTML = buildStandingsHTML(ranked);

    if (koOpponentId && koOpponentId !== 'BENCHMARK_80' && playersObj[koOpponentId] && playersObj[koOpponentId].activeEmote) {
        showOpponentQuickEmote(playersObj[koOpponentId].activeEmote);
    }

    if (data.status === 'playing' && me && me.incomingSabotage) {
        applyIncomingSabotage(me.incomingSabotage);
    }

    if (data.status === 'playing' && me) {
        const myLiveAcc = Number(me.currentScore !== undefined ? me.currentScore : 100);
        let oppLiveAcc = 80.0;
        if (koOpponentId && koOpponentId !== 'BENCHMARK_80' && playersObj[koOpponentId]) {
            oppLiveAcc = Number(playersObj[koOpponentId].currentScore !== undefined ? playersObj[koOpponentId].currentScore : 100);
        }
        updateTugOfWarHUD(myLiveAcc, oppLiveAcc);
    }

    if (data.status === 'playing' && knockoutLastRoundStarted !== data.round) {
        knockoutLastRoundStarted = data.round;

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
                    const oppIdx = ranked.findIndex(p => p.id === oppId);
                    const isBounty = oppIdx === 0 && (oppObj.roundsPlayed || 0) > 0;
                    oppRankText = isBounty
                        ? `🎯 #1 BOUNTY TARGET`
                        : (oppIdx >= 0 ? `Rank #${oppIdx + 1}` : 'Challenger');
                }
            }
        }

        koOpponentName = oppName;
        koOpponentAvatar = oppAvatar;

        document.getElementById('knockout-modal').classList.remove('open');
        document.getElementById('game-results-modal').classList.remove('open');
        document.getElementById('arcade-hub').classList.remove('open');

        const myIsBounty = myRankIdx === 0 && (playersObj[localStudentId]?.roundsPlayed || 0) > 0;
        document.getElementById('ko-vs-round-label').textContent = `ROUND ${data.round} MATCHUP`;
        document.getElementById('ko-vs-p1-avatar').textContent = sessionStudentAvatar || '🏃';
        document.getElementById('ko-vs-p1-name').textContent = sessionStudentName || 'You';
        document.getElementById('ko-vs-p1-rank').textContent = myIsBounty ? `👑 #1 DEFENDING BOUNTY` : myPlaceText;
        document.getElementById('ko-vs-p2-avatar').textContent = oppAvatar;
        document.getElementById('ko-vs-p2-name').textContent = oppName;
        document.getElementById('ko-vs-p2-rank').textContent = oppRankText;
        document.getElementById('ko-vs-song-label').textContent = `Song: ${data.songTitle}`;

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
        resetKnockoutRoundEffects();

        if (me && me.lastMatchResult && me.lastMatchResult.round === data.round && knockoutLastRoundFinished !== data.round) {
            knockoutLastRoundFinished = data.round;
            renderKnockoutPostRoundComparison(me, me.lastMatchResult, myPlaceText);
        }
    } else if (data.status === 'finished') {
        const tugHud = document.getElementById('tug-of-war-hud');
        if (tugHud) tugHud.style.display = 'none';
        let standings = data.finalStandings || [];
        if (standings.length === 0) {
            const ranked = getRankedKnockoutPlayers(data.players || {});
            standings = ranked.map(p => ({
                name: p.name, score: p.roundsPlayed > 0 ? (p.totalAcc / p.roundsPlayed).toFixed(1) : '0.0', avatar: p.avatar, id: p.id
            }));
        }
        bridge.showGrandFinale(standings, false, `🏆 Class Knockout Complete!`);
    }
}

export function syncKnockoutLiveScore() {
    if (!koState.isClassKnockout || !koState.knockoutRoomCode || !window.firebaseDb) return;
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
    document.getElementById('ko-student-pairing-box').textContent = `Swiss pairings for the next round will generate automatically once all matches complete.`;
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

    document.getElementById('game-summary-text').innerHTML = `
        <div style="font-size:1.25rem; font-weight:900; color:${res.won ? '#22c55e' : '#38bdf8'};">
            ${res.won ? '🎉 Round Victory!' : '👏 Great Effort!'}
        </div>
        ${photoFinishHtml}
        <div style="font-size:0.88rem; color:#cbd5e1; margin-top:4px;">
            Stay ready — Teacher will launch the next skill-matched round shortly!
        </div>
    `;
    document.getElementById('badge-container').innerHTML = '';
    document.getElementById('game-rank-text').textContent = `Current Class Placing: ${myPlaceText}`;
    document.getElementById('game-results-modal').classList.add('open');
}

export function leaveClassKnockout() {
    if (knockoutUnsubscribe) {
        knockoutUnsubscribe();
        knockoutUnsubscribe = null;
    }
    koState.isClassKnockout = false;
    koState.isKnockoutHost = false;
    bridge.setIsSongBattle(false);
    koState.knockoutRoomCode = "";
    knockoutDataCache = null;
    resetKnockoutRoundEffects();
    const tugHud = document.getElementById('tug-of-war-hud');
    if (tugHud) tugHud.style.display = 'none';
    const koModal = document.getElementById('knockout-modal');
    if (koModal) koModal.classList.remove('open');
    const vsOverlay = document.getElementById('ko-vs-overlay');
    if (vsOverlay) vsOverlay.style.display = 'none';
    bridge.stopSong();
}
