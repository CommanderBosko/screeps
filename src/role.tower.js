const cache = require('cache');

const ATTACK_PARTS = new Set([ATTACK, RANGED_ATTACK]);
const REPAIR_RESERVE = 400;

function rampartTarget(room) {
    return Math.min((room.controller ? room.controller.level : 1) * 10000, 80000);
}

function pickAttackTarget(tower, hostiles) {
    // Prefer creeps that have attack parts — they're the actual threat
    const attackers = hostiles.filter(h => h.body.some(p => ATTACK_PARTS.has(p.type)));
    const pool = attackers.length > 0 ? attackers : hostiles;
    return tower.pos.findClosestByRange(pool);
}

const towerLogic = {
    run: function (tower) {
        const hostiles = cache.find(tower.room, FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            tower.attack(pickAttackTarget(tower, hostiles));
            return;
        }

        // Heal the most-wounded friendly creep
        const wounded = cache.find(tower.room, FIND_MY_CREEPS)
            .filter(c => c.hits < c.hitsMax);
        if (wounded.length > 0) {
            wounded.sort((a, b) => a.hits - b.hits);
            tower.heal(wounded[0]);
            return;
        }

        if (tower.store[RESOURCE_ENERGY] <= REPAIR_RESERVE) return;

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
        }
    }
};

module.exports = towerLogic;
