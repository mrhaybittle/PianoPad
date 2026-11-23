// js/games/pedalPoint.js
import { initAudio, audioCtx, playTone, playErrorClackSound } from '../audio.js';
import { getNoteFrequency } from '../musicTheory.js';

let animFrameId = null;
let containerEl = null;
let renderer = null;
let bridgeRef = null;
let activeController = null;

// Dynamic Three.js Loader (matches skiSlalom.js CDN fallback chain)
function ensureThreeLoaded() {
  if (window.THREE) return Promise.resolve(window.THREE);
  const cdnUrls = [
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
    'https://unpkg.com/three@0.128.0/build/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
  ];
  return new Promise((resolve, reject) => {
    let idx = 0;
    const tryNext = () => {
      if (window.THREE) return resolve(window.THREE);
      if (idx >= cdnUrls.length) return reject(new Error('Three.js failed to load'));
      const script = document.createElement('script');
      script.src = cdnUrls[idx++];
      script.async = true;
      script.onload = () => (window.THREE ? resolve(window.THREE) : tryNext());
      script.onerror = () => {
        script.remove();
        tryNext();
      };
      document.head.appendChild(script);
    };
    tryNext();
  });
}

// ============================================================================
// CONSTANTS, BIKE PRESETS & ILLAWARRA ESCARPMENT ZONES
// ============================================================================
const TRAIL_LENGTH = 2400;
const BPM = 122;
const BEAT_DURATION = 60 / BPM;

const BIKE_PRESETS = {
  enduro: {
    name: 'Kembla Trail 140',
    pedalForce: 21,
    maxPedalSpeed: 26,
    maxDownhillSpeed: 43,
    turnSpeed: 2.58,
    hopImpulse: 13.2,
    gravityMult: 1.0,
    suspensionStiffness: 18,
    forkTravel: 0.38,
    landingForgiveness: 1.0
  },
  downhill: {
    name: 'Escarpment DH 200',
    pedalForce: 16,
    maxPedalSpeed: 24,
    maxDownhillSpeed: 52,
    turnSpeed: 1.98,
    hopImpulse: 11.4,
    gravityMult: 1.14,
    suspensionStiffness: 11,
    forkTravel: 0.54,
    landingForgiveness: 1.38
  },
  ebike: {
    name: 'Illawarra Volt E-MTB',
    pedalForce: 36,
    maxPedalSpeed: 34,
    maxDownhillSpeed: 46,
    turnSpeed: 2.34,
    hopImpulse: 11.8,
    gravityMult: 1.04,
    suspensionStiffness: 16,
    forkTravel: 0.42,
    landingForgiveness: 1.12
  }
};

const NOTE_PALETTE = {
  c: { label: 'C', freq: 261.63, color: 0xef4444, hex: '#ef4444' }, // Red
  d: { label: 'D', freq: 293.66, color: 0xf97316, hex: '#f97316' }, // Orange
  e: { label: 'E', freq: 329.63, color: 0xeab308, hex: '#eab308' }, // Yellow
  f: { label: 'F', freq: 349.23, color: 0x22c55e, hex: '#22c55e' }, // Green
  g: { label: 'G', freq: 392.00, color: 0x3b82f6, hex: '#3b82f6' }, // Blue
  a: { label: 'A', freq: 440.00, color: 0xa855f7, hex: '#a855f7' }, // Purple
  b: { label: 'B', freq: 493.88, color: 0xec4899, hex: '#ec4899' }  // Pink
};

const SCALE_NOTES = [
  { name: 'C4', pitchClass: 'c', freq: 261.63, color: 0xef4444, hex: '#ef4444' },
  { name: 'D4', pitchClass: 'd', freq: 293.66, color: 0xf97316, hex: '#f97316' },
  { name: 'E4', pitchClass: 'e', freq: 329.63, color: 0xeab308, hex: '#eab308' },
  { name: 'F4', pitchClass: 'f', freq: 349.23, color: 0x22c55e, hex: '#22c55e' },
  { name: 'G4', pitchClass: 'g', freq: 392.00, color: 0x3b82f6, hex: '#3b82f6' },
  { name: 'A4', pitchClass: 'a', freq: 440.00, color: 0xa855f7, hex: '#a855f7' },
  { name: 'B4', pitchClass: 'b', freq: 493.88, color: 0xec4899, hex: '#ec4899' }
];

const MELODY_LANES = [
  { label: 'C', pitchClass: 'c', freq: 261.63, color: 0xef4444, hex: '#ef4444', offset: -2.3 },
  { label: 'E', pitchClass: 'e', freq: 329.63, color: 0xeab308, hex: '#eab308', offset: 0.0 },
  { label: 'G', pitchClass: 'g', freq: 392.00, color: 0x3b82f6, hex: '#3b82f6', offset: 2.3 }
];

const TRAIL_ZONES = [
  { z: -15,   name: 'MT KEMBLA LOOKOUT RIDGE',   sub: 'Open Pacific Ocean & Port Kembla Horizon' },
  { z: -500,  name: 'DEEP RAINFOREST GULLY',     sub: 'Enclosed Mountain Valley • Trees Both Sides' },
  { z: -1150, name: 'LAKE ILLAWARRA VISTA',      sub: 'Coastal Escarpment Shelf & Cargo Ship Views' },
  { z: -1600, name: 'SUBLIME POINT CANOPY',      sub: 'Subtropical Rainforest Tunnel & Final Bridges' }
];

const LOOKOUT_WINDOWS = [
  { zMax: 45,    zMin: -460 },
  { zMax: -1160, zMin: -1560 }
];

// ============================================================================
// EXPORTED PIANOPAD LIFECYCLE & INPUT HOOKS
// ============================================================================
function stopPedalPoint() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (activeController && activeController.cleanup) {
    activeController.cleanup();
  }
  activeController = null;

  if (renderer) {
    try { renderer.dispose(); } catch (e) {}
    renderer = null;
  }
  if (containerEl) {
    containerEl.remove();
    containerEl = null;
  }
}

function handlePedalPointInput(noteStr, bridge) {
  if (activeController && activeController.onPianoNoteDown) {
    activeController.onPianoNoteDown(noteStr, bridge);
  }
}

function handlePedalPointRelease(noteStr) {
  if (activeController && activeController.onPianoNoteUp) {
    activeController.onPianoNoteUp(noteStr);
  }
}

async function startPedalPoint(bridge, autoStart = false) {
  initAudio();
  stopPedalPoint();
  bridgeRef = bridge;

  bridge.exitActiveMiniGame();
  document.getElementById('game-results-modal')?.classList.remove('open');
  document.getElementById('arcade-hub')?.classList.remove('open');

  bridge.setActiveMiniGame('pedalPoint');
  bridge.resetGameStats();

  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = '🚵‍♂️ Loading Pedal Point 3D Escarpment...';

  let THREE;
  try {
    THREE = await ensureThreeLoaded();
  } catch (e) {
    alert('Three.js failed to load. Please check your internet connection and reload.');
    bridge.exitActiveMiniGame();
    return;
  }

  const wrapperParent = document.getElementById('visualizer-wrapper');
  const waterfall = document.getElementById('waterfall-canvas');
  const initW = (waterfall && waterfall.width) || 1232;
  const initH = (waterfall && waterfall.height) || 380;

  containerEl = document.createElement('div');
  containerEl.id = 'pedal-point-3d-container';
  containerEl.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: ${initH}px;
    z-index: 25;
    overflow: hidden;
    background: #0b1b2b;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #f8fafc;
    user-select: none;
    -webkit-user-select: none;
  `;

  containerEl.innerHTML = `
    <style>
      #pedal-point-3d-container * { box-sizing: border-box; }
      #pp-hud {
        position: absolute; top: 10px; left: 12px; right: 12px;
        display: flex; justify-content: space-between; align-items: flex-start;
        gap: 8px; pointer-events: none; z-index: 10;
      }
      #pedal-point-3d-container .hud-group { display: flex; flex-wrap: wrap; gap: 8px; }
      #pedal-point-3d-container .hud-pill {
        background: rgba(14, 24, 22, 0.80);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 10px; padding: 6px 11px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        min-width: 72px;
      }
      #pedal-point-3d-container .hud-label {
        font-size: 9px; font-weight: 800; letter-spacing: 0.08em;
        text-transform: uppercase; color: #94a3b8; margin-bottom: 1px;
      }
      #pedal-point-3d-container .hud-value {
        font-size: 16px; font-weight: 900; font-variant-numeric: tabular-nums;
        color: #ffffff; line-height: 1.1;
      }
      #pp-hud-combo .hud-value { color: #fbbf24; }
      #pp-hud-rem .hud-value { color: #38bdf8; }
      #pp-hud-best .hud-value { color: #34d399; }
      #pp-melody-banner {
        position: absolute; top: 56px; left: 50%;
        transform: translateX(-50%);
        background: rgba(14, 24, 22, 0.92);
        border: 2px solid #fbbf24;
        border-radius: 14px;
        padding: 6px 18px;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.5);
        z-index: 11;
        pointer-events: none;
      }
      #pp-melody-notes { display: flex; gap: 8px; }
      #pedal-point-3d-container .hud-actions { display: flex; gap: 8px; pointer-events: auto; }
      #pedal-point-3d-container .hud-btn {
        background: rgba(14, 24, 22, 0.85); color: #f8fafc;
        border: 1px solid rgba(167, 243, 208, 0.3);
        border-radius: 10px; padding: 8px 12px;
        font-size: 12px; font-weight: 800; cursor: pointer;
      }
      #pedal-point-3d-container .hud-btn:hover { background: rgba(30, 41, 59, 0.95); }
      #pp-callout {
        position: absolute; top: 34%; left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        font-size: 22px; font-weight: 900; letter-spacing: 0.04em;
        text-transform: uppercase; color: #34d399;
        text-shadow: 0 4px 16px rgba(0, 0, 0, 0.92);
        opacity: 0; pointer-events: none;
        transition: opacity 0.18s ease, transform 0.18s ease;
        z-index: 12; text-align: center; white-space: nowrap;
      }
      #pp-callout.show { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
      #pp-bottom-bar {
        position: absolute; bottom: 10px; left: 12px; right: 12px;
        display: flex; justify-content: space-between; align-items: flex-end;
        pointer-events: none; z-index: 10;
      }
      #pp-controls-caption {
        background: rgba(14, 24, 22, 0.78);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px; padding: 6px 10px;
        font-size: 11px; font-weight: 700; color: #cbd5e1;
      }
      #pp-preload-pill {
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid #fbbf24;
        border-radius: 999px; padding: 4px 12px;
        font-size: 11px; font-weight: 900; color: #fbbf24;
        opacity: 0; transition: opacity 0.1s ease;
      }
      #pp-touch-jump-btn {
        pointer-events: auto;
        background: linear-gradient(135deg, #10b981, #0ea5e9);
        color: #ffffff; border: 2px solid rgba(255, 255, 255, 0.4);
        border-radius: 10px; padding: 8px 14px;
        font-size: 12px; font-weight: 900; cursor: pointer;
      }
      #pp-overlay {
        position: absolute; inset: 0;
        background: radial-gradient(circle at center, rgba(11, 27, 43, 0.68), rgba(11, 27, 43, 0.92));
        display: flex; align-items: center; justify-content: center;
        padding: 12px; z-index: 20;
      }
      #pedal-point-3d-container .modal-card {
        background: rgba(18, 32, 29, 0.96);
        border: 1px solid rgba(52, 211, 153, 0.35);
        border-radius: 16px; padding: 16px 20px;
        max-width: 520px; width: 100%; text-align: center;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.55);
      }
      #pedal-point-3d-container .badge-tag {
        display: inline-block; background: rgba(16, 185, 129, 0.18);
        color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4);
        font-size: 10px; font-weight: 800; letter-spacing: 0.1em;
        text-transform: uppercase; padding: 3px 10px;
        border-radius: 999px; margin-bottom: 4px;
      }
      #pedal-point-3d-container .modal-card h1 {
        margin: 0 0 4px 0; font-size: 24px; font-weight: 900; color: #ffffff;
      }
      #pp-modal-subtitle {
        margin: 0 0 10px 0; font-size: 12px; color: #cbd5e1; line-height: 1.35;
      }
      #pedal-point-3d-container .bike-grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
        margin-bottom: 10px; text-align: left;
      }
      #pedal-point-3d-container .bike-opt {
        border: 2px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px; padding: 8px; cursor: pointer;
      }
      #pedal-point-3d-container .bike-opt.selected {
        border-color: #34d399;
        background: rgba(16, 185, 129, 0.18);
      }
      #pedal-point-3d-container .controls-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 5px;
        text-align: left; background: rgba(11, 27, 43, 0.65);
        border-radius: 10px; padding: 8px 12px; margin-bottom: 12px;
        font-size: 11px; color: #e2e8f0;
      }
      #pedal-point-3d-container .controls-grid span b { color: #34d399; }
      #pedal-point-3d-container .modal-actions { display: flex; gap: 10px; }
      #btn-pp-modal-recalib {
        flex: 1; padding: 10px 12px; font-size: 12px; font-weight: 800;
        text-transform: uppercase; color: #e2e8f0;
        background: rgba(30, 41, 59, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 10px; cursor: pointer;
      }
      #btn-pp-play {
        flex: 1.4; padding: 10px 20px; font-size: 15px; font-weight: 900;
        text-transform: uppercase; color: #ffffff;
        background: linear-gradient(135deg, #10b981, #0ea5e9);
        border: none; border-radius: 10px; cursor: pointer;
      }
      #pp-calib-overlay {
        position: absolute; inset: 0;
        background: rgba(11, 27, 43, 0.92);
        display: none; align-items: center; justify-content: center;
        padding: 12px; z-index: 30;
      }
      #pedal-point-3d-container .calib-card {
        background: rgba(18, 32, 29, 0.98);
        border: 2px solid #34d399; border-radius: 16px;
        padding: 18px 20px; max-width: 450px; width: 100%; text-align: center;
      }
      #pedal-point-3d-container .calib-steps {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0;
      }
      #pedal-point-3d-container .calib-slot {
        background: rgba(11, 27, 43, 0.75);
        border: 2px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px; padding: 8px;
      }
      #pedal-point-3d-container .calib-slot.active {
        border-color: #fbbf24; background: rgba(251, 191, 36, 0.16);
      }
      #pedal-point-3d-container .calib-slot.done {
        border-color: #34d399; background: rgba(52, 211, 153, 0.16);
      }
      #pedal-point-3d-container .calib-slot-title {
        font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8;
      }
      #pedal-point-3d-container .calib-slot-key {
        font-size: 15px; font-weight: 900; color: #ffffff; margin-top: 2px;
      }
      #pp-calib-prompt {
        font-size: 14px; font-weight: 800; color: #fbbf24; margin-bottom: 8px;
      }
      #pedal-point-3d-container .calib-footer { display: flex; gap: 8px; justify-content: center; }
      #pedal-point-3d-container .calib-footer button {
        padding: 8px 14px; border-radius: 8px; border: none;
        font-weight: 800; font-size: 12px; cursor: pointer;
      }
      #btn-pp-calib-skip { background: #334155; color: #e2e8f0; }
      #btn-pp-calib-save { background: #10b981; color: #052e16; }
    </style>

    <!-- Top HUD -->
    <div id="pp-hud">
      <div class="hud-group">
        <div class="hud-pill">
          <div class="hud-label">Speed</div>
          <div class="hud-value" id="pp-val-speed">0 km/h</div>
        </div>
        <div class="hud-pill" id="pp-hud-rem">
          <div class="hud-label">Remaining</div>
          <div class="hud-value" id="pp-val-rem">2400m</div>
        </div>
        <div class="hud-pill">
          <div class="hud-label">Score</div>
          <div class="hud-value" id="pp-val-score">0</div>
        </div>
        <div class="hud-pill" id="pp-hud-combo">
          <div class="hud-label">Flow</div>
          <div class="hud-value" id="pp-val-combo">x1</div>
        </div>
        <div class="hud-pill" id="pp-hud-best">
          <div class="hud-label">Best Score</div>
          <div class="hud-value" id="pp-val-best">--</div>
        </div>
      </div>
      <div class="hud-actions">
        <button type="button" class="hud-btn" id="btn-pp-calibrate" title="Assign Piano or Keyboard Keys">🎹 Keys</button>
        <button type="button" class="hud-btn" id="btn-pp-cam-toggle" title="Toggle Camera">🎥 Chase Cam</button>
      </div>
    </div>

    <!-- Approaching Melody Trail Prompt -->
    <div id="pp-melody-banner">
      <div style="font-size:10px; font-weight:900; letter-spacing:0.08em; color:#fbbf24;">🎹 MELODY TRAIL — PLAY THE NOTES</div>
      <div id="pp-melody-notes"></div>
    </div>

    <!-- Callout Banner -->
    <div id="pp-callout">G4 NOTE GATE! +200</div>

    <!-- Bottom Controls Bar -->
    <div id="pp-bottom-bar">
      <div id="pp-controls-caption">
        <b>A / ←</b> Steer Left • <b>D / →</b> Steer Right • <b>Space</b> Jump &amp; Whip
      </div>
      <div id="pp-preload-pill">PRE-LOAD: 0%</div>
      <button type="button" id="pp-touch-jump-btn">⬆ JUMP / WHIP</button>
    </div>

    <!-- Start / Garage Overlay -->
    <div id="pp-overlay">
      <div class="modal-card">
        <div class="badge-tag">Wollongong NSW • Illawarra Escarpment</div>
        <h1>PEDAL POINT 3D</h1>
        <p id="pp-modal-subtitle">
          Shred red-dirt singletrack down Mt Kembla! Carve through <b>Melodic Note Gates</b>, launch off <b>Beat-Synced Dirt Jumps</b>, and match <b>Melody Trails</b>!
        </p>

        <div class="bike-grid" id="pp-bike-grid">
          <div class="bike-opt selected" data-bike="enduro">
            <div style="font-size:12px; font-weight:900; color:#fff;">Kembla Trail 140</div>
            <div style="font-size:10px; color:#cbd5e1; margin-top:2px;">High agility &amp; huge bunny-hop pop.</div>
          </div>
          <div class="bike-opt" data-bike="downhill">
            <div style="font-size:12px; font-weight:900; color:#fff;">Escarpment DH 200</div>
            <div style="font-size:10px; color:#cbd5e1; margin-top:2px;">Fastest top speed &amp; plush landings.</div>
          </div>
          <div class="bike-opt" data-bike="ebike">
            <div style="font-size:12px; font-weight:900; color:#fff;">Illawarra Volt E-MTB</div>
            <div style="font-size:10px; color:#cbd5e1; margin-top:2px;">Instant electric cadence boost.</div>
          </div>
        </div>

        <div class="controls-grid">
          <span><b id="pp-lbl-left">A / ←</b> Steer Left</span>
          <span><b id="pp-lbl-right">D / →</b> Steer Right</span>
          <span><b id="pp-lbl-jump">Space</b> Pre-Load &amp; Jump</span>
          <span><b id="pp-lbl-view">V</b> Helmet / Chase Cam</span>
        </div>

        <div class="modal-actions">
          <button type="button" id="btn-pp-modal-recalib">🎹 Recalibrate Notes</button>
          <button type="button" id="btn-pp-play">Drop In 🚵‍♂️</button>
        </div>
      </div>
    </div>

    <!-- 4-Step Piano / Keyboard Calibration Modal (Matches 3D Ski Slalom) -->
    <div id="pp-calib-overlay">
      <div class="calib-card">
        <div class="badge-tag">Piano &amp; Key Setup</div>
        <h2 style="margin:0 0 4px 0; font-size:20px; color:#fff;">Assign Your Controls</h2>
        <p style="margin:0 0 8px 0; font-size:12px; color:#cbd5e1;">
          Play a note on your <b>Piano Keyboard</b> or press a <b>Computer Key</b> for each action:
        </p>
        <div id="pp-calib-prompt">Step 1/4: Play key for STEER LEFT</div>
        <div class="calib-steps">
          <div class="calib-slot active" id="pp-slot-left">
            <div class="calib-slot-title">1. Steer Left</div>
            <div class="calib-slot-key" id="pp-key-left">Listening...</div>
          </div>
          <div class="calib-slot" id="pp-slot-right">
            <div class="calib-slot-title">2. Steer Right</div>
            <div class="calib-slot-key" id="pp-key-right">--</div>
          </div>
          <div class="calib-slot" id="pp-slot-jump">
            <div class="calib-slot-title">3. Jump &amp; Air Whip</div>
            <div class="calib-slot-key" id="pp-key-jump">--</div>
          </div>
          <div class="calib-slot" id="pp-slot-view">
            <div class="calib-slot-title">4. Camera View</div>
            <div class="calib-slot-key" id="pp-key-view">--</div>
          </div>
        </div>
        <div class="calib-footer">
          <button type="button" id="btn-pp-calib-skip">Use Defaults (A/D/Space/V)</button>
          <button type="button" id="btn-pp-calib-save" style="display:none;">Done &amp; Save</button>
        </div>
      </div>
    </div>
  `;

  wrapperParent.style.position = 'relative';
  wrapperParent.appendChild(containerEl);

  // ============================================================================
  // 1. PROCEDURAL WEB AUDIO (122 BPM Groove + Melodic Gate Chimes)
  // ============================================================================
  class EscarpmentAudio {
    constructor() {
      this.ctx = null;
      this.initialized = false;
      this.nextStepTime = 0;
      this.currentStep = 0;
      this.lastBeatTime = 0;
    }

    init() {
      if (this.initialized) return;
      try {
        initAudio();
        this.ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        this.initialized = true;
      } catch (e) {}
    }

    startGroove() {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.currentStep = 0;
      this.nextStepTime = this.ctx.currentTime + 0.05;
      this.lastBeatTime = this.nextStepTime;
    }

    getBeatAccuracy() {
      if (!this.ctx) return 0.25;
      const elapsed = this.ctx.currentTime - this.lastBeatTime;
      const p = ((elapsed / BEAT_DURATION) % 1 + 1) % 1;
      return Math.min(p, 1 - p);
    }

    updateGroove(comboCount, active) {
      if (!this.initialized || !this.ctx || !active) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const stepDur = BEAT_DURATION / 4;
      while (this.nextStepTime < this.ctx.currentTime + 0.12) {
        this.scheduleStep(this.currentStep, this.nextStepTime, comboCount);
        this.nextStepTime += stepDur;
        this.currentStep = (this.currentStep + 1) % 16;
      }
    }

    scheduleStep(step, t, comboCount) {
      if (step % 4 === 0) {
        this.lastBeatTime = t;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        gain.gain.setValueAtTime(0.24, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
      }
      if (comboCount >= 2 && step % 4 === 0) {
        const bassNotes = [98.0, 123.47, 130.81, 146.83];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(bassNotes[(step / 4) % 4], t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.24);
      }
    }

    playFeedbackNote(noteOrMidi = 60) {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      const freq = typeof noteOrMidi === 'number'
        ? 440 * Math.pow(2, (noteOrMidi - 69) / 12)
        : (getNoteFrequency(noteOrMidi) || 392.0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    }

    playGateNote(freq) {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    }

    playJump(perfect) {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(perfect ? 280 : 190, now);
      osc.frequency.exponentialRampToValueAtTime(perfect ? 760 : 440, now + 0.16);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    }
  }

  const audio = new EscarpmentAudio();

  // ============================================================================
  // 2. THREE.JS SCENE, ILLAWARRA TERRAIN, OCEAN VISTA & 3D MTB BUILDER
  // ============================================================================
  const scene = new THREE.Scene();
  const colSkyCoastal = new THREE.Color(0x6bb6e8);
  const colSkyRainforest = new THREE.Color(0x3a6e63);
  const colFogCoastal = new THREE.Color(0xa6d8f5);
  const colFogRainforest = new THREE.Color(0x3f6b5a);

  scene.background = colSkyCoastal.clone();
  scene.fog = new THREE.FogExp2(0xa6d8f5, 0.00095);

  const camera = new THREE.PerspectiveCamera(65, initW / initH, 0.15, 2600);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(initW, initH);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  containerEl.insertBefore(renderer.domElement, containerEl.firstChild);

  const hemiLight = new THREE.HemisphereLight(0xdff2ff, 0x3b5930, 0.92);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.45);
  sunLight.position.set(40, 85, 35);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  scene.add(sunLight);
  scene.add(sunLight.target);

  let currentSeed = 2500;
  let trailParams = { p1: 0.4, p2: 1.7, p3: 2.9, a1: 22, a2: 11, a3: 4.5 };
  let dirtFeatures = [];
  let noteGates = [];
  let rhythmRamps = [];
  let melodyChallenges = [];
  let worldGroup = null;
  let cargoShips = [];
  let floatingNotes = [];

  function createMusicalNoteMesh(THREE, hexColor, scale = 1.0, emissiveBoost = 0.65) {
    const noteGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: hexColor,
      emissive: hexColor,
      emissiveIntensity: emissiveBoost,
      roughness: 0.25,
      metalness: 0.15
    });

    // Oval tilted notehead
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), mat);
    head.scale.set(1.22, 0.86, 0.62);
    head.rotation.z = 0.35;
    head.position.set(-0.14, -0.35, 0);
    noteGroup.add(head);

    // Vertical stem on right side of notehead
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1.35, 10), mat);
    stem.position.set(0.28, 0.28, 0);
    noteGroup.add(stem);

    // Angled eighth-note flag at top of stem
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.12), mat);
    flag.position.set(0.50, 0.82, 0);
    flag.rotation.z = -0.48;
    noteGroup.add(flag);

    noteGroup.scale.setScalar(scale);
    return noteGroup;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getRainforestBlend(z) {
    function smoothBand(val, startZ, endZ, fade) {
      const enter = Math.max(0, Math.min(1, (startZ - val) / fade));
      const exit = Math.max(0, Math.min(1, (val - endZ) / fade));
      const sEnter = enter * enter * (3 - 2 * enter);
      const sExit = exit * exit * (3 - 2 * exit);
      return sEnter * sExit;
    }
    return Math.min(1, Math.max(smoothBand(z, -460, -1160, 85), smoothBand(z, -1560, -2550, 85)));
  }

  function isLookoutZ(z) {
    return LOOKOUT_WINDOWS.some(w => z <= w.zMax && z >= w.zMin);
  }

  function initTrailParams(seed) {
    const rng = mulberry32(seed);
    trailParams = {
      p1: rng() * Math.PI * 2,
      p2: rng() * Math.PI * 2,
      p3: rng() * Math.PI * 2,
      a1: 18 + rng() * 12,
      a2: 9 + rng() * 7,
      a3: 3.5 + rng() * 3.5
    };
  }

  function getTrailCenterX(z) {
    return (
      Math.sin(z * 0.0042 + trailParams.p1) * trailParams.a1 +
      Math.sin(z * 0.0115 + trailParams.p2) * trailParams.a2 +
      Math.cos(z * 0.023 + trailParams.p3) * trailParams.a3
    );
  }

  function getTrailCurvature(z) {
    const eps = 2.0;
    return (getTrailCenterX(z - eps) - 2 * getTrailCenterX(z) + getTrailCenterX(z + eps)) / (eps * eps);
  }

  function getBaseTrailY(z) {
    const dist = Math.max(0, -z);
    return 365 - 0.148 * dist + Math.sin(z * 0.028) * 1.45 + Math.cos(z * 0.062) * 0.55;
  }

  function getFeatureHeightOffset(x, z) {
    let extraY = 0;
    for (let i = 0; i < dirtFeatures.length; i++) {
      const f = dirtFeatures[i];
      const dz = z - f.z;
      if (Math.abs(dz) > f.halfLen + 2) continue;
      const dx = Math.abs(x - f.x);
      if (dx > f.halfWidth + 1.5) continue;

      const latBlend = Math.max(0, Math.min(1, 1 - Math.max(0, dx - f.halfWidth * 0.72) / (f.halfWidth * 0.55 + 0.8)));
      const smoothLat = latBlend * latBlend * (3 - 2 * latBlend);

      let prof = 0;
      if (f.type === 'kicker') {
        if (dz >= 0 && dz <= f.halfLen) {
          prof = Math.pow(1 - dz / f.halfLen, 1.55) * f.height;
        } else if (dz < 0 && dz >= -2.2) {
          prof = Math.max(0, 1 + dz / 2.2) * f.height * 0.75;
        }
      } else if (f.type === 'tabletop') {
        const t = (f.halfLen - dz) / (f.halfLen * 2);
        if (t >= 0 && t <= 1) {
          if (t < 0.28) prof = Math.pow(t / 0.28, 1.4) * f.height;
          else if (t < 0.68) prof = f.height;
          else prof = ((1 - t) / 0.32) * f.height;
        }
      }
      extraY = Math.max(extraY, prof * smoothLat);
    }
    return extraY;
  }

  function getTerrainHeight(x, z) {
    const cx = getTrailCenterX(z);
    const dx = x - cx;
    const absDx = Math.abs(dx);
    const trailHalfWidth = 3.8;
    const baseY = getBaseTrailY(z);

    const curv = getTrailCurvature(z);
    const offTrail = Math.max(0, Math.min(1, (absDx - trailHalfWidth) / 3.0));
    const berm = (1 - offTrail * 0.5) * Math.max(-1.3, Math.min(1.9, curv * dx * 18.0));
    const rut = (1 - offTrail) * (-0.08 * Math.exp(-dx * dx * 0.8));

    const rfBlend = getRainforestBlend(z);
    let sideSlope = 0;
    if (dx > trailHalfWidth) {
      sideSlope = Math.pow(dx - trailHalfWidth, 1.26) * (0.42 + rfBlend * 0.10);
    } else if (dx < -trailHalfWidth) {
      const d = -dx - trailHalfWidth;
      const coastalDrop = -Math.pow(d, 1.18) * 0.50;
      const gullyWall = Math.pow(d, 1.24) * 0.42;
      sideSlope = coastalDrop + (gullyWall - coastalDrop) * rfBlend;
    }

    const rough = offTrail * (Math.sin(x * 0.19 + z * 0.14) * 1.1 + Math.cos(x * 0.08 - z * 0.09) * 1.6);
    return baseY + berm + rut + sideSlope + rough + getFeatureHeightOffset(x, z);
  }

  const tmpNormal = new THREE.Vector3();
  function getTerrainNormal(x, z) {
    const eps = 0.45;
    const hL = getTerrainHeight(x - eps, z);
    const hR = getTerrainHeight(x + eps, z);
    const hD = getTerrainHeight(x, z - eps);
    const hU = getTerrainHeight(x, z + eps);
    return tmpNormal.set(hL - hR, 2 * eps, hD - hU).normalize();
  }

  // Build 3D Mountain Bike & Articulated Rider
  const bikeRoot = new THREE.Group();
  const bikeVisual = new THREE.Group();
  bikeRoot.add(bikeVisual);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.32, metalness: 0.48 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.72 });
  const kashimaMat = new THREE.MeshStandardMaterial({ color: 0xd4a03a, roughness: 0.2, metalness: 0.88 });
  const jerseyMat = new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.7 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: 0x1e242b, roughness: 0.88 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8a37c, roughness: 0.65 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35 });
  const goggleMat = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12, emissiveIntensity: 0.35 });

  function addTube(p1, p2, r1, r2, mat, parent) {
    const v1 = new THREE.Vector3(p1[0], p1[1], p1[2]);
    const v2 = new THREE.Vector3(p2[0], p2[1], p2[2]);
    const dist = v1.distanceTo(v2);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, dist, 8), mat);
    mesh.position.copy(v1).add(v2).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize());
    parent.add(mesh);
    return mesh;
  }

  function createWheel() {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.068, 10, 22), darkMetalMat);
    tire.rotation.y = Math.PI / 2;
    wg.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.022, 8, 18), kashimaMat);
    rim.rotation.y = Math.PI / 2;
    wg.add(rim);
    return wg;
  }

  const chassisGroup = new THREE.Group();
  bikeVisual.add(chassisGroup);

  addTube([0, 0.46, 0.08], [0, 0.94, -0.56], 0.048, 0.056, frameMat, chassisGroup);
  addTube([0, 1.04, -0.54], [0, 0.87, 0.25], 0.036, 0.044, frameMat, chassisGroup);
  addTube([0, 0.46, 0.08], [0, 0.96, 0.28], 0.038, 0.042, frameMat, chassisGroup);
  [-0.07, 0.07].forEach(xOff => {
    addTube([xOff, 0.46, 0.08], [xOff, 0.42, 0.72], 0.022, 0.024, frameMat, chassisGroup);
    addTube([xOff, 0.87, 0.25], [xOff, 0.42, 0.72], 0.020, 0.022, frameMat, chassisGroup);
  });

  const rearWheel = createWheel();
  rearWheel.position.set(0, 0.42, 0.72);
  chassisGroup.add(rearWheel);

  const steerGroup = new THREE.Group();
  steerGroup.position.set(0, 1.05, -0.60);
  chassisGroup.add(steerGroup);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.82, 8), darkMetalMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.11, -0.08);
  steerGroup.add(bar);

  [-0.085, 0.085].forEach(xOff => {
    const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 8), kashimaMat);
    stanchion.position.set(xOff, -0.22, -0.11);
    stanchion.rotation.x = 0.36;
    steerGroup.add(stanchion);
  });

  const forkLowers = new THREE.Group();
  const frontWheel = createWheel();
  frontWheel.position.set(0, -0.63, -0.26);
  forkLowers.add(frontWheel);
  steerGroup.add(forkLowers);

  const riderGroup = new THREE.Group();
  riderGroup.position.set(0, 1.15, 0.25);
  chassisGroup.add(riderGroup);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.18, 0.24), shortsMat);
  hips.position.set(0, 0.04, 0.06);
  riderGroup.add(hips);

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.12, 0.04);
  torsoGroup.rotation.x = 0.48;
  riderGroup.add(torsoGroup);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.22), jerseyMat);
  chest.position.set(0, 0.24, 0);
  torsoGroup.add(chest);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.56, -0.02);
  headGroup.rotation.x = -0.38;
  torsoGroup.add(headGroup);

  headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 12), skinMat));
  const helmetShell = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetMat);
  helmetShell.position.set(0, 0.02, 0.01);
  headGroup.add(helmetShell);

  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.062, 0.055), goggleMat);
  goggles.position.set(0, 0.025, -0.115);
  headGroup.add(goggles);

  scene.add(bikeRoot);

  function buildWorld(seed) {
    if (worldGroup) scene.remove(worldGroup);
    worldGroup = new THREE.Group();
    scene.add(worldGroup);

    initTrailParams(seed);
    const rng = mulberry32(seed + 1337);

    dirtFeatures = [];
    rhythmRamps = [];
    for (let z = -95; z > -TRAIL_LENGTH + 90; z -= 95 + rng() * 55) {
      if ((z < -680 && z > -860) || (z < -1700 && z > -1880)) continue;
      const cx = getTrailCenterX(z);
      const isTable = rng() > 0.42;
      const feat = {
        x: cx,
        z,
        type: isTable ? 'tabletop' : 'kicker',
        halfLen: isTable ? 9.5 : 5.2,
        halfWidth: 2.9,
        height: isTable ? (1.45 + rng() * 0.55) : (1.35 + rng() * 0.55),
        triggered: false
      };
      dirtFeatures.push(feat);
      rhythmRamps.push(feat);
    }

    const zStart = 45;
    const zEnd = -TRAIL_LENGTH - 95;
    const zSegs = 340;
    const xSegs = 34;
    const corridorHalfWidth = 65;

    const positions = [];
    const colors = [];
    const indices = [];

    const colDirt = new THREE.Color(0x8c5730);
    const colDirtWarm = new THREE.Color(0xb27343);
    const colFern = new THREE.Color(0x4b8b34);
    const colRainforest = new THREE.Color(0x1f4d24);
    const tmpColor = new THREE.Color();

    for (let iz = 0; iz <= zSegs; iz++) {
      const z = zStart + (zEnd - zStart) * (iz / zSegs);
      const centerX = getTrailCenterX(z);
      const rfBlend = getRainforestBlend(z);

      for (let ix = 0; ix <= xSegs; ix++) {
        const u = (ix / xSegs) * 2 - 1;
        const signedOffset = Math.sign(u) * Math.pow(Math.abs(u), 1.48) * corridorHalfWidth;
        const x = centerX + signedOffset;
        const y = getTerrainHeight(x, z);
        positions.push(x, y, z);

        const absDx = Math.abs(signedOffset);
        if (absDx < 3.4) tmpColor.copy(colDirt).lerp(colDirtWarm, absDx / 3.4);
        else tmpColor.copy(colFern).lerp(colRainforest, Math.min(1, (absDx - 3.4) / 18 + rfBlend * 0.5));
        colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      }
    }

    const stride = xSegs + 1;
    for (let iz = 0; iz < zSegs; iz++) {
      for (let ix = 0; ix < xSegs; ix++) {
        const a = iz * stride + ix;
        const b = a + 1;
        const c = (iz + 1) * stride + ix;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    worldGroup.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      side: THREE.DoubleSide
    })));

    // Procedural Ocean Wave Texture (Rich Deep Navy/Cobalt Pacific Ocean)
    const oCan = document.createElement('canvas');
    oCan.width = 256;
    oCan.height = 256;
    const oCtx = oCan.getContext('2d');
    oCtx.fillStyle = '#07264a';
    oCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 240; i++) {
      const wx = rng() * 256;
      const wy = rng() * 256;
      const ww = 14 + rng() * 34;
      const wh = 2 + rng() * 3;
      oCtx.fillStyle = rng() > 0.45 ? 'rgba(18, 72, 132, 0.52)' : 'rgba(3, 18, 42, 0.55)';
      oCtx.fillRect(wx, wy, ww, wh);
    }
    for (let i = 0; i < 95; i++) {
      oCtx.fillStyle = 'rgba(186, 230, 253, 0.28)';
      oCtx.fillRect(rng() * 256, rng() * 256, 4 + rng() * 8, 1.5);
    }
    const oceanWaveTex = new THREE.CanvasTexture(oCan);
    oceanWaveTex.wrapS = THREE.RepeatWrapping;
    oceanWaveTex.wrapT = THREE.RepeatWrapping;
    oceanWaveTex.repeat.set(28, 40);

    // Pacific Ocean, Coastal Plain, Lake Illawarra & Port Kembla Cargo Ships
    const oceanY = -365;
    const oceanGeo = new THREE.PlaneGeometry(3600, 4800);
    oceanGeo.rotateX(-Math.PI / 2);
    const ocean = new THREE.Mesh(oceanGeo, new THREE.MeshStandardMaterial({
      color: 0x09315e,
      map: oceanWaveTex,
      emissive: 0x03142b,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.28,
      fog: false
    }));
    ocean.position.set(-920, oceanY, -1350);
    worldGroup.add(ocean);

    // Wollongong Coastal Plain & Suburbs
    const plainGeo = new THREE.PlaneGeometry(540, 3600);
    plainGeo.rotateX(-Math.PI / 2);
    const plain = new THREE.Mesh(plainGeo, new THREE.MeshStandardMaterial({ color: 0x3b6936, roughness: 0.95 }));
    plain.position.set(-340, oceanY + 4, -1250);
    worldGroup.add(plain);

    const lakeGeo = new THREE.CircleGeometry(145, 24);
    lakeGeo.rotateX(-Math.PI / 2);
    lakeGeo.scale(0.85, 1, 2.25);
    const lake = new THREE.Mesh(lakeGeo, new THREE.MeshStandardMaterial({
      color: 0x1d8a99,
      emissive: 0x083b47,
      emissiveIntensity: 0.25,
      roughness: 0.22
    }));
    lake.position.set(-415, oceanY + 6.5, -1420);
    worldGroup.add(lake);

    // Rolling Forested Foothills along the Escarpment Drop-off
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x2c5c30, roughness: 0.92, flatShading: true });
    for (let i = 0; i < 22; i++) {
      const r = 65 + rng() * 90;
      const h = 75 + rng() * 140;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), hillMat);
      hill.scale.set(1.2, 1, 1.8);
      hill.position.set(-140 - rng() * 185, oceanY + h * 0.45, 50 - i * 115);
      worldGroup.add(hill);
    }

    // Port Kembla Bulk-Carrier Cargo Ships on the Pacific Ocean
    cargoShips = [];
    floatingNotes = [];
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6, metalness: 0.35, fog: false });
    const waterlineMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7, fog: false });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8, fog: false });
    const hatchMat = new THREE.MeshStandardMaterial({ color: 0x7c4a32, roughness: 0.85, fog: false });
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, fog: false });
    const funnelMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5, fog: false });
    const wakeMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.55, fog: false });

    function createCargoShip(scale) {
      const ship = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 5.5, 58), hullMat);
      hull.position.set(0, 3.2, 0);
      ship.add(hull);

      const bow = new THREE.Mesh(new THREE.ConeGeometry(6.8, 12, 4), hullMat);
      bow.rotation.x = -Math.PI / 2;
      bow.rotation.z = Math.PI / 4;
      bow.scale.set(1.02, 1, 0.56);
      bow.position.set(0, 3.2, -35);
      ship.add(bow);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(10.3, 1.8, 59), waterlineMat);
      stripe.position.set(0, 0.9, 0);
      ship.add(stripe);

      const deck = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.6, 56), deckMat);
      deck.position.set(0, 6.2, 0);
      ship.add(deck);

      for (let h = 0; h < 5; h++) {
        const hatch = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.8, 6.8), hatchMat);
        hatch.position.set(0, 7.2, -21 + h * 9.0);
        ship.add(hatch);
      }

      const bridgeBase = new THREE.Mesh(new THREE.BoxGeometry(8.8, 6.5, 9.5), bridgeMat);
      bridgeBase.position.set(0, 9.6, 22);
      ship.add(bridgeBase);

      const bridgeTop = new THREE.Mesh(new THREE.BoxGeometry(11.6, 2.4, 5.0), bridgeMat);
      bridgeTop.position.set(0, 14.0, 21.5);
      ship.add(bridgeTop);

      const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 4.4, 8), funnelMat);
      funnel.position.set(0, 14.8, 25.2);
      ship.add(funnel);

      const wake = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 48), wakeMat);
      wake.rotation.x = -Math.PI / 2;
      wake.position.set(0, 0.4, 52);
      ship.add(wake);

      ship.scale.setScalar(scale);
      return ship;
    }

    const shipPlacements = [
      { x: -640,  z: -240,  rotY: 0.12,  scale: 1.75, speed: 3.4 },
      { x: -820,  z: -480,  rotY: -0.08, scale: 1.95, speed: -2.6 },
      { x: -680,  z: -860,  rotY: 0.18,  scale: 1.65, speed: 3.0 },
      { x: -940,  z: -1240, rotY: 0.05,  scale: 2.10, speed: 3.8 },
      { x: -720,  z: -1520, rotY: -0.15, scale: 1.80, speed: -3.1 },
      { x: -1020, z: -1840, rotY: 0.10,  scale: 2.20, speed: 2.5 },
      { x: -760,  z: -2120, rotY: 0.02,  scale: 1.85, speed: 3.2 }
    ];

    shipPlacements.forEach(sp => {
      const ship = createCargoShip(sp.scale);
      ship.position.set(sp.x, oceanY + 0.6, sp.z);
      ship.rotation.y = sp.rotY;
      worldGroup.add(ship);
      cargoShips.push({ mesh: ship, speed: sp.speed });
    });

    // Eucalyptus Trees
    const gumCount = 560;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.38, 14.5, 5);
    trunkGeo.translate(0, 7.25, 0);
    const canopyGeo = new THREE.DodecahedronGeometry(3.6, 0);
    canopyGeo.scale(1.3, 0.72, 1.2);
    canopyGeo.translate(0.5, 14.2, 0.2);

    const gumTrunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0xbcb6a8, flatShading: true }), gumCount);
    const gumCanopy = new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ color: 0x3b7236, flatShading: true }), gumCount);
    const dummy = new THREE.Object3D();

    let placed = 0;
    for (let i = 0; i < gumCount * 2 && placed < gumCount; i++) {
      const z = 25 - rng() * (TRAIL_LENGTH + 90);
      const rf = getRainforestBlend(z);
      const side = rng() < (rf > 0.35 ? 0.5 : 0.72) ? 1 : -1;
      if (side === -1 && isLookoutZ(z) && rf < 0.25 && rng() < 0.9) continue;

      const dist = 5.4 + Math.pow(rng(), 1.25) * 40;
      const x = getTrailCenterX(z) + side * dist;
      const y = getTerrainHeight(x, z);
      const s = 0.85 + rng() * 0.8;

      dummy.position.set(x, y - 0.5, z);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.set(s, s * 1.1, s);
      dummy.updateMatrix();
      gumTrunks.setMatrixAt(placed, dummy.matrix);
      gumCanopy.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    gumTrunks.count = gumCanopy.count = placed;
    worldGroup.add(gumTrunks, gumCanopy);

    // Melodic Note Gates
    noteGates = [];
    for (let z = -65; z > -TRAIL_LENGTH + 70; z -= 72 + rng() * 22) {
      if ((z < -675 && z > -865) || (z < -1695 && z > -1885)) continue;
      const note = SCALE_NOTES[Math.floor(rng() * SCALE_NOTES.length)];
      const x = getTrailCenterX(z) + (rng() - 0.5) * 3.0;
      const y = getTerrainHeight(x, z);

      const gateGroup = new THREE.Group();
      gateGroup.position.set(x, y, z);
      const mat = new THREE.MeshStandardMaterial({
        color: note.color,
        emissive: note.color,
        emissiveIntensity: 0.75
      });
      const arch = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.14, 8, 20, Math.PI), mat);
      arch.position.y = 0.2;
      gateGroup.add(arch);

      const noteIcon = createMusicalNoteMesh(THREE, note.color, 0.92, 0.8);
      noteIcon.position.set(0, 1.35, 0);
      gateGroup.add(noteIcon);
      floatingNotes.push({ mesh: noteIcon, baseY: 1.35, phase: z * 0.1 });

      worldGroup.add(gateGroup);
      noteGates.push({ x, y, z, note, mesh: gateGroup, hit: false });
    }

    // Beat-Synced Jump Strips
    rhythmRamps.forEach(feat => {
      const stripY = getTerrainHeight(feat.x, feat.z) + 0.08;
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(feat.halfWidth * 1.85, 0.65),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.82 })
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(feat.x, stripY, feat.z + 0.3);
      worldGroup.add(strip);
    });

    // Melody Trail Challenges (3D Musical Note Pickups in C-Red, D-Orange, E-Yellow, F-Green, G-Blue, A-Purple, B-Pink)
    melodyChallenges = [];
    const noteKeys = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
    const laneOffsets = [-2.3, 0.0, 2.3];

    [-700, -1720].forEach(startZ => {
      const seq = [Math.floor(rng() * 3), Math.floor(rng() * 3), Math.floor(rng() * 3), Math.floor(rng() * 3)];
      const rows = [];
      for (let step = 0; step < 4; step++) {
        const rowZ = startZ - 50 - step * 30;
        const cx = getTrailCenterX(rowZ);
        const orbs = [];

        const shuffledKeys = [...noteKeys].sort(() => rng() - 0.5).slice(0, 3);

        for (let lane = 0; lane < 3; lane++) {
          const pKey = shuffledKeys[lane];
          const pInfo = NOTE_PALETTE[pKey];
          const info = {
            label: pInfo.label,
            pitchClass: pKey,
            freq: pInfo.freq,
            color: pInfo.color,
            hex: pInfo.hex,
            offset: laneOffsets[lane]
          };
          const ox = cx + info.offset;
          const oy = getTerrainHeight(ox, rowZ) + 1.25;
          const isTarget = (lane === seq[step]);

          const noteMesh = createMusicalNoteMesh(THREE, info.color, isTarget ? 1.05 : 0.72, isTarget ? 0.95 : 0.4);
          noteMesh.position.set(ox, oy, rowZ);
          worldGroup.add(noteMesh);
          floatingNotes.push({ mesh: noteMesh, baseY: oy, phase: step + lane });

          orbs.push({ mesh: noteMesh, lane, x: ox, baseY: oy, info });
        }
        rows.push({ z: rowZ, targetLane: seq[step], orbs, resolved: false });
      }
      melodyChallenges.push({
        triggerZ: startZ + 12,
        endZ: startZ - 175,
        seq,
        rows,
        announced: false,
        completed: false,
        hits: 0
      });
    });

    // Finish Archway
    const fz = -TRAIL_LENGTH;
    const fx = getTrailCenterX(fz);
    const fy = getTerrainHeight(fx, fz);
    const archGroup = new THREE.Group();
    archGroup.position.set(fx, fy, fz);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(7.8, 1.1, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.6 })
    );
    banner.position.set(0, 4.9, 0);
    archGroup.add(banner);
    worldGroup.add(archGroup);
  }

  // ============================================================================
  // 3. 4-STEP PIANO & KEYBOARD CALIBRATION (Mirrors skiSlalom.js)
  // ============================================================================
  const DEFAULT_BINDINGS = {
    left:  { type: 'key', code: 'KeyA', label: 'A / ←' },
    right: { type: 'key', code: 'KeyD', label: 'D / →' },
    jump:  { type: 'key', code: 'Space', label: 'Space' },
    view:  { type: 'key', code: 'KeyV', label: 'V' }
  };

  let bindings = JSON.parse(localStorage.getItem('pedalpoint_key_bindings') || 'null') || JSON.parse(JSON.stringify(DEFAULT_BINDINGS));

  function updateControlsLabels() {
    const lblLeft = document.getElementById('pp-lbl-left');
    const lblRight = document.getElementById('pp-lbl-right');
    const lblJump = document.getElementById('pp-lbl-jump');
    const lblView = document.getElementById('pp-lbl-view');
    const caption = document.getElementById('pp-controls-caption');

    if (lblLeft) lblLeft.textContent = bindings.left.label;
    if (lblRight) lblRight.textContent = bindings.right.label;
    if (lblJump) lblJump.textContent = bindings.jump.label;
    if (lblView) lblView.textContent = bindings.view.label;
    if (caption) {
      caption.innerHTML =
        `<b>${bindings.left.label}</b> Steer Left • <b>${bindings.right.label}</b> Steer Right • <b>${bindings.jump.label}</b> Jump &amp; Whip`;
    }
  }
  updateControlsLabels();

  const calibOverlay = document.getElementById('pp-calib-overlay');
  const calibPrompt = document.getElementById('pp-calib-prompt');
  const btnCalibSave = document.getElementById('btn-pp-calib-save');
  const CALIB_ORDER = ['left', 'right', 'jump', 'view'];
  const CALIB_NAMES = {
    left: 'STEER LEFT',
    right: 'STEER RIGHT',
    jump: 'JUMP & AIR WHIP',
    view: 'CAMERA VIEW'
  };
  let isCalibrating = false;
  let calibStepIndex = 0;

  function openCalibrationModal() {
    audio.init();
    isCalibrating = true;
    calibStepIndex = 0;
    btnCalibSave.style.display = 'none';

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

    calibPrompt.textContent = `Step 1/4: Play key for ${CALIB_NAMES.left}`;
    calibOverlay.style.display = 'flex';
  }

  function closeCalibrationModal() {
    isCalibrating = false;
    calibOverlay.style.display = 'none';
    localStorage.setItem('pedalpoint_calibrated_seen', 'true');
    localStorage.setItem('pedalpoint_key_bindings', JSON.stringify(bindings));
    updateControlsLabels();
  }

  function recordCalibrationInput(bindingObj, feedbackNoteOrMidi = 60) {
    if (!isCalibrating || calibStepIndex >= CALIB_ORDER.length) return;
    const currentSlot = CALIB_ORDER[calibStepIndex];

    for (let i = 0; i < calibStepIndex; i++) {
      const prev = bindings[CALIB_ORDER[i]];
      if (prev.type === bindingObj.type && prev.code === bindingObj.code) {
        calibPrompt.textContent = `⚠️ Already used! Pick a different key for ${CALIB_NAMES[currentSlot]}`;
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
      calibPrompt.textContent = `Step ${calibStepIndex + 1}/4: Play key for ${CALIB_NAMES[nextSlot]}`;
    } else {
      calibPrompt.textContent = '✅ All 4 controls calibrated!';
      btnCalibSave.style.display = 'inline-block';
    }
  }

  document.getElementById('btn-pp-calibrate').addEventListener('click', () => {
    openCalibrationModal();
    document.getElementById('btn-pp-calibrate').blur();
  });
  document.getElementById('btn-pp-modal-recalib').addEventListener('click', () => {
    openCalibrationModal();
    document.getElementById('btn-pp-modal-recalib').blur();
  });
  document.getElementById('btn-pp-calib-skip').addEventListener('click', () => {
    bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    closeCalibrationModal();
  });
  btnCalibSave.addEventListener('click', closeCalibrationModal);

  const hasSeenCalib = Boolean(localStorage.getItem('pedalpoint_calibrated_seen'));
  if (!hasSeenCalib && !autoStart) {
    openCalibrationModal();
  }

  // ============================================================================
  // 4. BIKE PHYSICS, INPUT HANDLERS & SIMULATION LOOP
  // ============================================================================
  let isPlaying = false;
  let isFirstPerson = false;
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

  const valSpeed = document.getElementById('pp-val-speed');
  const valRem = document.getElementById('pp-val-rem');
  const valScore = document.getElementById('pp-val-score');
  const valCombo = document.getElementById('pp-val-combo');
  const valBest = document.getElementById('pp-val-best');
  const preloadPill = document.getElementById('pp-preload-pill');
  const calloutEl = document.getElementById('pp-callout');
  const overlayEl = document.getElementById('pp-overlay');
  const btnCamToggle = document.getElementById('btn-pp-cam-toggle');

  if (bestScore > 0) valBest.textContent = bestScore.toLocaleString();

  document.querySelectorAll('#pp-bike-grid .bike-opt').forEach(card => {
    card.addEventListener('click', () => {
      selectedBikeKey = card.dataset.bike;
      document.querySelectorAll('#pp-bike-grid .bike-opt').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  const bike = {
    pos: new THREE.Vector3(0, 366, 0),
    vel: new THREE.Vector3(0, 0, -12),
    yaw: 0,
    steerAngle: 0,
    leanAngle: 0,
    grounded: true,
    coyoteTimer: 0.14,
    airTime: 0,
    hopCharge: 0,
    wasCharging: false,
    suspensionComp: 0,
    wheelSpin: 0,
    whipAngle: 0,
    whipTarget: 0,
    whipAwarded: false
  };

  const input = {
    left: false,
    right: false,
    jumpHeld: false,
    pianoLeftHoldUntil: 0,
    pianoRightHoldUntil: 0
  };

  let calloutTimeout = null;
  function showCallout(text, color = '#34d399') {
    if (!calloutEl) return;
    calloutEl.textContent = text;
    calloutEl.style.color = color;
    calloutEl.classList.add('show');
    clearTimeout(calloutTimeout);
    calloutTimeout = setTimeout(() => calloutEl.classList.remove('show'), 1200);
  }

  function toggleCameraMode() {
    isFirstPerson = !isFirstPerson;
    headGroup.visible = !isFirstPerson;
    btnCamToggle.textContent = isFirstPerson ? '🥽 Helmet Cam' : '🎥 Chase Cam';
    showCallout(isFirstPerson ? 'HELMET CAM' : 'CHASE CAM', '#38bdf8');
  }

  btnCamToggle.addEventListener('click', () => {
    toggleCameraMode();
    btnCamToggle.blur();
  });

  function addScore(pts, hitNote = false) {
    if (hitNote) {
      combo++;
      notesHit++;
      notesAttempted++;
      if (combo > maxCombo) maxCombo = combo;
      if (combo >= 6) overdriveTimer = 4.5;
    }
    const mult = Math.max(1, Math.min(8, 1 + Math.floor(combo / 2)));
    score += Math.round(pts * mult);
    valScore.textContent = score.toLocaleString();
    valCombo.textContent = `x${mult}`;
  }

  function triggerHop() {
    const preset = BIKE_PRESETS[selectedBikeKey];
    const chargeBonus = 0.68 + bike.hopCharge * 0.62;
    const isOnBeat = audio.getBeatAccuracy() < 0.18;

    bike.vel.y = preset.hopImpulse * chargeBonus * (isOnBeat ? 1.14 : 1.0);
    bike.grounded = false;
    bike.coyoteTimer = 0;
    bike.whipAwarded = false;
    bike.suspensionComp = 0;

    audio.playJump(isOnBeat);

    for (let i = 0; i < rhythmRamps.length; i++) {
      const r = rhythmRamps[i];
      if (!r.triggered && Math.abs(bike.pos.z - r.z) < 7.5 && Math.abs(bike.pos.x - r.x) < 4.5) {
        r.triggered = true;
        if (isOnBeat) {
          bike.vel.y *= 1.16;
          bike.vel.z -= 4.5;
          addScore(450, true);
          showCallout('PERFECT BEAT BOOST! +450', '#fbbf24');
        } else {
          addScore(180, false);
          showCallout('BIG DIRT SEND! +180', '#34d399');
        }
        break;
      }
    }
  }

  function handleControlDown(type, code, displayLabel, feedbackNoteOrMidi = 60) {
    if (isCalibrating) {
      recordCalibrationInput({ type, code, label: displayLabel }, feedbackNoteOrMidi);
      return;
    }

    const match = (b) => b.type === type && b.code === code;

    if (match(bindings.left) || (type === 'key' && code === 'ArrowLeft')) {
      input.left = true;
      if (type === 'piano') {
        input.pianoLeftHoldUntil = performance.now() + 340;
        input.pianoRightHoldUntil = 0;
      }
      return;
    }
    if (match(bindings.right) || (type === 'key' && code === 'ArrowRight')) {
      input.right = true;
      if (type === 'piano') {
        input.pianoRightHoldUntil = performance.now() + 340;
        input.pianoLeftHoldUntil = 0;
      }
      return;
    }
    if (match(bindings.jump)) {
      if (!isPlaying && overlayEl.style.display !== 'none') {
        startGame();
      } else if (bike.grounded || bike.coyoteTimer > 0) {
        input.jumpHeld = true;
      } else {
        bike.whipTarget = 0.95;
        if (!bike.whipAwarded && bike.airTime > 0.2) {
          bike.whipAwarded = true;
          audio.playGateNote(659.25);
          addScore(300, true);
          showCallout('STYLISH AIR WHIP! +300', '#fb923c');
        }
      }
      return;
    }
    if (match(bindings.view)) {
      toggleCameraMode();
      return;
    }

    // Any other piano note snaps to matching Melody Trail note lane (C-B) or gives cadence boost!
    if (type === 'piano' && isPlaying) {
      const pitchMatch = code.match(/^([a-g]#?)/);
      const pitchClass = pitchMatch ? pitchMatch[1] : '';
      let matchedOffset = null;

      for (let i = 0; i < melodyChallenges.length; i++) {
        const mc = melodyChallenges[i];
        if (bike.pos.z <= mc.triggerZ && bike.pos.z >= mc.endZ && !mc.completed) {
          const nextRow = mc.rows.find(r => !r.resolved);
          if (nextRow) {
            const orbMatch = nextRow.orbs.find(o => o.info.pitchClass === pitchClass);
            if (orbMatch) matchedOffset = orbMatch.info.offset;
          }
        }
      }

      if (matchedOffset !== null) {
        const targetX = getTrailCenterX(bike.pos.z) + matchedOffset;
        bike.pos.x += (targetX - bike.pos.x) * 0.72;
        overdriveTimer = Math.max(overdriveTimer, 1.5);
      } else {
        bike.vel.z -= 2.2;
        overdriveTimer = Math.max(overdriveTimer, 1.2);
      }
    }
  }

  function handleControlUp(type, code) {
    const match = (b) => b.type === type && b.code === code;
    if (match(bindings.left) || (type === 'key' && code === 'ArrowLeft')) {
      input.left = false;
      if (type === 'piano') input.pianoLeftHoldUntil = 0;
    }
    if (match(bindings.right) || (type === 'key' && code === 'ArrowRight')) {
      input.right = false;
      if (type === 'piano') input.pianoRightHoldUntil = 0;
    }
    if (match(bindings.jump)) {
      input.jumpHeld = false;
      bike.whipTarget = 0;
    }
  }

  function onPianoNoteDown(noteStr, bridge) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (!clean) return;
    const upperLabel = `🎹 ${clean.toUpperCase()}`;
    if (bridge) bridge.highlightKey(noteStr, 250, '#34d399');
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
    }
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });

  document.getElementById('pp-touch-jump-btn').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (isPlaying) {
      if (bike.grounded || bike.coyoteTimer > 0) {
        bike.hopCharge = 0.6;
        triggerHop();
      } else {
        bike.whipTarget = 0.95;
      }
    }
  });

  function startGame() {
    audio.startGroove();
    currentSeed = Math.floor(1000 + Math.random() * 8999);
    buildWorld(currentSeed);

    const startX = getTrailCenterX(0);
    const startY = getTerrainHeight(startX, 0);
    bike.pos.set(startX, startY, 0);
    bike.vel.set(0, 0, -12);
    bike.yaw = 0;
    bike.steerAngle = 0;
    bike.leanAngle = 0;
    bike.grounded = true;
    bike.coyoteTimer = 0.14;
    bike.airTime = 0;
    bike.hopCharge = 0;
    bike.wasCharging = false;
    bike.suspensionComp = 0;
    bike.whipAngle = 0;
    bike.whipTarget = 0;
    bike.whipAwarded = false;

    score = 0;
    combo = 0;
    maxCombo = 1;
    maxAirtime = 0;
    notesAttempted = 0;
    notesHit = 0;
    overdriveTimer = 0;
    lastZoneIdx = -1;

    valScore.textContent = '0';
    valCombo.textContent = 'x1';
    valRem.textContent = `${TRAIL_LENGTH}m`;

    overlayEl.style.display = 'none';
    isPlaying = true;
  }

  function finishCourse() {
    isPlaying = false;
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('pedalpoint_best_score', String(bestScore));
      valBest.textContent = bestScore.toLocaleString();
    }

    const accuracy = notesAttempted > 0 ? Math.round((notesHit / notesAttempted) * 100) : 100;
    const summaryHtml =
      `<span style="color:#34d399; font-weight:900;">🚵‍♂️ ESCARPMENT DESCENT COMPLETE!</span><br>` +
      `Score: <span style="color:#fbbf24; font-size:1.4rem; font-weight:900;">${score.toLocaleString()}</span><br>` +
      `<span style="font-size:0.82rem; color:#38bdf8;">Musical Accuracy: ${accuracy}% • Max Flow: x${maxCombo} • Max Air: ${maxAirtime.toFixed(2)}s</span>`;

    stopPedalPoint();
    bridgeRef.finishCustomMiniGame(
      'Pedal Point',
      score,
      summaryHtml,
      () => startPedalPoint(bridgeRef, true)
    );
  }

  document.getElementById('btn-pp-play').addEventListener('click', startGame);

  // Build initial preview world while in garage/calibration
  buildWorld(currentSeed);
  const initX = getTrailCenterX(0);
  bike.pos.set(initX, getTerrainHeight(initX, 0), 0);

  let lastTime = performance.now();

  function animate(now) {
    if (!containerEl || !renderer) return;
    animFrameId = requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (isPlaying) {
      audio.updateGroove(combo, true);

      const preset = BIKE_PRESETS[selectedBikeKey];
      const normal = getTerrainNormal(bike.pos.x, bike.pos.z);

      const steerInput = ((input.left || now < input.pianoLeftHoldUntil) ? 1 : 0) - ((input.right || now < input.pianoRightHoldUntil) ? 1 : 0);
      bike.steerAngle += (steerInput * 0.45 - bike.steerAngle) * Math.min(1, dt * 11);

      const grav = 24.0 * (preset.gravityMult || 1.0);
      bike.vel.y -= grav * dt;
      const horizSpeed = Math.hypot(bike.vel.x, bike.vel.z);

      if (bike.grounded) {
        bike.coyoteTimer = 0.14;
        bike.vel.x += normal.x * grav * dt;
        bike.vel.z += normal.z * grav * dt;

        const fwdX = -Math.sin(bike.yaw);
        const fwdZ = -Math.cos(bike.yaw);
        const boost = overdriveTimer > 0 ? 1.22 : 1.0;

        if (horizSpeed < preset.maxPedalSpeed * boost) {
          bike.vel.x += fwdX * preset.pedalForce * boost * dt;
          bike.vel.z += fwdZ * preset.pedalForce * boost * dt;
        }

        const turnRate = preset.turnSpeed * (0.55 + Math.min(1, horizSpeed / 16) * 0.55);
        bike.yaw = Math.max(-1.05, Math.min(1.05, bike.yaw + steerInput * turnRate * dt));

        const speedNow = Math.hypot(bike.vel.x, bike.vel.z);
        bike.vel.x += (-Math.sin(bike.yaw) * speedNow - bike.vel.x) * Math.min(1, dt * 6.5);
        bike.vel.z += (-Math.cos(bike.yaw) * speedNow - bike.vel.z) * Math.min(1, dt * 6.5);

        const maxSpd = preset.maxDownhillSpeed * (overdriveTimer > 0 ? 1.15 : 1.0);
        const clampedSpd = Math.hypot(bike.vel.x, bike.vel.z);
        if (clampedSpd > maxSpd) {
          const s = maxSpd / clampedSpd;
          bike.vel.x *= s;
          bike.vel.z *= s;
        }
        if (bike.vel.z > -10.0) bike.vel.z -= 12.0 * dt;
        bike.whipTarget = 0;
      } else {
        bike.coyoteTimer = Math.max(0, bike.coyoteTimer - dt);
        bike.airTime += dt;
        if (bike.airTime > maxAirtime) maxAirtime = bike.airTime;
        bike.yaw += steerInput * 0.9 * dt;
      }

      if (input.jumpHeld && (bike.grounded || bike.coyoteTimer > 0)) {
        bike.hopCharge = Math.min(1, bike.hopCharge + dt * 1.9);
        bike.wasCharging = true;
        bike.suspensionComp = Math.max(bike.suspensionComp, bike.hopCharge * 0.72);
        preloadPill.style.opacity = '1';
        preloadPill.textContent = `PRE-LOAD: ${Math.round(bike.hopCharge * 100)}%`;
      } else if (bike.wasCharging) {
        if (bike.grounded || bike.coyoteTimer > 0) triggerHop();
        bike.wasCharging = false;
        bike.hopCharge = 0;
        preloadPill.style.opacity = '0';
      }

      bike.pos.addScaledVector(bike.vel, dt);

      const cx = getTrailCenterX(bike.pos.z);
      if (bike.pos.x < cx - 20) { bike.pos.x = cx - 20; bike.vel.x = Math.max(0, bike.vel.x); }
      else if (bike.pos.x > cx + 20) { bike.pos.x = cx + 20; bike.vel.x = Math.min(0, bike.vel.x); }

      const groundY = getTerrainHeight(bike.pos.x, bike.pos.z);
      if (bike.pos.y <= groundY + 0.04) {
        bike.pos.y = groundY;
        if (bike.vel.y < 0) bike.vel.y = 0;
        bike.grounded = true;
        bike.airTime = 0;
      } else if (bike.pos.y > groundY + 0.42) {
        bike.grounded = false;
      }

      bike.suspensionComp = Math.max(0, bike.suspensionComp - preset.suspensionStiffness * 0.12 * dt);
      bike.leanAngle += (steerInput * 0.36 - bike.leanAngle) * Math.min(1, dt * 8);
      bike.whipAngle += (bike.whipTarget - bike.whipAngle) * Math.min(1, dt * 9);
      if (overdriveTimer > 0) overdriveTimer = Math.max(0, overdriveTimer - dt);

      // Scenic Zone Callouts
      for (let i = TRAIL_ZONES.length - 1; i >= 0; i--) {
        if (bike.pos.z <= TRAIL_ZONES[i].z) {
          if (i !== lastZoneIdx) {
            lastZoneIdx = i;
            showCallout(TRAIL_ZONES[i].name, '#38bdf8');
          }
          break;
        }
      }

      // Melodic Note Gates
      for (let i = 0; i < noteGates.length; i++) {
        const g = noteGates[i];
        if (g.hit) continue;
        if (Math.abs(bike.pos.z - g.z) < 2.5 && Math.abs(bike.pos.x - g.x) < 2.7) {
          g.hit = true;
          g.mesh.visible = false;
          audio.playGateNote(g.note.freq);
          addScore(200, true);
          showCallout(`♪ ${g.note.name} NOTE! +200`, g.note.hex);
        } else if (bike.pos.z < g.z - 4.0) {
          g.hit = true;
        }
      }

      // Melody Trail Challenges
      const bannerEl = document.getElementById('pp-melody-banner');
      const notesRowEl = document.getElementById('pp-melody-notes');
      let inMelodyZone = false;

      for (let i = 0; i < melodyChallenges.length; i++) {
        const mc = melodyChallenges[i];
        if (bike.pos.z <= mc.triggerZ && bike.pos.z >= mc.endZ && !mc.completed) {
          inMelodyZone = true;
          if (!mc.announced && notesRowEl && bannerEl) {
            mc.announced = true;
            notesRowEl.innerHTML = '';
            mc.seq.forEach((laneIdx, idx) => {
              const info = mc.rows[idx].orbs[laneIdx].info;
              const pill = document.createElement('div');
              pill.style.cssText = `width:28px; height:26px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:12px; color:#ffffff; text-shadow:0 1px 2px rgba(0,0,0,0.65); background:${info.hex};`;
              pill.textContent = `♪${info.label}`;
              notesRowEl.appendChild(pill);
              setTimeout(() => audio.playGateNote(info.freq), idx * 260);
            });
            bannerEl.style.display = 'flex';
          }

          mc.rows.forEach((row, rIdx) => {
            if (row.resolved) return;
            if (Math.abs(bike.pos.z - row.z) < 2.6) {
              row.resolved = true;
              let bestLane = 1;
              let bestDist = 999;
              row.orbs.forEach(o => {
                const d = Math.abs(bike.pos.x - o.x);
                if (d < bestDist) { bestDist = d; bestLane = o.lane; }
              });

              const pill = notesRowEl ? notesRowEl.children[rIdx] : null;
              if (bestLane === row.targetLane && bestDist < 2.4) {
                mc.hits++;
                const hitOrb = row.orbs[bestLane];
                hitOrb.mesh.visible = false;
                audio.playGateNote(hitOrb.info.freq);
                addScore(350, true);
                if (pill) pill.style.transform = 'scale(1.22)';
              } else {
                combo = 0;
                notesAttempted++;
                playErrorClackSound();
                if (pill) pill.style.opacity = '0.25';
              }

              if (rIdx === mc.rows.length - 1) {
                mc.completed = true;
                if (mc.hits === 4) {
                  addScore(1000, true);
                  showCallout('MELODY MASTERED! +1000', '#e879f9');
                } else {
                  showCallout(`MELODY ${mc.hits}/4`, '#38bdf8');
                }
                setTimeout(() => { if (bannerEl) bannerEl.style.display = 'none'; }, 1000);
              }
            }
          });
        }
      }
      if (!inMelodyZone && bannerEl && bannerEl.style.display !== 'none') {
        bannerEl.style.display = 'none';
      }

      const speedKmh = Math.round(Math.hypot(bike.vel.x, bike.vel.z) * 3.6);
      const rem = Math.max(0, Math.round(TRAIL_LENGTH + bike.pos.z));
      valSpeed.textContent = `${speedKmh} km/h`;
      valRem.textContent = `${rem}m`;

      if (bike.pos.z <= -TRAIL_LENGTH) {
        finishCourse();
        return;
      }
    }

    // Visual Bike & Camera Sync
    const preset = BIKE_PRESETS[selectedBikeKey];
    bikeRoot.position.copy(bike.pos);
    bikeRoot.rotation.set(0, bike.yaw, 0);

    const fwdX = -Math.sin(bike.yaw);
    const fwdZ = -Math.cos(bike.yaw);
    const hAhead = getTerrainHeight(bike.pos.x + fwdX * 1.1, bike.pos.z + fwdZ * 1.1);
    const hBehind = getTerrainHeight(bike.pos.x - fwdX * 1.1, bike.pos.z - fwdZ * 1.1);
    const slopePitch = Math.atan2(hAhead - hBehind, 2.2);
    const airPitch = Math.max(-0.45, Math.min(0.5, bike.vel.y * 0.032));
    bikeVisual.rotation.x += ((bike.grounded ? slopePitch : airPitch) - bikeVisual.rotation.x) * 0.18;
    bikeVisual.rotation.z = bike.leanAngle;
    bikeVisual.rotation.y = bike.whipAngle;

    const travel = bike.suspensionComp * preset.forkTravel;
    chassisGroup.position.y = -travel * 0.55;
    forkLowers.position.y = travel * 0.52;
    steerGroup.rotation.y = bike.steerAngle - bike.whipAngle * 0.55;

    const spd = Math.hypot(bike.vel.x, bike.vel.z);
    bike.wheelSpin += spd * dt * 2.75;
    frontWheel.rotation.x = -bike.wheelSpin;
    rearWheel.rotation.x = -bike.wheelSpin;

    // Spin and bob all 3D musical note icons
    for (let i = 0; i < floatingNotes.length; i++) {
      const fn = floatingNotes[i];
      if (fn.mesh && fn.mesh.visible) {
        fn.mesh.rotation.y = now * 0.0022 + fn.phase;
        fn.mesh.position.y = fn.baseY + Math.sin(now * 0.0035 + fn.phase) * 0.14;
      }
    }

    // Slowly drift Port Kembla cargo ships along the Pacific horizon
    for (let i = 0; i < cargoShips.length; i++) {
      const cs = cargoShips[i];
      cs.mesh.position.z += cs.speed * dt;
      if (cs.mesh.position.z > 200) cs.mesh.position.z = -2400;
      if (cs.mesh.position.z < -2500) cs.mesh.position.z = 100;
    }

    // Atmosphere Shift in Rainforest Gullies
    const rfNow = getRainforestBlend(bike.pos.z);
    scene.background.copy(colSkyCoastal).lerp(colSkyRainforest, rfNow * 0.72);
    scene.fog.color.copy(colFogCoastal).lerp(colFogRainforest, rfNow * 0.78);
    scene.fog.density = 0.00095 + (0.0042 - 0.00095) * rfNow;

    sunLight.position.set(bike.pos.x + 38, bike.pos.y + 72, bike.pos.z + 32);
    sunLight.target.position.copy(bike.pos);
    sunLight.target.updateMatrixWorld();

    if (!isPlaying) {
      const ang = now * 0.00035;
      camera.position.set(bike.pos.x + Math.sin(ang) * 4.6, bike.pos.y + 2.0, bike.pos.z + Math.cos(ang) * 4.6);
      camera.lookAt(bike.pos.x, bike.pos.y + 1.0, bike.pos.z - 0.5);
    } else if (isFirstPerson) {
      camera.position.set(bike.pos.x + fwdX * 0.25, bike.pos.y + 1.65, bike.pos.z + fwdZ * 0.25);
      camera.lookAt(bike.pos.x + fwdX * 14, bike.pos.y + 0.85, bike.pos.z + fwdZ * 14);
    } else {
      const camX = bike.pos.x + Math.sin(bike.yaw) * 5.6;
      const camZ = bike.pos.z + Math.cos(bike.yaw) * 5.6;
      const camGround = getTerrainHeight(camX, camZ);
      const targetY = Math.max(camGround + 0.8, bike.pos.y + 2.55);
      camera.position.lerp(new THREE.Vector3(camX, targetY, camZ), Math.min(1, dt * 9.5));
      camera.lookAt(bike.pos.x - Math.sin(bike.yaw) * 6, bike.pos.y + 1.15, bike.pos.z - Math.cos(bike.yaw) * 6);
    }

    renderer.render(scene, camera);
  }

  const onResize = () => {
    if (!containerEl || !renderer) return;
    const w = containerEl.clientWidth || initW;
    const h = containerEl.clientHeight || initH;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  activeController = {
    onPianoNoteDown,
    onPianoNoteUp,
    cleanup: () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('resize', onResize);
    }
  };

  if (autoStart) {
    startGame();
    if (statusEl) statusEl.textContent = '🚵‍♂️ Pedal Point Restarted! Carve down the Illawarra Escarpment!';
  } else {
    if (statusEl) statusEl.textContent = '🚵‍♂️ Pedal Point Ready! Play your calibrated Piano Keys to carve the trail!';
  }

  animFrameId = requestAnimationFrame(animate);
}

export {
  startPedalPoint,
  handlePedalPointInput,
  handlePedalPointRelease,
  stopPedalPoint
};
