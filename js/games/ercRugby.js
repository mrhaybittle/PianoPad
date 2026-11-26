// js/games/ercRugby.js
import { initAudio, playTone, playErrorClackSound } from '../audio.js';
import { getNoteFrequency } from '../musicTheory.js';
import { TEAMS, WOLFHUND_FACES, PIANO_FREQS, LANES, LANE_NOTES, NOTE_TO_INDEX, getWolfhoundFaceCanvas } from './rugby/rugbyDataAndSprites.js';
import {
  ensureSportsFonts,
  playPassSound,
  playTryFanfare,
  playConversionKickSound,
  playRefWhistle,
  playKickSound,
  playTackleHitSound,
  buildRugbyMarkup
} from './rugby/rugbyAudioAndUi.js';
import { renderRugbyCanvas } from './rugby/rugbyRenderer.js';

let animFrameId = null;
let containerEl = null;
let bridgeRef = null;
let activeController = null;

export function stopErcRugby() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (activeController && activeController.cleanup) {
    activeController.cleanup();
  }
  activeController = null;
  if (containerEl) {
    containerEl.remove();
    containerEl = null;
  }
}

export function handleErcRugbyInput(noteStr, bridge) {
  if (activeController && activeController.onPianoNoteDown) {
    activeController.onPianoNoteDown(noteStr, bridge);
  }
}

export function handleErcRugbyRelease(noteStr) {
  if (activeController && activeController.onPianoNoteUp) {
    activeController.onPianoNoteUp(noteStr);
  }
}

export function startErcRugby(bridge, autoStart = false) {
  initAudio();
  ensureSportsFonts();
  stopErcRugby();
  bridgeRef = bridge;

  bridge.exitActiveMiniGame();
  document.getElementById('game-results-modal')?.classList.remove('open');
  document.getElementById('arcade-hub')?.classList.remove('open');

  bridge.setActiveMiniGame('ercRugby');
  bridge.resetGameStats();

  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = '🏉 ERC Sports Rugby Ready! Play the closest defender note (C–G) fast when they move!';
  }

  const wrapperParent = document.getElementById('visualizer-wrapper');
  containerEl = document.createElement('div');
  containerEl.id = 'erc-rugby-container';
  containerEl.style.cssText = `
    position: absolute; inset: 0; width: 100%; height: 100%; z-index: 25;
    overflow: hidden; background-color: #07131d;
    font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #f8fafc;
    user-select: none; -webkit-user-select: none;
  `;
  containerEl.innerHTML = buildRugbyMarkup();

  if (wrapperParent) {
    wrapperParent.style.position = 'relative';
    wrapperParent.appendChild(containerEl);
  } else {
    document.body.appendChild(containerEl);
  }

  const canvas = containerEl.querySelector('#erc-game-canvas');
  const hudEl = containerEl.querySelector('#erc-gameplay-hud');
  const legendEl = containerEl.querySelector('#erc-key-legend');
  const pianoStripEl = containerEl.querySelector('#erc-piano-strip');
  const startModalEl = containerEl.querySelector('#erc-start-modal');
  const teamSelectEl = containerEl.querySelector('#erc-team-select');

  const savedBinds = (() => {
    try {
      return JSON.parse(localStorage.getItem('erc_rugby_midi_binds_v3') || 'null');
    } catch (e) {
      return null;
    }
  })();

  const defaultBinds = {
    moveLeft:  { midi: 'f#1', key: 'A', label: '🎹 F#1 / A' },
    moveRight: { midi: 'g#1', key: 'D', label: '🎹 G#1 / D' },
    bomb:      { midi: 'b1',  key: 'B', label: '🎹 B1 / B' },
    grubber:   { midi: 'c2',  key: 'N', label: '🎹 C2 / N' }
  };

  const state = {
    phase: 'menu',
    possession: 'home',
    playState: 'waitingForPlay',
    tackleCount: 0,
    maxTackles: 6,
    homeTeam: TEAMS[0],
    awayTeam: TEAMS[1],
    homeScore: 0,
    awayScore: 0,
    matchTime: 120,

    pokie: {
      spinning: false, timer: 0, duration: 1.25, tickAccum: 0, index: 1, targetId: TEAMS[1].id
    },

    actionBinds: Object.assign({}, defaultBinds, savedBinds || {}),
    listeningAction: null,
    moveInput: { leftHeld: false, rightHeld: false, leftTapTimer: 0, rightTapTimer: 0 },

    homePlayers: [],
    awayPlayers: [],
    carrierIndex: 2,
    selectedDefenderIdx: 2,
    aiPlayTimer: 0,
    aiPassCooldown: 1.55,
    aiLastPassFrom: -1,
    aiWeaveDir: 1,
    aiWeaveTimer: 0.85,
    aiLastTrackedLane: 2,

    defSwitchChallenge: {
      active: false,
      targetLane: 2,
      requiredDefIdx: 2,
      timer: 0,
      windowSec: 0.68,
      failedBreak: false
    },

    passState: {
      active: false, fromIdx: 2, toIdx: 2,
      startX: 0.5, startY: 0.82, x: 0.5, y: 0.82,
      progress: 0, duration: 0.22, isForwardPass: false
    },

    kickBall: {
      active: false, kind: null, x: 0.5, y: 0.82, z: 0,
      vx: 0, vy: 0, vz: 0, bounceCount: 0, defenderFavored: true
    },

    tryCelebration: {
      active: false, timer: 0, duration: 2.0,
      scoringSide: 'home', scorerLabel: 'E', teamName: '', confetti: []
    },

    conversion: {
      active: false, isHomeKick: true, kickerNote: 'E', teeX: 0, aimOffset: 0,
      sliderPos: 0, sliderDir: 1, sliderSpeed: 3.2, kicked: false, kickTimer: 0,
      ballX: 0, ballY: 0.4, ballZ: -16, ballVx: 0, ballVy: 0, ballVz: 0, resultText: ''
    },

    callouts: [],
    tacklePause: { timer: 0, retreatDuration: 1.15, markY: 0.82, onsideY: 0.68 },
    turnoverTimer: 0,
    nextPossession: 'home',
    nextStartY: 0.82,
    screenShake: { timer: 0, duration: 0.32, intensity: 13 }
  };

  function saveActionBinds() {
    try {
      localStorage.setItem('erc_rugby_midi_binds_v3', JSON.stringify(state.actionBinds));
    } catch (e) {}
  }

  function addCallout(text, x, y, color = '#fef08a') {
    state.callouts.push({ text, x, y, color, life: 1.2 });
  }

  function getClosestDefenderIdxToCarrier() {
    const carrier = state.awayPlayers[state.carrierIndex];
    if (!carrier || state.homePlayers.length === 0) return state.selectedDefenderIdx;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < state.homePlayers.length; i++) {
      const d = Math.hypot(state.homePlayers[i].x - carrier.x, (state.homePlayers[i].y - carrier.y) * 0.75);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function getNearestLaneToX(xVal) {
    let bestLane = 2;
    let bestDiff = Infinity;
    for (let i = 0; i < LANES.length; i++) {
      const diff = Math.abs(LANES[i] - xVal);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestLane = i;
      }
    }
    return bestLane;
  }

  function armDefenderReactionWindow(carrierObj, reasonPrefix = '') {
    const laneIdx = getNearestLaneToX(carrierObj.x);
    const closestDef = getClosestDefenderIdxToCarrier();
    state.defSwitchChallenge.active = true;
    state.defSwitchChallenge.targetLane = laneIdx;
    state.defSwitchChallenge.requiredDefIdx = closestDef;
    state.defSwitchChallenge.timer = 0;
    state.defSwitchChallenge.windowSec = laneIdx === 0 || laneIdx === 4 ? 0.62 : 0.74;
    state.defSwitchChallenge.failedBreak = false;
    state.aiLastTrackedLane = laneIdx;

    if (reasonPrefix) {
      addCallout(
        `${reasonPrefix} PRESS ${LANE_NOTES[closestDef]} FAST!`,
        carrierObj.x,
        Math.min(0.82, Math.max(0.16, carrierObj.y - 0.03)),
        '#fde047'
      );
    }
  }

  function initTeamSelectors() {
    teamSelectEl.innerHTML = '';
    TEAMS.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      teamSelectEl.appendChild(opt);
    });
    teamSelectEl.value = state.homeTeam.id;
    updatePlayerTeamPreview();
  }

  function updatePlayerTeamPreview() {
    if (!containerEl) return;
    const team = state.homeTeam;
    containerEl.querySelector('#erc-player-swatch').style.background =
      `linear-gradient(135deg, ${team.primary} 55%, ${team.secondary} 55%)`;
    containerEl.querySelector('#erc-player-title').textContent = team.name;
    containerEl.querySelector('#erc-player-chant').textContent = team.chant;
    containerEl.querySelector('#erc-matchup-summary').textContent =
      `${team.name} vs ${state.awayTeam.name} • Jerseys: C D E F G`;

    const squadEl = containerEl.querySelector('#erc-wolfhound-squad');
    const facesRowEl = containerEl.querySelector('#erc-wolfhound-faces');
    if (squadEl && facesRowEl) {
      if (team.isWolfHounds) {
        squadEl.style.display = 'block';
        facesRowEl.innerHTML = '';
        LANE_NOTES.forEach((note) => {
          const meta = WOLFHUND_FACES[note] || { title: note };
          const card = document.createElement('div');
          card.className = 'wolfhound-face-card';

          const faceCanvas = getWolfhoundFaceCanvas(note, team);
          const displayCanvas = document.createElement('canvas');
          displayCanvas.width = faceCanvas.width;
          displayCanvas.height = faceCanvas.height;
          const dctx = displayCanvas.getContext('2d');
          dctx.imageSmoothingEnabled = false;
          dctx.drawImage(faceCanvas, 0, 0);

          const noteTag = document.createElement('span');
          noteTag.className = 'font-sports';
          noteTag.style.cssText = 'font-size:9.5px; font-weight:800; color:#fde047; line-height:1;';
          noteTag.textContent = `${note} • ${meta.title.split(' ')[0]}`;

          card.appendChild(displayCanvas);
          card.appendChild(noteTag);
          facesRowEl.appendChild(card);
        });
      } else {
        squadEl.style.display = 'none';
      }
    }
  }

  function startPokieSpin() {
    if (!containerEl) return;
    const candidates = TEAMS.filter((t) => t.id !== state.homeTeam.id);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || TEAMS[1];
    state.pokie.spinning = true;
    state.pokie.timer = 0;
    state.pokie.duration = 1.2;
    state.pokie.tickAccum = 0;
    state.pokie.targetId = chosen.id;
    const badge = containerEl.querySelector('#erc-reel-badge');
    badge.textContent = 'SPINNING';
    badge.style.background = '#fbbf24';
    badge.style.color = '#020617';
  }

  function stepPokieReel(dt) {
    if (!state.pokie.spinning || !containerEl) return;
    state.pokie.timer += dt;
    state.pokie.tickAccum += dt;
    const progress = Math.min(1, state.pokie.timer / state.pokie.duration);
    const interval = 0.05 + progress * 0.15;

    if (state.pokie.tickAccum >= interval) {
      state.pokie.tickAccum = 0;
      state.pokie.index = (state.pokie.index + 1) % TEAMS.length;
      const shown = TEAMS[state.pokie.index];
      containerEl.querySelector('#erc-pokie-name').textContent = shown.name;
      containerEl.querySelector('#erc-pokie-sub').textContent = shown.chant;
    }

    if (progress >= 1) {
      state.pokie.spinning = false;
      const landed = TEAMS.find((t) => t.id === state.pokie.targetId) || TEAMS[1];
      state.awayTeam = landed;
      containerEl.querySelector('#erc-pokie-name').textContent = landed.name;
      containerEl.querySelector('#erc-pokie-sub').textContent = landed.chant;
      const badge = containerEl.querySelector('#erc-reel-badge');
      badge.textContent = 'LOCKED';
      badge.style.background = 'rgba(16, 185, 129, 0.2)';
      badge.style.color = '#a7f3d0';
      updatePlayerTeamPreview();
      syncHudAndLegend();
    }
  }

  function refreshKeybindButtons() {
    if (!containerEl) return;
    containerEl.querySelectorAll('.erc-key-btn').forEach((btn) => {
      const action = btn.getAttribute('data-bind-action');
      const bind = state.actionBinds[action];
      const listening = state.listeningAction === action;
      btn.textContent = listening ? 'PLAY MIDI / KEY...' : bind.label;
      btn.classList.toggle('listening', listening);
    });
    syncHudAndLegend();
  }

  function syncHudAndLegend() {
    if (!containerEl) return;
    containerEl.querySelector('#erc-hud-home-name').textContent = state.homeTeam.name;
    containerEl.querySelector('#erc-hud-away-name').textContent = state.awayTeam.name;
    containerEl.querySelector('#erc-hud-home-score').textContent = String(state.homeScore);
    containerEl.querySelector('#erc-hud-away-score').textContent = String(state.awayScore);

    const posEl = containerEl.querySelector('#erc-hud-possession');
    posEl.textContent =
      state.possession === 'home'
        ? `ATTACK • T ${state.tackleCount}/${state.maxTackles - 1}`
        : `DEFENSE • T ${state.tackleCount}/${state.maxTackles - 1}`;
    posEl.style.color = state.possession === 'home' ? '#fde047' : '#fda4af';

    const mins = Math.floor(Math.max(0, state.matchTime) / 60);
    const secs = Math.floor(Math.max(0, state.matchTime) % 60);
    containerEl.querySelector('#erc-hud-clock').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    containerEl.querySelector('#erc-leg-left').textContent = state.actionBinds.moveLeft.label;
    containerEl.querySelector('#erc-leg-right').textContent = state.actionBinds.moveRight.label;
    containerEl.querySelector('#erc-leg-bomb').textContent = state.actionBinds.bomb.label;
    containerEl.querySelector('#erc-leg-grubber').textContent = state.actionBinds.grubber.label;
  }

  function startConversionKick(isHomeKick, scorerNote = 'E', scorerLaneX = 0.5) {
    state.playState = 'conversionKick';
    state.conversion.active = true;
    state.conversion.isHomeKick = isHomeKick;
    state.conversion.kickerNote = scorerNote || 'E';
    state.conversion.teeX = (scorerLaneX - 0.5) * 1.4;
    state.conversion.aimOffset = 0;
    state.conversion.sliderPos = -0.9;
    state.conversion.sliderDir = 1;
    state.conversion.sliderSpeed = isHomeKick ? 3.2 : 2.8;
    state.conversion.kicked = false;
    state.conversion.kickTimer = 0;
    state.conversion.ballX = state.conversion.teeX * 4;
    state.conversion.ballY = 0.4;
    state.conversion.ballZ = -16;
    state.conversion.ballVx = 0;
    state.conversion.ballVy = 0;
    state.conversion.ballVz = 0;
    state.conversion.resultText = '';
  }

  function submitConversionStrike() {
    const conv = state.conversion;
    if (!conv.active || conv.kicked) return;
    conv.kicked = true;
    conv.kickTimer = 0;

    const effectiveAim = conv.sliderPos * 0.75 + conv.aimOffset * 1.35;
    const targetPostX = conv.ballX + effectiveAim * 4.4;
    const onTarget = Math.abs(targetPostX) <= 2.65;

    playConversionKickSound(onTarget);

    if (onTarget) {
      if (conv.isHomeKick) {
        state.homeScore += 2;
        if (bridgeRef && bridgeRef.getState().gameStats) {
          bridgeRef.getState().gameStats.perfect += 2;
        }
      } else {
        state.awayScore += 2;
      }
      conv.resultText = 'CONVERSION GOAL! +2 PTS!';
      conv.ballVx = (targetPostX - conv.ballX) * 0.95;
      conv.ballVy = 6.2;
      conv.ballVz = 38;
      syncHudAndLegend();
    } else {
      conv.resultText = targetPostX < 0 ? 'WIDE LEFT! NO GOAL' : 'WIDE RIGHT! NO GOAL';
      conv.ballVx = (targetPostX - conv.ballX) * 0.95;
      conv.ballVy = 3.5;
      conv.ballVz = 24;
    }
  }

  function triggerTryCelebration(scoringSide, scorerLabel = '', scorerIdx = 2) {
    const team = scoringSide === 'home' ? state.homeTeam : state.awayTeam;
    const roster = scoringSide === 'home' ? state.homePlayers : state.awayPlayers;
    roster.forEach((p, idx) => { p.isScorer = idx === scorerIdx; });

    state.playState = 'tryCelebration';
    state.passState.active = false;
    state.kickBall.active = false;
    state.defSwitchChallenge.active = false;

    state.tryCelebration.active = true;
    state.tryCelebration.timer = 0;
    state.tryCelebration.duration = 2.0;
    state.tryCelebration.scoringSide = scoringSide;
    state.tryCelebration.scorerLabel = scorerLabel;
    state.tryCelebration.teamName = team.name;

    const colors = ['#ef4444', '#ffffff', '#facc15', team.primary, team.secondary, '#38bdf8'];
    state.tryCelebration.confetti = Array.from({ length: 95 }, (_, i) => ({
      x: Math.random(), y: -0.05 - Math.random() * 0.35,
      vx: (Math.random() - 0.5) * 0.35, vy: 0.28 + Math.random() * 0.42,
      size: 5 + Math.random() * 7, rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 10, color: colors[i % colors.length]
    }));

    state.screenShake.timer = 0.38;
    state.screenShake.intensity = 16;
    playTryFanfare(scoringSide === 'home');
    syncHudAndLegend();
  }

  function rollSupportAlignment(playerObj, idx, carrierIdx, allowOverrun = true) {
    if (idx === carrierIdx) {
      playerObj.overrun = false; playerObj.depthJitter = 0; playerObj.lateralJitter = 0;
      return;
    }
    const dist = Math.abs(idx - carrierIdx);
    const willOverrun = allowOverrun && Math.random() < 0.10;
    playerObj.overrun = willOverrun;
    playerObj.overrunLead = willOverrun ? 0.028 + Math.random() * 0.022 : 0;
    playerObj.depthJitter = (Math.random() - 0.35) * 0.016 * dist;
    playerObj.lateralJitter = (Math.random() - 0.5) * 0.018;
    playerObj.nextRollTimer = 1.6 + Math.random() * 1.8;
  }

  function getDesiredSupportPos(playerObj, idx, carrier, attackDir) {
    if (idx === state.carrierIndex) return { x: playerObj.x, y: playerObj.y };
    const laneSteps = Math.abs(idx - state.carrierIndex);
    const echelonDepth = laneSteps * 0.046 + playerObj.depthJitter;
    const desiredX = Math.min(0.91, Math.max(0.09, LANES[idx] + playerObj.lateralJitter));

    let desiredY = playerObj.overrun
      ? carrier.y + attackDir * playerObj.overrunLead
      : carrier.y - attackDir * Math.max(0.025, echelonDepth);
    desiredY = Math.min(0.93, Math.max(0.13, desiredY));
    return { x: desiredX, y: desiredY };
  }

  function makePlayerEntity(i, x, y) {
    return {
      laneIndex: i, baseX: LANES[i], x, y, prevX: x, prevY: y,
      vx: 0, vy: 0, animSpeedX: 0, animSpeedY: 0,
      strideTimer: i * 0.18, overrun: false, overrunLead: 0,
      depthJitter: 0, lateralJitter: 0, nextRollTimer: 1.6 + Math.random() * 1.5,
      role: 'line', isScorer: false, missedTackleTimer: 0, pursuitTimer: 0
    };
  }

  function setupSetOfSix(possession, startY, carrierIdx = 2) {
    state.possession = possession;
    state.carrierIndex = carrierIdx;
    state.selectedDefenderIdx = carrierIdx;
    state.tackleCount = 0;
    state.passState.active = false;
    state.kickBall.active = false;
    state.kickBall.z = 0;
    state.tryCelebration.active = false;
    state.conversion.active = false;
    state.defSwitchChallenge.active = false;
    state.defSwitchChallenge.failedBreak = false;
    state.aiWeaveDir = Math.random() < 0.5 ? -1 : 1;
    state.aiWeaveTimer = 0.8 + Math.random() * 0.6;
    state.aiLastTrackedLane = carrierIdx;
    state.playState = 'waitingForPlay';
    state.aiPlayTimer = 0.70;
    state.aiPassCooldown = 1.55 + Math.random() * 0.85;
    state.aiLastPassFrom = -1;

    const attackDir = possession === 'home' ? -1 : 1;
    const onsideY = Math.min(0.86, Math.max(0.14, startY + attackDir * 0.145));
    state.tacklePause.markY = startY;
    state.tacklePause.onsideY = onsideY;

    state.homePlayers = [];
    state.awayPlayers = [];

    for (let i = 0; i < 5; i++) {
      if (possession === 'home') {
        const hp = makePlayerEntity(i, LANES[i], startY);
        rollSupportAlignment(hp, i, carrierIdx, false);
        state.homePlayers.push(hp);
        state.awayPlayers.push(makePlayerEntity(i, LANES[i], onsideY));
      } else {
        const ap = makePlayerEntity(i, LANES[i], startY);
        rollSupportAlignment(ap, i, carrierIdx, false);
        state.awayPlayers.push(ap);
        state.homePlayers.push(makePlayerEntity(i, LANES[i], onsideY));
      }
    }

    const attackers = possession === 'home' ? state.homePlayers : state.awayPlayers;
    const carrier = attackers[carrierIdx];
    for (let i = 0; i < 5; i++) {
      if (i !== carrierIdx) {
        const pos = getDesiredSupportPos(attackers[i], i, carrier, attackDir);
        attackers[i].x = pos.x; attackers[i].y = pos.y;
        attackers[i].prevX = pos.x; attackers[i].prevY = pos.y;
      }
    }
    syncHudAndLegend();
  }

  function assignAiDefenderChasers() {
    const defenders = state.possession === 'home' ? state.awayPlayers : state.homePlayers;
    const chaserA = Math.floor(Math.random() * 5);
    const chaserB = (chaserA + 2) % 5;
    defenders.forEach((d, idx) => { d.role = idx === chaserA || idx === chaserB ? 'chaser' : 'line'; });
  }

  function tryTriggerAiPass(forceDummyHalfPass = false) {
    if (state.possession !== 'away' || state.passState.active || state.kickBall.active) return false;
    const fromIdx = state.carrierIndex;
    const passer = state.awayPlayers[fromIdx];

    const candidates = [0, 1, 2, 3, 4].filter((idx) => {
      if (idx === fromIdx) return false;
      const laneDist = Math.abs(idx - fromIdx);
      if (laneDist > 2) return false;
      if (!forceDummyHalfPass && idx === state.aiLastPassFrom && Math.random() < 0.8) return false;
      return state.awayPlayers[idx].y <= passer.y + 0.004;
    });

    if (candidates.length === 0) return false;

    let bestIdx = candidates[0];
    let bestScore = -Infinity;
    for (const idx of candidates) {
      const rec = state.awayPlayers[idx];
      let minDefDist = Infinity;
      for (const def of state.homePlayers) {
        const d = Math.hypot(def.x - rec.x, (def.y - rec.y) * 1.15);
        if (d < minDefDist) minDefDist = d;
      }
      const score = minDefDist - (Math.abs(idx - fromIdx) === 2 ? 0.025 : 0) + (Math.random() - 0.5) * 0.04;
      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    }

    const receiver = state.awayPlayers[bestIdx];
    const laneDist = Math.abs(bestIdx - fromIdx);

    playPassSound();
    state.aiLastPassFrom = fromIdx;
    state.passState.active = true;
    state.passState.fromIdx = fromIdx;
    state.passState.toIdx = bestIdx;
    state.passState.startX = passer.x; state.passState.startY = passer.y;
    state.passState.x = passer.x; state.passState.y = passer.y;
    state.passState.progress = 0;
    state.passState.duration = 0.16 + laneDist * 0.06;
    state.passState.isForwardPass = false;

    addCallout(
      `PASS ${LANE_NOTES[fromIdx]} → ${LANE_NOTES[bestIdx]}!`,
      (passer.x + receiver.x) * 0.5,
      Math.max(0.16, Math.min(passer.y, receiver.y) - 0.025),
      '#fda4af'
    );
    return true;
  }

  function triggerHandover(reasonText, nextPossession, nextStartY, color = '#fb7185', whistleStyle = 'long') {
    playRefWhistle(whistleStyle);
    state.passState.active = false;
    state.kickBall.active = false;
    state.defSwitchChallenge.active = false;
    state.playState = 'turnoverPause';
    state.turnoverTimer = 1.25;
    state.nextPossession = nextPossession;
    state.nextStartY = nextStartY;

    const attackers = state.possession === 'home' ? state.homePlayers : state.awayPlayers;
    const c = attackers[state.carrierIndex] || { x: 0.5, y: 0.5 };
    addCallout(reasonText, c.x, Math.min(0.82, Math.max(0.18, c.y)), color);
    syncHudAndLegend();
  }

  function beginTackleAndRetreat() {
    const attackers = state.possession === 'home' ? state.homePlayers : state.awayPlayers;
    const carrier = attackers[state.carrierIndex];

    state.tackleCount += 1;
    state.defSwitchChallenge.active = false;
    state.defSwitchChallenge.failedBreak = false;
    carrier.vy = 0; carrier.vx = 0;

    state.screenShake.timer = state.screenShake.duration;
    state.screenShake.intensity = 14;
    playTackleHitSound();
    playRefWhistle('short');

    const attackDir = state.possession === 'home' ? -1 : 1;

    if (state.tackleCount >= state.maxTackles) {
      const nextPos = state.possession === 'home' ? 'away' : 'home';
      const clampedY = Math.min(0.78, Math.max(0.22, carrier.y));
      triggerHandover(
        nextPos === 'away' ? '6TH TACKLE HANDOVER! DEFEND NOW!' : 'TURNOVER WON! YOUR BALL!',
        nextPos, clampedY, nextPos === 'away' ? '#fb7185' : '#4ade80', 'long'
      );
      return;
    }

    state.playState = 'retreating';
    state.tacklePause.timer = 0;
    state.tacklePause.markY = carrier.y;
    state.tacklePause.onsideY = Math.min(0.87, Math.max(0.13, carrier.y + attackDir * 0.14));

    attackers.forEach((att, idx) => rollSupportAlignment(att, idx, state.carrierIndex, state.possession === 'home'));
    syncHudAndLegend();
    addCallout(
      `TACKLE ${state.tackleCount}! ALL 5 DEFENDERS BACK 10m`,
      carrier.x, Math.min(0.85, Math.max(0.16, carrier.y - 0.04)), '#fde047'
    );
  }

  function releasePlayTheBall() {
    if (
      state.playState === 'retreating' ||
      state.playState === 'turnoverPause' ||
      state.playState === 'tryCelebration' ||
      state.playState === 'conversionKick'
    ) {
      return false;
    }
    if (state.playState === 'waitingForPlay') {
      state.playState = 'running';
      assignAiDefenderChasers();
      if (state.possession === 'away' && state.awayPlayers[state.carrierIndex]) {
        armDefenderReactionWindow(state.awayPlayers[state.carrierIndex], 'PLAY ON!');
      }
    }
    return true;
  }

  function handleNoteCDEFG(targetIdx) {
    if (state.phase !== 'playing') return;
    if (state.playState === 'conversionKick') { submitConversionStrike(); return; }
    if (state.playState === 'tryCelebration') return;

    if (state.possession === 'away') {
      state.selectedDefenderIdx = targetIdx;
      const def = state.homePlayers[targetIdx];
      if (def) {
        const closestDef = getClosestDefenderIdxToCarrier();
        if (targetIdx === closestDef || !state.defSwitchChallenge.active) {
          state.defSwitchChallenge.active = false;
          def.pursuitTimer = 0.85;
          addCallout(`${LANE_NOTES[targetIdx]} CHARGES AT BALL!`, def.x, def.y + 0.05, '#4ade80');
        } else {
          addCallout(`CLOSEST IS ${LANE_NOTES[closestDef]}!`, def.x, def.y + 0.05, '#fde047');
        }
      }
      return;
    }

    if (state.playState === 'retreating' || state.playState === 'turnoverPause') {
      const c = state.homePlayers[state.carrierIndex];
      addCallout('WAIT FOR DEFENSE TO GET ONSIDE!', c.x, c.y - 0.04, '#fcd34d');
      return;
    }
    if (state.passState.active || state.kickBall.active) return;

    const fromIdx = state.carrierIndex;
    const passer = state.homePlayers[fromIdx];

    if (targetIdx === fromIdx) {
      releasePlayTheBall();
      passer.vy = -0.22;
      addCallout(`${LANE_NOTES[targetIdx]} SCOOTS!`, passer.x, passer.y - 0.04, '#bae6fd');
      return;
    }

    const receiver = state.homePlayers[targetIdx];
    releasePlayTheBall();
    playPassSound();

    const thrownForward = receiver.y < passer.y - 0.006;
    const laneDist = Math.abs(targetIdx - fromIdx);

    state.passState.active = true;
    state.passState.fromIdx = fromIdx;
    state.passState.toIdx = targetIdx;
    state.passState.startX = passer.x; state.passState.startY = passer.y;
    state.passState.x = passer.x; state.passState.y = passer.y;
    state.passState.progress = 0;
    state.passState.duration = 0.14 + laneDist * 0.05;
    state.passState.isForwardPass = thrownForward;
  }

  function launchKick(kind) {
    if (state.phase !== 'playing' || state.possession !== 'home') return;
    if (state.playState === 'conversionKick') { submitConversionStrike(); return; }
    if (state.playState === 'tryCelebration' || state.kickBall.active || state.passState.active) return;
    if (!releasePlayTheBall()) return;

    const kicker = state.homePlayers[state.carrierIndex];
    playKickSound(kind);

    state.kickBall.active = true;
    state.kickBall.kind = kind;
    state.kickBall.x = kicker.x; state.kickBall.y = kicker.y - 0.03;
    state.kickBall.bounceCount = 0;
    state.kickBall.defenderFavored = Math.random() < 0.78;

    state.homePlayers.forEach((att, idx) => { att.offsideOnKick = idx !== state.carrierIndex && att.y < kicker.y; });

    if (kind === 'bomb') {
      state.kickBall.vy = -0.31; state.kickBall.vx = (Math.random() - 0.5) * 0.10;
      state.kickBall.z = 0.05; state.kickBall.vz = 0.46;
      addCallout('BOMB KICK!', kicker.x, kicker.y - 0.05, '#fcd34d');
    } else {
      state.kickBall.vy = -0.38; state.kickBall.vx = (Math.random() - 0.5) * 0.06;
      state.kickBall.z = 0.01; state.kickBall.vz = 0.07;
      addCallout('GRUBBER!', kicker.x, kicker.y - 0.05, '#7dd3fc');
    }
  }

  function highlightStripButton(letter) {
    if (!containerEl) return;
    const btn = containerEl.querySelector(`.piano-key-btn[data-note="${letter}"]`);
    if (btn) {
      btn.classList.add('active-note');
      setTimeout(() => btn.classList.remove('active-note'), 160);
    }
  }

  function onPianoNoteDown(noteStr) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (!clean) return;

    const freq = getNoteFrequency(clean);
    if (freq) playTone(freq, 0.22, 0.8);
    if (bridgeRef) bridgeRef.highlightKey(noteStr, 200, '#fde047');

    if (state.listeningAction) {
      const action = state.listeningAction;
      const existingKey = state.actionBinds[action].key || '';
      const upperNote = clean.toUpperCase();
      state.actionBinds[action] = {
        midi: clean, key: existingKey,
        label: existingKey ? `🎹 ${upperNote} / ${existingKey}` : `🎹 ${upperNote}`
      };
      state.listeningAction = null;
      saveActionBinds();
      if (containerEl) {
        containerEl.querySelector('#erc-keybind-notice').textContent =
          `✅ ${action.toUpperCase()} bound to MIDI note ${upperNote}!`;
      }
      refreshKeybindButtons();
      return;
    }

    if (state.phase !== 'playing') return;

    if (state.playState === 'conversionKick') {
      if (state.actionBinds.moveLeft.midi === clean) {
        state.moveInput.leftHeld = true; state.moveInput.leftTapTimer = 0.22; return;
      }
      if (state.actionBinds.moveRight.midi === clean) {
        state.moveInput.rightHeld = true; state.moveInput.rightTapTimer = 0.22; return;
      }
      submitConversionStrike();
      return;
    }

    if (state.playState === 'tryCelebration') return;

    if (state.actionBinds.moveLeft.midi === clean) {
      if (state.possession === 'home') releasePlayTheBall();
      state.moveInput.leftHeld = true; state.moveInput.leftTapTimer = 0.22; state.moveInput.rightTapTimer = 0;
      return;
    }
    if (state.actionBinds.moveRight.midi === clean) {
      if (state.possession === 'home') releasePlayTheBall();
      state.moveInput.rightHeld = true; state.moveInput.rightTapTimer = 0.22; state.moveInput.leftTapTimer = 0;
      return;
    }
    if (state.actionBinds.bomb.midi === clean) { launchKick('bomb'); return; }
    if (state.actionBinds.grubber.midi === clean) { launchKick('grubber'); return; }

    const m = clean.toUpperCase().match(/^([A-G])(#?)/);
    if (!m || m[2] === '#') return;
    const letter = m[1];
    if (NOTE_TO_INDEX[letter] !== undefined) {
      highlightStripButton(letter);
      handleNoteCDEFG(NOTE_TO_INDEX[letter]);
    }
  }

  function onPianoNoteUp(noteStr) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (!clean) return;
    if (state.actionBinds.moveLeft.midi === clean) state.moveInput.leftHeld = false;
    if (state.actionBinds.moveRight.midi === clean) state.moveInput.rightHeld = false;
  }

  function startMatch() {
    if (state.pokie.spinning) {
      state.pokie.spinning = false;
      state.awayTeam = TEAMS.find((t) => t.id === state.pokie.targetId) || TEAMS[1];
    }
    state.homeScore = 0; state.awayScore = 0; state.matchTime = 120; state.phase = 'playing';
    setupSetOfSix('home', 0.82, 2);

    startModalEl.style.display = 'none';
    hudEl.style.display = 'flex'; legendEl.style.display = 'block'; pianoStripEl.style.display = 'flex';
    syncHudAndLegend();
    playRefWhistle('long');
    addCallout('KICK OFF! PASS WITH C–G OR STEER LEFT/RIGHT!', 0.5, 0.74, '#fef08a');
  }

  function finishMatch() {
    if (state.phase === 'gameover') return;
    state.phase = 'gameover';
    playRefWhistle('long');

    const outcome =
      state.homeScore > state.awayScore
        ? `🏆 ${state.homeTeam.name} Win!`
        : state.awayScore > state.homeScore
        ? `${state.awayTeam.name} Win!`
        : '🤝 Draw Match!';

    const summaryHtml =
      `<strong>${outcome}</strong><br>` +
      `<span style="color:#67e8f9;">${state.homeTeam.name}</span> <b>${state.homeScore}</b> – <b>${state.awayScore}</b> <span style="color:#fda4af;">${state.awayTeam.name}</span>`;

    const finalPoints = Math.max(0, state.homeScore * 100 - state.awayScore * 25);

    stopErcRugby();
    bridgeRef.finishCustomMiniGame('ERC Sports Rugby', finalPoints, summaryHtml, () => startErcRugby(bridgeRef, true));
  }

  function recordPlayerVelocities(dt) {
    const all = [...state.homePlayers, ...state.awayPlayers];
    for (const p of all) {
      const dx = (p.x - p.prevX) / Math.max(0.001, dt);
      const dy = (p.y - p.prevY) / Math.max(0.001, dt);
      p.animSpeedX += (dx - p.animSpeedX) * Math.min(1, dt * 14);
      p.animSpeedY += (dy - p.animSpeedY) * Math.min(1, dt * 14);
      p.prevX = p.x; p.prevY = p.y;

      const totalSpeed = Math.hypot(p.animSpeedX, p.animSpeedY);
      if (totalSpeed > 0.018 && state.playState !== 'waitingForPlay' && state.playState !== 'turnoverPause' && state.playState !== 'tryCelebration') {
        p.strideTimer += dt * (4.8 + totalSpeed * 28);
      }
    }
  }

  function updateSimulation(dt) {
    if (state.phase !== 'playing') return;

    if (state.screenShake.timer > 0) state.screenShake.timer = Math.max(0, state.screenShake.timer - dt);
    if (state.moveInput.leftTapTimer > 0) state.moveInput.leftTapTimer = Math.max(0, state.moveInput.leftTapTimer - dt);
    if (state.moveInput.rightTapTimer > 0) state.moveInput.rightTapTimer = Math.max(0, state.moveInput.rightTapTimer - dt);

    for (const hp of state.homePlayers) {
      if (hp.missedTackleTimer > 0) hp.missedTackleTimer = Math.max(0, hp.missedTackleTimer - dt);
      if (hp.pursuitTimer > 0) hp.pursuitTimer = Math.max(0, hp.pursuitTimer - dt);
    }

    for (let i = state.callouts.length - 1; i >= 0; i--) {
      state.callouts[i].life -= dt * 1.05;
      state.callouts[i].y -= dt * 0.04;
      if (state.callouts[i].life <= 0) state.callouts.splice(i, 1);
    }

    if (state.playState === 'tryCelebration' && state.tryCelebration.active) {
      state.tryCelebration.timer += dt;
      for (const p of state.tryCelebration.confetti) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vrot * dt;
      }
      if (state.tryCelebration.timer >= state.tryCelebration.duration) {
        state.tryCelebration.active = false;
        const isHomeTry = state.tryCelebration.scoringSide === 'home';
        const scorerNote = state.tryCelebration.scorerLabel || 'E';
        const scorerObj = isHomeTry ? state.homePlayers[state.carrierIndex] : state.awayPlayers[state.carrierIndex];
        startConversionKick(isHomeTry, scorerNote, scorerObj ? scorerObj.x : 0.5);
      }
      return;
    }

    if (state.playState === 'conversionKick' && state.conversion.active) {
      const conv = state.conversion;
      let aimSteer = 0;
      if (state.moveInput.leftHeld || state.moveInput.leftTapTimer > 0) aimSteer -= 1;
      if (state.moveInput.rightHeld || state.moveInput.rightTapTimer > 0) aimSteer += 1;

      if (!conv.kicked) {
        if (aimSteer !== 0) {
          conv.aimOffset = Math.max(-0.65, Math.min(0.65, conv.aimOffset + aimSteer * 1.15 * dt));
        }
        conv.sliderPos += conv.sliderDir * conv.sliderSpeed * dt;
        if (conv.sliderPos >= 1) { conv.sliderPos = 1; conv.sliderDir = -1; }
        else if (conv.sliderPos <= -1) { conv.sliderPos = -1; conv.sliderDir = 1; }

        if (!conv.isHomeKick && Math.abs(conv.sliderPos) < 0.14 && Math.random() < dt * 9) {
          conv.aimOffset = -conv.teeX * 0.45;
          submitConversionStrike();
        }
      } else {
        conv.kickTimer += dt;
        conv.ballX += conv.ballVx * dt; conv.ballY += conv.ballVy * dt; conv.ballZ += conv.ballVz * dt;
        conv.ballVy -= 4.5 * dt;

        if (conv.kickTimer >= 1.35) {
          conv.active = false;
          setupSetOfSix('home', 0.82, 2);
          addCallout('DROP-OUT / NEW SET!', 0.5, 0.76, '#fde047');
        }
      }
      return;
    }

    state.matchTime -= dt;
    if (state.matchTime <= 0) {
      state.matchTime = 0; syncHudAndLegend(); finishMatch(); return;
    }
    syncHudAndLegend();

    if (state.playState === 'turnoverPause') {
      state.turnoverTimer -= dt; recordPlayerVelocities(dt);
      if (state.turnoverTimer <= 0) setupSetOfSix(state.nextPossession, state.nextStartY, 2);
      return;
    }

    const attackers = state.possession === 'home' ? state.homePlayers : state.awayPlayers;
    const defenders = state.possession === 'home' ? state.awayPlayers : state.homePlayers;
    const attackDir = state.possession === 'home' ? -1 : 1;
    const carrier = attackers[state.carrierIndex];

    let userSteerX = 0;
    if (state.moveInput.leftHeld || state.moveInput.leftTapTimer > 0) userSteerX -= 1;
    if (state.moveInput.rightHeld || state.moveInput.rightTapTimer > 0) userSteerX += 1;

    if (state.playState === 'retreating') {
      state.tacklePause.timer += dt;
      const targetOnsideY = state.tacklePause.onsideY;

      carrier.y = state.tacklePause.markY;
      for (let i = 0; i < 5; i++) {
        if (i === state.carrierIndex) continue;
        const att = attackers[i];
        const desired = getDesiredSupportPos(att, i, carrier, attackDir);
        att.x += (desired.x - att.x) * Math.min(1, dt * 5.5);
        att.y += (desired.y - att.y) * Math.min(1, dt * 5.5);
      }

      let allOnside = true;
      for (let i = 0; i < 5; i++) {
        const d = defenders[i]; const laneX = LANES[i];
        d.x += (laneX - d.x) * Math.min(1, dt * 6.5);
        d.y += (targetOnsideY - d.y) * Math.min(1, dt * 7.0);
        if (Math.abs(d.y - targetOnsideY) > 0.010 || Math.abs(d.x - laneX) > 0.014) allOnside = false;
      }

      recordPlayerVelocities(dt);

      if (state.tacklePause.timer >= state.tacklePause.retreatDuration && allOnside) {
        for (let i = 0; i < 5; i++) { defenders[i].x = LANES[i]; defenders[i].y = targetOnsideY; }
        state.playState = 'waitingForPlay'; state.aiPlayTimer = 0.65; state.aiPassCooldown = 1.5; state.aiLastPassFrom = -1;
        addCallout(
          state.possession === 'home' ? 'ONSIDE! PASS (C–G) OR RUN' : 'DEFENSE SET! SWITCH WITH C–G',
          carrier.x, Math.min(0.85, Math.max(0.16, carrier.y - 0.04)), '#fde047'
        );
      }
      return;
    }

    if (state.playState === 'waitingForPlay') {
      for (let i = 0; i < 5; i++) {
        if (i === state.carrierIndex) continue;
        const att = attackers[i];
        const desired = getDesiredSupportPos(att, i, carrier, attackDir);
        att.x += (desired.x - att.x) * Math.min(1, dt * 4.5);
        att.y += (desired.y - att.y) * Math.min(1, dt * 4.5);
      }

      if (state.possession === 'away' && userSteerX !== 0) {
        const selDef = state.homePlayers[state.selectedDefenderIdx];
        selDef.x = Math.min(0.92, Math.max(0.08, selDef.x + userSteerX * 0.26 * dt));
      }

      if (state.possession === 'away') {
        state.aiPlayTimer -= dt;
        if (state.aiPlayTimer <= 0) {
          releasePlayTheBall();
          if (Math.random() < 0.30) {
            tryTriggerAiPass(true);
            state.aiPassCooldown = 1.65 + Math.random() * 0.9;
          } else {
            state.aiPassCooldown = 1.45 + Math.random() * 0.85;
          }
        }
      }

      recordPlayerVelocities(dt);
      return;
    }

    if (state.passState.active) {
      state.passState.progress += dt / state.passState.duration;
      const receiver = attackers[state.passState.toIdx];
      const t = Math.min(1, state.passState.progress);

      state.passState.x = state.passState.startX + (receiver.x - state.passState.startX) * t;
      state.passState.y = state.passState.startY + (receiver.y - state.passState.startY) * t;

      if (t >= 1) {
        state.passState.active = false;
        const landedForward = state.possession === 'home' && (state.passState.isForwardPass || receiver.y < state.passState.startY - 0.008);

        if (landedForward) {
          playErrorClackSound();
          triggerHandover('FORWARD PASS! HANDOVER TO OPPONENT', 'away', Math.max(0.24, receiver.y), '#fb7185', 'long');
          recordPlayerVelocities(dt); return;
        }

        state.carrierIndex = state.passState.toIdx;
        if (state.possession === 'home' && bridgeRef && bridgeRef.getState().gameStats) bridgeRef.getState().gameStats.perfect += 1;
        attackers.forEach((att, idx) => rollSupportAlignment(att, idx, state.carrierIndex, state.possession === 'home'));

        if (state.possession === 'away') {
          armDefenderReactionWindow(attackers[state.carrierIndex], 'CAUGHT!');
        }
      }
    }

    const activeCarrier = attackers[state.carrierIndex];

    if (state.possession === 'home') {
      const baseUpSpeed = state.passState.active ? -0.075 : -0.125;
      activeCarrier.vy += (baseUpSpeed - activeCarrier.vy) * Math.min(1, dt * 11);
      activeCarrier.y += activeCarrier.vy * dt;

      if (userSteerX !== 0) {
        activeCarrier.x = Math.min(0.91, Math.max(0.09, activeCarrier.x + userSteerX * 0.25 * dt));
      }
    } else {
      state.aiPassCooldown -= dt;
      if (!state.passState.active) {
        let nearestDefDist = Infinity;
        for (const def of state.homePlayers) {
          const d = Math.hypot(def.x - activeCarrier.x, def.y - activeCarrier.y);
          if (d < nearestDefDist) nearestDefDist = d;
        }
        const underTacklePressure = nearestDefDist < 0.085 && state.aiPassCooldown <= 0.15;
        const scheduledShiftReady = state.aiPassCooldown <= 0;

        if ((underTacklePressure && Math.random() < 0.45) || (scheduledShiftReady && Math.random() < 0.36)) {
          const passed = tryTriggerAiPass(false);
          state.aiPassCooldown = passed ? (1.7 + Math.random() * 1.0) : (1.1 + Math.random() * 0.7);
        } else if (scheduledShiftReady) {
          state.aiPassCooldown = 1.2 + Math.random() * 0.8;
        }
      }

      const breakSpeedMult = state.defSwitchChallenge.failedBreak ? 1.6 : 1.0;
      const aiDownSpeed = (state.passState.active ? 0.055 : 0.118) * breakSpeedMult;
      activeCarrier.y += aiDownSpeed * dt;

      state.aiWeaveTimer -= dt;
      if (state.aiWeaveTimer <= 0) {
        state.aiWeaveTimer = 0.65 + Math.random() * 0.75;
        const selDef = state.homePlayers[state.selectedDefenderIdx];
        if (selDef && Math.abs(selDef.x - activeCarrier.x) < 0.16) {
          state.aiWeaveDir = activeCarrier.x < selDef.x ? -1 : 1;
        } else {
          state.aiWeaveDir = [-1, 0, 1][Math.floor(Math.random() * 3)];
        }
      }

      if (activeCarrier.x <= 0.10) state.aiWeaveDir = 1;
      else if (activeCarrier.x >= 0.90) state.aiWeaveDir = -1;

      const weaveSpeed = state.defSwitchChallenge.failedBreak ? 0.19 : 0.135;
      activeCarrier.x = Math.min(0.90, Math.max(0.10, activeCarrier.x + state.aiWeaveDir * weaveSpeed * dt));

      const curLane = getNearestLaneToX(activeCarrier.x);
      if (!state.passState.active && !state.defSwitchChallenge.active && curLane !== state.aiLastTrackedLane) {
        armDefenderReactionWindow(activeCarrier, '');
      }
    }

    if (state.possession === 'away' && state.defSwitchChallenge.active) {
      state.defSwitchChallenge.timer += dt;
      const idealDefIdx = getClosestDefenderIdxToCarrier();
      if (state.selectedDefenderIdx === idealDefIdx) {
        state.defSwitchChallenge.active = false;
        state.homePlayers[idealDefIdx].pursuitTimer = 0.85;
      } else if (state.defSwitchChallenge.timer >= state.defSwitchChallenge.windowSec) {
        state.defSwitchChallenge.active = false;
        state.defSwitchChallenge.failedBreak = true;
        const slowDef = state.homePlayers[state.selectedDefenderIdx];
        if (slowDef) {
          slowDef.missedTackleTimer = 0.85;
          slowDef.y = Math.min(0.92, activeCarrier.y + 0.055);
        }
        playErrorClackSound();
        addCallout(
          `TOO SLOW! HIT ${LANE_NOTES[idealDefIdx]}! BREAK THROUGH!`,
          activeCarrier.x,
          Math.min(0.82, Math.max(0.18, activeCarrier.y - 0.03)),
          '#fb7185'
        );
      }
    }

    const supportCatchup = 4.0;
    for (let i = 0; i < 5; i++) {
      if (i === state.carrierIndex) continue;
      const att = attackers[i];
      att.nextRollTimer -= dt;
      if (att.nextRollTimer <= 0 && !state.passState.active && !state.kickBall.active) {
        rollSupportAlignment(att, i, state.carrierIndex, state.possession === 'home');
      }
      if (state.possession === 'home' && state.kickBall.active) {
        if (!att.offsideOnKick) {
          att.y = Math.max(0.13, att.y - 0.13 * dt);
        } else if (activeCarrier.y <= att.y) {
          att.offsideOnKick = false;
        }
      } else {
        const desired = getDesiredSupportPos(att, i, activeCarrier, attackDir);
        att.x += (desired.x - att.x) * Math.min(1, dt * supportCatchup);
        att.y += (desired.y - att.y) * Math.min(1, dt * (supportCatchup + 0.6));
      }
    }

    if (!state.passState.active && !state.kickBall.active) {
      if (state.possession === 'home' && activeCarrier.y <= 0.12) {
        state.homeScore += 4;
        if (bridgeRef && bridgeRef.getState().gameStats) bridgeRef.getState().gameStats.perfect += 4;
        if (bridgeRef && bridgeRef.spawnConfetti) {
          const rect = canvas.getBoundingClientRect();
          bridgeRef.spawnConfetti(rect.width * 0.5, rect.height * 0.35, '#ef4444');
        }
        triggerTryCelebration('home', LANE_NOTES[state.carrierIndex], state.carrierIndex);
        recordPlayerVelocities(dt); return;
      }
      if (state.possession === 'away' && activeCarrier.y >= 0.88) {
        state.awayScore += 4;
        playErrorClackSound();
        triggerTryCelebration('away', LANE_NOTES[state.carrierIndex], state.carrierIndex);
        recordPlayerVelocities(dt); return;
      }
    }

    if (state.kickBall.active) {
      state.kickBall.x = Math.min(0.92, Math.max(0.08, state.kickBall.x + state.kickBall.vx * dt));
      state.kickBall.y = Math.min(0.90, Math.max(0.11, state.kickBall.y + state.kickBall.vy * dt));

      if (state.kickBall.kind === 'bomb') {
        state.kickBall.vz -= 1.05 * dt;
        state.kickBall.z += state.kickBall.vz * dt;
        if (state.kickBall.z <= 0) {
          state.kickBall.z = 0;
          state.kickBall.vz = Math.abs(state.kickBall.vz) * 0.42;
          state.kickBall.bounceCount += 1;
        }
      } else {
        state.kickBall.vy *= Math.pow(0.55, dt);
      }

      for (let i = 0; i < state.awayPlayers.length; i++) {
        const def = state.awayPlayers[i];
        const laneTargetX = LANES[i];
        const pullX = state.kickBall.defenderFavored
          ? (state.kickBall.x - def.x) * 2.2
          : (laneTargetX - def.x) * 2.0;
        const pullY = state.kickBall.defenderFavored
          ? (state.kickBall.y - def.y) * 1.9
          : 0.08;
        def.x = Math.min(0.91, Math.max(0.09, def.x + pullX * dt));
        def.y = Math.min(0.88, Math.max(0.14, def.y + pullY * dt));
      }

      if (state.kickBall.z < 0.07) {
        for (let i = 0; i < 5; i++) {
          const att = state.homePlayers[i];
          if (att.offsideOnKick) continue;
          if (Math.hypot(att.x - state.kickBall.x, att.y - state.kickBall.y) < 0.036) {
            state.carrierIndex = i;
            state.kickBall.active = false;
            state.tackleCount = 0;
            addCallout(`${LANE_NOTES[i]} REGATHERS! SIX AGAIN!`, att.x, att.y - 0.05, '#fde047');
            break;
          }
        }
      }

      const kickSettled =
        state.kickBall.bounceCount >= 2 ||
        (state.kickBall.kind === 'grubber' && Math.abs(state.kickBall.vy) < 0.11) ||
        state.kickBall.y <= 0.13;

      if (state.kickBall.active && kickSettled) {
        let bestDefIdx = 2;
        let bestDefDist = Infinity;
        for (let i = 0; i < state.awayPlayers.length; i++) {
          const d = Math.hypot(state.awayPlayers[i].x - state.kickBall.x, state.awayPlayers[i].y - state.kickBall.y);
          if (d < bestDefDist) {
            bestDefDist = d;
            bestDefIdx = i;
          }
        }
        const fielder = state.awayPlayers[bestDefIdx];
        const fieldingY = Math.min(0.76, Math.max(0.20, fielder ? fielder.y : state.kickBall.y));
        state.kickBall.active = false;
        triggerHandover(
          `DEFENSE FIELDS KICK (${LANE_NOTES[bestDefIdx]})!`,
          'away',
          fieldingY,
          '#fda4af',
          'short'
        );
        recordPlayerVelocities(dt);
        return;
      }
    }

    state.tacklePause.onsideY += -attackDir * 0.055 * dt;

    for (let i = 0; i < 5; i++) {
      const d = defenders[i];

      if (state.possession === 'away' && d.missedTackleTimer > 0) {
        d.y = Math.min(0.92, d.y + 0.14 * dt);
        continue;
      }

      if (state.possession === 'away' && d.pursuitTimer > 0) {
        const toX = activeCarrier.x - d.x;
        const toY = activeCarrier.y - d.y;
        const dist = Math.max(0.001, Math.hypot(toX, toY));
        const chargeSpeed = 0.24;
        d.x = Math.min(0.92, Math.max(0.08, d.x + (toX / dist) * chargeSpeed * dt));
        d.y = Math.min(0.92, Math.max(0.12, d.y + (toY / dist) * chargeSpeed * dt));
      } else if (state.possession === 'away' && i === state.selectedDefenderIdx) {
        d.y = Math.max(0.12, d.y - 0.095 * dt);
        if (userSteerX !== 0) {
          d.x = Math.min(0.92, Math.max(0.08, d.x + userSteerX * 0.27 * dt));
        }
      } else if (d.role === 'chaser') {
        const toX = activeCarrier.x - d.x; const toY = activeCarrier.y - d.y;
        const dist = Math.max(0.001, Math.hypot(toX, toY));
        d.x += (toX / dist) * 0.105 * dt; d.y += (toY / dist) * 0.108 * dt;
      } else {
        const slideShift = (activeCarrier.x - 0.5) * 0.14;
        const targetX = Math.min(0.91, Math.max(0.09, LANES[i] + slideShift));
        d.x += (targetX - d.x) * Math.min(1, dt * 3.6);
        d.y += (state.tacklePause.onsideY - d.y) * Math.min(1, dt * 3.4);
      }

      if (!state.passState.active && !state.kickBall.active) {
        const hitDist = Math.hypot(d.x - activeCarrier.x, d.y - activeCarrier.y);
        const tackleRadius = state.possession === 'away' && d.pursuitTimer > 0 ? 0.044 : 0.032;
        if (hitDist < tackleRadius) {
          if (state.possession === 'away' && state.defSwitchChallenge.active) {
            const idealIdx = getClosestDefenderIdxToCarrier();
            if (state.selectedDefenderIdx !== idealIdx) {
              d.missedTackleTimer = 0.75;
              d.y = Math.min(0.92, activeCarrier.y + 0.05);
              playErrorClackSound();
              addCallout(`SLIPPED! PLAY ${LANE_NOTES[idealIdx]}!`, activeCarrier.x, activeCarrier.y - 0.03, '#fb7185');
              continue;
            }
          }
          beginTackleAndRetreat();
          recordPlayerVelocities(dt);
          return;
        }
      }
    }

    recordPlayerVelocities(dt);
  }

  teamSelectEl.addEventListener('change', (e) => {
    state.homeTeam = TEAMS.find((t) => t.id === e.target.value) || TEAMS[0];
    updatePlayerTeamPreview(); startPokieSpin();
  });

  containerEl.querySelector('#erc-respin-btn').addEventListener('click', startPokieSpin);

  containerEl.querySelectorAll('.erc-key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.listeningAction = btn.getAttribute('data-bind-action');
      containerEl.querySelector('#erc-keybind-notice').textContent =
        `🎹 Listening for ${state.listeningAction.toUpperCase()}... play ANY MIDI piano key or press a computer key (Esc to cancel).`;
      refreshKeybindButtons(); btn.blur();
    });
  });

  containerEl.querySelectorAll('.piano-key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const note = btn.getAttribute('data-note');
      highlightStripButton(note);
      if (PIANO_FREQS[note]) playTone(PIANO_FREQS[note], 0.22, 0.8);
      handleNoteCDEFG(NOTE_TO_INDEX[note]);
    });
  });

  containerEl.querySelector('#erc-start-match-btn').addEventListener('click', startMatch);

  const PIANOPAD_QWERTY = new Set([
    'z','s','x','d','c','v','g','b','h','n','j','m',',','l','.',
    '1','q','w','3','e','4','r','5','t','y','7','u','8','i','o','0','p'
  ]);

  const onKeyDown = (e) => {
    const keyUpper = (e.key || '').toUpperCase();
    const keyLower = (e.key || '').toLowerCase();

    if (state.listeningAction) {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); state.listeningAction = null;
        containerEl.querySelector('#erc-keybind-notice').textContent = 'Binding cancelled.';
        refreshKeybindButtons(); return;
      }
      if (PIANOPAD_QWERTY.has(keyLower)) return;
      const keyLabel = e.key === 'ArrowLeft' ? '←' : e.key === 'ArrowRight' ? '→' : keyUpper;
      if ((keyUpper.length === 1 && /\S/.test(keyUpper)) || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); e.stopPropagation();
        const action = state.listeningAction;
        const existingMidi = state.actionBinds[action].midi;
        state.actionBinds[action] = {
          midi: existingMidi, key: keyLabel,
          label: existingMidi ? `🎹 ${existingMidi.toUpperCase()} / ${keyLabel}` : `KEY: ${keyLabel}`
        };
        state.listeningAction = null; saveActionBinds();
        containerEl.querySelector('#erc-keybind-notice').textContent = `✅ ${action.toUpperCase()} bound to "${keyLabel}".`;
        refreshKeybindButtons();
      }
      return;
    }

    if (state.phase !== 'playing') return;

    if (state.playState === 'conversionKick') {
      if (e.key === 'ArrowLeft' || keyUpper === (state.actionBinds.moveLeft.key || '').toUpperCase()) {
        e.preventDefault(); state.moveInput.leftHeld = true; return;
      }
      if (e.key === 'ArrowRight' || keyUpper === (state.actionBinds.moveRight.key || '').toUpperCase()) {
        e.preventDefault(); state.moveInput.rightHeld = true; return;
      }
      if (e.code === 'Space' || e.key === 'Enter' || NOTE_TO_INDEX[keyUpper] !== undefined) {
        e.preventDefault(); submitConversionStrike();
      }
      return;
    }

    if (state.playState === 'tryCelebration') return;

    if (e.key === 'ArrowLeft' || keyUpper === (state.actionBinds.moveLeft.key || '').toUpperCase()) {
      if (state.possession === 'home') releasePlayTheBall();
      state.moveInput.leftHeld = true; return;
    }
    if (e.key === 'ArrowRight' || keyUpper === (state.actionBinds.moveRight.key || '').toUpperCase()) {
      if (state.possession === 'home') releasePlayTheBall();
      state.moveInput.rightHeld = true; return;
    }

    if (e.repeat) return;

    if (keyUpper && keyUpper === (state.actionBinds.bomb.key || '').toUpperCase()) {
      e.preventDefault(); launchKick('bomb'); return;
    }
    if (keyUpper && keyUpper === (state.actionBinds.grubber.key || '').toUpperCase()) {
      e.preventDefault(); launchKick('grubber'); return;
    }

    if (!PIANOPAD_QWERTY.has(keyLower) && NOTE_TO_INDEX[keyUpper] !== undefined) {
      highlightStripButton(keyUpper);
      if (PIANO_FREQS[keyUpper]) playTone(PIANO_FREQS[keyUpper], 0.22, 0.8);
      handleNoteCDEFG(NOTE_TO_INDEX[keyUpper]);
    }
  };

  const onKeyUp = (e) => {
    const keyUpper = (e.key || '').toUpperCase();
    if (e.key === 'ArrowLeft' || keyUpper === (state.actionBinds.moveLeft.key || '').toUpperCase()) {
      state.moveInput.leftHeld = false;
    }
    if (e.key === 'ArrowRight' || keyUpper === (state.actionBinds.moveRight.key || '').toUpperCase()) {
      state.moveInput.rightHeld = false;
    }
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });

  initTeamSelectors();
  refreshKeybindButtons();
  setupSetOfSix('home', 0.82, 2);
  startPokieSpin();

  activeController = {
    onPianoNoteDown,
    onPianoNoteUp,
    cleanup: () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    }
  };

  if (autoStart) startMatch();

  let lastTimestamp = performance.now();
  function frame(now) {
    if (!containerEl) return;
    animFrameId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTimestamp) / 1000));
    lastTimestamp = now;
    stepPokieReel(dt);
    updateSimulation(dt);
    renderRugbyCanvas(canvas, containerEl, state, now / 1000);
  }
  animFrameId = requestAnimationFrame(frame);
}
