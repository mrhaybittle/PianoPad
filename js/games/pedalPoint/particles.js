// js/games/pedalPoint/particles.js

function createDustPuffTexture(THREE) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.5, 'rgba(240, 224, 204, 0.45)');
  grad.addColorStop(1, 'rgba(200, 175, 145, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createParticleSystem(THREE, scene) {
  const dustPuffTex = createDustPuffTexture(THREE);

  const ROOST_COUNT = 220;
  const roostGeo = new THREE.BufferGeometry();
  const roostPositions = new Float32Array(ROOST_COUNT * 3);
  const roostColors = new Float32Array(ROOST_COUNT * 3);
  const roostData = [];
  for (let i = 0; i < ROOST_COUNT; i++) {
    roostPositions[i * 3 + 1] = -999;
    roostData.push({
      pos: new THREE.Vector3(0, -999, 0),
      vel: new THREE.Vector3(),
      life: 0,
      color: new THREE.Color(0x9b6438)
    });
  }
  roostGeo.setAttribute('position', new THREE.BufferAttribute(roostPositions, 3));
  roostGeo.setAttribute('color', new THREE.BufferAttribute(roostColors, 3));
  const roostSystem = new THREE.Points(
    roostGeo,
    new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.95 })
  );
  roostSystem.frustumCulled = false;
  scene.add(roostSystem);

  const DUST_COUNT = 160;
  const dustGeo = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustColors = new Float32Array(DUST_COUNT * 3);
  const dustData = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3 + 1] = -999;
    dustData.push({
      pos: new THREE.Vector3(0, -999, 0),
      vel: new THREE.Vector3(),
      life: 0,
      maxLife: 1.2,
      color: new THREE.Color(0xc89a6e)
    });
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
  const dustSystem = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: 2.35,
      map: dustPuffTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    })
  );
  dustSystem.frustumCulled = false;
  scene.add(dustSystem);

  let roostCursor = 0;
  let dustCursor = 0;

  function spawnDirtRoost(origin, sideDirX, sideDirZ, count, speed, hexColor = 0x8c5730) {
    for (let i = 0; i < count; i++) {
      const p = roostData[roostCursor];
      roostCursor = (roostCursor + 1) % ROOST_COUNT;
      p.pos.set(
        origin.x + (Math.random() - 0.5) * 0.45,
        origin.y + 0.18 + Math.random() * 0.25,
        origin.z + (Math.random() - 0.5) * 0.55
      );
      p.vel.set(
        sideDirX * (speed * (0.6 + Math.random() * 0.7)) + (Math.random() - 0.5) * 2.4,
        2.6 + Math.random() * (speed * 0.65),
        sideDirZ * (speed * (0.5 + Math.random() * 0.6)) + 2.5 + Math.random() * 3.0
      );
      p.life = 0.48 + Math.random() * 0.36;
      p.color.setHex(hexColor);
      p.color.offsetHSL((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.12);
    }
  }

  function spawnDustCloud(origin, sideDirX, sideDirZ, count, speed) {
    for (let i = 0; i < count; i++) {
      const p = dustData[dustCursor];
      dustCursor = (dustCursor + 1) % DUST_COUNT;
      p.pos.set(
        origin.x + (Math.random() - 0.5) * 0.8,
        origin.y + 0.35 + Math.random() * 0.45,
        origin.z + 0.4 + (Math.random() - 0.5) * 0.8
      );
      p.vel.set(
        sideDirX * (speed * (0.45 + Math.random() * 0.5)) + (Math.random() - 0.5) * 1.4,
        1.1 + Math.random() * 1.8,
        sideDirZ * (speed * 0.35) + 1.5 + Math.random() * 1.8
      );
      p.maxLife = 0.95 + Math.random() * 0.65;
      p.life = p.maxLife;
      p.color.setHex(0xd2a87e);
      p.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
    }
  }

  function update(dt) {
    const rPos = roostSystem.geometry.attributes.position;
    const rCol = roostSystem.geometry.attributes.color;
    for (let i = 0; i < ROOST_COUNT; i++) {
      const p = roostData[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= 17.5 * dt;
        p.pos.addScaledVector(p.vel, dt);
        rPos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
        rCol.setXYZ(i, p.color.r, p.color.g, p.color.b);
      } else {
        rPos.setXYZ(i, 0, -999, 0);
      }
    }
    rPos.needsUpdate = true;
    rCol.needsUpdate = true;

    const dPos = dustSystem.geometry.attributes.position;
    const dCol = dustSystem.geometry.attributes.color;
    for (let i = 0; i < DUST_COUNT; i++) {
      const p = dustData[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vel.multiplyScalar(Math.max(0, 1 - 1.9 * dt));
        p.vel.y += 0.45 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const fade = Math.max(0, p.life / p.maxLife);
        dPos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
        dCol.setXYZ(i, p.color.r * fade, p.color.g * fade, p.color.b * fade);
      } else {
        dPos.setXYZ(i, 0, -999, 0);
      }
    }
    dPos.needsUpdate = true;
    dCol.needsUpdate = true;
  }

  return { spawnDirtRoost, spawnDustCloud, update };
}
