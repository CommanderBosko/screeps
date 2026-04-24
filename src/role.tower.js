const cache = require('cache');

function rampartTarget(room) {
    return Math.min((room.controller ? room.controller.level : 1) * 10000, 80000);
}

const towerLogic = {
    run: function (tower) {
        const hostiles = cache.find(tower.room, FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            tower.attack(tower.pos.findClosestByRange(hostiles));
            return;
        }

        // Repair non-wall/rampart structures
        const damaged = cache.find(tower.room, FIND_STRUCTURES)
            .filter(s => s.hits < s.hitsMax &&
                s.structureType !== STRUCTURE_WALL &&
                s.structureType !== STRUCTURE_RAMPART);
        if (damaged.length > 0) {
            damaged.sort((a, b) => a.hits - b.hits);
            tower.repair(damaged[0]);
            return;
        }

        // Repair ramparts/walls below HP floor
        const hpTarget = rampartTarget(tower.room);
        const weakBarrier = cache.find(tower.room, FIND_STRUCTURES)
            .filter(s => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < hpTarget);
        if (weakBarrier.length > 0) {
            weakBarrier.sort((a, b) => a.hits - b.hits);
            tower.repair(weakBarrier[0]);
            return;
        }

        tower.room.visual.text('💤', tower.pos.x, tower.pos.y - 1, { align: 'center', opacity: 0.8 });
    }
};

module.exports = towerLogic;
