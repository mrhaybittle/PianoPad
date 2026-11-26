// js/games/chordBowl/chordBowlPhysics.js
// 3D-space ball hook/spin, oil drag, pin-to-pin impulse transfer & 3D topple/tilt dynamics.
// Coordinate system:
//   x: normalized across lane [-1.0 (left gutter) .. +1.0 (right gutter)]
//   z: normalized along lane [0.0 (foul line / release) .. 1.0 (pin deck)]

const RACK_LAYOUT_3D = [
    { index: 0, dx:  0.00, dz: 0.00 }, // Pin 1 (Headpin)
    { index: 1, dx: -0.13, dz: 0.055 }, // Pin 2
    { index: 2, dx:  0.13, dz: 0.055 }, // Pin 3
    { index: 3, dx: -0.26, dz: 0.110 }, // Pin 4
    { index: 4, dx:  0.00, dz: 0.110 }, // Pin 5
    { index: 5, dx:  0.26, dz: 0.110 }, // Pin 6
    { index: 6, dx: -0.39, dz: 0.165 }, // Pin 7
    { index: 7, dx: -0.13, dz: 0.165 }, // Pin 8
    { index: 8, dx:  0.13, dz: 0.165 }, // Pin 9
    { index: 9, dx:  0.39, dz: 0.165 }  // Pin 10
];

const DECK_Z = 0.80;

export function createTenPins(scaleNotes = []) {
    return RACK_LAYOUT_3D.map((slot, idx) => ({
        index: idx,
        x: slot.dx,
        z: DECK_Z + slot.dz,
        vx: 0,
        vz: 0,
        radius: 0.052,
        mass: 1.0,
        down: false,
        wasDownBeforeRoll: false,
        tilt: 0,        // 0 = upright, ~1.45 rad = lying flat
        tiltDirX: 0,
        tiltDirZ: -1,
        spinAngle: 0,
        hitByBall: false,
        note: scaleNotes[idx % Math.max(1, scaleNotes.length)] || 'c2'
    }));
}

export function computeAimXFromMidiNote(noteStr) {
    const m = String(noteStr || '').toLowerCase().match(/^([a-g])(#|b)?(\d+)$/);
    if (!m) return 0;
    const baseMap = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
    let semi = baseMap[m[1]];
    if (m[2] === '#') semi += 1;
    if (m[2] === 'b') semi -= 1;
    const midi = (parseInt(m[3], 10) + 1) * 12 + semi;

    // C3 (48) -> -0.82, C4 (60) -> 0.0, C5 (72) -> +0.82 (inside gutters)
    const clamped = Math.max(48, Math.min(72, midi));
    return ((clamped - 60) / 12) * 0.82;
}

export function stepBallAndPins(ball, pins, dtSec) {
    const events = [];
    const playLimitX = 0.84;
    const gutterLimitX = 0.96;

    if (ball.active) {
        ball.trail.push({ x: ball.x, z: ball.z });
        if (ball.trail.length > 14) ball.trail.shift();

        // Hook / spin lateral acceleration increases as ball enters dry backend (z > 0.55)
        const backendFactor = ball.z > 0.55 ? 1.45 : 0.65;
        const hookAccel = (ball.hookCurve * backendFactor * 0.95 + ball.spin * 0.75);
        ball.vx += hookAccel * dtSec;

        // Oil drag
        const drag = Math.pow(0.88, dtSec);
        ball.vx *= drag;
        ball.vz *= drag;

        ball.x += ball.vx * dtSec;
        ball.z += ball.vz * dtSec;
        ball.rollRotation += (ball.vz * 18 + ball.spin * 6) * dtSec;

        // Gutter check
        if (Math.abs(ball.x) + ball.radius > playLimitX) {
            if (!ball.inGutter) {
                ball.inGutter = true;
                events.push({ type: 'gutter' });
            }
            const sign = ball.x >= 0 ? 1 : -1;
            ball.x = sign * (gutterLimitX - ball.radius * 0.5);
            ball.vx = 0;
        }

        // Ball vs standing pins
        for (const pin of pins) {
            if (pin.down) continue;
            const dx = pin.x - ball.x;
            const dz = pin.z - ball.z;
            const dist = Math.hypot(dx, dz);
            const minDist = ball.radius + pin.radius;

            if (dist < minDist && dist > 0.00001) {
                const nx = dx / dist;
                const nz = dz / dist;
                const overlap = minDist - dist;

                pin.x += nx * overlap * 0.85;
                pin.z += nz * overlap * 0.85;

                const ballSpeed = Math.hypot(ball.vx, ball.vz);
                const transfer = Math.min(2.1, ballSpeed * 0.78 * ball.mass * (ball.carryBonus || 1));

                pin.vx += nx * transfer + ball.spin * 0.28;
                pin.vz += nz * transfer;
                pin.down = true;
                pin.tiltDirX = nx;
                pin.tiltDirZ = nz;

                const isChain = ball.hitByBall;
                ball.hitByBall = true;

                // Natural ball deflection on pin impact
                ball.vx -= nx * 0.14;
                ball.vz *= 0.94;

                events.push({
                    type: 'pinHit',
                    pin,
                    intensity: Math.min(1, transfer / 1.5),
                    isChain
                });
            }
        }

        if (ball.z > 1.06) {
            ball.active = false;
        }
    }

    // Pin movement, 3D topple angle & pin-to-pin collisions
    for (let i = 0; i < pins.length; i++) {
        const a = pins[i];

        if (a.down && a.tilt < 1.48) {
            const toppleSpeed = 4.2 + Math.hypot(a.vx, a.vz) * 2.5;
            a.tilt = Math.min(1.48, a.tilt + toppleSpeed * dtSec);
        }

        if (Math.hypot(a.vx, a.vz) > 0.01) {
            a.x += a.vx * dtSec;
            a.z += a.vz * dtSec;
            a.spinAngle += (a.vx * 8 + a.vz * 5) * dtSec;
            a.vx *= Math.pow(0.14, dtSec);
            a.vz *= Math.pow(0.14, dtSec);
        }

        for (let j = i + 1; j < pins.length; j++) {
            const b = pins[j];
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const dist = Math.hypot(dx, dz);
            const minDist = a.radius + b.radius;

            if (dist < minDist && dist > 0.00001) {
                const speedA = Math.hypot(a.vx, a.vz);
                const speedB = Math.hypot(b.vx, b.vz);
                const nx = dx / dist;
                const nz = dz / dist;

                if (speedA > 0.14 || speedB > 0.14) {
                    const impulse = Math.max(speedA, speedB) * 0.78;
                    if (!a.down && speedB > 0.14) {
                        a.vx -= nx * impulse;
                        a.vz -= nz * impulse;
                        a.down = true;
                        a.tiltDirX = -nx;
                        a.tiltDirZ = -nz;
                        events.push({ type: 'pinHit', pin: a, intensity: Math.min(1, impulse / 1.1), isChain: true });
                    }
                    if (!b.down && speedA > 0.14) {
                        b.vx += nx * impulse;
                        b.vz += nz * impulse;
                        b.down = true;
                        b.tiltDirX = nx;
                        b.tiltDirZ = nz;
                        events.push({ type: 'pinHit', pin: b, intensity: Math.min(1, impulse / 1.1), isChain: true });
                    }
                }
            }
        }
    }

    return events;
}

export function arePinsSettled(pins) {
    return pins.every(p => Math.hypot(p.vx, p.vz) < 0.025 && (!p.down || p.tilt >= 1.35));
}

export function countStandingPins(pins) {
    return pins.filter(p => !p.down).length;
}

export function getStandingPinIndices(pins) {
    return pins.filter(p => !p.down).map(p => p.index);
}
