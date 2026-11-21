// js/games/noteCraft/hud.js
import { BLOCKS, BLOCK_COSTS } from './constants.js';
import { ncState } from './state.js';
import { WORLD_HALF_X, WORLD_HALF_Z, getCurrentCampusZone } from './engine.js';
import { isTeacherBuilder } from './economy.js';

let hudCanvas = null;
let hudCtx = null;
let mapImg = null;
let mapImgLoaded = false;

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

    if (!mapImg) {
        mapImg = new Image();
        mapImg.onload = () => { mapImgLoaded = true; };
        mapImg.src = './assets/erc_map.jpg';
    }
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

function drawSatelliteMinimap(ctx, H) {
    const mapW = 136;
    const mapH = 102;
    const mx = 12;
    const my = H - mapH - 12;
    const lp = ncState.localPlayer;
    const spanX = WORLD_HALF_X * 2;
    const spanZ = WORLD_HALF_Z * 2;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mx, my, mapW, mapH, 10);
    ctx.clip();

    if (mapImgLoaded && mapImg) {
        ctx.drawImage(mapImg, mx, my, mapW, mapH);
    } else {
        ctx.fillStyle = '#14532d';
        ctx.fillRect(mx, my, mapW, mapH);
    }

    // Centenary Innovation Centre highlight box (x: 2..22, z: 6..20)
    const cicX = mx + ((2 + WORLD_HALF_X) / spanX) * mapW;
    const cicY = my + ((6 + WORLD_HALF_Z) / spanZ) * mapH;
    const cicW = (20 / spanX) * mapW;
    const cicH = (14 / spanZ) * mapH;
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cicX, cicY, cicW, cicH);

    // Remote classmates dots
    for (const opp of Object.values(ncState.remotePlayers)) {
        const ox = mx + (((opp.x || 0) + WORLD_HALF_X) / spanX) * mapW;
        const oz = my + (((opp.z || 0) + WORLD_HALF_Z) / spanZ) * mapH;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(ox, oz, 3.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Local player directional arrow
    const px = mx + ((lp.x + WORLD_HALF_X) / spanX) * mapW;
    const pz = my + ((lp.z + WORLD_HALF_Z) / spanZ) * mapH;
    ctx.translate(px, pz);
    ctx.rotate(-lp.yaw);
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(mx, my, mapW, mapH, 10);
    ctx.stroke();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(mx + 22, my + mapH - 14, mapW - 44, 12);
    ctx.fillStyle = '#facc15';
    ctx.font = '900 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ERC CAMPUS GPS', mx + mapW / 2, my + mapH - 5);
}

export function renderHudFrame(now) {
    if (!hudCtx || !hudCanvas) return;
    const W = hudCanvas.width;
    const H = hudCanvas.height;
    const ctx = hudCtx;
    const lp = ncState.localPlayer;
    const teacher = isTeacherBuilder();

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

    // 2. Top-Left Wallet, Builders & Current Campus Landmark Pill
    const builderCount = Object.keys(ncState.remotePlayers).length + 1;
    const zone = getCurrentCampusZone(lp.x, lp.z);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = teacher ? '#4ade80' : '#facc15';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(12, 10, 325, 66, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = teacher ? '#4ade80' : '#facc15';
    ctx.font = '900 13px sans-serif';
    ctx.textAlign = 'left';
    if (teacher) {
        ctx.fillText(`👑 TEACHER CREATIVE • ∞ NoteCoins • All Blocks`, 22, 29);
    } else {
        ctx.fillText(`🎵 ${lp.noteCoins} NoteCoins  |  🎼 ${lp.masteredSongs.length} Songs`, 22, 29);
    }

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px sans-serif';
    const flyText = lp.isFlying ? ` • 🪽 FLYING (${Math.ceil(lp.flightTimer)}s)` : '';
    ctx.fillText(`🏫 Builders Online: ${builderCount}${flyText}`, 22, 47);

    ctx.fillStyle = zone.color;
    ctx.font = '900 11px sans-serif';
    ctx.fillText(`📍 ${zone.name}`, 22, 65);

    // 3. Top-Right Controls & Prominent [Z] UNDO Indicator
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(W - 392, 10, 380, 62, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = '900 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('WASD: Move • Space: Jump • L-Click: Break • R-Click/E: Place', W - 22, 28);

    const undoCount = Array.isArray(ncState.world.undoStack) ? ncState.world.undoStack.length : 0;
    ctx.fillStyle = undoCount > 0 ? '#facc15' : '#94a3b8';
    ctx.font = '900 11.5px sans-serif';
    ctx.fillText(`↩️ Press [Z] to Undo Last Block (${undoCount} saved)`, W - 22, 46);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('🎹 Chords: Major=3x Beam • Minor=3x Pillar • Sus4/Maj7=Fly', W - 22, 62);

    // 4. Toast Notification Banner
    if (ncState.toastMessage && now < ncState.toastMessage.expiresAt) {
        const msg = ncState.toastMessage;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = msg.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 210, 78, 420, 32, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = msg.color;
        ctx.font = '900 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(msg.text, W / 2, 98);
    }

    // 5. Bottom-Left Live Satellite GPS Minimap
    drawSatelliteMinimap(ctx, H);

    // 6. Bottom-Center 8-Slot Block Hotbar + [Z] Undo Quick-Badge
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

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}`, sx + 5, startY + 11);

        if (blockId && BLOCK_META[blockId]) {
            const meta = BLOCK_META[blockId];
            const cost = teacher ? 0 : (BLOCK_COSTS[blockId] || 0);

            ctx.fillStyle = meta.swatch;
            ctx.strokeStyle = meta.accent;
            ctx.lineWidth = 1.5;
            ctx.fillRect(sx + 16, startY + 12, 22, 20);
            ctx.strokeRect(sx + 16, startY + 12, 22, 20);

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

    // Prominent [Z] UNDO pill right next to slot 8
    const undoX = startX + totalW + 10;
    ctx.fillStyle = undoCount > 0 ? 'rgba(15, 23, 42, 0.94)' : 'rgba(15, 23, 42, 0.65)';
    ctx.strokeStyle = undoCount > 0 ? '#facc15' : '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(undoX, startY, 64, slotH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = undoCount > 0 ? '#facc15' : '#64748b';
    ctx.font = '900 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('[Z]', undoX + 32, startY + 23);
    ctx.font = '900 9.5px sans-serif';
    ctx.fillText('UNDO', undoX + 32, startY + 38);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 8.5px sans-serif';
    ctx.fillText(`(${undoCount})`, undoX + 32, startY + 49);
}

export function disposeHud() {
    if (hudCanvas && hudCanvas.parentNode) {
        hudCanvas.parentNode.removeChild(hudCanvas);
    }
    hudCanvas = null;
    hudCtx = null;
}
