// js/games/pedalPoint/coastalLevel.js
import { LEVELS, NOTE_PALETTE, SCALE_NOTES } from './constants.js';
import { mulberry32 } from './terrain.js';
import { createNoteSpriteLabel } from './bikeBuilder.js';

let coastalParams = { p1: 0.4, p2: 1.5, a1: 14, a2: 6 };

export function initCoastalParams(seed) {
  const rng = mulberry32(seed + 404);
  coastalParams = {
    p1: rng() * Math.PI * 2,
    p2: rng() * Math.PI * 2,
    a1: 12 + rng() * 8,
    a2: 5 + rng() * 4
  };
}

export function getCoastalPathX(z) {
  // Gentle sweeping coastal curve starting straight down Flagstaff Hill
  const startBlend = Math.min(1, Math.max(0, (-z - 35) / 140));
  const curve =
    Math.sin(z * 0.0045 + coastalParams.p1) * coastalParams.a1 +
    Math.sin(z * 0.012 + coastalParams.p2) * coastalParams.a2;
  return curve * startBlend;
}

export function getCoastalBaseY(z) {
  // Starts on Flagstaff Hill beside Wollongong Lighthouse (y = 22m),
  // drops down a fast paved hill into Wollongong Harbour (z = -180, y = 3.2m),
  // then rolls gently along the coastal parklands!
  if (z >= 0) {
    return 22.0 + z * 0.04;
  }
  if (z > -185) {
    const t = -z / 185; // 0 -> 1 down the lighthouse hill
    const smooth = t * t * (3 - 2 * t);
    return 22.0 - smooth * 18.8;
  }
  const distBeyond = -z - 185;
  return 3.2 + Math.sin(distBeyond * 0.025) * 0.35 + Math.cos(distBeyond * 0.07) * 0.16;
}

export function getCoastalTerrainHeight(x, z) {
  const pathX = getCoastalPathX(z);
  const dx = x - pathX; // Negative = Left (Park/Road/Escarpment), Positive = Right (Dune Drop-off -> Sand -> Ocean)
  const baseY = getCoastalBaseY(z);

  // Concrete bike path corridor (-2.6m to +2.6m)
  if (dx >= -2.6 && dx <= 2.6) {
    return baseY + 0.04;
  }

  // RIGHT SIDE (+X): Grass verge -> steep sandy dune drop-off -> flat beach sand -> ocean floor
  if (dx > 2.6) {
    const dRight = dx - 2.6;
    if (dRight < 3.5) {
      // Grassed coastal edge beside concrete path
      return baseY - dRight * 0.06;
    }
    if (dRight < 11.5) {
      // Drop-off down the grassy/sandy embankment to the beach
      const dropT = (dRight - 3.5) / 8.0;
      const smoothDrop = dropT * dropT * (3 - 2 * dropT);
      return baseY - 0.21 - smoothDrop * 2.55;
    }
    if (dRight < 36.0) {
      // Broad golden sand beach sloping gently to the shoreline
      const beachT = (dRight - 11.5) / 24.5;
      return baseY - 2.76 - beachT * 0.85;
    }
    // Shallow surf & ocean seabed
    const seaT = Math.min(1, (dRight - 36.0) / 80.0);
    return baseY - 3.61 - seaT * 3.5;
  }

  // LEFT SIDE (-X): Grassed parkland -> Coastal Road (-18 to -28) -> Escarpment foothills & mountain wall
  const dLeft = -dx - 2.6;
  if (dLeft < 14.0) {
    // Open grassed park area between path and coastal road
    return baseY + 0.05 + Math.sin(z * 0.03 + dLeft * 0.2) * 0.14 + dLeft * 0.025;
  }
  if (dLeft < 24.5) {
    // Flat coastal road (Cliff Rd / Marine Dr)
    return baseY + 0.42;
  }
  if (dLeft < 42.0) {
    // Grassy foothills rising toward the Illawarra Escarpment
    const footT = (dLeft - 24.5) / 17.5;
    return baseY + 0.42 + Math.pow(footT, 1.35) * 9.5;
  }
  // Towering Illawarra Escarpment mountain wall on the left
  const mtnT = dLeft - 42.0;
  const ridgeWave = Math.sin(z * 0.008) * 14 + Math.cos(z * 0.019) * 7;
  return baseY + 9.92 + Math.pow(mtnT, 1.18) * 1.45 + Math.max(0, ridgeWave * Math.min(1, mtnT / 30));
}

export function getCoastalTerrainNormal(THREE, x, z, targetVec = new THREE.Vector3()) {
  const eps = 0.45;
  const hL = getCoastalTerrainHeight(x - eps, z);
  const hR = getCoastalTerrainHeight(x + eps, z);
  const hD = getCoastalTerrainHeight(x, z - eps);
  const hU = getCoastalTerrainHeight(x, z + eps);
  return targetVec.set(hL - hR, 2 * eps, hD - hU).normalize();
}

function createMusicalNoteMesh(THREE, hexColor, scale = 1.0, emissiveBoost = 0.75) {
  const noteGroup = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: hexColor,
    emissive: hexColor,
    emissiveIntensity: emissiveBoost,
    roughness: 0.22,
    metalness: 0.15
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), mat);
  head.scale.set(1.24, 0.88, 0.65);
  head.rotation.z = 0.35;
  head.position.set(-0.14, -0.35, 0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), mat);
  stem.position.set(0.28, 0.28, 0);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.24, 0.14), mat);
  flag.position.set(0.52, 0.84, 0);
  flag.rotation.z = -0.48;
  noteGroup.add(head, stem, flag);
  noteGroup.scale.setScalar(scale);
  return noteGroup;
}

function createWollongongLighthouse(THREE) {
  const lh = new THREE.Group();
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.38 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
  const darkIronMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 });
  const glassGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

  // Stone/concrete octagonal base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.6, 3.2, 8), whiteMat);
  base.position.y = 1.6;
  base.castShadow = true;
  lh.add(base);

  // Main tapered white lighthouse tower
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.65, 17.5, 16), whiteMat);
  tower.position.y = 11.8;
  tower.castShadow = true;
  lh.add(tower);

  // Classic red band near top
  const redBand = new THREE.Mesh(new THREE.CylinderGeometry(1.82, 1.92, 2.2, 16), redMat);
  redBand.position.y = 18.8;
  lh.add(redBand);

  // Gallery balcony deck & railing
  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.35, 0.45, 16), whiteMat);
  balcony.position.y = 20.6;
  lh.add(balcony);

  const rail = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.08, 8, 20), darkIronMat);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 21.45;
  lh.add(rail);

  // Lantern room & beacon
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 2.6, 12), glassGlowMat);
  lantern.position.y = 22.0;
  lh.add(lantern);

  // Red dome roof & finial
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.45, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), redMat);
  dome.position.y = 23.3;
  lh.add(dome);

  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 1.6, 8), darkIronMat);
  spire.position.y = 25.1;
  lh.add(spire);

  // Keeper's cottage beside the lighthouse
  const cottage = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.4, 5.4), whiteMat);
  cottage.position.set(5.6, 1.7, -3.5);
  cottage.castShadow = true;
  lh.add(cottage);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.4, 4), redMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(5.6, 4.5, -3.5);
  lh.add(roof);

  return lh;
}

function createParkedCar(THREE, colorHex) {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3, metalness: 0.45 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.8 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.72, 4.4), bodyMat);
  chassis.position.y = 0.62;
  chassis.castShadow = true;
  car.add(chassis);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.62, 2.35), cabinMat);
  cabin.position.set(0, 1.22, -0.15);
  car.add(cabin);

  [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]].forEach(([wx, wz]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    car.add(w);
  });
  return car;
}

function createPathPedestrian(THREE, type, rng) {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdba882, roughness: 0.65 });
  const shirtColors = [0x38bdf8, 0xf97316, 0xfacc15, 0xec4899, 0x10b981, 0xf8fafc, 0xa855f7];
  const shortColors = [0x1e293b, 0x334155, 0x0369a1, 0x78350f];

  const shirtMat = new THREE.MeshStandardMaterial({
    color: shirtColors[Math.floor(rng() * shirtColors.length)],
    roughness: 0.75
  });
  const shortsMat = new THREE.MeshStandardMaterial({
    color: shortColors[Math.floor(rng() * shortColors.length)],
    roughness: 0.85
  });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.24), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  if (type === 'runner') torso.rotation.x = 0.18;
  group.add(torso);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), skinMat);
  head.position.set(0, 1.56, type === 'runner' ? -0.05 : 0);
  group.add(head);

  // Legs (pivoted for walking/running stride)
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.76, 0.16), shortsMat);
  leftLeg.position.set(-0.12, 0.45, 0);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.76, 0.16), shortsMat);
  rightLeg.position.set(0.12, 0.45, 0);
  group.add(leftLeg, rightLeg);

  // Arms
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.52, 0.12), skinMat);
  leftArm.position.set(-0.29, 1.12, 0);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.52, 0.12), skinMat);
  rightArm.position.set(0.29, 1.12, 0);
  group.add(leftArm, rightArm);

  let hitHalfWidth = 0.55;
  let labelText = 'WALKER';

  if (type === 'runner') {
    labelText = 'RUNNER';
    leftArm.rotation.x = 0.65;
    rightArm.rotation.x = -0.65;
  } else if (type === 'pram') {
    labelText = 'PRAM';
    hitHalfWidth = 0.72;
    leftArm.rotation.x = 0.75;
    rightArm.rotation.x = 0.75;

    const pramGroup = new THREE.Group();
    pramGroup.position.set(0, 0, -0.78);
    const pramBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.44, 0.82),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })
    );
    pramBody.position.y = 0.55;
    pramGroup.add(pramBody);

    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.5 })
    );
    hood.position.set(0, 0.75, 0.15);
    pramGroup.add(hood);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.05, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
    );
    handle.position.set(0, 0.96, 0.48);
    pramGroup.add(handle);

    const pWheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    [[-0.28, -0.32], [0.28, -0.32], [-0.28, 0.32], [0.28, 0.32]].forEach(([wx, wz]) => {
      const pw = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 10), pWheelMat);
      pw.rotation.z = Math.PI / 2;
      pw.position.set(wx, 0.14, wz);
      pramGroup.add(pw);
    });
    group.add(pramGroup);
  } else if (type === 'surfer') {
    labelText = 'SURFER';
    hitHalfWidth = 0.78;
    // Surfboard tucked horizontally under right arm
    const boardColors = [0xfef08a, 0x38bdf8, 0xfb7185, 0x34d399];
    const boardMat = new THREE.MeshStandardMaterial({
      color: boardColors[Math.floor(rng() * boardColors.length)],
      roughness: 0.25
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.54, 2.35), boardMat);
    board.position.set(0.38, 0.95, -0.15);
    board.rotation.z = -0.14;
    board.castShadow = true;
    group.add(board);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.08, 2.36),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    stripe.position.set(0.38, 0.95, -0.15);
    stripe.rotation.z = -0.14;
    group.add(stripe);
  }

  return { group, leftLeg, rightLeg, leftArm, rightArm, hitHalfWidth, labelText };
}

export function buildCoastalWorld(THREE, scene, seed, previousWorldGroup = null) {
  if (previousWorldGroup) scene.remove(previousWorldGroup);
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const length = LEVELS.coastal.length;
  initCoastalParams(seed);
  const rng = mulberry32(seed + 2026);

  // 1. Coastal Terrain Mesh (Escarpment -> Park -> Concrete Path -> Dune Drop -> Beach -> Ocean)
  const zStart = 45;
  const zEnd = -length - 120;
  const zSegs = 400;
  const xSegs = 44;
  const corridorHalfWidth = 95;

  const positions = [];
  const colors = [];
  const indices = [];

  const colConcrete = new THREE.Color(0xe2e8f0);
  const colGrass = new THREE.Color(0x4d9438);
  const colDuneGrass = new THREE.Color(0x7ca146);
  const colRoad = new THREE.Color(0x334155);
  const colEscarpment = new THREE.Color(0x28542a);
  const colSand = new THREE.Color(0xf3d999);
  const colWetSand = new THREE.Color(0xc9a96e);
  const tmpColor = new THREE.Color();

  for (let iz = 0; iz <= zSegs; iz++) {
    const z = zStart + (zEnd - zStart) * (iz / zSegs);
    const pathX = getCoastalPathX(z);

    for (let ix = 0; ix <= xSegs; ix++) {
      const u = (ix / xSegs) * 2 - 1;
      const signedOffset = Math.sign(u) * Math.pow(Math.abs(u), 1.35) * corridorHalfWidth;
      const x = pathX + signedOffset;
      const y = getCoastalTerrainHeight(x, z);
      positions.push(x, y, z);

      if (Math.abs(signedOffset) <= 2.65) {
        tmpColor.copy(colConcrete);
      } else if (signedOffset > 2.65) {
        const dR = signedOffset - 2.65;
        if (dR < 4.2) tmpColor.copy(colGrass);
        else if (dR < 10.5) tmpColor.copy(colDuneGrass).lerp(colSand, (dR - 4.2) / 6.3);
        else if (dR < 32.0) tmpColor.copy(colSand);
        else tmpColor.copy(colWetSand);
      } else {
        const dL = -signedOffset - 2.65;
        if (dL < 14.0) tmpColor.copy(colGrass);
        else if (dL < 24.5) tmpColor.copy(colRoad);
        else if (dL < 40.0) tmpColor.copy(colGrass).lerp(colEscarpment, (dL - 24.5) / 15.5);
        else tmpColor.copy(colEscarpment);
      }
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
    roughness: 0.88,
    side: THREE.DoubleSide
  })));

  // 2. Concrete Path Dashed Centreline & Edge Curbs (matches reference photo!)
  const dashGeo = new THREE.PlaneGeometry(0.16, 2.2);
  dashGeo.rotateX(-Math.PI / 2);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const dashCount = Math.floor((length + 60) / 6);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < dashCount; i++) {
    const z = 15 - i * 6;
    const px = getCoastalPathX(z);
    const py = getCoastalBaseY(z) + 0.06;
    const nextPx = getCoastalPathX(z - 2);
    const yaw = Math.atan2(-(nextPx - px), 2);
    dummy.position.set(px, py, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  }
  worldGroup.add(dashes);

  // 3. Wollongong Head Lighthouse on Flagstaff Hill (Right side of start!)
  const lighthouse = createWollongongLighthouse(THREE);
  const lhX = getCoastalPathX(-12) + 12.5;
  const lhY = getCoastalBaseY(-12) + 1.2;
  lighthouse.position.set(lhX, lhY, -12);
  worldGroup.add(lighthouse);

  // Black Heritage Iron Fence along the Harbour Lookout Hill (matches reference photo!)
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.7 });
  for (let z = -25; z >= -230; z -= 4) {
    const fx = getCoastalPathX(z) + 2.85;
    const fy = getCoastalBaseY(z);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 4.05), fenceMat);
    rail.position.set(fx, fy + 0.52, z);
    worldGroup.add(rail);
  }

  // 4. Wollongong Harbour & Belmore Basin (Bottom of the Lighthouse Hill, z = -160 to -390)
  const oceanLevel = -0.35;
  const oceanGeo = new THREE.PlaneGeometry(2400, 3600);
  oceanGeo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(oceanGeo, new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    emissive: 0x0369a1,
    emissiveIntensity: 0.28,
    roughness: 0.22,
    metalness: 0.35
  }));
  ocean.position.set(1180, oceanLevel, -1300);
  worldGroup.add(ocean);

  // White surf foam line along the beach
  const surfGeo = new THREE.PlaneGeometry(5.5, 2900);
  surfGeo.rotateX(-Math.PI / 2);
  const surfLine = new THREE.Mesh(surfGeo, new THREE.MeshBasicMaterial({
    color: 0xf0f9ff,
    transparent: true,
    opacity: 0.65
  }));
  surfLine.position.set(42, oceanLevel + 0.08, -1350);
  worldGroup.add(surfLine);

  // Harbour Rock Breakwaters & Belmore Basin Lighthouse
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.92, flatShading: true });
  const harbourBaseX = getCoastalPathX(-240) + 46;

  // Southern & Northern Breakwater arms enclosing Wollongong Harbour
  const southWall = new THREE.Mesh(new THREE.BoxGeometry(85, 3.2, 12), rockMat);
  southWall.position.set(harbourBaseX + 38, 0.8, -165);
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(12, 3.4, 185), rockMat);
  eastWall.position.set(harbourBaseX + 78, 0.9, -255);
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(62, 3.2, 12), rockMat);
  northWall.position.set(harbourBaseX + 48, 0.8, -345);
  worldGroup.add(southWall, eastWall, northWall);

  // Historic Breakwater Lighthouse at Harbour Entrance
  const oldLh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.5, 11.5, 12),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
  );
  oldLh.position.set(harbourBaseX + 78, 6.2, -325);
  const oldLhTop = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  oldLhTop.position.set(harbourBaseX + 78, 12.4, -325);
  worldGroup.add(oldLh, oldLhTop);

  // Moored Sailboats & Yachts inside Wollongong Harbour
  const hullWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.7 });
  for (let y = 0; y < 14; y++) {
    const yacht = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 6.8), hullWhite);
    hull.position.y = 0.4;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7.5, 6), mastMat);
    mast.position.set(0, 4.2, -0.5);
    yacht.add(hull, mast);
    yacht.position.set(
      harbourBaseX + 14 + rng() * 52,
      oceanLevel + 0.1,
      -185 - rng() * 145
    );
    yacht.rotation.y = (rng() - 0.5) * 0.5;
    worldGroup.add(yacht);
  }

  // 5. Summer Beachgoers on the Sand at the Start & Along the Coast
  const umbrellaColors = [0xef4444, 0x3b82f6, 0xfacc15, 0x10b981, 0xf97316];
  for (let b = 0; b < 34; b++) {
    const bz = -30 - b * 32 - rng() * 18;
    const bx = getCoastalPathX(bz) + 18 + rng() * 18;
    const by = getCoastalTerrainHeight(bx, bz);

    // Sunbather / Swimmer
    const person = new THREE.Group();
    const towel = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.04, 2.0),
      new THREE.MeshBasicMaterial({ color: umbrellaColors[b % umbrellaColors.length] })
    );
    towel.position.y = 0.03;
    person.add(towel);

    const bather = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.25, 1.35),
      new THREE.MeshStandardMaterial({ color: 0xd8a37c })
    );
    bather.position.y = 0.16;
    person.add(bather);

    // Every 2nd spot gets a bright summer beach umbrella
    if (b % 2 === 0) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc })
      );
      pole.position.set(0.7, 1.1, 0);
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(1.45, 0.65, 8),
        new THREE.MeshStandardMaterial({ color: umbrellaColors[(b + 1) % umbrellaColors.length] })
      );
      canopy.position.set(0.7, 2.1, 0);
      person.add(pole, canopy);
    }

    person.position.set(bx, by, bz);
    person.rotation.y = rng() * Math.PI;
    worldGroup.add(person);
  }

  // 6. Parked Cars along the Coastal Road (between Escarpment and Grassed Area)
  const carColors = [0xf8fafc, 0x1e293b, 0x3b82f6, 0xdc2626, 0x94a3b8, 0x0d9488];
  const roadLineGeo = new THREE.PlaneGeometry(0.18, 2.6);
  roadLineGeo.rotateX(-Math.PI / 2);
  const roadLines = new THREE.InstancedMesh(roadLineGeo, new THREE.MeshBasicMaterial({ color: 0xfef08a }), 240);
  for (let i = 0; i < 240; i++) {
    const rz = -20 - i * 10;
    const rx = getCoastalPathX(rz) - 21.8;
    const ry = getCoastalTerrainHeight(rx, rz) + 0.05;
    dummy.position.set(rx, ry, rz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    roadLines.setMatrixAt(i, dummy.matrix);
  }
  worldGroup.add(roadLines);

  for (let cz = -55; cz > -length + 60; cz -= 18 + rng() * 24) {
    const carX = getCoastalPathX(cz) - 18.2;
    const carY = getCoastalTerrainHeight(carX, cz);
    const car = createParkedCar(THREE, carColors[Math.floor(rng() * carColors.length)]);
    car.position.set(carX, carY, cz);
    worldGroup.add(car);
  }

  // 7. Norfolk Island Pines & Coastal Banksia Trees on the Grassed Parkland
  const pineTrunkGeo = new THREE.CylinderGeometry(0.22, 0.45, 16, 6);
  pineTrunkGeo.translate(0, 8, 0);
  const pineCrownGeo = new THREE.ConeGeometry(3.2, 11, 7);
  pineCrownGeo.translate(0, 12.5, 0);

  const pineTrunks = new THREE.InstancedMesh(pineTrunkGeo, new THREE.MeshStandardMaterial({ color: 0x5c4033 }), 140);
  const pineCrowns = new THREE.InstancedMesh(pineCrownGeo, new THREE.MeshStandardMaterial({ color: 0x1f5228, flatShading: true }), 140);
  let pCount = 0;
  for (let i = 0; i < 140; i++) {
    const pz = -40 - rng() * (length - 60);
    const px = getCoastalPathX(pz) - (4.8 + rng() * 10.5);
    const py = getCoastalTerrainHeight(px, pz);
    const sc = 0.75 + rng() * 0.65;
    dummy.position.set(px, py - 0.2, pz);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    pineTrunks.setMatrixAt(pCount, dummy.matrix);
    pineCrowns.setMatrixAt(pCount, dummy.matrix);
    pCount++;
  }
  pineTrunks.count = pineCrowns.count = pCount;
  worldGroup.add(pineTrunks, pineCrowns);

  // 8. Pedestrians on the Concrete Bike Path (Walkers, Runners, Prams, Surfers with Boards!)
  const pedestrians = [];
  const pedTypes = ['walker', 'runner', 'pram', 'surfer'];
  const laneOffsets = [-1.45, -0.45, 0.45, 1.45];

  for (let z = -95; z > -length + 90; z -= 34 + rng() * 24) {
    const type = pedTypes[Math.floor(rng() * pedTypes.length)];
    const laneOff = laneOffsets[Math.floor(rng() * laneOffsets.length)];
    const movingWithPlayer = rng() > 0.35; // Some moving north with you, some coming towards you
    const walkSpeed = type === 'runner' ? 4.4 : (type === 'pram' ? 1.5 : 1.8);

    const pedObj = createPathPedestrian(THREE, type, rng);
    const px = getCoastalPathX(z) + laneOff;
    const py = getCoastalBaseY(z) + 0.04;
    pedObj.group.position.set(px, py, z);
    pedObj.group.rotation.y = movingWithPlayer ? 0 : Math.PI;
    worldGroup.add(pedObj.group);

    pedestrians.push({
      ...pedObj,
      type,
      z,
      laneOff,
      velZ: movingWithPlayer ? -walkSpeed : walkSpeed,
      phase: rng() * Math.PI * 2,
      resolved: false,
      nearMissAwarded: false
    });
  }

  // 9. Musical Note Gates along the Path (Speed & Flow Boosters)
  const noteGates = [];
  const floatingNotes = [];
  for (let z = -120; z > -length + 120; z -= 135 + rng() * 35) {
    const note = SCALE_NOTES[Math.floor(rng() * SCALE_NOTES.length)];
    const laneOff = (rng() - 0.5) * 3.0;
    const x = getCoastalPathX(z) + laneOff;
    const y = getCoastalBaseY(z) + 0.04;

    const gateGroup = new THREE.Group();
    gateGroup.position.set(x, y, z);
    const mat = new THREE.MeshStandardMaterial({
      color: note.color,
      emissive: note.color,
      emissiveIntensity: 0.9
    });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 8, 20, Math.PI), mat);
    arch.position.y = 0.2;
    gateGroup.add(arch);

    const noteIcon = createMusicalNoteMesh(THREE, note.color, 0.95, 0.95);
    noteIcon.position.set(0, 1.15, 0);
    gateGroup.add(noteIcon);
    floatingNotes.push({ mesh: noteIcon, baseY: 1.15, phase: z * 0.1 });

    const badge = createNoteSpriteLabel(THREE, `♪ ${note.name}`, note.hex);
    badge.position.set(0, 2.75, 0);
    badge.scale.set(1.9, 0.95, 1);
    gateGroup.add(badge);

    worldGroup.add(gateGroup);
    noteGates.push({ x, y, z, note, mesh: gateGroup, hit: false });
  }

  // 10. Finish Archway at North Wollongong / Stuart Park
  const fz = -length;
  const fx = getCoastalPathX(fz);
  const fy = getCoastalBaseY(fz);
  const archGroup = new THREE.Group();
  archGroup.position.set(fx, fy, fz);
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 1.0, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0284c7, emissiveIntensity: 0.65 })
  );
  banner.position.set(0, 4.4, 0);
  archGroup.add(banner);
  worldGroup.add(archGroup);

  return {
    worldGroup,
    noteGates,
    rhythmRamps: [],
    trailObstacles: [],
    melodyChallenges: [],
    cargoShips: [],
    floatingNotes,
    coastalBirds: [],
    hangGliders: [],
    pedestrians
  };
}
