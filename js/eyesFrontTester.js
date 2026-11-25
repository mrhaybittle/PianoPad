// js/eyesFrontTester.js
import { openEyesFrontPrompt, setEyesFront, initEyesFront } from './eyesFront.js';

const PIP_CONTAINER_ID = 'eyes-front-pip-grid-modal';

const VIRTUAL_STUDENTS = [
    { id: 'v1',  name: 'Liam K',   className: '7G', room: 'G1', mode: 'Game Mode: Wipeout',   badge: '🎹' },
    { id: 'v2',  name: 'Mia T',    className: '7G', room: 'G1', mode: 'Simon Taps (Lvl 4)',   badge: '🟣' },
    { id: 'v3',  name: 'Noah R',   className: '7G', room: 'G1', mode: 'Flappy Pitch',         badge: '🐦' },
    { id: 'v4',  name: 'Chloe W',  className: '7H', room: 'G2', mode: 'Scale Surfers',        badge: '🚇' },
    { id: 'v5',  name: 'Lucas B',  className: '7H', room: 'G2', mode: 'Gridiron Groove',      badge: '🏈' },
    { id: 'v6',  name: 'Zoe P',    className: '7H', room: 'G2', mode: 'Sharp Shooter',        badge: '⚽' },
    { id: 'v7',  name: 'Oliver H', className: '8A', room: 'G3', mode: '3D Ski Slalom',        badge: '⛷️' },
    { id: 'v8',  name: 'Ava M',    className: '8A', room: 'G3', mode: 'Rhythm Echo',          badge: '🥁' },
    { id: 'v9',  name: 'Ethan D',  className: '8B', room: 'G3', mode: 'Drop Dodge (4 ❤️)',    badge: '🧱' },
    { id: 'v10', name: 'Ruby S',   className: '8B', room: 'G3', mode: 'Step Mode: Fur Elise', badge: '👣' }
];

const roomFreezeState = {
    G1: { frozen: false, message: 'Eyes on Teacher' },
    G2: { frozen: false, message: 'Eyes on Teacher' },
    G3: { frozen: false, message: 'Eyes on Teacher' }
};

let typedBuffer = '';
let bufferTimer = null;
let animInterval = null;
let getTeacherCheck = () => false;
let getDefaultRoom = () => 'G1';

function ensurePipGrid() {
    let overlay = document.getElementById(PIP_CONTAINER_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = PIP_CONTAINER_ID;
    Object.assign(overlay.style, {
        position: 'fixed',
        bottom: '64px',
        right: '16px',
        width: 'min(980px, 96vw)',
        maxHeight: '78vh',
        overflowY: 'auto',
        zIndex: '100002',
        display: 'none',
        flexDirection: 'column',
        gap: '10px',
        padding: '14px',
        borderRadius: '16px',
        background: 'rgba(2, 6, 23, 0.94)',
        border: '2px solid #facc15',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#f8fafc'
    });

    overlay.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; border-bottom:1px solid #1e293b; padding-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:1.1rem;">🖥️</span>
                <strong style="color:#facc15; font-size:0.95rem;">10-Student Live PIP Monitor (Mr H)</strong>
                <span style="font-size:0.75rem; color:#94a3b8;">Type "eyes" anytime to toggle</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
                <button type="button" id="pip-freeze-g1" style="padding:5px 10px; border-radius:6px; border:1px solid #38bdf8; background:#0f172a; color:#38bdf8; font-weight:800; font-size:0.75rem; cursor:pointer;">Freeze G1</button>
                <button type="button" id="pip-freeze-g2" style="padding:5px 10px; border-radius:6px; border:1px solid #38bdf8; background:#0f172a; color:#38bdf8; font-weight:800; font-size:0.75rem; cursor:pointer;">Freeze G2</button>
                <button type="button" id="pip-freeze-g3" style="padding:5px 10px; border-radius:6px; border:1px solid #38bdf8; background:#0f172a; color:#38bdf8; font-weight:800; font-size:0.75rem; cursor:pointer;">Freeze G3</button>
                <button type="button" id="pip-prompt-btn" style="padding:5px 10px; border-radius:6px; border:none; background:#facc15; color:#0f172a; font-weight:900; font-size:0.75rem; cursor:pointer;">👀 Message Modal</button>
                <button type="button" id="pip-unfreeze-all" style="padding:5px 10px; border-radius:6px; border:1px solid #22c55e; background:#052e16; color:#4ade80; font-weight:800; font-size:0.75rem; cursor:pointer;">Unfreeze All</button>
                <button type="button" id="pip-close-btn" style="padding:5px 10px; border-radius:6px; border:1px solid #475569; background:#1e293b; color:#e2e8f0; font-weight:800; font-size:0.75rem; cursor:pointer;">✕</button>
            </div>
        </div>
        <div id="pip-screens-grid" style="
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
            gap: 10px;
        "></div>
    `;

    document.body.appendChild(overlay);

    const grid = document.getElementById('pip-screens-grid');
    grid.innerHTML = VIRTUAL_STUDENTS.map((stu, idx) => `
        <div id="pip-card-${stu.id}" style="
            position: relative;
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 10px;
            overflow: hidden;
            min-height: 112px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        ">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 8px; background:#1e293b; font-size:0.72rem; font-weight:800;">
                <span>${stu.badge} ${stu.name} (${stu.className})</span>
                <span style="color:#facc15;">${stu.room}</span>
            </div>
            <div style="padding:8px; display:flex; flex-direction:column; gap:6px;">
                <div style="font-size:0.72rem; font-weight:700; color:#38bdf8;">${stu.mode}</div>
                <div style="display:flex; gap:3px; height:24px; align-items:flex-end;">
                    ${[0, 1, 2, 3, 4, 5, 6].map((k) => `
                        <div class="pip-key-${stu.id}" data-k="${k}" style="
                            flex:1;
                            height:${(k + idx) % 2 === 0 ? '24px' : '16px'};
                            background:${(k + idx) % 3 === 0 ? '#22c55e' : '#e2e8f0'};
                            border-radius:2px;
                            transition: background 0.12s ease;
                        "></div>
                    `).join('')}
                </div>
            </div>
            <div id="pip-freeze-${stu.id}" style="
                position: absolute;
                inset: 0;
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 8px;
                text-align: center;
                background: rgba(2, 6, 23, 0.94);
                border: 2px solid #facc15;
                z-index: 5;
            ">
                <div style="font-size:1.25rem; line-height:1;">👀</div>
                <div class="pip-freeze-msg" style="font-size:0.78rem; font-weight:900; color:#facc15; margin-top:4px;">Eyes on Teacher</div>
                <div style="font-size:0.64rem; color:#cbd5e1; margin-top:2px;">Screen paused (${stu.room})</div>
            </div>
        </div>
    `).join('');

    const toggleRoomFromPip = async (room) => {
        const nextFrozen = !roomFreezeState[room]?.frozen;
        await initEyesFront(room, { isHost: true });
        await setEyesFront(nextFrozen, roomFreezeState[room]?.message || 'Eyes on Teacher');
    };

    document.getElementById('pip-freeze-g1').addEventListener('click', () => toggleRoomFromPip('G1'));
    document.getElementById('pip-freeze-g2').addEventListener('click', () => toggleRoomFromPip('G2'));
    document.getElementById('pip-freeze-g3').addEventListener('click', () => toggleRoomFromPip('G3'));
    document.getElementById('pip-prompt-btn').addEventListener('click', () => openEyesFrontPrompt(getDefaultRoom()));
    document.getElementById('pip-unfreeze-all').addEventListener('click', async () => {
        for (const room of ['G1', 'G2', 'G3']) {
            await initEyesFront(room, { isHost: true });
            await setEyesFront(false, '');
        }
    });
    document.getElementById('pip-close-btn').addEventListener('click', () => {
        overlay.style.display = 'none';
    });

    return overlay;
}

function syncPipFreezeOverlays() {
    VIRTUAL_STUDENTS.forEach((stu) => {
        const freezeEl = document.getElementById(`pip-freeze-${stu.id}`);
        const cardEl = document.getElementById(`pip-card-${stu.id}`);
        const state = roomFreezeState[stu.room] || { frozen: false, message: 'Eyes on Teacher' };
        if (freezeEl) {
            freezeEl.style.display = state.frozen ? 'flex' : 'none';
            const msgEl = freezeEl.querySelector('.pip-freeze-msg');
            if (msgEl) msgEl.textContent = state.message || 'Eyes on Teacher';
        }
        if (cardEl) {
            cardEl.style.borderColor = state.frozen ? '#ef4444' : '#334155';
        }
    });

    ['G1', 'G2', 'G3'].forEach((room) => {
        const btn = document.getElementById(`pip-freeze-${room.toLowerCase()}`);
        if (btn) {
            const isF = Boolean(roomFreezeState[room]?.frozen);
            btn.textContent = isF ? `Unfreeze ${room}` : `Freeze ${room}`;
            btn.style.background = isF ? '#7f1d1d' : '#0f172a';
            btn.style.color = isF ? '#fecaca' : '#38bdf8';
        }
    });
}

function startVirtualActivityAnimation() {
    if (animInterval) clearInterval(animInterval);
    let tick = 0;
    animInterval = setInterval(() => {
        tick++;
        VIRTUAL_STUDENTS.forEach((stu, sIdx) => {
            if (roomFreezeState[stu.room]?.frozen) return;
            const keys = document.querySelectorAll(`.pip-key-${stu.id}`);
            const activeIdx = (tick + sIdx) % keys.length;
            keys.forEach((kEl, kIdx) => {
                kEl.style.background = kIdx === activeIdx ? '#facc15' : '#e2e8f0';
            });
        });
    }, 260);
}

export function toggleEyesFrontPipTester(forceOpen = null) {
    if (!getTeacherCheck()) return false;
    const overlay = ensurePipGrid();
    const shouldShow = typeof forceOpen === 'boolean' ? forceOpen : overlay.style.display !== 'flex';
    overlay.style.display = shouldShow ? 'flex' : 'none';
    if (shouldShow) {
        syncPipFreezeOverlays();
        startVirtualActivityAnimation();
    }
    return true;
}

export function initEyesFrontTester({ isAuthorizedTeacher, getCurrentRoom } = {}) {
    if (typeof isAuthorizedTeacher === 'function') getTeacherCheck = isAuthorizedTeacher;
    if (typeof getCurrentRoom === 'function') getDefaultRoom = getCurrentRoom;

    window.addEventListener('pianopad:eyesfront:broadcast', (e) => {
        const { roomCode, frozen, message } = e.detail || {};
        if (roomCode && Object.prototype.hasOwnProperty.call(roomFreezeState, roomCode)) {
            roomFreezeState[roomCode] = {
                frozen: Boolean(frozen),
                message: message || 'Eyes on Teacher'
            };
            syncPipFreezeOverlays();
        }
    });

    window.addEventListener('pianopad:eyesfront', (e) => {
        const activeRoom = getDefaultRoom();
        if (activeRoom && Object.prototype.hasOwnProperty.call(roomFreezeState, activeRoom)) {
            roomFreezeState[activeRoom] = {
                frozen: Boolean(e.detail?.frozen),
                message: e.detail?.message || 'Eyes on Teacher'
            };
            syncPipFreezeOverlays();
        }
    });

    window.__eyesFrontHandleKey = (e) => {
        if (!getTeacherCheck()) return false;
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return false;

        typedBuffer = (typedBuffer + e.key.toLowerCase()).slice(-4);
        clearTimeout(bufferTimer);
        bufferTimer = setTimeout(() => {
            typedBuffer = '';
        }, 1200);

        if (typedBuffer === 'eyes') {
            typedBuffer = '';
            e.preventDefault();
            toggleEyesFrontPipTester();
            return true;
        }
        return false;
    };

    window.toggleEyesFrontPipTester = toggleEyesFrontPipTester;
}
