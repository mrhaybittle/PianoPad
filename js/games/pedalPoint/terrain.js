// js/games/pedalPoint/terrain.js
import { LOOKOUT_WINDOWS } from './constants.js';

let trailParams = { p1: 0.4, p2: 1.7, p3: 2.9, a1: 22, a2: 11, a3: 4.5 };
let dirtFeatures = [];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function initTrailParams(seed) {
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

export function setDirtFeatures(features) {
  dirtFeatures = features || [];
}

export function getRainforestBlend(z) {
  function smoothBand(val, startZ, endZ, fade) {
    const enter = Math.max(0, Math.min(1, (startZ - val) / fade));
    const exit = Math.max(0, Math.min(1, (val - endZ) / fade));
    const sEnter = enter * enter * (3 - 2 * enter);
    const sExit = exit * exit * (3 - 2 * exit);
    return sEnter * sExit;
  }
  return Math.min(1, Math.max(smoothBand(z, -480, -1260, 90), smoothBand(z, -1780, -2750, 90)));
}

export function isLookoutZ(z) {
  return LOOKOUT_WINDOWS.some(w => z <= w.zMax && z >= w.zMin);
}

export function getTrailCenterX(z) {
  return (
    Math.sin(z * 0.0042 + trailParams.p1) * trailParams.a1 +
    Math.sin(z * 0.0115 + trailParams.p2) * trailParams.a2 +
    Math.cos(z * 0.023 + trailParams.p3) * trailParams.a3
  );
}

export function getTrailCurvature(z) {
  const eps = 2.0;
  return (getTrailCenterX(z - eps) - 2 * getTrailCenterX(z) + getTrailCenterX(z + eps)) / (eps * eps);
}

export function getBaseTrailY(z) {
  const dist = Math.max(0, -z);
  // Rhythmic pump rollers woven into the natural downhill grade
  const pumpRollers = Math.sin(z * 0.14) * 0.65 + Math.sin(z * 0.045) * 1.45;
  return 365 - 0.152 * dist + pumpRollers;
}

export function getFeatureHeightOffset(x, z) {
  let extraY = 0;
  for (let i = 0; i < dirtFeatures.length; i++) {
    const f = dirtFeatures[i];
    const dz = z - f.z;
    if (Math.abs(dz) > f.halfLen + 6) continue;
    const dx = Math.abs(x - f.x);
    if (dx > f.halfWidth + 1.8) continue;

    const latBlend = Math.max(0, Math.min(1, 1 - Math.max(0, dx - f.halfWidth * 0.72) / (f.halfWidth * 0.55 + 0.8)));
    const smoothLat = latBlend * latBlend * (3 - 2 * latBlend);

    let prof = 0;
    if (f.type === 'kicker') {
      // Steep takeoff ramp (dz from +halfLen down to 0), sharp lip drop, and sloped landing zone (-3 to -11)
      if (dz >= 0 && dz <= f.halfLen) {
        prof = Math.pow(1 - dz / f.halfLen, 1.45) * f.height;
      } else if (dz < 0 && dz >= -2.5) {
        prof = Math.max(0, 1 + dz / 2.5) * f.height * 0.45 - 0.35;
      } else if (dz < -5.5 && dz >= -12.5) {
        // Sloped dirt landing mound for smooth pump transitions
        const landT = (-dz - 5.5) / 7.0;
        prof = Math.sin(landT * Math.PI) * (f.height * 0.65);
      }
    } else if (f.type === 'tabletop') {
      const t = (f.halfLen - dz) / (f.halfLen * 2);
      if (t >= 0 && t <= 1) {
        if (t < 0.28) prof = Math.pow(t / 0.28, 1.35) * f.height;
        else if (t < 0.66) prof = f.height;
        else prof = ((1 - t) / 0.34) * f.height;
      }
    }
    extraY += prof * smoothLat;
  }
  return extraY;
}

export function getTerrainHeight(x, z) {
  const cx = getTrailCenterX(z);
  const dx = x - cx;
  const absDx = Math.abs(dx);
  const trailHalfWidth = 4.0;
  const baseY = getBaseTrailY(z);

  const curv = getTrailCurvature(z);
  const offTrail = Math.max(0, Math.min(1, (absDx - trailHalfWidth) / 3.0));
  // Deeper, carved singletrack berms on outside of corners
  const berm = (1 - offTrail * 0.45) * Math.max(-1.4, Math.min(2.4, curv * dx * 24.0));
  const rut = (1 - offTrail) * (-0.09 * Math.exp(-dx * dx * 0.8));

  const rfBlend = getRainforestBlend(z);
  let sideSlope = 0;
  if (dx > trailHalfWidth) {
    sideSlope = Math.pow(dx - trailHalfWidth, 1.26) * (0.45 + rfBlend * 0.12);
  } else if (dx < -trailHalfWidth) {
    const d = -dx - trailHalfWidth;
    const lipRise = Math.min(1.6, d * 0.55);
    const beyondLip = Math.max(0, d - 3.0);
    const coastalDrop = lipRise - Math.pow(beyondLip, 1.15) * 0.42;
    const gullyWall = Math.pow(d, 1.24) * 0.44;
    sideSlope = coastalDrop + (gullyWall - coastalDrop) * rfBlend;
  }

  const rough = offTrail * (Math.sin(x * 0.19 + z * 0.14) * 0.65 + Math.cos(x * 0.08 - z * 0.09) * 0.9);
  return baseY + berm + rut + sideSlope + rough + getFeatureHeightOffset(x, z);
}

export function getTerrainNormal(THREE, x, z, targetVec = new THREE.Vector3()) {
  const eps = 0.45;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  return targetVec.set(hL - hR, 2 * eps, hD - hU).normalize();
}
