const cache = require('cache');

const ATTACK_PARTS = new Set([ATTACK, RANGED_ATTACK]);
const REPAIR_RESERVE = 200;

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

        // Emergency: repair ramparts critically close to 0 HP before anything else.
        // Ramparts decay 1 HP/tick — if one hits 0 it is destroyed and all protection
        // under it is lost. Prioritise these over road/container maintenance.
        const RAMPART_EMERGENCY = 500;
        const dyingRamparts = cache.find(tower.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_RAMPART && s.hits < RAMPART_EMERGENCY);
        if (dyingRamparts.length > 0) {
            dyingRamparts.sort((a, b) => a.hits - b.hits);
            tower.repair(dyingRamparts[0]);
            return;
        }

        // Repair non-wall/rampart structures.
        // Prefer the most-damaged structure within range 10 (tower is most efficient close up);
        // fall back to the globally most-damaged if nothing nearby needs work.
        const damaged = cache.find(tower.room, FIND_STRUCTURES)
            .filter(s => s.hits < s.hitsMax &&
                s.structureType !== STRUCTURE_WALL &&
                s.structureType !== STRUCTURE_RAMPART);
        if (damaged.length > 0) {
            const nearby = damaged.filter(s => tower.pos.inRangeTo(s, 10));
            const pool = nearby.length > 0 ? nearby : damaged;
            pool.sort((a, b) => a.hits - b.hits);
            tower.repair(pool[0]);
            return;
        }

        // Repair ramparts/walls below HP floor.
        // Prefer the weakest barrier within range 10 (efficient energy use); fall back globally.
        const hpTarget = cache.getWallTarget(tower.room);
        const weakBarrier = cache.find(tower.room, FIND_STRUCTURES)
            .filter(s => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < hpTarget);
        if (weakBarrier.length > 0) {
            const nearbyBarrier = weakBarrier.filter(s => tower.pos.inRangeTo(s, 10));
            const barrierPool = nearbyBarrier.length > 0 ? nearbyBarrier : weakBarrier;
            barrierPool.sort((a, b) => a.hits - b.hits);
            tower.repair(barrierPool[0]);
        }
    }
};

module.exports = towerLogic;
