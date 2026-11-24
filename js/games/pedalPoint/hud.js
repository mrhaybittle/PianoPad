// js/games/pedalPoint/hud.js
import { TRAIL_LENGTH } from './constants.js';

export function mountPedalPointHUD(wrapperParent, initH) {
  const containerEl = document.createElement('div');
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
      @keyframes ppNoteSpeak {
        0% { transform: scale(1); }
        45% { transform: scale(1.38); filter: brightness(1.45); }
        100% { transform: scale(1); }
      }
      @keyframes ppBannerPulse {
        0%, 100% { box-shadow: 0 12px 32px rgba(251, 191, 36, 0.35), 0 0 0 2px rgba(251, 191, 36, 0.65); }
        50% { box-shadow: 0 14px 42px rgba(251, 191, 36, 0.72), 0 0 0 4px rgba(251, 191, 36, 0.95); }
      }
      @keyframes ppDiamondHit {
        0% { transform: rotate(45deg) scale(1.48); box-shadow: 0 0 22px #34d399; }
        100% { transform: rotate(45deg) scale(1); box-shadow: 0 0 8px rgba(52, 211, 153, 0.55); }
      }
      @keyframes ppEqBounce {
        0%, 100% { height: 28%; }
        50% { height: 100%; }
      }
      .pp-note-speaking { animation: ppNoteSpeak 0.38s ease-out; }
      .pp-beat-hit { animation: ppDiamondHit 0.25s ease-out; }
      .pp-eq-active { animation: ppEqBounce 0.48s ease-in-out infinite; }

      #pp-hud {
        position: absolute; top: 10px; left: 12px; right: 12px;
        display: flex; justify-content: space-between; align-items: flex-start;
        gap: 8px; pointer-events: none; z-index: 10;
      }
      #pedal-point-3d-container .hud-group { display: flex; flex-wrap: wrap; gap: 8px; }
      #pedal-point-3d-container .hud-pill {
        background: rgba(14, 24, 22, 0.82);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 10px; padding: 6px 11px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        min-width: 68px;
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

      #pp-eq-bars {
        display: flex; align-items: flex-end; gap: 3px; height: 16px; margin-top: 2px;
      }
      #pp-eq-bars div {
        width: 5px; border-radius: 2px; background: #475569; height: 28%;
      }

      #pp-melody-banner {
        position: absolute; top: 64px; left: 50%;
        transform: translateX(-50%);
        background: rgba(11, 20, 18, 0.95);
        border: 3px solid #fbbf24;
        border-radius: 18px;
        padding: 10px 24px;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        animation: ppBannerPulse 1.3s ease-in-out infinite;
        z-index: 15;
        pointer-events: none;
      }
      #pp-melody-title {
        font-size: 12px; font-weight: 900; letter-spacing: 0.08em;
        text-transform: uppercase; color: #fde047;
        text-shadow: 0 2px 8px rgba(0,0,0,0.8);
      }
      #pp-melody-notes { display: flex; gap: 12px; align-items: center; }

      #pp-next-gate-pill {
        position: absolute; top: 64px; left: 12px;
        background: rgba(14, 24, 22, 0.90);
        border: 2px solid rgba(255, 255, 255, 0.25);
        border-radius: 12px;
        padding: 6px 12px;
        display: none;
        align-items: center;
        gap: 8px;
        z-index: 11;
        pointer-events: none;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
      }

      #pp-wheelie-pill {
        position: absolute; top: 64px; right: 12px;
        background: rgba(24, 16, 42, 0.92);
        border: 2px solid #c084fc;
        border-radius: 12px;
        padding: 6px 12px;
        display: none;
        align-items: center;
        gap: 7px;
        z-index: 11;
        pointer-events: none;
        box-shadow: 0 6px 18px rgba(168, 85, 247, 0.35);
        font-size: 11px; font-weight: 900; color: #f3e8ff;
      }

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
        font-size: 25px; font-weight: 900; letter-spacing: 0.04em;
        text-transform: uppercase; color: #34d399;
        text-shadow: 0 4px 18px rgba(0, 0, 0, 0.95);
        opacity: 0; pointer-events: none;
        transition: opacity 0.18s ease, transform 0.18s ease;
        z-index: 14; text-align: center; white-space: nowrap;
      }
      #pp-callout.show { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }

      #pp-bottom-bar {
        position: absolute; bottom: 10px; left: 12px; right: 12px;
        display: flex; justify-content: space-between; align-items: flex-end;
        gap: 10px; pointer-events: none; z-index: 10;
      }
      #pp-controls-caption {
        background: rgba(14, 24, 22, 0.80);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px; padding: 6px 10px;
        font-size: 11px; font-weight: 700; color: #cbd5e1;
      }

      #pp-beat-bar {
        background: rgba(14, 24, 22, 0.84);
        border: 1px solid rgba(52, 211, 153, 0.32);
        border-radius: 999px;
        padding: 5px 14px;
        display: flex; align-items: center; gap: 10px;
        width: 240px;
      }
      #pp-beat-track {
        position: relative; flex: 1; height: 14px;
        display: flex; align-items: center; justify-content: center; overflow: hidden;
      }
      #pp-beat-line { width: 100%; height: 2px; background: rgba(255, 255, 255, 0.18); }
      #pp-beat-l {
        position: absolute; left: 0%; width: 5px; height: 12px;
        border-radius: 3px; background: #34d399; box-shadow: 0 0 8px #34d399;
      }
      #pp-beat-r {
        position: absolute; right: 0%; width: 5px; height: 12px;
        border-radius: 3px; background: #34d399; box-shadow: 0 0 8px #34d399;
      }
      #pp-beat-diamond {
        width: 10px; height: 10px; background: #ffffff;
        border: 2px solid #34d399; transform: rotate(45deg); z-index: 2;
      }

      #pp-preload-pill {
        background: rgba(15, 23, 42, 0.90);
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
        max-width: 530px; width: 100%; text-align: center;
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
          <div class="hud-value" id="pp-val-rem">${TRAIL_LENGTH}m</div>
        </div>
        <div class="hud-pill">
          <div class="hud-label">Score</div>
          <div class="hud-value" id="pp-val-score">0</div>
        </div>
        <div class="hud-pill" id="pp-hud-combo">
          <div class="hud-label">Flow</div>
          <div class="hud-value" id="pp-val-combo">x1</div>
        </div>
        <div class="hud-pill">
          <div class="hud-label">Groove</div>
          <div id="pp-eq-bars">
            <div data-layer="0" title="Kick & Shaker"></div>
            <div data-layer="1" title="Coastal Bass"></div>
            <div data-layer="2" title="Marimba Arp"></div>
            <div data-layer="3" title="Sunny Chords"></div>
          </div>
        </div>
        <div class="hud-pill" id="pp-hud-best">
          <div class="hud-label">Best</div>
          <div class="hud-value" id="pp-val-best">--</div>
        </div>
      </div>
      <div class="hud-actions">
        <button type="button" class="hud-btn" id="btn-pp-ghost" title="Toggle Personal Best Ghost Rider">👻 Ghost: ON</button>
        <button type="button" class="hud-btn" id="btn-pp-calibrate" title="Assign Piano or Keyboard Keys">🎹 Keys</button>
        <button type="button" class="hud-btn" id="btn-pp-cam-toggle" title="Toggle Camera">🎥 Chase Cam</button>
      </div>
    </div>

    <!-- Approaching Challenge Radar Pill -->
    <div id="pp-next-gate-pill">
      <span id="pp-next-gate-title" style="font-size:10px; font-weight:900; letter-spacing:0.08em; color:#94a3b8; text-transform:uppercase;">NEXT GATE</span>
      <span id="pp-next-gate-badge" style="padding:2px 9px; border-radius:7px; font-size:13px; font-weight:900; color:#fff; background:#ef4444;">♪ C4</span>
      <span id="pp-next-gate-dist" style="font-size:11px; font-weight:800; color:#e2e8f0; font-variant-numeric:tabular-nums;">110m</span>
    </div>

    <!-- Triad Wheelie Active Pill -->
    <div id="pp-wheelie-pill">
      <span>🚵‍♂️ WHEELIE</span>
      <span id="pp-wheelie-chord" style="color:#fde047;">C MAJOR</span>
    </div>

    <!-- Prominent Approaching Melody Trail Prompt -->
    <div id="pp-melody-banner">
      <div id="pp-melody-title">🎹 UPCOMING MELODY TRAIL — STEER INTO OR PLAY THESE 4 NOTES!</div>
      <div id="pp-melody-notes"></div>
    </div>

    <!-- Callout Banner -->
    <div id="pp-callout">G4 NOTE GATE! +200</div>

    <!-- Bottom Controls Bar -->
    <div id="pp-bottom-bar">
      <div id="pp-controls-caption">
        <b>A / ←</b> Left • <b>D / →</b> Right • <b>Space</b> Hop / Pump • <b>Any Triad</b> Wheelie
      </div>
      <div id="pp-beat-bar">
        <span style="font-size:10px; font-weight:900; color:#34d399; letter-spacing:0.05em;">122 BPM</span>
        <div id="pp-beat-track">
          <div id="pp-beat-line"></div>
          <div id="pp-beat-l"></div>
          <div id="pp-beat-r"></div>
          <div id="pp-beat-diamond"></div>
        </div>
        <span id="pp-beat-label" style="font-size:10px; font-weight:900; color:#e2e8f0; width:22px; text-align:right;">1/4</span>
      </div>
      <div id="pp-preload-pill">PRE-LOAD: 0%</div>
      <button type="button" id="pp-touch-jump-btn">⬆ HOP / PUMP / WHIP</button>
    </div>

    <!-- Start / Garage Overlay -->
    <div id="pp-overlay">
      <div class="modal-card">
        <div class="badge-tag">Wollongong NSW • Illawarra Escarpment</div>
        <h1>PEDAL POINT 3D</h1>
        <p id="pp-modal-subtitle">
          Carve red-dirt singletrack down Mt Kembla! Bunny-hop or <b>Triad Wheelie</b> over fallen logs, ride <b>North-Shore bridges</b>, and <b>pump landings</b> for speed!
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
          <span><b id="pp-lbl-jump">Space</b> Hop / Pump / Whip</span>
          <span><b>Any Triad (3 Notes)</b> Wheelie</span>
        </div>

        <div class="modal-actions">
          <button type="button" id="btn-pp-modal-recalib">🎹 Recalibrate Notes</button>
          <button type="button" id="btn-pp-play">Drop In 🚵‍♂️</button>
        </div>
      </div>
    </div>

    <!-- 4-Step Piano / Keyboard Calibration Modal -->
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
            <div class="calib-slot-title">3. Hop / Pump / Whip</div>
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

  const els = {
    containerEl,
    valSpeed: document.getElementById('pp-val-speed'),
    valRem: document.getElementById('pp-val-rem'),
    valScore: document.getElementById('pp-val-score'),
    valCombo: document.getElementById('pp-val-combo'),
    valBest: document.getElementById('pp-val-best'),
    preloadPill: document.getElementById('pp-preload-pill'),
    calloutEl: document.getElementById('pp-callout'),
    overlayEl: document.getElementById('pp-overlay'),
    btnCamToggle: document.getElementById('btn-pp-cam-toggle'),
    btnGhostToggle: document.getElementById('btn-pp-ghost'),
    btnPlay: document.getElementById('btn-pp-play'),
    btnCalibrate: document.getElementById('btn-pp-calibrate'),
    btnModalRecalib: document.getElementById('btn-pp-modal-recalib'),
    btnCalibSkip: document.getElementById('btn-pp-calib-skip'),
    btnCalibSave: document.getElementById('btn-pp-calib-save'),
    btnTouchJump: document.getElementById('pp-touch-jump-btn'),
    calibOverlay: document.getElementById('pp-calib-overlay'),
    calibPrompt: document.getElementById('pp-calib-prompt'),
    eqBars: document.querySelectorAll('#pp-eq-bars > div'),
    beatDiamondEl: document.getElementById('pp-beat-diamond'),
    beatLabelEl: document.getElementById('pp-beat-label'),
    beatLeftEl: document.getElementById('pp-beat-l'),
    beatRightEl: document.getElementById('pp-beat-r'),
    nextGatePillEl: document.getElementById('pp-next-gate-pill'),
    nextGateTitleEl: document.getElementById('pp-next-gate-title'),
    nextGateBadgeEl: document.getElementById('pp-next-gate-badge'),
    nextGateDistEl: document.getElementById('pp-next-gate-dist'),
    wheeliePillEl: document.getElementById('pp-wheelie-pill'),
    wheelieChordEl: document.getElementById('pp-wheelie-chord'),
    bannerEl: document.getElementById('pp-melody-banner'),
    notesRowEl: document.getElementById('pp-melody-notes')
  };

  let calloutTimeout = null;
  function showCallout(text, color = '#34d399') {
    if (!els.calloutEl) return;
    els.calloutEl.textContent = text;
    els.calloutEl.style.color = color;
    els.calloutEl.classList.add('show');
    clearTimeout(calloutTimeout);
    calloutTimeout = setTimeout(() => els.calloutEl.classList.remove('show'), 1450);
  }

  function updateControlsLabels(bindings) {
    const lblLeft = document.getElementById('pp-lbl-left');
    const lblRight = document.getElementById('pp-lbl-right');
    const lblJump = document.getElementById('pp-lbl-jump');
    const caption = document.getElementById('pp-controls-caption');

    if (lblLeft) lblLeft.textContent = bindings.left.label;
    if (lblRight) lblRight.textContent = bindings.right.label;
    if (lblJump) lblJump.textContent = bindings.jump.label;
    if (caption) {
      caption.innerHTML =
        `<b>${bindings.left.label}</b> Left • <b>${bindings.right.label}</b> Right • <b>${bindings.jump.label}</b> Hop / Pump • <b>Any Triad</b> Wheelie`;
    }
  }

  function updateEqVisuals(comboLayer) {
    els.eqBars.forEach((bar, idx) => {
      if (idx <= comboLayer) {
        bar.style.background = '#34d399';
        bar.classList.add('pp-eq-active');
        bar.style.animationDelay = `${idx * 0.11}s`;
      } else {
        bar.style.background = '#475569';
        bar.classList.remove('pp-eq-active');
        bar.style.height = '28%';
      }
    });
  }

  return {
    els,
    showCallout,
    updateControlsLabels,
    updateEqVisuals
  };
}
