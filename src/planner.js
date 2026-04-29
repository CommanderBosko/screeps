// ─── RCL-gated structure count limits ─────────────────────────────────────
const EXTENSION_LIMITS  = [0, 0, 5, 10, 20, 30, 40, 50, 60];
const TOWER_LIMITS      = [0, 0, 0,  1,  1,  2,  2,  3,  6];
const LINK_LIMITS       = [0, 0, 0,  0,  0,  2,  3,  4,  6];
const STORAGE_LIMITS    = [0, 0, 0,  0,  1,  1,  1,  1,  1];
const TERMINAL_LIMITS   = [0, 0, 0,  0,  0,  0,  1,  1,  1];
const LAB_LIMITS        = [0, 0, 0,  0,  0,  0,  3,  6, 10];
const OBSERVER_LIMITS   = [0, 0, 0,  0,  0,  0,  0,  0,  1];
const NUKER_LIMITS      = [0, 0, 0,  0,  0,  0,  0,  0,  1];
const POWERSPAWN_LIMITS = [0, 0, 0,  0,  0,  0,  0,  0,  1];

// ─── Stamp template ────────────────────────────────────────────────────────
// Fixed 11×11 (±5) template centered on the hub tile.
// Offsets are [dx, dy] from hub center.
//
// Processing order: spawn → storage → extensions → towers → link (receiver) →
//                   terminal → labs → observer → nuker → power spawn → roads
//
// Roads come LAST so structures claim their tiles first; road placement then
// skips occupied tiles (createConstructionSite returns ERR_INVALID_TARGET).
//
// Reserved tiles (never used for extensions):
//   [0,-1] = storage
//   [0, 1] = terminal
//   [0,-2] = receiver link
//   [0, 2] = observer
//   [2,-3] = lab (ring 4 would put an extension here — excluded)
//
// Extension count: Ring1(6) + Ring2(12) + Ring3(16) + Ring4(19) + Ring5(7) = 60
//   Ring 4 has [2,-3] removed (conflicts with lab); Ring 5 gains [-4,3] to compensate.
//
// Tower positions (6): [-3,-3],[3,-3],[-3,3],[3,3],[-4,-2],[4,-2]
// Lab positions (10): cluster in +x/-y quadrant clear of towers.
//
// Roads: cardinal cross ±5 plus diagonal connectors; placed last so they don't
//        block structures (road site would prevent extension at same tile).

const STAMP = (function () {
    const entries = [];
    function add(dx, dy, type) { entries.push({ dx, dy, type }); }

    // ── Spawn ──────────────────────────────────────────────────────────────
    add(0, 0, STRUCTURE_SPAWN);

    // ── Storage ────────────────────────────────────────────────────────────
    add(0, -1, STRUCTURE_STORAGE);

    // ── Extensions (60 total) ──────────────────────────────────────────────
    // [0,-2] reserved for link, [0,2] reserved for observer, [2,-3] is a lab.
    // Ring 1 (6)
    for (const [dx, dy] of [
        [-1,-1],[1,-1],[-1,1],[1,1],[-2,0],[2,0],
    ]) add(dx, dy, STRUCTURE_EXTENSION);

    // Ring 2 (12)
    for (const [dx, dy] of [
        [-2,-1],[2,-1],[-2,1],[2,1],
        [-1,-2],[1,-2],[-1,2],[1,2],
        [-3,0],[3,0],[0,-3],[0,3],
    ]) add(dx, dy, STRUCTURE_EXTENSION);

    // Ring 3 (16)
    for (const [dx, dy] of [
        [-2,-2],[2,-2],[-2,2],[2,2],
        [-3,-1],[3,-1],[-3,1],[3,1],
        [-1,-3],[1,-3],[-1,3],[1,3],
        [-4,0],[4,0],[0,-4],[0,4],
    ]) add(dx, dy, STRUCTURE_EXTENSION);

    // Ring 4 (19 — [2,-3] excluded; it's a lab slot)
    for (const [dx, dy] of [
        [-3,-2],[3,-2],[-3,2],[3,2],
        [-2,-3],       [-2,3],[2,3],   // [2,-3] removed (lab conflict)
        [-4,-1],[4,-1],[-4,1],[4,1],
        [-1,-4],[1,-4],[-1,4],[1,4],
        [-5,0],[5,0],[0,-5],[0,5],
    ]) add(dx, dy, STRUCTURE_EXTENSION);

    // Ring 5 (7 — compensates for the removed [2,-3] slot)
    for (const [dx, dy] of [
        [-5,-1],[5,-1],[-5,1],[5,1],
        [-4,-3],[-3,-4],[-4,3],
    ]) add(dx, dy, STRUCTURE_EXTENSION);

    // ── Towers (6) ─────────────────────────────────────────────────────────
    for (const [dx, dy] of [
        [-3,-3],[3,-3],[-3,3],[3,3],[-4,-2],[4,-2],
    ]) add(dx, dy, STRUCTURE_TOWER);

    // ── Receiver link ──────────────────────────────────────────────────────
    // [0,-2]: just above storage, short transfer path to spawn/extensions.
    add(0, -2, STRUCTURE_LINK);

    // ── Terminal ────────────────────────────────────────────────────────────
    add(0, 1, STRUCTURE_TERMINAL);

    // ── Labs (10) ──────────────────────────────────────────────────────────
    // Clustered in the +x / -y quadrant, clear of towers at [-3,-3],[3,-3].
    // [2,-3] is the first lab; it was deliberately kept out of extensions.
    for (const [dx, dy] of [
        [2,-3],[2,-4],[2,-5],
        [3,-4],[3,-5],
        [4,-4],[4,-5],
        [5,-4],[5,-5],
        [4,-3],
    ]) add(dx, dy, STRUCTURE_LAB);

    // ── Observer ───────────────────────────────────────────────────────────
    add(0, 2, STRUCTURE_OBSERVER);

    // ── Nuker ──────────────────────────────────────────────────────────────
    add(-4, 4, STRUCTURE_NUKER);

    // ── Power Spawn ────────────────────────────────────────────────────────
    add(4, 4, STRUCTURE_POWER_SPAWN);

    // ── Internal roads (LAST — placed after structures claim their tiles) ──
    // Cardinal cross ±5 from center. Occupied tiles are skipped silently.
    for (const [dx, dy] of [
        [1,0],[2,0],[3,0],[4,0],[5,0],
        [-1,0],[-2,0],[-3,0],[-4,0],[-5,0],
        [0,1],[0,2],[0,3],[0,4],[0,5],
        [0,-1],[0,-2],[0,-3],[0,-4],[0,-5],
    ]) add(dx, dy, STRUCTURE_ROAD);

    // Diagonal connectors (ring roads that keep extensions reachable)
    for (const [dx, dy] of [
        [-1,-2],[1,-2],[-2,-1],[2,-1],
        [-1, 2],[1, 2],[-2, 1],[2, 1],
        [-1,-3],[1,-3],[-3,-1],[3,-1],
        [-1, 3],[1, 3],[-3, 1],[3, 1],
        [-2,-2],[2,-2],[-2, 2],[2, 2],
        [-3,-3],[3,-3],[-3, 3],[3, 3],
    ]) add(dx, dy, STRUCTURE_ROAD);

    return entries;
})();

// RCL limit lookup for each structure type used in the stamp.
// Roads have no per-type limit — null signals unlimited.
const STAMP_LIMITS = {
    [STRUCTURE_SPAWN]:       [1, 1, 1, 1, 1, 1, 1, 2, 3],
    [STRUCTURE_EXTENSION]:   EXTENSION_LIMITS,
    [STRUCTURE_TOWER]:       TOWER_LIMITS,
    [STRUCTURE_STORAGE]:     STORAGE_LIMITS,
    [STRUCTURE_LINK]:        LINK_LIMITS,
    [STRUCTURE_TERMINAL]:    TERMINAL_LIMITS,
    [STRUCTURE_LAB]:         LAB_LIMITS,
    [STRUCTURE_OBSERVER]:    OBSERVER_LIMITS,
    [STRUCTURE_NUKER]:       NUKER_LIMITS,
    [STRUCTURE_POWER_SPAWN]: POWERSPAWN_LIMITS,
    [STRUCTURE_ROAD]:        null,
};

// ─── Distance transform ────────────────────────────────────────────────────
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

// ─── Stamp footprint validity check ───────────────────────────────────────
// Returns true if every tile in the stamp footprint is passable and in bounds.
// Called by findHub before committing to a hub candidate.
function stampFits(terrain, cx, cy) {
    for (const { dx, dy } of STAMP) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 2 || x > 47 || y < 2 || y > 47) return false;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;
    }
    return true;
}

// ─── Find best hub point ───────────────────────────────────────────────────
// Scores candidates by openness, proximity to spawn/sources/controller.
// Only commits to candidates where the full stamp footprint fits.
function findHub(room, dist) {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return null;

    const sources = room.find(FIND_SOURCES);
    const ctrl = room.controller;
    const terrain = room.getTerrain();

    let bestScore = -Infinity;
    let hub = null;

    // Search range: dist >= 6 is a necessary (but not sufficient) condition for an
    // 11×11 stamp to fit. stampFits() is the authoritative validity check.
    for (let y = 6; y < 44; y++) {
        for (let x = 6; x < 44; x++) {
            const openness = dist[y * 50 + x];
            if (openness < 6) continue;

            const dSpawn = Math.max(Math.abs(x - spawn.pos.x), Math.abs(y - spawn.pos.y));
            if (dSpawn > 15) continue;

            let score = openness * 5 - dSpawn * 2;
            for (const src of sources) {
                score -= Math.hypot(x - src.pos.x, y - src.pos.y) * 0.3;
            }
            if (ctrl) score -= Math.hypot(x - ctrl.pos.x, y - ctrl.pos.y) * 0.4;

            if (score > bestScore && stampFits(terrain, x, y)) {
                bestScore = score;
                hub = { x, y };
            }
        }
    }
    return hub;
}

// ─── Count built + planned structures of a given type ─────────────────────
function countType(room, structureType) {
    const built = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === structureType }).length;
    const sites = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === structureType }).length;
    return built + sites;
}

function totalSites(room) {
    return room.find(FIND_CONSTRUCTION_SITES).length;
}

// ─── Apply stamp ───────────────────────────────────────────────────────────
// Places all structures in STAMP at (hub.x + dx, hub.y + dy).
// Structures are processed before roads (stamp ordering) so extensions/towers
// claim their tiles first; road entries then skip occupied tiles.
// Respects per-type RCL limits. Stops if the global 100-site cap is approached.
function applyStamp(room, hub, rcl) {
    const terrain = room.getTerrain();

    // Pre-count existing structures+sites per type so we know how many remain to place.
    const typeExisting = {};
    for (const type in STAMP_LIMITS) {
        if (STAMP_LIMITS[type] === null) continue; // roads are unlimited
        typeExisting[type] = countType(room, type);
    }

    // Per-invocation placement counter (added on top of typeExisting).
    const typePlaced = {};

    let siteCount = totalSites(room);

    for (const { dx, dy, type } of STAMP) {
        if (siteCount >= 90) break; // global construction site cap

        const x = hub.x + dx;
        const y = hub.y + dy;

        // Bounds + terrain — defensive; stampFits should have validated the hub.
        if (x < 2 || x > 47 || y < 2 || y > 47) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

        if (type !== STRUCTURE_ROAD) {
            const limits = STAMP_LIMITS[type];
            if (!limits) continue;
            const limit = limits[rcl] || 0;
            if (limit === 0) continue; // structure not available at this RCL

            const alreadyHave = (typeExisting[type] || 0) + (typePlaced[type] || 0);
            if (alreadyHave >= limit) continue;
        }

        // Inspect the target tile.
        const pos = new RoomPosition(x, y, room.name);
        const structs = pos.lookFor(LOOK_STRUCTURES);
        const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);

        if (type === STRUCTURE_ROAD) {
            // Roads coexist with ramparts; skip if any other structure/site is there.
            if (structs.some(s => s.structureType === STRUCTURE_ROAD)) continue;
            if (sites.some(s => s.structureType === STRUCTURE_ROAD)) continue;
            if (structs.some(s => s.structureType !== STRUCTURE_ROAD &&
                                  s.structureType !== STRUCTURE_RAMPART)) continue;
            if (sites.length > 0) continue; // any site (extension, tower, etc.) blocks road
        } else {
            // Skip if the correct structure/site already exists here.
            if (structs.some(s => s.structureType === type)) continue;
            if (sites.some(s => s.structureType === type)) continue;
            // Don't overwrite a different existing structure or site.
            if (structs.length > 0 || sites.length > 0) continue;
        }

        const result = room.createConstructionSite(x, y, type);
        if (result === OK) {
            siteCount++;
            if (type !== STRUCTURE_ROAD) {
                typePlaced[type] = (typePlaced[type] || 0) + 1;
            }
        }
    }
}

// ─── Source containers ─────────────────────────────────────────────────────
// One container adjacent to each source for stationary miners to park on.
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

// ─── Controller container ──────────────────────────────────────────────────
// Container near controller so upgraders have a local energy buffer.
function placeControllerContainer(room) {
    const ctrl = room.controller;
    if (!ctrl) return;

    const nearby = ctrl.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: s => s.structureType === STRUCTURE_CONTAINER
    }).length + ctrl.pos.findInRange(FIND_CONSTRUCTION_SITES, 3, {
        filter: s => s.structureType === STRUCTURE_CONTAINER
    }).length;
    if (nearby > 0) return;

    const terrain = room.getTerrain();
    for (let r = 1; r <= 3; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const x = ctrl.pos.x + dx, y = ctrl.pos.y + dy;
                if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (room.createConstructionSite(x, y, STRUCTURE_CONTAINER) === OK) {
                    console.log('Controller container placed in ' + room.name);
                    return;
                }
            }
        }
    }
}

// ─── Source links + upgrader link ──────────────────────────────────────────
// The receiver link at hub[0,-2] is handled by applyStamp.
// This function places:
//   - One link per source (adjacent to source container if possible)
//   - One link near controller at RCL 6+ (for upgrader throughput)
function placeLinks(room) {
    const rcl = room.controller.level;
    const limit = LINK_LIMITS[rcl] || 0;
    if (countType(room, STRUCTURE_LINK) >= limit) return;

    const terrain = room.getTerrain();

    // Source links
    for (const source of room.find(FIND_SOURCES)) {
        if (countType(room, STRUCTURE_LINK) >= limit) break;

        const hasLink =
            source.pos.findInRange(FIND_MY_STRUCTURES, 2, { filter: s => s.structureType === STRUCTURE_LINK }).length +
            source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, { filter: s => s.structureType === STRUCTURE_LINK }).length > 0;
        if (hasLink) continue;

        const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        })[0];

        let placed = false;
        // First pass: tile adjacent to BOTH source and container
        if (container) {
            outer:
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const x = source.pos.x + dx, y = source.pos.y + dy;
                    if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                    if (Math.abs(x - container.pos.x) > 1 || Math.abs(y - container.pos.y) > 1) continue;
                    const p = new RoomPosition(x, y, room.name);
                    if (p.lookFor(LOOK_STRUCTURES).length > 0) continue;
                    if (p.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) continue;
                    if (room.createConstructionSite(x, y, STRUCTURE_LINK) === OK) { placed = true; break outer; }
                }
            }
        }
        // Fallback: any open tile adjacent to source
        if (!placed) {
            outer:
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const x = source.pos.x + dx, y = source.pos.y + dy;
                    if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                    const p = new RoomPosition(x, y, room.name);
                    if (p.lookFor(LOOK_STRUCTURES).length > 0) continue;
                    if (p.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) continue;
                    if (room.createConstructionSite(x, y, STRUCTURE_LINK) === OK) { break outer; }
                }
            }
        }
    }

    // Upgrader link at RCL 6+: near controller for upgrader throughput
    if (rcl >= 6 && countType(room, STRUCTURE_LINK) < limit) {
        const ctrl = room.controller;
        if (ctrl) {
            const hasCtrlLink =
                ctrl.pos.findInRange(FIND_MY_STRUCTURES, 3, { filter: s => s.structureType === STRUCTURE_LINK }).length +
                ctrl.pos.findInRange(FIND_CONSTRUCTION_SITES, 3, { filter: s => s.structureType === STRUCTURE_LINK }).length > 0;
            if (!hasCtrlLink) {
                outer:
                for (let r = 1; r <= 3; r++) {
                    for (let dx = -r; dx <= r; dx++) {
                        for (let dy = -r; dy <= r; dy++) {
                            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                            const x = ctrl.pos.x + dx, y = ctrl.pos.y + dy;
                            if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                            const p = new RoomPosition(x, y, room.name);
                            if (p.lookFor(LOOK_STRUCTURES).length > 0) continue;
                            if (p.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) continue;
                            if (room.createConstructionSite(x, y, STRUCTURE_LINK) === OK) {
                                console.log('Upgrader link placed near controller in ' + room.name);
                                break outer;
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─── External roads ────────────────────────────────────────────────────────
// Pathfind roads from spawn to sources, controller, hub, and storage.
// Treats existing roads as low-cost so paths extend existing networks.
function placeRoads(room, hub) {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    const costs = new PathFinder.CostMatrix();
    const terrain = room.getTerrain();
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                costs.set(x, y, 255);
            } else {
                costs.set(x, y, 2);
            }
        }
    }
    for (const road of room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD })) {
        costs.set(road.pos.x, road.pos.y, 1);
    }
    for (const site of room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_ROAD })) {
        costs.set(site.pos.x, site.pos.y, 1);
    }

    const ctrl = room.controller;
    const targets = [
        ...room.find(FIND_SOURCES).map(s => s.pos),
        ctrl ? ctrl.pos : null,
        new RoomPosition(hub.x, hub.y, room.name),
        room.storage ? room.storage.pos : null,
    ].filter(Boolean);

    const sources = room.find(FIND_SOURCES);
    for (const target of targets) {
        const result = PathFinder.search(
            spawn.pos,
            { pos: target, range: 1 },
            {
                roomCallback: () => costs,
                plainCost: 2,
                swampCost: 3,
                maxOps: 2000
            }
        );
        if (result.incomplete) continue;
        for (const pos of result.path) {
            if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) continue;
            if (pos.x === spawn.pos.x && pos.y === spawn.pos.y) continue;
            if (ctrl && pos.x === ctrl.pos.x && pos.y === ctrl.pos.y) continue;
            if (sources.some(s => s.pos.x === pos.x && s.pos.y === pos.y)) continue;
            const existing = pos.lookFor(LOOK_STRUCTURES);
            if (existing.some(s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART)) continue;
            if (existing.some(s => s.structureType === STRUCTURE_ROAD)) continue;
            const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === STRUCTURE_ROAD);
            if (hasSite) continue;
            room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
        }
    }
}

// ─── Ramparts ──────────────────────────────────────────────────────────────
// Scale rampart coverage by RCL to match repair capacity.
// RCL 2-3: only spawn; RCL 4: spawn+towers; RCL 5+: all critical structures.
function placeRamparts(room) {
    const rcl = room.controller ? room.controller.level : 0;
    if (rcl < 2) return;

    const positions = [];

    if (rcl < 4) {
        const spawns = room.find(FIND_MY_SPAWNS);
        for (const s of spawns) positions.push(s.pos);
    } else if (rcl < 5) {
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (spawn) positions.push(spawn.pos);
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER
        });
        for (const t of towers) positions.push(t.pos);
    } else {
        const structTypes = [
            STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_EXTENSION,
            STRUCTURE_CONTAINER, STRUCTURE_STORAGE, STRUCTURE_LINK,
        ];
        const structs = room.find(FIND_STRUCTURES, {
            filter: s => structTypes.includes(s.structureType)
        });
        for (const s of structs) positions.push(s.pos);
        if (room.controller) positions.push(room.controller.pos);
    }

    let siteCount = totalSites(room);
    for (const pos of positions) {
        if (siteCount >= 90) return;
        const at = pos.lookFor(LOOK_STRUCTURES);
        if (at.some(s => s.structureType === STRUCTURE_RAMPART)) continue;
        const atSite = pos.lookFor(LOOK_CONSTRUCTION_SITES);
        if (atSite.some(s => s.structureType === STRUCTURE_RAMPART)) continue;
        if (room.createConstructionSite(pos, STRUCTURE_RAMPART) === OK) siteCount++;
    }
}

// ─── Needs replanning? ─────────────────────────────────────────────────────
// Returns true if the planner should re-run to fill gaps.
function needsReplanning(room, rcl, mem) {
    if (mem.plan.lastRCL !== rcl) return true;

    const extTarget = EXTENSION_LIMITS[rcl] || 0;
    if (extTarget > 0 && countType(room, STRUCTURE_EXTENSION) < extTarget) return true;

    const towerTarget = TOWER_LIMITS[rcl] || 0;
    if (towerTarget > 0 && countType(room, STRUCTURE_TOWER) < towerTarget) return true;

    // Containers: one per source + one near controller at RCL 3+
    const sourceCount = room.find(FIND_SOURCES).length;
    const containerCount = countType(room, STRUCTURE_CONTAINER);
    const expectedContainers = rcl >= 3 ? sourceCount + 1 : sourceCount;
    if (containerCount < expectedContainers) return true;

    // Links
    const linkTarget = LINK_LIMITS[rcl] || 0;
    if (linkTarget > 0 && countType(room, STRUCTURE_LINK) < linkTarget) return true;

    // Ramparts: compare against RCL-scaled target set
    if (rcl >= 2) {
        let rampartTarget = 0;
        if (rcl < 4) {
            rampartTarget = room.find(FIND_MY_SPAWNS).length;
        } else if (rcl < 5) {
            rampartTarget = room.find(FIND_MY_SPAWNS).length +
                room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length;
        } else {
            const structTypes = [
                STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_EXTENSION,
                STRUCTURE_CONTAINER, STRUCTURE_STORAGE, STRUCTURE_LINK,
            ];
            rampartTarget = room.find(FIND_STRUCTURES, {
                filter: s => structTypes.includes(s.structureType)
            }).length + (room.controller ? 1 : 0);
        }
        if (countType(room, STRUCTURE_RAMPART) < rampartTarget) return true;
    }

    return false;
}

// ─── Public API ────────────────────────────────────────────────────────────
const planner = {
    run: function (room) {
        if (!room.controller || !room.controller.my) return;
        const rcl = room.controller.level;

        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
        const mem = Memory.rooms[room.name];
        if (!mem.plan) mem.plan = {};

        // Fast-exit when nothing needs to change.
        if (!needsReplanning(room, rcl, mem)) return;

        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;

        // Hub is stable for the lifetime of the room — compute once and cache.
        if (!mem.plan.hub) {
            const dist = distanceTransform(room);
            mem.plan.hub = findHub(room, dist);
            if (mem.plan.hub) {
                console.log('Stamp hub selected at ' + JSON.stringify(mem.plan.hub) + ' in ' + room.name);
            }
        }
        if (!mem.plan.hub) return;

        const hub = mem.plan.hub;

        // Stamp: spawn, storage, extensions, towers, link, terminal, labs, observer,
        //        nuker, power spawn, then roads — all gated by RCL.
        applyStamp(room, hub, rcl);

        // Source/controller containers (proximity-based, not in stamp)
        placeContainers(room);
        if (rcl >= 3) placeControllerContainer(room);

        // Source links + upgrader link (receiver link is in the stamp at [0,-2])
        if (rcl >= 5) placeLinks(room);

        // External roads: spawn → sources / controller / hub / storage
        if (rcl >= 2) placeRoads(room, hub);

        // Ramparts on critical structures
        if (rcl >= 2) placeRamparts(room);

        // Update lastRCL only once all stamp structures are fully placed.
        // If still short (site cap, terrain blocked) we retry on next invocation.
        const extNow = countType(room, STRUCTURE_EXTENSION);
        const towerNow = countType(room, STRUCTURE_TOWER);
        const extTarget = EXTENSION_LIMITS[rcl] || 0;
        const towerTarget = TOWER_LIMITS[rcl] || 0;
        if (extNow >= extTarget && towerNow >= towerTarget) {
            mem.plan.lastRCL = rcl;
        }

        console.log('Planner ran for ' + room.name + ' RCL ' + rcl +
            ' ext=' + extNow + '/' + extTarget +
            ' towers=' + towerNow + '/' + towerTarget);
    }
};

module.exports = planner;
