// js/games/pedalPoint/bikeBuilder.js
import { mulberry32 } from './terrain.js';

function createJerseyTexture(THREE) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#0f766e');
  grad.addColorStop(0.5, '#2dd4bf');
  grad.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const rng = mulberry32(7731);
  for (let i = 0; i < 38; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 12 + rng() * 34;
    const rg = ctx.createRadialGradient(x, y, 2, x, y, r);
    const col = rng() > 0.5 ? 'rgba(255,255,255,0.45)' : 'rgba(13,148,136,0.42)';
    rg.addColorStop(0, col);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createTireTreadTexture(THREE) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b1f24';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#2d333b';
  for (let y = 0; y < size; y += 16) {
    ctx.fillRect(10, y + 2, 22, 8);
    ctx.fillRect(52, y + 6, 24, 8);
    ctx.fillRect(96, y + 2, 22, 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  return tex;
}

export function addTube(THREE, p1, p2, r1, r2, mat, parent) {
  const v1 = new THREE.Vector3(p1[0], p1[1], p1[2]);
  const v2 = new THREE.Vector3(p2[0], p2[1], p2[2]);
  const dist = v1.distanceTo(v2);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, dist, 10), mat);
  mesh.position.copy(v1).add(v2).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function createNoteSpriteLabel(THREE, text, bgHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgHex;
  ctx.beginPath();
  ctx.roundRect(18, 18, 220, 92, 24);
  ctx.fill();

  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 66);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 1.2, 1);
  return sprite;
}

export function createPlayerBike(THREE, scene) {
  const jerseyTex = createJerseyTexture(THREE);
  const tireTreadTex = createTireTreadTexture(THREE);

  const bikeRoot = new THREE.Group();
  const bikeVisual = new THREE.Group();
  const wheeliePivot = new THREE.Group();
  wheeliePivot.position.set(0, 0.42, 0.72);
  bikeVisual.position.set(0, -0.42, -0.72);
  wheeliePivot.add(bikeVisual);
  bikeRoot.add(wheeliePivot);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.32, metalness: 0.48 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.72 });
  const kashimaMat = new THREE.MeshStandardMaterial({ color: 0xd4a03a, roughness: 0.2, metalness: 0.88 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8a37c, roughness: 0.65 });
  const jerseyMat = new THREE.MeshStandardMaterial({ map: jerseyTex, roughness: 0.72 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: 0x1e242b, roughness: 0.88 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.2 });
  const goggleMat = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.85 });
  const packMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });

  function createMTBWheel() {
    const wheelGroup = new THREE.Group();
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x22262b, map: tireTreadTex, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 });
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.25, metalness: 0.92 });
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });

    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.068, 12, 26), tireMat);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.022, 8, 22), rimMat);
    rim.rotation.y = Math.PI / 2;
    wheelGroup.add(rim);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 10), rimMat);
    hub.rotation.z = Math.PI / 2;
    wheelGroup.add(hub);

    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.012, 16), rotorMat);
    rotor.rotation.z = Math.PI / 2;
    rotor.position.x = -0.055;
    wheelGroup.add(rotor);

    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.60, 4), spokeMat);
      spoke.rotation.x = (i / 8) * Math.PI;
      wheelGroup.add(spoke);
    }
    return wheelGroup;
  }

  const shadowGeo = new THREE.CircleGeometry(0.95, 18);
  shadowGeo.rotateX(-Math.PI / 2);
  const groundShadow = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ color: 0x050a08, transparent: true, opacity: 0.34, depthWrite: false })
  );
  groundShadow.position.y = 0.04;
  bikeRoot.add(groundShadow);

  const chassisGroup = new THREE.Group();
  bikeVisual.add(chassisGroup);

  addTube(THREE, [0, 0.46, 0.08], [0, 0.94, -0.56], 0.048, 0.056, frameMat, chassisGroup);
  addTube(THREE, [0, 1.04, -0.54], [0, 0.87, 0.25], 0.036, 0.044, frameMat, chassisGroup);
  addTube(THREE, [0, 0.46, 0.08], [0, 0.96, 0.28], 0.038, 0.042, frameMat, chassisGroup);
  addTube(THREE, [0, 0.90, -0.55], [0, 1.12, -0.63], 0.044, 0.044, darkMetalMat, chassisGroup);

  [-0.07, 0.07].forEach(xOff => {
    addTube(THREE, [xOff, 0.46, 0.08], [xOff, 0.42, 0.72], 0.022, 0.024, frameMat, chassisGroup);
    addTube(THREE, [xOff, 0.87, 0.25], [xOff, 0.42, 0.72], 0.020, 0.022, frameMat, chassisGroup);
  });

  addTube(THREE, [0, 0.84, 0.16], [0, 0.66, -0.18], 0.028, 0.032, kashimaMat, chassisGroup);
  addTube(THREE, [0, 0.96, 0.28], [0, 1.08, 0.33], 0.022, 0.022, kashimaMat, chassisGroup);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.28), gripMat);
  saddle.position.set(0, 1.10, 0.34);
  chassisGroup.add(saddle);

  const ebikeGroup = new THREE.Group();
  const batteryMesh = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.13, 0.72), darkMetalMat);
  batteryMesh.position.set(0, 0.71, -0.23);
  batteryMesh.rotation.x = 0.65;
  ebikeGroup.add(batteryMesh);
  const motorCasing = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.16, 12), darkMetalMat);
  motorCasing.rotation.z = Math.PI / 2;
  motorCasing.position.set(0, 0.46, 0.08);
  ebikeGroup.add(motorCasing);
  const batteryLed = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.02, 0.16), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  batteryLed.position.set(0, 0.79, -0.34);
  batteryLed.rotation.x = 0.65;
  ebikeGroup.add(batteryLed);
  ebikeGroup.visible = false;
  chassisGroup.add(ebikeGroup);

  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.048, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.35 })
  );
  bottle.position.set(0, 0.72, -0.18);
  bottle.rotation.x = 0.95;
  chassisGroup.add(bottle);

  const crankGroup = new THREE.Group();
  crankGroup.position.set(0, 0.46, 0.08);
  const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16), darkMetalMat);
  chainring.rotation.z = Math.PI / 2;
  chainring.position.x = 0.075;
  crankGroup.add(chainring);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.19, 0.03), darkMetalMat);
  leftArm.position.set(-0.10, -0.09, 0);
  crankGroup.add(leftArm);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.19, 0.03), darkMetalMat);
  rightArm.position.set(0.10, 0.09, 0);
  crankGroup.add(rightArm);
  chassisGroup.add(crankGroup);

  const rearWheel = createMTBWheel();
  rearWheel.position.set(0, 0.42, 0.72);
  chassisGroup.add(rearWheel);

  const steerGroup = new THREE.Group();
  steerGroup.position.set(0, 1.05, -0.60);
  chassisGroup.add(steerGroup);

  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.11), darkMetalMat);
  stem.position.set(0, 0.09, -0.04);
  steerGroup.add(stem);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.82, 10), darkMetalMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.11, -0.08);
  steerGroup.add(bar);

  [-0.36, 0.36].forEach(xOff => {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 10), gripMat);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(xOff, 0.11, -0.08);
    steerGroup.add(grip);
  });

  [-0.085, 0.085].forEach(xOff => {
    const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 10), kashimaMat);
    stanchion.position.set(xOff, -0.22, -0.11);
    stanchion.rotation.x = 0.36;
    steerGroup.add(stanchion);
  });

  const dhForkGroup = new THREE.Group();
  [-0.088, 0.088].forEach(xOff => {
    const upperTube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 10), kashimaMat);
    upperTube.position.set(xOff, 0.02, -0.025);
    upperTube.rotation.x = 0.36;
    dhForkGroup.add(upperTube);
  });
  const topCrown = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.038, 0.085), darkMetalMat);
  topCrown.position.set(0, 0.10, -0.015);
  dhForkGroup.add(topCrown);
  dhForkGroup.visible = false;
  steerGroup.add(dhForkGroup);

  const forkLowers = new THREE.Group();
  [-0.085, 0.085].forEach(xOff => {
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.44, 10), darkMetalMat);
    lower.position.set(xOff, -0.46, -0.19);
    lower.rotation.x = 0.36;
    forkLowers.add(lower);
  });
  const forkArch = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.035, 0.045), darkMetalMat);
  forkArch.position.set(0, -0.32, -0.14);
  forkLowers.add(forkArch);

  const frontWheel = createMTBWheel();
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

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.12), packMat);
  backpack.position.set(0, 0.25, 0.15);
  torsoGroup.add(backpack);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.56, -0.02);
  headGroup.rotation.x = -0.38;
  torsoGroup.add(headGroup);

  headGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 14), skinMat));
  const helmetShell = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetMat);
  helmetShell.position.set(0, 0.02, 0.01);
  headGroup.add(helmetShell);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.018, 0.12), helmetMat);
  visor.position.set(0, 0.09, -0.14);
  visor.rotation.x = -0.18;
  headGroup.add(visor);

  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.062, 0.055), goggleMat);
  goggles.position.set(0, 0.025, -0.115);
  headGroup.add(goggles);

  [-1, 1].forEach(side => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.21, 0.42, 0.0);
    torsoGroup.add(shoulder);
    addTube(THREE, [0, 0, 0], [side * 0.09, -0.14, -0.26], 0.052, 0.044, jerseyMat, shoulder);
    addTube(THREE, [side * 0.09, -0.14, -0.26], [side * 0.15, -0.24, -0.58], 0.040, 0.034, skinMat, shoulder);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), gripMat);
    glove.position.set(side * 0.15, -0.24, -0.58);
    shoulder.add(glove);
  });

  const riderLegs = [];
  [-1, 1].forEach(side => {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.13, 0.0, 0.05);
    riderGroup.add(legGroup);

    addTube(THREE, [0, 0, 0], [side * 0.02, -0.28, -0.18], 0.072, 0.056, shortsMat, legGroup);
    const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 10), gripMat);
    kneePad.position.set(side * 0.02, -0.28, -0.18);
    legGroup.add(kneePad);
    addTube(THREE, [side * 0.02, -0.28, -0.18], [0, -0.60, -0.06], 0.048, 0.036, skinMat, legGroup);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.065, 0.21), shoeMat);
    shoe.position.set(0, -0.63, -0.10);
    legGroup.add(shoe);

    riderLegs.push({ group: legGroup });
  });

  scene.add(bikeRoot);

  function setPresetGeometry(presetKey) {
    dhForkGroup.visible = (presetKey === 'downhill');
    ebikeGroup.visible = (presetKey === 'ebike');
    bottle.visible = (presetKey !== 'ebike');
  }

  return {
    bikeRoot,
    bikeVisual,
    wheeliePivot,
    groundShadow,
    chassisGroup,
    crankGroup,
    rearWheel,
    steerGroup,
    forkLowers,
    frontWheel,
    riderGroup,
    torsoGroup,
    headGroup,
    riderLegs,
    setPresetGeometry
  };
}

export function createGhostBike(THREE, scene) {
  const ghostMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.36,
    depthWrite: false
  });
  const ghostRoot = new THREE.Group();
  const ghostPivot = new THREE.Group();
  ghostPivot.position.set(0, 0.42, 0.72);
  const ghostBody = new THREE.Group();
  ghostBody.position.set(0, -0.42, -0.72);
  ghostPivot.add(ghostBody);
  ghostRoot.add(ghostPivot);

  addTube(THREE, [0, 0.46, 0.08], [0, 0.94, -0.56], 0.045, 0.052, ghostMat, ghostBody);
  addTube(THREE, [0, 1.04, -0.54], [0, 0.87, 0.25], 0.034, 0.040, ghostMat, ghostBody);
  addTube(THREE, [0, 0.46, 0.08], [0, 0.96, 0.28], 0.036, 0.040, ghostMat, ghostBody);
  addTube(THREE, [0, 0.90, -0.55], [0, 0.42, -0.86], 0.032, 0.030, ghostMat, ghostBody);

  const gWheel1 = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 18), ghostMat);
  gWheel1.rotation.y = Math.PI / 2;
  gWheel1.position.set(0, 0.42, 0.72);
  const gWheel2 = gWheel1.clone();
  gWheel2.position.set(0, 0.42, -0.86);
  const gTorso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.48, 0.22), ghostMat);
  gTorso.position.set(0, 1.42, 0.16);
  gTorso.rotation.x = 0.45;
  const gHead = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), ghostMat);
  gHead.position.set(0, 1.75, 0.04);
  const gBeacon = createNoteSpriteLabel(THREE, '👻 PB GHOST', 'rgba(16, 185, 129, 0.78)');
  gBeacon.position.set(0, 2.35, 0);
  gBeacon.scale.set(2.0, 1.0, 1);

  ghostBody.add(gWheel1, gWheel2, gTorso, gHead, gBeacon);
  ghostRoot.visible = false;
  scene.add(ghostRoot);

  return { ghostRoot, ghostPivot };
}
