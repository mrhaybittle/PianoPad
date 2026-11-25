// js/games/ercRugby.js
import { initAudio, audioCtx, playTone, playErrorClackSound } from '../audio.js';
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
const LANE_NOTES = ['C', 'D', 'E', 'F', 'G'];
const NOTE_TO_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4 };

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
    statusEl.textContent = '🏉 ERC Sports Rugby Ready! Assign MIDI notes or keys, then pass across C–G!';
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
        height: 64px;
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
        max-width: 780px;
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
        grid-template-columns: 1fr 1.55fr;
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
        background: rgba(251, 191, 36, 0.25) !important;
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
        <span><b style="color:#94a3b8; font-size:10px; text-transform:uppercase;">Pass (C–G):</b> <span style="padding:2px 5px; border-radius:4px; background:rgba(255,255,255,0.1); color:#a5f3fc; font-family:monospace; font-weight:800;">C D E F G</span></span>
        <span><b style="color:#6ee7b7; font-size:10px; text-transform:uppercase;">Run:</b> <span id="erc-leg-surge" style="padding:2px 5px; border-radius:4px; background:rgba(16,185,129,0.2); border:1px solid rgba(52,211,153,0.45); color:#a7f3d0; font-family:monospace; font-weight:800;">🎹 A1 / W</span></span>
        <span><b style="color:#fcd34d; font-size:10px; text-transform:uppercase;">Bomb:</b> <span id="erc-leg-bomb" style="padding:2px 5px; border-radius:4px; background:rgba(245,158,11,0.2); border:1px solid rgba(251,191,36,0.45); color:#fde68a; font-family:monospace; font-weight:800;">🎹 B1 / B</span></span>
        <span><b style="color:#7dd3fc; font-size:10px; text-transform:uppercase;">Grubber:</b> <span id="erc-leg-grubber" style="padding:2px 5px; border-radius:4px; background:rgba(14,165,233,0.2); border:1px solid rgba(56,189,248,0.45); color:#bae6fd; font-family:monospace; font-weight:800;">🎹 C2 / N</span></span>
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
              Match Setup &amp; MIDI Controls
            </div>
            <div style="font-size:11px; color:#cbd5e1;">
              Pass across your 5-player backline with <b>C–G</b> (watch out for flat runners — no forward passes!) &amp; bind MIDI notes to Run, Bomb, and Grubber.
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
              <div style="pointer-events:none; position:absolute; left:0; right:0; top:50%; transform:translateY(-50%); height:32px; border-top:1px solid rgba(252,211,77,0.35); border-bottom:1px solid rgba(252,211,77,0.35); background:rgba(251,191,36,0.05);"></div>
              <div id="erc-pokie-name" class="font-sports" style="position:relative; z-index:2; font-style:italic; font-weight:800; font-size:16px; color:#ffffff; text-transform:uppercase;">SPINNING...</div>
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
            <div class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#67e8f9; margin-bottom:4px;">Backline Pass Notes (C1–G1)</div>
            <div style="font-size:11px; color:#cbd5e1; line-height:1.35;">
              Play <b style="color:#fff;">C, D, E, F, G</b> on your MIDI piano to <b>pass the ball</b> to that lane's runner! Support runners drop into depth behind the ball-carrier (don't pass to an amber overrun player or it's a <b>Forward Pass</b>!).
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
              <span class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#6ee7b7;">Assign MIDI Notes or Keys (Run, Bomb, Grubber)</span>
              <span style="font-size:10px; color:#fcd34d; font-weight:700;">Click &amp; play a MIDI note!</span>
            </div>
            <div class="erc-bind-grid">
              <div style="background:#0f172a; border:1px solid rgba(52,211,153,0.28); border-radius:9px; padding:7px; text-align:center;">
                <div class="font-sports" style="font-size:11px; font-weight:800; color:#6ee7b7;">RUN SURGE</div>
                <div style="font-size:10px; color:#94a3b8; margin:2px 0 6px;">Hit up / Sprint</div>
                <button type="button" data-bind-action="surge" class="erc-key-btn sports-btn" style="background:rgba(16,185,129,0.2); border:1px solid rgba(52,211,153,0.6); color:#d1fae5;">🎹 A1 / W</button>
              </div>
              <div style="background:#0f172a; border:1px solid rgba(251,191,36,0.28); border-radius:9px; padding:7px; text-align:center;">
                <div class="font-sports" style="font-size:11px; font-weight:800; color:#fcd34d;">BOMB KICK</div>
                <div style="font-size:10px; color:#94a3b8; margin:2px 0 6px;">High contestable</div>
                <button type="button" data-bind-action="bomb" class="erc-key-btn sports-btn" style="background:rgba(245,158,11,0.2); border:1px solid rgba(251,191,36,0.6); color:#fef3c7;">🎹 B1 / B</button>
              </div>
              <div style="background:#0f172a; border:1px solid rgba(56,189,248,0.28); border-radius:9px; padding:7px; text-align:center;">
                <div class="font-sports" style="font-size:11px; font-weight:800; color:#7dd3fc;">GRUBBER</div>
                <div style="font-size:10px; color:#94a3b8; margin:2px 0 6px;">Low skid kick</div>
                <button type="button" data-bind-action="grubber" class="erc-key-btn sports-btn" style="background:rgba(14,165,233,0.2); border:1px solid rgba(56,189,248,0.6); color:#e0f2fe;">🎹 C2 / N</button>
              </div>
            </div>
            <div id="erc-keybind-notice" style="margin-top:5px; font-size:11px; color:#fcd34d; min-height:14px;">
              Tip: Click any action button above, then press a MIDI piano key (e.g. A1, B1, C2, F#1) or computer key.
            </div>
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

  const savedBinds = (() => {
    try {
      return JSON.parse(localStorage.getItem('erc_rugby_midi_binds_v2') || 'null');
    } catch (e) {
      return null;
    }
  })();

  const state = {
    phase: 'menu', // 'menu' | 'playing' | 'gameover'
    // 'waitingForPlay' (defense set 10m back + marker square, waiting for dummy-half pass/run)
    // 'running' (live phase play)
    // 'retreating' (post-tackle pause while defense retires 10m onside)
    // 'turnoverPause' (brief whistle pause on forward pass / 6th tackle handover)
    playState: 'waitingForPlay',
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

    // Supports BOTH MIDI note bindings (e.g. 'a1', 'b1', 'c2') AND fallback computer keys ('W', 'B', 'N')
    actionBinds: savedBinds || {
      surge: { midi: 'a1', key: 'W', label: '🎹 A1 / W' },
      bomb: { midi: 'b1', key: 'B', label: '🎹 B1 / B' },
      grubber: { midi: 'c2', key: 'N', label: '🎹 C2 / N' }
    },
    listeningAction: null,

    // 5 distinct attacking players across lanes C(0), D(1), E(2), F(3), G(4)
    attackers: [],
    carrierIndex: 2, // Player in possession (yellow/gold jersey highlight when holding ball)
    surgeTimer: 0,

    // Live pass flight state (ball passed through the air between lane runners!)
    passState: {
      active: false,
      fromIdx: 2,
      toIdx: 2,
      startX: 0.5,
      startY: 0.84,
      x: 0.5,
      y: 0.84,
      progress: 0,
      duration: 0.22,
      isForwardPass: false
    },

    // Kick flight state (Bomb / Grubber)
    kickBall: {
      active: false,
      kind: null,
      kickerIdx: 2,
      kickerStartY: 0.84,
      x: 0.5,
      y: 0.84,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      bounceCount: 0
    },

    defenders: [],
    callouts: [],

    tacklePause: {
      timer: 0,
      retreatDuration: 1.1,
      markX: 0.5,
      markY: 0.84,
      onsideY: 0.68,
      markerIdx: 2
    },

    turnoverTimer: 0,

    screenShake: {
      timer: 0,
      duration: 0.34,
      intensity: 14
    }
  };

  function saveActionBinds() {
    try {
      localStorage.setItem('erc_rugby_midi_binds_v2', JSON.stringify(state.actionBinds));
    } catch (e) {}
  }

  function getAudioCtx() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    }
    return null;
  }

  function playPassSound() {
    try {
      const c = getAudioCtx();
      if (!c) return;
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.09);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.11);
    } catch (e) {}
  }

  function playRefWhistle() {
    try {
      const c = getAudioCtx();
      if (!c) return;
      const now = c.currentTime;
      const osc1 = c.createOscillator();
      const osc2 = c.createOscillator();
      const gain = c.createGain();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(2750, now);
      osc2.frequency.setValueAtTime(2815, now); // Classic pea-whistle trill beat
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(c.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.4);
      osc2.stop(now + 0.4);
    } catch (e) {}
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
    state.callouts.push({ text, x, y, color, life: 1.2 });
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
      `${team.name} vs ${state.awayTeam.name} • Pass: C D E F G`;
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
    containerEl.querySelector('#erc-hud-tackle-count').textContent =
      `TACKLE ${state.tackleCount}/${state.maxTackles - 1}`;

    const mins = Math.floor(Math.max(0, state.matchTime) / 60);
    const secs = Math.floor(Math.max(0, state.matchTime) % 60);
    containerEl.querySelector('#erc-hud-clock').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    containerEl.querySelector('#erc-leg-surge').textContent = state.actionBinds.surge.label;
    containerEl.querySelector('#erc-leg-bomb').textContent = state.actionBinds.bomb.label;
    containerEl.querySelector('#erc-leg-grubber').textContent = state.actionBinds.grubber.label;
  }

  // Compute organic echelon depth for player `idx` relative to `carrierIdx`
  // Mirrors your 5 reference images: players further from the ball-carrier drop progressively deeper behind,
  // with natural variation and a ~10% chance of a runner creeping slightly ahead (offside/flat forward-pass risk!).
  function rollSupportAlignment(attacker, idx, carrierIdx) {
    if (idx === carrierIdx) {
      attacker.overrun = false;
      attacker.depthJitter = 0;
      attacker.lateralJitter = 0;
      return;
    }
    const dist = Math.abs(idx - carrierIdx);
    // ~10% chance for a support player (especially adjacent inside/outside runner) to overrun ahead of the ball!
    const willOverrun = Math.random() < 0.10;
    attacker.overrun = willOverrun;
    if (willOverrun) {
      // Runs 2.5% to 4.8% ahead of the ball-carrier (passing to them = FORWARD PASS!)
      attacker.overrunLead = 0.026 + Math.random() * 0.022;
    } else {
      attacker.overrunLead = 0;
    }
    // Natural imperfection in depth & width so the line looks organic, not robotic
    attacker.depthJitter = (Math.random() - 0.35) * 0.018 * dist;
    attacker.lateralJitter = (Math.random() - 0.5) * 0.022;
    attacker.nextRollTimer = 1.6 + Math.random() * 1.9;
  }

  function getDesiredSupportPos(attacker, idx, carrier) {
    const baseLaneX = LANES[idx];
    if (idx === state.carrierIndex) {
      return { x: attacker.x, y: attacker.y };
    }
    const laneSteps = Math.abs(idx - state.carrierIndex);
    // Progressive diagonal echelon step (~0.046 per lane away from ball-carrier, matching your 5 diagrams)
    const echelonDepth = laneSteps * 0.046 + attacker.depthJitter;
    const desiredX = Math.min(0.91, Math.max(0.09, baseLaneX + attacker.lateralJitter));

    let desiredY;
    if (attacker.overrun) {
      desiredY = Math.max(0.13, carrier.y - attacker.overrunLead);
    } else {
      desiredY = Math.min(0.95, Math.max(carrier.y + 0.024, carrier.y + echelonDepth));
    }
    return { x: desiredX, y: desiredY };
  }

  function assignDefenderRoles() {
    // 1 Marker stands square at the ruck; 1-2 line defenders press harder at the ball-carrier
    const markerIdx = state.tacklePause.markerIdx;
    const candidates = [0, 1, 2, 3, 4].filter((i) => i !== markerIdx);
    const chaserA = candidates[Math.floor(Math.random() * candidates.length)];
    state.defenders.forEach((d, idx) => {
      if (idx === markerIdx) {
        d.role = 'marker';
      } else if (idx === chaserA) {
        d.role = 'chaser';
      } else {
        d.role = 'line';
      }
    });
  }

  function spawnFormations(startY = 0.82, initialCarrierIdx = 2) {
    state.carrierIndex = initialCarrierIdx;
    const onsideY = Math.max(0.14, startY - 0.15);
    state.tacklePause.markX = LANES[initialCarrierIdx];
    state.tacklePause.markY = startY;
    state.tacklePause.onsideY = onsideY;
    state.tacklePause.markerIdx = initialCarrierIdx;

    state.attackers = [];
    for (let i = 0; i < 5; i++) {
      const att = {
        laneIndex: i,
        baseX: LANES[i],
        x: LANES[i],
        y: startY,
        vy: 0,
        stridePhase: i * 1.15,
        overrun: false,
        overrunLead: 0,
        depthJitter: 0,
        lateralJitter: 0,
        nextRollTimer: 1.5 + Math.random() * 1.8,
        flashTimer: 0
      };
      rollSupportAlignment(att, i, initialCarrierIdx);
      // Force all 4 support players cleanly onside at the start of a set
      att.overrun = false;
      state.attackers.push(att);
    }

    // Position non-carriers in echelon behind the initial ball-carrier
    const carrier = state.attackers[initialCarrierIdx];
    for (let i = 0; i < 5; i++) {
      if (i !== initialCarrierIdx) {
        const pos = getDesiredSupportPos(state.attackers[i], i, carrier);
        state.attackers[i].x = pos.x;
        state.attackers[i].y = pos.y;
      }
    }

    // 5 Defenders: 1 Marker opposite the play-the-ball + 4 retired 10m back onside
    state.defenders = [];
    for (let i = 0; i < 5; i++) {
      const isMarker = i === initialCarrierIdx;
      state.defenders.push({
        x: LANES[i],
        y: isMarker ? Math.max(0.14, startY - 0.042) : onsideY,
        baseX: LANES[i],
        phase: Math.random() * Math.PI * 2,
        stridePhase: Math.random() * Math.PI * 2,
        role: isMarker ? 'marker' : 'line'
      });
    }
  }

  function resetSetOfSix(startY = 0.82, carrierIdx = 2) {
    state.surgeTimer = 0;
    state.passState.active = false;
    state.kickBall.active = false;
    state.kickBall.z = 0;
    state.tackleCount = 0;
    state.playState = 'waitingForPlay';
    spawnFormations(startY, carrierIdx);
    syncHudAndLegend();
  }

  function triggerTurnover(reasonText, color = '#fb7185') {
    playRefWhistle();
    playErrorClackSound();
    state.passState.active = false;
    state.kickBall.active = false;
    state.awayScore += 2;
    if (bridgeRef && bridgeRef.getState().gameStats) {
      bridgeRef.getState().gameStats.miss += 1;
    }
    const carrier = state.attackers[state.carrierIndex] || { x: 0.5, y: 0.5 };
    addCallout(reasonText, carrier.x, Math.max(0.2, carrier.y - 0.05), color);
    syncHudAndLegend();

    state.playState = 'turnoverPause';
    state.turnoverTimer = 1.25;
  }

  // Triggered when a defender tackles the current ball-carrier
  function beginTackleAndRetreat(tacklerIdx) {
    const carrier = state.attackers[state.carrierIndex];
    state.tackleCount += 1;
    state.surgeTimer = 0;
    carrier.vy = 0;

    state.screenShake.timer = state.screenShake.duration;
    state.screenShake.intensity = 15;
    playTackleHitSound();

    // Rugby League 6-tackle rule: handover after completion of 6th tackle!
    if (state.tackleCount >= state.maxTackles) {
      triggerTurnover(`6TH TACKLE HANDOVER! ${state.awayTeam.name} +2`, '#fb7185');
      return;
    }

    state.playState = 'retreating';
    state.tacklePause.timer = 0;
    state.tacklePause.markX = carrier.x;
    state.tacklePause.markY = carrier.y;
    state.tacklePause.onsideY = Math.max(0.13, carrier.y - 0.145);
    state.tacklePause.markerIdx = tacklerIdx;

    // Re-roll support alignments for the upcoming play-the-ball (10% overrun chance on next phase)
    state.attackers.forEach((att, idx) => {
      rollSupportAlignment(att, idx, state.carrierIndex);
    });

    syncHudAndLegend();
    addCallout(`TACKLE ${state.tackleCount}! DEFENSE RETREAT 10m`, carrier.x, carrier.y - 0.05, '#fda4af');
  }

  // Releases the defense once the ball is passed from dummy-half or the carrier runs off the mark
  function releasePlayTheBall() {
    if (state.playState === 'retreating' || state.playState === 'turnoverPause') return false;
    if (state.playState === 'waitingForPlay') {
      state.playState = 'running';
      assignDefenderRoles();
    }
    return true;
  }

  // Pass the ball from current ball-carrier to target lane player `targetIdx`
  function passBallToLane(targetIdx) {
    if (state.phase !== 'playing') return;
    if (state.playState === 'retreating' || state.playState === 'turnoverPause') {
      const c = state.attackers[state.carrierIndex];
      addCallout('WAIT FOR PLAY-THE-BALL!', c.x, c.y - 0.04, '#fcd34d');
      return;
    }
    if (state.passState.active || state.kickBall.active) return;

    const fromIdx = state.carrierIndex;
    const passer = state.attackers[fromIdx];

    // If pressing the note of the player who ALREADY has the ball: dummy-half / ball-carrier runs!
    if (targetIdx === fromIdx) {
      releasePlayTheBall();
      passer.flashTimer = 0.22;
      passer.vy = Math.min(passer.vy, -0.165);
      addCallout(`${LANE_NOTES[targetIdx]} SCOOTS!`, passer.x, passer.y - 0.04, '#bae6fd');
      return;
    }

    const receiver = state.attackers[targetIdx];

    // Release play-the-ball as the pass leaves hands (per NRL rules, defense can move once passed)
    releasePlayTheBall();
    playPassSound();

    // Check Rugby League Forward Pass Law:
    // Smaller Y = closer to opponent's dead-ball line. If receiver is ahead of passer by > 0.006, it's forward!
    const thrownForward = receiver.y < passer.y - 0.006;

    const laneDist = Math.abs(targetIdx - fromIdx);
    state.passState.active = true;
    state.passState.fromIdx = fromIdx;
    state.passState.toIdx = targetIdx;
    state.passState.startX = passer.x;
    state.passState.startY = passer.y;
    state.passState.x = passer.x;
    state.passState.y = passer.y;
    state.passState.progress = 0;
    state.passState.duration = 0.14 + laneDist * 0.055;
    state.passState.isForwardPass = thrownForward;

    addCallout(
      `PASS ${LANE_NOTES[fromIdx]} → ${LANE_NOTES[targetIdx]}`,
      (passer.x + receiver.x) * 0.5,
      Math.min(passer.y, receiver.y) - 0.035,
      thrownForward ? '#fb7185' : '#bae6fd'
    );
  }

  function surgeForward() {
    if (state.phase !== 'playing') return;
    if (!releasePlayTheBall()) {
      const c = state.attackers[state.carrierIndex];
      addCallout('HOLD! DEFENSE GETTING ONSIDE...', c.x, c.y - 0.04, '#fcd34d');
      return;
    }
    const carrier = state.attackers[state.carrierIndex];
    state.surgeTimer = 0.65;
    carrier.vy = -0.25;
    carrier.flashTimer = 0.25;
    addCallout('HIT IT UP!', carrier.x, carrier.y - 0.04, '#6ee7b7');
  }

  function launchKick(kind) {
    if (state.phase !== 'playing' || state.kickBall.active || state.passState.active) return;
    if (!releasePlayTheBall()) return;

    const kicker = state.attackers[state.carrierIndex];
    playKickSound(kind);

    state.kickBall.active = true;
    state.kickBall.kind = kind;
    state.kickBall.kickerIdx = state.carrierIndex;
    state.kickBall.kickerStartY = kicker.y;
    state.kickBall.x = kicker.x;
    state.kickBall.y = kicker.y - 0.03;
    state.kickBall.bounceCount = 0;

    // Put onside chasers in motion behind the kicker
    state.attackers.forEach((att, idx) => {
      if (idx !== state.carrierIndex && att.y < kicker.y) {
        // Offside chaser at kick time! Mark them offside unless kicker runs them onside
        att.offsideOnKick = true;
      } else {
        att.offsideOnKick = false;
      }
    });

    if (kind === 'bomb') {
      state.kickBall.vy = -0.33;
      state.kickBall.vx = (Math.random() - 0.5) * 0.12;
      state.kickBall.z = 0.05;
      state.kickBall.vz = 0.48;
      addCallout('HIGH BOMB!', kicker.x, kicker.y - 0.05, '#fcd34d');
    } else {
      state.kickBall.vy = -0.42;
      state.kickBall.vx = (Math.random() - 0.5) * 0.07;
      state.kickBall.z = 0.01;
      state.kickBall.vz = 0.08;
      addCallout('GRUBBER KICK!', kicker.x, kicker.y - 0.05, '#7dd3fc');
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

  // Handles incoming MIDI / PianoPad notes for BOTH menu keybinding AND in-game passing/actions
  function onPianoNoteDown(noteStr) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (!clean) return;

    const freq = getNoteFrequency(clean);
    if (freq) playTone(freq, 0.24, 0.85);
    if (bridgeRef) bridgeRef.highlightKey(noteStr, 200, '#38bdf8');

    // 1. If the user is assigning a MIDI note in the Setup Menu: capture this MIDI note!
    if (state.listeningAction) {
      const action = state.listeningAction;
      const existingKey = state.actionBinds[action].key || '';
      const upperNote = clean.toUpperCase();
      state.actionBinds[action] = {
        midi: clean,
        key: existingKey,
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

    // 2. Check if this exact MIDI note (e.g. 'a1', 'b1', 'c2', 'f#1') is bound to Run, Bomb, or Grubber!
    if (state.actionBinds.surge.midi === clean) {
      surgeForward();
      return;
    }
    if (state.actionBinds.bomb.midi === clean) {
      launchKick('bomb');
      return;
    }
    if (state.actionBinds.grubber.midi === clean) {
      launchKick('grubber');
      return;
    }

    // 3. Otherwise check natural C, D, E, F, G notes to PASS the ball to that lane's runner
    const m = clean.toUpperCase().match(/^([A-G])(#?)/);
    if (!m || m[2] === '#') return; // Ignore sharps unless bound to an action
    const letter = m[1];
    if (NOTE_TO_INDEX[letter] !== undefined) {
      highlightStripButton(letter);
      passBallToLane(NOTE_TO_INDEX[letter]);
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
    resetSetOfSix(0.82, 2);

    startModalEl.style.display = 'none';
    hudEl.style.display = 'flex';
    legendEl.style.display = 'block';
    pianoStripEl.style.display = 'flex';
    syncHudAndLegend();
    addCallout('KICK OFF! PASS WITH C–G OR HIT IT UP!', 0.5, 0.74, '#fef08a');
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
    for (const att of state.attackers) {
      if (att.flashTimer > 0) att.flashTimer = Math.max(0, att.flashTimer - dt);
    }

    state.matchTime -= dt;
    if (state.matchTime <= 0) {
      state.matchTime = 0;
      syncHudAndLegend();
      finishMatch();
      return;
    }
    syncHudAndLegend();

    for (let i = state.callouts.length - 1; i >= 0; i--) {
      state.callouts[i].life -= dt * 1.05;
      state.callouts[i].y -= dt * 0.045;
      if (state.callouts[i].life <= 0) {
        state.callouts.splice(i, 1);
      }
    }

    // Brief whistle stoppage after Forward Pass or 6th Tackle Handover
    if (state.playState === 'turnoverPause') {
      state.turnoverTimer -= dt;
      if (state.turnoverTimer <= 0) {
        resetSetOfSix(0.84, 2);
        addCallout('NEW SET! DEFENSE ONSIDE 10m', 0.5, 0.76, '#fde047');
      }
      return;
    }

    const carrier = state.attackers[state.carrierIndex];

    // =========================================================================
    // PHASE A: POST-TACKLE RETREAT — Marker stands square at the play-the-ball,
    // remaining 4 defenders retire 10m back onside, and support runners drop
    // back into staggered echelon alignment behind the tackled ball-carrier!
    // =========================================================================
    if (state.playState === 'retreating') {
      state.tacklePause.timer += dt;
      const targetOnsideY = state.tacklePause.onsideY;

      carrier.y = state.tacklePause.markY;
      for (let i = 0; i < 5; i++) {
        if (i === state.carrierIndex) continue;
        const att = state.attackers[i];
        const desired = getDesiredSupportPos(att, i, carrier);
        att.x += (desired.x - att.x) * Math.min(1, dt * 5.5);
        att.y += (desired.y - att.y) * Math.min(1, dt * 5.5);
        att.stridePhase += dt * 9;
      }

      let allOnside = true;
      for (let i = 0; i < state.defenders.length; i++) {
        const d = state.defenders[i];
        const isMarker = i === state.tacklePause.markerIdx;
        const targetX = isMarker ? state.tacklePause.markX : LANES[i];
        const targetY = isMarker ? Math.max(0.13, state.tacklePause.markY - 0.042) : targetOnsideY;

        d.x += (targetX - d.x) * Math.min(1, dt * 6.5);
        d.y += (targetY - d.y) * Math.min(1, dt * 7.0);
        d.stridePhase += dt * 15;

        if (Math.abs(d.y - targetY) > 0.012 || Math.abs(d.x - targetX) > 0.015) {
          allOnside = false;
        }
      }

      if (state.tacklePause.timer >= state.tacklePause.retreatDuration || allOnside) {
        state.playState = 'waitingForPlay';
        addCallout('SET! PASS (C–G) OR RUN', carrier.x, carrier.y - 0.045, '#fde047');
      }
      return;
    }

    // =========================================================================
    // PHASE B: WAITING AT PLAY-THE-BALL — Defense is locked 10m back onside
    // (plus 1 square Marker) and CANNOT move until you pass or run!
    // =========================================================================
    if (state.playState === 'waitingForPlay') {
      for (const d of state.defenders) {
        d.stridePhase += dt * 3.2;
      }
      for (let i = 0; i < 5; i++) {
        if (i === state.carrierIndex) continue;
        const att = state.attackers[i];
        const desired = getDesiredSupportPos(att, i, carrier);
        att.x += (desired.x - att.x) * Math.min(1, dt * 4.5);
        att.y += (desired.y - att.y) * Math.min(1, dt * 4.5);
      }
      return;
    }

    // =========================================================================
    // PHASE C: LIVE RUGBY LEAGUE OPEN PLAY
    // =========================================================================
    if (state.surgeTimer > 0) {
      state.surgeTimer = Math.max(0, state.surgeTimer - dt);
    }

    // 1. Update airborne PASS between backline players
    if (state.passState.active) {
      state.passState.progress += dt / state.passState.duration;
      const receiver = state.attackers[state.passState.toIdx];
      const t = Math.min(1, state.passState.progress);

      state.passState.x = state.passState.startX + (receiver.x - state.passState.startX) * t;
      state.passState.y = state.passState.startY + (receiver.y - state.passState.startY) * t;

      if (t >= 1) {
        state.passState.active = false;
        // Re-check if ball travelled forward toward opponent's dead-ball line
        const landedForward = state.passState.isForwardPass || receiver.y < state.passState.startY - 0.008;
        if (landedForward) {
          state.carrierIndex = state.passState.toIdx;
          triggerTurnover('FORWARD PASS! SCRUM / TURNOVER +2', '#fb7185');
          return;
        }

        // Clean backwards/flat catch! Receiver becomes the new yellow-highlighted ball-carrier
        state.carrierIndex = state.passState.toIdx;
        receiver.flashTimer = 0.25;
        receiver.vy = Math.min(receiver.vy, -0.155);
        if (bridgeRef && bridgeRef.getState().gameStats) {
          bridgeRef.getState().gameStats.perfect += 1;
        }

        // Other 4 players now adjust their target echelon relative to the NEW ball-carrier!
        state.attackers.forEach((att, idx) => {
          rollSupportAlignment(att, idx, state.carrierIndex);
        });
      }
    }

    // 2. Move current ball-carrier up-field & support runners into dynamic staggered depth
    const activeCarrier = state.attackers[state.carrierIndex];
    const targetCarrierVy = state.passState.active
      ? -0.075
      : state.surgeTimer > 0
      ? -0.23
      : -0.12;

    activeCarrier.vy += (targetCarrierVy - activeCarrier.vy) * Math.min(1, dt * 8);
    activeCarrier.y += activeCarrier.vy * dt;
    activeCarrier.x += (LANES[state.carrierIndex] - activeCarrier.x) * Math.min(1, dt * 3.5);
    const runRate = state.surgeTimer > 0 ? 22 : 14;
    activeCarrier.stridePhase += dt * runRate;

    // Support runners drop back or push up organically (with ~10% overrun chance)
    for (let i = 0; i < 5; i++) {
      if (i === state.carrierIndex) continue;
      const att = state.attackers[i];

      att.nextRollTimer -= dt;
      if (att.nextRollTimer <= 0 && !state.passState.active && !state.kickBall.active) {
        rollSupportAlignment(att, i, state.carrierIndex);
      }

      if (state.kickBall.active) {
        // Onside kick chasers sprint up-field after the kick!
        if (!att.offsideOnKick) {
          att.y -= 0.19 * dt;
          att.stridePhase += dt * 18;
        } else {
          // Offside player holds back until kicker runs them onside (10m rule)
          if (activeCarrier.y <= att.y) att.offsideOnKick = false;
          att.stridePhase += dt * 6;
        }
      } else {
        const desired = getDesiredSupportPos(att, i, activeCarrier);
        // Smooth organic running back into depth (not instant snapping!)
        att.x += (desired.x - att.x) * Math.min(1, dt * 3.2);
        att.y += (desired.y - att.y) * Math.min(1, dt * 3.8);
        att.stridePhase += dt * (runRate * 0.92);
      }
    }

    // 3. Try scored when ball-carrier crosses opponent's goal line (top try-line)
    if (!state.passState.active && !state.kickBall.active && activeCarrier.y <= 0.12) {
      state.homeScore += 4;
      if (bridgeRef && bridgeRef.getState().gameStats) {
        bridgeRef.getState().gameStats.perfect += 4;
      }
      addCallout(`TRY BY ${LANE_NOTES[state.carrierIndex]}! +4`, activeCarrier.x, 0.16, '#4ade80');
      syncHudAndLegend();
      resetSetOfSix(0.84, 2);
      return;
    }

    // 4. Kicked ball physics (Bomb / Grubber) — nearest onside attacker can regather!
    if (state.kickBall.active) {
      state.kickBall.x += state.kickBall.vx * dt;
      state.kickBall.y += state.kickBall.vy * dt;

      if (state.kickBall.kind === 'bomb') {
        state.kickBall.vz -= 1.05 * dt;
        state.kickBall.z += state.kickBall.vz * dt;
        if (state.kickBall.z <= 0) {
          state.kickBall.z = 0;
          state.kickBall.vz = Math.abs(state.kickBall.vz) * 0.42;
          state.kickBall.bounceCount += 1;
        }
      } else {
        state.kickBall.vy *= Math.pow(0.45, dt);
      }

      // Check if an onside attacker regathers the low/bouncing kick
      if (state.kickBall.z < 0.08 && (state.kickBall.bounceCount >= 1 || state.kickBall.kind === 'grubber')) {
        for (let i = 0; i < 5; i++) {
          const att = state.attackers[i];
          if (att.offsideOnKick) continue;
          if (Math.hypot(att.x - state.kickBall.x, att.y - state.kickBall.y) < 0.055) {
            state.carrierIndex = i;
            state.kickBall.active = false;
            state.tackleCount = 0; // Six-again / regathered kick!
            att.flashTimer = 0.3;
            addCallout(`${LANE_NOTES[i]} REGATHERS KICK!`, att.x, att.y - 0.05, '#fde047');
            break;
          }
        }
      }

      // If bomb bounces twice or grubber stops without an attacker nearby, closest lane runner contests it
      if (state.kickBall.active && (state.kickBall.bounceCount >= 2 || (state.kickBall.kind === 'grubber' && Math.abs(state.kickBall.vy) < 0.14))) {
        let bestIdx = state.carrierIndex;
        let bestDist = Infinity;
        for (let i = 0; i < 5; i++) {
          if (state.attackers[i].offsideOnKick) continue;
          const d = Math.abs(LANES[i] - state.kickBall.x);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        const catcher = state.attackers[bestIdx];
        catcher.x = Math.min(0.88, Math.max(0.12, state.kickBall.x));
        catcher.y = Math.min(0.88, Math.max(0.12, state.kickBall.y));
        state.carrierIndex = bestIdx;
        state.kickBall.active = false;
        addCallout(`${LANE_NOTES[bestIdx]} TAKES THE KICK!`, catcher.x, catcher.y - 0.05, '#7dd3fc');
      }

      if (state.kickBall.active && state.kickBall.y <= 0.11) {
        state.homeScore += 4;
        if (bridgeRef && bridgeRef.getState().gameStats) {
          bridgeRef.getState().gameStats.perfect += 4;
        }
        addCallout('KICK CHASE TRY! +4', state.kickBall.x, 0.16, '#4ade80');
        state.kickBall.active = false;
        syncHudAndLegend();
        resetSetOfSix(0.84, 2);
        return;
      }
    }

    // 5. Defensive Line Speed & Tackling (per RL rules: only the ball-carrier may be tackled!)
    state.tacklePause.onsideY = Math.min(activeCarrier.y - 0.015, state.tacklePause.onsideY + 0.062 * dt);
    const advancingLineY = Math.max(0.13, state.tacklePause.onsideY);

    for (let i = 0; i < state.defenders.length; i++) {
      const d = state.defenders[i];
      d.phase += dt * 2.0;
      d.stridePhase += dt * 14;

      if (d.role === 'chaser' || d.role === 'marker') {
        const toX = activeCarrier.x - d.x;
        const toY = activeCarrier.y - d.y;
        const distToCarrier = Math.max(0.001, Math.hypot(toX, toY));
        const chaseSpeed = d.role === 'marker' ? 0.105 : 0.128;
        d.x += (toX / distToCarrier) * chaseSpeed * dt;
        d.y += (toY / distToCarrier) * chaseSpeed * dt;
      } else {
        // Defensive line slides across toward the ball while moving up in a flat line
        const slideShift = (activeCarrier.x - 0.5) * 0.16;
        const targetX = Math.min(0.91, Math.max(0.09, d.baseX + slideShift + Math.sin(d.phase) * 0.014));
        // Defenders directly opposite the ball-carrier step up to shut the gate
        const oppCarrier = i === state.carrierIndex;
        const targetY = oppCarrier ? activeCarrier.y - 0.01 : advancingLineY;
        d.x += (targetX - d.x) * Math.min(1, dt * 4.2);
        d.y += (targetY - d.y) * Math.min(1, dt * 3.8);
      }

      // Only tackle when the ball is in hands (not mid-pass or mid-kick)
      if (!state.passState.active && !state.kickBall.active) {
        const dist = Math.hypot(d.x - activeCarrier.x, d.y - activeCarrier.y);
        if (dist < 0.036) {
          beginTackleAndRetreat(i);
          return;
        }
      }
    }
  }

  // Draws running player sprites — with golden ball-carrier jersey option matching your reference diagrams!
  function drawRunningPlayer(ctx, x, y, team, stridePhase, opts = {}) {
    const {
      scale = 1,
      isCarrier = false,
      isHighlighted = false,
      isSurging = false,
      isOverrun = false,
      laneLabel = ''
    } = opts;

    const wave = Math.sin(stridePhase);
    const leftLegLen = (wave >= 0 ? 13 : 6) * scale;
    const rightLegLen = (wave < 0 ? 13 : 6) * scale;
    const leftSwingX = wave * 4.5 * scale;
    const rightSwingX = -wave * 4.5 * scale;
    const bobY = -Math.abs(wave) * 2.5 * scale;

    ctx.save();
    ctx.translate(x, y + bobY);

    // Subtle warning ring if this support runner has overrun ahead of the ball-carrier (Forward Pass risk!)
    if (isOverrun && !isCarrier) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 1.8 * scale;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(0, 11 * scale - bobY, 16 * scale, 7 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Ground shadow
    ctx.fillStyle = isCarrier ? 'rgba(250, 204, 21, 0.28)' : 'rgba(0, 0, 0, 0.36)';
    ctx.beginPath();
    ctx.ellipse(0, 12 * scale - bobY, 13 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';

    // Alternating long & short running legs
    ctx.strokeStyle = isCarrier ? '#fde68a' : team.secondary;
    ctx.lineWidth = 4.2 * scale;
    ctx.beginPath();
    ctx.moveTo(-4.5 * scale, 3 * scale);
    ctx.lineTo(-4.5 * scale + leftSwingX, 3 * scale + leftLegLen);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(4.5 * scale, 3 * scale);
    ctx.lineTo(4.5 * scale + rightSwingX, 3 * scale + rightLegLen);
    ctx.stroke();

    // Jersey torso: warm gold highlight on the active ball-carrier (matching your reference diagrams!)
    const jerseyFill = isCarrier ? '#eab308' : team.primary;
    const jerseyTrim = isHighlighted ? '#67e8f9' : isCarrier ? '#fef08a' : team.secondary;

    ctx.fillStyle = jerseyFill;
    ctx.strokeStyle = jerseyTrim;
    ctx.lineWidth = (isSurging || isCarrier ? 3.2 : 2.2) * scale;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-9 * scale, -8 * scale, 18 * scale, 13 * scale, 4 * scale);
    } else {
      ctx.rect(-9 * scale, -8 * scale, 18 * scale, 13 * scale);
    }
    ctx.fill();
    ctx.stroke();

    // Pumping arms
    ctx.strokeStyle = jerseyFill;
    ctx.lineWidth = 3.4 * scale;
    ctx.beginPath();
    ctx.moveTo(-9 * scale, -5 * scale);
    ctx.lineTo(-12 * scale - rightSwingX * 0.6, 2 * scale);
    ctx.moveTo(9 * scale, -5 * scale);
    ctx.lineTo(12 * scale - leftSwingX * 0.6, 2 * scale);
    ctx.stroke();

    // Note badge on back of jersey for attackers (C, D, E, F, G) so you always see who to pass to!
    if (laneLabel) {
      ctx.fillStyle = isCarrier ? '#0f172a' : '#ffffff';
      ctx.font = `800 ${Math.round(9 * scale)}px "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(laneLabel, 0, -1.2 * scale);
    }

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

    // Visual 10m onside line while defense retreats or waits onside
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

    // Subtle horizontal pass-plane guide through the ball-carrier so you can spot forward-pass overrun risk!
    if (state.attackers.length === 5 && !state.kickBall.active) {
      const carrier = state.attackers[state.carrierIndex];
      const planeY = padY + fieldH * carrier.y;
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(padX, planeY);
      ctx.lineTo(padX + fieldW, planeY);
      ctx.stroke();
      ctx.restore();
    }

    // Vertical C, D, E, F, G lane guides
    ctx.font = '700 11px "Chakra Petch", sans-serif';
    LANES.forEach((fx, idx) => {
      const lx = padX + fieldW * fx;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(lx, padY + fieldH * 0.12);
      ctx.lineTo(lx, padY + fieldH * 0.88);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = idx === state.carrierIndex ? '#fde047' : 'rgba(255, 255, 255, 0.48)';
      ctx.fillText(LANE_NOTES[idx], lx - 4, padY + fieldH * 0.94);
    });

    const scaleFactor = Math.max(0.78, Math.min(1.05, h / 430));

    // 5 Defenders (Away team)
    for (const d of state.defenders) {
      const dx = padX + fieldW * d.x;
      const dy = padY + fieldH * d.y;
      drawRunningPlayer(ctx, dx, dy, state.awayTeam, d.stridePhase, { scale: 0.96 * scaleFactor });
    }

    // 5 Attacking Backline Players (Home team — active ball-carrier gets yellow/gold jersey highlight)
    for (let i = 0; i < state.attackers.length; i++) {
      const att = state.attackers[i];
      const ax = padX + fieldW * att.x;
      const ay = padY + fieldH * att.y;
      const isCarrier = i === state.carrierIndex && !state.passState.active && !state.kickBall.active;

      drawRunningPlayer(ctx, ax, ay, state.homeTeam, att.stridePhase, {
        scale: (isCarrier ? 1.05 : 0.96) * scaleFactor,
        isCarrier,
        isHighlighted: att.flashTimer > 0,
        isSurging: isCarrier && state.surgeTimer > 0,
        isOverrun: att.overrun,
        laneLabel: LANE_NOTES[i]
      });

      if (att.overrun && !isCarrier && !state.kickBall.active) {
        ctx.save();
        ctx.font = '700 9px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fcd34d';
        ctx.fillText('FLAT!', ax, ay - 21 * scaleFactor);
        ctx.restore();
      }
    }

    // Rugby ball (mid-pass spiral, airborne/skidding kick, at play-the-ball ruck, or carried in hands)
    let bx = padX + fieldW * 0.5;
    let by = padY + fieldH * 0.84;
    let ballSpin = 0.35;

    if (state.passState.active) {
      const arcLift = Math.sin(state.passState.progress * Math.PI) * 14 * scaleFactor;
      bx = padX + fieldW * state.passState.x;
      by = padY + fieldH * state.passState.y - 8 * scaleFactor - arcLift;
      ballSpin = 11;
    } else if (state.kickBall.active) {
      bx = padX + fieldW * state.kickBall.x;
      by = padY + fieldH * state.kickBall.y - state.kickBall.z * 95;
      ballSpin = 9;
    } else if (state.attackers[state.carrierIndex]) {
      const c = state.attackers[state.carrierIndex];
      bx = padX + fieldW * c.x + 8 * scaleFactor;
      by =
        state.playState === 'retreating' || state.playState === 'waitingForPlay'
          ? padY + fieldH * c.y + 6 * scaleFactor
          : padY + fieldH * c.y - 3 * scaleFactor;
    }

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(timeSec * ballSpin);
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.2 * scaleFactor, 8.2 * scaleFactor, 0, 0, Math.PI * 2);
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
        `🎹 Listening for ${action.toUpperCase()}... play ANY MIDI piano key (e.g. A1, B1, C2, F#1) or press a computer key (Esc to cancel).`;
      refreshKeybindButtons();
      btn.blur();
    });
  });

  containerEl.querySelectorAll('.piano-key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const note = btn.getAttribute('data-note');
      highlightStripButton(note);
      if (PIANO_FREQS[note]) playTone(PIANO_FREQS[note], 0.24, 0.85);
      passBallToLane(NOTE_TO_INDEX[note]);
    });
  });

  containerEl.querySelector('#erc-start-match-btn').addEventListener('click', startMatch);

  // Computer keyboard fallback handler (skips PianoPad's QWERTY piano keys during rebinding so MIDI/non-piano keys work cleanly)
  const PIANOPAD_QWERTY = new Set([
    'z','s','x','d','c','v','g','b','h','n','j','m',',','l','.',
    '1','q','w','3','e','4','r','5','t','y','7','u','8','i','o','0','p'
  ]);

  const onKeyDown = (e) => {
    const keyUpper = (e.key || '').toUpperCase();
    const keyLower = (e.key || '').toLowerCase();

    if (state.listeningAction) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        state.listeningAction = null;
        containerEl.querySelector('#erc-keybind-notice').textContent = 'Binding cancelled.';
        refreshKeybindButtons();
        return;
      }
      // If user presses a PianoPad QWERTY piano shortcut, let PianoPad turn it into a MIDI note for `onPianoNoteDown`!
      if (PIANOPAD_QWERTY.has(keyLower)) {
        return;
      }
      if (keyUpper.length === 1 && /\S/.test(keyUpper)) {
        e.preventDefault();
        e.stopPropagation();
        const action = state.listeningAction;
        const existingMidi = state.actionBinds[action].midi;
        state.actionBinds[action] = {
          midi: existingMidi,
          key: keyUpper,
          label: existingMidi ? `🎹 ${existingMidi.toUpperCase()} / ${keyUpper}` : `KEY: ${keyUpper}`
        };
        state.listeningAction = null;
        saveActionBinds();
        containerEl.querySelector('#erc-keybind-notice').textContent =
          `✅ ${action.toUpperCase()} bound to key "${keyUpper}".`;
        refreshKeybindButtons();
      }
      return;
    }

    if (state.phase !== 'playing' || e.repeat) return;

    if (keyUpper && keyUpper === (state.actionBinds.surge.key || '').toUpperCase()) {
      e.preventDefault();
      surgeForward();
      return;
    }
    if (keyUpper && keyUpper === (state.actionBinds.bomb.key || '').toUpperCase()) {
      e.preventDefault();
      launchKick('bomb');
      return;
    }
    if (keyUpper && keyUpper === (state.actionBinds.grubber.key || '').toUpperCase()) {
      e.preventDefault();
      launchKick('grubber');
      return;
    }

    // Direct C, D, E, F, G computer keys if pressed outside PianoPad's MIDI/QWERTY mapper
    if (!PIANOPAD_QWERTY.has(keyLower) && NOTE_TO_INDEX[keyUpper] !== undefined) {
      highlightStripButton(keyUpper);
      if (PIANO_FREQS[keyUpper]) playTone(PIANO_FREQS[keyUpper], 0.24, 0.85);
      passBallToLane(NOTE_TO_INDEX[keyUpper]);
    }
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });

  initTeamSelectors();
  refreshKeybindButtons();
  resetSetOfSix(0.82, 2);
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
