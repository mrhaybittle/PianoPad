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

const PIANO_FREQS = {
  C: 261.63,
  D: 293.66,
  E: 329.63,
  F: 349.23,
  G: 392.00
};

const LANES = [0.16, 0.33, 0.5, 0.67, 0.84];
const LANE_MAP = { C: 0.16, D: 0.33, E: 0.5, F: 0.67, G: 0.84 };

function ensureSportsFonts() {
  if (document.getElementById('erc-sports-fonts')) return;
  const link = document.createElement('link');
  link.id = 'erc-sports-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,600;0,700;1,700&family=Inter:wght@500;600;700;800&display=swap';
  document.head.appendChild(link);
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
    statusEl.textContent = '🏉 ERC Sports Rugby Ready! Play C, D, E, F, G to step lanes & attack!';
  }

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
    background-color: #07131d;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: #f8fafc;
    user-select: none;
    -webkit-user-select: none;
  `;

  containerEl.innerHTML = `
    <style>
      #erc-rugby-container * {
        box-sizing: border-box;
        user-select: none;
        -webkit-user-select: none;
      }
      #erc-rugby-container .font-sports {
        font-family: 'Chakra Petch', sans-serif;
      }
      #erc-rugby-container .sports-btn {
        transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 140ms ease, background-color 140ms ease;
        box-shadow: 0 4px 0 rgba(2, 6, 23, 0.72), 0 8px 16px rgba(0, 0, 0, 0.35);
        cursor: pointer;
      }
      #erc-rugby-container .sports-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 0 rgba(2, 6, 23, 0.78), 0 12px 20px rgba(0, 0, 0, 0.42);
      }
      #erc-rugby-container .sports-btn:active {
        transform: translateY(2px);
        box-shadow: 0 2px 0 rgba(2, 6, 23, 0.8), 0 4px 8px rgba(0, 0, 0, 0.3);
      }
      #erc-rugby-container .erc-logo-badge {
        transform: skewX(-14deg);
        border: 2.5px solid #ffffff;
        background: linear-gradient(90deg, #dc2626 0%, #ffffff 50%, #1d4ed8 100%);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.45);
        border-radius: 6px;
        padding: 3px 12px;
        overflow: hidden;
        display: inline-flex;
        align-items: center;
      }
      #erc-rugby-container .erc-logo-inner {
        transform: skewX(14deg);
        display: flex;
        align-items: baseline;
        gap: 5px;
      }
      #erc-rugby-container .pokie-window {
        background: linear-gradient(180deg, #090d16 0%, #162033 22%, #1e2b45 50%, #162033 78%, #090d16 100%);
        box-shadow: inset 0 8px 14px rgba(0, 0, 0, 0.85), inset 0 -8px 14px rgba(0, 0, 0, 0.85), 0 0 0 2px rgba(251, 191, 36, 0.35);
        position: relative;
        height: 68px;
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        text-align: center;
        overflow: hidden;
      }
      #erc-game-canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
      #erc-gameplay-hud {
        position: absolute;
        top: 10px;
        right: 12px;
        z-index: 20;
        display: none;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        pointer-events: none;
      }
      #erc-scoreboard {
        border-radius: 12px;
        background: rgba(2, 6, 23, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(8px);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
        padding: 7px 12px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      #erc-key-legend {
        position: absolute;
        bottom: 10px;
        left: 12px;
        z-index: 20;
        display: none;
        pointer-events: none;
        border-radius: 10px;
        background: rgba(2, 6, 23, 0.86);
        border: 1px solid rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(8px);
        padding: 7px 11px;
        font-size: 11px;
      }
      #erc-piano-strip {
        position: absolute;
        bottom: 10px;
        right: 12px;
        z-index: 20;
        display: none;
        border-radius: 10px;
        background: rgba(2, 6, 23, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 6px;
        gap: 5px;
      }
      #erc-piano-strip .piano-key-btn {
        width: 32px;
        height: 42px;
        border-radius: 6px;
        background: #ffffff;
        color: #020617;
        border: none;
        border-bottom: 3px solid #cbd5e1;
        font-weight: 800;
        font-size: 12px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding-bottom: 4px;
        cursor: pointer;
        transition: transform 90ms ease, background-color 90ms ease;
      }
      #erc-piano-strip .piano-key-btn.active-note {
        background: #67e8f9;
        transform: scale(0.94);
      }
      #erc-start-modal {
        position: absolute;
        inset: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px;
        background: rgba(2, 6, 23, 0.84);
        backdrop-filter: blur(8px);
        overflow-y: auto;
      }
      .erc-modal-card {
        width: 100%;
        max-width: 760px;
        max-height: 96%;
        overflow-y: auto;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 20px 45px rgba(0, 0, 0, 0.65);
        padding: 14px 18px;
      }
      .erc-setup-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 10px;
      }
      .erc-controls-row {
        display: grid;
        grid-template-columns: 1fr 1.45fr;
        gap: 10px;
        margin-top: 10px;
      }
      @media (max-width: 680px) {
        .erc-setup-grid, .erc-controls-row {
          grid-template-columns: 1fr;
        }
      }
      .erc-panel {
        border-radius: 12px;
        background: rgba(2, 6, 23, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 10px 12px;
      }
      .erc-bind-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-top: 6px;
      }
      .erc-key-btn {
        width: 100%;
        border-radius: 8px;
        padding: 7px 6px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-weight: 800;
        font-size: 11px;
      }
      .erc-key-btn.listening {
        outline: 2px solid #fcd34d;
      }
    </style>

    <canvas id="erc-game-canvas"></canvas>

    <!-- Top-right HUD: Red/White/Blue ERC Sports Logo + Broadcast Scoreboard -->
    <div id="erc-gameplay-hud">
      <div class="erc-logo-badge">
        <div class="erc-logo-inner">
          <span class="font-sports" style="font-style:italic; font-weight:800; font-size:15px; color:#b91c1c; letter-spacing:0.06em;">ERC</span>
          <span class="font-sports" style="font-style:italic; font-weight:800; font-size:11px; color:#1e3a8a; letter-spacing:0.1em;">SPORTS</span>
        </div>
      </div>

      <div id="erc-scoreboard">
        <div style="text-align:right;">
          <div id="erc-hud-home-name" class="font-sports" style="font-size:11px; font-weight:700; text-transform:uppercase; color:#67e8f9; max-width:125px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">HOME</div>
          <div id="erc-hud-home-score" class="font-sports" style="font-size:21px; font-weight:800; line-height:1; color:#ffffff;">0</div>
        </div>

        <div style="display:flex; flex-direction:column; align-items:center; padding:0 8px; border-left:1px solid rgba(255,255,255,0.15); border-right:1px solid rgba(255,255,255,0.15);">
          <span id="erc-hud-clock" class="font-sports" style="font-size:12px; font-weight:800; color:#fcd34d; letter-spacing:0.06em;">02:00</span>
          <span id="erc-hud-tackle-count" style="font-size:9px; font-weight:800; text-transform:uppercase; color:#94a3b8; letter-spacing:0.08em;">TACKLE 0/5</span>
        </div>

        <div style="text-align:left;">
          <div id="erc-hud-away-name" class="font-sports" style="font-size:11px; font-weight:700; text-transform:uppercase; color:#fda4af; max-width:125px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">AWAY</div>
          <div id="erc-hud-away-score" class="font-sports" style="font-size:21px; font-weight:800; line-height:1; color:#ffffff;">0</div>
        </div>
      </div>
    </div>

    <!-- Bottom-left key legend -->
    <div id="erc-key-legend">
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px;">
        <span><b style="color:#94a3b8; font-size:10px; text-transform:uppercase;">Piano:</b> <span style="padding:2px 5px; border-radius:4px; background:rgba(255,255,255,0.1); color:#a5f3fc; font-family:monospace; font-weight:800;">C D E F G</span></span>
        <span><b style="color:#6ee7b7; font-size:10px; text-transform:uppercase;">Run:</b> <span id="erc-leg-surge" style="padding:2px 5px; border-radius:4px; background:rgba(16,185,129,0.2); border:1px solid rgba(52,211,153,0.45); color:#a7f3d0; font-family:monospace; font-weight:800;">W</span></span>
        <span><b style="color:#fcd34d; font-size:10px; text-transform:uppercase;">Bomb:</b> <span id="erc-leg-bomb" style="padding:2px 5px; border-radius:4px; background:rgba(245,158,11,0.2); border:1px solid rgba(251,191,36,0.45); color:#fde68a; font-family:monospace; font-weight:800;">B</span></span>
        <span><b style="color:#7dd3fc; font-size:10px; text-transform:uppercase;">Grubber:</b> <span id="erc-leg-grubber" style="padding:2px 5px; border-radius:4px; background:rgba(14,165,233,0.2); border:1px solid rgba(56,189,248,0.45); color:#bae6fd; font-family:monospace; font-weight:800;">N</span></span>
      </div>
    </div>

    <!-- Interactive Piano Strip at bottom-right -->
    <div id="erc-piano-strip">
      <button type="button" data-note="C" class="piano-key-btn font-sports">C</button>
      <button type="button" data-note="D" class="piano-key-btn font-sports">D</button>
      <button type="button" data-note="E" class="piano-key-btn font-sports">E</button>
      <button type="button" data-note="F" class="piano-key-btn font-sports">F</button>
      <button type="button" data-note="G" class="piano-key-btn font-sports">G</button>
    </div>

    <!-- Starting Menu Modal -->
    <div id="erc-start-modal">
      <div class="erc-modal-card">
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
          <div>
            <div class="font-sports" style="font-style:italic; font-weight:800; font-size:20px; color:#ffffff; text-transform:uppercase;">
              Match Setup &amp; Controls
            </div>
            <div style="font-size:11px; color:#cbd5e1;">
              Choose your club, spin the pokie reel for your opponent, and assign Run, Bomb &amp; Grubber keys.
            </div>
          </div>
          <div class="erc-logo-badge">
            <div class="erc-logo-inner">
              <span class="font-sports" style="font-style:italic; font-weight:800; font-size:16px; color:#b91c1c;">ERC</span>
              <span class="font-sports" style="font-style:italic; font-weight:800; font-size:11px; color:#1e3a8a;">SPORTS</span>
            </div>
          </div>
        </div>

        <div class="erc-setup-grid">
          <!-- Player Team Picker -->
          <div class="erc-panel">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
              <label for="erc-team-select" class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#67e8f9;">Your Team (Home)</label>
              <span style="font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; background:rgba(6,182,212,0.2); color:#a5f3fc; border:1px solid rgba(34,211,238,0.3);">HOME</span>
            </div>
            <select id="erc-team-select" style="width:100%; border-radius:8px; background:#1e293b; border:1px solid rgba(255,255,255,0.2); padding:7px 10px; font-size:13px; font-weight:700; color:#ffffff; cursor:pointer;"></select>
            <div style="margin-top:8px; border-radius:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding:7px 9px; display:flex; align-items:center; gap:9px;">
              <div id="erc-player-swatch" style="width:32px; height:32px; border-radius:7px; border:1px solid rgba(255,255,255,0.35); flex-shrink:0;"></div>
              <div style="min-width:0;">
                <div id="erc-player-title" class="font-sports" style="font-weight:800; font-size:13px; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <div id="erc-player-chant" style="font-size:11px; color:#cbd5e1;"></div>
              </div>
            </div>
          </div>

          <!-- Pokie Opponent Reel -->
          <div class="erc-panel" style="border-color:rgba(251,191,36,0.28);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
              <span class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#fcd34d;">Computer Opponent (Pokie Reel)</span>
              <span id="erc-reel-badge" style="font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; background:rgba(245,158,11,0.2); color:#fde68a; border:1px solid rgba(251,191,36,0.35);">LOCKED</span>
            </div>
            <div class="pokie-window">
              <div style="pointer-events:none; position:absolute; left:0; right:0; top:50%; transform:translateY(-50%); height:34px; border-top:1px solid rgba(252,211,77,0.35); border-bottom:1px solid rgba(252,211,77,0.35); background:rgba(251,191,36,0.05);"></div>
              <div id="erc-pokie-name" class="font-sports" style="position:relative; z-index:2; font-style:italic; font-weight:800; font-size:17px; color:#ffffff; text-transform:uppercase;">SPINNING...</div>
              <div id="erc-pokie-sub" style="position:relative; z-index:2; font-size:11px; color:#fde68a; margin-top:2px;">Randomising opponent...</div>
            </div>
            <div style="margin-top:7px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:10px; color:#94a3b8;">Spins when team changes</span>
              <button type="button" id="erc-respin-btn" class="sports-btn font-sports" style="border:none; border-radius:7px; background:#f59e0b; color:#020617; font-weight:800; font-size:11px; text-transform:uppercase; padding:5px 10px;">Re-Spin Reel</button>
            </div>
          </div>
        </div>

        <div class="erc-controls-row">
          <div class="erc-panel">
            <div class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#67e8f9; margin-bottom:4px;">Piano Lanes (C, D, E, F, G)</div>
            <div style="font-size:11px; color:#cbd5e1; line-height:1.35;">
              Play <b style="color:#fff;">C, D, E, F, G</b> on your PianoPad / MIDI keyboard to step into lanes, pass across the backline, and restart after a tackle!
            </div>
            <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:5px; margin-top:8px;">
              <div class="font-sports" style="background:#fff; color:#020617; font-weight:800; text-align:center; padding:5px 0; border-radius:6px; font-size:12px;">C</div>
              <div class="font-sports" style="background:#fff; color:#020617; font-weight:800; text-align:center; padding:5px 0; border-radius:6px; font-size:12px;">D</div>
              <div class="font-sports" style="background:#fff; color:#020617; font-weight:800; text-align:center; padding:5px 0; border-radius:6px; font-size:12px;">E</div>
              <div class="font-sports" style="background:#fff; color:#020617; font-weight:800; text-align:center; padding:5px 0; border-radius:6px; font-size:12px;">F</div>
              <div class="font-sports" style="background:#fff; color:#020617; font-weight:800; text-align:center; padding:5px 0; border-radius:6px; font-size:12px;">G</div>
            </div>
          </div>

          <div class="erc-panel">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#6ee7b7;">Action Keys (Run, Bomb, Grubber)</span>
              <span style="font-size:10px; color:#94a3b8;">Click to rebind</span>
            </div>
            <div class="erc-bind-grid">
              <div style="background:#0f172a; border:1px solid rgba(52,211,153,0.28); border-radius:9px; padding:7px; text-align:center;">
                <div class="font-sports" style="font-size:11px; font-weight:800; color:#6ee7b7;">RUN SURGE</div>
                <div style="font-size:10px; color:#94a3b8; margin:2px 0 6px;">Hit it up / Sprint</div>
                <button type="button" data-bind-action="surge" class="erc-key-btn sports-btn" style="background:rgba(16,185,129,0.2); border:1px solid rgba(52,211,153,0.6); color:#d1fae5;">KEY: W</button>
              </div>
              <div style="background:#0f172a; border:1px solid rgba(251,191,36,0.28); border-radius:9px; padding:7px; text-align:center;">
                <div class="font-sports" style="font-size:11px; font-weight:800; color:#fcd34d;">BOMB KICK</div>
                <div style="font-size:10px; color:#94a3b8; margin:2px 0 6px;">High spiral</div>
                <button type="button" data-bind-action="bomb" class="erc-key-btn sports-btn" style="background:rgba(245,158,11,0.2); border:1px solid rgba(251,191,36,0.6); color:#fef3c7;">KEY: B</button>
              </div>
              <div style="background:#0f172a; border:1px solid rgba(56,189,248,0.28); border-radius:9px; padding:7px; text-align:center;">
                <div class="font-sports" style="font-size:11px; font-weight:800; color:#7dd3fc;">GRUBBER</div>
                <div style="font-size:10px; color:#94a3b8; margin:2px 0 6px;">Low skid kick</div>
                <button type="button" data-bind-action="grubber" class="erc-key-btn sports-btn" style="background:rgba(14,165,233,0.2); border:1px solid rgba(56,189,248,0.6); color:#e0f2fe;">KEY: N</button>
              </div>
            </div>
            <div id="erc-keybind-notice" style="margin-top:5px; font-size:11px; color:#fcd34d; min-height:14px;"></div>
          </div>
        </div>

        <div style="margin-top:10px; padding-top:9px; border-top:1px solid rgba(255,255,255,0.1); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px;">
          <div id="erc-matchup-summary" style="font-size:12px; color:#cbd5e1; font-weight:600;">Ready for kick-off.</div>
          <button type="button" id="erc-start-match-btn" class="sports-btn font-sports" style="border:none; border-radius:10px; background:linear-gradient(90deg, #dc2626, #ef4444, #2563eb); color:#ffffff; font-style:italic; font-weight:800; font-size:15px; text-transform:uppercase; letter-spacing:0.06em; padding:9px 24px;">
            Kick Off Match
          </button>
        </div>
      </div>
    </div>
  `;

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

  const state = {
    phase: 'menu', // 'menu' | 'playing' | 'gameover'
    playState: 'waitingForPlay', // 'running' | 'retreating' | 'waitingForPlay'
    tackleCount: 0,
    maxTackles: 6,
    homeTeam: TEAMS[0],
    awayTeam: TEAMS[1],
    homeScore: 0,
    awayScore: 0,
    matchTime: 120,

    pokie: {
      spinning: false,
      timer: 0,
      duration: 1.25,
      tickAccum: 0,
      index: 1,
      targetId: TEAMS[1].id
    },

    specialKeys: {
      surge: 'W',
      bomb: 'B',
      grubber: 'N'
    },
    listeningAction: null,

    player: {
      x: 0.5,
      targetX: 0.5,
      y: 0.84,
      vy: 0,
      vx: 0,
      surgeTimer: 0,
      sidestepFlash: 0,
      stridePhase: 0
    },
    teammates: [],
    defenders: [],
    ball: {
      active: false,
      kind: null,
      x: 0.5,
      y: 0.84,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      bounceCount: 0
    },
    callouts: [],

    tacklePause: {
      timer: 0,
      retreatDuration: 1.05,
      markY: 0.84,
      onsideY: 0.68
    },

    screenShake: {
      timer: 0,
      duration: 0.34,
      intensity: 14
    }
  };

  function getAudioCtx() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    }
    return null;
  }

  function playKickSound(kind) {
    try {
      const ctxAudio = getAudioCtx();
      if (!ctxAudio) return;
      const now = ctxAudio.currentTime;
      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'bomb' ? 190 : 145, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'bomb' ? 75 : 52, now + 0.2);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
      osc.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  function playTackleHitSound() {
    try {
      const ctxAudio = getAudioCtx();
      if (!ctxAudio) return;
      const now = ctxAudio.currentTime;

      const subOsc = ctxAudio.createOscillator();
      const subGain = ctxAudio.createGain();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(165, now);
      subOsc.frequency.exponentialRampToValueAtTime(36, now + 0.26);
      subGain.gain.setValueAtTime(0.5, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      subOsc.connect(subGain);
      subGain.connect(ctxAudio.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.29);

      const bufferSize = Math.floor(ctxAudio.sampleRate * 0.18);
      const noiseBuffer = ctxAudio.createBuffer(1, bufferSize, ctxAudio.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }
      const noise = ctxAudio.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctxAudio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(950, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.18);

      const noiseGain = ctxAudio.createGain();
      noiseGain.gain.setValueAtTime(0.55, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctxAudio.destination);
      noise.start(now);
    } catch (e) {}
  }

  function addCallout(text, x, y, color = '#fef08a') {
    state.callouts.push({ text, x, y, color, life: 1.1 });
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
      `${team.name} vs ${state.awayTeam.name} • Piano: C D E F G`;
  }

  function startPokieSpin() {
    if (!containerEl) return;
    const candidates = TEAMS.filter((t) => t.id !== state.homeTeam.id);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || TEAMS[1];
    state.pokie.spinning = true;
    state.pokie.timer = 0;
    state.pokie.duration = 1.25;
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
      const keyChar = state.specialKeys[action] || '';
      const listening = state.listeningAction === action;
      btn.textContent = listening ? 'PRESS KEY...' : `KEY: ${keyChar.toUpperCase()}`;
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
    containerEl.querySelector('#erc-hud-tackle-count').textContent =
      `TACKLE ${state.tackleCount}/${state.maxTackles - 1}`;

    const mins = Math.floor(Math.max(0, state.matchTime) / 60);
    const secs = Math.floor(Math.max(0, state.matchTime) % 60);
    containerEl.querySelector('#erc-hud-clock').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    containerEl.querySelector('#erc-leg-surge').textContent = state.specialKeys.surge.toUpperCase();
    containerEl.querySelector('#erc-leg-bomb').textContent = state.specialKeys.bomb.toUpperCase();
    containerEl.querySelector('#erc-leg-grubber').textContent = state.specialKeys.grubber.toUpperCase();
  }

  function assignDefenderChasers() {
    const chaserA = Math.floor(Math.random() * state.defenders.length);
    const chaserB = (chaserA + 2) % state.defenders.length;
    const twoChasers = Math.random() < 0.65;
    state.defenders.forEach((d, idx) => {
      d.role = idx === chaserA || (twoChasers && idx === chaserB) ? 'chaser' : 'line';
    });
  }

  function spawnFormations() {
    const onsideY = Math.max(0.14, state.player.y - 0.16);
    state.tacklePause.markY = state.player.y;
    state.tacklePause.onsideY = onsideY;

    state.defenders = [];
    for (let i = 0; i < 5; i++) {
      state.defenders.push({
        x: LANES[i],
        y: onsideY,
        baseX: LANES[i],
        speed: 0.085 + Math.random() * 0.035,
        phase: Math.random() * Math.PI * 2,
        stridePhase: Math.random() * Math.PI * 2,
        role: i === 2 || i === 1 ? 'chaser' : 'line'
      });
    }

    state.teammates = [];
    // V-shaped rugby league backline deeper behind the ball-carrier
    const supportOffsets = [
      { dx: -0.26, dy: 0.055 },
      { dx: -0.13, dy: 0.03 },
      { dx: 0.13, dy: 0.03 },
      { dx: 0.26, dy: 0.055 }
    ];
    for (let i = 0; i < 4; i++) {
      const off = supportOffsets[i];
      state.teammates.push({
        x: Math.min(0.9, Math.max(0.1, state.player.x + off.dx)),
        y: Math.min(0.95, state.player.y + off.dy),
        offsetX: off.dx,
        offsetY: off.dy,
        stridePhase: i * 1.3
      });
    }
  }

  function resetSetOfSix(startY = 0.84) {
    state.player.x = 0.5;
    state.player.targetX = 0.5;
    state.player.y = startY;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.surgeTimer = 0;
    state.player.stridePhase = 0;
    state.ball.active = false;
    state.ball.z = 0;
    state.tackleCount = 0;
    // Start set with defense waiting 10m back onside until attack runs!
    state.playState = 'waitingForPlay';
    spawnFormations();
    syncHudAndLegend();
  }

  // Triggered when a defender tackles the ball-carrier
  function beginTackleAndRetreat() {
    state.tackleCount += 1;
    state.player.vy = 0;
    state.player.vx = 0;
    state.player.surgeTimer = 0;

    state.screenShake.timer = state.screenShake.duration;
    state.screenShake.intensity = 15;
    playTackleHitSound();

    // Handover on 6th tackle (just like rugby league)
    if (state.tackleCount >= state.maxTackles) {
      state.awayScore += 2;
      addCallout(`6TH TACKLE TURNOVER! ${state.awayTeam.name} +2`, 0.5, state.player.y - 0.05, '#fb7185');
      resetSetOfSix(0.84);
      return;
    }

    state.playState = 'retreating';
    state.tacklePause.timer = 0;
    state.tacklePause.markY = state.player.y;
    // 10m onside line is 0.14 up-field from the play-the-ball mark
    state.tacklePause.onsideY = Math.max(0.13, state.player.y - 0.14);

    syncHudAndLegend();
    addCallout(`TACKLE ${state.tackleCount}! DEFENSE BACK 10m`, state.player.x, state.player.y - 0.05, '#fda4af');
  }

  // Releases the attack off the mark so the onside defensive line can now move
  function commenceAttackRun() {
    if (state.playState === 'retreating') return false;
    if (state.playState === 'waitingForPlay') {
      state.playState = 'running';
      assignDefenderChasers();
      addCallout('PLAY ON!', state.player.x, state.player.y - 0.04, '#86efac');
    }
    return true;
  }

  function surgeForward(boost = 9) {
    if (state.phase !== 'playing') return;
    if (!commenceAttackRun()) {
      addCallout('HOLD! DEFENSE GETTING ONSIDE...', state.player.x, state.player.y - 0.04, '#fcd34d');
      return;
    }
    state.player.surgeTimer = 0.65;
    state.player.vy = -Math.max(Math.abs(state.player.vy), 0.22 + boost * 0.012);
    addCallout('HIT IT UP!', state.player.x, state.player.y - 0.04, '#6ee7b7');
  }

  function launchKick(kind) {
    if (state.phase !== 'playing' || state.ball.active) return;
    if (!commenceAttackRun()) return;

    playKickSound(kind);
    state.ball.active = true;
    state.ball.kind = kind;
    state.ball.x = state.player.x;
    state.ball.y = state.player.y - 0.03;
    state.ball.bounceCount = 0;

    if (kind === 'bomb') {
      state.ball.vy = -0.34;
      state.ball.vx = (Math.random() - 0.5) * 0.08;
      state.ball.z = 0.05;
      state.ball.vz = 0.48;
      addCallout('HIGH BOMB!', state.player.x, state.player.y - 0.05, '#fcd34d');
    } else {
      state.ball.vy = -0.42;
      state.ball.vx = (Math.random() - 0.5) * 0.05;
      state.ball.z = 0.01;
      state.ball.vz = 0.08;
      addCallout('GRUBBER KICK!', state.player.x, state.player.y - 0.05, '#7dd3fc');
    }
  }

  function handleLaneNote(upper, sourceNoteStr = null) {
    if (!PIANO_FREQS[upper]) return;

    const freq = (sourceNoteStr && getNoteFrequency(sourceNoteStr)) || PIANO_FREQS[upper];
    if (freq) playTone(freq, 0.26, 0.85);
    if (bridgeRef && sourceNoteStr) {
      bridgeRef.highlightKey(sourceNoteStr, 200, '#38bdf8');
    }

    if (containerEl) {
      const btn = containerEl.querySelector(`.piano-key-btn[data-note="${upper}"]`);
      if (btn) {
        btn.classList.add('active-note');
        setTimeout(() => btn.classList.remove('active-note'), 160);
      }
    }

    if (state.phase !== 'playing') return;

    // While defense is retreating 10m, allow lining up lane choice without breaking the mark early
    if (state.playState === 'retreating') {
      state.player.targetX = LANE_MAP[upper];
      return;
    }

    // Starting the run from the play-the-ball releases the defense!
    commenceAttackRun();

    state.player.targetX = LANE_MAP[upper];
    state.player.sidestepFlash = 0.25;
    state.player.vy = Math.min(state.player.vy, -0.16);
    addCallout(`PASS / STEP ${upper}`, LANE_MAP[upper], state.player.y - 0.04, '#bae6fd');
  }

  function onPianoNoteDown(noteStr) {
    const clean = (noteStr || '').trim().toUpperCase();
    const m = clean.match(/^([A-G])(#?)/);
    if (!m) return;
    const letter = m[1];
    if (LANE_MAP[letter] !== undefined) {
      handleLaneNote(letter, noteStr);
    }
  }

  function startMatch() {
    if (state.pokie.spinning) {
      state.pokie.spinning = false;
      state.awayTeam = TEAMS.find((t) => t.id === state.pokie.targetId) || TEAMS[1];
    }
    state.homeScore = 0;
    state.awayScore = 0;
    state.matchTime = 120;
    state.phase = 'playing';
    resetSetOfSix(0.84);

    startModalEl.style.display = 'none';
    hudEl.style.display = 'flex';
    legendEl.style.display = 'block';
    pianoStripEl.style.display = 'flex';
    syncHudAndLegend();
    addCallout('KICK OFF! PLAY C–G OR RUN TO START', 0.5, 0.76, '#fef08a');
  }

  function finishMatch() {
    if (state.phase === 'gameover') return;
    state.phase = 'gameover';

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
    bridgeRef.finishCustomMiniGame(
      'ERC Sports Rugby',
      finalPoints,
      summaryHtml,
      () => startErcRugby(bridgeRef, true)
    );
  }

  function updateSimulation(dt) {
    if (state.phase !== 'playing') return;

    if (state.screenShake.timer > 0) {
      state.screenShake.timer = Math.max(0, state.screenShake.timer - dt);
    }
    if (state.player.sidestepFlash > 0) {
      state.player.sidestepFlash = Math.max(0, state.player.sidestepFlash - dt);
    }

    // Match clock runs during active play
    state.matchTime -= dt;
    if (state.matchTime <= 0) {
      state.matchTime = 0;
      syncHudAndLegend();
      finishMatch();
      return;
    }
    syncHudAndLegend();

    // Fade floating callouts in all sub-states
    for (let i = state.callouts.length - 1; i >= 0; i--) {
      state.callouts[i].life -= dt * 1.1;
      state.callouts[i].y -= dt * 0.05;
      if (state.callouts[i].life <= 0) {
        state.callouts.splice(i, 1);
      }
    }

    // =========================================================================
    // PHASE A: POST-TACKLE RETREAT — Attackers pause at mark while Defense
    // sprints back 10m onside and forms a flat defensive line across the field
    // =========================================================================
    if (state.playState === 'retreating') {
      state.tacklePause.timer += dt;
      const targetOnsideY = state.tacklePause.onsideY;

      // Attackers hold the mark and reset their support V-line behind the ruck
      state.player.y = state.tacklePause.markY;
      for (const mate of state.teammates) {
        const desiredX = Math.min(0.9, Math.max(0.1, state.player.x + mate.offsetX));
        const desiredY = Math.min(0.95, state.player.y + mate.offsetY);
        mate.x += (desiredX - mate.x) * Math.min(1, dt * 6);
        mate.y += (desiredY - mate.y) * Math.min(1, dt * 6);
        mate.stridePhase += dt * 6;
      }

      // Defenders jog/sprint back 10m into their 5 lane positions
      let allOnside = true;
      for (let i = 0; i < state.defenders.length; i++) {
        const d = state.defenders[i];
        const laneX = LANES[i] ?? d.baseX;
        d.x += (laneX - d.x) * Math.min(1, dt * 6.5);
        d.y += (targetOnsideY - d.y) * Math.min(1, dt * 7.0);
        d.stridePhase += dt * 16;
        if (Math.abs(d.y - targetOnsideY) > 0.012 || Math.abs(d.x - laneX) > 0.015) {
          allOnside = false;
        }
      }

      if (state.tacklePause.timer >= state.tacklePause.retreatDuration || allOnside) {
        for (let i = 0; i < state.defenders.length; i++) {
          state.defenders[i].x = LANES[i];
          state.defenders[i].y = targetOnsideY;
        }
        state.playState = 'waitingForPlay';
        addCallout('ONSIDE SET! PLAY C–G OR RUN', state.player.x, state.player.y - 0.045, '#fde047');
      }
      return;
    }

    // =========================================================================
    // PHASE B: SET & WAITING FOR PLAY-THE-BALL — Defense holds flat 10m line;
    // they CANNOT move up until the attacking team starts running!
    // =========================================================================
    if (state.playState === 'waitingForPlay') {
      // Subtle ready bounce in place on the line
      for (const d of state.defenders) {
        d.stridePhase += dt * 3.5;
      }
      for (const mate of state.teammates) {
        const desiredX = Math.min(0.9, Math.max(0.1, state.player.x + mate.offsetX));
        const desiredY = Math.min(0.95, state.player.y + mate.offsetY);
        mate.x += (desiredX - mate.x) * Math.min(1, dt * 6);
        mate.y += (desiredY - mate.y) * Math.min(1, dt * 6);
      }
      return;
    }

    // =========================================================================
    // PHASE C: LIVE RUGBY LEAGUE PLAY — Attacking line runs forward with crisp
    // lateral lane steps; Defensive line moves up together + chasers press!
    // =========================================================================
    if (state.player.surgeTimer > 0) {
      state.player.surgeTimer = Math.max(0, state.player.surgeTimer - dt);
    }

    // Smooth athletic lateral cut into the target piano lane (instead of teleporting)
    const dxLane = state.player.targetX - state.player.x;
    state.player.x += dxLane * Math.min(1, dt * 14);

    const targetVy = state.player.surgeTimer > 0 ? -0.225 : -0.12;
    state.player.vy += (targetVy - state.player.vy) * Math.min(1, dt * 8);
    state.player.y += state.player.vy * dt;

    const runRate = state.player.surgeTimer > 0 ? 22 : 14;
    state.player.stridePhase += dt * runRate;

    // 4 supporting backline runners sweep in formation behind the ball-carrier
    for (const mate of state.teammates) {
      const desiredX = Math.min(0.92, Math.max(0.08, state.player.x + mate.offsetX));
      const desiredY = Math.min(0.95, Math.max(state.player.y + 0.02, state.player.y + mate.offsetY));
      mate.x += (desiredX - mate.x) * Math.min(1, dt * 5.2);
      mate.y += (desiredY - mate.y) * Math.min(1, dt * 6.0);
      if (mate.y < state.player.y + 0.018) {
        mate.y = state.player.y + 0.018;
      }
      mate.stridePhase += dt * (runRate * 0.88);
    }

    // Try scored when ball-carrier crosses top try-line
    if (state.player.y <= 0.12) {
      state.homeScore += 4;
      if (bridgeRef && bridgeRef.getState().gameStats) {
        bridgeRef.getState().gameStats.perfect += 4;
      }
      addCallout('TRY SCORED! +4', state.player.x, 0.16, '#4ade80');
      syncHudAndLegend();
      resetSetOfSix(0.84);
      return;
    }

    // Airborne Bomb or skidding Grubber kick physics
    if (state.ball.active) {
      state.ball.x += state.ball.vx * dt;
      state.ball.y += state.ball.vy * dt;

      if (state.ball.kind === 'bomb') {
        state.ball.vz -= 1.05 * dt;
        state.ball.z += state.ball.vz * dt;
        if (state.ball.z <= 0) {
          state.ball.z = 0;
          state.ball.vz = Math.abs(state.ball.vz) * 0.42;
          state.ball.bounceCount += 1;
          if (state.ball.bounceCount >= 2) {
            const takeX = Math.min(0.88, Math.max(0.12, state.ball.x));
            state.player.x = takeX;
            state.player.targetX = takeX;
            state.player.y = Math.min(0.88, Math.max(0.12, state.ball.y));
            state.ball.active = false;
            addCallout('BOMB TAKEN!', state.player.x, state.player.y - 0.05, '#fde047');
          }
        }
      } else {
        state.ball.vy *= Math.pow(0.45, dt);
        if (state.ball.y <= state.player.y - 0.15 && Math.abs(state.ball.vy) < 0.17) {
          const takeX = Math.min(0.88, Math.max(0.12, state.ball.x));
          state.player.x = takeX;
          state.player.targetX = takeX;
          state.player.y = Math.min(0.88, Math.max(0.12, state.ball.y));
          state.ball.active = false;
          addCallout('GRUBBER REGAINED!', state.player.x, state.player.y - 0.05, '#7dd3fc');
        }
      }

      if (state.ball.y <= 0.11) {
        state.homeScore += 4;
        if (bridgeRef && bridgeRef.getState().gameStats) {
          bridgeRef.getState().gameStats.perfect += 4;
        }
        addCallout('KICK TRY! +4', state.ball.x, 0.16, '#4ade80');
        state.ball.active = false;
        syncHudAndLegend();
        resetSetOfSix(0.84);
        return;
      }
    }

    // Defensive line advances up-field together ("line speed") + chasers angle in on ball-carrier
    state.tacklePause.onsideY = Math.min(state.player.y - 0.02, state.tacklePause.onsideY + 0.055 * dt);
    const advancingLineY = Math.max(0.13, state.tacklePause.onsideY);

    for (const d of state.defenders) {
      d.phase += dt * 2.0;
      d.stridePhase += dt * 14;

      if (d.role === 'chaser') {
        const toPlayerX = state.player.x - d.x;
        const toPlayerY = state.player.y - d.y;
        const distToBall = Math.max(0.001, Math.hypot(toPlayerX, toPlayerY));
        d.x += (toPlayerX / distToBall) * 0.125 * dt;
        d.y += (toPlayerY / distToBall) * 0.13 * dt;
      } else {
        // Line defenders slide laterally toward ball-carrier's side while moving up as a unit
        const slideOffset = (state.player.x - 0.5) * 0.14;
        const targetX = Math.min(0.9, Math.max(0.1, d.baseX + slideOffset + Math.sin(d.phase) * 0.018));
        d.x += (targetX - d.x) * Math.min(1, dt * 4.0);
        d.y += (advancingLineY - d.y) * Math.min(1, dt * 4.5);
      }

      const dist = Math.hypot(d.x - state.player.x, d.y - state.player.y);
      if (dist < 0.038 && !state.ball.active) {
        beginTackleAndRetreat();
        return;
      }
    }
  }

  // Exact player appearance from your reference code: shadow, alternating stride legs, jersey, pumping arms & head
  function drawRunningPlayer(ctx, x, y, team, stridePhase, opts = {}) {
    const { scale = 1, isHighlighted = false, isSurging = false } = opts;
    const wave = Math.sin(stridePhase);
    const leftLegLen = (wave >= 0 ? 13 : 6) * scale;
    const rightLegLen = (wave < 0 ? 13 : 6) * scale;
    const leftSwingX = wave * 4.5 * scale;
    const rightSwingX = -wave * 4.5 * scale;
    const bobY = -Math.abs(wave) * 2.5 * scale;

    ctx.save();
    ctx.translate(x, y + bobY);

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.beginPath();
    ctx.ellipse(0, 12 * scale - bobY, 13 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';

    // Left leg
    ctx.strokeStyle = team.secondary;
    ctx.lineWidth = 4.2 * scale;
    ctx.beginPath();
    ctx.moveTo(-4.5 * scale, 3 * scale);
    ctx.lineTo(-4.5 * scale + leftSwingX, 3 * scale + leftLegLen);
    ctx.stroke();

    // Right leg
    ctx.strokeStyle = team.secondary;
    ctx.lineWidth = 4.2 * scale;
    ctx.beginPath();
    ctx.moveTo(4.5 * scale, 3 * scale);
    ctx.lineTo(4.5 * scale + rightSwingX, 3 * scale + rightLegLen);
    ctx.stroke();

    // Jersey torso in primary team colour with secondary trim
    ctx.fillStyle = team.primary;
    ctx.strokeStyle = isHighlighted ? '#67e8f9' : team.secondary;
    ctx.lineWidth = (isSurging ? 3.5 : 2.2) * scale;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-9 * scale, -8 * scale, 18 * scale, 13 * scale, 4 * scale);
    } else {
      ctx.rect(-9 * scale, -8 * scale, 18 * scale, 13 * scale);
    }
    ctx.fill();
    ctx.stroke();

    // Pumping arms
    ctx.strokeStyle = team.primary;
    ctx.lineWidth = 3.4 * scale;
    ctx.beginPath();
    ctx.moveTo(-9 * scale, -5 * scale);
    ctx.lineTo(-12 * scale - rightSwingX * 0.6, 2 * scale);
    ctx.moveTo(9 * scale, -5 * scale);
    ctx.lineTo(12 * scale - leftSwingX * 0.6, 2 * scale);
    ctx.stroke();

    // Head
    ctx.fillStyle = '#f1c27d';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6 * scale;
    ctx.beginPath();
    ctx.arc(0, -12 * scale, 5.2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function renderCanvas(timeSec) {
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

    // Stadium surround
    ctx.fillStyle = '#091521';
    ctx.fillRect(0, 0, w, h);

    const padX = Math.max(20, w * 0.08);
    const padY = Math.max(14, h * 0.03);
    const fieldW = w - padX * 2;
    const fieldH = h - padY * 2;

    // 10 horizontal turf stripes
    const stripes = 10;
    const stripeH = fieldH / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#166534';
      ctx.fillRect(padX, padY + i * stripeH, fieldW, stripeH + 1);
    }

    // Pitch boundary
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(padX, padY, fieldW, fieldH);

    // Try lines & yardage lines
    const lineFracY = [0.12, 0.3, 0.5, 0.7, 0.88];
    ctx.lineWidth = 1.5;
    for (const fy of lineFracY) {
      const ly = padY + fieldH * fy;
      ctx.strokeStyle = fy === 0.12 || fy === 0.88 ? 'rgba(255,255,255,0.75)' : 'rgba(255, 255, 255, 0.32)';
      ctx.beginPath();
      ctx.moveTo(padX, ly);
      ctx.lineTo(padX + fieldW, ly);
      ctx.stroke();
    }

    // Visual 10m onside line while defense retreats or holds waiting for play-the-ball
    if (state.playState === 'retreating' || state.playState === 'waitingForPlay') {
      const onsideLineY = padY + fieldH * state.tacklePause.onsideY;
      ctx.save();
      ctx.strokeStyle = state.playState === 'retreating' ? 'rgba(251, 191, 36, 0.85)' : 'rgba(74, 222, 128, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(padX, onsideLineY);
      ctx.lineTo(padX + fieldW, onsideLineY);
      ctx.stroke();
      ctx.restore();
    }

    // Vertical C, D, E, F, G piano lane guides
    const laneLabels = ['C', 'D', 'E', 'F', 'G'];
    ctx.font = '700 11px "Chakra Petch", sans-serif';
    LANES.forEach((fx, idx) => {
      const lx = padX + fieldW * fx;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(lx, padY + fieldH * 0.12);
      ctx.lineTo(lx, padY + fieldH * 0.88);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
      ctx.fillText(laneLabels[idx], lx - 4, padY + fieldH * 0.94);
    });

    const scaleFactor = Math.max(0.78, Math.min(1.05, h / 430));

    // 5 Defenders (Away team)
    for (const d of state.defenders) {
      const dx = padX + fieldW * d.x;
      const dy = padY + fieldH * d.y;
      drawRunningPlayer(ctx, dx, dy, state.awayTeam, d.stridePhase, { scale: 0.96 * scaleFactor });
    }

    // 4 Supporting Teammates (Home team)
    for (const mate of state.teammates) {
      const mx = padX + fieldW * mate.x;
      const my = padY + fieldH * mate.y;
      drawRunningPlayer(ctx, mx, my, state.homeTeam, mate.stridePhase, { scale: 0.95 * scaleFactor });
    }

    // Ball-carrier (5th Home player)
    const px = padX + fieldW * state.player.x;
    const py = padY + fieldH * state.player.y;
    drawRunningPlayer(ctx, px, py, state.homeTeam, state.player.stridePhase, {
      scale: 1.05 * scaleFactor,
      isHighlighted: state.player.sidestepFlash > 0,
      isSurging: state.player.surgeTimer > 0
    });

    // Rugby ball (at ruck / in hands / airborne kick)
    const bx = state.ball.active ? padX + fieldW * state.ball.x : px;
    const by = state.ball.active
      ? padY + fieldH * state.ball.y - state.ball.z * 95
      : state.playState !== 'running'
      ? py + 6 * scaleFactor
      : py - 11 * scaleFactor;

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(timeSec * (state.ball.active ? 9 : 0.35));
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5 * scaleFactor, 8.5 * scaleFactor, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Floating callouts
    for (const c of state.callouts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.life);
      ctx.font = 'italic 700 14px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = c.color;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.88)';
      ctx.lineWidth = 3;
      const cx = padX + fieldW * c.x;
      const cy = padY + fieldH * c.y;
      ctx.strokeText(c.text, cx, cy);
      ctx.fillText(c.text, cx, cy);
      ctx.restore();
    }

    ctx.restore();
  }

  // Wire UI Events
  teamSelectEl.addEventListener('change', (e) => {
    const picked = TEAMS.find((t) => t.id === e.target.value) || TEAMS[0];
    state.homeTeam = picked;
    updatePlayerTeamPreview();
    startPokieSpin();
  });

  containerEl.querySelector('#erc-respin-btn').addEventListener('click', startPokieSpin);

  containerEl.querySelectorAll('.erc-key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-bind-action');
      state.listeningAction = action;
      containerEl.querySelector('#erc-keybind-notice').textContent =
        `Listening for ${action.toUpperCase()} key... press any letter or symbol (Esc to cancel).`;
      refreshKeybindButtons();
    });
  });

  containerEl.querySelectorAll('.piano-key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const note = btn.getAttribute('data-note');
      handleLaneNote(note);
    });
  });

  containerEl.querySelector('#erc-start-match-btn').addEventListener('click', startMatch);

  const onKeyDown = (e) => {
    const keyUpper = (e.key || '').toUpperCase();

    if (state.listeningAction) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        state.listeningAction = null;
        containerEl.querySelector('#erc-keybind-notice').textContent = 'Keybind cancelled.';
        refreshKeybindButtons();
        return;
      }
      if (keyUpper.length === 1 && /\S/.test(keyUpper)) {
        state.specialKeys[state.listeningAction] = keyUpper;
        containerEl.querySelector('#erc-keybind-notice').textContent =
          `${state.listeningAction.toUpperCase()} bound to "${keyUpper}".`;
      }
      state.listeningAction = null;
      refreshKeybindButtons();
      return;
    }

    if (state.phase !== 'playing') return;

    if (keyUpper === state.specialKeys.surge.toUpperCase()) {
      e.preventDefault();
      surgeForward(9);
      return;
    }
    if (keyUpper === state.specialKeys.bomb.toUpperCase()) {
      e.preventDefault();
      launchKick('bomb');
      return;
    }
    if (keyUpper === state.specialKeys.grubber.toUpperCase()) {
      e.preventDefault();
      launchKick('grubber');
      return;
    }

    // Direct C, D, E, F, G computer keys (if not already consumed by PianoPad's QWERTY piano)
    if (PIANO_FREQS[keyUpper] && !e.repeat) {
      handleLaneNote(keyUpper);
    }
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });

  initTeamSelectors();
  refreshKeybindButtons();
  resetSetOfSix(0.84);
  startPokieSpin();

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

  let lastTimestamp = performance.now();
  function frame(now) {
    if (!containerEl) return;
    animFrameId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTimestamp) / 1000));
    lastTimestamp = now;
    stepPokieReel(dt);
    updateSimulation(dt);
    renderCanvas(now / 1000);
  }
  animFrameId = requestAnimationFrame(frame);
}
