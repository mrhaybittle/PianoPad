// js/games/laserTag/viewmodel.js
import { gameState } from './state.js';

export function renderBeamsAndBlaster(ctx, W, H, dt, now, activelyMoving, gearMult) {
    const lp = gameState.localPlayer;

    // 1. First-Person Laser Beams (supports Rainbow Plasma during 2x Note-Chain Combo)
    for (let i = gameState.activeBeams.length - 1; i >= 0; i--) {
        const b = gameState.activeBeams[i];
        b.life -= dt * 4.5;
        if (b.life <= 0) {
            gameState.activeBeams.splice(i, 1);
            continue;
        }
        const gunTipX = W * 0.72;
        const gunTipY = H * 0.76 + lp.recoil * 14;
        const wm = b.widthMult || 1.0;

        let beamGlow = b.glow;
        if (b.color === 'rainbow') {
            const hue = Math.floor((now * 0.6) % 360);
            beamGlow = `hsl(${hue}, 100%, 55%)`;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, b.life);
        ctx.strokeStyle = beamGlow;
        ctx.lineWidth = 12 * wm * b.life;
        ctx.beginPath();
        ctx.moveTo(gunTipX, gunTipY);
        ctx.lineTo(b.endX, b.endY);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 * wm * b.life;
        ctx.beginPath();
        ctx.moveTo(gunTipX, gunTipY);
        ctx.lineTo(b.endX, b.endY);
        ctx.stroke();
        ctx.restore();
    }

    // 2. First-Person Space Blaster Viewmodel
    if (!lp.isAlive) return;

    lp.recoil = Math.max(0, lp.recoil - dt * 5);
    lp.muzzleFlash = Math.max(0, lp.muzzleFlash - dt * 8);

    const localRespawning = now < lp.invulnerableUntil;
    const gunBobX = !activelyMoving ? 0 : Math.cos(lp.bobPhase * 0.5) * (4 + gearMult * 2);
    const gunBobY = (!activelyMoving ? 0 : Math.abs(Math.sin(lp.bobPhase * 0.5)) * (4 + gearMult * 2)) + lp.recoil * 18;
    const gx = W * 0.72 + gunBobX;
    const gy = H * 0.78 + gunBobY;

    ctx.save();
    if (localRespawning) ctx.globalAlpha = 0.45;
    else if (lp.currentGear.stealth) ctx.globalAlpha = 0.55;

    ctx.fillStyle = localRespawning ? '#e2e8f0' : '#1e293b';
    ctx.strokeStyle = localRespawning ? '#ffffff' : (lp.jamFlash > 0 ? '#ef4444' : lp.suitColor);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(gx - 22, gy + 70);
    ctx.lineTo(gx - 10, gy - 14);
    ctx.lineTo(gx + 14, gy - 14);
    ctx.lineTo(gx + 34, gy + 70);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = localRespawning ? '#ffffff' : (lp.jamFlash > 0 ? '#ef4444' : lp.currentGear.color);
    ctx.fillRect(gx - 4, gy + 4, 12, 8);
    ctx.fillRect(gx - 6, gy + 20, 16, 8);

    if (lp.muzzleFlash > 0) {
        ctx.globalAlpha = lp.muzzleFlash;
        ctx.fillStyle = lp.suitColor;
        ctx.beginPath();
        ctx.arc(gx + 2, gy - 18, 22 * lp.muzzleFlash, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
