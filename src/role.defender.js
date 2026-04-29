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
        const hostiles = cache.find(creep.room, FIND_HOSTILE_CREEPS);

        if (hostiles.length === 0) {
            // Rally to a rampart near spawn while waiting
            const spawns = cache.find(creep.room, FIND_MY_SPAWNS);
            if (spawns.length > 0) {
                const rallyRampart = findBestRampart(creep);
                if (rallyRampart && !creep.pos.isEqualTo(rallyRampart.pos)) {
                    creep.moveTo(rallyRampart, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 10 });
                } else if (!rallyRampart && !creep.pos.inRangeTo(spawns[0], 3)) {
                    creep.moveTo(spawns[0], { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 10 });
                }
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

        const target = creep.pos.findClosestByRange(hostiles);

        if (creep.memory.ranged) {
            if (creep.rangedAttack(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 0 });
            }
            // Use mass attack when multiple hostiles are in range 3
            const inRange = hostiles.filter(h => creep.pos.inRangeTo(h, 3));
            if (inRange.length > 1) creep.rangedMassAttack();
            creep.say('🏹');
        } else {
            if (onRampart(creep)) {
                // On a rampart — try to stay put and let hostiles come to us
                if (creep.pos.inRangeTo(target, 1)) {
                    creep.attack(target);
                } else {
                    // Move toward target only if no rampart is closer to them
                    const closerRampart = cache.find(creep.room, FIND_MY_STRUCTURES).find(
                        s => s.structureType === STRUCTURE_RAMPART &&
                             s.pos.getRangeTo(target) < creep.pos.getRangeTo(target)
                    );
                    if (closerRampart) {
                        creep.moveTo(closerRampart, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 5 });
                    } else {
                        creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 0 });
                    }
                    creep.attack(target);
                }
            } else {
                if (creep.attack(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 0 });
                }
            }
            creep.say('⚔️');
        }
    }
};

module.exports = roleDefender;
