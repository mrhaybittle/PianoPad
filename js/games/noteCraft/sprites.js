// js/games/noteCraft/sprites.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { ncState } from './state.js';

const avatarMeshes = new Map();

function createAvatarBadgeTexture(name, avatarEmoji) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(12, 10, 232, 48, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(name || 'Builder').slice(0, 14), 128, 35);

    ctx.font = '48px sans-serif';
    ctx.fillText(avatarEmoji || '🏃', 128, 94);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

export function initAvatarSprites(scene) {
    disposeAvatarSprites(scene);
}

export function updateAvatarSprites(scene) {
    if (!scene) return;

    const activeIds = new Set(Object.keys(ncState.remotePlayers || {}));

    // Remove disconnected classmates
    for (const [pid, entry] of avatarMeshes.entries()) {
        if (!activeIds.has(pid)) {
            scene.remove(entry.group);
            entry.spriteMat.map?.dispose();
            entry.spriteMat.dispose();
            entry.bodyMat.dispose();
            entry.bodyGeo.dispose();
            avatarMeshes.delete(pid);
        }
    }

    // Add or update active classmates
    for (const [pid, pData] of Object.entries(ncState.remotePlayers || {})) {
        const cleanName = String(pData.name || 'Builder').slice(0, 14);
        const cleanAvatar = pData.avatar || '🏃';

        let entry = avatarMeshes.get(pid);
        if (!entry) {
            const group = new THREE.Group();
            const bodyGeo = new THREE.BoxGeometry(0.6, 1.4, 0.6);
            const bodyMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
            const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
            bodyMesh.position.y = 0.7;
            group.add(bodyMesh);

            const spriteMat = new THREE.SpriteMaterial({
                map: createAvatarBadgeTexture(cleanName, cleanAvatar),
                transparent: true
            });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.set(0, 2.05, 0);
            sprite.scale.set(1.8, 0.9, 1);
            group.add(sprite);

            scene.add(group);
            entry = { group, bodyGeo, bodyMat, spriteMat, name: cleanName, avatar: cleanAvatar };
            avatarMeshes.set(pid, entry);
        } else if (entry.name !== cleanName || entry.avatar !== cleanAvatar) {
            entry.spriteMat.map?.dispose();
            entry.spriteMat.map = createAvatarBadgeTexture(cleanName, cleanAvatar);
            entry.spriteMat.needsUpdate = true;
            entry.name = cleanName;
            entry.avatar = cleanAvatar;
        }

        entry.group.position.set(
            Number(pData.x || 0),
            Number(pData.y || 1),
            Number(pData.z || 0)
        );
        entry.group.rotation.y = Number(pData.yaw || 0);
    }
}

export function disposeAvatarSprites(scene) {
    for (const entry of avatarMeshes.values()) {
        if (scene) scene.remove(entry.group);
        entry.spriteMat.map?.dispose();
        entry.spriteMat.dispose();
        entry.bodyMat.dispose();
        entry.bodyGeo.dispose();
    }
    avatarMeshes.clear();
}


Reply with **next** when you're ready for the final file (`notecraft.js`).
