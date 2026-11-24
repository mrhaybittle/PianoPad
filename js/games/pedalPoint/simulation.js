// js/games/pedalPoint/simulation.js
import { playErrorClackSound } from '../../audio.js';
import {
  TRAIL_LENGTH,
  BIKE_PRESETS,
  TRAIL_ZONES,
  DEFAULT_BINDINGS
} from './constants.js';
import { detectTriadFromPitchClasses } from './musicTheoryUtils.js';
import { CoastalAudioEngine, installSteeringMutePatch } from './audioEngine.js';
import {
  getTrailCenterX,
  getTerrainHeight,
  getTerrainNormal,
  getRainforestBlend,
  isLookoutZ
} from './terrain.js';
import { createParticleSystem } from './particles.js';
import { createPlayerBike, createGhostBike } from './bikeBuilder.js';
import { buildWorld } from './worldBuilder.js';
import { mountPedalPointHUD } from './hud.js';

export function createPedalPointSession(THREE, bridge, autoStart, callbacks) {
  const wrapperParent = document.getElementById('visualizer-wrapper');
  const keyboardEl = document.getElementById('keyboard');
  const statusEl = document.getElementById('status');

  const getViewportDimensions = () => {
    const wrapRect = wrapperParent.getBoundingClientRect();
    let targetW = Math.round(wrapRect.width || wrapperParent.clientWidth || window.innerWidth);
    let targetH = Math.round(wrapRect.height || wrapperParent.clientHeight || 380);

    if (keyboardEl) {
      const kbRect = keyboardEl.getBoundingClientRect();
      if (kbRect.top > wrapRect.top + 80) {
        targetH = Math.round(kbRect.top - wrapRect.top);
      }
    }
    return { w: Math.max(1, targetW), h: Math.max(1, targetH) };
  };

  const { w: initW, h: initH } = getViewportDimensions();
  const hud = mountPedalPointHUD(wrapperParent, initH);
  const { els } = hud;

  const audio = new CoastalAudioEngine();

  // Three.js Scene & Lighting
  const scene = new THREE.Scene();
  const colSkyCoastal = new THREE.Color(0x6bb6e8);
  const colSkyRainforest = new THREE.Color(0x3a6e63);
  const colFogCoastal = new THREE.Color(0xa6d8f5);
  const colFogRainforest = new THREE.Color(0x3f6b5a);
  const colSunCoastal = new THREE.Color(0xfff4d6);
  const colSunRainforest = new THREE.Color(0xdcf5c8);
  const colHemiSkyCoastal = new THREE.Color(0xdff2ff);
  const colHemiSkyRainforest = new THREE.Color(0x7ac79c);

  scene.background = colSkyCoastal.clone();
  scene.fog = new THREE.FogExp2(0xa6d8f5, 0.00095);

  const camera = new THREE.PerspectiveCamera(65, initW / initH, 0.15, 2600);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(initW, initH);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  els.containerEl.insertBefore(renderer.domElement, els.containerEl.firstChild);

  const hemiLight = new THREE.HemisphereLight(0xdff2ff, 0x3b5930, 0.92);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.48);
  sunLight.position.set(40, 85, 35);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const particles = createParticleSystem(THREE, scene);
  const playerBike = createPlayerBike(THREE, scene);
  const ghostBike = createGhostBike(THREE, scene);

  let currentSeed = 2500;
  let worldData = {
    worldGroup: null,
    noteGates: [],
    rhythmRamps: [],
    trailObstacles: [],
    melodyChallenges: [],
    cargoShips: [],
    floatingNotes: [],
    coastalBirds: [],
    hangGliders: []
  };

  // Key Bindings & 4-Step Calibration
  let bindings = JSON.parse(localStorage.getItem('pedalpoint_key_bindings') || 'null') || JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
  hud.updateControlsLabels(bindings);

  const CALIB_ORDER = ['left', 'right', 'jump', 'view'];
  const CALIB_NAMES = {
    left: 'STEER LEFT',
    right: 'STEER RIGHT',
    jump: 'JUMP / PUMP / WHIP',
    view: 'CAMERA VIEW'
  };
  let isCalibrating = false;
  let calibStepIndex = 0;

  function openCalibrationModal() {
    audio.init();
    isCalibrating = true;
    calibStepIndex = 0;
    els.btnCalibSave.style.display = 'none';

    CALIB_ORDER.forEach((slot, idx) => {
      const el = document.getElementById(`pp-slot-${slot}`);
      const keyEl = document.getElementById(`pp-key-${slot}`);
      el.classList.remove('active', 'done');
      if (idx === 0) {
        el.classList.add('active');
        keyEl.textContent = 'Listening...';
      } else {
        keyEl.textContent = bindings[slot].label;
      }
    });

    els.calibPrompt.textContent = `Step 1/4: Play key for ${CALIB_NAMES.left}`;
    els.calibOverlay.style.display = 'flex';
  }

  function closeCalibrationModal() {
    isCalibrating = false;
    els.calibOverlay.style.display = 'none';
    localStorage.setItem('pedalpoint_calibrated_seen', 'true');
    localStorage.setItem('pedalpoint_key_bindings', JSON.stringify(bindings));
    hud.updateControlsLabels(bindings);
  }

  function recordCalibrationInput(bindingObj, feedbackNoteOrMidi = 60) {
    if (!isCalibrating || calibStepIndex >= CALIB_ORDER.length) return;
    const currentSlot = CALIB_ORDER[calibStepIndex];

    for (let i = 0; i < calibStepIndex; i++) {
      const prev = bindings[CALIB_ORDER[i]];
      if (prev.type === bindingObj.type && prev.code === bindingObj.code) {
        els.calibPrompt.textContent = `⚠️ Already used! Pick a different key for ${CALIB_NAMES[currentSlot]}`;
        playErrorClackSound();
        return;
      }
    }

    bindings[currentSlot] = bindingObj;
    audio.playFeedbackNote(feedbackNoteOrMidi);

    const slotEl = document.getElementById(`pp-slot-${currentSlot}`);
    const keyEl = document.getElementById(`pp-key-${currentSlot}`);
    slotEl.classList.remove('active');
    slotEl.classList.add('done');
    keyEl.textContent = bindingObj.label;

    calibStepIndex++;
    if (calibStepIndex < CALIB_ORDER.length) {
      const nextSlot = CALIB_ORDER[calibStepIndex];
      document.getElementById(`pp-slot-${nextSlot}`).classList.add('active');
      document.getElementById(`pp-key-${nextSlot}`).textContent = 'Listening...';
      els.calibPrompt.textContent = `Step ${calibStepIndex + 1}/4: Play key for ${CALIB_NAMES[nextSlot]}`;
    } else {
      els.calibPrompt.textContent = '✅ All 4 controls calibrated!';
      els.btnCalibSave.style.display = 'inline-block';
    }
  }

  els.btnCalibrate.addEventListener('click', () => { openCalibrationModal(); els.btnCalibrate.blur(); });
  els.btnModalRecalib.addEventListener('click', () => { openCalibrationModal(); els.btnModalRecalib.blur(); });
  els.btnCalibSkip.addEventListener('click', () => {
    bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    closeCalibrationModal();
  });
  els.btnCalibSave.addEventListener('click', closeCalibrationModal);

  const hasSeenCalib = Boolean(localStorage.getItem('pedalpoint_calibrated_seen'));
  if (!hasSeenCalib && !autoStart) {
    openCalibrationModal();
  }

  // Session & Physics State
  let isPlaying = false;
  let isFirstPerson = false;
  let showGhost = true;
  let selectedBikeKey = 'enduro';
  let score = 0;
  let combo = 0;
  let maxCombo = 1;
  let maxAirtime = 0;
  let notesAttempted = 0;
  let notesHit = 0;
  let overdriveTimer = 0;
  let lastZoneIdx = -1;
  let bestScore = parseInt(localStorage.getItem('pedalpoint_best_score') || '0', 10);

  let bestGhostFrames = [];
  try {
    bestGhostFrames = JSON.parse(localStorage.getItem('pedalpoint_best_ghost') || '[]') || [];
  } catch (e) {
    bestGhostFrames = [];
  }
  let currentGhostFrames = [];
  let ghostRecordTimer = 0;
  let runElapsedTime = 0;

  if (bestScore > 0) els.valBest.textContent = bestScore.toLocaleString();

  els.btnGhostToggle.addEventListener('click', () => {
    showGhost = !showGhost;
    els.btnGhostToggle.textContent = showGhost ? '👻 Ghost: ON' : '👻 Ghost: OFF';
    ghostBike.ghostRoot.visible = showGhost && isPlaying && bestGhostFrames.length > 1;
    els.btnGhostToggle.blur();
  });

  audio.onBeatCallback = (beatIdx) => {
    if (els.beatLabelEl) els.beatLabelEl.textContent = `${beatIdx + 1}/4`;
    if (els.beatDiamondEl) {
      els.beatDiamondEl.classList.remove('pp-beat-hit');
      void els.beatDiamondEl.offsetWidth;
      els.beatDiamondEl.classList.add('pp-beat-hit');
    }
  };

  document.querySelectorAll('#pp-bike-grid .bike-opt').forEach(card => {
    card.addEventListener('click', () => {
      selectedBikeKey = card.dataset.bike;
      playerBike.setPresetGeometry(selectedBikeKey);
      document.querySelectorAll('#pp-bike-grid .bike-opt').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  const bike = {
    pos: new THREE.Vector3(0, 366, 0),
    vel: new THREE.Vector3(0, 0, -16),
    yaw: 0,
    yawRate: 0,
    smoothSteer: 0,
    steerHoldTime: 0,
    steerAngle: 0,
    leanAngle: 0,
    skidAngle: 0,
    skidIntensity: 0,
    skidSoundCooldown: 0,
    targetSnapX: null,
    grounded: true,
    coyoteTimer: 0.14,
    airTime: 0,
    hopCharge: 0,
    wasCharging: false,
    pumpWindowTimer: 0,
    suspensionComp: 0,
    wheelSpin: 0,
    crankSpin: 0,
    whipAngle: 0,
    whipTarget: 0,
    whipAwarded: false,
    airPitchOffset: 0,
    wheelieAngle: 0,
    wheelieActive: false,
    wheelieChordName: '',
    wheelieScoreAccum: 0,
    edgeGuardCooldown: 0,
    onBridge: false
  };

  const input = {
    left: false,
    right: false,
    jumpHeld: false,
    heldPianoNotes: new Map()
  };

  function toggleCameraMode() {
    isFirstPerson = !isFirstPerson;
    playerBike.headGroup.visible = !isFirstPerson;
    els.btnCamToggle.textContent = isFirstPerson ? '🥽 Helmet Cam' : '🎥 Chase Cam';
    hud.showCallout(isFirstPerson ? 'HELMET CAM' : 'CHASE CAM', '#38bdf8');
  }

  els.btnCamToggle.addEventListener('click', () => {
    toggleCameraMode();
    els.btnCamToggle.blur();
  });

  function addScore(pts, hitNote = false) {
    if (hitNote) {
      combo++;
      notesHit++;
      notesAttempted++;
      if (combo > maxCombo) maxCombo = combo;
      audio.setComboLayer(combo);
      hud.updateEqVisuals(audio.comboLayer);
      if (combo >= 6) overdriveTimer = 4.5;
    }
    const mult = Math.max(1, Math.min(8, 1 + Math.floor(combo / 2)));
    score += Math.round(pts * mult);
    els.valScore.textContent = score.toLocaleString();
    els.valCombo.textContent = `x${mult}`;
  }

  function breakCombo() {
    combo = 0;
    notesAttempted++;
    audio.setComboLayer(0);
    hud.updateEqVisuals(0);
    els.valCombo.textContent = 'x1';
  }

  function evaluateTriadWheelie(nowMs) {
    const activeSet = new Set();
    input.heldPianoNotes.forEach((ts, noteStr) => {
      if (ts === Infinity || (nowMs - ts) < 130) {
        activeSet.add(noteStr);
      }
    });

    const triad = detectTriadFromPitchClasses(activeSet);
    if (triad && isPlaying) {
      const wasWheelie = bike.wheelieActive;
      const prevChord = bike.wheelieChordName;
      bike.wheelieActive = true;
      bike.wheelieChordName = triad.name;
      if (!wasWheelie || prevChord !== triad.name) {
        audio.playWheelieChordShimmer(triad.root);
        addScore(250, true);
        hud.showCallout(`🚵‍♂️ ${triad.name} WHEELIE! +250`, '#c084fc');
        overdriveTimer = Math.max(overdriveTimer, 2.2);

        if (isLookoutZ(bike.pos.z) && Math.random() < 0.45) {
          audio.playPortKemblaFoghorn(triad.root);
        }
      }
    } else {
      bike.wheelieActive = false;
      bike.wheelieChordName = '';
    }
  }

  function triggerHop() {
    const preset = BIKE_PRESETS[selectedBikeKey];
    const chargeBonus = 0.72 + bike.hopCharge * 0.68;
    const isOnBeat = audio.getBeatAccuracy() < 0.18;

    let lipBoost = 1.0;
    const ramps = worldData.rhythmRamps || [];
    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i];
      if (!r.triggered && Math.abs(bike.pos.z - r.z) < 7.0 && Math.abs(bike.pos.x - r.x) < 4.2) {
        r.triggered = true;
        lipBoost = 1.24;
        if (isOnBeat) {
          bike.vel.z -= 5.8;
          addScore(500, true);
          hud.showCallout('PERFECT LIP + BEAT SEND! +500', '#fbbf24');
          particles.spawnDirtRoost(bike.pos, 0, 1, 18, 6.5, 0xfbbf24);
        } else {
          bike.vel.z -= 3.2;
          addScore(240, false);
          hud.showCallout('BIG KICKER LAUNCH! +240', '#34d399');
        }
        break;
      }
    }

    bike.vel.y = preset.hopImpulse * chargeBonus * lipBoost * (isOnBeat ? 1.12 : 1.0);
    bike.grounded = false;
    bike.coyoteTimer = 0;
    bike.whipAwarded = false;
    bike.airPitchOffset = 0.28;
    bike.suspensionComp = 0;

    audio.playJumpPop(isOnBeat || lipBoost > 1.0);
    particles.spawnDirtRoost(bike.pos, 0, 1, 10, 4.2, isOnBeat ? 0x34d399 : 0x8c5730);
    particles.spawnDustCloud(bike.pos, 0, 1, 5, 2.4);
  }

  function handleControlDown(type, code, displayLabel, feedbackNoteOrMidi = 60) {
    if (isCalibrating) {
      recordCalibrationInput({ type, code, label: displayLabel }, feedbackNoteOrMidi);
      return;
    }

    const match = (b) => b.type === type && b.code === code;

    if (!isPlaying) {
      if (match(bindings.jump) && els.overlayEl.style.display !== 'none') {
        startGame();
      }
      return;
    }

    if (type === 'piano') {
      input.heldPianoNotes.set(code, Infinity);
      evaluateTriadWheelie(performance.now());
    }

    if (match(bindings.left) || (type === 'key' && code === 'ArrowLeft')) {
      input.left = true;
      bike.targetSnapX = null;
      return;
    }
    if (match(bindings.right) || (type === 'key' && code === 'ArrowRight')) {
      input.right = true;
      bike.targetSnapX = null;
      return;
    }
    if (match(bindings.jump)) {
      if (bike.grounded || bike.coyoteTimer > 0) {
        input.jumpHeld = true;
        if (bike.pumpWindowTimer > 0) {
          bike.pumpWindowTimer = 0;
          bike.vel.z -= 4.6;
          overdriveTimer = Math.max(overdriveTimer, 1.4);
          addScore(150, false);
          hud.showCallout('⚡ TRANSITION PUMP! +150', '#38bdf8');
          particles.spawnDirtRoost(bike.pos, 0, 1, 10, 4.5, 0x38bdf8);
        }
      } else {
        input.jumpHeld = true;
        bike.whipTarget = 0.95;
        if (!bike.whipAwarded && bike.airTime > 0.22) {
          bike.whipAwarded = true;
          audio.playWhipWhoosh();
          addScore(300, true);
          hud.showCallout('STYLISH TABLETOP WHIP! +300', '#fb923c');
        }
      }
      return;
    }
    if (match(bindings.view)) {
      toggleCameraMode();
      return;
    }

    if (type === 'piano') {
      const pitchMatch = code.match(/^([a-g]#?)/);
      const pitchClass = pitchMatch ? pitchMatch[1] : '';
      let matchedOffset = null;

      const challenges = worldData.melodyChallenges || [];
      for (let i = 0; i < challenges.length; i++) {
        const mc = challenges[i];
        if (bike.pos.z <= mc.triggerZ && bike.pos.z >= mc.endZ && !mc.completed) {
          const nextRow = mc.rows.find(r => !r.resolved);
          if (nextRow) {
            const orbMatch = nextRow.orbs.find(o => o.info.pitchClass === pitchClass);
            if (orbMatch) matchedOffset = orbMatch.info.offset;
          }
        }
      }

      if (matchedOffset !== null) {
        bike.targetSnapX = matchedOffset;
        overdriveTimer = Math.max(overdriveTimer, 1.5);
      } else if (!bike.wheelieActive) {
        bike.vel.z -= 2.2;
        overdriveTimer = Math.max(overdriveTimer, 1.2);
      }
    }
  }

  function handleControlUp(type, code) {
    if (type === 'piano') {
      input.heldPianoNotes.set(code, performance.now());
      evaluateTriadWheelie(performance.now());
    }

    const match = (b) => b.type === type && b.code === code;
    if (match(bindings.left) || (type === 'key' && code === 'ArrowLeft')) {
      input.left = false;
    }
    if (match(bindings.right) || (type === 'key' && code === 'ArrowRight')) {
      input.right = false;
    }
    if (match(bindings.jump)) {
      input.jumpHeld = false;
      bike.whipTarget = 0;
    }
  }

  function onPianoNoteDown(noteStr, bridgeRef) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (!clean) return;
    const upperLabel = `🎹 ${clean.toUpperCase()}`;
    if (bridgeRef) bridgeRef.highlightKey(noteStr, 250, '#34d399');
    handleControlDown('piano', clean, upperLabel, clean);
  }

  function onPianoNoteUp(noteStr) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (!clean) return;
    handleControlUp('piano', clean);
  }

  const onKeyDown = (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.repeat) return;

    const k = e.key.toLowerCase();
    const pianoPadMappedKeys = ['z','s','x','d','c','v','g','b','h','n','j','m',',','l','.','1','q','w','3','e','4','r','5','t','y','7','u','8','i','o','0','p'];
    if (pianoPadMappedKeys.includes(k)) return;

    const label = e.code === 'Space' ? 'Space' : (e.key.length === 1 ? e.key.toUpperCase() : e.code);
    const guessMidi = e.code === 'ArrowLeft' ? 60 : (e.code === 'ArrowRight' ? 64 : (e.code === 'Space' ? 67 : 72));
    handleControlDown('key', e.code, label, guessMidi);
  };

  const onKeyUp = (e) => {
    handleControlUp('key', e.code);
    if (!document.querySelector('#keyboard .key.active')) {
      input.left = false;
      input.right = false;
      input.jumpHeld = false;
      input.heldPianoNotes.clear();
      bike.wheelieActive = false;
    }
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });

  els.btnTouchJump.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (isPlaying) {
      if (bike.grounded || bike.coyoteTimer > 0) {
        bike.hopCharge = 0.65;
        triggerHop();
      } else {
        bike.whipTarget = 0.95;
      }
    }
  });

  let muteControlNotesActive = false;
  installSteeringMutePatch(() => {
    if (!muteControlNotesActive || !isPlaying || isCalibrating) return false;
    if (input.left || input.right) return true;
    const activeKeys = document.querySelectorAll('#keyboard .key.active');
    for (let i = 0; i < activeKeys.length; i++) {
      const noteAttr = (activeKeys[i].dataset.note || activeKeys[i].dataset.key || '').trim().toLowerCase();
      if (!noteAttr) continue;
      if ((bindings.left.type === 'piano' && bindings.left.code === noteAttr) ||
          (bindings.right.type === 'piano' && bindings.right.code === noteAttr)) {
        return true;
      }
    }
    return false;
  });

  function startGame() {
    muteControlNotesActive = true;

    currentSeed = Math.floor(1000 + Math.random() * 8999);
    worldData = buildWorld(THREE, scene, currentSeed, worldData.worldGroup);

    const startX = getTrailCenterX(0);
    const startY = getTerrainHeight(startX, 0);
    bike.pos.set(startX, startY, 0);
    bike.vel.set(0, 0, -16);
    bike.yaw = 0;
    bike.yawRate = 0;
    bike.smoothSteer = 0;
    bike.steerHoldTime = 0;
    bike.steerAngle = 0;
    bike.leanAngle = 0;
    bike.skidAngle = 0;
    bike.skidIntensity = 0;
    bike.skidSoundCooldown = 0;
    bike.targetSnapX = null;
    bike.grounded = true;
    bike.coyoteTimer = 0.14;
    bike.airTime = 0;
    bike.hopCharge = 0;
    bike.wasCharging = false;
    bike.pumpWindowTimer = 0;
    bike.suspensionComp = 0;
    bike.whipAngle = 0;
    bike.whipTarget = 0;
    bike.whipAwarded = false;
    bike.airPitchOffset = 0;
    bike.wheelieAngle = 0;
    bike.wheelieActive = false;
    bike.wheelieChordName = '';
    bike.wheelieScoreAccum = 0;
    bike.edgeGuardCooldown = 0;
    bike.onBridge = false;

    input.left = false;
    input.right = false;
    input.jumpHeld = false;
    input.heldPianoNotes.clear();
    currentGhostFrames = [];
    ghostRecordTimer = 0;
    runElapsedTime = 0;
    ghostBike.ghostRoot.visible = showGhost && bestGhostFrames.length > 1;

    score = 0;
    combo = 0;
    maxCombo = 1;
    maxAirtime = 0;
    notesAttempted = 0;
    notesHit = 0;
    overdriveTimer = 0;
    lastZoneIdx = -1;

    els.valScore.textContent = '0';
    els.valCombo.textContent = 'x1';
    els.valRem.textContent = `${TRAIL_LENGTH}m`;

    audio.setComboLayer(0);
    hud.updateEqVisuals(0);
    audio.start();

    els.overlayEl.style.display = 'none';
    isPlaying = true;
  }

  function finishCourse() {
    isPlaying = false;
    audio.stop();
    muteControlNotesActive = false;
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('pedalpoint_best_score', String(bestScore));
      els.valBest.textContent = bestScore.toLocaleString();
      if (currentGhostFrames.length > 1) {
        bestGhostFrames = currentGhostFrames;
        try {
          localStorage.setItem('pedalpoint_best_ghost', JSON.stringify(bestGhostFrames));
        } catch (e) {}
      }
    }

    const accuracy = notesAttempted > 0 ? Math.round((notesHit / notesAttempted) * 100) : 100;
    const summaryHtml =
      `<span style="color:#34d399; font-weight:900;">🚵‍♂️ ESCARPMENT DESCENT COMPLETE!</span><br>` +
      `Score: <span style="color:#fbbf24; font-size:1.4rem; font-weight:900;">${score.toLocaleString()}</span><br>` +
      `<span style="font-size:0.82rem; color:#38bdf8;">Musical Accuracy: ${accuracy}% • Max Flow: x${maxCombo} • Max Air: ${maxAirtime.toFixed(2)}s</span>`;

    callbacks.onFinish(score, summaryHtml);
  }

  els.btnPlay.addEventListener('click', startGame);

  // Initial Preview World
  playerBike.setPresetGeometry(selectedBikeKey);
  worldData = buildWorld(THREE, scene, currentSeed, worldData.worldGroup);
  const initX = getTrailCenterX(0);
  bike.pos.set(initX, getTerrainHeight(initX, 0), 0);

  const tmpNormal = new THREE.Vector3();
  let lastTime = performance.now();
  let animFrameId = null;

  function animate(now) {
    if (!els.containerEl || !renderer) return;
    animFrameId = requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (isPlaying) {
      runElapsedTime += dt;
      audio.update();

      if (input.heldPianoNotes.size > 0) {
        evaluateTriadWheelie(now);
      }

      if (bike.pumpWindowTimer > 0) {
        bike.pumpWindowTimer = Math.max(0, bike.pumpWindowTimer - dt);
      }

      ghostRecordTimer += dt;
      if (ghostRecordTimer >= 0.1) {
        ghostRecordTimer = 0;
        const cxNow = getTrailCenterX(bike.pos.z);
        currentGhostFrames.push({
          t: Number(runElapsedTime.toFixed(2)),
          dx: Number((bike.pos.x - cxNow).toFixed(2)),
          yOff: Number((bike.pos.y - getTerrainHeight(bike.pos.x, bike.pos.z)).toFixed(2)),
          z: Number(bike.pos.z.toFixed(1)),
          yaw: Number(bike.yaw.toFixed(3)),
          wh: Number(bike.wheelieAngle.toFixed(2))
        });
      }

      const phase = audio.getBeatPhase();
      const pct = phase * 50;
      if (els.beatLeftEl) els.beatLeftEl.style.left = `${pct}%`;
      if (els.beatRightEl) els.beatRightEl.style.right = `${pct}%`;

      const preset = BIKE_PRESETS[selectedBikeKey];
      const normal = getTerrainNormal(THREE, bike.pos.x, bike.pos.z, tmpNormal);

      // Progressive hold-based steering: quick taps give tiny nudges, holding builds up to full carve
      const rawSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      if (rawSteer !== 0) {
        // Reset hold timer immediately if direction reverses
        if (Math.sign(bike.smoothSteer) !== 0 && Math.sign(bike.smoothSteer) !== rawSteer) {
          bike.steerHoldTime = 0;
        }
        bike.steerHoldTime = Math.min(0.85, bike.steerHoldTime + dt);
        // Starts at 22% turn authority on tap, ramping smoothly to 100% after ~0.65s of holding
        const holdGain = 0.22 + 0.78 * Math.pow(bike.steerHoldTime / 0.85, 1.45);
        const targetSteer = rawSteer * holdGain;
        bike.smoothSteer += (targetSteer - bike.smoothSteer) * Math.min(1, dt * 8.5);
      } else {
        bike.steerHoldTime = 0;
        // Snap back to straight promptly when key is released
        bike.smoothSteer += (0 - bike.smoothSteer) * Math.min(1, dt * 14.0);
      }
      bike.steerAngle += (bike.smoothSteer * 0.44 - bike.steerAngle) * Math.min(1, dt * 10.0);

      const grav = 25.0 * (preset.gravityMult || 1.0);
      bike.vel.y -= grav * dt;
      const horizSpeed = Math.hypot(bike.vel.x, bike.vel.z);

      if (bike.grounded) {
        bike.coyoteTimer = 0.14;
        bike.vel.x += normal.x * grav * dt;
        bike.vel.z += normal.z * grav * dt;

        // Downslope pumping bonus: holding Jump while rolling down steep hills/rollers builds free speed
        if (input.jumpHeld && normal.z < -0.06) {
          bike.vel.z += normal.z * 16.0 * dt;
        }

        const fwdX = -Math.sin(bike.yaw);
        const fwdZ = -Math.cos(bike.yaw);
        const wheelieBoost = bike.wheelieActive ? 1.14 : 1.0;
        const boost = (overdriveTimer > 0 ? 1.24 : 1.0) * wheelieBoost;

        if (horizSpeed < preset.maxPedalSpeed * boost) {
          bike.vel.x += fwdX * preset.pedalForce * boost * dt;
          bike.vel.z += fwdZ * preset.pedalForce * boost * dt;
        }

        const targetTurnRate = bike.smoothSteer * (preset.turnSpeed * 1.18) * (0.64 + Math.min(1, horizSpeed / 16) * 0.44);
        bike.yawRate += (targetTurnRate - bike.yawRate) * Math.min(1, dt * (rawSteer !== 0 ? 8.5 : 13.0));
        bike.yaw = Math.max(-0.85, Math.min(0.85, bike.yaw + bike.yawRate * dt));

        // Berm Slingshot: carving high on banked corners adds exit speed
        const cxAtBike = getTrailCenterX(bike.pos.z);
        const distFromCenter = Math.abs(bike.pos.x - cxAtBike);
        if (distFromCenter > 2.2 && distFromCenter < 4.5 && Math.abs(bike.smoothSteer) > 0.35 && horizSpeed > 18) {
          bike.vel.z -= 5.2 * dt;
        }

        const speedNow = Math.hypot(bike.vel.x, bike.vel.z);
        const desiredVx = -Math.sin(bike.yaw) * speedNow;
        const desiredVz = -Math.cos(bike.yaw) * speedNow;

        const rightX = Math.cos(bike.yaw);
        const rightZ = -Math.sin(bike.yaw);
        const lateralSlip = bike.vel.x * rightX + bike.vel.z * rightZ;

        const turnIntensity = Math.abs(bike.yawRate) * Math.max(0, (speedNow - 15) / 24);
        const lateralGrip = Math.max(4.5, 9.2 - turnIntensity * 1.8);

        bike.vel.x += (desiredVx - bike.vel.x) * Math.min(1, dt * lateralGrip);
        bike.vel.z += (desiredVz - bike.vel.z) * Math.min(1, dt * lateralGrip);

        if (bike.targetSnapX !== null) {
          const desiredX = getTrailCenterX(bike.pos.z) + bike.targetSnapX;
          const diffX = desiredX - bike.pos.x;
          bike.pos.x += diffX * Math.min(1, dt * 4.8);
          bike.leanAngle += (Math.max(-0.35, Math.min(0.35, -diffX * 0.14)) - bike.leanAngle) * Math.min(1, dt * 6);
          if (Math.abs(diffX) < 0.08) bike.targetSnapX = null;
        }

        const maxSpd = preset.maxDownhillSpeed * (overdriveTimer > 0 ? 1.16 : 1.0);
        const clampedSpd = Math.hypot(bike.vel.x, bike.vel.z);
        if (clampedSpd > maxSpd) {
          const s = maxSpd / clampedSpd;
          bike.vel.x *= s;
          bike.vel.z *= s;
        }
        // Guarantee steady downhill forward momentum so bike never stalls at 0 km/h
        if (bike.vel.z > -14.0) {
          bike.vel.z = Math.min(-14.0, bike.vel.z - 18.0 * dt);
        }
        bike.whipTarget = 0;

        if (bike.wheelieActive) {
          bike.wheelieScoreAccum += dt * 150;
          if (bike.wheelieScoreAccum >= 25) {
            const pts = Math.floor(bike.wheelieScoreAccum);
            bike.wheelieScoreAccum -= pts;
            addScore(pts, false);
          }
        }

        const skidMetric = Math.abs(lateralSlip) * 0.24 + turnIntensity * 0.52;
        bike.skidIntensity += (Math.min(1.4, skidMetric) - bike.skidIntensity) * Math.min(1, dt * 9);
        const targetSkidYaw = Math.max(-0.32, Math.min(0.32, lateralSlip * 0.05 + bike.yawRate * 0.07));
        bike.skidAngle += (targetSkidYaw - bike.skidAngle) * Math.min(1, dt * 9);

        if (bike.skidIntensity > 0.36 && clampedSpd > 15) {
          const roostDirX = lateralSlip >= 0 ? rightX : -rightX;
          const roostDirZ = lateralSlip >= 0 ? rightZ : -rightZ;
          const rearTirePos = {
            x: bike.pos.x - fwdX * 0.72,
            y: bike.pos.y,
            z: bike.pos.z - fwdZ * 0.72
          };

          const chunkCount = Math.min(6, Math.ceil(bike.skidIntensity * 3.5));
          particles.spawnDirtRoost(rearTirePos, roostDirX, roostDirZ, chunkCount, 4.5 + bike.skidIntensity * 3.5, 0x8c5730);

          if (Math.random() < 0.78) {
            particles.spawnDustCloud(rearTirePos, roostDirX, roostDirZ, 2, 2.5 + bike.skidIntensity * 2.2);
          }

          bike.skidSoundCooldown -= dt;
          if (bike.skidSoundCooldown <= 0) {
            audio.playSkidScrub(Math.min(1, bike.skidIntensity));
            bike.skidSoundCooldown = 0.065;
          }
        }
      } else {
        bike.coyoteTimer = Math.max(0, bike.coyoteTimer - dt);
        bike.airTime += dt;
        if (bike.airTime > maxAirtime) maxAirtime = bike.airTime;
        bike.yawRate += (bike.smoothSteer * 0.9 - bike.yawRate) * Math.min(1, dt * 6.5);
        bike.yaw = Math.max(-0.85, Math.min(0.85, bike.yaw + bike.yawRate * dt));
        bike.skidIntensity *= Math.max(0, 1 - 6 * dt);
        bike.skidAngle += (0 - bike.skidAngle) * Math.min(1, dt * 6);

        const targetAirPitch = input.jumpHeld ? -0.32 : 0.14;
        bike.airPitchOffset += (targetAirPitch - bike.airPitchOffset) * Math.min(1, dt * 6.5);
      }

      if (input.jumpHeld && (bike.grounded || bike.coyoteTimer > 0)) {
        bike.hopCharge = Math.min(1, bike.hopCharge + dt * 2.1);
        bike.wasCharging = true;
        bike.suspensionComp = Math.max(bike.suspensionComp, bike.hopCharge * 0.75);
        els.preloadPill.style.opacity = '1';
        els.preloadPill.textContent = `PRE-LOAD: ${Math.round(bike.hopCharge * 100)}%`;
      } else if (bike.wasCharging) {
        if (bike.grounded || bike.coyoteTimer > 0) triggerHop();
        bike.wasCharging = false;
        bike.hopCharge = 0;
        els.preloadPill.style.opacity = '0';
      }

      bike.pos.addScaledVector(bike.vel, dt);

      // Soft Mountain-Edge Guardrail & Trail Recovery
      const cx = getTrailCenterX(bike.pos.z);
      const offsetFromTrail = bike.pos.x - cx;
      const maxEdgeOffset = 8.5;
      if (bike.edgeGuardCooldown > 0) bike.edgeGuardCooldown -= dt;

      if (Math.abs(offsetFromTrail) > 6.0) {
        const pullSign = offsetFromTrail > 0 ? -1 : 1;
        const edgePenetration = Math.min(1, (Math.abs(offsetFromTrail) - 6.0) / (maxEdgeOffset - 6.0));
        bike.vel.x += pullSign * edgePenetration * 14.0 * dt;
        bike.yaw += (0 - bike.yaw) * Math.min(1, dt * 3.5 * edgePenetration);
      }

      if (Math.abs(offsetFromTrail) > maxEdgeOffset) {
        const clampedSide = Math.sign(offsetFromTrail);
        bike.pos.x = cx + clampedSide * maxEdgeOffset;
        bike.vel.x = -clampedSide * 3.5;
        bike.yaw *= 0.4;
        if (bike.edgeGuardCooldown <= 0) {
          bike.edgeGuardCooldown = 2.0;
          hud.showCallout('TRAIL EDGE GUARD!', '#38bdf8');
          particles.spawnDirtRoost(bike.pos, -clampedSide, 0, 8, 3.8, 0x9b6438);
        }
      }

      // Check Fallen Logs & Wooden North-Shore Bridges
      let bridgeFloorY = -9999;
      bike.onBridge = false;

      const obstacles = worldData.trailObstacles || [];
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        if (obs.type === 'log') {
          if (!obs.resolved && Math.abs(bike.pos.z - obs.z) < 1.35 && Math.abs(bike.pos.x - obs.x) < obs.halfWidth) {
            obs.resolved = true;
            const groundAtLog = getTerrainHeight(bike.pos.x, obs.z);
            const wheelClearance = bike.pos.y - groundAtLog;
            if (wheelClearance >= obs.height * 0.62 || bike.wheelieActive) {
              addScore(250, true);
              bike.vel.z -= 2.4;
              hud.showCallout(bike.wheelieActive ? '🪵 WHEELIE LOG ROLL! +250' : '🪵 CLEAN LOG HOP! +250', '#34d399');
              particles.spawnDirtRoost(bike.pos, 0, 1, 10, 4.5, 0x34d399);
            } else {
              bike.vel.z = Math.min(-13.5, bike.vel.z * 0.72);
              bike.vel.y = Math.max(bike.vel.y, 4.2);
              bike.suspensionComp = 1.0;
              audio.playLandingThud(0.95);
              hud.showCallout('💥 CLIPPED LOG! (HOP OR WHEELIE)', '#f87171');
              particles.spawnDirtRoost(bike.pos, 0, 1, 14, 5.2, 0x5c4033);
            }
          }
        } else if (obs.type === 'bridge') {
          if (Math.abs(bike.pos.z - obs.z) <= obs.halfLen && Math.abs(bike.pos.x - obs.x) <= obs.halfWidth) {
            const startY = getTerrainHeight(obs.x, obs.z + obs.halfLen);
            const endY = getTerrainHeight(obs.x, obs.z - obs.halfLen);
            const t = (obs.z + obs.halfLen - bike.pos.z) / (obs.halfLen * 2);
            const deckY = startY + (endY - startY) * t + 0.42;
            if (bike.pos.y >= deckY - 0.35) {
              bridgeFloorY = Math.max(bridgeFloorY, deckY);
              bike.onBridge = true;
              if (!obs.awarded) {
                obs.awarded = true;
                addScore(220, true);
                bike.vel.z -= 2.8;
                hud.showCallout('🌲 NORTH-SHORE SKINNY! +220', '#fbbf24');
              }
            }
          }
        }
      }

      const terrainY = getTerrainHeight(bike.pos.x, bike.pos.z);
      const groundY = Math.max(terrainY, bridgeFloorY);

      if (bike.pos.y <= groundY + 0.04) {
        const impactVel = -bike.vel.y;
        if (!bike.grounded && bike.airTime > 0.25) {
          const forgive = preset.landingForgiveness || 1.0;
          const comp = Math.min(1, impactVel / (15 * forgive));
          bike.suspensionComp = Math.max(bike.suspensionComp, comp);
          bike.pumpWindowTimer = 0.32;
          audio.playLandingThud(comp);
          particles.spawnDirtRoost(bike.pos, 0, 1, 12, 4.5, 0x9b6438);
          particles.spawnDustCloud(bike.pos, 0, 1, 6, 2.8);

          if (input.jumpHeld && normal.z < -0.05) {
            bike.pumpWindowTimer = 0;
            bike.vel.z -= 4.8;
            addScore(200, false);
            hud.showCallout('⚡ DOWNHILL LANDING PUMP! +200', '#38bdf8');
          }
        }
        bike.pos.y = groundY;
        if (bike.vel.y < 0) bike.vel.y = 0;
        bike.grounded = true;
        bike.airTime = 0;
        bike.airPitchOffset = 0;
      } else if (bike.pos.y > groundY + 0.42) {
        bike.grounded = false;
      }

      bike.suspensionComp = Math.max(0, bike.suspensionComp - preset.suspensionStiffness * 0.12 * dt);
      bike.leanAngle += (bike.smoothSteer * 0.38 - bike.leanAngle) * Math.min(1, dt * 8.5);
      bike.whipAngle += (bike.whipTarget - bike.whipAngle) * Math.min(1, dt * 9);
      const targetWheelie = bike.wheelieActive ? 0.56 : 0;
      bike.wheelieAngle += (targetWheelie - bike.wheelieAngle) * Math.min(1, dt * (bike.wheelieActive ? 7.5 : 10.0));
      if (overdriveTimer > 0) overdriveTimer = Math.max(0, overdriveTimer - dt);

      if (els.wheeliePillEl && els.wheelieChordEl) {
        if (bike.wheelieActive) {
          els.wheeliePillEl.style.display = 'flex';
          els.wheelieChordEl.textContent = bike.wheelieChordName;
        } else {
          els.wheeliePillEl.style.display = 'none';
        }
      }

      for (let i = TRAIL_ZONES.length - 1; i >= 0; i--) {
        if (bike.pos.z <= TRAIL_ZONES[i].z) {
          if (i !== lastZoneIdx) {
            lastZoneIdx = i;
            hud.showCallout(TRAIL_ZONES[i].name, '#38bdf8');
          }
          break;
        }
      }

      let nearestGate = null;
      let nearestGateDist = 999;
      const gates = worldData.noteGates || [];

      for (let i = 0; i < gates.length; i++) {
        const g = gates[i];
        if (g.hit) continue;
        const distAhead = bike.pos.z - g.z;
        if (distAhead > 0 && distAhead < nearestGateDist) {
          nearestGateDist = distAhead;
          nearestGate = g;
        }
        if (Math.abs(bike.pos.z - g.z) < 2.7 && Math.abs(bike.pos.x - g.x) < 3.0) {
          g.hit = true;
          g.mesh.visible = false;
          audio.playNoteTrigger(g.note.freq, combo >= 4);
          addScore(200, true);
          hud.showCallout(`♪ ${g.note.name} NOTE! +200`, g.note.hex);
          particles.spawnDirtRoost(bike.pos, 0, 1, 14, 5.5, g.note.color);
        } else if (bike.pos.z < g.z - 4.0) {
          g.hit = true;
        }
      }

      let inMelodyZone = false;
      let activeMelodyRowInfo = null;
      let activeMelodyRowDist = 999;
      const challenges = worldData.melodyChallenges || [];

      for (let i = 0; i < challenges.length; i++) {
        const mc = challenges[i];
        if (bike.pos.z <= mc.triggerZ && bike.pos.z >= mc.endZ && !mc.completed) {
          inMelodyZone = true;
          if (!mc.announced && els.notesRowEl && els.bannerEl) {
            mc.announced = true;
            const noteSeqLabels = mc.seq.map((laneIdx, idx) => mc.rows[idx].orbs[laneIdx].info.label).join(' → ');
            hud.showCallout(`🎹 UPCOMING MELODY: ${noteSeqLabels}`, '#fbbf24');

            els.notesRowEl.innerHTML = '';
            mc.seq.forEach((laneIdx, idx) => {
              const info = mc.rows[idx].orbs[laneIdx].info;
              const pill = document.createElement('div');
              pill.style.cssText = `
                width:44px; height:44px; border-radius:12px;
                display:flex; align-items:center; justify-content:center;
                font-weight:900; font-size:17px; color:#ffffff;
                border: 2px solid #ffffff;
                box-shadow: 0 4px 12px rgba(0,0,0,0.55);
                text-shadow: 0 1px 3px rgba(0,0,0,0.75);
                background:${info.hex};
                transition: transform 0.2s ease, opacity 0.2s ease;
              `;
              pill.textContent = `♪${info.label}`;
              els.notesRowEl.appendChild(pill);
              setTimeout(() => {
                audio.playNoteTrigger(info.freq, false);
                pill.classList.add('pp-note-speaking');
                setTimeout(() => pill.classList.remove('pp-note-speaking'), 380);
              }, idx * 290);
            });
            els.bannerEl.style.display = 'flex';
          }

          let foundNextUnresolved = false;
          mc.rows.forEach((row, rIdx) => {
            if (row.resolved) return;

            const targetOrb = row.orbs[row.targetLane];
            if (!foundNextUnresolved) {
              foundNextUnresolved = true;
              activeMelodyRowInfo = targetOrb.info;
              activeMelodyRowDist = Math.max(0, bike.pos.z - row.z);

              if (targetOrb.ringMesh) {
                const pulse = 1.15 + Math.sin(now * 0.012) * 0.22;
                targetOrb.ringMesh.scale.set(pulse, pulse, 1);
              }
              if (targetOrb.beamMesh) {
                targetOrb.beamMesh.material.opacity = 0.42;
              }
              const pill = els.notesRowEl ? els.notesRowEl.children[rIdx] : null;
              if (pill) {
                pill.style.transform = 'scale(1.18)';
                pill.style.borderColor = '#fde047';
              }
            }

            if (Math.abs(bike.pos.z - row.z) < 2.8) {
              row.resolved = true;
              let bestLane = 1;
              let bestDist = 999;
              row.orbs.forEach(o => {
                const d = Math.abs(bike.pos.x - o.x);
                if (d < bestDist) { bestDist = d; bestLane = o.lane; }
              });

              const pill = els.notesRowEl ? els.notesRowEl.children[rIdx] : null;
              if (bestLane === row.targetLane && bestDist < 2.5) {
                mc.hits++;
                const hitOrb = row.orbs[bestLane];
                hitOrb.mesh.visible = false;
                audio.playNoteTrigger(hitOrb.info.freq, true);
                addScore(350, true);
                particles.spawnDirtRoost(bike.pos, 0, 1, 16, 6.2, hitOrb.info.color);
                if (pill) {
                  pill.style.transform = 'scale(1.24)';
                  pill.style.boxShadow = '0 0 18px #ffffff';
                }
              } else {
                audio.playMissBuzz();
                breakCombo();
                if (pill) {
                  pill.style.transform = 'scale(0.92)';
                  pill.style.opacity = '0.25';
                }
              }

              if (rIdx === mc.rows.length - 1) {
                mc.completed = true;
                if (mc.hits === 4) {
                  addScore(1000, true);
                  hud.showCallout('MELODY MASTERED! +1000', '#e879f9');
                } else {
                  hud.showCallout(`MELODY ${mc.hits}/4`, '#38bdf8');
                }
                setTimeout(() => { if (els.bannerEl) els.bannerEl.style.display = 'none'; }, 1100);
              }
            }
          });
        }
      }
      if (!inMelodyZone && els.bannerEl && els.bannerEl.style.display !== 'none') {
        els.bannerEl.style.display = 'none';
      }

      if (activeMelodyRowInfo && els.nextGatePillEl) {
        els.nextGatePillEl.style.display = 'flex';
        els.nextGateTitleEl.textContent = 'TARGET NOTE';
        els.nextGatePillEl.style.borderColor = activeMelodyRowInfo.hex;
        els.nextGateBadgeEl.style.background = activeMelodyRowInfo.hex;
        els.nextGateBadgeEl.textContent = `♪ ${activeMelodyRowInfo.label}`;
        els.nextGateDistEl.textContent = `${Math.round(activeMelodyRowDist)}m`;
      } else if (nearestGate && nearestGateDist < 130 && els.nextGatePillEl) {
        els.nextGatePillEl.style.display = 'flex';
        els.nextGateTitleEl.textContent = 'NEXT GATE';
        els.nextGatePillEl.style.borderColor = nearestGate.note.hex;
        els.nextGateBadgeEl.style.background = nearestGate.note.hex;
        els.nextGateBadgeEl.textContent = `♪ ${nearestGate.note.name}`;
        els.nextGateDistEl.textContent = `${Math.round(nearestGateDist)}m`;
      } else if (els.nextGatePillEl) {
        els.nextGatePillEl.style.display = 'none';
      }

      const speedKmh = Math.round(Math.hypot(bike.vel.x, bike.vel.z) * 3.6);
      const rem = Math.max(0, Math.round(TRAIL_LENGTH + bike.pos.z));
      els.valSpeed.textContent = `${speedKmh} km/h`;
      els.valRem.textContent = `${rem}m`;

      if (bike.pos.z <= -TRAIL_LENGTH) {
        finishCourse();
        return;
      }
    }

    particles.update(dt);

    // Ghost Rider Playback
    if (showGhost && isPlaying && bestGhostFrames.length > 1) {
      ghostBike.ghostRoot.visible = true;
      let fIdx = 0;
      while (fIdx < bestGhostFrames.length - 2 && bestGhostFrames[fIdx + 1].t < runElapsedTime) {
        fIdx++;
      }
      const fA = bestGhostFrames[fIdx];
      const fB = bestGhostFrames[fIdx + 1];
      const span = Math.max(0.001, fB.t - fA.t);
      const alpha = Math.max(0, Math.min(1, (runElapsedTime - fA.t) / span));

      const gZ = fA.z + (fB.z - fA.z) * alpha;
      const gDx = fA.dx + (fB.dx - fA.dx) * alpha;
      const gYOff = fA.yOff + (fB.yOff - fA.yOff) * alpha;
      const gYaw = fA.yaw + (fB.yaw - fA.yaw) * alpha;
      const gWh = (fA.wh || 0) + ((fB.wh || 0) - (fA.wh || 0)) * alpha;

      const gX = getTrailCenterX(gZ) + gDx;
      const gY = getTerrainHeight(gX, gZ) + gYOff;
      ghostBike.ghostRoot.position.set(gX, gY, gZ);
      ghostBike.ghostRoot.rotation.set(0, gYaw, 0);
      ghostBike.ghostPivot.rotation.x = gWh;
    } else {
      ghostBike.ghostRoot.visible = false;
    }

    // Visual Bike, Rider & Camera Sync
    const preset = BIKE_PRESETS[selectedBikeKey];
    playerBike.bikeRoot.position.copy(bike.pos);
    playerBike.bikeRoot.rotation.set(0, bike.yaw, 0);

    const fwdX = -Math.sin(bike.yaw);
    const fwdZ = -Math.cos(bike.yaw);
    const hAhead = getTerrainHeight(bike.pos.x + fwdX * 1.1, bike.pos.z + fwdZ * 1.1);
    const hBehind = getTerrainHeight(bike.pos.x - fwdX * 1.1, bike.pos.z - fwdZ * 1.1);
    const slopePitch = Math.atan2(hAhead - hBehind, 2.2);
    const airPitch = Math.max(-0.55, Math.min(0.6, bike.vel.y * 0.028 + bike.airPitchOffset));
    playerBike.bikeVisual.rotation.x += ((bike.grounded ? slopePitch : airPitch) - playerBike.bikeVisual.rotation.x) * 0.18;
    playerBike.bikeVisual.rotation.z = bike.leanAngle;
    playerBike.bikeVisual.rotation.y = bike.whipAngle + bike.skidAngle;
    playerBike.wheeliePivot.rotation.x = bike.wheelieAngle;

    const travel = bike.suspensionComp * preset.forkTravel;
    playerBike.chassisGroup.position.y = -travel * 0.55;
    playerBike.forkLowers.position.y = travel * 0.52;
    playerBike.steerGroup.rotation.y = bike.steerAngle - (bike.whipAngle + bike.skidAngle) * 0.65;

    const spd = Math.hypot(bike.vel.x, bike.vel.z);
    bike.wheelSpin += spd * dt * 2.75;
    if (bike.grounded) bike.crankSpin += dt * 9.0;
    playerBike.frontWheel.rotation.x = -bike.wheelSpin;
    playerBike.rearWheel.rotation.x = -bike.wheelSpin;
    playerBike.crankGroup.rotation.x = -bike.crankSpin;

    const crouch = bike.hopCharge * 0.22 + bike.suspensionComp * 0.16;
    const wheelieShift = bike.wheelieAngle * 0.35;
    playerBike.riderGroup.position.y = 1.15 - crouch - wheelieShift * 0.25;
    playerBike.riderGroup.position.z = 0.25 + wheelieShift;
    playerBike.torsoGroup.rotation.x = 0.48 + crouch * 0.9 - wheelieShift * 0.85;
    playerBike.torsoGroup.rotation.y = -(bike.whipAngle + bike.skidAngle) * 0.6;
    playerBike.riderLegs.forEach((leg, idx) => {
      const phase = bike.crankSpin + idx * Math.PI;
      leg.group.rotation.x = bike.grounded ? Math.sin(phase) * 0.28 : crouch * 0.8;
    });

    const groundY = getTerrainHeight(bike.pos.x, bike.pos.z);
    const alt = Math.max(0, bike.pos.y - groundY);
    playerBike.groundShadow.position.y = -alt + 0.05;
    const sScale = Math.max(0.35, 1 - alt * 0.09);
    playerBike.groundShadow.scale.set(sScale, sScale, sScale);
    playerBike.groundShadow.material.opacity = Math.max(0.08, 0.34 - alt * 0.035);

    const fNotes = worldData.floatingNotes || [];
    for (let i = 0; i < fNotes.length; i++) {
      const fn = fNotes[i];
      if (fn.mesh && fn.mesh.visible) {
        fn.mesh.rotation.y = now * 0.0022 + fn.phase;
        fn.mesh.position.y = fn.baseY + Math.sin(now * 0.0035 + fn.phase) * 0.14;
      }
    }

    const birds = worldData.coastalBirds || [];
    for (let i = 0; i < birds.length; i++) {
      const cb = birds[i];
      const flap = Math.sin(now * 0.016 + cb.phase) * 0.55;
      cb.leftWing.rotation.z = flap;
      cb.rightWing.rotation.z = -flap;

      if (!cb.startled && isPlaying && Math.abs(bike.pos.z - cb.mesh.position.z) < 55) {
        cb.startled = true;
        cb.startleVel.set(-7 - Math.random() * 5, 4.5 + Math.random() * 3.5, -8 - Math.random() * 6);
      }

      if (cb.startled) {
        cb.mesh.position.addScaledVector(cb.startleVel, dt);
        cb.mesh.rotation.y = 0.65;
      } else {
        cb.mesh.position.x = cb.originX + Math.cos(now * 0.001 + cb.phase) * 4.5;
        cb.mesh.position.y = cb.originY + Math.sin(now * 0.002 + cb.phase) * 1.4;
        cb.mesh.position.z = cb.originZ + Math.sin(now * 0.001 + cb.phase) * 4.5;
        cb.mesh.rotation.y = -(now * 0.001 + cb.phase);
      }
    }

    const gliders = worldData.hangGliders || [];
    for (let i = 0; i < gliders.length; i++) {
      const hg = gliders[i];
      const ang = now * 0.001 * hg.speed + hg.phase;
      const nx = hg.centerX + Math.cos(ang) * hg.radiusX;
      const nz = hg.centerZ + Math.sin(ang) * hg.radiusZ;
      const ny = hg.centerY + Math.sin(ang * 2) * 3.5;
      hg.mesh.rotation.y = -ang;
      hg.mesh.rotation.z = 0.18;
      hg.mesh.position.set(nx, ny, nz);
    }

    const ships = worldData.cargoShips || [];
    for (let i = 0; i < ships.length; i++) {
      const cs = ships[i];
      cs.mesh.position.z += cs.speed * dt;
      if (cs.mesh.position.z > 200) cs.mesh.position.z = -2600;
      if (cs.mesh.position.z < -2700) cs.mesh.position.z = 100;
    }

    const rfNow = getRainforestBlend(bike.pos.z);
    scene.background.copy(colSkyCoastal).lerp(colSkyRainforest, rfNow * 0.72);
    scene.fog.color.copy(colFogCoastal).lerp(colFogRainforest, rfNow * 0.78);
    scene.fog.density = 0.00095 + (0.0042 - 0.00095) * rfNow;
    sunLight.color.copy(colSunCoastal).lerp(colSunRainforest, rfNow * 0.65);
    sunLight.intensity = 1.48 + (1.15 - 1.48) * rfNow;
    hemiLight.color.copy(colHemiSkyCoastal).lerp(colHemiSkyRainforest, rfNow * 0.7);

    sunLight.position.set(bike.pos.x + 38, bike.pos.y + 72, bike.pos.z + 32);
    sunLight.target.position.copy(bike.pos);
    sunLight.target.updateMatrixWorld();

    if (!isPlaying) {
      const ang = now * 0.00035;
      camera.position.set(bike.pos.x + Math.sin(ang) * 4.6, bike.pos.y + 2.0, bike.pos.z + Math.cos(ang) * 4.6);
      camera.lookAt(bike.pos.x, bike.pos.y + 1.0, bike.pos.z - 0.5);
    } else if (isFirstPerson) {
      camera.position.set(bike.pos.x + fwdX * 0.25, bike.pos.y + 1.65 + bike.wheelieAngle * 0.55, bike.pos.z + fwdZ * 0.25);
      camera.lookAt(bike.pos.x + fwdX * 14, bike.pos.y + 0.85 + bike.wheelieAngle * 6.5, bike.pos.z + fwdZ * 14);
    } else {
      const camYaw = bike.yaw * 0.45;
      const camX = bike.pos.x + Math.sin(camYaw) * 5.8;
      const camZ = bike.pos.z + Math.cos(camYaw) * 5.8;
      const camGround = getTerrainHeight(camX, camZ);
      const targetY = Math.max(camGround + 0.9, bike.pos.y + 2.65);
      camera.position.lerp(new THREE.Vector3(camX, targetY, camZ), Math.min(1, dt * 9.5));
      camera.lookAt(bike.pos.x - Math.sin(camYaw) * 7, bike.pos.y + 1.15, bike.pos.z - Math.cos(camYaw) * 7);
    }

    renderer.render(scene, camera);
  }

  const onResize = () => {
    if (!els.containerEl || !renderer || !wrapperParent) return;
    const { w, h } = getViewportDimensions();
    els.containerEl.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
  };

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(wrapperParent);
    if (keyboardEl) resizeObserver.observe(keyboardEl);
  }
  window.addEventListener('resize', onResize);
  requestAnimationFrame(onResize);

  if (autoStart) {
    startGame();
    if (statusEl) statusEl.textContent = '🚵‍♂️ Pedal Point Restarted! Carve down the Illawarra Escarpment!';
  } else {
    if (statusEl) statusEl.textContent = '🚵‍♂️ Pedal Point Ready! Play your calibrated Piano Keys to carve the trail!';
  }

  animFrameId = requestAnimationFrame(animate);

  return {
    onPianoNoteDown,
    onPianoNoteUp,
    cleanup: () => {
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      audio.stop();
      muteControlNotesActive = false;
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('resize', onResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (renderer) {
        try { renderer.dispose(); } catch (e) {}
      }
      if (els.containerEl) {
        els.containerEl.remove();
      }
    }
  };
}
