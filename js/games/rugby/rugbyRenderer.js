// js/games/rugby/rugbyRenderer.js
import { LANES, LANE_NOTES, getPixelSprite } from './rugbyDataAndSprites.js';

function isAwayPerspective(state) {
  return Boolean(state && state.multiplayer && state.multiplayer.role === 'away');
}

function toViewCoords(state, nx, ny) {
  const cx = Math.min(0.95, Math.max(0.05, nx));
  const cy = Math.min(0.95, Math.max(0.05, ny));
  if (isAwayPerspective(state)) {
    return { vx: 1 - cx, vy: 1 - cy };
  }
  return { vx: cx, vy: cy };
}

function selectSpritePose(state, playerObj) {
  if (state.playState === 'tryCelebration') {
    if (playerObj.isScorer) {
      return state.tryCelebration.scoringSide === 'home' ? 'diveBack' : 'diveFront';
    }
    return Math.floor(playerObj.strideTimer) % 2 === 0 ? 'straightL' : 'straightR';
  }
  if (state.playState === 'waitingForPlay' || state.playState === 'turnoverPause') {
    if (Math.abs(playerObj.animSpeedX) > 0.04) {
      return playerObj.animSpeedX < 0 ? 'runLeft' : 'runRight';
    }
    return 'idle';
  }

  const sx = playerObj.animSpeedX;
  const sy = playerObj.animSpeedY;
  const speed = Math.hypot(sx, sy);

  if (speed < 0.022) return 'idle';
  if (Math.abs(sx) > 0.045 && Math.abs(sx) > Math.abs(sy) * 0.55) {
    return sx < 0 ? 'runLeft' : 'runRight';
  }
  return Math.floor(playerObj.strideTimer) % 2 === 0 ? 'straightL' : 'straightR';
}

function drawYellowSelectionCircle(ctx, x, footY, scale) {
  ctx.save();
  ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = Math.max(2, 2.5 * scale);
  ctx.beginPath();
  ctx.ellipse(x, footY, 17 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawRedCarrierCircle(ctx, x, footY, scale, timeSec = 0) {
  const pulse = 1 + Math.sin(timeSec * 10) * 0.08;
  ctx.save();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.30)';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = Math.max(2.5, 3 * scale);
  ctx.beginPath();
  ctx.ellipse(x, footY, 18 * scale * pulse, 7.5 * scale * pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(254, 202, 202, 0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x, footY, 12 * scale * pulse, 4.8 * scale * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPixelPlayer(ctx, state, x, y, team, noteLetter, playerObj, opts = {}, timeSec = 0) {
  const {
    pixelScale = 1.5,
    hasBall = false,
    showYellowRing = false,
    showRedRing = false,
    isOverrun = false,
    facing = 'back'
  } = opts;

  const pose = selectSpritePose(state, playerObj);
  const isDive = pose === 'diveBack' || pose === 'diveFront';
  const sprite = getPixelSprite(team, noteLetter, pose, hasBall, facing);

  const scaleMult = isDive ? 1.28 : 1.0;
  const drawW = Math.max(20, Math.round(sprite.width * pixelScale * scaleMult));
  const drawH = Math.max(28, Math.round(sprite.height * pixelScale * scaleMult));
  const footY = y + drawH * (isDive ? 0.34 : 0.42);

  if (showRedRing && !isDive) {
    drawRedCarrierCircle(ctx, x, footY, pixelScale * 0.82, timeSec);
  } else if (showYellowRing && !isDive) {
    drawYellowSelectionCircle(ctx, x, footY, pixelScale * 0.8);
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(x, footY, (isDive ? 18 : 11) * pixelScale * 0.75, 4.5 * pixelScale * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isOverrun && !hasBall && !isDive) {
    ctx.save();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.ellipse(x, footY, 15 * pixelScale * 0.78, 6 * pixelScale * 0.78, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, Math.round(x - drawW / 2), Math.round(y - drawH / 2), drawW, drawH);
  ctx.restore();
}

function drawNrlGoalPost(ctx, cx, lineY, visibility, isTopEnd) {
  if (visibility <= 0.02) return;

  const spanHalf = 46;
  const postHeight = 44 + visibility * 26;
  const crossbarY = isTopEnd ? lineY - postHeight * 0.44 : lineY + postHeight * 0.44;
  const topY = isTopEnd ? lineY - postHeight : lineY + postHeight;

  ctx.save();
  ctx.globalAlpha = Math.min(1, visibility * 1.15);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, lineY + (isTopEnd ? 3 : -3), spanHalf + 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  [-spanHalf, spanHalf].forEach((px) => {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(cx + px - 4, lineY - 5, 8, 10);
  });

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - spanHalf, lineY);
  ctx.lineTo(cx - spanHalf, topY);
  ctx.moveTo(cx + spanHalf, lineY);
  ctx.lineTo(cx + spanHalf, topY);
  ctx.moveTo(cx - spanHalf, crossbarY);
  ctx.lineTo(cx + spanHalf, crossbarY);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - spanHalf - 2, Math.min(lineY, topY), spanHalf * 2 + 4, Math.abs(topY - lineY));

  ctx.restore();
}

function drawTryCelebrationOverlay(ctx, state, w, h) {
  const cel = state.tryCelebration;
  const t = cel.timer;
  const progress = Math.min(1, t / cel.duration);

  const flashAlpha = Math.max(0, 0.38 - t * 0.9);
  if (flashAlpha > 0) {
    ctx.fillStyle = `rgba(239, 68, 68, ${flashAlpha})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = 'rgba(2, 6, 23, 0.42)';
  ctx.fillRect(0, 0, w, h);

  for (const p of cel.confetti) {
    ctx.save();
    ctx.translate(p.x * w, p.y * h);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size * 0.5, -p.size * 0.28, p.size, p.size * 0.56);
    ctx.restore();
  }

  let popScale = 1;
  if (t < 0.22) {
    popScale = 0.25 + (t / 0.22) * 1.08;
  } else if (t < 0.36) {
    popScale = 1.33 - ((t - 0.22) / 0.14) * 0.33;
  } else {
    popScale = 1.0 + Math.sin(t * 14) * 0.055;
  }

  const fadeOut = progress > 0.86 ? Math.max(0, (1 - progress) / 0.14) : 1;
  const fontSize = Math.round(Math.min(w * 0.24, h * 0.40));

  ctx.save();
  ctx.globalAlpha = fadeOut;
  ctx.translate(w * 0.5, h * 0.47);
  ctx.scale(popScale, popScale);
  ctx.rotate(-0.045);

  const barW = Math.min(w * 0.82, fontSize * 3.1);
  const barH = fontSize * 0.92;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.86)';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.rect(-barW * 0.5, -barH * 0.52, barW, barH);
  ctx.fill();
  ctx.stroke();

  ctx.font = `italic 900 ${fontSize}px "Chakra Petch", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#09090b';
  ctx.fillText('TRY!', 7, 8);

  ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.09));
  ctx.strokeStyle = '#ffffff';
  ctx.lineJoin = 'round';
  ctx.strokeText('TRY!', 0, 0);

  const redGrad = ctx.createLinearGradient(0, -fontSize * 0.45, 0, fontSize * 0.45);
  redGrad.addColorStop(0, '#ff4d4d');
  redGrad.addColorStop(0.5, '#ef4444');
  redGrad.addColorStop(1, '#991b1b');
  ctx.fillStyle = redGrad;
  ctx.fillText('TRY!', 0, 0);

  const subSize = Math.max(13, Math.round(fontSize * 0.19));
  ctx.font = `800 ${subSize}px "Chakra Petch", sans-serif`;
  ctx.fillStyle = '#fde047';
  ctx.strokeStyle = '#020617';
  ctx.lineWidth = 4;
  const subLabel =
    cel.scoringSide === 'home'
      ? `${cel.teamName.toUpperCase()} • PLAYER ${cel.scorerLabel} (+4 PTS)`
      : `${cel.teamName.toUpperCase()} SCORE (+4 PTS)`;
  ctx.strokeText(subLabel, 0, barH * 0.66);
  ctx.fillText(subLabel, 0, barH * 0.66);

  ctx.restore();
}

function drawDigitalTvBroadcastScreen(ctx, state, tvX, tvY, tvW, tvH, timeSec) {
  ctx.save();

  ctx.fillStyle = '#090d16';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.rect(tvX, tvY, tvW, tvH);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.fillRect(tvX + tvW * 0.42, tvY + tvH, tvW * 0.16, 7);

  const innerPad = 6;
  const sx = tvX + innerPad;
  const sy = tvY + innerPad;
  const sw = Math.max(40, tvW - innerPad * 2);
  const sh = Math.max(30, tvH - innerPad * 2 - 14);

  ctx.fillStyle = '#15803d';
  ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(sx + 4, sy + 3, sw - 8, sh - 6);

  const huddleCenterX = sx + sw * 0.5;
  const huddleCenterY = sy + sh * (state.conversion.isHomeKick ? 0.25 : 0.75);
  const huddleTeam = state.conversion.isHomeKick ? state.homeTeam : state.awayTeam;
  const oppTeam = state.conversion.isHomeKick ? state.awayTeam : state.homeTeam;

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + Math.sin(timeSec * 3) * 0.08;
    const hx = huddleCenterX + Math.cos(angle) * 14;
    const hy = huddleCenterY + Math.sin(angle) * 7;
    ctx.fillStyle = huddleTeam.primary;
    ctx.beginPath();
    ctx.arc(hx, hy, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = huddleTeam.secondary;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  for (let j = 0; j < 3; j++) {
    const ox = sx + sw * (0.34 + j * 0.16);
    const oy = huddleCenterY + (state.conversion.isHomeKick ? 14 : -14);
    ctx.fillStyle = oppTeam.primary;
    ctx.beginPath();
    ctx.arc(ox, oy, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(sx + 4, sy + 4, 34, 12);
  ctx.font = '800 8px "Chakra Petch", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('LIVE TV', sx + 7, sy + 13);

  const barY = sy + sh + 2;
  ctx.fillStyle = '#020617';
  ctx.fillRect(tvX + 2, barY, tvW - 4, 14);
  ctx.font = '700 8.5px "Chakra Petch", sans-serif';
  ctx.fillStyle = '#fde047';
  ctx.textAlign = 'center';
  ctx.fillText(`${huddleTeam.name.toUpperCase()} HUDDLED AFTER TRY`, tvX + tvW * 0.5, barY + 9.5);

  ctx.restore();
}

function drawConversionView(ctx, state, w, h, timeSec) {
  const conv = state.conversion;
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.52);
  skyGrad.addColorStop(0, '#07162b');
  skyGrad.addColorStop(1, '#1d4ed8');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  const horizonY = h * 0.45;
  const grassGrad = ctx.createLinearGradient(0, horizonY, 0, h);
  grassGrad.addColorStop(0, '#15803d');
  grassGrad.addColorStop(1, '#14532d');
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  const tvW = Math.min(w * 0.44, 340);
  const tvH = Math.min(h * 0.34, 155);
  const tvX = (w - tvW) * 0.5;
  const tvY = Math.max(10, horizonY - tvH - 12);
  drawDigitalTvBroadcastScreen(ctx, state, tvX, tvY, tvW, tvH, timeSec);

  const project3D = (x3, y3, z3) => {
    const depth = Math.max(6, z3 + 34);
    const fov = Math.min(w, h) * 0.95;
    const sx = w * 0.5 + (x3 * fov) / depth;
    const sy = horizonY - (y3 * fov) / depth + (135 / depth) * 16;
    const scale = fov / depth;
    return { sx, sy, scale };
  };

  const tlLeft = project3D(-16, 0, 24);
  const tlRight = project3D(16, 0, 24);
  const nearLeft = project3D(-16, 0, -24);
  const nearRight = project3D(16, 0, -24);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(nearLeft.sx, nearLeft.sy);
  ctx.lineTo(tlLeft.sx, tlLeft.sy);
  ctx.lineTo(tlRight.sx, tlRight.sy);
  ctx.lineTo(nearRight.sx, nearRight.sy);
  ctx.stroke();

  const postHalfW = 3.0;
  const crossbarH = 3.0;
  const topPostH = 11.5;

  const lBase = project3D(-postHalfW, 0, 24);
  const lTop = project3D(-postHalfW, topPostH, 24);
  const rBase = project3D(postHalfW, 0, 24);
  const rTop = project3D(postHalfW, topPostH, 24);
  const lCross = project3D(-postHalfW, crossbarH, 24);
  const rCross = project3D(postHalfW, crossbarH, 24);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(lBase.sx, lBase.sy);
  ctx.lineTo(lTop.sx, lTop.sy);
  ctx.moveTo(rBase.sx, rBase.sy);
  ctx.lineTo(rTop.sx, rTop.sy);
  ctx.moveTo(lCross.sx, lCross.sy);
  ctx.lineTo(rCross.sx, rCross.sy);
  ctx.stroke();

  const team = conv.isHomeKick ? state.homeTeam : state.awayTeam;
  const kickerProj = project3D(conv.teeX * 6, 0, -18);
  const kickerSprite = getPixelSprite(team, conv.kickerNote || 'E', 'idle', false, conv.isHomeKick ? 'back' : 'front');
  const kScale = Math.max(1.2, Math.min(2.4, kickerProj.scale * 0.085));
  const kw = Math.round(kickerSprite.width * kScale);
  const kh = Math.round(kickerSprite.height * kScale);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(kickerSprite, Math.round(kickerProj.sx - kw / 2), Math.round(kickerProj.sy - kh * 0.72), kw, kh);
  ctx.restore();

  const bProj = project3D(conv.ballX, conv.ballY, conv.ballZ);

  if (!conv.kicked) {
    const aimEndProj = project3D(conv.ballX + conv.aimOffset * 5.2, 1.2, 24);
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(bProj.sx, bProj.sy);
    ctx.lineTo(aimEndProj.sx, aimEndProj.sy);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(bProj.sx, bProj.sy);
  ctx.rotate(conv.kicked ? timeSec * 12 : 0);
  ctx.fillStyle = '#92400e';
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(4, 5.5 * kScale * 0.55), Math.max(6, 8.5 * kScale * 0.55), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const barW = Math.min(w * 0.66, 440);
  const barH = 26;
  const barX = (w - barW) * 0.5;
  const barY = h * 0.76;

  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(barX, barY, barW, barH);
  ctx.fill();
  ctx.stroke();

  const zoneW = barW * 0.22;
  const zoneX = barX + (barW - zoneW) * 0.5;
  ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
  ctx.fillRect(zoneX, barY + 2, zoneW, barH - 4);

  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX + barW * 0.5, barY);
  ctx.lineTo(barX + barW * 0.5, barY + barH);
  ctx.stroke();

  const aimSweetX = barX + ((1 - conv.aimOffset * 0.7) * 0.5) * barW;
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(aimSweetX, barY - 6);
  ctx.lineTo(aimSweetX, barY + barH + 6);
  ctx.stroke();

  const cursorNorm = (conv.sliderPos + 1) * 0.5;
  const cursorX = barX + cursorNorm * barW;
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(cursorX - 5, barY - 5, 10, barH + 10);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'italic 800 15px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fef08a';
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
  ctx.lineWidth = 3;
  const promptMsg = conv.kicked
    ? (conv.resultText || 'KICKED!')
    : conv.isHomeKick
    ? 'CONVERSION (+2) — LEFT/RIGHT AIM • ANY MIDI KEY TO KICK!'
    : `${state.awayTeam.name.toUpperCase()} CONVERTING...`;
  ctx.strokeText(promptMsg, w * 0.5, barY - 12);
  ctx.fillText(promptMsg, w * 0.5, barY - 12);
  ctx.restore();
}

function drawCoinTossScene(ctx, state, w, h, timeSec) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#07162b');
  grad.addColorStop(0.55, '#14532d');
  grad.addColorStop(1, '#091521');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const toss = state.coinToss;
  const cx = w * 0.5;
  const cy = h * 0.52;
  const bounceLift = toss.active ? Math.abs(Math.sin(toss.flipTimer * Math.PI * 3.5)) * 46 : 0;
  const spinScaleX = toss.active
    ? Math.max(0.14, Math.abs(Math.cos(timeSec * 15)))
    : 1;
  const radius = Math.min(w, h) * 0.13;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius + 12, radius * 0.85, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(cx, cy - bounceLift);
  ctx.scale(spinScaleX, 1);

  const coinGrad = ctx.createRadialGradient(-radius * 0.25, -radius * 0.25, radius * 0.1, 0, 0, radius);
  coinGrad.addColorStop(0, '#fef08a');
  coinGrad.addColorStop(0.6, '#eab308');
  coinGrad.addColorStop(1, '#854d0e');

  ctx.fillStyle = coinGrad;
  ctx.strokeStyle = '#fef9c3';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const faceLabel = toss.active
    ? (Math.floor(timeSec * 12) % 2 === 0 ? 'HEADS' : 'TAILS')
    : (toss.outcome || toss.choice).toUpperCase();

  ctx.font = `italic 900 ${Math.max(14, Math.round(radius * 0.38))}px "Chakra Petch", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#09090b';
  ctx.fillText(faceLabel, 0, 0);

  ctx.restore();
}

function draw3DKickTrajectoryAndBall(ctx, state, padX, padY, fieldW, fieldH, pixelScale, timeSec) {
  const k3 = state.kick3D;
  if (!k3.active) return;

  const awayView = isAwayPerspective(state);
  const dirSign = k3.kickingSide === 'home' ? -1 : 1;
  const p = Math.max(0.15, Math.min(1.0, k3.power));
  const curveSign = awayView ? -k3.aimCurve : k3.aimCurve;

  if (k3.aiming) {
    let distanceY = 0.42;
    let peakZ = 0.42;
    if (k3.kind === 'kickoff') {
      distanceY = 0.24 + p * 0.28;
      peakZ = 0.26 + p * 0.32;
    } else if (k3.kind === 'bomb') {
      distanceY = 0.25 + p * 0.36;
      peakZ = 0.35 + p * 0.48;
    } else if (k3.kind === 'grubber') {
      distanceY = 0.16 + p * 0.28;
      peakZ = 0.04 + p * 0.05;
    } else if (k3.kind === 'chip') {
      distanceY = 0.11 + p * 0.18;
      peakZ = 0.16 + p * 0.16;
    }

    const targetY = Math.min(0.89, Math.max(0.11, k3.startY + dirSign * distanceY));
    const curveLateral = k3.aimCurve * (0.14 + p * 0.18);
    const targetX = Math.min(0.92, Math.max(0.08, k3.startX + curveLateral));

    const steps = 22;
    const groundPts = [];
    const elevatedPts = [];

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const gx = k3.startX + (targetX - k3.startX) * t + Math.sin(t * Math.PI) * k3.aimCurve * 0.09 * p;
      const gy = k3.startY + (targetY - k3.startY) * t;
      const zLift = Math.sin(t * Math.PI) * peakZ * 120;

      const view = toViewCoords(state, gx, gy);
      const sx = padX + fieldW * Math.min(0.93, Math.max(0.07, view.vx));
      const syGround = padY + fieldH * Math.min(0.92, Math.max(0.11, view.vy));
      groundPts.push({ x: sx, y: syGround });
      elevatedPts.push({ x: sx, y: syGround - zLift, zLift });
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    groundPts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    const arcGrad = ctx.createLinearGradient(
      elevatedPts[0].x,
      elevatedPts[0].y,
      elevatedPts[steps].x,
      elevatedPts[steps].y
    );
    arcGrad.addColorStop(0, '#22c55e');
    arcGrad.addColorStop(0.5, '#facc15');
    arcGrad.addColorStop(1, '#38bdf8');

    ctx.strokeStyle = arcGrad;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    elevatedPts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    const tip = elevatedPts[steps];
    const prev = elevatedPts[Math.max(0, steps - 2)];
    const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
    const headLen = 12;

    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - headLen * Math.cos(angle - Math.PI / 6), tip.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tip.x - headLen * Math.cos(angle + Math.PI / 6), tip.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    return;
  }

  const ballView = toViewCoords(state, k3.x, k3.y);
  const gx = padX + fieldW * ballView.vx;
  const gyGround = padY + fieldH * ballView.vy;
  const zPx = k3.z * 120;
  const ballScale = 1 + k3.z * 0.55;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.ellipse(gx, gyGround, 6 * pixelScale * 0.75, 3 * pixelScale * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(gx, gyGround - zPx);
  ctx.scale(ballScale, ballScale);
  ctx.rotate(timeSec * 14 * (curveSign < 0 ? -1 : 1));
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.4 * pixelScale * 0.75, 8.5 * pixelScale * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function syncDomOverlays(containerEl, state) {
  const tossBar = containerEl.querySelector('#erc-coin-toss-bar');
  if (tossBar) {
    tossBar.style.display = state.phase === 'coinToss' ? 'flex' : 'none';
  }

  const kickHud = containerEl.querySelector('#erc-kick3d-hud');
  if (kickHud) {
    const mySide = state.multiplayer?.role === 'away' ? 'away' : 'home';
    const showKickHud = state.phase === 'playing' && state.kick3D.active && state.kick3D.aiming && state.kick3D.kickingSide === mySide;
    kickHud.style.display = showKickHud ? 'flex' : 'none';
    if (showKickHud) {
      const pct = Math.round(Math.max(0, Math.min(1, state.kick3D.power)) * 100);
      const fillEl = containerEl.querySelector('#erc-kick3d-power-fill');
      const pctEl = containerEl.querySelector('#erc-kick3d-power-pct');
      const curveEl = containerEl.querySelector('#erc-kick3d-curve-label');
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (curveEl) {
        const cVal = state.kick3D.aimCurve;
        if (Math.abs(cVal) < 0.08) curveEl.textContent = 'CURVE: CENTER';
        else if (cVal < 0) curveEl.textContent = `CURVE: LEFT ${Math.round(Math.abs(cVal) * 100)}%`;
        else curveEl.textContent = `CURVE: RIGHT ${Math.round(cVal * 100)}%`;
      }
    }
  }
}

export function renderRugbyCanvas(canvas, containerEl, state, timeSec) {
  if (!canvas || !containerEl) return;
  syncDomOverlays(containerEl, state);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const targetW = Math.max(1, Math.floor(rect.width * dpr));
  const targetH = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  if (state.screenShake.timer > 0 && state.screenShake.duration > 0) {
    const falloff = state.screenShake.timer / state.screenShake.duration;
    const mag = state.screenShake.intensity * falloff;
    ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
  }

  const w = Math.max(200, rect.width);
  const h = Math.max(160, rect.height);

  if (state.phase === 'coinToss') {
    drawCoinTossScene(ctx, state, w, h, timeSec);
    for (const c of state.callouts) {
      const v = toViewCoords(state, c.x, c.y);
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.life);
      ctx.font = 'italic 700 14px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = c.color;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
      ctx.lineWidth = 3;
      ctx.strokeText(c.text, w * v.vx, h * v.vy);
      ctx.fillText(c.text, w * v.vx, h * v.vy);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  if (state.playState === 'conversionKick' && state.conversion.active) {
    drawConversionView(ctx, state, w, h, timeSec);
    ctx.restore();
    return;
  }

  const awayView = isAwayPerspective(state);

  ctx.fillStyle = '#091521';
  ctx.fillRect(0, 0, w, h);

  const padX = Math.max(20, w * 0.08);
  const padY = Math.max(14, h * 0.03);
  const fieldW = Math.max(100, w - padX * 2);
  const fieldH = Math.max(100, h - padY * 2);

  const stripes = 10;
  const stripeH = fieldH / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#166534';
    ctx.fillRect(padX, padY + i * stripeH, fieldW, stripeH + 1);
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(padX, padY, fieldW, fieldH);

  const topTryFrac = 0.12;
  const botTryFrac = 0.88;
  const lineFracY = [topTryFrac, 0.3, 0.5, 0.7, botTryFrac];
  ctx.lineWidth = 1.5;
  for (const fy of lineFracY) {
    const ly = padY + fieldH * fy;
    ctx.strokeStyle = fy === topTryFrac || fy === botTryFrac ? 'rgba(255,255,255,0.78)' : 'rgba(255, 255, 255, 0.30)';
    ctx.beginPath();
    ctx.moveTo(padX, ly);
    ctx.lineTo(padX + fieldW, ly);
    ctx.stroke();
  }

  const allPlayers = [...state.homePlayers, ...state.awayPlayers];
  let closestTopDist = Infinity;
  let closestBotDist = Infinity;
  for (const p of allPlayers) {
    const v = toViewCoords(state, p.x, p.y);
    closestTopDist = Math.min(closestTopDist, Math.abs(v.vy - topTryFrac));
    closestBotDist = Math.min(closestBotDist, Math.abs(botTryFrac - v.vy));
  }
  const topPostVis = Math.max(0, Math.min(1, 1 - (closestTopDist - 0.04) / 0.24));
  const botPostVis = Math.max(0, Math.min(1, 1 - (closestBotDist - 0.04) / 0.24));

  const postCenterX = padX + fieldW * 0.5;
  drawNrlGoalPost(ctx, postCenterX, padY + fieldH * topTryFrac, topPostVis, true);
  drawNrlGoalPost(ctx, postCenterX, padY + fieldH * botTryFrac, botPostVis, false);

  if (state.playState === 'retreating' || state.playState === 'waitingForPlay') {
    const onsideView = toViewCoords(state, 0.5, state.tacklePause.onsideY);
    const onsideLineY = padY + fieldH * onsideView.vy;
    ctx.save();
    ctx.strokeStyle = state.playState === 'retreating' ? 'rgba(251, 191, 36, 0.88)' : 'rgba(74, 222, 128, 0.82)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(padX, onsideLineY);
    ctx.lineTo(padX + fieldW, onsideLineY);
    ctx.stroke();
    ctx.restore();
  }

  const activeSide = awayView ? 'away' : 'home';
  const activeRoster = awayView ? state.awayPlayers : state.homePlayers;
  if (state.possession === activeSide && activeRoster[state.carrierIndex] && !state.kickBall.active && !state.kick3D.active && state.playState !== 'tryCelebration') {
    const c = activeRoster[state.carrierIndex];
    const cv = toViewCoords(state, c.x, c.y);
    const planeY = padY + fieldH * cv.vy;
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.20)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(padX, planeY);
    ctx.lineTo(padX + fieldW, planeY);
    ctx.stroke();
    ctx.restore();
  }

  ctx.font = '700 11px "Chakra Petch", sans-serif';
  const activeRingIdx = state.possession === activeSide ? state.carrierIndex : state.selectedDefenderIdx;
  LANES.forEach((fx, idx) => {
    const viewLaneX = awayView ? (1 - fx) : fx;
    const lx = padX + fieldW * viewLaneX;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(lx, padY + fieldH * 0.12);
    ctx.lineTo(lx, padY + fieldH * 0.88);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = idx === activeRingIdx ? '#fde047' : 'rgba(255, 255, 255, 0.48)';
    ctx.fillText(LANE_NOTES[idx], lx - 4, padY + fieldH * 0.95);
  });

  const pixelScale = Math.max(1.2, Math.min(1.65, h / 285));
  const ballInFlight = state.passState.active || state.kickBall.active || state.kick3D.active;

  const renderList = [];
  for (let i = 0; i < state.awayPlayers.length; i++) {
    const ap = state.awayPlayers[i];
    const v = toViewCoords(state, ap.x, ap.y);
    const awayHasBall = state.possession === 'away' && i === state.carrierIndex && !ballInFlight && !(state.kick3D.active && state.kick3D.kickingSide === 'away');
    const showYellowAway = awayView && ((state.possession === 'away' && i === state.carrierIndex && !state.kickBall.active && !state.kick3D.active) || (state.possession === 'home' && i === state.selectedDefenderIdx));
    renderList.push({
      side: 'away',
      facing: awayView ? 'back' : 'front',
      idx: i,
      p: ap,
      vx: v.vx,
      vy: v.vy,
      team: state.awayTeam,
      hasBall: awayHasBall,
      showYellowRing: showYellowAway,
      showRedRing: !awayView && awayHasBall && state.playState !== 'tryCelebration',
      isOverrun: awayView && state.possession === 'away' && ap.overrun && !state.kickBall.active && !state.kick3D.active
    });
  }
  for (let i = 0; i < state.homePlayers.length; i++) {
    const hp = state.homePlayers[i];
    const v = toViewCoords(state, hp.x, hp.y);
    const homeHasBall = state.possession === 'home' && i === state.carrierIndex && !ballInFlight && !(state.kick3D.active && state.kick3D.kickingSide === 'home');
    const showYellowHome = !awayView && ((state.possession === 'home' && i === state.carrierIndex && !state.kickBall.active && !state.kick3D.active) || (state.possession === 'away' && i === state.selectedDefenderIdx));

    renderList.push({
      side: 'home',
      facing: awayView ? 'front' : 'back',
      idx: i,
      p: hp,
      vx: v.vx,
      vy: v.vy,
      team: state.homeTeam,
      hasBall: homeHasBall,
      showYellowRing: showYellowHome,
      showRedRing: awayView && homeHasBall && state.playState !== 'tryCelebration',
      isOverrun: !awayView && state.possession === 'home' && hp.overrun && !state.kickBall.active && !state.kick3D.active
    });
  }

  renderList.sort((a, b) => a.vy - b.vy);

  const minScreenY = padY + fieldH * 0.12;
  const maxScreenY = padY + fieldH * 0.92;

  for (const item of renderList) {
    const px = padX + fieldW * item.vx;
    const py = Math.min(maxScreenY, Math.max(minScreenY, padY + fieldH * item.vy));
    drawPixelPlayer(
      ctx,
      state,
      px,
      py,
      item.team,
      LANE_NOTES[item.idx],
      item.p,
      {
        pixelScale,
        hasBall: item.hasBall,
        showYellowRing: item.showYellowRing,
        showRedRing: item.showRedRing,
        isOverrun: item.isOverrun,
        facing: item.facing
      },
      timeSec
    );

    if (item.isOverrun) {
      ctx.save();
      ctx.font = '700 9px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fcd34d';
      ctx.fillText('FLAT!', px, py - 22 * pixelScale);
      ctx.restore();
    }
  }

  draw3DKickTrajectoryAndBall(ctx, state, padX, padY, fieldW, fieldH, pixelScale, timeSec);

  if (state.passState.active || state.kickBall.active) {
    let bx = padX + fieldW * 0.5;
    let by = padY + fieldH * 0.5;
    if (state.passState.active) {
      const pv = toViewCoords(state, state.passState.x, state.passState.y);
      const arcLift = Math.sin(state.passState.progress * Math.PI) * 14 * pixelScale;
      bx = padX + fieldW * pv.vx;
      by = padY + fieldH * pv.vy - 6 * pixelScale - arcLift;
    } else {
      const kv = toViewCoords(state, state.kickBall.x, state.kickBall.y);
      bx = padX + fieldW * kv.vx;
      by = padY + fieldH * kv.vy - state.kickBall.z * 95;
    }

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(timeSec * 10);
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.2 * pixelScale * 0.75, 8.2 * pixelScale * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-4 * pixelScale * 0.75, 0);
    ctx.lineTo(4 * pixelScale * 0.75, 0);
    ctx.stroke();
    ctx.restore();
  }

  for (const c of state.callouts) {
    const cv = toViewCoords(state, c.x, c.y);
    ctx.save();
    ctx.globalAlpha = Math.max(0, c.life);
    ctx.font = 'italic 700 14px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = c.color;
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
    ctx.lineWidth = 3;
    const cx = padX + fieldW * cv.vx;
    const cy = padY + fieldH * cv.vy;
    ctx.strokeText(c.text, cx, cy);
    ctx.fillText(c.text, cx, cy);
    ctx.restore();
  }

  if (state.playState === 'tryCelebration' && state.tryCelebration.active) {
    drawTryCelebrationOverlay(ctx, state, w, h);
  }

  ctx.restore();
}
