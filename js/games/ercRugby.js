// js/games/ercRugby.js
import { initAudio, audioCtx, playTone } from '../audio.js';
import { getNoteFrequency } from '../musicTheory.js';

let animFrameId = null;
let containerEl = null;
let bridgeRef = null;
let activeController = null;

const TEAMS = [
  { id: 'brisbane-broncos', name: 'Brisbane Broncos', primary: '#6b1d2f', secondary: '#fbbf24', chant: 'Buck up, Broncos!' },
  { id: 'canberra-raiders', name: 'Canberra Raiders', primary: '#65a30d', secondary: '#1e3a8a', chant: 'We are the Raiders!' },
  { id: 'canterbury-bulldogs', name: 'Canterbury-Bankstown Bulldogs', primary: '#1d4ed8', secondary: '#ffffff', chant: 'Fire up, Doggies!' },
  { id: 'cronulla-sharks', name: 'Cronulla-Sutherland Sharks', primary: '#0284c7', secondary: '#111827', chant: 'Up, up Cronulla!' },
  { id: 'dolphins', name: 'Dolphins', primary: '#dc2626', secondary: '#fde047', chant: 'Phins up!' },
  { id: 'gold-coast-titans', name: 'Gold Coast Titans', primary: '#0369a1', secondary: '#facc15', chant: 'Titans roar!' },
  { id: 'manly-sea-eagles', name: 'Manly Warringah Sea Eagles', primary: '#7f1d1d', secondary: '#ffffff', chant: 'Manly! Manly!' },
  { id: 'melbourne-storm', name: 'Melbourne Storm', primary: '#312e81', secondary: '#facc15', chant: 'Storm warning!' },
  { id: 'newcastle-knights', name: 'Newcastle Knights', primary: '#1e3a8a', secondary: '#dc2626', chant: 'Go the Knights!' },
  { id: 'nz-warriors', name: 'New Zealand Warriors', primary: '#111827', secondary: '#16a34a', chant: 'New Zealand Warriors!' },
  { id: 'nq-cowboys', name: 'North Queensland Cowboys', primary: '#0f172a', secondary: '#facc15', chant: 'Cowboys country!' },
  { id: 'parramatta-eels', name: 'Parramatta Eels', primary: '#1d4ed8', secondary: '#facc15', chant: 'Parra! Parra!' },
  { id: 'penrith-panthers', name: 'Penrith Panthers', primary: '#18181b', secondary: '#f43f5e', chant: 'Let’s go Panthers!' },
  { id: 'souths-rabbitohs', name: 'South Sydney Rabbitohs', primary: '#15803d', secondary: '#dc2626', chant: 'Glory, glory to South Sydney!' },
  { id: 'st-george-illawarra-dragons', name: 'St. George Illawarra Dragons', primary: '#b91c1c', secondary: '#ffffff', chant: 'Up the Dragons!' },
  { id: 'sydney-roosters', name: 'Sydney Roosters', primary: '#1e3a8a', secondary: '#dc2626', chant: 'Easts to win!' },
  { id: 'wests-tigers', name: 'Wests Tigers', primary: '#ea580c', secondary: '#18181b', chant: 'Tigers charge!' },
  { id: 'perth-bears', name: 'Perth Bears', primary: '#dc2626', secondary: '#111827', chant: 'Bears on the prowl!' }
];

const LANE_NOTES = ['c', 'd', 'e', 'f', 'g'];
const LANE_POSITIONS = { c: 0.16, d: 0.33, e: 0.5, f: 0.67, g: 0.84 };

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
  stopErcRugby();
  bridgeRef = bridge;

  bridge.exitActiveMiniGame();
  document.getElementById('game-results-modal')?.classList.remove('open');
  document.getElementById('arcade-hub')?.classList.remove('open');

  bridge.setActiveMiniGame('ercRugby');
  bridge.resetGameStats();

  const wrapperParent = document.getElementById('visualizer-wrapper');
  containerEl = document.createElement('div');
  containerEl.id = 'erc-rugby-container';
  containerEl.style.cssText = `
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 25;
    overflow: hidden;
    background: #07131d;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #f8fafc;
    user-select: none;
    -webkit-user-select: none;
  `;

  containerEl.innerHTML = `
    <style>
      #erc-rugby-container * { box-sizing: border-box; }
      #erc-rugby-canvas { display: block; width: 100%; height: 100%; }
      .erc-badge {
        transform: skewX(-14deg);
        border: 2px solid #ffffff;
        background: linear-gradient(90deg, #dc2626 0%, #ffffff 50%, #1d4ed8 100%);
        padding: 3px 10px;
        border-radius: 5px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.45);
      }
      .erc-badge-inner {
        transform: skewX(14deg);
        display: flex;
        align-items: baseline;
        gap: 5px;
        font-weight: 900;
        font-style: italic;
      }
      #erc-hud {
        position: absolute; top: 10px; right: 12px; z-index: 10;
        display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
        pointer-events: none;
      }
      #erc-scoreboard {
        background: rgba(2, 6, 23, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 10px; padding: 6px 12px;
        display: flex; align-items: center; gap: 10px;
      }
      #erc-legend {
        position: absolute; bottom: 10px; left: 12px; z-index: 10;
        background: rgba(2, 6, 23, 0.86);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px; padding: 6px 10px;
        font-size: 11px; font-weight: 700; color: #e2e8f0;
        pointer-events: none;
      }
      #erc-setup-modal {
        position: absolute; inset: 0; z-index: 20;
        background: rgba(2, 6, 23, 0.85);
        backdrop-filter: blur(5px);
        display: flex; align-items: center; justify-content: center;
        padding: 12px;
      }
      .erc-card {
        background: #0f172a;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 14px; padding: 16px 20px;
        max-width: 540px; width: 100%;
      }
      .erc-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
      .erc-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
      .erc-box {
        background: rgba(2, 6, 23, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px; padding: 10px;
      }
      .erc-select, .erc-bind-btn {
        width: 100%; border-radius: 8px; padding: 7px 9px;
        font-size: 12px; font-weight: 700; cursor: pointer;
      }
      .erc-select {
        background: #1e293b; color: #fff; border: 1px solid rgba(255,255,255,0.2);
      }
      .erc-bind-btn {
        background: rgba(56, 189, 248, 0.15); color: #e0f2fe;
        border: 1px solid rgba(56, 189, 248, 0.45);
      }
      #erc-start-btn {
        margin-top: 12px; width: 100%; padding: 10px 16px;
        border: none; border-radius: 10px; cursor: pointer;
        font-size: 14px; font-weight: 900; text-transform: uppercase;
        color: #fff; background: linear-gradient(90deg, #dc2626, #2563eb);
      }
    </style>

    <canvas id="erc-rugby-canvas"></canvas>

    <div id="erc-hud" style="display:none;">
      <div class="erc-badge">
        <div class="erc-badge-inner">
          <span style="color:#b91c1c; font-size:13px;">ERC</span>
          <span style="color:#1e3a8a; font-size:10px;">SPORTS</span>
        </div>
      </div>
      <div id="erc-scoreboard">
        <div style="text-align:right;">
          <div id="erc-hud-home-name" style="font-size:10px; font-weight:800; color:#67e8f9;">HOME</div>
          <div id="erc-hud-home-score" style="font-size:18px; font-weight:900; line-height:1;">0</div>
        </div>
        <div style="padding:0 8px; border-left:1px solid rgba(255,255,255,0.15); border-right:1px solid rgba(255,255,255,0.15); text-align:center;">
          <div id="erc-hud-clock" style="font-size:12px; font-weight:900; color:#fcd34d;">01:30</div>
          <div style="font-size:9px; color:#94a3b8;">VS</div>
        </div>
        <div style="text-align:left;">
          <div id="erc-hud-away-name" style="font-size:10px; font-weight:800; color:#fda4af;">AWAY</div>
          <div id="erc-hud-away-score" style="font-size:18px; font-weight:900; line-height:1;">0</div>
        </div>
      </div>
    </div>

    <div id="erc-legend" style="display:none;">
      Piano Lanes: <b>C D E F G</b> • Run: <b id="erc-leg-surge">W</b> • Bomb: <b id="erc-leg-bomb">B</b> • Grubber: <b id="erc-leg-grubber">N</b>
    </div>

    <div id="erc-setup-modal">
      <div class="erc-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div>
            <div style="font-size:18px; font-weight:900; font-style:italic;">ERC SPORTS RUGBY</div>
            <div style="font-size:11px; color:#94a3b8;">Play C–G notes to sidestep lanes, score tries, and kick bombs/grubbers.</div>
          </div>
          <div class="erc-badge">
            <div class="erc-badge-inner">
              <span style="color:#b91c1c; font-size:13px;">ERC</span>
              <span style="color:#1e3a8a; font-size:10px;">SPORTS</span>
            </div>
          </div>
        </div>

        <div class="erc-grid-2">
          <div class="erc-box">
            <label for="erc-home-select" style="display:block; font-size:10px; font-weight:800; color:#67e8f9; margin-bottom:4px;">YOUR TEAM</label>
            <select id="erc-home-select" class="erc-select"></select>
            <div id="erc-home-chant" style="font-size:11px; color:#cbd5e1; margin-top:6px;"></div>
          </div>
          <div class="erc-box">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-size:10px; font-weight:800; color:#fcd34d;">OPPONENT REEL</span>
              <button type="button" id="erc-respin-btn" style="background:#f59e0b; color:#0f172a; border:none; border-radius:5px; padding:2px 7px; font-size:10px; font-weight:900; cursor:pointer;">Spin</button>
            </div>
            <div id="erc-away-name" style="font-size:14px; font-weight:900; color:#fff;">--</div>
            <div id="erc-away-chant" style="font-size:11px; color:#fde68a; margin-top:4px;">--</div>
          </div>
        </div>

        <div class="erc-grid-3">
          <button type="button" class="erc-bind-btn" data-action="surge" id="erc-bind-surge">Run: W</button>
          <button type="button" class="erc-bind-btn" data-action="bomb" id="erc-bind-bomb">Bomb: B</button>
          <button type="button" class="erc-bind-btn" data-action="grubber" id="erc-bind-grubber">Grubber: N</button>
        </div>
        <div id="erc-bind-status" style="font-size:11px; color:#fcd34d; margin-top:6px; min-height:14px;"></div>

        <button type="button" id="erc-start-btn">Kick Off Match</button>
      </div>
    </div>
  `;

  if (wrapperParent) {
    wrapperParent.style.position = 'relative';
    wrapperParent.appendChild(containerEl);
  } else {
    document.body.appendChild(containerEl);
  }

  const canvas = containerEl.querySelector('#erc-rugby-canvas');
  const ctx = canvas.getContext('2d');
  const hudEl = containerEl.querySelector('#erc-hud');
  const legendEl = containerEl.querySelector('#erc-legend');
  const setupModalEl = containerEl.querySelector('#erc-setup-modal');
  const homeSelectEl = containerEl.querySelector('#erc-home-select');
  const homeChantEl = containerEl.querySelector('#erc-home-chant');
  const awayNameEl = containerEl.querySelector('#erc-away-name');
  const awayChantEl = containerEl.querySelector('#erc-away-chant');
  const bindStatusEl = containerEl.querySelector('#erc-bind-status');

  const game = {
    phase: 'setup', // 'setup' | 'playing' | 'finished'
    homeTeam: TEAMS[0],
    awayTeam: TEAMS[1],
    homeScore: 0,
    awayScore: 0,
    matchTime: 90,
    keys: { surge: 'W', bomb: 'B', grubber: 'N' },
    listeningAction: null,
    pokie: { spinning: false, timer: 0, duration: 1.0, tick: 0, idx: 1, targetId: TEAMS[1].id },
    player: { x: 0.5, y: 0.84, vy: 0, surgeTimer: 0, flashTimer: 0, stride: 0 },
    teammates: [],
    defenders: [],
    ball: { active: false, kind: null, x: 0.5, y: 0.84, z: 0, vx: 0, vy: 0, vz: 0, bounces: 0 },
    tacklePause: { active: false, timer: 0, duration: 1.05, onsideY: 0.65 },
    shakeTimer: 0,
    callouts: []
  };

  TEAMS.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    homeSelectEl.appendChild(opt);
  });
  homeSelectEl.value = game.homeTeam.id;

  function addCallout(text, x, y, color = '#fef08a') {
    game.callouts.push({ text, x, y, color, life: 1.0 });
  }

  function playKickTone(kind) {
    try {
      const c = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'bomb' ? 190 : 145, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'bomb' ? 75 : 52, now + 0.18);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  }

  function playTackleTone() {
    try {
      const c = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.24);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    } catch (e) {}
  }

  function updateTeamUi() {
    homeChantEl.textContent = game.homeTeam.chant;
    awayNameEl.textContent = game.awayTeam.name;
    awayChantEl.textContent = game.awayTeam.chant;
    containerEl.querySelector('#erc-hud-home-name').textContent = game.homeTeam.name;
    containerEl.querySelector('#erc-hud-away-name').textContent = game.awayTeam.name;
  }

  function updateHud() {
    containerEl.querySelector('#erc-hud-home-score').textContent = String(game.homeScore);
    containerEl.querySelector('#erc-hud-away-score').textContent = String(game.awayScore);
    const secs = Math.max(0, Math.floor(game.matchTime));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    containerEl.querySelector('#erc-hud-clock').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    containerEl.querySelector('#erc-leg-surge').textContent = game.keys.surge.toUpperCase();
    containerEl.querySelector('#erc-leg-bomb').textContent = game.keys.bomb.toUpperCase();
    containerEl.querySelector('#erc-leg-grubber').textContent = game.keys.grubber.toUpperCase();
  }

  function refreshBindButtons() {
    ['surge', 'bomb', 'grubber'].forEach((act) => {
      const btn = containerEl.querySelector(`#erc-bind-${act}`);
      const label = act === 'surge' ? 'Run' : act === 'bomb' ? 'Bomb' : 'Grubber';
      btn.textContent = game.listeningAction === act ? 'Press key...' : `${label}: ${game.keys[act].toUpperCase()}`;
    });
    updateHud();
  }

  function spinOpponentReel() {
    const pool = TEAMS.filter((t) => t.id !== game.homeTeam.id);
    const pick = pool[Math.floor(Math.random() * pool.length)] || TEAMS[1];
    game.pokie.spinning = true;
    game.pokie.timer = 0;
    game.pokie.tick = 0;
    game.pokie.targetId = pick.id;
  }

  function spawnFieldFormation() {
    const lanes = [0.16, 0.33, 0.5, 0.67, 0.84];
    const lineY = Math.max(0.16, game.player.y - 0.13);
    game.defenders = lanes.map((lx, idx) => ({
      x: lx,
      y: lineY,
      baseX: lx,
      phase: Math.random() * Math.PI * 2,
      stride: Math.random() * Math.PI * 2,
      role: idx === 1 || idx === 2 ? 'chaser' : 'line'
    }));

    const offsets = [
      { dx: -0.24, dy: 0.045 },
      { dx: -0.11, dy: 0.025 },
      { dx: 0.11, dy: 0.025 },
      { dx: 0.24, dy: 0.045 }
    ];
    game.teammates = offsets.map((off, idx) => ({
      x: Math.min(0.9, Math.max(0.1, game.player.x + off.dx)),
      y: Math.min(0.94, game.player.y + off.dy),
      dx: off.dx,
      dy: off.dy,
      stride: idx * 1.3
    }));
  }

  function resetRunner() {
    game.player.x = 0.5;
    game.player.y = 0.84;
    game.player.vy = 0;
    game.player.surgeTimer = 0;
    game.player.flashTimer = 0;
    game.ball.active = false;
    game.ball.z = 0;
    game.tacklePause.active = false;
    game.tacklePause.timer = 0;
    spawnFieldFormation();
  }

  function doSurge() {
    if (game.phase !== 'playing') return;
    game.player.surgeTimer = 0.65;
    game.player.vy = -0.36;
    addCallout('RUN SURGE!', game.player.x, game.player.y - 0.04, '#6ee7b7');
  }

  function doKick(kind) {
    if (game.phase !== 'playing' || game.ball.active) return;
    playKickTone(kind);
    game.ball.active = true;
    game.ball.kind = kind;
    game.ball.x = game.player.x;
    game.ball.y = game.player.y - 0.03;
    game.ball.bounces = 0;
    if (kind === 'bomb') {
      game.ball.vy = -0.34;
      game.ball.vx = (Math.random() - 0.5) * 0.08;
      game.ball.z = 0.05;
      game.ball.vz = 0.48;
      addCallout('BOMB KICK!', game.player.x, game.player.y - 0.05, '#fcd34d');
    } else {
      game.ball.vy = -0.42;
      game.ball.vx = (Math.random() - 0.5) * 0.05;
      game.ball.z = 0.01;
      game.ball.vz = 0.08;
      addCallout('GRUBBER!', game.player.x, game.player.y - 0.05, '#7dd3fc');
    }
  }

  function onPianoNoteDown(noteStr, bridge) {
    const clean = (noteStr || '').trim().toLowerCase();
    const letterMatch = clean.match(/^([a-g])/);
    if (!letterMatch) return;
    const noteLetter = letterMatch[1];

    if (bridge) bridge.highlightKey(noteStr, 220, '#38bdf8');
    const freq = getNoteFrequency(noteStr) || getNoteFrequency(`${noteLetter}1`);
    if (freq) playTone(freq, 0.25, 0.85);

    if (game.phase !== 'playing') return;
    if (LANE_POSITIONS[noteLetter] !== undefined) {
      game.player.x = LANE_POSITIONS[noteLetter];
      game.player.flashTimer = 0.25;
      game.player.vy = Math.min(game.player.vy, -0.18);
      addCallout(`NOTE ${noteLetter.toUpperCase()}`, game.player.x, game.player.y - 0.04, '#bae6fd');
    }
  }

  function finishRugbyMatch() {
    if (game.phase === 'finished') return;
    game.phase = 'finished';
    const margin = game.homeScore - game.awayScore;
    const outcome = margin > 0 ? '🏆 WIN!' : margin === 0 ? '🤝 DRAW!' : 'FULL TIME';
    const summaryHtml =
      `<strong>${outcome}</strong> — ${game.homeTeam.name} <b>${game.homeScore}</b> – <b>${game.awayScore}</b> ${game.awayTeam.name}`;
    const finalScore = Math.max(0, game.homeScore * 100 - game.awayScore * 25);

    stopErcRugby();
    bridgeRef.finishCustomMiniGame(
      'ERC Sports Rugby',
      finalScore,
      summaryHtml,
      () => startErcRugby(bridgeRef, true)
    );
  }

  function startMatch() {
    if (game.pokie.spinning) {
      game.pokie.spinning = false;
      game.awayTeam = TEAMS.find((t) => t.id === game.pokie.targetId) || TEAMS[1];
      updateTeamUi();
    }
    game.homeScore = 0;
    game.awayScore = 0;
    game.matchTime = 90;
    game.phase = 'playing';
    resetRunner();
    setupModalEl.style.display = 'none';
    hudEl.style.display = 'flex';
    legendEl.style.display = 'block';
    updateHud();
    if (bridgeRef && bridgeRef.getState().gameStats) {
      bridgeRef.getState().gameStats.perfect = 1;
    }
  }

  homeSelectEl.addEventListener('change', () => {
    game.homeTeam = TEAMS.find((t) => t.id === homeSelectEl.value) || TEAMS[0];
    updateTeamUi();
    spinOpponentReel();
  });

  containerEl.querySelector('#erc-respin-btn').addEventListener('click', spinOpponentReel);
  containerEl.querySelector('#erc-start-btn').addEventListener('click', startMatch);

  containerEl.querySelectorAll('.erc-bind-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      game.listeningAction = btn.getAttribute('data-action');
      bindStatusEl.textContent = `Listening for ${game.listeningAction.toUpperCase()} key (Esc to cancel)...`;
      refreshBindButtons();
    });
  });

  const onKeyDown = (e) => {
    const upper = (e.key || '').toUpperCase();
    if (game.listeningAction) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        game.listeningAction = null;
        bindStatusEl.textContent = 'Keybind cancelled.';
      } else if (upper.length === 1 && /\S/.test(upper)) {
        game.keys[game.listeningAction] = upper;
        bindStatusEl.textContent = `${game.listeningAction.toUpperCase()} bound to "${upper}".`;
        game.listeningAction = null;
      }
      refreshBindButtons();
      return;
    }
    if (game.phase !== 'playing') return;
    if (upper === game.keys.surge.toUpperCase()) {
      e.preventDefault();
      doSurge();
    } else if (upper === game.keys.bomb.toUpperCase()) {
      e.preventDefault();
      doKick('bomb');
    } else if (upper === game.keys.grubber.toUpperCase()) {
      e.preventDefault();
      doKick('grubber');
    }
  };
  window.addEventListener('keydown', onKeyDown, { capture: true });

  function drawRunner(x, y, team, stride, opts = {}) {
    const { scale = 1, highlight = false, surging = false } = opts;
    const wave = Math.sin(stride);
    const leftLeg = (wave >= 0 ? 12 : 6) * scale;
    const rightLeg = (wave < 0 ? 12 : 6) * scale;
    const bob = -Math.abs(wave) * 2.2 * scale;

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.lineCap = 'round';

    ctx.strokeStyle = team.secondary;
    ctx.lineWidth = 3.8 * scale;
    ctx.beginPath();
    ctx.moveTo(-4 * scale, 3 * scale);
    ctx.lineTo(-4 * scale + wave * 4 * scale, 3 * scale + leftLeg);
    ctx.moveTo(4 * scale, 3 * scale);
    ctx.lineTo(4 * scale - wave * 4 * scale, 3 * scale + rightLeg);
    ctx.stroke();

    ctx.fillStyle = team.primary;
    ctx.strokeStyle = highlight ? '#67e8f9' : team.secondary;
    ctx.lineWidth = (surging ? 3 : 2) * scale;
    ctx.beginPath();
    ctx.roundRect(-8.5 * scale, -7.5 * scale, 17 * scale, 12 * scale, 4 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f1c27d';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.arc(0, -11.5 * scale, 4.8 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  let lastTs = performance.now();
  function tick(now) {
    if (!containerEl) return;
    animFrameId = requestAnimationFrame(tick);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
    lastTs = now;

    if (game.pokie.spinning) {
      game.pokie.timer += dt;
      game.pokie.tick += dt;
      const p = Math.min(1, game.pokie.timer / game.pokie.duration);
      if (game.pokie.tick >= 0.05 + p * 0.14) {
        game.pokie.tick = 0;
        game.pokie.idx = (game.pokie.idx + 1) % TEAMS.length;
        awayNameEl.textContent = TEAMS[game.pokie.idx].name;
      }
      if (p >= 1) {
        game.pokie.spinning = false;
        game.awayTeam = TEAMS.find((t) => t.id === game.pokie.targetId) || TEAMS[1];
        updateTeamUi();
      }
    }

    if (game.phase === 'playing') {
      game.matchTime -= dt;
      if (game.matchTime <= 0) {
        game.matchTime = 0;
        updateHud();
        finishRugbyMatch();
        return;
      }
      updateHud();

      if (game.shakeTimer > 0) game.shakeTimer = Math.max(0, game.shakeTimer - dt);
      if (game.player.surgeTimer > 0) game.player.surgeTimer = Math.max(0, game.player.surgeTimer - dt);
      if (game.player.flashTimer > 0) game.player.flashTimer = Math.max(0, game.player.flashTimer - dt);

      const targetVy = game.player.surgeTimer > 0 ? -0.23 : -0.125;
      game.player.vy += (targetVy - game.player.vy) * Math.min(1, dt * 8);
      game.player.y += game.player.vy * dt;
      game.player.stride += dt * (game.player.surgeTimer > 0 ? 22 : 14);

      for (const mate of game.teammates) {
        const dx = Math.min(0.9, Math.max(0.1, game.player.x + mate.dx));
        const dy = Math.min(0.94, Math.max(game.player.y + 0.015, game.player.y + mate.dy));
        mate.x += (dx - mate.x) * Math.min(1, dt * 3);
        mate.y += (dy - mate.y) * Math.min(1, dt * 3);
        mate.stride += dt * 11;
      }

      if (game.player.y <= 0.11) {
        game.homeScore += 4;
        if (bridgeRef && bridgeRef.getState().gameStats) {
          bridgeRef.getState().gameStats.perfect += 4;
        }
        addCallout('TRY! +4', game.player.x, 0.15, '#4ade80');
        updateHud();
        resetRunner();
      } else if (game.ball.active) {
        game.ball.x += game.ball.vx * dt;
        game.ball.y += game.ball.vy * dt;
        if (game.ball.kind === 'bomb') {
          game.ball.vz -= 1.05 * dt;
          game.ball.z += game.ball.vz * dt;
          if (game.ball.z <= 0) {
            game.ball.z = 0;
            game.ball.vz = Math.abs(game.ball.vz) * 0.42;
            game.ball.bounces += 1;
            if (game.ball.bounces >= 2) {
              game.player.x = Math.min(0.88, Math.max(0.12, game.ball.x));
              game.player.y = Math.min(0.88, Math.max(0.12, game.ball.y));
              game.ball.active = false;
              addCallout('CLEAN TAKE!', game.player.x, game.player.y - 0.05, '#fde047');
            }
          }
        } else {
          game.ball.vy *= Math.pow(0.45, dt);
          if (game.ball.y <= game.player.y - 0.16 && Math.abs(game.ball.vy) < 0.16) {
            game.player.x = Math.min(0.88, Math.max(0.12, game.ball.x));
            game.player.y = Math.min(0.88, Math.max(0.12, game.ball.y));
            game.ball.active = false;
            addCallout('GRUBBER REGAIN!', game.player.x, game.player.y - 0.05, '#7dd3fc');
          }
        }
        if (game.ball.y <= 0.1) {
          game.homeScore += 4;
          game.ball.active = false;
          addCallout('KICK TRY! +4', game.ball.x, 0.15, '#4ade80');
          updateHud();
          resetRunner();
        }
      } else if (game.tacklePause.active) {
        game.tacklePause.timer += dt;
        game.defenders.forEach((d, idx) => {
          d.x += (d.baseX - d.x) * Math.min(1, dt * 5);
          d.y += (game.tacklePause.onsideY - d.y) * Math.min(1, dt * 6.5);
          d.stride += dt * 15;
          if (idx === 0) d.role = 'chaser';
        });
        if (game.tacklePause.timer >= game.tacklePause.duration) {
          game.tacklePause.active = false;
          const chaser = Math.floor(Math.random() * game.defenders.length);
          game.defenders.forEach((d, i) => { d.role = i === chaser ? 'chaser' : 'line'; });
          addCallout('PLAY ON!', game.player.x, game.player.y - 0.04, '#86efac');
        }
      } else {
        const lineY = Math.max(0.14, game.player.y - 0.13);
        for (const d of game.defenders) {
          d.phase += dt * 2.0;
          d.stride += dt * 13;
          if (d.role === 'chaser') {
            const dx = game.player.x - d.x;
            const dy = game.player.y - d.y;
            const dist = Math.max(0.001, Math.hypot(dx, dy));
            d.x += (dx / dist) * 0.12 * dt;
            d.y += (dy / dist) * 0.13 * dt;
          } else {
            d.x += (d.baseX + Math.sin(d.phase) * 0.035 - d.x) * Math.min(1, dt * 3.5);
            d.y += (lineY - d.y) * Math.min(1, dt * 3.5);
          }
          if (Math.hypot(d.x - game.player.x, d.y - game.player.y) < 0.038 && !game.ball.active) {
            game.tacklePause.active = true;
            game.tacklePause.timer = 0;
            game.tacklePause.onsideY = Math.max(0.14, game.player.y - 0.10);
            game.player.vy = 0;
            game.shakeTimer = 0.3;
            playTackleTone();
            addCallout('TACKLE! 10m ONSIDE', game.player.x, game.player.y - 0.05, '#fda4af');
            break;
          }
        }
      }

      for (let i = game.callouts.length - 1; i >= 0; i--) {
        game.callouts[i].life -= dt * 1.15;
        game.callouts[i].y -= dt * 0.06;
        if (game.callouts[i].life <= 0) game.callouts.splice(i, 1);
      }
    }

    const rect = containerEl.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.save();
    if (game.shakeTimer > 0) {
      const mag = 12 * (game.shakeTimer / 0.3);
      ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
    }

    ctx.fillStyle = '#091521';
    ctx.fillRect(0, 0, w, h);

    const padX = Math.max(18, w * 0.08);
    const padY = Math.max(12, h * 0.04);
    const fw = w - padX * 2;
    const fh = h - padY * 2;

    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#166534';
      ctx.fillRect(padX, padY + (fh / 10) * i, fw, fh / 10 + 1);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(padX, padY, fw, fh);

    LANE_NOTES.forEach((n, idx) => {
      const lx = padX + fw * LANE_POSITIONS[n];
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(lx, padY + fh * 0.12);
      ctx.lineTo(lx, padY + fh * 0.88);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(n.toUpperCase(), lx - 4, padY + fh * 0.95 + idx * 0);
    });

    for (const d of game.defenders) drawRunner(ctx, padX + fw * d.x, padY + fh * d.y, game.awayTeam, d.stride, { scale: 0.9 });
    for (const m of game.teammates) drawRunner(ctx, padX + fw * m.x, padY + fh * m.y, game.homeTeam, m.stride, { scale: 0.9 });

    const px = padX + fw * game.player.x;
    const py = padY + fh * game.player.y;
    drawRunner(ctx, px, py, game.homeTeam, game.player.stride, {
      scale: 1.0,
      highlight: game.player.flashTimer > 0,
      surging: game.player.surgeTimer > 0
    });

    const bx = game.ball.active ? padX + fw * game.ball.x : px;
    const by = game.ball.active ? padY + fh * game.ball.y - game.ball.z * 85 : py - 10;
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(bx, by, 5, 8, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    for (const c of game.callouts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.life);
      ctx.font = 'italic 900 14px sans-serif';
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, padX + fw * c.x, padY + fh * c.y);
      ctx.restore();
    }

    ctx.restore();
  }

  updateTeamUi();
  refreshBindButtons();
  spinOpponentReel();
  resetRunner();

  activeController = {
    onPianoNoteDown,
    onPianoNoteUp: () => {},
    cleanup: () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    }
  };

  if (autoStart) {
    startMatch();
  }
  animFrameId = requestAnimationFrame(tick);
}
