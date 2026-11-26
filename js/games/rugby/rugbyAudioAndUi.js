// js/games/rugby/rugbyAudioAndUi.js
import { audioCtx } from '../../audio.js';

export function ensureSportsFonts() {
  if (document.getElementById('erc-sports-fonts')) return;
  const link = document.createElement('link');
  link.id = 'erc-sports-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,600;0,700;1,700&family=Inter:wght@500;600;700;800&display=swap';
  document.head.appendChild(link);
}

function getCtx() {
  if (!audioCtx) return null;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function playPassSound() {
  try {
    const c = getCtx();
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

export function playTryFanfare(isHomeTry) {
  try {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const notes = isHomeTry
      ? [523.25, 659.25, 783.99, 1046.50]
      : [392.00, 349.23, 311.13, 261.63];

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.09;
      const dur = idx === notes.length - 1 ? 0.55 : 0.22;
      const osc = c.createOscillator();
      const osc2 = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc2.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      osc2.frequency.setValueAtTime(freq * 0.5, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(c.destination);
      osc.start(start);
      osc2.start(start);
      osc.stop(start + dur + 0.02);
      osc2.stop(start + dur + 0.02);
    });
  } catch (e) {}
}

export function playConversionKickSound(madeGoal) {
  try {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = madeGoal ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(madeGoal ? 330 : 180, now);
    osc.frequency.exponentialRampToValueAtTime(madeGoal ? 660 : 70, now + 0.28);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.31);
  } catch (e) {}
}

export function playRefWhistle(style = 'short') {
  try {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const totalDur = style === 'long' ? 0.62 : 0.34;

    const oscA = c.createOscillator();
    const oscB = c.createOscillator();
    const trillLfo = c.createOscillator();
    const trillDepth = c.createGain();
    const masterGain = c.createGain();

    oscA.type = 'sine';
    oscB.type = 'triangle';
    oscA.frequency.setValueAtTime(2840, now);
    oscB.frequency.setValueAtTime(2915, now);

    trillLfo.type = 'sine';
    trillLfo.frequency.setValueAtTime(36, now);
    trillDepth.gain.setValueAtTime(0.14, now);

    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.34, now + 0.015);
    masterGain.gain.setValueAtTime(0.32, now + totalDur - 0.08);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + totalDur);

    trillLfo.connect(trillDepth);
    trillDepth.connect(masterGain.gain);

    oscA.connect(masterGain);
    oscB.connect(masterGain);
    masterGain.connect(c.destination);

    trillLfo.start(now);
    oscA.start(now);
    oscB.start(now);
    trillLfo.stop(now + totalDur + 0.02);
    oscA.stop(now + totalDur + 0.02);
    oscB.stop(now + totalDur + 0.02);
  } catch (e) {}
}

export function playKickSound(kind) {
  try {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(kind === 'bomb' || kind === 'kickoff' ? 190 : 145, now);
    osc.frequency.exponentialRampToValueAtTime(kind === 'bomb' || kind === 'kickoff' ? 75 : 52, now + 0.2);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  } catch (e) {}
}

export function playTackleHitSound() {
  try {
    const c = getCtx();
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

export function buildRugbyMarkup() {
  return `
    <style>
      #erc-rugby-container * { box-sizing: border-box; user-select: none; -webkit-user-select: none; }
      #erc-rugby-container .font-sports { font-family: 'Chakra Petch', sans-serif; }
      #erc-rugby-container .sports-btn {
        transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 140ms ease, background-color 140ms ease;
        box-shadow: 0 4px 0 rgba(2, 6, 23, 0.72), 0 8px 16px rgba(0, 0, 0, 0.35);
        cursor: pointer;
      }
      #erc-rugby-container .sports-btn:hover { transform: translateY(-2px); }
      #erc-rugby-container .sports-btn:active { transform: translateY(2px); }
      #erc-rugby-container .erc-logo-badge {
        transform: skewX(-14deg); border: 2.5px solid #ffffff;
        background: linear-gradient(90deg, #dc2626 0%, #ffffff 50%, #1d4ed8 100%);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55); border-radius: 6px; padding: 3px 12px;
        overflow: hidden; display: inline-flex; align-items: center;
      }
      #erc-rugby-container .erc-logo-inner { transform: skewX(14deg); display: flex; align-items: baseline; gap: 5px; }
      #erc-rugby-container .pokie-window {
        background: linear-gradient(180deg, #090d16 0%, #162033 22%, #1e2b45 50%, #162033 78%, #090d16 100%);
        box-shadow: inset 0 8px 14px rgba(0, 0, 0, 0.85), inset 0 -8px 14px rgba(0, 0, 0, 0.85), 0 0 0 2px rgba(251, 191, 36, 0.35);
        position: relative; height: 58px; border-radius: 10px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 0 12px; text-align: center; overflow: hidden;
      }
      #erc-game-canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
      #erc-gameplay-hud {
        position: absolute; top: 10px; right: 12px; z-index: 20;
        display: none; flex-direction: column; align-items: flex-end; gap: 6px; pointer-events: none;
      }
      #erc-scoreboard {
        border-radius: 12px; background: rgba(2, 6, 23, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.15); backdrop-filter: blur(8px);
        padding: 7px 12px; display: flex; align-items: center; gap: 12px;
      }
      #erc-key-legend {
        position: absolute; bottom: 8px; left: 10px; z-index: 20; display: none; pointer-events: none;
        border-radius: 10px; background: rgba(2, 6, 23, 0.88); border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 6px 10px; font-size: 10.5px; max-width: calc(100% - 210px);
      }
      #erc-piano-strip {
        position: absolute; bottom: 8px; right: 10px; z-index: 20; display: none;
        border-radius: 10px; background: rgba(2, 6, 23, 0.9); border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 5px; gap: 4px;
      }
      #erc-piano-strip .piano-key-btn {
        width: 30px; height: 38px; border-radius: 6px; background: #ffffff; color: #020617;
        border: none; border-bottom: 3px solid #cbd5e1; font-weight: 800; font-size: 12px;
        display: flex; align-items: flex-end; justify-content: center; padding-bottom: 4px; cursor: pointer;
      }
      #erc-piano-strip .piano-key-btn.active-note { background: #fde047; transform: scale(0.94); }
      #erc-coin-toss-bar {
        position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 25;
        display: none; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px;
        padding: 8px 14px; border-radius: 12px;
        background: rgba(2, 6, 23, 0.92); border: 1px solid rgba(250, 204, 21, 0.45);
        backdrop-filter: blur(8px); max-width: 94%;
      }
      .erc-toss-choice-btn {
        border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 7px;
        background: rgba(30, 41, 59, 0.9); color: #f8fafc;
        font-weight: 800; font-size: 11px; padding: 5px 11px; text-transform: uppercase;
      }
      .erc-toss-choice-btn.active-choice {
        background: #f59e0b; color: #020617; border-color: #fde047;
      }
      #erc-kick3d-hud {
        position: absolute; bottom: 56px; left: 50%; transform: translateX(-50%); z-index: 22;
        display: none; flex-direction: column; align-items: center; gap: 4px; pointer-events: none;
        padding: 6px 12px; border-radius: 10px;
        background: rgba(2, 6, 23, 0.9); border: 1px solid rgba(56, 189, 248, 0.45);
        min-width: 240px;
      }
      .erc-power-track {
        width: 210px; height: 12px; border-radius: 999px;
        background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(255, 255, 255, 0.22);
        overflow: hidden;
      }
      #erc-kick3d-power-fill {
        height: 100%; width: 45%;
        background: linear-gradient(90deg, #22c55e, #eab308, #ef4444);
      }
      #erc-start-modal {
        position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
        padding: 8px; background: rgba(2, 6, 23, 0.86); backdrop-filter: blur(8px); overflow-y: auto;
      }
      .erc-modal-card {
        width: 100%; max-width: 850px; max-height: 97%; overflow-y: auto; border-radius: 16px;
        background: rgba(15, 23, 42, 0.97); border: 1px solid rgba(255, 255, 255, 0.16); padding: 12px 16px;
      }
      .erc-mp-bar {
        margin-top: 8px; padding: 8px 11px; border-radius: 12px;
        background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.35);
        display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
      }
      .erc-mp-mode-btn {
        border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 7px;
        background: rgba(30, 41, 59, 0.9); color: #f8fafc;
        font-weight: 800; font-size: 10.5px; padding: 5px 10px; text-transform: uppercase;
      }
      .erc-mp-mode-btn.active-mp {
        background: #0284c7; color: #ffffff; border-color: #7dd3fc;
      }
      .erc-setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
      .erc-bind-grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 6px; }
      @media (max-width: 720px) {
        .erc-setup-grid { grid-template-columns: 1fr; }
        .erc-bind-grid-5 { grid-template-columns: repeat(2, 1fr); }
      }
      .erc-panel {
        border-radius: 12px; background: rgba(2, 6, 23, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.1); padding: 9px 11px;
      }
      .erc-key-btn {
        width: 100%; border-radius: 7px; padding: 6px 5px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; font-size: 10.5px;
      }
      .erc-key-btn.listening { outline: 2px solid #fcd34d; background: rgba(251, 191, 36, 0.28) !important; }
      .wolfhound-squad-strip {
        display: none;
        margin-top: 7px;
        padding: 6px 8px;
        border-radius: 8px;
        background: rgba(15, 118, 110, 0.18);
        border: 1px solid rgba(45, 212, 191, 0.35);
      }
      .wolfhound-faces-row {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 6px;
        margin-top: 4px;
      }
      .wolfhound-face-card {
        background: rgba(2, 6, 23, 0.78);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 6px;
        padding: 4px 2px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .wolfhound-face-card canvas {
        width: 36px;
        height: 36px;
        image-rendering: pixelated;
        border-radius: 4px;
      }
    </style>

    <canvas id="erc-game-canvas"></canvas>

    <div id="erc-coin-toss-bar">
      <span class="font-sports" style="font-size:11px; font-weight:800; color:#fde047; text-transform:uppercase;">🪙 Coin Toss:</span>
      <button type="button" id="erc-toss-heads-btn" class="sports-btn erc-toss-choice-btn active-choice">Heads</button>
      <button type="button" id="erc-toss-tails-btn" class="sports-btn erc-toss-choice-btn">Tails</button>
      <span id="erc-toss-status" style="font-size:11px; color:#e2e8f0; font-weight:600;">Choose Heads or Tails</span>
      <button type="button" id="erc-toss-proceed-btn" class="sports-btn font-sports" disabled style="opacity:0.45; border:none; border-radius:7px; background:#22c55e; color:#020617; font-weight:800; font-size:10.5px; text-transform:uppercase; padding:5px 10px;">Proceed to Kickoff</button>
    </div>

    <div id="erc-kick3d-hud">
      <div style="display:flex; justify-content:space-between; width:100%; font-size:10.5px; font-weight:800; color:#fde047;">
        <span>3D KICK POWER: <span id="erc-kick3d-power-pct">45%</span></span>
        <span id="erc-kick3d-curve-label" style="color:#7dd3fc;">CURVE: CENTER</span>
      </div>
      <div class="erc-power-track">
        <div id="erc-kick3d-power-fill"></div>
      </div>
    </div>

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

    <div id="erc-key-legend">
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
        <span><b style="color:#fde047;">Pass/Switch (MIDI):</b> <span style="padding:1px 5px; border-radius:4px; background:rgba(255,255,255,0.12); color:#fef08a; font-family:monospace; font-weight:800;">C D E F G</span></span>
        <span><b style="color:#c4b5fd;">Left/Curve:</b> <span id="erc-leg-left" style="font-family:monospace; font-weight:800; color:#ddd6fe;">🎹 F#1</span></span>
        <span><b style="color:#c4b5fd;">Right/Curve:</b> <span id="erc-leg-right" style="font-family:monospace; font-weight:800; color:#ddd6fe;">🎹 G#1</span></span>
        <span><b style="color:#fcd34d;">Bomb:</b> <span id="erc-leg-bomb" style="font-family:monospace; font-weight:800; color:#fde68a;">🎹 B1</span></span>
        <span><b style="color:#7dd3fc;">Grubber:</b> <span id="erc-leg-grubber" style="font-family:monospace; font-weight:800; color:#bae6fd;">🎹 C2</span></span>
        <span><b style="color:#86efac;">Chip:</b> <span id="erc-leg-chip" style="font-family:monospace; font-weight:800; color:#bbf7d0;">🎹 D2</span></span>
      </div>
    </div>

    <div id="erc-piano-strip">
      <button type="button" data-note="C" class="piano-key-btn font-sports">C</button>
      <button type="button" data-note="D" class="piano-key-btn font-sports">D</button>
      <button type="button" data-note="E" class="piano-key-btn font-sports">E</button>
      <button type="button" data-note="F" class="piano-key-btn font-sports">F</button>
      <button type="button" data-note="G" class="piano-key-btn font-sports">G</button>
    </div>

    <div id="erc-start-modal">
      <div class="erc-modal-card">
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; padding-bottom:7px; border-bottom:1px solid rgba(255,255,255,0.1);">
          <div>
            <div class="font-sports" style="font-style:italic; font-weight:800; font-size:19px; color:#ffffff; text-transform:uppercase;">
              ERC Sports Rugby — Team &amp; MIDI Setup
            </div>
            <div style="font-size:11px; color:#cbd5e1;">
              1P vs CPU or 2P Firebase Room Link • Each player sees their own forward perspective • Coin toss &amp; 3D kicks.
            </div>
          </div>
          <div class="erc-logo-badge">
            <div class="erc-logo-inner">
              <span class="font-sports" style="font-style:italic; font-weight:800; font-size:16px; color:#b91c1c;">ERC</span>
              <span class="font-sports" style="font-style:italic; font-weight:800; font-size:11px; color:#1e3a8a;">SPORTS</span>
            </div>
          </div>
        </div>

        <!-- 1P vs 2P Firebase Room Link Bar on Splash Screen -->
        <div class="erc-mp-bar">
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;">
            <span class="font-sports" style="font-size:11px; font-weight:800; color:#7dd3fc; text-transform:uppercase;">🌐 2P Room Link:</span>
            <button type="button" id="erc-mp-solo-btn" class="sports-btn erc-mp-mode-btn active-mp">1P vs CPU</button>
            <button type="button" id="erc-mp-host-btn" class="sports-btn erc-mp-mode-btn">Create Code (P1)</button>
            <button type="button" id="erc-mp-join-btn" class="sports-btn erc-mp-mode-btn">Join Code (P2)</button>
            <input type="text" id="erc-mp-code-input" placeholder="ROOM CODE" maxlength="6" style="width:94px; padding:5px 7px; border-radius:7px; border:1px solid rgba(125,211,252,0.45); background:#090d16; color:#fde047; font-weight:800; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">
            <button type="button" id="erc-mp-connect-btn" class="sports-btn font-sports" style="border:none; border-radius:7px; background:#0ea5e9; color:#020617; font-weight:800; font-size:10.5px; text-transform:uppercase; padding:5px 10px;">Link</button>
          </div>
          <div id="erc-mp-status" style="font-size:10.5px; color:#cbd5e1; font-weight:600;">
            Mode: 1P vs Computer
          </div>
        </div>

        <div class="erc-setup-grid">
          <div class="erc-panel">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <label for="erc-team-select" id="erc-team-select-label" class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#67e8f9;">Your Team (Home)</label>
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

            <div id="erc-wolfhound-squad" class="wolfhound-squad-strip">
              <div class="font-sports" style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:#5eead4;">
                🐺 ERC WolfHounds Pixel Squad (C–G)
              </div>
              <div id="erc-wolfhound-faces" class="wolfhound-faces-row"></div>
            </div>
          </div>

          <div class="erc-panel" style="border-color:rgba(251,191,36,0.28);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span id="erc-opponent-panel-title" class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#fcd34d;">Computer Opponent (Pokie Reel)</span>
              <span id="erc-reel-badge" style="font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; background:rgba(245,158,11,0.2); color:#fde68a; border:1px solid rgba(251,191,36,0.35);">LOCKED</span>
            </div>
            <div class="pokie-window">
              <div style="pointer-events:none; position:absolute; left:0; right:0; top:50%; transform:translateY(-50%); height:30px; border-top:1px solid rgba(252,211,77,0.35); border-bottom:1px solid rgba(252,211,77,0.35); background:rgba(251,191,36,0.05);"></div>
              <div id="erc-pokie-name" class="font-sports" style="position:relative; z-index:2; font-style:italic; font-weight:800; font-size:15px; color:#ffffff; text-transform:uppercase;">SPINNING...</div>
              <div id="erc-pokie-sub" style="position:relative; z-index:2; font-size:10.5px; color:#fde68a; margin-top:1px;">Randomising opponent...</div>
            </div>
            <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center;">
              <span id="erc-opponent-reel-hint" style="font-size:10px; color:#94a3b8;">Spins when team changes</span>
              <button type="button" id="erc-respin-btn" class="sports-btn font-sports" style="border:none; border-radius:7px; background:#f59e0b; color:#020617; font-weight:800; font-size:10.5px; text-transform:uppercase; padding:4px 10px;">Re-Spin Reel</button>
            </div>
          </div>
        </div>

        <div class="erc-panel" style="margin-top:8px;">
          <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:6px;">
            <span class="font-sports" style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#fde047;">
              🎹 Assign MIDI Piano Keys (Offense, Defense &amp; 3D Kicks)
            </span>
            <span style="font-size:10.5px; color:#cbd5e1;">
              Pass/Switch: <b style="color:#fef08a;">C, D, E, F, G</b> • Hold kick key to charge &amp; release to strike!
            </span>
          </div>

          <div class="erc-bind-grid-5">
            <div style="background:#0f172a; border:1px solid rgba(167,139,250,0.35); border-radius:9px; padding:6px; text-align:center;">
              <div class="font-sports" style="font-size:11px; font-weight:800; color:#c4b5fd;">⬅ MOVE LEFT</div>
              <div style="font-size:9.5px; color:#94a3b8; margin:1px 0 5px;">Steer &amp; Curve L</div>
              <button type="button" data-bind-action="moveLeft" class="erc-key-btn sports-btn" style="background:rgba(139,92,246,0.22); border:1px solid rgba(167,139,250,0.6); color:#ede9fe;">🎹 F#1</button>
            </div>

            <div style="background:#0f172a; border:1px solid rgba(167,139,250,0.35); border-radius:9px; padding:6px; text-align:center;">
              <div class="font-sports" style="font-size:11px; font-weight:800; color:#c4b5fd;">MOVE RIGHT ➡</div>
              <div style="font-size:9.5px; color:#94a3b8; margin:1px 0 5px;">Steer &amp; Curve R</div>
              <button type="button" data-bind-action="moveRight" class="erc-key-btn sports-btn" style="background:rgba(139,92,246,0.22); border:1px solid rgba(167,139,250,0.6); color:#ede9fe;">🎹 G#1</button>
            </div>

            <div style="background:#0f172a; border:1px solid rgba(251,191,36,0.35); border-radius:9px; padding:6px; text-align:center;">
              <div class="font-sports" style="font-size:11px; font-weight:800; color:#fcd34d;">🏉 BOMB KICK</div>
              <div style="font-size:9.5px; color:#94a3b8; margin:1px 0 5px;">High 3D spiral</div>
              <button type="button" data-bind-action="bomb" class="erc-key-btn sports-btn" style="background:rgba(245,158,11,0.2); border:1px solid rgba(251,191,36,0.6); color:#fef3c7;">🎹 B1</button>
            </div>

            <div style="background:#0f172a; border:1px solid rgba(56,189,248,0.35); border-radius:9px; padding:6px; text-align:center;">
              <div class="font-sports" style="font-size:11px; font-weight:800; color:#7dd3fc;">💨 GRUBBER</div>
              <div style="font-size:9.5px; color:#94a3b8; margin:1px 0 5px;">Low 3D skid kick</div>
              <button type="button" data-bind-action="grubber" class="erc-key-btn sports-btn" style="background:rgba(14,165,233,0.2); border:1px solid rgba(56,189,248,0.6); color:#e0f2fe;">🎹 C2</button>
            </div>

            <div style="background:#0f172a; border:1px solid rgba(74,222,128,0.35); border-radius:9px; padding:6px; text-align:center;">
              <div class="font-sports" style="font-size:11px; font-weight:800; color:#86efac;">🎯 CHIP KICK</div>
              <div style="font-size:9.5px; color:#94a3b8; margin:1px 0 5px;">Short 3D loft</div>
              <button type="button" data-bind-action="chipKick" class="erc-key-btn sports-btn" style="background:rgba(34,197,94,0.2); border:1px solid rgba(74,222,128,0.6); color:#dcfce7;">🎹 D2</button>
            </div>
          </div>

          <div id="erc-keybind-notice" style="margin-top:5px; font-size:11px; color:#fcd34d; min-height:14px;">
            Click any control button above, then press a MIDI piano key (e.g. F#1, G#1, B1, C2, D2) or press Esc to cancel.
          </div>
        </div>

        <div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.1); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px;">
          <div id="erc-matchup-summary" style="font-size:12px; color:#cbd5e1; font-weight:600;">Ready for kick-off.</div>
          <button type="button" id="erc-start-match-btn" class="sports-btn font-sports" style="border:none; border-radius:10px; background:linear-gradient(90deg, #dc2626, #ef4444, #2563eb); color:#ffffff; font-style:italic; font-weight:800; font-size:15px; text-transform:uppercase; letter-spacing:0.06em; padding:8px 24px;">
            Coin Toss &amp; Kick Off
          </button>
        </div>
      </div>
    </div>
  `;
}
