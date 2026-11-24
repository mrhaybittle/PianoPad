// js/games/pedalPoint/worldBuilder.js
import { TRAIL_LENGTH, NOTE_PALETTE, SCALE_NOTES } from './constants.js';
import {
  mulberry32,
  initTrailParams,
  setDirtFeatures,
  getRainforestBlend,
  isLookoutZ,
  getTrailCenterX,
  getBaseTrailY,
  getTerrainHeight
} from './terrain.js';
import { createNoteSpriteLabel } from './bikeBuilder.js';

function createMusicalNoteMesh(THREE, hexColor, scale = 1.0, emissiveBoost = 0.75) {
  const noteGroup = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: hexColor,
    emissive: hexColor,
    emissiveIntensity: emissiveBoost,
    roughness: 0.22,
    metalness: 0.15
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), mat);
  head.scale.set(1.24, 0.88, 0.65);
  head.rotation.z = 0.35;
  head.position.set(-0.14, -0.35, 0);
  noteGroup.add(head);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 10), mat);
  stem.position.set(0.28, 0.28, 0);
  noteGroup.add(stem);

  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.24, 0.14), mat);
  flag.position.set(0.52, 0.84, 0);
  flag.rotation.z = -0.48;
  noteGroup.add(flag);

  noteGroup.scale.setScalar(scale);
  return noteGroup;
}

export function buildWorld(THREE, scene, seed, previousWorldGroup = null) {
  if (previousWorldGroup) scene.remove(previousWorldGroup);
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  initTrailParams(seed);
  const rng = mulberry32(seed + 1337);

  const melodyZones = [
    { startZ: -640, endZ: -950 },
    { startZ: -1640, endZ: -1950 }
  ];
  const inMelodyCorridor = (z) => melodyZones.some(mz => z <= mz.startZ + 35 && z >= mz.endZ - 35);

  // 1. Dirt Kickers & Tabletop Jumps
  const dirtFeatures = [];
  const rhythmRamps = [];
  for (let z = -85; z > -TRAIL_LENGTH + 110; z -= 88 + rng() * 42) {
    if (inMelodyCorridor(z)) continue;
    const cx = getTrailCenterX(z);
    const isTable = rng() > 0.46;
    const feat = {
      x: cx,
      z,
      type: isTable ? 'tabletop' : 'kicker',
      halfLen: isTable ? 9.0 : 5.5,
      halfWidth: 3.1,
      height: isTable ? (1.65 + rng() * 0.55) : (1.75 + rng() * 0.65),
      triggered: false
    };
    dirtFeatures.push(feat);
    rhythmRamps.push(feat);
  }
  setDirtFeatures(dirtFeatures);

  // 2. Terrain Mesh
  const zStart = 45;
  const zEnd = -TRAIL_LENGTH - 95;
  const zSegs = 420;
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
      if (absDx < 3.6) tmpColor.copy(colDirt).lerp(colDirtWarm, absDx / 3.6);
      else tmpColor.copy(colFern).lerp(colRainforest, Math.min(1, (absDx - 3.6) / 18 + rfBlend * 0.5));
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

  // 3. Fallen Mossy Eucalyptus Logs & Wooden North-Shore Trail Features
  const trailObstacles = [];
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92, flatShading: true });
  const cutWoodMat = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.75 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x3f7a2c, roughness: 0.9 });
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x784b2a, roughness: 0.85 });

  for (let z = -60; z > -TRAIL_LENGTH + 90; z -= 75 + rng() * 38) {
    if (inMelodyCorridor(z)) continue;
    if (rhythmRamps.some(r => Math.abs(r.z - z) < 16)) continue;

    const cx = getTrailCenterX(z);
    const isLog = rng() > 0.34;

    if (isLog) {
      const fullWidth = rng() > 0.45;
      const sideSign = rng() > 0.5 ? 1 : -1;
      const logLen = fullWidth ? 7.6 : 4.4;
      const logX = fullWidth ? cx : (cx + sideSign * 1.4);
      const logRadius = 0.34 + rng() * 0.14;
      const logY = getTerrainHeight(logX, z) + logRadius * 0.72;

      const logGroup = new THREE.Group();
      logGroup.position.set(logX, logY, z);
      logGroup.rotation.y = (rng() - 0.5) * 0.22;

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(logRadius, logRadius * 1.08, logLen, 10), barkMat);
      trunk.rotation.z = Math.PI / 2;
      trunk.castShadow = true;
      logGroup.add(trunk);

      [-logLen / 2, logLen / 2].forEach(endX => {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(logRadius * 0.96, logRadius * 0.96, 0.04, 10), cutWoodMat);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = endX;
        logGroup.add(cap);
      });

      const moss = new THREE.Mesh(new THREE.BoxGeometry(logLen * 0.55, 0.08, logRadius * 0.9), mossMat);
      moss.position.set(0, logRadius * 0.92, 0);
      logGroup.add(moss);

      worldGroup.add(logGroup);
      trailObstacles.push({
        type: 'log',
        x: logX,
        z,
        halfWidth: logLen * 0.48,
        height: logRadius * 1.85,
        resolved: false
      });
    } else {
      const bridgeLen = 14 + rng() * 6;
      const bridgeWidth = 1.65;
      const bridgeX = cx + (rng() - 0.5) * 2.2;
      const startY = getTerrainHeight(bridgeX, z + bridgeLen / 2);
      const endY = getTerrainHeight(bridgeX, z - bridgeLen / 2);
      const midY = (startY + endY) * 0.5 + 0.35;
      const pitch = Math.atan2(endY - startY, -bridgeLen);

      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(bridgeX, midY, z);
      bridgeGroup.rotation.x = pitch;

      const deck = new THREE.Mesh(new THREE.BoxGeometry(bridgeWidth, 0.14, bridgeLen), plankMat);
      deck.castShadow = true;
      bridgeGroup.add(deck);

      [-bridgeWidth * 0.46, bridgeWidth * 0.46].forEach(rx => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, bridgeLen), cutWoodMat);
        rail.position.set(rx, 0.1, 0);
        bridgeGroup.add(rail);
      });

      [-bridgeLen * 0.35, 0, bridgeLen * 0.35].forEach(pz => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6), barkMat);
        post.position.set(0, -0.7, pz);
        bridgeGroup.add(post);
      });

      worldGroup.add(bridgeGroup);
      trailObstacles.push({
        type: 'bridge',
        x: bridgeX,
        z,
        halfLen: bridgeLen * 0.5,
        halfWidth: bridgeWidth * 0.55,
        awarded: false
      });
    }
  }

  // 4. Procedural Ocean Wave Texture & Illawarra Coastline
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
  ocean.position.set(-920, oceanY, -1450);
  worldGroup.add(ocean);

  const plainGeo = new THREE.PlaneGeometry(540, 3800);
  plainGeo.rotateX(-Math.PI / 2);
  const plain = new THREE.Mesh(plainGeo, new THREE.MeshStandardMaterial({ color: 0x3b6936, roughness: 0.95 }));
  plain.position.set(-340, oceanY + 4, -1350);
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
  lake.position.set(-415, oceanY + 6.5, -1520);
  worldGroup.add(lake);

  const hillMat = new THREE.MeshStandardMaterial({ color: 0x2c5c30, roughness: 0.92, flatShading: true });
  for (let i = 0; i < 24; i++) {
    const r = 65 + rng() * 90;
    const h = 75 + rng() * 140;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), hillMat);
    hill.scale.set(1.2, 1, 1.8);
    hill.position.set(-140 - rng() * 185, oceanY + h * 0.45, 50 - i * 115);
    worldGroup.add(hill);
  }

  const cargoShips = [];
  const floatingNotes = [];
  const coastalBirds = [];
  const hangGliders = [];

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6, metalness: 0.35, fog: false });
  const waterlineMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7, fog: false });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8, fog: false });
  const hatchMat = new THREE.MeshStandardMaterial({ color: 0x7c4a32, roughness: 0.85, fog: false });
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, fog: false });
  const funnelMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5, fog: false });
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.55, fog: false });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.72 });

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
    { x: -940,  z: -1340, rotY: 0.05,  scale: 2.10, speed: 3.8 },
    { x: -720,  z: -1620, rotY: -0.15, scale: 1.80, speed: -3.1 },
    { x: -1020, z: -1940, rotY: 0.10,  scale: 2.20, speed: 2.5 },
    { x: -760,  z: -2320, rotY: 0.02,  scale: 1.85, speed: 3.2 }
  ];

  shipPlacements.forEach(sp => {
    const ship = createCargoShip(sp.scale);
    ship.position.set(sp.x, oceanY + 0.6, sp.z);
    ship.rotation.y = sp.rotY;
    worldGroup.add(ship);
    cargoShips.push({ mesh: ship, speed: sp.speed });
  });

  // Sulphur-Crested Cockatoo Flocks
  const cockatooBodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const crestMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  for (let f = 0; f < 5; f++) {
    const flockZ = -160 - f * 480;
    const flockBaseX = getTrailCenterX(flockZ) - 14;
    const flockBaseY = getBaseTrailY(flockZ) + 12;
    for (let b = 0; b < 6; b++) {
      const bird = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.65, 6), cockatooBodyMat);
      body.rotation.x = -Math.PI / 2;
      bird.add(body);

      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 5), crestMat);
      crest.position.set(0, 0.16, -0.22);
      crest.rotation.x = 0.45;
      bird.add(crest);

      const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.26), cockatooBodyMat);
      leftWing.position.set(-0.34, 0, 0);
      const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.26), cockatooBodyMat);
      rightWing.position.set(0.34, 0, 0);
      bird.add(leftWing, rightWing);

      bird.position.set(
        flockBaseX + (rng() - 0.5) * 14,
        flockBaseY + (rng() - 0.5) * 6,
        flockZ + (rng() - 0.5) * 18
      );
      worldGroup.add(bird);
      coastalBirds.push({
        mesh: bird,
        leftWing,
        rightWing,
        originX: bird.position.x,
        originY: bird.position.y,
        originZ: bird.position.z,
        phase: rng() * Math.PI * 2,
        startled: false,
        startleVel: new THREE.Vector3()
      });
    }
  }

  // Coastal Hang-Gliders
  const sailColors = [0xef4444, 0x38bdf8, 0xfbbf24];
  [-310, -1420, -2100].forEach((gz, idx) => {
    const glider = new THREE.Group();
    const wingMat = new THREE.MeshStandardMaterial({
      color: sailColors[idx % sailColors.length],
      emissive: sailColors[idx % sailColors.length],
      emissiveIntensity: 0.2,
      side: THREE.DoubleSide,
      roughness: 0.4
    });
    const deltaGeo = new THREE.BufferGeometry();
    deltaGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, -3.2,
      -5.8, 0.3, 2.2,
      5.8, 0.3, 2.2
    ], 3));
    deltaGeo.computeVertexNormals();
    const sail = new THREE.Mesh(deltaGeo, wingMat);
    glider.add(sail);

    const pilot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 1.8), darkMetalMat);
    pilot.position.set(0, -1.1, 0.3);
    glider.add(pilot);

    const centerX = getTrailCenterX(gz) - 65 - idx * 15;
    const centerY = getBaseTrailY(gz) + 18;
    glider.position.set(centerX, centerY, gz);
    worldGroup.add(glider);
    hangGliders.push({
      mesh: glider,
      centerX,
      centerY,
      centerZ: gz,
      radiusX: 28 + idx * 6,
      radiusZ: 45 + idx * 8,
      speed: 0.22 + idx * 0.04,
      phase: idx * 2.1
    });
  });

  // Eucalyptus Trees
  const gumCount = 580;
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

    const dist = 6.2 + Math.pow(rng(), 1.25) * 40;
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

  // High-Visibility Melodic Note Gates
  const noteGates = [];
  for (let z = -95; z > -TRAIL_LENGTH + 110; z -= 108 + rng() * 30) {
    if (inMelodyCorridor(z)) continue;
    const note = SCALE_NOTES[Math.floor(rng() * SCALE_NOTES.length)];
    const x = getTrailCenterX(z) + (rng() - 0.5) * 2.4;
    const y = getTerrainHeight(x, z);

    const gateGroup = new THREE.Group();
    gateGroup.position.set(x, y, z);
    const mat = new THREE.MeshStandardMaterial({
      color: note.color,
      emissive: note.color,
      emissiveIntensity: 0.95,
      roughness: 0.2
    });

    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.22, 10, 24, Math.PI), mat);
    arch.position.y = 0.25;
    gateGroup.add(arch);

    [-2.45, 2.45].forEach(px => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 1.35, 10), mat);
      pillar.position.set(px, 0.65, 0);
      gateGroup.add(pillar);
    });

    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 1.3),
      new THREE.MeshBasicMaterial({ color: note.color, transparent: true, opacity: 0.42 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.08;
    gateGroup.add(pad);

    const noteIcon = createMusicalNoteMesh(THREE, note.color, 1.25, 0.95);
    noteIcon.position.set(0, 1.45, 0);
    gateGroup.add(noteIcon);
    floatingNotes.push({ mesh: noteIcon, baseY: 1.45, phase: z * 0.1 });

    const badgeSprite = createNoteSpriteLabel(THREE, `♪ ${note.name}`, note.hex);
    badgeSprite.position.set(0, 3.55, 0);
    gateGroup.add(badgeSprite);

    worldGroup.add(gateGroup);
    noteGates.push({ x, y, z, note, mesh: gateGroup, hit: false });
  }

  // Beat-Synced Jump Strips & Wooden Takeoff Lips
  rhythmRamps.forEach(feat => {
    const stripY = getTerrainHeight(feat.x, feat.z) + 0.08;
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(feat.halfWidth * 1.9, 0.9),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.92 })
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(feat.x, stripY, feat.z + 0.35);
    worldGroup.add(strip);

    const lipBoard = new THREE.Mesh(new THREE.BoxGeometry(feat.halfWidth * 1.95, 0.22, 0.45), cutWoodMat);
    lipBoard.position.set(feat.x, stripY - 0.04, feat.z);
    worldGroup.add(lipBoard);
  });

  // Spacious Melody Trail Challenges
  const melodyChallenges = [];
  const noteKeys = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
  const laneOffsets = [-2.2, 0.0, 2.2];

  [-660, -1660].forEach(firstRowZ => {
    const seq = [Math.floor(rng() * 3), Math.floor(rng() * 3), Math.floor(rng() * 3), Math.floor(rng() * 3)];
    const rows = [];
    const rowSpacing = 58;
    const targetPoints = [];

    for (let step = 0; step < 4; step++) {
      const rowZ = firstRowZ - step * rowSpacing;
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
        const oy = getTerrainHeight(ox, rowZ) + 1.35;
        const isTarget = (lane === seq[step]);

        if (isTarget) {
          targetPoints.push(new THREE.Vector3(ox, oy - 1.15, rowZ));
        }

        const orbContainer = new THREE.Group();
        orbContainer.position.set(ox, oy, rowZ);

        const noteMesh = createMusicalNoteMesh(THREE, info.color, isTarget ? 1.55 : 0.65, isTarget ? 1.1 : 0.3);
        orbContainer.add(noteMesh);

        let ringMesh = null;
        let beamMesh = null;
        if (isTarget) {
          ringMesh = new THREE.Mesh(
            new THREE.RingGeometry(1.05, 1.55, 24),
            new THREE.MeshBasicMaterial({ color: info.color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
          );
          ringMesh.rotation.x = -Math.PI / 2;
          ringMesh.position.y = -1.22;
          orbContainer.add(ringMesh);

          beamMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.42, 6.5, 12, 1, true),
            new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
          );
          beamMesh.position.y = 2.0;
          orbContainer.add(beamMesh);

          const targetSprite = createNoteSpriteLabel(THREE, `♪ ${info.label}`, info.hex);
          targetSprite.position.set(0, 1.9, 0);
          orbContainer.add(targetSprite);
        }

        worldGroup.add(orbContainer);
        floatingNotes.push({ mesh: noteMesh, baseY: 0, phase: step + lane });

        orbs.push({ mesh: orbContainer, ringMesh, beamMesh, lane, x: ox, baseY: oy, info });
      }
      rows.push({ z: rowZ, targetLane: seq[step], orbs, resolved: false });
    }

    if (targetPoints.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(targetPoints);
      const guideGeo = new THREE.TubeGeometry(curve, 36, 0.14, 6, false);
      const guideMat = new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.48,
        depthWrite: false
      });
      worldGroup.add(new THREE.Mesh(guideGeo, guideMat));
    }

    const lastRowZ = firstRowZ - 3 * rowSpacing;
    melodyChallenges.push({
      firstRowZ,
      triggerZ: firstRowZ + 125,
      endZ: lastRowZ - 18,
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

  return {
    worldGroup,
    noteGates,
    rhythmRamps,
    trailObstacles,
    melodyChallenges,
    cargoShips,
    floatingNotes,
    coastalBirds,
    hangGliders
  };
}
