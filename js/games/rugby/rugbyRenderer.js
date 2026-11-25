// js/games/rugby/rugbyRenderer.js
import { LANES, LANE_NOTES, getPixelSprite } from './rugbyDataAndSprites.js';

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

function drawPixelPlayer(ctx, state, x, y, team, noteLetter, playerObj, opts = {}) {
  const { pixelScale = 1.5, hasBall = false, showYellowRing = false, isOverrun = false, facing = 'back' } = opts;
  const pose = selectSpritePose(state, playerObj);
  const isDive = pose === 'diveBack' || pose === 'diveFront';
  const sprite = getPixelSprite(team, noteLetter, pose, hasBall, facing);

  const scaleMult = isDive ? 1.28 : 1.0;
  const drawW = Math.round(sprite.width * pixelScale * scaleMult);
  const drawH = Math.round(sprite.height * pixelScale * scaleMult);
  const footY = y + drawH * (isDive ? 0.34 : 0.42);

  if (showYellowRing && !isDive) {
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
  const lCross = project3D(-postHalfW, crossbarH, 24);
  const lTop = project3D(-postHalfW, topPostH, 24);

  const rBase = project3D(postHalfW, 0, 24);
  const rCross = project3D(postHalfW, crossbarH, 24);
  const rTop = project3D(postHalfW, topPostH, 24);

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

export function renderRugbyCanvas(canvas, containerEl, state, timeSec) {
  if (!canvas || !containerEl) return;
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

  const w = rect.width;
  const h = rect.height;

  if (state.playState === 'conversionKick' && state.conversion.active) {
    drawConversionView(ctx, state, w, h, timeSec);
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#091521';
  ctx.fillRect(0, 0, w, h);

  const padX = Math.max(20, w * 0.08);
  const padY = Math.max(14, h * 0.03);
  const fieldW = w - padX * 2;
  const fieldH = h - padY * 2;

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
    closestTopDist = Math.min(closestTopDist, Math.abs(p.y - topTryFrac));
    closestBotDist = Math.min(closestBotDist, Math.abs(botTryFrac - p.y));
  }
  const topPostVis = Math.max(0, Math.min(1, 1 - (closestTopDist - 0.04) / 0.24));
  const botPostVis = Math.max(0, Math.min(1, 1 - (closestBotDist - 0.04) / 0.24));

  const postCenterX = padX + fieldW * 0.5;
  drawNrlGoalPost(ctx, postCenterX, padY + fieldH * topTryFrac, topPostVis, true);
  drawNrlGoalPost(ctx, postCenterX, padY + fieldH * botTryFrac, botPostVis, false);

  if (state.playState === 'retreating' || state.playState === 'waitingForPlay') {
    const onsideLineY = padY + fieldH * state.tacklePause.onsideY;
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

  if (state.possession === 'home' && state.homePlayers[state.carrierIndex] && !state.kickBall.active && state.playState !== 'tryCelebration') {
    const c = state.homePlayers[state.carrierIndex];
    const planeY = padY + fieldH * c.y;
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
  const activeRingIdx = state.possession === 'home' ? state.carrierIndex : state.selectedDefenderIdx;
  LANES.forEach((fx, idx) => {
    const lx = padX + fieldW * fx;
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

  const pixelScale = Math.max(1.15, Math.min(1.65, h / 285));
  const ballInFlight = state.passState.active || state.kickBall.active;

  const renderList = [];
  for (let i = 0; i < state.awayPlayers.length; i++) {
    renderList.push({
      side: 'away',
      facing: 'front',
      idx: i,
      p: state.awayPlayers[i],
      team: state.awayTeam,
      hasBall: state.possession === 'away' && i === state.carrierIndex && !ballInFlight,
      showYellowRing: false,
      isOverrun: false
    });
  }
  for (let i = 0; i < state.homePlayers.length; i++) {
    const hp = state.homePlayers[i];
    const homeHasBall = state.possession === 'home' && i === state.carrierIndex && !ballInFlight;
    const showRing =
      (state.possession === 'home' && i === state.carrierIndex && !state.kickBall.active) ||
      (state.possession === 'away' && i === state.selectedDefenderIdx);

    renderList.push({
      side: 'home',
      facing: 'back',
      idx: i,
      p: hp,
      team: state.homeTeam,
      hasBall: homeHasBall,
      showYellowRing: showRing,
      isOverrun: state.possession === 'home' && hp.overrun && !state.kickBall.active
    });
  }

  renderList.sort((a, b) => a.p.y - b.p.y);

  for (const item of renderList) {
    const px = padX + fieldW * item.p.x;
    const py = padY + fieldH * item.p.y;
    drawPixelPlayer(ctx, px, py, item.team, LANE_NOTES[item.idx], item.p, {
      pixelScale,
      hasBall: item.hasBall,
      showYellowRing: item.showYellowRing,
      isOverrun: item.isOverrun,
      facing: item.facing
    });

    if (item.isOverrun) {
      ctx.save();
      ctx.font = '700 9px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fcd34d';
      ctx.fillText('FLAT!', px, py - 22 * pixelScale);
      ctx.restore();
    }
  }

  if (state.passState.active || state.kickBall.active) {
    let bx = padX + fieldW * 0.5;
    let by = padY + fieldH * 0.5;
    if (state.passState.active) {
      const arcLift = Math.sin(state.passState.progress * Math.PI) * 14 * pixelScale;
      bx = padX + fieldW * state.passState.x;
      by = padY + fieldH * state.passState.y - 6 * pixelScale - arcLift;
    } else {
      bx = padX + fieldW * state.kickBall.x;
      by = padY + fieldH * state.kickBall.y - state.kickBall.z * 95;
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
    ctx.save();
    ctx.globalAlpha = Math.max(0, c.life);
    ctx.font = 'italic 700 14px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = c.color;
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
    ctx.lineWidth = 3;
    const cx = padX + fieldW * c.x;
    const cy = padY + fieldH * c.y;
    ctx.strokeText(c.text, cx, cy);
    ctx.fillText(c.text, cx, cy);
    ctx.restore();
  }

  if (state.playState === 'tryCelebration' && state.tryCelebration.active) {
    drawTryCelebrationOverlay(ctx, state, w, h);
  }

  ctx.restore();
}
