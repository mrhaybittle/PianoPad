// js/games/noteCraft/hud.js
import { BLOCKS, BLOCK_COSTS } from './constants.js';
import { ncState } from './state.js';

let hudCanvas = null;
let hudCtx = null;

const BLOCK_META = {
    [BLOCKS.DIRT]:       { label: 'Dirt',   swatch: '#7c4d2b', accent: '#5e381d' },
    [BLOCKS.GRASS]:      { label: 'Grass',  swatch: '#22c55e', accent: '#7c4d2b' },
    [BLOCKS.STONE]:      { label: 'Stone',  swatch: '#94a3b8', accent: '#475569' },
    [BLOCKS.BRICK]:      { label: 'Brick',  swatch: '#b91c1c', accent: '#e2e8f0' },
    [BLOCKS.WOOD]:       { label: 'Timber', swatch: '#d97706', accent: '#92400e' },
    [BLOCKS.LEAVES]:     { label: 'Hedge',  swatch: '#15803d', accent: '#22c55e' },
    [BLOCKS.GLASS]:      { label: 'Glass',  swatch: '#bae6fd', accent: '#ffffff' },
    [BLOCKS.NOTE_BLOCK]: { label: 'Note♪',  swatch: '#581c87', accent: '#facc15' }
};

export function initHud(containerEl) {
    disposeHud();
    hudCanvas = document.createElement('canvas');
    hudCanvas.id = 'notecraft-hud';
    hudCanvas.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:6;';
    hudCanvas.width = containerEl.clientWidth || 1232;
    hudCanvas.height = containerEl.clientHeight || 380;
    containerEl.appendChild(hudCanvas);
    hudCtx = hudCanvas.getContext('2d');
}

export function resizeHud(containerEl) {
    if (!hudCanvas || !containerEl) return;
    hudCanvas.width = containerEl.clientWidth || 1232;
    hudCanvas.height = containerEl.clientHeight || 380;
}

export function showNoteCraftToast(text, color = '#facc15', durationMs = 2600) {
    ncState.toastMessage = {
        text,
        color,
        expiresAt: performance.now() + durationMs
    };
}

export function renderHudFrame(now) {
    if (!hudCtx || !hudCanvas) return;
    const W = hudCanvas.width;
    const H = hudCanvas.height;
    const ctx = hudCtx;
    const lp = ncState.localPlayer;

    ctx.clearRect(0, 0, W, H);

    // 1. Center Crosshair
    const cx = W / 2;
    const cy = H / 2;
    const hasTarget = Boolean(ncState.targetBlock && ncState.targetBlock.hit);
    ctx.strokeStyle = hasTarget ? '#facc15' : 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9);
    ctx.stroke();

    // 2. Top-Left Wallet & Progression Pill
    const builderCount = Object.keys(ncState.remotePlayers).length + 1;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(12, 10, 290, 52, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.font = '900 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🎵 ${lp.noteCoins} NoteCoins  |  🎼 ${lp.masteredSongs.length} Songs`, 22, 30);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px sans-serif';
    const flyText = lp.isFlying ? ` • 🪽 FLYING (${Math.ceil(lp.flightTimer)}s)` : '';
    ctx.fillText(`🏫 Builders Online: ${builderCount}${flyText}`, 22, 49);

    // 3. Top-Right Controls & Architect Chords Guide
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(W - 352, 10, 340, 52, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = '900 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('WASD: Move • Space: Jump • L-Click: Break • R-Click/E: Place', W - 22, 29);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 10.5px sans-serif';
    ctx.fillText('🎹 Chords: Major=3x Beam • Minor=3x Pillar • Sus4/Maj7=Fly', W - 22, 48);

    // 4. Toast Notification Banner
    if (ncState.toastMessage && now < ncState.toastMessage.expiresAt) {
        const msg = ncState.toastMessage;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = msg.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 210, 72, 420, 32, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = msg.color;
        ctx.font = '900 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(msg.text, W / 2, 92);
    }

    // 5. Bottom-Center 8-Slot Block Hotbar
    const slots = 8;
    const slotW = 54;
    const slotH = 54;
    const gap = 6;
    const totalW = slots * slotW + (slots - 1) * gap;
    const startX = (W - totalW) / 2;
    const startY = H - slotH - 12;

    for (let i = 0; i < slots; i++) {
        const sx = startX + i * (slotW + gap);
        const blockId = lp.inventory[i];
        const isSelected = lp.selectedSlot === i;

        ctx.fillStyle = isSelected ? 'rgba(30, 41, 59, 0.96)' : 'rgba(15, 23, 42, 0.84)';
        ctx.strokeStyle = isSelected ? '#facc15' : '#475569';
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.beginPath();
        ctx.roundRect(sx, startY, slotW, slotH, 8);
        ctx.fill();
        ctx.stroke();

        // Slot number badge
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}`, sx + 5, startY + 11);

        if (blockId && BLOCK_META[blockId]) {
            const meta = BLOCK_META[blockId];
            const cost = BLOCK_COSTS[blockId] || 0;

            // Block preview swatch
            ctx.fillStyle = meta.swatch;
            ctx.strokeStyle = meta.accent;
            ctx.lineWidth = 1.5;
            ctx.fillRect(sx + 16, startY + 12, 22, 20);
            ctx.strokeRect(sx + 16, startY + 12, 22, 20);

            // Label & Cost
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(meta.label, sx + slotW / 2, startY + 41);

            ctx.fillStyle = cost === 0 ? '#4ade80' : '#facc15';
            ctx.font = '900 8.5px sans-serif';
            ctx.fillText(cost === 0 ? 'FREE' : `${cost}🎵`, sx + slotW / 2, startY + 50);
        } else {
            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🔒', sx + slotW / 2, startY + 34);
        }
    }
}

export function disposeHud() {
    if (hudCanvas && hudCanvas.parentNode) {
        hudCanvas.parentNode.removeChild(hudCanvas);
    }
    hudCanvas = null;
    hudCtx = null;
}
