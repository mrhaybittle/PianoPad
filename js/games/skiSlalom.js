// js/games/skiSlalom.js
import { initAudio, audioCtx } from '../audio.js';
import { getNoteFrequency } from '../musicTheory.js';

let animFrameId = null;
let containerEl = null;
let renderer = null;
let bridgeRef = null;

// Dynamic Three.js Loader (uses jsDelivr first, matching PianoPad's MIDI CDN)
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
// TRIAD DEFINITIONS & PITCH-CLASS CHORD MATCHER
// ============================================================================
const TRIAD_LIBRARY = [
  { symbol: 'C',  notesLabel: 'C - E - G',   pcs: [0, 4, 7] },
  { symbol: 'Dm', notesLabel: 'D - F - A',   pcs: [2, 5, 9] },
  { symbol: 'Em', notesLabel: 'E - G - B',   pcs: [4, 7, 11] },
  { symbol: 'F',  notesLabel: 'F - A - C',   pcs: [5, 9, 0] },
  { symbol: 'G',  notesLabel: 'G - B - D',   pcs: [7, 11, 2] },
  { symbol: 'Am', notesLabel: 'A - C - E',   pcs: [9, 0, 4] },
  { symbol: 'D',  notesLabel: 'D - F# - A',  pcs: [2, 6, 9] },
  { symbol: 'A',  notesLabel: 'A - C# - E',  pcs: [9, 1, 4] },
  { symbol: 'E',  notesLabel: 'E - G# - B',  pcs: [4, 8, 11] },
  { symbol: 'Gm', notesLabel: 'G - Bb - D',  pcs: [7, 10, 2] },
  { symbol: 'Bb', notesLabel: 'Bb - D - F',  pcs: [10, 2, 5] }
];

const NOTE_TO_PC = {
  'c': 0, 'b#': 0,
  'c#': 1, 'db': 1,
  'd': 2,
  'd#': 3, 'eb': 3,
  'e': 4, 'fb': 4,
  'f': 5, 'e#': 5,
  'f#': 6, 'gb': 6,
  'g': 7,
  'g#': 8, 'ab': 8,
  'a': 9,
  'a#': 10, 'bb': 10,
  'b': 11, 'cb': 11
};

function noteStringToPitchClass(noteStr) {
  if (!noteStr) return null;
  const match = String(noteStr).trim().toLowerCase().match(/^([a-g][#b]?)/);
  if (!match) return null;
  return NOTE_TO_PC[match[1]] !== undefined ? NOTE_TO_PC[match[1]] : null;
}

// ============================================================================
// 1. PROCEDURAL WEB AUDIO ENGINE (Wind, Carve, Rail Grind, Bear & FX)
// ============================================================================
class AlpineAudio {
  constructor() {
    this.ctx = null;
    this.windGain = null;
    this.carveGain = null;
    this.carveFilter = null;
    this.grindOsc = null;
    this.grindGain = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      initAudio();
      this.ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();

      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const windSource = this.ctx.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 320;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0;
      windSource.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);
      windSource.start();

      const carveSource = this.ctx.createBufferSource();
      carveSource.buffer = noiseBuffer;
      carveSource.loop = true;
      this.carveFilter = this.ctx.createBiquadFilter();
      this.carveFilter.type = 'bandpass';
      this.carveFilter.frequency.value = 1100;
      this.carveFilter.Q.value = 1.4;
      this.carveGain = this.ctx.createGain();
      this.carveGain.gain.value = 0.0;
      carveSource.connect(this.carveFilter);
      this.carveFilter.connect(this.carveGain);
      this.carveGain.connect(this.ctx.destination);
      carveSource.start();

      this.grindOsc = this.ctx.createOscillator();
      this.grindOsc.type = 'sawtooth';
      this.grindOsc.frequency.value = 290;
      const grindFilter = this.ctx.createBiquadFilter();
      grindFilter.type = 'bandpass';
      grindFilter.frequency.value = 1800;
      grindFilter.Q.value = 4.0;
      this.grindGain = this.ctx.createGain();
      this.grindGain.gain.value = 0.0;
      this.grindOsc.connect(grindFilter);
      grindFilter.connect(this.grindGain);
      this.grindGain.connect(this.ctx.destination);
      this.grindOsc.start();

      this.initialized = true;
    } catch (e) {}
  }

  updateContinuous(speedRatio, carveIntensity, isGrounded, isGrinding, isPlaying) {
    if (!this.initialized || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    if (!isPlaying) {
      this.windGain.gain.setTargetAtTime(0, now, 0.1);
      this.carveGain.gain.setTargetAtTime(0, now, 0.08);
      this.grindGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    this.windGain.gain.setTargetAtTime(0.02 + speedRatio * 0.06, now, 0.12);
    const targetCarve = (isGrounded && !isGrinding) ? Math.min(0.14, carveIntensity * 0.14) : 0.0;
    this.carveGain.gain.setTargetAtTime(targetCarve, now, 0.06);
    this.carveFilter.frequency.setTargetAtTime(850 + carveIntensity * 1200, now, 0.06);

    this.grindGain.gain.setTargetAtTime(isGrinding ? 0.12 : 0.0, now, 0.04);
    if (isGrinding) {
      this.grindOsc.frequency.setTargetAtTime(260 + speedRatio * 155, now, 0.05);
    }
  }

  playPianoFeedback(noteOrMidi = 60) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = this.ctx.currentTime;
    let freq = 261.63;
    if (typeof noteOrMidi === 'number') {
      freq = 440 * Math.pow(2, (noteOrMidi - 69) / 12);
    } else {
      freq = getNoteFrequency(noteOrMidi) || 261.63;
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  playTriadLockSound(pcs = [0, 4, 7]) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = this.ctx.currentTime;

    pcs.forEach((pc, idx) => {
      const midi = 60 + pc + (idx === 2 ? 12 : 0);
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);

      gain.gain.setValueAtTime(0.001, now + idx * 0.045);
      gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.045 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.48);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.5);
    });
  }

  playGateChime(streak) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const semitone = Math.min(14, streak % 12);
    const freq = 523.25 * Math.pow(2, semitone / 12);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.14);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  playPenaltyBuzz() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.setValueAtTime(110, now + 0.11);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  playJumpWhoosh() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.18);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  playBearGrowl() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(92, now);
    osc.frequency.exponentialRampToValueAtTime(54, now + 0.42);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  playTrickChime() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    [659.25, 880, 1174.66].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      gain.gain.setValueAtTime(0.12, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.26);
    });
  }

  playFinishFanfare() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.15, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.36);
    });
  }

  playCrash() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.35);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.39);
  }
}

// ============================================================================
// MODULE STATE & CONTROLLER HOOKS FOR PIANOPAD
// ============================================================================
let activeController = null;

export function stopSkiSlalom() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (activeController && activeController.cleanup) {
    activeController.cleanup();
  }
  activeController = null;

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  if (containerEl) {
    containerEl.remove();
    containerEl = null;
  }
}

export function handleSkiSlalomInput(noteStr, bridge) {
  if (activeController && activeController.onPianoNoteDown) {
    activeController.onPianoNoteDown(noteStr, bridge);
  }
}

export function handleSkiSlalomRelease(noteStr) {
  if (activeController && activeController.onPianoNoteUp) {
    activeController.onPianoNoteUp(noteStr);
  }
}

export async function startSkiSlalom(bridge, autoStart = false) {
  initAudio();
  stopSkiSlalom();
  bridgeRef = bridge;

  bridge.exitActiveMiniGame();
  document.getElementById('game-results-modal')?.classList.remove('open');
  document.getElementById('arcade-hub')?.classList.remove('open');

  bridge.setActiveMiniGame('skiSlalom');
  bridge.resetGameStats();

  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = '⛷️ Loading 3D Alpine Slalom...';

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
  containerEl.id = 'ski-slalom-3d-container';
  containerEl.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: ${initH}px;
    z-index: 25;
    overflow: hidden;
    background: #0f172a;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #f8fafc;
    user-select: none;
    -webkit-user-select: none;
  `;

  containerEl.innerHTML = `
    <style>
      #ski-slalom-3d-container * { box-sizing: border-box; }
      #ski-hud {
        position: absolute; top: 10px; left: 12px; right: 12px;
        display: flex; justify-content: space-between; align-items: flex-start;
        gap: 8px; pointer-events: none; z-index: 10;
      }
      #ski-slalom-3d-container .hud-group { display: flex; flex-wrap: wrap; gap: 8px; }
      #ski-slalom-3d-container .hud-pill {
        background: rgba(15, 23, 42, 0.78);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 10px; padding: 6px 11px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
        min-width: 72px;
      }
      #ski-slalom-3d-container .hud-label {
        font-size: 9px; font-weight: 800; letter-spacing: 0.08em;
        text-transform: uppercase; color: #94a3b8; margin-bottom: 1px;
      }
      #ski-slalom-3d-container .hud-value {
        font-size: 16px; font-weight: 900; font-variant-numeric: tabular-nums;
        color: #ffffff; line-height: 1.1;
      }
      #ski-hud-best .hud-value { color: #facc15; }
      #ski-hud-penalty .hud-value { color: #f87171; }
      #ski-hud-shield {
        display: none;
        border-color: #22c55e !important;
        background: rgba(6, 78, 59, 0.88) !important;
      }
      #ski-hud-shield .hud-value { color: #4ade80; font-size: 13px; }
      #ski-chord-prompt {
        position: absolute; top: 56px; left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.9);
        border: 2px solid #facc15;
        border-radius: 14px;
        padding: 6px 18px;
        display: none;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.5);
        z-index: 11;
        pointer-events: none;
      }
      #ski-chord-prompt.locked {
        border-color: #4ade80;
        background: rgba(6, 78, 59, 0.94);
      }
      #ski-chord-symbol {
        font-size: 28px;
        font-weight: 900;
        color: #facc15;
        line-height: 1;
      }
      #ski-chord-prompt.locked #ski-chord-symbol { color: #4ade80; }
      #ski-chord-notes {
        font-size: 13px;
        font-weight: 800;
        color: #f8fafc;
      }
      #ski-chord-sub {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #38bdf8;
      }
      #ski-slalom-3d-container .hud-actions { display: flex; gap: 8px; pointer-events: auto; }
      #ski-slalom-3d-container .hud-btn {
        background: rgba(15, 23, 42, 0.82); color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 10px; padding: 8px 12px;
        font-size: 12px; font-weight: 800; cursor: pointer;
      }
      #ski-slalom-3d-container .hud-btn:hover { background: rgba(30, 41, 59, 0.95); }
      #ski-callout {
        position: absolute; top: 34%; left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        font-size: 23px; font-weight: 900; letter-spacing: 0.04em;
        text-transform: uppercase; color: #facc15;
        text-shadow: 0 4px 16px rgba(15, 23, 42, 0.92);
        opacity: 0; pointer-events: none;
        transition: opacity 0.18s ease, transform 0.18s ease;
        z-index: 12; text-align: center; white-space: nowrap;
      }
      #ski-callout.show { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
      #ski-bottom-bar {
        position: absolute; bottom: 10px; left: 12px; right: 12px;
        display: flex; justify-content: space-between; align-items: flex-end;
        pointer-events: none; z-index: 10;
      }
      #ski-controls-caption {
        background: rgba(15, 23, 42, 0.72);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px; padding: 6px 10px;
        font-size: 11px; font-weight: 700; color: #cbd5e1;
      }
      #ski-touch-jump-btn {
        pointer-events: auto;
        background: linear-gradient(135deg, #38bdf8, #0284c7);
        color: #ffffff; border: 2px solid rgba(255, 255, 255, 0.4);
        border-radius: 10px; padding: 8px 14px;
        font-size: 12px; font-weight: 900; cursor: pointer;
      }
      #ski-overlay {
        position: absolute; inset: 0;
        background: radial-gradient(circle at center, rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.92));
        display: flex; align-items: center; justify-content: center;
        padding: 12px; z-index: 20;
      }
      #ski-slalom-3d-container .modal-card {
        background: rgba(30, 41, 59, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 16px; padding: 18px 22px;
        max-width: 460px; width: 100%; text-align: center;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.55);
      }
      #ski-slalom-3d-container .badge-tag {
        display: inline-block; background: rgba(56, 189, 248, 0.18);
        color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);
        font-size: 10px; font-weight: 800; letter-spacing: 0.1em;
        text-transform: uppercase; padding: 3px 10px;
        border-radius: 999px; margin-bottom: 6px;
      }
      #ski-slalom-3d-container .modal-card h1 {
        margin: 0 0 6px 0; font-size: 26px; font-weight: 900; color: #ffffff;
      }
      #ski-modal-subtitle {
        margin: 0 0 12px 0; font-size: 13px; color: #cbd5e1; line-height: 1.4;
      }
      #ski-slalom-3d-container .controls-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
        text-align: left; background: rgba(15, 23, 42, 0.65);
        border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;
        font-size: 12px; color: #e2e8f0;
      }
      #ski-slalom-3d-container .controls-grid span b { color: #38bdf8; }
      #ski-slalom-3d-container .modal-actions {
        display: flex;
        gap: 10px;
      }
      #btn-ski-modal-recalib {
        flex: 1;
        padding: 11px 14px;
        font-size: 13px;
        font-weight: 800;
        text-transform: uppercase;
        color: #e2e8f0;
        background: rgba(51, 65, 85, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 10px;
        cursor: pointer;
        white-space: nowrap;
      }
      #btn-ski-modal-recalib:hover {
        background: rgba(71, 85, 105, 0.95);
      }
      #btn-ski-play {
        flex: 1.4;
        padding: 11px 20px; font-size: 15px; font-weight: 900;
        text-transform: uppercase; color: #ffffff;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        border: none; border-radius: 10px; cursor: pointer;
      }
      #ski-calib-overlay {
        position: absolute; inset: 0;
        background: rgba(15, 23, 42, 0.9);
        display: none; align-items: center; justify-content: center;
        padding: 12px; z-index: 30;
      }
      #ski-slalom-3d-container .calib-card {
        background: rgba(30, 41, 59, 0.98);
        border: 2px solid #38bdf8; border-radius: 16px;
        padding: 18px 20px; max-width: 450px; width: 100%; text-align: center;
      }
      #ski-slalom-3d-container .calib-steps {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0;
      }
      #ski-slalom-3d-container .calib-slot {
        background: rgba(15, 23, 42, 0.75);
        border: 2px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px; padding: 8px;
      }
      #ski-slalom-3d-container .calib-slot.active {
        border-color: #facc15; background: rgba(250, 204, 21, 0.16);
      }
      #ski-slalom-3d-container .calib-slot.done {
        border-color: #22c55e; background: rgba(34, 197, 94, 0.16);
      }
      #ski-slalom-3d-container .calib-slot-title {
        font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8;
      }
      #ski-slalom-3d-container .calib-slot-key {
        font-size: 15px; font-weight: 900; color: #ffffff; margin-top: 2px;
      }
      #ski-calib-prompt {
        font-size: 14px; font-weight: 800; color: #facc15; margin-bottom: 8px;
      }
      #ski-slalom-3d-container .calib-footer { display: flex; gap: 8px; justify-content: center; }
      #ski-slalom-3d-container .calib-footer button {
        padding: 8px 14px; border-radius: 8px; border: none;
        font-weight: 800; font-size: 12px; cursor: pointer;
      }
      #btn-ski-calib-skip { background: #334155; color: #e2e8f0; }
      #btn-ski-calib-save { background: #22c55e; color: #052e16; }
    </style>

    <!-- Top HUD -->
    <div id="ski-hud">
      <div class="hud-group">
        <div class="hud-pill" id="ski-hud-time">
          <div class="hud-label">Run Time</div>
          <div class="hud-value" id="ski-val-time">0.00s</div>
        </div>
        <div class="hud-pill" id="ski-hud-penalty">
          <div class="hud-label">Penalties</div>
          <div class="hud-value" id="ski-val-penalty">+0.0s</div>
        </div>
        <div class="hud-pill" id="ski-hud-gates">
          <div class="hud-label">Gates</div>
          <div class="hud-value" id="ski-val-gates">0/30</div>
        </div>
        <div class="hud-pill" id="ski-hud-score">
          <div class="hud-label">Style Pts</div>
          <div class="hud-value" id="ski-val-score">0</div>
        </div>
        <div class="hud-pill" id="ski-hud-best">
          <div class="hud-label">Best Time</div>
          <div class="hud-value" id="ski-val-best">--</div>
        </div>
        <div class="hud-pill" id="ski-hud-shield">
          <div class="hud-label">Triad Bonus</div>
          <div class="hud-value">🛡️ GATE PASS</div>
        </div>
      </div>
      <div class="hud-actions">
        <button type="button" class="hud-btn" id="btn-ski-calibrate" title="Assign Piano or Keyboard Keys">🎹 Keys</button>
        <button type="button" class="hud-btn" id="btn-ski-cam-toggle" title="Toggle Camera">🎥 Chase Cam</button>
      </div>
    </div>

    <!-- Approaching Rail Triad Prompt -->
    <div id="ski-chord-prompt">
      <div id="ski-chord-symbol">C</div>
      <div>
        <div id="ski-chord-sub">🎹 Play Triad to Auto-Grind Rail</div>
        <div id="ski-chord-notes">C - E - G</div>
      </div>
    </div>

    <!-- Trick / Gate Callout Banner -->
    <div id="ski-callout">360° SPIN! +250</div>

    <!-- Bottom Controls Bar -->
    <div id="ski-bottom-bar">
      <div id="ski-controls-caption">
        <b>A / D</b> Carve • <b>Space</b> Jump • <b>Play Triad Chord</b> Auto-Grind Rail
      </div>
      <button type="button" id="ski-touch-jump-btn">⬆ JUMP / SPIN</button>
    </div>

    <!-- Start / Crash Overlay -->
    <div id="ski-overlay">
      <div class="modal-card">
        <div class="badge-tag" id="ski-modal-badge">Alpine Slalom 3D</div>
        <h1 id="ski-modal-title">SLOPELINE 3D</h1>
        <p id="ski-modal-subtitle">
          Race through 30 alternating red &amp; blue slalom gates! Play the <b>Triad Chord</b> shown above rails to auto-grind with <b>3x Style Points</b> &amp; earn a <b>Gate Forgiveness Bonus</b>!
        </p>

        <div class="controls-grid">
          <span><b id="ski-lbl-left">A / ←</b> Carve Left</span>
          <span><b id="ski-lbl-right">D / →</b> Carve Right</span>
          <span><b id="ski-lbl-jump">Space</b> Jump &amp; Spin</span>
          <span><b id="ski-lbl-view">V</b> Helmet / Chase Cam</span>
        </div>

        <div class="modal-actions">
          <button type="button" id="btn-ski-modal-recalib">🎹 Recalibrate Notes</button>
          <button type="button" id="btn-ski-play">Drop In</button>
        </div>
      </div>
    </div>

    <!-- Piano / Keyboard Calibration Modal -->
    <div id="ski-calib-overlay">
      <div class="calib-card">
        <div class="badge-tag">Piano &amp; Key Setup</div>
        <h2 style="margin:0 0 4px 0; font-size:20px; color:#fff;">Assign Your Controls</h2>
        <p style="margin:0 0 8px 0; font-size:12px; color:#cbd5e1;">
          Play a note on your <b>Piano Keyboard</b> or press a <b>Computer Key</b> for each action:
        </p>
        <div id="ski-calib-prompt">Step 1/4: Play key for CARVE LEFT</div>
        <div class="calib-steps">
          <div class="calib-slot active" id="ski-slot-left">
            <div class="calib-slot-title">1. Carve Left</div>
            <div class="calib-slot-key" id="ski-key-left">Listening...</div>
          </div>
          <div class="calib-slot" id="ski-slot-right">
            <div class="calib-slot-title">2. Carve Right</div>
            <div class="calib-slot-key" id="ski-key-right">--</div>
          </div>
          <div class="calib-slot" id="ski-slot-jump">
            <div class="calib-slot-title">3. Jump &amp; Spin</div>
            <div class="calib-slot-key" id="ski-key-jump">--</div>
          </div>
          <div class="calib-slot" id="ski-slot-view">
            <div class="calib-slot-title">4. Camera View</div>
            <div class="calib-slot-key" id="ski-key-view">--</div>
          </div>
        </div>
        <div class="calib-footer">
          <button type="button" id="btn-ski-calib-skip">Use Defaults (A/D/Space/V)</button>
          <button type="button" id="btn-ski-calib-save" style="display:none;">Done &amp; Save</button>
        </div>
      </div>
    </div>
  `;

  wrapperParent.style.position = 'relative';
  wrapperParent.appendChild(containerEl);

  const audio = new AlpineAudio();

  // ============================================================================
  // 2. THREE.JS SCENE, LIGHTING & ATMOSPHERIC ALPINE SKY
  // ============================================================================
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbae6fd);
  scene.fog = new THREE.FogExp2(0xdbeafe, 0.0068);

  const camera = new THREE.PerspectiveCamera(62, initW / initH, 0.1, 350);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(initW, initH);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  containerEl.insertBefore(renderer.domElement, containerEl.firstChild);

  // Keep bright white snow ground bounce so snow never shades blue like water
  const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0xf1f5f9, 0.92);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffbeb, 0.95);
  sunLight.position.set(35, 65, 25);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 180;
  const d = 45;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // ============================================================================
  // 3. PROCEDURAL ALPINE SNOW TERRAIN & DISTANT PEAKS (ORIGINAL SNOW LOOK)
  // ============================================================================
  const SLOPE_ANGLE = 0.24;
  const CHUNK_LENGTH = 70;
  const CHUNK_WIDTH = 96;
  const NUM_CHUNKS = 6;
  const terrainChunks = [];

  let terrainSeed = {
    phaseX: Math.random() * Math.PI * 2,
    phaseZ: Math.random() * Math.PI * 2
  };

  function randomizeTerrainSeed() {
    terrainSeed = {
      phaseX: Math.random() * Math.PI * 2,
      phaseZ: Math.random() * Math.PI * 2
    };
  }

  function getTerrainHeight(x, z) {
    const baseSlope = z * Math.tan(SLOPE_ANGLE);
    const mogul =
      Math.sin(x * 0.22 + terrainSeed.phaseX) *
      Math.cos(z * 0.14 + terrainSeed.phaseZ) *
      0.32;
    const bank = Math.pow(Math.max(0, Math.abs(x) - 18), 1.6) * 0.16;
    return baseSlope + mogul + bank;
  }

  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.02,
    flatShading: true
  });

  function createTerrainChunk() {
    const geo = new THREE.PlaneGeometry(CHUNK_WIDTH, CHUNK_LENGTH, 28, 20);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, snowMat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { mesh, geo, zStart: 0 };
  }

  function updateChunkGeometry(chunk, zStart) {
    chunk.zStart = zStart;
    const pos = chunk.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const localZ = pos.getZ(i);
      const worldZ = zStart + localZ - CHUNK_LENGTH * 0.5;
      pos.setY(i, getTerrainHeight(vx, worldZ));
    }
    pos.needsUpdate = true;
    chunk.geo.computeVertexNormals();
    chunk.mesh.position.set(0, 0, zStart - CHUNK_LENGTH * 0.5);
  }

  for (let i = 0; i < NUM_CHUNKS; i++) {
    const c = createTerrainChunk();
    updateChunkGeometry(c, -i * CHUNK_LENGTH);
    terrainChunks.push(c);
  }

  const mountainGroup = new THREE.Group();
  const peakMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, flatShading: true, roughness: 0.9 });
  const peakCapMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.6 });
  for (let i = 0; i < 14; i++) {
    const pGroup = new THREE.Group();
    const h = 38 + (i % 4) * 14;
    const r = 22 + (i % 3) * 8;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), peakMat);
    cone.position.y = h * 0.5;
    pGroup.add(cone);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.42, h * 0.42, 5), peakCapMat);
    cap.position.y = h * 0.79;
    pGroup.add(cap);

    pGroup.position.set((i - 6.5) * 26, -38, -220 - (i % 3) * 25);
    mountainGroup.add(pGroup);
  }
  scene.add(mountainGroup);

  // ============================================================================
  // 4. REALISTIC BALD SKIER (Black Polo, Red Collar, Grey Pants, Leather Shoes)
  // ============================================================================
  const skierRoot = new THREE.Group();
  const skierBodyGroup = new THREE.Group();
  skierRoot.add(skierBodyGroup);

  const skiTopMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.25, metalness: 0.35 });
  const skiEdgeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.8 });
  const bindingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.5 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.18, metalness: 0.45 });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0x3f2e21, roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.62, metalness: 0.05 });
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.3, metalness: 0.2 });
  const buckleMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.2, metalness: 0.85 });
  const poloMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.58, metalness: 0.04 });
  const collarMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.48 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.46, metalness: 0.02 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.75, roughness: 0.22 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 });

  [-0.24, 0.24].forEach((sx) => {
    const skiBase = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 2.25), skiEdgeMat);
    skiBase.position.set(sx, 0.015, 0);
    skierBodyGroup.add(skiBase);

    const skiBody = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.035, 2.22), skiTopMat);
    skiBody.position.set(sx, 0.038, 0);
    skiBody.castShadow = true;
    skierBodyGroup.add(skiBody);

    const tipCurve = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.34), skiTopMat);
    tipCurve.position.set(sx, 0.105, -1.22);
    tipCurve.rotation.x = 0.48;
    skierBodyGroup.add(tipCurve);

    const binding = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.44), bindingMat);
    binding.position.set(sx, 0.072, -0.02);
    skierBodyGroup.add(binding);

    const shoeSole = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.03, 0.36), soleMat);
    shoeSole.position.set(sx, 0.105, -0.03);
    skierBodyGroup.add(shoeSole);

    const shoeUpper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.095, 0.28), shoeMat);
    shoeUpper.position.set(sx, 0.155, 0.0);
    shoeUpper.castShadow = true;
    skierBodyGroup.add(shoeUpper);

    const shoeToe = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), shoeMat);
    shoeToe.scale.set(0.95, 0.65, 1.35);
    shoeToe.position.set(sx, 0.145, -0.14);
    shoeToe.castShadow = true;
    skierBodyGroup.add(shoeToe);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.088, 0.44, 14), pantsMat);
    shin.position.set(sx, 0.38, -0.03);
    shin.rotation.x = -0.22;
    shin.castShadow = true;
    skierBodyGroup.add(shin);

    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.106, 12, 10), pantsMat);
    knee.position.set(sx, 0.58, -0.08);
    skierBodyGroup.add(knee);

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.108, 0.44, 14), pantsMat);
    thigh.position.set(sx, 0.77, 0.01);
    thigh.rotation.x = 0.22;
    thigh.castShadow = true;
    skierBodyGroup.add(thigh);
  });

  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.20, 16), pantsMat);
  pelvis.scale.set(1.22, 1.0, 0.76);
  pelvis.position.set(0, 0.96, 0.05);
  pelvis.castShadow = true;
  skierBodyGroup.add(pelvis);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.045, 16), beltMat);
  belt.scale.set(1.22, 1.0, 0.77);
  belt.position.set(0, 1.04, 0.04);
  skierBodyGroup.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.052, 0.03), buckleMat);
  buckle.position.set(0, 1.04, -0.15);
  skierBodyGroup.add(buckle);

  const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.24, 0.32, 16), poloMat);
  abdomen.scale.set(1.24, 1.0, 0.76);
  abdomen.position.set(0, 1.18, 0.01);
  abdomen.rotation.x = -0.16;
  abdomen.castShadow = true;
  skierBodyGroup.add(abdomen);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.265, 0.34, 16), poloMat);
  chest.scale.set(1.26, 1.0, 0.78);
  chest.position.set(0, 1.44, -0.04);
  chest.rotation.x = -0.20;
  chest.castShadow = true;
  skierBodyGroup.add(chest);

  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.22, 0.025), poloMat);
  placket.position.set(0, 1.46, -0.265);
  placket.rotation.x = -0.20;
  skierBodyGroup.add(placket);

  [1.50, 1.43, 1.36].forEach((by, idx) => {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.015, 8), buckleMat);
    btn.rotation.x = Math.PI / 2 - 0.20;
    btn.position.set(0, by, -0.275 + idx * 0.014);
    skierBodyGroup.add(btn);
  });

  const collarBack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.195, 0.085, 16, 1, false, -Math.PI * 0.25, Math.PI * 1.5),
    collarMat
  );
  collarBack.position.set(0, 1.61, -0.08);
  collarBack.rotation.y = Math.PI * 0.5;
  collarBack.rotation.x = -0.18;
  skierBodyGroup.add(collarBack);

  [-0.065, 0.065].forEach((lx) => {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.028), collarMat);
    lapel.position.set(lx, 1.57, -0.235);
    lapel.rotation.set(-0.35, lx > 0 ? -0.35 : 0.35, lx > 0 ? -0.25 : 0.25);
    skierBodyGroup.add(lapel);
  });

  [-1, 1].forEach((side) => {
    const sx = side * 0.36;

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), poloMat);
    shoulder.position.set(sx, 1.53, -0.06);
    shoulder.castShadow = true;
    skierBodyGroup.add(shoulder);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.095, 0.22, 12), poloMat);
    sleeve.position.set(side * 0.41, 1.43, -0.11);
    sleeve.rotation.set(-0.48, 0, side * -0.18);
    sleeve.castShadow = true;
    skierBodyGroup.add(sleeve);

    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.012, 8, 14), poloMat);
    cuff.position.set(side * 0.43, 1.33, -0.16);
    cuff.rotation.set(Math.PI / 2 - 0.48, side * -0.18, 0);
    skierBodyGroup.add(cuff);

    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.074, 0.16, 12), skinMat);
    upperArm.position.set(side * 0.44, 1.30, -0.18);
    upperArm.rotation.set(-0.48, 0, side * -0.15);
    upperArm.castShadow = true;
    skierBodyGroup.add(upperArm);

    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), skinMat);
    elbow.position.set(side * 0.46, 1.23, -0.22);
    skierBodyGroup.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.056, 0.28, 12), skinMat);
    forearm.position.set(side * 0.44, 1.18, -0.35);
    forearm.rotation.set(-1.15, 0, side * 0.12);
    forearm.castShadow = true;
    skierBodyGroup.add(forearm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 10), skinMat);
    hand.scale.set(0.85, 0.95, 1.2);
    hand.position.set(side * 0.42, 1.13, -0.49);
    skierBodyGroup.add(hand);

    const poleGroup = new THREE.Group();
    poleGroup.position.set(side * 0.42, 1.13, -0.49);
    poleGroup.rotation.set(0.78, 0, side * 0.08);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.16, 10), gripMat);
    grip.position.y = 0.02;
    poleGroup.add(grip);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.010, 1.32, 8), poleMat);
    shaft.position.y = -0.66;
    poleGroup.add(shaft);

    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.012, 12), gripMat);
    basket.position.y = -1.24;
    poleGroup.add(basket);

    skierBodyGroup.add(poleGroup);
  });

  const headGroup = new THREE.Group();

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.16, 14), skinMat);
  neck.position.set(0, 1.65, -0.09);
  neck.rotation.x = -0.15;
  headGroup.add(neck);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 18), skinMat);
  cranium.scale.set(0.88, 1.12, 0.98);
  cranium.position.set(0, 1.84, -0.12);
  cranium.castShadow = true;
  headGroup.add(cranium);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 14), skinMat);
  jaw.scale.set(0.86, 1.05, 0.95);
  jaw.position.set(0, 1.75, -0.14);
  headGroup.add(jaw);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.085, 8), skinMat);
  nose.rotation.x = -Math.PI * 0.42;
  nose.position.set(0, 1.81, -0.32);
  headGroup.add(nose);

  [-0.185, 0.185].forEach((ex) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), skinMat);
    ear.scale.set(0.45, 1.15, 0.75);
    ear.position.set(ex, 1.82, -0.11);
    headGroup.add(ear);
  });

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.068, 0.04), lensMat);
  visor.position.set(0, 1.85, -0.305);
  headGroup.add(visor);

  [-0.165, 0.165].forEach((tx) => {
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.022, 0.21), gripMat);
    temple.position.set(tx, 1.855, -0.20);
    headGroup.add(temple);
  });

  skierBodyGroup.add(headGroup);
  scene.add(skierRoot);

  // ============================================================================
  // 5. WORLD OBJECTS: ALTERNATING SLALOM GATES, PINES, SCULPTED RAMPS, TRIAD RAILS & BEARS
  // ============================================================================
  const gates = [];
  const trees = [];
  const kickers = [];
  const rails = [];
  const bears = [];
  let finishBannerGroup = null;
  let bearMilestones = [];

  const TOTAL_GATES = 30;
  let gatesSpawnedCount = 0;
  let finishLineZ = -9999;

  let nextGateZ = -38;
  let nextTreeZ = -22;
  let nextKickerZ = -85;
  let nextRailZ = -62;
  let nextGateIsRed = true;
  let lastGateX = 0;

  const redPoleMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, flatShading: true });
  const bluePoleMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4, flatShading: true });
  const redBannerMat = new THREE.MeshStandardMaterial({ color: 0xf87171, side: THREE.DoubleSide, transparent: true, opacity: 0.88 });
  const blueBannerMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, side: THREE.DoubleSide, transparent: true, opacity: 0.88 });
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.7, 6);
  const bannerGeo = new THREE.PlaneGeometry(1.15, 0.65);

  function spawnGate(zPos) {
    if (gatesSpawnedCount >= TOTAL_GATES) return;
    gatesSpawnedCount++;

    const gateWidth = 6.5 + Math.random() * 1.9;
    const isRed = nextGateIsRed;
    const dir = isRed ? -1 : 1;

    // Strictly alternate Red (left) and Blue (right) on every single gate
    nextGateIsRed = !nextGateIsRed;

    const shift = 4.2 + Math.random() * 8.2;
    let centerX = lastGateX + dir * shift;
    if (centerX > 14.5) centerX = 14.5 - Math.random() * 2.5;
    if (centerX < -14.5) centerX = -14.5 + Math.random() * 2.5;
    lastGateX = centerX;

    const group = new THREE.Group();
    const poleMat = isRed ? redPoleMat : bluePoleMat;
    const bannerMat = isRed ? redBannerMat : blueBannerMat;

    [-gateWidth / 2, gateWidth / 2].forEach((px, idx) => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(px, 1.35, 0);
      pole.castShadow = true;
      group.add(pole);

      const flag = new THREE.Mesh(bannerGeo, bannerMat);
      flag.position.set(px + (idx === 0 ? -0.58 : 0.58), 2.15, 0);
      group.add(flag);
    });

    const groundY = getTerrainHeight(centerX, zPos);
    group.position.set(centerX, groundY, zPos);
    scene.add(group);

    gates.push({
      group,
      x: centerX,
      z: zPos,
      width: gateWidth,
      passed: false
    });

    if (gatesSpawnedCount === TOTAL_GATES) {
      finishLineZ = zPos - (24 + Math.random() * 10);
      spawnFinishBanner(finishLineZ);
    }
  }

  function spawnFinishBanner(zPos) {
    const group = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.3, roughness: 0.4 });
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0xef4444, side: THREE.DoubleSide });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    [-14, 14].forEach(px => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6.5, 8), postMat);
      post.position.set(px, 3.25, 0);
      group.add(post);
    });

    const topBanner = new THREE.Mesh(new THREE.BoxGeometry(28.5, 1.3, 0.25), bannerMat);
    topBanner.position.set(0, 6.0, 0);
    group.add(topBanner);

    const snowStripe = new THREE.Mesh(new THREE.BoxGeometry(28, 0.08, 0.6), lineMat);
    snowStripe.position.set(0, 0.05, 0);
    group.add(snowStripe);

    group.position.set(0, getTerrainHeight(0, zPos), zPos);
    scene.add(group);
    finishBannerGroup = group;
  }

  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.36, 1.6, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, flatShading: true });
  const foliageMat1 = new THREE.MeshStandardMaterial({ color: 0x15803d, flatShading: true });
  const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x166534, flatShading: true });
  const snowCapMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, flatShading: true });
  const coneBotGeo = new THREE.ConeGeometry(1.9, 2.8, 6);
  const coneMidGeo = new THREE.ConeGeometry(1.45, 2.4, 6);
  const coneTopGeo = new THREE.ConeGeometry(0.95, 1.9, 6);

  function spawnPineTree(xPos, zPos, scaleMult = 1.0) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.8;
    trunk.castShadow = true;
    tree.add(trunk);

    const bCone = new THREE.Mesh(coneBotGeo, foliageMat2);
    bCone.position.y = 2.4;
    bCone.castShadow = true;
    tree.add(bCone);

    const mCone = new THREE.Mesh(coneMidGeo, foliageMat1);
    mCone.position.y = 3.8;
    mCone.castShadow = true;
    tree.add(mCone);

    const tCone = new THREE.Mesh(coneTopGeo, snowCapMat);
    tCone.position.y = 5.0;
    tCone.castShadow = true;
    tree.add(tCone);

    const groundY = getTerrainHeight(xPos, zPos);
    tree.position.set(xPos, groundY - 0.15, zPos);
    tree.scale.setScalar(scaleMult);
    tree.rotation.y = Math.random() * Math.PI * 2;
    scene.add(tree);

    trees.push({
      mesh: tree,
      x: xPos,
      z: zPos,
      radius: 1.05 * scaleMult
    });
  }

  // Sculpted Curved Snow-Park Kickers
  const kickerSnowMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.72,
    metalness: 0.02
  });
  const kickerSideMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.8
  });
  const kickerLipMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.45
  });

  function spawnKicker(zPos) {
    const xPos = (Math.random() - 0.5) * 22;
    const collidesGate = gates.some(g => Math.abs(g.z - zPos) < 6 && Math.abs(g.x - xPos) < 5);
    if (collidesGate) return;

    const width = 4.2;
    const length = 5.4;
    const height = 1.25;
    const group = new THREE.Group();

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(length * 0.58, height * 0.14, length, height);
    shape.lineTo(length, 0);
    shape.closePath();

    const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: width,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.08,
      bevelThickness: 0.12
    });

    extrudeGeo.rotateY(Math.PI / 2);
    extrudeGeo.translate(-width / 2, 0, length / 2);
    extrudeGeo.computeVertexNormals();

    const wedgeMesh = new THREE.Mesh(extrudeGeo, [kickerSnowMat, kickerSideMat]);
    wedgeMesh.castShadow = true;
    wedgeMesh.receiveShadow = true;
    group.add(wedgeMesh);

    [-width * 0.52, width * 0.52].forEach((bx) => {
      const bermGeo = new THREE.CylinderGeometry(0.12, 0.42, length * 0.92, 8);
      bermGeo.rotateX(Math.PI / 2);
      const berm = new THREE.Mesh(bermGeo, kickerSideMat);
      berm.scale.set(1.2, 0.75, 1);
      berm.position.set(bx, 0.16, 0.1);
      berm.rotation.x = 0.18;
      group.add(berm);
    });

    const lipStrip = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.94, 0.04, 0.14),
      kickerLipMat
    );
    lipStrip.position.set(0, height + 0.05, -length / 2 + 0.08);
    group.add(lipStrip);

    [-width * 0.48, width * 0.48].forEach((wx) => {
      const wand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.65, 6),
        kickerLipMat
      );
      wand.position.set(wx, height + 0.25, -length / 2 + 0.05);
      wand.rotation.z = wx < 0 ? 0.15 : -0.15;
      group.add(wand);
    });

    const groundY = getTerrainHeight(xPos, zPos);
    group.position.set(xPos, groundY - 0.12, zPos);
    group.rotation.x = -SLOPE_ANGLE;
    scene.add(group);

    kickers.push({
      group,
      x: xPos,
      z: zPos,
      width,
      length,
      triggered: false
    });
  }

  // Large 3D Overhead Arch Sign Texture for Triad Grind Rails
  function createTriadSignTexture(triad, isUnlocked = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = isUnlocked ? '#064e3b' : '#0f172a';
    ctx.fillRect(12, 12, 488, 232);

    ctx.lineWidth = 14;
    ctx.strokeStyle = isUnlocked ? '#4ade80' : '#facc15';
    ctx.strokeRect(12, 12, 488, 232);

    ctx.font = '800 24px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isUnlocked ? '#86efac' : '#38bdf8';
    ctx.fillText(isUnlocked ? '⚡ TRIAD LOCKED! 3X GRIND' : '🎹 PLAY TRIAD CHORD', 256, 52);

    ctx.font = '900 108px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = isUnlocked ? '#4ade80' : '#facc15';
    ctx.fillText(triad.symbol, 256, 152);

    ctx.font = '800 34px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(triad.notesLabel, 256, 208);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  const railSteelMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.75, roughness: 0.22, flatShading: true });
  const railChargedMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.65,
    metalness: 0.85,
    roughness: 0.15
  });
  const archPostMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.4, roughness: 0.35 });

  function spawnGrindRail(zPos) {
    const xPos = (Math.random() - 0.5) * 18;
    const length = 13 + Math.random() * 10;
    const railHeight = 1.05;
    const group = new THREE.Group();

    const barGeo = new THREE.CylinderGeometry(0.13, 0.13, length, 10);
    barGeo.rotateX(Math.PI / 2);
    const barMesh = new THREE.Mesh(barGeo, railSteelMat);
    barMesh.position.set(0, railHeight, 0);
    barMesh.rotation.x = -SLOPE_ANGLE;
    barMesh.castShadow = true;
    group.add(barMesh);

    // Build a tall, unmistakable 3D overhead arch billboard right at the entry of the rail
    const triad = TRIAD_LIBRARY[Math.floor(Math.random() * TRIAD_LIBRARY.length)];
    const entryZ = length * 0.45;
    const archWidth = 5.2;
    const archTopY = 4.6;

    [-archWidth / 2, archWidth / 2].forEach(px => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, archTopY, 8), archPostMat);
      post.position.set(px, archTopY / 2, entryZ);
      post.castShadow = true;
      group.add(post);
    });

    const signTex = createTriadSignTexture(triad, false);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide });
    const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(archWidth, 2.5), signMat);
    signBoard.position.set(0, archTopY - 0.4, entryZ);
    group.add(signBoard);

    const groundY = getTerrainHeight(xPos, zPos);
    group.position.set(xPos, groundY, zPos);
    scene.add(group);

    rails.push({
      group,
      barMesh,
      signBoard,
      triad,
      x: xPos,
      z: zPos,
      length,
      height: railHeight,
      triadActivated: false,
      triadGrindCompleted: false
    });
  }

  // 3D Low-Poly Grizzly Bear that charges across the slope
  function spawnGrizzlyBear(zPos) {
    const dir = Math.random() > 0.5 ? 1 : -1;
    const startX = -dir * (23 + Math.random() * 6);
    const group = new THREE.Group();

    const furDarkMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85, flatShading: true });
    const furMidMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8, flatShading: true });
    const snoutMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7, flatShading: true });
    const noseMat = new THREE.MeshBasicMaterial({ color: 0x09090b });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 2.1), furDarkMat);
    body.position.set(0, 0.92, 0);
    body.castShadow = true;
    group.add(body);

    const hump = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.42, 0.95), furMidMat);
    hump.position.set(0, 1.48, 0.35);
    hump.castShadow = true;
    group.add(hump);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.74, 0.78), furMidMat);
    head.position.set(0, 1.18, 1.25);
    head.castShadow = true;
    group.add(head);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.40, 0.48), snoutMat);
    snout.position.set(0, 1.05, 1.72);
    group.add(snout);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.12), noseMat);
    nose.position.set(0, 1.18, 1.96);
    group.add(nose);

    [-0.32, 0.32].forEach(ex => {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.14), furDarkMat);
      ear.position.set(ex, 1.60, 1.15);
      group.add(ear);
    });

    const legs = [];
    const legCoords = [
      { x: -0.38, z:  0.68, phase: 0 },
      { x:  0.38, z:  0.68, phase: Math.PI },
      { x: -0.38, z: -0.68, phase: Math.PI },
      { x:  0.38, z: -0.68, phase: 0 }
    ];
    legCoords.forEach(lc => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.72, 0.34), furDarkMat);
      leg.position.set(lc.x, 0.36, lc.z);
      leg.castShadow = true;
      group.add(leg);
      legs.push({ mesh: leg, phase: lc.phase });
    });

    group.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    group.scale.setScalar(1.25);
    group.position.set(startX, getTerrainHeight(startX, zPos), zPos);
    scene.add(group);

    bears.push({
      group,
      legs,
      x: startX,
      z: zPos,
      vx: dir * (11.5 + Math.random() * 4.5),
      stride: Math.random() * Math.PI
    });

    audio.playBearGrowl();
    showCallout('🐻 GRIZZLY CROSSING!', '#f97316');
  }

  const particles = [];
  const particleGeo = new THREE.DodecahedronGeometry(0.14, 0);
  const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const cyanSparkMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

  function emitSnowSpray(x, y, z, vx, count = 2, sparkMode = 0) {
    for (let i = 0; i < count; i++) {
      let mat = particleMat;
      if (sparkMode === 1) mat = sparkMat;
      else if (sparkMode === 2) mat = (i % 2 === 0 ? sparkMat : cyanSparkMat);

      const mesh = new THREE.Mesh(particleGeo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.55,
        y + 0.15,
        z + (Math.random() - 0.5) * 0.55
      );
      scene.add(mesh);
      const spread = sparkMode === 2 ? 7.5 : (sparkMode === 1 ? 5.5 : 3.5);
      particles.push({
        mesh,
        vx: -vx * 0.35 + (Math.random() - 0.5) * spread,
        vy: (sparkMode === 2 ? 2.6 : 1.8) + Math.random() * 3.4,
        vz: 2.0 + Math.random() * 3.8,
        life: 1.0
      });
    }
  }

  // ============================================================================
  // 6. PIANO MIDI & KEYBOARD CALIBRATION + TRIAD CHORD LISTENER
  // ============================================================================
  const DEFAULT_BINDINGS = {
    left:  { type: 'key', code: 'KeyA', label: 'A / ←' },
    right: { type: 'key', code: 'KeyD', label: 'D / →' },
    jump:  { type: 'key', code: 'Space', label: 'Space' },
    view:  { type: 'key', code: 'KeyV', label: 'V' }
  };

  let bindings = JSON.parse(localStorage.getItem('slopeline_key_bindings') || 'null') || JSON.parse(JSON.stringify(DEFAULT_BINDINGS));

  function updateControlsLabels() {
    const lblLeft = document.getElementById('ski-lbl-left');
    const lblRight = document.getElementById('ski-lbl-right');
    const lblJump = document.getElementById('ski-lbl-jump');
    const lblView = document.getElementById('ski-lbl-view');
    const caption = document.getElementById('ski-controls-caption');

    if (lblLeft) lblLeft.textContent = bindings.left.label;
    if (lblRight) lblRight.textContent = bindings.right.label;
    if (lblJump) lblJump.textContent = bindings.jump.label;
    if (lblView) lblView.textContent = bindings.view.label;
    if (caption) {
      caption.innerHTML =
        `<b>${bindings.left.label}</b> Left • <b>${bindings.right.label}</b> Right • <b>${bindings.jump.label}</b> Jump • <b>Play Triad</b> Auto-Grind Rail`;
    }
  }
  updateControlsLabels();

  const calibOverlay = document.getElementById('ski-calib-overlay');
  const calibPrompt = document.getElementById('ski-calib-prompt');
  const btnCalibSave = document.getElementById('btn-ski-calib-save');
  const CALIB_ORDER = ['left', 'right', 'jump', 'view'];
  const CALIB_NAMES = {
    left: 'CARVE LEFT',
    right: 'CARVE RIGHT',
    jump: 'JUMP & SPIN',
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
      const el = document.getElementById(`ski-slot-${slot}`);
      const keyEl = document.getElementById(`ski-key-${slot}`);
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
    localStorage.setItem('slopeline_calibrated_seen', 'true');
    localStorage.setItem('slopeline_key_bindings', JSON.stringify(bindings));
    updateControlsLabels();
  }

  function recordCalibrationInput(bindingObj, feedbackNoteOrMidi = 60) {
    if (!isCalibrating || calibStepIndex >= CALIB_ORDER.length) return;
    const currentSlot = CALIB_ORDER[calibStepIndex];

    for (let i = 0; i < calibStepIndex; i++) {
      const prev = bindings[CALIB_ORDER[i]];
      if (prev.type === bindingObj.type && prev.code === bindingObj.code) {
        calibPrompt.textContent = `⚠️ Already used! Pick a different key for ${CALIB_NAMES[currentSlot]}`;
        audio.playPenaltyBuzz();
        return;
      }
    }

    bindings[currentSlot] = bindingObj;
    audio.playPianoFeedback(feedbackNoteOrMidi);

    const slotEl = document.getElementById(`ski-slot-${currentSlot}`);
    const keyEl = document.getElementById(`ski-key-${currentSlot}`);
    slotEl.classList.remove('active');
    slotEl.classList.add('done');
    keyEl.textContent = bindingObj.label;

    calibStepIndex++;
    if (calibStepIndex < CALIB_ORDER.length) {
      const nextSlot = CALIB_ORDER[calibStepIndex];
      document.getElementById(`ski-slot-${nextSlot}`).classList.add('active');
      document.getElementById(`ski-key-${nextSlot}`).textContent = 'Listening...';
      calibPrompt.textContent = `Step ${calibStepIndex + 1}/4: Play key for ${CALIB_NAMES[nextSlot]}`;
    } else {
      calibPrompt.textContent = '✅ All 4 controls calibrated!';
      btnCalibSave.style.display = 'inline-block';
    }
  }

  document.getElementById('btn-ski-calibrate').addEventListener('click', () => {
    openCalibrationModal();
    document.getElementById('btn-ski-calibrate').blur();
  });
  document.getElementById('btn-ski-modal-recalib').addEventListener('click', () => {
    openCalibrationModal();
    document.getElementById('btn-ski-modal-recalib').blur();
  });
  document.getElementById('btn-ski-calib-skip').addEventListener('click', () => {
    bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    closeCalibrationModal();
  });
  btnCalibSave.addEventListener('click', closeCalibrationModal);

  const hasSeenCalib = Boolean(localStorage.getItem('slopeline_calibrated_seen'));
  if (!hasSeenCalib && !autoStart) {
    openCalibrationModal();
  }

  let isPlaying = false;
  let isFirstPerson = false;
  let runTime = 0;
  let penaltyTime = 0;
  let gatesCleared = 0;
  let gatesMissed = 0;
  let score = 0;
  let bestTime = parseFloat(localStorage.getItem('slopeline_3d_best_time') || '0');
  let streak = 0;
  let forgiveNextGate = false;

  const heldPianoNotes = new Set();
  const recentPitchClasses = new Map();

  const state = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: -24,
    leanAngle: 0,
    grounded: true,
    isGrinding: false,
    isTriadGrinding: false,
    activeRail: null,
    targetRail: null,
    grindTime: 0,
    spinAngle: 0,
    isSpinning: false,
    spinAccumulated: 0
  };

  const input = {
    left: false,
    right: false,
    pianoLeftHoldUntil: 0,
    pianoRightHoldUntil: 0,
    pointerSteer: 0,
    pointerActive: false
  };

  const valTime = document.getElementById('ski-val-time');
  const valPenalty = document.getElementById('ski-val-penalty');
  const valGates = document.getElementById('ski-val-gates');
  const valScore = document.getElementById('ski-val-score');
  const valBest = document.getElementById('ski-val-best');
  const shieldPill = document.getElementById('ski-hud-shield');
  const chordPromptEl = document.getElementById('ski-chord-prompt');
  const chordSymbolEl = document.getElementById('ski-chord-symbol');
  const chordNotesEl = document.getElementById('ski-chord-notes');
  const chordSubEl = document.getElementById('ski-chord-sub');
  const calloutEl = document.getElementById('ski-callout');
  const overlayEl = document.getElementById('ski-overlay');
  const btnCamToggle = document.getElementById('btn-ski-cam-toggle');

  if (bestTime > 0) valBest.textContent = `${bestTime.toFixed(2)}s`;

  function updateShieldHUD() {
    if (!shieldPill) return;
    shieldPill.style.display = forgiveNextGate ? 'block' : 'none';
  }

  function updateApproachingChordHUD() {
    if (!chordPromptEl || !isPlaying) {
      if (chordPromptEl) chordPromptEl.style.display = 'none';
      return;
    }

    let upcomingRail = null;
    let closestDist = Infinity;
    for (const r of rails) {
      const railExitZ = r.z - r.length * 0.5;
      const distAhead = state.z - railExitZ;
      if (distAhead >= 0 && distAhead <= 78 && distAhead < closestDist) {
        closestDist = distAhead;
        upcomingRail = r;
      }
    }

    if (!upcomingRail) {
      chordPromptEl.style.display = 'none';
      return;
    }

    chordPromptEl.style.display = 'flex';
    chordSymbolEl.textContent = upcomingRail.triad.symbol;
    chordNotesEl.textContent = upcomingRail.triad.notesLabel;

    if (upcomingRail.triadActivated) {
      chordPromptEl.classList.add('locked');
      chordSubEl.textContent = '⚡ TRIAD LOCKED! 3X STYLE + GATE PASS';
    } else {
      chordPromptEl.classList.remove('locked');
      chordSubEl.textContent = '🎹 PLAY TRIAD CHORD TO GRIND RAIL';
    }
  }

  let calloutTimeout = null;
  function showCallout(text, color = '#facc15') {
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

  function triggerJumpOrSpin() {
    if (!isPlaying) return;
    if (state.grounded || state.isGrinding) {
      state.grounded = false;
      state.isGrinding = false;
      state.isTriadGrinding = false;
      state.activeRail = null;
      state.targetRail = null;
      state.vy = 9.5;
      state.isSpinning = true;
      state.spinAccumulated = 0;
      audio.playJumpWhoosh();
      emitSnowSpray(state.x, state.y, state.z, state.vx, 10);
    } else if (!state.isSpinning) {
      state.isSpinning = true;
      audio.playJumpWhoosh();
    }
  }

  function checkApproachingRailTriadMatch() {
    if (!isPlaying || isCalibrating) return;

    const now = performance.now();
    const activePcs = new Set();
    heldPianoNotes.forEach(n => {
      const pc = noteStringToPitchClass(n);
      if (pc !== null) activePcs.add(pc);
    });
    for (const [pc, expiresAt] of recentPitchClasses.entries()) {
      if (expiresAt > now) activePcs.add(pc);
      else recentPitchClasses.delete(pc);
    }

    if (activePcs.size < 3) return;

    let candidateRail = null;
    let closestDist = Infinity;
    for (const r of rails) {
      if (r.triadActivated) continue;
      const railEntryZ = r.z + r.length * 0.5;
      const distAhead = state.z - railEntryZ;
      if (distAhead >= -6 && distAhead <= 65 && distAhead < closestDist) {
        closestDist = distAhead;
        candidateRail = r;
      }
    }

    if (!candidateRail) return;

    const matched = candidateRail.triad.pcs.every(pc => activePcs.has(pc));
    if (!matched) return;

    candidateRail.triadActivated = true;
    candidateRail.barMesh.material = railChargedMat;

    if (candidateRail.signBoard.material.map) {
      candidateRail.signBoard.material.map.dispose();
    }
    candidateRail.signBoard.material.map = createTriadSignTexture(candidateRail.triad, true);
    candidateRail.signBoard.material.needsUpdate = true;

    state.targetRail = candidateRail;
    state.isTriadGrinding = true;
    input.pianoLeftHoldUntil = 0;
    input.pianoRightHoldUntil = 0;

    const targetRailY = getTerrainHeight(candidateRail.x, state.z) + candidateRail.height;
    if (state.y < targetRailY + 0.35) {
      state.grounded = false;
      state.vy = Math.max(state.vy, 6.2);
    }

    audio.playTriadLockSound(candidateRail.triad.pcs);
    showCallout(`🎸 ${candidateRail.triad.symbol} TRIAD LOCKED! 3X STYLE!`, '#4ade80');
    emitSnowSpray(state.x, state.y, state.z, state.vx, 18, 2);
  }

  function handleControlDown(type, code, displayLabel, feedbackNoteOrMidi = 60) {
    if (isCalibrating) {
      recordCalibrationInput({ type, code, label: displayLabel }, feedbackNoteOrMidi);
      return;
    }

    if (state.targetRail || state.isTriadGrinding) {
      return;
    }

    const match = (b) => b.type === type && b.code === code;

    if (match(bindings.left) || (type === 'key' && code === 'ArrowLeft')) {
      input.left = true;
      if (type === 'piano') {
        input.pianoLeftHoldUntil = performance.now() + 340;
        input.pianoRightHoldUntil = 0;
        state.vx = Math.min(state.vx, -9.5);
      }
    }
    if (match(bindings.right) || (type === 'key' && code === 'ArrowRight')) {
      input.right = true;
      if (type === 'piano') {
        input.pianoRightHoldUntil = performance.now() + 340;
        input.pianoLeftHoldUntil = 0;
        state.vx = Math.max(state.vx, 9.5);
      }
    }
    if (match(bindings.jump)) {
      if (!isPlaying && overlayEl.style.display !== 'none') {
        startGame();
      } else {
        triggerJumpOrSpin();
      }
    }
    if (match(bindings.view)) {
      toggleCameraMode();
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
  }

  function onPianoNoteDown(noteStr, bridge) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (!clean) return;
    const upperLabel = `🎹 ${clean.toUpperCase()}`;
    if (bridge) bridge.highlightKey(noteStr, 250, '#38bdf8');

    heldPianoNotes.add(clean);
    const pc = noteStringToPitchClass(clean);
    if (pc !== null) {
      recentPitchClasses.set(pc, performance.now() + 450);
    }

    checkApproachingRailTriadMatch();
    handleControlDown('piano', clean, upperLabel, clean);
  }

  function onPianoNoteUp(noteStr) {
    const clean = (noteStr || '').trim().toLowerCase();
    if (!clean) return;
    heldPianoNotes.delete(clean);
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
    if (pianoPadMappedKeys.includes(k)) {
      return;
    }

    const label = e.code === 'Space' ? 'Space' : (e.key.length === 1 ? e.key.toUpperCase() : e.code);
    const guessMidi = e.code === 'ArrowLeft' ? 60 : (e.code === 'ArrowRight' ? 64 : (e.code === 'Space' ? 67 : 72));
    handleControlDown('key', e.code, label, guessMidi);
  };

  const onKeyUp = (e) => {
    handleControlUp('key', e.code);
    if (!document.querySelector('#keyboard .key.active')) {
      input.left = false;
      input.right = false;
    }
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });

  const domCanvas = renderer.domElement;
  function updatePointerSteer(clientX) {
    const rect = domCanvas.getBoundingClientRect();
    const norm = ((clientX - rect.left) / rect.width) * 2 - 1;
    input.pointerSteer = Math.max(-1, Math.min(1, norm * 1.45));
  }

  const onPointerDown = (e) => {
    if (!isPlaying || isCalibrating) return;
    input.pointerActive = true;
    updatePointerSteer(e.clientX);
  };
  const onPointerMove = (e) => {
    if (!input.pointerActive || !isPlaying) return;
    updatePointerSteer(e.clientX);
  };
  const onPointerUp = () => {
    input.pointerActive = false;
    input.pointerSteer = 0;
    if (!document.querySelector('#keyboard .key.active')) {
      input.left = false;
      input.right = false;
    }
  };

  domCanvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  document.getElementById('ski-touch-jump-btn').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    triggerJumpOrSpin();
  });

  // ============================================================================
  // 7. START, FINISH, CRASH & WORLD RESET
  // ============================================================================
  function clearWorldEntities() {
    gates.forEach(g => scene.remove(g.group));
    trees.forEach(t => scene.remove(t.mesh));
    kickers.forEach(k => scene.remove(k.group));
    rails.forEach(r => {
      if (r.signBoard && r.signBoard.material.map) {
        r.signBoard.material.map.dispose();
      }
      scene.remove(r.group);
    });
    bears.forEach(b => scene.remove(b.group));
    particles.forEach(p => scene.remove(p.mesh));
    if (finishBannerGroup) {
      scene.remove(finishBannerGroup);
      finishBannerGroup = null;
    }
    gates.length = 0;
    trees.length = 0;
    kickers.length = 0;
    rails.length = 0;
    bears.length = 0;
    particles.length = 0;
  }

  function startGame() {
    audio.init();
    randomizeTerrainSeed();
    clearWorldEntities();

    runTime = 0;
    penaltyTime = 0;
    gatesCleared = 0;
    gatesMissed = 0;
    gatesSpawnedCount = 0;
    finishLineZ = -9999;
    forgiveNextGate = false;
    updateShieldHUD();
    if (chordPromptEl) chordPromptEl.style.display = 'none';

    heldPianoNotes.clear();
    recentPitchClasses.clear();

    bearMilestones = [-130 - Math.random() * 140];
    if (Math.random() < 0.65) {
      bearMilestones.push(-340 - Math.random() * 180);
    }

    score = 0;
    streak = 0;
    valTime.textContent = '0.00s';
    valPenalty.textContent = '+0.0s';
    valGates.textContent = `0/${TOTAL_GATES}`;
    valScore.textContent = '0';

    state.x = 0;
    state.z = 0;
    state.y = getTerrainHeight(0, 0);
    state.vx = 0;
    state.vy = 0;
    state.vz = -24;
    state.leanAngle = 0;
    state.grounded = true;
    state.isGrinding = false;
    state.isTriadGrinding = false;
    state.activeRail = null;
    state.targetRail = null;
    state.grindTime = 0;
    state.spinAngle = 0;
    state.isSpinning = false;
    state.spinAccumulated = 0;

    input.left = false;
    input.right = false;
    input.pianoLeftHoldUntil = 0;
    input.pianoRightHoldUntil = 0;

    nextGateZ = -32 - Math.random() * 10;
    nextTreeZ = -18;
    nextKickerZ = -65 - Math.random() * 45;
    nextRailZ = -52 - Math.random() * 25;
    nextGateIsRed = Math.random() < 0.5;
    lastGateX = (Math.random() - 0.5) * 10;

    for (let i = 0; i < NUM_CHUNKS; i++) {
      updateChunkGeometry(terrainChunks[i], -i * CHUNK_LENGTH);
    }

    while (nextGateZ > -280 && gatesSpawnedCount < TOTAL_GATES) {
      spawnGate(nextGateZ);
      nextGateZ -= 21 + Math.random() * 11;
    }
    while (nextTreeZ > -280) {
      spawnSideTrees(nextTreeZ);
      nextTreeZ -= 9 + Math.random() * 5;
    }
    while (nextKickerZ > -280) {
      spawnKicker(nextKickerZ);
      nextKickerZ -= 75 + Math.random() * 65;
    }
    while (nextRailZ > -280) {
      spawnGrindRail(nextRailZ);
      nextRailZ -= 64 + Math.random() * 45;
    }

    overlayEl.style.display = 'none';
    isPlaying = true;
  }

  function spawnSideTrees(zPos) {
    spawnPineTree(-20 - Math.random() * 9, zPos, 0.85 + Math.random() * 0.65);
    spawnPineTree(20 + Math.random() * 9, zPos, 0.85 + Math.random() * 0.65);

    if (Math.random() < 0.44 && zPos > finishLineZ + 12) {
      const rx = (Math.random() - 0.5) * 32;
      const nearGate = gates.some(g => Math.abs(g.z - zPos) < 10 && Math.abs(g.x - rx) < 6.4);
      const nearRail = rails.some(r => Math.abs(r.z - zPos) < r.length * 0.75 && Math.abs(r.x - rx) < 5.2);
      const nearKicker = kickers.some(k => Math.abs(k.z - zPos) < 8 && Math.abs(k.x - rx) < 4.5);
      if (!nearGate && !nearRail && !nearKicker) {
        spawnPineTree(rx, zPos, 0.75 + Math.random() * 0.5);
      }
    }
  }

  function finishSlalomCourse() {
    isPlaying = false;
    if (chordPromptEl) chordPromptEl.style.display = 'none';
    audio.playFinishFanfare();
    audio.updateContinuous(0, 0, false, false, false);

    const totalTime = parseFloat((runTime + penaltyTime).toFixed(2));
    if (bestTime === 0 || totalTime < bestTime) {
      bestTime = totalTime;
      localStorage.setItem('slopeline_3d_best_time', bestTime.toFixed(2));
      valBest.textContent = `${bestTime.toFixed(2)}s`;
    }

    const capturedCleared = gatesCleared;
    const capturedMissed = gatesMissed;
    const summaryHtml =
      `<span style="color:#22c55e; font-weight:900;">🏁 FINISH LINE!</span><br>` +
      `Total Time: <span style="color:#facc15; font-size:1.4rem; font-weight:900;">${totalTime.toFixed(2)}s</span> ` +
      `<span style="font-size:0.8rem; color:#94a3b8;">(${runTime.toFixed(2)}s + ${penaltyTime.toFixed(1)}s penalties)</span><br>` +
      `<span style="font-size:0.82rem; color:#38bdf8;">Gates: ${capturedCleared}/${TOTAL_GATES} • Style Pts: ${Math.floor(score)}</span>`;

    stopSkiSlalom();
    bridgeRef.finishCustomMiniGame(
      '3D Ski Slalom',
      totalTime,
      summaryHtml,
      () => startSkiSlalom(bridgeRef, true)
    );

    requestAnimationFrame(() => {
      const totalG = capturedCleared + capturedMissed;
      const greenPct = totalG > 0 ? (capturedCleared / totalG) * 100 : 100;
      const redPct = totalG > 0 ? (capturedMissed / totalG) * 100 : 0;
      const barGreen = document.getElementById('bar-green');
      const barOrange = document.getElementById('bar-orange');
      const barRed = document.getElementById('bar-red');
      if (barGreen) barGreen.style.height = `${greenPct}%`;
      if (barOrange) barOrange.style.height = '0%';
      if (barRed) barRed.style.height = `${redPct}%`;
    });
  }

  function crashGame(reason) {
    isPlaying = false;
    if (chordPromptEl) chordPromptEl.style.display = 'none';
    audio.playCrash();
    audio.updateContinuous(0, 0, false, false, false);
    emitSnowSpray(state.x, state.y, state.z, 0, 22);

    document.getElementById('ski-modal-badge').textContent = 'DNF — Wipeout';
    document.getElementById('ski-modal-title').textContent = reason;
    document.getElementById('ski-modal-subtitle').textContent = 'Watch out for pine trees and crossing bears on your next run!';
    document.getElementById('btn-ski-play').textContent = 'Try Again';
    overlayEl.style.display = 'flex';
  }

  document.getElementById('btn-ski-play').addEventListener('click', startGame);

  // ============================================================================
  // 8. MAIN SIMULATION & RENDER LOOP
  // ============================================================================
  let lastTime = performance.now();

  function animate(now) {
    if (!containerEl || !renderer) return;
    animFrameId = requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (isPlaying) {
      runTime += dt;
      updateApproachingChordHUD();

      while (bearMilestones.length > 0 && state.z <= bearMilestones[0]) {
        bearMilestones.shift();
        if (state.z - 54 > finishLineZ + 18) {
          spawnGrizzlyBear(state.z - (48 + Math.random() * 14));
        }
      }

      // 1. Horizontal Carving & Triad Magnetic Rail Homing Physics
      let steer = 0;
      if (input.left || now < input.pianoLeftHoldUntil) steer -= 1;
      if (input.right || now < input.pianoRightHoldUntil) steer += 1;
      if (input.pointerActive) steer = input.pointerSteer;

      if (state.targetRail && !state.isGrinding) {
        const tr = state.targetRail;
        const railEntryZ = tr.z + tr.length * 0.5;
        const railExitZ = tr.z - tr.length * 0.5;

        if (state.z < railExitZ) {
          state.targetRail = null;
          state.isTriadGrinding = false;
        } else {
          const dx = tr.x - state.x;
          const prevX = state.x;
          state.x += dx * Math.min(1, dt * 11);
          state.vx = (state.x - prevX) / Math.max(0.001, dt);

          if (state.z <= railEntryZ + 0.6 && Math.abs(dx) < 1.35) {
            state.x = tr.x;
            state.vx = 0;
            state.isGrinding = true;
            state.isTriadGrinding = true;
            state.activeRail = tr;
            state.targetRail = null;
            state.grindTime = 0;
            state.y = getTerrainHeight(tr.x, state.z) + tr.height;
            state.vy = 0;
            state.isSpinning = false;
            state.spinAngle = 0;
            audio.playTrickChime();
            emitSnowSpray(state.x, state.y, state.z, 0, 20, 2);
          }
        }
      } else if (state.isGrinding && state.activeRail) {
        state.x += (state.activeRail.x - state.x) * Math.min(1, dt * 22);
        state.vx = state.isTriadGrinding ? 0 : steer * 4.5;
        state.x += state.vx * dt;
      } else {
        const carveAccel = state.grounded ? 42 : 20;
        state.vx += steer * carveAccel * dt;
        state.vx *= Math.pow(state.grounded ? 0.14 : 0.45, dt);
        state.vx = Math.max(-19, Math.min(19, state.vx));
        state.x += state.vx * dt;
        state.x = Math.max(-21.5, Math.min(21.5, state.x));
      }

      const railBonus = state.isGrinding ? (state.isTriadGrinding ? 7.5 : 4.5) : 0;
      const targetSpeed = Math.min(46, 24 + streak * 0.35 + railBonus);
      state.vz += (-targetSpeed - state.vz) * Math.min(1, dt * 1.8);
      state.z += state.vz * dt;

      // 2. Terrain Elevation, Rail Grinding, Jump Kickers & Aerial Spins
      const groundY = getTerrainHeight(state.x, state.z);

      for (const k of kickers) {
        if (!k.triggered && Math.abs(state.z - k.z) < k.length * 0.5 && Math.abs(state.x - k.x) < k.width * 0.55) {
          k.triggered = true;
          state.grounded = false;
          state.isGrinding = false;
          state.isTriadGrinding = false;
          state.targetRail = null;
          state.vy = 14.2;
          state.isSpinning = true;
          state.spinAccumulated = 0;
          audio.playJumpWhoosh();
          showCallout('BIG AIR! SPINNING!', '#38bdf8');
          emitSnowSpray(state.x, state.y, state.z, state.vx, 14);
        }
      }

      if (state.isGrinding && state.activeRail) {
        const r = state.activeRail;
        const railSurfaceY = getTerrainHeight(r.x, state.z) + r.height;
        const stillOnZ = Math.abs(state.z - r.z) <= r.length * 0.52;
        const stillOnX = Math.abs(state.x - r.x) <= 0.85;

        if (stillOnZ && stillOnX) {
          state.y = railSurfaceY;
          state.vy = 0;
          state.grindTime += dt;

          const mult = state.isTriadGrinding ? 3 : 1;
          score += dt * 320 * mult;

          if (state.isTriadGrinding) {
            emitSnowSpray(state.x, state.y, state.z, state.vx, 4, 2);
          } else if (Math.random() < 0.85) {
            emitSnowSpray(state.x, state.y, state.z, state.vx, 2, 1);
          }
        } else {
          const wasTriad = state.isTriadGrinding;
          const completedRail = state.activeRail;

          state.isGrinding = false;
          state.isTriadGrinding = false;
          state.activeRail = null;
          state.grounded = false;
          state.vy = wasTriad ? 6.8 : 4.2;

          if (wasTriad) {
            state.isSpinning = true;
            state.spinAccumulated = 0;
            completedRail.triadGrindCompleted = true;

            const grindPts = Math.round(state.grindTime * 960) + 500;
            score += 500;
            forgiveNextGate = true;
            updateShieldHUD();

            audio.playTrickChime();
            emitSnowSpray(state.x, state.y, state.z, 0, 24, 2);
            showCallout(`⚡ ${completedRail.triad.symbol} TRIAD GRIND! +${grindPts} & GATE PASS!`, '#4ade80');
          } else {
            const grindPts = Math.round(state.grindTime * 300);
            if (grindPts > 40) {
              showCallout(`50-50 RAIL GRIND! +${grindPts}`, '#facc15');
            }
          }
          state.grindTime = 0;
        }
      } else if (!state.grounded) {
        state.vy -= 26 * dt;
        state.y += state.vy * dt;

        if (state.vy <= 0 && !state.targetRail) {
          for (const r of rails) {
            const railSurfaceY = getTerrainHeight(r.x, state.z) + r.height;
            if (
              Math.abs(state.z - r.z) <= r.length * 0.5 &&
              Math.abs(state.x - r.x) <= 0.78 &&
              Math.abs(state.y - railSurfaceY) <= 0.65
            ) {
              state.isGrinding = true;
              state.isTriadGrinding = r.triadActivated;
              state.activeRail = r;
              state.grindTime = 0;
              state.y = railSurfaceY;
              state.vy = 0;
              state.isSpinning = false;
              state.spinAngle = 0;
              audio.playTrickChime();
              showCallout(r.triadActivated ? `⚡ ${r.triad.symbol} TRIAD GRIND!` : 'RAIL GRIND!', r.triadActivated ? '#4ade80' : '#facc15');
              emitSnowSpray(state.x, state.y, state.z, state.vx, 12, r.triadActivated ? 2 : 1);
              break;
            }
          }
        }

        if (!state.isGrinding) {
          if (state.isSpinning) {
            const spinDelta = 10.5 * dt;
            state.spinAngle += spinDelta;
            state.spinAccumulated += spinDelta;

            if (state.spinAccumulated >= Math.PI * 2) {
              state.spinAccumulated -= Math.PI * 2;
              const trickBonus = 250;
              score += trickBonus;
              audio.playTrickChime();
              showCallout(`360° AERIAL SPIN! +${trickBonus}`, '#facc15');
            }
          }

          if (state.y <= groundY) {
            state.y = groundY;
            state.vy = 0;
            state.grounded = true;
            state.isSpinning = false;
            state.spinAngle = 0;
            emitSnowSpray(state.x, state.y, state.z, state.vx, 12);
          }
        }
      } else {
        state.y = groundY;
        state.spinAngle = 0;
      }

      // 3. Skier Visual Lean & Stylish Grind Stance
      const targetLean = state.isGrinding
        ? (state.isTriadGrinding ? Math.sin(runTime * 18) * 0.24 : Math.sin(runTime * 14) * 0.14)
        : -state.vx * 0.036;
      state.leanAngle += (targetLean - state.leanAngle) * Math.min(1, dt * 12);

      skierRoot.position.set(state.x, state.y, state.z);
      skierRoot.rotation.x = -SLOPE_ANGLE;
      skierBodyGroup.rotation.z = state.leanAngle;
      skierBodyGroup.rotation.y = state.isGrinding
        ? (state.isTriadGrinding ? Math.PI * 0.48 : Math.PI * 0.38)
        : (-state.vx * 0.022 + state.spinAngle);

      const carveIntensity = Math.min(1, Math.abs(state.vx) / 14);
      if (state.grounded && !state.isGrinding && carveIntensity > 0.16 && Math.random() < 0.75) {
        emitSnowSpray(state.x, state.y, state.z + 0.4, state.vx, 2);
      }

      const speedRatio = Math.min(1, (Math.abs(state.vz) - 20) / 24);
      audio.updateContinuous(speedRatio, carveIntensity, state.grounded, state.isGrinding, true);

      // Update Crossing Grizzly Bears
      for (let i = bears.length - 1; i >= 0; i--) {
        const b = bears[i];
        b.x += b.vx * dt;
        b.stride += dt * 16;
        const bearGroundY = getTerrainHeight(b.x, b.z);
        b.group.position.set(
          b.x,
          bearGroundY + Math.abs(Math.sin(b.stride)) * 0.14,
          b.z
        );
        b.group.rotation.x = -SLOPE_ANGLE;

        for (const l of b.legs) {
          l.mesh.rotation.x = Math.sin(b.stride + l.phase) * 0.65;
        }

        if (Math.random() < 0.45) {
          emitSnowSpray(b.x, bearGroundY, b.z, b.vx, 1);
        }

        const horizDist = Math.hypot(state.x - b.x, state.z - b.z);
        if (horizDist < 1.55 && (state.y - bearGroundY) < 1.85) {
          crashGame('RAN INTO A GRIZZLY BEAR!');
          break;
        } else if (b.z > state.z + 25 || Math.abs(b.x) > 38) {
          scene.remove(b.group);
          bears.splice(i, 1);
        }
      }

      // 4. Recycle Infinite Terrain Chunks & Spawn Ahead up to Finish Line
      for (const chunk of terrainChunks) {
        if (chunk.zStart - CHUNK_LENGTH * 0.6 > state.z + 30) {
          const minZ = Math.min(...terrainChunks.map(c => c.zStart));
          updateChunkGeometry(chunk, minZ - CHUNK_LENGTH);
        }
      }

      while (nextGateZ > state.z - 280 && gatesSpawnedCount < TOTAL_GATES) {
        spawnGate(nextGateZ);
        nextGateZ -= 21 + Math.random() * 11;
      }
      while (nextTreeZ > state.z - 280) {
        spawnSideTrees(nextTreeZ);
        nextTreeZ -= 9 + Math.random() * 5;
      }
      while (nextKickerZ > state.z - 280 && nextKickerZ > finishLineZ + 20) {
        spawnKicker(nextKickerZ);
        nextKickerZ -= 75 + Math.random() * 65;
      }
      while (nextRailZ > state.z - 280 && nextRailZ > finishLineZ + 20) {
        spawnGrindRail(nextRailZ);
        nextRailZ -= 64 + Math.random() * 45;
      }

      // 5. Gate Slalom Checks (+ Triad Rail Grind Forgiveness Bonus!)
      for (let i = gates.length - 1; i >= 0; i--) {
        const g = gates[i];
        if (!g.passed && state.z <= g.z) {
          g.passed = true;
          const halfW = g.width * 0.56;
          if (Math.abs(state.x - g.x) <= halfW) {
            gatesCleared++;
            streak++;
            const gatePts = 100 + streak * 15;
            score += gatePts;
            audio.playGateChime(streak);
            if (streak % 5 === 0) {
              showCallout(`${streak}x GATE STREAK! +${gatePts}`, '#38bdf8');
            }
          } else if (forgiveNextGate) {
            forgiveNextGate = false;
            updateShieldHUD();
            gatesCleared++;
            streak++;
            const bonusPts = 150 + streak * 15;
            score += bonusPts;
            audio.playGateChime(streak + 2);
            emitSnowSpray(state.x, state.y, state.z, 0, 16, 2);
            showCallout(`✨ TRIAD RAIL GRIND BONUS! GATE CLEARED +${bonusPts}`, '#4ade80');
          } else {
            gatesMissed++;
            streak = 0;
            penaltyTime += 3.0;
            audio.playPenaltyBuzz();
            showCallout('MISSED GATE! +3.0s PENALTY', '#ef4444');
          }
        }
        if (g.z > state.z + 25) {
          scene.remove(g.group);
          gates.splice(i, 1);
        }
      }

      if (gatesSpawnedCount >= TOTAL_GATES && state.z <= finishLineZ) {
        finishSlalomCourse();
        return;
      }

      // 6. Pine Tree Collision Checks
      for (let i = trees.length - 1; i >= 0; i--) {
        const t = trees[i];
        const dx = state.x - t.x;
        const dz = state.z - t.z;
        const horizDist = Math.hypot(dx, dz);
        const heightAboveGround = state.y - groundY;

        if (!state.targetRail && !state.isTriadGrinding && horizDist < t.radius + 0.35 && heightAboveGround < 3.6) {
          crashGame('CRASHED INTO A PINE!');
          break;
        }
        if (t.z > state.z + 25) {
          scene.remove(t.mesh);
          trees.splice(i, 1);
        }
      }

      for (let i = kickers.length - 1; i >= 0; i--) {
        if (kickers[i].z > state.z + 25) {
          scene.remove(kickers[i].group);
          kickers.splice(i, 1);
        }
      }
      for (let i = rails.length - 1; i >= 0; i--) {
        if (rails[i].z - rails[i].length > state.z + 25) {
          if (rails[i].signBoard && rails[i].signBoard.material.map) {
            rails[i].signBoard.material.map.dispose();
          }
          scene.remove(rails[i].group);
          rails.splice(i, 1);
        }
      }

      valTime.textContent = `${(runTime + penaltyTime).toFixed(2)}s`;
      valPenalty.textContent = `+${penaltyTime.toFixed(1)}s`;
      valGates.textContent = `${gatesCleared}/${TOTAL_GATES}`;
      valScore.textContent = Math.floor(score);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy -= 14 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.life -= dt * 2.2;
      p.mesh.scale.setScalar(Math.max(0.01, p.life));
      if (p.life <= 0) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
      }
    }

    mountainGroup.position.set(state.x * 0.4, state.y, state.z);
    sunLight.position.set(state.x + 35, state.y + 65, state.z + 25);
    sunLight.target.position.set(state.x, state.y, state.z - 15);
    sunLight.target.updateMatrixWorld();

    if (isFirstPerson) {
      camera.position.set(
        state.x + state.leanAngle * 0.4,
        state.y + 1.85,
        state.z - 0.35
      );
      camera.lookAt(
        state.x + state.vx * 0.25,
        state.y + 0.2 - Math.tan(SLOPE_ANGLE) * 14,
        state.z - 14
      );
    } else {
      const desiredCamX = state.x * 0.85;
      const desiredCamY = state.y + 5.2;
      const desiredCamZ = state.z + 10.5;
      camera.position.x += (desiredCamX - camera.position.x) * Math.min(1, dt * 8);
      camera.position.y += (desiredCamY - camera.position.y) * Math.min(1, dt * 8);
      camera.position.z = desiredCamZ;
      camera.lookAt(state.x * 0.9, state.y + 1.2 - Math.tan(SLOPE_ANGLE) * 8, state.z - 12);
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
      audio.updateContinuous(0, 0, false, false, false);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);
    }
  };

  if (autoStart) {
    startGame();
    if (statusEl) {
      statusEl.textContent = '⛷️ 3D Ski Slalom Restarted! Carve through all 30 gates!';
    }
  } else {
    if (statusEl) {
      statusEl.textContent = '⛷️ 3D Ski Slalom Ready! Play your calibrated Piano Keys to carve across the mountain!';
    }
    state.y = getTerrainHeight(0, 0);
    skierRoot.position.set(0, state.y, 0);
    skierRoot.rotation.x = -SLOPE_ANGLE;
  }

  animFrameId = requestAnimationFrame(animate);
}
