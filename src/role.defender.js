const cache = require('cache');

const RETREAT_HP_RATIO = 0.4;  // flee to rampart when below this fraction of max HP

function findBestRampart(creep) {
    const ramparts = cache.find(creep.room, FIND_MY_STRUCTURES)
        .filter(s => s.structureType === STRUCTURE_RAMPART && s.hits > 0);
    if (ramparts.length === 0) return null;
    return creep.pos.findClosestByRange(ramparts);
}

function onRampart(creep) {
    return cache.find(creep.room, FIND_MY_STRUCTURES).some(
        s => s.structureType === STRUCTURE_RAMPART && s.pos.isEqualTo(creep.pos)
    );
}

const roleDefender = {
    run: function (creep) {
        // Primary target: invader core. Fallback: nearest hostile creep.
        const cores = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_INVADER_CORE);
        const hostiles = cache.find(creep.room, FIND_HOSTILE_CREEPS);

        if (cores.length === 0 && hostiles.length === 0) {
            // Nothing left to fight — rally to spawn
            const spawns = cache.find(creep.room, FIND_MY_SPAWNS);
            if (spawns.length > 0 && !creep.pos.inRangeTo(spawns[0], 3)) {
                creep.moveTo(spawns[0], { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 10 });
            }
            creep.say('👀');
            return;
        }

        const lowHP = creep.hits < creep.hitsMax * RETREAT_HP_RATIO;

        if (lowHP && !onRampart(creep)) {
            const refuge = findBestRampart(creep);
            if (refuge) {
                creep.moveTo(refuge, { visualizePathStyle: { stroke: '#ff6600' }, reusePath: 0 });
                creep.say('🏃');
                return;
            }
        }

        // Prefer attacking the invader core; fall back to nearest hostile creep
        const target = cores.length > 0
            ? creep.pos.findClosestByRange(cores)
            : creep.pos.findClosestByRange(hostiles);

        if (creep.attack(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 0 });
        }
        creep.say('⚔️');
    }
};

module.exports = roleDefender;
