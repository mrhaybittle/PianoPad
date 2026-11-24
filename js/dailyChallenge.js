// js/dailyChallenge.js
import { initAudio, audioCtx } from './audio.js';
import { APPS_SCRIPT_URL } from './config.js';

// ============================================================================
// DAILY CHALLENGE LIST
// Edit numbers, descriptions, or delete any challenge object below.
// ============================================================================
export const DAILY_CHALLENGES = [
    // 1. Play any song in Game Mode 20 times in a single day.
    {
        id: 'play_game_20',
        title: 'Game Mode Marathon',
        description: 'Play through a piece in Game Mode 20 times today.',
        tier: 'Silver',
        target: 20,
        unit: 'plays'
    },

    // 2. Score over 90% accuracy on 5 different songs (at 100% speed or faster) in one lesson.
    {
        id: 'master_5_90',
        title: 'The Penta-Master',
        description: 'Master 5 different songs with over 90% accuracy (at 100%+ speed).',
        tier: 'Gold',
        target: 5,
        unit: 'songs'
    },

    // 3. Record 0 tab switches (Breaks: 0) for at least 20 continuous minutes.
    {
        id: 'no_tabs_20m',
        title: 'Locked In (20 Mins)',
        description: 'Record 0 tab switches for at least 20 minutes of your session.',
        tier: 'Silver',
        target: 20,
        unit: 'mins'
    },

    // 4. Record 0 tab switches (Breaks: 0) for at least 35 continuous minutes.
    {
        id: 'no_tabs_35m',
        title: 'Ironclad Focus',
        description: 'Record 0 tab switches for 35 minutes of your session.',
        tier: 'Gold',
        target: 35,
        unit: 'mins'
    },

    // 5. Achieve a 100% accuracy score on any song at 100% speed or faster.
    {
        id: 'perfect_100',
        title: 'Flawless Victory',
        description: 'Score 100% accuracy on any song in Game Mode (at 100%+ speed).',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 6. Hit 35 Perfect notes in a row without any Early/Late or Missed notes.
    {
        id: 'streak_35',
        title: 'Unstoppable Streak',
        description: 'Hit a streak of 35 Perfect notes in a row without an error.',
        tier: 'Silver',
        target: 35,
        unit: 'notes'
    },

    // 7. Hit 60 Perfect notes in a row without any Early/Late or Missed notes.
    {
        id: 'streak_60',
        title: 'Virtuoso Streak',
        description: 'Hit a streak of 60 Perfect notes in a row without an error.',
        tier: 'Gold',
        target: 60,
        unit: 'notes'
    },

    // 8. Finish any Medium or Hard song with 0 Missed notes (Early/Late hits allowed).
    {
        id: 'zero_misses_med_hard',
        title: 'Zero Misses',
        description: 'Complete a Medium or Hard song with 0 Missed notes (at 100%+ speed).',
        tier: 'Silver',
        target: 1,
        unit: 'song'
    },

    // 9. Score 85% or higher on a Hard (Red) difficulty song at 100% speed or faster.
    {
        id: 'hard_song_85',
        title: 'Red-Label Conqueror',
        description: 'Score at least 85% accuracy on a Hard (Red) song at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 10. Complete any song at 130% speed or faster with at least 85% accuracy.
    {
        id: 'turbo_130',
        title: 'Turbo Fingers',
        description: 'Complete any song at 130% speed (or faster) with at least 85% accuracy.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 11. Complete an Easy (Green) song at 160% speed or faster with at least 80% accuracy.
    {
        id: 'hyper_easy_160',
        title: 'Hyper-Speed Green',
        description: 'Play an Easy (Green) song at 160% speed (or faster) with 80%+ accuracy.',
        tier: 'Silver',
        target: 1,
        unit: 'song'
    },

    // 12. Score 85% or higher 3 times in a row on the exact same song.
    {
        id: 'hat_trick_85',
        title: 'Hat-Trick Consistency',
        description: 'Score 85% or higher 3 times in a row on the same song (at 100%+ speed).',
        tier: 'Silver',
        target: 3,
        unit: 'in a row'
    },

    // 13. Accumulate 300 total Perfect note hits across songs today.
    {
        id: 'total_perfect_300',
        title: '300 Perfect Club',
        description: 'Land 300 total Perfect hits across any songs today.',
        tier: 'Bronze',
        target: 300,
        unit: 'hits'
    },

    // 14. Accumulate 600 total Perfect note hits across songs today.
    {
        id: 'total_perfect_600',
        title: '600 Perfect Club',
        description: 'Land 600 total Perfect hits across any songs today.',
        tier: 'Gold',
        target: 600,
        unit: 'hits'
    },

    // 15. Turn Sheet Music OFF and score over 90% on a Medium or Hard song.
    {
        id: 'waterfall_only_90',
        title: 'Waterfall Only',
        description: 'Toggle Sheet: OFF and score 90%+ on a Medium or Hard song (100%+ speed).',
        tier: 'Silver',
        target: 1,
        unit: 'song'
    },

    // 16. Complete 3 songs in Game Mode using 3 different visual themes (Dark, Neon, Retro, etc.).
    {
        id: 'theme_explorer_3',
        title: 'Style Explorer',
        description: 'Complete 3 songs in Game Mode using 3 different visual themes.',
        tier: 'Bronze',
        target: 3,
        unit: 'themes'
    },

    // 17. Complete 3 songs in Game Mode using 3 different instrument sounds.
    {
        id: 'instrument_explorer_3',
        title: 'Sound Explorer',
        description: 'Complete 3 songs in Game Mode using 3 different instruments.',
        tier: 'Bronze',
        target: 3,
        unit: 'instruments'
    },

    // 18. Record an original melody of at least 16 notes using the Record button.
    {
        id: 'composer_16_notes',
        title: 'Original Composer',
        description: 'Use Record to capture an original melody of at least 16 notes.',
        tier: 'Bronze',
        target: 1,
        unit: 'recording'
    },

    // 19. Turn on Loop Mode at 80% speed (or slower) and let it auto-accelerate past 100%.
    {
        id: 'loop_climber',
        title: 'The Loop Climber',
        description: 'Start Loop Mode at 80% speed (or slower) and let it auto-climb past 100%.',
        tier: 'Silver',
        target: 1,
        unit: 'climb'
    },

    // 20. Finish practicing a song in Step Mode, then score 80%+ on that same song in Game Mode.
    {
        id: 'step_to_game_80',
        title: 'Step-by-Step Mastery',
        description: 'Finish a song in Step Mode, then score 80%+ on that same song in Game Mode.',
        tier: 'Silver',
        target: 1,
        unit: 'song'
    },

    // 21. Master 3 different Medium (Orange) songs with at least 85% accuracy.
    {
        id: 'master_3_medium',
        title: 'Orange-Label Trio',
        description: 'Master 3 different Medium (Orange) songs with 85%+ accuracy (100%+ speed).',
        tier: 'Silver',
        target: 3,
        unit: 'songs'
    },

    // 22. Turn MIC INPUT ON and complete any song in Game Mode with at least 75% accuracy.
    {
        id: 'acoustic_mic_song',
        title: 'Acoustic Musician',
        description: 'Turn MIC INPUT: ON and complete any song with 75%+ accuracy.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    }
];

// ============================================================================
// INTERNAL STATE & BRIDGE
// ============================================================================
let bridge = null;
let dailyState = null;

export function initDailyChallengeBridge(deps) {
    bridge = deps;
    ensureDailyChallengeUI();
    refreshDailyState();
    updateDailyHudPill();
}

function getTodayDateKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getTodaysChallenge() {
    const dateKey = getTodayDateKey();
    let hash = 0;
    for (let i = 0; i < dateKey.length; i++) {
        hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
    }
    const idx = hash % DAILY_CHALLENGES.length;
    return DAILY_CHALLENGES[idx];
}

function getStorageKey() {
    const state = bridge ? bridge.getState() : {};
    const rawUser = (window.pianoPadUser?.email || state.sessionStudentName || localStorage.getItem('pianopad_name') || 'guest')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');
    return `pianopad_daily_${rawUser}_${getTodayDateKey()}`;
}

function refreshDailyState() {
    const challenge = getTodaysChallenge();
    const key = getStorageKey();

    try {
        const saved = localStorage.getItem(key);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.challengeId === challenge.id) {
                dailyState = parsed;
                return dailyState;
            }
        }
    } catch (e) {
        console.warn('Could not read daily challenge storage:', e);
    }

    dailyState = {
        dateKey: getTodayDateKey(),
        challengeId: challenge.id,
        accepted: false,
        progress: 0,
        completed: false,
        meta: {
            masteredSongs: [],
            mediumMasteredSongs: [],
            themesUsed: [],
            instrumentsUsed: [],
            lastSongTitle: '',
            consecutive85: 0,
            startedSlowLoop: false,
            stepCompletedSong: ''
        }
    };
    saveDailyState();
    return dailyState;
}

function saveDailyState() {
    if (!dailyState) return;
    try {
        localStorage.setItem(getStorageKey(), JSON.stringify(dailyState));
    } catch (e) {
        console.warn('Could not save daily challenge storage:', e);
    }
}

// ============================================================================
// UI INJECTION (MODAL + FOOTER PILL)
// ============================================================================
function ensureDailyChallengeUI() {
    if (!document.getElementById('daily-challenge-styles')) {
        const style = document.createElement('style');
        style.id = 'daily-challenge-styles';
        style.textContent = `
            #daily-challenge-modal {
                z-index: 350;
            }
            .dc-card {
                background: linear-gradient(145deg, #111827 0%, #1e1b4b 55%, #0f172a 100%);
                border: 2px solid #facc15;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(250, 204, 21, 0.25);
                border-radius: 18px;
                max-width: 480px;
                width: 92%;
                padding: 26px;
                text-align: center;
                color: #f8fafc;
            }
            .dc-tier-badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 999px;
                font-size: 0.72rem;
                font-weight: 900;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                margin-bottom: 10px;
            }
            .dc-tier-Bronze { background: linear-gradient(135deg, #b45309, #f59e0b); color: #fff; }
            .dc-tier-Silver { background: linear-gradient(135deg, #64748b, #cbd5e1); color: #0f172a; }
            .dc-tier-Gold   { background: linear-gradient(135deg, #f59e0b, #facc15); color: #0f172a; }
            .dc-progress-track {
                width: 100%;
                height: 14px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 999px;
                overflow: hidden;
                margin: 14px 0 6px 0;
                border: 1px solid rgba(255, 255, 255, 0.15);
            }
            .dc-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #38bdf8, #22c55e);
                transition: width 0.4s ease;
            }
            #daily-challenge-hud-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: #1e1b4b;
                border: 1px solid #facc15;
                color: #facc15;
                font-size: 0.72rem;
                font-weight: 800;
                padding: 4px 10px;
                border-radius: 8px;
                cursor: pointer;
                white-space: nowrap;
                transition: transform 0.15s, background-color 0.2s;
            }
            #daily-challenge-hud-pill:hover {
                transform: translateY(-1px);
                background: #312e81;
            }
            #daily-challenge-hud-pill.dc-done {
                background: #052e16;
                border-color: #22c55e;
                color: #4ade80;
            }
        `;
        document.head.appendChild(style);
    }

    if (!document.getElementById('daily-challenge-modal')) {
        const modal = document.createElement('div');
        modal.id = 'daily-challenge-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="dc-card">
                <div style="font-size: 2.4rem; margin-bottom: 4px;" id="dc-icon">🎯</div>
                <div id="dc-tier-pill" class="dc-tier-badge dc-tier-Gold">DAILY CHALLENGE</div>
                <h2 id="dc-title" style="margin: 0 0 8px 0; font-size: 1.45rem; color: #ffffff;">Today's Challenge</h2>
                <p id="dc-desc" style="font-size: 0.95rem; color: #cbd5e1; line-height: 1.45; margin: 0 0 12px 0;"></p>

                <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 12px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.78rem; font-weight:700; color:#94a3b8;">
                        <span>PROGRESS</span>
                        <span id="dc-progress-label" style="color:#ffffff;">0 / 1</span>
                    </div>
                    <div class="dc-progress-track">
                        <div class="dc-progress-fill" id="dc-progress-fill" style="width: 0%;"></div>
                    </div>
                    <div style="font-size: 0.75rem; color: #facc15; font-weight: 700; margin-top: 6px;">
                        🎁 Reward: Unlocks 5 Bonus Instrument Sounds & Logs to Leaderboard!
                    </div>
                </div>

                <div style="display: flex; justify-content: center; gap: 10px; margin-top: 18px;">
                    <button type="button" id="btn-dc-skip" class="btn-secondary" style="padding: 10px 16px; font-size: 0.88rem;">
                        Skip for Now
                    </button>
                    <button type="button" id="btn-dc-accept" class="btn-success" style="padding: 10px 22px; font-size: 0.95rem; font-weight: 800;">
                        Accept Challenge!
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('btn-dc-skip').addEventListener('click', () => {
            modal.classList.remove('open');
            updateDailyHudPill();
        });

        document.getElementById('btn-dc-accept').addEventListener('click', () => {
            refreshDailyState();
            dailyState.accepted = true;
            saveDailyState();
            modal.classList.remove('open');
            updateDailyHudPill();
            const statusEl = document.getElementById('status');
            if (statusEl) {
                const ch = getTodaysChallenge();
                statusEl.textContent = `🎯 Daily Challenge Accepted: ${ch.title} (${dailyState.progress}/${ch.target} ${ch.unit})`;
            }
        });
    }

    const footerRight = document.querySelector('.footer-right-group');
    if (footerRight && !document.getElementById('daily-challenge-hud-pill')) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.id = 'daily-challenge-hud-pill';
        pill.title = "Click to view Today's Daily Challenge";
        pill.addEventListener('click', () => openDailyChallengeModal(true));
        footerRight.prepend(pill);
    }
}

export function promptDailyChallenge() {
    ensureDailyChallengeUI();
    refreshDailyState();
    updateDailyHudPill();

    // Only auto-popup if the student hasn't already accepted or completed today's challenge
    if (!dailyState.accepted && !dailyState.completed) {
        openDailyChallengeModal(false);
    }
}

export function openDailyChallengeModal(isManualView = false) {
    ensureDailyChallengeUI();
    refreshDailyState();

    const ch = getTodaysChallenge();
    const pct = Math.min(100, Math.round((dailyState.progress / Math.max(1, ch.target)) * 100));

    document.getElementById('dc-icon').textContent = dailyState.completed ? '🏆' : '🎯';
    const tierPill = document.getElementById('dc-tier-pill');
    tierPill.className = `dc-tier-badge dc-tier-${ch.tier || 'Gold'}`;
    tierPill.textContent = `${ch.tier || 'Daily'} Daily Challenge`;

    document.getElementById('dc-title').textContent = ch.title;
    document.getElementById('dc-desc').textContent = ch.description;
    document.getElementById('dc-progress-label').textContent = dailyState.completed
        ? `COMPLETED! (${ch.target}/${ch.target} ${ch.unit})`
        : `${dailyState.progress} / ${ch.target} ${ch.unit}`;
    document.getElementById('dc-progress-fill').style.width = `${pct}%`;

    const acceptBtn = document.getElementById('btn-dc-accept');
    const skipBtn = document.getElementById('btn-dc-skip');

    if (dailyState.completed) {
        acceptBtn.textContent = 'Awesome!';
        skipBtn.style.display = 'none';
    } else if (dailyState.accepted || isManualView) {
        acceptBtn.textContent = dailyState.accepted ? 'Keep Going!' : 'Accept Challenge!';
        skipBtn.style.display = dailyState.accepted ? 'none' : 'inline-flex';
    } else {
        acceptBtn.textContent = 'Accept Challenge!';
        skipBtn.style.display = 'inline-flex';
    }

    document.getElementById('daily-challenge-modal').classList.add('open');
}

function updateDailyHudPill() {
    const pill = document.getElementById('daily-challenge-hud-pill');
    if (!pill) return;

    refreshDailyState();
    const ch = getTodaysChallenge();

    if (dailyState.completed) {
        pill.classList.add('dc-done');
        pill.textContent = `✅ Daily Complete!`;
    } else if (dailyState.accepted) {
        pill.classList.remove('dc-done');
        pill.textContent = `🎯 ${ch.title}: ${dailyState.progress}/${ch.target}`;
    } else {
        pill.classList.remove('dc-done');
        pill.textContent = `🎯 Daily Challenge`;
    }
}

function playChallengeFanfare() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.09);
            gain.gain.setValueAtTime(0.2, now + idx * 0.09);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.45);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + idx * 0.09);
            osc.stop(now + idx * 0.09 + 0.48);
        });
    } catch (e) {}
}

function checkAndTriggerCompletion(challenge) {
    if (!dailyState || dailyState.completed) return;

    if (dailyState.progress >= challenge.target) {
        dailyState.progress = challenge.target;
        dailyState.completed = true;
        saveDailyState();
        updateDailyHudPill();
        playChallengeFanfare();

        if (bridge) {
            if (typeof bridge.unlockBonusSounds === 'function') {
                bridge.unlockBonusSounds(`Daily Challenge "${challenge.title}" completed!`);
            }
            if (typeof bridge.spawnConfetti === 'function') {
                const canvas = document.getElementById('waterfall-canvas');
                const cx = canvas ? canvas.width / 2 : 400;
                const cy = canvas ? canvas.height / 2 : 200;
                bridge.spawnConfetti(cx, cy, '#facc15');
            }
            if (typeof bridge.showFlashingStatus === 'function') {
                bridge.showFlashingStatus(`🏆 DAILY CHALLENGE COMPLETE: "${challenge.title}"! Logged to Leaderboard & 5 Bonus Instruments Unlocked!`, 7000);
            }

            // Log completion directly to the Leaderboard Google Sheet
            const state = bridge.getState ? bridge.getState() : {};
            const studentName = (typeof bridge.ensureStudentName === 'function' ? bridge.ensureStudentName() : state.sessionStudentName)
                || localStorage.getItem('pianopad_name')
                || 'Student';
            const studentClass = state.currentStudentClass || localStorage.getItem('pianopad_class') || state.currentRoom || '';
            const entryTitle = `🎯 Daily: ${challenge.title}`;

            if (APPS_SCRIPT_URL && typeof bridge.sendJSONP === 'function') {
                const url = `${APPS_SCRIPT_URL}?action=SCORE_SUBMIT&name=${encodeURIComponent(studentName)}&title=${encodeURIComponent(entryTitle)}&score=100&tempo=${encodeURIComponent('100%')}&class=${encodeURIComponent(studentClass)}&studentClass=${encodeURIComponent(studentClass)}&t=${Date.now()}`;
                bridge.sendJSONP(url);
            }
        }
    } else {
        saveDailyState();
        updateDailyHudPill();
    }
}

// ============================================================================
// PROGRESS HOOKS CALLED FROM main.js
// ============================================================================

// Hook 1: Called inside showGameResultsPopUp() when a Game Mode song finishes
export function notifyDailySongComplete({
    songTitle,
    difficulty,
    accuracy,
    speed,
    perfect,
    miss,
    theme,
    instrument,
    showSheetMusic,
    isMicListening
}) {
    refreshDailyState();
    if (dailyState.completed) return;

    const ch = getTodaysChallenge();
    const cleanTitle = (songTitle || '').trim();
    const diffLower = (difficulty || '').toLowerCase().trim();

    switch (ch.id) {
        case 'play_game_20':
            dailyState.progress += 1;
            break;

        case 'master_5_90':
            if (accuracy >= 90 && speed >= 100 && cleanTitle) {
                if (!dailyState.meta.masteredSongs.includes(cleanTitle)) {
                    dailyState.meta.masteredSongs.push(cleanTitle);
                }
                dailyState.progress = dailyState.meta.masteredSongs.length;
            }
            break;

        case 'perfect_100':
            if (accuracy >= 100 && speed >= 100) {
                dailyState.progress = 1;
            }
            break;

        case 'zero_misses_med_hard':
            if ((diffLower === 'medium' || diffLower === 'hard') && miss === 0 && speed >= 100) {
                dailyState.progress = 1;
            }
            break;

        case 'hard_song_85':
            if (diffLower === 'hard' && accuracy >= 85 && speed >= 100) {
                dailyState.progress = 1;
            }
            break;

        case 'turbo_130':
            if (speed >= 130 && accuracy >= 85) {
                dailyState.progress = 1;
            }
            break;

        case 'hyper_easy_160':
            if (diffLower === 'easy' && speed >= 160 && accuracy >= 80) {
                dailyState.progress = 1;
            }
            break;

        case 'hat_trick_85':
            if (accuracy >= 85 && speed >= 100 && cleanTitle) {
                if (dailyState.meta.lastSongTitle === cleanTitle) {
                    dailyState.meta.consecutive85 += 1;
                } else {
                    dailyState.meta.lastSongTitle = cleanTitle;
                    dailyState.meta.consecutive85 = 1;
                }
                dailyState.progress = Math.max(dailyState.progress, dailyState.meta.consecutive85);
            } else {
                dailyState.meta.consecutive85 = 0;
            }
            break;

        case 'total_perfect_300':
        case 'total_perfect_600':
            dailyState.progress += Number(perfect || 0);
            break;

        case 'waterfall_only_90':
            if (!showSheetMusic && (diffLower === 'medium' || diffLower === 'hard') && accuracy >= 90 && speed >= 100) {
                dailyState.progress = 1;
            }
            break;

        case 'theme_explorer_3':
            if (theme && !dailyState.meta.themesUsed.includes(theme)) {
                dailyState.meta.themesUsed.push(theme);
            }
            dailyState.progress = dailyState.meta.themesUsed.length;
            break;

        case 'instrument_explorer_3':
            if (instrument && !dailyState.meta.instrumentsUsed.includes(instrument)) {
                dailyState.meta.instrumentsUsed.push(instrument);
            }
            dailyState.progress = dailyState.meta.instrumentsUsed.length;
            break;

        case 'step_to_game_80':
            if (dailyState.meta.stepCompletedSong && dailyState.meta.stepCompletedSong === cleanTitle && accuracy >= 80 && speed >= 100) {
                dailyState.progress = 1;
            }
            break;

        case 'master_3_medium':
            if (diffLower === 'medium' && accuracy >= 85 && speed >= 100 && cleanTitle) {
                if (!dailyState.meta.mediumMasteredSongs.includes(cleanTitle)) {
                    dailyState.meta.mediumMasteredSongs.push(cleanTitle);
                }
                dailyState.progress = dailyState.meta.mediumMasteredSongs.length;
            }
            break;

        case 'acoustic_mic_song':
            if (isMicListening && accuracy >= 75) {
                dailyState.progress = 1;
            }
            break;
    }

    checkAndTriggerCompletion(ch);
}

// Hook 2: Called inside playManualNote() when currentPerfectStreak updates
export function notifyDailyStreak(streak) {
    refreshDailyState();
    if (dailyState.completed) return;

    const ch = getTodaysChallenge();
    if (ch.id === 'streak_35' || ch.id === 'streak_60') {
        if (streak > dailyState.progress) {
            dailyState.progress = streak;
            checkAndTriggerCompletion(ch);
        }
    }
}

// Hook 3: Called inside updateMonitorWidget() once per second
export function notifyDailyTick({
    elapsedMs,
    tabSwitches,
    isPlaying,
    isLooping,
    isStepMode,
    stepFinished,
    currentSongTitle,
    speed
}) {
    refreshDailyState();
    if (dailyState.completed) return;

    const ch = getTodaysChallenge();

    if (ch.id === 'no_tabs_20m' || ch.id === 'no_tabs_35m') {
        if (tabSwitches === 0) {
            const mins = Math.floor(elapsedMs / 60000);
            if (mins > dailyState.progress) {
                dailyState.progress = mins;
                checkAndTriggerCompletion(ch);
            }
        }
    } else if (ch.id === 'loop_climber') {
        if (isPlaying && isLooping) {
            if (speed <= 80) {
                dailyState.meta.startedSlowLoop = true;
            }
            if (dailyState.meta.startedSlowLoop && speed >= 100) {
                dailyState.progress = 1;
                checkAndTriggerCompletion(ch);
            }
        } else {
            dailyState.meta.startedSlowLoop = false;
        }
    } else if (ch.id === 'step_to_game_80') {
        if (isStepMode && stepFinished && currentSongTitle) {
            if (dailyState.meta.stepCompletedSong !== currentSongTitle.trim()) {
                dailyState.meta.stepCompletedSong = currentSongTitle.trim();
                saveDailyState();
            }
        }
    }
}

// Hook 4: Called inside toggleRecording() when a recording stops
export function notifyDailyRecording(noteCount) {
    refreshDailyState();
    if (dailyState.completed) return;

    const ch = getTodaysChallenge();
    if (ch.id === 'composer_16_notes' && noteCount >= 16) {
        dailyState.progress = 1;
        checkAndTriggerCompletion(ch);
    }
}
