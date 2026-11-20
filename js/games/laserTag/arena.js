// js/games/laserTag/arena.js
import {
    TILE_SIZE,
    MAP_COLS,
    MAP_ROWS,
    ARENA_CENTER_X,
    ARENA_CENTER_Y,
    WALL_THEMES
} from './constants.js';
import { gameState } from './state.js';

export function buildFastPacedArenaMap() {
    const grid = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(0));

    // 1. Outer Cyan Perimeter Wall (type 1)
    for (let i = 0; i < MAP_COLS; i++) {
        grid[0][i] = 1;
        grid[MAP_ROWS - 1][i] = 1;
        grid[i][0] = 1;
        grid[i][MAP_COLS - 1] = 1;
    }

    // 2. GOLD NW SECTOR: Double Concentric Curved Rotundas (type 2)
    const nwCenterR = 10, nwCenterC = 10;
    for (let r = 2; r <= 18; r++) {
        for (let c = 2; c <= 18; c++) {
            const dist = Math.hypot(r - nwCenterR, c - nwCenterC);
            const isCardinalGap = Math.abs(r - nwCenterR) <= 1 || Math.abs(c - nwCenterC) <= 1;
            const isDiagGap = Math.abs(Math.abs(r - nwCenterR) - Math.abs(c - nwCenterC)) <= 1;

            if (dist >= 6.8 && dist <= 8.1 && !isDiagGap) grid[r][c] = 2;
            if (dist >= 3.2 && dist <= 4.3 && !isCardinalGap) grid[r][c] = 2;
        }
    }
    grid[10][10] = 2;

    // 3. MAGENTA NE SECTOR: Staggered Triangular Prism Field (type 3)
    const placeTriangle = (topR, topC, flipDown = false) => {
        if (!flipDown) {
            grid[topR][topC] = 3;
            grid[topR + 1][topC - 1] = 3;
            grid[topR + 1][topC] = 3;
            grid[topR + 1][topC + 1] = 3;
            grid[topR + 2][topC - 2] = 3;
            grid[topR + 2][topC + 2] = 3;
        } else {
            grid[topR][topC - 2] = 3;
            grid[topR][topC + 2] = 3;
            grid[topR + 1][topC - 1] = 3;
            grid[topR + 1][topC] = 3;
            grid[topR + 1][topC + 1] = 3;
            grid[topR + 2][topC] = 3;
        }
    };
    placeTriangle(3, 30, false);
    placeTriangle(3, 36, true);
    placeTriangle(3, 41, false);
    placeTriangle(8, 32, true);
    placeTriangle(8, 39, false);
    placeTriangle(13, 30, false);
    placeTriangle(13, 36, true);
    placeTriangle(13, 41, false);

    // 4. CORAL SW SECTOR: Structured 2-Tile Wide Chicane Lanes (type 4)
    const swWalls = [
        [29, 3], [29, 4], [29, 5], [29, 6], [30, 6], [31, 6],
        [29, 10], [30, 10], [31, 10], [31, 11], [31, 12],
        [29, 15], [29, 16], [29, 17], [30, 15], [31, 15],
        [34, 3], [34, 4], [35, 4], [36, 4], [36, 5],
        [34, 8], [34, 9], [35, 8], [36, 8],
        [34, 13], [35, 13], [35, 14], [35, 15], [34, 17], [35, 17],
        [39, 3], [40, 3], [41, 3], [41, 4], [41, 5],
        [39, 8], [39, 9], [39, 10], [40, 10], [41, 10],
        [39, 13], [40, 13], [41, 13], [41, 14], [41, 15], [39, 17], [40, 17]
    ];
    for (const [r, c] of swWalls) grid[r][c] = 4;

    // 5. COBALT SE SECTOR: Mirror-Faceted Diamond Pillar Grid (type 5)
    const placeDiamond = (cr, cc) => {
        grid[cr - 1][cc] = 5;
        grid[cr][cc - 1] = 5;
        grid[cr][cc] = 5;
        grid[cr][cc + 1] = 5;
        grid[cr + 1][cc] = 5;
    };
    placeDiamond(29, 30);
    placeDiamond(29, 35);
    placeDiamond(29, 41);
    placeDiamond(34, 32);
    placeDiamond(34, 38);
    placeDiamond(38, 29);
    placeDiamond(39, 35);
    placeDiamond(39, 41);

    // 6. MAIN BOULEVARD COVER & EMERALD CENTRAL HUB (type 6)
    const avenuePillars = [
        [4, 21], [4, 24], [9, 20], [9, 25], [14, 21], [14, 24],
        [31, 21], [31, 24], [36, 20], [36, 25], [41, 21], [41, 24],
        [21, 4], [24, 4], [20, 9], [25, 9], [21, 14], [24, 14],
        [21, 31], [24, 31], [20, 36], [25, 36], [21, 41], [24, 41]
    ];
    for (const [r, c] of avenuePillars) grid[r][c] = 1;

    grid[18][19] = 6; grid[18][20] = 6; grid[18][25] = 6; grid[18][26] = 6;
    grid[27][19] = 6; grid[27][20] = 6; grid[27][25] = 6; grid[27][26] = 6;
    grid[19][18] = 6; grid[20][18] = 6; grid[25][18] = 6; grid[26][18] = 6;
    grid[19][27] = 6; grid[20][27] = 6; grid[25][27] = 6; grid[26][27] = 6;

    grid[21][21] = 6;
    grid[21][24] = 6;
    grid[24][21] = 6;
    grid[24][24] = 6;

    return grid;
}

export let ARENA_MAP = buildFastPacedArenaMap();

export function getSafeSpawnPoint(avoidX = null, avoidY = null) {
    let best = { x: TILE_SIZE * 22.5, y: TILE_SIZE * 22.5 };
    let bestDist = -1;

    for (let attempt = 0; attempt < 180; attempt++) {
        const c = 2 + Math.floor(Math.random() * (MAP_COLS - 4));
        const r = 2 + Math.floor(Math.random() * (MAP_ROWS - 4));
        if (ARENA_MAP[r] && ARENA_MAP[r][c] === 0) {
            const candX = c * TILE_SIZE + TILE_SIZE / 2;
            const candY = r * TILE_SIZE + TILE_SIZE / 2;
            if (avoidX === null || avoidY === null) {
                return { x: candX, y: candY };
            }
            const d = Math.hypot(candX - avoidX, candY - avoidY);
            if (d > bestDist) {
                bestDist = d;
                best = { x: candX, y: candY };
            }
            if (d > TILE_SIZE * 16) return best;
        }
    }
    return best;
}

export function setupArenaFeatures() {
    const p1 = getSafeSpawnPoint();
    const p2 = getSafeSpawnPoint(p1.x, p1.y);
    gameState.arenaPortals = [
        { id: 'portal_alpha', name: 'ALPHA PORTAL', x: p1.x, y: p1.y, color: '#06b6d4', secondaryColor: '#a5f3fc' },
        { id: 'portal_omega', name: 'OMEGA PORTAL', x: p2.x, y: p2.y, color: '#d946ef', secondaryColor: '#f5d0fe' }
    ];

    gameState.speedBoostPads = [
        { id: 'boost_n', x: 22.5 * TILE_SIZE, y: 11.5 * TILE_SIZE, angle: Math.PI * 0.5 },
        { id: 'boost_s', x: 22.5 * TILE_SIZE, y: 33.5 * TILE_SIZE, angle: -Math.PI * 0.5 },
        { id: 'boost_w', x: 11.5 * TILE_SIZE, y: 22.5 * TILE_SIZE, angle: 0 },
        { id: 'boost_e', x: 33.5 * TILE_SIZE, y: 22.5 * TILE_SIZE, angle: Math.PI }
    ];

    const medCoords = [
        { r: 6, c: 10 },
        { r: 10, c: 35 },
        { r: 35, c: 10 }
    ];
    gameState.medKitNodes = medCoords.map((pt, idx) => ({
        id: `med_${idx}`,
        x: (pt.c + 0.5) * TILE_SIZE,
        y: (pt.r + 0.5) * TILE_SIZE,
        respawnAt: 0
    }));
}

export function generateSeededArena(roomCode) {
    ARENA_MAP = buildFastPacedArenaMap();
    setupArenaFeatures();
}

export function isInsideEmeraldHub(wx, wy) {
    const col = Math.floor(wx / TILE_SIZE);
    const row = Math.floor(wy / TILE_SIZE);
    return row >= 18 && row <= 27 && col >= 18 && col <= 27;
}

export function getZoneInfoForCoords(wx, wy) {
    if (isInsideEmeraldHub(wx, wy)) {
        return { label: 'EMERALD HUB (+5/s)', color: '#34d399' };
    }
    const midR = Math.floor(MAP_ROWS / 2);
    const midC = Math.floor(MAP_COLS / 2);
    const col = Math.floor(wx / TILE_SIZE);
    const row = Math.floor(wy / TILE_SIZE);
    if (row < midR && col < midC) return { label: 'GOLD CURVED NW', color: '#facc15' };
    if (row < midR && col >= midC) return { label: 'MAGENTA TRIANGLE NE', color: '#e879f9' };
    if (row >= midR && col < midC) return { label: 'CORAL CHICANE SW', color: '#fb923c' };
    return { label: 'COBALT MIRROR SE', color: '#60a5fa' };
}

export function getCurrentStormRadius(now) {
    const elapsedSec = (now - gameState.matchStartTime) / 1000;
    const maxRadius = Math.hypot(ARENA_CENTER_X, ARENA_CENTER_Y);
    if (elapsedSec <= 90) return maxRadius;
    const shrinkProgress = Math.min(1, (elapsedSec - 90) / 120);
    const minRadius = TILE_SIZE * 5.2;
    return maxRadius - shrinkProgress * (maxRadius - minRadius);
}

export function hasLineOfSight(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(8, Math.ceil(dist / 14));
    for (let i = 1; i < steps; i++) {
        const tx = x1 + (x2 - x1) * (i / steps);
        const ty = y1 + (y2 - y1) * (i / steps);
        const col = Math.floor(tx / TILE_SIZE);
        const row = Math.floor(ty / TILE_SIZE);
        if (ARENA_MAP[row] && ARENA_MAP[row][col] > 0) return false;
    }
    return true;
}

export function castRayFromPoint(startX, startY, rayAngle) {
    const sin = Math.sin(rayAngle);
    const cos = Math.cos(rayAngle);

    let mapX = Math.floor(startX / TILE_SIZE);
    let mapY = Math.floor(startY / TILE_SIZE);

    const deltaDistX = Math.abs(1 / (cos || 1e-6));
    const deltaDistY = Math.abs(1 / (sin || 1e-6));

    let stepX, sideDistX;
    if (cos < 0) {
        stepX = -1;
        sideDistX = (startX / TILE_SIZE - mapX) * deltaDistX;
    } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - startX / TILE_SIZE) * deltaDistX;
    }

    let stepY, sideDistY;
    if (sin < 0) {
        stepY = -1;
        sideDistY = (startY / TILE_SIZE - mapY) * deltaDistY;
    } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - startY / TILE_SIZE) * deltaDistY;
    }

    let hit = 0;
    let side = 0;
    let safety = 0;

    while (hit === 0 && safety < 72) {
        safety++;
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            side = 0;
        } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            side = 1;
        }

        if (mapY < 0 || mapY >= MAP_ROWS || mapX < 0 || mapX >= MAP_COLS) {
            hit = 1;
            break;
        }

        const cellType = ARENA_MAP[mapY][mapX];
        if (cellType > 0) {
            const theme = WALL_THEMES[cellType] || WALL_THEMES[1];

            if (theme.shape === 'curved') {
                const cx = (mapX + 0.5) * TILE_SIZE;
                const cy = (mapY + 0.5) * TILE_SIZE;
                const radius = TILE_SIZE * 0.48;
                const ocX = startX - cx;
                const ocY = startY - cy;
                const b = ocX * cos + ocY * sin;
                const c = ocX * ocX + ocY * ocY - radius * radius;
                const disc = b * b - c;
                if (disc >= 0) {
                    const t = -b - Math.sqrt(disc);
                    if (t > 1) {
                        const hitX = startX + cos * t;
                        const hitY = startY + sin * t;
                        const normAngle = Math.atan2(hitY - cy, hitX - cx);
                        const curveShade = 0.65 + 0.35 * Math.cos(normAngle - 0.8);
                        return { dist: t, side: 0, wallType: cellType, customShade: curveShade, stripeCoord: (normAngle + Math.PI) / (Math.PI * 2) };
                    }
                }
                continue;
            }

            if (theme.shape === 'triangle') {
                const boxDist = (side === 0 ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY)) * TILE_SIZE;
                const hitX = startX + cos * boxDist;
                const hitY = startY + sin * boxDist;
                const localU = (hitX - mapX * TILE_SIZE) / TILE_SIZE;
                const localV = (hitY - mapY * TILE_SIZE) / TILE_SIZE;
                const diagDist = boxDist + Math.abs(localU - localV) * TILE_SIZE * 0.35;
                return { dist: Math.max(1, diagDist), side, wallType: cellType, customShade: side === 0 ? 1.0 : 0.72, stripeCoord: (localU + localV) * 0.5 };
            }

            if (theme.shape === 'diamond') {
                const boxDist = (side === 0 ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY)) * TILE_SIZE;
                const hitX = startX + cos * boxDist;
                const hitY = startY + sin * boxDist;
                const localU = Math.abs((hitX - mapX * TILE_SIZE) / TILE_SIZE - 0.5);
                const localV = Math.abs((hitY - mapY * TILE_SIZE) / TILE_SIZE - 0.5);
                const diamondDist = boxDist + (localU + localV) * TILE_SIZE * 0.28;
                return { dist: Math.max(1, diamondDist), side, wallType: cellType, customShade: 0.92 - (localU + localV) * 0.3, stripeCoord: localU + localV };
            }

            hit = cellType;
        }
    }

    const perpWallDist = (side === 0 ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY)) * TILE_SIZE;
    const hitX = startX + cos * perpWallDist;
    const hitY = startY + sin * perpWallDist;
    const wallU = side === 0 ? ((hitY % TILE_SIZE) / TILE_SIZE) : ((hitX % TILE_SIZE) / TILE_SIZE);

    return {
        dist: Math.max(1, perpWallDist),
        side,
        wallType: hit,
        customShade: side === 1 ? 0.78 : 1.0,
        stripeCoord: wallU
    };
}

export function castRay(rayAngle) {
    return castRayFromPoint(gameState.localPlayer.x, gameState.localPlayer.y, rayAngle);
}
