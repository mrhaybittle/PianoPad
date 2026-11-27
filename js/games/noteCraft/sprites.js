// js/games/noteCraft/sprites.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { ncState } from './state.js';

const avatarMeshes = new Map();
const creatureMeshes = new Map();

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

function createCreatureBadgeTexture(label) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(10, 8, 236, 48, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🐉 ${label}`, 128, 33);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function buildDragonGroup(name) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xb91c1c });
    const wingMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 1.8), bodyMat);
    torso.position.set(0, 0.4, 0);
    group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.85), bodyMat);
    head.position.set(0, 0.85, 1.15);
    group.add(head);

    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.9), wingMat);
    leftWing.position.set(-1.15, 0.65, 0.1);
    group.add(leftWing);

    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.9), wingMat);
    rightWing.position.set(1.15, 0.65, 0.1);
    group.add(rightWing);

    const badgeTex = createCreatureBadgeTexture(name || 'Dragon');
    const badgeMat = new THREE.SpriteMaterial({ map: badgeTex, transparent: true });
    const badge = new THREE.Sprite(badgeMat);
    badge.position.set(0, 1.65, 0);
    badge.scale.set(2.2, 0.55, 1);
    group.add(badge);

    return { group, bodyMat, wingMat, badgeMat, leftWing, rightWing };
}

export function initAvatarSprites(scene) {
    disposeAvatarSprites(scene);
}

export function updateAvatarSprites(scene, dt = 0.016) {
    if (!scene) return;
    void dt;

    const activeIds = new Set(Object.keys(ncState.remotePlayers || {}));

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

    const list = Array.isArray(ncState.creatures) ? ncState.creatures : [];
    const activeCreatureIds = new Set(list.map(c => c.id));
    for (const [cid, cEntry] of creatureMeshes.entries()) {
        if (!activeCreatureIds.has(cid)) {
            scene.remove(cEntry.group);
            cEntry.bodyMat.dispose();
            cEntry.wingMat.dispose();
            cEntry.badgeMat.map?.dispose();
            cEntry.badgeMat.dispose();
            creatureMeshes.delete(cid);
        }
    }

    for (const c of list) {
        let cEntry = creatureMeshes.get(c.id);
        if (!cEntry) {
            cEntry = buildDragonGroup(c.name);
            scene.add(cEntry.group);
            creatureMeshes.set(c.id, cEntry);
        }
        cEntry.group.position.set(c.x, c.y, c.z);
        cEntry.group.rotation.y = c.yaw;
        const flap = Math.sin((c.phase || 0) * 3.0) * 0.45;
        cEntry.leftWing.rotation.z = flap;
        cEntry.rightWing.rotation.z = -flap;
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

    for (const cEntry of creatureMeshes.values()) {
        if (scene) scene.remove(cEntry.group);
        cEntry.bodyMat.dispose();
        cEntry.wingMat.dispose();
        cEntry.badgeMat.map?.dispose();
        cEntry.badgeMat.dispose();
    }
    creatureMeshes.clear();
}
