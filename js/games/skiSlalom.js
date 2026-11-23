// js/games/skiSlalom.js
import { initAudio, audioCtx, playTone } from '../audio.js';
import { getNoteFrequency } from '../musicTheory.js';

let animFrameId = null;
let lastFrameTime = 0;
let gamePhase = 'calibration'; // 'calibration' | 'ready' | 'playing' | 'finished' | 'crashed'
let bridgeRef = null;

// Three.js scene objects
let containerEl = null;
let renderer = null;
let scene = null;
let camera = null;
let sunLight = null;
let skierRoot = null;
let skierBodyGroup = null;
let headGroup = null;

let terrainChunks = [];
let gates = [];
let trees = [];
let kickers = [];
let rails = [];
let snowParticles = [];

// Race & physics state
const TOTAL_GATES = 30;
const GATE_PENALTY_SEC = 3.0;
const SLOPE_ANGLE = 0.24;
const CHUNK_LEN = 75;
const CHUNK_COUNT = 5;

let rawTimeSec = 0;
let penaltySec = 0;
let gatesPassed = 0;
let gatesMissed = 0;
let grindBonusPts = 0;
let bestTimeSec = parseFloat(localStorage.getItem('pianopad_ski_slalom_best') || '0');

let skierX = 0;
let skierY = 0;
let skierZ = 0;
let skierVx = 0;
let skierVy = 0;
let forwardSpeed = 24;
let isGrounded = true;
let isGrinding = false;
let currentRail = null;
let spinRotation = 0;
let isSpinning = false;
let spinCount = 0;
let cameraMode = 'chase'; // 'chase' | 'helmet'
let nextGateZ = -35;
let nextGateSide = -1;
let nextSceneryZ = -20;
let gateCounter = 0;
let finishLineZ = -35 - TOTAL_GATES * 26;
let finishArchGroup = null;

let bannerText = '';
let bannerColor = '#facc15';
let bannerTimer = 0;

// Piano / Keyboard bindings
const DEFAULT_BINDINGS = {
    left: 'c2',
    right: 'e2',
    jump: 'g2',
    view: 'b2'
};

let keyBindings = loadSavedBindings();
const heldActions = { left: false, right: false };
let heldNotesMap = new Map(); // noteStr -> action
let isCalibratingKeys = false;
let calibIndex = 0;
const CALIB_STEPS = [
    { key: 'left',  label: 'CARVE LEFT',   color: '#38bdf8', icon: '⬅️' },
    { key: 'right', label: 'CARVE RIGHT',  color: '#22c55e', icon: '➡️' },
    { key: 'jump',  label: 'JUMP & SPIN',  color: '#facc15', icon: '⬆️' },
    { key: 'view',  label: 'CAMERA VIEW',  color: '#ec4899', icon: '🎥' }
];

function loadSavedBindings() {
    try {
        const raw = localStorage.getItem('pianopad_ski_bindings');
        if (raw) return { ...DEFAULT_BINDINGS, ...JSON.parse(raw) };
    } catch (e) {}
    return { ...DEFAULT_BINDINGS };
}

function saveBindings() {
    try {
        localStorage.setItem('pianopad_ski_bindings', JSON.stringify(keyBindings));
    } catch (e) {}
}

function normalizeNote(noteStr) {
    return (noteStr || '').trim().toLowerCase();
}

function getTerrainHeight(x, z) {
    const baseSlope = z * Math.tan(SLOPE_ANGLE);
    const moguls = Math.sin(x * 0.14) * Math.cos(z * 0.08) * 0.45 + Math.sin(z * 0.035) * 0.6;
    return baseSlope + moguls;
}

// --- SOUND EFFECTS ---
function playSkiSfx(type) {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        if (type === 'gate_ok') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.setValueAtTime(880, now + 0.06);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.19);
        } else if (type === 'gate_miss') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(175, now);
            osc.frequency.exponentialRampToValueAtTime(95, now + 0.24);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.26);
        } else if (type === 'jump') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(240, now);
            osc.frequency.exponentialRampToValueAtTime(560, now + 0.14);
            gain.gain.setValueAtTime(0.09, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.16);
        } else if (type === 'grind') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(920, now);
            osc.frequency.linearRampToValueAtTime(1180, now + 0.12);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.14);
        } else if (type === 'crash') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(34, now + 0.35);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.37);
        } else if (type === 'finish') {
            [523.25, 659.25, 783.99, 1046.50].forEach((f, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, now + idx * 0.08);
                gain.gain.setValueAtTime(0.09, now + idx * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.08);
                osc.stop(now + idx * 0.08 + 0.27);
            });
        }
    } catch (e) {}
}

function triggerBanner(text, color = '#facc15', duration = 1.2) {
    bannerText = text;
    bannerColor = color;
    bannerTimer = duration;
}

// --- KEYBOARD & POINTER FALLBACK LISTENERS ---
function onWindowKeyDown(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
    }
    if (e.repeat) return;

    const k = e.key.toLowerCase();
    if (isCalibratingKeys) {
        if (['shift', 'control', 'alt', 'meta', 'tab', 'escape'].includes(k)) return;
        // Let PianoPad's mapped piano keys go through handleSkiSlalomInput; capture unmapped PC keys directly
        const pianoMapKeys = ['z','s','x','d','c','v','g','b','h','n','j','m',',','l','.','1','q','w','3','e','4','r','5','t','y','7','u','8','i','o','0','p'];
        if (!pianoMapKeys.includes(k)) {
            e.preventDefault();
            e.stopPropagation();
            recordCalibratedKey(`key:${k}`);
        }
        return;
    }

    if (gamePhase !== 'playing') return;

    if (k === 'arrowleft' || `key:${k}` === keyBindings.left) {
        heldActions.left = true;
    } else if (k === 'arrowright' || `key:${k}` === keyBindings.right) {
        heldActions.right = true;
    } else if (e.code === 'Space' || `key:${k}` === keyBindings.jump) {
        triggerSkierJumpOrSpin();
    } else if (k === 'v' || `key:${k}` === keyBindings.view) {
        toggleCameraView();
    }
}

function onWindowKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || `key:${k}` === keyBindings.left) heldActions.left = false;
    if (k === 'arrowright' || `key:${k}` === keyBindings.right) heldActions.right = false;

    if (!document.querySelector('#keyboard .key.active') && heldNotesMap.size > 0) {
        heldNotesMap.clear();
        heldActions.left = false;
        heldActions.right = false;
    }
}

function onWindowPointerUp() {
    setTimeout(() => {
        if (!document.querySelector('#keyboard .key.active') && heldNotesMap.size > 0) {
            heldNotesMap.clear();
            heldActions.left = false;
            heldActions.right = false;
        }
    }, 15);
}

function onWindowResize() {
    if (!containerEl || !renderer || !camera) return;
    const w = containerEl.clientWidth || 1232;
    const h = containerEl.clientHeight || 380;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
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
            if (idx >= cdnUrls.length) return reject(new Error('All Three.js CDNs failed'));

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
// --- THREE.JS WORLD & BALD POLO SKIER BUILDER ---
function initThreeScene() {
    const THREE = window.THREE;
    if (!THREE) {
        alert('Three.js failed to load. Please check your internet connection and reload.');
        return false;
    }

    const wrapper = document.getElementById('visualizer-wrapper');
    const waterfall = document.getElementById('waterfall-canvas');
    const W = (waterfall && waterfall.width) || 1232;
    const H = (waterfall && waterfall.height) || 380;

    if (containerEl) containerEl.remove();

    containerEl = document.createElement('div');
    containerEl.id = 'ski-slalom-3d-container';
    containerEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: ${H}px;
        z-index: 20;
        overflow: hidden;
        background: linear-gradient(180deg, #38bdf8 0%, #bae6fd 100%);
    `;

    // HUD Overlay inside 3D container
    containerEl.innerHTML = `
        <div style="position:absolute; top:10px; left:14px; right:14px; display:flex; justify-content:space-between; align-items:flex-start; pointer-events:none; z-index:5; font-family:system-ui,-apple-system,sans-serif;">
            <div style="background:rgba(15,23,42,0.82); border:1.5px solid #38bdf8; border-radius:10px; padding:7px 14px; color:#fff; display:flex; gap:16px; align-items:center;">
                <div>
                    <div style="font-size:10px; color:#94a3b8; font-weight:800;">RACE TIME</div>
                    <div id="ski-hud-time" style="font-size:20px; font-weight:900; font-family:monospace; color:#facc15;">0.00s</div>
                </div>
                <div style="width:1px; height:26px; background:#334155;"></div>
                <div>
                    <div style="font-size:10px; color:#94a3b8; font-weight:800;">GATES</div>
                    <div id="ski-hud-gates" style="font-size:16px; font-weight:900; color:#22c55e;">0 / ${TOTAL_GATES}</div>
                </div>
                <div style="width:1px; height:26px; background:#334155;"></div>
                <div>
                    <div style="font-size:10px; color:#94a3b8; font-weight:800;">PENALTIES</div>
                    <div id="ski-hud-penalties" style="font-size:16px; font-weight:900; color:#ef4444;">+0.0s</div>
                </div>
            </div>

            <div style="display:flex; gap:8px; pointer-events:auto;">
                <button type="button" id="btn-ski-recalibrate" style="background:rgba(15,23,42,0.88); color:#facc15; border:1.5px solid #facc15; border-radius:8px; padding:6px 11px; font-size:12px; font-weight:800; cursor:pointer;">
                    🎹 Keys
                </button>
                <button type="button" id="btn-ski-cam" style="background:rgba(15,23,42,0.88); color:#38bdf8; border:1.5px solid #38bdf8; border-radius:8px; padding:6px 11px; font-size:12px; font-weight:800; cursor:pointer;">
                    🎥 View
                </button>
            </div>
        </div>

        <div id="ski-hud-banner" style="position:absolute; top:42%; left:50%; transform:translate(-50%,-50%); font-size:26px; font-weight:900; color:#facc15; text-shadow:0 3px 10px rgba(0,0,0,0.85); pointer-events:none; z-index:6; display:none; text-align:center;"></div>

        <div id="ski-hud-controls-bar" style="position:absolute; bottom:8px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.78); border:1px solid rgba(255,255,255,0.2); border-radius:999px; padding:4px 16px; color:#e2e8f0; font-size:11px; font-weight:800; pointer-events:none; z-index:5; white-space:nowrap;"></div>
    `;

    wrapper.style.position = 'relative';
    wrapper.appendChild(containerEl);

    document.getElementById('btn-ski-recalibrate').onclick = () => openCalibrationPopup(bridgeRef);
    document.getElementById('btn-ski-cam').onclick = () => toggleCameraView();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7dd3fc);
    scene.fog = new THREE.FogExp2(0xbae6fd, 0.0055);

    camera = new THREE.PerspectiveCamera(62, W / H, 0.1, 420);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.domElement.style.display = 'block';
    containerEl.insertBefore(renderer.domElement, containerEl.firstChild);

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x93c5fd, 0.95);
    scene.add(hemiLight);

    sunLight = new THREE.DirectionalLight(0xfffbeb, 1.15);
    sunLight.position.set(35, 65, 25);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // Build Procedural Snow Chunks
    terrainChunks = [];
    for (let i = 0; i < CHUNK_COUNT; i++) {
        const chunk = createTerrainChunk(-i * CHUNK_LEN);
        scene.add(chunk);
        terrainChunks.push(chunk);
    }

    // Build Bald Character in Black Polo Shirt with Red Collar, Grey Pants & Black Leather Shoes
    buildBaldPoloSkier();
    updateControlsHudText();
    return true;
}

function createTerrainChunk(startZ) {
    const THREE = window.THREE;
    const width = 120;
    const segX = 28;
    const segZ = 24;
    const geom = new THREE.PlaneGeometry(width, CHUNK_LEN, segX, segZ);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i) + startZ;
        pos.setY(i, getTerrainHeight(vx, vz));
    }
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.85,
        metalness: 0.05,
        flatShading: true
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.z = startZ;
    mesh.receiveShadow = true;
    mesh.userData.baseZ = startZ;
    return mesh;
}

function repositionTerrainChunk(chunk, newZ) {
    chunk.position.z = newZ;
    chunk.userData.baseZ = newZ;
    const pos = chunk.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i) + newZ;
        pos.setY(i, getTerrainHeight(vx, vz));
    }
    pos.needsUpdate = true;
    chunk.geometry.computeVertexNormals();
}

function buildBaldPoloSkier() {
    const THREE = window.THREE;
    if (skierRoot) scene.remove(skierRoot);

    skierRoot = new THREE.Group();
    skierBodyGroup = new THREE.Group();
    skierRoot.add(skierBodyGroup);

    const skiMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.4 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.18, metalness: 0.35 }); // Polished black leather shoes
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 }); // Grey pants
    const poloMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 }); // Black polo shirt
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 }); // Red collar
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.55 });

    // Skis & Black Leather Shoes
    [-0.24, 0.24].forEach(offsetX => {
        const ski = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 2.2), skiMat);
        ski.position.set(offsetX, 0.02, 0);
        ski.castShadow = true;
        skierBodyGroup.add(ski);

        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.28), skiMat);
        tip.position.set(offsetX, 0.08, -1.16);
        tip.rotation.x = 0.45;
        skierBodyGroup.add(tip);

        // Polished black leather shoe
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.36), shoeMat);
        shoe.position.set(offsetX, 0.10, -0.02);
        shoe.castShadow = true;
        skierBodyGroup.add(shoe);

        // Grey trouser leg
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.09, 0.72, 10), pantsMat);
        leg.position.set(offsetX, 0.50, 0.02);
        leg.rotation.x = -0.14;
        leg.castShadow = true;
        skierBodyGroup.add(leg);
    });

    // Grey Pants Pelvis
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.22, 0.30), pantsMat);
    hips.position.set(0, 0.88, 0.05);
    hips.castShadow = true;
    skierBodyGroup.add(hips);

    // Black Polo Shirt Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.32), poloMat);
    torso.position.set(0, 1.30, 0.02);
    torso.rotation.x = -0.16;
    torso.castShadow = true;
    skierBodyGroup.add(torso);

    // Red Polo Collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 16), collarMat);
    collar.rotation.x = Math.PI / 2 - 0.16;
    collar.position.set(0, 1.64, -0.02);
    skierBodyGroup.add(collar);

    // Arms (Black polo short sleeves + skin forearms) & Ski Poles
    [-0.36, 0.36].forEach(sideX => {
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.24, 10), poloMat);
        sleeve.position.set(sideX, 1.50, -0.02);
        sleeve.rotation.z = sideX > 0 ? -0.25 : 0.25;
        sleeve.rotation.x = -0.35;
        skierBodyGroup.add(sleeve);

        const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.34, 10), skinMat);
        forearm.position.set(sideX * 1.12, 1.28, -0.16);
        forearm.rotation.x = -0.65;
        skierBodyGroup.add(forearm);

        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 1.35, 6),
            new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 })
        );
        pole.position.set(sideX * 1.18, 0.85, 0.18);
        pole.rotation.x = 0.55;
        skierBodyGroup.add(pole);
    });

    // Bald Head (Smooth skin dome, ears, eyebrows, nose — zero hair/helmet)
    headGroup = new THREE.Group();
    headGroup.position.set(0, 1.86, -0.04);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 16), skinMat);
    skull.scale.set(0.94, 1.08, 1.0);
    skull.castShadow = true;
    headGroup.add(skull);

    // Ears
    [-0.20, 0.20].forEach(ex => {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), skinMat);
        ear.position.set(ex, -0.02, 0.01);
        headGroup.add(ear);
    });

    // Nose & Eyes
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.08, 8), skinMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, -0.02, -0.22);
    headGroup.add(nose);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    [-0.075, 0.075].forEach(ex => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), eyeMat);
        eye.position.set(ex, 0.03, -0.195);
        headGroup.add(eye);
    });

    skierBodyGroup.add(headGroup);
    scene.add(skierRoot);
}

// --- COURSE ENTITIES: GATES, GRIND RAILS, KICKERS, TREES & FINISH ARCH ---
function spawnGateAt(zPos) {
    const THREE = window.THREE;
    gateCounter++;
    const isRed = gateCounter % 2 === 1;
    const color = isRed ? 0xef4444 : 0x2563eb;
    const gateWidth = 6.8;
    const centerX = nextGateSide * (4.5 + Math.random() * 8.5);
    nextGateSide *= -1;

    const group = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    const bannerMat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });

    [-gateWidth / 2, gateWidth / 2].forEach(px => {
        const y = getTerrainHeight(centerX + px, zPos);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.8, 8), poleMat);
        pole.position.set(centerX + px, y + 1.4, zPos);
        pole.castShadow = true;
        group.add(pole);
    });

    const midY = getTerrainHeight(centerX, zPos);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(gateWidth, 0.55), bannerMat);
    banner.position.set(centerX, midY + 2.35, zPos);
    group.add(banner);

    scene.add(group);
    gates.push({
        number: gateCounter,
        x: centerX,
        z: zPos,
        width: gateWidth,
        passed: false,
        mesh: group
    });
}

function spawnGrindRailAt(zPos) {
    const THREE = window.THREE;
    const x = (Math.random() - 0.5) * 14;
    const length = 11 + Math.random() * 5;
    const railHeight = 0.85;

    const group = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.75, roughness: 0.25 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 });

    const yStart = getTerrainHeight(x, zPos);
    const yEnd = getTerrainHeight(x, zPos - length);
    const midY = (yStart + yEnd) / 2 + railHeight;
    const pitch = Math.atan2(yEnd - yStart, -length);

    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, length, 10), steelMat);
    bar.rotation.x = Math.PI / 2 - pitch;
    bar.position.set(x, midY, zPos - length / 2);
    bar.castShadow = true;
    group.add(bar);

    [0.15, 0.5, 0.85].forEach(frac => {
        const lz = zPos - length * frac;
        const ly = getTerrainHeight(x, lz);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, railHeight + 0.2, 8), legMat);
        leg.position.set(x, ly + railHeight / 2, lz);
        group.add(leg);
    });

    scene.add(group);
    rails.push({
        x,
        zStart: zPos,
        zEnd: zPos - length,
        height: railHeight,
        mesh: group
    });
}

function spawnKickerAt(zPos) {
    const THREE = window.THREE;
    const x = (Math.random() - 0.5) * 16;
    const y = getTerrainHeight(x, zPos);

    const group = new THREE.Group();
    const rampMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, flatShading: true });
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });

    const wedge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.95, 4.2), rampMat);
    wedge.rotation.x = 0.28;
    wedge.position.set(x, y + 0.35, zPos);
    group.add(wedge);

    const lip = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.18, 0.45), lipMat);
    lip.position.set(x, y + 0.82, zPos - 1.9);
    group.add(lip);

    scene.add(group);
    kickers.push({ x, z: zPos, width: 3.5, mesh: group });
}

function spawnTreeAt(zPos) {
    const THREE = window.THREE;
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = side * (16 + Math.random() * 34);
    const y = getTerrainHeight(x, zPos);
    const scale = 0.85 + Math.random() * 0.7;

    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22 * scale, 0.32 * scale, 1.5 * scale, 7),
        new THREE.MeshStandardMaterial({ color: 0x78350f })
    );
    trunk.position.y = 0.75 * scale;
    tree.add(trunk);

    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, flatShading: true });
    [0, 1, 2].forEach(tier => {
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry((1.7 - tier * 0.38) * scale, 2.2 * scale, 7),
            foliageMat
        );
        cone.position.y = (2.1 + tier * 1.15) * scale;
        cone.castShadow = true;
        tree.add(cone);
    });

    tree.position.set(x, y, zPos);
    scene.add(tree);
    trees.push({ x, z: zPos, radius: 1.1 * scale, mesh: tree });
}

function buildFinishArch(zPos) {
    const THREE = window.THREE;
    if (finishArchGroup) scene.remove(finishArchGroup);
    finishArchGroup = new THREE.Group();

    const width = 24;
    const postMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });

    [-width / 2, width / 2].forEach(px => {
        const y = getTerrainHeight(px, zPos);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6.5, 10), postMat);
        post.position.set(px, y + 3.25, zPos);
        finishArchGroup.add(post);
    });

    const midY = getTerrainHeight(0, zPos);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, 1.3, 0.6), bannerMat);
    topBar.position.set(0, midY + 6.2, zPos);
    finishArchGroup.add(topBar);

    scene.add(finishArchGroup);
}

function resetCourseEntities() {
    gates.forEach(g => scene.remove(g.mesh));
    trees.forEach(t => scene.remove(t.mesh));
    kickers.forEach(k => scene.remove(k.mesh));
    rails.forEach(r => scene.remove(r.mesh));
    snowParticles.forEach(p => scene.remove(p.mesh));

    gates = [];
    trees = [];
    kickers = [];
    rails = [];
    snowParticles = [];

    rawTimeSec = 0;
    penaltySec = 0;
    gatesPassed = 0;
    gatesMissed = 0;
    grindBonusPts = 0;
    gateCounter = 0;

    skierX = 0;
    skierZ = 0;
    skierY = getTerrainHeight(0, 0);
    skierVx = 0;
    skierVy = 0;
    forwardSpeed = 24;
    isGrounded = true;
    isGrinding = false;
    currentRail = null;
    spinRotation = 0;
    isSpinning = false;
    spinCount = 0;

    nextGateZ = -32;
    nextGateSide = -1;
    nextSceneryZ = -18;
    finishLineZ = -32 - TOTAL_GATES * 25;

    for (let i = 0; i < TOTAL_GATES; i++) {
        spawnGateAt(nextGateZ);
        if (i % 4 === 1) spawnGrindRailAt(nextGateZ - 11);
        else if (i % 4 === 3) spawnKickerAt(nextGateZ - 11);
        nextGateZ -= 25;
    }

    while (nextSceneryZ > finishLineZ - 60) {
        spawnTreeAt(nextSceneryZ);
        spawnTreeAt(nextSceneryZ - 4);
        nextSceneryZ -= 9;
    }

    buildFinishArch(finishLineZ);

    terrainChunks.forEach((chunk, i) => {
        repositionTerrainChunk(chunk, -i * CHUNK_LEN);
    });
}

function spawnSnowSpark(x, y, z, colorHex = 0xffffff, count = 4) {
    const THREE = window.THREE;
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), mat);
        mesh.position.set(x, y + 0.15, z);
        scene.add(mesh);
        snowParticles.push({
            mesh,
            vx: (Math.random() - 0.5) * 6,
            vy: 2 + Math.random() * 4,
            vz: (Math.random() - 0.5) * 6,
            life: 0.45
        });
    }
}

// --- ACTIONS ---
function triggerSkierJumpOrSpin() {
    if (gamePhase !== 'playing') return;
    if (isGrounded || isGrinding) {
        isGrounded = false;
        isGrinding = false;
        currentRail = null;
        skierVy = 9.8;
        isSpinning = true;
        playSkiSfx('jump');
        spawnSnowSpark(skierX, skierY, skierZ, 0xffffff, 8);
    } else if (!isSpinning) {
        isSpinning = true;
        playSkiSfx('jump');
    }
}

function toggleCameraView() {
    cameraMode = cameraMode === 'chase' ? 'helmet' : 'chase';
    triggerBanner(cameraMode === 'helmet' ? '🎥 HELMET CAM' : '🎥 CHASE CAM', '#38bdf8', 0.8);
}

function formatKeyLabel(binding) {
    if (!binding) return '?';
    if (binding.startsWith('key:')) return binding.slice(4).toUpperCase();
    return binding.toUpperCase();
}

function updateControlsHudText() {
    const bar = document.getElementById('ski-hud-controls-bar');
    if (!bar) return;
    bar.textContent =
        `⬅️ LEFT: ${formatKeyLabel(keyBindings.left)}  •  ` +
        `➡️ RIGHT: ${formatKeyLabel(keyBindings.right)}  •  ` +
        `⬆️ JUMP/SPIN: ${formatKeyLabel(keyBindings.jump)}  •  ` +
        `🎥 VIEW: ${formatKeyLabel(keyBindings.view)}  •  Missed Gate = +3.0s`;
}

// --- INTERACTIVE PIANO / KEYBOARD CALIBRATION POPUP ---
function openCalibrationPopup(bridge) {
    isCalibratingKeys = true;
    calibIndex = 0;
    heldActions.left = false;
    heldActions.right = false;
    heldNotesMap.clear();

    let popup = document.getElementById('ski-slalom-calib-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'ski-slalom-calib-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(15, 23, 42, 0.97);
            border: 3px solid #38bdf8;
            border-radius: 16px;
            padding: 22px 26px;
            color: #ffffff;
            font-family: system-ui, -apple-system, sans-serif;
            z-index: 9999;
            width: 90%;
            max-width: 450px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85);
            text-align: center;
        `;
        document.body.appendChild(popup);
    }

    renderCalibrationPopupStep(popup, bridge);
    popup.style.display = 'block';
}

function renderCalibrationPopupStep(popup, bridge) {
    const currentStep = CALIB_STEPS[calibIndex];
    const rowsHtml = CALIB_STEPS.map((step, idx) => {
        const isCurrent = idx === calibIndex;
        const isDone = idx < calibIndex;
        const badgeText = formatKeyLabel(keyBindings[step.key]);
        return `
            <div style="
                display:flex; justify-content:space-between; align-items:center;
                padding:9px 12px; border-radius:8px; margin-bottom:7px;
                background:${isCurrent ? 'rgba(56,189,248,0.22)' : 'rgba(255,255,255,0.06)'};
                border:2px solid ${isCurrent ? step.color : (isDone ? '#22c55e' : 'transparent')};
            ">
                <span style="font-weight:800; font-size:14px;">${step.icon} ${step.label}</span>
                <span style="background:${isCurrent ? step.color : '#1e293b'}; color:${isCurrent ? '#0f172a' : '#facc15'}; font-weight:900; padding:3px 10px; border-radius:6px; font-size:13px;">
                    ${isCurrent ? '🎹 PRESS KEY NOW...' : badgeText}
                </span>
            </div>
        `;
    }).join('');

    popup.innerHTML = `
        <div style="font-size:32px; margin-bottom:4px;">⛷️🎹</div>
        <h2 style="margin:0 0 4px 0; font-size:24px; font-weight:900; color:#facc15;">ALPINE SLALOM KEY SETUP</h2>
        <p style="margin:0 0 14px 0; font-size:13px; color:#cbd5e1;">
            Play the <b>Piano Key</b> (or computer key) you want to use for <b style="color:${currentStep.color};">${currentStep.label}</b>:
        </p>

        <div style="margin-bottom:14px; text-align:left;">${rowsHtml}</div>

        <div style="display:flex; gap:10px; justify-content:center;">
            <button type="button" id="btn-ski-use-defaults" style="background:#334155; color:#fff; border:none; padding:10px 14px; border-radius:8px; font-weight:800; font-size:13px; cursor:pointer;">
                Use Defaults (C2 / E2 / G2 / B2)
            </button>
            <button type="button" id="btn-ski-drop-in" style="background:#22c55e; color:#052e16; border:none; padding:10px 18px; border-radius:8px; font-weight:900; font-size:14px; cursor:pointer;">
                ▶ Drop In!
            </button>
        </div>
    `;

    document.getElementById('btn-ski-use-defaults').onclick = () => {
        keyBindings = { ...DEFAULT_BINDINGS };
        saveBindings();
        localStorage.setItem('pianopad_ski_calibrated', 'true');
        finishCalibrationAndStart(popup, bridge);
    };

    document.getElementById('btn-ski-drop-in').onclick = () => {
        localStorage.setItem('pianopad_ski_calibrated', 'true');
        finishCalibrationAndStart(popup, bridge);
    };
}

function recordCalibratedKey(inputToken) {
    if (!isCalibratingKeys) return;
    const step = CALIB_STEPS[calibIndex];
    if (!step) return;

    keyBindings[step.key] = inputToken;
    saveBindings();

    // Audio & PianoPad key highlight feedback
    if (!inputToken.startsWith('key:')) {
        const freq = getNoteFrequency(inputToken);
        if (freq) playTone(freq, 0.25, 0.9);
        if (bridgeRef) bridgeRef.highlightKey(inputToken, 300, step.color);
    } else {
        playSkiSfx('gate_ok');
    }

    calibIndex++;
    const popup = document.getElementById('ski-slalom-calib-popup');
    if (calibIndex >= CALIB_STEPS.length) {
        localStorage.setItem('pianopad_ski_calibrated', 'true');
        if (popup) finishCalibrationAndStart(popup, bridgeRef);
    } else if (popup) {
        renderCalibrationPopupStep(popup, bridgeRef);
    }
}

function finishCalibrationAndStart(popup, bridge) {
    isCalibratingKeys = false;
    if (popup) popup.style.display = 'none';
    updateControlsHudText();
    resetCourseEntities();
    gamePhase = 'playing';
    lastFrameTime = performance.now();
    triggerBanner('⛷️ DROP IN! CLEAR ALL 30 GATES!', '#22c55e', 1.3);
    if (animFrameId === null) {
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}

// --- PUBLIC PIANOPAD LIFECYCLE & INPUT EXPORTS ---
export function stopSkiSlalom() {
    if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    gamePhase = 'finished';
    isCalibratingKeys = false;
    heldActions.left = false;
    heldActions.right = false;
    heldNotesMap.clear();

    window.removeEventListener('keydown', onWindowKeyDown, { capture: true });
    window.removeEventListener('keyup', onWindowKeyUp, { capture: true });
    window.removeEventListener('mouseup', onWindowPointerUp, { capture: true });
    window.removeEventListener('touchend', onWindowPointerUp, { capture: true });
    window.removeEventListener('resize', onWindowResize);

    const popup = document.getElementById('ski-slalom-calib-popup');
    if (popup) popup.style.display = 'none';

    if (renderer) {
        renderer.dispose();
        renderer = null;
    }
    if (containerEl) {
        containerEl.remove();
        containerEl = null;
    }
}

export async function startSkiSlalom(bridge) {
    initAudio();
    stopSkiSlalom();
    bridgeRef = bridge;

    bridge.exitActiveMiniGame();
    document.getElementById('game-results-modal')?.classList.remove('open');
    document.getElementById('arcade-hub')?.classList.remove('open');

    bridge.setActiveMiniGame('skiSlalom');
    bridge.resetGameStats();

    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.textContent = '⛷️ Loading 3D Alpine Engine...';

    try {
        await ensureThreeLoaded();
    } catch (err) {
        alert('Could not load 3D engine (Three.js). Your network may be blocking external CDN scripts.');
        bridge.exitActiveMiniGame();
        return;
    }

    if (!initThreeScene()) return;

    window.addEventListener('keydown', onWindowKeyDown, { capture: true });
    window.addEventListener('keyup', onWindowKeyUp, { capture: true });
    window.addEventListener('mouseup', onWindowPointerUp, { capture: true });
    window.addEventListener('touchend', onWindowPointerUp, { capture: true });
    window.addEventListener('resize', onWindowResize);

    resetCourseEntities();

    if (statusEl) {
        statusEl.textContent = '⛷️ 3D Ski Slalom: Carve through 30 gates (+3s per missed gate) & grind rails!';
    }

    const alreadyCalibrated = localStorage.getItem('pianopad_ski_calibrated') === 'true';
    if (!alreadyCalibrated) {
        gamePhase = 'calibration';
        openCalibrationPopup(bridge);
        renderer.render(scene, camera);
    } else {
        gamePhase = 'playing';
        lastFrameTime = performance.now();
        triggerBanner('⛷️ GO! SLALOM TIME TRIAL', '#22c55e', 1.2);
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}

export function handleSkiSlalomInput(noteStr, bridge) {
    const clean = normalizeNote(noteStr);
    if (!clean) return;

    if (isCalibratingKeys) {
        recordCalibratedKey(clean);
        return;
    }

    if (gamePhase !== 'playing') return;

    if (clean === normalizeNote(keyBindings.left)) {
        heldActions.left = true;
        heldNotesMap.set(clean, 'left');
        bridge.highlightKey(noteStr, 250, '#38bdf8');
    } else if (clean === normalizeNote(keyBindings.right)) {
        heldActions.right = true;
        heldNotesMap.set(clean, 'right');
        bridge.highlightKey(noteStr, 250, '#22c55e');
    } else if (clean === normalizeNote(keyBindings.jump)) {
        triggerSkierJumpOrSpin();
        bridge.highlightKey(noteStr, 250, '#facc15');
    } else if (clean === normalizeNote(keyBindings.view)) {
        toggleCameraView();
        bridge.highlightKey(noteStr, 250, '#ec4899');
    }
}

export function handleSkiSlalomRelease(noteStr) {
    const clean = normalizeNote(noteStr);
    const action = heldNotesMap.get(clean);
    if (action === 'left') heldActions.left = false;
    if (action === 'right') heldActions.right = false;
    heldNotesMap.delete(clean);
}

// --- MAIN 3D SIMULATION & RENDER LOOP ---
function finishSlalomRun(crashed = false) {
    if (gamePhase === 'finished' || gamePhase === 'crashed') return;
    gamePhase = crashed ? 'crashed' : 'finished';

    const totalTime = parseFloat((rawTimeSec + penaltySec).toFixed(2));
    const finalScore = crashed
        ? Math.max(0, gatesPassed * 25 + grindBonusPts)
        : Math.max(100, Math.round(5000 - totalTime * 45 + grindBonusPts));

    if (!crashed && (bestTimeSec === 0 || totalTime < bestTimeSec)) {
        bestTimeSec = totalTime;
        localStorage.setItem('pianopad_ski_slalom_best', String(bestTimeSec));
    }

    const summaryHtml = crashed
        ? `<span style="color:#ef4444; font-weight:900;">🌲 CRASHED INTO A PINE TREE!</span><br>` +
          `Gates Cleared: <b>${gatesPassed}/${TOTAL_GATES}</b>  •  Score: <span style="color:#facc15; font-weight:900;">${finalScore}</span>`
        : `<span style="color:#22c55e; font-weight:900;">🏁 SLALOM FINISH!</span><br>` +
          `Official Time: <span style="color:#facc15; font-size:1.45rem; font-weight:900;">${totalTime.toFixed(2)}s</span> ` +
          `<span style="font-size:0.8rem; color:#94a3b8;">(${rawTimeSec.toFixed(2)}s + ${penaltySec.toFixed(1)}s penalties)</span><br>` +
          `<span style="font-size:0.82rem; color:#38bdf8;">Gates: ${gatesPassed}/${TOTAL_GATES}  •  Spins: ${spinCount}  •  Grind Pts: +${grindBonusPts}</span>`;

    setTimeout(() => {
        if (!bridgeRef) return;
        const capturedPassed = gatesPassed;
        const capturedMissed = gatesMissed;
        stopSkiSlalom();
        bridgeRef.finishCustomMiniGame(
            '3D Ski Slalom',
            crashed ? finalScore : totalTime,
            summaryHtml,
            () => startSkiSlalom(bridgeRef)
        );

        requestAnimationFrame(() => {
            const totalG = capturedPassed + capturedMissed;
            const greenPct = totalG > 0 ? (capturedPassed / totalG) * 100 : 100;
            const redPct = totalG > 0 ? (capturedMissed / totalG) * 100 : 0;
            const barGreen = document.getElementById('bar-green');
            const barOrange = document.getElementById('bar-orange');
            const barRed = document.getElementById('bar-red');
            if (barGreen) barGreen.style.height = `${greenPct}%`;
            if (barOrange) barOrange.style.height = '0%';
            if (barRed) barRed.style.height = `${redPct}%`;
        });
    }, 950);
}

function gameLoop(now, bridge) {
    if (bridge.getActiveMiniGame() !== 'skiSlalom') {
        stopSkiSlalom();
        return;
    }

    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

    if (gamePhase === 'playing') {
        rawTimeSec += dt;

        // Horizontal carving steering
        const steerInput = (heldActions.right ? 1 : 0) - (heldActions.left ? 1 : 0);
        const steerAccel = isGrinding ? 24 : 38;
        skierVx += steerInput * steerAccel * dt;
        skierVx *= Math.pow(isGrinding ? 0.88 : 0.82, dt * 60);
        skierX = Math.max(-24, Math.min(24, skierX + skierVx * dt));

        // Downhill speed & advance
        const targetSpeed = isGrinding ? 29 : (24 + Math.min(10, gatesPassed * 0.25));
        forwardSpeed += (targetSpeed - forwardSpeed) * Math.min(1, dt * 3);
        skierZ -= forwardSpeed * dt;

        // Terrain & Rail vertical physics
        const groundY = getTerrainHeight(skierX, skierZ);

        // Check Grind Rail attachment
        if (!isGrinding && skierVy <= 1.5) {
            for (const rail of rails) {
                if (skierZ <= rail.zStart && skierZ >= rail.zEnd && Math.abs(skierX - rail.x) < 0.75) {
                    const railTopY = getTerrainHeight(rail.x, skierZ) + rail.height;
                    if (skierY >= railTopY - 0.45 && skierY <= railTopY + 0.75) {
                        isGrinding = true;
                        currentRail = rail;
                        skierX = rail.x;
                        skierY = railTopY;
                        skierVy = 0;
                        isSpinning = false;
                        spinRotation = 0;
                        playSkiSfx('grind');
                        triggerBanner('⚡ 50-50 RAIL GRIND!', '#facc15', 0.8);
                        break;
                    }
                }
            }
        }

        if (isGrinding && currentRail) {
            if (skierZ < currentRail.zEnd || Math.abs(skierX - currentRail.x) > 0.95) {
                isGrinding = false;
                currentRail = null;
                isGrounded = false;
                skierVy = 3.2;
            } else {
                skierY = getTerrainHeight(currentRail.x, skierZ) + currentRail.height;
                grindBonusPts += Math.round(120 * dt);
                if (Math.random() < 0.55) {
                    spawnSnowSpark(skierX, skierY, skierZ, 0xfacc15, 2);
                }
            }
        } else {
            skierVy -= 24 * dt;
            skierY += skierVy * dt;

            if (skierY <= groundY) {
                skierY = groundY;
                skierVy = 0;
                isGrounded = true;
                if (isSpinning) {
                    isSpinning = false;
                    spinRotation = 0;
                }
            } else {
                isGrounded = false;
            }
        }

        // Aerial 360 spin tracking
        if (isSpinning && !isGrounded) {
            spinRotation += 10.5 * dt;
            if (spinRotation >= Math.PI * 2) {
                spinRotation -= Math.PI * 2;
                spinCount++;
                grindBonusPts += 150;
                playSkiSfx('gate_ok');
                triggerBanner('🌀 360° AERIAL SPIN! +150', '#38bdf8', 0.85);
            }
        }

        // Kicker ramps launch skier into the air
        for (const k of kickers) {
            if (Math.abs(skierZ - k.z) < 1.8 && Math.abs(skierX - k.x) < k.width * 0.55 && isGrounded) {
                isGrounded = false;
                skierVy = 11.8;
                isSpinning = true;
                playSkiSfx('jump');
                triggerBanner('🚀 KICKER LAUNCH!', '#facc15', 0.75);
            }
        }

        // Slalom Gate checks (Missed gate adds +3.0s penalty instead of ending run!)
        for (const g of gates) {
            if (!g.passed && skierZ <= g.z) {
                g.passed = true;
                if (Math.abs(skierX - g.x) <= g.width * 0.54) {
                    gatesPassed++;
                    playSkiSfx('gate_ok');
                    spawnSnowSpark(skierX, skierY, skierZ, 0x22c55e, 6);
                } else {
                    gatesMissed++;
                    penaltySec += GATE_PENALTY_SEC;
                    playSkiSfx('gate_miss');
                    triggerBanner(`❌ MISSED GATE #${g.number} (+3.0s PENALTY)`, '#ef4444', 1.15);
                }
            }
        }

        // Tree collisions
        for (const t of trees) {
            if (Math.abs(skierZ - t.z) < 1.1 && Math.abs(skierX - t.x) < t.radius && skierY < getTerrainHeight(t.x, t.z) + 2.5) {
                playSkiSfx('crash');
                spawnSnowSpark(skierX, skierY + 0.5, skierZ, 0xef4444, 16);
                finishSlalomRun(true);
                break;
            }
        }

        // Check Finish Line
        if (gamePhase === 'playing' && skierZ <= finishLineZ) {
            playSkiSfx('finish');
            finishSlalomRun(false);
        }

        // Recycle snow terrain chunks ahead of skier
        for (const chunk of terrainChunks) {
            if (chunk.userData.baseZ - CHUNK_LEN / 2 > skierZ + 35) {
                const minZ = Math.min(...terrainChunks.map(c => c.userData.baseZ));
                repositionTerrainChunk(chunk, minZ - CHUNK_LEN);
            }
        }

        // Snow carving spray
        if (isGrounded && Math.abs(skierVx) > 2.5 && Math.random() < 0.6) {
            spawnSnowSpark(skierX, skierY, skierZ + 0.6, 0xffffff, 1);
        }
    }

    // Update particles
    for (let i = snowParticles.length - 1; i >= 0; i--) {
        const p = snowParticles[i];
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 14 * dt;
        p.life -= dt;
        if (p.life <= 0) {
            scene.remove(p.mesh);
            snowParticles.splice(i, 1);
        }
    }

    // Update skier transform & lean
    if (skierRoot && skierBodyGroup) {
        skierRoot.position.set(skierX, skierY, skierZ);
        const targetLean = isGrinding ? 0.35 : (-skierVx * 0.032);
        skierBodyGroup.rotation.z += (targetLean - skierBodyGroup.rotation.z) * Math.min(1, dt * 12);
        skierBodyGroup.rotation.y = isGrinding ? 0.55 : (spinRotation - skierVx * 0.025);
        skierBodyGroup.rotation.x = -SLOPE_ANGLE * 0.65;
    }

    // Update Sun & Camera
    if (sunLight) {
        sunLight.position.set(skierX + 35, skierY + 65, skierZ + 25);
    }
    if (camera) {
        if (cameraMode === 'helmet') {
            camera.position.set(skierX, skierY + 1.95, skierZ - 0.25);
            camera.lookAt(skierX + skierVx * 0.25, skierY + 0.6 - Math.tan(SLOPE_ANGLE) * 14, skierZ - 14);
        } else {
            camera.position.set(skierX * 0.72, skierY + 5.2, skierZ + 11.5);
            camera.lookAt(skierX * 0.85, skierY + 1.1, skierZ - 12);
        }
    }

    // Update DOM HUD
    const timeEl = document.getElementById('ski-hud-time');
    const gatesEl = document.getElementById('ski-hud-gates');
    const penEl = document.getElementById('ski-hud-penalties');
    const bannerEl = document.getElementById('ski-hud-banner');

    if (timeEl) timeEl.textContent = `${(rawTimeSec + penaltySec).toFixed(2)}s`;
    if (gatesEl) gatesEl.textContent = `${gatesPassed} / ${TOTAL_GATES}`;
    if (penEl) penEl.textContent = `+${penaltySec.toFixed(1)}s`;
    if (bannerEl) {
        if (bannerTimer > 0 && bannerText) {
            bannerEl.style.display = 'block';
            bannerEl.style.color = bannerColor;
            bannerEl.textContent = bannerText;
        } else {
            bannerEl.style.display = 'none';
        }
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }

    if (gamePhase !== 'finished' && gamePhase !== 'crashed') {
        animFrameId = requestAnimationFrame((t) => gameLoop(t, bridge));
    }
}
