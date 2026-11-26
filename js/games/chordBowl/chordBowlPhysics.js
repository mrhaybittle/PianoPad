// js/games/chordBowl/chordBowlPhysics.js
// Naturalistic 2D ball curvature, oil drag, pin-to-pin momentum transfer & toppling.

// Standard 10-pin triangle normalized coordinates:
// nx in [-1, 1] across playable lane; ny in [0, 1] from front pin (#1) to back row (#7..#10)
const RACK_LAYOUT = [
    { index: 0, nx: 0.00, ny: 0.00 },  // Pin 1 (Headpin)
    { index: 1, nx: -0.22, ny: 0.32 }, // Pin 2
    { index: 2, nx: 0.22, ny: 0.32 },  // Pin 3
    { index: 3, nx: -0.44, ny: 0.64 }, // Pin 4
    { index: 4, nx: 0.00, ny: 0.64 },  // Pin 5
    { index: 5, nx: 0.44, ny: 0.64 },  // Pin 6
    { index: 6, nx: -0.66, ny: 0.96 }, // Pin 7
    { index: 7, nx: -0.22, ny: 0.96 }, // Pin 8
    { index: 8, nx: 0.22, ny: 0.96 },  // Pin 9
    { index: 9, nx: 0.66, ny: 0.96 }   // Pin 10
];

export function createTenPins(scaleNotes = []) {
    return RACK_LAYOUT.map((slot, idx) => ({
        index: idx,
        nx: slot.nx,
        ny: slot.ny,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 9.5,
        mass: 1.0,
        down: false,
        wasDownBeforeRoll: false,
        fallAngle: 0,
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

    // Map C3 (48) -> -1.0, C4 (60) -> 0.0, C5 (72) -> +1.0
    const clamped = Math.max(48, Math.min(72, midi));
    return (clamped - 60) / 12;
}

export function stepBallAndPins(ball, pins, geom, dtSec) {
    const events = [];

    if (ball.active) {
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 10) ball.trail.shift();

        // Hook / spin lateral acceleration increases slightly down the lane
        const laneProgress = Math.max(0, Math.min(1, (geom.foulLineY - ball.y) / Math.max(1, geom.foulLineY - geom.pinDeckY)));
        const hookAccel = ball.hookCurve * (0.45 + laneProgress * 0.95) * 165 + ball.spin * 95;
        ball.vx += hookAccel * dtSec;

        // Slight oil friction slowdown
        const drag = Math.pow(0.92, dtSec);
        ball.vx *= drag;
        ball.vy *= drag;

        ball.x += ball.vx * dtSec;
        ball.y += ball.vy * dtSec;

        // Check gutter entry
        if (ball.x - ball.radius < geom.playLeft || ball.x + ball.radius > geom.playRight) {
            if (!ball.inGutter) {
                ball.inGutter = true;
                events.push({ type: 'gutter' });
            }
            ball.vx *= 0.25;
            ball.x = Math.max(geom.laneLeft + ball.radius, Math.min(geom.laneRight - ball.radius, ball.x));
        }

        // Ball vs Pins collision
        for (const pin of pins) {
            if (pin.down) continue;
            const dx = pin.x - ball.x;
            const dy = pin.y - ball.y;
            const dist = Math.hypot(dx, dy);
            const minDist = ball.radius + pin.radius;

            if (dist < minDist && dist > 0.0001) {
                const nx = dx / dist;
                const ny = dy / dist;
                const overlap = minDist - dist;
                pin.x += nx * overlap * 0.85;
                pin.y += ny * overlap * 0.85;

                const ballSpeed = Math.hypot(ball.vx, ball.vy);
                const transfer = Math.min(460, ballSpeed * 0.62 * ball.mass * (ball.carryBonus || 1));

                pin.vx += nx * transfer + ball.spin * 45;
                pin.vy += ny * transfer;
                pin.down = true;
                pin.fallAngle = Math.atan2(pin.vy, pin.vx) + Math.PI / 2;

                const isChain = ball.hitByBall;
                ball.hitByBall = true;

                // Deflect ball slightly on impact
                ball.vx -= nx * 38;
                ball.vy *= 0.93;

                events.push({
                    type: 'pinHit',
                    pin,
                    intensity: Math.min(1, transfer / 340),
                    isChain
                });
            }
        }

        // Stop ball past pin deck
        if (ball.y < geom.pinDeckY - 45) {
            ball.active = false;
        }
    }

    // Pin-to-pin momentum & domino chain collisions
    for (let i = 0; i < pins.length; i++) {
        const a = pins[i];
        if (Math.hypot(a.vx, a.vy) > 4) {
            a.x += a.vx * dtSec;
            a.y += a.vy * dtSec;
            a.vx *= Math.pow(0.18, dtSec);
            a.vy *= Math.pow(0.18, dtSec);
        }

        for (let j = i + 1; j < pins.length; j++) {
            const b = pins[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            const minDist = a.radius + b.radius;

            if (dist < minDist && dist > 0.0001) {
                const speedA = Math.hypot(a.vx, a.vy);
                const speedB = Math.hypot(b.vx, b.vy);
                if (speedA > 28 || speedB > 28) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const push = Math.max(speedA, speedB) * 0.72;

                    if (!a.down && speedB > 28) {
                        a.vx -= nx * push;
                        a.vy -= ny * push;
                        a.down = true;
                        a.fallAngle = Math.atan2(a.vy, a.vx) + Math.PI / 2;
                        events.push({ type: 'pinHit', pin: a, intensity: Math.min(1, push / 260), isChain: true });
                    }
                    if (!b.down && speedA > 28) {
                        b.vx += nx * push;
                        b.vy += ny * push;
                        b.down = true;
                        b.fallAngle = Math.atan2(b.vy, b.vx) + Math.PI / 2;
                        events.push({ type: 'pinHit', pin: b, intensity: Math.min(1, push / 260), isChain: true });
                    }
                }
            }
        }
    }

    return events;
}

export function arePinsSettled(pins) {
    return pins.every(p => Math.hypot(p.vx, p.vy) < 6);
}

export function countStandingPins(pins) {
    return pins.filter(p => !p.down).length;
}

export function getStandingPinIndices(pins) {
    return pins.filter(p => !p.down).map(p => p.index);
}
