// js/eyesFront.js
import { initAudio, audioCtx } from './audio.js';

let activeRoomCode = null;
let isHostUser = false;
let currentlyFrozen = false;
let unsubscribeFreeze = null;
let disconnectHook = null;

function playAttentionChime() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const notes = [587.33, 880]; // D5 -> A5 clean classroom chime

        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.14);

            gain.gain.setValueAtTime(0.001, now + idx * 0.14);
            gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.14 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.55);

            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + idx * 0.14);
            osc.stop(now + idx * 0.14 + 0.58);
        });
    } catch (e) {}
}

function ensureOverlayElements() {
    // 1. Full-Screen Student Freeze Overlay
    let studentOverlay = document.getElementById('eyes-front-student-overlay');
    if (!studentOverlay) {
        studentOverlay = document.createElement('div');
        studentOverlay.id = 'eyes-front-student-overlay';
        Object.assign(studentOverlay.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '99999',
            display: 'none',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at center, rgba(15, 23, 42, 0.96) 0%, rgba(2, 6, 23, 0.99) 100%)',
            backdropFilter: 'blur(10px)',
            color: '#ffffff',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            textAlign: 'center',
            padding: '24px',
            userSelect: 'none'
        });

        studentOverlay.innerHTML = `
            <div style="
                border: 3px solid #facc15;
                background: rgba(30, 41, 59, 0.85);
                border-radius: 24px;
                padding: 40px 48px;
                max-width: 640px;
                box-shadow: 0 0 60px rgba(250, 204, 21, 0.28);
            ">
                <div style="font-size: 68px; line-height: 1; margin-bottom: 16px;">👀</div>
                <div id="eyes-front-headline" style="
                    font-size: clamp(28px, 4.5vw, 44px);
                    font-weight: 900;
                    letter-spacing: 0.04em;
                    color: #facc15;
                    margin-bottom: 12px;
                ">EYES ON THE TEACHER</div>
                <div id="eyes-front-subtext" style="
                    font-size: clamp(15px, 2vw, 20px);
                    font-weight: 600;
                    color: #e2e8f0;
                ">Hands off keyboards • Screen paused for instructions</div>
            </div>
        `;

        // Swallow clicks/touches while frozen
        ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach((evt) => {
            studentOverlay.addEventListener(evt, (e) => {
                e.stopPropagation();
                e.preventDefault();
            }, { capture: true });
        });

        document.body.appendChild(studentOverlay);
    }

    // 2. Floating Teacher Host Control Pill (Only visible to the Host)
    let teacherPill = document.getElementById('eyes-front-teacher-pill');
    if (!teacherPill && isHostUser) {
        teacherPill = document.createElement('button');
        teacherPill.id = 'eyes-front-teacher-pill';
        teacherPill.type = 'button';
        Object.assign(teacherPill.style, {
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            zIndex: '100000',
            padding: '10px 18px',
            borderRadius: '999px',
            border: '2px solid #facc15',
            background: '#0f172a',
            color: '#facc15',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: '900',
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.15s ease'
        });
        teacherPill.textContent = '👀 Freeze Class';
        teacherPill.addEventListener('click', () => toggleEyesFront());
        document.body.appendChild(teacherPill);
    }

    return { studentOverlay, teacherPill };
}

function applyFreezeState(frozen, message = 'EYES ON THE TEACHER') {
    const wasFrozen = currentlyFrozen;
    currentlyFrozen = Boolean(frozen);

    const { studentOverlay, teacherPill } = ensureOverlayElements();
    const headlineEl = document.getElementById('eyes-front-headline');
    if (headlineEl) headlineEl.textContent = message || 'EYES ON THE TEACHER';

    // Play chime when transitioning into frozen state
    if (currentlyFrozen && !wasFrozen) {
        playAttentionChime();
    }

    // Broadcast event so active mini-games (like Laser Tag) can immediately halt held movement
    window.dispatchEvent(new CustomEvent('pianopad:eyesfront', {
        detail: { frozen: currentlyFrozen, message }
    }));

    if (isHostUser) {
        // Teacher keeps full screen access and gets a clear active-freeze status button
        if (studentOverlay) studentOverlay.style.display = 'none';
        if (teacherPill) {
            teacherPill.style.display = 'block';
            if (currentlyFrozen) {
                teacherPill.style.background = '#ef4444';
                teacherPill.style.borderColor = '#ffffff';
                teacherPill.style.color = '#ffffff';
                teacherPill.textContent = '▶️ CLASS FROZEN — Click to Resume';
            } else {
                teacherPill.style.background = '#0f172a';
                teacherPill.style.borderColor = '#facc15';
                teacherPill.style.color = '#facc15';
                teacherPill.textContent = '👀 Freeze Class';
            }
        }
    } else {
        // Students get the full-screen freeze banner
        if (teacherPill) teacherPill.style.display = 'none';
        if (studentOverlay) {
            studentOverlay.style.display = currentlyFrozen ? 'flex' : 'none';
        }
    }
}

export function isEyesFrontFrozen() {
    return currentlyFrozen && !isHostUser;
}

export async function setEyesFront(shouldFreeze, customMessage = 'EYES ON THE TEACHER') {
    if (!activeRoomCode || !window.firebaseDb) return;

    try {
        const { set } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const freezeRef = window.firebaseRef(
            window.firebaseDb,
            `pianopad_tournaments/${activeRoomCode}/classroom/eyesFront`
        );

        await set(freezeRef, {
            frozen: Boolean(shouldFreeze),
            message: customMessage,
            updatedAt: Date.now()
        });

        // Safety net: automatically unfreeze students if the teacher closes/refreshes their tab
        if (window.firebaseOnDisconnect) {
            if (shouldFreeze) {
                disconnectHook = window.firebaseOnDisconnect(freezeRef);
                disconnectHook.set({ frozen: false, message: '', updatedAt: Date.now() });
            } else if (disconnectHook) {
                disconnectHook.cancel();
                disconnectHook = null;
            }
        }
    } catch (err) {
        console.error('Eyes Front broadcast error:', err);
    }
}

export async function toggleEyesFront(customMessage = 'EYES ON THE TEACHER') {
    await setEyesFront(!currentlyFrozen, customMessage);
}

export async function initEyesFront(roomCode, { isHost = false } = {}) {
    stopEyesFront();

    activeRoomCode = String(roomCode || '').trim();
    isHostUser = Boolean(isHost);
    if (!activeRoomCode || !window.firebaseDb) return;

    ensureOverlayElements();

    try {
        const { onValue } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js");
        const freezeRef = window.firebaseRef(
            window.firebaseDb,
            `pianopad_tournaments/${activeRoomCode}/classroom/eyesFront`
        );

        unsubscribeFreeze = onValue(freezeRef, (snapshot) => {
            const val = snapshot.val() || {};
            applyFreezeState(Boolean(val.frozen), val.message || 'EYES ON THE TEACHER');
        });
    } catch (err) {
        console.error('Eyes Front listener error:', err);
    }
}

export function stopEyesFront() {
    if (unsubscribeFreeze) {
        unsubscribeFreeze();
        unsubscribeFreeze = null;
    }
    currentlyFrozen = false;
    activeRoomCode = null;

    const studentOverlay = document.getElementById('eyes-front-student-overlay');
    if (studentOverlay) studentOverlay.style.display = 'none';

    const teacherPill = document.getElementById('eyes-front-teacher-pill');
    if (teacherPill) teacherPill.remove();
}
