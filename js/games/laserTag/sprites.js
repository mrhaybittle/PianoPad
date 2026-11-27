// js/games/laserTag/sprites.js
import { TILE_SIZE, ARENA_CENTER_X, ARENA_CENTER_Y } from './constants.js';
import { gameState } from './state.js';
import { hasLineOfSight } from './arena.js';
import { getSuitColorForAvatar, normalizePitchClass, isPlayerActiveInRoom } from './utils.js';

function drawHubBeaconSprite(ctx, sp, screenX, horizon, W, H) {
    const beamW = Math.max(8, (TILE_SIZE * 0.45 * H) / Math.max(60, sp.dist));
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, 'rgba(52, 211, 153, 0)');
    grad.addColorStop(1, 'rgba(52, 211, 153, 0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(screenX - beamW / 2, 0, beamW, horizon);
    ctx.restore();
}

function drawBoostPadSprite(ctx, sp, screenX, horizon, W, H, now) {
    const padScale = (TILE_SIZE * H) / sp.dist;
    const floorY = horizon + padScale * 0.44;
    const padW = Math.max(24, padScale * 0.72);
    const padH = Math.max(8, padScale * 0.16);
    const pulse = 0.6 + 0.4 * Math.sin(now * 0.012);

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#22c55e';
    ctx.strokeStyle = '#bbf7d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(screenX, floorY, padW * 0.5, padH * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.max(10, Math.floor(padScale * 0.14))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⚡ BOOST', screenX, floorY - padH * 0.8);
    ctx.restore();
}

function drawMedKitSprite(ctx, sp, screenX, horizon, W, H, now) {
    const medScale = (TILE_SIZE * H) / sp.dist;
    const floatY = horizon + Math.sin(now * 0.005) * (medScale * 0.08);
    const heartSize = Math.max(18, Math.min(72, Math.floor(medScale * 0.36)));

    ctx.save();
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 16;
    ctx.font = `${heartSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💖', screenX, floatY);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fda4af';
    ctx.font = `900 ${Math.max(9, Math.floor(heartSize * 0.30))}px sans-serif`;
    ctx.fillText('+1 LIFE', screenX, floatY - heartSize * 0.68);
    ctx.restore();
}

function drawMinePickupSprite(ctx, sp, screenX, horizon, W, H, now) {
    const scale = (TILE_SIZE * H) / sp.dist;
    const floatY = horizon + scale * 0.22 + Math.sin(now * 0.007) * (scale * 0.05);
    const size = Math.max(18, Math.min(64, Math.floor(scale * 0.32)));

    ctx.save();
    ctx.shadowColor = '#fb923c';
    ctx.shadowBlur = 14;
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💣', screenX, floatY);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fed7aa';
    ctx.font = `900 ${Math.max(9, Math.floor(size * 0.28))}px sans-serif`;
    ctx.fillText('+MINE', screenX, floatY - size * 0.65);
    ctx.restore();
}

function drawArmedMineSprite(ctx, sp, screenX, horizon, W, H, now) {
    const scale = (TILE_SIZE * H) / sp.dist;
    const floorY = horizon + scale * 0.42;
    const blink = (Math.sin(now * 0.025) + 1) * 0.5;
    const r = Math.max(5, Math.min(28, scale * 0.14));

    ctx.save();
    ctx.fillStyle = blink > 0.5 ? '#ef4444' : '#7f1d1d';
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(screenX, floorY, r * 1.3, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fecaca';
    ctx.font = `900 ${Math.max(8, Math.floor(scale * 0.11))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('MINE', screenX, floorY - r * 1.1);
    ctx.restore();
}

function drawWeaponCrateSprite(ctx, sp, screenX, horizon, W, H, now) {
    const scale = (TILE_SIZE * H) / sp.dist;
    const floatY = horizon + scale * 0.15 + Math.sin(now * 0.006) * (scale * 0.06);
    const size = Math.max(20, Math.min(72, Math.floor(scale * 0.36)));

    ctx.save();
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 18;
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔫', screenX, floatY);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fef08a';
    ctx.font = `900 ${Math.max(9, Math.floor(size * 0.26))}px sans-serif`;
    ctx.fillText('3X LASER', screenX, floatY - size * 0.66);
    ctx.restore();
}

function drawRadarPickupSprite(ctx, sp, screenX, horizon, W, H, now) {
    const scale = (TILE_SIZE * H) / sp.dist;
    const floatY = horizon + scale * 0.16 + Math.sin(now * 0.006 + 1.2) * (scale * 0.06);
    const size = Math.max(20, Math.min(72, Math.floor(scale * 0.36)));

    ctx.save();
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 18;
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧭', screenX, floatY);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#bae6fd';
    ctx.font = `900 ${Math.max(9, Math.floor(size * 0.26))}px sans-serif`;
    ctx.fillText('RADAR', screenX, floatY - size * 0.66);
    ctx.restore();
}

function drawPortalSprite(ctx, sp, screenX, horizon, W, H, now) {
    const portalH = Math.min(H * 1.15, Math.max(48, (TILE_SIZE * 0.95 * H) / sp.dist));
    const portalW = portalH * 0.62;
    const spin = now * 0.004;

    ctx.save();
    ctx.translate(screenX, horizon);

    ctx.shadowColor = sp.portal.color;
    ctx.shadowBlur = 22;
    ctx.strokeStyle = sp.portal.color;
    ctx.lineWidth = Math.max(3, portalW * 0.09);
    ctx.beginPath();
    ctx.ellipse(0, 0, portalW * 0.5, portalH * 0.48, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = sp.portal.secondaryColor;
    ctx.lineWidth = Math.max(2, portalW * 0.05);
    ctx.beginPath();
    ctx.ellipse(0, 0, portalW * 0.34, portalH * 0.34, spin, 0, Math.PI * 1.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 0, portalW * 0.20, portalH * 0.20, -spin * 1.4, 0, Math.PI * 1.5);
    ctx.stroke();

    ctx.fillStyle = sp.portal.color;
    ctx.globalAlpha = 0.28 + 0.12 * Math.sin(now * 0.008);
    ctx.beginPath();
    ctx.ellipse(0, 0, portalW * 0.44, portalH * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    ctx.shadowBlur = 0;
    ctx.fillStyle = sp.portal.secondaryColor;
    ctx.font = `900 ${Math.max(11, Math.floor(portalH * 0.14))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`🌀 ${sp.portal.name}`, 0, -portalH * 0.54);
    ctx.restore();
}

function drawParticleSprite(ctx, sp, screenX, horizon, W, H) {
    const pScale = (TILE_SIZE * H) / sp.dist;
    const py = horizon + (sp.p.z / TILE_SIZE) * pScale;
    const radius = Math.max(2, (sp.p.size / TILE_SIZE) * pScale);
    ctx.save();
    ctx.globalAlpha = Math.max(0, sp.p.life);
    ctx.fillStyle = sp.p.color;
    ctx.beginPath();
    ctx.arc(screenX, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawPlayerSprite(ctx, sp, screenX, horizon, W, H, now) {
    const lp = gameState.localPlayer;
    const spriteH = Math.min(H * 1.05, Math.max(46, (TILE_SIZE * 0.88 * H) / sp.dist));
    const spriteW = spriteH * 0.65;
    const topY = horizon - spriteH * 0.42;

    const isGhostRespawning = Boolean(sp.opp.isInvulnerable);
    const isSneaky = Boolean(sp.opp.isStealth);
    const isLeader = !sp.isDecoy && Number(sp.opp.score || 0) >= 300;
    const isRevengeBounty = !sp.isDecoy && lp.revengeTargetId === sp.id;
    const oppSuitColor = sp.opp.suitColor || getSuitColorForAvatar(sp.opp.avatar, sp.id);

    ctx.save();
    if (isGhostRespawning) {
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now * 0.015);
    } else if (sp.isDecoy) {
        ctx.globalAlpha = 0.68 + 0.15 * Math.sin(now * 0.025);
    } else if (isSneaky) {
        ctx.globalAlpha = 0.48;
    }

    const bodyCenterY = topY + spriteH * 0.56;
    const auraColor = isGhostRespawning
        ? '#ffffff'
        : (isRevengeBounty ? '#ef4444' : (isLeader ? '#facc15' : oppSuitColor));

    ctx.save();
    ctx.shadowColor = auraColor;
    ctx.shadowBlur = Math.max(14, spriteH * 0.22);
    const largeAvatarSize = Math.max(38, Math.floor(spriteH * 0.86));
    ctx.font = `${largeAvatarSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sp.opp.avatar || '🤖', screenX, bodyCenterY);
    ctx.restore();

    const pitchLabel = normalizePitchClass(sp.opp.noteTag || 'F#');
    const badgeW = Math.max(68, spriteW * 1.15);
    const badgeH = Math.max(28, spriteH * 0.28);
    const badgeY = Math.max(12, topY - badgeH - 12);

    if (isRevengeBounty) {
        ctx.fillStyle = '#ef4444';
        ctx.font = `900 ${Math.max(10, Math.floor(badgeH * 0.45))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('🎯 REVENGE (+100)', screenX, badgeY - badgeH * 0.48);
    } else if (isLeader && !isGhostRespawning) {
        ctx.font = `${Math.max(16, Math.floor(badgeH * 0.85))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('👑', screenX, badgeY - badgeH * 0.55);
    }

    ctx.shadowColor = isGhostRespawning ? '#ffffff' : (isRevengeBounty ? '#ef4444' : '#facc15');
    ctx.shadowBlur = 12;
    ctx.fillStyle = isGhostRespawning ? '#f1f5f9' : (isRevengeBounty ? '#ef4444' : '#facc15');
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(screenX - badgeW / 2, badgeY, badgeW, badgeH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = isGhostRespawning ? '#f1f5f9' : (isRevengeBounty ? '#ef4444' : '#facc15');
    ctx.beginPath();
    ctx.moveTo(screenX - 6, badgeY + badgeH);
    ctx.lineTo(screenX + 6, badgeY + badgeH);
    ctx.lineTo(screenX, badgeY + badgeH + 7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = isRevengeBounty ? '#ffffff' : '#000000';
    ctx.font = `900 ${Math.max(16, Math.floor(badgeH * 0.68))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isGhostRespawning ? `👻 ${pitchLabel}` : `🎯 ${pitchLabel}`, screenX, badgeY + badgeH * 0.54);

    const oppLives = sp.opp.lives !== undefined ? Number(sp.opp.lives) : 3;
    const oppHearts = sp.isDecoy ? '👥 DECOY' : '❤️'.repeat(Math.max(0, oppLives));
    ctx.fillStyle = isGhostRespawning ? '#e2e8f0' : '#ffffff';
    ctx.font = `800 ${Math.max(11, Math.floor(spriteH * 0.13))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${sp.opp.name || 'Player'} ${oppHearts}`, screenX, topY + spriteH + 12);
    ctx.restore();
}

function drawChallengeNodeSprite(ctx, sp, screenX, horizon, W, H, now) {
    const scale = (TILE_SIZE * H) / sp.dist;
    const floatY = horizon + Math.sin(now * 0.005) * (scale * 0.08);
    const size = Math.max(24, Math.min(90, Math.floor(scale * 0.5)));

    ctx.save();
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#facc15';
    ctx.font = `900 ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❓', screenX, floatY - size * 0.6);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e9d5ff';
    ctx.font = `900 ${Math.max(10, Math.floor(size * 0.22))}px sans-serif`;
    ctx.fillText('CHALLENGE', screenX, floatY);
    ctx.restore();
}

export const SPRITE_DRAWERS = {
    hub_beacon: drawHubBeaconSprite,
    boostpad:   drawBoostPadSprite,
    medkit:     drawMedKitSprite,
    mine_pk:    drawMinePickupSprite,
    armed_mine: drawArmedMineSprite,
    weapon_crate: drawWeaponCrateSprite,
    radar_pk:   drawRadarPickupSprite,
    portal:     drawPortalSprite,
    particle:   drawParticleSprite,
    player:     drawPlayerSprite,
    challenge_node: drawChallengeNodeSprite
};

export function collectWorldSprites(dt, now) {
    const lp = gameState.localPlayer;
    const sprites = [];

    const hubDx = ARENA_CENTER_X - lp.x;
    const hubDy = ARENA_CENTER_Y - lp.y;
    sprites.push({ type: 'hub_beacon', dx: hubDx, dy: hubDy, dist: Math.hypot(hubDx, hubDy) });

    for (const portal of gameState.arenaPortals) {
        const dx = portal.x - lp.x;
        const dy = portal.y - lp.y;
        sprites.push({ type: 'portal', portal, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const pad of gameState.speedBoostPads) {
        const dx = pad.x - lp.x;
        const dy = pad.y - lp.y;
        sprites.push({ type: 'boostpad', pad, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const med of gameState.medKitNodes) {
        if (now < med.respawnAt) continue;
        const dx = med.x - lp.x;
        const dy = med.y - lp.y;
        sprites.push({ type: 'medkit', med, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const mp of gameState.minePickups) {
        if (now < mp.respawnAt) continue;
        const dx = mp.x - lp.x;
        const dy = mp.y - lp.y;
        sprites.push({ type: 'mine_pk', minePk: mp, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const mine of gameState.activeMines) {
        if (mine.ownerId === gameState.localId) continue;
        const dx = mine.x - lp.x;
        const dy = mine.y - lp.y;
        sprites.push({ type: 'armed_mine', mine, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const crate of gameState.weaponCrateNodes) {
        if (now < crate.respawnAt) continue;
        const dx = crate.x - lp.x;
        const dy = crate.y - lp.y;
        sprites.push({ type: 'weapon_crate', crate, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const rp of gameState.radarPickupNodes) {
        if (now < rp.respawnAt) continue;
        const dx = rp.x - lp.x;
        const dy = rp.y - lp.y;
        sprites.push({ type: 'radar_pk', radarPk: rp, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const decoy of gameState.activeDecoys) {
        const dx = decoy.x - lp.x;
        const dy = decoy.y - lp.y;
        sprites.push({ type: 'player', id: decoy.id, opp: decoy, isDecoy: true, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (const [id, opp] of Object.entries(gameState.remotePlayers)) {
        if (id === gameState.localId || !isPlayerActiveInRoom(opp)) continue;
        const dx = opp.x - lp.x;
        const dy = opp.y - lp.y;
        sprites.push({ type: 'player', id, opp, isDecoy: false, dx, dy, dist: Math.hypot(dx, dy) });
    }

    for (let i = gameState.worldExplosions.length - 1; i >= 0; i--) {
        const p = gameState.worldExplosions[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.life -= dt * 1.4;
        if (p.life <= 0) {
            gameState.worldExplosions.splice(i, 1);
            continue;
        }
        const dx = p.x - lp.x;
        const dy = p.y - lp.y;
        sprites.push({ type: 'particle', p, dx, dy, dist: Math.hypot(dx, dy) });
    }

    if (gameState.challengeNodes) {
        for (const node of gameState.challengeNodes) {
            if (!node.active) continue;
            const dx = node.x - lp.x;
            const dy = node.y - lp.y;
            sprites.push({ type: 'challenge_node', node, dx, dy, dist: Math.hypot(dx, dy) });
        }
    }

    sprites.sort((a, b) => b.dist - a.dist);
    return sprites;
}

export function drawWorldSprite(ctx, sp, zBuffer, numRays, stripW, horizon, W, H, now) {
    const lp = gameState.localPlayer;
    const isSniper = now < (lp.sniperUntil || 0);
    const FOV = isSniper ? (Math.PI / 6) : (Math.PI / 3);

    let relAngle = Math.atan2(sp.dy, sp.dx) - lp.angle;
    while (relAngle > Math.PI) relAngle -= Math.PI * 2;
    while (relAngle < -Math.PI) relAngle += Math.PI * 2;

    if (Math.abs(relAngle) > FOV * 0.68 || sp.dist < 10) return;

    const screenX = (0.5 + relAngle / FOV) * W;

    const entityCoords =
        sp.type === 'player' ? [sp.opp.x, sp.opp.y] :
        sp.type === 'portal' ? [sp.portal.x, sp.portal.y] :
        sp.type === 'medkit' ? [sp.med.x, sp.med.y] :
        sp.type === 'mine_pk' ? [sp.minePk.x, sp.minePk.y] :
        sp.type === 'armed_mine' ? [sp.mine.x, sp.mine.y] :
        sp.type === 'weapon_crate' ? [sp.crate.x, sp.crate.y] :
        sp.type === 'radar_pk' ? [sp.radarPk.x, sp.radarPk.y] :
        sp.type === 'boostpad' ? [sp.pad.x, sp.pad.y] :
        sp.type === 'challenge_node' ? [sp.node.x, sp.node.y] : null;

    if (entityCoords) {
        const [tx, ty] = entityCoords;
        if (!hasLineOfSight(lp.x, lp.y, tx, ty)) {
            const centerRay = Math.floor(screenX / stripW);
            const leftRay = Math.max(0, centerRay - 5);
            const rightRay = Math.min(numRays - 1, centerRay + 5);
            let anyRayOpen = false;
            for (let rIdx = leftRay; rIdx <= rightRay; rIdx++) {
                if (zBuffer[rIdx] >= sp.dist - 14) {
                    anyRayOpen = true;
                    break;
                }
            }
            if (!anyRayOpen) return;
        }
    } else if (sp.type !== 'hub_beacon') {
        const rayIdx = Math.floor(screenX / stripW);
        if (rayIdx >= 0 && rayIdx < numRays && zBuffer[rayIdx] < sp.dist) return;
    }

    const drawFn = SPRITE_DRAWERS[sp.type];
    if (drawFn) drawFn(ctx, sp, screenX, horizon, W, H, now);
}
