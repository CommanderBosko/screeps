const EXTENSION_LIMITS = [0, 0, 5, 10, 20, 30, 40, 50, 50];
const TOWER_LIMITS    = [0, 0, 0, 1, 1, 2, 2, 3, 6];

// BFS from all wall/border tiles outward — each cell value = distance to nearest wall.
function distanceTransform(room) {
    const terrain = room.getTerrain();
    const dist = new Uint8Array(2500);
    const queue = [];

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (x < 2 || x > 47 || y < 2 || y > 47 || terrain.get(x, y) === TERRAIN_MASK_WALL) {
                dist[y * 50 + x] = 0;
                queue.push((y << 6) | x);
            } else {
                dist[y * 50 + x] = 255;
            }
        }
    }

    let head = 0;
    while (head < queue.length) {
        const packed = queue[head++];
        const x = packed & 0x3F;
        const y = packed >> 6;
        const d = dist[y * 50 + x];
        for (let i = 0; i < 4; i++) {
            const nx = x + (i === 0 ? -1 : i === 1 ? 1 : 0);
            const ny = y + (i === 2 ? -1 : i === 3 ? 1 : 0);
            if (nx < 0 || nx >= 50 || ny < 0 || ny >= 50) continue;
            const nd = d + 1;
            if (dist[ny * 50 + nx] > nd) {
                dist[ny * 50 + nx] = nd;
                queue.push((ny << 6) | nx);
            }
        }
    }
    return dist;
}

// Find the best hub for extension cluster: open area central to spawn/sources/controller.
function findHub(room, dist) {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return null;

    const sources = room.find(FIND_SOURCES);
    const ctrl = room.controller;

    let bestScore = -Infinity;
    let hub = null;

    for (let y = 3; y < 47; y++) {
        for (let x = 3; x < 47; x++) {
            const openness = dist[y * 50 + x];
            if (openness < 4) continue;

            const dSpawn = Math.max(Math.abs(x - spawn.pos.x), Math.abs(y - spawn.pos.y));
            if (dSpawn > 15) continue;

            let score = openness * 5 - dSpawn * 2;
            for (const src of sources) {
                score -= Math.hypot(x - src.pos.x, y - src.pos.y) * 0.3;
            }
            if (ctrl) score -= Math.hypot(x - ctrl.pos.x, y - ctrl.pos.y) * 0.4;

            if (score > bestScore) {
                bestScore = score;
                hub = { x, y };
            }
        }
    }
    return hub;
}

function countType(room, structureType) {
    const built = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === structureType }).length;
    const sites = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === structureType }).length;
    return built + sites;
}

function totalSites(room) {
    return room.find(FIND_CONSTRUCTION_SITES).length;
}

function placeExtensions(room, hub, parity, needed) {
    const terrain = room.getTerrain();
    let placed = 0;

    for (let r = 1; r <= 15 && placed < needed; r++) {
        for (let dx = -r; dx <= r && placed < needed; dx++) {
            for (let dy = -r; dy <= r && placed < needed; dy++) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const x = hub.x + dx;
                const y = hub.y + dy;
                if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                if ((x + y) % 2 !== parity) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (totalSites(room) >= 90) return;
                if (room.createConstructionSite(x, y, STRUCTURE_EXTENSION) === OK) placed++;
            }
        }
    }
}

function placeTowers(room, parity, needed) {
    if (needed <= 0) return;
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    const terrain = room.getTerrain();
    let placed = 0;

    for (let r = 2; r <= 10 && placed < needed; r++) {
        for (let dx = -r; dx <= r && placed < needed; dx++) {
            for (let dy = -r; dy <= r && placed < needed; dy++) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const x = spawn.pos.x + dx;
                const y = spawn.pos.y + dy;
                if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                if ((x + y) % 2 === parity) continue; // avoid extension parity
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (totalSites(room) >= 90) return;
                if (room.createConstructionSite(x, y, STRUCTURE_TOWER) === OK) placed++;
            }
        }
    }
}

function placeContainers(room) {
    const terrain = room.getTerrain();
    for (const source of room.find(FIND_SOURCES)) {
        const nearby = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        }).length + source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        }).length;
        if (nearby > 0) continue;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (room.createConstructionSite(x, y, STRUCTURE_CONTAINER) === OK) break;
            }
        }
    }
}

function placeRoads(room, hub) {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    const targets = [
        ...room.find(FIND_SOURCES).map(s => s.pos),
        room.controller ? room.controller.pos : null,
        new RoomPosition(hub.x, hub.y, room.name),
    ].filter(Boolean);

    for (const target of targets) {
        const path = spawn.pos.findPathTo(target, { ignoreCreeps: true, swampCost: 1 });
        for (const step of path) {
            room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
        }
    }
}

const planner = {
    run: function (room) {
        if (!room.controller || !room.controller.my) return;
        const rcl = room.controller.level;

        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
        const mem = Memory.rooms[room.name];
        if (!mem.plan) mem.plan = {};

        if (mem.plan.lastRCL === rcl) return;

        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;

        if (!mem.plan.hub) {
            const dist = distanceTransform(room);
            mem.plan.hub = findHub(room, dist);
        }
        if (!mem.plan.hub) return;

        const hub = mem.plan.hub;
        const parity = (hub.x + hub.y) % 2;

        const extTarget = EXTENSION_LIMITS[rcl] || 0;
        const extHave = countType(room, STRUCTURE_EXTENSION);
        if (extHave < extTarget) placeExtensions(room, hub, parity, extTarget - extHave);

        const towerTarget = TOWER_LIMITS[rcl] || 0;
        const towerHave = countType(room, STRUCTURE_TOWER);
        if (towerHave < towerTarget) placeTowers(room, parity, towerTarget - towerHave);

        placeContainers(room);

        if (rcl >= 2) placeRoads(room, hub);

        mem.plan.lastRCL = rcl;
        console.log('Planned structures for ' + room.name + ' at RCL ' + rcl);
    }
};

module.exports = planner;
