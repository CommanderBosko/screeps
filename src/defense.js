const defense = {
    run: function (room) {
        if (!room.controller || !room.controller.my) return;
        if (room.find(FIND_CONSTRUCTION_SITES).length >= 90) return;
        defense.placeStructureRamparts(room);
        defense.placeTowers(room);
        defense.placeExtensions(room);
        defense.placeContainers(room);
        defense.placeRoads(room);
        defense.placeChokepoints(room);
    },

    // Place ramparts on top of key structures so attackers must destroy the rampart first
    placeStructureRamparts: function (room) {
        const types = [
            STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_STORAGE,
            STRUCTURE_EXTENSION, STRUCTURE_TERMINAL, STRUCTURE_LAB
        ];
        const structs = room.find(FIND_MY_STRUCTURES, { filter: s => types.includes(s.structureType) });
        for (const s of structs) {
            const at = s.pos.lookFor(LOOK_STRUCTURES);
            const atSite = s.pos.lookFor(LOOK_CONSTRUCTION_SITES);
            const hasRampart = at.some(r => r.structureType === STRUCTURE_RAMPART);
            const hasSite = atSite.some(r => r.structureType === STRUCTURE_RAMPART);
            if (!hasRampart && !hasSite) {
                room.createConstructionSite(s.pos, STRUCTURE_RAMPART);
            }
        }
    },

    // Auto-place a tower when RCL unlocks a new slot
    placeTowers: function (room) {
        const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
        if (maxTowers === 0) return;
        const existing = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length;
        const sites = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_TOWER }).length;
        if (existing + sites >= maxTowers) return;

        // Place near centroid of existing structures for maximum coverage
        const structs = room.find(FIND_MY_STRUCTURES);
        if (structs.length === 0) return;
        const cx = Math.round(structs.reduce((n, s) => n + s.pos.x, 0) / structs.length);
        const cy = Math.round(structs.reduce((n, s) => n + s.pos.y, 0) / structs.length);
        const terrain = room.getTerrain();

        for (let r = 0; r <= 15; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const x = cx + dx, y = cy + dy;
                    if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                    const pos = new RoomPosition(x, y, room.name);
                    if (pos.lookFor(LOOK_STRUCTURES).length > 0) continue;
                    if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) continue;
                    if (room.createConstructionSite(x, y, STRUCTURE_TOWER) === OK) {
                        console.log('🗼 Tower site placed in ' + room.name + ' at ' + x + ',' + y);
                        return;
                    }
                }
            }
        }
    },

    placeExtensions: function (room) {
        const maxExt = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
        if (maxExt === 0) return;
        const existing = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION }).length;
        const sites = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_EXTENSION }).length;
        if (existing + sites >= maxExt) return;

        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;
        const terrain = room.getTerrain();

        for (let r = 2; r <= 15; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const x = spawn.pos.x + dx, y = spawn.pos.y + dy;
                    if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                    const pos = new RoomPosition(x, y, room.name);
                    if (pos.lookFor(LOOK_STRUCTURES).length > 0) continue;
                    if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) continue;
                    if (room.createConstructionSite(x, y, STRUCTURE_EXTENSION) === OK) {
                        console.log('⚡ Extension site placed in ' + room.name);
                        return;
                    }
                }
            }
        }
    },

    placeContainers: function (room) {
        const sources = room.find(FIND_SOURCES);
        for (const source of sources) {
            const hasContainer = source.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            }).length > 0;
            const hasSite = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            }).length > 0;
            if (hasContainer || hasSite) continue;

            const terrain = room.getTerrain();
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const x = source.pos.x + dx, y = source.pos.y + dy;
                    if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                    const pos = new RoomPosition(x, y, room.name);
                    if (pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType !== STRUCTURE_ROAD)) continue;
                    if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0) continue;
                    if (room.createConstructionSite(x, y, STRUCTURE_CONTAINER) === OK) {
                        console.log('📦 Container site placed near source in ' + room.name);
                        break;
                    }
                }
            }
        }
    },

    placeRoads: function (room) {
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) return;

        const targets = [
            ...room.find(FIND_SOURCES),
            room.controller
        ].filter(Boolean);

        for (const target of targets) {
            const path = spawn.pos.findPathTo(target, { ignoreCreeps: true });
            for (const step of path) {
                const pos = new RoomPosition(step.x, step.y, room.name);
                const hasRoad = pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_ROAD);
                const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === STRUCTURE_ROAD);
                if (!hasRoad && !hasSite) {
                    room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
                }
            }
        }
    },

    // Seal room exits with walls, leaving a 1-tile gap per cluster for controlled access
    placeChokepoints: function (room) {
        const exits = [
            { find: FIND_EXIT_TOP,    dx: 0,  dy: 1  },
            { find: FIND_EXIT_BOTTOM, dx: 0,  dy: -1 },
            { find: FIND_EXIT_LEFT,   dx: 1,  dy: 0  },
            { find: FIND_EXIT_RIGHT,  dx: -1, dy: 0  },
        ];
        for (const { find, dx, dy } of exits) {
            const tiles = room.find(find);
            if (tiles.length === 0) continue;
            for (const cluster of defense.cluster(tiles, find)) {
                defense.sealCluster(room, cluster, dx, dy);
            }
        }
    },

    cluster: function (positions, dir) {
        const byX = dir === FIND_EXIT_TOP || dir === FIND_EXIT_BOTTOM;
        positions.sort((a, b) => byX ? a.x - b.x : a.y - b.y);
        const clusters = [];
        let cur = [positions[0]];
        for (let i = 1; i < positions.length; i++) {
            const gap = byX
                ? positions[i].x - positions[i - 1].x
                : positions[i].y - positions[i - 1].y;
            if (gap <= 1) cur.push(positions[i]);
            else { clusters.push(cur); cur = [positions[i]]; }
        }
        clusters.push(cur);
        return clusters;
    },

    sealCluster: function (room, cluster, dx, dy) {
        const gapIdx = Math.floor(cluster.length / 2);
        for (let i = 0; i < cluster.length; i++) {
            if (i === gapIdx) continue; // leave controlled gap
            const x = cluster[i].x + dx;
            const y = cluster[i].y + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            const pos = new RoomPosition(x, y, room.name);
            const blocked = pos.lookFor(LOOK_STRUCTURES)
                .some(s => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
            const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES)
                .some(s => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
            if (!blocked && !hasSite) {
                room.createConstructionSite(x, y, STRUCTURE_WALL);
            }
        }
    }
};

module.exports = defense;
