const EXTENSION_LIMITS = [0, 0, 5, 10, 20, 30, 40, 50, 50];
const TOWER_LIMITS    = [0, 0, 0, 1, 1, 2, 2, 3, 6];
const LINK_LIMITS     = [0, 0, 0, 0, 0, 2, 3, 4, 6];

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

// Count built structures + construction sites of a given type in the room.
function countType(room, structureType) {
    const built = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === structureType }).length;
    const sites = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === structureType }).length;
    return built + sites;
}

function totalSites(room) {
    return room.find(FIND_CONSTRUCTION_SITES).length;
}

// True if a position is blocked by any non-road structure or construction site.
// Roads are transparent to extension placement — we just want to avoid colliding
// with spawns, towers, containers, links, etc.
function isClearForStructure(room, x, y) {
    const pos = new RoomPosition(x, y, room.name);
    const structs = pos.lookFor(LOOK_STRUCTURES);
    for (const s of structs) {
        if (s.structureType !== STRUCTURE_ROAD) return false;
    }
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    if (sites.length > 0) return false;
    return true;
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
                if (!isClearForStructure(room, x, y)) continue;
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
                if (!isClearForStructure(room, x, y)) continue;
                if (totalSites(room) >= 90) return;
                if (room.createConstructionSite(x, y, STRUCTURE_TOWER) === OK) placed++;
            }
        }
    }
}

function placeLinks(room) {
    const rcl = room.controller.level;
    const limit = LINK_LIMITS[rcl] || 0;
    if (countType(room, STRUCTURE_LINK) >= limit) return;

    const terrain = room.getTerrain();
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    // Receiver link: adjacent to storage (preferred) or spawn so haulers have a short trip.
    // Use range 1 (not 2) to detect so we don't confuse a nearby source link for a receiver.
    const anchor = room.storage || spawn;
    const hasReceiver =
        anchor.pos.findInRange(FIND_MY_STRUCTURES, 1, { filter: s => s.structureType === STRUCTURE_LINK }).length +
        anchor.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, { filter: s => s.structureType === STRUCTURE_LINK }).length > 0;

    if (!hasReceiver && countType(room, STRUCTURE_LINK) < limit) {
        outer:
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = anchor.pos.x + dx, y = anchor.pos.y + dy;
                if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (!isClearForStructure(room, x, y)) continue;
                if (room.createConstructionSite(x, y, STRUCTURE_LINK) === OK) {
                    console.log('Receiver link placed near ' + (room.storage ? 'storage' : 'spawn') + ' in ' + room.name);
                    break outer;
                }
            }
        }
    }

    // Source links: one per source, preferring tiles also adjacent to the container so
    // the stationary miner can transfer directly (Chebyshev range 1).
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
                    if (!isClearForStructure(room, x, y)) continue;
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
                    if (!isClearForStructure(room, x, y)) continue;
                    if (room.createConstructionSite(x, y, STRUCTURE_LINK) === OK) { break outer; }
                }
            }
        }
    }

    // Upgrader link: at RCL 6+ we have 3 links — place one near the controller
    // so upgraders can withdraw from it instead of travelling to storage.
    // This dramatically increases upgrade throughput.
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
                            if (!isClearForStructure(room, x, y)) continue;
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

// Place a container adjacent to the controller so upgraders have a local energy buffer.
// Upgraders withdraw from this container; haulers (or harvesters) fill it.
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

// Place roads along paths from spawn to key destinations.
// Skips tiles that already have a road or a road construction site.
// Uses a cost matrix that treats built roads as zero-cost so paths
// prefer extending existing road networks rather than cutting new ones.
function placeRoads(room, hub) {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) return;

    // Build a cost matrix that treats existing roads as cost 1 (preferred)
    // and plain/swamp tiles as cost 2 so the pathfinder follows existing roads.
    const costs = new PathFinder.CostMatrix();
    const terrain = room.getTerrain();
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                costs.set(x, y, 255);
            } else {
                costs.set(x, y, 2); // prefer building on existing paths
            }
        }
    }
    // Mark existing roads and road sites as cost 1 so the pathfinder follows them.
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
            // Never place a road on the spawn, controller, or source tile itself
            if (pos.x === spawn.pos.x && pos.y === spawn.pos.y) continue;
            if (ctrl && pos.x === ctrl.pos.x && pos.y === ctrl.pos.y) continue;
            if (sources.some(s => s.pos.x === pos.x && s.pos.y === pos.y)) continue;
            // Never place a road on a tile that already has a non-road, non-rampart structure.
            // Roads can coexist with ramparts (common pattern for protected corridors).
            // Spawns, extensions, towers, containers, links, etc. already block road placement
            // via isClearForStructure — no need to re-check here.
            const existing = pos.lookFor(LOOK_STRUCTURES);
            if (existing.some(s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART)) continue;
            // Skip if a road already exists or a road site is already planned here
            if (existing.some(s => s.structureType === STRUCTURE_ROAD)) continue;
            const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === STRUCTURE_ROAD);
            if (hasSite) continue;
            room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
        }
    }
}

// Place ramparts on critical structures, scaled by RCL to match repair capacity.
//
// Decay math: ramparts decay at 1 HP/tick on MMO. A base repairer (1 WORK part)
// does 100 HP/action but wastes ticks travelling. Effective throughput with travel
// is roughly 20-40 HP/tick — barely enough for 1 rampart, let alone many.
//
// RCL 2-3: no tower exists (TOWER_LIMITS[2]=0, TOWER_LIMITS[3]=1 but it may not be
// built yet). Only protect the spawn — 1 rampart is manageable.
// RCL 4: first tower is guaranteed. Add tower(s) to the protected set.
// RCL 5+: full coverage — all critical structures and controller.
//
// The needsReplanning check is kept in sync: it only compares against the same
// reduced set so we don't trigger infinite replan-decay cycles at low RCL.
function placeRamparts(room) {
    const rcl = room.controller ? room.controller.level : 0;
    if (rcl < 2) return;

    // Collect positions to protect, scaled by RCL
    const positions = [];

    if (rcl < 4) {
        // RCL 2-3: only the spawn. One rampart the repairer can actually maintain.
        const spawns = room.find(FIND_MY_SPAWNS);
        for (const s of spawns) positions.push(s.pos);
    } else if (rcl < 5) {
        // RCL 4: spawn + towers. Tower now exists and can help repair.
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (spawn) positions.push(spawn.pos);
        const towers = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER
        });
        for (const t of towers) positions.push(t.pos);
    } else {
        // RCL 5+: full coverage — all critical structures and controller
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

    // Cache site count once; increment locally to avoid repeated find() calls
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

// Detect whether the room is missing structures it should have at current RCL.
// Returns true if the planner should re-run to fill the gaps.
function needsReplanning(room, rcl, mem) {
    if (mem.plan.lastRCL !== rcl) return true; // RCL changed

    // Check critical counts — if anything is below target, replan
    const extTarget = EXTENSION_LIMITS[rcl] || 0;
    if (extTarget > 0 && countType(room, STRUCTURE_EXTENSION) < extTarget) return true;

    const towerTarget = TOWER_LIMITS[rcl] || 0;
    if (towerTarget > 0 && countType(room, STRUCTURE_TOWER) < towerTarget) return true;

    // Containers: one per source + one near controller at RCL 3+
    const sourceCount = room.find(FIND_SOURCES).length;
    const containerCount = countType(room, STRUCTURE_CONTAINER);
    const expectedContainers = rcl >= 3 ? sourceCount + 1 : sourceCount;
    if (containerCount < expectedContainers) return true;

    // Links: check if we're below limit
    const linkTarget = LINK_LIMITS[rcl] || 0;
    if (linkTarget > 0 && countType(room, STRUCTURE_LINK) < linkTarget) return true;

    // Ramparts: compare against the RCL-scaled target set (mirrors placeRamparts logic).
    // Using the same reduced set prevents infinite replan-decay cycles at low RCL where
    // repair capacity can't keep up with many ramparts.
    if (rcl >= 2) {
        let rampartTarget = 0;
        if (rcl < 4) {
            // Only spawns
            rampartTarget = room.find(FIND_MY_SPAWNS).length;
        } else if (rcl < 5) {
            // Spawns + towers
            rampartTarget = room.find(FIND_MY_SPAWNS).length +
                room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length;
        } else {
            // All critical structures + controller
            const structTypes = [
                STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_EXTENSION,
                STRUCTURE_CONTAINER, STRUCTURE_STORAGE, STRUCTURE_LINK,
            ];
            rampartTarget = room.find(FIND_STRUCTURES, {
                filter: s => structTypes.includes(s.structureType)
            }).length + (room.controller ? 1 : 0);
        }
        const rampartCount = countType(room, STRUCTURE_RAMPART);
        if (rampartCount < rampartTarget) return true;
    }

    return false;
}

const planner = {
    run: function (room) {
        if (!room.controller || !room.controller.my) return;
        const rcl = room.controller.level;

        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
        const mem = Memory.rooms[room.name];
        if (!mem.plan) mem.plan = {};

        // Replan if RCL changed OR if structures were destroyed/missing.
        // needsReplanning is cheap (a few find calls) and prevents the bot from
        // staying broken after enemy raids without waiting for the next RCL up.
        if (!needsReplanning(room, rcl, mem)) return;

        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;

        // Hub is stable for the lifetime of the room — compute once and cache.
        if (!mem.plan.hub) {
            const dist = distanceTransform(room);
            mem.plan.hub = findHub(room, dist);
        }
        if (!mem.plan.hub) return;

        const hub = mem.plan.hub;
        const parity = (hub.x + hub.y) % 2;
        mem.parity = parity;

        const extTarget = EXTENSION_LIMITS[rcl] || 0;
        const extHave = countType(room, STRUCTURE_EXTENSION);
        if (extHave < extTarget) placeExtensions(room, hub, parity, extTarget - extHave);

        const towerTarget = TOWER_LIMITS[rcl] || 0;
        const towerHave = countType(room, STRUCTURE_TOWER);
        if (towerHave < towerTarget) placeTowers(room, parity, towerTarget - towerHave);

        placeContainers(room);
        if (rcl >= 3) placeControllerContainer(room);

        if (rcl >= 5) placeLinks(room);

        if (rcl >= 2) placeRoads(room, hub);
        if (rcl >= 2) placeRamparts(room);

        // Only update lastRCL once all structures are placed at the target count.
        // If we are still short (site cap hit, terrain blocked, etc.) we will retry
        // on the next planner invocation rather than silently giving up.
        const extNow = countType(room, STRUCTURE_EXTENSION);
        const towerNow = countType(room, STRUCTURE_TOWER);
        if (extNow >= extTarget && towerNow >= towerTarget) {
            mem.plan.lastRCL = rcl;
        }

        console.log('Planner ran for ' + room.name + ' RCL ' + rcl +
            ' ext=' + extNow + '/' + extTarget +
            ' towers=' + towerNow + '/' + towerTarget);
    }
};

module.exports = planner;
