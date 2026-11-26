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

function normalizeMidiNote(noteStr) {
  if (noteStr === null || noteStr === undefined) return '';
  if (typeof noteStr === 'object') {
    if (noteStr.velocity === 0) return '';
    return String(noteStr.note || noteStr.midi || noteStr.key || '').trim().toLowerCase();
  }
  return String(noteStr).trim().toLowerCase();
}

function applyScrumAndBassBranding(rootEl) {
  if (!rootEl) return;
  const modalEl = rootEl.querySelector('#erc-start-modal');
  if (!modalEl) return;

  // Ensure an ERC Sports logo badge is present on the splash screen
  if (!modalEl.querySelector('#erc-sports-logo-badge')) {
    const headerAnchor =
      modalEl.querySelector('h1, h2, .erc-modal-header, .erc-brand-header') ||
      modalEl.firstElementChild;

    const logoBadge = document.createElement('div');
    logoBadge.id = 'erc-sports-logo-badge';
    logoBadge.style.cssText = `
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; margin-bottom: 8px; border-radius: 999px;
      background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(125, 211, 252, 0.45);
      font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
      color: #7dd3fc;
    `;
    logoBadge.innerHTML = `<span style="color:#fbbf24;">🏉</span><span>ERC SPORTS</span>`;

    if (headerAnchor && headerAnchor.parentNode) {
      headerAnchor.parentNode.insertBefore(logoBadge, headerAnchor);
    } else {
      modalEl.prepend(logoBadge);
    }
  }

  // Update the splash screen title to "Scrum & Bass" while keeping ERC Sports branding
  const titleEl =
    modalEl.querySelector('#erc-game-title, #erc-splash-title, h1, h2') ||
    Array.from(modalEl.querySelectorAll('div, span, p')).find((el) => {
      const txt = (el.textContent || '').trim().toLowerCase();
      return el.children.length === 0 && (txt.includes('rugby') || txt.includes('erc sports'));
    });

  if (titleEl && titleEl.id !== 'erc-sports-logo-badge') {
    titleEl.textContent = 'Scrum & Bass';
  }
}

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
  if (noteStr && typeof noteStr === 'object' && noteStr.velocity === 0) {
    if (activeController && activeController.onPianoNoteUp) {
      activeController.onPianoNoteUp(noteStr.note || noteStr.midi || noteStr.key);
    }
    return;
  }
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
    statusEl.textContent = '🏉 Scrum & Bass (ERC Sports) Ready! Play MIDI notes to pass (C–G), steer, and kick (Bomb, Grubber & Chip)!';
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
  applyScrumAndBassBranding(containerEl);

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
      return JSON.parse(localStorage.getItem('erc_rugby_midi_binds_v5') || localStorage.getItem('erc_rugby_midi_binds_v4') || 'null');
    } catch (e) {
      return null;
    }
  })();

  const defaultBinds = {
    moveLeft:  { midi: 'f#1', label: '🎹 F#1' },
    moveRight: { midi: 'g#1', label: '🎹 G#1' },
    bomb:      { midi: 'b1',  label: '🎹 B1' },
    grubber:   { midi: 'c2',  label: '🎹 C2' },
    chipKick:  { midi: 'd2',  label: '🎹 D2' }
  };

  const sessionInfo = bridgeRef && bridgeRef.getState ? bridgeRef.getState() : {};
  const localPlayerId = sessionInfo.localStudentId || ('rugby_' + Math.random().toString(36).slice(2, 8));
  const localPlayerName = sessionInfo.sessionStudentName || window.pianoPadUser?.generatedName || 'Player';

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

    multiplayer: {
      mode: 'solo', // 'solo' | 'host' | 'join'
      role: 'home', // 'home' (P1) | 'away' (P2)
      roomCode: '',
      connected: false,
      guestJoined: false,
      hostStarted: false,
      unsubscribe: null,
      lastSnapshotPush: 0,
      lastProcessedInputSeq: 0
    },

    coinToss: {
      active: false,
      choice: 'heads',
      outcome: null,
      playerWon: null,
      flipTimer: 0,
      flipDuration: 1.1,
      resolved: false,
      kickoffBy: 'away',
      receiverSide: 'home'
    },

    kick3D: {
      active: false,
      aiming: false,
      kind: 'kickoff', // 'kickoff' | 'bomb' | 'grubber' | 'chip'
      kickingSide: 'home',
      receiverSide: 'away',
      holdMidi: null,
      aimStartedAt: 0,
      power: 0.5,
      powerDir: 1,
      powerSpeed: 1.55,
      aimCurve: 0,
      startX: 0.5,
      startY: 0.84,
      x: 0.5,
      y: 0.84,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      curveAccelX: 0,
      flightProgress: 0,
      flightDuration: 1.15,
      bounceCount: 0,
      aiChargeTimer: 0.85,
      flightElapsed: 0
    },

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
      progress: 0, duration: 0.22, isForwardPass: false,
      elapsed: 0
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
      localStorage.setItem('erc_rugby_midi_binds_v5', JSON.stringify(state.actionBinds));
    } catch (e) {}
  }

  function resetAllBallFlightFlags() {
    state.passState.active = false;
    state.passState.progress = 0;
    state.passState.elapsed = 0;

    state.kickBall.active = false;
    state.kickBall.z = 0;
    state.kickBall.vx = 0;
    state.kickBall.vy = 0;
    state.kickBall.vz = 0;

    state.kick3D.active = false;
    state.kick3D.aiming = false;
    state.kick3D.holdMidi = null;
    state.kick3D.aimStartedAt = 0;
    state.kick3D.flightProgress = 0;
    state.kick3D.flightElapsed = 0;
    state.kick3D.z = 0;
    state.kick3D.vx = 0;
    state.kick3D.vy = 0;
    state.kick3D.vz = 0;
    state.kick3D.curveAccelX = 0;
  }

  function getRugbyRoomRef(roomCode) {
    if (!window.firebaseDb || !window.firebaseRef || !roomCode) return null;
    return window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${roomCode}/rugby`);
  }

  function detachMultiplayerRoom() {
    if (state.multiplayer.unsubscribe) {
      try { state.multiplayer.unsubscribe(); } catch (e) {}
      state.multiplayer.unsubscribe = null;
    }
    state.multiplayer.connected = false;
    state.multiplayer.guestJoined = false;
    state.multiplayer.hostStarted = false;
    state.multiplayer.lastProcessedInputSeq = 0;
  }

  function updateMultiplayerUi() {
    if (!containerEl) return;
    const mp = state.multiplayer;
    const soloBtn = containerEl.querySelector('#erc-mp-solo-btn');
    const hostBtn = containerEl.querySelector('#erc-mp-host-btn');
    const joinBtn = containerEl.querySelector('#erc-mp-join-btn');
    const codeInput = containerEl.querySelector('#erc-mp-code-input');
    const statusEl = containerEl.querySelector('#erc-mp-status');
    const teamLabel = containerEl.querySelector('#erc-team-select-label');
    const oppTitle = containerEl.querySelector('#erc-opponent-panel-title');
    const oppHint = containerEl.querySelector('#erc-opponent-reel-hint');
    const respinBtn = containerEl.querySelector('#erc-respin-btn');

    soloBtn?.classList.toggle('active-mp', mp.mode === 'solo');
    hostBtn?.classList.toggle('active-mp', mp.mode === 'host');
    joinBtn?.classList.toggle('active-mp', mp.mode === 'join');

    if (codeInput && mp.roomCode) {
      codeInput.value = mp.roomCode;
    }

    if (mp.mode === 'solo') {
      if (teamLabel) teamLabel.textContent = 'Your Team (Home)';
      if (oppTitle) oppTitle.textContent = 'Computer Opponent (Pokie Reel)';
      if (oppHint) oppHint.textContent = 'Spins when team changes';
      if (respinBtn) respinBtn.style.display = 'inline-block';
      if (statusEl) statusEl.textContent = 'Mode: 1P vs Computer';
    } else if (mp.mode === 'host') {
      if (teamLabel) teamLabel.textContent = 'Player 1 Team (Home — You)';
      if (oppTitle) oppTitle.textContent = 'Player 2 Team (Away — Guest)';
      if (oppHint) oppHint.textContent = mp.guestJoined ? 'Opposing team linked!' : 'Waiting for P2 to join...';
      if (respinBtn) respinBtn.style.display = 'none';
      if (statusEl) {
        statusEl.textContent = mp.connected
          ? `Host Room ${mp.roomCode} • ${mp.guestJoined ? 'Opposing P2 Linked!' : 'Share code with P2'}`
          : `Ready to create Room ${mp.roomCode || '---'}`;
      }
    } else {
      if (teamLabel) teamLabel.textContent = 'Player 2 Team (Away — You)';
      if (oppTitle) oppTitle.textContent = 'Player 1 Team (Home — Host)';
      if (oppHint) oppHint.textContent = 'Opposing team synced from Host';
      if (respinBtn) respinBtn.style.display = 'none';
      if (statusEl) {
        statusEl.textContent = mp.connected
          ? `Joined Room ${mp.roomCode} • Opposing Away View (Enters play with Host)`
          : 'Enter Host code & click Link';
      }
    }
  }

  function syncTeamSelectionToUi() {
    if (!containerEl || !teamSelectEl) return;
    const myTeam = state.multiplayer.role === 'away' ? state.awayTeam : state.homeTeam;
    teamSelectEl.value = myTeam.id;
    containerEl.querySelector('#erc-player-swatch').style.background =
      `linear-gradient(135deg, ${myTeam.primary} 55%, ${myTeam.secondary} 55%)`;
    containerEl.querySelector('#erc-player-title').textContent = myTeam.name;
    containerEl.querySelector('#erc-player-chant').textContent = myTeam.chant;

    const oppTeam = state.multiplayer.role === 'away' ? state.homeTeam : state.awayTeam;
    containerEl.querySelector('#erc-pokie-name').textContent = oppTeam.name;
    containerEl.querySelector('#erc-pokie-sub').textContent = oppTeam.chant;
    containerEl.querySelector('#erc-matchup-summary').textContent =
      `${state.homeTeam.name} (Home) vs ${state.awayTeam.name} (Away) • Jerseys: C D E F G`;

    const squadEl = containerEl.querySelector('#erc-wolfhound-squad');
    const facesRowEl = containerEl.querySelector('#erc-wolfhound-faces');
    if (squadEl && facesRowEl) {
      if (myTeam.isWolfHounds) {
        squadEl.style.display = 'block';
        facesRowEl.innerHTML = '';
        LANE_NOTES.forEach((note) => {
          const meta = WOLFHUND_FACES[note] || { title: note };
          const card = document.createElement('div');
          card.className = 'wolfhound-face-card';

          const faceCanvas = getWolfhoundFaceCanvas(note, myTeam);
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

  async function sendGuestInputToHost(inputPayload) {
    const mp = state.multiplayer;
    if (mp.mode !== 'join' || !mp.connected || !mp.roomCode) return;
    const roomRef = getRugbyRoomRef(mp.roomCode);
    if (!roomRef) return;
    const seq = Date.now() + Math.floor(Math.random() * 100);
    try {
      if (window.firebaseUpdate) {
        await window.firebaseUpdate(roomRef, {
          guestInput: {
            seq,
            fromId: localPlayerId,
            ...inputPayload
          }
        });
      } else if (window.firebaseSet) {
        await window.firebaseSet(
          window.firebaseRef(window.firebaseDb, `pianopad_tournaments/${mp.roomCode}/rugby/guestInput`),
          { seq, fromId: localPlayerId, ...inputPayload }
        );
      }
    } catch (e) {}
  }

  function applyGuestInputOnHost(inp) {
    if (!inp || !inp.seq || inp.seq <= state.multiplayer.lastProcessedInputSeq) return;
    state.multiplayer.lastProcessedInputSeq = inp.seq;

    if (inp.type === 'teamSelect' && inp.teamId) {
      const picked = TEAMS.find((t) => t.id === inp.teamId);
      if (picked) {
        if (picked.id === state.homeTeam.id) {
          const fallback = TEAMS.find((t) => t.id !== state.homeTeam.id) || TEAMS[1];
          state.awayTeam = fallback;
        } else {
          state.awayTeam = picked;
        }
        syncTeamSelectionToUi();
        syncHudAndLegend();
      }
      return;
    }

    if (inp.type === 'coinChoice' && (inp.choice === 'heads' || inp.choice === 'tails')) {
      state.coinToss.choice = inp.choice;
      updateCoinTossUi();
      return;
    }

    if (inp.type === 'tossProceed' && state.coinToss.resolved) {
      beginKickoffSequence();
      return;
    }

    if (inp.type === 'steer') {
      if (inp.dir === 'leftDown') {
        state.moveInput.leftHeld = true;
        state.moveInput.leftTapTimer = 0.22;
      } else if (inp.dir === 'leftUp') {
        state.moveInput.leftHeld = false;
      } else if (inp.dir === 'rightDown') {
        state.moveInput.rightHeld = true;
        state.moveInput.rightTapTimer = 0.22;
      } else if (inp.dir === 'rightUp') {
        state.moveInput.rightHeld = false;
      }
      return;
    }

    if (inp.type === 'noteDown' && inp.note) {
      const clean = normalizeMidiNote(inp.note);
      if (state.playState === 'kickoff3D' && state.kick3D.kickingSide === 'away' && !state.kick3D.aiming) {
        start3DKickAimOrCharge('kickoff', clean);
        return;
      }
      if (state.possession === 'away' && !state.kick3D.active && !state.kickBall.active && !state.passState.active) {
        if (inp.kickKind) {
          releasePlayTheBall();
          const kicker = state.awayPlayers[state.carrierIndex];
          if (kicker) {
            state.kick3D.active = true;
            state.kick3D.aiming = true;
            state.kick3D.kind = inp.kickKind;
            state.kick3D.kickingSide = 'away';
            state.kick3D.receiverSide = 'home';
            state.kick3D.holdMidi = clean;
            state.kick3D.aimStartedAt = performance.now();
            state.kick3D.power = 0.25;
            state.kick3D.powerDir = 1;
            state.kick3D.aimCurve = 0;
            state.kick3D.startX = kicker.x;
            state.kick3D.startY = kicker.y;
            state.kick3D.x = kicker.x;
            state.kick3D.y = kicker.y;
            state.kick3D.z = 0.03;
            state.kick3D.flightProgress = 0;
            state.kick3D.flightElapsed = 0;
          }
          return;
        }
        const m = clean.toUpperCase().match(/^([A-G])(#?)/);
        if (m && m[2] !== '#' && NOTE_TO_INDEX[m[1]] !== undefined) {
          const targetIdx = NOTE_TO_INDEX[m[1]];
          releasePlayTheBall();
          const passer = state.awayPlayers[state.carrierIndex];
          if (targetIdx === state.carrierIndex && passer) {
            passer.vy = 0.22;
          } else if (passer) {
            const receiver = state.awayPlayers[targetIdx];
            playPassSound();
            state.passState.active = true;
            state.passState.fromIdx = state.carrierIndex;
            state.passState.toIdx = targetIdx;
            state.passState.startX = passer.x;
            state.passState.startY = passer.y;
            state.passState.x = passer.x;
            state.passState.y = passer.y;
            state.passState.progress = 0;
            state.passState.elapsed = 0;
            state.passState.duration = 0.14 + Math.abs(targetIdx - state.carrierIndex) * 0.05;
            state.passState.isForwardPass = receiver.y > passer.y + 0.006;
          }
        }
      } else if (state.possession === 'home') {
        const m = clean.toUpperCase().match(/^([A-G])(#?)/);
        if (m && m[2] !== '#' && NOTE_TO_INDEX[m[1]] !== undefined) {
          state.selectedDefenderIdx = NOTE_TO_INDEX[m[1]];
        }
      }
      return;
    }

    if (inp.type === 'noteUp') {
      if (state.kick3D.active && state.kick3D.aiming && state.kick3D.kickingSide === 'away') {
        release3DKickStrike();
      }
    }
  }

  function serializeCompactPlayers(arr) {
    return (arr || []).map((p) => ({
      x: Number((p.x || 0.5).toFixed(3)),
      y: Number((p.y || 0.5).toFixed(3)),
      vx: Number((p.vx || 0).toFixed(3)),
      vy: Number((p.vy || 0).toFixed(3)),
      animSpeedX: Number((p.animSpeedX || 0).toFixed(3)),
      animSpeedY: Number((p.animSpeedY || 0).toFixed(3)),
      strideTimer: Number((p.strideTimer || 0).toFixed(2)),
      overrun: Boolean(p.overrun),
      isScorer: Boolean(p.isScorer)
    }));
  }

  async function pushHostSnapshot(force = false) {
    const mp = state.multiplayer;
    if (mp.mode !== 'host' || !mp.connected || !mp.roomCode) return;
    const now = performance.now();
    if (!force && now - mp.lastSnapshotPush < 65) return;
    mp.lastSnapshotPush = now;

    const roomRef = getRugbyRoomRef(mp.roomCode);
    if (!roomRef) return;

    const snapshot = {
      phase: state.phase,
      playState: state.playState,
      possession: state.possession,
      tackleCount: state.tackleCount,
      homeTeamId: state.homeTeam.id,
      awayTeamId: state.awayTeam.id,
      homeScore: state.homeScore,
      awayScore: state.awayScore,
      matchTime: Number(state.matchTime.toFixed(1)),
      carrierIndex: state.carrierIndex,
      selectedDefenderIdx: state.selectedDefenderIdx,
      homePlayers: serializeCompactPlayers(state.homePlayers),
      awayPlayers: serializeCompactPlayers(state.awayPlayers),
      passState: { ...state.passState },
      kick3D: { ...state.kick3D, holdMidi: null },
      coinToss: { ...state.coinToss },
      tacklePause: { ...state.tacklePause },
      callouts: state.callouts.slice(-4),
      updatedAt: Date.now()
    };

    try {
      if (window.firebaseUpdate) {
        await window.firebaseUpdate(roomRef, { snapshot });
      }
    } catch (e) {}
  }

  function enterActiveGameplayChrome() {
    if (startModalEl) startModalEl.style.display = 'none';
    if (hudEl) hudEl.style.display = 'flex';
    if (legendEl) legendEl.style.display = 'block';
    if (pianoStripEl) pianoStripEl.style.display = 'flex';
  }

  function applyHostSnapshotOnGuest(snap) {
    if (!snap || state.multiplayer.mode !== 'join') return;
    state.multiplayer.role = 'away';

    if (snap.homeTeamId) {
      state.homeTeam = TEAMS.find((t) => t.id === snap.homeTeamId) || state.homeTeam;
    }
    if (snap.awayTeamId) {
      state.awayTeam = TEAMS.find((t) => t.id === snap.awayTeamId) || state.awayTeam;
    }

    state.phase = snap.phase || state.phase;
    state.playState = snap.playState || state.playState;
    state.possession = snap.possession || state.possession;
    state.tackleCount = snap.tackleCount ?? state.tackleCount;
    state.homeScore = snap.homeScore ?? state.homeScore;
    state.awayScore = snap.awayScore ?? state.awayScore;
    if (typeof snap.matchTime === 'number') state.matchTime = snap.matchTime;
    if (typeof snap.carrierIndex === 'number') state.carrierIndex = snap.carrierIndex;
    if (typeof snap.selectedDefenderIdx === 'number') state.selectedDefenderIdx = snap.selectedDefenderIdx;

    if (Array.isArray(snap.homePlayers) && snap.homePlayers.length === 5) {
      state.homePlayers = snap.homePlayers.map((p, i) => Object.assign(makePlayerEntity(i, p.x, p.y), p));
    }
    if (Array.isArray(snap.awayPlayers) && snap.awayPlayers.length === 5) {
      state.awayPlayers = snap.awayPlayers.map((p, i) => Object.assign(makePlayerEntity(i, p.x, p.y), p));
    }
    if (snap.passState) state.passState = Object.assign({}, state.passState, snap.passState);
    if (snap.kick3D) state.kick3D = Object.assign({}, state.kick3D, snap.kick3D);
    if (snap.coinToss) state.coinToss = Object.assign({}, state.coinToss, snap.coinToss);
    if (snap.tacklePause) state.tacklePause = Object.assign({}, state.tacklePause, snap.tacklePause);
    if (Array.isArray(snap.callouts)) state.callouts = snap.callouts;

    if (state.phase === 'coinToss' || state.phase === 'playing') {
      enterActiveGameplayChrome();
      updateCoinTossUi();
    }

    syncTeamSelectionToUi();
    syncHudAndLegend();
  }

  async function linkMultiplayerRoom(mode) {
    if (!window.firebaseDb || !window.firebaseRef || !window.firebaseSet) {
      if (containerEl) {
        containerEl.querySelector('#erc-mp-status').textContent = 'Firebase not ready yet — try again in a moment.';
      }
      return;
    }

    const codeInput = containerEl?.querySelector('#erc-mp-code-input');
    const rawCode = (codeInput?.value || '').trim().toUpperCase();

    if (mode === 'solo') {
      detachMultiplayerRoom();
      state.multiplayer.mode = 'solo';
      state.multiplayer.role = 'home';
      state.multiplayer.roomCode = '';
      updateMultiplayerUi();
      syncTeamSelectionToUi();
      return;
    }

    detachMultiplayerRoom();

    if (mode === 'host') {
      const code = rawCode || String(Math.floor(100 + Math.random() * 900));
      if (state.awayTeam.id === state.homeTeam.id) {
        state.awayTeam = TEAMS.find((t) => t.id !== state.homeTeam.id) || TEAMS[1];
      }
      state.multiplayer.mode = 'host';
      state.multiplayer.role = 'home';
      state.multiplayer.roomCode = code;
      if (codeInput) codeInput.value = code;

      const roomRef = getRugbyRoomRef(code);
      await window.firebaseSet(roomRef, {
        roomCode: code,
        hostId: localPlayerId,
        hostName: localPlayerName,
        homeTeamId: state.homeTeam.id,
        awayTeamId: state.awayTeam.id,
        guestJoined: false,
        started: false,
        guestInput: null,
        snapshot: null,
        updatedAt: Date.now()
      });
      if (window.firebaseOnDisconnect) {
        window.firebaseOnDisconnect(roomRef).remove();
      }

      if (window.firebaseOnValue) {
        state.multiplayer.unsubscribe = window.firebaseOnValue(roomRef, (snap) => {
          const val = snap.val();
          if (!val) return;
          state.multiplayer.connected = true;
          state.multiplayer.guestJoined = Boolean(val.guestJoined);
          if (val.awayTeamId) {
            state.awayTeam = TEAMS.find((t) => t.id === val.awayTeamId) || state.awayTeam;
          }
          if (val.guestInput) {
            applyGuestInputOnHost(val.guestInput);
          }
          updateMultiplayerUi();
          syncTeamSelectionToUi();
        });
      }

      state.multiplayer.connected = true;
      updateMultiplayerUi();
      syncTeamSelectionToUi();
      return;
    }

    if (mode === 'join') {
      if (!rawCode) {
        if (containerEl) {
          containerEl.querySelector('#erc-mp-status').textContent = 'Enter a 3–6 character Room Code first.';
        }
        return;
      }
      state.multiplayer.mode = 'join';
      state.multiplayer.role = 'away';
      state.multiplayer.roomCode = rawCode;

      const roomRef = getRugbyRoomRef(rawCode);
      if (window.firebaseUpdate) {
        await window.firebaseUpdate(roomRef, {
          guestJoined: true,
          guestId: localPlayerId,
          guestName: localPlayerName,
          awayTeamId: state.awayTeam.id
        });
      }

      if (window.firebaseOnValue) {
        state.multiplayer.unsubscribe = window.firebaseOnValue(roomRef, (snap) => {
          const val = snap.val();
          if (!val) return;
          state.multiplayer.connected = true;
          state.multiplayer.hostStarted = Boolean(val.started);
          if (val.homeTeamId) {
            state.homeTeam = TEAMS.find((t) => t.id === val.homeTeamId) || state.homeTeam;
            if (state.awayTeam.id === state.homeTeam.id) {
              state.awayTeam = TEAMS.find((t) => t.id !== state.homeTeam.id) || TEAMS[1];
            }
          }
          if (val.snapshot) {
            applyHostSnapshotOnGuest(val.snapshot);
          } else if (val.started && state.phase === 'menu') {
            state.phase = 'playing';
            state.playState = 'waitingForPlay';
            enterActiveGameplayChrome();
          }
          updateMultiplayerUi();
          syncTeamSelectionToUi();
        });
      }

      state.multiplayer.connected = true;
      updateMultiplayerUi();
      syncTeamSelectionToUi();
    }
  }

  function addCallout(text, x, y, color = '#fef08a') {
    state.callouts.push({ text, x, y, color, life: 1.2 });
  }

  function updateCoinTossUi() {
    if (!containerEl) return;
    const headsBtn = containerEl.querySelector('#erc-toss-heads-btn');
    const tailsBtn = containerEl.querySelector('#erc-toss-tails-btn');
    const statusText = containerEl.querySelector('#erc-toss-status');
    const proceedBtn = containerEl.querySelector('#erc-toss-proceed-btn');

    if (headsBtn) headsBtn.classList.toggle('active-choice', state.coinToss.choice === 'heads');
    if (tailsBtn) tailsBtn.classList.toggle('active-choice', state.coinToss.choice === 'tails');

    if (statusText) {
      if (!state.coinToss.active && !state.coinToss.resolved) {
        statusText.textContent = `Called ${state.coinToss.choice.toUpperCase()}. Flipping coin...`;
      } else if (state.coinToss.active) {
        statusText.textContent = `Coin spinning in the air... Called ${state.coinToss.choice.toUpperCase()}!`;
      } else if (state.coinToss.resolved) {
        statusText.textContent = state.coinToss.playerWon
          ? `WON TOSS (${state.coinToss.outcome.toUpperCase()})! ${state.awayTeam.name} kicks off — Home/P1 receives!`
          : `LOST TOSS (${state.coinToss.outcome.toUpperCase()})! Home/P1 kicks off — ${state.awayTeam.name} receives!`;
      }
    }

    if (proceedBtn) {
      proceedBtn.disabled = !state.coinToss.resolved;
      proceedBtn.style.opacity = state.coinToss.resolved ? '1' : '0.45';
    }
  }

  function setCoinChoice(choice) {
    const normalized = choice === 'tails' ? 'tails' : 'heads';
    state.coinToss.choice = normalized;
    updateCoinTossUi();
    if (state.multiplayer.mode === 'join') {
      sendGuestInputToHost({ type: 'coinChoice', choice: normalized });
    }
  }

  function triggerCoinFlip() {
    resetAllBallFlightFlags();
    state.phase = 'coinToss';
    state.playState = 'coinToss';
    state.coinToss.active = true;
    state.coinToss.resolved = false;
    state.coinToss.playerWon = null;
    state.coinToss.outcome = null;
    state.coinToss.flipTimer = 0;
    state.coinToss.flipDuration = 1.1;

    enterActiveGameplayChrome();
    syncHudAndLegend();
    updateCoinTossUi();
    playRefWhistle('short');
  }

  function resolveCoinFlip() {
    const landed = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = landed === state.coinToss.choice;
    state.coinToss.active = false;
    state.coinToss.resolved = true;
    state.coinToss.outcome = landed;
    state.coinToss.playerWon = won;

    if (won) {
      state.coinToss.kickoffBy = 'away';
      state.coinToss.receiverSide = 'home';
    } else {
      state.coinToss.kickoffBy = 'home';
      state.coinToss.receiverSide = 'away';
    }

    updateCoinTossUi();
    addCallout(
      won
        ? `${landed.toUpperCase()}! TOSS WON — RECEIVE KICKOFF!`
        : `${landed.toUpperCase()}! TOSS LOST — KICK OFF!`,
      0.5,
      0.48,
      won ? '#4ade80' : '#fda4af'
    );
    pushHostSnapshot(true);
  }

  function beginKickoffSequence() {
    resetAllBallFlightFlags();
    const kickerSide = state.coinToss.kickoffBy || 'away';
    const receiverSide = state.coinToss.receiverSide || (kickerSide === 'away' ? 'home' : 'away');

    state.phase = 'playing';
    state.possession = receiverSide;
    state.playState = 'kickoff3D';
    state.tackleCount = 0;

    const kickerStartY = kickerSide === 'home' ? 0.84 : 0.16;
    const receiverStartY = receiverSide === 'home' ? 0.62 : 0.38;

    state.homePlayers = [];
    state.awayPlayers = [];
    for (let i = 0; i < 5; i++) {
      const hy = kickerSide === 'home' ? (i === 2 ? kickerStartY : 0.72) : receiverStartY;
      const ay = kickerSide === 'away' ? (i === 2 ? kickerStartY : 0.28) : receiverStartY;
      state.homePlayers.push(makePlayerEntity(i, LANES[i], hy));
      state.awayPlayers.push(makePlayerEntity(i, LANES[i], ay));
    }
    state.carrierIndex = 2;
    state.selectedDefenderIdx = 2;

    const kickerObj = kickerSide === 'home' ? state.homePlayers[2] : state.awayPlayers[2];
    state.kick3D.active = true;
    state.kick3D.aiming = true;
    state.kick3D.kind = 'kickoff';
    state.kick3D.kickingSide = kickerSide;
    state.kick3D.receiverSide = receiverSide;
    state.kick3D.holdMidi = null;
    state.kick3D.aimStartedAt = performance.now();
    state.kick3D.power = 0.45;
    state.kick3D.powerDir = 1;
    state.kick3D.powerSpeed = 1.55;
    state.kick3D.aimCurve = 0;
    state.kick3D.startX = kickerObj ? kickerObj.x : 0.5;
    state.kick3D.startY = kickerObj ? kickerObj.y : kickerStartY;
    state.kick3D.x = state.kick3D.startX;
    state.kick3D.y = state.kick3D.startY;
    state.kick3D.z = 0.04;
    state.kick3D.vx = 0;
    state.kick3D.vy = 0;
    state.kick3D.vz = 0;
    state.kick3D.curveAccelX = 0;
    state.kick3D.flightProgress = 0;
    state.kick3D.flightElapsed = 0;
    state.kick3D.flightDuration = 1.15;
    state.kick3D.bounceCount = 0;
    state.kick3D.aiChargeTimer = 0.85;

    syncHudAndLegend();
    playRefWhistle('long');

    if (kickerSide === 'home') {
      addCallout('HOLD KICK KEY FOR POWER • STEER CURVE • RELEASE TO KICK OFF!', 0.5, 0.74, '#fde047');
    } else {
      addCallout(`${state.awayTeam.name.toUpperCase()} AIMING KICKOFF — GET READY TO RECEIVE!`, 0.5, 0.45, '#67e8f9');
    }
    pushHostSnapshot(true);
  }

  function start3DKickAimOrCharge(kind, midiKey = null) {
    if (state.phase !== 'playing') return;
    if (state.playState === 'tryCelebration' || state.playState === 'conversionKick' || state.playState === 'turnoverPause') return;

    if (state.playState === 'kickoff3D') {
      if (!state.kick3D.active || state.kick3D.kickingSide !== 'home') return;
      state.kick3D.aiming = true;
      state.kick3D.holdMidi = normalizeMidiNote(midiKey);
      state.kick3D.aimStartedAt = performance.now();
      state.kick3D.power = 0.25;
      state.kick3D.powerDir = 1;
      return;
    }

    if (state.possession !== 'home' || state.kick3D.active || state.kickBall.active || state.passState.active) return;
    if (!releasePlayTheBall()) return;

    const kicker = state.homePlayers[state.carrierIndex];
    state.kick3D.active = true;
    state.kick3D.aiming = true;
    state.kick3D.kind = kind;
    state.kick3D.kickingSide = 'home';
    state.kick3D.receiverSide = 'away';
    state.kick3D.holdMidi = normalizeMidiNote(midiKey);
    state.kick3D.aimStartedAt = performance.now();
    state.kick3D.power = 0.22;
    state.kick3D.powerDir = 1;
    state.kick3D.powerSpeed = kind === 'chip' ? 1.85 : 1.55;
    state.kick3D.aimCurve = 0;
    state.kick3D.startX = kicker.x;
    state.kick3D.startY = kicker.y;
    state.kick3D.x = kicker.x;
    state.kick3D.y = kicker.y;
    state.kick3D.z = 0.03;
    state.kick3D.flightProgress = 0;
    state.kick3D.flightElapsed = 0;
    state.kick3D.bounceCount = 0;

    state.homePlayers.forEach((att, idx) => {
      att.offsideOnKick = idx !== state.carrierIndex && att.y < kicker.y;
    });

    const labelMap = { bomb: '3D BOMB AIM', grubber: '3D GRUBBER AIM', chip: '3D CHIP KICK AIM' };
    addCallout(`${labelMap[kind] || '3D KICK'} — RELEASE KEY TO STRIKE!`, kicker.x, kicker.y - 0.05, '#fde047');
  }

  function release3DKickStrike() {
    const k3 = state.kick3D;
    if (!k3.active || !k3.aiming) return;
    k3.aiming = false;
    k3.holdMidi = null;
    k3.aimStartedAt = 0;

    const dirSign = k3.kickingSide === 'home' ? -1 : 1;
    const p = Math.max(0.15, Math.min(1.0, k3.power));

    let distanceY = 0.42;
    let peakZ = 0.42;
    let duration = 1.05;

    if (k3.kind === 'kickoff') {
      distanceY = 0.24 + p * 0.28;
      peakZ = 0.26 + p * 0.32;
      duration = 0.95 + p * 0.35;
    } else if (k3.kind === 'bomb') {
      distanceY = 0.25 + p * 0.36;
      peakZ = 0.35 + p * 0.48;
      duration = 1.0 + p * 0.45;
    } else if (k3.kind === 'grubber') {
      distanceY = 0.16 + p * 0.28;
      peakZ = 0.04 + p * 0.05;
      duration = 0.65 + p * 0.30;
    } else if (k3.kind === 'chip') {
      distanceY = 0.11 + p * 0.18;
      peakZ = 0.16 + p * 0.16;
      duration = 0.58 + p * 0.24;
    }

    const targetY = Math.min(0.89, Math.max(0.11, k3.startY + dirSign * distanceY));
    const curveLateral = k3.aimCurve * (0.14 + p * 0.18);
    const targetX = Math.min(0.92, Math.max(0.08, k3.startX + curveLateral));

    k3.flightDuration = Math.max(0.25, duration);
    k3.flightProgress = 0;
    k3.flightElapsed = 0;
    k3.vx = (targetX - k3.startX) / k3.flightDuration;
    k3.vy = (targetY - k3.startY) / k3.flightDuration;
    k3.curveAccelX = k3.aimCurve * 0.26 * dirSign;
    k3.vz = (4 * peakZ) / k3.flightDuration;

    playKickSound(k3.kind === 'grubber' ? 'grubber' : 'bomb');
    addCallout(
      `${k3.kind.toUpperCase()} (${Math.round(p * 100)}% POWER)!`,
      k3.startX,
      Math.max(0.14, k3.startY - 0.05),
      '#7dd3fc'
    );
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
    syncTeamSelectionToUi();
  }

  function startPokieSpin() {
    if (!containerEl || state.multiplayer.mode !== 'solo') return;
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
      syncTeamSelectionToUi();
      syncHudAndLegend();
    }
  }

  function refreshKeybindButtons() {
    if (!containerEl) return;
    containerEl.querySelectorAll('.erc-key-btn').forEach((btn) => {
      const action = btn.getAttribute('data-bind-action');
      const bind = state.actionBinds[action];
      if (!bind) return;
      const listening = state.listeningAction === action;
      btn.textContent = listening ? 'PLAY MIDI KEY...' : bind.label;
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

    const isAwayView = state.multiplayer.role === 'away';
    const hasAttack = isAwayView ? state.possession === 'away' : state.possession === 'home';
    const posEl = containerEl.querySelector('#erc-hud-possession');
    posEl.textContent = hasAttack
      ? `ATTACK • T ${state.tackleCount}/${state.maxTackles - 1}`
      : `DEFENSE • T ${state.tackleCount}/${state.maxTackles - 1}`;
    posEl.style.color = hasAttack ? '#fde047' : '#fda4af';

    const mins = Math.floor(Math.max(0, state.matchTime) / 60);
    const secs = Math.floor(Math.max(0, state.matchTime) % 60);
    containerEl.querySelector('#erc-hud-clock').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    containerEl.querySelector('#erc-leg-left').textContent = state.actionBinds.moveLeft.label;
    containerEl.querySelector('#erc-leg-right').textContent = state.actionBinds.moveRight.label;
    containerEl.querySelector('#erc-leg-bomb').textContent = state.actionBinds.bomb.label;
    containerEl.querySelector('#erc-leg-grubber').textContent = state.actionBinds.grubber.label;
    const chipLeg = containerEl.querySelector('#erc-leg-chip');
    if (chipLeg && state.actionBinds.chipKick) chipLeg.textContent = state.actionBinds.chipKick.label;
  }

  function startConversionKick(isHomeKick, scorerNote = 'E', scorerLaneX = 0.5) {
    resetAllBallFlightFlags();
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

    resetAllBallFlightFlags();
    state.playState = 'tryCelebration';
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
    resetAllBallFlightFlags();
    state.possession = possession;
    state.carrierIndex = carrierIdx;
    state.selectedDefenderIdx = carrierIdx;
    state.tackleCount = 0;
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
    if (state.multiplayer.mode === 'host' && state.multiplayer.guestJoined) return false;
    if (state.possession !== 'away' || state.passState.active || state.kickBall.active || state.kick3D.active) return false;
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
    state.passState.elapsed = 0;
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
    resetAllBallFlightFlags();
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
    resetAllBallFlightFlags();
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
      state.playState === 'conversionKick' ||
      state.playState === 'kickoff3D'
    ) {
      return false;
    }
    if (state.playState === 'waitingForPlay') {
      state.playState = 'running';
      assignAiDefenderChasers();
      const p2HumanActive = state.multiplayer.mode === 'host' && state.multiplayer.guestJoined;
      if (state.possession === 'away' && !p2HumanActive && state.awayPlayers[state.carrierIndex]) {
        armDefenderReactionWindow(state.awayPlayers[state.carrierIndex], 'PLAY ON!');
      }
    }
    return true;
  }

  function handleNoteCDEFG(targetIdx) {
    if (state.multiplayer.mode === 'join') {
      sendGuestInputToHost({ type: 'noteDown', note: LANE_NOTES[targetIdx] });
      return;
    }

    if (state.phase === 'coinToss' && !state.coinToss.resolved && !state.coinToss.active) {
      setCoinChoice(targetIdx % 2 === 0 ? 'heads' : 'tails');
      return;
    }
    if (state.phase !== 'playing') return;
    if (state.playState === 'conversionKick') { submitConversionStrike(); return; }
    if (state.playState === 'tryCelebration' || state.playState === 'kickoff3D') return;

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
    if (state.passState.active || state.kickBall.active || state.kick3D.active) return;

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
    state.passState.elapsed = 0;
    state.passState.duration = 0.14 + laneDist * 0.05;
    state.passState.isForwardPass = thrownForward;
  }

  function launchKick(kind, midiKey = null) {
    if (state.multiplayer.mode === 'join') {
      sendGuestInputToHost({ type: 'noteDown', note: midiKey || kind, kickKind: kind });
      return;
    }
    if (state.phase !== 'playing' || state.possession !== 'home') return;
    if (state.playState === 'conversionKick') { submitConversionStrike(); return; }
    if (state.playState === 'tryCelebration') return;
    if (state.kick3D.active && state.kick3D.aiming) {
      release3DKickStrike();
      return;
    }
    if (state.kickBall.active || state.kick3D.active || state.passState.active) return;
    start3DKickAimOrCharge(kind, midiKey);
  }

  function highlightStripButton(letter) {
    if (!containerEl) return;
    const btn = containerEl.querySelector(`.piano-key-btn[data-note="${letter}"]`);
    if (btn) {
      btn.classList.add('active-note');
      setTimeout(() => btn.classList.remove('active-note'), 160);
    }
  }

  function isKickBindMidi(clean) {
    const normalized = normalizeMidiNote(clean);
    return (
      normalizeMidiNote(state.actionBinds.bomb?.midi) === normalized ||
      normalizeMidiNote(state.actionBinds.grubber?.midi) === normalized ||
      normalizeMidiNote(state.actionBinds.chipKick?.midi) === normalized
    );
  }

  function onPianoNoteDown(noteStr) {
    const clean = normalizeMidiNote(noteStr);
    if (!clean) return;

    const freq = getNoteFrequency(clean);
    if (freq) playTone(freq, 0.22, 0.8);
    if (bridgeRef) bridgeRef.highlightKey(noteStr, 200, '#fde047');

    if (state.listeningAction) {
      const action = state.listeningAction;
      const upperNote = clean.toUpperCase();
      state.actionBinds[action] = {
        midi: clean,
        label: `🎹 ${upperNote}`
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

    if (state.multiplayer.mode === 'join') {
      if (normalizeMidiNote(state.actionBinds.moveLeft.midi) === clean) {
        state.moveInput.leftHeld = true;
        sendGuestInputToHost({ type: 'steer', dir: 'leftDown' });
        return;
      }
      if (normalizeMidiNote(state.actionBinds.moveRight.midi) === clean) {
        state.moveInput.rightHeld = true;
        sendGuestInputToHost({ type: 'steer', dir: 'rightDown' });
        return;
      }
      if (normalizeMidiNote(state.actionBinds.bomb?.midi) === clean) {
        sendGuestInputToHost({ type: 'noteDown', note: clean, kickKind: 'bomb' });
        return;
      }
      if (normalizeMidiNote(state.actionBinds.grubber?.midi) === clean) {
        sendGuestInputToHost({ type: 'noteDown', note: clean, kickKind: 'grubber' });
        return;
      }
      if (normalizeMidiNote(state.actionBinds.chipKick?.midi) === clean) {
        sendGuestInputToHost({ type: 'noteDown', note: clean, kickKind: 'chip' });
        return;
      }
      const m = clean.toUpperCase().match(/^([A-G])(#?)/);
      if (m && m[2] !== '#' && NOTE_TO_INDEX[m[1]] !== undefined) {
        highlightStripButton(m[1]);
        sendGuestInputToHost({ type: 'noteDown', note: clean });
      }
      return;
    }

    if (state.phase !== 'playing') return;

    if (state.playState === 'conversionKick') {
      if (normalizeMidiNote(state.actionBinds.moveLeft.midi) === clean) {
        state.moveInput.leftHeld = true; state.moveInput.leftTapTimer = 0.22; return;
      }
      if (normalizeMidiNote(state.actionBinds.moveRight.midi) === clean) {
        state.moveInput.rightHeld = true; state.moveInput.rightTapTimer = 0.22; return;
      }
      submitConversionStrike();
      return;
    }

    if (state.playState === 'tryCelebration') return;

    if (normalizeMidiNote(state.actionBinds.moveLeft.midi) === clean) {
      if (state.possession === 'home' && state.playState !== 'kickoff3D') releasePlayTheBall();
      state.moveInput.leftHeld = true; state.moveInput.leftTapTimer = 0.22; state.moveInput.rightTapTimer = 0;
      return;
    }
    if (normalizeMidiNote(state.actionBinds.moveRight.midi) === clean) {
      if (state.possession === 'home' && state.playState !== 'kickoff3D') releasePlayTheBall();
      state.moveInput.rightHeld = true; state.moveInput.rightTapTimer = 0.22; state.moveInput.leftTapTimer = 0;
      return;
    }

    if (state.playState === 'kickoff3D') {
      if (state.kick3D.kickingSide === 'home') {
        if (!state.kick3D.aiming) {
          start3DKickAimOrCharge('kickoff', clean);
        } else if (performance.now() - (state.kick3D.aimStartedAt || 0) > 120) {
          release3DKickStrike();
        }
      }
      return;
    }

    if (normalizeMidiNote(state.actionBinds.bomb?.midi) === clean) { launchKick('bomb', clean); return; }
    if (normalizeMidiNote(state.actionBinds.grubber?.midi) === clean) { launchKick('grubber', clean); return; }
    if (normalizeMidiNote(state.actionBinds.chipKick?.midi) === clean) { launchKick('chip', clean); return; }

    const m = clean.toUpperCase().match(/^([A-G])(#?)/);
    if (!m || m[2] === '#') return;
    const letter = m[1];
    if (NOTE_TO_INDEX[letter] !== undefined) {
      highlightStripButton(letter);
      handleNoteCDEFG(NOTE_TO_INDEX[letter]);
    }
  }

  function onPianoNoteUp(noteStr) {
    const clean = normalizeMidiNote(noteStr);
    if (!clean) return;

    if (state.multiplayer.mode === 'join') {
      if (normalizeMidiNote(state.actionBinds.moveLeft.midi) === clean) {
        state.moveInput.leftHeld = false;
        sendGuestInputToHost({ type: 'steer', dir: 'leftUp' });
      }
      if (normalizeMidiNote(state.actionBinds.moveRight.midi) === clean) {
        state.moveInput.rightHeld = false;
        sendGuestInputToHost({ type: 'steer', dir: 'rightUp' });
      }
      if (isKickBindMidi(clean)) {
        sendGuestInputToHost({ type: 'noteUp', note: clean });
      }
      return;
    }

    if (normalizeMidiNote(state.actionBinds.moveLeft.midi) === clean) state.moveInput.leftHeld = false;
    if (normalizeMidiNote(state.actionBinds.moveRight.midi) === clean) state.moveInput.rightHeld = false;

    if (state.kick3D.active && state.kick3D.aiming) {
      const heldKey = normalizeMidiNote(state.kick3D.holdMidi);
      if (!heldKey || heldKey === clean || isKickBindMidi(clean) || state.kick3D.kind === 'kickoff') {
        release3DKickStrike();
      }
    }
  }

  async function startMatch() {
    if (state.multiplayer.mode === 'join') return;
    state.listeningAction = null;
    if (state.pokie.spinning) {
      state.pokie.spinning = false;
      state.awayTeam = TEAMS.find((t) => t.id === state.pokie.targetId) || TEAMS[1];
    }
    if (state.multiplayer.mode === 'host' && state.awayTeam.id === state.homeTeam.id) {
      state.awayTeam = TEAMS.find((t) => t.id !== state.homeTeam.id) || TEAMS[1];
    }
    state.homeScore = 0;
    state.awayScore = 0;
    state.matchTime = 120;

    if (state.multiplayer.mode === 'host' && state.multiplayer.connected && state.multiplayer.roomCode && window.firebaseUpdate) {
      try {
        await window.firebaseUpdate(getRugbyRoomRef(state.multiplayer.roomCode), {
          started: true,
          homeTeamId: state.homeTeam.id,
          awayTeamId: state.awayTeam.id
        });
      } catch (e) {}
    }

    triggerCoinFlip();
  }

  function finishMatch() {
    if (state.phase === 'gameover') return;
    state.phase = 'gameover';
    playRefWhistle('long');

    const myScore = state.multiplayer.role === 'away' ? state.awayScore : state.homeScore;
    const oppScore = state.multiplayer.role === 'away' ? state.homeScore : state.awayScore;

    const outcome =
      state.homeScore > state.awayScore
        ? `🏆 ${state.homeTeam.name} Win!`
        : state.awayScore > state.homeScore
        ? `${state.awayTeam.name} Win!`
        : '🤝 Draw Match!';

    const summaryHtml =
      `<strong>${outcome}</strong><br>` +
      `<span style="color:#67e8f9;">${state.homeTeam.name}</span> <b>${state.homeScore}</b> – <b>${state.awayScore}</b> <span style="color:#fda4af;">${state.awayTeam.name}</span>`;

    const finalPoints = Math.max(0, myScore * 100 - oppScore * 25);

    stopErcRugby();
    bridgeRef.finishCustomMiniGame('Scrum & Bass', finalPoints, summaryHtml, () => startErcRugby(bridgeRef, true));
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

  function step3DKickSimulation(dt, userSteerX) {
    const k3 = state.kick3D;
    if (!k3.active) return false;

    if (k3.aiming) {
      if (k3.kickingSide === 'home') {
        if (userSteerX !== 0) {
          k3.aimCurve = Math.max(-1, Math.min(1, k3.aimCurve + userSteerX * 1.45 * dt));
        }
        k3.power += k3.powerDir * k3.powerSpeed * dt;
        if (k3.power >= 1) { k3.power = 1; k3.powerDir = -1; }
        else if (k3.power <= 0.12) { k3.power = 0.12; k3.powerDir = 1; }
      } else if (state.multiplayer.mode === 'host' && state.multiplayer.guestJoined) {
        if (userSteerX !== 0) {
          k3.aimCurve = Math.max(-1, Math.min(1, k3.aimCurve - userSteerX * 1.45 * dt));
        }
        k3.power += k3.powerDir * k3.powerSpeed * dt;
        if (k3.power >= 1) { k3.power = 1; k3.powerDir = -1; }
        else if (k3.power <= 0.12) { k3.power = 0.12; k3.powerDir = 1; }
      } else {
        k3.aiChargeTimer -= dt;
        k3.power = Math.min(0.85, k3.power + 0.65 * dt);
        if (k3.aiChargeTimer <= 0) {
          k3.aimCurve = (Math.random() - 0.5) * 0.7;
          release3DKickStrike();
        }
      }
      recordPlayerVelocities(dt);
      return true;
    }

    const safeDur = Math.max(0.25, k3.flightDuration || 1.15);
    k3.flightElapsed = (k3.flightElapsed || 0) + dt;
    k3.flightProgress = Math.min(1, k3.flightElapsed / safeDur);
    const t = k3.flightProgress;

    k3.vx += k3.curveAccelX * dt;
    k3.x = Math.min(0.92, Math.max(0.08, k3.x + k3.vx * dt));
    k3.y = Math.min(0.89, Math.max(0.11, k3.y + k3.vy * dt));
    k3.z = Math.max(0, Math.sin(t * Math.PI) * (k3.kind === 'grubber' ? 0.07 : 0.48) * (0.45 + k3.power * 0.65));

    const receiverRoster = k3.receiverSide === 'home' ? state.homePlayers : state.awayPlayers;
    for (let i = 0; i < receiverRoster.length; i++) {
      const rec = receiverRoster[i];
      rec.x += (Math.min(0.91, Math.max(0.09, k3.x + (i - 2) * 0.08)) - rec.x) * Math.min(1, dt * 2.4);
      rec.y += (Math.min(0.84, Math.max(0.16, k3.y)) - rec.y) * Math.min(1, dt * 2.2);
    }

    if (k3.kind !== 'kickoff' && k3.z < 0.08 && k3.kickingSide === 'home') {
      for (let i = 0; i < state.homePlayers.length; i++) {
        const att = state.homePlayers[i];
        if (att.offsideOnKick) continue;
        if (Math.hypot(att.x - k3.x, att.y - k3.y) < 0.038) {
          resetAllBallFlightFlags();
          state.carrierIndex = i;
          state.tackleCount = 0;
          state.playState = 'running';
          assignAiDefenderChasers();
          addCallout(`${LANE_NOTES[i]} REGATHERS 3D KICK! SIX AGAIN!`, att.x, att.y - 0.05, '#fde047');
          recordPlayerVelocities(dt);
          return true;
        }
      }
    }

    if (t >= 1 || k3.flightElapsed >= safeDur + 0.1) {
      let bestIdx = 2;
      let bestDist = Infinity;
      for (let i = 0; i < receiverRoster.length; i++) {
        const d = Math.hypot(receiverRoster[i].x - k3.x, receiverRoster[i].y - k3.y);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const catchY = Math.min(0.78, Math.max(0.22, receiverRoster[bestIdx] ? receiverRoster[bestIdx].y : k3.y));
      const wasKickoff = k3.kind === 'kickoff';
      const nextPos = k3.receiverSide;

      resetAllBallFlightFlags();
      setupSetOfSix(nextPos, catchY, bestIdx);
      state.playState = 'running';
      assignAiDefenderChasers();
      const p2HumanActive = state.multiplayer.mode === 'host' && state.multiplayer.guestJoined;
      if (nextPos === 'away' && !p2HumanActive && state.awayPlayers[bestIdx]) {
        armDefenderReactionWindow(state.awayPlayers[bestIdx], wasKickoff ? 'KICKOFF RETURN!' : 'FIELDED!');
      } else {
        addCallout(wasKickoff ? 'KICKOFF RECEIVED! RUN & PASS!' : 'KICK FIELDED! NEW SET!', 0.5, 0.72, '#4ade80');
      }
    }

    recordPlayerVelocities(dt);
    return true;
  }

  function updateSimulation(dt) {
    if (state.multiplayer.mode === 'join') {
      return;
    }

    if (state.phase === 'coinToss') {
      if (state.coinToss.active) {
        state.coinToss.flipTimer += dt;
        if (state.coinToss.flipTimer >= state.coinToss.flipDuration) {
          resolveCoinFlip();
        }
      }
      pushHostSnapshot(false);
      return;
    }

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
      pushHostSnapshot(false);
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
      pushHostSnapshot(false);
      return;
    }

    state.matchTime -= dt;
    if (state.matchTime <= 0) {
      state.matchTime = 0; syncHudAndLegend(); finishMatch(); return;
    }
    syncHudAndLegend();

    let userSteerX = 0;
    if (state.moveInput.leftHeld || state.moveInput.leftTapTimer > 0) userSteerX -= 1;
    if (state.moveInput.rightHeld || state.moveInput.rightTapTimer > 0) userSteerX += 1;

    if (state.kick3D.active) {
      step3DKickSimulation(dt, userSteerX);
      pushHostSnapshot(false);
      return;
    }

    if (state.playState === 'turnoverPause') {
      state.turnoverTimer -= dt; recordPlayerVelocities(dt);
      if (state.turnoverTimer <= 0) setupSetOfSix(state.nextPossession, state.nextStartY, 2);
      pushHostSnapshot(false);
      return;
    }

    const attackers = state.possession === 'home' ? state.homePlayers : state.awayPlayers;
    const defenders = state.possession === 'home' ? state.awayPlayers : state.homePlayers;
    const attackDir = state.possession === 'home' ? -1 : 1;
    const carrier = attackers[state.carrierIndex];
    const p2HumanActive = state.multiplayer.mode === 'host' && state.multiplayer.guestJoined;

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
      pushHostSnapshot(false);
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

      if (state.possession === 'away' && !p2HumanActive) {
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
      pushHostSnapshot(false);
      return;
    }

    if (state.passState.active) {
      const safePassDur = Math.max(0.08, state.passState.duration || 0.2);
      state.passState.elapsed = (state.passState.elapsed || 0) + dt;
      state.passState.progress = Math.min(1, state.passState.elapsed / safePassDur);
      const receiver = attackers[state.passState.toIdx];
      const t = state.passState.progress;

      if (!receiver) {
        state.passState.active = false;
        state.passState.progress = 0;
        state.passState.elapsed = 0;
      } else {
        state.passState.x = state.passState.startX + (receiver.x - state.passState.startX) * t;
        state.passState.y = state.passState.startY + (receiver.y - state.passState.startY) * t;

        if (t >= 1) {
          state.passState.active = false;
          state.passState.progress = 0;
          state.passState.elapsed = 0;
          const landedForward = state.possession === 'home' && (state.passState.isForwardPass || receiver.y < state.passState.startY - 0.008);

          if (landedForward) {
            playErrorClackSound();
            triggerHandover('FORWARD PASS! HANDOVER TO OPPONENT', 'away', Math.max(0.24, receiver.y), '#fb7185', 'long');
            recordPlayerVelocities(dt);
            pushHostSnapshot(true);
            return;
          }

          state.carrierIndex = state.passState.toIdx;
          if (state.possession === 'home' && bridgeRef && bridgeRef.getState().gameStats) bridgeRef.getState().gameStats.perfect += 1;
          attackers.forEach((att, idx) => rollSupportAlignment(att, idx, state.carrierIndex, state.possession === 'home'));

          if (state.possession === 'away' && !p2HumanActive) {
            armDefenderReactionWindow(attackers[state.carrierIndex], 'CAUGHT!');
          }
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
    } else if (p2HumanActive) {
      const p2DownSpeed = state.passState.active ? 0.065 : 0.125;
      activeCarrier.y = Math.min(0.90, activeCarrier.y + p2DownSpeed * dt);
      if (userSteerX !== 0) {
        activeCarrier.x = Math.min(0.91, Math.max(0.09, activeCarrier.x - userSteerX * 0.25 * dt));
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

    if (state.possession === 'away' && !p2HumanActive && state.defSwitchChallenge.active) {
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
        recordPlayerVelocities(dt);
        pushHostSnapshot(true);
        return;
      }
      if (state.possession === 'away' && activeCarrier.y >= 0.88) {
        state.awayScore += 4;
        if (!p2HumanActive) playErrorClackSound();
        triggerTryCelebration('away', LANE_NOTES[state.carrierIndex], state.carrierIndex);
        recordPlayerVelocities(dt);
        pushHostSnapshot(true);
        return;
      }
    }

    state.tacklePause.onsideY += -attackDir * 0.095 * dt;

    for (let i = 0; i < 5; i++) {
      const d = defenders[i];

      if (state.possession === 'away' && !p2HumanActive && d.missedTackleTimer > 0) {
        d.y = Math.min(0.92, d.y + 0.14 * dt);
        continue;
      }

      if (state.possession === 'away' && !p2HumanActive && d.pursuitTimer > 0) {
        const toX = activeCarrier.x - d.x;
        const toY = activeCarrier.y - d.y;
        const dist = Math.max(0.001, Math.hypot(toX, toY));
        const chargeSpeed = 0.26;
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
        d.x += (toX / dist) * 0.175 * dt; d.y += (toY / dist) * 0.145 * dt;
      } else {
        const slideShift = (activeCarrier.x - 0.5) * 0.32;
        const targetX = Math.min(0.91, Math.max(0.09, LANES[i] + slideShift));
        d.x += (targetX - d.x) * Math.min(1, dt * 6.0);
        d.y += (state.tacklePause.onsideY - d.y) * Math.min(1, dt * 5.0);
      }

      if (!state.passState.active && !state.kickBall.active) {
        const hitDist = Math.hypot(d.x - activeCarrier.x, d.y - activeCarrier.y);
        const tackleRadius = state.possession === 'away' && d.pursuitTimer > 0 ? 0.046 : 0.038;
        if (hitDist < tackleRadius) {
          if (state.possession === 'away' && !p2HumanActive && state.defSwitchChallenge.active) {
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
          pushHostSnapshot(true);
          return;
        }
      }
    }

    recordPlayerVelocities(dt);
    pushHostSnapshot(false);
  }

  teamSelectEl.addEventListener('change', async (e) => {
    const picked = TEAMS.find((t) => t.id === e.target.value) || TEAMS[0];
    if (state.multiplayer.mode === 'join') {
      state.awayTeam = picked.id === state.homeTeam.id
        ? (TEAMS.find((t) => t.id !== state.homeTeam.id) || TEAMS[1])
        : picked;
      syncTeamSelectionToUi();
      await sendGuestInputToHost({ type: 'teamSelect', teamId: state.awayTeam.id });
      if (state.multiplayer.connected && state.multiplayer.roomCode && window.firebaseUpdate) {
        try {
          await window.firebaseUpdate(getRugbyRoomRef(state.multiplayer.roomCode), { awayTeamId: state.awayTeam.id });
        } catch (err) {}
      }
      return;
    }

    state.homeTeam = picked;
    if (state.multiplayer.mode === 'host' && state.awayTeam.id === state.homeTeam.id) {
      state.awayTeam = TEAMS.find((t) => t.id !== state.homeTeam.id) || TEAMS[1];
    }
    syncTeamSelectionToUi();
    if (state.multiplayer.mode === 'host' && state.multiplayer.connected && state.multiplayer.roomCode && window.firebaseUpdate) {
      try {
        await window.firebaseUpdate(getRugbyRoomRef(state.multiplayer.roomCode), {
          homeTeamId: state.homeTeam.id,
          awayTeamId: state.awayTeam.id
        });
      } catch (err) {}
    } else {
      startPokieSpin();
    }
  });

  containerEl.querySelector('#erc-mp-solo-btn')?.addEventListener('click', () => linkMultiplayerRoom('solo'));
  containerEl.querySelector('#erc-mp-host-btn')?.addEventListener('click', () => {
    const codeInput = containerEl.querySelector('#erc-mp-code-input');
    if (codeInput && !codeInput.value.trim()) {
      codeInput.value = String(Math.floor(100 + Math.random() * 900));
    }
    state.multiplayer.mode = 'host';
    state.multiplayer.role = 'home';
    updateMultiplayerUi();
    syncTeamSelectionToUi();
  });
  containerEl.querySelector('#erc-mp-join-btn')?.addEventListener('click', () => {
    state.multiplayer.mode = 'join';
    state.multiplayer.role = 'away';
    updateMultiplayerUi();
    syncTeamSelectionToUi();
    containerEl.querySelector('#erc-mp-code-input')?.focus();
  });
  containerEl.querySelector('#erc-mp-connect-btn')?.addEventListener('click', () => {
    const targetMode = state.multiplayer.mode === 'join' ? 'join' : 'host';
    linkMultiplayerRoom(targetMode);
  });

  containerEl.querySelector('#erc-respin-btn')?.addEventListener('click', startPokieSpin);

  containerEl.querySelector('#erc-toss-heads-btn')?.addEventListener('click', () => setCoinChoice('heads'));
  containerEl.querySelector('#erc-toss-tails-btn')?.addEventListener('click', () => setCoinChoice('tails'));
  containerEl.querySelector('#erc-toss-proceed-btn')?.addEventListener('click', () => {
    if (!state.coinToss.resolved) return;
    if (state.multiplayer.mode === 'join') {
      sendGuestInputToHost({ type: 'tossProceed' });
    } else {
      beginKickoffSequence();
    }
  });

  containerEl.querySelectorAll('.erc-key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.listeningAction = btn.getAttribute('data-bind-action');
      containerEl.querySelector('#erc-keybind-notice').textContent =
        `🎹 Listening for ${state.listeningAction.toUpperCase()}... play ANY MIDI piano key (Esc to cancel).`;
      refreshKeybindButtons(); btn.blur();
    });
  });

  containerEl.querySelectorAll('.piano-key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.kick3D.active && state.kick3D.aiming) {
        release3DKickStrike();
        return;
      }
      const note = btn.getAttribute('data-note');
      highlightStripButton(note);
      if (PIANO_FREQS[note]) playTone(PIANO_FREQS[note], 0.22, 0.8);
      handleNoteCDEFG(NOTE_TO_INDEX[note]);
    });
  });

  canvas?.addEventListener('pointerdown', () => {
    if (state.kick3D.active && state.kick3D.aiming && state.kick3D.kickingSide === 'home') {
      release3DKickStrike();
    }
  });

  containerEl.querySelector('#erc-start-match-btn').addEventListener('click', startMatch);

  // QWERTY keyboard input is intentionally disabled; only Escape (cancel bind) and conversion strike keys are handled here
  const onKeyDown = (e) => {
    if (state.listeningAction && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      state.listeningAction = null;
      containerEl.querySelector('#erc-keybind-notice').textContent = 'Binding cancelled.';
      refreshKeybindButtons();
      return;
    }

    if (state.phase === 'playing' && state.playState === 'conversionKick') {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        submitConversionStrike();
      }
    }
  };

  const onKeyUp = () => {};

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });

  initTeamSelectors();
  refreshKeybindButtons();
  updateCoinTossUi();
  updateMultiplayerUi();
  setupSetOfSix('home', 0.82, 2);
  startPokieSpin();

  activeController = {
    onPianoNoteDown,
    onPianoNoteUp,
    cleanup: () => {
      detachMultiplayerRoom();
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    }
  };

  if (autoStart) {
    startMatch();
    resolveCoinFlip();
    beginKickoffSequence();
  }

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
