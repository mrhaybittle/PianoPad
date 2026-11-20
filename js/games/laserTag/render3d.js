// js/games/laserTag/render3d.js
import { TILE_SIZE, WALL_THEMES } from './constants.js';
import { gameState } from './state.js';
import { castRay } from './arena.js';
import { collectWorldSprites, drawWorldSprite } from './sprites.js';
import { renderBeamsAndBlaster } from './viewmodel.js';
import { renderFirstPersonHud } from './hud.js';

export function renderFirstPerson3D(ctx, W, H, dt, now) {
    const lp = gameState.localPlayer;
    const FOV = Math.PI / 3;
    const isBoosted = now < lp.boostUntil;
    const gearMult = lp.currentGear.mult * (isBoosted ? 1.5 : 1.0);
    const activelyMoving = lp.isMovingForward && gearMult > 0;
    const bobAmp = activelyMoving ? Math.min(8, 2.5 + gearMult * 2.0) : 0;
    const bobOffset = lp.isAlive ? Math.sin(lp.bobPhase) * bobAmp : 0;
    const horizon = H * 0.52 + bobOffset;

    // 1. Sci-Fi Ceiling & Floor
    const ceilGrad = ctx.createLinearGradient(0, 0, 0, horizon);
    ceilGrad.addColorStop(0, '#020617');
    ceilGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = ceilGrad;
    ctx.fillRect(0, 0, W, horizon);

    const floorGrad = ctx.createLinearGradient(0, horizon, 0, H);
    floorGrad.addColorStop(0, '#090d16');
    floorGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizon, W, H - horizon);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 6; i++) {
        const yLine = horizon + Math.pow(i / 6, 1.8) * (H - horizon);
        ctx.beginPath();
        ctx.moveTo(0, yLine);
        ctx.lineTo(W, yLine);
        ctx.stroke();
    }

    // 2. Raycast 3D Color-Coded & Geometrically Distinct Sector Walls
    const numRays = Math.min(340, Math.floor(W / 2.8));
    const stripW = W / numRays;
    gameState.zBuffer = new Array(numRays);

    for (let i = 0; i < numRays; i++) {
        const rayAngle = (lp.angle - FOV / 2) + (i / numRays) * FOV;
        const hit = castRay(rayAngle);
        const correctedDist = hit.dist * Math.cos(rayAngle - lp.angle);
        gameState.zBuffer[i] = correctedDist;

        const wallHeight = Math.min(H * 1.6, (TILE_SIZE * H) / Math.max(1, correctedDist));
        const wallTop = horizon - wallHeight / 2;

        const distShade = Math.max(0.18, 1 - correctedDist / 1450);
        const shade = distShade * (hit.customShade || 1.0);
        const theme = WALL_THEMES[hit.wallType] || WALL_THEMES[1];

        ctx.fillStyle = `rgb(${Math.floor(theme.r * shade)}, ${Math.floor(theme.g * shade)}, ${Math.floor(theme.b * shade)})`;
        ctx.fillRect(i * stripW, wallTop, stripW + 1, wallHeight);

        const [tr, tg, tb] = theme.trim;
        const trimAlpha = Math.min(1, distShade * 1.15);
        ctx.fillStyle = `rgba(${tr}, ${tg}, ${tb}, ${trimAlpha})`;

        const trimH = Math.max(3, wallHeight * 0.055);
        ctx.fillRect(i * stripW, wallTop, stripW + 1, trimH);
        ctx.fillRect(i * stripW, wallTop + wallHeight - trimH, stripW + 1, trimH);

        if (theme.shape === 'triangle') {
            const diagY = wallTop + wallHeight * (0.25 + 0.5 * Math.abs((hit.stripeCoord % 1) - 0.5));
            ctx.fillRect(i * stripW, diagY, stripW + 1, Math.max(2, trimH * 0.75));
        } else if (theme.shape === 'diamond') {
            const midBandY = wallTop + wallHeight * 0.48;
            ctx.fillRect(i * stripW, midBandY, stripW + 1, Math.max(2, trimH * 0.85));
        }
    }

    // 3. Depth-Sorted 3D Sprites
    const sprites = collectWorldSprites(dt, now);
    for (const sp of sprites) {
        drawWorldSprite(ctx, sp, gameState.zBuffer, numRays, stripW, horizon, W, H, now);
    }

    // 4. First-Person Laser Beams & Blaster Viewmodel
    renderBeamsAndBlaster(ctx, W, H, dt, now, activelyMoving, gearMult);

    // 5. Crosshair, Compass, Threat Radar, Banners & Cooldown Pill
    renderFirstPersonHud(ctx, W, H, dt, now, activelyMoving, isBoosted);
}
