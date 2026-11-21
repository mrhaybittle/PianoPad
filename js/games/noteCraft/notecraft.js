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
    disconnectNoteCraftNetwork
} from './network.js';

let keyDownHandler = null;
let keyUpHandler = null;
let mouseDownHandler = null;
let mouseMoveHandler = null;
let pointerLockHandler = null;
let contextMenuHandler = null;
let resizeHandler = null;

function handlePlaceBlockAction() {
    const res = placeSelectedBlock();
    if (!res) return;
    if (res.error === 'INSUFFICIENT_COINS') {
        showNoteCraftToast(`Need ${res.cost} NoteCoins! Play a song or chord to earn more.`, '#f87171');
        return;
    }
    if (res.change) {
        syncBlockChange(res.change);
        if (!isTeacherBuilder()) {
            saveStudentWallet(ncState.localPlayer.name);
        }
    }
}

function handleBreakBlockAction() {
    const change = breakTargetBlock();
    if (change) {
        syncBlockChange(change);
    }
}

function handleUndoAction() {
    const undone = undoLastAction();
    if (!undone || !undone.change) {
        showNoteCraftToast('Nothing left to undo!', '#94a3b8', 1600);
        return;
    }
    syncBlockChange(undone.change);
    if (undone.refundedCost > 0 && !isTeacherBuilder()) {
        saveStudentWallet(ncState.localPlayer.name);
        showNoteCraftToast(`↩️ Undid block (+${undone.refundedCost} NoteCoins refunded)`, '#facc15', 1800);
    } else {
        showNoteCraftToast(`↩️ Undid last block (${undone.remaining} left in undo history)`, '#facc15', 1800);
    }
}

function attachInputListeners(containerEl) {
    detachInputListeners();

    keyDownHandler = (e) => {
        if (!ncState.active) return;

        // Number keys 1-8 select block slot
        if (e.code >= 'Digit1' && e.code <= 'Digit8') {
            const slotIdx = Number(e.code.replace('Digit', '')) - 1;
            ncState.localPlayer.selectedSlot = slotIdx;
            return;
        }

        // Z key (or Cmd+Z / Ctrl+Z) undoes last placed/broken block
        if (e.code === 'KeyZ') {
            e.preventDefault();
            handleUndoAction();
            return;
        }

        // E key places selected block
        if (e.code === 'KeyE') {
            e.preventDefault();
            handlePlaceBlockAction();
            return;
        }

        // Q key breaks targeted block
        if (e.code === 'KeyQ') {
            e.preventDefault();
            handleBreakBlockAction();
            return;
        }

        // F key toggles Creative Flight for Teacher mode anytime
        if (e.code === 'KeyF' && isTeacherBuilder()) {
            e.preventDefault();
            ncState.localPlayer.isFlying = !ncState.localPlayer.isFlying;
            ncState.localPlayer.flightTimer = ncState.localPlayer.isFlying ? 3600 : 0;
            showNoteCraftToast(
                ncState.localPlayer.isFlying ? '🪽 Creative Flight ON (Space: Up, Shift: Down)' : '🚶 Walking Mode ON',
                '#4ade80',
                1800
            );
            return;
        }

        ncState.keysHeld.add(e.code);
    };

    keyUpHandler = (e) => {
        ncState.keysHeld.delete(e.code);
    };

    mouseDownHandler = (e) => {
        if (!ncState.active) return;
        const canvas = document.getElementById('notecraft-canvas');
        if (!canvas || e.target !== canvas) return;

        if (document.pointerLockElement !== canvas) {
            canvas.requestPointerLock?.();
            return;
        }

        if (e.button === 0) {
            handleBreakBlockAction();
        } else if (e.button === 2) {
            handlePlaceBlockAction();
        }
    };

    mouseMoveHandler = (e) => {
        if (!ncState.active) return;
        const canvas = document.getElementById('notecraft-canvas');
        if (document.pointerLockElement !== canvas) return;

        const sensitivity = 0.0024;
        ncState.localPlayer.yaw -= e.movementX * sensitivity;
        ncState.localPlayer.pitch = Math.max(
            -Math.PI / 2 + 0.05,
            Math.min(Math.PI / 2 - 0.05, ncState.localPlayer.pitch - e.movementY * sensitivity)
        );
    };

    pointerLockHandler = () => {
        const canvas = document.getElementById('notecraft-canvas');
        ncState.isPointerLocked = Boolean(canvas && document.pointerLockElement === canvas);
    };

    contextMenuHandler = (e) => {
        const canvas = document.getElementById('notecraft-canvas');
        if (ncState.active && e.target === canvas) {
            e.preventDefault();
        }
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

    if (event.type === 'songComplete') {
        const earned = calculateRoundReward(
            event.songTitle,
            event.difficulty,
            event.accuracy,
            event.tempoPercent,
            event.isFirstTime
        );
        if (earned > 0) {
            ncState.localPlayer.noteCoins += earned;
            if (event.songTitle && !ncState.localPlayer.masteredSongs.includes(event.songTitle)) {
                ncState.localPlayer.masteredSongs.push(event.songTitle);
            }
            updateInventory();
            saveStudentWallet(ncState.localPlayer.name);
            showNoteCraftToast(`🏆 +${earned} NoteCoins earned for ${event.songTitle}!`, '#facc15', 3400);
        }
    }
}

function gameLoop(now) {
    if (!ncState.active) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - (ncState.lastFrameTime || now)) / 1000));
    ncState.lastFrameTime = now;

    updatePlayerPhysics(dt);
    updateAvatarSprites(getThreeScene(), dt);
    render3DFrame();
    renderHudFrame(now);

    ncState.animFrameId = requestAnimationFrame(gameLoop);
}

export async function startNoteCraft(bridge, worldId = 'school_campus_main') {
    stopNoteCraft();

    ncState.active = true;
    ncState.bridge = bridge || null;
    ncState.worldId = worldId;
    ncState.world.undoStack = [];
    ncState.isTeacher = Boolean(
        (bridge && bridge.isTeacher) || localStorage.getItem('pianopad_is_teacher') === 'true'
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
    const playerId = (bridge && bridge.playerId) || `stu_${Math.random().toString(36).slice(2, 10)}`;

    const lp = ncState.localPlayer;
    lp.id = playerId;
    lp.name = playerName;
    lp.avatar = playerAvatar;
    lp.x = 12;
    lp.y = 3;
    lp.z = 2;
    lp.yaw = 0;
    lp.pitch = -0.15;
    lp.velocity = { x: 0, y: 0, z: 0 };

    initRender3D(wrapper);
    initHud(wrapper);
    initAvatarSprites(getThreeScene());
    attachInputListeners(wrapper);

    await connectNoteCraftNetwork(worldId, {
        id: playerId,
        name: playerName,
        avatar: playerAvatar
    });

    // Teacher Creative Mode: infinite coins, all 8 textures unlocked, and creative flight enabled
    if (isTeacherBuilder()) {
        lp.noteCoins = 999999;
        lp.isFlying = true;
        lp.flightTimer = 3600;
        updateInventory();
        showNoteCraftToast('👑 Teacher Creative Mode: Infinite NoteCoins, All Blocks & Flight ([F] toggle, [Z] Undo)', '#4ade80', 4000);
    } else {
        showNoteCraftToast('Click 3D viewport to look around • Press [Z] anytime to Undo', '#38bdf8', 3200);
    }

    ncState.lastFrameTime = performance.now();
    ncState.animFrameId = requestAnimationFrame(gameLoop);
}

export function stopNoteCraft() {
    ncState.active = false;
    if (ncState.animFrameId !== null) {
        cancelAnimationFrame(ncState.animFrameId);
        ncState.animFrameId = null;
    }

    if (document.pointerLockElement) {
        document.exitPointerLock?.();
    }

    detachInputListeners();
    disconnectNoteCraftNetwork();
    disposeAvatarSprites();
    disposeHud();
    disposeRender3D();

    const wrapper = document.getElementById('visualizer-wrapper');
    if (wrapper) wrapper.style.minHeight = '';
    const waterfallCanvas = document.getElementById('waterfall-canvas');
    if (waterfallCanvas) waterfallCanvas.style.visibility = 'visible';

    if (ncState.bridge && typeof ncState.bridge.setActiveMiniGame === 'function') {
        ncState.bridge.setActiveMiniGame(null);
    }
}
export function awardNoteCraftSongReward(songTitle, difficulty, accuracy, tempoPercent, isFirstTime) {
    if (!ncState.active) return;
    const earned = calculateRoundReward(songTitle, difficulty, accuracy, tempoPercent, isFirstTime);
    if (earned > 0) {
        ncState.localPlayer.noteCoins += earned;
        if (songTitle && !ncState.localPlayer.masteredSongs.includes(songTitle)) {
            ncState.localPlayer.masteredSongs.push(songTitle);
        }
        updateInventory();
        saveStudentWallet(ncState.localPlayer.name);
        showNoteCraftToast(`🏆 +${earned} NoteCoins earned for ${songTitle}!`, '#facc15', 3400);
    }
}
