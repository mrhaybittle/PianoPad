// js/games/ercRugby.js
import { initAudio, audioCtx, playTone, playErrorClackSound } from '../audio.js';
import { getNoteFrequency } from '../musicTheory.js';

let animFrameId = null;
let containerEl = null;
let bridgeRef = null;
let activeController = null;

const TEAMS = [
  { id: 'canterbury-bulldogs', name: 'Canterbury-Bankstown Bulldogs', primary: '#1d4ed8', secondary: '#ffffff', chant: 'Fire up, Doggies!' },
  { id: 'brisbane-broncos', name: 'Brisbane Broncos', primary: '#6b1d2f', secondary: '#fbbf24', chant: 'Buck up, Broncos!' },
  { id: 'canberra-raiders', name: 'Canberra Raiders', primary: '#65a30d', secondary: '#1e3a8a', chant: 'We are the Raiders!' },
  { id: 'cronulla-sharks', name: 'Cronulla-Sutherland Sharks', primary: '#0284c7', secondary: '#ffffff', chant: 'Up, up Cronulla!' },
  { id: 'dolphins', name: 'Dolphins', primary: '#dc2626', secondary: '#fde047', chant: 'Phins up!' },
  { id: 'gold-coast-titans', name: 'Gold Coast Titans', primary: '#0369a1', secondary: '#facc15', chant: 'Titans roar!' },
  { id: 'manly-sea-eagles', name: 'Manly Warringah Sea Eagles', primary: '#7f1d1d', secondary: '#ffffff', chant: 'Manly! Manly!' },
  { id: 'melbourne-storm', name: 'Melbourne Storm', primary: '#312e81', secondary: '#facc15', chant: 'Storm warning!' },
  { id: 'newcastle-knights', name: 'Newcastle Knights', primary: '#1e3a8a', secondary: '#dc2626', chant: 'Go the Knights!' },
  { id: 'nz-warriors', name: 'New Zealand Warriors', primary: '#111827', secondary: '#16a34a', chant: 'New Zealand Warriors!' },
  { id: 'nq-cowboys', name: 'North Queensland Cowboys', primary: '#1e3a8a', secondary: '#facc15', chant: 'Cowboys country!' },
  { id: 'parramatta-eels', name: 'Parramatta Eels', primary: '#1d4ed8', secondary: '#facc15', chant: 'Parra! Parra!' },
  { id: 'penrith-panthers', name: 'Penrith Panthers', primary: '#18181b', secondary: '#f43f5e', chant: 'Let’s go Panthers!' },
  { id: 'souths-rabbitohs', name: 'South Sydney Rabbitohs', primary: '#15803d', secondary: '#dc2626', chant: 'Glory, glory to South Sydney!' },
  { id: 'st-george-illawarra-dragons', name: 'St. George Illawarra Dragons', primary: '#b91c1c', secondary: '#ffffff', chant: 'Up the Dragons!' },
  { id: 'sydney-roosters', name: 'Sydney Roosters', primary: '#1e3a8a', secondary: '#dc2626', chant: 'Easts to win!' },
  { id: 'wests-tigers', name: 'Wests Tigers', primary: '#ea580c', secondary: '#ffffff', chant: 'Tigers charge!' },
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

// ============================================================================
// PIXEL-ART SPRITE ENGINE — Replicating Positioning (5)..(9) with Note Jerseys
// ============================================================================
const PIXEL_FONT_5X7 = {
  C: [
    '1111',
    '1..1',
    '1...',
    '1...',
    '1...',
    '1..1',
    '1111'
  ],
  D: [
    '111.',
    '1..1',
    '1..1',
    '1..1',
    '1..1',
    '1..1',
    '111.'
  ],
  E: [
    '1111',
    '1...',
    '1...',
    '111.',
    '1...',
    '1...',
    '1111'
  ],
  F: [
    '1111',
    '1...',
    '1...',
    '111.',
    '1...',
    '1...',
    '1...'
  ],
  G: [
    '1111',
    '1...',
    '1...',
    '1.11',
    '1..1',
    '1..1',
    '1111'
  ]
};

function buildUpperBodyRows(pose, hasBall) {
  const head = [
    '.........KKKKKKKK.........',
    '........KHHHHHHHHK........',
    '.......KHHHHHHHHHHK.......',
    '.......KHHHHHHHHHHK.......',
    '......KSKHHHHHHHHKSK......',
    '......KSKHHHHHHHHKSK......',
    '.......KKHHHHHHHHKK.......',
    '........KSSSSSSSSK........',
    '........KKKKKKKKKK........',
    '.......KK22222222KK.......'
  ];

  const ballRight = pose === 'idle' || pose === 'runLeft' || pose === 'straightL';

  let torso;
  if (ballRight) {
    if (hasBall) {
      torso = [
        '.....KK111111111111KK.....',
        '....K1122222222222211K....',
        '...K112211111111112211K...',
        '..KK221111111111111122KK..',
        '.KSSK1112222222222111KSSK.',
        '.KSSK111222222222211KKKKK.',
        '.KSSK11111111111111KwwGSSK',
        '.KssK11122222222221KwwGSSK',
        '..KKK11122222222221KwwwKK.',
        '....K11111111111111KGGwK..',
        '....KKKKKKKKKKKKKKKKKKKK..'
      ];
    } else {
      torso = [
        '.....KK111111111111KK.....',
        '....K1122222222222211K....',
        '...K112211111111112211K...',
        '..KK221111111111111122KK..',
        '.KSSK1112222222222111KSSK.',
        '.KSSK1112222222222111KSSK.',
        '.KSSK1111111111111111KssK.',
        '.KssK1112222222222111KKK..',
        '..KKK1112222222222111K....',
        '....K1111111111111111K....',
        '....KKKKKKKKKKKKKKKKKK....'
      ];
    }
  } else {
    if (hasBall) {
      torso = [
        '.....KK111111111111KK.....',
        '....K1122222222222211K....',
        '...K112211111111112211K...',
        '..KK221111111111111122KK..',
        '.KSSK1112222222222111KSSK.',
        '.KKKKK112222222222111KSSK.',
        'KSSGwwK11111111111111KSSK.',
        'KSSGwwK12222222222111KssK.',
        '.KKwwwK12222222222111KKK..',
        '..KwGGK11111111111111K....',
        '..KKKKKKKKKKKKKKKKKKKK....'
      ];
    } else {
      torso = [
        '.....KK111111111111KK.....',
        '....K1122222222222211K....',
        '...K112211111111112211K...',
        '..KK221111111111111122KK..',
        '.KSSK1112222222222111KSSK.',
        '.KSSK1112222222222111KSSK.',
        '.KssK1111111111111111KSSK.',
        '..KKK1112222222222111KssK.',
        '....K1112222222222111KKK..',
        '....K1111111111111111K....',
        '....KKKKKKKKKKKKKKKKKK....'
      ];
    }
  }

  return [...head, ...torso];
}

function buildLowerBodyRows(pose) {
  if (pose === 'idle') {
    return [
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNKKNNNNNNNK....',
      '....KKKKKKKK..KKKKKKKK....',
      '....KSSSSK......KSSSSK....',
      '....KSSSSK......KSSSSK....',
      '....KssssK......KssssK....',
      '....KWWWWK......KWWWWK....',
      '....K1111K......K1111K....',
      '....KNNNNK......KNNNNK....',
      '....KNNNNK......KNNNNK....',
      '..KKBBbBBK......KBBbBBKK..',
      '.KBBBBBBBK......KBBBBBBBK.',
      '.KKKKKKKKK......KKKKKKKKK.',
      '..K.K.K.K........K.K.K.K..'
    ];
  }

  if (pose === 'straightL') {
    return [
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNKKNNNNNNNK....',
      '....KKKKKKKK..KKKKKKKK....',
      '....KSSSSK......KSSSSK....',
      '....KSSSSK......KssssK....',
      '....KssssK......KWWWWK....',
      '....KWWWWK......K1111K....',
      '....K1111K......KNNNNK....',
      '....KNNNNK......KBBbBK....',
      '....KNNNNK......KBBBBK....',
      '....KBBbBK......KKKKKK....',
      '....KBBBBK.......K..K.....',
      '....KKKKKK................',
      '.....K..K.................'
    ];
  }

  if (pose === 'straightR') {
    return [
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNKKNNNNNNNK....',
      '....KKKKKKKK..KKKKKKKK....',
      '....KSSSSK......KSSSSK....',
      '....KssssK......KSSSSK....',
      '....KWWWWK......KssssK....',
      '....K1111K......KWWWWK....',
      '....KNNNNK......K1111K....',
      '....KBBbBK......KNNNNK....',
      '....KBBBBK......KNNNNK....',
      '....KKKKKK......KBBbBK....',
      '.....K..K.......KBBBBK....',
      '................KKKKKK....',
      '.................K..K.....'
    ];
  }

  if (pose === 'runLeft') {
    return [
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNKKNNNNNNNK....',
      '....KKKKKKKK..KKKKKKKK....',
      '....KSSSSK.....KSSSSK.....',
      '....KSSSSK......KSSSSK....',
      '....KssssK.......KsssKK...',
      '....KWWWWK........KWW11K..',
      '....K1111K.........K1NNK..',
      '....KNNNNK..........KNNBK.',
      '....KNNNNK..........KBBBK.',
      '..KKBBbBBK..........KbBBK.',
      '.KBBBBBBBK...........KKKK.',
      '.KKKKKKKKK................',
      '..K.K.K.K.................'
    ];
  }

  return [
    '....KWNNNNNNNNNNNNNNNK....',
    '....KWNNNNNNNNNNNNNNNK....',
    '....KWNNNNNNKKNNNNNNNK....',
    '....KKKKKKKK..KKKKKKKK....',
    '.....KSSSSK.....KSSSSK....',
    '....KSSSSK......KSSSSK....',
    '...KKsssK.......KssssK....',
    '..K11WWK........KWWWWK....',
    '..KNN1K.........K1111K....',
    '.KBNNK..........KNNNNK....',
    '.KBBBK..........KNNNNK....',
    '.KBBbK..........KBBbBBKK..',
    '.KKKK...........KBBBBBBBK.',
    '................KKKKKKKKK.',
    '.................K.K.K.K..'
  ];
}

const spriteCache = new Map();

function getPixelSprite(team, noteLetter, pose, hasBall) {
  const key = `${team.id}|${noteLetter}|${pose}|${hasBall ? 1 : 0}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const rows = [...buildUpperBodyRows(pose, hasBall), ...buildLowerBodyRows(pose)];
  const h = rows.length;
  const w = rows[0].length;
  const grid = rows.map((r) => r.split(''));

  const glyph = PIXEL_FONT_5X7[noteLetter] || PIXEL_FONT_5X7.C;
  const startRow = 12;
  const startCol = 11;

  for (let r = 0; r < glyph.length; r++) {
    for (let c = 0; c < glyph[r].length; c++) {
      if (glyph[r][c] === '1') {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = startRow + r + dr;
            const cc = startCol + c + dc;
            if (grid[rr] && grid[rr][cc]) {
              grid[rr][cc] = 'K';
            }
          }
        }
      }
    }
  }
  for (let r = 0; r < glyph.length; r++) {
    for (let c = 0; c < glyph[r].length; c++) {
      if (glyph[r][c] === '1') {
        grid[startRow + r][startCol + c] = 'W';
      }
    }
  }

  const palette = {
    K: '#09090b',
    H: '#1c1917',
    S: '#eba87c',
    s: '#c98257',
    '1': team.primary,
    '2': team.secondary,
    N: '#111827',
    n: '#334155',
    W: '#ffffff',
    B: '#475569',
    b: '#94a3b8',
    G: '#15803d',
    w: '#f8fafc'
  };

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = grid[y][x];
      if (ch === '.' || !palette[ch]) continue;
      octx.fillStyle = palette[ch];
      octx.fillRect(x, y, 1, 1);
    }
  }

  spriteCache.set(key, off);
  return off;
}

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
    statusEl.textContent = '🏉 ERC Sports Rugby Ready! Choose MIDI keys for Move Left/Right, Run, Bomb & Grubber!';
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
        height: 58px;
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
        image-rendering: pixelated;
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
        bottom: 8px;
        left: 10px;
        z-index: 20;
        display: none;
        pointer-events: none;
        border-radius: 10px;
        background: rgba(2, 6, 23, 0.88);
        border: 1px solid rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(8px);
        padding: 6px 10px;
        font-size: 10.5px;
        max-width: calc(100% - 210px);
      }
      #erc-piano-strip {
        position: absolute;
        bottom: 8px;
        right: 10px;
        z-index: 20;
        display: none;
        border-radius: 10px;
        background: rgba(2, 6, 23, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 5px;
        gap: 4px;
      }
      #erc-piano-strip .piano-key-btn {
        width: 30px;
        height: 38px;
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
        background: #fde047;
        transform: scale(0.94);
      }
      #erc-start-modal {
        position: absolute;
        inset: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        background: rgba(2, 6, 23, 0.86);
        backdrop-filter: blur(8px);
        overflow-y: auto;
      }
      .erc-modal-card {
        width: 100%;
        max-width: 850px;
        max-height: 97%;
        overflow-y: auto;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.97);
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 20px 45px rgba(0, 0, 0, 0.65);
        padding: 12px 16px;
      }
      .erc-setup-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 8px;
      }
      .erc-bind-grid-5 {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 7px;
        margin-top: 6px;
      }
      @media (max-width: 720px) {
        .erc-setup-grid { grid-template-columns: 1fr; }
        .erc-bind-grid-5 { grid-template-columns: repeat(2, 1fr); }
      }
      .erc-panel {
        border-radius: 12px;
        background: rgba(2, 6, 23, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 9px 11px;
      }
      .erc-key-btn {
        width: 100%;
        border-radius: 7px;
        padding: 6px 5px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-weight: 800;
        font-size: 10.5px;
      }
      .erc-key-btn.listening {
        outline: 2px solid #fcd34d;
        background: rgba(251, 191, 36, 0.28) !important;
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
          <span id="erc-hud-possession" style="font-size:9px; font-weight:800; text-transform:uppercase; color:#fde047; letter-spacing:0.06em;">ATTACK • T 0/5</span>
        </div>

        <div style="text-align:left;">
          <div id="erc-hud-away-name" class="font-sports" style="font-size:11px; font-weight:700; text-transform:uppercase; color:#fda4af; max-width:125px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">AWAY</div>
          <div id="erc-hud-away-score" class="font-sports" style="font-size:21px; font-weight:800; line-height:1; color:#ffffff;">0</div>
        </div>
      </div>
    </div>

    <!-- Bottom-left key legend -->
    <div id="erc-key-legend">
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
        <span><b style="color:#fde047;">Pass/Switch:</b> <span style="padding:1px 5px; border-radius:4px; background:rgba(255,255,255,0.12); color:#fef08a; font-family:monospace; font-weight:800;">C D E F G</span></span>
        <span><b style="color:#c4b5fd;">Left:</b> <span id="erc-leg-left" style="font-family:monospace; font-weight:800; color:#ddd6fe;">🎹 F#1 / A</span></span>
        <span><b style="color:#c4b5fd;">Right:</b> <span id="erc-leg-right" style="font-family:monospace; font-weight:800; color:#ddd6fe;">🎹 G#1 / D</span></span>
        <span><b style="color:#6ee7b7;">Run:</b> <span id="erc-leg-surge" style="font-family:monospace; font-weight:800; color:#a7f3d0;">🎹 A1 / W</span></span>
        <span><b style="color:#fcd34d;">Bomb:</b> <span id="erc-leg-bomb" style="font-family:monospace; font-weight:800; color:#fde68a;">🎹 B1 / B</span></span>
        <span><b style="color:#7dd3fc;">Grubber:</b> <span id="erc-leg-grubber" style="font-family:monospace; font-weight:800; color:#bae6fd;">🎹 C2 / N</span></span>
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
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; padding-bottom:7px; border-bottom:1px solid rgba(255,255,255,0.1);">
          <div>
            <div class="font-sports" style="font-style:italic; font-weight:800; font-size:19px; color:#ffffff; text-transform:uppercase;">
              ERC Sports Rugby — Team &amp; MIDI Setup
            </div>
            <div style="font-size:11px; color:#cbd5e1;">
              <b>C, D, E, F, G</b> pass the ball in Offense &amp; switch your yellow-ring defender in Defense. Assign your <b>Move Left / Right</b>, <b>Run</b> &amp; <b>Kick</b> MIDI notes below!
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
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <label for="erc-team-select" class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#67e8f9;">Your Team (Home)</label>
              <span style="font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; background:rgba(6,182,212,0.2); color:#a5f3fc; border:1px solid rgba(34,211,238,0.3);">C D E F G JERSEYS</span>
            </div>
            <select id="erc-team-select" style="width:100%; border-radius:8px; background:#1e293b; border:1px solid rgba(255,255,255,0.2); padding:6px 10px; font-size:13px; font-weight:700; color:#ffffff; cursor:pointer;"></select>
            <div style="margin-top:6px; border-radius:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding:6px 9px; display:flex; align-items:center; gap:9px;">
              <div id="erc-player-swatch" style="width:28px; height:28px; border-radius:6px; border:1px solid rgba(255,255,255,0.35); flex-shrink:0;"></div>
              <div style="min-width:0;">
                <div id="erc-player-title" class="font-sports" style="font-weight:800; font-size:12.5px; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <div id="erc-player-chant" style="font-size:10.5px; color:#cbd5e1;"></div>
              </div>
            </div>
          </div>

          <!-- Pokie Opponent Reel -->
          <div class="erc-panel" style="border-color:rgba(251,191,36,0.28);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#fcd34d;">Computer Opponent (Pokie Reel)</span>
              <span id="erc-reel-badge" style="font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; background:rgba(245,158,11,0.2); color:#fde68a; border:1px solid rgba(251,191,36,0.35);">LOCKED</span>
            </div>
            <div class="pokie-window">
              <div style="pointer-events:none; position:absolute; left:0; right:0; top:50%; transform:translateY(-50%); height:30px; border-top:1px solid rgba(252,211,77,0.35); border-bottom:1px solid rgba(252,211,77,0.35); background:rgba(251,191,36,0.05);"></div>
              <div id="erc-pokie-name" class="font-sports" style="position:relative; z-index:2; font-style:italic; font-weight:800; font-size:15px; color:#ffffff; text-transform:uppercase;">SPINNING...</div>
              <div id="erc-pokie-sub" style="position:relative; z-index:2; font-size:10.5px; color:#fde68a; margin-top:1px;">Randomising opponent...</div>
            </div>
            <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:10px; color:#94a3b8;">Spins when team changes</span>
              <button type="button" id="erc-respin-btn" class="sports-btn font-sports" style="border:none; border-radius:7px; background:#f59e0b; color:#020617; font-weight:800; font-size:10.5px; text-transform:uppercase; padding:4px 10px;">Re-Spin Reel</button>
            </div>
          </div>
        </div>

        <!-- Assignable MIDI Controls -->
        <div class="erc-panel" style="margin-top:8px;">
          <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:6px;">
            <span class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#fde047;">
              🎹 Assign MIDI Piano Keys (Offense &amp; Defense Controls)
            </span>
            <span style="font-size:10.5px; color:#cbd5e1;">
              Fixed Jersey Pass / Switch Notes: <b style="color:#fef08a;">C, D, E, F, G</b> • Click any slot below &amp; play a MIDI note!
            </span>
          </div>

          <div class="erc-bind-grid-5">
            <div style="background:#0f172a; border:1px solid rgba(167,139,250,0.35); border-radius:9px; padding:6px; text-align:center;">
              <div class="font-sports" style="font-size:11px; font-weight:800; color:#c4b5fd;">⬅ MOVE LEFT</div>
              <div style="font-size:9.5px; color:#94a3b8; margin:1px 0 5px;">Offense &amp; Defense</div>
              <button type="button" data-bind-action="moveLeft" class="erc-key-btn sports-btn" style="background:rgba(139,92,246,0.22); border:1px solid rgba(167,139,250,0.6); color:#ede9fe;">🎹 F#1 / A</button>
            </div>

            <div style="background:#0f172a; border:1px solid rgba(167,139,250,0.35); border-radius:9px; padding:6px; text-align:center;">
              <div class="font-sports" style="font-size:11px; font-weight:800; color:#c4b5fd;">MOVE RIGHT ➡</div>
              <div style="font-size:9.5px; color:#94a3b8; margin:1px 0 5px;">Offense &amp; Defense</div>
              <button type="button" data-bind-action="moveRight" class="erc-key-btn sports-btn" style="background:rgba(139,92,246,0.22); border:1px solid rgba(167,139,250,0.6); color:#ede9fe;">🎹 G#1 / D</button>
            </div>

            <div style="background:#0f172a; border:1px solid rgba(52,211,153,0.35); border-radius:9px; padding:6px; text-align:center;">
              <div class="font-sports" style="font-size:11px; font-weight:800; color:#6ee7b7;">⚡ RUN / TACKLE</div>
              <div style="font-size:9.5px; color:#94a3b8; margin:1px 0 5px;">Sprint / Press Up</div>
              <button type="button" data-bind-action="surge" class="erc-key-btn sports-btn" style="background:rgba(16,185,129,0.2); border:1px solid rgba(52,211,153,0.6); color:#d1fae5;">🎹 A1 / W</button>
            </div>

            <div style="background:#0f172a; border:1px solid rgba(251,191,36,0.35); border-radius:9px; padding:6px; text-align:center;">
              <div class="font-sports" style="font-size:11px; font-weight:800; color:#fcd34d;">🏉 BOMB KICK</div>
              <div style="font-size:9.5px; color:#94a3b8; margin:1px 0 5px;">High spiral</div>
              <button type="button" data-bind-action="bomb" class="erc-key-btn sports-btn" style="background:rgba(245,158,11,0.2); border:1px solid rgba(251,191,36,0.6); color:#fef3c7;">🎹 B1 / B</button>
            </div>

            <div style="background:#0f172a; border:1px solid rgba(56,189,248,0.35); border-radius:9px; padding:6px; text-align:center;">
              <div class="font-sports" style="font-size:11px; font-weight:800; color:#7dd3fc;">💨 GRUBBER</div>
              <div style="font-size:9.5px; color:#94a3b8; margin:1px 0 5px;">Low skid kick</div>
              <button type="button" data-bind-action="grubber" class="erc-key-btn sports-btn" style="background:rgba(14,165,233,0.2); border:1px solid rgba(56,189,248,0.6); color:#e0f2fe;">🎹 C2 / N</button>
            </div>
          </div>

          <div id="erc-keybind-notice" style="margin-top:5px; font-size:11px; color:#fcd34d; min-height:14px;">
            Click any control button above, then press any MIDI piano key (e.g. F#1, G#1, A1, B1, C2, D2) or computer key!
          </div>
        </div>

        <div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.1); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px;">
          <div id="erc-matchup-summary" style="font-size:12px; color:#cbd5e1; font-weight:600;">Ready for kick-off.</div>
          <button type="button" id="erc-start-match-btn" class="sports-btn font-sports" style="border:none; border-radius:10px; background:linear-gradient(90deg, #dc2626, #ef4444, #2563eb); color:#ffffff; font-style:italic; font-weight:800; font-size:15px; text-transform:uppercase; letter-spacing:0.06em; padding:8px 24px;">
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
      return JSON.parse(localStorage.getItem('erc_rugby_midi_binds_v3') || 'null');
    } catch (e) {
      return null;
    }
  })();

  const defaultBinds = {
    moveLeft:  { midi: 'f#1', key: 'A', label: '🎹 F#1 / A' },
    moveRight: { midi: 'g#1', key: 'D', label: '🎹 G#1 / D' },
    surge:     { midi: 'a1',  key: 'W', label: '🎹 A1 / W' },
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
      spinning: false,
      timer: 0,
      duration: 1.25,
      tickAccum: 0,
      index: 1,
      targetId: TEAMS[1].id
    },

    actionBinds: Object.assign({}, defaultBinds, savedBinds || {}),
    listeningAction: null,

    moveInput: {
      leftHeld: false,
      rightHeld: false,
      leftTapTimer: 0,
      rightTapTimer: 0
    },

    homePlayers: [],
    awayPlayers: [],
    carrierIndex: 2,
    selectedDefenderIdx: 2,
    surgeTimer: 0,
    aiPlayTimer: 0,
    aiPassCooldown: 0.65,
    aiLastPassFrom: -1,

    passState: {
      active: false,
      fromIdx: 2,
      toIdx: 2,
      startX: 0.5,
      startY: 0.82,
      x: 0.5,
      y: 0.82,
      progress: 0,
      duration: 0.22,
      isForwardPass: false
    },

    kickBall: {
      active: false,
      kind: null,
      x: 0.5,
      y: 0.82,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      bounceCount: 0
    },

    callouts: [],

    tacklePause: {
      timer: 0,
      retreatDuration: 1.15,
      markY: 0.82,
      onsideY: 0.68
    },

    turnoverTimer: 0,
    nextPossession: 'home',
    nextStartY: 0.82,

    screenShake: {
      timer: 0,
      duration: 0.32,
      intensity: 13
    }
  };

  function saveActionBinds() {
    try {
      localStorage.setItem('erc_rugby_midi_binds_v3', JSON.stringify(state.actionBinds));
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
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.09);
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
      osc2.frequency.setValueAtTime(2815, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(c.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.38);
      osc2.stop(now + 0.38);
    } catch (e) {}
  }

  function playKickSound(kind) {
    try {
      const c = getAudioCtx();
      if (!c) return;
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'bomb' ? 190 : 145, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'bomb' ? 75 : 52, now + 0.2);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  function playTackleHitSound() {
    try {
      const c = getAudioCtx();
      if (!c) return;
      const now = c.currentTime;

      const subOsc = c.createOscillator();
      const subGain = c.createGain();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(165, now);
      subOsc.frequency.exponentialRampToValueAtTime(36, now + 0.25);
      subGain.gain.setValueAtTime(0.48, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
      subOsc.connect(subGain);
      subGain.connect(c.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.28);

      const bufferSize = Math.floor(c.sampleRate * 0.16);
      const noiseBuffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }
      const noise = c.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(920, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.16);
      const noiseGain = c.createGain();
      noiseGain.gain.setValueAtTime(0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(c.destination);
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
      `${team.name} vs ${state.awayTeam.name} • Jerseys: C D E F G`;
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
    containerEl.querySelector('#erc-leg-surge').textContent = state.actionBinds.surge.label;
    containerEl.querySelector('#erc-leg-bomb').textContent = state.actionBinds.bomb.label;
    containerEl.querySelector('#erc-leg-grubber').textContent = state.actionBinds.grubber.label;
  }

  function rollSupportAlignment(playerObj, idx, carrierIdx, allowOverrun = true) {
    if (idx === carrierIdx) {
      playerObj.overrun = false;
      playerObj.depthJitter = 0;
      playerObj.lateralJitter = 0;
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
    if (idx === state.carrierIndex) {
      return { x: playerObj.x, y: playerObj.y };
    }
    const laneSteps = Math.abs(idx - state.carrierIndex);
    const echelonDepth = laneSteps * 0.046 + playerObj.depthJitter;
    const desiredX = Math.min(0.91, Math.max(0.09, LANES[idx] + playerObj.lateralJitter));

    let desiredY;
    if (playerObj.overrun) {
      desiredY = carrier.y + attackDir * playerObj.overrunLead;
    } else {
      desiredY = carrier.y - attackDir * Math.max(0.025, echelonDepth);
    }
    desiredY = Math.min(0.93, Math.max(0.13, desiredY));
    return { x: desiredX, y: desiredY };
  }

  function makePlayerEntity(i, x, y) {
    return {
      laneIndex: i,
      baseX: LANES[i],
      x,
      y,
      prevX: x,
      prevY: y,
      vx: 0,
      vy: 0,
      animSpeedX: 0,
      animSpeedY: 0,
      strideTimer: i * 0.18,
      overrun: false,
      overrunLead: 0,
      depthJitter: 0,
      lateralJitter: 0,
      nextRollTimer: 1.6 + Math.random() * 1.5,
      role: 'line'
    };
  }

  function setupSetOfSix(possession, startY, carrierIdx = 2) {
    state.possession = possession;
    state.carrierIndex = carrierIdx;
    state.selectedDefenderIdx = carrierIdx;
    state.tackleCount = 0;
    state.surgeTimer = 0;
    state.passState.active = false;
    state.kickBall.active = false;
    state.kickBall.z = 0;
    state.playState = 'waitingForPlay';
    state.aiPlayTimer = 0.70;
    state.aiPassCooldown = 0.45;
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

        const ap = makePlayerEntity(i, LANES[i], onsideY);
        state.awayPlayers.push(ap);
      } else {
        const ap = makePlayerEntity(i, LANES[i], startY);
        rollSupportAlignment(ap, i, carrierIdx, false);
        state.awayPlayers.push(ap);

        const hp = makePlayerEntity(i, LANES[i], onsideY);
        state.homePlayers.push(hp);
      }
    }

    const attackers = possession === 'home' ? state.homePlayers : state.awayPlayers;
    const carrier = attackers[carrierIdx];
    for (let i = 0; i < 5; i++) {
      if (i !== carrierIdx) {
        const pos = getDesiredSupportPos(attackers[i], i, carrier, attackDir);
        attackers[i].x = pos.x;
        attackers[i].y = pos.y;
        attackers[i].prevX = pos.x;
        attackers[i].prevY = pos.y;
      }
    }

    syncHudAndLegend();
  }

  function assignAiDefenderChasers() {
    const defenders = state.possession === 'home' ? state.awayPlayers : state.homePlayers;
    const chaserA = Math.floor(Math.random() * 5);
    const chaserB = (chaserA + 2) % 5;
    defenders.forEach((d, idx) => {
      d.role = idx === chaserA || idx === chaserB ? 'chaser' : 'line';
    });
  }

  // Smart AI Passing Engine: evaluates open lanes & defender pressure so the Away team passes realistically!
  function tryTriggerAiPass(forceDummyHalfPass = false) {
    if (state.possession !== 'away' || state.passState.active || state.kickBall.active) return false;

    const fromIdx = state.carrierIndex;
    const passer = state.awayPlayers[fromIdx];

    // Candidate receivers: adjacent backline runners (1 lane away) or a cut-out pass (2 lanes away)
    const candidates = [0, 1, 2, 3, 4].filter((idx) => {
      if (idx === fromIdx) return false;
      const laneDist = Math.abs(idx - fromIdx);
      if (laneDist > 2) return false;
      // Avoid immediately throwing back to the exact player who just passed unless forced
      if (!forceDummyHalfPass && idx === state.aiLastPassFrom && Math.random() < 0.75) return false;

      // Ensure AI passes backwards/flat (Away attacks +Y downward, so onside receiver has y <= passer.y + 0.004)
      const rec = state.awayPlayers[idx];
      return rec.y <= passer.y + 0.004;
    });

    if (candidates.length === 0) return false;

    // Score each candidate receiver by how much open space they have away from Home defenders!
    let bestIdx = candidates[0];
    let bestScore = -Infinity;

    for (const idx of candidates) {
      const rec = state.awayPlayers[idx];
      let minDefDist = Infinity;
      for (const def of state.homePlayers) {
        const d = Math.hypot(def.x - rec.x, (def.y - rec.y) * 1.15);
        if (d < minDefDist) minDefDist = d;
      }
      const laneDistPenalty = Math.abs(idx - fromIdx) === 2 ? 0.025 : 0;
      const score = minDefDist - laneDistPenalty + (Math.random() - 0.5) * 0.04;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    const receiver = state.awayPlayers[bestIdx];
    const laneDist = Math.abs(bestIdx - fromIdx);

    playPassSound();
    state.aiLastPassFrom = fromIdx;
    state.passState.active = true;
    state.passState.fromIdx = fromIdx;
    state.passState.toIdx = bestIdx;
    state.passState.startX = passer.x;
    state.passState.startY = passer.y;
    state.passState.x = passer.x;
    state.passState.y = passer.y;
    state.passState.progress = 0;
    state.passState.duration = 0.15 + laneDist * 0.055;
    state.passState.isForwardPass = false;

    addCallout(
      `${LANE_NOTES[fromIdx]} → ${LANE_NOTES[bestIdx]}`,
      (passer.x + receiver.x) * 0.5,
      Math.max(0.16, Math.min(passer.y, receiver.y) - 0.025),
      '#fda4af'
    );
    return true;
  }

  function triggerHandover(reasonText, nextPossession, nextStartY, color = '#fb7185') {
    playRefWhistle();
    state.passState.active = false;
    state.kickBall.active = false;
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
    state.surgeTimer = 0;
    carrier.vy = 0;
    carrier.vx = 0;

    state.screenShake.timer = state.screenShake.duration;
    state.screenShake.intensity = 14;
    playTackleHitSound();

    const attackDir = state.possession === 'home' ? -1 : 1;

    if (state.tackleCount >= state.maxTackles) {
      const nextPos = state.possession === 'home' ? 'away' : 'home';
      const clampedY = Math.min(0.78, Math.max(0.22, carrier.y));
      triggerHandover(
        nextPos === 'away' ? '6TH TACKLE HANDOVER! DEFEND NOW!' : 'TURNOVER WON! YOUR BALL!',
        nextPos,
        clampedY,
        nextPos === 'away' ? '#fb7185' : '#4ade80'
      );
      return;
    }

    state.playState = 'retreating';
    state.tacklePause.timer = 0;
    state.tacklePause.markY = carrier.y;
    state.tacklePause.onsideY = Math.min(0.87, Math.max(0.13, carrier.y + attackDir * 0.14));

    attackers.forEach((att, idx) => {
      rollSupportAlignment(att, idx, state.carrierIndex, state.possession === 'home');
    });

    syncHudAndLegend();
    addCallout(
      `TACKLE ${state.tackleCount}! ALL 5 DEFENDERS BACK 10m`,
      carrier.x,
      Math.min(0.85, Math.max(0.16, carrier.y - 0.04)),
      '#fde047'
    );
  }

  function releasePlayTheBall() {
    if (state.playState === 'retreating' || state.playState === 'turnoverPause') return false;
    if (state.playState === 'waitingForPlay') {
      state.playState = 'running';
      assignAiDefenderChasers();
    }
    return true;
  }

  function handleNoteCDEFG(targetIdx) {
    if (state.phase !== 'playing') return;

    if (state.possession === 'away') {
      state.selectedDefenderIdx = targetIdx;
      const def = state.homePlayers[targetIdx];
      if (def) {
        addCallout(`DEFENDER ${LANE_NOTES[targetIdx]}`, def.x, def.y + 0.05, '#fde047');
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
      passer.vy = -0.16;
      addCallout(`${LANE_NOTES[targetIdx]} RUNS!`, passer.x, passer.y - 0.04, '#bae6fd');
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
    state.passState.startX = passer.x;
    state.passState.startY = passer.y;
    state.passState.x = passer.x;
    state.passState.y = passer.y;
    state.passState.progress = 0;
    state.passState.duration = 0.14 + laneDist * 0.05;
    state.passState.isForwardPass = thrownForward;
  }

  function triggerSurgeOrTackleBurst() {
    if (state.phase !== 'playing') return;
    if (state.possession === 'home') {
      if (!releasePlayTheBall()) return;
      state.surgeTimer = 0.6;
      const c = state.homePlayers[state.carrierIndex];
      c.vy = -0.23;
      addCallout('RUN SURGE!', c.x, c.y - 0.04, '#6ee7b7');
    } else {
      if (state.playState !== 'running') {
        const d = state.homePlayers[state.selectedDefenderIdx];
        addCallout('STAY ONSIDE UNTIL PLAYED!', d.x, d.y + 0.05, '#fcd34d');
        return;
      }
      state.surgeTimer = 0.45;
      const d = state.homePlayers[state.selectedDefenderIdx];
      addCallout(`${LANE_NOTES[state.selectedDefenderIdx]} RUSHES UP!`, d.x, d.y - 0.03, '#6ee7b7');
    }
  }

  function launchKick(kind) {
    if (state.phase !== 'playing' || state.possession !== 'home') return;
    if (state.kickBall.active || state.passState.active) return;
    if (!releasePlayTheBall()) return;

    const kicker = state.homePlayers[state.carrierIndex];
    playKickSound(kind);

    state.kickBall.active = true;
    state.kickBall.kind = kind;
    state.kickBall.x = kicker.x;
    state.kickBall.y = kicker.y - 0.03;
    state.kickBall.bounceCount = 0;

    state.homePlayers.forEach((att, idx) => {
      att.offsideOnKick = idx !== state.carrierIndex && att.y < kicker.y;
    });

    if (kind === 'bomb') {
      state.kickBall.vy = -0.33;
      state.kickBall.vx = (Math.random() - 0.5) * 0.11;
      state.kickBall.z = 0.05;
      state.kickBall.vz = 0.48;
      addCallout('BOMB KICK!', kicker.x, kicker.y - 0.05, '#fcd34d');
    } else {
      state.kickBall.vy = -0.42;
      state.kickBall.vx = (Math.random() - 0.5) * 0.07;
      state.kickBall.z = 0.01;
      state.kickBall.vz = 0.08;
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

    if (state.actionBinds.moveLeft.midi === clean) {
      if (state.possession === 'home') releasePlayTheBall();
      state.moveInput.leftHeld = true;
      state.moveInput.leftTapTimer = 0.22;
      state.moveInput.rightTapTimer = 0;
      return;
    }
    if (state.actionBinds.moveRight.midi === clean) {
      if (state.possession === 'home') releasePlayTheBall();
      state.moveInput.rightHeld = true;
      state.moveInput.rightTapTimer = 0.22;
      state.moveInput.leftTapTimer = 0;
      return;
    }
    if (state.actionBinds.surge.midi === clean) {
      triggerSurgeOrTackleBurst();
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
    if (state.actionBinds.moveLeft.midi === clean) {
      state.moveInput.leftHeld = false;
    }
    if (state.actionBinds.moveRight.midi === clean) {
      state.moveInput.rightHeld = false;
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
    setupSetOfSix('home', 0.82, 2);

    startModalEl.style.display = 'none';
    hudEl.style.display = 'flex';
    legendEl.style.display = 'block';
    pianoStripEl.style.display = 'flex';
    syncHudAndLegend();
    addCallout('KICK OFF! PASS WITH C–G OR STEER LEFT/RIGHT!', 0.5, 0.74, '#fef08a');
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

  function recordPlayerVelocities(dt) {
    const all = [...state.homePlayers, ...state.awayPlayers];
    for (const p of all) {
      const dx = (p.x - p.prevX) / Math.max(0.001, dt);
      const dy = (p.y - p.prevY) / Math.max(0.001, dt);
      p.animSpeedX += (dx - p.animSpeedX) * Math.min(1, dt * 14);
      p.animSpeedY += (dy - p.animSpeedY) * Math.min(1, dt * 14);
      p.prevX = p.x;
      p.prevY = p.y;

      const totalSpeed = Math.hypot(p.animSpeedX, p.animSpeedY);
      if (totalSpeed > 0.018 && state.playState !== 'waitingForPlay' && state.playState !== 'turnoverPause') {
        p.strideTimer += dt * (4.2 + totalSpeed * 22);
      }
    }
  }

  function updateSimulation(dt) {
    if (state.phase !== 'playing') return;

    if (state.screenShake.timer > 0) {
      state.screenShake.timer = Math.max(0, state.screenShake.timer - dt);
    }
    if (state.moveInput.leftTapTimer > 0) {
      state.moveInput.leftTapTimer = Math.max(0, state.moveInput.leftTapTimer - dt);
    }
    if (state.moveInput.rightTapTimer > 0) {
      state.moveInput.rightTapTimer = Math.max(0, state.moveInput.rightTapTimer - dt);
    }
    if (state.surgeTimer > 0) {
      state.surgeTimer = Math.max(0, state.surgeTimer - dt);
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
      state.callouts[i].y -= dt * 0.04;
      if (state.callouts[i].life <= 0) state.callouts.splice(i, 1);
    }

    if (state.playState === 'turnoverPause') {
      state.turnoverTimer -= dt;
      recordPlayerVelocities(dt);
      if (state.turnoverTimer <= 0) {
        setupSetOfSix(state.nextPossession, state.nextStartY, 2);
      }
      return;
    }

    const attackers = state.possession === 'home' ? state.homePlayers : state.awayPlayers;
    const defenders = state.possession === 'home' ? state.awayPlayers : state.homePlayers;
    const attackDir = state.possession === 'home' ? -1 : 1;
    const carrier = attackers[state.carrierIndex];

    let userSteerX = 0;
    if (state.moveInput.leftHeld || state.moveInput.leftTapTimer > 0) userSteerX -= 1;
    if (state.moveInput.rightHeld || state.moveInput.rightTapTimer > 0) userSteerX += 1;

    // =========================================================================
    // PHASE A: POST-TACKLE RETREAT — ALL 5 DEFENDERS RETREAT 10m & FORM A LINE!
    // =========================================================================
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
        const d = defenders[i];
        const laneX = LANES[i];
        d.x += (laneX - d.x) * Math.min(1, dt * 6.5);
        d.y += (targetOnsideY - d.y) * Math.min(1, dt * 7.0);

        if (Math.abs(d.y - targetOnsideY) > 0.010 || Math.abs(d.x - laneX) > 0.014) {
          allOnside = false;
        }
      }

      recordPlayerVelocities(dt);

      if (state.tacklePause.timer >= state.tacklePause.retreatDuration && allOnside) {
        for (let i = 0; i < 5; i++) {
          defenders[i].x = LANES[i];
          defenders[i].y = targetOnsideY;
        }
        state.playState = 'waitingForPlay';
        state.aiPlayTimer = 0.65;
        state.aiPassCooldown = 0.35;
        state.aiLastPassFrom = -1;
        addCallout(
          state.possession === 'home' ? 'ONSIDE! PASS (C–G) OR RUN' : 'DEFENSE SET! SWITCH WITH C–G',
          carrier.x,
          Math.min(0.85, Math.max(0.16, carrier.y - 0.04)),
          '#fde047'
        );
      }
      return;
    }

    // =========================================================================
    // PHASE B: SET & WAITING AT PLAY-THE-BALL
    // =========================================================================
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
        selDef.x = Math.min(0.92, Math.max(0.08, selDef.x + userSteerX * 0.22 * dt));
      }

      if (state.possession === 'away') {
        state.aiPlayTimer -= dt;
        if (state.aiPlayTimer <= 0) {
          releasePlayTheBall();
          // 78% of the time, the opponent immediately passes out of dummy-half to a first receiver!
          if (Math.random() < 0.78) {
            tryTriggerAiPass(true);
            state.aiPassCooldown = 0.65 + Math.random() * 0.45;
          } else {
            state.aiPassCooldown = 0.45 + Math.random() * 0.40;
          }
        }
      }

      recordPlayerVelocities(dt);
      return;
    }

    // =========================================================================
    // PHASE C: LIVE RUGBY LEAGUE PLAY (Offense OR Defense)
    // =========================================================================
    if (state.passState.active) {
      state.passState.progress += dt / state.passState.duration;
      const receiver = attackers[state.passState.toIdx];
      const t = Math.min(1, state.passState.progress);

      state.passState.x = state.passState.startX + (receiver.x - state.passState.startX) * t;
      state.passState.y = state.passState.startY + (receiver.y - state.passState.startY) * t;

      if (t >= 1) {
        state.passState.active = false;
        const landedForward =
          state.possession === 'home' &&
          (state.passState.isForwardPass || receiver.y < state.passState.startY - 0.008);

        if (landedForward) {
          playErrorClackSound();
          triggerHandover('FORWARD PASS! HANDOVER TO OPPONENT', 'away', Math.max(0.24, receiver.y), '#fb7185');
          recordPlayerVelocities(dt);
          return;
        }

        state.carrierIndex = state.passState.toIdx;
        if (state.possession === 'home' && bridgeRef && bridgeRef.getState().gameStats) {
          bridgeRef.getState().gameStats.perfect += 1;
        }
        attackers.forEach((att, idx) => {
          rollSupportAlignment(att, idx, state.carrierIndex, state.possession === 'home');
        });
      }
    }

    const activeCarrier = attackers[state.carrierIndex];

    // 2. Move Attacking Ball-Carrier + Active AI Backline Passing
    if (state.possession === 'home') {
      const baseUpSpeed = state.passState.active ? -0.07 : state.surgeTimer > 0 ? -0.21 : -0.115;
      activeCarrier.vy += (baseUpSpeed - activeCarrier.vy) * Math.min(1, dt * 8);
      activeCarrier.y += activeCarrier.vy * dt;

      if (userSteerX !== 0) {
        activeCarrier.x = Math.min(0.91, Math.max(0.09, activeCarrier.x + userSteerX * 0.24 * dt));
      }
    } else {
      // Opponent ('away') attacks down-field (+Y) and actively passes across its backline!
      state.aiPassCooldown -= dt;

      if (!state.passState.active) {
        // Measure closest Home defender to see if the AI ball-carrier is about to get tackled
        let nearestDefDist = Infinity;
        for (const def of state.homePlayers) {
          const d = Math.hypot(def.x - activeCarrier.x, def.y - activeCarrier.y);
          if (d < nearestDefDist) nearestDefDist = d;
        }

        const underTacklePressure = nearestDefDist < 0.115 && state.aiPassCooldown <= 0.22;
        const scheduledShiftReady = state.aiPassCooldown <= 0;

        if ((underTacklePressure && Math.random() < 0.85) || (scheduledShiftReady && Math.random() < 0.82)) {
          const passed = tryTriggerAiPass(false);
          state.aiPassCooldown = passed ? (0.60 + Math.random() * 0.45) : 0.35;
        } else if (scheduledShiftReady) {
          state.aiPassCooldown = 0.45 + Math.random() * 0.35;
        }
      }

      const aiDownSpeed = state.passState.active ? 0.055 : 0.112;
      activeCarrier.y += aiDownSpeed * dt;

      const selDef = state.homePlayers[state.selectedDefenderIdx];
      const weave = Math.abs(selDef.x - activeCarrier.x) < 0.13 ? Math.sign(activeCarrier.x - selDef.x || 1) * 0.065 : 0;
      activeCarrier.x = Math.min(0.90, Math.max(0.10, activeCarrier.x + weave * dt));
    }

    // Support backline adjusts organically into staggered depth behind the ball-carrier
    for (let i = 0; i < 5; i++) {
      if (i === state.carrierIndex) continue;
      const att = attackers[i];

      att.nextRollTimer -= dt;
      if (att.nextRollTimer <= 0 && !state.passState.active && !state.kickBall.active) {
        rollSupportAlignment(att, i, state.carrierIndex, state.possession === 'home');
      }

      if (state.possession === 'home' && state.kickBall.active) {
        if (!att.offsideOnKick) {
          att.y -= 0.18 * dt;
        } else if (activeCarrier.y <= att.y) {
          att.offsideOnKick = false;
        }
      } else {
        const desired = getDesiredSupportPos(att, i, activeCarrier, attackDir);
        att.x += (desired.x - att.x) * Math.min(1, dt * 3.8);
        att.y += (desired.y - att.y) * Math.min(1, dt * 4.4);
      }
    }

    // 3. Check Try Scored
    if (!state.passState.active && !state.kickBall.active) {
      if (state.possession === 'home' && activeCarrier.y <= 0.12) {
        state.homeScore += 4;
        if (bridgeRef && bridgeRef.getState().gameStats) {
          bridgeRef.getState().gameStats.perfect += 4;
        }
        addCallout(`TRY BY ${LANE_NOTES[state.carrierIndex]}! +4`, activeCarrier.x, 0.16, '#4ade80');
        setupSetOfSix('home', 0.82, 2);
        recordPlayerVelocities(dt);
        return;
      }
      if (state.possession === 'away' && activeCarrier.y >= 0.88) {
        state.awayScore += 4;
        playErrorClackSound();
        addCallout(`${state.awayTeam.name} SCORE! +4`, activeCarrier.x, 0.82, '#fb7185');
        setupSetOfSix('home', 0.82, 2);
        recordPlayerVelocities(dt);
        return;
      }
    }

    // 4. Kick Flight & Regather (Home offense)
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

      if (state.kickBall.z < 0.08 && (state.kickBall.bounceCount >= 1 || state.kickBall.kind === 'grubber')) {
        for (let i = 0; i < 5; i++) {
          const att = state.homePlayers[i];
          if (att.offsideOnKick) continue;
          if (Math.hypot(att.x - state.kickBall.x, att.y - state.kickBall.y) < 0.055) {
            state.carrierIndex = i;
            state.kickBall.active = false;
            state.tackleCount = 0;
            addCallout(`${LANE_NOTES[i]} REGATHERS! SIX AGAIN!`, att.x, att.y - 0.05, '#fde047');
            break;
          }
        }
      }

      if (state.kickBall.active && (state.kickBall.bounceCount >= 2 || (state.kickBall.kind === 'grubber' && Math.abs(state.kickBall.vy) < 0.13))) {
        let bestIdx = state.carrierIndex;
        let bestDist = Infinity;
        for (let i = 0; i < 5; i++) {
          if (state.homePlayers[i].offsideOnKick) continue;
          const d = Math.abs(state.homePlayers[i].x - state.kickBall.x);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        const catcher = state.homePlayers[bestIdx];
        catcher.x = Math.min(0.88, Math.max(0.12, state.kickBall.x));
        catcher.y = Math.min(0.88, Math.max(0.12, state.kickBall.y));
        state.carrierIndex = bestIdx;
        state.kickBall.active = false;
        addCallout(`${LANE_NOTES[bestIdx]} TAKES THE KICK!`, catcher.x, catcher.y - 0.05, '#7dd3fc');
      }

      if (state.kickBall.active && state.kickBall.y <= 0.11) {
        state.homeScore += 4;
        addCallout('KICK CHASE TRY! +4', state.kickBall.x, 0.16, '#4ade80');
        state.kickBall.active = false;
        setupSetOfSix('home', 0.82, 2);
        recordPlayerVelocities(dt);
        return;
      }
    }

    // 5. Defensive Line Movement & Tackles
    state.tacklePause.onsideY += -attackDir * 0.055 * dt;

    for (let i = 0; i < 5; i++) {
      const d = defenders[i];

      if (state.possession === 'away' && i === state.selectedDefenderIdx) {
        const upRush = state.surgeTimer > 0 ? -0.22 : -0.095;
        d.y = Math.max(0.12, d.y + upRush * dt);
        if (userSteerX !== 0) {
          d.x = Math.min(0.92, Math.max(0.08, d.x + userSteerX * 0.26 * dt));
        }
      } else if (d.role === 'chaser') {
        const toX = activeCarrier.x - d.x;
        const toY = activeCarrier.y - d.y;
        const dist = Math.max(0.001, Math.hypot(toX, toY));
        d.x += (toX / dist) * 0.118 * dt;
        d.y += (toY / dist) * 0.122 * dt;
      } else {
        const slideShift = (activeCarrier.x - 0.5) * 0.16;
        const targetX = Math.min(0.91, Math.max(0.09, LANES[i] + slideShift));
        d.x += (targetX - d.x) * Math.min(1, dt * 4.0);
        d.y += (state.tacklePause.onsideY - d.y) * Math.min(1, dt * 3.6);
      }

      if (!state.passState.active && !state.kickBall.active) {
        if (Math.hypot(d.x - activeCarrier.x, d.y - activeCarrier.y) < 0.042) {
          beginTackleAndRetreat();
          recordPlayerVelocities(dt);
          return;
        }
      }
    }

    recordPlayerVelocities(dt);
  }

  function selectSpritePose(playerObj) {
    if (state.playState === 'waitingForPlay' || state.playState === 'turnoverPause') {
      if (Math.abs(playerObj.animSpeedX) > 0.04) {
        return playerObj.animSpeedX < 0 ? 'runLeft' : 'runRight';
      }
      return 'idle';
    }

    const sx = playerObj.animSpeedX;
    const sy = playerObj.animSpeedY;
    const speed = Math.hypot(sx, sy);

    if (speed < 0.022) {
      return 'idle';
    }
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

  function drawPixelPlayer(ctx, x, y, team, noteLetter, playerObj, opts = {}) {
    const { pixelScale = 1.5, hasBall = false, showYellowRing = false, isOverrun = false } = opts;
    const pose = selectSpritePose(playerObj);
    const sprite = getPixelSprite(team, noteLetter, pose, hasBall);

    const drawW = Math.round(sprite.width * pixelScale);
    const drawH = Math.round(sprite.height * pixelScale);
    const footY = y + drawH * 0.42;

    if (showYellowRing) {
      drawYellowSelectionCircle(ctx, x, footY, pixelScale * 0.8);
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.beginPath();
      ctx.ellipse(x, footY, 11 * pixelScale * 0.75, 4.5 * pixelScale * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isOverrun && !hasBall) {
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

    const stripes = 10;
    const stripeH = fieldH / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#166534';
      ctx.fillRect(padX, padY + i * stripeH, fieldW, stripeH + 1);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(padX, padY, fieldW, fieldH);

    const lineFracY = [0.12, 0.3, 0.5, 0.7, 0.88];
    ctx.lineWidth = 1.5;
    for (const fy of lineFracY) {
      const ly = padY + fieldH * fy;
      ctx.strokeStyle = fy === 0.12 || fy === 0.88 ? 'rgba(255,255,255,0.78)' : 'rgba(255, 255, 255, 0.30)';
      ctx.beginPath();
      ctx.moveTo(padX, ly);
      ctx.lineTo(padX + fieldW, ly);
      ctx.stroke();
    }

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

    if (state.possession === 'home' && state.homePlayers[state.carrierIndex] && !state.kickBall.active) {
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
        isOverrun: item.isOverrun
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

    ctx.restore();
  }

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
        `🎹 Listening for ${action.toUpperCase()}... play ANY MIDI piano key (e.g. F#1, G#1, A1, B1, C2) or press a computer key (Esc to cancel).`;
      refreshKeybindButtons();
      btn.blur();
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
        e.preventDefault();
        e.stopPropagation();
        state.listeningAction = null;
        containerEl.querySelector('#erc-keybind-notice').textContent = 'Binding cancelled.';
        refreshKeybindButtons();
        return;
      }
      if (PIANOPAD_QWERTY.has(keyLower)) {
        return;
      }
      const keyLabel = e.key === 'ArrowLeft' ? '←' : e.key === 'ArrowRight' ? '→' : keyUpper;
      if ((keyUpper.length === 1 && /\S/.test(keyUpper)) || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        const action = state.listeningAction;
        const existingMidi = state.actionBinds[action].midi;
        state.actionBinds[action] = {
          midi: existingMidi,
          key: keyLabel,
          label: existingMidi ? `🎹 ${existingMidi.toUpperCase()} / ${keyLabel}` : `KEY: ${keyLabel}`
        };
        state.listeningAction = null;
        saveActionBinds();
        containerEl.querySelector('#erc-keybind-notice').textContent =
          `✅ ${action.toUpperCase()} bound to "${keyLabel}".`;
        refreshKeybindButtons();
      }
      return;
    }

    if (state.phase !== 'playing') return;

    if (e.key === 'ArrowLeft' || keyUpper === (state.actionBinds.moveLeft.key || '').toUpperCase()) {
      if (state.possession === 'home') releasePlayTheBall();
      state.moveInput.leftHeld = true;
      return;
    }
    if (e.key === 'ArrowRight' || keyUpper === (state.actionBinds.moveRight.key || '').toUpperCase()) {
      if (state.possession === 'home') releasePlayTheBall();
      state.moveInput.rightHeld = true;
      return;
    }

    if (e.repeat) return;

    if (keyUpper && keyUpper === (state.actionBinds.surge.key || '').toUpperCase()) {
      e.preventDefault();
      triggerSurgeOrTackleBurst();
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
