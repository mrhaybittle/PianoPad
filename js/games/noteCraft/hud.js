// js/games/noteCraft/hud.js
import { BLOCKS, BLOCK_COSTS } from './constants.js';
import { ncState } from './state.js';
import { WORLD_HALF_X, WORLD_HALF_Z, getCurrentCampusZone } from './engine.js';
import { isTeacherBuilder } from './economy.js';
import campusPreset from './campusPreset.js';

let hudCanvas = null;
let hudCtx = null;
let mapImg = null;
let mapImgLoaded = false;

const BLOCK_META = {
    [BLOCKS.DIRT]:       { label: 'Dirt',   swatch: '#7c4d2b', accent: '#5e381d', hotkey: '1' },
    [BLOCKS.GRASS]:      { label: 'Grass',  swatch: '#22c55e', accent: '#7c4d2b', hotkey: '2' },
    [BLOCKS.STONE]:      { label: 'Stone',  swatch: '#94a3b8', accent: '#475569', hotkey: '3' },
    [BLOCKS.BRICK]:      { label: 'Brick',  swatch: '#b91c1c', accent: '#e2e8f0', hotkey: '4' },
    [BLOCKS.WOOD]:       { label: 'Timber', swatch: '#d97706', accent: '#92400e', hotkey: '5' },
    [BLOCKS.LEAVES]:     { label: 'Hedge',  swatch: '#15803d', accent: '#22c55e', hotkey: '6' },
    [BLOCKS.GLASS]:      { label: 'Glass',  swatch: '#bae6fd', accent: '#ffffff', hotkey: '7' },
    [BLOCKS.NOTE_BLOCK]: { label: 'Note♪',  swatch: '#581c87', accent: '#facc15', hotkey: '8' },
    [BLOCKS.PATH]:       { label: 'Path',   swatch: '#5e381d', accent: '#451a03', hotkey: '!' },
    [BLOCKS.WATER]:      { label: 'Water',  swatch: '#3b82f6', accent: '#2563eb', hotkey: '@' },
    [BLOCKS.TREE]:       { label: 'Tree',   swatch: '#22c55e', accent: '#14532d', hotkey: '$' },
    [BLOCKS.ROCK]:       { label: 'Rock',   swatch: '#64748b', accent: '#334155', hotkey: '%' },
    [BLOCKS.DRAGON]:     { label: 'Dragon', swatch: '#d97706', accent: '#92400e', hotkey: '^' }
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
    ncState.toastMessage = { text, color, expiresAt: performance.now() + durationMs };
}

function getCurrentBuildingOrZone(x, z) {
    for (const b of campusPreset.buildings) {
        for (const p of b.parts) {
            if (x >= p.minX - 1 && x <= p.maxX + 1 && z >= p.minZ - 1 && z <= p.maxZ + 1) {
                return {
                    name: `${b.label} (${b.storeys === 2 ? '2-Storey' : '1-Storey'})`,
                    color: '#facc15'
                };
            }
        }
    }
    for (const s of campusPreset.structures) {
        if (s.label && x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
            return { name: `${s.label} (Covered Area)`, color: '#38bdf8' };
        }
    }
    return getCurrentCampusZone(x, z);
}

function drawQuitButton(ctx, W) {
    const btnW = 86;
    const btnH = 34;
    const bx = W - btnW - 12;
    const by = 78;

    ncState.quitButtonRect = { x: bx, y: by, w: btnW, h: btnH };

    ctx.fillStyle = 'rgba(127, 29, 29, 0.94)';
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, btnW, btnH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚪 QUIT [X]', bx + btnW / 2, by + 21);
}

function drawSatelliteMinimap(ctx, H) {
    const mapW = 136;
    const mapH = 102;
    const mx = 12;
    const my = H - mapH - 12;
    const lp = ncState.localPlayer;
    const spanX = WORLD_HALF_X * 2;
    const spanZ = WORLD_HALF_Z * 2;
    const zoom = ncState.mapZoom || 1.0;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mx, my, mapW, mapH, 10);
    ctx.clip();
    ctx.fillStyle = '#14532d';
    ctx.fillRect(mx, my, mapW, mapH);

    const px = ((lp.x + WORLD_HALF_X) / spanX) * mapW;
    const pz = ((lp.z + WORLD_HALF_Z) / spanZ) * mapH;

    ctx.translate(mx + mapW / 2, my + mapH / 2);
    ctx.scale(zoom, zoom);

    if (zoom === 1.0) ctx.translate(-mapW / 2, -mapH / 2);
    else ctx.translate(-px, -pz);

    if (mapImgLoaded && mapImg) ctx.drawImage(mapImg, 0, 0, mapW, mapH);

    // Draw campus preset building footprints on GPS minimap
    for (const b of campusPreset.buildings) {
        ctx.fillStyle = b.storeys === 2 ? 'rgba(248, 250, 252, 0.45)' : 'rgba(203, 213, 225, 0.35)';
        ctx.strokeStyle = b.storeys === 2 ? 'rgba(250, 204, 21, 0.85)' : 'rgba(148, 163, 184, 0.8)';
        ctx.lineWidth = 1 / zoom;
        for (const p of b.parts) {
            const bx = ((p.minX + WORLD_HALF_X) / spanX) * mapW;
            const bz = ((p.minZ + WORLD_HALF_Z) / spanZ) * mapH;
            const bw = ((p.maxX - p.minX) / spanX) * mapW;
            const bh = ((p.maxZ - p.minZ) / spanZ) * mapH;
            ctx.fillRect(bx, bz, bw, bh);
            ctx.strokeRect(bx, bz, bw, bh);
        }
    }

    const cicX = ((4 + WORLD_HALF_X) / spanX) * mapW;
    const cicY = ((12 + WORLD_HALF_Z) / spanZ) * mapH;
    const cicW = (40 / spanX) * mapW;
    const cicH = (28 / spanZ) * mapH;
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(cicX, cicY, cicW, cicH);

    for (const opp of Object.values(ncState.remotePlayers)) {
        const ox = (((opp.x || 0) + WORLD_HALF_X) / spanX) * mapW;
        const oz = (((opp.z || 0) + WORLD_HALF_Z) / spanZ) * mapH;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(ox, oz, 3.2 / zoom, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.translate(px, pz);
    ctx.rotate(-lp.yaw);
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    const s = 1 / Math.max(1, zoom * 0.6);
    ctx.moveTo(0, -6 * s);
    ctx.lineTo(4.5 * s, 5 * s);
    ctx.lineTo(0, 2.5 * s);
    ctx.lineTo(-4.5 * s, 5 * s);
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
    ctx.fillRect(mx + 12, my + mapH - 14, mapW - 24, 12);
    ctx.fillStyle = '#facc15';
    ctx.font = '900 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`GPS [${zoom.toFixed(1)}x] Press -/+`, mx + mapW / 2, my + mapH - 5);
}

function drawBuildModeToggleSwitch(ctx, W, H) {
    const isFlat = Boolean(ncState.flatMode);
    const swW = 248;
    const swH = 34;
    const sx = (W - swW) / 2;
    const sy = H - 104;

    // Outer pill container
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = isFlat ? '#38bdf8' : '#facc15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(sx, sy, swW, swH, 17);
    ctx.fill();
    ctx.stroke();

    // Active sliding pill highlight
    const halfW = (swW - 8) / 2;
    const pillX = isFlat ? (sx + halfW + 4) : (sx + 4);
    ctx.fillStyle = isFlat ? '#0284c7' : '#ca8a04';
    ctx.beginPath();
    ctx.roundRect(pillX, sy + 4, halfW, swH - 8, 13);
    ctx.fill();

    // Left Option: 3D BLOCK
    ctx.fillStyle = !isFlat ? '#ffffff' : '#94a3b8';
    ctx.font = '900 10.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🧱 3D BLOCK', sx + 4 + halfW / 2, sy + 20);

    // Right Option: FLAT FLOOR
    ctx.fillStyle = isFlat ? '#ffffff' : '#94a3b8';
    ctx.fillText('🟫 FLAT FLOOR', sx + halfW + 4 + halfW / 2, sy + 20);

    // Shortcut hint badge directly above switch
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 96, sy - 18, 192, 15, 6);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('Press [T] or [Tab] to Toggle Mode', W / 2, sy - 7);
}

export function renderHudFrame(now) {
    if (!hudCtx || !hudCanvas) return;
    const W = hudCanvas.width;
    const H = hudCanvas.height;
    const ctx = hudCtx;
    const lp = ncState.localPlayer;
    const teacher = isTeacherBuilder();

    ctx.clearRect(0, 0, W, H);

    const cx = W / 2; const cy = H / 2;
    const hasTarget = Boolean(ncState.targetBlock && ncState.targetBlock.hit);
    ctx.strokeStyle = hasTarget ? '#facc15' : 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9);
    ctx.stroke();

    const builderCount = Object.keys(ncState.remotePlayers).length + 1;
    const zone = getCurrentBuildingOrZone(lp.x, lp.z);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = teacher ? '#4ade80' : '#facc15';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(12, 10, 345, 66, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = teacher ? '#4ade80' : '#facc15';
    ctx.font = '900 13px sans-serif';
    ctx.textAlign = 'left';
    if (teacher) ctx.fillText(`👑 TEACHER CREATIVE • ∞ NoteCoins • All Blocks`, 22, 29);
    else ctx.fillText(`🎵 ${lp.noteCoins} NoteCoins  |  🎼 ${lp.masteredSongs.length} Songs`, 22, 29);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px sans-serif';
    const flyText = lp.isFlying ? ` • 🪽 FLYING (${Math.ceil(lp.flightTimer)}s)` : '';
    const clearHint = teacher && builderCount > 1 ? ' • [K] Clear Ghosts' : '';
    ctx.fillText(`🏫 Builders Online: ${builderCount}${flyText}${clearHint}`, 22, 47);

    ctx.fillStyle = zone.color;
    ctx.font = '900 11px sans-serif';
    ctx.fillText(`📍 ${zone.name}`, 22, 65);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(W - 442, 10, 430, 62, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = '900 11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('WASD: Move • Space: Jump • L-Click/E: Build • R-Click/Q: Break', W - 22, 28);

    const undoCount = Array.isArray(ncState.world.undoStack) ? ncState.world.undoStack.length : 0;
    ctx.fillStyle = undoCount > 0 ? '#facc15' : '#94a3b8';
    ctx.font = '900 11.5px sans-serif';
    ctx.fillText(`↩️ Press [Z] to Undo Last Build (${undoCount} saved)`, W - 22, 46);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('🔄 [T] Flat/Block Mode • 🚪 [X] Quit • 🔍 [-/+] Zoom', W - 22, 62);

    drawQuitButton(ctx, W);

    if (ncState.toastMessage && now < ncState.toastMessage.expiresAt) {
        const msg = ncState.toastMessage;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = msg.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 220, 78, 440, 32, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = msg.color;
        ctx.font = '900 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(msg.text, W / 2, 98);
    }

    drawSatelliteMinimap(ctx, H);
    drawBuildModeToggleSwitch(ctx, W, H);

    // 13 Slots Hotbar
    const slots = 13;
    const slotW = 46;
    const slotH = 50;
    const gap = 4;
    const totalW = slots * slotW + (slots - 1) * gap;
    const startX = (W - totalW) / 2;
    const startY = H - slotH - 12;

    for (let i = 0; i < slots; i++) {
        const sx = startX + i * (slotW + gap);
        const blockId = lp.inventory[i];
        const isSelected = lp.selectedSlot === i;

        ctx.fillStyle = isSelected ? 'rgba(30, 41, 59, 0.96)' : 'rgba(15, 23, 42, 0.84)';
        ctx.strokeStyle = isSelected ? '#facc15' : '#475569';
        ctx.lineWidth = isSelected ? 2.5 : 1.2;
        ctx.beginPath();
        ctx.roundRect(sx, startY, slotW, slotH, 6);
        ctx.fill();
        ctx.stroke();

        if (blockId && BLOCK_META[blockId]) {
            const meta = BLOCK_META[blockId];
            const cost = teacher ? 0 : (BLOCK_COSTS[blockId] || 0);

            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(meta.hotkey, sx + 4, startY + 11);

            ctx.fillStyle = meta.swatch;
            ctx.strokeStyle = meta.accent;
            ctx.lineWidth = 1.2;
            ctx.fillRect(sx + 14, startY + 12, 18, 16);
            ctx.strokeRect(sx + 14, startY + 12, 18, 16);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 8.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(meta.label, sx + slotW / 2, startY + 37);

            ctx.fillStyle = cost === 0 ? '#4ade80' : '#facc15';
            ctx.font = '900 7.5px sans-serif';
            ctx.fillText(cost === 0 ? 'FREE' : `${cost}🎵`, sx + slotW / 2, startY + 46);
        } else {
            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🔒', sx + slotW / 2, startY + 30);
        }
    }

    const undoX = startX + totalW + 8;
    ctx.fillStyle = undoCount > 0 ? 'rgba(15, 23, 42, 0.94)' : 'rgba(15, 23, 42, 0.65)';
    ctx.strokeStyle = undoCount > 0 ? '#facc15' : '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(undoX, startY, 46, slotH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = undoCount > 0 ? '#facc15' : '#64748b';
    ctx.font = '900 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('[Z]', undoX + 23, startY + 22);
    ctx.font = '900 8.5px sans-serif';
    ctx.fillText('UNDO', undoX + 23, startY + 36);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 7.5px sans-serif';
    ctx.fillText(`(${undoCount})`, undoX + 23, startY + 45);
}

export function disposeHud() {
    ncState.quitButtonRect = null;
    if (hudCanvas && hudCanvas.parentNode) hudCanvas.parentNode.removeChild(hudCanvas);
    hudCanvas = null;
    hudCtx = null;
}
