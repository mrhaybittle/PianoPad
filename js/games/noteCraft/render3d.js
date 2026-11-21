// js/games/noteCraft/render3d.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';
import { BLOCKS, CHUNK_HEIGHT } from './constants.js';
import { ncState } from './state.js';
import { getBlockAt, WORLD_RADIUS, EYE_HEIGHT } from './engine.js';

let renderer = null;
let scene = null;
let camera = null;
let blockMeshes = {};
let highlightBox = null;
let materialsCache = null;

const MAX_INSTANCES_PER_TYPE = 12000;
const dummyMatrix = new THREE.Matrix4();

function makePixelTexture(drawFn) {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d');
    drawFn(ctx);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createBlockMaterials() {
    if (materialsCache) return materialsCache;

    const dirtTex = makePixelTexture((ctx) => {
        ctx.fillStyle = '#7c4d2b';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#5e381d';
        for (let i = 0; i < 28; i++) ctx.fillRect((i * 7) % 16, (i * 11) % 16, 2, 2);
    });

    const grassTopTex = makePixelTexture((ctx) => {
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#22c55e';
        for (let i = 0; i < 24; i++) ctx.fillRect((i * 5) % 16, (i * 9) % 16, 2, 2);
    });

    const grassSideTex = makePixelTexture((ctx) => {
        ctx.fillStyle = '#7c4d2b';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(0, 0, 16, 4);
        ctx.fillRect(2, 4, 3, 2);
        ctx.fillRect(10, 4, 4, 2);
    });

    const stoneTex = makePixelTexture((ctx) => {
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#64748b';
        for (let i = 0; i < 30; i++) ctx.fillRect((i * 3) % 15, (i * 7) % 15, 2, 2);
    });

    const brickTex = makePixelTexture((ctx) => {
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, 3, 16, 1);
        ctx.fillRect(0, 7, 16, 1);
        ctx.fillRect(0, 11, 16, 1);
        ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(7, 0, 1, 3);
        ctx.fillRect(3, 4, 1, 3);
        ctx.fillRect(11, 4, 1, 3);
        ctx.fillRect(7, 8, 1, 3);
    });

    const woodTex = makePixelTexture((ctx) => {
        ctx.fillStyle = '#d97706';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(0, 4, 16, 1);
        ctx.fillRect(0, 9, 16, 1);
        ctx.fillRect(0, 14, 16, 1);
    });

    const leavesTex = makePixelTexture((ctx) => {
        ctx.fillStyle = '#15803d';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#166534';
        for (let i = 0; i < 20; i++) ctx.fillRect((i * 6) % 14, (i * 10) % 14, 3, 3);
    });

    const glassTex = makePixelTexture((ctx) => {
        ctx.fillStyle = 'rgba(186, 230, 253, 0.35)';
        ctx.fillRect(0, 0, 16, 16);
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 14, 14);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(3, 3, 3, 1);
        ctx.fillRect(3, 3, 1, 3);
    });

    const noteTex = makePixelTexture((ctx) => {
        ctx.fillStyle = '#581c87';
        ctx.fillRect(0, 0, 16, 16);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 14, 14);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(8, 3, 2, 8);
        ctx.fillRect(10, 3, 3, 2);
        ctx.fillRect(5, 9, 4, 4);
    });

    const grassSideMat = new THREE.MeshLambertMaterial({ map: grassSideTex });
    materialsCache = {
        [BLOCKS.DIRT]: new THREE.MeshLambertMaterial({ map: dirtTex }),
        [BLOCKS.GRASS]: [
            grassSideMat, grassSideMat,
            new THREE.MeshLambertMaterial({ map: grassTopTex }),
            new THREE.MeshLambertMaterial({ map: dirtTex }),
            grassSideMat, grassSideMat
        ],
        [BLOCKS.STONE]: new THREE.MeshLambertMaterial({ map: stoneTex }),
        [BLOCKS.BRICK]: new THREE.MeshLambertMaterial({ map: brickTex }),
        [BLOCKS.WOOD]: new THREE.MeshLambertMaterial({ map: woodTex }),
        [BLOCKS.LEAVES]: new THREE.MeshLambertMaterial({ map: leavesTex }),
        [BLOCKS.GLASS]: new THREE.MeshLambertMaterial({ map: glassTex, transparent: true, opacity: 0.65 }),
        [BLOCKS.NOTE_BLOCK]: new THREE.MeshLambertMaterial({ map: noteTex })
    };
    return materialsCache;
}

function isOpaque(blockId) {
    return blockId !== BLOCKS.AIR && blockId !== BLOCKS.GLASS && blockId !== BLOCKS.LEAVES;
}

function isBlockOccluded(x, y, z) {
    return (
        isOpaque(getBlockAt(x + 1, y, z)) &&
        isOpaque(getBlockAt(x - 1, y, z)) &&
        isOpaque(getBlockAt(x, y + 1, z)) &&
        isOpaque(getBlockAt(x, y - 1, z)) &&
        isOpaque(getBlockAt(x, y, z + 1)) &&
        isOpaque(getBlockAt(x, y, z - 1))
    );
}

export function initRender3D(containerEl) {
    disposeRender3D();

    const width = containerEl.clientWidth || 1232;
    const height = containerEl.clientHeight || 380;

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#7dd3fc');
    scene.fog = new THREE.FogExp2('#7dd3fc', 0.014);

    camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 140);
    camera.rotation.order = 'YXZ';

    const canvas = document.createElement('canvas');
    canvas.id = 'notecraft-canvas';
    canvas.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; display:block; z-index:5;';
    containerEl.appendChild(canvas);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // Lighting
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#334155', 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fef9c3', 0.9);
    sunLight.position.set(28, 52, 24);
    scene.add(sunLight);

    // Build InstancedMesh pool (1 draw call per block material)
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const mats = createBlockMaterials();
    blockMeshes = {};

    for (const [idStr, mat] of Object.entries(mats)) {
        const id = Number(idStr);
        const im = new THREE.InstancedMesh(boxGeo, mat, MAX_INSTANCES_PER_TYPE);
        im.count = 0;
        im.frustumCulled = false;
        scene.add(im);
        blockMeshes[id] = im;
    }

    // Target block selection wireframe
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01));
    highlightBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#0f172a' }));
    highlightBox.visible = false;
    scene.add(highlightBox);

    ncState.world.dirty = true;
    rebuildWorldMeshes();
    return { scene, camera, renderer };
}

export function rebuildWorldMeshes() {
    if (!scene || !blockMeshes) return;

    const counts = {};
    for (const id of Object.keys(blockMeshes)) counts[id] = 0;

    for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
        for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z++) {
            for (let y = 0; y < CHUNK_HEIGHT; y++) {
                const blockId = getBlockAt(x, y, z);
                if (blockId === BLOCKS.AIR) continue;
                if (isOpaque(blockId) && isBlockOccluded(x, y, z)) continue;

                const mesh = blockMeshes[blockId];
                const idx = counts[blockId];
                if (mesh && idx < MAX_INSTANCES_PER_TYPE) {
                    dummyMatrix.setPosition(x + 0.5, y + 0.5, z + 0.5);
                    mesh.setMatrixAt(idx, dummyMatrix);
                    counts[blockId] = idx + 1;
                }
            }
        }
    }

    for (const [id, mesh] of Object.entries(blockMeshes)) {
        mesh.count = counts[id];
        mesh.instanceMatrix.needsUpdate = true;
    }
    ncState.world.dirty = false;
}

export function render3DFrame() {
    if (!renderer || !scene || !camera) return;

    if (ncState.world.dirty) {
        rebuildWorldMeshes();
    }

    const lp = ncState.localPlayer;
    camera.position.set(lp.x, lp.y + EYE_HEIGHT, lp.z);
    camera.rotation.y = lp.yaw;
    camera.rotation.x = lp.pitch;

    const target = ncState.targetBlock;
    if (highlightBox) {
        if (target && target.hit) {
            highlightBox.visible = true;
            highlightBox.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
        } else {
            highlightBox.visible = false;
        }
    }

    renderer.render(scene, camera);
}

export function resizeRender3D(containerEl) {
    if (!renderer || !camera || !containerEl) return;
    const w = containerEl.clientWidth || 1232;
    const h = containerEl.clientHeight || 380;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
}

export function disposeRender3D() {
    if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
    }
    renderer = null;
    scene = null;
    camera = null;
    blockMeshes = {};
    highlightBox = null;
}

export function getThreeScene() {
    return scene;
}
