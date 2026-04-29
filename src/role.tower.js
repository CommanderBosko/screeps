const cache = require('cache');

const ATTACK_PARTS = new Set([ATTACK, RANGED_ATTACK]);
const RAMPART_EMERGENCY = 500;

function pickAttackTarget(tower, hostiles) {
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

        const allStructures = cache.find(tower.room, FIND_STRUCTURES);

        // Emergency: save ramparts critically close to 0 (newly built ones decay at 1 HP/tick)
        const dying = allStructures.filter(
            s => s.structureType === STRUCTURE_RAMPART && s.hits < RAMPART_EMERGENCY
        );
        if (dying.length > 0) {
            dying.sort((a, b) => a.hits - b.hits);
            tower.repair(dying[0]);
            return;
        }

        // Repair roads, containers, and other non-barrier structures (repairer handles walls/ramparts)
        const damaged = allStructures.filter(s =>
            s.hits < s.hitsMax &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
        );
        if (damaged.length > 0) {
            damaged.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
            tower.repair(damaged[0]);
        }
    }
};

module.exports = towerLogic;
