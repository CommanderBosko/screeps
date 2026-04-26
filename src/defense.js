const defense = {
    run: function (room) {
        if (!room.controller || !room.controller.my) return;
        if (room.find(FIND_CONSTRUCTION_SITES).length >= 90) return;
        // NOTE: Extensions, towers, containers, roads, and ramparts are all owned by planner.js.
        // Defense only handles chokepoint walls at room exits.
        defense.placeChokepoints(room);
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
