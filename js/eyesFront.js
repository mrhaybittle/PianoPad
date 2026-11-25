// js/eyesFront.js
import { initAudio, audioCtx } from './audio.js';

const CLASSROOMS = ['G1', 'G2', 'G3'];

let activeRoomCode = null;
let isHostUser = false;
let currentlyFrozen = false;
let unsubscribeFreeze = null;
let disconnectHook = null;

function normalizeClassroom(code) {
    const upper = String(code || '').trim().toUpperCase();
    return CLASSROOMS.includes(upper) ? upper : 'G1';
}

function playAttentionChime() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const notes = [587.33, 880]; // D5 -> A5

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
                ">Eyes on Teacher</div>
                <div id="eyes-front-subtext" style="
                    font-size: clamp(15px, 2vw, 20px);
                    font-weight: 600;
                    color: #e2e8f0;
                ">Hands off keyboards • Screen paused for instructions</div>
            </div>
        `;

        ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach((evt) => {
            studentOverlay.addEventListener(evt, (e) => {
                e.stopPropagation();
                e.preventDefault();
            }, { capture: true });
        });

        document.body.appendChild(studentOverlay);
    }

    // 2. Floating Teacher Host Control Pill
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
        teacherPill.addEventListener('click', () => {
            if (currentlyFrozen) {
                setEyesFront(false);
            } else {
                openEyesFrontPrompt(activeRoomCode);
            }
        });
        document.body.appendChild(teacherPill);
    }

    return { studentOverlay, teacherPill };
}

function applyFreezeState(frozen, message = 'Eyes on Teacher') {
    const wasFrozen = currentlyFrozen;
    currentlyFrozen = Boolean(frozen);

    const { studentOverlay, teacherPill } = ensureOverlayElements();
    const headlineEl = document.getElementById('eyes-front-headline');
    if (headlineEl) headlineEl.textContent = message || 'Eyes on Teacher';

    if (currentlyFrozen && !wasFrozen) {
        playAttentionChime();
    }

    window.dispatchEvent(new CustomEvent('pianopad:eyesfront', {
        detail: { frozen: currentlyFrozen, message }
    }));

    if (isHostUser) {
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
        if (teacherPill) teacherPill.style.display = 'none';
        if (studentOverlay) {
            studentOverlay.style.display = currentlyFrozen ? 'flex' : 'none';
        }
    }
}

export async function openEyesFrontPrompt(roomCodeOverride = null) {
    // Prevent duplicate modals if ")" is pressed while already open
    if (document.getElementById('eyes-front-prompt-modal')) return;

    let selectedClassroom = normalizeClassroom(roomCodeOverride || activeRoomCode);

    const modal = document.createElement('div');
    modal.id = 'eyes-front-prompt-modal';
    Object.assign(modal.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '100001',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(2, 6, 23, 0.78)',
        backdropFilter: 'blur(4px)',
        fontFamily: 'system-ui, -apple-system, sans-serif'
    });

    modal.innerHTML = `
        <div style="
            background: #0f172a;
            border: 2px solid #facc15;
            border-radius: 16px;
            padding: 24px 28px;
            width: min(440px, 92vw);
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65);
            color: #ffffff;
        ">
            <div id="eyes-front-modal-title" style="font-size: 18px; font-weight: 900; color: #facc15; margin-bottom: 10px;">
                👀 Broadcast to Classroom: ${selectedClassroom}
            </div>
            <div style="font-size: 12px; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">
                Select Classroom:
            </div>
            <div id="eyes-front-classroom-group" role="group" aria-label="Target Classroom" style="
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
                margin-bottom: 14px;
            ">
                ${CLASSROOMS.map((room) => `
                    <button
                        type="button"
                        class="eyes-front-room-btn"
                        data-room="${room}"
                        style="
                            padding: 9px 12px;
                            border-radius: 8px;
                            border: 2px solid #334155;
                            background: #1e293b;
                            color: #e2e8f0;
                            font-weight: 800;
                            font-size: 14px;
                            cursor: pointer;
                            transition: all 0.12s ease;
                        "
                    >${room}</button>
                `).join('')}
            </div>
            <div style="font-size: 13px; color: #94a3b8; margin-bottom: 10px;">
                Press Enter to send default, or start typing to replace it:
            </div>
            <input id="eyes-front-msg-input" type="text" value="Eyes on Teacher" style="
                width: 100%;
                box-sizing: border-box;
                padding: 12px 14px;
                border-radius: 10px;
                border: 2px solid #38bdf8;
                background: #1e293b;
                color: #ffffff;
                font-size: 16px;
                font-weight: 700;
                outline: none;
                margin-bottom: 16px;
            " />
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="eyes-front-cancel-btn" type="button" style="
                    padding: 9px 16px;
                    border-radius: 8px;
                    border: 1px solid #475569;
                    background: #1e293b;
                    color: #cbd5e1;
                    font-weight: 700;
                    cursor: pointer;
                ">Cancel</button>
                <button id="eyes-front-send-btn" type="button" style="
                    padding: 9px 18px;
                    border-radius: 8px;
                    border: none;
                    background: #facc15;
                    color: #0f172a;
                    font-weight: 900;
                    cursor: pointer;
                ">Freeze & Send</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const titleEl = document.getElementById('eyes-front-modal-title');
    const roomButtons = Array.from(modal.querySelectorAll('.eyes-front-room-btn'));
    const input = document.getElementById('eyes-front-msg-input');
    const cancelBtn = document.getElementById('eyes-front-cancel-btn');
    const sendBtn = document.getElementById('eyes-front-send-btn');

    const syncClassroomUI = () => {
        if (titleEl) {
            titleEl.textContent = `👀 Broadcast to Classroom: ${selectedClassroom}`;
        }
        roomButtons.forEach((btn) => {
            const isSelected = btn.dataset.room === selectedClassroom;
            btn.style.background = isSelected ? '#facc15' : '#1e293b';
            btn.style.color = isSelected ? '#0f172a' : '#e2e8f0';
            btn.style.borderColor = isSelected ? '#facc15' : '#334155';
            btn.setAttribute('aria-pressed', String(isSelected));
        });
    };

    roomButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedClassroom = normalizeClassroom(btn.dataset.room);
            syncClassroomUI();
            input.focus();
        });
    });

    syncClassroomUI();

    let isDefaultText = true;

    const closeModal = () => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
    };

    const submitMessage = async () => {
        const finalMsg = input.value.trim() || 'Eyes on Teacher';
        const targetRoom = selectedClassroom;
        closeModal();

        if (!activeRoomCode || activeRoomCode !== targetRoom || !isHostUser) {
            await initEyesFront(targetRoom, { isHost: true });
        }

        await setEyesFront(true, finalMsg);
    };

    // Clear "Eyes on Teacher" immediately as soon as any typing occurs
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitMessage();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
            return;
        }
        if (isDefaultText) {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                input.value = '';
                isDefaultText = false;
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                input.value = '';
                isDefaultText = false;
            }
        }
    });

    cancelBtn.addEventListener('click', closeModal);
    sendBtn.addEventListener('click', submitMessage);

    // Defer focus by 1 frame so the ")" shortcut keystroke doesn't trigger clearing
    requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    });
}

export function isEyesFrontFrozen() {
    return currentlyFrozen && !isHostUser;
}

export async function setEyesFront(shouldFreeze, customMessage = 'Eyes on Teacher') {
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

export async function toggleEyesFront(customMessage = 'Eyes on Teacher') {
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
            applyFreezeState(Boolean(val.frozen), val.message || 'Eyes on Teacher');
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
