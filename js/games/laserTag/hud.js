// js/games/laserTag/hud.js
import {
    TILE_SIZE,
    MAP_COLS,
    MAP_ROWS,
    ARENA_CENTER_X,
    ARENA_CENTER_Y,
    WALL_THEMES
} from './constants.js';
import { gameState } from './state.js';
import {
    ARENA_MAP,
    isInsideEmeraldHub,
    getZoneInfoForCoords,
    getCurrentStormRadius,
    castRay
} from './arena.js';
import { getSuitColorForAvatar, normalizePitchClass, isPlayerActiveInRoom } from './utils.js';

export function drawShapedMapTile(ctx, x, y, w, h, tileType) {
    const theme = WALL_THEMES[tileType] || WALL_THEMES[1];
    ctx.fillStyle = theme.mapHex;

    if (theme.shape === 'curved') {
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.max(1.5, w * 0.48), 0, Math.PI * 2);
        ctx.fill();
    } else if (theme.shape === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();
    } else if (theme.shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h / 2);
        ctx.lineTo(x + w / 2, y + h);
        ctx.lineTo(x, y + h / 2);
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.fillRect(x, y, w, h);
    }
}

export function renderCompassRibbon(ctx, W) {
    const compW = 240;
    const compH = 24;
    const cx = W / 2;
    const topY = 8;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - compW / 2, topY, compW, compH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(cx - compW / 2 + 4, topY, compW - 8, compH);
    ctx.clip();

    const bearings = [
        { deg: 0,   label: 'E',  major: true },
        { deg: 45,  label: 'SE', major: false },
        { deg: 90,  label: 'S',  major: true },
        { deg: 135, label: 'SW', major: false },
        { deg: 180, label: 'W',  major: true },
        { deg: 225, label: 'NW', major: false },
        { deg: 270, label: 'N',  major: true },
        { deg: 315, label: 'NE', major: false }
    ];

    let curDeg = ((gameState.localPlayer.angle * 180) / Math.PI) % 360;
    if (curDeg < 0) curDeg += 360;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const b of bearings) {
        let diff = b.deg - curDeg;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;

        if (Math.abs(diff) <= 75) {
            const px = cx + (diff / 75) * (compW * 0.46);
            ctx.fillStyle = b.label === 'N' ? '#ef4444' : (b.major ? '#38bdf8' : '#94a3b8');
            ctx.font = b.major ? '900 11px sans-serif' : 'bold 9.5px sans-serif';
            ctx.fillText(b.label, px, topY + compH / 2 + 1);
        }
    }

    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx - 1, topY, 2, 5);
    ctx.restore();
}

export function renderProximityThreatRadar(ctx, W, H, now) {
    const lp = gameState.localPlayer;
    let leftThreat = 0;
    let rightThreat = 0;
    let rearThreat = 0;
    const maxRange = 270;

    for (const [id, opp] of Object.entries(gameState.remotePlayers)) {
        if (id === gameState.localId || !isPlayerActiveInRoom(opp) || opp.isInvulnerable) continue;
        const dx = opp.x - lp.x;
        const dy = opp.y - lp.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxRange) continue;

        const intensity = 1 - dist / maxRange;
        let rel = Math.atan2(dy, dx) - lp.angle;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;

        if (Math.abs(rel) > Math.PI * 0.28) {
            if (Math.abs(rel) > Math.PI * 0.72) {
                rearThreat = Math.max(rearThreat, intensity);
            } else if (rel < 0) {
                leftThreat = Math.max(leftThreat, intensity);
            } else {
                rightThreat = Math.max(rightThreat, intensity);
            }
        }
    }

    const pulse = 0.65 + 0.35 * Math.sin(now * 0.015);
    ctx.save();
    if (leftThreat > 0.05) {
        const gradL = ctx.createLinearGradient(0, 0, 48, 0);
        gradL.addColorStop(0, `rgba(239, 68, 68, ${leftThreat * 0.65 * pulse})`);
        gradL.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = gradL;
        ctx.fillRect(0, 0, 48, H);
    }
    if (rightThreat > 0.05) {
        const gradR = ctx.createLinearGradient(W, 0, W - 48, 0);
        gradR.addColorStop(0, `rgba(239, 68, 68, ${rightThreat * 0.65 * pulse})`);
        gradR.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = gradR;
        ctx.fillRect(W - 48, 0, 48, H);
    }
    if (rearThreat > 0.05) {
        const gradB = ctx.createLinearGradient(0, H, 0, H - 44);
        gradB.addColorStop(0, `rgba(249, 115, 22, ${rearThreat * 0.75 * pulse})`);
        gradB.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = gradB;
        ctx.fillRect(0, H - 44, W, 44);
    }
    ctx.restore();
}

function renderSniperScopeOverlay(ctx, W, H, now) {
    const lp = gameState.localPlayer;
    const cx = W / 2;
    const cy = H / 2;
    const scopeRadius = Math.min(W, H) * 0.44;
    const secsLeft = Math.max(0, (lp.sniperUntil - now) / 1000).toFixed(1);

    ctx.save();

    // 1. Darkened Vignette Outside Optic Lens
    const grad = ctx.createRadialGradient(cx, cy, scopeRadius * 0.78, cx, cy, Math.max(W, H) * 0.72);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0)');
    grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.72)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0.96)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 2. Outer Lens Ring & Rangefinder Hairlines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, scopeRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - scopeRadius, cy);
    ctx.lineTo(cx + scopeRadius, cy);
    ctx.moveTo(cx, cy - scopeRadius);
    ctx.lineTo(cx, cy + scopeRadius);
    ctx.stroke();

    // Mil-Dot Range Ticks
    for (let step = 1; step <= 4; step++) {
        const offset = (scopeRadius / 5) * step;
        const tick = step % 2 === 0 ? 7 : 4;
        ctx.beginPath();
        ctx.moveTo(cx - offset, cy - tick); ctx.lineTo(cx - offset, cy + tick);
        ctx.moveTo(cx + offset, cy - tick); ctx.lineTo(cx + offset, cy + tick);
        ctx.moveTo(cx - tick, cy - offset); ctx.lineTo(cx + tick, cy - offset);
        ctx.moveTo(cx - tick, cy + offset); ctx.lineTo(cx + tick, cy + offset);
        ctx.stroke();
    }

    // Center Precision Diamond
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx + 8, cy);
    ctx.lineTo(cx, cy + 8);
    ctx.lineTo(cx - 8, cy);
    ctx.closePath();
    ctx.stroke();

    // 3. Live Laser Rangefinder Distance & Target Lock Check
    const wallHit = castRay(lp.angle);
    let rangeMeters = Math.round(wallHit.dist / 8);
    let lockedTarget = null;

    for (const [id, opp] of Object.entries(gameState.remotePlayers)) {
        if (id === gameState.localId || !isPlayerActiveInRoom(opp) || opp.isInvulnerable) continue;
        const dx = opp.x - lp.x;
        const dy = opp.y - lp.y;
        const d = Math.hypot(dx, dy);
        if (d > 2600 || d > wallHit.dist) continue;
        let rel = Math.atan2(dy, dx) - lp.angle;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        if (Math.abs(rel) <= 0.14) {
            rangeMeters = Math.round(d / 8);
            lockedTarget = opp;
            break;
        }
    }

    ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.fillRect(cx - 115, cy + scopeRadius - 34, 230, 22);
    ctx.fillStyle = lockedTarget ? '#facc15' : '#38bdf8';
    ctx.font = '900 10.5px sans-serif';
    ctx.textAlign = 'center';
    const lockText = lockedTarget
        ? `🎯 LOCKED [${normalizePitchClass(lockedTarget.noteTag)}] • ${rangeMeters}m`
        : `🔭 2.0x OPTIC • RNG: ${rangeMeters}m • ${secsLeft}s`;
    ctx.fillText(lockText, cx, cy + scopeRadius - 19);

    ctx.restore();
}

export function renderFirstPersonHud(ctx, W, H, dt, now, activelyMoving, isBoosted) {
    const lp = gameState.localPlayer;

    if (lp.isAlive) {
        lp.jamFlash = Math.max(0, lp.jamFlash - dt * 2.5);
        lp.gearBannerFlash = Math.max(0, lp.gearBannerFlash - dt * 0.6);

        const localRespawning = now < lp.invulnerableUntil;
        const isEmpScrambled = now < lp.empScrambledUntil;

        // 2x Sniper Scope Optic Overlay (when sus4 active)
        if (now < (lp.sniperUntil || 0)) {
            renderSniperScopeOverlay(ctx, W, H, now);
        }

        // Center Reticle + Hit-Marker Crosshair Snap
        ctx.strokeStyle = lp.currentGear.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = lp.suitColor;
        ctx.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);

        if (now < lp.hitMarkerUntil) {
            ctx.save();
            ctx.strokeStyle = lp.hitMarkerElim ? '#ef4444' : '#ffffff';
            ctx.lineWidth = 3;
            const rIn = 6, rOut = 18;
            ctx.beginPath();
            ctx.moveTo(W / 2 - rOut, H / 2 - rOut); ctx.lineTo(W / 2 - rIn, H / 2 - rIn);
            ctx.moveTo(W / 2 + rOut, H / 2 - rOut); ctx.lineTo(W / 2 + rIn, H / 2 - rIn);
            ctx.moveTo(W / 2 - rOut, H / 2 + rOut); ctx.lineTo(W / 2 - rIn, H / 2 + rIn);
            ctx.moveTo(W / 2 + rOut, H / 2 + rOut); ctx.lineTo(W / 2 + rIn, H / 2 + rIn);
            ctx.stroke();
            ctx.restore();
        }

        renderCompassRibbon(ctx, W);
        renderProximityThreatRadar(ctx, W, H, now);

        // Top-Left Current Sector Badge
        const inHub = isInsideEmeraldHub(lp.x, lp.y);
        const myZone = getZoneInfoForCoords(lp.x, lp.y);
        ctx.save();
        ctx.fillStyle = inHub ? 'rgba(6, 78, 59, 0.90)' : 'rgba(2, 6, 23, 0.86)';
        ctx.strokeStyle = myZone.color;
        ctx.lineWidth = inHub ? 2.5 : 1.8;
        ctx.beginPath();
        ctx.roundRect(12, 10, 205, 32, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = myZone.color;
        ctx.font = '900 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(inHub ? `👑 KING OF HUB (+5/s)` : `📍 ${myZone.label}`, 114, 30);
        ctx.restore();

        // Kill Feed Ticker
        gameState.killFeedEntries = gameState.killFeedEntries.filter(k => now < k.expiresAt);
        if (gameState.killFeedEntries.length > 0) {
            ctx.save();
            ctx.font = 'bold 10.5px sans-serif';
            ctx.textAlign = 'left';
            gameState.killFeedEntries.forEach((entry, idx) => {
                const ky = 50 + idx * 20;
                ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
                ctx.fillRect(12, ky, 255, 17);
                ctx.fillStyle = entry.color;
                ctx.fillText(entry.text, 18, ky + 12);
            });
            ctx.restore();
        }

        // Storm Warning Banner
        const stormRadius = getCurrentStormRadius(now);
        const distFromCenter = Math.hypot(lp.x - ARENA_CENTER_X, lp.y - ARENA_CENTER_Y);
        if (distFromCenter > stormRadius) {
            ctx.save();
            ctx.fillStyle = 'rgba(185, 28, 28, 0.35)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(127, 29, 29, 0.94)';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 190, 42, 380, 34, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🌪️ OUTSIDE SAFE ZONE — RUN TO EMERALD HUB!', W / 2, 63);
            ctx.restore();
        }

        // EMP Scramble Glitch Overlay
        if (isEmpScrambled) {
            ctx.save();
            ctx.fillStyle = 'rgba(168, 85, 247, 0.22)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 165, 82, 330, 30, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#e9d5ff';
            ctx.font = '900 11.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⚡ EMP SCRAMBLED — SPEED LOCKED AT 0.35x', W / 2, 101);
            ctx.restore();
        }

        // Incoming Spectator Alert Banner
        const alertBanner = gameState.incomingAlertBanner;
        if (alertBanner && now < alertBanner.until) {
            const pulse = 0.75 + 0.25 * Math.sin(now * 0.02);
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 195, 42, 390, 44, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#facc15';
            ctx.font = '900 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`📡 ${alertBanner.text.toUpperCase()}!`, W / 2, 63);

            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(`Drone Callout from ${alertBanner.fromName}`, W / 2, 79);
            ctx.restore();
        }

        if (localRespawning) {
            ctx.save();
            ctx.fillStyle = 'rgba(248, 250, 252, 0.14)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 165, 40, 330, 30, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 11.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('👻 GHOST RESPAWN SHIELD ACTIVE', W / 2, 59);
            ctx.restore();
        }

        // Bottom-Center Chord Speed Gear & Ability Cooldowns HUD Pill
        const g = lp.currentGear;
        const boostTag = isBoosted ? ' • ⚡ 2.5x BOOST!' : '';
        const comboTag = (lp.comboCount >= 2 && now < lp.comboExpiresAt) ? ' • 🌈 2x COMBO!' : '';
        const throttleText = activelyMoving ? ` • 🟢 C# THRUST${boostTag}${comboTag}` : ` • ⚪ HOLD C#${boostTag}${comboTag}`;

        const snpStr = now < (lp.sniperUntil || 0)
            ? `Sniper:${Math.ceil((lp.sniperUntil - now) / 1000)}s`
            : (now >= (lp.sniperReadyAt || 0) ? 'sus4:🔭' : `Sniper:${Math.ceil((lp.sniperReadyAt - now) / 1000)}s`);
        const ocStr = now >= lp.overchargeReadyAt ? 'Cmaj7/Fmaj7:⚡' : `Maj7:${Math.ceil((lp.overchargeReadyAt - now) / 1000)}s`;
        const empStr = now >= lp.empReadyAt ? 'Bdim7:🌀' : `EMP:${Math.ceil((lp.empReadyAt - now) / 1000)}s`;
        const decStr = now >= lp.decoyReadyAt ? 'Dm7/Em7:👥' : `Decoy:${Math.ceil((lp.decoyReadyAt - now) / 1000)}s`;

        ctx.save();
        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.strokeStyle = isBoosted ? '#22c55e' : g.color;
        ctx.lineWidth = (lp.gearBannerFlash > 0 || isBoosted) ? 3 : 1.8;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 250, H - 56, 500, 38, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isBoosted ? '#22c55e' : g.color;
        ctx.font = '900 11.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`GEAR: ${g.label}${throttleText}`, W / 2, H - 40);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.fillText(`C2+C4:180° • ${snpStr} • ${ocStr} • ${empStr} • ${decStr}`, W / 2, H - 25);
        ctx.restore();

        if (lp.jamFlash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, lp.jamFlash * 1.4);
            ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(W / 2 - 155, H - 96, 310, 30, 8);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = '900 11.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⚠️ BLASTER JAMMED! Play 1 Note or Valid Chord', W / 2, H - 77);
            ctx.restore();
        }
    }

    if (lp.portalFlash > 0) {
        lp.portalFlash = Math.max(0, lp.portalFlash - dt * 1.8);
        ctx.save();
        ctx.globalAlpha = lp.portalFlash * 0.55;
        ctx.fillStyle = '#22d3ee';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    if (lp.damageFlash > 0) {
        lp.damageFlash = Math.max(0, lp.damageFlash - dt * 1.15);
        ctx.save();
        ctx.globalAlpha = lp.damageFlash * 0.72;
        ctx.fillStyle = lp.damageFlashColor;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }
}

export function renderMinimapAndTopHud(ctx, W, H, now, activePlayers) {
    const lp = gameState.localPlayer;

    // Bottom-Left Color & Shape Coded Minimap Overlay
    if (lp.isAlive) {
        const mmSize = 162;
        const mmX = 12;
        const mmY = H - mmSize - 12;
        ctx.fillStyle = 'rgba(2, 6, 23, 0.90)';
        ctx.fillRect(mmX, mmY, mmSize, mmSize);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mmX, mmY, mmSize, mmSize);

        const scaleX = mmSize / (MAP_COLS * TILE_SIZE);
        const scaleY = mmSize / (MAP_ROWS * TILE_SIZE);

        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                const tile = ARENA_MAP[r][c];
                if (tile > 0) {
                    drawShapedMapTile(
                        ctx,
                        mmX + c * TILE_SIZE * scaleX,
                        mmY + r * TILE_SIZE * scaleY,
                        TILE_SIZE * scaleX,
                        TILE_SIZE * scaleY,
                        tile
                    );
                }
            }
        }

        // Dynamic Storm Circle on Minimap
        const stormRadius = getCurrentStormRadius(now);
        ctx.save();
        ctx.beginPath();
        ctx.rect(mmX, mmY, mmSize, mmSize);
        ctx.clip();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mmX + ARENA_CENTER_X * scaleX, mmY + ARENA_CENTER_Y * scaleY, stormRadius * scaleX, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Boost Pads & Med-Kits on Minimap
        ctx.fillStyle = '#22c55e';
        for (const pad of gameState.speedBoostPads) {
            ctx.fillRect(mmX + pad.x * scaleX - 2, mmY + pad.y * scaleY - 2, 4, 4);
        }
        ctx.fillStyle = '#f43f5e';
        for (const med of gameState.medKitNodes) {
            if (now >= med.respawnAt) {
                ctx.beginPath();
                ctx.arc(mmX + med.x * scaleX, mmY + med.y * scaleY, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Pulsing Portals on Minimap
        const pPulse = (Math.sin(now * 0.01) + 1) * 0.5;
        for (const portal of gameState.arenaPortals) {
            const px = mmX + portal.x * scaleX;
            const py = mmY + portal.y * scaleY;
            ctx.strokeStyle = portal.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, 3 + pPulse * 3, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = portal.secondaryColor;
            ctx.beginPath();
            ctx.arc(px, py, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const [id, opp] of Object.entries(gameState.remotePlayers)) {
            if (id === gameState.localId || !isPlayerActiveInRoom(opp)) continue;
            const ox = mmX + opp.x * scaleX;
            const oy = mmY + opp.y * scaleY;
            const oppColor = opp.isInvulnerable ? '#ffffff' : (opp.suitColor || getSuitColorForAvatar(opp.avatar, id));
            const isLeader = Number(opp.score || 0) >= 300;
            const isRevenge = lp.revengeTargetId === id;

            ctx.save();
            if (opp.isInvulnerable) ctx.globalAlpha = 0.45;
            else if (opp.isStealth) ctx.globalAlpha = 0.55;
            ctx.fillStyle = oppColor;
            ctx.beginPath();
            ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
            ctx.fill();

            if (isRevenge) {
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(ox, oy, 7 + pPulse * 4, 0, Math.PI * 2);
                ctx.stroke();
            } else if (isLeader) {
                ctx.strokeStyle = '#facc15';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            ctx.font = '10px sans-serif';
            ctx.fillText(opp.avatar || '🔴', ox, oy);

            ctx.fillStyle = isRevenge ? '#ef4444' : '#facc15';
            ctx.font = 'bold 7.5px sans-serif';
            ctx.fillText(normalizePitchClass(opp.noteTag || ''), ox, oy - 7);
            ctx.restore();
        }

        // Pulsing Bright Yellow Radar Beacon for Local Player
        const lx = mmX + lp.x * scaleX;
        const ly = mmY + lp.y * scaleY;
        const pulseWave = (Math.sin(now * 0.008) + 1) * 0.5;

        ctx.save();
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.95 - pulseWave * 0.65})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(lx, ly, 5 + pulseWave * 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(250, 204, 21, ${0.35 - pulseWave * 0.2})`;
        ctx.beginPath();
        ctx.arc(lx, ly, 6 + pulseWave * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(lp.angle) * 15, ly + Math.sin(lp.angle) * 15);
        ctx.stroke();

        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Top-Right HUD
    const aliveCount = Math.max(1, activePlayers.length);
    const heartsDisplay = '❤️'.repeat(lp.lives) + '🖤'.repeat(Math.max(0, 3 - lp.lives));

    ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
    ctx.fillRect(W - 355, 10, 345, 56);
    ctx.strokeStyle = lp.currentGear.color;
    ctx.strokeRect(W - 355, 10, 345, 56);

    ctx.fillStyle = lp.currentGear.color;
    ctx.font = '900 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${heartsDisplay} | SCORE: ${lp.score} | ALIVE: ${aliveCount} | TAG: ${lp.noteTag}`, W - 18, 30);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`C: Left • D: Right • Hold C#: Forward • Chords: Speed`, W - 18, 50);

    if (gameState.maxPeakPlayers >= 2 && activePlayers.length === 1) {
        renderMvpPodiumOverlay(ctx, W, H);
    }
}

export function renderSpectatorOverheadView(ctx, W, H, dt, now) {
    const lp = gameState.localPlayer;
    const scale = Math.min(W / (MAP_COLS * TILE_SIZE), H / (MAP_ROWS * TILE_SIZE)) * 0.92;
    const offsetX = (W - MAP_COLS * TILE_SIZE * scale) / 2;
    const offsetY = (H - MAP_ROWS * TILE_SIZE * scale) / 2;

    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            const tile = ARENA_MAP[r][c];
            if (tile === 0) {
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#1e293b';
                ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else {
                drawShapedMapTile(ctx, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE, tile);
            }
        }
    }

    const stormRadius = getCurrentStormRadius(now);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(ARENA_CENTER_X, ARENA_CENTER_Y, stormRadius, 0, Math.PI * 2);
    ctx.stroke();

    for (const pad of gameState.speedBoostPads) {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, 18, 0, Math.PI * 2);
        ctx.fill();
    }

    for (const med of gameState.medKitNodes) {
        if (now < med.respawnAt) continue;
        ctx.font = '26px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💖', med.x, med.y);
    }

    for (const portal of gameState.arenaPortals) {
        const pulse = (Math.sin(now * 0.008) + 1) * 0.5;
        ctx.save();
        ctx.strokeStyle = portal.color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(portal.x, portal.y, 26 + pulse * 14, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = portal.secondaryColor;
        ctx.beginPath();
        ctx.arc(portal.x, portal.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    for (const [id, opp] of Object.entries(gameState.remotePlayers)) {
        if (!isPlayerActiveInRoom(opp)) continue;
        const oppColor = opp.isInvulnerable ? '#ffffff' : (opp.suitColor || getSuitColorForAvatar(opp.avatar, id));
        const isLeader = Number(opp.score || 0) >= 300;
        ctx.save();
        if (opp.isInvulnerable) ctx.globalAlpha = 0.45;
        ctx.fillStyle = oppColor;
        ctx.beginPath();
        ctx.arc(opp.x, opp.y, 24, 0, Math.PI * 2);
        ctx.fill();

        if (isLeader) {
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 5;
            ctx.stroke();
        }

        const oppLives = opp.lives !== undefined ? Number(opp.lives) : 3;
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${isLeader ? '👑 ' : ''}${opp.name} [${opp.noteTag}] ${'❤️'.repeat(oppLives)}`, opp.x, opp.y - 32);
        ctx.restore();
    }

    for (let i = gameState.worldExplosions.length - 1; i >= 0; i--) {
        const p = gameState.worldExplosions[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.4;
        if (p.life <= 0) {
            gameState.worldExplosions.splice(i, 1);
            continue;
        }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    ctx.restore();

    if (gameState.spectatorSelectedTarget) {
        const targetObj = gameState.remotePlayers[gameState.spectatorSelectedTarget.id];
        if (!targetObj || !isPlayerActiveInRoom(targetObj)) {
            gameState.spectatorSelectedTarget = null;
        } else {
            const px = offsetX + targetObj.x * scale;
            const py = offsetY + targetObj.y * scale;
            gameState.spectatorSelectedTarget.screenX = px;
            gameState.spectatorSelectedTarget.screenY = py;

            const options = [
                { msg: 'Watch Out', color: '#ef4444' },
                { msg: 'Turn Left', color: '#38bdf8' },
                { msg: 'Turn Right', color: '#22c55e' }
            ];
            const btnW = 94;
            const btnH = 26;
            const gap = 6;
            const totalW = options.length * btnW + (options.length - 1) * gap;
            const startX = Math.max(10, Math.min(W - totalW - 10, px - totalW / 2));
            const startY = Math.max(54, py - 48);

            ctx.save();
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(px, py, 16, 0, Math.PI * 2);
            ctx.stroke();

            gameState.spectatorSelectedTarget.buttons = [];
            options.forEach((opt, idx) => {
                const bx = startX + idx * (btnW + gap);
                const by = startY;
                gameState.spectatorSelectedTarget.buttons.push({ x: bx, y: by, w: btnW, h: btnH, msg: opt.msg });

                ctx.fillStyle = '#0f172a';
                ctx.strokeStyle = opt.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(bx, by, btnW, btnH, 6);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = opt.color;
                ctx.font = '900 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(opt.msg, bx + btnW / 2, by + btnH / 2);
            });
            ctx.restore();
        }
    }

    if (lp.damageFlash > 0) {
        lp.damageFlash = Math.max(0, lp.damageFlash - dt * 0.85);
        ctx.save();
        ctx.globalAlpha = lp.damageFlash * 0.78;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    ctx.fillStyle = 'rgba(2, 6, 23, 0.90)';
    ctx.fillRect(W / 2 - 270, 10, 540, 36);
    ctx.strokeStyle = '#facc15';
    ctx.strokeRect(W / 2 - 270, 10, 540, 36);
    ctx.fillStyle = '#facc15';
    ctx.font = '900 12.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🛰️ SPECTATOR DRONE — CLICK ANY PLAYER TO SEND "WATCH OUT", "TURN LEFT", OR "TURN RIGHT"', W / 2, 32);
}

export function renderMvpPodiumOverlay(ctx, W, H) {
    const allPlayers = Object.values(gameState.remotePlayers);
    if (allPlayers.length === 0) return;

    const survivor = allPlayers.find(p => isPlayerActiveInRoom(p)) || allPlayers[0];
    const sortedByScore = [...allPlayers].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    const topScorer = sortedByScore[0] || survivor;
    const sortedByElims = [...allPlayers].sort((a, b) => Number(b.eliminations || 0) - Number(a.eliminations || 0));
    const topSlayer = sortedByElims[0] || survivor;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.86)';
    ctx.fillRect(0, 0, W, H);

    const cardW = Math.min(540, W * 0.90);
    const cardH = 260;
    const cx = W / 2;
    const cy = H / 2;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.font = '900 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 LASER TAG ARENA CHAMPIONS 🏆', cx, cy - 88);

    const cols = [
        { title: '👑 LAST SURVIVOR', p: survivor, stat: `${survivor.lives || 1} Lives Left`, color: '#22c55e', x: cx - cardW * 0.30 },
        { title: '⭐ TOP SCORER',    p: topScorer, stat: `${topScorer.score || 0} pts`,      color: '#38bdf8', x: cx },
        { title: '💥 MOST TAGS',     p: topSlayer, stat: `${topSlayer.eliminations || 0} Eliminations`, color: '#f97316', x: cx + cardW * 0.30 }
    ];

    for (const c of cols) {
        ctx.fillStyle = c.color;
        ctx.font = '900 11px sans-serif';
        ctx.fillText(c.title, c.x, cy - 42);

        ctx.font = '38px sans-serif';
        ctx.fillText(c.p.avatar || '🤖', c.x, cy + 4);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 14px sans-serif';
        ctx.fillText(c.p.name || 'Player', c.x, cy + 42);

        ctx.fillStyle = c.color;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(c.stat, c.x, cy + 62);
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Press "test" to spawn another 50-bot wave or Exit to return to menu', cx, cy + 104);
    ctx.restore();
}
