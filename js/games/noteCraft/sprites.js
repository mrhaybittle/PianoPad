// js/games/noteCraft/sprites.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';
import { ncState } from './state.js';
import { getThreeScene } from './render3d.js';

const avatarSprites = new Map(); // playerId -> { sprite, signature }

function createPlayerBillboardTexture(player) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const name = String(player.name || 'Builder').slice(0, 16);
    const avatar = player.avatar || '🏃';
    const flyTag = player.isFlying ? ' 🪽' : '';

    // Nameplate pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = player.isFlying ? '#facc15' : '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(18, 12, 220, 44, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${name}${flyTag}`, 128, 35);

    // Subtle ground shadow ring
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.beginPath();
    ctx.ellipse(128, 236, 46, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Large Emoji Avatar
    ctx.shadowColor = player.isFlying ? '#facc15' : '#38bdf8';
    ctx.shadowBlur = 18;
    ctx.font = '136px sans-serif';
    ctx.fillText(avatar, 128, 152);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

export function updateRemotePlayerSprites() {
    const scene = getThreeScene();
    if (!scene) return;

    const activeIds = new Set(Object.keys(ncState.remotePlayers));

    // Remove sprites for players who left
    for (const [pid, entry] of avatarSprites.entries()) {
        if (!activeIds.has(pid)) {
            scene.remove(entry.sprite);
            if (entry.sprite.material.map) entry.sprite.material.map.dispose();
            entry.sprite.material.dispose();
            avatarSprites.delete(pid);
        }
    }

    // Create or smoothly update active classmate billboards
    for (const [pid, opp] of Object.entries(ncState.remotePlayers)) {
        const sig = `${opp.name || ''}|${opp.avatar || ''}|${Boolean(opp.isFlying)}`;
        let entry = avatarSprites.get(pid);

        if (!entry) {
            const tex = createPlayerBillboardTexture(opp);
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(1.85, 1.85, 1);
            sprite.position.set(opp.x || 0, (opp.y || 2) + 1.15, opp.z || 0);
            scene.add(sprite);
            entry = { sprite, signature: sig };
            avatarSprites.set(pid, entry);
        } else {
            if (entry.signature !== sig) {
                if (entry.sprite.material.map) entry.sprite.material.map.dispose();
                entry.sprite.material.map = createPlayerBillboardTexture(opp);
                entry.sprite.material.needsUpdate = true;
                entry.signature = sig;
            }
            // Smooth interpolation toward latest Firebase position
            entry.sprite.position.lerp(
                new THREE.Vector3(opp.x || 0, (opp.y || 2) + 1.15, opp.z || 0),
                0.22
            );
        }
    }
}

export function disposeSprites() {
    const scene = getThreeScene();
    for (const entry of avatarSprites.values()) {
        if (scene) scene.remove(entry.sprite);
        if (entry.sprite.material.map) entry.sprite.material.map.dispose();
        entry.sprite.material.dispose();
    }
    avatarSprites.clear();
}
