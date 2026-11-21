// js/games/noteCraft/notecraft.js
import { initAudio, playTone } from '../../audio.js';
import { getNoteFrequency } from '../../musicTheory.js';
import { BLOCKS, BLOCK_COSTS } from './constants.js';
import { ncState } from './state.js';
import { calculateRoundReward, updateInventory } from './economy.js';
import { updatePlayerPhysics, breakTargetBlock, placeSelectedBlock, setBlockAt } from './engine.js';
import { initRender3D, render3DFrame, resizeRender3D, disposeRender3D } from './render3d.js';
import { connectNoteCraftNetwork, syncBlockChange, saveStudentWallet, disconnectNoteCraftNetwork } from './network.js';
import { updateRemotePlayerSprites, disposeSprites } from './sprites.js';
import { initHud, renderHudFrame, resizeHud, showNoteCraftToast, disposeHud } from './hud.js';

let listenersBound = false;
let isDraggingLook = false;
let lastMouseX = 0;
let lastMouseY = 0;
let activeBridge = null;
let noteBlockPitchIdx = 0;

const NOTE_BLOCK_SCALE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ARCHITECT_CHORDS = [
    { type: 'fly',    label: 'Sus4 / Maj7 Scaffolding Flight (12s)', notes: ['C', 'F', 'G'] },
    { type: 'fly',    label: 'Maj7 Scaffolding Flight (12s)',        notes: ['C', 'E', 'G', 'B'] },
    { type: 'beam',   label: 'Major Triad 3-Block Beam',             notes: ['C', 'E', 'G'] },
    { type: 'beam',   label: 'Major Triad 3-Block Beam',             notes: ['F', 'A', 'C'] },
    { type: 'beam',   label: 'Major Triad 3-Block Beam',             notes: ['G', 'B', 'D'] },
    { type: 'pillar', label: 'Minor Triad 3-Block Pillar',           notes: ['A', 'C', 'E'] },
    { type: 'pillar', label: 'Minor Triad 3-Block Pillar',           notes: ['D', 'F', 'A'] },
    { type: 'pillar', label: 'Minor Triad 3-Block Pillar',           notes: ['E', 'G', 'B'] }
];

function extractPitchClass(noteStr) {
    const m = String(noteStr || '').trim().toUpperCase().match(/^([A-G]#?)/);
    return m ? m[1] : null;
}

function playFeedbackChime(freq = 659.25) {
    try {
        initAudio();
        playTone(freq, 0.18, 0.5);
    } catch (e) {}
}

async function handleBreakAction() {
    const target = ncState.targetBlock;
    if (target && target.hit && target.blockId === BLOCKS.NOTE_BLOCK) {
        const pitch = NOTE_BLOCK_SCALE[noteBlockPitchIdx % NOTE_BLOCK_SCALE.length];
        noteBlockPitchIdx++;
        playFeedbackChime(getNoteFrequency(pitch) || 523.25);
        showNoteCraftToast(`🎵 Note Block tuned & played: ${pitch}`, '#c084fc', 1600);
        return;
    }

    const change = breakTargetBlock();
    if (change) {
        playFeedbackChime(220);
        await syncBlockChange(change);
    }
}

async function handlePlaceAction() {
    const target = ncState.targetBlock;
    if (target && target.hit && target.blockId === BLOCKS.NOTE_BLOCK) {
        const pitch = NOTE_BLOCK_SCALE[noteBlockPitchIdx % NOTE_BLOCK_SCALE.length];
        noteBlockPitchIdx++;
        playFeedbackChime(getNoteFrequency(pitch) || 523.25);
        showNoteCraftToast(`🎵 Note Block played: ${pitch}`, '#c084fc', 1600);
        return;
    }

    const res = placeSelectedBlock();
    if (!res) return;

    if (res.error === 'INSUFFICIENT_COINS') {
        showNoteCraftToast(`Need ${res.cost} NoteCoins! Play songs in Game Mode to earn more.`, '#ef4444');
        return;
    }

    if (res.change) {
        playFeedbackChime(523.25);
        await syncBlockChange(res.change);
        if (res.cost > 0) {
            const state = activeBridge && activeBridge.getState ? activeBridge.getState() : {};
            await saveStudentWallet(state.sessionStudentName || 'Student');
        }
    }
}

async function executeArchitectPower(chordPower) {
    const lp = ncState.localPlayer;

    if (chordPower.type === 'fly') {
        lp.isFlying = true;
        lp.flightTimer = 12.0;
        playFeedbackChime(880);
        showNoteCraftToast(`🪽 ${chordPower.label}! Space=Up, Shift=Down`, '#38bdf8', 3000);
        return;
    }

    const target = ncState.targetBlock;
    const blockId = lp.inventory[lp.selectedSlot];
    if (!target || !target.hit || !blockId) return;

    const unitCost = BLOCK_COSTS[blockId] || 0;
    const startX = target.x + target.normal.x;
    const startY = target.y + target.normal.y;
    const startZ = target.z + target.normal.z;

    let dx = 0, dy = 0, dz = 0;
    if (chordPower.type === 'pillar') {
        dy = 1;
    } else {
        // Horizontal beam extending away from player
        if (Math.abs(Math.sin(lp.yaw)) > Math.abs(Math.cos(lp.yaw))) {
            dx = -Math.sign(Math.sin(lp.yaw));
        } else {
            dz = -Math.sign(Math.cos(lp.yaw));
        }
    }

    let placedCount = 0;
    for (let step = 0; step < 3; step++) {
        if (lp.noteCoins < unitCost) break;
        const change = setBlockAt(startX + dx * step, startY + dy * step, startZ + dz * step, blockId);
        if (change) {
            lp.noteCoins -= unitCost;
            placedCount++;
            await syncBlockChange(change);
        }
    }

    if (placedCount > 0) {
        playFeedbackChime(783.99);
        showNoteCraftToast(`🎼 ${chordPower.label}: Placed ${placedCount} blocks!`, '#22c55e', 2400);
        if (unitCost > 0) {
            const state = activeBridge && activeBridge.getState ? activeBridge.getState() : {};
            await saveStudentWallet(state.sessionStudentName || 'Student');
        }
    } else {
        showNoteCraftToast(`Not enough NoteCoins for ${chordPower.label}!`, '#ef4444');
    }
}

export function handleNoteCraftInput(noteStr) {
    if (!ncState.animFrameId) return false;
    const pitch = extractPitchClass(noteStr);
    if (!pitch) return true;

    const now = performance.now();
    ncState.recentNotes.push({ pitch, time: now });
    ncState.recentNotes = ncState.recentNotes.filter(n => (now - n.time) <= 140);

    const distinct = new Set(ncState.recentNotes.map(n => n.pitch));

    // Check 3- or 4-note Architect Chords
    if (distinct.size >= 3) {
        for (const chord of ARCHITECT_CHORDS) {
            if (chord.notes.length === distinct.size && chord.notes.every(n => distinct.has(n))) {
                if (ncState.pendingNoteTimer) {
                    clearTimeout(ncState.pendingNoteTimer);
                    ncState.pendingNoteTimer = null;
                }
                ncState.recentNotes = [];
                executeArchitectPower(chord);
                return true;
            }
        }
    }

    // Single piano key selects hotbar slot 1..8 (C -> slot 1, D -> slot 2, etc.)
    if (ncState.pendingNoteTimer) clearTimeout(ncState.pendingNoteTimer);
    ncState.pendingNoteTimer = setTimeout(() => {
        ncState.pendingNoteTimer = null;
        if (ncState.recentNotes.length === 1) {
            const singlePitch = ncState.recentNotes[0].pitch;
            const slotOrder = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
            const idx = slotOrder.indexOf(singlePitch);
            if (idx >= 0) {
                ncState.localPlayer.selectedSlot = idx;
            }
        }
        ncState.recentNotes = [];
    }, 95);

    return true;
}

function bindControls(wrapperEl) {
    if (listenersBound) return;
    listenersBound = true;

    window.addEventListener('keydown', (e) => {
        if (!ncState.animFrameId) return;
        ncState.keysHeld.add(e.code);

        if (e.code >= 'Digit1' && e.code <= 'Digit8') {
            ncState.localPlayer.selectedSlot = Number(e.code.replace('Digit', '')) - 1;
        } else if (e.code === 'KeyE' || e.code === 'Enter') {
            handlePlaceAction();
        } else if (e.code === 'KeyQ') {
            handleBreakAction();
        }
    });

    window.addEventListener('keyup', (e) => {
        ncState.keysHeld.delete(e.code);
    });

    window.addEventListener('blur', () => {
        ncState.keysHeld.clear();
        isDraggingLook = false;
    });

    window.addEventListener('mousemove', (e) => {
        if (!ncState.animFrameId) return;
        const lp = ncState.localPlayer;
        const locked = document.pointerLockElement && document.pointerLockElement.id === 'notecraft-canvas';

        if (locked) {
            lp.yaw -= e.movementX * 0.0024;
            lp.pitch = Math.max(-1.45, Math.min(1.45, lp.pitch - e.movementY * 0.0024));
        } else if (isDraggingLook) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            lp.yaw -= dx * 0.005;
            lp.pitch = Math.max(-1.45, Math.min(1.45, lp.pitch - dy * 0.005));
        }
    });

    wrapperEl.addEventListener('mousedown', (e) => {
        if (!ncState.animFrameId) return;
        const ncCanvas = document.getElementById('notecraft-canvas');
        const locked = document.pointerLockElement === ncCanvas;

        if (!locked && ncCanvas && ncCanvas.requestPointerLock) {
            try { ncCanvas.requestPointerLock(); } catch (err) {}
        }

        isDraggingLook = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        if (e.button === 0) {
            handleBreakAction();
        } else if (e.button === 2) {
            e.preventDefault();
            handlePlaceAction();
        }
    });

    window.addEventListener('mouseup', () => {
        isDraggingLook = false;
    });

    wrapperEl.addEventListener('contextmenu', (e) => {
        if (ncState.animFrameId) e.preventDefault();
    });

    window.addEventListener('wheel', (e) => {
        if (!ncState.animFrameId) return;
        const dir = e.deltaY > 0 ? 1 : -1;
        ncState.localPlayer.selectedSlot = (ncState.localPlayer.selectedSlot + dir + 8) % 8;
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (!ncState.animFrameId) return;
        resizeRender3D(wrapperEl);
        resizeHud(wrapperEl);
    });
}

function gameLoop(now) {
    if (!ncState.animFrameId) return;

    const dt = Math.min(0.05, (now - ncState.lastFrameTime) / 1000);
    ncState.lastFrameTime = now;

    updatePlayerPhysics(dt);
    updateRemotePlayerSprites();
    render3DFrame();
    renderHudFrame(now);

    ncState.animFrameId = requestAnimationFrame(gameLoop);
}

// Called by main.js when a student completes a song in Game Mode
export async function awardNoteCraftSongReward(songTitle, difficulty = 'medium', accuracy = 0, tempoPercent = 100, studentName = 'Student') {
    const cleanTitle = String(songTitle || '').trim();
    if (!cleanTitle || accuracy < 75) return 0;

    const isFirstTime = !ncState.localPlayer.masteredSongs.includes(cleanTitle);
    const earned = calculateRoundReward(cleanTitle, difficulty, accuracy, tempoPercent, isFirstTime);

    if (earned > 0) {
        ncState.localPlayer.noteCoins += earned;
        if (isFirstTime) {
            ncState.localPlayer.masteredSongs.push(cleanTitle);
        }
        updateInventory();
        await saveStudentWallet(studentName);
        showNoteCraftToast(
            isFirstTime
                ? `🎉 NEW SONG BONUS! +${earned} NoteCoins & New Blocks Unlocked!`
                : `🎵 Song Complete! +${earned} NoteCoins earned!`,
            '#22c55e',
            3600
        );
    }
    return earned;
}

export async function startNoteCraft(bridge, worldId = 'school_campus_main') {
    stopNoteCraft();
    activeBridge = bridge;

    const wrapper = document.getElementById('visualizer-wrapper');
    const waterfallCanvas = document.getElementById('waterfall-canvas');
    if (!wrapper) return;

    document.getElementById('arcade-hub')?.classList.remove('open');
    document.getElementById('knockout-modal')?.classList.remove('open');
    document.getElementById('sprint-option-modal')?.classList.remove('open');
    document.getElementById('game-results-modal')?.classList.remove('open');

    if (waterfallCanvas) waterfallCanvas.style.display = 'none';
    if (bridge && bridge.setActiveMiniGame) {
        bridge.setActiveMiniGame('noteCraft');
    }

    // Spawn player on the central quad walkway facing the school perimeter
    const lp = ncState.localPlayer;
    lp.x = 0;
    lp.y = 3;
    lp.z = 6;
    lp.yaw = 0;
    lp.pitch = -0.08;
    lp.velocity = { x: 0, y: 0, z: 0 };
    lp.isFlying = false;
    lp.flightTimer = 0;

    initRender3D(wrapper);
    initHud(wrapper);
    bindControls(wrapper);

    const state = bridge && bridge.getState ? bridge.getState() : {};
    const playerMeta = {
        id: state.localStudentId || ('stu_' + Math.random().toString(36).slice(2, 9)),
        name: state.sessionStudentName || localStorage.getItem('pianopad_name') || 'Builder',
        avatar: state.sessionStudentAvatar || localStorage.getItem('pianopad_avatar') || '🏃'
    };

    await connectNoteCraftNetwork(worldId, playerMeta);

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🏫 NOTECRAFT CAMPUS BUILDER! Earn NoteCoins by mastering songs in Game Mode, then build the school together!`;
    }

    ncState.lastFrameTime = performance.now();
    ncState.animFrameId = requestAnimationFrame(gameLoop);
}

export function stopNoteCraft() {
    if (ncState.animFrameId !== null) {
        cancelAnimationFrame(ncState.animFrameId);
        ncState.animFrameId = null;
    }
    if (ncState.pendingNoteTimer) {
        clearTimeout(ncState.pendingNoteTimer);
        ncState.pendingNoteTimer = null;
    }
    if (document.pointerLockElement && document.pointerLockElement.id === 'notecraft-canvas') {
        try { document.exitPointerLock(); } catch (e) {}
    }

    ncState.keysHeld.clear();
    ncState.recentNotes = [];

    disconnectNoteCraftNetwork();
    disposeSprites();
    disposeHud();
    disposeRender3D();

    const waterfallCanvas = document.getElementById('waterfall-canvas');
    if (waterfallCanvas) waterfallCanvas.style.display = 'block';
}

window.launchNoteCraft = (worldId) => startNoteCraft(activeBridge, worldId);
window.stopNoteCraft = stopNoteCraft;
