import { initAudio, audioCtx, playTone, playErrorClackSound } from './audio.js';
import { getNoteFrequency, parsePianoPad, autoTransposeSong } from './musicTheory.js';

let snippetTimers = [];
let roundStartTimeMs = 0;
let hasAnsweredCurrentRound = false;
let currentRoundNumber = 0;
let replaysRemaining = 2;
let activeSnippetNotes = [];

const FALLBACK_DISTRACTORS = [
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

const CHOICE_COLORS = [
    { bg: '#dc2626', border: '#f87171', badge: '1' },
    { bg: '#2563eb', border: '#60a5fa', badge: '2' },
    { bg: '#d97706', border: '#fbbf24', badge: '3' },
    { bg: '#059669', border: '#34d399', badge: '4' },
    { bg: '#7c3aed', border: '#a78bfa', badge: '5' },
    { bg: '#db2777', border: '#f472b6', badge: '6' },
    { bg: '#0891b2', border: '#22d3ee', badge: '7' },
    { bg: '#4f46e5', border: '#818cf8', badge: '8' }
];

export function stopNameThatTuneAudio() {
    snippetTimers.forEach(id => clearTimeout(id));
    snippetTimers = [];
    const wave = document.getElementById('ntt-soundwave');
    if (wave) wave.classList.remove('playing');
}

export function hideNameThatTuneModal() {
    stopNameThatTuneAudio();
    const modal = document.getElementById('ntt-quiz-modal');
    if (modal) modal.classList.remove('open');
}

export function generateNameThatTuneChoices(correctTitle, songList) {
    const cleanCorrect = (correctTitle || '').trim();
    const pool = new Set();

    (songList || []).forEach(s => {
        const t = (s.title || '').trim();
        if (t && t.toLowerCase() !== cleanCorrect.toLowerCase()) {
            pool.add(t);
        }
    });

    for (const fallback of FALLBACK_DISTRACTORS) {
        if (pool.size >= 12) break;
        if (fallback.toLowerCase() !== cleanCorrect.toLowerCase()) {
            pool.add(fallback);
        }
    }

    const distractors = Array.from(pool)
        .sort(() => Math.random() - 0.5)
        .slice(0, 7);

    const all8 = [cleanCorrect, ...distractors].sort(() => Math.random() - 0.5);
    return all8;
}

export function playSongSnippet(songCode, noteCount = 5) {
    stopNameThatTuneAudio();
    initAudio();

    const parsed = parsePianoPad(songCode || '');
    if (!parsed || parsed.length === 0) return;

    const transposed = autoTransposeSong(parsed);
    const slice = transposed.slice(0, Math.max(2, noteCount));
    activeSnippetNotes = slice;

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
        snippetTimers.push(tId);
    });

    const endId = setTimeout(() => {
        if (wave) wave.classList.remove('playing');
    }, cumulativeMs + 550);
    snippetTimers.push(endId);
}

function playCorrectChime() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);       // D5
        osc.frequency.setValueAtTime(880.00, now + 0.08); // A5
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    } catch (e) {}
}

export function ensureNameThatTuneModal() {
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

    // Keyboard shortcuts 1–8 for quick selection away from the piano
    window.addEventListener('keydown', (e) => {
        const m = document.getElementById('ntt-quiz-modal');
        if (!m || !m.classList.contains('open') || hasAnsweredCurrentRound) return;
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 8) {
            const btn = document.querySelector(`.ntt-choice-btn[data-choice-idx="${num - 1}"]`);
            if (btn && !btn.disabled) btn.click();
        }
    });
}

export function launchStudentNameThatTuneRound(data, houseBadgeHtml, onAnswerSubmit) {
    ensureNameThatTuneModal();

    const ntt = data.nttData || {};
    const choices = Array.isArray(ntt.choices) ? ntt.choices : Object.values(ntt.choices || {});
    const noteCount = Number(ntt.noteCount || 5);
    const correctTitle = data.songTitle || '';

    currentRoundNumber = data.round || 1;
    hasAnsweredCurrentRound = false;
    replaysRemaining = 2;
    roundStartTimeMs = performance.now();

    document.getElementById('ntt-round-badge').textContent = `ROUND ${currentRoundNumber} • NAME THAT TUNE`;
    document.getElementById('ntt-house-pill').innerHTML = houseBadgeHtml || '';
    document.getElementById('ntt-prompt-title').textContent = `🎧 Listen to the first ${noteCount} notes — Which song is it?`;
    document.getElementById('ntt-feedback-banner').innerHTML = `<span style="color:#38bdf8;">Answer fast for up to 100% score! (Tap a title or press 1–8)</span>`;
    document.getElementById('ntt-answered-count').textContent = 'Select 1 of the 8 songs above...';

    const replayBtn = document.getElementById('btn-ntt-replay');
    replayBtn.disabled = false;
    replayBtn.style.opacity = '1';
    replayBtn.textContent = `🔊 Replay Notes (${replaysRemaining} left)`;
    replayBtn.onclick = () => {
        if (replaysRemaining <= 0) return;
        replaysRemaining--;
        replayBtn.textContent = replaysRemaining > 0 ? `🔊 Replay Notes (${replaysRemaining} left)` : '🔇 No Replays Left';
        if (replaysRemaining <= 0) {
            replayBtn.disabled = true;
            replayBtn.style.opacity = '0.5';
        }
        playSongSnippet(data.songCode, noteCount);
    };

    const grid = document.getElementById('ntt-choices-grid');
    grid.innerHTML = choices.map((title, idx) => {
        const theme = CHOICE_COLORS[idx % CHOICE_COLORS.length];
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
            if (hasAnsweredCurrentRound) return;
            hasAnsweredCurrentRound = true;
            stopNameThatTuneAudio();

            const chosenTitle = btn.getAttribute('data-song-title');
            const isCorrect = chosenTitle.trim().toLowerCase() === correctTitle.trim().toLowerCase();
            const responseSec = Math.max(0.2, (performance.now() - roundStartTimeMs) / 1000);

            // Speed-weighted score: 100% if answered within 1.2s, scaling down to 55% at 16s; 0% if wrong
            let roundScore = 0;
            if (isCorrect) {
                roundScore = Math.max(55, Math.min(100, 100 - Math.max(0, responseSec - 1.2) * 3.0));
                playCorrectChime();
                document.getElementById('ntt-feedback-banner').innerHTML =
                    `<span style="color:#22c55e; font-size:1.05rem;">✅ CORRECT! "${correctTitle}" — Earned ${roundScore.toFixed(1)}% (${responseSec.toFixed(1)}s)</span>`;
            } else {
                playErrorClackSound();
                document.getElementById('ntt-feedback-banner').innerHTML =
                    `<span style="color:#ef4444; font-size:1.05rem;">❌ WRONG! The song was "${correctTitle}" (0.0%)</span>`;
            }

            // Lock all 8 buttons & reveal correct vs chosen
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

    // Play the N-note snippet automatically
    playSongSnippet(data.songCode, noteCount);
}

export function updateNameThatTuneProgressText(answeredCount, totalCount) {
    const el = document.getElementById('ntt-answered-count');
    if (el && hasAnsweredCurrentRound) {
        el.textContent = `⏳ ${answeredCount} of ${totalCount} students have answered...`;
    }
}
