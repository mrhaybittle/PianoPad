// js/games/noteCraft/render3d.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { BLOCKS, PLAYER_EYE_HEIGHT } from './constants.js';
import { ncState } from './state.js';
import { WORLD_HALF_X, WORLD_HALF_Z, getBaseTerrainBlock, isBlockSolid } from './engine.js';
import campusPreset from './campusPreset.js';

let renderer = null;
let scene = null;
let camera = null;
let voxelGroup = null;
let highlightMesh = null;
let campusBlueprintMesh = null;
let cicOutlineMesh = null;

const sharedGeo = new THREE.BoxGeometry(1, 1, 1);
const fuseGeo = new THREE.BoxGeometry(1.06, 1.06, 1.06);
const materialCache = new Map();
const fuseMeshMap = new Map();

function createProceduralBlockTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    if (type === 'grass_top') {
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#16a34a';
        for (let i = 0; i < 40; i++) {
            ctx.fillRect((i * 19) % 60, (i * 29) % 60, 4, 4);
        }
    } else if (type === 'dirt') {
        ctx.fillStyle = '#7c4d2b';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#5e381d';
        for (let i = 0; i < 36; i++) {
            ctx.fillRect((i * 23) % 60, (i * 17) % 60, 5, 5);
        }
    } else if (type === 'stone') {
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(4, 4, 24, 24);
        ctx.fillRect(34, 34, 24, 24);
    } else if (type === 'brick') {
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, 14, 64, 3);
        ctx.fillRect(0, 30, 64, 3);
        ctx.fillRect(0, 46, 64, 3);
        ctx.fillRect(0, 61, 64, 3);
        ctx.fillRect(30, 0, 3, 14);
        ctx.fillRect(14, 17, 3, 13);
        ctx.fillRect(46, 17, 3, 13);
        ctx.fillRect(30, 33, 3, 13);
    } else if (type === 'wood') {
        ctx.fillStyle = '#d97706';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(0, 12, 64, 3);
        ctx.fillRect(0, 32, 64, 3);
        ctx.fillRect(0, 52, 64, 3);
    } else if (type === 'leaves') {
        ctx.fillStyle = '#15803d';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#22c55e';
        for (let i = 0; i < 30; i++) {
            ctx.fillRect((i * 13) % 58, (i * 31) % 58, 6, 6);
        }
    } else if (type === 'note_block') {
        ctx.fillStyle = '#581c87';
        ctx.fillRect(0, 0, 64, 64);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 4;
        ctx.strokeRect(3, 3, 58, 58);
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♪', 32, 34);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function getBlockMaterial(blockId) {
    if (materialCache.has(blockId)) return materialCache.get(blockId);

    let mat;
    if (blockId === BLOCKS.GLASS) {
        mat = new THREE.MeshLambertMaterial({
            color: 0xbae6fd,
            transparent: true,
            opacity: 0.55
        });
    } else if (blockId === BLOCKS.GRASS) {
        const topMat = new THREE.MeshLambertMaterial({ map: createProceduralBlockTexture('grass_top') });
        const sideMat = new THREE.MeshLambertMaterial({ map: createProceduralBlockTexture('dirt') });
        mat = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    } else {
        const keyMap = {
            [BLOCKS.DIRT]: 'dirt',
            [BLOCKS.STONE]: 'stone',
            [BLOCKS.BRICK]: 'brick',
            [BLOCKS.WOOD]: 'wood',
            [BLOCKS.LEAVES]: 'leaves',
            [BLOCKS.NOTE_BLOCK]: 'note_block'
        };
        mat = new THREE.MeshLambertMaterial({
            map: createProceduralBlockTexture(keyMap[blockId] || 'stone')
        });
    }

    materialCache.set(blockId, mat);
    return mat;
}

function clearFuseMeshes() {
    for (const entry of fuseMeshMap.values()) {
        if (scene) scene.remove(entry.mesh);
        entry.mat.dispose();
    }
    fuseMeshMap.clear();
}

function updateFuseAnimations(now = performance.now()) {
    if (!scene) return;
    const explosions = Array.isArray(ncState.activeExplosions) ? ncState.activeExplosions : [];
    const activeIds = new Set(explosions.map(exp => exp.id));

    for (const [id, entry] of fuseMeshMap.entries()) {
        if (!activeIds.has(id)) {
            scene.remove(entry.mesh);
            entry.mat.dispose();
            fuseMeshMap.delete(id);
        }
    }

    for (const exp of explosions) {
        let entry = fuseMeshMap.get(exp.id);
        if (!entry) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
            const mesh = new THREE.Mesh(fuseGeo, mat);
            mesh.position.set(exp.x + 0.5, exp.y + 0.5, exp.z + 0.5);
            scene.add(mesh);
            entry = { mesh, mat };
            fuseMeshMap.set(exp.id, entry);
        }

        const duration = Math.max(1, (exp.explodeAt || (exp.placedAt + 5000)) - (exp.placedAt || now));
        const progress = Math.min(1, Math.max(0, (now - (exp.placedAt || now)) / duration));
        const freq = 0.012 + progress * 0.05;
        const wave = 0.5 + 0.5 * Math.sin(now * freq);

        const scale = 1.0 + wave * (0.08 + progress * 0.14);
        entry.mesh.scale.set(scale, scale, scale);
        entry.mat.color.setHex(wave > 0.55 ? 0xfef08a : 0xef4444);
    }
}

function buildCampusGroundBlueprint() {
    const worldW = WORLD_HALF_X * 2;
    const worldD = WORLD_HALF_Z * 2;
    const loader = new THREE.TextureLoader();

    loader.load(
        './assets/erc_map.jpg',
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            const planeGeo = new THREE.PlaneGeometry(worldW, worldD);
            planeGeo.rotateX(-Math.PI / 2);
            const planeMat = new THREE.MeshLambertMaterial({
                map: tex,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            });
            campusBlueprintMesh = new THREE.Mesh(planeGeo, planeMat);
            campusBlueprintMesh.position.set(0, 1.005, 0);
            if (scene) scene.add(campusBlueprintMesh);
        }
    );

    const cicGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(20, 0.25, 14));
    const cicMat = new THREE.LineBasicMaterial({ color: 0xfacc15 });
    cicOutlineMesh = new THREE.LineSegments(cicGeo, cicMat);
    cicOutlineMesh.position.set(12, 1.15, 13);
    scene.add(cicOutlineMesh);
}

export function initRender3D(containerEl) {
    disposeRender3D();

    const w = containerEl.clientWidth || 1232;
    const h = containerEl.clientHeight || 380;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.id = 'notecraft-canvas';
    renderer.domElement.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; display:block; z-index:5; cursor:crosshair;';
    containerEl.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7dd3fc);
    scene.fog = new THREE.Fog(0x7dd3fc, 45, 115);

    camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 160);
    camera.rotation.order = 'YXZ';

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.15);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 0.9);
    dirLight.position.set(28, 52, 22);
    scene.add(dirLight);

    voxelGroup = new THREE.Group();
    scene.add(voxelGroup);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
    highlightMesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xfacc15 }));
    highlightMesh.visible = false;
    scene.add(highlightMesh);

    buildCampusGroundBlueprint();
    ncState.world.dirty = true;
}

export function rebuildWorldMeshes() {
    if (!voxelGroup) return;

    while (voxelGroup.children.length > 0) {
        voxelGroup.remove(voxelGroup.children[0]);
    }

    const buckets = new Map();

    // Base terrain floor (y = 1)
    for (let x = -WORLD_HALF_X; x < WORLD_HALF_X; x++) {
        for (let z = -WORLD_HALF_Z; z < WORLD_HALF_Z; z++) {
            const key = `${x}_1_${z}`;
            const blockId = Object.prototype.hasOwnProperty.call(ncState.world.deltas, key)
                ? ncState.world.deltas[key]
                : getBaseTerrainBlock(x, 1, z);

            if (isBlockSolid(blockId)) {
                if (!buckets.has(blockId)) buckets.set(blockId, []);
                buckets.get(blockId).push({ x, y: 1, z });
            }
        }
    }

    // Base campus preset buildings (y >= 2, unless overridden in deltas)
    for (const [key, presetBlockId] of campusPreset.getCampusPresetEntries()) {
        const [px, py, pz] = key.split('_').map(Number);
        if (py <= 1) continue;
        if (Object.prototype.hasOwnProperty.call(ncState.world.deltas, key)) continue;
        if (isBlockSolid(presetBlockId)) {
            if (!buckets.has(presetBlockId)) buckets.set(presetBlockId, []);
            buckets.get(presetBlockId).push({ x: px, y: py, z: pz });
        }
    }

    // All student-placed blocks (y >= 2)
    for (const [key, blockId] of Object.entries(ncState.world.deltas)) {
        if (!isBlockSolid(blockId)) continue;
        const [sx, sy, sz] = key.split('_').map(Number);
        if (sy === 1) continue;
        if (!buckets.has(blockId)) buckets.set(blockId, []);
        buckets.get(blockId).push({ x: sx, y: sy, z: sz });
    }

    const dummy = new THREE.Object3D();
    for (const [blockId, coords] of buckets.entries()) {
        if (coords.length === 0) continue;
        const instMesh = new THREE.InstancedMesh(sharedGeo, getBlockMaterial(blockId), coords.length);
        coords.forEach((c, idx) => {
            dummy.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
            dummy.updateMatrix();
            instMesh.setMatrixAt(idx, dummy.matrix);
        });
        instMesh.instanceMatrix.needsUpdate = true;
        voxelGroup.add(instMesh);
    }

    for (const anchor of campusPreset.getCampusLabelAnchors()) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.roundRect(8, 8, 240, 48, 12);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(anchor.label, 128, 33);

        const tex = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
        sprite.position.set(anchor.x, anchor.y, anchor.z);
        sprite.scale.set(10, 2.5, 1);
        voxelGroup.add(sprite);
    }

    ncState.world.dirty = false;
}

export function render3DFrame(now = performance.now()) {
    if (!renderer || !scene || !camera) return;

    if (ncState.world.dirty) {
        rebuildWorldMeshes();
    }

    updateFuseAnimations(now);

    const lp = ncState.localPlayer;
    camera.position.set(lp.x, lp.y + PLAYER_EYE_HEIGHT, lp.z);
    camera.rotation.y = lp.yaw;
    camera.rotation.x = lp.pitch;

    const target = ncState.targetBlock;
    if (target && target.hit && highlightMesh) {
        highlightMesh.visible = true;
        highlightMesh.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    } else if (highlightMesh) {
        highlightMesh.visible = false;
    }

    renderer.render(scene, camera);
}

export function resizeRender3D(containerEl) {
    if (!renderer || !camera || !containerEl) return;
    const w = containerEl.clientWidth || 1232;
    const h = containerEl.clientHeight || 380;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

export function getThreeScene() {
    return scene;
}

export function disposeRender3D() {
    clearFuseMeshes();
    if (campusBlueprintMesh) {
        if (campusBlueprintMesh.material?.map) campusBlueprintMesh.material.map.dispose();
        campusBlueprintMesh.material?.dispose();
        campusBlueprintMesh.geometry?.dispose();
        campusBlueprintMesh = null;
    }
    if (cicOutlineMesh) {
        cicOutlineMesh.material?.dispose();
        cicOutlineMesh.geometry?.dispose();
        cicOutlineMesh = null;
    }
    if (renderer) {
        if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer.dispose();
        renderer = null;
    }
    scene = null;
    camera = null;
    voxelGroup = null;
    highlightMesh = null;
}
