// js/games/noteCraft/notecraft.js
import { BLOCKS, BLOCK_COSTS } from './constants.js';
import { ncState } from './state.js';
import {
    breakTargetBlock,
    placeSelectedBlock,
    setBlockAt,
    undoLastAction,
    updatePlayerPhysics
} from './engine.js';
import {
    initRender3D,
    render3DFrame,
    resizeRender3D,
    getThreeScene,
    disposeRender3D
} from './render3d.js';
import {
    initHud,
    renderHudFrame,
    resizeHud,
    showNoteCraftToast,
    disposeHud
} from './hud.js';
import {
    initAvatarSprites,
    updateAvatarSprites,
    disposeAvatarSprites
} from './sprites.js';
import {
    calculateRoundReward,
    updateInventory,
    isTeacherBuilder
} from './economy.js';
import {
    connectNoteCraftNetwork,
    syncBlockChange,
    saveStudentWallet,
    clearRemoteBuilders,
    disconnectNoteCraftNetwork
} from './network.js';

let keyDownHandler = null;
let keyUpHandler = null;
let mouseDownHandler = null;
let mouseMoveHandler = null;
let pointerLockHandler = null;
let contextMenuHandler = null;
let resizeHandler = null;
let activeSessionToken = 0;

function showNoteCraftSplash(container) {
    const existing = document.getElementById('notecraft-splash');
    if (existing) existing.remove();

    const splash = document.createElement('div');
    splash.id = 'notecraft-splash';
    splash.style.cssText = `
        position: absolute; inset: 0; z-index: 100;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: radial-gradient(circle, #2d3748 0%, #1a202c 100%);
        pointer-events: none; transition: opacity 0.8s ease-in-out;
    `;

    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes ncPopIn { 0% { transform: scale(0.6) translateY(-20px); opacity: 0; } 60% { transform: scale(1.05) translateY(0px); opacity: 1; } 100% { transform: scale(1) translateY(0px); opacity: 1; } }
        @keyframes ncFadeIn { to { opacity: 1; transform: translateY(0); } }
    `;
    const logo = document.createElement('div');
    logo.style.cssText = `
        font-family: "Impact", "Arial Black", sans-serif; font-size: clamp(48px, 8vw, 92px); color: #d1d5db; letter-spacing: 5px; text-transform: uppercase;
        animation: ncPopIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 0px 4px 0 #78716c, 0px 8px 0 #57534e, 0px 12px 0 #292524, 0px 16px 0 #000;
    `;
    logo.innerText = 'NOTECRAFT';

    const subtitle = document.createElement('div');
    subtitle.style.cssText = `
        margin-top: 35px; font-family: sans-serif; font-weight: 900; font-size: clamp(14px, 2vw, 20px); color: #facc15;
        text-shadow: 2px 2px 0 #000; opacity: 0; transform: translateY(10px); animation: ncFadeIn 0.6s ease-out forwards 0.4s;
    `;
    subtitle.innerText = 'EDMUND RICE COLLEGE CAMPUS BUILDER';

    splash.appendChild(style); splash.appendChild(logo); splash.appendChild(subtitle);
    container.appendChild(splash);

    setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 800);
    }, 2800);
}

function toggleBuildFlatMode() {
    ncState.flatMode = !ncState.flatMode;
    showNoteCraftToast(
        ncState.flatMode
            ? '🟫 FLAT FLOOR MODE: Painting flush onto ground/surface'
            : '🧱 3D BLOCK MODE: Stacking full 3D blocks',
        ncState.flatMode ? '#38bdf8' : '#facc15',
        1800
    );
}

function handlePlaceBlockAction() {
    const res = placeSelectedBlock();
    if (!res) return;
    if (res.error === 'INSUFFICIENT_COINS') {
        showNoteCraftToast(`Need ${res.cost} NoteCoins! Play a song or chord to earn more.`, '#f87171');
        return;
    }
    if (res.changes && res.changes.length > 0) {
        res.changes.forEach(c => { if(c) syncBlockChange(c); });
        if (!isTeacherBuilder()) saveStudentWallet(ncState.localPlayer.name);
    }
}

function handleBreakBlockAction() {
    const res = breakTargetBlock();
    if (res && res.changes) {
        res.changes.forEach(c => { if(c) syncBlockChange(c); });
    }
}

function handleUndoAction() {
    const undone = undoLastAction();
    if (!undone || !undone.changes || undone.changes.length === 0) {
        showNoteCraftToast('Nothing left to undo!', '#94a3b8', 1600);
        return;
    }
    undone.changes.forEach(c => { if(c) syncBlockChange(c); });
    
    if (undone.refundedCost > 0 && !isTeacherBuilder()) {
        saveStudentWallet(ncState.localPlayer.name);
        showNoteCraftToast(`↩️ Undid prefab (+${undone.refundedCost} NoteCoins refunded)`, '#facc15', 1800);
    } else {
        showNoteCraftToast(`↩️ Undid last build (${undone.remaining} left in undo history)`, '#facc15', 1800);
    }
}

function attachInputListeners(containerEl) {
    detachInputListeners();

    keyDownHandler = (e) => {
        if (!ncState.active) return;

        // Staff Override Shortcut (Ctrl/Cmd + Shift + U)
        if (e.code === 'KeyU' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
            e.preventDefault();
            localStorage.setItem('pianopad_is_teacher', 'true');
            ncState.isTeacher = true;
            ncState.localPlayer.noteCoins = 999999;
            ncState.localPlayer.isFlying = true;
            ncState.localPlayer.flightTimer = 3600;
            updateInventory();
            showNoteCraftToast('👑 Staff Override: All blocks & flight unlocked!', '#4ade80', 4000);
            return;
        }

        // Toggle Flat Floor vs 3D Block Mode ([T] or [Tab])
        if (e.code === 'KeyT' || e.code === 'Tab') {
            e.preventDefault();
            toggleBuildFlatMode();
            return;
        }

        // Teacher Purge of Stuck Ghost Builders ([K])
        if (e.code === 'KeyK' && isTeacherBuilder()) {
            e.preventDefault();
            clearRemoteBuilders();
            showNoteCraftToast('🧹 Cleared all disconnected builder avatars from campus!', '#4ade80', 2400);
            return;
        }

        // Keyboard Numbers + Shift overrides for special prefabs
        if (e.code === 'Digit1') { e.preventDefault(); ncState.localPlayer.selectedSlot = e.shiftKey ? 8 : 0; return; }
        if (e.code === 'Digit2') { e.preventDefault(); ncState.localPlayer.selectedSlot = e.shiftKey ? 9 : 1; return; }
        if (e.code === 'Digit3') { e.preventDefault(); ncState.localPlayer.selectedSlot = 2; return; }
        if (e.code === 'Digit4') { e.preventDefault(); ncState.localPlayer.selectedSlot = e.shiftKey ? 10 : 3; return; }
        if (e.code === 'Digit5') { e.preventDefault(); ncState.localPlayer.selectedSlot = e.shiftKey ? 11 : 4; return; }
        if (e.code === 'Digit6') { e.preventDefault(); ncState.localPlayer.selectedSlot = e.shiftKey ? 12 : 5; return; }
        if (e.code === 'Digit7') { e.preventDefault(); ncState.localPlayer.selectedSlot = 6; return; }
        if (e.code === 'Digit8') { e.preventDefault(); ncState.localPlayer.selectedSlot = 7; return; }

        if (e.code === 'KeyZ') { e.preventDefault(); handleUndoAction(); return; }
        if (e.code === 'KeyE') { e.preventDefault(); handlePlaceBlockAction(); return; }
        if (e.code === 'KeyQ') { e.preventDefault(); handleBreakBlockAction(); return; }

        if (e.code === 'Equal' || e.code === 'NumpadAdd') {
            ncState.mapZoom = Math.min(8.0, (ncState.mapZoom || 1.0) + 0.5);
            showNoteCraftToast(`🔍 Map Zoom: ${ncState.mapZoom.toFixed(1)}x`, '#38bdf8', 1200);
            return;
        }
        if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
            ncState.mapZoom = Math.max(1.0, (ncState.mapZoom || 1.0) - 0.5);
            showNoteCraftToast(`🔍 Map Zoom: ${ncState.mapZoom.toFixed(1)}x`, '#38bdf8', 1200);
            return;
        }

        if (e.code === 'KeyF' && isTeacherBuilder()) {
            e.preventDefault();
            ncState.localPlayer.isFlying = !ncState.localPlayer.isFlying;
            ncState.localPlayer.flightTimer = ncState.localPlayer.isFlying ? 3600 : 0;
            showNoteCraftToast(
                ncState.localPlayer.isFlying ? '🪽 Creative Flight ON (Space: Up, Shift: Down)' : '🚶 Walking Mode ON',
                '#4ade80', 1800
            );
            return;
        }
        ncState.keysHeld.add(e.code);
    };

    keyUpHandler = (e) => { ncState.keysHeld.delete(e.code); };

    mouseDownHandler = (e) => {
        if (!ncState.active) return;
        const canvas = document.getElementById('notecraft-canvas');
        if (!canvas || e.target !== canvas) return;
        if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
        // Left-Click builds, Right-Click breaks
        if (e.button === 0) handlePlaceBlockAction();
        else if (e.button === 2) handleBreakBlockAction();
    };

    mouseMoveHandler = (e) => {
        if (!ncState.active) return;
        const canvas = document.getElementById('notecraft-canvas');
        if (document.pointerLockElement !== canvas) return;
        const sensitivity = 0.0024;
        ncState.localPlayer.yaw -= e.movementX * sensitivity;
        ncState.localPlayer.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, ncState.localPlayer.pitch - e.movementY * sensitivity));
    };

    pointerLockHandler = () => {
        const canvas = document.getElementById('notecraft-canvas');
        ncState.isPointerLocked = Boolean(canvas && document.pointerLockElement === canvas);
    };

    contextMenuHandler = (e) => {
        const canvas = document.getElementById('notecraft-canvas');
        if (ncState.active && e.target === canvas) e.preventDefault();
    };

    resizeHandler = () => {
        if (!ncState.active) return;
        resizeRender3D(containerEl);
        resizeHud(containerEl);
    };

    window.addEventListener('keydown', keyDownHandler);
    window.addEventListener('keyup', keyUpHandler);
    window.addEventListener('mousedown', mouseDownHandler);
    window.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('pointerlockchange', pointerLockHandler);
    window.addEventListener('contextmenu', contextMenuHandler);
    window.addEventListener('resize', resizeHandler);
}

function detachInputListeners() {
    if (keyDownHandler) window.removeEventListener('keydown', keyDownHandler);
    if (keyUpHandler) window.removeEventListener('keyup', keyUpHandler);
    if (mouseDownHandler) window.removeEventListener('mousedown', mouseDownHandler);
    if (mouseMoveHandler) window.removeEventListener('mousemove', mouseMoveHandler);
    if (pointerLockHandler) document.removeEventListener('pointerlockchange', pointerLockHandler);
    if (contextMenuHandler) window.removeEventListener('contextmenu', contextMenuHandler);
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    ncState.keysHeld.clear();
}

export function handleNoteCraftInput(event) {
    if (!ncState.active || !event) return;

    if (event.type === 'note' || event.type === 'noteOn') {
        const noteName = String(event.noteName || event.note || '').toUpperCase();
        
        const exactMap = { 
            'C4':0, 'C#4':8, 'DB4':8,
            'D4':1, 'D#4':9, 'EB4':9,
            'E4':2, 
            'F4':3, 'F#4':10, 'GB4':10,
            'G4':4, 'G#4':11, 'AB4':11,
            'A4':5, 'A#4':12, 'BB4':12,
            'B4':6, 'C5':7 
        };
        
        let slotIdx = exactMap[noteName];
        
        if (slotIdx === undefined) {
            const letter = noteName.replace(/[^A-G#]/g, '');
            const octave = noteName.match(/\d+/) ? parseInt(noteName.match(/\d+/)[0]) : 4;
            
            const baseMap = { 
                'C':0, 'C#':8, 'D':1, 'D#':9, 'E':2, 
                'F':3, 'F#':10, 'G':4, 'G#':11, 'A':5, 'A#':12, 'B':6 
            };
            
            if (letter === 'C' && octave > 4) slotIdx = 7;
            else slotIdx = baseMap[letter];
        }
        
        if (slotIdx !== undefined && ncState.localPlayer.inventory[slotIdx] !== undefined) {
            ncState.localPlayer.selectedSlot = slotIdx;
            return;
        }
    }

    if (event.type === 'chord' && event.chordQuality) {
        const quality = String(event.chordQuality).toLowerCase();
        const lp = ncState.localPlayer;
        const blockId = lp.inventory[lp.selectedSlot] || BLOCKS.STONE;
        const target = ncState.targetBlock;

        if (quality.includes('sus') || quality.includes('maj7')) {
            lp.isFlying = true;
            lp.flightTimer = isTeacherBuilder() ? 3600 : 12;
            showNoteCraftToast('🪽 Sus4/Maj7 Chord! Creative Flight unlocked!', '#38bdf8');
            return;
        }

        if (!target || !target.hit) return;

        const baseX = target.x + target.normal.x;
        const baseY = target.y + target.normal.y;
        const baseZ = target.z + target.normal.z;

        if (quality.includes('major')) {
            const perpX = Math.round(Math.cos(lp.yaw));
            const perpZ = Math.round(-Math.sin(lp.yaw));
            for (let i = -1; i <= 1; i++) {
                const c = setBlockAt(baseX + perpX * i, baseY, baseZ + perpZ * i, blockId);
                if (c) syncBlockChange(c);
            }
            showNoteCraftToast('🎶 Major Triad! Built 3-block horizontal beam!', '#4ade80');
        } else if (quality.includes('minor')) {
            for (let i = 0; i < 3; i++) {
                const c = setBlockAt(baseX, baseY + i, baseZ, blockId);
                if (c) syncBlockChange(c);
            }
            showNoteCraftToast('🎶 Minor Triad! Built 3-block vertical pillar!', '#c084fc');
        }
    }
}

function gameLoop(now, sessionToken) {
    if (!ncState.active || sessionToken !== activeSessionToken) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - (ncState.lastFrameTime || now)) / 1000));
    ncState.lastFrameTime = now;
    updatePlayerPhysics(dt);
    updateAvatarSprites(getThreeScene(), dt);
    render3DFrame();
    renderHudFrame(now);
    ncState.animFrameId = requestAnimationFrame((t) => gameLoop(t, sessionToken));
}

export async function startNoteCraft(bridge, worldId = 'school_campus_main') {
    stopNoteCraft(false);
    const sessionToken = ++activeSessionToken;

    ncState.active = true;
    ncState.bridge = bridge || null;
    ncState.worldId = worldId;
    ncState.world.undoStack = [];
    ncState.flatMode = false;
    
    ncState.isTeacher = Boolean(
        (bridge && (bridge.isTeacher || bridge.isHost || bridge.mode === 'host')) || 
        localStorage.getItem('pianopad_is_teacher') === 'true' ||
        localStorage.getItem('isHost') === 'true'
    );

    if (bridge && typeof bridge.setActiveMiniGame === 'function') {
        bridge.setActiveMiniGame('noteCraft');
    }

    const wrapper = document.getElementById('visualizer-wrapper');
    const waterfallCanvas = document.getElementById('waterfall-canvas');
    if (!wrapper) return;
    if (waterfallCanvas) waterfallCanvas.style.visibility = 'hidden';
    wrapper.style.position = 'relative';
    wrapper.style.minHeight = '380px';

    const playerName = (bridge && bridge.playerName) || localStorage.getItem('pianopad_player_name') || 'Builder';
    const playerAvatar = (bridge && bridge.playerAvatar) || localStorage.getItem('pianopad_player_avatar') || '🏃';
    let playerId = (bridge && bridge.playerId) || localStorage.getItem('pianopad_notecraft_pid');
    if (!playerId) {
        playerId = `stu_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem('pianopad_notecraft_pid', playerId);
    }

    const lp = ncState.localPlayer;
    lp.id = playerId;
    lp.name = playerName;
    lp.avatar = playerAvatar;
    lp.x = 12; lp.y = 3; lp.z = 2;
    lp.yaw = 0; lp.pitch = -0.15;
    lp.velocity = { x: 0, y: 0, z: 0 };

    initRender3D(wrapper);
    initHud(wrapper);
    initAvatarSprites(getThreeScene());
    attachInputListeners(wrapper);

    showNoteCraftSplash(wrapper);

    await connectNoteCraftNetwork(worldId, { id: playerId, name: playerName, avatar: playerAvatar });
    if (!ncState.active || sessionToken !== activeSessionToken) return;

    if (isTeacherBuilder()) {
        lp.noteCoins = 999999;
        lp.isFlying = true;
        lp.flightTimer = 3600;
        updateInventory();
        showNoteCraftToast('👑 Teacher Creative Mode: Left-Click Build • [T] Flat/Block • [K] Clear Ghosts', '#4ade80', 4200);
    } else {
        showNoteCraftToast('Left-Click to Build • Right-Click to Break • [T] Toggle Flat/Block', '#38bdf8', 3600);
    }

    ncState.lastFrameTime = performance.now();
    ncState.animFrameId = requestAnimationFrame((t) => gameLoop(t, sessionToken));
}

export function stopNoteCraft(notifyBridge = true) {
    activeSessionToken++;
    ncState.active = false;
    if (ncState.animFrameId !== null) { cancelAnimationFrame(ncState.animFrameId); ncState.animFrameId = null; }
    if (document.pointerLockElement) document.exitPointerLock?.();
    detachInputListeners();
    disconnectNoteCraftNetwork();
    disposeAvatarSprites();
    disposeHud();
    disposeRender3D();

    const wrapper = document.getElementById('visualizer-wrapper');
    if (wrapper) wrapper.style.minHeight = '';
    const waterfallCanvas = document.getElementById('waterfall-canvas');
    if (waterfallCanvas) waterfallCanvas.style.visibility = 'visible';
    if (notifyBridge && ncState.bridge && typeof ncState.bridge.setActiveMiniGame === 'function') {
        ncState.bridge.setActiveMiniGame(null);
    }
}

export function awardNoteCraftSongReward(songTitle, difficulty, accuracy, tempoPercent, isFirstTime) {
    if (!ncState.active) return;
    const earned = calculateRoundReward(songTitle, difficulty, accuracy, tempoPercent, isFirstTime);
    if (earned > 0) {
        ncState.localPlayer.noteCoins += earned;
        if (songTitle && !ncState.localPlayer.masteredSongs.includes(songTitle)) ncState.localPlayer.masteredSongs.push(songTitle);
        updateInventory();
        saveStudentWallet(ncState.localPlayer.name);
        showNoteCraftToast(`🏆 +${earned} NoteCoins earned for ${songTitle}!`, '#facc15', 3400);
    }
}
