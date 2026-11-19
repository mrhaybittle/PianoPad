import { initAudio, audioCtx } from './audio.js';
import { autoTransposeSong, parsePianoPad } from './musicTheory.js';
import {
    generateNameThatTuneChoices,
    playSongSnippet,
    launchStudentNameThatTuneRound,
    hideNameThatTuneModal,
    updateNameThatTuneProgressText
} from './nameThatTune.js';

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
    if (!koState.isClassKnockout || mode === 'namethattune') {
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

        return `
            <tr style="${p.id === localStudentId ? 'background:rgba(56,189,248,0.15);' : ''}">
                <td style="font-weight:800; color:#facc15;">${rankBadge}</td>
                <td style="font-weight:700;">${p.avatar || '🏃'} ${p.name}${teamBadge}${bountyTag}${streakTag}</td>
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
    if (mode === 'namethattune') return {};

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

    const minPlayers = modeVal === 'namethattune' ? 1 : 2;
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
            <div class="lobby-player-card">
                <span>${p.avatar || '🏃'}</span>
                <span>${p.name} (${p.studentClass || 'Class'})${isTeamMode ? getTeamBadgeHTML(p, mode, nttGroupHouses) : ''}</span>
            </div>
        `).join('');
        return;
    }

    if (data.status === 'playing') {
        btnStart.style.display = 'none';
        btnForce.style.display = 'inline-flex';
        btnFinish.style.display = (data.round || 0) >= 1 ? 'inline-flex' : 'none';

        // NAME THAT TUNE LIVE ANSWER MONITOR
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

        // STANDARD 1V1 SWISS BRACKET MONITOR
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
