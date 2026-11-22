// js/games/noteCraft/campusPreset.js
import { BLOCKS } from './constants.js';

export const CAMPUS_META = {
    name: 'Edmund Rice College',
    worldHalfX: 128,
    worldHalfZ: 96,
    spawnPoint: { x: 4, y: 3, z: 4 }
};

// Aligned with your engine.js CAMPUS_ZONES coordinate system
export const CAMPUS_BUILDINGS = [
    {
        id: 'admin',
        label: 'Admin',
        storeys: 2,
        parts: [
            { minX: 6, maxX: 18, minZ: -24, maxZ: -12 },
            { minX: 12, maxX: 22, minZ: -14, maxZ: -8 }
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'b-block',
        label: 'B Block',
        storeys: 1,
        parts: [
            { minX: 14, maxX: 26, minZ: -46, maxZ: -26 }
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'c-block',
        label: 'C Block',
        storeys: 2,
        // V-shaped two-storey wing
        parts: [
            { minX: 10, maxX: 30, minZ: -64, maxZ: -54 }, // West arm of V
            { minX: 28, maxX: 46, minZ: -72, maxZ: -56 }  // North-East arm of V
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    // Note: Gap between C Block (maxX: 46) and D Block (minX: 54)
    {
        id: 'd-block',
        label: 'D Block',
        storeys: 2,
        // Long rectangular 2-storey block connected to E Block at x = 86..96
        parts: [
            { minX: 54, maxX: 94, minZ: -54, maxZ: -44 }
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'e-block',
        label: 'E Block',
        storeys: 2,
        // Connected perpendicular to D Block's east end
        parts: [
            { minX: 84, maxX: 96, minZ: -44, maxZ: -18 }
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'f-block',
        label: 'F Block',
        storeys: 2,
        parts: [
            { minX: 60, maxX: 74, minZ: -26, maxZ: -8 }
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'g-block',
        label: 'G Block',
        storeys: 1,
        parts: [
            { minX: 44, maxX: 56, minZ: -24, maxZ: -4 }
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'library',
        label: 'Library',
        storeys: 1,
        parts: [
            { minX: 26, maxX: 42, minZ: -22, maxZ: -10 }
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'br-pelin-hall',
        label: 'Br. Pelin Hall',
        storeys: 1,
        tallSingleStorey: true,
        parts: [
            { minX: 6, maxX: 24, minZ: -6, maxZ: 10 }
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'chapel',
        label: 'Chapel',
        storeys: 1,
        parts: [
            { minX: 12, maxX: 22, minZ: 14, maxZ: 24 }
        ],
        wallBlock: BLOCKS.WOOD,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'j-block',
        label: 'J Block',
        storeys: 2,
        parts: [
            { minX: 10, maxX: 38, minZ: 34, maxZ: 46 }
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'tass',
        label: 'TASS',
        storeys: 2,
        parts: [
            { minX: -36, maxX: -14, minZ: 4, maxZ: 22 }
        ],
        wallBlock: BLOCKS.BRICK,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    },
    {
        id: 'erc',
        label: 'ERC',
        storeys: 2,
        parts: [
            { minX: -52, maxX: -14, minZ: -44, maxZ: -12 }
        ],
        wallBlock: BLOCKS.STONE,
        roofBlock: BLOCKS.STONE,
        windowBlock: BLOCKS.GLASS
    }
];

export const CAMPUS_STRUCTURES = [
    {
        id: 'cola',
        label: 'COLA',
        type: 'canopy',
        minX: 58,
        maxX: 78,
        minZ: -40,
        maxZ: -28,
        height: 5,
        pillarBlock: BLOCKS.STONE,
        roofBlock: BLOCKS.STONE
    },
    {
        id: 'court-pavilion',
        label: '',
        type: 'canopy',
        minX: -14,
        maxX: -6,
        minZ: 24,
        maxZ: 38,
        height: 4,
        pillarBlock: BLOCKS.WOOD,
        roofBlock: BLOCKS.LEAVES
    }
];

export const CAMPUS_ZONES = [
    {
        id: 'basketball-court',
        label: 'Basketball Court',
        minX: -42,
        maxX: -16,
        minZ: 26,
        maxZ: 52,
        floorBlock: BLOCKS.STONE
    },
    {
        id: 'central-driveway',
        label: '',
        minX: -8,
        maxX: 2,
        minZ: -36,
        maxZ: 52,
        floorBlock: BLOCKS.DIRT
    },
    {
        id: 'quad-courtyard',
        label: '',
        minX: 26,
        maxX: 56,
        minZ: -42,
        maxZ: -24,
        floorBlock: BLOCKS.DIRT
    }
];

// Precompute fast O(1) voxel lookup map for the entire campus
const voxelMap = new Map();
const labelAnchors = [];

function setPresetVoxel(x, y, z, blockId) {
    if (y < 1 || y >= 23) return;
    voxelMap.set(`${x}_${y}_${z}`, blockId);
}

function buildCampusVoxelCache() {
    voxelMap.clear();
    labelAnchors.length = 0;

    // 1. Flat Zones (Courts, Driveways, Courtyards) at y = 1
    for (const zone of CAMPUS_ZONES) {
        for (let x = zone.minX; x <= zone.maxX; x++) {
            for (let z = zone.minZ; z <= zone.maxZ; z++) {
                setPresetVoxel(x, 1, z, zone.floorBlock);
            }
        }
        if (zone.label) {
            labelAnchors.push({
                label: zone.label,
                x: (zone.minX + zone.maxX) / 2,
                y: 3.5,
                z: (zone.minZ + zone.maxZ) / 2
            });
        }
    }

    // 2. Campus Buildings (1-storey = 4 blocks high; 2-storey = 8 blocks high)
    for (const b of CAMPUS_BUILDINGS) {
        const wallTopY = b.storeys === 2 ? 9 : (b.tallSingleStorey ? 6 : 5);
        const roofY = wallTopY + 1;

        let sumX = 0, sumZ = 0, count = 0;

        for (const p of b.parts) {
            sumX += (p.minX + p.maxX) / 2;
            sumZ += (p.minZ + p.maxZ) / 2;
            count++;

            const midX = Math.floor((p.minX + p.maxX) / 2);
            const midZ = Math.floor((p.minZ + p.maxZ) / 2);

            for (let x = p.minX; x <= p.maxX; x++) {
                for (let z = p.minZ; z <= p.maxZ; z++) {
                    const isEdgeX = (x === p.minX || x === p.maxX);
                    const isEdgeZ = (z === p.minZ || z === p.maxZ);
                    const isPerimeter = isEdgeX || isEdgeZ;

                    // Stone foundation floor
                    setPresetVoxel(x, 1, z, BLOCKS.STONE);

                    // Exterior walls with windows & doorways
                    if (isPerimeter) {
                        for (let y = 2; y <= wallTopY; y++) {
                            // Leave 2-block-wide entrance doors on ground floor
                            const isDoor = (y <= 3) && ((isEdgeZ && Math.abs(x - midX) <= 1) || (isEdgeX && Math.abs(z - midZ) <= 1));
                            if (isDoor) continue;

                            // Windows on level 1 (y=3..4) and level 2 (y=7..8)
                            const isWindowRow = (y === 3 || y === 4) || (b.storeys === 2 && (y === 7 || y === 8));
                            const isWindowCol = ((x + z) % 3 === 0) && !(isEdgeX && isEdgeZ);
                            setPresetVoxel(x, y, z, (isWindowRow && isWindowCol) ? b.windowBlock : b.wallBlock);
                        }
                    } else if (b.storeys === 2) {
                        // Second-storey interior floor slab at y = 5
                        setPresetVoxel(x, 5, z, BLOCKS.WOOD);
                    }

                    // Roof slab
                    setPresetVoxel(x, roofY, z, b.roofBlock);
                }
            }
        }

        if (b.label && count > 0) {
            labelAnchors.push({
                label: b.label,
                x: sumX / count,
                y: roofY + 2.5,
                z: sumZ / count
            });
        }
    }

    // 3. Covered Structures (COLA & Court Pavilion)
    for (const s of CAMPUS_STRUCTURES) {
        const roofY = 1 + s.height;
        for (let x = s.minX; x <= s.maxX; x++) {
            for (let z = s.minZ; z <= s.maxZ; z++) {
                const isCorner = (x === s.minX || x === s.maxX) && (z === s.minZ || z === s.maxZ);
                if (isCorner) {
                    for (let y = 2; y < roofY; y++) {
                        setPresetVoxel(x, y, z, s.pillarBlock);
                    }
                }
                setPresetVoxel(x, roofY, z, s.roofBlock);
            }
        }
        if (s.label) {
            labelAnchors.push({
                label: s.label,
                x: (s.minX + s.maxX) / 2,
                y: roofY + 2.2,
                z: (s.minZ + s.maxZ) / 2
            });
        }
    }
}

buildCampusVoxelCache();

export function getCampusBlockAt(x, y, z) {
    return voxelMap.get(`${x}_${y}_${z}`);
}

export function getCampusPresetEntries() {
    return voxelMap.entries();
}

export function getCampusLabelAnchors() {
    return labelAnchors;
}

export default {
    meta: CAMPUS_META,
    buildings: CAMPUS_BUILDINGS,
    structures: CAMPUS_STRUCTURES,
    zones: CAMPUS_ZONES,
    getCampusBlockAt,
    getCampusPresetEntries,
    getCampusLabelAnchors
};
