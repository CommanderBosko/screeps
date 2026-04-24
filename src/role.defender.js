const cache = require('cache');

const roleDefender = {
    run: function (creep) {
        const hostiles = cache.find(creep.room, FIND_HOSTILE_CREEPS);
        if (hostiles.length === 0) {
            const spawns = cache.find(creep.room, FIND_MY_SPAWNS);
            if (spawns.length > 0 && !creep.pos.inRangeTo(spawns[0], 3)) {
                creep.moveTo(spawns[0], { visualizePathStyle: { stroke: '#ff0000' } });
            }
            creep.say('👀');
            return;
        }

        const target = creep.pos.findClosestByRange(hostiles);
        if (creep.attack(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 0 });
        }
        creep.say('⚔️');
    }
};

module.exports = roleDefender;
